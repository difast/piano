export interface PianoKey {
  note: string; // например C#4
  name: string; // C#
  octave: number;
  isBlack: boolean;
}

export const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const RU_NAMES: Record<string, string> = {
  C: 'до', 'C#': 'до♯', D: 'ре', 'D#': 'ре♯', E: 'ми', F: 'фа', 'F#': 'фа♯', G: 'соль', 'G#': 'соль♯', A: 'ля', 'A#': 'ля♯', B: 'си',
};

export const noteName = (note: string) => note.replace(/\d+$/, '');
export const noteRu = (note: string) => RU_NAMES[noteName(note)] ?? note;
export const noteOctave = (note: string) => Number(/\d+$/.exec(note)?.[0] ?? 4);
export const isBlackNote = (note: string) => noteName(note).includes('#');

export function noteToMidi(note: string): number {
  return (noteOctave(note) + 1) * 12 + NAMES.indexOf(noteName(note));
}
export function midiToNote(midi: number): string {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Клавиши диапазона [from, to]; края сдвигаются на ближайшие белые клавиши. */
export function keysInRange(from: string, to: string): PianoKey[] {
  let a = noteToMidi(from);
  let b = noteToMidi(to);
  if (b < a) [a, b] = [b, a];
  if (isBlackNote(midiToNote(a))) a -= 1;
  if (isBlackNote(midiToNote(b))) b += 1;
  const keys: PianoKey[] = [];
  for (let m = a; m <= b; m++) {
    const note = midiToNote(m);
    keys.push({ note, name: noteName(note), octave: noteOctave(note), isBlack: isBlackNote(note) });
  }
  return keys;
}
export const whiteCount = (from: string, to: string) => keysInRange(from, to).filter((k) => !k.isBlack).length;

/** Подбирает диапазон под набор нот: все ноты входят, белых клавиш не меньше minWhites. */
export function fitRange(notes: string[], minWhites = 8): { from: string; to: string } {
  const mids = (notes.length ? notes : ['C4', 'C5']).map(noteToMidi);
  let lo = Math.min(...mids);
  let hi = Math.max(...mids);
  let up = true;
  while (whiteCount(midiToNote(lo), midiToNote(hi)) < minWhites) {
    if (up) hi += 1; else lo -= 1;
    up = !up;
  }
  return { from: midiToNote(lo), to: midiToNote(hi) };
}

/** Раскладка компьютерной клавиатуры: два ряда: нижний — от C4, верхний — от C5. */
const LOWER = 'zsxdcvgbhnjm,l.;/'; // C4 … E5
const UPPER = 'q2w3er5t6y7ui9o0p[=]'; // C5 …
export const KEY_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const base = noteToMidi('C3');
  [...LOWER].forEach((ch, i) => { map[ch] = midiToNote(base + 12 + i); });
  [...UPPER].forEach((ch, i) => { map[ch] = midiToNote(base + 24 + i); });
  return map;
})();
export const keyLabelFor = (note: string) => Object.entries(KEY_MAP).find(([, n]) => n === note)?.[0];
