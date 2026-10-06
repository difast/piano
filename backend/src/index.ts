import express, { type Request, type Response } from 'express';
import { db } from './db.ts';
import { COOKIE, toAuthUser, createSession, destroySession, hashPassword, loadUser, rateLimit, requireUser, sessionHash, sessionToken, verifyPassword } from './auth.ts';
import { addActiveSeconds, getState } from './progress.ts';
import { FREE_SONG_IDS, LESSONS, LEGAL_VERSION, SONG_IDS } from './content.ts';
import { loadScores, pdfPath, publicScore } from './scores.ts';
import { createReadStream } from 'node:fs';
import { AccountError, confirmEmail, deleteAccount, getSettings, redeemCoupon, requestReset, resetPassword, saveSettings, sendVerification } from './account.ts';
import { mailEnabled, mails, sendMail, SUPPORT_EMAIL, verifyMail } from './mail.ts';
import { achievementsFor, attachReferral, markSeen, recordVisit, referralCode } from './achievements.ts';
import { FRONTEND } from './config.ts';
import { initPush, pushPublicKey, removePushSubscription, savePushSubscription, sendPush, songOfDay, startScheduler } from './notify.ts';
import { attachMarketing, MarketingError, recordClick } from './marketing.ts';
import { adminStatus, charts, checkAdminPassword, createAdminSession, dashboard, destroyAdminSession, errorsList, marketing, noStore, paymentsList, requireAdmin, setBlocked, usersList } from './admin.ts';
import { BillingError, autopayInfo, availablePlanIds, billingInfo, cancelAutopay, createCheckout, currentPlan, isYooKassaIp, orderStatus, processNotification, resumeAfterPayment } from './billing.ts';

const PROD = process.env.NODE_ENV === 'production';
const DEV_TOOLS = !PROD || process.env.ALLOW_DEV_PRO === '1';
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);

// Раздельный деплой: фронт на другом домене. CORS_ORIGIN — список разрешённых адресов фронта через запятую.
// Терпимо к опечаткам: без схемы добавляем https://, убираем слеш и путь, приводим к нижнему регистру.
function normalizeOrigin(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try { return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).origin.toLowerCase(); } catch { return null; }
}
const CORS_ORIGINS = (process.env.CORS_ORIGIN ?? '').split(',').map(normalizeOrigin).filter((o): o is string => !!o);
if (CORS_ORIGINS.length) console.log('CORS: разрешённые адреса фронта:', CORS_ORIGINS.join(', '));
else console.warn('CORS: переменная CORS_ORIGIN не задана — фронт на другом домене работать не сможет');
// lax — если фронт и бэк на одном сайте (например app.site.ru и api.site.ru); none — если на разных сайтах (нужен HTTPS)
const SAME_SITE = (['lax', 'strict', 'none'].includes(process.env.COOKIE_SAMESITE ?? '') ? process.env.COOKIE_SAMESITE : 'lax') as 'lax' | 'strict' | 'none';
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin.toLowerCase())) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  }
  next();
});
app.use(express.json({ limit: '32kb' }));
app.use(loadUser);

const api = express.Router();

// мутации принимают только JSON — базовая защита от CSRF вместе с SameSite=Lax
api.use((req, res, next) => {
  if (req.method !== 'GET' && !req.is('application/json')) { res.status(415).json({ error: 'Не удалось выполнить действие. Обновите страницу и попробуйте ещё раз.' }); return; }
  next();
});

const publicUser = (u: { id: number; email: string; name: string; isPro: boolean; proUntil: string | null; emailVerified?: boolean }) => ({ id: u.id, email: u.email, name: u.name, isPro: u.isPro, proUntil: u.proUntil, emailVerified: !!u.emailVerified });
const snapshot = async (req: Request) => ({ user: publicUser(req.user!), state: await getState(req.user!.id, req.user!.isPro), devTools: DEV_TOOLS });

/** Создаёт сессию: cookie (если браузер её примет) + токен в ответе, который фронт шлёт в заголовке Authorization. */
async function setSessionCookie(req: Request, res: Response, userId: number): Promise<string> {
  const { token, maxAgeMs } = await createSession(userId);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: SAME_SITE, secure: req.secure || SAME_SITE === 'none', maxAge: maxAgeMs, path: '/' });
  return token;
}

