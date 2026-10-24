#!/bin/bash
# cloud-copy 部署脚本（幂等）
# 用法: bash deploy/deploy.sh
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DST="/var/www/cloud-copy"
SVC="cloud-copy.service"

echo "==> 1. 同步前端 -> $DST"
mkdir -p "$DST"
cp -r "$SRC/frontend/." "$DST/"
find "$DST" -type d -exec chmod 755 {} \;
find "$DST" -type f -exec chmod 644 {} \;
echo "    files: $(ls "$DST" | tr '\n' ' ')"

echo "==> 2. 安装 systemd 服务"
cp -f "$SRC/deploy/$SVC" "/etc/systemd/system/$SVC"
systemctl daemon-reload
systemctl enable cloud-copy >/dev/null 2>&1 || true

echo "==> 3. 重启服务"
systemctl restart cloud-copy
sleep 1
systemctl is-active cloud-copy

echo "==> 4. 健康检查（直连 7012，最多重试 10 次）"
for i in $(seq 1 10); do
  if curl -sf http://127.0.0.1:7012/api/health >/dev/null; then echo "health OK"; break; fi
  if [ "$i" = "10" ]; then echo "health FAILED"; exit 1; fi
  sleep 1
done

echo "==> 5. nginx 检查 + reload"
/usr/sbin/nginx -t
systemctl reload nginx
sleep 0.5

echo "==> 6. 冒烟（经 nginx:80）"
curl -sf http://127.0.0.1/cloud-copy/api/health >/dev/null && echo "nginx proxy OK"
curl -sf http://127.0.0.1/cloud-copy/ | grep -q "云复制" && echo "frontend OK"
echo "==> 部署完成 ✓"