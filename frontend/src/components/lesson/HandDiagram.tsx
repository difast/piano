import type { Block } from '../../data/types';

const NAMES = ['большой', 'указательный', 'средний', 'безымянный', 'мизинец'];
// высоты пальцев (1 — большой … 5 — мизинец) и смещения для схемы
const H = [58, 92, 104, 94, 72];

/** Схема кисти: пальцы пронумерованы 1–5. Для левой руки порядок зеркальный. */
export function HandDiagram({ block }: { block: Extract<Block, { type: 'hand' }> }) {
  const left = block.hand === 'left';
  const order = left ? [5, 4, 3, 2, 1] : [1, 2, 3, 4, 5];
  const W = 56, GAP = 10, base = 150;
  return (
    <figure className="hand">
      <svg viewBox="0 0 340 190" role="img" aria-label={`Схема ${left ? 'левой' : 'правой'} руки с номерами пальцев`}>
        <rect x="6" y={base - 8} width="328" height="48" rx="22" fill="#e0e7ff" />
        {order.map((f, i) => {
          const h = H[f - 1] + (f === 1 ? 0 : 0);
          const x = 10 + i * (W + GAP);
          const y = f === 1 ? base - h + 16 : base - h;
          return (
            <g key={f}>
              <rect x={x} y={y} width={W} height={h + 12} rx={W / 2} fill="#fff" stroke="#6366f1" strokeWidth="3" />
              <circle cx={x + W / 2} cy={y + 24} r="15" fill="#4f46e5" />
              <text x={x + W / 2} y={y + 30} textAnchor="middle" fontSize="18" fontWeight="700" fill="#fff">{f}</text>
            </g>
          );
        })}
        <text x="170" y={base + 30} textAnchor="middle" fontSize="15" fill="#4338ca" fontWeight="600">{left ? 'Левая рука' : 'Правая рука'}</text>
      </svg>
      <figcaption>{block.caption ?? NAMES.map((n, i) => `${i + 1} — ${n}`).join(' · ')}</figcaption>
    </figure>
  );
}
