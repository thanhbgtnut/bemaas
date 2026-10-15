#!/usr/bin/env bash
# Chạy backend bemaas (:8080) cho phát triển giao diện.
# Bật hạ tầng local trước (make up); server tự chạy migration khi khởi động.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "==> đã tạo .env từ .env.example"
fi

make up

echo "==> bemaas backend đang khởi động"
exec go run ./cmd/bemaas -config configs/config.yaml -env .env
