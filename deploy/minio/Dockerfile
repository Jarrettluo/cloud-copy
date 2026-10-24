FROM python:3.12-slim

WORKDIR /app

# 镜像源：默认官方 PyPI；国内环境可覆盖：
#   docker compose --env-file .env.minio build --build-arg PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
ARG PIP_INDEX_URL=https://pypi.org/simple/

# 后端依赖（含 MinIO 的 S3 客户端 boto3，见 requirements.txt）
COPY requirements.txt ./
RUN pip install --no-cache-dir -i ${PIP_INDEX_URL} -r requirements.txt

COPY backend ./backend

ENV PYTHONPATH=/app \
    STORAGE_BACKEND=s3 \
    HOST=0.0.0.0 \
    PORT=7012

EXPOSE 7012

CMD ["python3", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7012"]