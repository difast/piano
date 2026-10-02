import { LESSONS, LEVELS } from './data/course';
import type { Lesson } from './data/types';

export const formatTime = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const isLessonUnlocked = (lesson: Lesson, completed: string[]) =>
  lesson.prerequisites.every((id) => completed.includes(id));

/** Первый непройденный урок, доступный сейчас. */
export const currentLesson = (completed: string[]) =>
  LESSONS.find((l) => !completed.includes(l.id) && isLessonUnlocked(l, completed)) ?? null;

/** Приводит строку к виду для поиска: регистр, ё/е, пробелы. */
export const normalize = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

/** Дата YYYY-MM-DD со сдвигом в днях (чистая арифметика по строке, без часовых поясов). */
export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
export const weekdayShort = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU', { weekday: 'short', timeZone: 'UTC' });
};

export const levelFor = (completedCount: number) => [...LEVELS].reverse().find((l) => completedCount >= l.from) ?? LEVELS[0];

/** Серия занятий: сколько дней подряд (включая сегодня) были занятия. */
export function practiceStreak(history: Record<string, number>, today: string): number {
  let n = 0;
  for (let d = today; (history[d] ?? 0) > 0; d = shiftDay(d, -1)) n++;
  return n;
}

export const formatClock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
