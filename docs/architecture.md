# Architecture

## Data flow

```
JSON Scenario
      ↓
Scenario Layer
      ↓
Geometry Engine
      ↓
Dynamic Network Graph
      ↓
Routing Engine
      ↓
Metrics / Diagnostics
      ↓
Comparison / Resilience
      ↓
Optimization
      ↓
REST API
      ↓
Next.js UI
```

## Components

- **Frontend** (`frontend/`) — Next.js App Router UI. Talks to the backend
  only over the REST API. **The frontend never performs physical/orbital
  calculations** — it renders what the backend computes.
- **Backend** (`backend/`) — FastAPI service. This is the **source of
  truth** for simulation: scenario parsing, geometry, network graph,
  routing, metrics, diagnostics, comparison, and resilience analysis all
  live here (or are imported here from `ml/`).
- **ML / optimization** (`ml/`) — a Python package (`orbitguard_ml`)
  imported directly by the backend, not a separate service. It searches for
  and scores candidate configurations, but **never replaces the exact
  simulator**: any optimizer/surrogate candidate must be re-verified by the
  backend calculation engine before being reported as a result.

## Monorepo layout

See the root [README.md](../README.md#repository-structure) for the full
directory tree.

## Current status

This repository is currently scaffolding: structure, tooling, health
endpoints, and a minimal frontend page. No simulation, routing, metrics, or
optimization logic is implemented yet. See the root README's "Next
implementation step" section for what comes next.
