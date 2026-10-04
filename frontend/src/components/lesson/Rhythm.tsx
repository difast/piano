import { useEffect, useRef, useState } from 'react';
import { click } from '../../services/audio';
import type { Block } from '../../data/types';

type RhythmBlock = Extract<Block, { type: 'rhythm' }>;
const GLYPH: Record<number, string> = { 4: '1', 3: '½.', 2: '½', 1.5: '¼.', 1: '¼', 0.75: '⅛.', 0.5: '⅛', 0.25: '1/16' };

/** Длительности в виде полос на «сетке счёта»: ширина полосы = длительность. */
export function RhythmBlockView({ block }: { block: RhythmBlock }) {
  const total = block.total ?? 4;
  return (
    <figure className="rhythm">
      {block.title && <h4>{block.title}</h4>}
      <div className="beat-row">
        {Array.from({ length: total }, (_, i) => <span key={i}>{i + 1}</span>)}
      </div>
      {block.rows.map((r) => (
        <div className="r-row" key={r.label}>
          <span className="r-label">{r.label}</span>
          <div className="r-bar">
            {r.beats.map((b, i) => b < 0
              ? <span key={i} className="seg-note rest" style={{ width: `${(-b / total) * 100}%` }} title="пауза">пауза</span>
              : <span key={i} className="seg-note" style={{ width: `${(b / total) * 100}%` }}>{GLYPH[b] ?? b}</span>)}
          </div>
        </div>
      ))}
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  );
}

/** Метроном: щелчок + визуальный счёт 1-2-3-4. Первая доля акцентирована. */
export function Metronome({ block }: { block: Extract<Block, { type: 'metronome' }> }) {
  const [bpm, setBpm] = useState(block.bpm);
  const [on, setOn] = useState(false);
  const [beat, setBeat] = useState(0);
  const beatRef = useRef(0);
  const per = block.beats ?? 4;

  useEffect(() => {
    if (!on) { setBeat(0); return; }
    beatRef.current = 0;
    const tick = () => { const b = beatRef.current % per; click(b === 0); setBeat(b + 1); beatRef.current += 1; };
    tick();
    const id = window.setInterval(tick, 60000 / bpm);
    return () => window.clearInterval(id);
  }, [on, bpm, per]);

  return (
    <figure className="metro">
      <div className="metro-dots" aria-hidden>{Array.from({ length: per }, (_, i) => i + 1).map((n) => <span key={n} className={beat === n ? 'on' : ''}>{n}</span>)}</div>
      <div className="metro-ctl">
        <button className={`btn small${on ? ' primary' : ''}`} onClick={() => setOn((v) => !v)}>{on ? '■ Стоп' : '▶ Метроном'}</button>
        <label>Темп: <b>{bpm}</b> уд/мин
          <input type="range" min={40} max={120} step={4} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
        </label>
      </div>
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  );
}
