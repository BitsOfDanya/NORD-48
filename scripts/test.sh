#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Backend: pytest"
(cd "$ROOT_DIR/backend" && uv run pytest)

echo "==> ML: pytest"
(cd "$ROOT_DIR/ml" && uv run pytest)
