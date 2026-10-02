// Добавляет PDF-ноты в каталог: копирует файл без изменений и создаёт/обновляет запись в content/scores.json.
// Пример:
//   npm run add-score -- --file ~/Downloads/minuet.pdf --id minuet-in-g --title "Менуэт соль мажор" \
//     --composer "К. Петцольд" --difficulty beginner --genre "Классика" --description "..." [--songId ode-to-joy] [--pages 2]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { SONG_IDS } from '../src/content.ts';

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; };
const fail = (m: string): never => { console.error(`Ошибка: ${m}`); process.exit(1); };

const file = arg('file') ?? fail('укажите --file путь/к/файлу.pdf');
const id = arg('id') ?? fail('укажите --id (латиница, цифры, дефис)');
const title = arg('title') ?? fail('укажите --title');
const difficulty = arg('difficulty') ?? 'beginner';
const songId = arg('songId');
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) fail('id: только строчные латинские буквы, цифры и дефис');
if (!['beginner', 'intermediate', 'advanced'].includes(difficulty)) fail('difficulty: beginner | intermediate | advanced');
if (songId && !SONG_IDS.includes(songId)) fail(`songId «${songId}» нет в каталоге песен (${SONG_IDS.join(', ')})`);
if (!existsSync(file)) fail(`файл не найден: ${file}`);
if (readFileSync(file).subarray(0, 5).toString('latin1') !== '%PDF-') fail('файл не похож на PDF');

const root = (process.env.CONTENT_DIR ? resolve(process.env.CONTENT_DIR) : fileURLToPath(new URL('../content/', import.meta.url))).replace(/\/?$/, '/');
mkdirSync(`${root}scores`, { recursive: true });
copyFileSync(file, `${root}scores/${id}.pdf`);

const catalogPath = `${root}scores.json`;
const catalog: Record<string, unknown>[] = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, 'utf8')) : [];
const entry = {
  id, title, composer: arg('composer') ?? '', difficulty, genre: arg('genre') ?? 'Классика',
  description: arg('description') ?? '', pdf: `${id}.pdf`, ...(songId ? { songId } : {}), ...(arg('pages') ? { pages: Number(arg('pages')) } : {}),
};
const i = catalog.findIndex((e) => e.id === id);
if (i >= 0) catalog[i] = { ...catalog[i], ...entry }; else catalog.push(entry);
writeFileSync(catalogPath, `[\n  ${catalog.map((e) => JSON.stringify(e)).join(',\n  ')}\n]\n`);
console.log(`Готово: «${title}» (${id}) ${i >= 0 ? 'обновлено' : 'добавлено'} в каталог. PDF: content/scores/${id}.pdf`);
