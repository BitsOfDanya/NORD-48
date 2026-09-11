# Архитектура

## Route Stability Analysis

Анализ стабильности переиспользует тот же массив snapshot-графов, что и
обычная симуляция. Обратный проход `routing/stability.py` строит отображение
`edge → последний непрерывный step`; оно используется и для lifetime любого
выбранного пути, и для exact `maximum_persistence`. Сервис
`resilience/routing_analysis.py` запускает четыре стратегии и агрегирует route
segments. Орбитальная физика не дублируется, `reference_geometry.py` остаётся
единственным источником геометрии.

Monte Carlo и Route Stability Analysis — независимые режимы: первый меняет
набор активных аппаратов, второй сравнивает пути на одной детерминированной
динамике.

## Failure Lab и N-1

`calculation/resilience/failure_analysis.py` строит baseline snapshot-графы
один раз. Failure overlay не меняет scenario или geometry: внутри интервала
копирует граф и удаляет satellite node. Failure Analysis считает baseline и
variant, а N-1 переиспользует один baseline для всех аппаратов. FastAPI отдаёт
результаты frontend; Zustand хранит последний N-1 ranking только для окраски
существующего globe и Satellite Inspector.

## Configuration Design и Failure Threshold

`calculation/optimization` создаёт только derived deep-copy сценарии и
передаёт их в тот же exact pipeline. `optimization_service` держит async jobs
и cache в памяти процесса; внешней очереди и БД нет. Robust mode копирует углы
в исходные stress profiles, не меняя их ISL range и failure windows.

`failure_threshold.py` строит baseline geometry один раз и выполняет exact
connectivity/outage-проверку всех N-2 пар. Next.js получает только готовые
числа; расчётных формул во frontend нет.

`deployment_planner.py` переиспользует ту же схему «failures на весь
горизонт» вместо изменения `launch_stage`, чтобы протестировать ЛЮБОЕ
подмножество активных спутников (не только целые launch batches) —
активность через `reference_geometry.py` не меняется, только состав
`failures`. Жадный проход и связанный async job — отдельный слой поверх
`evaluate_configuration`/`search.optimize()` (refine-фаза), без нового
поискового алгоритма для самого RAAN/phase.

## Поток данных

```
JSON Scenario
      ↓
Pydantic Schema           (backend/app/schemas/scenario.py — структура и типы)
      ↓
Geometry Adapter           (backend/app/calculation/geometry/adapter.py)
      ↓
reference_geometry.py      (geometry.py организаторов, без изменений)
      ↓
Simulation Service         (оркестрация: 720 шагов, backend/app/services/simulation_service.py)
      ↓
Dynamic Network Graph      (NetworkX, граф контактов на каждый шаг, с запасом margin на линии)
      ↓
Routing                    (минимум переходов / минимальная длина / максимальный запас)
      ↓
Metrics + Diagnostics      (доступность, перерывы, причины отсутствия маршрута)
      ↓
FastAPI                    (REST API)
      ↓
Next.js                    (интерфейс)
```

Стресс-тест устойчивости (`app/calculation/resilience/monte_carlo.py`)
переиспользует тот же путь без изменений: для каждого случайного набора
из K отказавших аппаратов те же самые снимки геометрии и графы прогоняются
через ту же маршрутизацию и диагностику — просто с частью узлов графа,
удалённой перед расчётом. Подробности — в
[resilience-analysis.md](resilience-analysis.md).

## Компоненты

- **Frontend** (`frontend/`) — Next.js App Router. Обращается к backend
  только через REST API. **Frontend не выполняет орбитальных расчётов** —
  он отображает то, что вернул backend. Единственное исключение — чисто
  визуальное преобразование: backend сам переводит Earth-fixed координаты
  спутника (x/y/z) в широту/долготу/высоту для 3D-визуализации
  (`geometry/adapter.py:ecef_to_geodetic`) — это тоже код backend, просто
  перевод единиц измерения, а не физика. Весь кросс-страничный UI-стейт —
  один Zustand-стор (`store/app-store.ts`) с `persist` middleware
  (localStorage): выбор/вариант сценария, последний `run_id`, результаты
  каждого вида анализа устойчивости, состояние оптимизатора/планировщика и
  Compare. React Query остаётся источником данных конкретного запроса
  (например, полного `SimulationRun` по `run_id`) — в localStorage
  попадают только компактные агрегированные результаты и идентификаторы,
  не полные payload'ы с 720-шаговыми timeline.
