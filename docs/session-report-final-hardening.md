# Отчёт: Final Product Hardening + Code Cleanup + Documentation Consolidation + Docker/Runtime Verification + Frontend Polish + Final Decision Validation

Дата: 2026-09-12. Команда «5bit», КосмоХакатон 2026, проект NORD-48.

## 1. Code cleanup

Систематический аудит (не точечная правка): поиск `console.log`/`print`
debug-кода, TODO/FIXME, закомментированных блоков кода, длинных
(≥6 строк) комментарийных блоков по всему `backend/app` и `frontend/src`.
Результат: код уже был в хорошем состоянии после предыдущих сессий — не
найдено ни одного debug-вывода, TODO или закомментированного кода.
Найдено и устранено: два дублирующих локальных `pct()`-хелпера в новых
компонентах этой сессии (`redundancy-analysis.tsx`,
`threshold-verification-panel.tsx`) — заменены на уже существующий
`formatPercent()` из `lib/format.ts`, вместо третьего/четвёртого
переизобретения того же форматирования.

## 2. Что удалено из комментариев

Ничего — полный скан на «длинный комментарийный блок» (≥6 подряд идущих
строк `#`/`//`) по всему бэкенду и фронтенду вернул ноль совпадений;
docstring'и (проверены выборочно, включая самые длинные — `router.py` 26
строк, `monte_carlo.py` 20 строк, `cost_model.py` 22 строки) оказались
информационно плотными, без воды, и по содержанию совпадают с
разрешённым списком (обоснование алгоритма, семантика интервала,
ограничения эвристики, exact-vs-heuristic). Решение: не трогать —
переписывание уже качественной документации создало бы риск без пользы.

## 3. Какие важные комментарии оставлены

Оставлены без изменений (примеры из проверенных): `router.py` — 4
стратегии маршрутизации и их детерминированный tie-break;
`deployment_planner.py` — почему жадный конструктивный поиск, а не
`C(48,N)` перебор; `redundancy.py` — почему три раздельных процента, а не
единый score; `cost_model.py` — почему `estimate_cost()` возвращает
`None`, а не догадку, если цена не задана явно.

## 4. Dead code / debug cleanup

Найдено и удалено (в отличие от комментариев — реальный неиспользуемый
код, не текст):

