import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const file = process.env.DB_FILE ?? 'data/piano.db';
if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

export const db = new DatabaseSync(file);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    is_pro INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS completed_lessons (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, lesson_id)
  );
  CREATE TABLE IF NOT EXISTS learned_songs (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id TEXT NOT NULL,
    PRIMARY KEY (user_id, song_id)
  );
  CREATE TABLE IF NOT EXISTS practice (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    seconds INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    anon_id TEXT,
    name TEXT NOT NULL,
    props TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// миграция: фиксируем момент и версию согласия на обработку персональных данных
const userCols = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name);
if (!userCols.includes('consent_at')) db.exec('ALTER TABLE users ADD COLUMN consent_at TEXT');
if (!userCols.includes('consent_version')) db.exec('ALTER TABLE users ADD COLUMN consent_version TEXT');
