import pg from 'pg';

/**
 * PostgreSQL. Боевой режим: DATABASE_URL (управляемая база Timeweb). Без DATABASE_URL в разработке и тестах
 * используется встроенный PGlite (настоящий Postgres в процессе; DB_DIR — папка данных, иначе в памяти).
 * Запросы пишутся с плейсхолдерами `?`, они заменяются на $1, $2 …
 */
type Result = { rows: Record<string, unknown>[]; rowCount: number };
type Exec = (sql: string, params: unknown[]) => Promise<Result>;

export interface Db {
  get<T = Record<string, unknown>>(sql: string, ...p: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, ...p: unknown[]): Promise<T[]>;
  /** возвращает число изменённых строк */
  run(sql: string, ...p: unknown[]): Promise<number>;
  /** транзакция: при ошибке откатывается целиком */
  tx<T>(fn: (t: Db) => Promise<T>): Promise<T>;
}

const toPg = (sql: string) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
function wrap(exec: Exec, tx: Db['tx']): Db {
  return {
    get: async <T,>(sql: string, ...p: unknown[]) => (await exec(toPg(sql), p)).rows[0] as T | undefined,
    all: async <T,>(sql: string, ...p: unknown[]) => (await exec(toPg(sql), p)).rows as T[],
    run: async (sql, ...p) => (await exec(toPg(sql), p)).rowCount,
    tx,
  };
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    pg.types.setTypeParser(20, (v) => Number(v));           // BIGINT → number
    const mode = process.env.DATABASE_SSL;                  // require | no-verify | (пусто — как в адресе)
    const conn = mode ? url.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '') : url;
    const pool = new pg.Pool({
      connectionString: conn, max: 10, connectionTimeoutMillis: 10_000,
      ...(mode === 'no-verify' ? { ssl: { rejectUnauthorized: false } } : mode === 'require' ? { ssl: true } : {}),
    });
    pool.on('error', (e) => console.error('[db] ошибка соединения:', e.message));
    const run = (c: { query: (s: string, p: unknown[]) => Promise<pg.QueryResult> }): Exec => async (sql, p) => { const r = await c.query(sql, p); return { rows: r.rows, rowCount: r.rowCount ?? 0 }; };
    const tx: Db['tx'] = async (fn) => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn(wrap(run(c), () => { throw new Error('вложенные транзакции не поддерживаются'); }));
        await c.query('COMMIT');
        return r;
      } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
      finally { c.release(); }
    };
    return wrap(run(pool), tx);
  }
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_LOCAL_DB !== '1') {
    throw new Error('Не задана переменная DATABASE_URL (адрес базы PostgreSQL). Без неё данные не сохранятся между перезапусками.');
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const lite = new PGlite(process.env.DB_DIR || undefined);
  await lite.waitReady;
  const run = (c: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }> }): Exec => async (sql, p) => {
    const r = await c.query(sql, p);
    return { rows: r.rows as Record<string, unknown>[], rowCount: r.affectedRows ?? r.rows.length };
  };
  const tx: Db['tx'] = (fn) => lite.transaction(async (t) => fn(wrap(run(t), () => { throw new Error('вложенные транзакции не поддерживаются'); })));
  return wrap(run(lite), tx);
}

