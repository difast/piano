import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';
import { sessionToken } from './auth.ts';
import { todayKey } from './progress.ts';
import { MARKETING_LINKS, UTM_KEYS } from './marketing.ts';
import { isForever } from './billing.ts';

/**
 * Админ-кабинет. Два способа входа (оба проверяет сервер, на клиенте секретов нет):
 *  1) пароль ADMIN_PASSWORD (переменная окружения сервера, не короче 12 символов) → токен админ-сессии на 12 часов;
 *  2) (необязательно) обычный аккаунт с email из ADMIN_EMAILS и подтверждённой почтой.
 * Без входа админ-API отвечает 404, как будто его нет.
 */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const RAW_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const ADMIN_PASSWORD = RAW_PASSWORD.length >= 12 ? RAW_PASSWORD : '';
export const adminStatus = () => (ADMIN_PASSWORD ? 'включён (вход по ADMIN_PASSWORD)' : RAW_PASSWORD ? 'пароль ADMIN_PASSWORD слишком короткий (нужно не меньше 12 символов) — вход по паролю выключен'
  : 'вход по паролю выключен — не задана ADMIN_PASSWORD') + (ADMIN_EMAILS.length ? `; вход по аккаунтам ADMIN_EMAILS: ${ADMIN_EMAILS.length}` : '');
const isAdminEmail = (email: string) => ADMIN_EMAILS.includes(email.toLowerCase());
const isAdminUser = (u: Request['user']) => !!u && u.emailVerified && isAdminEmail(u.email);

const sha = (s: string) => createHash('sha256').update(s).digest();
const ADMIN_TTL = 12 * 3600_000;
const TOKEN_PREFIX = 'adm_';
/** Сравнение пароля за постоянное время (по хешам одинаковой длины). */
export const checkAdminPassword = (pw: unknown) => !!ADMIN_PASSWORD && typeof pw === 'string' && pw.length <= 200 && timingSafeEqual(sha(pw), sha(ADMIN_PASSWORD));
export async function createAdminSession(): Promise<string> {
  const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
  await db.run('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)', sha(token).toString('hex'), Date.now() + ADMIN_TTL);
  return token;
}
export async function destroyAdminSession(req: Request) {
  const t = sessionToken(req);
  if (t?.startsWith(TOKEN_PREFIX)) await db.run('DELETE FROM admin_sessions WHERE token_hash = ?', sha(t).toString('hex'));
}
async function hasAdminSession(req: Request): Promise<boolean> {
  const t = sessionToken(req);
  if (!ADMIN_PASSWORD || !t?.startsWith(TOKEN_PREFIX) || t.length > 100) return false;
  const row = await db.get<{ exp: number }>('SELECT expires_at AS exp FROM admin_sessions WHERE token_hash = ?', sha(t).toString('hex'));
  return !!row && Number(row.exp) > Date.now();
}

export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
}
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    if (await hasAdminSession(req)) { res.locals.adminId = 0; next(); return; }
    if (isAdminUser(req.user)) { res.locals.adminId = req.user!.id; next(); return; }
    if (req.user && !req.user.emailVerified && isAdminEmail(req.user.email)) { res.status(403).json({ error: 'Подтвердите email этого аккаунта — после этого откроется доступ.', code: 'verify' }); return; }
    res.status(404).json({ error: 'Не найдено' });
  } catch (e) { next(e); }
}

// ---------- общие помощники ----------
const DAY = 86_400_000;
const dayOf = (iso: string | null | undefined) => (iso ? todayKey(new Date(iso)) : null);
const shiftDay = (day: string, d: number) => new Date(Date.parse(`${day}T12:00:00Z`) + d * DAY).toISOString().slice(0, 10);
const money = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;
/** Начало периода (день, включительно) для «7/30/90 дней» или null для «всё время». */
export const periodStart = (p: string, today = todayKey()) => (p === 'all' ? null : shiftDay(today, -(Number(p) - 1)));
export const PERIODS = ['7', '30', '90', 'all'];

