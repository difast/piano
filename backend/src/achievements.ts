import { randomBytes } from 'node:crypto';
import { db } from './db.ts';
import { LESSONS } from './content.ts';
import { todayKey } from './progress.ts';
import { FRONTEND } from './config.ts';

/**
 * Кубки и челленджи. Всё считается на сервере по реальным данным (уроки, песни, время, заходы, друзья),
 * полученные кубки сохраняются — даже если позже, например, снять отметку с песни, кубок остаётся.
 */

type Metric = 'lessons' | 'streak' | 'songs' | 'hours' | 'friends' | 'challenges';
interface Milestone { id: string; at: number; title: string; desc: string }
export interface Track { id: Metric; title: string; icon: string; unit: string; milestones: Milestone[] }

const H = 3600;
export const TRACKS: Track[] = [
  { id: 'lessons', title: 'Уроки курса', icon: '📚', unit: 'уроков', milestones: [
    { id: 'lessons-1', at: 1, title: 'Первый шаг', desc: 'Пройти первый урок' },
    { id: 'lessons-5', at: 5, title: 'Разогрев', desc: 'Пройти 5 уроков' },
    { id: 'lessons-10', at: 10, title: 'Уверенный старт', desc: 'Пройти 10 уроков' },
    { id: 'lessons-15', at: 15, title: 'Половина пути позади', desc: 'Пройти 15 уроков' },
    { id: 'lessons-20', at: 20, title: 'Почти пианист', desc: 'Пройти 20 уроков' },
    { id: 'course', at: LESSONS.length, title: 'Выпускник курса', desc: 'Пройти весь курс' },
  ] },
  { id: 'streak', title: 'Заходы подряд', icon: '🔥', unit: 'дней', milestones: [
    { id: 'streak-3', at: 3, title: 'Три дня подряд', desc: 'Заходить на сайт 3 дня подряд' },
    { id: 'streak-7', at: 7, title: 'Неделя без пропусков', desc: 'Заходить на сайт 7 дней подряд' },
    { id: 'streak-30', at: 30, title: 'Месяц с музыкой', desc: 'Заходить на сайт 30 дней подряд' },
  ] },
  { id: 'songs', title: 'Выученные песни', icon: '🎵', unit: 'песен', milestones: [
    { id: 'songs-1', at: 1, title: 'Первая мелодия', desc: 'Выучить первую песню' },
    { id: 'songs-3', at: 3, title: 'Маленький репертуар', desc: 'Выучить 3 песни' },
    { id: 'songs-5', at: 5, title: 'Концертная программа', desc: 'Выучить 5 песен' },
  ] },
  { id: 'hours', title: 'Время занятий', icon: '⏱️', unit: 'часов', milestones: [
    { id: 'hours-1', at: 1, title: 'Первый час', desc: 'Заниматься 1 час в сумме' },
    { id: 'hours-5', at: 5, title: 'Упорство', desc: 'Заниматься 5 часов в сумме' },
    { id: 'hours-10', at: 10, title: 'Десять часов за инструментом', desc: 'Заниматься 10 часов в сумме' },
  ] },
  { id: 'friends', title: 'Рекомендации друзьям', icon: '🤝', unit: 'друзей', milestones: [
    { id: 'friends-1', at: 1, title: 'Позвал друга', desc: 'Друг зарегистрировался по вашей ссылке и прошёл первый урок' },
    { id: 'friends-3', at: 3, title: 'Своя компания', desc: '3 друга присоединились по вашей ссылке' },
    { id: 'friends-5', at: 5, title: 'Душа компании', desc: '5 друзей присоединились по вашей ссылке' },
  ] },
  { id: 'challenges', title: 'Челленджи', icon: '⚡', unit: 'выполнено', milestones: [
    { id: 'challenges-1', at: 1, title: 'Принял вызов', desc: 'Выполнить первый челлендж' },
    { id: 'challenges-5', at: 5, title: 'Охотник за целями', desc: 'Выполнить 5 челленджей' },
    { id: 'challenges-10', at: 10, title: 'Неудержимый', desc: 'Выполнить 10 челленджей' },
  ] },
];

