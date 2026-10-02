import { useCallback, useEffect, useRef, useState } from 'react';
import { Piano } from '../Piano';
import { setSustain } from '../../services/audio';
import { noteRu } from '../../services/notes';
import type { Block, Step } from '../../data/types';

type Play = Extract<Block, { type: 'play' }>;
export interface ExerciseResult { done: boolean; errors: number; total: number }
const asArr = (s: Step) => (Array.isArray(s) ? s : [s]);
const VOLUMES = [{ l: 'Тихо (p)', v: 0.22 }, { l: 'Средне (mf)', v: 0.6 }, { l: 'Громко (f)', v: 1 }];

/**
 * Интерактивное упражнение. Проверяется только то, какие клавиши нажал пользователь на экране
 * (никакого распознавания звука): последовательность, набор клавиш или свободная игра.
 */
export function PlayExercise({ block, onResult, onHardDone }: { block: Play; onResult: (r: ExerciseResult) => void; onHardDone?: () => void }) {
  const mode = block.mode ?? (block.steps ? 'sequence' : 'free');
  const steps = block.steps ?? [];
  const [hintOn, setHintOn] = useState(block.hint !== false);
  const [idx, setIdx] = useState(0);
  const [errors, setErrors] = useState(0);
  const [found, setFound] = useState<string[]>([]);
  const [count, setCount] = useState(0);
  const [done, setDone] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [lastNote, setLastNote] = useState<string | null>(null);
  const [volume, setVolume] = useState(block.volume ? 0.6 : 1);
  const [pedal, setPedal] = useState(false);
  const held = useRef(new Set<string>());
  const st = useRef({ idx: 0, errors: 0, found: new Set<string>(), count: 0, done: false });

  const total = mode === 'sequence' ? steps.length : mode === 'set' ? new Set(steps.flatMap(asArr)).size : block.minNotes ?? 8;

  const finish = useCallback((errs: number) => {
    st.current.done = true; setDone(true);
    onResult({ done: true, errors: errs, total });
    if (block.hard) onHardDone?.();
  }, [block.hard, onHardDone, onResult, total]);

  const reset = () => {
    st.current = { idx: 0, errors: 0, found: new Set(), count: 0, done: false };
    held.current.clear();
    setIdx(0); setErrors(0); setFound([]); setCount(0); setDone(false); setLastNote(null);
  };

  useEffect(() => { setSustain(pedal); return () => setSustain(false); }, [pedal]);

  const flashWrong = () => { setWrong(true); window.setTimeout(() => setWrong(false), 350); };

  const onDown = useCallback((note: string) => {
    held.current.add(note);
    setLastNote(note);
    const s = st.current;
    if (s.done) return;
    if (mode === 'free') {
      s.count += 1; setCount(s.count);
      if (s.count >= total) finish(0);
    } else if (mode === 'set') {
      const targets = new Set(steps.flatMap(asArr));
      if (targets.has(note) && !s.found.has(note)) { s.found.add(note); setFound([...s.found]); if (s.found.size >= targets.size) finish(0); }
      else if (!targets.has(note)) { s.errors += 1; setErrors(s.errors); flashWrong(); }
    } else {
      const targets = asArr(steps[s.idx]);
      if (targets.includes(note)) {
        if (targets.every((t) => held.current.has(t))) {
          s.idx += 1; setIdx(s.idx);
          if (s.idx >= steps.length) finish(s.errors);
        }
      } else { s.errors += 1; setErrors(s.errors); flashWrong(); }
    }
  }, [mode, steps, total, finish]);

  const onUp = useCallback((note: string) => { held.current.delete(note); }, []);

  const targets = mode === 'sequence' && !done ? asArr(steps[idx] ?? []) : [];
  const remaining = mode === 'set' ? [...new Set(steps.flatMap(asArr))].filter((n) => !found.includes(n)) : [];
  const accuracy = total > 0 ? Math.max(0, Math.round(((total - Math.min(errors, total)) / total) * 100)) : 100;

  return (
    <section className={`exercise${done ? ' is-done' : ''}`}>
      <header>
        <span className="tag">Упражнение</span>
        <h4>{block.title}</h4>
        <p>{block.task}</p>
      </header>

      {mode === 'sequence' && (
        <ol className="chips">
          {steps.map((s, i) => (
            <li key={i} className={i < idx ? 'ok' : i === idx && !done ? 'on' : ''}>
              <span className="n">{i < idx ? '✓' : i + 1}</span>{hintOn || i < idx ? asArr(s).map(noteRu).join(' + ') : '?'}
            </li>
          ))}
        </ol>
      )}
      {mode === 'set' && (
        <ul className="chips">
          {[...new Set(steps.flatMap(asArr))].map((n) => <li key={n} className={found.includes(n) ? 'ok' : ''}><span className="n">{found.includes(n) ? '✓' : '•'}</span>{hintOn || found.includes(n) ? noteRu(n) : '?'}</li>)}
        </ul>
      )}

      <Piano from={block.from} to={block.to} labels={block.labels ?? 'both'} keyboard
        current={hintOn ? targets : []} hint={hintOn && mode === 'set' ? remaining : []} volume={volume} onDown={onDown} onUp={onUp} />

      <div className={`ex-status${wrong ? ' wrong' : ''}`} aria-live="polite">
        {done ? (
          <strong className="good">
            ✓ Упражнение выполнено
            {mode === 'sequence' && <> · ошибок: {errors}{errors === 0 ? ' — безупречно!' : ` (точность ${accuracy}%)`}</>}
            {mode === 'set' && <> · найдено: {total} из {total}</>}
            {mode === 'free' && <> · сыграно нот: {count}</>}
          </strong>
        ) : (
          <span>
            {mode === 'sequence' && <>Шаг {Math.min(idx + 1, steps.length)} из {steps.length}{hintOn && targets.length ? <> · нажми: <b>{targets.map(noteRu).join(' + ')}</b></> : null}{errors > 0 && <> · ошибок: {errors}</>}</>}
            {mode === 'set' && <>Найдено {found.length} из {total}</>}
            {mode === 'free' && <>Сыграно {Math.min(count, total)} из {total} нот — играй свободно</>}
            {lastNote && <span className="muted"> · последняя нота: {noteRu(lastNote)}</span>}
          </span>
        )}
      </div>

      <div className="ex-controls">
        {mode !== 'free' && <button className="btn small" onClick={() => setHintOn((v) => !v)}>{hintOn ? 'Скрыть подсказки' : 'Показать подсказки'}</button>}
        <button className="btn small" onClick={reset}>{done ? 'Повторить' : 'Начать сначала'}</button>
        {block.volume && (
          <span className="seg" role="group" aria-label="Громкость">
            {VOLUMES.map((v) => <button key={v.l} className={volume === v.v ? 'active' : ''} onClick={() => setVolume(v.v)}>{v.l}</button>)}
          </span>
        )}
        {block.pedal && <button className={`btn small${pedal ? ' primary' : ''}`} onClick={() => setPedal((p) => !p)} aria-pressed={pedal}>Педаль: {pedal ? 'нажата' : 'отпущена'}</button>}
      </div>
    </section>
  );
}
