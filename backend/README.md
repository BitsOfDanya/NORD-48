# NORD-48 Backend

FastAPI-сервис NORD-48 — источник истины для расчёта устойчивости
спутниковой группировки.

## Стек

Python 3.12, FastAPI, Uvicorn, Pydantic v2, NetworkX, SQLAlchemy 2
(async, SQLite — пока не используется), NumPy, SciPy.

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
  `simulations`, `comparisons`, `resilience`, `optimization`
  (см. [docs/api.md](../docs/api.md)).
- `app/core/` — настройки, логирование, исключения.
- `app/calculation/` — расчётный движок (geometry-адаптер, динамический
  граф сети, маршрутизация, метрики, диагностика) — см. отдельный
  [README](app/calculation/README.md).
- `app/services/` — `scenario_service.py` (загрузка/валидация сценариев)
  и `simulation_service.py` (оркестрация полного расчёта, хранилище
  запусков в памяти процесса), а также точное сравнение, N-1 и
  Differential Evolution поверх того же расчётного движка.
- `app/schemas/scenario.py` — Pydantic v2-схема формата сценария
  `cosmo-A-1.0`.
- `app/models/` — обычные dataclass для состояния расчёта в памяти
  (`RouteRecord`, `SimulationRun`) — это не ORM-модели, схемы БД пока нет.
- `app/db/` — асинхронная SQLAlchemy сессия/база, пока не используется.

## Регрессионные тесты

`tests/integration/test_simulation_regression.py` сверяет полный
расчётный конвейер с контрольными значениями доступности/перерывов для
всех 4 исходных сценариев — см.
[docs/calculation-model.md](../docs/calculation-model.md#контрольные-regression-значения).
