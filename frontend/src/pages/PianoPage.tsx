import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { usePracticeTimer } from '../hooks/usePracticeTimer';
import { usePageMeta } from '../hooks/usePageMeta';
import { track } from '../services/analytics';
import { Piano } from '../components/Piano';
import { LimitNotice } from '../components/LimitNotice';
import { midiToNote, noteToMidi, isBlackNote } from '../services/notes';

/** Подбирает диапазон под ширину экрана: клавиши всегда умещаются, а октавы переключаются кнопками. */
function rangeFor(octave: number, whites: number) {
  const from = `C${octave}`;
  let m = noteToMidi(from); let count = 1;
  while (count < whites) { m += 1; if (!isBlackNote(midiToNote(m))) count++; }
  return { from, to: midiToNote(m) };
}

export default function PianoPage() {
  usePageMeta('Пианино', 'Виртуальное пианино онлайн: играйте мышью, пальцем на телефоне или клавишами компьютера. Подсветка клавиш и названия нот.');
  const { limitReached } = useApp();
  usePracticeTimer(true);
  useEffect(() => { track('piano_open'); }, []);

  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [octave, setOctave] = useState(3);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const whites = Math.max(8, Math.min(22, Math.floor(width / 46)));
  // чтобы справа не выходить за самые высокие октавы
  const maxOct = Math.max(1, 7 - Math.ceil(whites / 7));
  const oct = Math.min(octave, maxOct);
  const { from, to } = rangeFor(oct, whites);

  return (
    <>
      <h1>Пианино</h1>
      <p className="lead">Свободная практика. Играйте мышью, касанием или клавишами компьютера.</p>
      {limitReached && <LimitNotice />}
      <div ref={box}>
        <Piano from={from} to={to} labels="name" disabled={limitReached} keyboard showNote glide soundTip showKeyboardLabels={width > 700} />
      </div>
      <div className="actions" style={{ justifyContent: 'center', alignItems: 'center', margin: '8px 0' }}>
        <button className="btn small" onClick={() => setOctave(Math.max(1, oct - 1))} disabled={oct <= 1}>◀ Октава ниже</button>
        <span className="muted small">Диапазон: {from}–{to}</span>
        <button className="btn small" onClick={() => setOctave(Math.min(maxOct, oct + 1))} disabled={oct >= maxOct}>Октава выше ▶</button>
      </div>
      {width > 700 && <p className="muted small" style={{ textAlign: 'center' }}>Клавиши компьютера: ряд Z‑X‑C‑V… — белые клавиши, S‑D‑G‑H‑J — чёрные (от ноты C4); Q‑W‑E‑R… — следующая октава.</p>}
    </>
  );
}
