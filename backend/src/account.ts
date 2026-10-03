import { createHash, randomBytes } from 'node:crypto';
import { db } from './db.ts';
import { FRONTEND } from './config.ts';
import { mailEnabled, mails, sendMail } from './mail.ts';
import { FOREVER, isForever } from './billing.ts';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const HOUR = 3_600_000;

export class AccountError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

// ---------- одноразовые ссылки из писем ----------
async function issueToken(userId: number, kind: 'verify' | 'reset', ttlMs: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  // старые неиспользованные ссылки того же вида перестают работать
  await db.run('DELETE FROM email_tokens WHERE user_id = ? AND kind = ? AND used_at IS NULL', userId, kind);
  await db.run('INSERT INTO email_tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)', sha(token), userId, kind, Date.now() + ttlMs);
  return token;
}

/** Проверяет и «гасит» ссылку. Возвращает id пользователя. */
async function useToken(token: string, kind: 'verify' | 'reset'): Promise<number> {
  if (!token || token.length > 100) throw new AccountError(400, 'Ссылка недействительна');
  const row = await db.get<{ user_id: number; expires_at: number; used_at: string | null }>(
    'SELECT user_id, expires_at, used_at FROM email_tokens WHERE token_hash = ? AND kind = ?', sha(token), kind);
  if (!row) throw new AccountError(400, 'Ссылка недействительна. Запросите новую.');
  if (row.used_at) throw new AccountError(400, 'Эта ссылка уже использована. Запросите новую.');
  if (Number(row.expires_at) < Date.now()) throw new AccountError(400, 'Срок действия ссылки истёк. Запросите новую.');
  const n = await db.run('UPDATE email_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL', new Date().toISOString(), sha(token));
  if (n !== 1) throw new AccountError(400, 'Эта ссылка уже использована. Запросите новую.');
  return row.user_id;
}

export async function sendVerification(userId: number, email: string) {
  if (!mailEnabled() || !FRONTEND) return false;
  const token = await issueToken(userId, 'verify', 72 * HOUR);
  await sendMail(email, 'Подтвердите почту', mails.verify(`${FRONTEND}/verify-email?token=${token}`));
  return true;
}

export async function confirmEmail(token: string) {
  const userId = await useToken(token, 'verify');
  await db.run('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?', new Date().toISOString(), userId);
  return userId;
}

/** Письмо со ссылкой сброса. Ничего не сообщает о том, существует ли адрес. */
export async function requestReset(email: string) {
  if (!mailEnabled() || !FRONTEND) throw new AccountError(503, 'Восстановление пароля временно недоступно. Напишите в поддержку.');
  const u = await db.get<{ id: number }>('SELECT id FROM users WHERE email = ?', email);
  if (!u) return;
  const token = await issueToken(u.id, 'reset', HOUR);
  await sendMail(email, 'Сброс пароля', mails.reset(`${FRONTEND}/reset-password?token=${token}`));
}

/** Новый пароль по ссылке: все старые сессии закрываются, почта считается подтверждённой (ссылка пришла на неё). */
export async function resetPassword(token: string, hash: string) {
  const userId = await useToken(token, 'reset');
  await db.tx(async (t) => {
    await t.run('UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?', hash, new Date().toISOString(), userId);
    await t.run('DELETE FROM sessions WHERE user_id = ?', userId);
  });
  return userId;
}

// ---------- настройки уведомлений ----------
export interface Settings { emailNews: boolean; browserNotify: boolean; remind: boolean; remindTime: string; songOfDay: boolean }
export const DEFAULT_SETTINGS: Settings = { emailNews: false, browserNotify: false, remind: false, remindTime: '19:00', songOfDay: false };
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function getSettings(userId: number): Promise<Settings> {
  const raw = (await db.get<{ settings: string }>('SELECT settings FROM users WHERE id = ?', userId))?.settings ?? '{}';
  let s: Partial<Settings> = {};
  try { s = JSON.parse(raw) as Partial<Settings>; } catch { /* битые данные — по умолчанию */ }
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function saveSettings(userId: number, input: Record<string, unknown>): Promise<Settings> {
  const cur = await getSettings(userId);
  const next: Settings = { ...cur };
  for (const k of ['emailNews', 'browserNotify', 'remind', 'songOfDay'] as const) if (typeof input[k] === 'boolean') next[k] = input[k] as boolean;
  if (input.remindTime !== undefined) {
    if (typeof input.remindTime !== 'string' || !TIME_RE.test(input.remindTime)) throw new AccountError(400, 'Укажите время в формате ЧЧ:ММ');
    next.remindTime = input.remindTime;
  }
  await db.run('UPDATE users SET settings = ? WHERE id = ?', JSON.stringify(next), userId);
  return next;
}

// ---------- купоны ----------
/** Активирует купон: продлевает Pro на N дней (от конца текущей подписки) или навсегда. */
export async function redeemCoupon(userId: number, rawCode: string) {
  const code = rawCode.trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9-]{3,40}$/.test(code)) throw new AccountError(400, 'Введите код купона — латинские буквы и цифры.');
  return db.tx(async (t) => {
    const c = await t.get<{ code: string; days: number; max_uses: number; used: number; expires_at: string | null }>('SELECT * FROM coupons WHERE code = ? FOR UPDATE', code);
    if (c && await t.get('SELECT 1 FROM coupon_uses WHERE code = ? AND user_id = ?', code, userId)) throw new AccountError(409, 'Вы уже активировали этот купон.');
    if (!c || (c.expires_at && Date.parse(c.expires_at) < Date.now()) || c.used >= c.max_uses) throw new AccountError(404, 'Купон не найден или больше не действует.');
    const cur = (await t.get<{ pro_until: string | null }>('SELECT pro_until FROM users WHERE id = ? FOR UPDATE', userId))?.pro_until ?? null;
    if (isForever(cur)) throw new AccountError(409, 'У вас уже есть Pro навсегда — купон не нужен.');
    const base = Math.max(Date.now(), cur ? Date.parse(cur) || 0 : 0);
    const until = c.days === 0 ? FOREVER : new Date(base + c.days * 86_400_000).toISOString();
    await t.run('UPDATE users SET pro_until = ? WHERE id = ?', until, userId);
    await t.run('UPDATE coupons SET used = used + 1 WHERE code = ?', code);
    await t.run('INSERT INTO coupon_uses (code, user_id) VALUES (?, ?)', code, userId);
    await t.run('INSERT INTO events (user_id, name, props) VALUES (?, ?, ?)', userId, 'coupon_redeemed', JSON.stringify({ code, days: c.days }));
    return { proUntil: until, days: c.days };
  });
}

// ---------- удаление аккаунта ----------
export async function deleteAccount(userId: number) {
  await db.tx(async (t) => {
    await t.run("UPDATE events SET user_id = NULL WHERE user_id = ?", userId);
    await t.run('DELETE FROM users WHERE id = ?', userId);   // остальное удаляется каскадно, платежи остаются без привязки
  });
}
