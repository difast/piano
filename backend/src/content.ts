/**
 * Минимальные данные контента, нужные серверу для проверок (порядок уроков, существование песен).
 * Бэкенд деплоится отдельно от фронтенда, поэтому свой экземпляр.
 * При изменении уроков/песен на фронтенде запустите `npm run check:sync` — он сравнит списки.
 */
export const FREE_DAILY_LIMIT_SEC = 15 * 60;

/** Версия юридических документов — записывается вместе с согласием. Совпадает с frontend/src/data/legal.ts */
export const LEGAL_VERSION = '2026-10-02';

export const LESSONS: { id: string; prerequisites: string[] }[] = Array.from({ length: 24 }, (_, i) => ({
  id: `l${i + 1}`,
  prerequisites: i === 0 ? [] : [`l${i}`],
}));

/**
 * Миграция курса с 12 на 24 урока: сколько новых уроков считать пройденными,
 * если пользователь подряд прошёл k старых уроков (индекс k-1).
 */
export const OLD_TO_NEW_COMPLETED = [1, 4, 6, 7, 8, 11, 14, 17, 19, 20, 22, 24];

export const SONG_IDS: string[] = [
  'interstellar', 'nuvole-bianche', 'ode-to-joy', 'twinkle', 'jingle',
  'fur-elise', 'moonlight', 'river-flows', 'clair-de-lune', 'liebestraum',
];
