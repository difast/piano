import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildKeys, KEY_MAP, keyLabelFor, RU_NAMES } from '../services/notes';
import { startNote, stopAll, stopNote } from '../services/audio';

interface Props {
  startOctave?: number;
  octaves?: number;
  disabled?: boolean;
  /** Ноты, подсвеченные как подсказка упражнения */
  hint?: string[];
  showKeyboardLabels?: boolean;
  onPlay?: (note: string) => void;
}

export function Piano({ startOctave = 3, octaves = 3, disabled, hint = [], showKeyboardLabels = true, onPlay }: Props) {
  const keys = useMemo(() => buildKeys(startOctave, octaves), [startOctave, octaves]);
  const whites = keys.filter((k) => !k.isBlack);
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [last, setLast] = useState<string | null>(null);
  const physical = useRef(new Set<string>());

  const down = useCallback((note: string) => {
    if (disabled) return;
    startNote(note);
    setPressed((s) => new Set(s).add(note));
    setLast(note);
    onPlay?.(note);
  }, [disabled, onPlay]);

  const up = useCallback((note: string) => {
    stopNote(note);
    setPressed((s) => { const n = new Set(s); n.delete(note); return n; });
  }, []);

  // физическая клавиатура
  useEffect(() => {
    const valid = new Set(keys.map((k) => k.note));
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      const note = KEY_MAP[e.key.toLowerCase()];
      if (!note || !valid.has(note)) return;
      e.preventDefault();
      physical.current.add(e.key.toLowerCase());
      down(note);
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!physical.current.delete(k)) return;
      up(KEY_MAP[k]);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      stopAll();
    };
  }, [keys, down, up]);

  useEffect(() => { if (disabled) { stopAll(); setPressed(new Set()); } }, [disabled]);

  const keyProps = (note: string) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); down(note); },
    // зажатая мышь/палец скользит на соседнюю клавишу — играем её (глиссандо мышью)
    onPointerEnter: (e: React.PointerEvent) => { if (e.buttons === 1 && e.pointerType === 'mouse') down(note); },
    onPointerUp: () => up(note),
    onPointerLeave: () => up(note),
    onPointerCancel: () => up(note),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const wWidth = 100 / whites.length;
  const cls = (note: string, base: string) =>
    `${base}${pressed.has(note) ? ' pressed' : ''}${hint.includes(note) ? ' hint' : ''}`;

  return (
    <div className="piano-wrap">
      <div className="note-display" aria-live="polite">
        {last ? (<><strong>{last.replace(/\d/, '')}</strong><span>{RU_NAMES[last.replace(/\d/, '')]}</span></>) : <span className="muted">Нажмите на клавишу</span>}
      </div>
      <div className="piano-scroll">
        <div className="piano" style={{ minWidth: whites.length * 38 }} role="application" aria-label="Пианино">
          {whites.map((k) => (
            <button key={k.note} className={cls(k.note, 'key white')} style={{ width: `${wWidth}%` }} aria-label={k.note} {...keyProps(k.note)}>
              {showKeyboardLabels && keyLabelFor(k.note) && <span className="kbd">{keyLabelFor(k.note)}</span>}
              <span className="label">{k.name === 'C' ? `C${k.octave}` : k.name}</span>
            </button>
          ))}
          {keys.map((k, i) => {
            if (!k.isBlack) return null;
            const whiteIdx = keys.slice(0, i).filter((x) => !x.isBlack).length;
            return (
              <button key={k.note} className={cls(k.note, 'key black')} aria-label={k.note}
                style={{ left: `${whiteIdx * wWidth - wWidth * 0.3}%`, width: `${wWidth * 0.6}%` }} {...keyProps(k.note)}>
                {showKeyboardLabels && keyLabelFor(k.note) && <span className="kbd">{keyLabelFor(k.note)}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {showKeyboardLabels && <p className="muted small hide-touch">Играйте с клавиатуры: ряд Z‑X‑C‑V… — белые клавиши, S‑D‑G‑H‑J — чёрные (от ноты C4); Q‑W‑E‑R… — следующая октава.</p>}
    </div>
  );
}
