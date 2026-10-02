import { useState } from 'react';
import type { Block } from '../../data/types';

export function Checklist({ block, onResult }: { block: Extract<Block, { type: 'checklist' }>; onResult: (all: boolean) => void }) {
  const [on, setOn] = useState<boolean[]>(block.items.map(() => false));
  const toggle = (i: number) => {
    const n = on.map((v, j) => (j === i ? !v : v));
    setOn(n); onResult(n.every(Boolean));
  };
  return (
    <section className="checklist">
      <h4>{block.title}</h4>
      <ul>{block.items.map((t, i) => (
        <li key={i}><label><input type="checkbox" checked={on[i]} onChange={() => toggle(i)} /><span>{t}</span></label></li>
      ))}</ul>
    </section>
  );
}
