# Пианино с нуля — MVP

Веб-платформа для самостоятельного обучения игре на пианино.
Стек: Vite + React + TypeScript + react-router (фронтенд) и Node + Express + SQLite (минимальный бэкенд).

## Запуск
```
npm install
npm run dev      # разработка: API на :3001 + Vite на :5173 (прокси /api)
npm run build    # проверка типов (клиент и сервер) + production-сборка в dist/
npm start        # production: Express отдаёт dist/ с SPA-fallback и API (порт 3001)
```

Переменные окружения (все необязательны):
| Переменная | Назначение |
|---|---|
| `PORT` | порт (по умолчанию 3001) |
| `DB_FILE` | путь к SQLite-файлу (по умолчанию `data/piano.db`) |
| `SITE_URL` | публичный URL для Open Graph (иначе берётся из запроса) |
| `APP_TZ` | часовой пояс для суток лимита (по умолчанию `Europe/Moscow`) |
| `TRUST_PROXY=1` | если сервер за reverse proxy с HTTPS (для secure-cookie) |
| `ALLOW_DEV_PRO=1` | разрешить тестовое включение Pro в продакшене (по умолчанию выключено) |
| `FREE_LIMIT_SECONDS` | переопределить лимит Free (для тестов) |

Нужен Node.js 22.13+ (используется встроенный `node:sqlite`).

## Структура
- `src/data/course.ts`, `songs.ts` — контент (демо-данные). Уроки: `order`, `prerequisites`, `videoUrl`; песни: `status`, `coverUrl`, `notes`, `learningSteps`.
- `server/` — регистрация/вход (scrypt + httpOnly-сессия), прогресс, серверный лимит Free, события аналитики.
- `src/services/api.ts` — клиент API; `analytics.ts` — события воронки (подключаемые провайдеры); `billing.ts` — заглушка `PaymentProvider` (оплаты нет).
- `src/context/AppContext.tsx` — состояние пользователя и прогресса; `hooks/usePracticeTimer.ts` — активное время.
- `src/components/Piano.tsx`, `services/audio.ts` — пианино (WebAudio).

## Лимит Free
Клиент отправляет секунды активности, сервер ограничивает их реально прошедшим временем между запросами аккаунта и считает сутки по `APP_TZ`. Очистка браузера, повторный вход и другое устройство лимит не сбрасывают.

## Просмотр событий воронки
`sqlite3 data/piano.db "select name, count(*) from events group by name"`
