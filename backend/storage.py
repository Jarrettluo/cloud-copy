#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cloud-copy 存储抽象层：同一套业务代码可跑在 华为云 OBS 或 S3 兼容存储（MinIO 私有部署）上。

选择方式（.env / 环境变量）:
  STORAGE_BACKEND=obs   # 默认：华为云 OBS（OBS_* 配置）
  STORAGE_BACKEND=s3    # S3 兼容（MinIO 等私有部署，S3_* 配置）

统一接口（供 backend/main.py 使用）:
  Store.list(prefix, marker=None, max_keys=500) -> (items, truncated, next_marker)
  Store.put_bytes(key, data, ctype)
  Store.put_file(key, path, ctype)
  Store.head_bytes(key, max_bytes) -> (raw_bytes, truncated)   # 文本预览用
  Store.sign_put(key, ctype, expires) -> url                   # 直传/分片签名 URL
  Store.init_multipart(key, ctype) -> upload_id
  Store.sign_part(key, upload_id, part_no, ctype, expires) -> url
  Store.complete_multipart(key, upload_id, parts: [(num, etag)])
  Store.abort_multipart(key, upload_id)
  Store.sign_get(key, disposition, filename, ctype=None, expires=900) -> url
  Store.close()

所有失败抛 StorageError(message, status)；调用方转 HTTPException(status, message)。
"""
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import quote

log = logging.getLogger("cloud-copy.store")


class StorageError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


@dataclass
class ObjectInfo:
    key: str
    size: int
    last_modified: datetime


def _parse_lm(v) -> datetime:
    """OBS 返回的是本地时间字符串；S3 返回 UTC datetime。统一转本地时间 datetime。"""
    if isinstance(v, datetime):
        if v.tzinfo is not None:
            v = v.astimezone()  # UTC → 本地时区
        return v
    s = str(v or "")
    for fmt in ("%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%fZ",
                "%a, %d %b %Y %H:%M:%S %Z"):
        try:
            return datetime.strptime(s, fmt)
        except (TypeError, ValueError):
            pass
    return datetime.now()


class Store:
    """OBS / S3 双后端统一封装。"""

    def __init__(self, backend: str):
        self.backend = backend
        if backend == "obs":
            from obs import ObsClient
            self._client = ObsClient(
                access_key_id=os.environ["OBS_AK"],
                secret_access_key=os.environ["OBS_SK"],
                server=os.environ["OBS_ENDPOINT"],
            )
            self.bucket = os.environ["OBS_BUCKET"]
            self.label = "华为云 OBS"
        elif backend == "s3":
            import boto3
            from botocore.client import Config
            _cfg = Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
                connect_timeout=10,
                read_timeout=60,
                retries={"max_attempts": 3},
            )
            self._client = boto3.client(
                "s3",
                endpoint_url=os.environ.get("S3_ENDPOINT") or "http://127.0.0.1:9000",
                aws_access_key_id=os.environ.get("S3_ACCESS_KEY") or "minioadmin",
                aws_secret_access_key=os.environ.get("S3_SECRET_KEY") or "minioadmin",
                region_name=os.environ.get("S3_REGION") or "us-east-1",
                config=_cfg,
            )
            # 签名 URL 对外端点：浏览器需要能直接访问（如 http://<公网IP>:9000）。
            # 未设置时回退到 S3_ENDPOINT（适用于后端与浏览器走同一地址的裸机部署）。
            # 注意：Docker 内网部署（S3_ENDPOINT=http://minio:9000）时必设此项，
            # 否则浏览器拿到无法解析的 http://minio:9000 链接。
            public = (os.environ.get("S3_PUBLIC_ENDPOINT") or "").strip()
            if public and public != (os.environ.get("S3_ENDPOINT") or ""):
                self._presign_client = boto3.client(
                    "s3",
                    endpoint_url=public,
                    aws_access_key_id=os.environ.get("S3_ACCESS_KEY") or "minioadmin",
                    aws_secret_access_key=os.environ.get("S3_SECRET_KEY") or "minioadmin",
                    region_name=os.environ.get("S3_REGION") or "us-east-1",
                    config=_cfg,
                )
            else:
                self._presign_client = self._client
            self.bucket = os.environ.get("S3_BUCKET") or "cloud-copy"
            self.label = os.environ.get("S3_LABEL") or "MinIO / S3"
            self._ensure_ready()
        else:
            raise SystemExit(f"未知 STORAGE_BACKEND: {backend}（支持 obs / s3）")

    # ---------------- S3 私有部署：自动建桶 + CORS ----------------
    def _ensure_ready(self) -> None:
        try:
            self._client.head_bucket(Bucket=self.bucket)
        except Exception:
            try:
                self._client.create_bucket(Bucket=self.bucket)
                log.info("s3 bucket %s created", self.bucket)
            except Exception as e:
                log.warning("s3 create bucket %s fail: %s（桶已存在且可写则忽略）", self.bucket, e)
        try:
            self._client.put_bucket_cors(
                Bucket=self.bucket,
                CORSConfiguration={
                    "CORSRules": [{
                        "AllowedMethods": ["PUT", "GET", "HEAD"],
                        "AllowedOrigins": ["*"],
                        "AllowedHeaders": ["*"],
                        "ExposeHeaders": ["ETag"],
                        "MaxAgeSeconds": 3600,
                    }]
                },
            )
        except Exception as e:
            log.warning("s3 set bucket cors fail: %s（浏览器直传需要 CORS；可用 MINIO_API_CORS_ALLOW_ORIGIN=* 兜底）", e)

    # ---------------- 列表 ----------------
    def list(self, prefix: str, marker: str | None = None, max_keys: int = 500):
        if self.backend == "obs":
            r = self._client.listObjects(self.bucket, prefix=prefix, marker=marker, max_keys=max_keys)
            if r.status != 200:
                raise StorageError(f"存储读取失败（{r.status} {r.errorCode}）")
            items = [ObjectInfo(o.key, o.size, _parse_lm(o.lastModified))
                     for o in (r.body.contents or [])]
            truncated = bool(getattr(r.body, "is_truncated", False))
            next_marker = getattr(r.body, "next_marker", None)
        else:
            kwargs = {"Bucket": self.bucket, "Prefix": prefix, "MaxKeys": max_keys}
            if marker:
                kwargs["ContinuationToken"] = marker
            try:
                r = self._client.list_objects_v2(**kwargs)
            except Exception as e:
                raise StorageError(f"存储读取失败（{e}）")
            items = [ObjectInfo(o["Key"], o["Size"], _parse_lm(o.get("LastModified")))
                     for o in r.get("Contents", [])]
            truncated = bool(r.get("IsTruncated", False))
            next_marker = r.get("NextContinuationToken")
        return items, truncated, next_marker

    # ---------------- 写入 ----------------
    def put_bytes(self, key: str, data: bytes, ctype: str) -> None:
        if self.backend == "obs":
            r = self._client.putContent(self.bucket, key, data, headers={"Content-Type": ctype})
            if r.status != 200:
                raise StorageError(f"存储写入失败（{r.status} {r.errorCode}）")
        else:
            try:
                self._client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=ctype)
            except Exception as e:
                raise StorageError(f"存储写入失败（{e}）")

    def put_file(self, key: str, path: str, ctype: str) -> None:
        if self.backend == "obs":
            r = self._client.putFile(self.bucket, key, path, headers={"Content-Type": ctype})
            if r.status != 200:
                raise StorageError(f"存储写入失败（{r.status} {r.errorCode}）")
        else:
            try:
                self._client.upload_file(path, self.bucket, key, ExtraArgs={"ContentType": ctype})
            except Exception as e:
                raise StorageError(f"存储写入失败（{e}）")

    # ---------------- 文本预览：受限读取 ----------------
    def head_bytes(self, key: str, max_bytes: int):
        """读取对象前 max_bytes+1 字节；返回 (前 max_bytes 字节, 是否被截断)。"""
        if self.backend == "obs":
            g = self._client.getObject(self.bucket, key, loadStreamInMemory=False)
            if g.status != 200:
                raise StorageError("文件不存在", 404)
            try:
                raw = g.body.response.read(max_bytes + 1)
            finally:
                try:
                    g.body.close()
                except Exception:
                    pass
        else:
            try:
                g = self._client.get_object(Bucket=self.bucket, Key=key, Range=f"bytes=0-{max_bytes}")
            except Exception as e:
                code = str(getattr(e, "response", {}).get("Error", {}).get("Code", "") or "")
                status = 404 if code in ("NoSuchKey", "404") else 502
                raise StorageError("文件不存在" if status == 404 else f"存储读取失败（{code or e}）", status)
            try:
                raw = g["Body"].read(max_bytes + 1)
            finally:
                try:
                    g["Body"].close()
                except Exception:
                    pass
        truncated = len(raw) > max_bytes
        return raw[:max_bytes], truncated

    # ---------------- 签名 URL ----------------
    def sign_put(self, key: str, ctype: str, expires: int) -> str:
        if self.backend == "obs":
            u = self._client.createSignedUrl("PUT", self.bucket, key, expires=expires,
                                             headers={"Content-Type": ctype})
            url = getattr(u, "signedUrl", None)
            if not url:
                raise StorageError(f"签名失败（{getattr(u, 'errorCode', None)}）")
            return url
        try:
            return self._presign_client.generate_presigned_url(
                "put_object",
                Params={"Bucket": self.bucket, "Key": key, "ContentType": ctype},
                ExpiresIn=expires)
        except Exception as e:
            raise StorageError(f"签名失败（{e}）")

    def init_multipart(self, key: str, ctype: str) -> str:
        if self.backend == "obs":
            r = self._client.initiateMultipartUpload(self.bucket, key, contentType=ctype)
            if r.status != 200:
                raise StorageError(f"存储初始化失败（{r.status} {r.errorCode}）")
            return r.body.uploadId
        try:
            return self._client.create_multipart_upload(Bucket=self.bucket, Key=key, ContentType=ctype)["UploadId"]
        except Exception as e:
            raise StorageError(f"存储初始化失败（{e}）")

    def sign_part(self, key: str, upload_id: str, part_no: int, ctype: str, expires: int) -> str:
        if self.backend == "obs":
            u = self._client.createSignedUrl("PUT", self.bucket, key, expires=expires,
                                             headers={"Content-Type": ctype},
                                             queryParams={"partNumber": str(part_no), "uploadId": upload_id})
            url = getattr(u, "signedUrl", None)
            if not url:
                raise StorageError(f"签名失败（{getattr(u, 'errorCode', None)}）")
            return url
        try:
            return self._presign_client.generate_presigned_url(
                "upload_part",
                Params={"Bucket": self.bucket, "Key": key, "UploadId": upload_id, "PartNumber": part_no},
                ExpiresIn=expires)
        except Exception as e:
            raise StorageError(f"签名失败（{e}）")

    def complete_multipart(self, key: str, upload_id: str, parts) -> None:
        if self.backend == "obs":
            from obs import CompleteMultipartUploadRequest, CompletePart
            req = CompleteMultipartUploadRequest(
                parts=[CompletePart(partNum=p[0], etag=p[1]) for p in parts])
            r = self._client.completeMultipartUpload(self.bucket, key, upload_id, req)
            if r.status != 200:
                raise StorageError(f"合并分片失败（{r.status} {r.errorCode} {r.errorMessage}）")
        else:
            try:
                self._client.complete_multipart_upload(
                    Bucket=self.bucket, Key=key, UploadId=upload_id,
                    MultipartUpload={"Parts": [{"PartNumber": p[0], "ETag": p[1]} for p in parts]})
            except Exception as e:
                raise StorageError(f"合并分片失败（{e}）")

    def abort_multipart(self, key: str, upload_id: str) -> None:
        try:
            if self.backend == "obs":
                self._client.abortMultipartUpload(self.bucket, key, upload_id)
            else:
                self._client.abort_multipart_upload(Bucket=self.bucket, Key=key, UploadId=upload_id)
        except Exception:
            pass

    def sign_get(self, key: str, disposition: str, filename: str, ctype: str | None = None,
                 expires: int = 900) -> str:
        """GET 签名 URL；可覆盖下载文件名与 Content-Type（OBS/S3 Response* 参数）。"""
        disp = f"{disposition}; filename*=UTF-8''{quote(filename)}"
        if self.backend == "obs":
            query = {"response-content-disposition": disp}
            if ctype:
                query["response-content-type"] = ctype
            u = self._client.createSignedUrl("GET", self.bucket, key, expires=expires, queryParams=query)
            url = getattr(u, "signedUrl", None)
            if not url:
                raise StorageError(f"签名失败（{getattr(u, 'errorCode', None)}）")
            return url
        params = {"Bucket": self.bucket, "Key": key, "ResponseContentDisposition": disp}
        if ctype:
            params["ResponseContentType"] = ctype
        try:
            return self._presign_client.generate_presigned_url("get_object", Params=params, ExpiresIn=expires)
        except Exception as e:
            raise StorageError(f"签名失败（{e}）")

    def close(self) -> None:
        try:
            self._client.close()
        except Exception:
            pass
        if self._presign_client is not self._client:
            try:
                self._presign_client.close()
            except Exception:
                pass


def create_store() -> Store:
    backend = os.environ.get("STORAGE_BACKEND", "obs").lower()
    if backend not in ("obs", "s3"):
        raise SystemExit(f"未知 STORAGE_BACKEND: {backend}（支持 obs / s3）")
    return Store(backend)