# Robust Design Search 2.0

Зона ответственности этого документа: RAAN/phase поиск конфигурации,
устойчивой к деградированным условиям (Outages, ISL2000), при сохранении
штатного target ≥90%. НЕ про число спутников (см.
docs/design-threshold-verification.md — зона другого участника команды),
НЕ про min-cut/connectivity margin (отдельная зона), НЕ про ML.

## Goal

Найти конфигурацию (RAAN/phase трёх плоскостей, 48 спутников без
изменений в составе), которая при штатной доступности ≥90% для каждого
клиента заметно лучше существующего проверенного кандидата (Denis
Optimum, min(Outages, ISL2000) = 64,17%) работает именно в деградированных
условиях — не очередное `99.1% → 99.5%` в штатном режиме.

## Objective (каноническая, не произвольный weighted score)

Lexicographic, реализовано как `robust_design_scalar`/`robust_design_rank_key`
(`backend/app/calculation/optimization/configuration.py`):

1. **Gate 1**: каждый клиент в штатном профиле ≥ target_availability (90%).
2. **PRIMARY**: максимизировать `min(Outages_worst, ISL2000_worst)` —
   отдельно по профилям, не смешивая клиентов двух профилей в один пул
   (хотя математически для ровно двух деградированных профилей это даёт
   тот же результат, что и пул — см. `robust_primary_metric`).
3. **SECONDARY**: максимизировать `min(Outages_mean, ISL2000_mean)`.
4. **THIRD**: минимизировать `worst_max_outage_s`.
5. **FOURTH** (backup-path availability) — НЕ встроен в rank_key самого
   поиска (потребовал бы redundancy-анализа на каждого кандидата — слишком
   дорого при budget в сотни кандидатов); применяется отдельно, только к
   финалистам (см. «Search pipeline» ниже).
6. **FIFTH**: минимизировать отклонение параметров от baseline.
7. Финально — канонический tuple параметров, только для детерминизма.

Gate 2 (N-1 PASS) — жёсткий инженерный gate, применяется ПОСЛЕ поиска при
выборе рекомендации (см. «Recommendation rule»), не во время самого DE-поиска
(N-1 стоит 48 дополнительных точных расчётов на кандидата — недопустимо
дорого запускать на каждой итерации).

## Search space

RAAN/phase всех ТРЁХ орбитальных плоскостей (P1/P2/P3 — 6 параметров),
48 спутников без изменений в составе (deployment planner / threshold
verification — другая, уже занятая зона команды, не трогалась).
Отличие от исторического `Constrained Robust Optimum`: тот эксперимент
фиксировал P1 и искал только по P2/P3 (4 параметра); в этом поиске P1
тоже варьировался — само по себе объясняет часть найденного улучшения
(см. «Why it improved»).

## Fast Exact Evaluator — исследовано, НЕ используется в поиске

**Идея** (раздел 6 задания): для фиксированного RAAN/phase позиции
спутников, попарные ISL-расстояния и наземные elevation НЕ зависят от
`isl_range_km`/`failures`/`launch_stage` — эти поля влияют только на то,
какие из уже вычисленных контактов ВКЛЮЧЕНЫ в граф. `evaluate_configuration`
пересчитывает геометрию С НУЛЯ для каждого из 3 профилей (Normal/Outages/
ISL2000) одного и того же кандидата — избыточно.

**Реализация**: `backend/app/calculation/optimization/precomputed_evaluator.py`
— вызывает `reference_geometry.positions()` (БЕЗ ИЗМЕНЕНИЙ, импортируется
как есть) один раз на снимок, самостоятельно воспроизводит формулы
`reference_geometry.snapshot()` для попарных ISL-дистанций/видимости
(та же математика, тот же порядок операций), затем применяет только
дешёвые булевы маски (`active`, порог дальности, порог elevation) —
без повторного пересчёта позиций/расстояний.

