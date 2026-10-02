/**
 * Минимальные данные контента, нужные серверу для проверок (порядок уроков, существование песен).
 * Бэкенд деплоится отдельно от фронтенда, поэтому свой экземпляр.
 * При изменении уроков/песен на фронтенде запустите `npm run check:sync` — он сравнит списки.
 */
export const FREE_DAILY_LIMIT_SEC = 15 * 60;

/** Версия юридических документов — записывается вместе с согласием. Совпадает с frontend/src/data/legal.ts */
export const LEGAL_VERSION = '2026-10-02';

export const LESSONS: { id: string; prerequisites: string[] }[] = [
  { id: 'l1', prerequisites: [] },
  { id: 'l2', prerequisites: ['l1'] },
  { id: 'l3', prerequisites: ['l2'] },
  { id: 'l4', prerequisites: ['l3'] },
  { id: 'l5', prerequisites: ['l4'] },
  { id: 'l6', prerequisites: ['l5'] },
  { id: 'l7', prerequisites: ['l6'] },
  { id: 'l8', prerequisites: ['l7'] },
  { id: 'l9', prerequisites: ['l8'] },
  { id: 'l10', prerequisites: ['l9'] },
  { id: 'l11', prerequisites: ['l10'] },
  { id: 'l12', prerequisites: ['l11'] },
];

export const SONG_IDS: string[] = [
  'interstellar', 'nuvole-bianche', 'ode-to-joy', 'twinkle', 'jingle',
  'fur-elise', 'moonlight', 'river-flows', 'clair-de-lune', 'liebestraum',
];
