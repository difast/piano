import type { Block, LabelMode, Stage, Step } from '../types';

/** Разбирает последовательность: 'C4 D4 E4+G4' → ['C4','D4',['E4','G4']] (знак + — аккорд). */
export const S = (s: string): Step[] => s.trim().split(/\s+/).map((t) => (t.includes('+') ? t.split('+') : t));

export const text = (title: string | undefined, paragraphs: string | string[], bullets?: string[]): Block =>
  ({ type: 'text', title, paragraphs: Array.isArray(paragraphs) ? paragraphs : [paragraphs], bullets });
export const tip = (paragraphs: string | string[], title?: string): Block =>
  ({ type: 'text', title, paragraphs: Array.isArray(paragraphs) ? paragraphs : [paragraphs], tone: 'tip' });
export const warn = (paragraphs: string | string[], title?: string): Block =>
  ({ type: 'text', title, paragraphs: Array.isArray(paragraphs) ? paragraphs : [paragraphs], tone: 'warn' });

export const demo = (title: string | undefined, from: string, to: string, o: { highlight?: string; seq?: string; labels?: LabelMode; caption?: string } = {}): Block =>
  ({ type: 'demo', title, from, to, highlight: o.highlight?.split(' '), sequence: o.seq ? S(o.seq) : undefined, labels: o.labels, caption: o.caption });

type PlayOpts = { mode?: 'sequence' | 'set' | 'free'; minNotes?: number; labels?: LabelMode; hint?: boolean; volume?: boolean; pedal?: boolean; hard?: boolean };
export const play = (title: string, task: string, from: string, to: string, steps: string | undefined, o: PlayOpts = {}): Block =>
  ({ type: 'play', title, task, from, to, steps: steps ? S(steps) : undefined, mode: o.mode ?? (steps ? 'sequence' : 'free'), minNotes: o.minNotes, labels: o.labels, hint: o.hint, volume: o.volume, pedal: o.pedal, hard: o.hard });
/** Найди все указанные клавиши (в любом порядке). */
export const find = (title: string, task: string, from: string, to: string, notes: string, o: PlayOpts = {}): Block =>
  play(title, task, from, to, notes, { ...o, mode: 'set' });
/** Свободная игра с целью (засчитывается после minNotes нажатий). */
export const free = (title: string, task: string, from: string, to: string, minNotes: number, o: PlayOpts = {}): Block =>
  play(title, task, from, to, undefined, { ...o, mode: 'free', minNotes });

export const quiz = (question: string, options: string[], answer: number, explain: string): Block => ({ type: 'quiz', question, options, answer, explain });
export const rhythm = (title: string | undefined, rows: { label: string; beats: number[] }[], caption?: string, total = 4): Block => ({ type: 'rhythm', title, rows, caption, total });
export const hand = (h: 'right' | 'left', caption?: string): Block => ({ type: 'hand', hand: h, caption });
export const checklist = (title: string, items: string[]): Block => ({ type: 'checklist', title, items });
export const metro = (bpm: number, caption?: string, beats?: number): Block => ({ type: 'metronome', bpm, caption, beats });
/** Нотный стан: staff('Заголовок', 'C4 E4 G4', { clef: 'bass', names: true }) */
export const staff = (title: string | undefined, notes: string, o: { clef?: 'treble' | 'bass'; names?: boolean; caption?: string } = {}): Block =>
  ({ type: 'staff', title, notes: S(notes), clef: o.clef ?? 'treble', names: o.names, caption: o.caption });

export const stage = (id: string, title: string, minutes: number, ...blocks: Block[]): Stage => ({ id, title, minutes, blocks });
