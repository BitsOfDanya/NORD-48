# NORD-48

Система проектирования и анализа устойчивости спутниковых группировок:
точный расчёт связности, устойчивости к отказам и экономики развёртывания
— поверх оригинальной геометрии организаторов, без единого изменённого
значения в ней.

КосмоХакатон 2026 · команда «5bit»

## Live Demo

**http://5.129.225.86:3000/**

Открывается в обычном браузере, без отдельной регистрации или входа. На
демо-стенде можно: загрузить один из официальных сценариев кейса (или
использовать уже встроенные), запустить полный точный расчёт (модель
связности, маршрутизация, устойчивость к отказам, оптимизация), увидеть
3D-визуализацию группировки и экспортировать результат в официальном
формате (`cosmo-A-result-1.0`).

## Быстрый старт

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API docs (Swagger): http://localhost:8000/docs
- Health-check: http://localhost:8000/api/v1/health

## Локальная разработка

Backend (Python 3.12 / FastAPI) — см. [backend/README.md](backend/README.md).

Frontend (Next.js / TypeScript) — см. [frontend/README.md](frontend/README.md).

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

## Архитектура

```
Frontend (Next.js, TS)  ──REST──▶  Backend (FastAPI)
                                       │
                                       └── Calculation Engine
                                           geometry / graph / routing /
                                           metrics / optimization / economics
```

Frontend не выполняет расчётов — только отображает то, что вернул backend.
Подробнее — [docs/architecture.md](docs/architecture.md).

## Рабочий процесс

```
Сценарий → Моделирование → Маршрутизация → Сравнение
   → Устойчивость → Оптимизация → Развёртывание → Рекомендация → Экспорт
```

Загружаете или выбираете сценарий → считаете связность и маршруты →
сравниваете конфигурации между собой → проверяете устойчивость к отказам
(N-1/N-2, Monte Carlo) → при необходимости ищете более устойчивую
конфигурацию или порядок развёртывания → получаете единую рекомендацию на
странице «Сводка» → экспортируете результат.

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
  Recommended Robust), ресурсная и денежная оценка. Два optional
  CatBoost-режима (пометка Research) ускоряют screening кандидатов —
  итоговые метрики всё равно только из точного пересчёта, см.
  [docs/catboost.md](docs/catboost.md) и страницу «ML Surrogate Research».
- **Сводка / Target Closure** — единая рекомендация, разбор физики и
  причин перерывов связи, паспорт устойчивости и то, что именно нужно
  изменить, чтобы закрыть разрыв до целевого порога (см. ниже).
- **Acceptance Matrix** — сводная таблица проверенных кандидатов по всем
  критериям сразу (без единой свёрнутой оценки).

## Основные сценарии

| Файл | Назначение |
| --- | --- |
| `01_full_constellation.json` | Полная группировка — 48 аппаратов, 3 плоскости. |
| `02_first_launch.json` | Первая очередь — активны только 16 аппаратов 1-й партии. |
| `03_satellite_outages.json` | 10 аппаратов выходят из строя после 06:00. |
| `04_link_range.json` | Дальность ISL ограничена 2000 км. |

## Ключевые метрики (Recommended Robust 2.0)

Все 48 спутников, RAAN/phase подобраны поиском (см.
[docs/robust-design-search.md](docs/robust-design-search.md)), `minimum_hops`,
worst-доступность среди трёх клиентов (C65/C70/C72):

| Метрика | Значение |
| --- | --- |
| Normal, худший клиент | 96,53 % |
| Outages, худший клиент | 82,64 % |
| ISL2000, худший клиент | 67,78 % |
| N-1 (все 48 одиночных отказов) | PASS |
| N-2 (все 1128 пар) | PASS |
| Backup path, среднее | 30,05 % |
| Требуемая дальность ISL для target 90 % | ~2750 км |

Отдельно доступен специализированный `failure_cvar`-кандидат, устойчивый к
случайным одновременным отказам K=10 спутников ценой худшего ISL2000 — не
заменяет Robust Design 2.0 автоматически, см.
[docs/failure-robust-optimization.md](docs/failure-robust-optimization.md).

## Улучшение относительно Baseline

| Условие | Baseline | Robust Design 2.0 | Δ |
| --- | --- | --- | --- |
| Normal worst | 96,67 % | 96,53 % | −0,14 п.п. |
| Outages worst | 79,31 % | 82,64 % | **+3,33 п.п.** |
| ISL2000 worst | 62,22 % | 67,78 % | **+5,56 п.п.** |
| Backup path, среднее | 28,10 % | 30,05 % | +1,95 п.п. |

Robust Design 2.0 заметно улучшает деградированные режимы (Outages,
ISL2000) практически без потерь в штатной доступности.

