#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cloud-copy · 云复制 — 后端
拖拽文件/写文字 → 对象存储（华为云 OBS 默认 / MinIO 等 S3 兼容私有部署）→ 六位取件码取回

架构:
  浏览器 → nginx :80 (/cloud-copy/) → 静态前端 /var/www/cloud-copy
  浏览器 → nginx :80 (/cloud-copy/api/) → 本服务 127.0.0.1:7012 → 对象存储
  大文件：浏览器 ──签名URL──→ 对象存储直传（不经服务器带宽）

存储后端由 STORAGE_BACKEND 环境变量选择（obs | s3），统一封装见 backend/storage.py。
"""
import mimetypes
import os
import re
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime
from functools import partial
from pathlib import Path
from typing import List, Optional
from urllib.parse import quote

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from backend.storage import ObjectInfo, StorageError, create_store

# ---------------------------------------------------------------- 配置
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

MAX_FILE_MB = int(os.environ.get("MAX_FILE_MB", "2048"))
MAX_TEXT_KB = int(os.environ.get("MAX_TEXT_KB", "512"))
SINGLE_PUT_LIMIT_MB = int(os.environ.get("SINGLE_PUT_LIMIT_MB", "64"))
MULTIPART_PART_MB = int(os.environ.get("MULTIPART_PART_MB", "32"))
UPLOAD_URL_EXPIRES = int(os.environ.get("UPLOAD_URL_EXPIRES", "21600"))
CODE_CHARSET = os.environ.get("CODE_CHARSET", "ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
CODE_LEN = int(os.environ.get("CODE_LEN", "6"))
OBS_PREFIX = os.environ.get("OBS_PREFIX", "cloud-copy").strip("/")

import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("cloud-copy")

store = create_store()

# ---------------------------------------------------------------- 工具

TEXT_EXTS = {
    "txt", "md", "markdown", "json", "csv", "tsv", "log", "py", "js", "ts",
    "jsx", "tsx", "java", "go", "rs", "c", "cpp", "h", "hpp", "sh", "bash",
    "zsh", "yml", "yaml", "xml", "css", "scss", "less", "ini", "conf", "cfg",
    "toml", "sql", "bat", "ps1", "env", "rb", "php", "swift", "kt", "scala",
    "lua", "r", "m", "tex", "bib", "srt", "vtt", "diff", "patch", "html",
    "htm", "svg", "vue", "svelte", "dockerfile", "makefile", "gitignore",
}
IMAGE_EXTS = {"jpg", "jpeg", "png", "gif", "webp", "bmp", "ico", "avif", "heic", "heif"}
AUDIO_EXTS = {"mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "weba"}
VIDEO_EXTS = {"mp4", "mov", "webm", "mkv", "avi", "m4v", "3gp"}

SAFE_FALLBACK = "file"
NAME_MAX = 80
TEXT_PREVIEW_MAX = 2 * 1024 * 1024  # 2MB


def ext_of(name: str) -> str:
    base = name.rsplit("/", 1)[-1]
    if "." in base:
        return base.rsplit(".", 1)[-1].lower()
    return ""


def classify(name: str) -> str:
    ext = ext_of(name)
    if ext == "pdf":
        return "pdf"
    if ext in IMAGE_EXTS:
        return "image"
    if ext in AUDIO_EXTS:
        return "audio"
    if ext in VIDEO_EXTS:
        return "video"
    if ext in TEXT_EXTS:
        return "text"
    return "other"


def sanitize_name(name: str) -> str:
    name = os.path.basename(name or "").strip()
    # 去掉控制字符、路径分隔符与引号
    name = "".join(ch for ch in name if ch.isprintable() and ch not in '\\/"\'')
    name = re.sub(r"\s+", " ", name).strip().strip(".")
    if not name:
        return SAFE_FALLBACK
    if len(name) > NAME_MAX:
        stem, ext = os.path.splitext(name)
        keep = max(1, NAME_MAX - len(ext))
        name = stem[:keep] + ext
    return name


def build_key(code: str, name: str) -> str:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    rid = secrets.token_hex(2)
    return f"{OBS_PREFIX}/{code}/{stamp}-{rid}__{name}"


def fid_encode(key: str) -> str:
    import base64
    return base64.urlsafe_b64encode(key.encode("utf-8")).decode("ascii").rstrip("=")


def fid_decode(fid: str) -> str:
    import base64
    pad = "=" * (-len(fid) % 4)
    try:
        return base64.urlsafe_b64decode((fid + pad).encode("ascii")).decode("utf-8")
    except Exception:
        raise HTTPException(404, "文件不存在")


def guess_ctype(name: str) -> str:
    ext = ext_of(name)
    overrides = {
        "md": "text/plain; charset=utf-8", "markdown": "text/plain; charset=utf-8",
        "log": "text/plain; charset=utf-8", "txt": "text/plain; charset=utf-8",
        "json": "application/json; charset=utf-8", "csv": "text/csv; charset=utf-8",
        "yml": "text/plain; charset=utf-8", "yaml": "text/plain; charset=utf-8",
        "toml": "text/plain; charset=utf-8", "ini": "text/plain; charset=utf-8",
        "conf": "text/plain; charset=utf-8",
    }
    if ext in overrides:
        return overrides[ext]
    ct = mimetypes.guess_type(name)[0]
    return ct or "application/octet-stream"


def decode_text(raw: bytes) -> str:
    for enc in ("utf-8", "gb18030"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def item_of(key: str, name: str, size: int, dt: datetime) -> dict:
    return {
        "id": fid_encode(key),
        "name": name,
        "size": int(size or 0),
        "time": dt.strftime("%Y-%m-%d %H:%M:%S"),
        "kind": classify(name),
    }


def store_call(fn, *args, **kwargs):
    """统一把 StorageError 转成 HTTPException（status 默认 502）。"""
    try:
        return fn(*args, **kwargs)
    except StorageError as e:
        raise HTTPException(e.status, str(e))


class RateLimiter:
    def __init__(self) -> None:
        self.hits: dict = defaultdict(deque)
        self.lock = threading.Lock()

    def allow(self, key: str, limit: int, window: int = 3600) -> bool:
        now = time.time()
        with self.lock:
            dq = self.hits[key]
            while dq and now - dq[0] > window:
                dq.popleft()
            if len(dq) >= limit:
                return False
            dq.append(now)
            return True


rl = RateLimiter()


def client_ip(request: Request) -> str:
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "?")


# ---------------------------------------------------------------- 应用
app = FastAPI(title="cloud-copy", version="1.1.0", docs_url=None, redoc_url=None, openapi_url=None)


@app.on_event("shutdown")
def _shutdown() -> None:
    store.close()


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "service": "cloud-copy",
        "version": app.version,
        "ts": int(time.time()),
        "max_file_mb": MAX_FILE_MB,
        "max_text_kb": MAX_TEXT_KB,
        "storage": store.backend,
        "storage_label": store.label,
        "bucket": store.bucket,
    }


@app.get("/api/new_code")
def new_code(request: Request) -> dict:
    if not rl.allow(f"n:{client_ip(request)}", 240):
        raise HTTPException(429, "太频繁了，稍后再试")
    for _ in range(30):
        code = "".join(secrets.choice(CODE_CHARSET) for _ in range(CODE_LEN))
        try:
            items, _, _ = store_call(store.list, f"{OBS_PREFIX}/{code}/", max_keys=1)
        except HTTPException:
            log.warning("new_code check failed")
            return {"ok": True, "code": code}
        if not items:
            return {"ok": True, "code": code}
    raise HTTPException(503, "生成失败，稍后再试")


class TextUpload(BaseModel):
    code: str
    filename: Optional[str] = None
    content: str


_CODE_PATTERN = re.compile("^[%s]{%d}$" % (re.escape(CODE_CHARSET), CODE_LEN))


def _code_or_400(code: str) -> str:
    code = (code or "").strip().upper()
    if not _CODE_PATTERN.match(code):
        raise HTTPException(400, "取件码格式不对（%d 位大写字母）" % CODE_LEN)
    return code


@app.post("/api/upload_text")
def upload_text(request: Request, body: TextUpload) -> dict:
    if not rl.allow(f"t:{client_ip(request)}", 240):
        raise HTTPException(429, "太频繁了，稍后再试")
    code = _code_or_400(body.code)
    content = body.content or ""
    raw = content.encode("utf-8")
    if len(raw) > MAX_TEXT_KB * 1024:
        raise HTTPException(413, f"文本超限（≤{MAX_TEXT_KB}KB）")
    if not content.strip():
        raise HTTPException(400, "内容为空")
    name = sanitize_name(body.filename or "")
    if name == SAFE_FALLBACK or "." not in os.path.basename(name):
        if name == SAFE_FALLBACK:
            name = f"文字片段-{datetime.now():%Y%m%d-%H%M%S}.txt"
        else:
            name += ".txt"
    key = build_key(code, name)
    store_call(store.put_bytes, key, raw, "text/plain; charset=utf-8")
    log.info("text saved %s (%dB)", key, len(raw))
    return {"ok": True, "item": item_of(key, name, len(raw), datetime.now())}


@app.post("/api/upload_file")
async def upload_file(request: Request, code: str = Form(...), file: UploadFile = File(...)) -> dict:
    if not rl.allow(f"u:{client_ip(request)}", 120):
        raise HTTPException(429, "上传太频繁了，稍后再试")
    code = _code_or_400(code)
    name = sanitize_name(file.filename or SAFE_FALLBACK)
    max_bytes = MAX_FILE_MB * 1024 * 1024

    import tempfile

    fd, tmp_path = tempfile.mkstemp(prefix="cc-upload-", dir="/tmp")
    size = 0
    try:
        with os.fdopen(fd, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(413, f"文件太大（超过 {MAX_FILE_MB}MB）")
                out.write(chunk)
        if size == 0:
            raise HTTPException(400, "空文件")
        key = build_key(code, name)
        await run_in_threadpool(partial(store_call, store.put_file, key, tmp_path, guess_ctype(name)))
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
    log.info("file saved %s (%dB)", key, size)
    return {"ok": True, "item": item_of(key, name, size, datetime.now())}


# ---------------------------------------------------------------- 直传（大文件走浏览器↔对象存储）

class UploadInit(BaseModel):
    code: str
    filename: str
    size: int


@app.post("/api/upload_init")
def upload_init(request: Request, body: UploadInit) -> dict:
    if not rl.allow(f"u:{client_ip(request)}", 240):
        raise HTTPException(429, "上传太频繁了，稍后再试")
    code = _code_or_400(body.code)
    name = sanitize_name(body.filename or "")
    size = int(body.size or 0)
    if size <= 0:
        raise HTTPException(400, "无法获取文件大小")
    if size > MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(413, f"文件太大（超过 {MAX_FILE_MB}MB）")
    key = build_key(code, name)
    ctype = guess_ctype(name)

    if size <= SINGLE_PUT_LIMIT_MB * 1024 * 1024:
        url = store_call(store.sign_put, key, ctype, UPLOAD_URL_EXPIRES)
        return {"ok": True, "mode": "single", "key": key, "url": url, "ctype": ctype}

    part_size = MULTIPART_PART_MB * 1024 * 1024
    count = (size + part_size - 1) // part_size
    upload_id = store_call(store.init_multipart, key, ctype)
    parts: List[str] = []
    for i in range(1, count + 1):
        parts.append(store_call(store.sign_part, key, upload_id, i, ctype, UPLOAD_URL_EXPIRES))
    log.info("mp init %s (%dB, %d parts)", key, size, count)
    return {"ok": True, "mode": "multipart", "key": key, "uploadId": upload_id,
            "partSize": part_size, "count": count, "parts": parts, "ctype": ctype}


class PartETag(BaseModel):
    partNum: int
    etag: str


class UploadComplete(BaseModel):
    code: str
    key: str
    size: int
    uploadId: Optional[str] = None
    parts: Optional[List[PartETag]] = None


def _owned_key_or_404(code: str, key: str) -> str:
    prefix = f"{OBS_PREFIX}/{code}/"
    sub = key[len(prefix):] if key.startswith(prefix) else ""
    if not sub or "/" in sub or sub.startswith("."):
        raise HTTPException(404, "文件不存在")
    return sub


@app.post("/api/upload_complete")
def upload_complete(request: Request, body: UploadComplete) -> dict:
    code = _code_or_400(body.code)
    sub = _owned_key_or_404(code, body.key)
    if body.uploadId:
        if not body.parts:
            raise HTTPException(400, "缺少分片信息")
        store_call(store.complete_multipart, body.key, body.uploadId,
                   [(p.partNum, p.etag) for p in body.parts])
    items, _, _ = store_call(store.list, body.key, max_keys=10)
    obj = next((o for o in items if o.key == body.key), None)
    if obj is None:
        raise HTTPException(404, "文件不存在")
    name = sub.split("__", 1)[-1]
    log.info("upload complete %s (%dB)", body.key, obj.size)
    return {"ok": True, "item": item_of(obj.key, name, obj.size, obj.last_modified)}


class UploadAbort(BaseModel):
    code: str
    key: str
    uploadId: str


@app.post("/api/upload_abort")
def upload_abort(request: Request, body: UploadAbort) -> dict:
    code = _code_or_400(body.code)
    _owned_key_or_404(code, body.key)
    store_call(store.abort_multipart, body.key, body.uploadId)
    return {"ok": True}


@app.get("/api/list/{code}")
def list_code(request: Request, code: str, limit: int = 500) -> dict:
    if not rl.allow(f"l:{client_ip(request)}", 720):
        raise HTTPException(429, "太频繁了，稍后再试")
    code = _code_or_400(code)
    prefix = f"{OBS_PREFIX}/{code}/"
    items: List[ObjectInfo] = []
    marker = None
    for _ in range(10):
        page, truncated, marker = store_call(store.list, prefix, marker=marker, max_keys=500)
        for o in page:
            base = o.key[len(prefix):]
            if not base or base.endswith("/") or base.startswith("."):
                continue
            name = base.split("__", 1)[1] if "__" in base else base
            items.append(ObjectInfo(o.key, o.size, o.last_modified))
        if not truncated or not marker:
            break
    items.sort(key=lambda x: x.last_modified, reverse=True)
    out = [item_of(o.key, o.key.rsplit("/", 1)[-1].split("__", 1)[-1], o.size, o.last_modified)
           for o in items[:limit]]
    return {"ok": True, "code": code, "count": len(items), "items": out}


@app.get("/api/share/{code}/{fid}")
def share_page_hint(request: Request, code: str, fid: str) -> dict:
    """预留：分享信息查询（文件是否存在 + 名称）。"""
    code = _code_or_400(code)
    key = fid_decode(fid)
    prefix = f"{OBS_PREFIX}/{code}/"
    if not key.startswith(prefix) or key == prefix:
        raise HTTPException(404, "文件不存在")
    name = key[len(prefix):].split("__", 1)[-1]
    return {"ok": True, "name": name, "kind": classify(name)}


@app.get("/api/file/{code}/{fid}")
def get_file(request: Request, code: str, fid: str, disposition: str = "attachment") -> object:
    if not rl.allow(f"f:{client_ip(request)}", 1200):
        raise HTTPException(429, "太频繁了，稍后再试")
    code = _code_or_400(code)
    key = fid_decode(fid)
    prefix = f"{OBS_PREFIX}/{code}/"
    if not key.startswith(prefix) or key == prefix:
        raise HTTPException(404, "文件不存在")
    return _serve_object(key, disposition)


@app.get("/api/d/{fid}")
def download_by_fid(request: Request, fid: str, disposition: str = "attachment") -> object:
    """自包含下载链接（分享用）：fid 中已编码完整对象键，无需再带取件码。"""
    if not rl.allow(f"d:{client_ip(request)}", 2400):
        raise HTTPException(429, "太频繁了，稍后再试")
    key = fid_decode(fid)
    prefix = f"{OBS_PREFIX}/"
    if not key.startswith(prefix) or key == prefix:
        raise HTTPException(404, "文件不存在")
    rest = key[len(prefix):]
    parts = rest.split("/", 1)
    code_part = parts[0]
    sub = parts[1] if len(parts) > 1 else ""
    if not _CODE_PATTERN.match(code_part) or not sub or sub.startswith(".") or ".." in rest:
        raise HTTPException(404, "文件不存在")
    return _serve_object(key, disposition)


def _serve_object(key: str, disposition: str = "attachment") -> object:
    """公共伺服逻辑：文本走服务端代理（转码+防 XSS），其余 302 → 存储签名 URL。"""
    name = key.rsplit("/", 1)[-1].split("__", 1)[-1]
    kind = classify(name)
    disp = "inline" if disposition == "inline" else "attachment"
    filename_star = "UTF-8''" + quote(name)

    if disp == "inline" and kind == "text":
        raw, truncated = store_call(store.head_bytes, key, TEXT_PREVIEW_MAX)
        text = decode_text(raw)
        if truncated:
            text += "\n\n……［内容较长，已截断，下载查看完整内容］"
        return PlainTextResponse(
            text,
            media_type="text/plain; charset=utf-8",
            headers={
                "X-Content-Type-Options": "nosniff",
                "Content-Disposition": f"inline; filename*={filename_star}",
                "Cache-Control": "private, max-age=300",
            },
        )

    # 浏览器内嵌预览的类型：图片/音频/视频/PDF 用签名 URL 直读（不占服务器带宽）
    inline_ok = kind in ("image", "audio", "video", "pdf")
    if disp == "inline" and not inline_ok:
        disp = "attachment"
    ctype = guess_ctype(name) if inline_ok else None
    url = store_call(store.sign_get, key, disp, name, ctype, 900)
    return RedirectResponse(url, status_code=302)


# nginx 反代时 X-Forwarded-* 已注入；本地调试直连时也能跑
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "7012")))