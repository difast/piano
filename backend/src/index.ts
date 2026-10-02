import express, { type Request, type Response } from 'express';
import { db } from './db.ts';
import { COOKIE, createSession, destroySession, hashPassword, loadUser, rateLimit, readCookie, requireUser, verifyPassword } from './auth.ts';
import { addActiveSeconds, getState } from './progress.ts';
import { LESSONS, LEGAL_VERSION, SONG_IDS } from './content.ts';

const PROD = process.env.NODE_ENV === 'production';
const DEV_TOOLS = !PROD || process.env.ALLOW_DEV_PRO === '1';
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);

// Раздельный деплой: фронт на другом домене. CORS_ORIGIN — список разрешённых адресов фронта через запятую.
const CORS_ORIGINS = (process.env.CORS_ORIGIN ?? '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
// lax — если фронт и бэк на одном сайте (например app.site.ru и api.site.ru); none — если на разных сайтах (нужен HTTPS)
const SAME_SITE = (['lax', 'strict', 'none'].includes(process.env.COOKIE_SAMESITE ?? '') ? process.env.COOKIE_SAMESITE : 'lax') as 'lax' | 'strict' | 'none';
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  }
  next();
});
app.use(express.json({ limit: '10kb' }));
app.use(loadUser);

const api = express.Router();

// мутации принимают только JSON — базовая защита от CSRF вместе с SameSite=Lax
api.use((req, res, next) => {
  if (req.method !== 'GET' && !req.is('application/json')) { res.status(415).json({ error: 'Ожидается JSON' }); return; }
  next();
});

const publicUser = (u: { id: number; email: string; name: string; isPro: boolean }) => ({ id: u.id, email: u.email, name: u.name, isPro: u.isPro });
const snapshot = (req: Request) => ({ user: publicUser(req.user!), state: getState(req.user!.id, req.user!.isPro), devTools: DEV_TOOLS });

function setSessionCookie(req: Request, res: Response, userId: number) {
  const { token, maxAgeMs } = createSession(userId);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: SAME_SITE, secure: req.secure || SAME_SITE === 'none', maxAge: maxAgeMs, path: '/' });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

api.post('/auth/register', async (req, res) => {
  if (!rateLimit(`reg:${req.ip}`)) { res.status(429).json({ error: 'Слишком много попыток. Попробуйте через минуту.' }); return; }
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const name = String(req.body?.name ?? '').trim().slice(0, 60);
  if (req.body?.consent !== true) { res.status(400).json({ error: 'Для регистрации необходимо дать согласие на обработку персональных данных' }); return; }
  if (!EMAIL_RE.test(email)) { res.status(400).json({ error: 'Введите корректный email' }); return; }
  if (password.length < 8) { res.status(400).json({ error: 'Пароль должен быть не короче 8 символов' }); return; }
  if (password.length > 200) { res.status(400).json({ error: 'Пароль слишком длинный' }); return; }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) { res.status(409).json({ error: 'Этот email уже зарегистрирован. Войдите в аккаунт.' }); return; }
  const info = db.prepare("INSERT INTO users (email, name, password_hash, consent_at, consent_version) VALUES (?, ?, ?, datetime('now'), ?)").run(email, name, await hashPassword(password), LEGAL_VERSION);
  const id = Number(info.lastInsertRowid);
  setSessionCookie(req, res, id);
  req.user = { id, email, name, isPro: false };
  res.status(201).json(snapshot(req));
});

api.post('/auth/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!rateLimit(`login:${req.ip}:${email}`)) { res.status(429).json({ error: 'Слишком много попыток. Попробуйте через минуту.' }); return; }
  const row = db.prepare('SELECT id, email, name, is_pro AS isPro, password_hash AS hash FROM users WHERE email = ?').get(email) as
    { id: number; email: string; name: string; isPro: number; hash: string } | undefined;
  const ok = row ? await verifyPassword(String(req.body?.password ?? ''), row.hash) : false;
  if (!row || !ok) { res.status(401).json({ error: 'Неверный email или пароль' }); return; }
  setSessionCookie(req, res, row.id);
  req.user = { id: row.id, email: row.email, name: row.name, isPro: !!row.isPro };
  res.json(snapshot(req));
});

api.post('/auth/logout', (req, res) => {
  destroySession(readCookie(req, COOKIE));
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

// 200 и для гостя — чтобы в консоли не было 401
api.get('/me', (req, res) => res.json(req.user ? snapshot(req) : { user: null }));

api.post('/lessons/:id/complete', requireUser, (req, res) => {
  const lesson = LESSONS.find((l) => l.id === String(req.params.id));
  if (!lesson) { res.status(404).json({ error: 'Урок не найден' }); return; }
  const done = getState(req.user!.id, req.user!.isPro).completedLessons;
  if (!lesson.prerequisites.every((p) => done.includes(p))) { res.status(403).json({ error: 'Сначала пройдите предыдущие уроки' }); return; }
  db.prepare('INSERT OR IGNORE INTO completed_lessons (user_id, lesson_id) VALUES (?, ?)').run(req.user!.id, lesson.id);
  res.json(snapshot(req));
});

api.put('/songs/:id/learned', requireUser, (req, res) => {
  const songId = String(req.params.id);
  if (!SONG_IDS.includes(songId)) { res.status(404).json({ error: 'Песня не найдена' }); return; }
  if (req.body?.learned) db.prepare('INSERT OR IGNORE INTO learned_songs (user_id, song_id) VALUES (?, ?)').run(req.user!.id, songId);
  else db.prepare('DELETE FROM learned_songs WHERE user_id = ? AND song_id = ?').run(req.user!.id, songId);
  res.json(snapshot(req));
});

api.post('/practice/tick', requireUser, (req, res) => {
  const seconds = Number(req.body?.seconds);
  if (!Number.isFinite(seconds) || seconds < 0) { res.status(400).json({ error: 'Некорректные данные' }); return; }
  res.json({ state: addActiveSeconds(req.user!.id, req.user!.isPro, seconds) });
});

// Тестовое переключение Pro (оплаты пока нет). В продакшене выключено, если не задан ALLOW_DEV_PRO=1.
api.post('/dev/pro', requireUser, (req, res) => {
  if (!DEV_TOOLS) { res.status(404).json({ error: 'Not found' }); return; }
  db.prepare('UPDATE users SET is_pro = ? WHERE id = ?').run(req.body?.isPro ? 1 : 0, req.user!.id);
  req.user!.isPro = !!req.body?.isPro;
  res.json(snapshot(req));
});

api.post('/events', (req, res) => {
  const name = String(req.body?.name ?? '').slice(0, 64);
  if (!name) { res.status(400).json({ error: 'name required' }); return; }
  db.prepare('INSERT INTO events (user_id, anon_id, name, props) VALUES (?, ?, ?, ?)').run(
    req.user?.id ?? null, String(req.body?.anonId ?? '').slice(0, 64) || null, name, JSON.stringify(req.body?.props ?? {}).slice(0, 1000),
  );
  res.status(204).end();
});

api.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });
app.use('/api', api);

// Корень отвечает простым статусом (удобно для проверки состояния и чтобы не видеть 404 при открытии адреса бэка)
app.get('/', (_req, res) => { res.json({ status: 'ok', service: 'piano-backend' }); });

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: unknown) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`Server: http://localhost:${port}`));
