# Разработка

## Требования

- Node.js 20+ / npm
- Python 3.12
- [uv](https://docs.astral.sh/uv/) для управления Python-зависимостями
- Docker (опционально, для запуска в контейнерах)

## Без Docker

```bash
# backend
cd backend
uv sync
uv run uvicorn app.main:app --reload

# frontend (отдельный терминал)
cd frontend
npm install
npm run dev
```

## С Docker

```bash
docker compose up --build
```

## Частые команды

Корневой [Makefile](../Makefile): `make dev`, `make test`, `make lint`,
`make format`, `make docker-up` и т.д.

## Проверка качества кода

- Backend: `ruff` (lint), `mypy` (типы), `pytest` (тесты).
- ML: `ruff`, `pytest`.
- Frontend: `eslint`, `tsc --noEmit`, `next build`.

```bash
cd backend && uv run pytest && uv run ruff check . && uv run mypy app
cd ml && uv run pytest && uv run ruff check .
cd frontend && npm run lint && npx tsc --noEmit && npm run build
```

## Набор тестов backend

`backend/tests/unit/` — изолированные тесты отдельных модулей расчёта
(граф, маршрутизация, диагностика, метрики, схема сценария) на
искусственных данных. `backend/tests/integration/` — тесты полного
конвейера сценарий → расчёт → API, включая
`test_simulation_regression.py`, который сверяет доступность и
максимальные перерывы для всех 4 исходных сценариев с контрольными
значениями — см.
[calculation-model.md](calculation-model.md#контрольные-regression-значения).
Эти контрольные значения не подгоняются под новый результат: если тест
упал, значит в расчётном конвейере появилась ошибка.

## Переменные окружения

Скопируйте `.env.example` в `.env` (`backend/`) и `.env.local`
(`frontend/`). Реальные `.env`-файлы в git не попадают
(см. `.gitignore`).

`SCENARIOS_DIR` (backend, опционально) — переопределяет путь к каталогу с
исходными сценариями. Нужен только в Docker, где backend-контейнеру
монтируется исключительно каталог `backend/`, а не весь репозиторий;
`docker-compose.yml` уже задаёт его автоматически. Для локального запуска
через `uv run uvicorn` переменную задавать не нужно.
