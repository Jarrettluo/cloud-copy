#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""配置 OBS 桶 CORS（浏览器直传需要）。

用法: python3 deploy/setup_cors.py
说明: allowedOrigin 允许全部来源（签名 URL 本身即凭证，15 分钟有效）；
      allowedMethod 需含 PUT（直传）与 GET/HEAD（下载）；
      exposeHeader 需含 ETag（分片上传合并时回传）。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from obs import CorsRule, ObsClient

c = ObsClient(access_key_id=os.environ["OBS_AK"], secret_access_key=os.environ["OBS_SK"],
              server=os.environ["OBS_ENDPOINT"])
B = os.environ["OBS_BUCKET"]
rules = [CorsRule(id="cloud-copy-web",
                  allowedMethod=["PUT", "GET", "HEAD"],
                  allowedOrigin=["*"],
                  allowedHeader=["*"],
                  maxAgeSecond=3600,
                  exposeHeader=["ETag"])]
r = c.setBucketCors(B, rules)
print("setBucketCors:", r.status, getattr(r, "errorCode", None) or "OK")
r = c.getBucketCors(B)
print("getBucketCors:", r.status)
if r.status == 200:
    for rule in r.body:
        print("  ", rule)