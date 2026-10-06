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
// Правила (они же в оферте): списание за сутки до окончания срока; уведомление — не позднее чем за 3 дня
// до списания (отправляем за 4 дня, письма уходят только днём) и без отправленного уведомления не списываем;
// при неудаче — до 3 попыток с основной карты (раз в 8 часов), затем по одной попытке с каждой другой привязанной карты;
// если не прошло ни с одной — автопродление отключается. Карты удаляются в профиле по одной.
const DAY_MS = 86_400_000;
export const AUTOPAY_CHARGE_BEFORE = DAY_MS;
export const AUTOPAY_REMIND_BEFORE = 4 * DAY_MS;
/** Причины отказа, при которых повторять бессмысленно: карта отозвана, просрочена или ограничена. */
const FINAL_FAIL_REASONS = new Set(['permission_revoked', 'card_expired', 'payment_method_restricted', 'payment_method_limit_exceeded']);
export const AUTOPAY_MAX_FAILS = 3;
export const autopayChargeAt = (proUntil: string) => new Date(Date.parse(proUntil) - AUTOPAY_CHARGE_BEFORE).toISOString();

export interface SavedCard { id: number; title: string; primary: boolean; since: string }
export interface AutopayInfo { plan: string; planTitle: string; amount: string | null; currency: string; card: string | null; cards: SavedCard[]; since: string | null; chargeAt: string | null }
const planTitle = (id: string) => DEFS.find((d) => d.id === id)?.title ?? 'Pro';
/** Сколько карт можно привязать к аккаунту. */
export const MAX_CARDS = 5;

type Db = Pick<typeof db, 'get' | 'all' | 'run'>;
interface CardRow { id: number; user_id: number; method: string; title: string; is_primary: boolean; failed_cycle: string | null; created_at: string }
const cardsOf = (t: Db, userId: number) => t.all<CardRow>('SELECT * FROM user_cards WHERE user_id = ? ORDER BY is_primary DESC, id', userId);
/** Если основной карты нет (её удалили) — основной становится самая ранняя из оставшихся. */
async function ensurePrimary(t: Db, userId: number) {
  await t.run(`UPDATE user_cards SET is_primary = TRUE WHERE id = (SELECT id FROM user_cards WHERE user_id = ? ORDER BY id LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM user_cards WHERE user_id = ? AND is_primary)`, userId, userId);
}
/** Сохраняет карту (или обновляет подпись уже сохранённой). primary — сделать её основной. */
async function saveCard(t: Db, userId: number, pm: NonNullable<YkPayment['payment_method']>, primary: boolean) {
  const card = await t.get<{ id: number }>(`INSERT INTO user_cards (user_id, method, title) VALUES (?, ?, ?)
    ON CONFLICT (user_id, method) DO UPDATE SET title = EXCLUDED.title, failed_cycle = NULL RETURNING id`, userId, pm.id!.slice(0, 100), cardTitle(pm));
  if (primary) await t.run('UPDATE user_cards SET is_primary = (id = ?) WHERE user_id = ?', card!.id, userId);
  await ensurePrimary(t, userId);
  return card!.id;
}

/** Автопродление пользователя (null — выключено). */
export async function autopayInfo(userId: number): Promise<AutopayInfo | null> {
  const r = await db.get<{ plan: string | null; since: string | null; until: string | null; notice: string | null; noticed: string | null }>(
    'SELECT autopay_plan AS plan, autopay_since AS since, pro_until AS until, autopay_notice AS notice, autopay_amount AS noticed FROM users WHERE id = ?', userId);
  if (!r?.plan) return null;
  const cards = (await cardsOf(db, userId)).map((c) => ({ id: c.id, title: c.title, primary: c.is_primary, since: c.created_at }));
  // после напоминания сумма ближайшего списания зафиксирована — даже если цену тарифа уже поменяли
  const price = (r.notice && r.notice === r.until && r.noticed) || (billingInfo().plans.find((p) => p.id === r.plan)?.price ?? null);
  return { plan: r.plan, planTitle: planTitle(r.plan), amount: price, currency: 'RUB', card: cards.find((c) => c.primary)?.title ?? null, cards, since: r.since,
    chargeAt: r.until && !isForever(r.until) && Date.parse(r.until) > Date.now() ? autopayChargeAt(r.until) : null };
}

