import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { KEY_MAP, keyLabelFor, keysInRange, noteName, noteRu, RU_NAMES } from '../services/notes';
import { getAudioState, startNote, stopAll, stopNote, subscribeAudio, unlockAudio } from '../services/audio';
import type { LabelMode } from '../data/types';

interface Props {
  /** Диапазон (включительно). Клавиши всегда умещаются в ширину — без прокрутки. */
  from?: string;
  to?: string;
  disabled?: boolean;
  /** подсказка (янтарная подсветка) */
  hint?: string[];
  /** текущая цель упражнения (синяя пульсирующая подсветка) */
  current?: string[];
  /** уже сыгранные ноты упражнения (зелёная отметка) */
  done?: string[];
  /** подсвечено программно (например, во время демонстрации) */
  playing?: string[];
  labels?: LabelMode;
  /** клавиши компьютера (только для основного пианино/упражнения, чтобы не играть дважды) */
  keyboard?: boolean;
  showKeyboardLabels?: boolean;
  /** показывать крупное название последней нажатой ноты */
  showNote?: boolean;
  volume?: number;
  /** слайд пальцем/мышью по клавишам (глиссандо). В упражнениях выключено, чтобы случайные касания не давали ошибок */
  glide?: boolean;
  /** подсказка про звук на телефоне (громкость, беззвучный режим) */
  soundTip?: boolean;
  onDown?: (note: string) => void;
  onUp?: (note: string) => void;
}

// Только одно пианино на странице отвечает на клавиатуру компьютера — то, с которым взаимодействовали последним.
let keyboardOwner: string | null = null;

function labelFor(note: string, mode: LabelMode | undefined, isBlack: boolean): { top?: string; bottom?: string } {
  if (!mode || mode === 'none') return {};
  if (typeof mode === 'object') return { bottom: mode[note] };
  const name = noteName(note).replace('#', '♯');
  const withOct = !isBlack && name === 'C' ? `${name}${note.replace(/\D/g, '')}` : name;
  if (mode === 'name') return { bottom: withOct };
  if (mode === 'ru') return { bottom: RU_NAMES[noteName(note)] };
  return { top: withOct, bottom: RU_NAMES[noteName(note)] };
}

