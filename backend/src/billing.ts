import { createHash, randomBytes, randomUUID } from 'node:crypto';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
import { db } from './db.ts';

/**
 * Оплата подписки Pro через ЮKassa (API v3).
 * Схема: создаём платёж (redirect на страницу оплаты ЮKassa, чек формирует ЮKassa по данным из запроса)
 * → ЮKassa присылает HTTP-уведомление → мы НЕ верим телу уведомления, а перезапрашиваем платёж по API
 * и только по его ответу продлеваем подписку (идемпотентно).
 */

export class BillingError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
class YkError extends Error {
  status: number; code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

const API = (process.env.YOOKASSA_API_URL ?? 'https://api.yookassa.ru/v3').replace(/\/$/, '');
const SHOP = (process.env.YOOKASSA_SHOP_ID ?? '').trim();
const KEY = (process.env.YOOKASSA_SECRET_KEY ?? '').trim();
import { FRONTEND } from './config.ts';
import { mailEnabled, mails, sendMail, SUPPORT_EMAIL } from './mail.ts';
/** Код НДС в чеке (1 — без НДС, 2 — 0%, 3 — 10%, 4 — 20% …). Зависит от системы налогообложения организации. */
const VAT_CODE = Number(process.env.YOOKASSA_VAT_CODE ?? 1);
/** Система налогообложения (1 ОСН, 2 УСН доход, 3 УСН доход-расход, …). Нужна только если в магазине их несколько. */
const TAX_SYSTEM = process.env.YOOKASSA_TAX_SYSTEM ? Number(process.env.YOOKASSA_TAX_SYSTEM) : null;

const DEFS = [
  { id: 'pro-month', title: 'Pro на месяц', days: 30, env: 'PRO_MONTH_PRICE' },
  { id: 'pro-year', title: 'Pro на год', days: 365, env: 'PRO_YEAR_PRICE' },
  { id: 'pro-forever', title: 'Pro навсегда', days: 0, env: 'PRO_FOREVER_PRICE' },   // days = 0 — бессрочно
] as const;

/** Дата окончания для бессрочного Pro (сравнивается как обычная дата). */
export const FOREVER = '2999-12-31T00:00:00.000Z';
export const isForever = (iso: string | null | undefined) => !!iso && iso >= '2900';

/** Старшинство тарифов: при действующем Pro можно перейти только на тариф выше. */
const RANK: Record<string, number> = { 'pro-month': 1, 'pro-year': 2, 'pro-forever': 3 };
const rank = (planId: string | null) => (planId ? RANK[planId] ?? 0 : 0);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }).replace(/\s?г\.$/, '');

/** Текущий тариф пользователя — последний оплаченный (и не возвращённый) заказ. Только если Pro ещё действует. */
export async function currentPlan(userId: number): Promise<string | null> {
  const u = await db.get<{ pro_until: string | null }>('SELECT pro_until FROM users WHERE id = ?', userId);
  if (!u?.pro_until || Date.parse(u.pro_until) <= Date.now()) return null;
  return (await db.get<{ plan: string }>("SELECT plan FROM payments WHERE user_id = ? AND status = 'succeeded' ORDER BY paid_at DESC LIMIT 1", userId))?.plan ?? null;
}

// ---------- автопродление ----------
// Сами автосписания включатся, когда ЮKassa подключит магазину рекуррентные платежи.
// Правила (они же в оферте): списание за сутки до окончания срока, напоминание за 3 дня до списания,
// при неудаче — до 3 попыток, затем автопродление отключается. Отключить можно в профиле в любой момент.
const DAY_MS = 86_400_000;
export const AUTOPAY_CHARGE_BEFORE = DAY_MS;
export const AUTOPAY_REMIND_BEFORE = 3 * DAY_MS;
export const AUTOPAY_MAX_FAILS = 3;
export const autopayChargeAt = (proUntil: string) => new Date(Date.parse(proUntil) - AUTOPAY_CHARGE_BEFORE).toISOString();