const BLOCKED_MSG = `Аккаунт заблокирован. Если это ошибка, напишите нам${SUPPORT_EMAIL ? ` на ${SUPPORT_EMAIL}` : ''}.`;
const isBlocked = async (userId: number) => !!(await db.get<{ b: string | null }>('SELECT blocked_at AS b FROM users WHERE id = ?', userId))?.b;

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
  if (await db.get('SELECT 1 FROM users WHERE email = ?', email)) { res.status(409).json({ error: 'Этот email уже зарегистрирован. Войдите в аккаунт.' }); return; }
  let id: number;
  try {
    id = (await db.get<{ id: number }>('INSERT INTO users (email, name, password_hash, consent_at, consent_version) VALUES (?, ?, ?, ?, ?) RETURNING id', email, name, await hashPassword(password), new Date().toISOString(), LEGAL_VERSION))!.id;
  } catch (e) {
    if ((e as { code?: string }).code === '23505') { res.status(409).json({ error: 'Этот email уже зарегистрирован. Войдите в аккаунт.' }); return; }   // гонка двух регистраций
    throw e;
  }
  const token = await setSessionCookie(req, res, id);
  req.user = { id, email, name, isPro: false, proUntil: null, emailVerified: false };
  await attachReferral(id, req.body?.ref);
  await attachMarketing(id, req.body?.mkt);   // пришёл по маркетинговой ссылке — запоминаем источник
  // письмо с подтверждением — в фоне, регистрация от него не зависит
  sendVerification(id, email).catch((e) => console.error('[mail] подтверждение:', (e as Error).message));
  res.status(201).json({ ...(await snapshot(req)), token });
});

api.post('/auth/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!rateLimit(`login:${req.ip}:${email}`)) { res.status(429).json({ error: 'Слишком много попыток. Попробуйте через минуту.' }); return; }
  const row = await db.get<{ id: number; email: string; name: string; isPro: number; proUntil: string | null; emailVerifiedAt: string | null; hash: string; blocked: string | null }>(
    'SELECT id, email, name, is_pro AS "isPro", pro_until AS "proUntil", email_verified_at AS "emailVerifiedAt", password_hash AS hash, blocked_at AS blocked FROM users WHERE email = ?', email);
  const ok = row ? await verifyPassword(String(req.body?.password ?? ''), row.hash) : false;
  if (!row || !ok) { res.status(401).json({ error: 'Неверный email или пароль' }); return; }
  if (row.blocked) { res.status(403).json({ error: BLOCKED_MSG, code: 'blocked' }); return; }
  const token = await setSessionCookie(req, res, row.id);
  req.user = toAuthUser(row);
  res.json({ ...(await snapshot(req)), token });
});

api.post('/auth/logout', async (req, res) => {
  await destroySession(sessionToken(req));
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

// 200 и для гостя — чтобы в консоли не было 401
api.get('/me', async (req, res) => {
  if (req.user) await recordVisit(req.user.id);   // заходы по дням — для серии и кубков
  res.json(req.user ? await snapshot(req) : { user: null });
});

// ---- Кубки, челленджи, приглашения ----
api.get('/achievements', requireUser, async (req, res) => { res.json(await achievementsFor(req.user!.id)); });
api.post('/achievements/seen', requireUser, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).filter((x): x is string => typeof x === 'string' && x.length < 40).slice(0, 50) : [];
  await markSeen(req.user!.id, ids); res.json({ ok: true });
});
api.get('/referral', requireUser, async (req, res) => {
  const code = await referralCode(req.user!.id);
  res.json({ code, link: `${FRONTEND || ''}/?ref=${code}` });
});

api.post('/lessons/:id/complete', requireUser, async (req, res) => {
  const lesson = LESSONS.find((l) => l.id === String(req.params.id));
  if (!lesson) { res.status(404).json({ error: 'Урок не найден' }); return; }
  const done = (await getState(req.user!.id, req.user!.isPro)).completedLessons;
  if (!lesson.prerequisites.every((p) => done.includes(p))) { res.status(403).json({ error: 'Сначала пройдите предыдущие уроки' }); return; }
  await db.run('INSERT INTO completed_lessons (user_id, lesson_id) VALUES (?, ?) ON CONFLICT DO NOTHING', req.user!.id, lesson.id);
  res.json(await snapshot(req));
});

