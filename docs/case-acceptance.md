# Соответствие официальному кейсу

Источник требований — только официальные материалы организаторов в
`case_materials/`: «Постановка задачи», «Описание данных», «Критерии
оценки». Ничего не придумано сверх того, что там написано; там, где
функция шире формального требования, это отмечено отдельно.

## Функциональные требования («Постановка задачи», раздел 1-4)

| Требование | Реализация | UI/API | Статус |
| --- | --- | --- | --- |
| 1. Загрузка сценария из набора, отображение состава/плоскостей/наземных пунктов/параметров | `ScenarioPanel`, 4 официальных сценария из `data/scenarios/raw/` | `/` (Моделирование) | PASS |
| 1. Выбор очереди запуска | `launch_stage` в `VariantEditor` | `/` | PASS |
| 1. Изменение ориентации плоскостей и фазирования | RAAN/phase inputs в `VariantEditor` | `/` | PASS |
| 1. Периоды недоступности спутников | `failures[]` редактор (спутник + start/end) в `VariantEditor` | `/` | PASS |
| 1. Сохранить вариант, вернуться для сравнения | `saveVariant`/`savedVariants` (zustand), `/compare` | `/`, `/compare` | PASS |
| 2. Положения спутников, видимость, ISL на каждом шаге | точный расчёт по `reference_geometry.py`, timeline/globe | `/` | PASS |
| 2. Состояние сети в выбранный момент, спутники клиента, перерывы | timeline scrubber + snapshot view | `/` | PASS |
| 3. Маршрут до шлюза, пересчёт при изменениях | `router.py` (4 стратегии), пересчитывается каждый шаг | `/`, `/api/v1/simulations/{id}/route` | PASS |
| 3. Причина отсутствия маршрута (видимость/ISL/шлюз) | Outage Explainer, `diagnostic_reason` (`NO_VISIBLE_SATELLITE`/`NO_GATEWAY_CONTACT`/`ISL_NETWORK_SPLIT`/`GATEWAY_OUTAGE`) | `/`, outage panel | PASS |
| 4. Сравнение ≥2 вариантов по доступности/перерывам/маршрутам | `/compare`, deltas per client | `/compare` | PASS |
| 4. Обоснование выбора конфигурации | `docs/design-decision.md`, `_recommendation()` текст в Оптимизаторе | `/optimizer`, `/summary` | PASS |
| 4. Полная группировка + промежуточный этап + сценарий отказов в расчётах | все 4 официальных сценария поддержаны везде | всюду | PASS |
| Доп: автоподбор конфигурации | Optimizer (`normal`/`robust`/`constrained_robust`/`robust_design`/`failure_cvar`) | `/optimizer` | PASS (сверх минимума) |
| Доп: поиск уязвимых аппаратов | N-1 (exhaustive), Satellite N-1 impact в Resilience Passport | `/resilience`, `/summary` | PASS |
| Доп: анализ резервных путей | Route Redundancy, Backup Route на глобусе | `/resilience`, `/` | PASS |
| Доп: сравнение стратегий маршрутизации | Routing Analysis (4 стратегии, route lifetime/margin) | `/resilience` | PASS |
| Доп: сценарный анализ | Connectivity Margin, Failure Degradation, Failure-Robust CVaR, Deployment Sequence Optimizer | `/resilience`, `/optimizer` | PASS (сверх минимума) |

## Данные

| Требование | Реализация | Статус |
| --- | --- | --- |
| 4 официальных сценария, шаг 120с, горизонт сутки | загружены без изменений из `case_materials`/`data/scenarios/raw` | PASS |
| Использование `geometry.py` организаторов | `reference_geometry.py` — не изменён | PASS |

## Требования к интерфейсу

