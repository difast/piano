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
await db.run('DELETE FROM sessions WHERE expires_at < ?', Date.now());   // чистим просроченные сессии при старте
