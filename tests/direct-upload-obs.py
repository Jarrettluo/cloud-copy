#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""OBS 直传路径回归：single / multipart / abort（存储抽象层重构后验证）。测完自动清理。"""
import random
import string
import sys

import requests

BASE = "http://127.0.0.1/cloud-copy/api"
S = requests.Session()
fails = []


def check(n, c, e=""):
    print(("  ✓ " if c else "  ✗ ") + n + (("  | " + str(e)) if e else ""))
    if not c:
        fails.append(n)


CODE = "".join(random.choices(string.ascii_uppercase, k=6))
print(f"== OBS direct-upload regression (code {CODE}) ==")

# 1) single：≤64MB 单 PUT 签名
body = b"hello signed single\n"
r = S.post(BASE + "/upload_init", json={"code": CODE, "filename": "signed-single.txt", "size": len(body)})
d = r.json()
check("init single", r.ok and d.get("mode") == "single", d.get("mode"))
put = requests.put(d["url"], data=body, headers={"Content-Type": d["ctype"]})
check("PUT single 2xx", put.status_code in (200, 201), put.status_code)
r = S.post(BASE + "/upload_complete", json={"code": CODE, "key": d["key"], "size": len(body)})
check("complete single", r.ok and r.json().get("ok"),
      (r.json().get("item", {}).get("name") if r.ok else r.text[:100]))

# 2) multipart：init 80MB → 3 分片；真传前 2 片（各 1MB）后合并
r = S.post(BASE + "/upload_init", json={"code": CODE, "filename": "signed-multi.bin", "size": 80 * 1024 * 1024})
d = r.json()
check("init multipart", r.ok and d.get("mode") == "multipart" and d.get("count") == 3, d.get("count"))
etags = []
for i in range(2):
    p = requests.put(d["parts"][i], data=b"\x00" * (1024 * 1024), headers={"Content-Type": d["ctype"]})
    etags.append(p.headers.get("ETag", "").strip('"'))
    check(f"PUT part{i + 1} 2xx", p.status_code in (200, 201), p.status_code)
r = S.post(BASE + "/upload_complete", json={
    "code": CODE, "key": d["key"], "size": 2 * 1024 * 1024, "uploadId": d["uploadId"],
    "parts": [{"partNum": i + 1, "etag": etags[i]} for i in range(2)],
})
check("complete multipart", r.ok and r.json().get("ok"),
      (r.json().get("item", {}).get("size") if r.ok else r.text[:150]))

# 3) abort：init 后放弃
r = S.post(BASE + "/upload_init", json={"code": CODE, "filename": "signed-abort.bin", "size": 80 * 1024 * 1024})
d2 = r.json()
r = S.post(BASE + "/upload_abort", json={"code": CODE, "key": d2["key"], "uploadId": d2["uploadId"]})
check("abort 2xx", r.ok and r.json().get("ok"))

# 4) 列表含两个产物
r = S.get(BASE + "/list/" + CODE)
names = [i["name"] for i in r.json().get("items", [])]
check("list=single+multi", "signed-single.txt" in names and "signed-multi.bin" in names, names)

# 5) 清理（安全阀：只删 signed- 前缀对象）
try:
    import os
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, BASE_DIR)
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BASE_DIR, ".env"))
    from obs import ObsClient
    c = ObsClient(access_key_id=os.environ["OBS_AK"], secret_access_key=os.environ["OBS_SK"],
                  server=os.environ["OBS_ENDPOINT"])
    B = os.environ["OBS_BUCKET"]
    pref = os.environ.get("OBS_PREFIX", "cloud-copy") + f"/{CODE}/"
    rr = c.listObjects(B, prefix=pref, max_keys=100)
    n = 0
    for o in (rr.body.contents or []):
        assert "signed-" in o.key, "safety valve: refusing to delete " + o.key
        c.deleteObject(B, o.key)
        n += 1
    print(f"  · cleaned {n} test objects")
except Exception as e:
    print("  ! cleanup skip:", e)

print()
print("FAILS:", fails if fails else "none — ALL PASS ✓")
sys.exit(1 if fails else 0)