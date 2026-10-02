# Пианино с нуля — MVP

Платформа для самостоятельного обучения игре на пианино. Два независимых приложения в одном репозитории:

| Папка | Что это | Стек |
|---|---|---|
| `frontend/` | сайт (статика) | Vite + React + TypeScript + react-router |
| `backend/` | API: аккаунты, прогресс, серверный лимит Free | Node.js 22.13+, Express, SQLite (`node:sqlite`) |

Деплоятся раздельно, у каждого свой `package.json`.

## Локальный запуск
```
cd backend  && npm install && npm run dev     # API на :3001
cd frontend && npm install && npm run dev     # сайт на :5173 (запросы /api проксируются на :3001)
```

## Frontend (статическое приложение)
- Директория проекта: `frontend`
- Установка: `npm ci --include=dev` · Сборка: `npm run build` · Публикуемая папка: `dist`
- Переменные **на этапе сборки**:
  - `VITE_API_URL` — адрес бэкенда, например `https://api.example.ru` (без слеша)
  - `VITE_SITE_URL` — адрес сайта, например `https://app.example.ru` (для Open Graph)
- Нужен SPA-fallback: любой путь должен отдавать `index.html`.
- `npm run build:preview` — автономный демо-файл `piano-preview.html` (без сервера).

## Backend (Node.js / Express)
- Директория проекта: `backend`
- Установка: `npm ci` · Сборка: `npm run build` (проверка типов) · Запуск: `npm start` · Health-check: `/api/me`
- Переменные окружения:

| Переменная | Назначение |
|---|---|
| `CORS_ORIGIN` | адрес(а) фронта через запятую, например `https://app.example.ru` |
| `TRUST_PROXY=1` | если сервер за прокси с HTTPS |
| `DB_FILE` | путь к SQLite на постоянном диске (по умолчанию `data/piano.db`) |
| `COOKIE_SAMESITE` | `lax` (по умолчанию) или `none` — см. ниже |
| `APP_TZ` | часовой пояс суток лимита (по умолчанию `Europe/Moscow`) |
| `PORT` | порт (по умолчанию 3001) |
| `ALLOW_DEV_PRO=1` | разрешить тестовое включение Pro (в продакшене не включать) |
| `FREE_LIMIT_SECONDS` | переопределить лимит Free (для тестов) |

**Cookie входа.** Если фронт и бэк — поддомены одного сайта (`app.example.ru` и `api.example.ru`), оставьте `lax`. Если это разные сайты, нужен `COOKIE_SAMESITE=none` и HTTPS на обоих, но Safari и часть браузеров блокируют такие сторонние cookie — используйте поддомены одного домена.

## Общий контент
Бэкенду нужны id уроков, цепочки `prerequisites`, id песен, лимит и версия документов — они лежат в `backend/src/content.ts`. При изменении уроков, песен, лимита или `LEGAL_VERSION` во фронтенде запустите `cd backend && npm run check:sync` (нужен полный чекаут репозитория): он сообщит о рассинхроне.

## Лимит Free
Клиент отправляет секунды активности, сервер ограничивает их реально прошедшим временем между запросами аккаунта и считает сутки по `APP_TZ`. Очистка браузера, повторный вход и другое устройство лимит не сбрасывают.

## События воронки
`sqlite3 <DB_FILE> "select name, count(*) from events group by name"`

Юридические реквизиты и версия документов: `frontend/src/data/legal.ts`.
