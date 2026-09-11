#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Backend: uv sync"
(cd "$ROOT_DIR/backend" && uv sync)

echo "==> ML: uv sync"
(cd "$ROOT_DIR/ml" && uv sync)

echo "==> Frontend: npm install"
(cd "$ROOT_DIR/frontend" && npm install)

if [ ! -f "$ROOT_DIR/backend/.env" ]; then
  cp "$ROOT_DIR/backend/.env.example" "$ROOT_DIR/backend/.env"
  echo "==> Created backend/.env"
fi

if [ ! -f "$ROOT_DIR/frontend/.env.local" ]; then
  cp "$ROOT_DIR/frontend/.env.example" "$ROOT_DIR/frontend/.env.local"
  echo "==> Created frontend/.env.local"
fi

echo "==> Setup complete."
