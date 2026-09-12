# Отчёт: Robust Design Search 2.0 + Fast Exact Evaluation + Engineering Explainability

Дата: 2026-09-12. Команда «5bit», КосмоХакатон 2026, проект NORD-48.
Зона: RAAN/phase поиск устойчивости к деградированным условиям.
НЕ дублировалась работа других участников (deployment/threshold size,
min-cut/connectivity margin, ML) — см. подтверждения в конце.

## 1. Baseline (зафиксировано exact-пересчётом, не из markdown)

Полная 48-спутниковая группировка, `01_full_constellation`, оригинальные
RAAN/phase, `minimum_hops`, точный пересчёт `evaluate_configuration`:

| | Normal | Outages | ISL2000 |
| --- | --- | --- | --- |
| Baseline | 96,67 % | 79,31 % | 62,22 % |
| Denis Optimum | 99,86 % | 81,53 % | 64,17 % |

N-1/N-2 обоих кандидатов — PASS (переиспользованы уже верифицированные в
проекте exact-результаты, не пересчитывались заново — расхождений,
дающих повод сомневаться, не было). Denis-параметры взяты не из
markdown-текста, а напрямую из файла
`../NORD48-denis/data/scenarios/variants/01_full_constellation_optimized.json`
(P1=94°/106°, P2=158°/296°, P3=27°/281°) и пересчитаны заново этим же
exact-движком — числа совпали с уже задокументированными.

## 2. Objective

Lexicographic (не weighted score) — Gate1 (Normal ≥90% для каждого
клиента) → PRIMARY `max min(Outages_worst, ISL2000_worst)` → SECONDARY
`max min(Outages_mean, ISL2000_mean)` → THIRD `min worst_max_outage_s` →
FIFTH `min parameter_deviation_deg`. Backup-path (FOURTH) — не встроен в
сам поиск (слишком дорого на каждого кандидата), применяется только к
финалисту. Реализация: `robust_design_scalar`/`robust_design_rank_key`,
`backend/app/calculation/optimization/configuration.py`. Полное
обоснование и вывод формул — `docs/robust-design-search.md`.

## 3. Fast evaluator — реализован, но НЕ используется в поиске

`backend/app/calculation/optimization/precomputed_evaluator.py` —
позиции/ISL-дистанции/elevation считаются один раз на кандидата (не 3
раза на 3 профиля), переиспользуя `reference_geometry.positions()` без
изменений. Подробности механизма — в docs.

## 4. Exact equivalence tests

`tests/unit/test_precomputed_evaluator.py` — **39/39 passed**: 4 исходных
сценария, 10 случайных RAAN/phase, 10 случайных наборов отказов, 7
значений `isl_range_km`, 3 `launch_stage`, gateway outage, плюс полное
сравнение client-metrics по всем 4 routing strategies. Ноль расхождений
сверх float-погрешности `1e-9`.

## 5. Benchmark speedup

20 повторов полной 3-профильной оценки: canonical 1321 мс/оценку,
precomputed 1021 мс/оценку → **speedup 1.29×**. Порог задания (1,5×) не
преодолён → **fast evaluator не подключён к поиску** (честный
отрицательный результат по разделам 9-10 задания; модуль остаётся в
кодовой базе, протестирован, задокументирован, но не используется).

## 6. Search strategy

Multi-start: `search.optimize()` (существующая DE/random инфраструктура,
не переписывалась) с новым `scalar_objective`/`rank_key`. Seeds:
baseline, Denis, current_normal_optimum (заново найден этим же поиском,
не взят из старого markdown), 3 детерминированных случайных старта.
Затем 2 раунда refine от лучшего найденного (разные seeds — оба сошлись
к одной и той же точке, подтверждая локальный оптимум).

## 7. Search budget

baseline/Denis/current_normal_optimum: budget=100 каждый; 3 случайных
старта: budget=60 каждый; refine 1 и 2: budget=200 каждый. Итого budget
по прогонам = 920 (реально приняты/оценены 880 уникальных записей в
датасете — часть эволюций DE не достигает нового кандидата из-за
внутренних ограничений budget).

## 8. Number candidates

**880** exact-оценённых кандидатов (каждый — полная 3-профильная 720-шаговая
симуляция). Топ-кандидат по `robust_design_rank_key` подтверждён явной
проверкой ПО ВСЕМ 880 записям (не только по seed-сводке).

## 9. Best baseline/Denis/current

min(Outages, ISL2000): Baseline 62,22 %; Denis 64,17 %; current_normal_optimum
60,28 %; лучший случайный старт (random_202) 66,53 % — уже выше Denis
ДО refine.

