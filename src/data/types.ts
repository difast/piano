export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: 'Начинающий',
  intermediate: 'Средний',
  advanced: 'Продвинутый',
};

export interface Lesson {
  id: string;
  order: number;
  /** id уроков, которые нужно пройти до этого */
  prerequisites: string[];
  title: string;
  description: string;
  /** Ссылка на видео (mp4 или YouTube embed). Пусто — показывается заглушка. */
  videoUrl?: string;
  durationMin: number;
  instructions: string[];
  exercise: { title: string; description: string; /** ноты для подсказки на пианино */ notes?: string[] };
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