const PLAN_TITLE: Record<string, string> = { 'pro-month': 'Pro · месяц', 'pro-year': 'Pro · год', 'pro-forever': 'Pro · навсегда' };

// ---------- пользователи ----------
export type SubStatus = 'active' | 'pending' | 'canceled' | 'expired' | 'error' | 'none';
interface UserRaw {
  id: number; email: string; created_at: string; blocked_at: string | null; is_pro: number; pro_until: string | null; email_verified_at: string | null;
  slug: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
  last_visit: string | null; last_practice: string | null;
  pay_total: string | null; pay_count: number; first_paid: string | null; coupon_at: string | null;
  last_amount: string | null; last_paid_at: string | null; last_plan: string | null; last_status: string | null;
  autopay_plan: string | null; autopay_card: string | null; autopay_since: string | null; autopay_fails: number;
}
export interface AdminUser {
  id: number; email: string; createdAt: string; emailVerified: boolean;
  account: 'active' | 'blocked'; plan: 'free' | 'pro'; planTitle: string; sub: SubStatus;
  subStart: string | null; subEnd: string | null; lastAmount: number | null; lastPaidAt: string | null; paidTotal: number; paidCount: number;
  lastActive: string | null; source: { slug: string; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null } | null;
  /** автопродление: тариф, карта, с какого момента, неудачных списаний подряд */
  autopay: { plan: string; planTitle: string; card: string | null; since: string | null; fails: number } | null;
}

function toAdminUser(r: UserRaw, now = Date.now()): AdminUser {
  const proActive = !!r.is_pro || (!!r.pro_until && Date.parse(r.pro_until) > now);
  const sub: SubStatus = proActive ? 'active'
    : r.last_status === 'pending' || r.last_status === 'new' ? 'pending'
      : r.last_status === 'canceled' ? 'error'
        : r.last_status === 'refunded' ? 'canceled'
          : r.pro_until ? 'expired' : 'none';
  const subStart = [r.first_paid, r.coupon_at].filter(Boolean).sort()[0] ?? null;
  return {
    id: r.id, email: r.email, createdAt: r.created_at, emailVerified: !!r.email_verified_at,
    account: r.blocked_at ? 'blocked' : 'active',
    plan: proActive ? 'pro' : 'free',
    planTitle: !proActive ? 'Free' : r.last_plan ? PLAN_TITLE[r.last_plan] ?? 'Pro' : r.pro_until ? 'Pro · купон' : 'Pro · вручную',
    sub, subStart, subEnd: r.pro_until ? (isForever(r.pro_until) ? 'forever' : r.pro_until) : null,
    lastAmount: r.last_amount ? money(r.last_amount) : null, lastPaidAt: r.last_paid_at,
    paidTotal: money(r.pay_total), paidCount: Number(r.pay_count ?? 0),
    lastActive: [r.last_visit, r.last_practice].filter(Boolean).sort().at(-1) ?? null,
    source: r.slug ? { slug: r.slug, utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign } : null,
    autopay: r.autopay_plan ? { plan: r.autopay_plan, planTitle: PLAN_TITLE[r.autopay_plan] ?? r.autopay_plan, card: r.autopay_card, since: r.autopay_since, fails: Number(r.autopay_fails ?? 0) } : null,
  };
}

