/** Адрес фронтенда (для ссылок в письмах и return_url оплаты). По умолчанию — первый из CORS_ORIGIN. */
export const FRONTEND = (() => {
  const raw = (process.env.FRONTEND_URL || (process.env.CORS_ORIGIN ?? '').split(',')[0] || '').trim();
  if (!raw) return '';
  try { return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).origin; } catch { return ''; }
})();

export const APP_NAME = 'Piano Lab';
export const APP_TZ = process.env.APP_TZ ?? 'Europe/Moscow';
