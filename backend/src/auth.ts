import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

const SESSION_DAYS = 30;
export const COOKIE = 'sid';

const scryptAsync = (pw: string, salt: Buffer) =>
  new Promise<Buffer>((res, rej) => scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${(await scryptAsync(pw, salt)).toString('hex')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(pw, Buffer.from(saltHex, 'hex'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const sessionHash = sha;

export async function createSession(userId: number): Promise<{ token: string; maxAgeMs: number }> {
  const token = randomBytes(32).toString('base64url');
  const maxAgeMs = SESSION_DAYS * 86_400_000;
  await db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha(token), userId, Date.now() + maxAgeMs);
  return { token, maxAgeMs };
}

export async function destroySession(token: string | undefined) {
  if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', sha(token));
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export interface AuthUser { id: number; email: string; name: string; isPro: boolean; /** срок подписки Pro (ISO) или null */ proUntil: string | null; /** почта подтверждена */ emailVerified: boolean }

/** Pro активен, если включён вручную (тесты) или срок подписки ещё не истёк. */
export const toAuthUser = (r: { id: number; email: string; name: string; isPro: number; proUntil: string | null; emailVerifiedAt?: string | null }): AuthUser => ({
  id: r.id, email: r.email, name: r.name, proUntil: r.proUntil, emailVerified: !!r.emailVerifiedAt,
  isPro: !!r.isPro || (!!r.proUntil && Date.parse(r.proUntil) > Date.now()),
});
declare module 'express-serve-static-core' { interface Request { user?: AuthUser } }

/** Подставляет req.user, если есть валидная сессия. */
/** Токен сессии: заголовок Authorization: Bearer (работает при любых настройках cookie в браузере) или cookie. */
export function sessionToken(req: Request): string | undefined {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) { const t = h.slice(7).trim(); if (t) return t; }
  return readCookie(req, COOKIE);
}

const RENEW_MS = 15 * 86_400_000;

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = sessionToken(req);
  try {
    if (token) {
      const row = await db.get<{ id: number; email: string; name: string; isPro: number; proUntil: string | null; emailVerifiedAt: string | null; exp: number; blocked: string | null }>(
        `SELECT u.id, u.email, u.name, u.is_pro AS "isPro", u.pro_until AS "proUntil", u.email_verified_at AS "emailVerifiedAt", s.expires_at AS exp, u.blocked_at AS blocked
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`, sha(token));
      if (row?.blocked) await destroySession(token);   // заблокированный аккаунт — сессия недействительна
      else if (row && Number(row.exp) > Date.now()) {
        req.user = toAuthUser(row);
        // скользящий срок: активный пользователь не разлогинивается через 30 дней
        if (Number(row.exp) - Date.now() < RENEW_MS) await db.run('UPDATE sessions SET expires_at = ? WHERE token_hash = ?', Date.now() + SESSION_DAYS * 86_400_000, sha(token));
      } else if (row) await destroySession(token);
    }
  } catch (e) { next(e); return; }
  next();
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) { res.status(401).json({ error: 'Требуется вход в аккаунт' }); return; }
  next();
}

/** Простой лимитер попыток входа/регистрации (в памяти процесса). */
const attempts = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max = 8, windowMs = 60_000): boolean {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.reset < now) { attempts.set(key, { n: 1, reset: now + windowMs }); return true; }
  a.n += 1;
  return a.n <= max;
}
