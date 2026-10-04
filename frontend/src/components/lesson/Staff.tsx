import type { Block, Step } from '../../data/types';
import { noteRu } from '../../services/notes';

type StaffBlock = Extract<Block, { type: 'staff' }>;
const LETTERS = 'CDEFGAB';
const SP = 12;          // расстояние между линейками
const TOP = 34;         // y верхней линейки
const BOTTOM = TOP + SP * 4;

/** Диатоническая высота ноты: C4 → 28, D4 → 29 … */
const diatonic = (n: string) => { const m = /^([A-G])(#?)(\d)$/.exec(n); return m ? LETTERS.indexOf(m[1]) + Number(m[3]) * 7 : NaN; };

/** Нотный стан с нотами — для уроков чтения нот (SVG, без внешних шрифтов кроме значка ключа). */
export function StaffView({ block }: { block: StaffBlock }) {
  const bass = block.clef === 'bass';
  const bottomD = bass ? diatonic('G2') : diatonic('E4');      // нижняя линейка: соль (басовый) / ми (скрипичный)
  const y = (d: number) => BOTTOM - (d - bottomD) * (SP / 2);
  const steps: string[][] = block.notes.map((s: Step) => (Array.isArray(s) ? s : [s]));
  const X0 = 78, DX = 48;
  const width = X0 + steps.length * DX + 20;
  const all = steps.flat().map(diatonic);
  const minY = Math.min(...all.map(y), TOP) - 30, maxY = Math.max(...all.map(y), BOTTOM) + (block.names ? 46 : 28);

  return (
    <figure className="staff">
      {block.title && <h4>{block.title}</h4>}
      <div className="staff-scroll">
        <svg viewBox={`0 ${minY} ${width} ${maxY - minY}`} width={width} role="img"
          aria-label={`Ноты: ${steps.map((c) => c.map(noteRu).join('+')).join(', ')}`}>
          {[0, 1, 2, 3, 4].map((i) => <line key={i} x1={8} x2={width - 8} y1={TOP + i * SP} y2={TOP + i * SP} stroke="currentColor" strokeWidth={1.2} opacity={0.75} />)}
          <text x={14} y={bass ? TOP + SP * 3 : BOTTOM + 10} fontSize={bass ? 44 : 66} className="clef">{bass ? '𝄢' : '𝄞'}</text>
          {steps.map((chord, i) => {
            const x = X0 + i * DX;
            const ds = chord.map(diatonic);
            const up = ds.reduce((a, b) => a + b, 0) / ds.length < bottomD + 4;      // ниже середины — штиль вверх
            const ledgers = new Set<number>();
            for (const d of ds) {
              for (let k = bottomD - 2; k >= d; k -= 2) ledgers.add(k);            // добавочные снизу
              for (let k = bottomD + 10; k <= d; k += 2) ledgers.add(k);           // добавочные сверху
            }
            const yTop = Math.min(...ds.map(y)), yBot = Math.max(...ds.map(y));
            return (
              <g key={i}>
                {[...ledgers].map((k) => <line key={k} x1={x - 13} x2={x + 13} y1={y(k)} y2={y(k)} stroke="currentColor" strokeWidth={1.2} />)}
                {chord.map((n, j) => (
                  <g key={j}>
                    {n.includes('#') && <text x={x - 24} y={y(ds[j]) + 6} fontSize={18} fontWeight={700}>♯</text>}
                    <ellipse cx={x} cy={y(ds[j])} rx={7.5} ry={5.6} transform={`rotate(-20 ${x} ${y(ds[j])})`} fill="currentColor" />
                  </g>
                ))}
                {up
                  ? <line x1={x + 6.8} x2={x + 6.8} y1={yBot} y2={yTop - 34} stroke="currentColor" strokeWidth={1.5} />
                  : <line x1={x - 6.8} x2={x - 6.8} y1={yTop} y2={yBot + 34} stroke="currentColor" strokeWidth={1.5} />}
                {block.names && <text x={x} y={maxY - 10} textAnchor="middle" fontSize={12} className="staff-name">{chord.map(noteRu).join('+')}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  );
}
