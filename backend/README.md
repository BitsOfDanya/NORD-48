# NORD-48 Backend

FastAPI-сервис — источник истины для расчёта устойчивости спутниковой
группировки. Ничего не считается повторно во frontend.

## Стек

Python 3.12, FastAPI, Uvicorn, Pydantic v2, NetworkX, NumPy, SciPy. Нет
базы данных — расчёты (`simulations`) хранятся в памяти процесса на время
его жизни.

## Установка

```bash
cd backend
uv sync
```

## Запуск

```bash
uv run uvicorn app.main:app --reload
```

- API: http://localhost:8000
- Swagger: http://localhost:8000/docs
- Health-check: http://localhost:8000/api/v1/health

## Тесты / линт

```bash
uv run pytest
uv run ruff check .
uv run mypy app
```

## Структура

- `app/api/v1/` — версионированные роутеры: `health`, `scenarios`,
  `simulations`, `routes`, `comparisons`, `resilience`, `optimization`,
  `economics` (см. [docs/api.md](../docs/api.md)).
- `app/core/` — настройки, логирование, исключения.
- `app/calculation/` — расчётный движок, без побочных эффектов (чистые
  функции над данными сценария):
  - `geometry/` — адаптер над `reference_geometry.py` организаторов
    (копия без изменений — не редактировать).
  - `network/` — динамический граф контактов, запас линии (margin).
  - `routing/` — 4 стратегии маршрутизации, стабильность маршрута.
  - `metrics/` — доступность/видимость/перерывы, outage quality
    (детальное распределение длительности перерывов).
  - `diagnostics/` — причины отсутствия маршрута.
  - `resilience/` — failure analysis, N-1/N-2, Monte Carlo, route
    redundancy, Dynamic min-cut / Resilience Margin
    (см. [описание и API-примеры](../docs/connectivity-margin.md)).
  - `optimization/` — exact RAAN/phase поиск, deployment planner
    (hybrid: состав → геометрия → ревалидация), threshold verification
    (swap refinement), ISL sensitivity.
  - `economics/` — ресурсная и денежная оценка (opt-in, без встроенных
    цен по умолчанию).
  - См. отдельный [README](app/calculation/README.md).
- `app/services/` — оркестрация поверх `calculation/`: `scenario_service`,
  `simulation_service`, `comparison_service`, `resilience_service`,
  `optimization_service`, `deployment_planner_service` (async job'ы для
  тяжёлых расчётов — polling статуса, не WebSocket).
- `app/schemas/scenario.py` — Pydantic v2-схема формата сценария
  `cosmo-A-1.0`.
- `app/models/` — dataclass для состояния расчёта в памяти (`RouteRecord`,
  `SimulationRun`) — не ORM, схемы БД нет.

## Регрессионные тесты

`tests/integration/test_simulation_regression.py` сверяет полный
расчётный конвейер с контрольными значениями доступности/перерывов для
всех 4 исходных сценариев — см.
[docs/calculation-model.md](../docs/calculation-model.md#контрольные-regression-значения).
