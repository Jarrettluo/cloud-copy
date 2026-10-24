# cloud-copy MinIO 私有部署（docker-compose）

在自有服务器上用 **MinIO** 作为对象存储运行云复制，数据完全留在自己机房/内网。

## 一键启动

```bash
cd deploy/minio
cp .env.minio.example .env.minio   # 按需修改账号密码/端口
docker compose --env-file .env.minio up -d
```

启动后：

- MinIO API（S3）：`http://<你的IP>:9000`
- MinIO 控制台：`http://<你的IP>:9001`（账号密码见 `.env.minio`）
- 云复制后端：`http://127.0.0.1:7012`（由 compose 一并拉起）

## 架构

```
浏览器 ── http://<你的IP>/cloud-copy/
   │           ├── 静态前端（nginx / 或 cloud-copy 自带 nginx 容器）
   │           └── /cloud-copy/api/* → cloud-copy 后端（app 容器 :7012）
   │                                      └── MinIO（minio 容器 :9000，S3 协议）
   │           大文件：浏览器 ──签名URL──→ MinIO 直传（不经服务器中转）
```

## 目录

- `docker-compose.yml`：minio + cloud-copy 后端（含依赖安装）两个服务
- `.env.minio.example`：配置模板（MinIO 账号、桶名、后端端口等）

## 关键配置

后端通过 `STORAGE_BACKEND=s3` 使用 MinIO：

```env
STORAGE_BACKEND=s3
S3_ENDPOINT=http://minio:9000          # compose 内网服务名
S3_ACCESS_KEY=...                       # 与 MINIO_ROOT_USER 一致
S3_SECRET_KEY=...                       # 与 MINIO_ROOT_PASSWORD 一致
S3_BUCKET=cloud-copy
S3_LABEL=MinIO 私有部署
```

首次启动时后端会自动：

1. 检查桶是否存在，不存在则自动创建
2. 配置桶 CORS（`PUT/GET/HEAD` + `ETag` 放行）——浏览器直传大文件的前提

> 若用裸机运行 MinIO（非 compose），记得给 MinIO 进程加
> `MINIO_API_CORS_ALLOW_ORIGIN=*` 或不加此变量（默认允许同源）；
> 直传为跨域 PUT，建议显式允许来源或设置后端自动配置的桶级 CORS。

## nginx 入口（可选）

若需要 80/443 对外提供 `/cloud-copy/` 前缀，参考 `deploy/nginx-cloud-copy.conf`，
把静态目录指向 `frontend/`、`/cloud-copy/api/` 反代到 `127.0.0.1:7012`。
compose 模式下后端端口映射到宿主机 `127.0.0.1:7012`，供你已有的 nginx 使用。

## 常用命令

```bash
docker compose --env-file .env.minio logs -f cloud-copy   # 后端日志
docker compose --env-file .env.minio logs -f minio        # MinIO 日志
docker compose --env-file .env.minio down                 # 停止（数据在 volume 中保留）
docker compose --env-file .env.minio up -d --build        # 更新代码后重建
```

## 数据持久化

- MinIO 数据：named volume `minio-data`（默认在 `/var/lib/docker/volumes/`）
- 生产建议：把 `minio-data` 换成宿主机目录或 NAS 挂载，并定期备份

## 资源参考

- MinIO：内存 ≥512MB（大并发上传建议 1GB+）
- cloud-copy 后端：内存 ≤256MB（大文件走直传，不经后端）
- 磁盘：按你的文件量预估，MinIO 无特殊格式要求