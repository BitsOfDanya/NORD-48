# NORD-48

Система проектирования и анализа устойчивости спутниковых группировок:
точный расчёт связности, устойчивости к отказам и экономики развёртывания
— поверх оригинальной геометрии организаторов, без единого изменённого
значения в ней.

КосмоХакатон 2026 · команда «5bit»

## Возможности

- **Моделирование** — точный расчёт положения 48 спутников, динамического
  графа контактов и маршрутов `клиент → спутники → шлюз` на 720 временных
  шагах, 4 стратегии маршрутизации, 3D-визуализация.
- **Routing** — минимум переходов, минимальная длина, максимальный запас,
  максимальная стабильность по известной будущей топологии.
- **Сравнение** (`/compare`) — 2–10 расчётов относительно явного baseline.
- **Редактор сценария** — derived-вариант (RAAN/phase, этап развёртывания,
  периоды отказа) без изменения исходного JSON.
- **Устойчивость** (`/resilience`) — Failure Lab, N-1/N-2 (точный перебор
  всех пар), Monte Carlo, сравнение стратегий маршрутизации, route
  redundancy (есть ли независимый резервный путь).
- **Оптимизатор** (`/optimizer`) — точный поиск RAAN/phase
  (normal / robust / constrained_robust), deployment planner (выбор
  состава группировки по числу спутников), проверка порога размера
  группировки, ISL sensitivity, ресурсная и денежная оценка.
- **Acceptance Matrix** — сводная таблица проверенных кандидатов по всем
  критериям сразу (без единой свёрнутой оценки).

## Архитектура

```
Frontend (Next.js, TS)  ──REST──▶  Backend (FastAPI)
                                       │
                                       └── Calculation Engine
                                           geometry / graph / routing /
                                           metrics / optimization / economics
```

Frontend не выполняет расчётов — только отображает то, что вернул
backend. Подробнее — [docs/architecture.md](docs/architecture.md).

## Quick Start

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API docs (Swagger): http://localhost:8000/docs
- Health-check: http://localhost:8000/api/v1/health

## Локальный запуск

Backend — см. [backend/README.md](backend/README.md).

Frontend — см. [frontend/README.md](frontend/README.md).

## Основные сценарии

| Файл | Назначение |
| --- | --- |
| `01_full_constellation.json` | Полная группировка — 48 аппаратов, 3 плоскости. |
| `02_first_launch.json` | Первая очередь — активны только 16 аппаратов 1-й партии. |
| `03_satellite_outages.json` | 10 аппаратов выходят из строя после 06:00. |
| `04_link_range.json` | Дальность ISL ограничена 2000 км. |

## Основные результаты

Штатный режим, `minimum_hops`, worst-доступность среди всех клиентов:

| Кандидат | Спутников | Normal worst | N-1 | N-2 |
| --- | --- | --- | --- | --- |
| N=44 (минимум для target) | 44 | 90,14 % | FAIL | FAIL |
| N=46 (устойчив к 1 отказу) | 46 | 93,33 % | PASS | FAIL |
| Полная группировка | 48 | 96,67 % | PASS | PASS |

Полное обоснование выбора — [docs/design-decision.md](docs/design-decision.md)
(RAAN/phase) и [docs/design-threshold-verification.md](docs/design-threshold-verification.md)
(число спутников).

## Tests

```bash
# backend
cd backend && uv run pytest && uv run ruff check . && uv run mypy app

# frontend
cd frontend && npm run lint && npx tsc --noEmit && npm run build
```

## Documentation

- [docs/architecture.md](docs/architecture.md) — устройство проекта.
- [docs/calculation-model.md](docs/calculation-model.md) — расчётная модель, regression-значения.
- [docs/api.md](docs/api.md) — полный список эндпоинтов.
- [docs/design-decision.md](docs/design-decision.md) — выбор RAAN/phase.
- [docs/design-threshold-verification.md](docs/design-threshold-verification.md) — выбор числа спутников.
- [docs/deployment-optimization.md](docs/deployment-optimization.md) — hybrid deployment optimization.
- [docs/network-redundancy.md](docs/network-redundancy.md) — route redundancy.
- [docs/isl-sensitivity.md](docs/isl-sensitivity.md) — минимальная дальность ISL.
- [docs/cost-effectiveness.md](docs/cost-effectiveness.md), [docs/cost-sources.md](docs/cost-sources.md) — экономика.
- [docs/development.md](docs/development.md) — разработка.

## Ограничения

Не реализовано: ML/суррогатные модели (заготовка в `ml/`, не участвует в
расчёте), редактирование архитектуры группировки (число плоскостей/высота
— редактор варианта меняет только RAAN/phase, этап и отказы), сохранение
расчётов в БД (в памяти процесса/сессии браузера), аутентификация.
Подробности и обоснование — в docs выше.
