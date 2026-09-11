# API

Base URL: `http://localhost:8000`, prefix `/api/v1`.

Interactive docs (Swagger UI): http://localhost:8000/docs

## Implemented

| Method | Path                | Description                          |
| ------ | ------------------- | ------------------------------------- |
| GET    | `/api/v1/health`    | Liveness check.                       |
| GET    | `/api/v1/info`      | Project name, API version, environment. |

## Planned (empty router placeholders today)

| Prefix                  | Router module                          |
| ------------------------ | -------------------------------------- |
| `/api/v1/scenarios`     | `app/api/v1/scenarios.py`    |
| `/api/v1/simulations`   | `app/api/v1/simulations.py`  |
| `/api/v1/routes`        | `app/api/v1/routes.py`       |
| `/api/v1/comparisons`   | `app/api/v1/comparisons.py`  |
| `/api/v1/resilience`    | `app/api/v1/resilience.py`   |
| `/api/v1/optimization`  | `app/api/v1/optimization.py` |

These routers are registered in
[`app/api/v1/router.py`](../backend/app/api/v1/router.py) but currently
expose no endpoints.
