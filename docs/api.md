# API

## Configuration optimization

`POST /api/v1/optimization/run` принимает `scenario_id`, mode
`normal|robust|constrained_robust`, `stress_profile_ids`, `variable_parameters`,
optional bounds, routing strategy, budget 1–500, seed, algorithm
`random|differential_evolution`, initial exploration size, `stop_on_target`
и `polish`. Ответ `202` содержит `run_id`; исходный scenario не меняется.

`constrained_robust` требует, чтобы `scenario_id` входил в
`stress_profile_ids` (это и есть штатный профиль) вместе минимум с одним
деградированным — иначе `422`. Кандидат, не достигающий
`target_availability` в штатном профиле, гарантированно ранжируется хуже
любого достигающего (это встроено в саму шкалу оценки, не отдельная
проверка); среди допустимых максимизируется худшая доступность по
остальным профилям. См. обоснование и реальный прогон в
[design-decision.md](design-decision.md).

`GET /api/v1/optimization/{run_id}` возвращает `queued|running|completed|failed`,
реальные `evaluated/budget`, текущую best worst availability и ошибку при
наличии. `GET .../{run_id}/result` после completion возвращает baseline, best,
top-10, `pareto_front` (кандидаты, не доминируемые ни одним другим
оценённым по всем четырём objectives одновременно), convergence, cache
stats, exact revalidation count, рекомендацию и derived scenario. До
завершения ответ 409.

`GET .../{run_id}/dataset?format=jsonl|csv` экспортирует evaluated
configuration × stress-profile с углами, ISL/failure context и exact labels.

## Deployment planner / minimum constellation size

`POST /api/v1/optimization/deployment-plan/run` принимает `scenario_id`,
`routing_strategy`, `stage_sizes` (список интересующих размеров, по
умолчанию `[16, 32, 48]`), `refine_budget` (0 — без RAAN/phase поиска
после выбора состава), `refine_seed`, и опциональный `max_search_size`
(по умолчанию — весь флот; ограничивает жадный проход, если не нужна
гарантия для minimum-constellation-size). Ответ `202` с `run_id`.
`422`, если `stage_sizes` больше числа спутников в сценарии или больше
`max_search_size`.

Один жадный проход (`O(n²)` точных 720-шаговых симуляций — 1128 для
n=48, см. [deployment-planner.md](deployment-planner.md)) отвечает сразу
на оба вопроса: `GET .../deployment-plan/{run_id}/result` возвращает
`stages` (запрошенные размеры с составом/метриками, опционально
уточнёнными RAAN/phase), `size_curve` (полная кривая worst-availability
по размеру — то, что уже посчитано), `minimum_constellation_size` (первый
размер, где достигнут `target_availability`, либо `null`) и
`search_capped`/`searched_up_to_size`, честно показывающие, если проход
был ограничен и `minimum_constellation_size: null` может означать «не
найдено в исследованном диапазоне», а не «недостижимо вовсе».
`GET .../deployment-plan/{run_id}` — статус job (тот же async-паттерн,
что у `/optimization/run`).

## Threshold verification

`POST /api/v1/optimization/threshold-verification/run` — независимая от
жадного порядка добавления проверка конкретных размеров группировки
(`sizes`, `max_passes` для swap-refinement). Асинхронный job, тот же
паттерн, что у deployment-plan. `GET .../threshold-verification/{run_id}/result`
возвращает `points` (жадный/уточнённый worst для каждого N, применённые
обмены, `target_feasible`), `marginal_gain_curve`,
`greedy_only_minimum_size`, `first_verified_pass_size`. См.
[design-threshold-verification.md](design-threshold-verification.md) —
почему это НЕ доказательство глобального оптимума.

## ISL sensitivity

`POST /api/v1/optimization/isl-sensitivity` — синхронный точный sweep по
сетке `isl_values_km` (плюс опциональное уточнение `refine`/
`refine_step_km`), находит минимальную дальность межспутниковой линии,
при которой `worst_availability` достигает target. Возвращает
`coarse_points`, `refined_points`, `minimum_isl_range_km`,
`minimum_isl_found`. См. [isl-sensitivity.md](isl-sensitivity.md).

## Failure threshold

`POST /api/v1/resilience/failure-threshold/n2` принимает scenario или
`scenario_id`, интервал и routing strategy. Ответ содержит число реально
проверенных сочетаний, threshold, число target-breaking pairs, first break,
top-20, N-1/top-10 correlation, pair metrics и runtime. Для 48 активных
аппаратов `combinations_evaluated` обязан быть 1128.

