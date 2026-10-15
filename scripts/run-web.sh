#!/usr/bin/env bash
# Chạy cùng lúc backend bemaas (:8080) và frontend dev server (:5173).
# Ctrl+C dừng cả hai.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BACKEND_PID=""
cleanup() {
  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo
    echo "==> dừng backend"
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

"$ROOT_DIR/scripts/run-backend.sh" &
BACKEND_PID=$!

"$ROOT_DIR/scripts/run-frontend.sh"
