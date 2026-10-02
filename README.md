# Пианино с нуля — MVP

Веб-платформа для самостоятельного обучения игре на пианино. Стек: Vite + React + TypeScript + react-router.

```
npm install
npm run dev      # разработка
npm run build    # продакшн-сборка в dist/ (нужен SPA-fallback на index.html)
```

## Структура
- `src/data/course.ts` — уроки курса (поле `videoUrl` — сюда вставляются реальные видео).
- `src/data/songs.ts` — каталог песен (`coverUrl` — реальные обложки).
- `src/components/Piano.tsx` — виртуальное пианино (мышь, касание, физическая клавиатура).
- `src/services/audio.ts` — синтезатор на Web Audio.
- `src/context/AppContext.tsx` — прогресс, профиль, дневной лимит Free (15 мин).
- `src/hooks/usePracticeTimer.ts` — подсчёт активного времени занятий.
- `src/services/storage.ts`, `auth.ts` — сейчас localStorage; заменяются на API/бэкенд.
- `src/services/billing.ts` — интерфейс `PaymentProvider` под эквайринг Сбера (пока заглушка).

## Следующие шаги
Бэкенд (регистрация, хранение прогресса и статуса Pro), эквайринг Сбера + webhook, реальные видео.
В dev-режиме на странице «Профиль» есть кнопка переключения Pro для проверки.