Выбор ЧИСЛА спутников (независимо от RAAN/phase) — своя таблица:

| Кандидат | Спутников | Normal worst | N-1 | N-2 |
| --- | --- | --- | --- | --- |
| N=44 (минимум для target) | 44 | 90,14 % | FAIL | FAIL |
| N=46 (устойчив к 1 отказу) | 46 | 93,33 % | PASS | FAIL |
| Полная группировка (Recommended) | 48 | 96,67 % | PASS | PASS |

Полное обоснование — [docs/design-decision.md](docs/design-decision.md)
(RAAN/phase) и [docs/design-threshold-verification.md](docs/design-threshold-verification.md)
(число спутников).

## Результат оптимизации развёртывания

| Этап | Reference (наивный состав) | Optimized (жадный состав) |
| --- | --- | --- |
| Stage 1 (N=16) | 13,19 % | **32,22 %** |
| Stage 2 (N=32) | 56,53 % | **65,56 %** |
| Stage 3 (N=48) | 96,53 % | 96,53 % (= Recommended Robust) |

Optimized — лучший состав, найденный текущей эвристикой (greedy +
1-swap/tabu), не доказанный математический оптимум. Подробнее —
[docs/deployment-optimization.md](docs/deployment-optimization.md).

## Основные инженерные выводы

1. Robust Design 2.0 сохраняет ~96,5 % штатной доступности и заметно
   улучшает деградированные сценарии (Outages, ISL2000) почти без потерь
   в нормальном режиме.
2. Дальность ISL 2000 км остаётся главным структурным ограничением сети —
   по проверенному сканированию для target 90 % нужно ~2750 км.
3. N=44 спутников достаточно для штатной цели (Normal ≥90 %), но не для
   устойчивости к отказам — при N=44 нулевой запас на отказ одного
   спутника (N-1 FAIL).
4. Рекомендованные N=48 проходят и N-1, и N-2 (все одиночные и все парные
   отказы).
5. Оптимизированный порядок развёртывания значительно улучшает ранние
   этапы: Stage 1 почти в 2,4 раза, Stage 2 на +9 п.п. относительно
   наивного состава той же численности.
6. Robust 2.0 устойчив к отклонениям RAAN (±5° — деградация до 1,94 п.п.),
   но чувствителен к отклонениям phase (±5° — до 15,69 п.п.): точность
   фазирования спутников на орбите важнее точности RAAN.
7. Основная доля перерывов связи при низкой дальности ISL объясняется
   фрагментацией межспутниковой сети (`ISL_NETWORK_SPLIT`), а не только
   потерей покрытия — это видно в разбивке причин на странице «Сводка».

## Результат sensitivity-анализа

Локальный one-factor-at-a-time анализ вокруг найденного Robust 2.0: RAAN —
плоский локальный оптимум (деградация ≤0,42 п.п. при ±1°, ≤1,94 п.п. при
±5°); phase — острый локальный оптимум (деградация до 3,33 п.п. при ±1°,
до 15,69 п.п. при ±5°). Точность фазирования важнее точности RAAN.
Полная методика и таблица — [docs/robust-design-search.md](docs/robust-design-search.md).

## Физические метрики

Для высоты 550 км: период обращения ~5730 с (~1 ч 35 мин), 15,08
витков/сутки, радиус зоны покрытия одного спутника ~1664 км, геометрическая
задержка распространения сигнала (**только geometric propagation delay**,
без обработки, очередей и коммутации) mean/p95 ~13,8/23,3 мс. Подробнее —
[docs/physical-model.md](docs/physical-model.md).

## Target Closure

Страница «Сводка» показывает, что именно нужно изменить, чтобы закрыть
разрыв до целевого порога устойчивости в конкретном деградированном
сценарии — требуемую дальность ISL, число активных спутников, этап
развёртывания или геометрию. Это сводка уже посчитанных точным движком
результатов для поддержки инженерного решения, а не отдельный
автоматический оптимизатор.

## Тесты

```bash
# backend
cd backend && uv run pytest && uv run ruff check . && uv run mypy app

# frontend
cd frontend && npm run lint && npx tsc --noEmit && npm run build
```

## Документация

