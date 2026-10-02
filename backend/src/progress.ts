import { db } from './db.ts';
import { FREE_DAILY_LIMIT_SEC } from './content.ts';

export const LIMIT_SECONDS = Number(process.env.FREE_LIMIT_SECONDS) || FREE_DAILY_LIMIT_SEC;
const TZ = process.env.APP_TZ ?? 'Europe/Moscow';

/** Текущая дата YYYY-MM-DD в часовом поясе продукта: лимит сбрасывается в полночь по нему. */
export const todayKey = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export interface ProgressState {
  completedLessons: string[];
  learnedSongs: string[];
  /** сохранённый этап (с 0) в незавершённых уроках */
  lessonStages: Record<string, number>;
  history: Record<string, number>;
  today: string;
  todaySeconds: number;
  limitSeconds: number;
  limitReached: boolean;
}

export function getState(userId: number, isPro: boolean): ProgressState {
  const completedLessons = (db.prepare('SELECT lesson_id AS id FROM completed_lessons WHERE user_id = ? ORDER BY completed_at').all(userId) as { id: string }[]).map((r) => r.id);
  const learnedSongs = (db.prepare('SELECT song_id AS id FROM learned_songs WHERE user_id = ?').all(userId) as { id: string }[]).map((r) => r.id);
  const lessonStages = Object.fromEntries((db.prepare('SELECT lesson_id AS id, stage FROM lesson_stage WHERE user_id = ?').all(userId) as { id: string; stage: number }[]).map((r) => [r.id, r.stage]));
  const rows = db.prepare('SELECT day, seconds FROM practice WHERE user_id = ? ORDER BY day DESC LIMIT 60').all(userId) as { day: string; seconds: number }[];
  const history = Object.fromEntries(rows.map((r) => [r.day, r.seconds]));
  const today = todayKey();
  const todaySeconds = history[today] ?? 0;
  return { completedLessons, learnedSongs, lessonStages, history, today, todaySeconds, limitSeconds: LIMIT_SECONDS, limitReached: !isPro && todaySeconds >= LIMIT_SECONDS };
}

const MAX_CLAIM = 30; // секунд за один тик (клиент считает по реальному времени и может копить до 5–10 с)
const lastTick = new Map<number, number>();

/**
 * Начисляет активное время. Клиент заявляет секунды, но сервер ограничивает их
 * реально прошедшим временем с прошлого тика аккаунта (в т.ч. с других вкладок/устройств),
 * поэтому накрутить или обойти лимит нельзя.
 */
export function addActiveSeconds(userId: number, isPro: boolean, claimed: number): ProgressState {
  const now = Date.now();
  const elapsed = lastTick.has(userId) ? (now - lastTick.get(userId)!) / 1000 : Infinity;
  const day = todayKey();
  const used = (db.prepare('SELECT seconds FROM practice WHERE user_id = ? AND day = ?').get(userId, day) as { seconds: number } | undefined)?.seconds ?? 0;
  let add = Math.max(0, Math.min(Math.floor(claimed), MAX_CLAIM, Math.floor(elapsed + 2)));
  if (!isPro) add = Math.min(add, Math.max(0, LIMIT_SECONDS - used));
  if (add > 0) {
    lastTick.set(userId, now);
    db.prepare(
      `INSERT INTO practice (user_id, day, seconds) VALUES (?, ?, ?)
       ON CONFLICT(user_id, day) DO UPDATE SET seconds = seconds + excluded.seconds`,
    ).run(userId, day, add);
  }
  return getState(userId, isPro);
}
