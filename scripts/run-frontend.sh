#!/usr/bin/env bash
# Chạy Vite dev server (:5173), proxy /api sang backend.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/frontend"

if [ ! -d node_modules ]; then
  echo "==> cài thư viện giao diện"
  npm install
fi

# Proxy /api của Vite phải tới được backend do run-backend.sh chạy.
export BEMAAS_API="${BEMAAS_API:-http://localhost:8080}"

echo "==> frontend dev server đang khởi động (api: ${BEMAAS_API})"
exec npm run dev
