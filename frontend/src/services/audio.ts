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

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
/** Подписка на состояние звука (для подсказки «звук выключен»). */
export const subscribeAudio = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const getAudioState = (): string => ctx?.state ?? 'none';

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch { ctx = new AC(); }
    ctx.onstatechange = notify;
    // Safari/iOS: «разблокировка» звука беззвучным буфером внутри пользовательского жеста
    try {
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf; src.connect(ctx.destination); src.start(0);
    } catch { /* не критично */ }
  }
  if (ctx.state !== 'running') { try { void ctx.resume().catch(() => undefined); } catch { /* ignore */ } }
  return ctx;
}

// ---- Беззвучный режим iPhone и «просыпание» звука ----
// Крошечный тихий WAV: проигрывая его через <audio>, Safari переключает сессию в режим «воспроизведение»,
// и WebAudio перестаёт глушиться переключателем «без звука».
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YQQAAACAgICA';
let silentEl: HTMLAudioElement | null = null;

function startSilentElement() {
  try {
    if (!silentEl) { silentEl = new Audio(SILENT_WAV); silentEl.loop = true; silentEl.setAttribute('playsinline', ''); silentEl.preload = 'auto'; }
    void silentEl.play().catch(() => undefined);
  } catch { /* ignore */ }
}

/** Вызывать из обработчика пользовательского жеста: создаёт/пробуждает аудио и включает режим «воспроизведение». */
export function unlockAudio() {
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback'; // Safari 16.4+: звук работает при беззвучном режиме
  } catch { /* ignore */ }
  getCtx();
  startSilentElement();
}

let unlockInstalled = false;
/**
 * Разблокирует звук при первом касании/клике/клавише в любом месте страницы (на iOS это нужно делать
 * именно в touchend/click) и пробуждает его после сворачивания вкладки.
 */
export function installAudioUnlock() {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const events = ['touchend', 'pointerup', 'click', 'keydown', 'mousedown'] as const;
  const handler = () => {
    unlockAudio();
    if (ctx?.state === 'running') events.forEach((e) => window.removeEventListener(e, handler, true));
  };
  events.forEach((e) => window.addEventListener(e, handler, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { silentEl?.pause(); return; }
    // вернулись на вкладку: iOS/Android могли приостановить звук — снова ставим «слушателей» жеста
    if (ctx && ctx.state !== 'running') {
      events.forEach((e) => window.addEventListener(e, handler, { capture: true, passive: true }));
      try { void ctx.resume().catch(() => undefined); } catch { /* нужен жест */ }
    }
    if (ctx?.state === 'running') startSilentElement();
  });
}

function fade(v: Voice, seconds: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  v.gain.gain.cancelScheduledValues(t);
  v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0002), t);
  v.gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  v.stop(t + seconds + 0.05);
}

const pending = new Map<string, { volume: number; released: boolean }>();

/** volume: 0..1 (динамика — тихо/громко). Если звук ещё «спит» (первый жест на iOS/Android), нота сыграет сразу после пробуждения. */
export function startNote(note: string, volume = 1) {
  if (active.has(note) || pending.has(note)) return;
  const c = getCtx();
  if (c.state !== 'running') {
    pending.set(note, { volume, released: false });
    let woke: Promise<void>;
    try { woke = c.resume(); } catch { pending.delete(note); return; }
    woke.then(() => {
      const p = pending.get(note);
      if (!p) return;
      pending.delete(note);
      begin(note, p.volume);
      if (p.released) window.setTimeout(() => stopNote(note), 260); // быстрый тап — даём ноте прозвучать
    }).catch(() => pending.delete(note));
    return;
  }
  begin(note, volume);
}

function begin(note: string, volume: number) {
  if (active.has(note) || !ctx) return;
  const c = ctx;
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
  const pend = pending.get(note);
  if (pend) { pend.released = true; return; }
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
