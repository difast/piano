// Проверка контента курса: npx tsx scripts/validate-lessons.ts (из папки backend: npx tsx ../frontend/scripts/validate-lessons.ts)
import { LESSONS } from '../src/data/course';
import { keysInRange, whiteCount } from '../src/services/notes';
import type { Block, Step } from '../src/data/types';

const problems: string[] = [];
const bad = (where: string, msg: string) => problems.push(`${where}: ${msg}`);
const flat = (steps: Step[] = []) => steps.flatMap((s) => (Array.isArray(s) ? s : [s]));

let stages = 0, plays = 0, quizzes = 0, demos = 0, mins = 0;
LESSONS.forEach((l, i) => {
  const w = `Урок ${l.order} «${l.title}»`;
  if (l.id !== `l${i + 1}` || l.order !== i + 1) bad(w, 'id/order не совпадают с позицией');
  if (l.durationMin < 30 || l.durationMin > 41) bad(w, `длительность ${l.durationMin} мин вне 30–40`);
  if (l.stages.length < 5) bad(w, 'слишком мало этапов');
  mins += l.durationMin;
  l.stages.forEach((s, si) => {
    stages++;
    const ws = `${w}, этап ${si + 1} «${s.title}»`;
    if (!s.blocks.length) bad(ws, 'пустой этап');
    s.blocks.forEach((b: Block, bi) => {
      const wb = `${ws}, блок ${bi + 1} (${b.type})`;
      if (b.type === 'play' || b.type === 'demo') {
        if (b.type === 'play') plays++; else demos++;
        const keys = keysInRange(b.from, b.to);
        const set = new Set(keys.map((k) => k.note));
        const wc = whiteCount(b.from, b.to);
        if (wc > 15) bad(wb, `${wc} белых клавиш (>15) — не уместится без прокрутки на телефоне`);
        const notes = b.type === 'play' ? flat(b.steps) : [...(b.highlight ?? []), ...flat(b.sequence)];
        for (const n of notes) if (!set.has(n)) bad(wb, `нота ${n} вне диапазона ${b.from}–${b.to}`);
        if (typeof b.labels === 'object') for (const n of Object.keys(b.labels)) if (!set.has(n)) bad(wb, `подпись для ${n} вне диапазона`);
        if (b.type === 'play') {
          if (b.mode !== 'free' && !(b.steps?.length)) bad(wb, 'нет шагов');
          if (b.mode === 'free' && !b.minNotes) bad(wb, 'нет minNotes');
          if (!b.task || !b.title) bad(wb, 'нет заголовка/задания');
        }
      }
      if (b.type === 'quiz') { quizzes++; if (b.answer < 0 || b.answer >= b.options.length || b.options.length < 2) bad(wb, 'неверный answer/options'); }
      if (b.type === 'rhythm') for (const r of b.rows) { const sum = r.beats.reduce((a, c) => a + c, 0); if (sum !== (b.total ?? 4)) bad(wb, `строка «${r.label}»: сумма долей ${sum} ≠ ${b.total ?? 4}`); }
    });
  });
  const last = l.stages[l.stages.length - 1];
  if (!last.blocks.some((b) => b.type === 'quiz' || b.type === 'checklist')) bad(w, 'в последнем этапе нет закрепления (тест/чек-лист)');
});
console.log(`Уроков: ${LESSONS.length}, этапов: ${stages}, упражнений: ${plays}, схем: ${demos}, тестов: ${quizzes}, всего минут: ${mins} (среднее ${(mins / LESSONS.length).toFixed(1)})`);
if (problems.length) { console.error('\nПроблемы:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('OK: контент курса корректен');