**Exact equivalence — ПОДТВЕРЖДЕНА**: `tests/unit/test_precomputed_evaluator.py`
— 39 тестов, включая все 4 исходных сценария, 10 случайных RAAN/phase,
10 случайных наборов отказов, 7 значений `isl_range_km`, 3 значения
`launch_stage`, gateway outage, и полное сравнение client-metrics (не
только графов) по всем 4 routing strategies — 100% совпадение (ноль
допущенных отличий сверх float-погрешности `1e-9`).

**Benchmark**: 20 повторов полной 3-профильной оценки (`Normal+Outages+
ISL2000`, `minimum_hops`), тёплый старт:

| | Время на 1 оценку |
| --- | --- |
| Canonical (`build_graph_timeline` ×3) | 1321 мс |
| Precomputed (геометрия ×1 + 3 дешёвые маски) | 1021 мс |
| **Speedup** | **1.29×** |

**Решение: НЕ используется в поиске.** Порог из задания — `<1.5x, не
усложнять архитектуру» — не преодолён. Причина потолка: экономится только
доля времени на пересчёт позиций/дистанций/elevation; построение
`networkx.Graph` и сама маршрутизация (BFS/Dijkstra на 720 шагах ×
3 клиента × 3 профиля) — irreducible, занимают бóльшую часть времени и
идентичны в обоих путях. Честный отрицательный результат по разделу 9-10
задания: модуль корректен и протестирован, но НЕ подключён к
`robust_design` поиску — весь поиск этого этапа выполнен canonical
`evaluate_configuration`.

## Failure overlay / cache safety (раздел 43-44 задания)

Специально перепроверено (`tests/unit/test_evaluate_configuration_safety.py`):
`apply_plane_parameters` (используется этим поиском) НИКОГДА не трогает
`failures` — только `design.planes` углы; `EvaluationCache.key()` хэширует
ПОЛНЫЙ payload всех профилей сразу (`scenario_signature`), поэтому Normal
не может быть случайно переиспользован для Outages/ISL2000 — разные
профили с одинаковыми параметрами получают РАЗНЫЕ cache-записи (проверено
явным тестом: 2 промаха на 2 разных набора профилей, 1 попадание при
повторе того же набора). Класс ошибки, ранее найденный в
`deployment_planner.active_subset_scenario` (другой, не тронутый в этой
сессии модуль) здесь структурно не воспроизводим.

## Search pipeline (фактически выполненный прогон)

Все шаги — реальный прогон (не только код/тесты), `minimum_hops`,
`evaluate_configuration` (canonical, exact на каждом шаге):

1. **Multi-start** (6 seeds, budget по seed):
   `baseline` (budget 100), `Denis` (budget 100, параметры из
   `NORD48-denis/data/scenarios/variants/01_full_constellation_optimized.json`),
   `current_normal_optimum` (budget 100 — предварительно ЗАНОВО найден
   этим же exact-поиском по normal-only профилю, budget=100 seed=42, а
   не взят из markdown), `random_101`/`random_202`/`random_303` (budget 60
   каждый, детерминированные случайные старты).
2. **Refine 1**: лучший найденный (`random_202`) — ещё 200 эволюций
   (budget=200, новый seed).
3. **Refine 2**: контрольный повторный прогон 200 эволюций от
   результата шага 2 другим seed — сошёлся к ТОЙ ЖЕ точке побайтово
   (сильный сигнал локального оптимума, не случайность одного прогона).
4. **Top candidate** (лучший из 880 реально оценённых кандидатов по
   `robust_design_rank_key` — проверено явно, см. ниже) → exact N-1 →
   exact N-2 → redundancy → outage quality → recovered/lost steps.

Budget подобран после короткого прогона (раздел 49): один кандидат ≈
1,0–1,3 с, поэтому 880 кандидатов ≈ 15-17 минут суммарно — не запускалось
вслепую на часы.

## Validation результаты (winner)

| | Baseline | Denis | **Winner** |
| --- | --- | --- | --- |
| Normal worst | 96,67 % | 99,86 % | **96,53 %** |
| Outages worst | 79,31 % | 81,53 % | **82,64 %** |
| ISL2000 worst | 62,22 % | 64,17 % | **67,78 %** |
| min(Outages, ISL2000) | 62,22 % | 64,17 % | **67,78 % (+3,61 пп к Denis)** |
| N-1 | PASS | PASS | **PASS** (S27, −2,36 пп, 0 нарушений) |
| N-2 | PASS | PASS | **PASS** (0/1128 нарушающих пар; худшая S17+S18 → 91,39%) |
| Backup path (среднее) | 28,1 % | — | **30,05 %** |
| Худший перерыв (normal) | 480 с | 120 с | **360 с** |

Per-client (normal/outages/isl2000), точный пересчёт baseline vs winner:

| Профиль | Клиент | Baseline | Winner | Δ пп |
| --- | --- | --- | --- | --- |
| Normal | C65 | 96,67 % | 96,53 % | −0,14 |
| Normal | C70 | 98,75 % | 98,75 % | 0,00 |
| Normal | C72 | 98,89 % | 99,44 % | +0,56 |
| Outages | C65 | 79,31 % | 82,78 % | +3,47 |
| Outages | C70 | 80,83 % | 83,33 % | +2,50 |
| Outages | C72 | 82,50 % | 82,64 % | +0,14 |
| ISL2000 | C65 | 77,50 % | 75,28 % | **−2,22** |
| ISL2000 | C70 | 62,22 % | 68,61 % | +6,39 |
| ISL2000 | C72 | 65,14 % | 67,78 % | +2,64 |

**Честно**: в ISL2000 C65 становится немного хуже (−2,22 пп) — это
целенаправленный компромисс объективной функции: она максимизирует
ХУДШЕГО клиента (в baseline это был C70 при 62,22%), а не среднее по всем
трём. Улучшение худшего (C70, +6,39 пп) обошлось небольшой платой для
клиента, у которого и так был большой запас. Это ожидаемое и корректное
поведение min-ориентированной цели, не побочный эффект/баг.

### Outage quality (winner, normal профиль)

| Клиент | Событий | Медиана | P95 | Max |
| --- | --- | --- | --- | --- |
| C65 | 21 | 120 с | 240 с | 360 с |
| C70 | 9 | 120 с | 120 с | 120 с |
| C72 | 4 | 120 с | 120 с | 120 с |

## Why it improved

### Geometry difference (только реально изменённые параметры)

| Плоскость | RAAN: baseline → winner | Phase: baseline → winner |
| --- | --- | --- |
| P1 | 0,00° → 104,47° | 0,00° → 303,80° |
| P2 | 60,00° → 226,29° | 7,50° → 248,00° |
| P3 | 120,00° → 159,35° | 15,00° → 241,56° |

Все шесть параметров изменены существенно — это НЕ тонкая подстройка,
а другая геометрия. Важное отличие от исторического «Constrained Robust
Optimum»: тот эксперимент фиксировал P1 (искал только по P2/P3); этот
поиск варьировал P1 тоже — часть найденного улучшения объясняется just
бо́льшим пространством поиска, не только более точной целевой функцией.

### Time-local recovered/lost steps (`robust_explainability.py`)

Для каждого профиля посчитано, сколько 120-секундных шагов winner
восстановил связность там, где у baseline её не было, и наоборот
(reused `RouteRecord.diagnostic_reason` — новых диагностических категорий
не вводилось):

| Профиль | Recovered | Lost | Net | Главная причина recovery |
| --- | --- | --- | --- | --- |
| Outages | 44 040 с | 38 760 с | **+5 280 с** | `NO_VISIBLE_SATELLITE` |
| ISL2000 | 63 600 с | 57 720 с | **+5 880 с** | `ISL_NETWORK_SPLIT` |

`ISL_NETWORK_SPLIT` как доминирующая причина восстановления в ISL2000
физически осмысленна: новая геометрия создаёт межспутниковые «мосты»,
которые не разрываются при обрезании дальности ISL до 2000 км там, где
у baseline сеть раскалывалась на компоненты.

По клиентам в ISL2000: C65 имеет ОТРИЦАТЕЛЬНЫЙ net recovery (−1920 с) —
согласуется с его availability delta (−2,22 пп) выше; C70 (+5520 с) и
C72 (+2280 с) — основные бенефициары.

## Acceptance Matrix / Summary integration

- `frontend/src/lib/acceptance-reference.ts` — новая строка «Recommended
  Robust (Design Search 2.0)» в уже существующем массиве
  `REFERENCE_ACCEPTANCE_ROWS» (тот же паттерн, что Baseline/Denis/
  Constrained Robust Optimum — верифицированные числа записаны один раз,
  не пересчитываются на каждой загрузке страницы). Matrix не переписана.
