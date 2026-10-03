/**
 * Имитация серверного API для автономного демо (piano-preview.html).
 * Данные хранятся в localStorage браузера. В продакшен-сборку не попадает.
 */
import { LESSONS } from '../data/course';
import { SONGS } from '../data/songs';
import { FREE_DAILY_LIMIT_SEC } from '../data/config';

interface U { id: number; email: string; name: string; password: string; isPro: boolean; lessons: string[]; songs: string[]; stages?: Record<string, number>; practice: Record<string, number> }

const SCORES = [
  { id: 'ode-to-joy', title: 'Ода к радости', composer: 'Л. ван Бетховен', difficulty: 'beginner', genre: 'Классика', description: 'Главная тема финала Девятой симфонии в облегчённом виде.', songId: 'ode-to-joy', pages: null, hasPdf: false },
  { id: 'minuet-in-g', title: 'Менуэт соль мажор', composer: 'К. Петцольд', difficulty: 'beginner', genre: 'Классика', description: 'Популярная пьеса для первых лет обучения.', songId: null, pages: null, hasPdf: false },
  { id: 'fur-elise', title: 'К Элизе', composer: 'Л. ван Бетховен', difficulty: 'intermediate', genre: 'Классика', description: 'Знаменитая багатель.', songId: 'fur-elise', pages: null, hasPdf: false },
];
interface DB { users: U[]; session: number | null }

const KEY = 'piano:preview-db';
// localStorage может быть заблокирован (изолированный просмотрщик) — тогда живём в памяти страницы
let mem: DB | null = null;
const load = (): DB => {
  if (mem) return mem;
  try { mem = JSON.parse(localStorage.getItem(KEY) || '') as DB; } catch { mem = { users: [], session: null }; }
  return mem;
};
const save = (d: DB) => { mem = d; try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ } };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
const json = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function state(u: U) {
  const t = today();
  const todaySeconds = u.practice[t] ?? 0;
  return { completedLessons: u.lessons, learnedSongs: u.songs, lessonStages: u.stages ?? {}, history: u.practice, today: t, todaySeconds, limitSeconds: FREE_DAILY_LIMIT_SEC, limitReached: !u.isPro && todaySeconds >= FREE_DAILY_LIMIT_SEC };
}
const snap = (u: U) => ({ user: { id: u.id, email: u.email, name: u.name, isPro: u.isPro }, state: state(u), devTools: true });

let lastTick = 0;

async function handle(path: string, body: Record<string, unknown>): Promise<Response> {
  const db = load();
  const me = db.users.find((u) => u.id === db.session);
  const need = (fn: (u: U) => Response) => { if (!me) return json(401, { error: 'Требуется вход в аккаунт' }); const r = fn(me); save(db); return r; };

  if (path === '/me') return json(200, me ? snap(me) : { user: null });
  if (path === '/auth/register') {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (body.consent !== true) return json(400, { error: 'Для регистрации необходимо дать согласие на обработку персональных данных' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(400, { error: 'Введите корректный email' });
    if (String(body.password ?? '').length < 8) return json(400, { error: 'Пароль должен быть не короче 8 символов' });
    if (db.users.some((u) => u.email === email)) return json(409, { error: 'Этот email уже зарегистрирован. Войдите в аккаунт.' });
    const u: U = { id: Date.now(), email, name: String(body.name ?? '').trim(), password: String(body.password), isPro: false, lessons: [], songs: [], practice: {} };
    db.users.push(u); db.session = u.id; save(db);
    return json(201, snap(u));
  }
  if (path === '/auth/login') {
    const u = db.users.find((x) => x.email === String(body.email ?? '').trim().toLowerCase());
    if (!u || u.password !== body.password) return json(401, { error: 'Неверный email или пароль' });
    db.session = u.id; save(db);
    return json(200, snap(u));
  }
  if (path === '/auth/logout') { db.session = null; save(db); return json(200, { ok: true }); }
  let m = /^\/lessons\/([^/]+)\/complete$/.exec(path);
  if (m) return need((u) => {
    const l = LESSONS.find((x) => x.id === m![1]);
    if (!l) return json(404, { error: 'Урок не найден' });
    if (!l.prerequisites.every((p) => u.lessons.includes(p))) return json(403, { error: 'Сначала пройдите предыдущие уроки' });
    if (!u.lessons.includes(l.id)) u.lessons.push(l.id);
    return json(200, snap(u));
  });
  m = /^\/songs\/([^/]+)\/learned$/.exec(path);
  if (m) return need((u) => {
    if (!SONGS.some((s) => s.id === m![1])) return json(404, { error: 'Песня не найдена' });
    u.songs = u.songs.filter((s) => s !== m![1]);
    if (body.learned) u.songs.push(m![1]);
    return json(200, snap(u));
  });
  if (path === '/practice/tick') return need((u) => {
    const now = Date.now();
    const elapsed = lastTick ? (now - lastTick) / 1000 : Infinity;
    const t = today();
    const used = u.practice[t] ?? 0;
    let add = Math.max(0, Math.min(Math.floor(Number(body.seconds) || 0), 15, Math.floor(elapsed + 2)));
    if (!u.isPro) add = Math.min(add, Math.max(0, FREE_DAILY_LIMIT_SEC - used));
    if (add > 0) { lastTick = now; u.practice[t] = used + add; }
    return json(200, { state: state(u) });
  });
  m = /^\/lessons\/([^/]+)\/stage$/.exec(path);
  if (m) return need((u) => { u.stages = { ...(u.stages ?? {}), [m![1]]: Math.max(0, Number(body.stage) || 0) }; return json(200, { ok: true }); });
  if (path === '/scores') return json(200, { scores: SCORES });
  m = /^\/scores\/([^/]+)(\/download)?$/.exec(path);
  if (m) {
    const sc = SCORES.find((x) => x.id === m![1]);
    if (!sc) return json(404, { error: 'Ноты не найдены' });
    if (!m[2]) return json(200, { score: sc });
    if (!me) return json(401, { error: 'Требуется вход в аккаунт' });
    if (!me.isPro) return json(403, { error: 'Скачивание нот доступно на тарифе Pro', code: 'pro_required' });
    return json(404, { error: 'PDF для этого произведения пока не загружен (демо)' });
  }
  if (path === '/billing/plans') return json(200, { enabled: false, plans: [], proUntil: null });
  if (path === '/dev/pro') return need((u) => { u.isPro = !!body.isPro; return json(200, snap(u)); });
  if (path === '/events') return json(204, null);
  return json(404, { error: 'Not found' });
}

export function installMockApi() {
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    if (!url.startsWith('/api/')) return real(input, init);
    let body: Record<string, unknown> = {};
    try { body = init?.body ? JSON.parse(String(init.body)) : {}; } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 120));
    return handle(url.slice(4), body);
  };
}