// Сохраняем текущий этап незавершённого урока, чтобы продолжить с того же места на любом устройстве.
api.put('/lessons/:id/stage', requireUser, async (req, res) => {
  const lesson = LESSONS.find((l) => l.id === String(req.params.id));
  const stage = Math.floor(Number(req.body?.stage));
  if (!lesson) { res.status(404).json({ error: 'Урок не найден' }); return; }
  if (!Number.isFinite(stage) || stage < 0 || stage > 50) { res.status(400).json({ error: 'Некорректный этап' }); return; }
  const done = (await getState(req.user!.id, req.user!.isPro)).completedLessons;
  if (!done.includes(lesson.id) && !lesson.prerequisites.every((p) => done.includes(p))) { res.status(403).json({ error: 'Урок ещё закрыт' }); return; }
  await db.run(`INSERT INTO lesson_stage (user_id, lesson_id, stage) VALUES (?, ?, ?)
              ON CONFLICT(user_id, lesson_id) DO UPDATE SET stage = excluded.stage, updated_at = to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`, req.user!.id, lesson.id, stage);
  res.json({ ok: true });
});

api.put('/songs/:id/learned', requireUser, async (req, res) => {
  const songId = String(req.params.id);
  if (!SONG_IDS.includes(songId)) { res.status(404).json({ error: 'Песня не найдена' }); return; }
  if (req.body?.learned && !FREE_SONG_IDS.includes(songId) && !req.user!.isPro) { res.status(403).json({ error: 'Эта песня доступна на тарифе Pro', code: 'pro_required' }); return; }
  if (req.body?.learned) await db.run('INSERT INTO learned_songs (user_id, song_id) VALUES (?, ?) ON CONFLICT DO NOTHING', req.user!.id, songId);
  else await db.run('DELETE FROM learned_songs WHERE user_id = ? AND song_id = ?', req.user!.id, songId);
  res.json(await snapshot(req));
});

api.post('/practice/tick', requireUser, async (req, res) => {
  const seconds = Number(req.body?.seconds);
  if (!Number.isFinite(seconds) || seconds < 0) { res.status(400).json({ error: 'Некорректные данные' }); return; }
  res.json({ state: await addActiveSeconds(req.user!.id, req.user!.isPro, seconds) });
});

// Тестовое переключение Pro (оплаты пока нет). В продакшене выключено, если не задан ALLOW_DEV_PRO=1.
api.post('/dev/pro', requireUser, async (req, res) => {
  if (!DEV_TOOLS) { res.status(404).json({ error: 'Not found' }); return; }
  await db.run('UPDATE users SET is_pro = ? WHERE id = ?', req.body?.isPro ? 1 : 0, req.user!.id);
  req.user!.isPro = !!req.body?.isPro;
  res.json(await snapshot(req));
});

// ---- Почта: подтверждение, сброс и смена пароля ----
const accountError = (res: Response, e: unknown) => {
  if (e instanceof AccountError) { res.status(e.status).json({ error: e.message }); return true; }
  return false;
};

api.post('/auth/verify/send', requireUser, async (req, res) => {
  if (req.user!.emailVerified) { res.json({ ok: true, already: true }); return; }
  if (!rateLimit(`verify:${req.user!.id}`, 3, 10 * 60_000)) { res.status(429).json({ error: 'Письмо уже отправлено. Проверьте почту (и папку «Спам») или попробуйте через 10 минут.' }); return; }
  try {
    if (!(await sendVerification(req.user!.id, req.user!.email))) { res.status(503).json({ error: 'Отправка писем временно недоступна. Попробуйте позже.' }); return; }
    res.json({ ok: true });
  } catch (e) { console.error('[mail] подтверждение:', (e as Error).message); res.status(502).json({ error: 'Не удалось отправить письмо. Попробуйте позже.' }); }
});

api.post('/auth/verify', async (req, res) => {
  try { await confirmEmail(String(req.body?.token ?? '')); res.json({ ok: true }); }
  catch (e) { if (!accountError(res, e)) throw e; }
});

api.post('/auth/forgot', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) { res.status(400).json({ error: 'Введите корректный email' }); return; }
  if (!rateLimit(`forgot:${req.ip}`, 5, 10 * 60_000) || !rateLimit(`forgot:${email}`, 3, 10 * 60_000)) { res.status(429).json({ error: 'Слишком много запросов. Попробуйте через 10 минут.' }); return; }
  try { await requestReset(email); }
  catch (e) {
    if (accountError(res, e)) return;
    console.error('[mail] сброс пароля:', (e as Error).message); res.status(502).json({ error: 'Не удалось отправить письмо. Попробуйте позже.' }); return;
  }
  // одинаковый ответ, есть такой адрес или нет — чтобы нельзя было проверять чужие почты
  res.json({ ok: true });
});

