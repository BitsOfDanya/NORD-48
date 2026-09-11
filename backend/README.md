# NORD-48 Backend

FastAPI backend for NORD-48 — Satellite Constellation Resilience Workbench.

## Stack

Python 3.12, FastAPI, Uvicorn, Pydantic v2, SQLAlchemy 2 (async, SQLite),
NumPy, NetworkX, SciPy.

## Setup

```bash
cd backend
uv sync
```

## Run

```bash
uv run uvicorn app.main:app --reload
```

- API: http://localhost:8000
- Swagger: http://localhost:8000/docs
- Health: http://localhost:8000/api/v1/health

## Test / lint

```bash
uv run pytest
uv run ruff check .
uv run mypy app
```

## Layout

- `app/api/v1/` — versioned routers. Only `health` (`/health`, `/info`) is
  implemented; the rest are empty placeholder routers.
- `app/core/` — settings, logging, exceptions.
- `app/calculation/` — the simulation engine (see its own
  [README](app/calculation/README.md)). Not implemented yet.
- `app/db/` — async SQLAlchemy session/base. No schema yet.
- `app/models/`, `app/schemas/`, `app/services/` — placeholders for the
  domain layer, to be filled in alongside the calculation engine.
