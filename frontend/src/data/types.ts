export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: 'Начинающий',
  intermediate: 'Средний',
  advanced: 'Продвинутый',
};

/** Как подписывать клавиши: none, имя (C, D♯…), русское название, оба или свои подписи по нотам. */
export type LabelMode = 'none' | 'name' | 'ru' | 'both' | Record<string, string>;
/** Шаг упражнения: одна нота или аккорд (несколько нот одновременно). */
export type Step = string | string[];

export type Block =
  | { type: 'text'; title?: string; paragraphs: string[]; bullets?: string[]; tone?: 'tip' | 'warn' }
  /** Схема клавиатуры с подсветкой; sequence — показать порядок нот и дать проиграть демонстрацию. */
  | { type: 'demo'; title?: string; caption?: string; from: string; to: string; highlight?: string[]; sequence?: Step[]; labels?: LabelMode }
  /** Интерактивное упражнение на пианино. */
  | { type: 'play'; title: string; task: string; from: string; to: string; mode?: 'sequence' | 'set' | 'free'; steps?: Step[]; minNotes?: number;
      labels?: LabelMode; hint?: boolean; volume?: boolean; pedal?: boolean; hard?: boolean }
  | { type: 'quiz'; question: string; options: string[]; answer: number; explain: string }
  /** Длительности: каждая строка — набор длительностей в долях (1 = четвертная, отрицательное число — пауза). */
  | { type: 'rhythm'; title?: string; caption?: string; rows: { label: string; beats: number[] }[]; total?: number }
  | { type: 'hand'; hand: 'right' | 'left'; caption?: string }
  | { type: 'checklist'; title: string; items: string[] }
  | { type: 'metronome'; bpm: number; caption?: string; /** долей в такте (по умолчанию 4) */ beats?: number }
  /** Нотный стан: ноты в скрипичном или басовом ключе (аккорд — массив нот). */
  | { type: 'staff'; title?: string; caption?: string; clef?: 'treble' | 'bass'; notes: Step[]; names?: boolean };

export interface Stage {
  id: string;
  title: string;
  /** сколько минут занимает этап (объяснение + практика) */
  minutes: number;
  blocks: Block[];
}

/** Уровень сложности урока */
export type LessonLevel = 'start' | 'basic' | 'middle' | 'advanced';
export const LESSON_LEVEL_LABEL: Record<LessonLevel, string> = { start: 'Начальный', basic: 'Базовый', middle: 'Средний', advanced: 'Продвинутый' };

export interface Lesson {
  id: string;
  /** номер урока в курсе (вычисляется из структуры курса) */
  order: number;
  /** название этапа курса (вычисляется из структуры курса) */
  block: string;
  /** номер этапа курса, с 1 */
  stageNo: number;
  /** уровень сложности (вычисляется из этапа) */
  level: LessonLevel;
  /** задания для самостоятельной практики */
  practice: string[];
  /** ожидаемый результат урока */
  outcome: string;
  /** id уроков, которые нужно пройти до этого */
  prerequisites: string[];
  title: string;
  description: string;
  goals: string[];
  stages: Stage[];
  /** суммарное время этапов, мин */
  durationMin: number;
  /** по желанию: видео к уроку (не обязательно) */
  videoUrl?: string;
  /** мотивационное сообщение при завершении урока */
  milestone?: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  difficulty: Difficulty;
  /** CSS-градиент-заглушка; замените на coverUrl с реальной обложкой */
  cover: string;
  coverUrl?: string;
  description: string;
  videoUrl?: string;
  /** Ноты для подсветки на пианино (пусто, пока материалов нет) */
  notes: string[];
  learningSteps: string[];
  /** demo — тестовые данные, published — настоящие материалы */
  status: 'demo' | 'published';
  /** дополнительные слова для поиска (например, русское написание) */
  keywords?: string[];
}

/** Урок в исходных файлах: номер, этап, уровень и длительность вычисляются из структуры курса (data/course.ts). */
export type LessonSource = Omit<Lesson, 'durationMin' | 'prerequisites' | 'order' | 'block' | 'stageNo' | 'level' | 'practice' | 'outcome'>
  & { order?: number; block?: string; practice?: string[]; outcome?: string };
