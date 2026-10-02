/** Простой синтезатор на Web Audio API — сэмплы не нужны. */
let ctx: AudioContext | null = null;

interface Voice { gain: GainNode; stop: (when: number) => void }
const active = new Map<string, Voice>();    // клавиша удерживается
const sustained = new Map<string, Voice>(); // клавиша отпущена, но звучит из-за педали
let pedal = false;

const NOTE_INDEX: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

export function noteFrequency(note: string): number {
  const m = /^([A-G]#?)(\d)$/.exec(note);
  if (!m) return 440;
  const midi = (Number(m[2]) + 1) * 12 + NOTE_INDEX[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    // Safari/iOS: «разблокировка» звука беззвучным буфером внутри пользовательского жеста
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination); src.start(0);
  }
  if (ctx.state !== 'running') void ctx.resume();
  return ctx;
}

function fade(v: Voice, seconds: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  v.gain.gain.cancelScheduledValues(t);
  v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0002), t);
  v.gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  v.stop(t + seconds + 0.05);
}

/** volume: 0..1 (динамика — тихо/громко). */
export function startNote(note: string, volume = 1) {
  if (active.has(note)) return;
  const c = getCtx();
  const old = sustained.get(note);
  if (old) { fade(old, 0.06); sustained.delete(note); }
  const t = c.currentTime;
  const f = noteFrequency(note);
  const peak = 0.38 * Math.min(1, Math.max(0.05, volume));
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(peak * 0.42, t + 0.4);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(6000, f * (3 + 3 * volume)); // тихо — мягче тембр
  filter.connect(gain).connect(c.destination);
  // два осциллятора — тёплый «фортепианный» тембр
  const o1 = c.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
  const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
  const g2 = c.createGain(); g2.gain.value = 0.25;
  o1.connect(filter); o2.connect(g2).connect(filter);
  o1.start(t); o2.start(t);
  active.set(note, { gain, stop: (when) => { try { o1.stop(when); o2.stop(when); } catch { /* уже остановлен */ } } });
}

export function stopNote(note: string) {
  const v = active.get(note);
  if (!v || !ctx) return;
  active.delete(note);
  if (pedal) {
    // педаль нажата: звук затухает медленно, пока педаль не отпустят
    sustained.set(note, v);
    fade(v, 2.2);
    return;
  }
  fade(v, 0.35);
}

/** Педаль: пока включена, отпущенные клавиши продолжают звучать. */
export function setSustain(on: boolean) {
  pedal = on;
  if (!on) { sustained.forEach((v) => fade(v, 0.3)); sustained.clear(); }
}

export function stopAll() {
  [...active.keys()].forEach(stopNote);
  sustained.forEach((v) => fade(v, 0.2)); sustained.clear();
}

/** Сыграть ноту заданное время (для демонстраций). */
export function playNote(note: string, ms = 450, volume = 1) {
  startNote(note, volume);
  window.setTimeout(() => stopNote(note), ms);
}

/** Щелчок метронома. */
export function click(accent = false) {
  const c = getCtx();
  const t = c.currentTime;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = 'square'; o.frequency.value = accent ? 1500 : 1000;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.06);
}
