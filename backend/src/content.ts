/**
 * Минимальные данные контента, нужные серверу для проверок (порядок уроков, существование песен).
 * Бэкенд деплоится отдельно от фронтенда, поэтому свой экземпляр.
 * При изменении уроков/песен на фронтенде запустите `npm run check:sync` — он сравнит списки.
 */
export const FREE_DAILY_LIMIT_SEC = 15 * 60;

/** Версия юридических документов — записывается вместе с согласием. Совпадает с frontend/src/data/legal.ts */
export const LEGAL_VERSION = '2026-10-05';

/**
 * Порядок уроков курса (8 этапов по 5 уроков). id постоянные — на них завязан прогресс,
 * новые уроки l25–l40 вставлены в нужные места. Каждый урок открывается после предыдущего.
 * Должно совпадать с frontend/src/data/course.ts (npm run check:sync).
 */
const LESSON_ORDER = [
  'l1', 'l2', 'l3', 'l4', 'l5',
  'l6', 'l7', 'l8', 'l25', 'l9',
  'l10', 'l11', 'l12', 'l26', 'l27',
  'l13', 'l14', 'l15', 'l16', 'l17',
  'l28', 'l29', 'l30', 'l31', 'l32',
  'l18', 'l19', 'l20', 'l33', 'l34',
  'l21', 'l22', 'l23', 'l35', 'l24',
  'l36', 'l37', 'l38', 'l39', 'l40',
];
export const LESSONS: { id: string; prerequisites: string[] }[] = LESSON_ORDER.map((id, i) => ({
  id,
  prerequisites: i === 0 ? [] : [LESSON_ORDER[i - 1]],
}));

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