export interface AutopayInfo { plan: string; planTitle: string; amount: string | null; currency: string; card: string | null; since: string | null; chargeAt: string | null; demo: boolean }
const planTitle = (id: string) => DEFS.find((d) => d.id === id)?.title ?? 'Pro';

/** Автопродление пользователя (null — выключено). */
export async function autopayInfo(userId: number): Promise<AutopayInfo | null> {
  const r = await db.get<{ plan: string | null; card: string | null; since: string | null; until: string | null; method: string | null }>(
    'SELECT autopay_plan AS plan, autopay_card AS card, autopay_since AS since, pro_until AS until, autopay_method AS method FROM users WHERE id = ?', userId);
  if (!r?.plan) return null;
  const price = billingInfo().plans.find((p) => p.id === r.plan)?.price ?? null;
  return { plan: r.plan, planTitle: planTitle(r.plan), amount: price, currency: 'RUB', card: r.card, since: r.since,
    chargeAt: r.until && !isForever(r.until) && Date.parse(r.until) > Date.now() ? autopayChargeAt(r.until) : null, demo: r.method === DEMO_METHOD };
}

const AUTOPAY_OFF = 'autopay_plan = NULL, autopay_method = NULL, autopay_card = NULL, autopay_fails = 0, autopay_notice = NULL, autopay_last_try = NULL';
/** Тестовая карта для показа блока в профиле (скриншоты для ЮKassa): никогда не списывается. */
export const DEMO_METHOD = 'demo';

/** Пользователь отключил автопродление. Pro действует до конца оплаченного срока. */
export async function cancelAutopay(userId: number): Promise<boolean> {
  const done = await db.run(`UPDATE users SET ${AUTOPAY_OFF} WHERE id = ? AND autopay_plan IS NOT NULL`, userId);
  if (done !== 1) return false;
  await db.run('INSERT INTO events (user_id, name, props) VALUES (?, ?, ?)', userId, 'autopay_canceled', '{}');
  const u = await db.get<{ email: string; until: string | null }>('SELECT email, pro_until AS until FROM users WHERE id = ?', userId);
  if (u && mailEnabled()) sendMail(u.email, 'Карта отвязана', mails.autopayCanceled({ until: u.until ?? new Date().toISOString(), forever: isForever(u.until) }), SUPPORT_EMAIL || undefined)
    .catch((e) => console.error('[mail] автопродление отключено:', (e as Error).message));
  return true;
}

/**
 * Неудачное автосписание (вызывается кодом автосписаний): счётчик попыток, письмо,
 * после AUTOPAY_MAX_FAILS неудач автопродление отключается. Pro действует до конца оплаченного срока.
 */
export async function autopayFailed(userId: number): Promise<'retry' | 'disabled' | 'noop'> {
  const u = await db.get<{ email: string; plan: string | null; card: string | null; until: string | null; fails: number }>(
    'UPDATE users SET autopay_fails = autopay_fails + 1 WHERE id = ? AND autopay_plan IS NOT NULL RETURNING email, autopay_plan AS plan, autopay_card AS card, pro_until AS until, autopay_fails AS fails', userId);
  if (!u?.plan) return 'noop';
  const willRetry = u.fails < AUTOPAY_MAX_FAILS;
  const amount = billingInfo().plans.find((p) => p.id === u.plan)?.price ?? '0';
  if (!willRetry) await db.run(`UPDATE users SET ${AUTOPAY_OFF} WHERE id = ?`, userId);
  await db.run('INSERT INTO events (user_id, name, props) VALUES (?, ?, ?)', userId, 'autopay_failed', JSON.stringify({ attempt: u.fails, disabled: !willRetry }));
  if (mailEnabled()) sendMail(u.email, willRetry ? 'Не удалось продлить Pro' : 'Автопродление Pro отключено', mails.autopayFailed({ planTitle: planTitle(u.plan), amount, until: u.until ?? new Date().toISOString(), card: u.card, willRetry }), SUPPORT_EMAIL || undefined)
    .catch((e) => console.error('[mail] автосписание не прошло:', (e as Error).message));
  return willRetry ? 'retry' : 'disabled';
}