const NOW = `to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

export const db = await connect();

// Проверяем связь сразу и пишем в лог понятную причину (без пароля)
try { await db.run('SELECT 1'); }
catch (e) {
  const err = e as Error & { code?: string };
  let where = 'встроенная база';
  try { const u = new URL(process.env.DATABASE_URL ?? ''); where = `${u.hostname}:${u.port || 5432}, база ${u.pathname.slice(1)}, пользователь ${u.username}`; } catch { /* нет адреса */ }
  const msg = `${err.message} ${String((err as { cause?: Error }).cause?.message ?? '')}`;
  const hint =
    /timeout|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|terminated/i.test(msg) ? 'сервер базы недоступен по сети. Приватный IP (192.168.x.x) виден только из той же приватной сети; для приложения Timeweb Apps используйте публичный IP базы. Если адрес верный — попробуйте DATABASE_SSL=no-verify.'
    : /ECONNREFUSED/.test(msg) ? 'по этому адресу и порту база не принимает подключения — проверьте хост и порт.'
    : /ENOTFOUND|EAI_AGAIN/.test(msg) ? 'хост не найден — проверьте адрес в DATABASE_URL.'
    : /password|28P01/i.test(msg) || err.code === '28P01' ? 'неверный пользователь или пароль.'
    : /does not exist|3D000/.test(msg) || err.code === '3D000' ? 'нет базы с таким именем.'
    : /ssl|certificate|pg_hba/i.test(msg) ? 'проблема с SSL — добавьте DATABASE_SSL=no-verify (или require).'
    : 'см. текст ошибки выше.';
  console.error(`\n[db] НЕТ СВЯЗИ С БАЗОЙ (${where}): ${err.message}\n[db] Причина: ${hint}\n`);
  process.exit(1);
}

await db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    is_pro INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    consent_at TEXT,
    consent_version TEXT,
    pro_until TEXT
  )`);
await db.run(`CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL
  )`);
await db.run(`CREATE TABLE IF NOT EXISTS completed_lessons (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT ${NOW},
    PRIMARY KEY (user_id, lesson_id)
  )`);
await db.run(`CREATE TABLE IF NOT EXISTS learned_songs (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id TEXT NOT NULL,
    PRIMARY KEY (user_id, song_id)
  )`);
await db.run(`CREATE TABLE IF NOT EXISTS practice (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    seconds INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  )`);
await db.run(`CREATE TABLE IF NOT EXISTS lesson_stage (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL,
    stage INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT ${NOW},
    PRIMARY KEY (user_id, lesson_id)
  )`);
await db.run(`CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,                       -- наш номер заказа
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    days INTEGER NOT NULL,
    amount TEXT NOT NULL,                      -- например '299.00'
    currency TEXT NOT NULL DEFAULT 'RUB',
    status TEXT NOT NULL DEFAULT 'new',        -- new | pending | succeeded | canceled | refunded
    yk_id TEXT UNIQUE,                         -- id платежа в ЮKassa
    confirmation_url TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    paid_at TEXT
  )`);
await db.run('CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id)');
await db.run(`CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    anon_id TEXT,
    name TEXT NOT NULL,
    props TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  )`);
// ---- почта, уведомления, купоны ----
await db.run('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TEXT');
/** настройки уведомлений (JSON): emailNews, browserNotify, remind, remindTime "HH:MM", songOfDay */
await db.run("ALTER TABLE users ADD COLUMN IF NOT EXISTS settings TEXT NOT NULL DEFAULT '{}'");
/** день (YYYY-MM-DD по APP_TZ), когда последний раз отправили напоминание / композицию дня */
await db.run('ALTER TABLE users ADD COLUMN IF NOT EXISTS notified_day TEXT');
await db.run(`CREATE TABLE IF NOT EXISTS email_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,                         -- verify | reset
    expires_at BIGINT NOT NULL,
    used_at TEXT
  )`);
