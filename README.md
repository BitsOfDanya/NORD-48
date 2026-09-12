# NORD-48

Система проектирования и анализа устойчивости спутниковых группировок:
точный расчёт связности, устойчивости к отказам и экономики развёртывания
— поверх оригинальной геометрии организаторов, без единого изменённого
значения в ней.

КосмоХакатон 2026 · команда «5bit»

**Live demo:** http://5.129.225.86:3000/

## Возможности

- **Моделирование** — точный расчёт положения 48 спутников, динамического
  графа контактов и маршрутов `клиент → спутники → шлюз` на 720 временных
  шагах, 4 стратегии маршрутизации, 3D-визуализация.
- **Routing** — минимум переходов, минимальная длина, максимальный запас,
  максимальная стабильность по известной будущей топологии.
- **Сравнение** (`/compare`) — 2–10 расчётов относительно явного baseline.
- **Редактор сценария** — derived-вариант (RAAN/phase, этап развёртывания,
  периоды отказа) без изменения исходного JSON.
- **Устойчивость** (`/resilience`) — Failure Lab (клик по интервалу отказа
  → детерминированное объяснение причины: видимость/шлюз/связность ISL,
  без LLM), N-1/N-2 (точный перебор всех пар), Monte Carlo, сравнение
  стратегий маршрутизации, route redundancy (есть ли независимый
  резервный путь — показан на глобусе отдельным цветом), degradation
  analysis (кривые деградации по ISL и по числу отказавших спутников,
  exact при K≤2 / Monte Carlo при K≥3), dynamic connectivity margin
  (минимальный набор спутников, отказ которых разрывает связь клиента со
  всеми шлюзами — см. [docs/connectivity-margin.md](docs/connectivity-margin.md)).
- **Оптимизатор** (`/optimizer`) — точный поиск RAAN/phase (normal /
  robust / constrained_robust / robust_design / **failure_cvar** —
  CVaR-робастный поиск по банку случайных+коррелированных+adversarial
  наборов из K одновременных отказов спутников, специализированный
  кандидат, не заменяющий основную рекомендацию автоматически, см.
  [docs/failure-robust-optimization.md](docs/failure-robust-optimization.md)),
  опциональный toroidal differential evolution для циклических RAAN/phase
  углов у границы 0°/360°, deployment planner (greedy + опциональный
  точный 1-swap и tabu-поиск состава группировки по числу спутников),
  проверка порога размера группировки, ISL sensitivity (Baseline vs
  Recommended Robust), ресурсная и денежная оценка.
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

### Production

Production-конфигурация запускает frontend, backend и Caddy как отдельные
контейнеры. Caddy публикует единый origin и проксирует `/api/*` в backend:

```bash
PUBLIC_ORIGIN=http://server.example:3000 PUBLIC_PORT=3000 \
  docker compose -f docker-compose.prod.yml up -d --build
```

Push в `main` запускает `.github/workflows/deploy.yml`. Для workflow нужны
repository/environment secrets `DEPLOY_HOST`, `DEPLOY_USER`,
`DEPLOY_SSH_KEY` и `DEPLOY_KNOWN_HOSTS`.

## Основные сценарии

| Файл | Назначение |
| --- | --- |
| `01_full_constellation.json` | Полная группировка — 48 аппаратов, 3 плоскости. |
| `02_first_launch.json` | Первая очередь — активны только 16 аппаратов 1-й партии. |
| `03_satellite_outages.json` | 10 аппаратов выходят из строя после 06:00. |
| `04_link_range.json` | Дальность ISL ограничена 2000 км. |

## Основные результаты

Рекомендуемая конфигурация — **Robust Design 2.0** (все 48 спутников, RAAN/phase
подобраны поиском, см. [docs/robust-design-search.md](docs/robust-design-search.md)),
`minimum_hops`, worst-доступность среди трёх клиентов (C65/C70/C72):

| Условие | Baseline | Robust Design 2.0 |
| --- | --- | --- |
| Normal worst | 96,67 % | 96,53 % |
| Outages worst | 79,31 % | 82,64 % |
| ISL2000 worst | 62,22 % | 67,78 % |
| N-1 | PASS | PASS |
| N-2 | PASS | PASS |
| Backup path, среднее | 28,1 % | 30,05 % |
| Требуемая дальность ISL | ~2750 км | ~2750 км |

Отдельно доступен специализированный `failure_cvar`-кандидат, устойчивый к
случайным одновременным отказам K=10 спутников ценой худшего ISL2000 — не
заменяет Robust Design 2.0 автоматически, см.
[docs/failure-robust-optimization.md](docs/failure-robust-optimization.md).

Выбор ЧИСЛА спутников (независимо от RAAN/phase) — своя таблица:

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
- [docs/hackathon-requirements.md](docs/hackathon-requirements.md) — соответствие требованиям кейса.
- [docs/design-decision.md](docs/design-decision.md) — выбор RAAN/phase (Robust Design 2.0).
- [docs/robust-design-search.md](docs/robust-design-search.md) — алгоритм поиска Robust Design 2.0.
- [docs/failure-robust-optimization.md](docs/failure-robust-optimization.md) — CVaR-робастный поиск (failure_cvar).
- [docs/design-threshold-verification.md](docs/design-threshold-verification.md) — выбор числа спутников.
- [docs/deployment-optimization.md](docs/deployment-optimization.md) — hybrid deployment optimization.
- [docs/resilience-analysis.md](docs/resilience-analysis.md) — N-1/N-2, Monte Carlo, чем они отличаются от connectivity margin.
- [docs/connectivity-margin.md](docs/connectivity-margin.md) — dynamic min-cut / connectivity margin.
- [docs/degradation-analysis.md](docs/degradation-analysis.md) — кривые деградации по K отказавших спутников.
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