async function loadUsers(): Promise<AdminUser[]> {
  const rows = await db.all<UserRaw>(`
    SELECT u.id, u.email, u.created_at, u.blocked_at, u.is_pro, u.pro_until, u.email_verified_at,
      u.autopay_plan, u.autopay_card, u.autopay_since, u.autopay_fails,
      c.slug, c.utm_source, c.utm_medium, c.utm_campaign,
      (SELECT max(day) FROM visits v WHERE v.user_id = u.id) AS last_visit,
      (SELECT max(day) FROM practice p WHERE p.user_id = u.id AND p.seconds > 0) AS last_practice,
      pay.total AS pay_total, pay.cnt AS pay_count, pay.first_paid, cu.coupon_at,
      lp.amount AS last_amount, lp.paid_at AS last_paid_at, lp.plan AS last_plan, la.status AS last_status
    FROM users u
    LEFT JOIN mkt_clicks c ON c.id = u.mkt_click_id
    LEFT JOIN LATERAL (SELECT SUM(amount::numeric)::text AS total, COUNT(*)::int AS cnt, MIN(paid_at) AS first_paid FROM payments WHERE user_id = u.id AND status = 'succeeded') pay ON TRUE
    LEFT JOIN LATERAL (SELECT amount, paid_at, plan FROM payments WHERE user_id = u.id AND status = 'succeeded' ORDER BY paid_at DESC LIMIT 1) lp ON TRUE
    LEFT JOIN LATERAL (SELECT status FROM payments WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) la ON TRUE
    LEFT JOIN LATERAL (SELECT MIN(used_at) AS coupon_at FROM coupon_uses WHERE user_id = u.id) cu ON TRUE
    ORDER BY u.id DESC`);
  const now = Date.now();
  return rows.map((r) => toAdminUser(r, now));
}

const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null);
const pageOf = (v: unknown) => Math.min(10_000, Math.max(1, Math.floor(Number(v)) || 1));
const PAGE = 50;

export async function usersList(q: Record<string, unknown>) {
  const search = typeof q.q === 'string' ? q.q.trim().toLowerCase().slice(0, 100) : '';
  const plan = pick(q.plan, ['free', 'pro'] as const);
  const sub = pick(q.sub, ['active', 'pending', 'canceled', 'expired', 'error', 'none'] as const);
  const account = pick(q.account, ['active', 'blocked'] as const);
  const source = pick(q.source, ['marketing', 'direct'] as const);
  const autopay = pick(q.autopay, ['on', 'off'] as const);
  const list = (await loadUsers()).filter((u) => (!search || u.email.includes(search) || String(u.id) === search)
    && (!plan || u.plan === plan) && (!sub || u.sub === sub) && (!account || u.account === account)
    && (!source || (source === 'marketing') === !!u.source) && (!autopay || (autopay === 'on') === !!u.autopay));
  const page = pageOf(q.page);
  return { total: list.length, page, pageSize: PAGE, users: list.slice((page - 1) * PAGE, page * PAGE) };
}

export async function setBlocked(adminId: number, userId: number, blocked: boolean) {
  if (!Number.isSafeInteger(userId) || userId <= 0) return { status: 400, error: 'Некорректный пользователь' };
  if (userId === adminId) return { status: 400, error: 'Нельзя заблокировать свой аккаунт' };
  const u = await db.get<{ email: string }>('SELECT email FROM users WHERE id = ?', userId);
  if (!u) return { status: 404, error: 'Пользователь не найден' };
  if (blocked && isAdminEmail(u.email)) return { status: 400, error: 'Нельзя заблокировать администратора' };
  await db.tx(async (t) => {
    await t.run('UPDATE users SET blocked_at = ? WHERE id = ?', blocked ? new Date().toISOString() : null, userId);
    if (blocked) await t.run('DELETE FROM sessions WHERE user_id = ?', userId);   // выходит со всех устройств
    await t.run('INSERT INTO events (user_id, name, props) VALUES (?, ?, ?)', userId, blocked ? 'admin_block' : 'admin_unblock', JSON.stringify({ by: adminId }));
  });
  return { status: 200 };
}

