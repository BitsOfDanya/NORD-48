# API

Базовый адрес: `http://localhost:8000`, префикс `/api/v1`.

Интерактивная документация (Swagger UI): http://localhost:8000/docs

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
| `routing_strategy` | `"minimum_hops"` \| `"minimum_distance"` \| `"maximum_margin"` | нет, по умолчанию `minimum_hops` | стратегия маршрутизации |

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

Роутеры `/comparisons` и `/optimization` зарегистрированы, но не содержат
эндпоинтов — см. корневой README, раздел «Ограничения текущей версии».
