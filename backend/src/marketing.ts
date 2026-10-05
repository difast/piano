import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { db } from './db.ts';

/**
 * Маркетинговые ссылки: https://<сайт>/go/<slug>?utm_source=…  → переход записывается → пользователь попадает на главную.
 * Новую ссылку (например, для блогера) можно сделать той же ссылкой с другими UTM-метками или добавить сюда новый slug.
 */
export const MARKETING_LINKS: { slug: string; title: string }[] = [
  { slug: 'instagram', title: 'Instagram' },
];
export const isMarketingSlug = (s: string) => MARKETING_LINKS.some((l) => l.slug === s);

/** Сколько дней после перехода регистрация засчитывается этому переходу. */
export const ATTRIBUTION_DAYS = 30;
export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
export type UtmKey = (typeof UTM_KEYS)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isVisitId = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

// Соль для хеша посетителя: ANALYTICS_SALT или случайная, один раз сохранённая в базе. Без неё хеш нельзя «перебрать» по IP.
let salt: string | null = process.env.ANALYTICS_SALT?.trim() || null;
async function getSalt(): Promise<string> {
  if (salt) return salt;
  await db.run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING', 'analytics_salt', randomBytes(24).toString('hex'));
  salt = (await db.get<{ value: string }>('SELECT value FROM kv WHERE key = ?', 'analytics_salt'))!.value;
  return salt;
}

/** Текстовое поле метки: без управляющих символов, обрезанное. Пустое → null. */
const clean = (v: unknown, max = 100): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  return s || null;
};

/** Только домен источника (без пути и параметров — в них бывают личные данные). */
function refHost(v: unknown): string | null {
  const s = clean(v, 500);
  if (!s) return null;
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().slice(0, 100) : null; } catch { return null; }
}

function langOf(v: unknown, header: string | undefined): string | null {
  const s = (typeof v === 'string' ? v : (header ?? '').split(',')[0].split(';')[0]).trim();
  return /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/.test(s) ? s.toLowerCase() : null;
}

/** Тип устройства, ОС и браузер по User-Agent. Сам User-Agent не сохраняется. */
export function parseUa(ua: string) {
  const tablet = /iPad|Tablet|PlayBook|Silk|Kindle|SM-T\d/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  const mobile = !tablet && /Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua);
  const os = /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows'
    : /CrOS/i.test(ua) ? 'ChromeOS' : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Другая';
  const browser = /Instagram/i.test(ua) ? 'Instagram' : /FBAN|FBAV/i.test(ua) ? 'Facebook' : /Telegram/i.test(ua) ? 'Telegram'
    : /YaBrowser|YaApp/i.test(ua) ? 'Яндекс' : /Edg\//i.test(ua) ? 'Edge' : /OPR\/|Opera/i.test(ua) ? 'Opera'
      : /SamsungBrowser/i.test(ua) ? 'Samsung' : /Firefox|FxiOS/i.test(ua) ? 'Firefox' : /Chrome|CriOS/i.test(ua) ? 'Chrome'
        : /Safari/i.test(ua) ? 'Safari' : 'Другой';
  return { device: tablet ? 'tablet' : mobile ? 'mobile' : 'desktop', os, browser };
}
const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|curl|wget|python|httpclient/i;

/** Страна — только если её передаёт сеть доставки (Cloudflare и т. п.). Своей базы геолокации нет: город не определяем. */
function countryOf(req: Request): string | null {
  const v = String(req.headers['cf-ipcountry'] ?? req.headers['x-country-code'] ?? req.headers['x-geo-country'] ?? '').toUpperCase();
  return /^[A-Z]{2}$/.test(v) && v !== 'XX' && v !== 'T1' ? v : null;
}

export class MarketingError extends Error { status: number; constructor(status: number, m: string) { super(m); this.status = status; } }

/** Записывает переход. Повторная отправка того же visitId (двойной клик, перезагрузка) ничего не дублирует. */
export async function recordClick(req: Request, body: Record<string, unknown>): Promise<{ visitId: string; recorded: boolean }> {
  const slug = String(body.slug ?? '').toLowerCase();
  if (!isMarketingSlug(slug)) throw new MarketingError(404, 'Неизвестная ссылка');
  if (!isVisitId(body.visitId)) throw new MarketingError(400, 'Некорректный визит');
  const ua = String(req.headers['user-agent'] ?? '').slice(0, 400);
  if (BOT_RE.test(ua)) return { visitId: body.visitId, recorded: false };
  const anon = typeof body.anonId === 'string' && /^[a-z0-9]{6,40}$/i.test(body.anonId) ? body.anonId : null;
  // уникальный посетитель: случайный id браузера; если его нет — IP + User-Agent. Сохраняется только хеш.
  const visitor = createHash('sha256').update(`${await getSalt()}|${anon ? `a:${anon}` : `i:${req.ip}|${ua}`}`).digest('hex').slice(0, 32);
  const utm = (body.utm ?? {}) as Record<string, unknown>;
  const { device, os, browser } = parseUa(ua);
  const landing = typeof body.landing === 'string' && /^\/[\w\-/]{0,100}$/.test(body.landing) ? body.landing : '/';
  const n = await db.run(
    `INSERT INTO mkt_clicks (visit_id, slug, visitor_hash, user_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, lang, device, os, browser, country, landing)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (visit_id) DO NOTHING`,
    body.visitId.toLowerCase(), slug, visitor, req.user?.id ?? null,
    ...UTM_KEYS.map((k) => clean(utm[k])),
    refHost(body.referrer), langOf(body.lang, req.headers['accept-language']), device, os, browser, countryOf(req), landing);
  return { visitId: body.visitId, recorded: n === 1 };
}

/** При регистрации: связываем аккаунт с переходом, если он был не раньше ATTRIBUTION_DAYS дней назад. */
export async function attachMarketing(userId: number, visitId: unknown) {
  if (!isVisitId(visitId)) return;
  const since = new Date(Date.now() - ATTRIBUTION_DAYS * 86_400_000).toISOString();
  const c = await db.get<{ id: number }>('SELECT id FROM mkt_clicks WHERE visit_id = ? AND created_at >= ?', visitId.toLowerCase(), since);
  if (c) await db.run('UPDATE users SET mkt_click_id = ? WHERE id = ? AND mkt_click_id IS NULL', c.id, userId);
}