| Требование | Реализация | Статус |
| --- | --- | --- |
| Схема/карта: спутники, наземные пункты, связи, маршрут | 3D-глобус (`GlobeView`), легенда состояний | PASS |
| Временная шкала + диаграмма доступности по перерывам | `Timeline`, `AvailabilityTrack` | PASS |
| Сравнение: изменённые параметры, итоги, различия | `ComparisonWorkspace` (deltas, changed_parameters) | PASS |
| Некорректный файл → понятное сообщение | `ErrorBanner` + `InvalidScenarioError` (422, без stack trace) — проверено эмпирически | PASS |
| Сброс изменений, новый запуск | reload / re-run из UI, export→re-upload round-trip проверен | PASS |

## Базовые сценарии проверки

| Сценарий | Проверено | Как |
| --- | --- | --- |
| Полная группировка: загрузка, расчёт, выбор пункта, маршрут в нескольких моментах | PASS | `01_full_constellation`, multiple `t_s` |
| Этап развёртывания: переключение очереди 3→1, сравнение | PASS | `launch_stage` toggle воспроизводит `02_first_launch`'s 12.64% (совпадает с эталонным сценарием) |
| Отказ аппарата: выбор спутника текущего маршрута, период недоступности, повтор | PASS | эмпирически проверено — потеря S20 на маршруте C65 вызывает reroute (2 хопа → 15 хопов, доступен) |
| Изменение проекта: смена ориентации/фазирования, сохранение, сравнение, экспорт/реимпорт | PASS | export→re-upload→run round-trip проверен end-to-end (см. `docs/api.md`) |

## Ожидаемый результат

| Требование | Статус |
| --- | --- |
| Развёрнутый веб-сервис, доступный жюри | Live demo: см. README |
| Исходный код в репозитории | PASS |
| Инструкция запуска | README, `backend/README.md`, `frontend/README.md` |
| Экспорт результатов и использованных параметров | `schema_version: cosmo-A-result-1.0`, `effective_scenario`, `routes` |
| Жюри может загрузить свой сценарий того же формата | upload endpoint + `load_uploaded_scenario` принимает любой валидный `cosmo-A-*` JSON | PASS |

## Критерии оценки — что показывает какая функция

| Критерий («Критерии оценки») | Баллы | Что показывает |
| --- | --- | --- |
| Проектирование и сравнение конфигураций | 0–15 | `/`, `/compare`, launch_stage/RAAN/phase editor, Recommended Robust vs Baseline |
| Анализ устойчивости | 0–10 | N-1/N-2 exact, Failure Degradation, Connectivity Margin, Bottleneck Decomposition, Resilience Passport |
| Обоснованность рекомендаций | 0–10 | `_recommendation()` (exact-metrics-only, называет trade-off по конкретному клиенту), `docs/design-decision.md` |
| Удобство использования | 0–10 | единая навигация, timeline, globe, Resilience Passport (единая сводка вместо разрозненных панелей) |
| Презентация решения | 0–5 | `docs/demo-guide.md` |
| Корректность расчётов | 0–15 | `reference_geometry.py` не изменён, golden regression (12/12 baseline точно совпадает), физические unit-тесты (период/coverage/задержка) |
| Алгоритмы маршрутизации | 0–15 | 4 стратегии, `docs/routing-experiments.md`, handover/lifetime метрики |
| Работа с входными данными | 0–10 | upload/edit/re-run, export→re-upload round-trip (P0 fix), понятные 422-сообщения |
| Качество кода | 0–5 | разделение calculation/api/services/frontend, pure-function модули с unit-тестами |
| Документация и запуск | 0–5 | этот документ + README + `docs/demo-guide.md` + Quick Start |

## Честно не реализовано / ограничения

См. `README.md` → «Ограничения» и `docs/physical-model.md` → «Что модель
сознательно НЕ считает». Кратко: RF link budget (нет входных данных),
изменение числа орбитальных плоскостей (архитектурное ограничение
текущей геометрической модели, не рефакторено в этом проходе), ML
(отдельный участник, контракт интеграции не более), аутентификация/БД
(вне объёма продукта для хакатона).