api.post('/auth/reset', async (req, res) => {
  const password = String(req.body?.password ?? '');
  if (password.length < 8) { res.status(400).json({ error: 'Пароль должен быть не короче 8 символов' }); return; }
  if (password.length > 200) { res.status(400).json({ error: 'Пароль слишком длинный' }); return; }
  if (!rateLimit(`reset:${req.ip}`, 10, 10 * 60_000)) { res.status(429).json({ error: 'Слишком много попыток. Попробуйте позже.' }); return; }
  try {
    const userId = await resetPassword(String(req.body?.token ?? ''), await hashPassword(password));
    if (await isBlocked(userId)) { res.status(403).json({ error: BLOCKED_MSG, code: 'blocked' }); return; }
    const row = (await db.get<{ id: number; email: string; name: string; isPro: number; proUntil: string | null; emailVerifiedAt: string | null }>(
      'SELECT id, email, name, is_pro AS "isPro", pro_until AS "proUntil", email_verified_at AS "emailVerifiedAt" FROM users WHERE id = ?', userId))!;
    const token = await setSessionCookie(req, res, userId);
    req.user = toAuthUser(row);
    res.json({ ...(await snapshot(req)), token });
  } catch (e) { if (!accountError(res, e)) throw e; }
});

api.post('/me/password', requireUser, async (req, res) => {
  const current = String(req.body?.current ?? '');
  const password = String(req.body?.password ?? '');
  if (!rateLimit(`pwd:${req.user!.id}`, 5, 10 * 60_000)) { res.status(429).json({ error: 'Слишком много попыток. Попробуйте через 10 минут.' }); return; }
  const row = (await db.get<{ hash: string }>('SELECT password_hash AS hash FROM users WHERE id = ?', req.user!.id))!;
  if (!(await verifyPassword(current, row.hash))) { res.status(400).json({ error: 'Текущий пароль указан неверно' }); return; }
  if (password.length < 8) { res.status(400).json({ error: 'Новый пароль должен быть не короче 8 символов' }); return; }
  if (password.length > 200) { res.status(400).json({ error: 'Пароль слишком длинный' }); return; }
  if (password === current) { res.status(400).json({ error: 'Новый пароль совпадает с текущим' }); return; }
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(password), req.user!.id);
  // остальные устройства выходят, текущее остаётся в аккаунте
  await db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', req.user!.id, sessionHash(sessionToken(req) ?? ''));
  if (mailEnabled()) sendMail(req.user!.email, 'Пароль изменён', mails.passwordChanged()).catch((e) => console.error('[mail]', (e as Error).message));
  res.json({ ok: true });
});

// ---- Удаление аккаунта (с паролем) ----
api.post('/me/delete', requireUser, async (req, res) => {
  if (!rateLimit(`del:${req.user!.id}`, 5, 10 * 60_000)) { res.status(429).json({ error: 'Слишком много попыток. Попробуйте позже.' }); return; }
  const row = (await db.get<{ hash: string }>('SELECT password_hash AS hash FROM users WHERE id = ?', req.user!.id))!;
  if (!(await verifyPassword(String(req.body?.password ?? ''), row.hash))) { res.status(400).json({ error: 'Пароль указан неверно' }); return; }
  const email = req.user!.email;
  await deleteAccount(req.user!.id);
  res.clearCookie(COOKIE, { path: '/' });
  if (mailEnabled()) sendMail(email, 'Аккаунт удалён', mails.accountDeleted()).catch((e) => console.error('[mail]', (e as Error).message));
  res.json({ ok: true });
});

