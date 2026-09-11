# Анализ отказов и критичности N-1

## Семантика Failure Injection

Failure Lab не изменяет исходный JSON и не обращается к собственной модели
физики. Для интервала `[failure_start_s, failure_end_s)` создаётся derived
timeline графов: только затронутые snapshot копируются, после чего из копии
удаляются выбранные satellite nodes и все их ISL/ground edges. Положение
спутника по-прежнему существует в reference geometry, но аппарат не может
участвовать в маршруте. Baseline-графы и сценарий не мутируются.

## Baseline и experiment

Baseline и failed variant проходят одинаковый routing pipeline. Для каждого
клиента возвращаются availability, visibility, max outage, route changes,
mean hops, время без связи и target status. Delta имеет направление
`failed − baseline`; поэтому ущерб availability отображается отрицательным
числом percentage points.

Baseline outage считается отдельно. Failure-induced outage — только snapshot,
где baseline имел route, а failed variant его потерял. Только для этих snapshot
агрегируются `NO_VISIBLE_SATELLITE`, `NO_GATEWAY_CONTACT`, `GATEWAY_OUTAGE` и
`ISL_NETWORK_SPLIT`. Timeline API сохраняет оба availability-флага и отдельный
`failure_induced`.

## Методика N-1

Baseline geometry строится ровно один раз: 720 snapshot. Baseline routing также
считается один раз. Затем для каждого активного в analysis interval аппарата
создаётся single-node overlay и пересчитываются только routing, diagnostics и
metrics. Exhaustive N-2 не реализован: для 48 аппаратов это уже 1128 пар вместо
48 вариантов, до учёта интервалов и стратегий.

Метрики аппарата:

- `worst_client_availability_drop_pp` и `mean_availability_drop_pp`;
- `affected_clients_count` и список клиентов;
- `target_violations_count`;
- `max_outage_increase_s`;
- `additional_route_changes`;
- `failure_induced_outage_steps`.

Ranking лексикографический, без score и ML: больше target violations → больше
worst availability drop → больше max outage increase → больше affected clients
→ больше induced outage steps → satellite ID по возрастанию.

## Full constellation: фактический эксперимент

`01_full_constellation`, весь горизонт, `minimum_hops`, 48 аппаратов.

| Ранг | Аппарат | Плоскость | Target violations | Worst drop | Δ max outage | Пунктов | Induced steps |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | S44 | P3 | 0 | 2,361 п.п. | 240 с | 3 | 45 |
| 2 | S45 | P3 | 0 | 2,361 п.п. | 240 с | 3 | 43 |
| 3 | S33 | P3 | 0 | 2,361 п.п. | 240 с | 3 | 42 |
| 4 | S19 | P2 | 0 | 2,361 п.п. | 240 с | 3 | 41 |
| 5 | S02 | P1 | 0 | 2,222 п.п. | 360 с | 3 | 45 |

Для S44: C65 `96,667 → 94,306%`, C70 `98,750 → 96,806%`, C72
`98,889 → 96,944%`. Цель 90% сохраняется у всех клиентов, поэтому полный отказ
одного аппарата в этом сценарии не создаёт target violation. Средний worst drop
по 48 аппаратам — 1,962 п.п.; максимум — 2,361 п.п.

## ISL 2000: фактический эксперимент

`04_link_range`, весь горизонт, `minimum_hops`, 48 аппаратов.

| Ранг | Аппарат | Плоскость | Target violations | Worst drop | Δ max outage | Пунктов | Induced steps |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | S26 | P2 | 0 | 3,056 п.п. | 480 с | 3 | 47 |
| 2 | S27 | P2 | 0 | 2,917 п.п. | 720 с | 3 | 45 |
| 3 | S25 | P2 | 0 | 2,917 п.п. | 360 с | 3 | 48 |
| 4 | S20 | P2 | 0 | 2,778 п.п. | 360 с | 3 | 46 |
| 5 | S28 | P2 | 0 | 2,778 п.п. | 360 с | 3 | 43 |

Для S26 worst impact приходится на C72: `65,139 → 62,083%`, −3,056 п.п.
Baseline уже ниже 90%, поэтому `target_violations_count` равен нулю: метрика
считает переход PASS → FAIL, а не повторно маркирует существующий FAIL.

Снижение ISL range увеличило средний worst drop с 1,962 до 2,280 п.п., а
максимальный — с 2,361 до 3,056 п.п. Среднее число induced outage steps почти
не изменилось: 38,083 против 38,271. Поэтому гипотеза о большей чувствительности
подтверждается по величине потери availability, но не по частоте induced steps.

## Сравнение routing strategies

Для `01_full_constellation` rankings `minimum_hops` и
`maximum_persistence` совпали, включая первую десятку и лидера S44. Это
ожидаемый фактический результат: критерии ranking основаны на связности,
availability и outage, а обе полные routing strategies находят путь, если он
существует. Выбранный путь и churn могут различаться, но они не меняют основной
criticality ranking.

## Benchmark

Локальные последовательные прогоны, 720 шагов, 3 клиента:

| Эксперимент | Время |
| --- | ---: |
| Один спутник S14, full horizon, minimum_hops | 0,799 с |
| N-1, 48 спутников, minimum_hops | 16,925 с |
| N-1, 48 спутников, maximum_persistence | 46,446 с |
| N-1, ISL 2000, minimum_hops | 9,652 с |

Последние два N-1 прогона выполнялись параллельно, поэтому их время включает
конкуренцию за CPU; результаты metrics от этого не зависят.

## Ограничения

- Интервал дискретизируется snapshot с шагом 120 с; семантика `[start, end)`.
- Вероятность отказа не моделируется: это what-if и exhaustive N-1.
- Спутник, уже недоступный из-за исходного сценария, не становится «ещё более»
  недоступным; анализируются аппараты, активные хотя бы в одном snapshot
  заданного интервала.
- Quantile-цвета карты являются визуальной классификацией конкретного прогона,
  а не отраслевым стандартом.
- N-2 и optimizer не реализованы. Dataset результатов может быть входом для
  будущей оптимизации, но ML в анализе отказов не используется.