const AUTOPAY_OFF = 'autopay_plan = NULL, autopay_method = NULL, autopay_card = NULL, autopay_fails = 0, autopay_notice = NULL, autopay_amount = NULL, autopay_last_try = NULL';
/** Выключает автопродление и удаляет все сохранённые карты (возврат, «навсегда», все попытки списания не прошли). */
async function autopayOff(t: Db, userId: number) {
  await t.run(`UPDATE users SET ${AUTOPAY_OFF} WHERE id = ?`, userId);
  await t.run('DELETE FROM user_cards WHERE user_id = ?', userId);
}

/** Делает карту основной. */
export async function setPrimaryCard(userId: number, cardId: number): Promise<boolean> {
  return (await db.run('UPDATE user_cards SET is_primary = (id = ?) WHERE user_id = ? AND EXISTS (SELECT 1 FROM user_cards WHERE id = ? AND user_id = ?)', cardId, userId, cardId, userId)) > 0;
}

/**
 * Удаляет одну карту: данные для списаний с неё удаляются у нас (ЮKassa сообщать не нужно).
 * Удалили основную — основной становится следующая. Удалили последнюю — автопродление отключается.
 */
export async function removeCard(userId: number, cardId: number): Promise<'removed' | 'last' | 'noop'> {
  const r = await db.tx(async (t) => {
    const c = await t.get<{ title: string }>('DELETE FROM user_cards WHERE id = ? AND user_id = ? RETURNING title', cardId, userId);
    if (!c) return null;
    await ensurePrimary(t, userId);
    const left = Number((await t.get<{ n: number }>('SELECT COUNT(*)::int AS n FROM user_cards WHERE user_id = ?', userId))?.n ?? 0);
    if (!left) await t.run(`UPDATE users SET ${AUTOPAY_OFF} WHERE id = ?`, userId);
    return { title: c.title, last: !left };
  });
  if (!r) return 'noop';
  await db.run('INSERT INTO events (user_id, name, props) VALUES (?, ?, ?)', userId, 'card_removed', JSON.stringify({ last: r.last }));
  const u = await db.get<{ email: string; until: string | null }>('SELECT email, pro_until AS until FROM users WHERE id = ?', userId);
  if (u && mailEnabled()) sendMail(u.email, r.last ? 'Карта отвязана' : 'Карта удалена',
    r.last ? mails.autopayCanceled({ until: u.until ?? new Date().toISOString(), forever: isForever(u.until), card: r.title }) : mails.cardRemoved({ card: r.title }), SUPPORT_EMAIL || undefined)
    .catch((e) => console.error('[mail] карта удалена:', (e as Error).message));
  return r.last ? 'last' : 'removed';
}

/**
 * Неудачное автосписание с карты cardId: с основной — до AUTOPAY_MAX_FAILS попыток (повтор через 8 часов),
 * затем по одной попытке с каждой другой привязанной картой. Карту, которую банк отклонил окончательно
 * (отозвано разрешение, истёк срок), удаляем. Не прошло ни с одной — автопродление отключается (Pro действует до конца срока).
 */