// ---------- платежи ----------
interface PaymentRaw {
  id: string; user_id: number | null; email: string | null; plan: string; days: number; amount: string; currency: string; status: string;
  yk_id: string | null; method: string | null; fail_reason: string | null; created_at: string; paid_at: string | null; recurring: boolean;
  slug: string | null; utm_source: string | null; utm_campaign: string | null;
}
const loadPayments = () => db.all<PaymentRaw>(`
  SELECT p.id, p.user_id, u.email, p.plan, p.days, p.amount, p.currency, p.status, p.yk_id, p.method, p.fail_reason, p.created_at, p.paid_at, p.recurring,
    c.slug, c.utm_source, c.utm_campaign
  FROM payments p LEFT JOIN users u ON u.id = p.user_id
  LEFT JOIN mkt_clicks c ON c.id = COALESCE(p.mkt_click_id, u.mkt_click_id)
  ORDER BY COALESCE(p.paid_at, p.created_at) DESC`);
const toPayment = (p: PaymentRaw) => ({
  id: p.id, ykId: p.yk_id, userId: p.user_id, email: p.email, plan: p.plan, planTitle: PLAN_TITLE[p.plan] ?? p.plan,
  amount: money(p.amount), currency: p.currency, status: p.status, date: p.paid_at ?? p.created_at, createdAt: p.created_at, paidAt: p.paid_at,
  provider: p.yk_id ? 'ЮKassa' : '—', method: p.method, failReason: p.fail_reason, recurring: !!p.recurring,
  source: p.slug ? { slug: p.slug, utm_source: p.utm_source, utm_campaign: p.utm_campaign } : null,
});
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAY_STATUSES = ['succeeded', 'pending', 'canceled', 'refunded'] as const;

export async function paymentsList(q: Record<string, unknown>) {
  const from = typeof q.from === 'string' && DAY_RE.test(q.from) ? q.from : null;
  const to = typeof q.to === 'string' && DAY_RE.test(q.to) ? q.to : null;
  const status = pick(q.status, PAY_STATUSES);
  const plan = pick(q.plan, ['pro-month', 'pro-year', 'pro-forever'] as const);
  const search = typeof q.q === 'string' ? q.q.trim().toLowerCase().slice(0, 100) : '';
  const list = (await loadPayments()).map(toPayment).filter((p) => {
    const d = dayOf(p.date)!;
    const st = p.status === 'new' ? 'pending' : p.status;
    return (!from || d >= from) && (!to || d <= to) && (!status || st === status) && (!plan || p.plan === plan)
      && (!search || (p.email ?? '').includes(search) || p.id.includes(search) || (p.ykId ?? '').includes(search));
  });
  const ok = list.filter((p) => p.status === 'succeeded');
  const page = pageOf(q.page);
  return {
    total: list.length, page, pageSize: PAGE, payments: list.slice((page - 1) * PAGE, page * PAGE),
    sum: { succeeded: money(ok.reduce((a, p) => a + p.amount, 0)), count: ok.length, currency: 'RUB' },
  };
}

// ---------- дашборд ----------
export async function dashboard() {
  const today = todayKey();
  const d7 = shiftDay(today, -6), d30 = shiftDay(today, -29);
  const users = await loadUsers();
  const pays = (await loadPayments()).map(toPayment);
  const reg = (from: string) => users.filter((u) => dayOf(u.createdAt)! >= from).length;
  const ok = pays.filter((p) => p.status === 'succeeded');
  const okFrom = (from: string) => { const l = ok.filter((p) => dayOf(p.paidAt)! >= from); return { count: l.length, sum: money(l.reduce((a, p) => a + p.amount, 0)) }; };
  const activeSince = (from: string) => users.filter((u) => u.lastActive && u.lastActive >= from).length;
  return {
    users: {
      total: users.length, today: reg(today), d7: reg(d7), d30: reg(d30),
      activeToday: activeSince(today), active7: activeSince(d7), active30: activeSince(d30),
      free: users.filter((u) => u.plan === 'free').length, pro: users.filter((u) => u.plan === 'pro').length,
      blocked: users.filter((u) => u.account === 'blocked').length,
    },
    payments: {
      count: ok.length, sum: money(ok.reduce((a, p) => a + p.amount, 0)), currency: 'RUB',
      today: okFrom(today), d7: okFrom(d7), d30: okFrom(d30),
      activeSubs: users.filter((u) => u.sub === 'active').length,
      autopay: users.filter((u) => u.autopay).length,
      canceledSubs: pays.filter((p) => p.status === 'refunded').length,
      failed: pays.filter((p) => p.status === 'canceled').length,
      pending: pays.filter((p) => p.status === 'pending' || p.status === 'new').length,
    },
    recentPayments: pays.slice(0, 10),
  };
}

