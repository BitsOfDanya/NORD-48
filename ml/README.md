# nord48-ml

ML / optimization package for NORD-48. **Not a separate service** — a
regular Python package the backend imports directly.

## Scope (planned, not implemented yet)

- `optimization/` — objective functions and search strategies (Optuna,
  SciPy) over the constellation parameter space.
- `sensitivity/` — sensitivity of simulation metrics to input parameters.
- `criticality/` — identifying critical satellites/links.
- `surrogate/` — fast approximate models (scikit-learn now; CatBoost/XGBoost
  optional later) to speed up search.
- `features/` — feature extraction from scenarios/simulation results.

Every module currently raises `NotImplementedError` with a docstring
explaining what it will do and what it depends on. No models are trained at
this stage.

## Hard rule

The ML/optimization layer never replaces the exact backend calculation
engine. Any candidate configuration found by search or predicted by a
surrogate model must be re-verified by the exact simulator before being
reported as a result. See [docs/architecture.md](../docs/architecture.md).

## Setup

```bash
cd ml
uv sync
uv run pytest
```