export async function autopayFailed(userId: number, reason?: string | null, cardId?: number | null): Promise<'retry' | 'fallback' | 'disabled' | 'noop'> {
  type R = { result: 'retry' | 'fallback' | 'disabled' | 'noop'; email?: string; plan?: string; until?: string | null; card?: string | null; attempt?: number; primaryPhase?: boolean };
  const r: R = await db.tx(async (t) => {
    const u = await t.get<{ email: string; plan: string | null; until: string | null; fails: number }>(
      'SELECT email, autopay_plan AS plan, pro_until AS until, autopay_fails AS fails FROM users WHERE id = ? FOR UPDATE', userId);
    if (!u?.plan) return { result: 'noop' as const };
    if (!(await t.get('SELECT 1 FROM user_cards WHERE user_id = ? LIMIT 1', userId))) {   // карт не осталось — списывать не с чего
      await autopayOff(t, userId);
      return { result: 'disabled' as const, email: u.email, plan: u.plan, until: u.until, card: null, attempt: u.fails, primaryPhase: true };
    }
    const final = FINAL_FAIL_REASONS.has(reason ?? '');
    const primaryPhase = u.fails < AUTOPAY_MAX_FAILS;
    // карта не указана — значит, списывали с основной
    const card = cardId ? await t.get<CardRow>('SELECT * FROM user_cards WHERE id = ? AND user_id = ?', cardId, userId)
      : primaryPhase ? await t.get<CardRow>('SELECT * FROM user_cards WHERE user_id = ? AND is_primary', userId) : null;
    let fails = u.fails;
    if (primaryPhase) fails = final ? AUTOPAY_MAX_FAILS : u.fails + 1;   // карта окончательно отклонена — сразу к другим картам
    await t.run('UPDATE users SET autopay_fails = ? WHERE id = ?', fails, userId);
    if (card) {
      if (final) { await t.run('DELETE FROM user_cards WHERE id = ?', card.id); await ensurePrimary(t, userId); }
      else if (!primaryPhase || fails >= AUTOPAY_MAX_FAILS) await t.run('UPDATE user_cards SET failed_cycle = ? WHERE id = ?', u.until, card.id);
    }
    const base = { email: u.email, plan: u.plan, until: u.until, card: card?.title ?? null, attempt: fails, primaryPhase };
    if (fails < AUTOPAY_MAX_FAILS) return { ...base, result: 'retry' as const };
    const left = await t.get<{ id: number }>('SELECT id FROM user_cards WHERE user_id = ? AND failed_cycle IS DISTINCT FROM ? LIMIT 1', userId, u.until);
    if (left) return { ...base, result: 'fallback' as const };
    await autopayOff(t, userId);
    return { ...base, result: 'disabled' as const };
  });
  if (r.result === 'noop') return 'noop';
  await db.run('INSERT INTO events (user_id, name, props) VALUES (?, ?, ?)', userId, 'autopay_failed', JSON.stringify({ attempt: r.attempt, result: r.result, reason: reason ?? null }));
  // письма: о каждой неудаче с основной карты и об отключении; о попытках с запасными карт — только итог
  if (mailEnabled() && (r.result === 'disabled' || r.primaryPhase)) {
    const amount = billingInfo().plans.find((p) => p.id === r.plan)?.price ?? '0';
    sendMail(r.email!, r.result === 'disabled' ? 'Автопродление Pro отключено' : 'Не удалось продлить Pro',
      mails.autopayFailed({ planTitle: planTitle(r.plan!), amount, until: r.until ?? new Date().toISOString(), card: r.card ?? null, next: r.result === 'disabled' ? 'none' : r.result }), SUPPORT_EMAIL || undefined)
      .catch((e) => console.error('[mail] автосписание не прошло:', (e as Error).message));
  }
  return r.result;
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
interface OrderRow { id: string; user_id: number; plan: string; days: number; amount: string; currency: string; status: string; yk_id: string | null; confirmation_url: string | null; recurring: boolean; kind: string; card_id: number | null }

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
  if (o.kind === 'card') return applyCardCheck(o, p);
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
      if (forever) await autopayOff(t, o.user_id);   // «навсегда» — продлевать нечего
      else if (!o.recurring && pm?.saved === true && pm.id) {
        // покупатель отметил на форме ЮKassa «Запомнить данные карты» — включаем автопродление этого тарифа, карта становится основной
        await saveCard(t, o.user_id, pm, true);
        await t.run(`UPDATE users SET autopay_plan = ?, autopay_since = COALESCE(CASE WHEN autopay_plan IS NULL THEN NULL ELSE autopay_since END, ?), autopay_fails = 0, autopay_notice = NULL, autopay_amount = NULL, autopay_last_try = NULL WHERE id = ?`,
          o.plan, new Date().toISOString(), o.user_id);
        await t.run('INSERT INTO events (user_id, name, props) VALUES (?, ?, ?)', o.user_id, 'autopay_enabled', JSON.stringify({ plan: o.plan }));
      } else if (o.recurring) await t.run('UPDATE users SET autopay_fails = 0, autopay_last_try = NULL WHERE id = ?', o.user_id);
      // при включённом автопродлении в письме — дата и сумма следующего списания
      const ap = await t.get<{ plan: string | null }>('SELECT autopay_plan AS plan FROM users WHERE id = ?', o.user_id);
      const apPrice = ap?.plan ? billingInfo().plans.find((x) => x.id === ap.plan)?.price : null;
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
    if (done && o.recurring) await autopayFailed(o.user_id, p.cancellation_details?.reason, o.card_id);   // автосписание не прошло — письмо и повтор (или отключение)
    return done ? 'canceled' : 'noop';
  }
  return 'noop';
}

