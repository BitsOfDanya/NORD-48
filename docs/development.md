# Development

## Prerequisites

- Node.js 20+ / npm
- Python 3.12
- [uv](https://docs.astral.sh/uv/) for Python dependency management
- Docker (optional, for containerized local run)

## Without Docker

```bash
# backend
cd backend
uv sync
uv run uvicorn app.main:app --reload

# frontend (separate terminal)
cd frontend
npm install
npm run dev
```

## With Docker

```bash
docker compose up --build
```

## Common tasks

See the root [Makefile](../Makefile) for shortcuts (`make dev`, `make test`,
`make lint`, `make format`, `make docker-up`, ...).

## Code quality

- Backend: `ruff` (lint), `mypy` (types), `pytest` (tests).
- ML: `ruff`, `pytest`.
- Frontend: `eslint`, `tsc --noEmit`.

Run everything with `make lint` / `make test`.

## Environment variables

Copy `.env.example` to `.env` in `backend/` and `.env.local` in `frontend/`
(and at the repo root if you need shared values). Never commit real `.env`
files.