// ---- Настройки уведомлений и браузерные уведомления ----
api.get('/me/settings', requireUser, async (req, res) => {
  res.json({ settings: await getSettings(req.user!.id), emailVerified: req.user!.emailVerified, mailEnabled: mailEnabled(), pushKey: pushPublicKey(), songOfDay: songOfDay() });
});
api.put('/me/settings', requireUser, async (req, res) => {
  try { res.json({ settings: await saveSettings(req.user!.id, (req.body ?? {}) as Record<string, unknown>) }); }
  catch (e) { if (!accountError(res, e)) throw e; }
});
api.post('/push/subscribe', requireUser, async (req, res) => {
  try { await savePushSubscription(req.user!.id, req.body?.subscription); res.json({ ok: true }); }
  catch { res.status(400).json({ error: 'Не удалось включить уведомления в этом браузере' }); }
});
api.post('/push/unsubscribe', requireUser, async (req, res) => {
  await removePushSubscription(req.user!.id, String(req.body?.endpoint ?? '')); res.json({ ok: true });
});
api.post('/push/test', requireUser, async (req, res) => {
  if (!rateLimit(`pushtest:${req.user!.id}`, 3, 60_000)) { res.status(429).json({ error: 'Подождите минуту' }); return; }
  const n = await sendPush(req.user!.id, { title: 'Уведомления включены 🎹', body: 'Так будут выглядеть напоминания о занятиях.', url: '/profile', tag: 'test' });
  res.json({ ok: n > 0, delivered: n });
});
api.get('/song-of-day', (_req, res) => { res.json({ song: songOfDay() }); });

// ---- Поддержка ----
api.post('/support', async (req, res) => {
  const message = String(req.body?.message ?? '').trim();
  const email = (req.user?.email ?? String(req.body?.email ?? '').trim().toLowerCase());
  if (!rateLimit(`support:${req.user?.id ?? req.ip}`, 3, 10 * 60_000)) { res.status(429).json({ error: 'Вы уже отправили несколько сообщений. Попробуйте через 10 минут.' }); return; }
  if (!EMAIL_RE.test(email)) { res.status(400).json({ error: 'Укажите email, чтобы мы могли ответить' }); return; }
  if (message.length < 10) { res.status(400).json({ error: 'Опишите вопрос подробнее (хотя бы пару предложений)' }); return; }
  if (message.length > 4000) { res.status(400).json({ error: 'Сообщение слишком длинное (до 4000 символов)' }); return; }
  if (!mailEnabled() || !SUPPORT_EMAIL) { res.status(503).json({ error: `Отправка временно недоступна. Напишите нам на почту${SUPPORT_EMAIL ? ` ${SUPPORT_EMAIL}` : ''}.` }); return; }
  try {
    await sendMail(SUPPORT_EMAIL, `Поддержка: ${message.slice(0, 60).replace(/\s+/g, ' ')}`, mails.support(email, req.user?.name ?? '', req.user?.id ?? null, message), email);
    sendMail(email, 'Мы получили ваше сообщение', mails.supportCopy(message)).catch(() => undefined);
    await db.run('INSERT INTO events (user_id, name, props) VALUES (?, ?, ?)', req.user?.id ?? null, 'support_message', '{}');
    res.json({ ok: true });
  } catch (e) { console.error('[mail] поддержка:', (e as Error).message); res.status(502).json({ error: 'Не удалось отправить сообщение. Попробуйте позже.' }); }
});

// ---- Купоны ----
api.post('/coupons/redeem', requireUser, async (req, res) => {
  if (!rateLimit(`coupon:${req.user!.id}`, 5, 10 * 60_000)) { res.status(429).json({ error: 'Слишком много попыток. Попробуйте через 10 минут.' }); return; }
  try { const r = await redeemCoupon(req.user!.id, String(req.body?.code ?? '')); res.json({ ok: true, ...r }); }
  catch (e) { if (!accountError(res, e)) throw e; }
});

// ---- Оплата Pro через ЮKassa ----
api.get('/billing/plans', async (req, res) => {
  const info = billingInfo();
  const plans = info.enabled ? info.plans : [];
  res.json({
    enabled: info.enabled, plans, proUntil: req.user?.proUntil ?? null,
    // для вошедшего: текущий тариф и какие тарифы можно купить сейчас (при действующем Pro — только больше текущего)
    currentPlan: req.user ? await currentPlan(req.user.id) : null,
    available: await availablePlanIds(req.user, plans),
    // автопродление вошедшего пользователя (null — выключено)
    autopay: req.user ? await autopayInfo(req.user.id) : null,
  });
});

// Отключить автопродление: больше списаний не будет, Pro действует до конца оплаченного срока
api.post('/billing/autopay/cancel', requireUser, async (req, res) => {
  if (!rateLimit(`autopay:${req.user!.id}`, 10, 60_000)) { res.status(429).json({ error: 'Слишком много попыток. Попробуйте через минуту.' }); return; }
  await cancelAutopay(req.user!.id);
  res.json({ ok: true, autopay: null });
});

