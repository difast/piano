/**
 * Имитация серверного API для автономного демо (piano-preview.html).
 * Данные хранятся в localStorage браузера. В продакшен-сборку не попадает.
 */
import { LESSONS } from '../data/course';
import { SONGS } from '../data/songs';
import { FREE_DAILY_LIMIT_SEC } from '../data/config';

interface U { id: number; email: string; name: string; password: string; isPro: boolean; lessons: string[]; songs: string[]; practice: Record<string, number> }
interface DB { users: U[]; session: number | null }

const KEY = 'piano:preview-db';
const load = (): DB => { try { return JSON.parse(localStorage.getItem(KEY) || '') as DB; } catch { return { users: [], session: null }; } };
const save = (d: DB) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ } };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
const json = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function state(u: U) {
  const t = today();
  const todaySeconds = u.practice[t] ?? 0;
  return { completedLessons: u.lessons, learnedSongs: u.songs, history: u.practice, today: t, todaySeconds, limitSeconds: FREE_DAILY_LIMIT_SEC, limitReached: !u.isPro && todaySeconds >= FREE_DAILY_LIMIT_SEC };
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