/**
 * Проверочный платёж 1 ₽ для привязки карты (capture: false — деньги только замораживаются).
 * Когда ЮKassa сохранила карту (статус waiting_for_capture), сохраняем её у себя и сразу отменяем платёж — 1 ₽ возвращается.
 */
async function applyCardCheck(o: OrderRow, p: YkPayment): Promise<'activated' | 'canceled' | 'noop'> {
  if (p.status === 'waiting_for_capture') {
    const pm = p.payment_method;
    const saved = pm?.saved === true && !!pm.id;
    let title: string | null = null;
    const r = await db.tx(async (t) => {
      const done = await t.run("UPDATE payments SET status = ?, method = ?, fail_reason = ? WHERE id = ? AND status IN ('new', 'pending')",
        saved ? 'card_saved' : 'canceled', pm?.type?.slice(0, 40) ?? null, saved ? null : 'not_saved', o.id);
      if (done !== 1) return false;
      if (!saved) return false;
      const u = await t.get<{ plan: string | null; until: string | null }>('SELECT autopay_plan AS plan, pro_until AS until FROM users WHERE id = ? FOR UPDATE', o.user_id);
      const active = !!u?.until && Date.parse(u.until) > Date.now() && !isForever(u.until);
      if (!active) return false;   // подписка закончилась, пока привязывали карту, — карту не сохраняем
      await saveCard(t, o.user_id, pm!, false);
      title = cardTitle(pm!);
      // автопродление не было включено — включаем для текущего тарифа (он записан в заказе)
      if (!u!.plan) await t.run('UPDATE users SET autopay_plan = ?, autopay_since = ?, autopay_fails = 0, autopay_notice = NULL, autopay_amount = NULL, autopay_last_try = NULL WHERE id = ?', o.plan, new Date().toISOString(), o.user_id);
      await t.run('INSERT INTO events (user_id, name, props) VALUES (?, ?, ?)', o.user_id, 'card_added', JSON.stringify({ enabled: !u!.plan }));
      return true;
    });
    // в любом случае отменяем проверочный платёж — замороженный 1 ₽ возвращается на карту
    try { await yk('POST', `/payments/${encodeURIComponent(p.id)}/cancel`, {}, `${o.id}-cancel`); }
    catch (e) { console.error('[billing] не удалось отменить проверочный платёж:', (e as Error).message); }
    if (r && title && mailEnabled()) {
      const to = (await db.get<{ email: string }>('SELECT email FROM users WHERE id = ?', o.user_id))?.email;
      if (to) sendMail(to, 'Карта привязана', mails.cardAdded({ card: title }), SUPPORT_EMAIL || undefined).catch((e) => console.error('[mail] карта привязана:', (e as Error).message));
    }
    return r ? 'activated' : 'noop';
  }
  if (p.status === 'canceled') {
    const done = await db.run("UPDATE payments SET status = 'canceled', fail_reason = ? WHERE id = ? AND status IN ('new', 'pending')", p.cancellation_details?.reason?.slice(0, 60) ?? null, o.id);
    return done === 1 ? 'canceled' : 'noop';
  }
  return 'noop';
}