// ---------- маркетинг и графики ----------
interface ClickRaw {
  id: number; slug: string; visitor_hash: string; created_at: string; user_id: number | null;
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null; utm_term: string | null;
  referrer: string | null; lang: string | null; device: string | null; os: string | null; browser: string | null; country: string | null; landing: string | null;
}
const loadClicks = () => db.all<ClickRaw>('SELECT * FROM mkt_clicks ORDER BY id DESC');
/** Регистрации и оплаты, привязанные к переходам. */
const loadAttributed = async () => ({
  users: await db.all<{ id: number; email: string; created_at: string; click: number }>('SELECT id, email, created_at, mkt_click_id AS click FROM users WHERE mkt_click_id IS NOT NULL'),
  payments: await db.all<{ amount: string; paid_at: string; user_id: number | null; click: number }>(
    `SELECT p.amount, p.paid_at, p.user_id, COALESCE(p.mkt_click_id, u.mkt_click_id) AS click
     FROM payments p LEFT JOIN users u ON u.id = p.user_id
     WHERE p.status = 'succeeded' AND COALESCE(p.mkt_click_id, u.mkt_click_id) IS NOT NULL`),
});

type Attributed = Awaited<ReturnType<typeof loadAttributed>>;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
/** Метрики по набору переходов: клики, уникальные, регистрации, оплаты, покупатели, выручка, конверсии (от уникальных посетителей). */
function metrics(clicks: ClickRaw[], att: Attributed) {
  const ids = new Set(clicks.map((c) => c.id));
  const regs = att.users.filter((u) => ids.has(u.click));
  const pays = att.payments.filter((p) => ids.has(p.click));
  const unique = new Set(clicks.map((c) => c.visitor_hash)).size;
  const payers = new Set(pays.map((p) => `${p.user_id ?? 'x'}:${p.click}`)).size;
  return {
    clicks: clicks.length, unique, registrations: regs.length, payments: pays.length, payers,
    revenue: money(pays.reduce((a, p) => a + Number(p.amount), 0)),
    convReg: pct(regs.length, unique), convPay: pct(payers, unique),
  };
}

