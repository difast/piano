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

export type LessonStatus = 'locked' | 'available' | 'started' | 'done';
export const LESSON_STATUS_LABEL: Record<LessonStatus, string> = { locked: 'Заблокирован', available: 'Доступен', started: 'Начат', done: 'Завершён' };

/** Статус урока: завершён / начат (есть сохранённый этап) / доступен / заблокирован. */
export const lessonStatus = (lesson: Lesson, completed: string[], stages: Record<string, number> = {}): LessonStatus =>
  completed.includes(lesson.id) ? 'done'
    : !isLessonUnlocked(lesson, completed) ? 'locked'
      : stages[lesson.id] !== undefined ? 'started' : 'available';

/** Прогресс по курсу — всё считается от фактического числа уроков в данных. */
export function courseProgress(completed: string[]) {
  const total = LESSONS.length;
  const done = LESSONS.filter((l) => completed.includes(l.id)).length;
  const current = currentLesson(completed);
  const next = current ? LESSONS.find((l) => l.order === current.order + 1) ?? null : null;
  return { done, total, left: total - done, pct: Math.round((done / total) * 100), finished: done === total, current, next };
}

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

/** «5 000 ₽» из строки вида "5000.00" */
export function formatPrice(v: string, currency = 'RUB'): string {
  const n = Number(v);
  const num = Number.isInteger(n) ? n.toLocaleString('ru-RU') : n.toLocaleString('ru-RU', { minimumFractionDigits: 2 });
  return `${num} ${currency === 'RUB' ? '₽' : currency}`;
}

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s?г\.$/, '');

/** «25 мин», «1 ч 05 мин», «40 сек» */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return `${s} сек`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин`;
  return `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, '0')} мин`;
}

/** Сколько календарных дней осталось до даты по местному времени: 0 — заканчивается сегодня, 1 — завтра. */
export const daysLeft = (iso: string, now = Date.now()) => {
  const day = (t: number) => { const d = new Date(t); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
  return Math.max(0, Math.round((day(Date.parse(iso)) - day(now)) / 86_400_000));
};

export const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
};
export const daysWord = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;

/** Бессрочный Pro хранится как дата окончания в далёком будущем. */
export const isForever = (iso: string | null | undefined) => !!iso && iso >= '2900';
/** Срок тарифа по числу дней (0 — навсегда). */
export const planPeriod = (days: number) => (days === 0 ? 'навсегда' : days >= 365 ? 'год' : 'месяц');
/** «до 8 октября 2026» или «навсегда» */
export const proUntilText = (iso: string) => (isForever(iso) ? 'навсегда' : `до ${formatDate(iso)}`);

/** Выгода тарифа относительно помесячной оплаты. */
export function planBenefit(p: { days: number; price: string }, plans: { days: number; price: string }[]) {
  const month = plans.find((x) => x.days > 0 && x.days < 365);
  const price = Number(p.price);
  if (p.days >= 365) {
    const full = month ? Number(month.price) * 12 : 0;
    const save = full - price;
    return { perMonth: Math.round(price / 12), save: save > 0 ? Math.round(save) : 0, pct: save > 0 ? Math.round((save / full) * 100) : 0, months: 0 };
  }
  if (p.days === 0 && month) return { perMonth: 0, save: 0, pct: 0, months: Math.ceil(price / Number(month.price)) };
  return { perMonth: 0, save: 0, pct: 0, months: 0 };
}
