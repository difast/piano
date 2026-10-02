export interface User { id: number; email: string; name: string; isPro: boolean }

export interface ProgressState {
  completedLessons: string[];
  learnedSongs: string[];
  /** секунды занятий по дням (YYYY-MM-DD в часовом поясе сервера) */
  history: Record<string, number>;
  today: string;
  todaySeconds: number;
  limitSeconds: number;
  limitReached: boolean;
}

export interface Snapshot { user: User; state: ProgressState; devTools: boolean }

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

/** Адрес бэкенда при раздельном деплое (VITE_API_URL=https://api.example.ru при сборке). Пусто — тот же домен. */
const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');

async function request<T>(method: string, path: string, body?: unknown, keepalive = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method, keepalive, credentials: API_URL ? 'include' : 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.', 0);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error ?? 'Что-то пошло не так. Попробуйте ещё раз.', res.status);
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
  event: (body: unknown) => request<null>('POST', '/events', body, true),
};
