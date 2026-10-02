import { useEffect, useRef, useState } from 'react';
import { Piano } from '../Piano';
import { startNote, stopNote } from '../../services/audio';
import { noteRu } from '../../services/notes';
import type { Block, Step } from '../../data/types';

type Demo = Extract<Block, { type: 'demo' }>;
const asArr = (s: Step) => (Array.isArray(s) ? s : [s]);

/** Схема клавиатуры с подсветкой. Если задана последовательность — её можно проиграть кнопкой. */
export function DemoKeys({ block }: { block: Demo }) {
  const [lit, setLit] = useState<string[]>([]);
  const [step, setStep] = useState(-1);
  const [busy, setBusy] = useState(false);
  const timers = useRef<number[]>([]);
  const seq = block.sequence;
  const hint = block.highlight ?? (seq ? [...new Set(seq.flatMap(asArr))] : []);

  const clear = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };
  useEffect(() => clear, []);

  const run = () => {
    if (!seq || busy) return;
    clear(); setBusy(true);
    seq.forEach((s, i) => {
      const notes = asArr(s);
      timers.current.push(window.setTimeout(() => { setStep(i); setLit(notes); notes.forEach((n) => startNote(n)); }, i * 650));
      timers.current.push(window.setTimeout(() => notes.forEach((n) => stopNote(n)), i * 650 + 520));
    });
    timers.current.push(window.setTimeout(() => { setLit([]); setStep(-1); setBusy(false); }, seq.length * 650 + 100));
  };

  return (
    <figure className="demo">
      {block.title && <h4>{block.title}</h4>}
      <Piano from={block.from} to={block.to} hint={hint} playing={lit} labels={block.labels ?? 'both'} />
      {seq && (
        <div className="seq-row">
          <ol className="chips">
            {seq.map((s, i) => (
              <li key={i} className={i === step ? 'on' : ''}><span className="n">{i + 1}</span>{asArr(s).map(noteRu).join(' + ')}</li>
            ))}
          </ol>
          <button className="btn small" onClick={run} disabled={busy}>▶ {busy ? 'Играет…' : 'Показать и послушать'}</button>
        </div>
      )}
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  );
}
