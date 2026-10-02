import { api } from './api';
import { localStore } from './storage';

/** События воронки. Чтобы подключить другую систему (Метрика, GA, Amplitude) — добавьте провайдер в `providers`. */
export type AnalyticsEvent =
  | 'home_view' | 'start_learning_click' | 'signup' | 'login'
  | 'lesson_start' | 'lesson_complete'
  | 'song_open' | 'song_learned'
  | 'piano_open' | 'limit_reached' | 'pro_click' | 'ui_error'
  | 'stage_complete' | 'score_open' | 'score_download' | 'pro_required';

export interface AnalyticsProvider { track(name: AnalyticsEvent, props?: Record<string, unknown>): void }

const consoleProvider: AnalyticsProvider = {
  track: (name, props) => { if (import.meta.env.DEV) console.debug('[analytics]', name, props ?? ''); },
};

function anonId(): string {
  let id = localStore.get<string>('piano:anon', '');
  if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStore.set('piano:anon', id); }
  return id;
}

/** Сохраняет события в собственной БД (таблица events) — этого достаточно, чтобы посчитать воронку. */
const serverProvider: AnalyticsProvider = {
  track: (name, props) => { api.event({ name, props, anonId: anonId() }).catch(() => undefined); },
};

const providers: AnalyticsProvider[] = [consoleProvider, serverProvider];

export const track = (name: AnalyticsEvent, props?: Record<string, unknown>) => {
  try { providers.forEach((p) => p.track(name, props)); } catch { /* аналитика не должна ломать приложение */ }
};
