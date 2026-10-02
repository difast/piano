import { OLD_TO_NEW_COMPLETED } from './content.ts';
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
  CREATE TABLE IF NOT EXISTS lesson_stage (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL,
    stage INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, lesson_id)
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

// Миграция 1: курс стал длиннее (12 → 24 урока). Пройденные старые уроки (подряд с начала)
// переносятся в соответствующее число новых, чтобы цепочка прохождения не ломалась.
const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
if (version < 1) {
  db.exec('BEGIN');
  try {
    const users = db.prepare('SELECT DISTINCT user_id FROM completed_lessons').all() as { user_id: number }[];
    for (const { user_id } of users) {
      const done = new Set((db.prepare('SELECT lesson_id FROM completed_lessons WHERE user_id = ?').all(user_id) as { lesson_id: string }[]).map((r) => r.lesson_id));
      let k = 0;
      while (k < OLD_TO_NEW_COMPLETED.length && done.has(`l${k + 1}`)) k++;
      const newCount = k > 0 ? OLD_TO_NEW_COMPLETED[k - 1] : 0;
      db.prepare('DELETE FROM completed_lessons WHERE user_id = ?').run(user_id);
      const ins = db.prepare('INSERT INTO completed_lessons (user_id, lesson_id) VALUES (?, ?)');
      for (let n = 1; n <= newCount; n++) ins.run(user_id, `l${n}`);
    }
    db.exec('PRAGMA user_version = 1');
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
