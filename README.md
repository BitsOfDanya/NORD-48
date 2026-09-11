# NORD-48

Система проектирования и анализа устойчивости спутниковых группировок.

## Задача

Сервис рассчитывает состояние спутниковой группировки на заданном
временном интервале: положения аппаратов, доступные линии связи
(межспутниковые и до наземных пунктов), маршруты `наземный пункт →
спутники → шлюз`, доступность связи и причины её отсутствия. Кейс
хакатона: «Проектирование устойчивой спутниковой группировки».

## Текущее состояние (v0.1)

Реально работает и проверено:

- загрузка четырёх исходных сценариев (`01_full_constellation`,
  `02_first_launch`, `03_satellite_outages`, `04_link_range`);
- загрузка пользовательского JSON-сценария (`POST /scenarios/upload`);
- двухуровневая проверка сценария: Pydantic-схема + `geometry.validate()`
  организаторов;
- расчёт положения спутников на 720 временных шагах (шаг 120 с, горизонт
  86400 с) через оригинальный `geometry.py`;
- построение динамического графа контактов на каждом шаге (NetworkX), с
  нормированным запасом (`margin`) на каждой линии связи;
- маршрутизация `наземный пункт → спутники → шлюз` четырьмя стратегиями:
  минимум переходов (BFS), минимальная длина (Дейкстра) и максимальный
  запас (widest path), а также точная максимальная стабильность по известной
  будущей топологии (см.
  [docs/resilience-analysis.md](docs/resilience-analysis.md));
- lifetime маршрута, время его валидности, segment lifetime, запас слабейшей
  линии, число перестроений и детерминированный анализ стратегий —
  [docs/routing-experiments.md](docs/routing-experiments.md);
- запрет на использование чужого наземного пункта как транзитного узла;
- расчёт доступности (`availability`), видимости (`visibility`),
  максимального перерыва связи, числа перерывов, среднего числа
  переходов, числа смен маршрута;
- диагностика отсутствия маршрута по 4 причинам (`NO_VISIBLE_SATELLITE`,
  `NO_GATEWAY_CONTACT`, `GATEWAY_OUTAGE`, `ISL_NETWORK_SPLIT`);
- Monte Carlo стресс-тест устойчивости: случайный отказ K аппаратов на
  весь расчётный горизонт, сравнение трёх стратегий маршрутизации по
  реальным (не смоделированным) прогонам —
  [docs/resilience-analysis.md](docs/resilience-analysis.md);
- Failure Lab для временного отказа выбранных аппаратов и полный N-1 анализ
  критичности с baseline reuse, induced-outage diagnostics и quantile-слоем на
  глобусе — [docs/failure-analysis.md](docs/failure-analysis.md);
- exact N-2 для всех 1128 пар и найденного порога отказоустойчивости —
  [docs/failure-threshold.md](docs/failure-threshold.md);
- exact normal/robust optimizer RAAN/phase с async progress, cache, top-5
  revalidation и dataset export —
  [docs/configuration-optimization.md](docs/configuration-optimization.md);
- REST API поверх всего перечисленного (см. [docs/api.md](docs/api.md));
- временная шкала с воспроизведением уже рассчитанных состояний;
- 3D-визуализация группировки (react-globe.gl): активные/недоступные
  спутники, наземные пункты, шлюз, межспутниковые линии, выделенный
  маршрут;
- экспорт результата расчёта (`GET /simulations/{run_id}/export`).

