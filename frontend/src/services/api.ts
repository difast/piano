export interface User { id: number; email: string; name: string; isPro: boolean; /** дата окончания оплаченной подписки (ISO) */ proUntil?: string | null }

export interface BillingPlan { id: string; title: string; days: number; price: string; currency: string }
export interface BillingInfo { enabled: boolean; plans: BillingPlan[]; proUntil: string | null }
export interface OrderStatus { status: 'new' | 'pending' | 'succeeded' | 'canceled' | 'refunded'; plan: string; amount: string; proUntil: string | null }

export interface ProgressState {
  completedLessons: string[];
  learnedSongs: string[];
  /** сохранённый этап (с 0) в незавершённых уроках */
  lessonStages: Record<string, number>;
  /** секунды занятий по дням (YYYY-MM-DD в часовом поясе сервера) */
  history: Record<string, number>;
  today: string;
  todaySeconds: number;
  limitSeconds: number;
  limitReached: boolean;
}

export interface Snapshot { user: User; state: ProgressState; devTools: boolean }

/** Приводит состояние прогресса к безопасному виду, даже если сервер вернул неполные данные. */
export function normalizeState(s: Partial<ProgressState> | null | undefined): ProgressState {
  return {
    completedLessons: Array.isArray(s?.completedLessons) ? s.completedLessons : [],
    learnedSongs: Array.isArray(s?.learnedSongs) ? s.learnedSongs : [],
    lessonStages: s?.lessonStages && typeof s.lessonStages === 'object' ? s.lessonStages : {},
    history: s?.history && typeof s.history === 'object' ? s.history : {},
    today: typeof s?.today === 'string' ? s.today : '',
    todaySeconds: Number(s?.todaySeconds) || 0,
    limitSeconds: Number(s?.limitSeconds) || 900,
    limitReached: !!s?.limitReached,
  };
}

export interface Score {
  id: string; title: string; composer: string; difficulty: 'beginner' | 'intermediate' | 'advanced';
  genre: string; description: string; songId: string | null; pages: number | null; hasPdf: boolean;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

/** Адрес бэкенда при раздельном деплое. Пусто — тот же домен. */
declare global { interface Window { __APP_CONFIG__?: { apiUrl?: string; /** время бездействия до паузы таймера, мс (по умолчанию 60000) */ idleMs?: number } } }
/** Приоритет: public/config.js (задаётся без пересборки) → переменная сборки VITE_API_URL → тот же домен. */
const API_URL = (window.__APP_CONFIG__?.apiUrl || (import.meta.env.VITE_API_URL as string | undefined) || '').replace(/\/$/, '');

export const MSG_OFFLINE = 'Не удаётся связаться с сервером. Проверьте интернет и попробуйте ещё раз.';
export const MSG_UNAVAILABLE = 'Сервис временно недоступен. Попробуйте через пару минут.';

async function request<T>(method: string, path: string, body?: unknown, keepalive = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method, keepalive, credentials: API_URL ? 'include' : 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Подсказку для администратора пишем только в консоль: пользователю она не нужна
    if (API_URL && API_URL !== window.location.origin) console.error(`[api] ${API_URL} не ответил. Проверьте, что бэкенд запущен и что CORS_ORIGIN на нём равен ${window.location.origin}.`);
    throw new ApiError(MSG_OFFLINE, 0);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status >= 500 && !data?.error) throw new ApiError(MSG_UNAVAILABLE, res.status);
    throw new ApiError(data?.error ?? 'Что-то пошло не так. Попробуйте ещё раз.', res.status);
  }
  // ответ 200 без JSON — запрос ушёл не на бэкенд (неверный адрес API или прокси)
  if (res.status !== 204 && data === null) { console.error('[api] ответ не JSON — проверьте apiUrl в config.js'); throw new ApiError(MSG_UNAVAILABLE, res.status); }
  return data as T;
}

export const api = {
  me: () => request<Snapshot | { user: null }>('GET', '/me'),
  register: (email: string, password: string, name: string, consent: boolean) => request<Snapshot>('POST', '/auth/register', { email, password, name, consent }),
  login: (email: string, password: string) => request<Snapshot>('POST', '/auth/login', { email, password }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout', {}),
  completeLesson: (id: string) => request<Snapshot>('POST', `/lessons/${id}/complete`, {}),
  setSongLearned: (id: string, learned: boolean) => request<Snapshot>('PUT', `/songs/${id}/learned`, { learned }),
  tick: (seconds: number, keepalive = false) => request<{ state: ProgressState }>('POST', '/practice/tick', { seconds }, keepalive),
  setDevPro: (isPro: boolean) => request<Snapshot>('POST', '/dev/pro', { isPro }),
  saveStage: (lessonId: string, stage: number) => request<{ ok: true }>('PUT', `/lessons/${lessonId}/stage`, { stage }),
  scores: () => request<{ scores: Score[] }>('GET', '/scores'),
  score: (id: string) => request<{ score: Score }>('GET', `/scores/${encodeURIComponent(id)}`),
  /** Скачивание защищено на сервере: нужен вход и Pro. Возвращает файл как Blob. */
  downloadScore: async (id: string): Promise<Blob> => {
    let res: Response;
    try { res = await fetch(`${API_URL}/api/scores/${encodeURIComponent(id)}/download`, { credentials: API_URL ? 'include' : 'same-origin' }); }
    catch { throw new ApiError(MSG_OFFLINE, 0); }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new ApiError(data?.error ?? (res.status >= 500 ? MSG_UNAVAILABLE : 'Не удалось скачать файл. Попробуйте ещё раз.'), res.status);
    }
    return res.blob();
  },
  billingPlans: () => request<BillingInfo>('GET', '/billing/plans'),
  checkout: (plan: string) => request<{ orderId: string; url: string }>('POST', '/billing/checkout', { plan }),
  order: (id: string) => request<OrderStatus>('GET', `/billing/orders/${encodeURIComponent(id)}`),
  event: (body: unknown) => request<null>('POST', '/events', body, true),
};
