import { randomUUID } from 'node:crypto';
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
/** Куда вернуть покупателя после оплаты (адрес фронтенда). */
const FRONTEND = (() => {
  const raw = (process.env.FRONTEND_URL || (process.env.CORS_ORIGIN ?? '').split(',')[0] || '').trim();
  if (!raw) return '';
  try { return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).origin; } catch { return ''; }
})();
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
}
interface YkRefund { id: string; payment_id: string; status: string; amount?: { value: string; currency: string } }
interface OrderRow { id: string; user_id: number; plan: string; days: number; amount: string; currency: string; status: string; yk_id: string | null; confirmation_url: string | null }

const order = (id: string) => db.get<OrderRow>('SELECT * FROM payments WHERE id = ?', id);
const orderByYk = (ykId: string) => db.get<OrderRow>('SELECT * FROM payments WHERE yk_id = ?', ykId);

/** Создаёт платёж и возвращает ссылку на оплату. */
export async function createCheckout(user: { id: number; email: string; isPro: boolean; proUntil: string | null }, planId: string) {
  const info = billingInfo();
  if (!info.enabled) throw new BillingError(503, 'Оплата пока недоступна. Попробуйте позже.');
  // при действующем Pro новую подписку купить нельзя
  if (user.isPro) {
    const until = user.proUntil && Date.parse(user.proUntil) > Date.now() ? user.proUntil : null;
    throw new BillingError(409, isForever(until) ? 'У вас уже есть Pro навсегда.'
      : until ? `У вас уже есть активная подписка Pro до ${new Date(until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' })}. Новую можно будет оформить после её окончания.`
      : 'У вас уже есть активная подписка Pro.');
  }
  const plan = info.plans.find((p) => p.id === planId);
  if (!plan) throw new BillingError(400, 'Неизвестный тариф');

  const id = randomUUID();
  await db.run('INSERT INTO payments (id, user_id, plan, days, amount) VALUES (?, ?, ?, ?, ?)', id, user.id, plan.id, plan.days, plan.price);
  const item = (plan.days === 0 ? "Бессрочный доступ Pro" : `Подписка ${plan.title}`).slice(0, 128);
  const body = {
    amount: { value: plan.price, currency: 'RUB' },
    capture: true,
    confirmation: { type: 'redirect', return_url: `${FRONTEND}/payment/return?order=${id}` },
    description: `${item} (заказ ${id.slice(0, 8)})`.slice(0, 128),
    metadata: { order_id: id, user_id: String(user.id) },
    // чек по 54-ФЗ формирует ЮKassa («Чеки от ЮKassa»): нужны email покупателя и позиции с НДС
    receipt: {
      customer: { email: user.email },
      items: [{ description: item, quantity: '1.00', amount: { value: plan.price, currency: 'RUB' }, vat_code: VAT_CODE, payment_mode: 'full_payment', payment_subject: 'service' }],
      ...(TAX_SYSTEM ? { tax_system_code: TAX_SYSTEM } : {}),
    },
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
    return db.tx(async (t) => {
      const done = await t.run("UPDATE payments SET status = 'succeeded', paid_at = ? WHERE id = ? AND status IN ('new', 'pending')", new Date().toISOString(), o.id);
      if (done !== 1) return 'noop';    // уже обработан раньше
      const cur = (await t.get<{ pro_until: string | null }>('SELECT pro_until FROM users WHERE id = ? FOR UPDATE', o.user_id))?.pro_until;
      const base = Math.max(Date.now(), cur ? Date.parse(cur) || 0 : 0);        // если вдруг остался срок (две вкладки) — не теряем его
      const until = o.days === 0 || isForever(cur) ? FOREVER : new Date(base + o.days * 86_400_000).toISOString();
      await t.run('UPDATE users SET pro_until = ? WHERE id = ?', until, o.user_id);
      await t.run('INSERT INTO events (user_id, name, props) VALUES (?, ?, ?)', o.user_id, 'payment_succeeded', JSON.stringify({ plan: o.plan, amount: o.amount }));
      return 'activated' as const;
    });
  }
  if (p.status === 'canceled') {
    return (await db.run("UPDATE payments SET status = 'canceled' WHERE id = ? AND status IN ('new', 'pending')", o.id)) === 1 ? 'canceled' : 'noop';
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