/** Тарифы, которые пользователь может купить сейчас. */
export async function availablePlanIds(user: { id: number; isPro: boolean; proUntil: string | null } | undefined, plans: { id: string }[]) {
  if (!user?.isPro) return plans.map((p) => p.id);
  if (isForever(user.proUntil)) return [];
  const cur = rank(await currentPlan(user.id));
  return plans.filter((p) => rank(p.id) > cur).map((p) => p.id);
}

function parsePrice(v?: string): string | null {
  if (!v) return null;
  const n = v.trim().replace(',', '.');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(n) || Number(n) <= 0) return null;
  return Number(n).toFixed(2);
}

export function billingInfo() {
  const plans = DEFS.map((d) => ({ id: d.id, title: d.title, days: d.days, price: parsePrice(process.env[d.env]), currency: 'RUB' }))
    .filter((p): p is typeof p & { price: string } => !!p.price);
  const missing: string[] = [];
  if (!SHOP) missing.push('YOOKASSA_SHOP_ID');
  if (!KEY) missing.push('YOOKASSA_SECRET_KEY');
  if (!FRONTEND) missing.push('FRONTEND_URL');
  if (!plans.length) missing.push('PRO_MONTH_PRICE, PRO_YEAR_PRICE или PRO_FOREVER_PRICE');
  return { enabled: missing.length === 0, plans, missing };
}

