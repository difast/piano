/** Простой синтезатор на Web Audio API — сэмплы не нужны. */
let ctx: AudioContext | null = null;
const active = new Map<string, { gain: GainNode; stop: () => void }>();

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
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function startNote(note: string) {
  if (active.has(note)) return;
  const c = getCtx();
  const t = c.currentTime;
  const f = noteFrequency(note);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.35, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.15, t + 0.4);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(6000, f * 6);
  filter.connect(gain).connect(c.destination);
  // две осциллятора — тёплый «фортепианный» тембр
  const o1 = c.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
  const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
  const g2 = c.createGain(); g2.gain.value = 0.25;
  o1.connect(filter); o2.connect(g2).connect(filter);
  o1.start(t); o2.start(t);
  active.set(note, {
    gain,
    stop: () => { o1.stop(c.currentTime + 0.4); o2.stop(c.currentTime + 0.4); },
  });
}

export function stopNote(note: string) {
  const n = active.get(note);
  if (!n || !ctx) return;
  const t = ctx.currentTime;
  n.gain.gain.cancelScheduledValues(t);
  n.gain.gain.setValueAtTime(n.gain.gain.value, t);
  n.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  n.stop();
  active.delete(note);
}

export function stopAll() {
  [...active.keys()].forEach(stopNote);
}
