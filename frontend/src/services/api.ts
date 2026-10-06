export interface User { id: number; email: string; name: string; isPro: boolean; /** дата окончания оплаченной подписки (ISO) */ proUntil?: string | null; /** почта подтверждена */ emailVerified?: boolean }

export interface NotifySettings { emailNews: boolean; browserNotify: boolean; remind: boolean; remindTime: string; songOfDay: boolean }
export interface Milestone { id: string; at: number; title: string; desc: string; unlocked: boolean; unlockedAt: string | null; isNew: boolean }
export interface AchTrack { id: string; title: string; icon: string; unit: string; current: number; best: number; max: number; milestones: Milestone[] }
export interface Challenge { id: string; kind: 'day' | 'week'; title: string; desc: string; icon: string; target: number; unit: string; current: number; done: boolean; endsAt: string }
export interface Achievements { tracks: AchTrack[]; challenges: Challenge[]; total: number; unlocked: number; referral: { code: string; link: string; friends: number } }
export interface SettingsInfo { settings: NotifySettings; emailVerified: boolean; mailEnabled: boolean; pushKey: string; songOfDay: { id: string; title: string; artist: string } }

export interface BillingPlan { id: string; title: string; days: number; price: string; currency: string }
/** Автопродление Pro: тариф, сумма и дата следующего списания, карта (последние цифры). */
export interface AutopayInfo { plan: string; planTitle: string; amount: string | null; currency: string; card: string | null; since: string | null; chargeAt: string | null }
export interface BillingInfo { enabled: boolean; plans: BillingPlan[]; proUntil: string | null; /** текущий тариф (если Pro действует) */ currentPlan?: string | null; /** что можно купить сейчас */ available?: string[]; autopay?: AutopayInfo | null }
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
  /** открыто для просмотра на Free */
  free?: boolean;
}

export class ApiError extends Error {
  status: number;
  /** машинный код ошибки сервера, например pro_required */
  code?: string;
  constructor(message: string, status: number, code?: string) { super(message); this.status = status; this.code = code; }
}

/** Адрес бэкенда при раздельном деплое. Пусто — тот же домен. */
declare global { interface Window { __APP_CONFIG__?: { apiUrl?: string; /** время бездействия до паузы таймера, мс (по умолчанию 60000) */ idleMs?: number } } }
/** Приоритет: public/config.js (задаётся без пересборки) → переменная сборки VITE_API_URL → тот же домен. */
const API_URL = (window.__APP_CONFIG__?.apiUrl || (import.meta.env.VITE_API_URL as string | undefined) || '').replace(/\/$/, '');

// Токен сессии. Фронт и API на разных доменах, а браузеры (Safari, режим инкогнито, защита от слежки)
// могут не отправлять cookie на чужой домен — поэтому вход держится на токене в заголовке Authorization.
const TOKEN_KEY = 'piano_session';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t: string | null) => { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* хранилище недоступно — остаётся cookie */ } };
const authHeaders = (): Record<string, string> => { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };
// Токен админ-сессии (вход по паролю админки) — отдельно от входа пользователя, только для запросов /admin
const ADMIN_KEY = 'piano_admin';
export const getAdminToken = () => { try { return localStorage.getItem(ADMIN_KEY); } catch { return null; } };
export const setAdminToken = (t: string | null) => { try { if (t) localStorage.setItem(ADMIN_KEY, t); else localStorage.removeItem(ADMIN_KEY); } catch { /* хранилище недоступно */ } };

export const MSG_OFFLINE = 'Не удаётся связаться с сервером. Проверьте интернет и попробуйте ещё раз.';
export const MSG_UNAVAILABLE = 'Сервис временно недоступен. Попробуйте через пару минут.';

