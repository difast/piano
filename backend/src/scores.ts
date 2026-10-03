import { existsSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Контент (каталог и PDF). Папка вне публичной статики; CONTENT_DIR нужен для тестов. */
const CONTENT_DIR = process.env.CONTENT_DIR ? resolve(process.env.CONTENT_DIR) : fileURLToPath(new URL('../content/', import.meta.url));
const SCORES_DIR = resolve(CONTENT_DIR, 'scores');
const CATALOG = resolve(CONTENT_DIR, 'scores.json');

export interface ScoreEntry {
  id: string;
  title: string;
  composer: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  genre: string;
  description: string;
  /** имя PDF-файла в content/scores или null, если файла пока нет */
  pdf: string | null;
  songId?: string;
  pages?: number;
  /** доступно для просмотра на Free (скачивание — всегда только Pro) */
  free?: boolean;
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PDF_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.pdf$/i;

export function loadScores(): ScoreEntry[] {
  try {
    const raw = JSON.parse(readFileSync(CATALOG, 'utf8')) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((e): e is ScoreEntry =>
      !!e && typeof e.id === 'string' && ID_RE.test(e.id) && typeof e.title === 'string'
      && ['beginner', 'intermediate', 'advanced'].includes(e.difficulty));
  } catch { return []; }
}

/** Безопасный путь к PDF или null: имя проверяется, путь обязан лежать внутри папки нот. */
export function pdfPath(e: ScoreEntry): string | null {
  if (!e.pdf || !PDF_RE.test(e.pdf)) return null;
  const abs = resolve(SCORES_DIR, e.pdf);
  if (!abs.startsWith(SCORES_DIR + sep) || !existsSync(abs)) return null;
  return abs;
}

/** Данные для клиента: без имени файла, только признак наличия PDF. */
export function publicScore(e: ScoreEntry) {
  return {
    id: e.id, title: e.title, composer: e.composer ?? '', difficulty: e.difficulty, genre: e.genre ?? '',
    description: e.description ?? '', songId: e.songId ?? null, pages: e.pages ?? null, hasPdf: !!pdfPath(e), free: e.free === true,
  };
}