Базовый адрес: `http://localhost:8000`, префикс `/api/v1`.

Интерактивная документация (Swagger UI): http://localhost:8000/docs

## Сравнение (`/comparisons`)

`POST /api/v1/comparisons` принимает `run_ids` (2–10 уже завершённых
`simulations/run`) и опциональный `baseline_run_id` (по умолчанию — первый
из `run_ids`). Требует одинаковых `step_s`/`horizon_s` у всех запусков,
иначе `422`; неизвестный `run_id` — `404`. Ответ: `baseline_run_id` и
`variants[]`, каждый с `changed_parameters` (рекурсивный diff конфигурации
относительно baseline), `metrics` по клиентам (доступность, перерыв,
переходы, смены маршрута, `target_achieved`, средний и P5 запас узкого
места), `worst_availability_percent`/`worst_availability_delta_pp`,
`target_status` и `deltas_from_baseline`. Не включает N‑1/N‑2/Monte Carlo —
эти анализы не привязаны к конкретному `run_id` (см.
[resilience-analysis.md](resilience-analysis.md)), показывать для них
нули означало бы утверждать то, что не считалось.

## Служебные эндпоинты

### GET `/health`

Проверка работоспособности.

```json
{ "status": "ok", "service": "nord48-api" }
```

### GET `/info`

Название проекта, версия API, окружение.

```json
{ "name": "NORD-48", "api_version": "v1", "environment": "development" }
```

## Сценарии

### GET `/scenarios/examples`

Список 4 исходных сценариев с краткими параметрами.

**Пример ответа** (сокращённо):

```json
[
  {
    "id": "01_full_constellation",
    "title": "Полная группировка",
    "launch_stage": 3,
    "altitude_km": 550.0,
    "isl_range_km": 3000.0,
    "target_availability": 0.9,
    "failure_count": 0,
    "gateway_outage_count": 0
  }
]
```

### GET `/scenarios/examples/{scenario_id}`

Полный провалидированный JSON одного исходного сценария.
`404`, если `scenario_id` неизвестен.

### POST `/scenarios/upload`

Multipart-загрузка файла сценария (поле `file`). Проверяет структуру
(Pydantic-схема) и бизнес-правила (`geometry.validate()`), возвращает
сценарий без изменений. `422`, если JSON битый, не соответствует схеме
или не проходит проверку организаторов.

## Расчёты (`/simulations`)

Расчёты хранятся **в памяти** процесса backend — персистентности в БД
пока нет (см. [architecture.md](architecture.md)).

### POST `/run`

Запуск расчёта.

**Параметры тела запроса:**

| Поле | Тип | Обязательное | Описание |
| --- | --- | --- | --- |
| `scenario_id` | string | одно из двух | id исходного сценария |
| `scenario` | object | одно из двух | сценарий целиком (например, из ответа `/scenarios/upload`) |
| `routing_strategy` | `"minimum_hops"` \| `"minimum_distance"` \| `"maximum_margin"` \| `"maximum_persistence"` | нет, по умолчанию `minimum_hops` | стратегия маршрутизации |

**Пример запроса:**

```json
{ "scenario_id": "01_full_constellation", "routing_strategy": "minimum_hops" }
```

**Пример ответа** (сокращённо):

```json
{
  "run_id": "6af65bf8-...",
  "scenario_id": "01_full_constellation",
  "routing_strategy": "minimum_hops",
  "step_s": 120,
  "horizon_s": 86400,
  "n_steps": 720,
  "client_ids": ["C65", "C70", "C72"],
  "gateway_ids": ["G_MUR"],
  "metrics": {
    "C65": { "availability_percent": 96.6667, "target_achieved": true, "...": "..." }
  }
}
```

### GET `/{run_id}`

Сводка расчёта — тот же формат, что и ответ `POST /run`.

### GET `/{run_id}/metrics`

Только метрики по клиентам.

### GET `/{run_id}/snapshot?t_s=21600`

Состояние сети в момент `t_s`: спутники (с широтой/долготой/высотой для
визуализации), типизированные рёбра (`isl` / `ground_contact`), наземные
пункты и маршрут каждого клиента в этот момент.

### GET `/{run_id}/route?client_id=C70&t_s=21600`

Маршрут одного клиента в момент времени: путь, число переходов,
дальность — либо причина отсутствия маршрута.