async function request<T>(method: string, path: string, body?: unknown, keepalive = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method, keepalive, credentials: API_URL ? 'include' : 'same-origin',
      headers: { ...authHeaders(), ...(path.startsWith('/admin') && getAdminToken() ? { Authorization: `Bearer ${getAdminToken()}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
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
    throw new ApiError(data?.error ?? 'Что-то пошло не так. Попробуйте ещё раз.', res.status, data?.code);
  }
  // ответ 200 без JSON — запрос ушёл не на бэкенд (неверный адрес API или прокси)
  if (res.status !== 204 && data === null) { console.error('[api] ответ не JSON — проверьте apiUrl в config.js'); throw new ApiError(MSG_UNAVAILABLE, res.status); }
  return data as T;
}

// Код приглашения из ссылки ?ref=… — запоминаем на 30 дней и передаём при регистрации
const REF_KEY = 'piano_ref';
export function captureRef() {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && /^[a-z0-9]{4,12}$/.test(ref)) localStorage.setItem(REF_KEY, JSON.stringify({ ref, at: Date.now() }));
  } catch { /* хранилище недоступно */ }
}
function readRef(): string | undefined {
  try { const v = JSON.parse(localStorage.getItem(REF_KEY) ?? 'null') as { ref: string; at: number } | null; return v && Date.now() - v.at < 30 * 86_400_000 ? v.ref : undefined; } catch { return undefined; }
}

// Маркетинговый переход (/go/<slug>): id визита храним 30 дней и передаём при регистрации — так регистрация и оплата связываются с источником
const MKT_KEY = 'piano_mkt';
export function saveMarketingVisit(visitId: string) {
  try { localStorage.setItem(MKT_KEY, JSON.stringify({ v: visitId, at: Date.now() })); } catch { /* хранилище недоступно */ }
}
function readMarketingVisit(): string | undefined {
  try { const x = JSON.parse(localStorage.getItem(MKT_KEY) ?? 'null') as { v: string; at: number } | null; return x && Date.now() - x.at < 30 * 86_400_000 ? x.v : undefined; } catch { return undefined; }
}

const withToken = ({ token, ...snap }: Snapshot & { token?: string }): Snapshot => { if (token) setToken(token); return snap; };

export const api = {
  me: () => request<Snapshot | { user: null }>('GET', '/me'),
  register: async (email: string, password: string, name: string, consent: boolean) => withToken(await request<Snapshot & { token?: string }>('POST', '/auth/register', { email, password, name, consent, ref: readRef(), mkt: readMarketingVisit() })),
  login: async (email: string, password: string) => withToken(await request<Snapshot & { token?: string }>('POST', '/auth/login', { email, password })),
  logout: async () => { try { return await request<{ ok: true }>('POST', '/auth/logout', {}); } finally { setToken(null); } },
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
    try { res = await fetch(`${API_URL}/api/scores/${encodeURIComponent(id)}/download`, { credentials: API_URL ? 'include' : 'same-origin', headers: authHeaders() }); }
    catch { throw new ApiError(MSG_OFFLINE, 0); }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new ApiError(data?.error ?? (res.status >= 500 ? MSG_UNAVAILABLE : 'Не удалось скачать файл. Попробуйте ещё раз.'), res.status);
    }
    return res.blob();
  },
  billingPlans: () => request<BillingInfo>('GET', '/billing/plans'),
  cancelAutopay: () => request<{ ok: true; autopay: null }>('POST', '/billing/autopay/cancel', {}),
  checkout: (plan: string) => request<{ orderId: string; url: string }>('POST', '/billing/checkout', { plan }),
  order: (id: string) => request<OrderStatus>('GET', `/billing/orders/${encodeURIComponent(id)}`),
  resumePayment: async (order: string, r: string) => withToken(await request<Snapshot & { token?: string }>('POST', '/billing/resume', { order, r })),
  // почта и пароль
  sendVerification: () => request<{ ok: true; already?: boolean }>('POST', '/auth/verify/send', {}),
  verifyEmail: (token: string) => request<{ ok: true }>('POST', '/auth/verify', { token }),
  forgotPassword: (email: string) => request<{ ok: true }>('POST', '/auth/forgot', { email }),
  resetPassword: async (token: string, password: string) => withToken(await request<Snapshot & { token?: string }>('POST', '/auth/reset', { token, password })),
  changePassword: (current: string, password: string) => request<{ ok: true }>('POST', '/me/password', { current, password }),
  deleteAccount: async (password: string) => { const r = await request<{ ok: true }>('POST', '/me/delete', { password }); setToken(null); return r; },
  // настройки и уведомления
  settings: () => request<SettingsInfo>('GET', '/me/settings'),
  saveSettings: (patch: Partial<NotifySettings>) => request<{ settings: NotifySettings }>('PUT', '/me/settings', patch),
  pushSubscribe: (subscription: unknown) => request<{ ok: true }>('POST', '/push/subscribe', { subscription }),
  pushUnsubscribe: (endpoint: string) => request<{ ok: true }>('POST', '/push/unsubscribe', { endpoint }),
  pushTest: () => request<{ ok: boolean; delivered: number }>('POST', '/push/test', {}),
  // поддержка и купоны
  support: (message: string, email?: string) => request<{ ok: true }>('POST', '/support', { message, email }),
  redeemCoupon: (code: string) => request<{ ok: true; proUntil: string; days: number }>('POST', '/coupons/redeem', { code }),
  achievements: () => request<Achievements>('GET', '/achievements'),
  achievementsSeen: (ids: string[]) => request<{ ok: true }>('POST', '/achievements/seen', { ids }),
  referral: () => request<{ code: string; link: string }>('GET', '/referral'),
  event: (body: unknown) => request<null>('POST', '/events', body, true),
  marketingClick: (body: unknown) => request<{ visitId: string; recorded: boolean }>('POST', '/mkt/click', body, true),
  /** Админ-кабинет: сервер отвечает только администратору. */
  admin: <T,>(path: string, params?: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();
    return request<T>('GET', `/admin${path}${qs ? `?${qs}` : ''}`);
  },
  adminLogin: async (password: string) => { const r = await request<{ token: string }>('POST', '/admin/login', { password }); setAdminToken(r.token); return r; },
  adminLogout: async () => { try { await request<{ ok: true }>('POST', '/admin/logout', {}); } finally { setAdminToken(null); } },
  adminDemoCard: (userId: number, on: boolean) => request<{ ok: true }>('POST', `/admin/users/${userId}/demo-card`, { on }),
  adminBlock: (userId: number, blocked: boolean) => request<{ ok: true }>('POST', `/admin/users/${userId}/block`, { blocked }),
};