export function Piano({
  from = 'C4', to = 'C5', disabled, hint = [], current = [], done = [], playing = [], labels = 'name',
  keyboard = false, showKeyboardLabels = false, showNote = false, volume = 1, glide = false, soundTip = false, onDown, onUp,
}: Props) {
  const id = useId();
  const keys = useMemo(() => keysInRange(from, to), [from, to]);
  const whites = keys.filter((k) => !k.isBlack);
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [last, setLast] = useState<string | null>(null);
  const physical = useRef(new Set<string>());
  const root = useRef<HTMLDivElement>(null);
  const audioState = useSyncExternalStore(subscribeAudio, getAudioState);
  const [touched, setTouched] = useState(false);
  const volRef = useRef(volume); volRef.current = volume;

  const down = useCallback((note: string) => {
    if (disabled) return;
    unlockAudio();
    setTouched(true);
    startNote(note, volRef.current);
    setPressed((s) => new Set(s).add(note));
    setLast(note);
    onDown?.(note);
  }, [disabled, onDown]);

  const up = useCallback((note: string) => {
    stopNote(note);
    setPressed((s) => { if (!s.has(note)) return s; const n = new Set(s); n.delete(note); return n; });
    onUp?.(note);
  }, [onUp]);

  // физическая клавиатура
  useEffect(() => {
    if (!keyboard) return;
    const valid = new Set(keys.map((k) => k.note));
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || !e.key) return;
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      const k = e.key.toLowerCase();
      const note = KEY_MAP[k];
      if (!note || !valid.has(note)) return;
      if (keyboardOwner && keyboardOwner !== id) return;
      keyboardOwner = id;
      e.preventDefault();
      physical.current.add(k);
      down(note);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!e.key) return;
      const k = e.key.toLowerCase();
      if (!physical.current.delete(k)) return;
      up(KEY_MAP[k]);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (keyboardOwner === id) keyboardOwner = null;
    };
  }, [keyboard, keys, down, up, id]);

  // Слайд пальцем: браузер «привязывает» касание к начальной клавише уже после pointerdown — отпускаем его
  // (нативный слушатель надёжнее, чем React-обработчик). Только там, где слайд включён.
  useEffect(() => {
    const el = root.current;
    if (!glide || !el) return;
    const onCapture = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    el.addEventListener('gotpointercapture', onCapture);
    return () => el.removeEventListener('gotpointercapture', onCapture);
  }, [glide]);

  useEffect(() => () => { stopAll(); }, []);
  useEffect(() => { if (disabled) { stopAll(); setPressed(new Set()); } }, [disabled]);

  const claim = () => { if (keyboard) keyboardOwner = id; };
  const keyProps = (note: string) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); claim(); down(note); },
    onPointerUp: () => up(note),
    onPointerLeave: () => up(note),
    onPointerCancel: () => up(note),
    // зажатая мышь скользит на соседнюю клавишу — играем её (глиссандо)
    onPointerEnter: (e: React.PointerEvent) => { if (e.buttons === 1 && (e.pointerType === 'mouse' || (glide && e.pointerType === 'touch'))) down(note); },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const w = 100 / whites.length;
  const cls = (note: string, base: string) =>
    `${base}${pressed.has(note) || playing.includes(note) ? ' pressed' : ''}${hint.includes(note) ? ' hint' : ''}${current.includes(note) ? ' current' : ''}${done.includes(note) ? ' done' : ''}`;

  const renderLabel = (note: string, isBlack: boolean) => {
    const l = labelFor(note, labels, isBlack);
    const kbd = showKeyboardLabels ? keyLabelFor(note) : undefined;
    return (
      <>
        {kbd && <span className="kbd">{kbd}</span>}
        {l.top && <span className="label top">{l.top}</span>}
        {l.bottom && <span className="label">{l.bottom}</span>}
      </>
    );
  };

  return (
    <div className="piano-wrap">
      {showNote && (
        <div className="note-display" aria-live="polite">
          {last ? (<><strong>{noteName(last).replace('#', '♯')}</strong><span>{noteRu(last)}</span></>) : <span className="muted">Нажмите на клавишу</span>}
        </div>
      )}
      <div ref={root} className={`piano${disabled ? ' disabled' : ''}`} style={{ ['--whites' as string]: whites.length }} role="application" aria-label="Пианино">
        {whites.map((k) => (
          <button key={k.note} className={cls(k.note, 'key white')} style={{ width: `${w}%` }} aria-label={k.note} {...keyProps(k.note)}>
            {renderLabel(k.note, false)}
          </button>
        ))}
        {keys.map((k, i) => {
          if (!k.isBlack) return null;
          const whiteIdx = keys.slice(0, i).filter((x) => !x.isBlack).length;
          return (
            <button key={k.note} className={cls(k.note, 'key black')} aria-label={k.note}
              style={{ left: `${whiteIdx * w - w * 0.3}%`, width: `${w * 0.6}%` }} {...keyProps(k.note)}>
              {renderLabel(k.note, true)}
            </button>
          );
        })}
      </div>
      {touched && audioState !== 'running' && audioState !== 'none' && (
        <p className="sound-off" role="status">🔇 Звук ещё не включился — коснитесь клавиши ещё раз. На iPhone проверьте, что выключен беззвучный режим и включена громкость.</p>
      )}
      {whites.length >= 12 && <p className="rotate-hint">Совет: поверните телефон горизонтально — клавиши станут крупнее.</p>}
      {soundTip && <p className="sound-tip">Нет звука? Включите громкость и выключите беззвучный режим телефона.</p>}
    </div>
  );
}