api.post('/billing/checkout', requireUser, async (req, res) => {
  if (!rateLimit(`pay:${req.user!.id}`, 6, 60_000)) { res.status(429).json({ error: 'Слишком много попыток. Попробуйте через минуту.' }); return; }
  try { res.json(await createCheckout(req.user!, String(req.body?.plan ?? ''))); }
  catch (e) { if (e instanceof BillingError) { res.status(e.status).json({ error: e.message }); return; } throw e; }
});

api.post('/billing/resume', async (req, res) => {
  if (!rateLimit(`resume:${req.ip}`, 10, 10 * 60_000)) { res.status(429).json({ error: 'Слишком много попыток. Попробуйте позже.' }); return; }
  try {
    const userId = await resumeAfterPayment(String(req.body?.order ?? ''), String(req.body?.r ?? ''));
    if (await isBlocked(userId)) { res.status(403).json({ error: BLOCKED_MSG, code: 'blocked' }); return; }
    const row = (await db.get<{ id: number; email: string; name: string; isPro: number; proUntil: string | null; emailVerifiedAt: string | null }>(
      'SELECT id, email, name, is_pro AS "isPro", pro_until AS "proUntil", email_verified_at AS "emailVerifiedAt" FROM users WHERE id = ?', userId))!;
    const token = await setSessionCookie(req, res, userId);
    req.user = toAuthUser(row);
    res.json({ ...(await snapshot(req)), token });
  } catch (e) { if (e instanceof BillingError) { res.status(e.status).json({ error: e.message }); return; } throw e; }
});

api.get('/billing/orders/:id', requireUser, async (req, res) => {
  try { res.json(await orderStatus(String(req.params.id), req.user!.id)); }
  catch (e) { if (e instanceof BillingError) { res.status(e.status).json({ error: e.message }); return; } throw e; }
});

// HTTP-уведомления ЮKassa (адрес указывается в личном кабинете: Интеграция → HTTP-уведомления)
api.post('/billing/yookassa', async (req, res) => {
  if (process.env.YOOKASSA_IP_CHECK === '1' && !isYooKassaIp(req.ip ?? '')) { res.status(403).json({ error: 'forbidden' }); return; }
  try { const r = await processNotification(req.body); console.log('[billing] уведомление:', req.body?.event, '→', r); res.status(200).json({ ok: true }); }
  catch (e) {
    if (e instanceof BillingError) { res.status(e.status).json({ error: e.message }); return; }
    console.error('[billing] ошибка обработки уведомления:', (e as Error).message);
    res.status(500).json({ error: 'temporary' });   // ЮKassa повторит уведомление позже
  }
});

// ---- Ноты. Каталог открыт всем, PDF отдаётся только вошедшему пользователю с активным Pro.
api.get('/scores', (_req, res) => { res.json({ scores: loadScores().map(publicScore) }); });

api.get('/scores/:id', (req, res) => {
  const e = loadScores().find((x) => x.id === String(req.params.id));
  if (!e) { res.status(404).json({ error: 'Ноты не найдены' }); return; }
  // на Free открыты для просмотра только отмеченные free; остальные — Pro
  if (!e.free && !req.user?.isPro) { res.status(403).json({ error: 'Эти ноты доступны на тарифе Pro', code: 'pro_required' }); return; }
  res.json({ score: publicScore(e) });
});

api.get('/scores/:id/download', requireUser, (req, res) => {
  const e = loadScores().find((x) => x.id === String(req.params.id));
  if (!e) { res.status(404).json({ error: 'Ноты не найдены' }); return; }
  if (!req.user!.isPro) { res.status(403).json({ error: 'Скачивание нот доступно на тарифе Pro', code: 'pro_required' }); return; }
  const file = pdfPath(e);
  if (!file) { res.status(404).json({ error: 'PDF для этого произведения пока не загружен' }); return; }
  const ascii = `${e.id}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(e.title)}.pdf`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  createReadStream(file).on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy(); }).pipe(res);
});