**Пример ответа:**

```json
{
  "t_s": 21600,
  "client_id": "C70",
  "gateway_id": "G_MUR",
  "strategy": "minimum_hops",
  "path": ["C70", "S09", "G_MUR"],
  "hops": 2,
  "total_distance_km": 3485.46,
  "bottleneck_margin": 0.0114,
  "bottleneck_edge": ["S09", "G_MUR"],
  "route_lifetime_steps": 3,
  "route_lifetime_s": 360,
  "route_valid_until_s": 21960,
  "persistence_horizon_s": null,
  "visible": true,
  "available": true,
  "diagnostic_reason": null,
  "diagnostic_checks": null
}
```

`bottleneck_margin`/`bottleneck_edge` — запас самого слабого звена
ВЫБРАННОГО пути (в `[0, 1]`) и сама эта пара узлов; считается для всех
трёх стратегий как дешёвый диагностический проход по уже построенному
пути, а не отдельная симуляция (см.
[calculation-model.md](calculation-model.md#margin-и-maximum_margin)).

Lifetime-поля optional для обратной совместимости и показывают, сколько
проживёт **этот же путь** без перестроения. `persistence_horizon_s` равен
`null`: exact поиск выполнен до конца доступного расчётного периода.

Если маршрута нет: `path: []`, `available: false`,
`diagnostic_reason` — одна из `NO_VISIBLE_SATELLITE`,
`NO_GATEWAY_CONTACT`, `GATEWAY_OUTAGE`, `ISL_NETWORK_SPLIT` (см.
[calculation-model.md](calculation-model.md#диагностика)).

### GET `/{run_id}/timeline`

По каждому клиенту и каждому шагу: `t_s`, `visible`, `available`,
`route_hops`, `diagnostic_reason`. Компактный формат — используется
frontend для временной шкалы без повторной загрузки полных снапшотов.

### GET `/{run_id}/export`

Полный результат: `schema_version: "cosmo-A-result-1.0"`,
`effective_scenario`, запись маршрута на каждую пару время × клиент,
сводка метрик.

## Устойчивость (`/resilience`)

### POST `/resilience/monte-carlo`

Monte Carlo стресс-тест: `iterations` независимых испытаний, в каждом
случайно (без повторов, `numpy.random.default_rng(seed)`) выбираются
ровно `failed_satellites_count` аппаратов из числа доступных на этапе
развёртывания сценария и считаются недоступными **весь** расчётный
горизонт; для каждой запрошенной стратегии — полный точный прогон (не
приближение). Подробное объяснение подхода и его границ — в
[resilience-analysis.md](resilience-analysis.md).

**Параметры тела запроса:**

| Поле | Тип | Обязательное | Описание |
| --- | --- | --- | --- |
| `scenario_id` | string | одно из двух со `scenario` | id исходного сценария |
| `scenario` | object | одно из двух | сценарий целиком |
| `failed_satellites_count` | int ≥ 0 | да | K — число одновременно отказавших аппаратов |
| `iterations` | int, 1–1000 | нет, по умолчанию 100 | число случайных испытаний |
| `seed` | int | нет, по умолчанию 42 | seed генератора случайных чисел |
| `strategies` | список стратегий | нет, по умолчанию все три | какие стратегии сравнивать |
| `clients` | список id | нет, по умолчанию все клиенты сценария | какие пункты анализировать |

Если `failed_satellites_count` больше числа доступных аппаратов, K
ограничивается их числом — в ответе `parameters.failed_satellites_count`
(фактическое) отличается от `parameters.requested_failed_satellites_count`
(запрошенное).

**Пример ответа** (сокращённо):

```json
{
  "scenario_id": "01_full_constellation",
  "parameters": {
    "failed_satellites_count": 5,
    "requested_failed_satellites_count": 5,
    "iterations": 100,
    "seed": 42,
    "candidate_satellite_count": 48
  },
  "strategies": [
    {
      "strategy": "minimum_hops",
      "per_client": [
        { "client_id": "C65", "mean": 0.94, "p05": 0.83, "p50": 0.95, "p95": 1.0,
          "target_success_fraction": 0.78, "mean_max_outage_s": 612.0 }
      ],
      "mean_worst_client_availability": 0.91,
      "p05_worst_client_availability": 0.77,
      "all_clients_target_fraction": 0.71
    }
  ],
  "recommended_strategy": "minimum_hops",
  "recommended_reason": "доля экспериментов, где все пункты достигли цели: 71.0%",
  "worst_trial": {
    "failed_satellites": ["S03", "S11", "S22", "S30", "S41"],
    "worst_client_id": "C70",
    "worst_client_availability": 0.62,
    "diagnostic_breakdown": { "NO_VISIBLE_SATELLITE": 12, "ISL_NETWORK_SPLIT": 3 }
  },
  "best_trial": { "...": "..." }
}
```

`recommended_strategy` — не заранее заданный выбор: детерминированное
правило (без ML) по фактически посчитанным `strategies[*]`, см.
[resilience-analysis.md](resilience-analysis.md#правило-выбора-стратегии).

### POST `/resilience/routing-analysis`

Точное детерминированное сравнение стратегий на всех snapshot сценария:

```json
{ "scenario_id": "04_link_range" }
```

Можно передать `scenario` вместо `scenario_id` и optional `strategies`. Ответ
содержит `rows` для каждой пары strategy × client с lifetime, margin, hops,
route changes, availability и max outage, а также прозрачную рекомендацию.
`lifetime_sample: "route_segments"` фиксирует отсутствие double counting.

### POST `/resilience/failure-analysis`

Derived failure experiment. Исходный scenario не изменяется.

```json
{
  "scenario_id": "01_full_constellation",
  "satellite_ids": ["S14"],
  "failure_start_s": 21600,
  "failure_end_s": 64800,
  "routing_strategy": "minimum_hops"
}
```

Интервал полуоткрытый `[start, end)`. Ответ содержит metadata, `clients` с
baseline/failed/delta, `affected_clients`, PASS→FAIL `target_violations`,
induced-only `diagnostic_distribution`, disruption metrics и две timeline.

### POST `/resilience/criticality/n1`

```json
{
  "scenario_id": "01_full_constellation",
  "analysis_start_s": 0,
  "analysis_end_s": 86400,
  "routing_strategy": "minimum_hops"
}
```

Возвращает лексикографически отсортированный `ranking` активных аппаратов и
инженерную `recommendation`. `analysis_end_s` optional: по умолчанию конец
scenario horizon. Geometry baseline рассчитывается один раз.

### POST `/resilience/redundancy`

```json
{ "scenario_id": "01_full_constellation", "routing_strategy": "minimum_hops" }
```

Для каждого клиента и каждого шага с активным маршрутом проверяет, есть
ли независимый резервный путь (промежуточные спутники основного пути
удаляются, ищется второй маршрут). Возвращает `clients` —
`no_route_percent` + `single_path_percent` + `backup_path_percent` = 100
на клиента, три раздельных числа, не единая оценка. См.
[network-redundancy.md](network-redundancy.md).

## Экономика (`/economics`)

`POST /api/v1/economics/estimate` — чистая арифметика, без пересчёта
сценария. Принимает `satellite_count`, `total_satellites`,
`launch_batches_used` и ОПЦИОНАЛЬНО `satellite_unit_cost_rub` (плюс
`launch_fixed_cost_rub`, `launch_capacity_satellites`,
`integration_cost_rub`, `reserve_percent`, `source_label`). Без
`satellite_unit_cost_rub` — `mode: "resource_only"`, `cost: null`: ни
одного встроенного значения цены. С ним — `mode: "cost"`, `cost` содержит
разбивку (спутники/пуски/интеграция/резерв/итого) и, если передан
`worst_availability_percent`, `cost_per_availability_point_rub`. См.
[cost-effectiveness.md](cost-effectiveness.md) и
[cost-sources.md](cost-sources.md).

## Ошибки

Доменные исключения превращаются в HTTP-ответы глобальными обработчиками
в `app/main.py`:

| Исключение | HTTP-статус | Когда |
| --- | --- | --- |
| `ScenarioNotFoundError` | 404 | неизвестный `scenario_id` |
| `SimulationNotFoundError` | 404 | неизвестный `run_id` |
| `InvalidScenarioError` | 422 | битый JSON, несоответствие схеме или отказ `geometry.validate()` |

Формат ответа с ошибкой: `{"detail": "текст ошибки"}`.

## Пока не реализовано

Все зарегистрированные роутеры реализованы. Результаты optimization jobs,
сохранённые варианты и запуски симуляций живут только в памяти
процесса/сессии браузера — ничего не сохраняется в БД (см. корневой
README, раздел «Ограничения»).