Не реализовано в v0.1 — см. [«Ограничения текущей версии»](#ограничения-текущей-версии).

## Исходные данные

| Файл | Назначение |
| --- | --- |
| `01_full_constellation.json` | Полная группировка — 48 аппаратов, 3 плоскости, ISL 3000 км. |
| `02_first_launch.json` | Первая очередь развёртывания — активны только 16 аппаратов 1-й партии. |
| `03_satellite_outages.json` | 10 аппаратов выходят из строя после 06:00. |
| `04_link_range.json` | Дальность межспутниковой связи ограничена 2000 км. |

Файлы лежат в [`data/scenarios/raw/`](data/scenarios/raw/) в исходном виде
и не редактируются. Постановка задачи, описание данных и критерии оценки
организаторов — в [`case_materials/`](case_materials/).

## Расчётная модель

`geometry.py` организаторов (копия без изменений —
[`backend/app/calculation/geometry/reference_geometry.py`](backend/app/calculation/geometry/reference_geometry.py))
на каждом шаге времени отдаёт `snapshot`: положения спутников, признак
активности (`launch_batch <= launch_stage` и отсутствие отказа) и список
рёбер контакта (межспутниковых и «пункт—спутник»). Дальше по коду:

```
snapshot → NetworkX-граф → граф маршрутизации клиента
  (без чужих наземных пунктов) → маршрут (BFS / Дейкстра)
  → диагностика при отсутствии маршрута → метрики за 720 шагов
```

Подробности и точные формулировки метрик — в
[docs/calculation-model.md](docs/calculation-model.md).

## Архитектура

```
Frontend (Next.js)  ── REST API ──▶  Backend (FastAPI)
                                          │
                                          ├── Calculation Engine
                                          │   (geometry / network / routing /
                                          │    metrics / diagnostics)
                                          │
                                          └── ML package (nord48_ml)
                                              заготовка, в расчёте не участвует
```

Frontend не выполняет орбитальных расчётов — он только отображает то, что
вернул backend. Подробнее — в [docs/architecture.md](docs/architecture.md).

## Структура проекта

```
frontend/    Next.js dashboard (App Router, TS, Tailwind, shadcn/ui)
backend/     FastAPI-сервис — источник истины для расчёта
ml/          nord48_ml — заготовка ML-слоя, в расчёте v0.1 не используется
data/        исходные сценарии и результаты прогонов
case_materials/  PDF постановки задачи + geometry.py организаторов (без изменений)
docs/        архитектура, API, расчётная модель, разработка
scripts/     setup/dev/lint/test
docker-compose.yml, Makefile, .env.example, ...
```

## Backend

Python 3.12, FastAPI, Pydantic v2, NetworkX, SQLAlchemy 2 (пока не
используется — расчёты хранятся в памяти процесса). Подробности —
[backend/README.md](backend/README.md).

## Frontend

Next.js (App Router), TypeScript, Tailwind, shadcn/ui, react-globe.gl,
TanStack Query, Zustand. Шрифты (Manrope, IBM Plex Mono) и текстуры Земли
подключены локально, без обращения к внешним CDN во время работы — см.
[docs/assets.md](docs/assets.md). Подробности по разработке —
[docs/development.md](docs/development.md).

## Интерфейс

- **3D-модель** (react-globe.gl) — активные/недоступные спутники, наземные
  пункты, шлюз, межспутниковые линии, выделенный маршрут; клик по спутнику
  открывает инспектор (плоскость, очередь запуска, число ISL/наземных
  контактов, участие в текущем маршруте).
- **Режимы отображения Земли** — Атлас (естественная текстура), Сеть
  (десатурированная, по умолчанию — максимальный контраст для спутников и
  связей), Ночь (ночные огни). Переключение не запускает расчёт заново —
  это только слой отображения.
- **Слои** — независимые переключатели: спутники, ISL, наземные линии,
  маршрут, орбитальные плоскости, показ недоступных аппаратов.
- **Временная шкала** — воспроизведение уже рассчитанных 720 состояний
  (пошагово или проигрыванием с выбором скорости 0.5×–4×); каждый шаг
  запрашивает готовый `snapshot`/`route` с backend, новый расчёт не
  выполняется.
- **Панель маршрута** — путь клиента до шлюза цепочкой узлов (с
  визуальным выделением самого слабого участка) либо причина отсутствия
  связи с проверками (видимый спутник / контакт со шлюзом / связность
  ISL), логически согласованными с тем, что фактически было проверено в
  диагностике backend — а не набор из трёх одинаковых крестиков.
- **Расчётные данные** и **Сводка расчёта** (кнопка «⋮» в шапке) — сырые
  значения расчёта (client/gateway/routing/путь/метрики) и таблица по всем
  наземным пунктам; все числа — из backend, ничего не считается повторно во
  frontend.
- **Устойчивость** (`/resilience`) — Monte Carlo стресс-тест (K
  отказавших аппаратов, число итераций, seed, стратегии маршрутизации) и
  отдельный точный Route Stability Analysis на 720 snapshot; результат:
  рекомендуемая стратегия с обоснованием, сравнение стратегий,
  график доступности по пунктам, распределение (P5/P50/P95), худший
  случай с разбором причин перерывов.
- **Оптимизация** (`/optimizer`) — normal/robust поиск RAAN/phase, baseline vs
  optimized, scenario matrix, target status, top candidates и сходимость.
- **Сравнение** остаётся зарезервированным для отдельного модуля.

## ML

ML пока не участвует в расчёте. Папка [`ml/src/nord48_ml/`](ml/src/nord48_ml/)
подготовлена для будущего слоя оптимизации (см.
[ml/README.md](ml/README.md)) — все модули сейчас вызывают
`NotImplementedError`.

## API

Основные группы эндпоинтов (полный список — [docs/api.md](docs/api.md)):

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/api/v1/scenarios/examples` | список 4 исходных сценариев |
| POST | `/api/v1/scenarios/upload` | загрузка своего JSON-сценария |
| POST | `/api/v1/simulations/run` | запуск расчёта |
| GET | `/api/v1/simulations/{run_id}/snapshot` | состояние сети в момент t_s |
| GET | `/api/v1/simulations/{run_id}/route` | маршрут клиента в момент t_s |
| GET | `/api/v1/simulations/{run_id}/timeline` | доступность по всем шагам |
| GET | `/api/v1/simulations/{run_id}/export` | полный результат расчёта |
| POST | `/api/v1/resilience/monte-carlo` | Monte Carlo стресс-тест (K отказавших аппаратов × стратегии) |
| POST | `/api/v1/resilience/routing-analysis` | точное сравнение routing strategies на 720 snapshot |
| POST | `/api/v1/resilience/failure-analysis` | baseline против derived failure overlay |
| POST | `/api/v1/resilience/criticality/n1` | полный N-1 ranking активных аппаратов |
| POST | `/api/v1/resilience/failure-threshold/n2` | exact N-2 всех пар |
| POST | `/api/v1/optimization/run` | создать async optimization job |
| GET | `/api/v1/optimization/{run_id}` | реальный progress job |
| GET | `/api/v1/optimization/{run_id}/result` | baseline, best, top и derived scenario |

## Запуск

Через Docker:

```bash
docker compose up --build
```

Локально — backend:

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

и frontend (в отдельном терминале):

```bash
cd frontend
npm install
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Swagger: http://localhost:8000/docs
- Health-check: http://localhost:8000/api/v1/health

Подробности — [docs/development.md](docs/development.md).

## Проверка

```bash
# backend
cd backend && uv run pytest && uv run ruff check . && uv run mypy app

# ml
cd ml && uv run pytest && uv run ruff check .

# frontend
cd frontend && npm run lint && npx tsc --noEmit && npm run build
```

## Контрольные результаты (regression)

Стратегия `minimum_hops`, оригинальная геометрия организаторов. Проверяется
тестом
[`test_simulation_regression.py`](backend/tests/integration/test_simulation_regression.py).

| Сценарий | C65 | C70 | C72 |
| --- | --- | --- | --- |
| Полная группировка | 96,667 % (480 с) | 98,750 % (120 с) | 98,889 % (120 с) |
| Первая очередь | 27,222 % (34320 с) | 15,833 % (39480 с) | 12,639 % (47760 с) |
| Отказ 10 аппаратов | 79,306 % (1440 с) | 80,833 % (1440 с) | 82,500 % (1200 с) |
| Ограниченная дальность ISL | 77,500 % (5640 с) | 62,222 % (10680 с) | 65,139 % (240 с) |

(В скобках — максимальный перерыв связи.) Целевой доступности 90 %
достигают все три клиента только в сценарии «Полная группировка».

## Ограничения текущей версии

Не реализовано: ML/суррогатные модели (Optuna,
CatBoost/XGBoost), полноценное сравнение сценариев (Compare), произвольный
scenario editor для отказов и архитектуры (optimizer меняет только выбранные
RAAN/phase в derived-копии), сохранение расчётов в БД (runs хранятся в памяти
процесса), аутентификация и роли пользователей. Monte Carlo стресс-тест
(см. выше) — не оценка вероятности отказа (в кейсе нет таких данных), а
синтетический перебор случайных комбинаций из K одновременно отказавших
аппаратов; подробности и ограничения — в
[docs/resilience-analysis.md](docs/resilience-analysis.md).

## Следующий этап

1. Накопление exact dataset для проверки surrogate-модели.
2. Интерактивное добавление отказов.
3. Сравнение конфигураций.
4. Exhaustive N-3 только при отдельном обосновании бюджета.
