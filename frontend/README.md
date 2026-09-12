# NORD-48 Frontend

Next.js (App Router) панель управления. Не выполняет орбитальных
расчётов — только отображает то, что вернул backend, через
`fetch(env.apiUrl + path)` (`src/lib/api/client.ts`).

## Стек

Next.js 16 (App Router, Turbopack), TypeScript, Tailwind CSS v4,
shadcn/ui, react-globe.gl + three.js, TanStack Query, Zustand
(с `persist` middleware), Recharts.

## Установка

```bash
npm install
```

## Запуск (dev)

```bash
npm run dev
```

Открыть http://localhost:3000. Backend должен быть запущен отдельно
(см. [backend/README.md](../backend/README.md)) — по умолчанию на
`http://localhost:8000`.

## Build

```bash
npm run build
npm run start
```

## Проверки

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Переменные окружения

`.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Адрес backend, к которому обращается БРАУЗЕР (не сервер Next.js) — в
Docker это host-адрес `localhost:8000` (порт проброшен наружу), а не
имя контейнера `backend` (контейнер-к-контейнеру DNS браузеру
недоступен). См. `docker-compose.yml` в корне репозитория.

## Маршруты

| Путь | Назначение |
| --- | --- |
| `/` | Моделирование — 3D-глобус, запуск расчёта, временная шкала. |
| `/summary` | Сводка — decision screen: метрики, устойчивость, Acceptance Matrix, рекомендация. |
| `/compare` | Сравнение 2–10 завершённых расчётов относительно baseline. |
| `/resilience` | Failure Lab, N-1, N-2, Monte Carlo, Routing Analysis, Redundancy. |
| `/optimizer` | Поиск RAAN/phase, Deployment Planner, Threshold Verification, ISL Sensitivity, Economics. |

## Состояние и персистентность

Весь UI-стейт (выбранный сценарий/вариант, стратегия, последний `run_id`,
результаты всех вкладок Resilience/Optimizer, выбор и baseline в Compare)
— в одном Zustand-сторе (`src/store/app-store.ts`) с `persist` middleware
(`localStorage`, ключ `nord48-app-store`) — переживает переход между
страницами и перезагрузку браузера. Не сохраняются: анимационные триггеры
и признаки открытых диалогов (страница должна открываться с закрытыми
диалогами). При изменении формы стора `STORE_VERSION` увеличивается —
несовместимые старые данные отбрасываются `migrate()`, а не мигрируются
вручную. Известное ограничение: если backend перезапущен, сохранённый
`run_id` может ссылаться на уже не существующий в памяти процесса
расчёт — обрабатывается как обычная ошибка API (баннер), не крашем.

## Структура

```
src/app/            маршруты (App Router)
src/components/     UI-компоненты, сгруппированы по разделу
src/hooks/          TanStack Query хуки (мутации/запросы)
src/lib/api/        тонкие клиенты поверх apiFetch, по одному на группу эндпоинтов
src/store/          единый Zustand-стор
src/types/          TypeScript-типы, зеркалящие backend-схемы
```