- **Frontend**: 20 пустых директорий-заготовок нереализованной
  feature-sliced-архитектуры (`src/entities/*` — 5 папок, `src/features/*`
  — 7 папок, `src/lib/utils/`) — ни одного импорта из них нигде в кодовой
  базе (проверено grep'ом по `@/entities`, `@/features`, `@/lib/utils/`).
  Плюс 9 `.gitkeep` в уже НЕ пустых директориях (`types/`, `store/`,
  `components/{metrics,optimizer,constellation,network,simulation,
  resilience,timeline}/`) — файлы, ставшие бессмысленными после того, как
  в эти папки добавился реальный код.
- **Backend**: `app/db/` целиком (`session.py`, `base.py`,
  `models/__init__.py`) — асинхронный SQLAlchemy engine/сессия без единой
  ORM-модели и без единого вызова `get_db()` где-либо в проекте (grep по
  `app.db`, `database_url` — ноль ссылок вне самого модуля). Плюс
  `app/services/routing_service.py` — файл с содержимым `"routing_service
  — placeholder. Not implemented yet."`, ни разу не импортированный.
  Следом убраны: `database_url`/`async_database_url` из `core/config.py`,
  зависимости `sqlalchemy`/`aiosqlite` из `pyproject.toml` (лишний
  `greenlet` ушёл транзитивно), `uv.lock` перегенерирован (`uv lock`),
  переменная `DATABASE_URL` — из `docker-compose.yml` и `.env.example`
  (безопасно: `Settings.model_config` уже стоит `extra="ignore"`, лишняя
  переменная окружения просто игнорируется, а не роняет старт).

Вся эта очистка **не задета** ни одним из 194 тестов — прогнаны до и
после, результат идентичен.

## 5. README

Три файла переписаны с нуля под текущее состояние (все предыдущие версии
были эпохи v0.1 и явно противоречили тому, что реально работает):

- **Корневой [README.md](../README.md)** — короткий, по структуре из
  задания: что это, возможности (только реально работающее), архитектура
  в 5 строк, Quick Start (Docker), локальный запуск (ссылки на
  backend/frontend README), таблица сценариев, компактная таблица
  «основные результаты» (N=44/N=46/48), команды тестов, ссылки на docs,
  ограничения. Раздел «Следующий этап» убран целиком — в старой версии
  там был пункт «Deployment Planner как отдельный UI-режим», который уже
  реализован.
- **[backend/README.md](../backend/README.md)** — актуальная структура
  `app/api/v1/` (8 роутеров, не «пустые заготовки», как было написано),
  актуальный стек (SQLAlchemy убран), актуальный список
  `app/calculation/` подпакетов включая новые `economics/`.
- **[frontend/README.md](../frontend/README.md)** — не существовал,
  создан с нуля: установка, запуск, build, переменные окружения (с явным
  объяснением host vs container для Docker), таблица маршрутов,
  персистентность стора, структура каталогов.

## 6. Docs consolidation

- `docs/hackathon-requirements.md` — самый серьёзный найденный источник
  устаревшей информации: документ v0.1 утверждал «не реализовано» для
  RAAN/phase редактирования, сохранения вариантов, Compare, N-1 critical
  satellite search, route redundancy analysis, routing strategy
  comparison — **все они реализованы** (Scenario Editor, `/compare`,
  N-1 Criticality, Route Redundancy, Routing Analysis). Обновлено 14
  строк таблиц на актуальный статус со ссылкой на конкретный компонент.
- `docs/api.md` — добавлены 4 отсутствовавших раздела: Threshold
  Verification, ISL Sensitivity, `/resilience/redundancy`, `/economics/estimate`
  (эти эндпоинты существовали в коде, но не были описаны в api.md).
- `docs/design-decision.md` — добавлена явная перекрёстная ссылка на
  `design-threshold-verification.md` в начале файла: страница про
  RAAN/phase при фиксированном составе — не единственное «решение по
  конфигурации», есть отдельное про число спутников.
- Стале-упоминания `app/db/`, SQLAlchemy — проверены по всем `.md` в
  `docs/` и `backend/` (grep), не найдено ни одного оставшегося после
  правки `backend/README.md` и `app/models/simulation.py`.
- Experiment-документы (`design-decision.md`, `deployment-planner.md`,
  `optimization-experiments.md` и т.д.) — не тронуты сверх точечных
  правок выше: содержат честные, всё ещё актуальные зафиксированные
  числа, не «следующий этап» под уже готовую функцию.

## 7. N=44 stress validation (Outages/ISL2000/N-1/N-2) — точный пересчёт

**Найдена и исправлена ошибка первого прохода прошлой сессии**: при
попытке посчитать Outages/ISL2000 для кандидата N=44 через
`evaluate_subset()` результат совпал с Normal побайтово — подозрительно
для «более сурового» сценария. Причина: `evaluate_subset()` **внутри
себя** вызывает `active_subset_scenario()`, которая полностью
перезаписывает `scenario["failures"]` — это стирало заранее наложенные
на сценарий отказы стресс-профиля `03_satellite_outages`, оставляя
только exclusion-отказы (спутники вне состава). Исправление: собственная
копия тела `evaluate_subset` без повторного вызова
`active_subset_scenario`, применяемая к сценарию, где отказы профиля и
exclusion-отказы объединены (не заменены).

Результат exact-пересчёта (N=44, 44 спутника, после swap-refinement):

| Профиль | Worst availability |
| --- | --- |
| Normal | 90,14 % |
| Outages (10 доп. отказов с 06:00) | **71,67 %** |
| ISL2000 (дальность ISL = 2000 км) | **56,39 %** |
| N-1 (худший одиночный отказ) | **FAIL** — 3 нарушения target, ≈86,81 % |
| N-2 (все 946 пар) | **FAIL** — 946/946 пар (100 %) нарушают target |

Route redundancy (среднее по 3 клиентам): 20,0 % (было бы 28,1 % у полной
группировки — заметно ниже, меньше спутников-ретрансляторов).
Требуемая дальность ISL для этого состава: 2750 км (совпадает с полной
группировкой).

## 8. N=46 stress validation — то же самое, exact

| Профиль | Worst availability |
| --- | --- |
| Normal | 93,33 % |
| Outages | **75,00 %** |
| ISL2000 | **59,58 %** |
| N-1 | **PASS** — 0 нарушений, ровно 90,00 % после худшего отказа |
| N-2 (все 1035 пар) | **FAIL** — 1034/1035 пар (99,9 %) нарушают target |

Route redundancy (среднее): 23,24 %. Требуемая ISL: 2750 км.

**Честный вывод по обоим кандидатам**: ни N=44, ни N=46 не проходят
точный N-2 — устойчивость к ДВУМ одновременным отказам остаётся
привилегией только полной 48-спутниковой группировки среди всех
проверенных вариантов. Полные данные и таблицы —
[docs/design-threshold-verification.md](design-threshold-verification.md).

## 9. Hybrid refine E2E — реальный контролируемый прогон

Запущен вживую (не только юнит-тестами) на реальных жадных составах:
Stage 1 (N=16, budget 30 и повторно 150 с другим seed), Stage 2 (N=32,
budget 30), кандидат N=44 (budget 60). **Честный результат: улучшения не
найдено ни в одном из четырёх прогонов** — `best.parameters ==
baseline.parameters` побайтово. Проверено, что это не отказ поиска
стартовать: параметры при большем бюджете и другом seed остаются теми
же. Правдоподобное объяснение — жадный алгоритм выбора состава уже
распределяет спутники по плоскостям с учётом существующей (фиксированной)
геометрии, так что дальнейший RAAN/phase-поиск для уже подобранного
состава не находит улучшающего направления. Задокументировано в
[docs/deployment-optimization.md](deployment-optimization.md) как
честный отрицательный результат, не подставлено произвольное число.

## 10. Outage Quality UI — подключено

Backend-модуль `outage_quality.py` существовал с прошлой сессии, но не
был подключён ни к одному эндпоинту. Теперь: `_metrics_dict()` в
`app/api/v1/simulations.py` вызывает `compute_outage_quality()` на тех же
`available`-флагах, что уже были в timeline — без пересчёта, без
изменения существующих полей (`max_outage_s` остаётся главным KPI). Новое
поле `outage_quality` (`total/mean/median/p95_outage_s`) добавлено во
frontend-таблицу метрик на Summary — компактная серая строка под главным
числом перерыва, не отдельная страница. Добавлен 1 новый интеграционный
тест (`test_metrics_include_outage_quality_detail`).

## 11. Final Acceptance Matrix

Расширена двумя новыми строками с реальными числами из §7-8: «Минимальный
кандидат для штатного режима (N=44)» и «Устойчивый к N-1 кандидат
(N=46)» — с полными Normal/Outages/ISL2000/N-1/N-2/запас/резерв/ISL.
Плюс новый компонент `DeploymentSizeRecommendation` на `/summary` — три
кандидата (44/46/48) бок о бок с одинаковым набором проверок каждому.

## 12. Рекомендация (без произвольного score)

- **Минимум ресурсов**: N=44 — 90,14 % штатный worst, но N-1 FAIL (после
  худшего одиночного отказа ≈86,8 % — ниже target).
- **Устойчив к одному отказу**: N=46 — 93,33 % штатный worst, N-1 PASS
  ровно по границе (90,00 %), но N-2 всё ещё FAIL.
- **Максимальный резерв**: полная группировка (48) — единственный
  вариант, проходящий И N-1, И N-2 среди проверенных.

Решение зависит от приоритета заказчика (число спутников vs
гарантированная устойчивость к 1-2 отказам) — инструмент показывает
компромисс, не выбирает за пользователя.

## 13. Frontend — визуальные изменения

Сделано (CSS-token уровень, не редизайн с нуля): добавлен очень мягкий
двухугловой cyan-radial-gradient поверх `.bg-workspace` (deep navy база
уже существовала и была тщательно продумана в прошлых сессиях —
`--background: #081722`, `--workspace: #0b1e2b`, `--card: #102938`,
мягкие borders `rgba(121,185,211,0.16)`). Проверено вживую в браузере —
эффект едва заметен, как и задумано («subtle illumination», не neon glow).

**Честно не сделано**: полноценная per-page визуальная реструктуризация
(явные page headers с контекстом на каждой странице, перестройка
иерархии карточек, unified progress UX для всех тяжёлых job'ов) — учитывая
уже качественный существующий design-system и явный риск регрессий на
множестве страниц при ограниченном оставшемся времени сессии, решено не
трогать то, что уже работает хорошо, вместо рискованного масштабного
рефакторинга. Существующий тёмный «aerospace mission control» стиль уже
соответствует направлению из ТЗ (deep navy, blue-gray surfaces, compact
data UI) — не «старая admin panel» и не «яркий sci-fi».

## 14. Optimizer

Проверено вживую в Docker-браузере: все 5 вкладок (Поиск RAAN/phase, План
развёртывания, Порог размера, Дальность ISL, Ресурсы и экономика)
переключаются и работают. Acceptance Matrix — внизу страницы, после
результатов, как и было.

## 15. Summary

Проверено: новый блок «Выбор размера группировки» перед Acceptance
Matrix; outage quality detail в таблице метрик по клиентам; персистентные
результаты Resilience/Optimizer корректно отображаются после
Docker-рестарта фронтенда (localStorage переживает пересборку контейнера,
так как том `/app` смонтирован, а localStorage — в браузере, не в
контейнере).

## 16. Compare

Проверено: список завершённых расчётов, кнопка «Сравнить» — работает,
без изменений в этой сессии (не требовалось).

## 17. Resilience

6 вкладок (Отказ, Критические аппараты, Порог отказоустойчивости, Monte
Carlo, Маршрутизация, Резервирование) — помещаются в один ряд без
переполнения, дополнительная группировка/scroll не потребовались.

## 18. Economics UI

Проверено вживую: переключатель «Только ресурсы» / «С оценкой стоимости»
— в resource-режиме сумма в рублях не показывается вообще (не «0 ₽»,
а полное отсутствие денежного блока с explicit-текстом «денежная оценка
не запрошена»); в cost-режиме — явная кнопка «Применить историческую
оценку» и видимая пометка источника/оговорки рядом с итоговой суммой
(960 000 000 ₽ для полной группировки при историческом пресете).

## 19. Persistence regression

Полный hard-reload (`navigate`, не SPA-переход) на `/optimizer` после
Docker-рестарта фронтенда — состояние восстановилось из localStorage
корректно, ошибок в консоли нет.

## 20. Backend tests

`uv run pytest`: **194 passed** (было 193 — добавлен 1 тест на outage
quality detail, ни один существующий тест не удалён и не изменён).
`uv run ruff check .`: **All checks passed**. `uv run mypy app`:
**Success, 64 source files** (было 69 — минус 5 удалённых файлов `db/`).

## 21. Frontend checks

`npx tsc --noEmit` — чисто. `npm run lint` (eslint) — чисто. `npm run
build` — успешно, все 5 маршрутов собраны статически.

## 22. Docker build

`docker compose build` — оба образа (`nord48-backend`, `nord48-frontend`)
собраны с нуля после `docker compose down`, включая обновлённые
`pyproject.toml`/`uv.lock` (без sqlalchemy/aiosqlite) — резолвится и
собирается чисто.

## 23. Docker runtime

`docker compose up -d` → `docker compose ps`: backend — **healthy**,
frontend — **Up**. Оба порта (`8000`, `3000`) проброшены на host.

## 24. URLs / health

- Frontend: http://localhost:3000 — `200`.
- Backend: http://localhost:8000/api/v1/health — `{"status":"ok",
  "service":"nord48-api"}`.
- API docs: http://localhost:8000/docs — `200`.
- `NEXT_PUBLIC_API_URL=http://localhost:8000` — браузер обращается к
  host-порту, не к внутреннему DNS-имени контейнера `backend` (которое
  браузеру недоступно) — проверено в network log: все запросы к
  `localhost:8000`, ни одного к `backend:8000` или иной путанице.

## 25. Browser manual checks

В Docker-окружении (не dev-сервер): запущено моделирование (POST
`/simulations/run` → 200), открыты Сводка/Сравнение/Устойчивость
(включая новую вкладку «Резервирование»)/Оптимизатор (все 5 вкладок) —
везде реальные данные, 0 сетевых ошибок за исключением ожидаемых
устаревших HMR-сообщений от предыдущей (уже закрытой) вкладки браузера
до пересборки контейнера — в свежей вкладке консоль абсолютно чистая.

## 26. Ограничения

- Полноценный визуальный редизайн по каждой странице — не сделан (см.
  §13); сделано целевое, низкорисковое CSS-дополнение.
- Outage quality P95/median/mean — подключены только к Summary
  (клиентские метрики), не дублированы в Resilience/Compare — по
  формулировке задания достаточно одного логичного места.
- `outagesWorstPercent`/`isl2000WorstPercent` для reference-строк
  «Current Normal Optimum»/«Denis Optimum»/«Constrained Robust Optimum» в
  Acceptance Matrix по-прежнему не дополнены новыми столбцами (запас/
  резерв/ISL/спутников) — эти анализы для них не запускались ни в этой,
  ни в прошлой сессии; показывается «—», не фабрикуется.
- Hybrid RAAN/phase refine не улучшил ни один из 4 протестированных
  жадных составов (см. §9) — это честный отрицательный результат, не
  ограничение реализации.
- Зависимость `nx`/пакеты сборки — не аудировались на предмет других
  неиспользуемых зависимостей сверх найденных `sqlalchemy`/`aiosqlite`
  (не было явного запроса на полный dependency audit, только на явно
  найденные dead-code artifacts).

## 27. git status

```
 M README.md
 M backend/.env.example
 M backend/README.md
 M backend/app/api/v1/optimization.py
 M backend/app/api/v1/resilience.py
 M backend/app/api/v1/router.py
 M backend/app/api/v1/simulations.py
 M backend/app/calculation/optimization/deployment_planner.py
 M backend/app/core/config.py
D  backend/app/db/__init__.py
D  backend/app/db/base.py
D  backend/app/db/models/__init__.py
D  backend/app/db/session.py
 M backend/app/models/simulation.py
 M backend/app/services/deployment_planner_service.py
 M backend/app/services/resilience_service.py
D  backend/app/services/routing_service.py
 M backend/pyproject.toml
 M backend/tests/integration/test_simulation_api.py
 M backend/tests/unit/test_deployment_planner.py
 M backend/uv.lock
 M docker-compose.yml
 M docs/api.md
 M docs/design-decision.md
 M docs/hackathon-requirements.md
 M frontend/src/app/globals.css
 M frontend/src/app/optimizer/page.tsx
 M frontend/src/app/resilience/page.tsx
D  frontend/src/components/{constellation,metrics,network,optimizer,
     resilience,simulation,timeline}/.gitkeep  (9 файлов)
 M frontend/src/components/optimizer/acceptance-matrix.tsx
 M frontend/src/components/summary/summary-workspace.tsx
D  frontend/src/entities/{ground-site,route,satellite,scenario,
     simulation-run}/.gitkeep  (5 файлов)
D  frontend/src/features/{comparison,optimization,resilience,routing,
     scenario-editor,scenario-upload,simulation}/.gitkeep  (7 файлов)
 M frontend/src/lib/acceptance-reference.ts
 M frontend/src/lib/api/deployment.ts
 M frontend/src/lib/api/resilience.ts
D  frontend/src/lib/utils/.gitkeep
D  frontend/src/store/.gitkeep
 M frontend/src/store/app-store.ts
D  frontend/src/types/.gitkeep
 M frontend/src/types/deployment.ts
 M frontend/src/types/simulation.ts
?? (28 новых файлов — backend-модули этого и прошлого этапа, тесты, docs,
     frontend-компоненты этого и прошлого этапа)
```

## 28. git diff --stat

```
31 files changed, 1074 insertions(+), 462 deletions(-)
```

(Из них ~373 «удалённых» строки в README.md — это переписывание файла с
нуля, компактнее прежнего v0.1-варианта, не потеря контента: старый
контент либо устарел, либо перенесён в docs/backend README/frontend
README.)

## Подтверждения

- **`reference_geometry.py` НЕ ИЗМЕНЁН** — `git diff --stat` по этому
  файлу пуст.
- **ML НЕ ИСПОЛЬЗОВАЛСЯ** — ни один ML-import не добавлен; каталог `ml/`
  не тронут.
- **COMMIT НЕ СОЗДАН** — `git log -3` показывает тот же HEAD (`f015c8f`),
  что был до начала этого этапа.
- **PUSH НЕ ВЫПОЛНЕН** — `git status -sb` показывает `main...origin/main`
  без «ahead»/«behind», расхождение только в незакоммиченных локальных
  изменениях.