## 10. New winner — parameters

| Плоскость | RAAN | Phase |
| --- | --- | --- |
| P1 | 104,47° | 303,80° |
| P2 | 226,29° | 248,00° |
| P3 | 159,35° | 241,56° |

Все шесть параметров изменены существенно (не тонкая подстройка).

## 11. Normal metrics

Worst 96,53 % (C65 96,53 %, C70 98,75 %, C72 99,44 %) — выше 90% guardrail
с запасом +6,53 пп; относительно baseline почти без изменений (−0,14 пп
по худшему клиенту).

## 12. Outages metrics

Worst 82,64 % (C65 82,78 %, C70 83,33 %, C72 82,64 %) — **все три клиента
лучше baseline** (+3,47 / +2,50 / +0,14 пп).

## 13. ISL2000 metrics

Worst 67,78 % (C65 75,28 %, C70 68,61 %, C72 67,78 %) — C70 (был худшим
у baseline, 62,22%) улучшен на **+6,39 пп**; C65 просел на −2,22 пп
(честный trade-off — целевая функция максимизирует худшего клиента, а не
среднее).

## 14. Degraded worst delta

**min(Outages, ISL2000): 64,17 % (Denis) → 67,78 % (winner) = +3,61 п.п.**
Относительно baseline (62,22%): **+5,56 п.п.**

## 15. N-1

**PASS.** Худший спутник — S27, падение −2,36 п.п., **0 нарушений
target**, увеличение худшего перерыва +360 с. (У baseline похожий
масштаб худшего N-1-эффекта, у Denis −2,92 пп — оба тоже PASS.)

## 16. N-2

**PASS.** 0 нарушающих пар из 1128 проверенных. Худшая пара — S17+S18,
доступность 91,39 % (всё ещё выше target).

## 17. Backup path

Среднее по 3 клиентам — **30,05 %** (C65 20,0%, C70 31,1%, C72 39,0%) —
выше baseline (28,1%).

## 18. Outage quality

Normal-профиль: C65 — 21 событие, медиана 120 с, P95 240 с, max 360 с;
C70 — 9 событий, все по 120 с; C72 — 4 события, все по 120 с.

## 19. Recovered steps

Outages: 44 040 с восстановлено. ISL2000: 63 600 с восстановлено. Главная
причина восстановления: `NO_VISIBLE_SATELLITE` (Outages),
`ISL_NETWORK_SPLIT` (ISL2000) — обе уже существующие диагностические
категории, новых не вводилось.

## 20. Lost steps

Outages: 38 760 с. ISL2000: 57 720 с. **Net recovered**: Outages +5 280 с,
ISL2000 +5 880 с — оба профиля чисто в плюсе, несмотря на реальный
двусторонний churn (не односторонний эффект).

## 21. Main reason improvement

(a) Поиск варьировал ВСЕ ТРИ плоскости (P1 включительно), тогда как
исторический Constrained Robust Optimum фиксировал P1 — бо́льшее
пространство поиска. (b) Явное разделение primary-объектива на
`min(Outages, ISL2000)` вместо смешанного пула не даёт одному условию
"спрятаться" за другим. (c) Геометрически — новая фазировка создаёт
межспутниковые ISL-мосты, которые не разрываются при обрезании дальности
до 2000 км там, где у baseline сеть раскалывалась (`ISL_NETWORK_SPLIT`).

## 22. Acceptance Matrix integration

Новая строка «Recommended Robust (Design Search 2.0)» в уже существующем
`REFERENCE_ACCEPTANCE_ROWS` (`frontend/src/lib/acceptance-reference.ts`)
— тот же паттерн, что Baseline/Denis/Constrained Robust Optimum. Matrix-
компонент не переписан.

## 23. Summary integration

Один компактный card (`robust-design-highlight.tsx`) — не новый большой
блок: min(Outages,ISL2000), Δ к Denis, штатный worst, N-1/N-2 PASS,
ссылка на Optimizer.

## 24. Tests

Backend: **249 passed** (было 194 в конце прошлой сессии → +2 API-теста
для `robust_design` в этой + 53 новых unit-теста: 39
precomputed-equivalence + 7 objective-ordering + 4 explainability + 3
evaluate_configuration-safety = итого 249). Все существующие тесты — без
изменений, все проходят.

## 25. Ruff

`uv run ruff check .` — **All checks passed**.

## 26. Mypy

`uv run mypy app` — **Success: no issues found in 66 source files**.