async function yk<T>(method: 'GET' | 'POST', path: string, body?: unknown, idempotenceKey?: string): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${SHOP}:${KEY}`).toString('base64'),
      'Content-Type': 'application/json',
      ...(idempotenceKey ? { 'Idempotence-Key': idempotenceKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let data: Record<string, unknown> | null = null;
  try { data = JSON.parse(text) as Record<string, unknown>; } catch { /* не JSON */ }
  if (!res.ok) throw new YkError(res.status, String(data?.code ?? 'error'), String(data?.description ?? text.slice(0, 200)));
  return data as T;
}

interface YkPayment {
  id: string; status: string; paid?: boolean; amount?: { value: string; currency: string };
  metadata?: Record<string, string>; confirmation?: { confirmation_url?: string };
  payment_method?: { type?: string; id?: string; saved?: boolean; title?: string; card?: { last4?: string; card_type?: string } };
  cancellation_details?: { party?: string; reason?: string };
}
interface YkRefund { id: string; payment_id: string; status: string; amount?: { value: string; currency: string } }
interface OrderRow { id: string; user_id: number; plan: string; days: number; amount: string; currency: string; status: string; yk_id: string | null; confirmation_url: string | null; recurring: boolean }

/** Чек по 54-ФЗ формирует ЮKassa («Чеки от ЮKassa»): нужны email покупателя и позиция с НДС. */
const receipt = (email: string, item: string, price: string) => ({
  customer: { email },
  items: [{ description: item, quantity: '1.00', amount: { value: price, currency: 'RUB' }, vat_code: VAT_CODE, payment_mode: 'full_payment', payment_subject: 'service' }],
  ...(TAX_SYSTEM ? { tax_system_code: TAX_SYSTEM } : {}),
});

/** Подпись сохранённого способа оплаты: «MasterCard •• 4444». */
function cardTitle(pm: NonNullable<YkPayment['payment_method']>): string {
  if (pm.card?.last4) return `${pm.card.card_type && pm.card.card_type !== 'Unknown' ? pm.card.card_type : 'Карта'} •• ${pm.card.last4}`.slice(0, 40);
  return (pm.title || (pm.type === 'yoo_money' ? 'ЮMoney' : pm.type === 'sbp' ? 'СБП' : 'Сохранённый способ оплаты')).slice(0, 40);
}

const order = (id: string) => db.get<OrderRow>('SELECT * FROM payments WHERE id = ?', id);
const orderByYk = (ykId: string) => db.get<OrderRow>('SELECT * FROM payments WHERE yk_id = ?', ykId);

/** Создаёт платёж и возвращает ссылку на оплату. */
export async function createCheckout(user: { id: number; email: string; isPro: boolean; proUntil: string | null }, planId: string) {
  const info = billingInfo();
  if (!info.enabled) throw new BillingError(503, 'Оплата пока недоступна. Попробуйте позже.');
  const plan = info.plans.find((p) => p.id === planId);
  if (!plan) throw new BillingError(400, 'Неизвестный тариф');
  // При действующем Pro можно купить только тариф больше текущего; он начнётся после окончания текущего (см. applyPayment).
  if (user.isPro) {
    const until = user.proUntil && Date.parse(user.proUntil) > Date.now() ? user.proUntil : null;
    if (isForever(until)) throw new BillingError(409, 'У вас уже есть Pro навсегда.');
    const current = await currentPlan(user.id);
    if (rank(plan.id) <= rank(current)) {
      const date = until ? ` до ${fmtDate(until)}` : '';
      throw new BillingError(409, `У вас уже есть активная подписка Pro${date}. Сейчас можно перейти только на тариф с бо́льшим сроком — он начнётся после окончания текущего.`);
    }
  }
  const id = randomUUID();
  const resume = randomBytes(24).toString('base64url');
  // источник (маркетинговый переход), с которым пользователь зарегистрировался, сохраняется и в платеже
  await db.run('INSERT INTO payments (id, user_id, plan, days, amount, resume_hash, mkt_click_id) VALUES (?, ?, ?, ?, ?, ?, (SELECT mkt_click_id FROM users WHERE id = ?))', id, user.id, plan.id, plan.days, plan.price, sha(resume), user.id);
  const item = (plan.days === 0 ? "Бессрочный доступ Pro" : `Подписка ${plan.title}`).slice(0, 128);
  // сохранение карты не запрашиваем: при подключённых автоплатежах ЮKassa сама покажет на форме галочку
  // «Запомнить данные карты», и если покупатель её отметит — в ответе придёт payment_method.saved = true
  const body = {
    amount: { value: plan.price, currency: 'RUB' },
    capture: true,
    confirmation: { type: 'redirect', return_url: `${FRONTEND}/payment/return?order=${id}&r=${resume}` },
    description: `${item} (заказ ${id.slice(0, 8)})`.slice(0, 128),
    metadata: { order_id: id, user_id: String(user.id) },
    // чек по 54-ФЗ формирует ЮKassa («Чеки от ЮKassa»): нужны email покупателя и позиции с НДС
    receipt: receipt(user.email, item, plan.price),
  };
  try {
    const p = await yk<YkPayment>('POST', '/payments', body, id);   // ключ идемпотентности = номер заказа
    const url = p.confirmation?.confirmation_url;
    if (!p.id || !url) throw new Error('ЮKassa не вернула ссылку на оплату');
    await db.run("UPDATE payments SET yk_id = ?, status = 'pending', confirmation_url = ? WHERE id = ?", p.id, url, id);
    return { orderId: id, url };
  } catch (e) {
    await db.run("UPDATE payments SET status = 'canceled' WHERE id = ?", id);
    console.error('[billing] не удалось создать платёж:', e instanceof YkError ? `${e.status} ${e.code}: ${e.message}` : (e as Error).message);
    throw new BillingError(502, 'Не удалось создать платёж. Попробуйте позже.');
  }
}

/** Применяет проверенное состояние платежа из API ЮKassa. Безопасно вызывать многократно. */
async function applyPayment(o: OrderRow, p: YkPayment): Promise<'activated' | 'canceled' | 'noop'> {
  // платёж обязан совпадать с заказом по id, сумме, валюте и метаданным
  if (!o.yk_id || p.id !== o.yk_id || p.amount?.value !== o.amount || p.amount?.currency !== o.currency || p.metadata?.order_id !== o.id) return 'noop';
  if (p.status === 'succeeded' && p.paid === true) {
    let mail: Parameters<typeof mails.proPaid>[0] | null = null;
    const r = await db.tx(async (t) => {
      const done = await t.run("UPDATE payments SET status = 'succeeded', paid_at = ?, method = ? WHERE id = ? AND status IN ('new', 'pending')", new Date().toISOString(), p.payment_method?.type?.slice(0, 40) ?? null, o.id);
      if (done !== 1) return 'noop';    // уже обработан раньше
      const cur = (await t.get<{ pro_until: string | null }>('SELECT pro_until FROM users WHERE id = ? FOR UPDATE', o.user_id))?.pro_until;
      const base = Math.max(Date.now(), cur ? Date.parse(cur) || 0 : 0);        // новый срок начинается после окончания текущего (переход на больший тариф, две вкладки)
      const until = o.days === 0 || isForever(cur) ? FOREVER : new Date(base + o.days * 86_400_000).toISOString();
      await t.run('UPDATE users SET pro_until = ? WHERE id = ?', until, o.user_id);
      await t.run('INSERT INTO events (user_id, name, props) VALUES (?, ?, ?)', o.user_id, 'payment_succeeded', JSON.stringify({ plan: o.plan, amount: o.amount }));
      const forever = until === FOREVER;
      const startsLater = !forever && base > Date.now() + 60_000 ? new Date(base).toISOString() : null;
      // автопродление
      const pm = p.payment_method;
      if (forever) await t.run(`UPDATE users SET ${AUTOPAY_OFF} WHERE id = ?`, o.user_id);   // «навсегда» — продлевать нечего
      else if (!o.recurring && pm?.saved === true && pm.id) {
        // покупатель отметил на форме ЮKassa «Запомнить данные карты» — включаем автопродление этого тарифа
        await t.run(`UPDATE users SET autopay_plan = ?, autopay_method = ?, autopay_card = ?, autopay_since = ?, autopay_fails = 0, autopay_notice = NULL, autopay_last_try = NULL WHERE id = ?`,
          o.plan, pm.id.slice(0, 100), cardTitle(pm), new Date().toISOString(), o.user_id);
        await t.run('INSERT INTO events (user_id, name, props) VALUES (?, ?, ?)', o.user_id, 'autopay_enabled', JSON.stringify({ plan: o.plan }));
      } else if (o.recurring) await t.run('UPDATE users SET autopay_fails = 0, autopay_last_try = NULL WHERE id = ?', o.user_id);
      // при включённом автопродлении в письме — дата и сумма следующего списания
      const ap = await t.get<{ plan: string | null; method: string | null }>('SELECT autopay_plan AS plan, autopay_method AS method FROM users WHERE id = ?', o.user_id);
      const apPrice = ap?.plan && ap.method !== DEMO_METHOD ? billingInfo().plans.find((x) => x.id === ap.plan)?.price : null;
      mail = { planTitle: DEFS.find((d) => d.id === o.plan)?.title ?? 'Pro', amount: o.amount, until, forever, startsLater, renewed: !!o.recurring,
        autopay: apPrice && !forever ? { chargeAt: autopayChargeAt(until), amount: apPrice } : null };
      return 'activated' as const;
    });
    // письмо об оплате — после фиксации в базе, в фоне (ЮKassa ждёт быстрый ответ на уведомление)
    if (r === 'activated' && mail && mailEnabled()) {
      const to = (await db.get<{ email: string }>('SELECT email FROM users WHERE id = ?', o.user_id))?.email;
      if (to) sendMail(to, o.recurring ? 'Pro продлён 👑' : 'Pro подключён 👑', mails.proPaid(mail), SUPPORT_EMAIL || undefined).catch((e) => console.error('[mail] оплата:', (e as Error).message));
    }
    return r;
  }
  if (p.status === 'canceled') {
    const done = (await db.run("UPDATE payments SET status = 'canceled', fail_reason = ?, method = COALESCE(?, method) WHERE id = ? AND status IN ('new', 'pending')",
      p.cancellation_details?.reason?.slice(0, 60) ?? null, p.payment_method?.type?.slice(0, 40) ?? null, o.id)) === 1;
    if (done && o.recurring) await autopayFailed(o.user_id);   // автосписание не прошло — письмо и повтор (или отключение)
    return done ? 'canceled' : 'noop';
  }
  return 'noop';
}

/** Полный возврат: подписка сокращается на срок заказа. Частичные возвраты обрабатываются вручную. */
async function applyRefund(o: OrderRow, r: YkRefund): Promise<boolean> {
  if (r.status !== 'succeeded' || r.payment_id !== o.yk_id || r.amount?.value !== o.amount) return false;
  return db.tx(async (t) => {
    const done = await t.run("UPDATE payments SET status = 'refunded' WHERE id = ? AND status = 'succeeded'", o.id);
    if (done !== 1) return false;
    const cur = (await t.get<{ pro_until: string | null }>('SELECT pro_until FROM users WHERE id = ? FOR UPDATE', o.user_id))?.pro_until;
    if (cur) {
      const left = o.days === 0 ? new Date().toISOString()                       // возврат «навсегда» — Pro заканчивается сейчас
        : isForever(cur) ? cur                                                     // при бессрочном Pro возврат срочного заказа срок не меняет
        : new Date(Math.max(Date.now(), Date.parse(cur) - o.days * 86_400_000)).toISOString();
      await t.run('UPDATE users SET pro_until = ? WHERE id = ?', left, o.user_id);
    }
    await t.run('INSERT INTO events (user_id, name, props) VALUES (?, ?, ?)', o.user_id, 'payment_refunded', JSON.stringify({ plan: o.plan, amount: o.amount }));
    // деньги вернули — автопродление выключаем, чтобы не списать снова
    await t.run(`UPDATE users SET ${AUTOPAY_OFF} WHERE id = ?`, o.user_id);
    return true;
  });
}

/** HTTP-уведомление ЮKassa. Телу не доверяем: состояние берём из API. */
export async function processNotification(body: unknown): Promise<string> {
  const b = body as { type?: string; event?: string; object?: { id?: string } } | null;
  if (!b || b.type !== 'notification' || typeof b.event !== 'string' || typeof b.object?.id !== 'string') throw new BillingError(400, 'Некорректное уведомление');
  const id = b.object.id;
  if (b.event.startsWith('payment.')) {
    const o = await orderByYk(id);
    if (!o) return 'ignored: неизвестный платёж';
    const p = await yk<YkPayment>('GET', `/payments/${encodeURIComponent(id)}`);
    return await applyPayment(o, p);
  }
  if (b.event === 'refund.succeeded') {
    const r = await yk<YkRefund>('GET', `/refunds/${encodeURIComponent(id)}`);
    const o = await orderByYk(r.payment_id);
    if (!o) return 'ignored: неизвестный платёж';
    return (await applyRefund(o, r)) ? 'refunded' : 'noop';
  }
  return 'ignored: событие не используется';
}

/** Статус заказа для страницы возврата. Если уведомление запаздывает — сами спрашиваем ЮKassa. */
export async function orderStatus(orderId: string, userId: number) {
  let o = await order(orderId);
  if (!o || o.user_id !== userId) throw new BillingError(404, 'Заказ не найден');
  if (o.status === 'pending' && o.yk_id) {
    try { await applyPayment(o, await yk<YkPayment>('GET', `/payments/${encodeURIComponent(o.yk_id)}`)); o = (await order(orderId))!; }
    catch (e) { console.error('[billing] сверка заказа не удалась:', (e as Error).message); }
  }
  const until = (await db.get<{ pro_until: string | null }>('SELECT pro_until FROM users WHERE id = ?', userId))?.pro_until ?? null;
  return { status: o.status, plan: o.plan, amount: o.amount, proUntil: until };
}

// ---- проверка источника уведомления (по желанию: YOOKASSA_IP_CHECK=1) ----
const CIDRS: [string, number][] = [['185.71.76.0', 27], ['185.71.77.0', 27], ['77.75.153.0', 25], ['77.75.154.128', 25]];
const EXACT = new Set(['77.75.156.11', '77.75.156.35']);
const ip4 = (s: string) => s.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
export function isYooKassaIp(raw: string): boolean {
  const ip = raw.replace(/^::ffff:/, '');
  if (ip.toLowerCase().startsWith('2a02:5180:')) return true;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
  if (EXACT.has(ip)) return true;
  return CIDRS.some(([base, bits]) => { const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0; return (ip4(ip) & mask) === (ip4(base) & mask); });
}

/**
 * Возврат с оплаты в «чужой» браузер (банковское приложение открыло ссылку в Safari, сайт был открыт с экрана «Домой» и т. п.):
 * одноразовый ключ из ссылки возврата восстанавливает вход. Действует 24 часа и один раз, только для своего заказа.
 */
export async function resumeAfterPayment(orderId: string, key: string): Promise<number> {
  if (!orderId || !key || key.length > 64) throw new BillingError(400, 'Ссылка недействительна');
  return db.tx(async (t) => {
    const o = await t.get<{ user_id: number | null; resume_hash: string | null; resume_used: boolean; created_at: string }>(
      'SELECT user_id, resume_hash, resume_used, created_at FROM payments WHERE id = ? FOR UPDATE', orderId);
    const fresh = o && Date.now() - Date.parse(o.created_at) < 24 * 3600_000;
    if (!o || !o.user_id || !o.resume_hash || o.resume_used || !fresh || o.resume_hash !== sha(key)) throw new BillingError(400, 'Войдите в аккаунт, чтобы увидеть статус оплаты');
    await t.run('UPDATE payments SET resume_used = TRUE WHERE id = ?', orderId);
    return o.user_id;
  });
}

// ---------- автосписания ----------
/** Пауза между попытками списания, если прошлая не удалась. */
export const AUTOPAY_RETRY_GAP = 8 * 3600_000;

/**
 * Раз в несколько минут (планировщик): списывает оплату за следующий период у подписок с автопродлением,
 * которым до окончания осталось меньше суток. Работает, только если ЮKassa подключила магазину автоплатежи
 * (иначе карт с автопродлением просто нет). Возвращает число запущенных списаний.
 */
export async function autopayChargeTick(now = Date.now()): Promise<number> {
  const info = billingInfo();
  if (!info.enabled) return 0;
  const iso = (ms: number) => new Date(ms).toISOString();
  // сверка: автосписания, по которым не пришло уведомление, — спрашиваем ЮKassa сами
  const stuck = await db.all<OrderRow>("SELECT * FROM payments WHERE recurring AND status = 'pending' AND yk_id IS NOT NULL AND created_at < ?", iso(now - 15 * 60_000));
  for (const o of stuck) {
    try { await applyPayment(o, await yk<YkPayment>('GET', `/payments/${encodeURIComponent(o.yk_id!)}`)); }
    catch (e) { console.error('[autopay] сверка не удалась:', (e as Error).message); }
  }
  const due = await db.all<{ id: number; email: string; plan: string; method: string }>(
    `SELECT u.id, u.email, u.autopay_plan AS plan, u.autopay_method AS method FROM users u
     WHERE u.autopay_plan IS NOT NULL AND u.autopay_method IS NOT NULL AND u.autopay_method <> ? AND u.blocked_at IS NULL
       AND u.pro_until IS NOT NULL AND u.pro_until < '2900' AND u.pro_until <= ? AND u.pro_until > ?
       AND (u.autopay_last_try IS NULL OR u.autopay_last_try < ?)
       AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.user_id = u.id AND p.recurring AND p.status IN ('new', 'pending'))`,
    DEMO_METHOD, iso(now + AUTOPAY_CHARGE_BEFORE), iso(now - 3 * DAY_MS), iso(now - AUTOPAY_RETRY_GAP));
  let started = 0;
  for (const u of due) {
    const plan = info.plans.find((p) => p.id === u.plan);
    if (!plan || plan.days === 0) { await db.run(`UPDATE users SET ${AUTOPAY_OFF} WHERE id = ?`, u.id); continue; }   // тариф больше не продаётся
    // занимаем попытку (защита от двойного списания)
    if ((await db.run('UPDATE users SET autopay_last_try = ? WHERE id = ? AND (autopay_last_try IS NULL OR autopay_last_try < ?)', iso(now), u.id, iso(now - AUTOPAY_RETRY_GAP))) !== 1) continue;
    const id = randomUUID();
    await db.run('INSERT INTO payments (id, user_id, plan, days, amount, recurring, mkt_click_id) VALUES (?, ?, ?, ?, ?, TRUE, (SELECT mkt_click_id FROM users WHERE id = ?))',
      id, u.id, plan.id, plan.days, plan.price, u.id);
    const item = `Продление подписки ${plan.title}`.slice(0, 128);
    try {
      const p = await yk<YkPayment>('POST', '/payments', {
        amount: { value: plan.price, currency: 'RUB' }, capture: true, payment_method_id: u.method,
        description: `${item} (заказ ${id.slice(0, 8)})`.slice(0, 128),
        metadata: { order_id: id, user_id: String(u.id), recurring: '1' },
        receipt: receipt(u.email, item, plan.price),
      }, id);
      await db.run("UPDATE payments SET yk_id = ?, status = 'pending' WHERE id = ?", p.id, id);
      started++;
      if (p.status === 'succeeded' || p.status === 'canceled') await applyPayment((await order(id))!, p);
    } catch (e) {
      // ЮKassa отклонила запрос (карта отвязана в банке, автоплатежи выключены у магазина и т. п.)
      const reason = e instanceof YkError ? e.code : 'error';
      console.error('[autopay] не удалось создать списание:', e instanceof YkError ? `${e.status} ${e.code}: ${e.message}` : (e as Error).message);
      await db.run("UPDATE payments SET status = 'canceled', fail_reason = ? WHERE id = ?", reason.slice(0, 60), id);
      await autopayFailed(u.id);
    }
  }
  return started;
}

/** Админка: показать в профиле пользователя тестовую карту (для скриншотов ЮKassa) или убрать её. Списаний по ней нет. */
export async function setDemoCard(userId: number, on: boolean): Promise<{ status: number; error?: string }> {
  const u = await db.get<{ method: string | null }>('SELECT autopay_method AS method FROM users WHERE id = ?', userId);
  if (!u) return { status: 404, error: 'Пользователь не найден' };
  if (u.method && u.method !== DEMO_METHOD) return { status: 409, error: 'У пользователя уже привязана настоящая карта' };
  if (on) await db.run("UPDATE users SET autopay_plan = 'pro-month', autopay_method = ?, autopay_card = 'Visa •• 4242', autopay_since = ?, autopay_fails = 0 WHERE id = ?", DEMO_METHOD, new Date().toISOString(), userId);
  else await db.run(`UPDATE users SET ${AUTOPAY_OFF} WHERE id = ? AND autopay_method = ?`, userId, DEMO_METHOD);
  return { status: 200 };
}