- **Backend** (`backend/`) — FastAPI-сервис, источник истины для расчёта:
  проверка сценария, геометрия, граф сети, маршрутизация, метрики,
  диагностика. Расчёты (`SimulationRun`) хранятся в памяти процесса — БД
  пока не используется.
- **ML-слой** (`ml/`) — пакет `nord48_ml`, предполагается как обычная
  Python-библиотека, импортируемая backend (не отдельный сервис). **В v0.1
  не используется.** Когда появится, любой найденный им кандидат должен
  быть перепроверен точным расчётным движком backend, прежде чем
  попадёт в результат — ML никогда не заменяет точный расчёт.

## Почему geometry.py оборачивается, а не переписывается

`geometry.py` организаторов — эталонная реализация орбитальной механики и
расчёта контактов. Он скопирован без изменений в
`backend/app/calculation/geometry/reference_geometry.py`. Единственный
файл, который его импортирует — `backend/app/calculation/geometry/adapter.py`,
предоставляющий остальному коду три функции: `load_scenario`,
`validate_scenario`, `get_snapshot`. Нигде больше в проекте орбитальная
математика не дублируется — это защищено регрессионными тестами
(`backend/tests/integration/test_simulation_regression.py`): если они
перестанут проходить, значит где-то в графе/маршрутизации/сетке времени
появилась ошибка, а не в самих контрольных числах.

## Правило, которого нет в geometry.py

`geometry.snapshot()` возвращает все физически возможные контакты в
момент времени, включая связь «пункт—спутник» для любого наземного узла —
и клиентов, и шлюза. Понятия «этот узел не может ретранслировать чужой
трафик» в нём нет. Это правило добавлено на уровень выше, в
`backend/app/calculation/network/graph.py:build_client_routing_graph`:
перед расчётом маршрута конкретного клиента из графа удаляются узлы
ВСЕХ остальных клиентов. Тест, который упадёт, если это правило убрать —
`backend/tests/unit/test_graph.py`.

## Структура репозитория

Полное дерево — в корневом [README.md](../README.md#структура-проекта).

## Текущее состояние (v0.3)

Реализовано: схема сценария + эталонная валидация, адаптер геометрии,
расчёт на полном горизонте (720 шагов), динамический граф на каждый шаг
(с нормированным запасом `margin`), четыре стратегии маршрутизации
(минимум переходов / минимальная длина / максимальный запас / максимальная
стабильность пути), детерминированная диагностика, метрики по клиентам;
устойчивость — Failure Lab, Monte Carlo, Routing Analysis, exact N-1, exact
N-2; оптимизация — exact evaluator, normal/robust/constrained_robust поиск
RAAN/phase (async jobs, кэш, exact revalidation, Pareto-фронт),
Deployment Sequence Planner + minimum-constellation-size (жадный
конструктивный поиск состава группировки); Compare (2–10 запусков,
явный baseline); Scenario Editor (derived variants, не мутирующие
исходный JSON); единая страница «Сводка» с Acceptance Matrix и
детерминированной рекомендацией; состояние приложения переживает
переход между страницами и перезагрузку (Zustand `persist`,
localStorage). Полный REST API, рабочий frontend (3D-визуализация,
временная шкала, все перечисленные страницы).

Не реализовано: ML/суррогатные модели, произвольное редактирование
архитектуры группировки (число плоскостей/спутников), сохранение
расчётов в БД, аутентификация. См. корневой README, раздел «Ограничения
текущей версии».
