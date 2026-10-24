#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""cloud-copy S3/MinIO 冒烟测试 — 私有部署（MinIO 等）验收用。

用法（默认值对应本机 docker-compose 栈: deploy/minio 起 127.0.0.1:7012 / :9000）:
    python3 tests/smoke-s3.py
环境变量覆盖:
    SMOKE_API=http://127.0.0.1:7012/api     # 后端 API 地址
    SMOKE_S3_ENDPOINT=http://127.0.0.1:9000 # MinIO 端点（清理用）
    SMOKE_S3_AK=minioadmin
    SMOKE_S3_SK=minioadmin
    SMOKE_S3_BUCKET=cloud-copy
    SMOKE_EXPECT_SIGN_HOST=127.0.0.1:9000   # 可选：断言签名 URL 的 host（验证对外端点配置）
测完自动清理本测试对象（仅删本脚本创建的对象键）。
"""
import base64
import os
import random
import re
import string
import sys

import requests

BASE = os.environ.get("SMOKE_API", "http://127.0.0.1:7012/api")
S3_ENDPOINT = os.environ.get("SMOKE_S3_ENDPOINT", "http://127.0.0.1:9000")
S3_AK = os.environ.get("SMOKE_S3_AK", "minioadmin")
S3_SK = os.environ.get("SMOKE_S3_SK", "minioadmin")
S3_BUCKET = os.environ.get("SMOKE_S3_BUCKET", "cloud-copy")
EXPECT_HOST = os.environ.get("SMOKE_EXPECT_SIGN_HOST", "").strip()

S = requests.Session()
fails = []
created = []


def check(name, cond, extra=""):
    print(("  ✓ " if cond else "  ✗ ") + name + (("  | " + str(extra)) if extra else ""))
    if not cond:
        fails.append(name)


CODE = "".join(random.choices(string.ascii_uppercase, k=6))
print(f"== cloud-copy S3/MinIO smoke (api {BASE}, code {CODE}) ==")

# 1. health（应显示 s3 后端）
r = S.get(BASE + "/health")
d = r.json() if r.ok else None
check("health storage=s3", r.status_code == 200 and d and d.get("storage") == "s3",
      f"{d.get('storage')} / {d.get('storage_label')}")

# 2. new_code
r = S.get(BASE + "/new_code")
d = r.json() if r.ok else None
check("new_code 6位大写", bool(d) and re.fullmatch(r"[A-Z]{6}", d.get("code") or ""), d and d.get("code"))

# 3. upload_text
content = "MinIO 私有部署测试\n第二行 缩进\n"
r = S.post(BASE + "/upload_text", json={"code": CODE, "content": content})
d = r.json() if r.ok else None
check("upload_text", r.status_code == 200 and d and d.get("ok"), d and d.get("item", {}).get("name"))

# 4. list
r = S.get(BASE + "/list/" + CODE)
d = r.json() if r.ok else None
items = (d or {}).get("items", [])
check("list≥1 且 kind=text", len(items) >= 1 and items[0]["kind"] == "text",
      f"n={len(items)} time={items[0]['time'] if items else '-'}")
tid = items[0]["id"] if items else ""

# 5. 文本预览（服务端代理）
r = S.get(f"{BASE}/file/{CODE}/{tid}?disposition=inline")
check("preview text inline", r.status_code == 200 and "第二行 缩进" in r.text
      and r.headers.get("content-type", "").startswith("text/plain"))

# 6. 下载 302 → 签名 URL
r = S.get(f"{BASE}/file/{CODE}/{tid}?disposition=attachment", allow_redirects=False)
loc = r.headers.get("location", "")
check("download 302 签名 URL", r.status_code == 302 and loc, loc[:80])
if EXPECT_HOST:
    check(f"签名 host={EXPECT_HOST}（对外端点）", EXPECT_HOST in loc and "minio:9000" not in loc, loc[:100])
r2 = S.get(loc) if loc else None
check("签名 URL 真实可下载", bool(r2) and r2.status_code == 200 and "MinIO".encode("utf-8") in r2.content)

# 7. 上传图片 + CSV（multipart 中转）
png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
r = S.post(BASE + "/upload_file", data={"code": CODE},
           files={"file": ("dot.png", png, "image/png")})
check("upload png", r.status_code == 200, (r.json() or {}).get("item", {}).get("kind"))
csv = "列1,列2\n值1,值2\n".encode("utf-8")
r = S.post(BASE + "/upload_file", data={"code": CODE},
           files={"file": ("表格 demo.csv", csv, "text/csv")})
check("upload csv 中文名", r.status_code == 200)

# 8. 图片 inline 302
r = S.get(BASE + "/list/" + CODE)
d = r.json()
img = next((i for i in d.get("items", []) if i["kind"] == "image"), None)
r = S.get(f"{BASE}/file/{CODE}/{img['id']}?disposition=inline", allow_redirects=False)
check("image preview 302 inline", r.status_code == 302 and "inline" in r.headers.get("location", ""))

# 9. 直传 init（单 PUT 签名）
r = S.post(BASE + "/upload_init", json={"code": CODE, "filename": "直传示例.bin", "size": 1024 * 1024})
d = r.json() if r.ok else None
check("upload_init single", r.status_code == 200 and d and d.get("mode") == "single"
      and "X-Amz" in (d.get("url") or ""), (d or {}).get("mode"))

# 10. 直传 init（multipart 分片签名，>64MB）
r = S.post(BASE + "/upload_init", json={"code": CODE, "filename": "大文件测试.bin", "size": 80 * 1024 * 1024})
d = r.json() if r.ok else None
check("upload_init multipart", r.status_code == 200 and d and d.get("mode") == "multipart"
      and d.get("count") == 3 and len(d.get("parts", [])) == 3,
      f"mode={d.get('mode')} parts={len(d.get('parts', [])) if d else 0}")

# 11. 分片直传真传（前 2 片 → complete）
if d and d.get("mode") == "multipart":
    etags = []
    ok_parts = True
    for i in range(2):
        rr = requests.put(d["parts"][i], data=b"\x00" * d["partSize"])
        if rr.status_code not in (200, 201):
            ok_parts = False
            print("  ✗ part", i + 1, rr.status_code)
            break
        etags.append(rr.headers.get("ETag", "").strip('"'))
    check("multipart 分片直传 PUT ok", ok_parts and len(etags) == 2)
    rr = S.post(BASE + "/upload_complete", json={
        "code": CODE, "key": d["key"], "size": 2 * d["partSize"],
        "uploadId": d["uploadId"], "parts": [{"partNum": i + 1, "etag": etags[i]} for i in range(2)],
    })
    check("upload_complete 合并", rr.status_code == 200 and rr.json().get("ok"),
          (rr.json().get("item", {}).get("name") if rr.ok else rr.text[:80]))
else:
    check("multipart 分片直传 PUT ok", False, "init 返回异常，跳过")

# 12. 负例
r = S.post(BASE + "/upload_text", json={"code": "ZZ", "content": "x"})
check("非法取件码→400", r.status_code == 400)

# 13. 清理：删除本测试码下的全部对象
try:
    import boto3
    c = boto3.client("s3", endpoint_url=S3_ENDPOINT,
                     aws_access_key_id=S3_AK, aws_secret_access_key=S3_SK,
                     region_name="us-east-1")
    paginator = c.get_paginator("list_objects_v2")
    n = 0
    for page in paginator.paginate(Bucket=S3_BUCKET):
        for o in page.get("Contents", []):
            if f"/{CODE}/" in o["Key"]:
                c.delete_object(Bucket=S3_BUCKET, Key=o["Key"])
                n += 1
    print(f"  · 已清理测试对象 {n} 个")
except Exception as e:
    print("  ! cleanup skip:", e)

print()
print("FAILS:", fails if fails else "none — ALL PASS ✓")
sys.exit(1 if fails else 0)