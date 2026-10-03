import webpush from 'web-push';
import { db } from './db.ts';
import { APP_TZ, FRONTEND } from './config.ts';
import { SONGS_META } from './content.ts';
import { todayKey } from './progress.ts';
import { getSettings } from './account.ts';
import { mailEnabled, mails, sendMail } from './mail.ts';

// ---------- ключи VAPID для браузерных уведомлений ----------
// Можно задать VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY; если не заданы — создаются один раз и хранятся в базе.
let VAPID: { publicKey: string; privateKey: string } | null = null;
export async function initPush() {
  let keys = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? { publicKey: process.env.VAPID_PUBLIC_KEY.trim(), privateKey: process.env.VAPID_PRIVATE_KEY.trim() } : null;
  if (!keys) {
    const row = await db.get<{ value: string }>("SELECT value FROM kv WHERE key = 'vapid'");
    if (row) keys = JSON.parse(row.value);
    else {
      keys = webpush.generateVAPIDKeys();
      await db.run("INSERT INTO kv (key, value) VALUES ('vapid', ?) ON CONFLICT (key) DO NOTHING", JSON.stringify(keys));
      keys = JSON.parse((await db.get<{ value: string }>("SELECT value FROM kv WHERE key = 'vapid'"))!.value);
    }
  }
  const subject = (process.env.VAPID_SUBJECT || (process.env.SUPPORT_EMAIL || process.env.SMTP_USER ? `mailto:${process.env.SUPPORT_EMAIL || process.env.SMTP_USER}` : FRONTEND || 'mailto:admin@example.com')).trim();
  webpush.setVapidDetails(subject, keys!.publicKey, keys!.privateKey);
  VAPID = keys;
}
export const pushPublicKey = () => VAPID?.publicKey ?? '';

interface Sub { endpoint: string; keys: { p256dh: string; auth: string } }
export async function savePushSubscription(userId: number, sub: unknown) {
  const s = sub as Sub;
  if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000 || typeof s.keys?.p256dh !== 'string' || typeof s.keys?.auth !== 'string') throw new Error('bad');
  await db.run(`INSERT INTO push_subscriptions (endpoint, user_id, data) VALUES (?, ?, ?)
    ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, data = excluded.data`, s.endpoint, userId, JSON.stringify({ endpoint: s.endpoint, keys: s.keys }));
}
export const removePushSubscription = (userId: number, endpoint: string) => db.run('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', userId, endpoint);

/** Отправляет уведомление на все браузеры пользователя. Возвращает число доставленных. */
export async function sendPush(userId: number, payload: { title: string; body: string; url: string; tag?: string }) {
  const subs = await db.all<{ endpoint: string; data: string }>('SELECT endpoint, data FROM push_subscriptions WHERE user_id = ?', userId);
  let ok = 0;
  for (const s of subs) {
    try { await webpush.sendNotification(JSON.parse(s.data), JSON.stringify(payload), { TTL: 6 * 3600 }); ok++; }
    catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.run('DELETE FROM push_subscriptions WHERE endpoint = ?', s.endpoint);   // подписка больше не действует
      else console.error('[push] ошибка отправки:', code ?? (e as Error).message);
    }
  }
  return ok;
}

// ---------- композиция дня: одна на всех, случайная, но постоянная в течение суток ----------
export function songOfDay(day = todayKey()) {
  let h = 2166136261;
  for (const ch of day) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return SONGS_META[(h >>> 0) % SONGS_META.length];
}

// ---------- расписание: раз в минуту ищем тех, кому пора напомнить ----------
const hhmm = (d = new Date()) => new Intl.DateTimeFormat('en-GB', { timeZone: APP_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
const WINDOW_MIN = 10;   // если сервер перезапускался, догоняем пропущенное в пределах 10 минут

export async function notifyTick(now = new Date()) {
  const day = todayKey(now);
  const to = hhmm(now);
  const from = hhmm(new Date(now.getTime() - WINDOW_MIN * 60_000));
  if (from > to) return 0;   // переход через полночь — пропускаем
  const users = await db.all<{ id: number; email: string; name: string; verified: string | null }>(
    `SELECT id, email, name, email_verified_at AS verified FROM users
     WHERE (notified_day IS NULL OR notified_day <> ?)
       AND ((settings::jsonb ->> 'remind') = 'true' OR (settings::jsonb ->> 'songOfDay') = 'true')
       AND COALESCE(settings::jsonb ->> 'remindTime', '19:00') BETWEEN ? AND ?`, day, from, to);
  let sent = 0;
  for (const u of users) {
    // помечаем заранее, чтобы при сбое не слать дважды
    if ((await db.run('UPDATE users SET notified_day = ? WHERE id = ? AND (notified_day IS NULL OR notified_day <> ?)', day, u.id, day)) !== 1) continue;
    const st = await getSettings(u.id);
    const viaEmail = st.emailNews && !!u.verified && mailEnabled();
    try {
      if (st.remind) {
        const practiced = (await db.get<{ seconds: number }>('SELECT seconds FROM practice WHERE user_id = ? AND day = ?', u.id, day))?.seconds ?? 0;
        if (practiced < 60) {
          const url = `${FRONTEND}/learn`;
          if (st.browserNotify) sent += await sendPush(u.id, { title: 'Пора позаниматься 🎹', body: 'Даже 10 минут в день дают результат. Продолжите с того же места.', url, tag: 'reminder' });
          if (viaEmail) { await sendMail(u.email, 'Пора позаниматься 🎹', mails.reminder(url, u.name)); sent++; }
        }
      }
      if (st.songOfDay) {
        const s = songOfDay(day);
        const url = `${FRONTEND}/songs/${s.id}`;
        if (st.browserNotify) sent += await sendPush(u.id, { title: 'Композиция дня 🎵', body: `«${s.title}» — ${s.artist}`, url, tag: 'song-of-day' });
        if (viaEmail) { await sendMail(u.email, `Композиция дня: ${s.title}`, mails.songOfDay(url, s.title, s.artist)); sent++; }
      }
    } catch (e) { console.error('[notify] ошибка:', (e as Error).message); }
  }
  return sent;
}

export function startScheduler() {
  const run = () => { notifyTick().catch((e) => console.error('[notify]', (e as Error).message)); };
  setTimeout(run, 5_000);
  return setInterval(run, 60_000);
}
