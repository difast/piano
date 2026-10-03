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

export function createSession(userId: number): { token: string; maxAgeMs: number } {
  const token = randomBytes(32).toString('base64url');
  const maxAgeMs = SESSION_DAYS * 86_400_000;
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha(token), userId, Date.now() + maxAgeMs);
  return { token, maxAgeMs };
}

export function destroySession(token: string | undefined) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
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

export interface AuthUser { id: number; email: string; name: string; isPro: boolean; /** срок подписки Pro (ISO) или null */ proUntil: string | null }

/** Pro активен, если включён вручную (тесты) или срок подписки ещё не истёк. */
export const toAuthUser = (r: { id: number; email: string; name: string; isPro: number; proUntil: string | null }): AuthUser => ({
  id: r.id, email: r.email, name: r.name, proUntil: r.proUntil,
  isPro: !!r.isPro || (!!r.proUntil && Date.parse(r.proUntil) > Date.now()),
});
declare module 'express-serve-static-core' { interface Request { user?: AuthUser } }

/** Подставляет req.user, если есть валидная сессия. */
export function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = readCookie(req, COOKIE);
  if (token) {
    const row = db.prepare(
      `SELECT u.id, u.email, u.name, u.is_pro AS isPro, u.pro_until AS proUntil, s.expires_at AS exp
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    ).get(sha(token)) as { id: number; email: string; name: string; isPro: number; proUntil: string | null; exp: number } | undefined;
    if (row && row.exp > Date.now()) req.user = toAuthUser(row);
    else if (row) destroySession(token);
  }
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