// ---- Маркетинговые ссылки: фронт на /go/<slug> записывает переход и сразу уводит на главную ----
api.post('/mkt/click', async (req, res) => {
  if (!rateLimit(`mkt:${req.ip}`, 30, 60_000)) { res.status(429).json({ error: 'Слишком много запросов' }); return; }
  try { res.json(await recordClick(req, (req.body ?? {}) as Record<string, unknown>)); }
  catch (e) { if (e instanceof MarketingError) { res.status(e.status).json({ error: e.message }); return; } throw e; }
});

// ---- Админ-кабинет: вход по паролю ADMIN_PASSWORD (или аккаунт из ADMIN_EMAILS), иначе 404 ----
api.post('/admin/login', noStore, async (req, res) => {
  // не больше 5 попыток за 15 минут с одного адреса и 30 в час всего
  if (!rateLimit(`admlogin:${req.ip}`, 5, 15 * 60_000) || !rateLimit('admlogin:all', 30, 3600_000)) { res.status(429).json({ error: 'Слишком много попыток. Попробуйте позже.' }); return; }
  if (!checkAdminPassword(req.body?.password)) {
    await new Promise((r) => setTimeout(r, 500));   // замедляем подбор
    res.status(401).json({ error: 'Неверный пароль' }); return;
  }
  res.json({ token: await createAdminSession() });
});
api.post('/admin/logout', noStore, async (req, res) => { await destroyAdminSession(req); res.json({ ok: true }); });
const admin = express.Router();
admin.use(noStore, requireAdmin);
admin.get('/me', (req, res) => { res.json({ email: res.locals.adminId ? req.user?.email : null }); });
admin.get('/dashboard', async (_req, res) => { res.json(await dashboard()); });
admin.get('/users', async (req, res) => { res.json(await usersList(req.query)); });
admin.post('/users/:id/block', async (req, res) => {
  const r = await setBlocked(Number(res.locals.adminId), Number(req.params.id), req.body?.blocked === true);
  if (r.status !== 200) { res.status(r.status).json({ error: r.error }); return; }
  res.json({ ok: true });
});
admin.get('/payments', async (req, res) => { res.json(await paymentsList(req.query)); });
admin.get('/marketing', async (req, res) => { res.json(await marketing(req.query, FRONTEND)); });
admin.get('/charts', async (req, res) => { res.json(await charts(req.query)); });
admin.get('/errors', async (req, res) => { res.json(await errorsList(req.query)); });
api.use('/admin', admin);

api.post('/events', async (req, res) => {
  const name = String(req.body?.name ?? '').slice(0, 64);
  if (!name) { res.status(400).json({ error: 'name required' }); return; }
  // ошибки интерфейса видны в логах сервера (для диагностики «белого экрана»)
  if (name === 'ui_error' || name === 'admin_error') console.error(`[${name}]`, JSON.stringify(req.body?.props ?? {}).slice(0, 1200));
  await db.run('INSERT INTO events (user_id, anon_id, name, props) VALUES (?, ?, ?, ?)',
    req.user?.id ?? null, String(req.body?.anonId ?? '').slice(0, 64) || null, name, JSON.stringify(req.body?.props ?? {}).slice(0, 1000));
  res.status(204).end();
});

api.use((_req, res) => { res.status(404).json({ error: 'Не найдено' }); });
app.use('/api', api);

// Корень отвечает простым статусом (удобно для проверки состояния и чтобы не видеть 404 при открытии адреса бэка)
app.get('/', (_req, res) => { res.json({ status: 'ok', service: 'piano-backend' }); });

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: unknown) => {
  const status = (err as { status?: number }).status;
  if (status && status >= 400 && status < 500) { res.status(status).json({ error: 'Не удалось выполнить действие. Обновите страницу и попробуйте ещё раз.' }); return; }
  console.error(err);
  res.status(500).json({ error: 'Что-то пошло не так. Попробуйте ещё раз чуть позже.' });
});

const port = Number(process.env.PORT) || 3001;
await initPush();
if (process.env.NOTIFY_SCHEDULER !== '0') startScheduler();
app.listen(port, async () => {
  console.log(`Server: http://localhost:${port}`);
  console.log(`Почта (SMTP): ${await verifyMail()}`);
  console.log(`Админ-кабинет: ${adminStatus()}`);
  const b = billingInfo();
  console.log(b.enabled ? `Оплата ЮKassa: включена (тарифов: ${b.plans.length})` : `Оплата ЮKassa: выключена — не заданы: ${b.missing.join(', ')}`);
});