// ---------- даты ----------
const shift = (day: string, d: number) => { const t = new Date(`${day}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
const mondayOf = (day: string) => { const wd = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7; return shift(day, -wd); };

/** Отмечаем заход за день (вызывается при загрузке приложения). */
export const recordVisit = (userId: number) => db.run('INSERT INTO visits (user_id, day) VALUES (?, ?) ON CONFLICT DO NOTHING', userId, todayKey());

/** Текущая серия заходов (если сегодня ещё не заходил — считаем до вчера) и лучшая серия. */
function streaks(days: string[], today: string) {
  const set = new Set(days);
  let cur = 0;
  for (let d = set.has(today) ? today : shift(today, -1); set.has(d); d = shift(d, -1)) cur++;
  let best = 0, run = 0, prev = '';
  for (const d of [...days].sort()) { run = prev && shift(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return { cur, best };
}

// ---------- приглашения ----------
export async function referralCode(userId: number): Promise<string> {
  const row = await db.get<{ ref_code: string | null }>('SELECT ref_code FROM users WHERE id = ?', userId);
  if (row?.ref_code) return row.ref_code;
  for (let i = 0; i < 5; i++) {
    const code = randomBytes(5).toString('base64url').replace(/[-_]/g, 'x').slice(0, 7).toLowerCase();
    try { if (await db.run('UPDATE users SET ref_code = ? WHERE id = ? AND ref_code IS NULL', code, userId)) return code; }
    catch { /* совпадение кода — пробуем ещё */ }
    const again = await db.get<{ ref_code: string | null }>('SELECT ref_code FROM users WHERE id = ?', userId);
    if (again?.ref_code) return again.ref_code;
  }
  throw new Error('не удалось создать код приглашения');
}
/** Друг засчитывается, когда зарегистрировался по ссылке и прошёл хотя бы один урок (защита от накрутки). */
const countFriends = async (userId: number) => Number((await db.get<{ n: number }>(
  'SELECT COUNT(*)::int AS n FROM users u WHERE u.referred_by = ? AND EXISTS (SELECT 1 FROM completed_lessons c WHERE c.user_id = u.id)', userId))?.n ?? 0);

/** Привязка нового пользователя к пригласившему (при регистрации). */
export async function attachReferral(newUserId: number, code: unknown) {
  if (typeof code !== 'string' || !/^[a-z0-9]{4,12}$/.test(code)) return;
  await db.run('UPDATE users SET referred_by = (SELECT id FROM users WHERE ref_code = ? AND id <> ?) WHERE id = ? AND referred_by IS NULL', code, newUserId, newUserId);
}

// ---------- челленджи ----------
interface Challenge { id: string; kind: 'day' | 'week'; title: string; desc: string; icon: string; target: number; unit: string; current: number; done: boolean; period: string; endsAt: string }

async function challenges(userId: number, today: string): Promise<Challenge[]> {
  const monday = mondayOf(today);
  const practice = await db.all<{ day: string; seconds: number }>('SELECT day, seconds FROM practice WHERE user_id = ? AND day >= ?', userId, monday);
  const todaySec = practice.find((p) => p.day === today)?.seconds ?? 0;
  const weekSec = practice.reduce((a, p) => a + p.seconds, 0);
  const weekDays = practice.filter((p) => p.seconds >= 60).length;
  const weekLessons = Number((await db.get<{ n: number }>('SELECT COUNT(*)::int AS n FROM completed_lessons WHERE user_id = ? AND completed_at >= ?', userId, monday))?.n ?? 0);
  const sunday = shift(monday, 6);
  const list: Omit<Challenge, 'done'>[] = [
    { id: 'day-10min', kind: 'day', title: 'Разминка дня', desc: 'Позанимайтесь сегодня 10 минут', icon: '☀️', target: 10, unit: 'мин', current: Math.min(10, Math.floor(todaySec / 60)), period: today, endsAt: today },
    { id: 'week-5days', kind: 'week', title: '5 дней за неделю', desc: 'Занимайтесь хотя бы минуту в 5 разных дней этой недели', icon: '📅', target: 5, unit: 'дн.', current: Math.min(5, weekDays), period: monday, endsAt: sunday },
    { id: 'week-60min', kind: 'week', title: 'Час музыки', desc: 'Наберите 60 минут занятий за неделю', icon: '🎹', target: 60, unit: 'мин', current: Math.min(60, Math.floor(weekSec / 60)), period: monday, endsAt: sunday },
    { id: 'week-3lessons', kind: 'week', title: 'Три урока', desc: 'Пройдите 3 урока за неделю', icon: '📖', target: 3, unit: 'ур.', current: Math.min(3, weekLessons), period: monday, endsAt: sunday },
  ];
  const out: Challenge[] = [];
  for (const c of list) {
    const done = c.current >= c.target;
    if (done) await db.run('INSERT INTO challenge_done (user_id, id, period) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', userId, c.id, c.period);
    out.push({ ...c, done });
  }
  return out;
}

// ---------- сводка ----------
export async function achievementsFor(userId: number) {
  const today = todayKey();
  const ch = await challenges(userId, today);   // сначала челленджи — они влияют на счётчик выполненных
  const visitDays = (await db.all<{ day: string }>('SELECT day FROM visits WHERE user_id = ? ORDER BY day', userId)).map((r) => r.day);
  const st = streaks(visitDays, today);
  const totalSec = Number((await db.get<{ s: number }>('SELECT COALESCE(SUM(seconds), 0)::int AS s FROM practice WHERE user_id = ?', userId))?.s ?? 0);
  const values: Record<Metric, { current: number; best: number }> = {
    lessons: { current: Number((await db.get<{ n: number }>('SELECT COUNT(*)::int AS n FROM completed_lessons WHERE user_id = ?', userId))?.n ?? 0), best: 0 },
    streak: { current: st.cur, best: st.best },
    songs: { current: Number((await db.get<{ n: number }>('SELECT COUNT(*)::int AS n FROM learned_songs WHERE user_id = ?', userId))?.n ?? 0), best: 0 },
    hours: { current: Math.floor((totalSec / H) * 10) / 10, best: 0 },
    friends: { current: await countFriends(userId), best: 0 },
    challenges: { current: Number((await db.get<{ n: number }>('SELECT COUNT(*)::int AS n FROM challenge_done WHERE user_id = ?', userId))?.n ?? 0), best: 0 },
  };
  // открываем заслуженные кубки (по текущему значению или лучшему результату — для серий)
  for (const t of TRACKS) {
    const v = Math.max(values[t.id].current, values[t.id].best);
    for (const m of t.milestones) if (v >= m.at) await db.run('INSERT INTO user_achievements (user_id, id) VALUES (?, ?) ON CONFLICT DO NOTHING', userId, m.id);
  }
  const got = new Map((await db.all<{ id: string; unlocked_at: string; seen: boolean }>('SELECT id, unlocked_at, seen FROM user_achievements WHERE user_id = ?', userId)).map((r) => [r.id, r]));
  const tracks = TRACKS.map((t) => ({
    id: t.id, title: t.title, icon: t.icon, unit: t.unit, current: values[t.id].current, best: values[t.id].best,
    max: t.milestones[t.milestones.length - 1].at,
    milestones: t.milestones.map((m) => ({ ...m, unlocked: got.has(m.id), unlockedAt: got.get(m.id)?.unlocked_at ?? null, isNew: got.has(m.id) && !got.get(m.id)!.seen })),
  }));
  const code = await referralCode(userId);
  return {
    tracks, challenges: ch,
    total: TRACKS.reduce((a, t) => a + t.milestones.length, 0), unlocked: got.size,
    referral: { code, link: `${FRONTEND || ''}/?ref=${code}`, friends: values.friends.current },
  };
}

export const markSeen = (userId: number, ids: string[]) =>
  ids.length ? db.run(`UPDATE user_achievements SET seen = TRUE WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`, userId, ...ids) : Promise.resolve(0);
