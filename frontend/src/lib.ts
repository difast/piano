import { LESSONS } from './data/course';
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
