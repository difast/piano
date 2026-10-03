/**
 * Проверка боевого развёртывания.
 *   npm run check-deploy -- https://api.example.com https://example.com
 * Запускать с компьютера, у которого есть доступ к обоим адресам. Ничего не меняет (создаёт только одного тестового пользователя
 * при флаге --register). Код возврата 1, если есть провалы.
 */
const [backendArg, frontendArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const REGISTER = process.argv.includes('--register');
if (!backendArg || !frontendArg) { console.error('Использование: npm run check-deploy -- <адрес бэкенда> <адрес фронтенда> [--register]'); process.exit(2); }
const norm = (u: string) => new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).origin;
const BACK = norm(backendArg), FRONT = norm(frontendArg);

let failed = 0, warned = 0;
const ok = (name: string, cond: boolean, hint = '', soft = false) => {
  console.log(`${cond ? '✓' : soft ? '!' : '✗'} ${name}${cond ? '' : `\n    → ${hint}`}`);
  if (!cond) { if (soft) warned++; else failed++; }
};
const get = async (url: string, init?: RequestInit) => {
  try { return await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000), ...init }); } catch { return null; }
};

console.log(`Бэкенд:  ${BACK}\nФронтенд: ${FRONT}\n`);

// ---- бэкенд ----
console.log('— Бэкенд');
ok('адрес бэкенда с HTTPS', BACK.startsWith('https://'), 'без HTTPS не заработают cookie входа и уведомления ЮKassa');
const me = await get(`${BACK}/api/me`, { headers: { Origin: FRONT } });
ok('бэкенд отвечает на /api/me', !!me && me.status === 200, 'бэкенд не запущен или неверный адрес');
const meBody = await me?.json().catch(() => null);
ok('ответ — JSON с полем user', !!meBody && 'user' in meBody, 'запрос попал не на бэкенд (прокси/неверный адрес)');
const acao = me?.headers.get('access-control-allow-origin');
ok(`CORS разрешает ${FRONT}`, acao === FRONT, `сейчас: ${acao ?? 'нет заголовка'}. В переменной CORS_ORIGIN на бэкенде должно быть ровно ${FRONT}`);
ok('CORS: allow-credentials', me?.headers.get('access-control-allow-credentials') === 'true', 'нужен Access-Control-Allow-Credentials: true');
const pre = await get(`${BACK}/api/auth/login`, { method: 'OPTIONS', headers: { Origin: FRONT, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
ok('preflight (OPTIONS) проходит', !!pre && pre.status < 300 && pre.headers.get('access-control-allow-origin') === FRONT, `статус ${pre?.status}`);
const evil = await get(`${BACK}/api/me`, { headers: { Origin: 'https://evil.example' } });
ok('чужой сайт не получает CORS-доступ', evil?.headers.get('access-control-allow-origin') !== 'https://evil.example', 'CORS_ORIGIN слишком широкий');
const bad = await get(`${BACK}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', Origin: FRONT }, body: '{"email":"nobody@example.com","password":"wrongpass1"}' });
ok('вход с неверным паролем → 401', bad?.status === 401, `статус ${bad?.status}`);

// ---- оплата ----
console.log('\n— Оплата ЮKassa');
const plans = await get(`${BACK}/api/billing/plans`, { headers: { Origin: FRONT } });
const pj = await plans?.json().catch(() => null) as { enabled?: boolean; plans?: { id: string; price: string }[] } | null;
ok('тарифы отдаются (/api/billing/plans)', !!pj, 'бэкенд старой версии — передеплойте');
ok('оплата настроена (enabled)', !!pj?.enabled, 'задайте YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY, PRO_MONTH_PRICE и/или PRO_YEAR_PRICE и перезапустите бэкенд');
if (pj?.enabled) console.log('    тарифы: ' + pj.plans!.map((p) => `${p.id} = ${p.price} ₽`).join(', '));
const hook = await get(`${BACK}/api/billing/yookassa`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
ok('адрес для HTTP-уведомлений доступен (мусор → 400)', hook?.status === 400, `статус ${hook?.status}. Если 403 — проверьте YOOKASSA_IP_CHECK и TRUST_PROXY; 404 — старая версия бэкенда`);
ok('ссылка для уведомлений: ' + `${BACK}/api/billing/yookassa`, true);
const noAuth = await get(`${BACK}/api/billing/checkout`, { method: 'POST', headers: { 'content-type': 'application/json', Origin: FRONT }, body: '{"plan":"pro-month"}' });
ok('создание платежа без входа запрещено (401)', noAuth?.status === 401, `статус ${noAuth?.status}`);

// ---- cookie и вход (по желанию) ----
if (REGISTER) {
  console.log('\n— Вход и cookie (создаётся тестовый пользователь)');
  const r = await get(`${BACK}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json', Origin: FRONT }, body: JSON.stringify({ email: `check${Date.now()}@example.com`, password: 'checkdeploy1', consent: true }) });
  const sc = r?.headers.get('set-cookie') ?? '';
  ok('регистрация работает', r?.status === 200 || r?.status === 201, `статус ${r?.status}`);
  ok('cookie: HttpOnly', /httponly/i.test(sc), sc || 'нет Set-Cookie');
  ok('cookie: Secure', /secure/i.test(sc), 'на HTTPS cookie должна быть Secure (NODE_ENV=production)');
  ok('cookie: SameSite=None (разные домены)', /samesite=none/i.test(sc), 'для двух доменов задайте COOKIE_SAMESITE=none');
}

// ---- фронтенд ----
console.log('\n— Фронтенд');
ok('адрес фронтенда с HTTPS', FRONT.startsWith('https://'), 'без HTTPS не работает установка на экран и безопасные cookie');
const home = await get(FRONT + '/');
const html = await home?.text() ?? '';
ok('главная открывается', home?.status === 200 && html.includes('<div id="root">'), `статус ${home?.status}`);
const cfg = await get(`${FRONT}/config.js`);
const cfgText = await cfg?.text() ?? '';
ok('config.js указывает на бэкенд', cfgText.includes(BACK), `в config.js apiUrl должен быть ${BACK}; сейчас: ${cfgText.slice(0, 120).replace(/\s+/g, ' ')}`);
for (const path of ['/manifest.webmanifest', '/favicon.ico', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/og.png']) {
  const r = await get(FRONT + path);
  ok(`файл ${path}`, r?.status === 200, `статус ${r?.status}`);
}
for (const path of ['/payment/return', '/terms', '/privacy', '/consent', '/learn']) {
  const r = await get(FRONT + path);
  const t = await r?.text() ?? '';
  ok(`прямая ссылка ${path} открывает приложение (SPA)`, r?.status === 200 && t.includes('<div id="root">'), `статус ${r?.status}. Включите «SPA/перенаправление на index.html» в настройках хостинга фронтенда`);
}

console.log(failed || warned ? `\nПровалов: ${failed}${warned ? `, предупреждений: ${warned}` : ''}` : '\nВсё в порядке');
process.exit(failed ? 1 : 0);
export {};