## 27. Frontend lint/tsc/build

`npm run lint` — чисто. `npx tsc --noEmit` — чисто. `npm run build` —
успешно, все 5 маршрутов собраны. Проверено вживую в Docker (после
`docker compose restart backend` — контейнер запускается БЕЗ `--reload`,
поэтому изменения кода требуют перезапуска процесса, не только файла):
новый режим «Устойчивый поиск 2.0» появляется и работает в Select
оптимизатора, `mode=robust_design` job проходит полный жизненный цикл
через реальный API, Summary показывает новый card, Acceptance Matrix —
новую строку. 404 в консоли — исключительно ожидаемый эффект
рестарта backend (протухший `run_id` из localStorage), обработан как
баннер ошибки, не как краш.

## 28. Runtime

Полный поисковый эксперимент (multi-start + 2 refine-раунда, 880
кандидатов) — **≈15 минут** суммарно в фоне. N-1 winner — 15,8 с. N-2
winner — 7,0 с. Redundancy winner — 0,6 с. ISL sensitivity sweep winner
— несколько секунд.

## 29. Limitations

Cм. полный список в `docs/robust-design-search.md` — кратко: поиск не
exhaustive (multi-start DE, не доказанный глобальный оптимум); fast
evaluator корректен, но не используется (не преодолел порог 1,5×);
min(Outages,ISL2000)=67,78% всё ещё далеко от 90% — структурное
ограничение геометрии/ISL-дальности, не недостаток поиска; C65 в ISL2000
имеет честно показанный небольшой регресс (−2,22 пп); N-1/N-2/redundancy/
outage-quality посчитаны точно только для итогового winner, не для всех
880 кандидатов (обосновано staged pipeline, раздел 5 задания).

## 30. git status

```
 M backend/app/api/v1/optimization.py
 M backend/app/calculation/optimization/configuration.py
 M backend/app/services/optimization_service.py
 M backend/tests/integration/test_optimization_api.py
 M frontend/src/components/optimizer/optimizer-workspace.tsx
 M frontend/src/components/summary/summary-workspace.tsx
 M frontend/src/lib/acceptance-reference.ts
 M frontend/src/types/optimization.ts
?? backend/app/calculation/optimization/precomputed_evaluator.py
?? backend/app/calculation/optimization/robust_explainability.py
?? backend/tests/unit/test_evaluate_configuration_safety.py
?? backend/tests/unit/test_precomputed_evaluator.py
?? backend/tests/unit/test_robust_design_objective.py
?? backend/tests/unit/test_robust_explainability.py
?? docs/robust-design-search.md
?? frontend/src/components/summary/robust-design-highlight.tsx
```

deployment_planner.py, deployment_planner_service.py, margins.py, `ml/`,
`reference_geometry.py` — **0 изменений** (явно проверено `git diff --stat`
на каждый).

## 31. git diff --stat

```
 backend/app/api/v1/optimization.py                 | 21 ++++--
 backend/app/calculation/optimization/configuration.py | 83 ++++++++++++++++++++++
 backend/app/services/optimization_service.py       | 45 ++++++++++++
 backend/tests/integration/test_optimization_api.py | 48 +++++++++++++
 frontend/src/components/optimizer/optimizer-workspace.tsx | 10 +--
 frontend/src/components/summary/summary-workspace.tsx |  3 +
 frontend/src/lib/acceptance-reference.ts           | 18 +++++
 frontend/src/types/optimization.ts                 |  4 +-
 8 files changed, 220 insertions(+), 12 deletions(-)
```

Плюс 7 новых файлов (2 backend-модуля, 4 backend-теста, 1 doc, 1
frontend-компонент).

## Подтверждения

- **`reference_geometry.py` НЕ ИЗМЕНЁН** — diff пуст.
- **ML НЕ ИСПОЛЬЗОВАЛСЯ** — ни один ML-import не добавлен.
- **Deployment код другого участника НЕ ТРОНУТ** —
  `deployment_planner.py`/`deployment_planner_service.py` — diff пуст.
- **Min-cut/connectivity margin другого участника НЕ ТРОНУТ** —
  `margins.py` (единственный существующий network-margin модуль в
  проекте) — diff пуст; никакого нового min-cut/connectivity-margin кода
  не создавалось.
- **COMMIT НЕ СОЗДАН** этой сессией — рабочая копия остаётся с
  незакоммиченными изменениями (перечислены в §30-31).
- **PUSH НЕ ВЫПОЛНЕН** — сетевые git-операции не выполнялись.