- `frontend/src/components/summary/robust-design-highlight.tsx` — один
  компактный card на Summary (не новый большой блок), со ссылкой на
  Optimizer.
- `frontend/src/components/optimizer/optimizer-workspace.tsx` — новый
  режим `mode=robust_design` («Устойчивый поиск 2.0») в уже существующем
  Select оптимизатора — расширение constrained_robust-подобного UI, не
  новая страница/route.
- Backend: `mode=robust_design` полностью проведён через существующую
  async-job инфраструктуру (`optimization_service.py`,
  `POST /api/v1/optimization/run`) — 0 новых эндпоинтов, только новое
  допустимое значение уже существующего поля `mode` + опциональное поле
  `degraded_profile_ids`, вычисляемое на бэкенде из уже существующего
  `stress_profile_ids`.

## Local sensitivity (one-factor-at-a-time, ±1°/±2°/±5°)

Bounded, cheap research (37 exact evaluations, no new global search) to
numerically distinguish "flat" from "sharp" around the winner — a
qualitative claim like "robust to small errors" needs a number, not just
the word. For each of the 6 RAAN/phase parameters, one factor was
perturbed at a time (the other 5 held fixed at the winner's values), and
`min(Outages, ISL2000)` (the same primary objective the search itself
optimizes) was measured at each perturbation.

| Perturbation | Max RAAN degradation | Max phase degradation |
| --- | --- | --- |
| ±1° | −0.42 пп | −3.33 пп |
| ±2° | −0.83 пп | −6.81 пп |
| ±5° | −1.94 пп | −15.69 пп (P3.phase_deg −5° → 52.08%, vs winner's 67.78%) |

**Conclusion**: the winner is a **flat local optimum along RAAN** (small
pointing/deployment errors in RAAN barely move the degraded objective —
even ±5° costs under 2 percentage points) but a **sharp local optimum
along phase**, especially `P1.phase_deg`/`P3.phase_deg` (±1° already
costs over 3 percentage points, ±5° can lose 15+). Engineering
implication: RAAN precision is not operationally critical for this
design, but phase (in-plane slot positioning) needs to be maintained
close to the found values — a deployment/maintenance tolerance budget
should weight phase accuracy higher than RAAN accuracy.

N-1/N-2 were NOT re-run for all 37 perturbed points (too expensive for a
bounded sensitivity pass) — this sensitivity is scoped to the
Normal/Outages/ISL2000 objective only, not a claim about N-1/N-2 margin
under perturbation. Reproducible via
`data/results/robust_2_0_sensitivity.json` (git-ignored results
directory) using `evaluate_configuration` with the winner's parameters ±
the deltas above — no new script added to `scripts/`, methodology
described here is sufficient to reproduce.

## Robust 3.0 research attempt — negative result

A follow-up R&D pass tried to beat this winner further, to check whether
it was a genuine local optimum or just the best the original search
budget happened to find.

**Method**: local pattern search (coordinate-wise Hooke-Jeeves, scales
20°→10°→5°→2°→1°, 133 evaluations) starting from the winner above, plus
6 independent multi-start toroidal-DE runs (budgets 100 and 250, seeds
1/7/42) using the exact same `robust_design_scalar`/`robust_design_rank_key`
objective — 848 unique exact evaluations total (an `EvaluationCache`
collapsed 365 repeated parameter tuples). The toroidal-DE runs alone never
beat the winner (best found: primary metric 69.3% at budget 250); the
local pattern search did, reaching ~71.7% by shifting P1's RAAN from
104.47° to ~119.47° (P2/P3 essentially unchanged).

**Why it does not replace the winner**: the top 5 pattern-search
candidates were re-checked with the same exact tools used everywhere
else (`run_n1_criticality`, `run_exact_n2`, `run_redundancy_analysis`,
`compute_daily`), not trusted on the research-only objective alone. All
5 **fail both exact N-1 and exact N-2** — e.g. candidate 1's worst
single-satellite failure drops a client to 87.64% (target 90%, current
winner: 94.17%), and its worst pair drops one to 84.58% (winner: 91.39%).
The same RAAN shift that raises `min(Outages, ISL2000)` from 67.78% to
~71-72% also **regresses Outages worst-case** from 82.64% to ~75-76% (a
real ~6-7pp trade-off the pooled-minimum objective does not see, since
ISL2000 stays the binding profile in both cases) and pushes the topology
into a geometry with materially less single/pair-failure margin. This is
exactly the scenario the staged exact-validation pipeline exists to
catch: a candidate that looks better on the search objective and on CVaR
(K10 CVaR@0.2 ~71% vs the winner's 70.05%) but violates the hard N-1/N-2
constraints once checked exactly.

**Conclusion**: Robust Design 2.0 (this document's winner) remains
Recommended. No Robust 3.0 candidate satisfying Normal≥90% + N-1 PASS +
N-2 PASS with a genuine, non-regressive improvement was found in this
search. Full exact-validation numbers:
`data/results/robust_3_research/stage_a_results.json` and
`stage_bc_exact_validation.json` (git-ignored results directory, not
tracked — reproducible from this methodology description, not shipped as
a script).

## Limitations

- Поиск не exhaustive — это DE + multi-start в ограниченном бюджете
  (880 кандидатов), не гарантированный глобальный оптимум. Формулировка
  везде: «лучший найденный», не «доказанный оптимальный».
- Fast evaluator корректен, но не быстрее порога — не используется;
  весь прогон выполнен canonical-путём (см. выше).
- min(Outages, ISL2000) = 67,78% — заметное улучшение относительно
  Denis (64,17%), но всё ещё далеко от target ≥90% в деградированных
  условиях — ни один найденный кандидат (за все этапы проекта) не
  приближается к этому порогу одной лишь RAAN/phase-фазировкой; это
  структурное ограничение геометрии/дальности ISL, а не недостаток
  поиска (см. также docs/design-decision.md).
- Trade-off по C65 в ISL2000 (−2,22 пп) — честно показан, не скрыт;
  альтернативные точки с более равномерным распределением между
  клиентами в датасете существуют (например, `random_202`, primary
  66,53%), но хуже по главному критерию (min по клиенту, не по среднему).
- N-1/N-2 посчитаны точно ТОЛЬКО для итогового winner (не для каждого из
  880 кандидатов — слишком дорого, что и обосновывает staged pipeline).
  Backup-path/outage-quality — аналогично, только для winner.
- Baseline/Denis N-1/N-2 переиспользованы из уже существующих точных
  прогонов текущего проекта (не пересчитывались заново в этой сессии —
  дёшево было бы пересчитать, но не было расхождений, дающих повод
  сомневаться в уже верифицированных числах).
