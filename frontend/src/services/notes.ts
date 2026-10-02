export interface PianoKey {
  note: string; // например C#4
  name: string; // C#
  octave: number;
  isBlack: boolean;
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const RU_NAMES: Record<string, string> = {
  C: 'до', 'C#': 'до♯', D: 'ре', 'D#': 'ре♯', E: 'ми', F: 'фа', 'F#': 'фа♯', G: 'соль', 'G#': 'соль♯', A: 'ля', 'A#': 'ля♯', B: 'си',
};

export function buildKeys(startOctave: number, octaves: number): PianoKey[] {
  const keys: PianoKey[] = [];
  for (let o = startOctave; o < startOctave + octaves; o++) {
    for (const n of NAMES) keys.push({ note: `${n}${o}`, name: n, octave: o, isBlack: n.includes('#') });
  }
  keys.push({ note: `C${startOctave + octaves}`, name: 'C', octave: startOctave + octaves, isBlack: false });
  return keys;
}

/** Раскладка компьютерной клавиатуры: два ряда: нижний — от C4, верхний — от C5. */
const LOWER = 'zsxdcvgbhnjm,l.;/'; // C4 … E5
const UPPER = 'q2w3er5t6y7ui9o0p[=]'; // C5 …
export const KEY_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const all = buildKeys(3, 3).map((k) => k.note); // C3 … C6
  [...LOWER].forEach((ch, i) => { if (all[12 + i]) map[ch] = all[12 + i]; });
  [...UPPER].forEach((ch, i) => { if (all[24 + i]) map[ch] = all[24 + i]; });
  return map;
})();
export const keyLabelFor = (note: string) => Object.entries(KEY_MAP).find(([, n]) => n === note)?.[0];