/** Можно ли сейчас привязать карту: Pro на месяц или год действует, карт меньше MAX_CARDS. Возвращает тариф для автопродления. */
export async function cardCheckPlan(userId: number): Promise<string | null> {
  const u = await db.get<{ plan: string | null; until: string | null }>('SELECT autopay_plan AS plan, pro_until AS until FROM users WHERE id = ?', userId);
  if (!u?.until || Date.parse(u.until) <= Date.now() || isForever(u.until)) return null;
  const plan = u.plan ?? await currentPlan(userId);
  if (!plan || !billingInfo().plans.some((p) => p.id === plan && p.days > 0)) return null;
  const n = Number((await db.get<{ n: number }>('SELECT COUNT(*)::int AS n FROM user_cards WHERE user_id = ?', userId))?.n ?? 0);
  return n < MAX_CARDS ? plan : null;
}

/** Сумма проверочного платежа при привязке карты (возвращается сразу). */
export const CARD_CHECK_AMOUNT = '1.00';

/** Создаёт проверочный платёж для привязки новой карты и возвращает ссылку на страницу ЮKassa. */
export async function createCardCheck(user: { id: number; email: string }) {
  if (!billingInfo().enabled) throw new BillingError(503, 'Оплата пока недоступна. Попробуйте позже.');
  const plan = await cardCheckPlan(user.id);
  if (!plan) {
    const n = Number((await db.get<{ n: number }>('SELECT COUNT(*)::int AS n FROM user_cards WHERE user_id = ?', user.id))?.n ?? 0);
    throw new BillingError(409, n >= MAX_CARDS ? `Можно привязать не больше ${MAX_CARDS} карт. Удалите ненужную и попробуйте снова.` : 'Привязать карту можно при действующей подписке Pro на месяц или год.');
  }
  const id = randomUUID();
  const resume = randomBytes(24).toString('base64url');
  await db.run("INSERT INTO payments (id, user_id, plan, days, amount, resume_hash, kind) VALUES (?, ?, ?, 0, ?, ?, 'card')", id, user.id, plan, CARD_CHECK_AMOUNT, sha(resume));
  const item = 'Проверка карты для автопродления Pro';
  const body = {
    amount: { value: CARD_CHECK_AMOUNT, currency: 'RUB' },
    capture: false,                 // не списываем: платёж отменим сразу после сохранения карты
    save_payment_method: true,      // цель платежа — сохранить карту (покупатель соглашается на странице сайта)
    confirmation: { type: 'redirect', return_url: `${FRONTEND}/payment/return?order=${id}&r=${resume}` },
    description: `${item} (заказ ${id.slice(0, 8)})`.slice(0, 128),
    metadata: { order_id: id, user_id: String(user.id), kind: 'card' },
    receipt: receipt(user.email, item, CARD_CHECK_AMOUNT),   // чек формируется только при списании — здесь списания не будет
  };
  try {
    const p = await yk<YkPayment>('POST', '/payments', body, id);
    const url = p.confirmation?.confirmation_url;
    if (!p.id || !url) throw new Error('ЮKassa не вернула ссылку');
    await db.run("UPDATE payments SET yk_id = ?, status = 'pending', confirmation_url = ? WHERE id = ?", p.id, url, id);
    return { orderId: id, url };
  } catch (e) {
    await db.run("UPDATE payments SET status = 'canceled' WHERE id = ?", id);
    console.error('[billing] не удалось создать проверку карты:', e instanceof YkError ? `${e.status} ${e.code}: ${e.message}` : (e as Error).message);
    throw new BillingError(502, 'Не удалось открыть привязку карты. Попробуйте позже.');
  }
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
    await autopayOff(t, o.user_id);
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
  return { status: o.status, plan: o.plan, amount: o.amount, proUntil: until, kind: o.kind };
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
  // сверка: автосписания и привязки карт, по которым не пришло уведомление, — спрашиваем ЮKassa сами
  const stuck = await db.all<OrderRow>(`SELECT * FROM payments WHERE status = 'pending' AND yk_id IS NOT NULL
    AND ((recurring AND created_at < ?) OR (kind = 'card' AND created_at < ? AND created_at > ?))`, iso(now - 15 * 60_000), iso(now - 5 * 60_000), iso(now - 2 * DAY_MS));
  for (const o of stuck) {
    try { await applyPayment(o, await yk<YkPayment>('GET', `/payments/${encodeURIComponent(o.yk_id!)}`)); }
    catch (e) { console.error('[autopay] сверка не удалась:', (e as Error).message); }
  }
  const due = await db.all<{ id: number; email: string; plan: string; amount: string | null; until: string; fails: number; last_try: string | null }>(
    `SELECT u.id, u.email, u.autopay_plan AS plan, u.autopay_amount AS amount, u.pro_until AS until, u.autopay_fails AS fails, u.autopay_last_try AS last_try FROM users u
     WHERE u.autopay_plan IS NOT NULL AND u.blocked_at IS NULL
       AND u.pro_until IS NOT NULL AND u.pro_until < '2900' AND u.pro_until <= ? AND u.pro_until > ?
       AND u.autopay_notice = u.pro_until   -- уведомление о предстоящем списании уже отправлено
       AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.user_id = u.id AND p.recurring AND p.status IN ('new', 'pending'))`,
    iso(now + AUTOPAY_CHARGE_BEFORE), iso(now - 3 * DAY_MS));
  let started = 0;
  for (const u of due) {
    const plan = info.plans.find((p) => p.id === u.plan);
    if (!plan || plan.days === 0) { await autopayOff(db, u.id); continue; }   // тариф больше не продаётся
    // основная карта — до 3 попыток с паузой 8 часов; затем по одной попытке с каждой другой картой, без паузы
    const cards = await cardsOf(db, u.id);
    const primaryPhase = u.fails < AUTOPAY_MAX_FAILS;
    const card = primaryPhase ? cards.find((c) => c.is_primary) : cards.find((c) => c.failed_cycle !== u.until);
    if (!card) { await autopayFailed(u.id, null, null); continue; }   // карт не осталось
    const gap = primaryPhase ? AUTOPAY_RETRY_GAP : 2 * 60_000;
    // занимаем попытку (защита от двойного списания)
    if ((await db.run('UPDATE users SET autopay_last_try = ? WHERE id = ? AND (autopay_last_try IS NULL OR autopay_last_try < ?)', iso(now), u.id, iso(now - gap))) !== 1) continue;
    // списываем ровно ту сумму, что была в напоминании: новая цена тарифа — только после уведомления о ней
    const amount = u.amount || plan.price;
    const id = randomUUID();
    await db.run('INSERT INTO payments (id, user_id, plan, days, amount, recurring, card_id, mkt_click_id) VALUES (?, ?, ?, ?, ?, TRUE, ?, (SELECT mkt_click_id FROM users WHERE id = ?))',
      id, u.id, plan.id, plan.days, amount, card.id, u.id);
    const item = `Продление подписки ${plan.title}`.slice(0, 128);
    try {
      const p = await yk<YkPayment>('POST', '/payments', {
        amount: { value: amount, currency: 'RUB' }, capture: true, payment_method_id: card.method,
        description: `${item} (заказ ${id.slice(0, 8)})`.slice(0, 128),
        metadata: { order_id: id, user_id: String(u.id), recurring: '1' },
        receipt: receipt(u.email, item, amount),
      }, id);
      await db.run("UPDATE payments SET yk_id = ?, status = 'pending' WHERE id = ?", p.id, id);
      started++;
      if (p.status === 'succeeded' || p.status === 'canceled') await applyPayment((await order(id))!, p);
    } catch (e) {
      // ЮKassa отклонила запрос (карта отвязана в банке, автоплатежи выключены у магазина и т. п.)
      const reason = e instanceof YkError ? e.code : 'error';
      console.error('[autopay] не удалось создать списание:', e instanceof YkError ? `${e.status} ${e.code}: ${e.message}` : (e as Error).message);
      await db.run("UPDATE payments SET status = 'canceled', fail_reason = ? WHERE id = ?", reason.slice(0, 60), id);
      await autopayFailed(u.id, null, card.id);
    }
  }
  return started;
}