await db.run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL,                         -- JSON подписки браузера
    created_at TEXT NOT NULL DEFAULT ${NOW}
  )`);
await db.run(`CREATE TABLE IF NOT EXISTS coupons (
    code TEXT PRIMARY KEY,                      -- в верхнем регистре
    days INTEGER NOT NULL,                      -- сколько дней Pro даёт (0 — навсегда)
    max_uses INTEGER NOT NULL DEFAULT 1,
    used INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,                            -- ISO; NULL — бессрочно
    created_at TEXT NOT NULL DEFAULT ${NOW}
  )`);
await db.run(`CREATE TABLE IF NOT EXISTS coupon_uses (
    code TEXT NOT NULL REFERENCES coupons(code) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    used_at TEXT NOT NULL DEFAULT ${NOW},
    PRIMARY KEY (code, user_id)
  )`);
await db.run(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
// Платежи храним и после удаления аккаунта (бухгалтерия, возвраты): связь с пользователем обнуляется
await db.run('ALTER TABLE payments ALTER COLUMN user_id DROP NOT NULL');
await db.run('ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_user_id_fkey');
await db.run('ALTER TABLE payments ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL');
// одноразовый ключ возврата с оплаты: восстанавливает вход, если покупатель вернулся в другой браузер/приложение
await db.run('ALTER TABLE payments ADD COLUMN IF NOT EXISTS resume_hash TEXT');
await db.run('ALTER TABLE payments ADD COLUMN IF NOT EXISTS resume_used BOOLEAN NOT NULL DEFAULT FALSE');
/** какие письма об окончании Pro уже отправлены: '<pro_until>|soon' / '<pro_until>|ended' */
await db.run('ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_mail TEXT');
// ---- кубки, челленджи, приглашения ----
await db.run('ALTER TABLE users ADD COLUMN IF NOT EXISTS ref_code TEXT UNIQUE');
await db.run('ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER');
await db.run(`CREATE TABLE IF NOT EXISTS visits (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    PRIMARY KEY (user_id, day)
  )`);
await db.run(`CREATE TABLE IF NOT EXISTS user_achievements (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    unlocked_at TEXT NOT NULL DEFAULT ${NOW},
    seen BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (user_id, id)
  )`);
await db.run(`CREATE TABLE IF NOT EXISTS challenge_done (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    period TEXT NOT NULL,                        -- день или понедельник недели
    done_at TEXT NOT NULL DEFAULT ${NOW},
    PRIMARY KEY (user_id, id, period)
  )`);
// ---- админка и маркетинг ----
/** блокировка аккаунта администратором (ISO-время блокировки) */
await db.run('ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TEXT');
/**
 * Переходы по маркетинговым ссылкам (/go/<slug>). Без IP и полного User-Agent:
 * visitor_hash — необратимый хеш (с секретной солью) для подсчёта уникальных посетителей.
 */
await db.run(`CREATE TABLE IF NOT EXISTS mkt_clicks (
    id SERIAL PRIMARY KEY,
    visit_id TEXT NOT NULL UNIQUE,              -- случайный id визита (UUID), по нему регистрация связывается с переходом
    slug TEXT NOT NULL,
    visitor_hash TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,   -- если переход сделал уже вошедший пользователь
    utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
    referrer TEXT,                              -- только домен источника
    lang TEXT, device TEXT, os TEXT, browser TEXT, country TEXT,
    landing TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  )`);
await db.run('CREATE INDEX IF NOT EXISTS idx_mkt_clicks_created ON mkt_clicks(created_at)');
/** сессии входа в админ-кабинет по паролю ADMIN_PASSWORD (токен хранится только в виде хеша) */
await db.run(`CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at BIGINT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  )`);
await db.run('DELETE FROM admin_sessions WHERE expires_at < ?', Date.now());
/** первый маркетинговый переход, после которого пользователь зарегистрировался */
await db.run('ALTER TABLE users ADD COLUMN IF NOT EXISTS mkt_click_id INTEGER REFERENCES mkt_clicks(id) ON DELETE SET NULL');
/** источник сохраняется и в платеже — связь остаётся даже после удаления аккаунта */
await db.run('ALTER TABLE payments ADD COLUMN IF NOT EXISTS mkt_click_id INTEGER REFERENCES mkt_clicks(id) ON DELETE SET NULL');
/** способ оплаты из ЮKassa (bank_card, sbp, yoo_money …) и причина отмены неуспешного платежа */
await db.run('ALTER TABLE payments ADD COLUMN IF NOT EXISTS method TEXT');
await db.run('ALTER TABLE payments ADD COLUMN IF NOT EXISTS fail_reason TEXT');
await db.run('DELETE FROM sessions WHERE expires_at < ?', Date.now());   // чистим просроченные сессии при старте
