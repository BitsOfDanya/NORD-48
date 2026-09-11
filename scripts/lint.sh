#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Backend: ruff"
(cd "$ROOT_DIR/backend" && uv run ruff check .)

echo "==> Backend: mypy"
(cd "$ROOT_DIR/backend" && uv run mypy app)

echo "==> ML: ruff"
(cd "$ROOT_DIR/ml" && uv run ruff check .)

echo "==> Frontend: eslint"
(cd "$ROOT_DIR/frontend" && npm run lint)
