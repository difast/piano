import type { Lesson } from './types';
import { LESSONS_A } from './lessons/a';
import { LESSONS_B } from './lessons/b';
import { LESSONS_C } from './lessons/c';
import { LESSONS_D } from './lessons/d';

export const COURSE_TITLE = 'С нуля до уверенной игры на пианино';

export const LEVELS = [
  { name: 'Новичок', from: 0 },
  { name: 'Ученик', from: 4 },
  { name: 'Практик', from: 10 },
  { name: 'Пианист', from: 16 },
  { name: 'Мастер', from: 22 },
];

/** Курс: порядок уроков = порядок в массиве; каждый следующий урок открывается после предыдущего. */
export const LESSONS: Lesson[] = [...LESSONS_A, ...LESSONS_B, ...LESSONS_C, ...LESSONS_D].map((l, i, all) => ({
  ...l,
  prerequisites: i === 0 ? [] : [all[i - 1].id],
  durationMin: l.stages.reduce((a, s) => a + s.minutes, 0),
}));

/** Блоки курса (группы уроков) в порядке следования. */
export const COURSE_BLOCKS = [...new Set(LESSONS.map((l) => l.block))].map((name) => ({
  name,
  lessons: LESSONS.filter((l) => l.block === name),
}));
