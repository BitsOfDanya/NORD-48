# OrbitGuard

Engineering web platform for designing and analyzing a resilient satellite
constellation — hackathon case **«Проектирование устойчивой спутниковой
группировки»**.

> **Status: project foundation.** This repository currently contains
> structure, tooling, and health-check scaffolding only. No simulation,
> routing, metrics, or optimization logic is implemented yet — see
> [What's intentionally not implemented](#whats-intentionally-not-implemented)
> and [Next implementation step](#next-implementation-step) below.

## What this will become

Users will be able to upload a JSON scenario, edit constellation parameters
(RAAN, phase, deployment stage, failure windows), run a simulation, compute
satellite positions and ground-to-satellite / inter-satellite contacts,
build `client -> satellites -> gateway` routes, inspect network state on a
timeline, analyze availability and outages, compare configurations, find
critical satellites, and (later) automatically optimize the configuration.

## Architecture

Monorepo with three independently runnable parts:

- **`frontend/`** — Next.js (App Router, TypeScript, Tailwind, shadcn/ui).
  Renders what the backend computes; performs no physical calculations
  itself.
- **`backend/`** — FastAPI (Python 3.12, SQLAlchemy 2 / SQLite). The
  **source of truth** for simulation.
- **`ml/`** — `orbitguard_ml`, a plain Python package imported by the
  backend (not a separate service) for future optimization / sensitivity /
  criticality / surrogate-model work.

Data flow and design rules: [docs/architecture.md](docs/architecture.md).

## Repository structure

```
frontend/    Next.js app (App Router, TS, Tailwind, shadcn/ui)
backend/     FastAPI service (source of truth for simulation)
ml/          orbitguard_ml package (optimization, not a service)
data/        scenario inputs (raw case data) and run outputs
case_materials/  unmodified hackathon PDFs + reference geometry.py
docs/        architecture, API, dev, calculation-model docs
scripts/     setup/dev/lint/test shell scripts
infra/docker/  (reserved for future infra assets)
docker-compose.yml, Makefile, .env.example, ...
```

See [docs/development.md](docs/development.md) for details on each part.

## Requirements

- Node.js 20+
- Python 3.12
- [uv](https://docs.astral.sh/uv/)
- Docker (optional)

## Setup

```bash
make setup
```

or manually — see [docs/development.md](docs/development.md).

## Run

Without Docker:

```bash
make dev
```

or start each part individually: `make backend`, `make frontend`.

With Docker:

```bash
make docker-up
# or: docker compose up --build
```

## URLs

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Swagger: http://localhost:8000/docs
- Health check: http://localhost:8000/api/v1/health

## Case data

Original scenario files (unmodified) are in
[`data/scenarios/raw/`](data/scenarios/raw/). Problem statement, data
description, and evaluation criteria PDFs, plus the organizers' reference
`geometry.py`, are in [`case_materials/`](case_materials/).

## Calculation engine

Not implemented yet. Scaffolding lives in
[`backend/app/calculation/`](backend/app/calculation/) (see its
[README](backend/app/calculation/README.md)) and the planned model is
documented in [docs/calculation-model.md](docs/calculation-model.md).

## Optimization layer

Not implemented yet. Scaffolding lives in
[`ml/src/orbitguard_ml/`](ml/src/orbitguard_ml/) (see
[ml/README.md](ml/README.md)).

## What's intentionally not implemented

Per the current project phase: scenario parsing, orbital/geometry
calculations, network graph construction, routing, metrics, diagnostics,
comparison, resilience analysis, optimization, and any ML model training.
No microservices, no Kafka/Redis/Postgres, no authentication/users/roles,
no LLM integration. See [docs/architecture.md](docs/architecture.md) for
the reasoning.

## Next implementation step

**Backend Calculation Engine:**

```
scenario schemas -> adapter over geometry.py -> time simulation -> dynamic graph -> routing
```

Not started in this pass — see [docs/calculation-model.md](docs/calculation-model.md).