const top = (clicks: ClickRaw[], key: keyof ClickRaw, n = 8) => {
  const m = new Map<string, number>();
  for (const c of clicks) { const k = String(c[key] ?? '—'); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
};

export async function marketing(q: Record<string, unknown>, frontend: string) {
  const period = pick(q.period, PERIODS) ?? '30';
  const slug = typeof q.slug === 'string' && MARKETING_LINKS.some((l) => l.slug === q.slug) ? q.slug : null;
  const today = todayKey();
  const start = periodStart(period, today);
  const all = (await loadClicks()).filter((c) => !slug || c.slug === slug);
  const att = await loadAttributed();
  const inPeriod = all.filter((c) => !start || dayOf(c.created_at)! >= start);
  const since = (d: string) => all.filter((c) => dayOf(c.created_at)! >= d).length;
  // разрез по UTM-меткам
  const groups = new Map<string, ClickRaw[]>();
  for (const c of inPeriod) {
    const key = JSON.stringify(UTM_KEYS.map((k) => c[k]));
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const byUtm = [...groups.entries()].map(([k, cs]) => ({ utm: Object.fromEntries(UTM_KEYS.map((u, i) => [u, (JSON.parse(k) as (string | null)[])[i]])), ...metrics(cs, att) }))
    .sort((a, b) => b.clicks - a.clicks).slice(0, 100);
  const userById = new Map(att.users.map((u) => [u.click, u]));
  const paidByClick = new Map<number, number>();
  for (const p of att.payments) paidByClick.set(p.click, money((paidByClick.get(p.click) ?? 0) + Number(p.amount)));
  return {
    period, slug,
    links: MARKETING_LINKS.map((l) => ({ ...l, url: `${frontend}/go/${l.slug}`, ...metrics(inPeriod.filter((c) => c.slug === l.slug), att) })),
    totals: {
      ...metrics(inPeriod, att),
      allTime: all.length, today: since(today), d7: since(shiftDay(today, -6)), d30: since(shiftDay(today, -29)),
    },
    byUtm,
    breakdown: {
      device: top(inPeriod, 'device'), os: top(inPeriod, 'os'), browser: top(inPeriod, 'browser'),
      country: top(inPeriod, 'country'), lang: top(inPeriod, 'lang'), referrer: top(inPeriod, 'referrer'), landing: top(inPeriod, 'landing'),
    },
    recent: inPeriod.slice(0, 50).map((c) => {
      const u = userById.get(c.id);
      return {
        id: c.id, at: c.created_at, slug: c.slug, utm: Object.fromEntries(UTM_KEYS.map((k) => [k, c[k]])),
        device: c.device, os: c.os, browser: c.browser, country: c.country, lang: c.lang, referrer: c.referrer,
        visitor: c.visitor_hash.slice(0, 8), registered: u ? { id: u.id, email: u.email } : null, revenue: paidByClick.get(c.id) ?? 0,
      };
    }),
  };
}

/** Ряды по дням (или по неделям, если период длиннее 120 дней) для графиков. */
export async function charts(q: Record<string, unknown>) {
  const period = pick(q.period, PERIODS) ?? '30';
  const today = todayKey();
  const [users, clicks, pays] = await Promise.all([
    db.all<{ at: string; click: number | null }>('SELECT created_at AS at, mkt_click_id AS click FROM users'),
    db.all<{ at: string; id: number; v: string }>('SELECT created_at AS at, id, visitor_hash AS v FROM mkt_clicks'),
    db.all<{ at: string; amount: string }>("SELECT paid_at AS at, amount FROM payments WHERE status = 'succeeded' AND paid_at IS NOT NULL"),
  ]);
  const first = [...users, ...clicks, ...pays].map((r) => dayOf(r.at)!).sort()[0] ?? today;
  const start = periodStart(period, today) ?? first;
  const days = Math.max(1, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY) + 1);
  const step = days > 120 ? 7 : 1;
  const buckets: string[] = [];
  for (let d = start; d <= today; d = shiftDay(d, step)) buckets.push(d);
  const idx = (iso: string) => { const d = dayOf(iso)!; if (d < start) return -1; return Math.min(buckets.length - 1, Math.floor((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY / step)); };
  const series = () => buckets.map(() => 0);
  const regs = series(), cl = series(), pc = series(), rev = series();
  for (const u of users) { const i = idx(u.at); if (i >= 0) regs[i]++; }
  for (const c of clicks) { const i = idx(c.at); if (i >= 0) cl[i]++; }
  for (const p of pays) { const i = idx(p.at); if (i >= 0) { pc[i]++; rev[i] = money(rev[i] + Number(p.amount)); } }
  // воронка за период: уникальные посетители по ссылкам → их регистрации → покупатели
  const periodClicks = clicks.filter((c) => dayOf(c.at)! >= start);
  const att = await loadAttributed();
  const m = metrics(periodClicks.map((c) => ({ id: c.id, visitor_hash: c.v }) as ClickRaw), att);
  return { period, step, days: buckets, registrations: regs, clicks: cl, payments: pc, revenue: rev, funnel: { clicks: m.clicks, unique: m.unique, registrations: m.registrations, payers: m.payers, revenue: m.revenue, convReg: m.convReg, convPay: m.convPay } };
}