- [docs/architecture.md](docs/architecture.md) — устройство проекта.
- [docs/calculation-model.md](docs/calculation-model.md) — расчётная модель, regression-значения.
- [docs/api.md](docs/api.md) — полный список эндпоинтов.
- [docs/case-acceptance.md](docs/case-acceptance.md) — соответствие требованиям кейса и критериям оценки.
- [docs/design-decision.md](docs/design-decision.md) — выбор RAAN/phase (Robust Design 2.0).
- [docs/robust-design-search.md](docs/robust-design-search.md) — алгоритм поиска Robust Design 2.0 и sensitivity-анализ.
- [docs/failure-robust-optimization.md](docs/failure-robust-optimization.md) — CVaR-робастный поиск (failure_cvar).
- [docs/design-threshold-verification.md](docs/design-threshold-verification.md) — выбор числа спутников.
- [docs/deployment-optimization.md](docs/deployment-optimization.md) — hybrid deployment optimization.
- [docs/resilience-analysis.md](docs/resilience-analysis.md) — N-1/N-2, Monte Carlo, чем они отличаются от connectivity margin.
- [docs/connectivity-margin.md](docs/connectivity-margin.md) — dynamic min-cut / connectivity margin.
- [docs/degradation-analysis.md](docs/degradation-analysis.md) — кривые деградации по K отказавших спутников.
- [docs/network-redundancy.md](docs/network-redundancy.md) — route redundancy.
- [docs/isl-sensitivity.md](docs/isl-sensitivity.md) — минимальная дальность ISL.
- [docs/cost-effectiveness.md](docs/cost-effectiveness.md), [docs/cost-sources.md](docs/cost-sources.md) — экономика.
- [docs/physical-model.md](docs/physical-model.md) — физическая модель: допущения, формулы, что не моделируется.
- [docs/assets.md](docs/assets.md) — источники и лицензии внешних текстур/шрифтов.
- [docs/catboost.md](docs/catboost.md) — CatBoost surrogate research: model, training dataset, validation metrics, pretrained inference and exact-validation policy.
- [docs/demo-guide.md](docs/demo-guide.md) — сценарий защиты (3–5 минут).
- [docs/development.md](docs/development.md) — разработка.

## ML / Surrogate Research

NORD-48 включает экспериментальный CatBoost-суррогат для ускоренного
просмотра большого пространства RAAN/phase-конфигураций — как
дополнительные optional-режимы `/optimizer` (`CatBoost · обучение в ходе
поиска`, `CatBoost · сохранённая модель`, оба с пометкой Research), а не
замену существующих алгоритмов (default остаётся `differential_evolution`).
Модель заранее ранжирует намного больше кандидатов, чем можно точно
посчитать за тот же бюджет, а точный движок пересчитывает только шорт-лист
(top-15 + baseline, затем top-5 повторно) — итоговые метрики и
рекомендация всегда берутся из точного пересчёта, а не из прогноза.

Обученная модель, датасет и отчёт о валидации закоммичены в репозиторий
([`ml/artifacts/`](ml/artifacts)) вместе с воспроизводимым скриптом
обучения ([`scripts/train_catboost.py`](scripts/train_catboost.py), запуск
только вручную). На независимой holdout-выборке модель даёт MAE ≈8,14 п.п.
доступности (против ≈15,56 п.п. у константного прогноза среднего) —
заметная погрешность, поэтому предсказание никогда не становится
официальным результатом. Полная методика — [docs/catboost.md](docs/catboost.md);
живые метрики валидации и pipeline — страница «ML Surrogate Research»
(`/research`, вторичная навигация), которая читает те же закоммиченные
артефакты через API, а не хранит числа отдельной копией. Историческая
ветка разработки: [`origin/ml`](https://github.com/BitsOfDanya/NORD-48/tree/ml).

## Границы модели и допущения

NORD-48 следует официальной расчётной модели кейса: сферическая Земля,
круговые орбиты и дискретная временная сетка.

Оптимизация RAAN/phase, состава развёртывания и размера группировки
выполняется эвристическими методами (жадный поиск, differential
evolution, 1-swap/tabu). Найденные кандидаты проходят точную повторную
проверку, но не заявляются как глобальный математический оптимум.

Для K≤2 отказов используется полный точный перебор. Для K≥3 применяется
Monte Carlo, поэтому для больших K показывается worst observed, а не
доказанный глобальный worst case.

Задержка — геометрическое время распространения сигнала. RF link budget,
processing delay и queueing delay не моделируются, так как
соответствующие параметры отсутствуют во входных данных кейса.

Основной редактор сценария изменяет параметры, предусмотренные
пользовательским сценарием кейса: этап запуска, RAAN/phase, периоды
отказов. Исследование других параметров архитектуры (число плоскостей,
высота) выполняется отдельными сценариями и аналитическими
экспериментами, а не через редактор.

Результаты текущей рабочей сессии хранятся без отдельной пользовательской
базы данных и системы аутентификации — это не является предметом
инженерного кейса.

ML/surrogate-модели включены как experimental acceleration layer (см. «ML
/ Surrogate Research» выше) — optional-режимы `/optimizer`, отдельные от
основных алгоритмов. Они не заменяют точный расчётный движок: финальные
метрики и рекомендации всегда проходят exact validation.
