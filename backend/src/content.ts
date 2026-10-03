/**
 * Минимальные данные контента, нужные серверу для проверок (порядок уроков, существование песен).
 * Бэкенд деплоится отдельно от фронтенда, поэтому свой экземпляр.
 * При изменении уроков/песен на фронтенде запустите `npm run check:sync` — он сравнит списки.
 */
export const FREE_DAILY_LIMIT_SEC = 15 * 60;

/** Версия юридических документов — записывается вместе с согласием. Совпадает с frontend/src/data/legal.ts */
export const LEGAL_VERSION = '2026-10-03';

export const LESSONS: { id: string; prerequisites: string[] }[] = Array.from({ length: 24 }, (_, i) => ({
  id: `l${i + 1}`,
  prerequisites: i === 0 ? [] : [`l${i}`],
}));

/**
 * Миграция курса с 12 на 24 урока: сколько новых уроков считать пройденными,
 * если пользователь подряд прошёл k старых уроков (индекс k-1).
 */
export const OLD_TO_NEW_COMPLETED = [1, 4, 6, 7, 8, 11, 14, 17, 19, 20, 22, 24];

/** Песни, доступные на Free (остальные — Pro). Должно совпадать с frontend/src/data/config.ts. */
export const FREE_SONG_IDS: string[] = ['ode-to-joy', 'twinkle', 'jingle', 'fur-elise'];

/** Песни каталога (id, название, исполнитель) — для проверок и писем «композиция дня». */
export const SONGS_META: { id: string; title: string; artist: string }[] = [
  { id: 'interstellar', title: 'Interstellar (Main Theme)', artist: 'Hans Zimmer' },
  { id: 'nuvole-bianche', title: 'Nuvole Bianche', artist: 'Ludovico Einaudi' },
  { id: 'ode-to-joy', title: 'Ода к радости', artist: 'Л. ван Бетховен' },
  { id: 'twinkle', title: 'Twinkle, Twinkle, Little Star', artist: 'Народная' },
  { id: 'jingle', title: 'Jingle Bells', artist: 'Дж. Пирпонт' },
  { id: 'fur-elise', title: 'К Элизе', artist: 'Л. ван Бетховен' },
  { id: 'moonlight', title: 'Лунная соната (1 часть)', artist: 'Л. ван Бетховен' },
  { id: 'river-flows', title: 'River Flows in You', artist: 'Yiruma' },
  { id: 'clair-de-lune', title: 'Лунный свет', artist: 'К. Дебюсси' },
  { id: 'liebestraum', title: 'Любовный сон №3', artist: 'Ф. Лист' },
];
export const SONG_IDS: string[] = SONGS_META.map((s) => s.id);
