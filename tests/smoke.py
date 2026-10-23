#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""cloud-copy API 冒烟测试 — 经 nginx :80 全链路，测完自动清理自己的测试对象。"""
import base64
import random
import re
import string
import sys

import requests

BASE = "http://127.0.0.1/cloud-copy/api"
S = requests.Session()
fails = []


def check(name, cond, extra=""):
    print(("  ✓ " if cond else "  ✗ ") + name + (("  | " + str(extra)) if extra else ""))
    if not cond:
        fails.append(name)


CODE = "".join(random.choices(string.ascii_uppercase, k=6))
print(f"== cloud-copy smoke (test code: {CODE}) ==")

# 1. health
r = S.get(BASE + "/health")
d = r.json() if r.ok else None
check("health", r.status_code == 200 and d and d.get("ok"), f"max_file={d.get('max_file_mb')}MB")

# 2. new_code
r = S.get(BASE + "/new_code")
d = r.json() if r.ok else None
check("new_code 6位大写", bool(d) and re.fullmatch(r"[A-Z]{6}", d.get("code") or ""), d and d.get("code"))

# 3. upload_text（含多行/缩进/制表/中文）
content = "第一行 汉字\n  第二行 缩进\n\n- 项目A\n- 项目B\n\tTab 制表\ntrailing spaces   "
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

# 5. 文本预览（inline 服务端代理）
r = S.get(f"{BASE}/file/{CODE}/{tid}?disposition=inline")
check("preview text inline", r.status_code == 200 and "第二行 缩进" in r.text and "Tab 制表" in r.text
      and r.headers.get("content-type", "").startswith("text/plain"))

# 6. 下载（302 → OBS 签名 URL）
r = S.get(f"{BASE}/file/{CODE}/{tid}?disposition=attachment", allow_redirects=False)
loc = r.headers.get("location", "")
check("download 302→OBS", r.status_code == 302 and "obs" in loc, loc[:60])
r2 = S.get(loc) if loc else None
check("download 内容一致", bool(r2) and r2.status_code == 200 and "第二行 缩进".encode("utf-8") in r2.content,
      (r2.headers.get("content-disposition", "") if r2 else "")[:90])

# 7. 上传图片 + 中文名 CSV（multipart）
png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
r = S.post(BASE + "/upload_file", data={"code": CODE},
           files={"file": ("dot.png", png, "image/png")})
check("upload png", r.status_code == 200, (r.json() or {}).get("item", {}).get("kind"))
csv = "列1,列2\n值1,值2\n".encode("utf-8")
r = S.post(BASE + "/upload_file", data={"code": CODE},
           files={"file": ("表格 demo.csv", csv, "text/csv")})
check("upload csv 中文名", r.status_code == 200)

r = S.get(BASE + "/list/" + CODE)
d = r.json()
names = [i["name"] for i in d.get("items", [])]
kinds = sorted({i["kind"] for i in d.get("items", [])})
check("list=3 且中文名保留", len(names) == 3 and "表格 demo.csv" in names, names)
check("kinds=image,text", kinds == ["image", "text"], kinds)

# 8. 图片预览 302 inline
img = next((i for i in d["items"] if i["kind"] == "image"), None)
r = S.get(f"{BASE}/file/{CODE}/{img['id']}?disposition=inline", allow_redirects=False)
check("image preview 302 inline+type", r.status_code == 302 and "inline" in r.headers.get("location", "")
      and "image" in r.headers.get("location", ""))

# 9. 负例
r = S.post(BASE + "/upload_text", json={"code": "ZZ", "content": "x"})
check("非法取件码→400", r.status_code == 400)
r = S.post(BASE + "/upload_file", data={"code": CODE}, files={"file": ("empty.txt", b"", "text/plain")})
check("空文件→400", r.status_code == 400)
big = "字" * ((513 * 1024) // 3)
r = S.post(BASE + "/upload_text", json={"code": CODE, "content": big})
check("超限文字→413", r.status_code == 413)

# 10. 清理本测试的 OBS 对象
try:
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    from dotenv import load_dotenv
    import os
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))
    from obs import ObsClient
    c = ObsClient(access_key_id=os.environ["OBS_AK"], secret_access_key=os.environ["OBS_SK"],
                  server=os.environ["OBS_ENDPOINT"])
    pref = f"{os.environ.get('OBS_PREFIX', 'cloud-copy')}/{CODE}/"
    rr = c.listObjects(os.environ["OBS_BUCKET"], prefix=pref, max_keys=200)
    n = 0
    for o in (rr.body.contents or []):
        c.deleteObject(os.environ["OBS_BUCKET"], o.key)
        n += 1
    print(f"  · 已清理测试对象 {n} 个")
except Exception as e:
    print("  ! cleanup skip:", e)

print()
print("FAILS:", fails if fails else "none — ALL PASS ✓")
sys.exit(1 if fails else 0)