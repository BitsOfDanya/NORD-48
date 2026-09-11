# Оптимизация конфигурации

## Назначение

Модуль отвечает на инженерный вопрос: какие допустимые значения `raan_deg`
и `phase_deg` плоскостей улучшают доступность худшего наземного пункта.
Исходный JSON никогда не меняется: `apply_plane_parameters()` создаёт глубокую
копию с `meta.derived_from`. Оба угла нормализуются в `[0, 360)` — именно этот
диапазон проверяет неизменённая reference geometry.

По умолчанию P1 остаётся опорной, а поиск меняет `P2.raan_deg`,
`P3.raan_deg`, `P2.phase_deg`, `P3.phase_deg`. Full mode получается выбором
P1-параметров в UI/API, без отдельной физической модели.

## Exact evaluator

`evaluate_configuration()` применяет одну конфигурацию ко всем выбранным
stress profiles и для каждого запускает существующую цепочку:

`reference geometry → 720 contact graphs → выбранная routing strategy → client metrics`.

У stress-сценария сохраняются его собственные свойства: в
`03_satellite_outages` остаются исходные окна 10 отказов, в `04_link_range`
остаётся ISL 2000 км. Меняются только углы плоскостей. Результат содержит
метрики каждого клиента и агрегаты: worst/mean availability, worst/mean max
outage, route churn, число нарушений target и `target_feasible`.

## Целевая функция

Кандидаты сортируются лексикографически, без смешивания KPI в условный score:

1. выше минимальная availability по всем клиентам и выбранным сценариям;
2. меньше worst max outage;
3. выше mean availability;
4. меньше mean max outage;
5. меньше route churn;
6. меньше круговое отклонение углов от baseline;
7. канонический набор параметров обеспечивает детерминированность.

В normal mode множество условий содержит один сценарий. В robust mode primary
objective — минимум по всем клиентам всех выбранных профилей: хороший сценарий
не может усреднить плохой.

## Поиск, budget и cache

Первая стадия использует воспроизводимый `numpy.random.default_rng(seed)`.
Вторая — `scipy.optimize.differential_evolution`, `workers=1`; DE получает
ступенчатую primary objective, а окончательный top сортируется полным каскадом.
Доступны budgets 100/250/500, `stop_on_target` (по умолчанию false), bounds,
seed и отключаемый polish. Baseline всегда считается первым. Top-5 после
поиска повторно считается exact evaluator с обходом cache; расхождение метрик
считается ошибкой.

Cache key включает SHA-256 исходного набора сценариев, канонические углы и
routing strategy. In-memory cache не переживает процесс. API показывает hits,
misses и число exact evaluations.

## API и UI

Долгий расчёт оформлен как in-memory job: `POST /optimization/run`, polling
`GET /optimization/{run_id}`, результат `GET .../result`. Progress — реальное
число завершённых candidates. `/optimizer` показывает baseline, настройки,
scenario matrix, target status, deltas, top-10, сходимость и распределение.
Кнопка «Открыть в моделировании» кладёт derived scenario во временное
uploaded-like Zustand state, не меняя исходный файл.

Dataset доступен как JSONL/CSV через `GET .../{run_id}/dataset?format=`.
Каждая строка содержит углы, scenario/ISL/failure context и exact labels.

