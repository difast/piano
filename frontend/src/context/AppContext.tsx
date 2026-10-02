import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, normalizeState, type ProgressState, type Snapshot, type User } from '../services/api';
import { track } from '../services/analytics';
import { currentLesson } from '../lib';
import { FREE_DAILY_LIMIT_SEC } from '../data/config';

type Status = 'loading' | 'ready' | 'error';

interface AppState {
  status: Status;
  loadError: string;
  reload: () => void;
  user: User | null;
  progress: ProgressState;
  devTools: boolean;
  register: (email: string, password: string, name: string, consent: boolean) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  completeLesson: (id: string) => Promise<void>;
  setSongLearned: (id: string, learned: boolean) => Promise<void>;
  setDevPro: (v: boolean) => Promise<void>;
  /** вызывается раз в секунду активного времени */
  recordActiveSecond: () => void;
  completedLessons: string[];
  learnedSongs: string[];
  currentLessonId: string | null;
  todaySeconds: number;
  isPro: boolean;
  limitReached: boolean;
}

const EMPTY: ProgressState = { completedLessons: [], learnedSongs: [], history: {}, today: '', todaySeconds: 0, limitSeconds: FREE_DAILY_LIMIT_SEC, limitReached: false };
const FLUSH_EVERY = 5;

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [progress, setProgress] = useState<ProgressState>(EMPTY);
  const [devTools, setDevTools] = useState(false);
  const pending = useRef(0);
  const flushing = useRef(false);

  const apply = useCallback((s: Snapshot) => {
    if (!s?.user) throw new Error('Сервер вернул некорректный ответ');
    setUser(s.user); setProgress(normalizeState(s.state)); setDevTools(!!s.devTools);
  }, []);

  const load = useCallback(() => {
    setStatus('loading');
    api.me().then((r) => {
      if (r.user) apply(r as Snapshot); else { setUser(null); setProgress(EMPTY); }
      setStatus('ready');
    }).catch((e: Error) => { setLoadError(e.message); setStatus('error'); });
  }, [apply]);
  useEffect(() => { load(); }, [load]);

  const flush = useCallback((keepalive = false) => {
    if (pending.current <= 0 || flushing.current) return;
    const n = pending.current;
    pending.current = 0;
    flushing.current = true;
    api.tick(n, keepalive)
      .then((r) => {
        const st = normalizeState(r?.state);
        setProgress(() => {
          const todaySeconds = st.todaySeconds + pending.current;
          return { ...st, todaySeconds, history: st.today ? { ...st.history, [st.today]: todaySeconds } : st.history };
        });
      })
      .catch(() => { pending.current += n; })
      .finally(() => { flushing.current = false; });
  }, []);

  useEffect(() => {
    const id = setInterval(() => flush(), FLUSH_EVERY * 1000);
    const onHide = () => { if (document.visibilityState === 'hidden') flush(true); };
    document.addEventListener('visibilitychange', onHide);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onHide); };
  }, [flush]);

  const recordActiveSecond = useCallback(() => {
    pending.current += 1;
    // оптимистично обновляем UI; сервер потом присылает точное значение
    setProgress((p) => {
      const todaySeconds = p.todaySeconds + 1;
      return { ...p, todaySeconds, history: p.today ? { ...p.history, [p.today]: todaySeconds } : p.history };
    });
    if (pending.current >= FLUSH_EVERY) flush();
  }, [flush]);

  const isPro = !!user?.isPro;
  const limitReached = !!user && !isPro && progress.todaySeconds >= progress.limitSeconds;

  const wasLimited = useRef(false);
  useEffect(() => {
    if (limitReached && !wasLimited.current) track('limit_reached');
    wasLimited.current = limitReached;
  }, [limitReached]);

  const value = useMemo<AppState>(() => ({
    status, loadError, reload: load, user, progress, devTools,
    register: async (email, password, name, consent) => { apply(await api.register(email, password, name, consent)); track('signup'); },
    login: async (email, password) => { apply(await api.login(email, password)); track('login'); },
    logout: async () => { flush(); await api.logout().catch(() => undefined); setUser(null); setProgress(EMPTY); setDevTools(false); },
    completeLesson: async (id) => { apply(await api.completeLesson(id)); track('lesson_complete', { lessonId: id }); },
    setSongLearned: async (id, learned) => { apply(await api.setSongLearned(id, learned)); if (learned) track('song_learned', { songId: id }); },
    setDevPro: async (v) => { apply(await api.setDevPro(v)); },
    recordActiveSecond,
    completedLessons: progress.completedLessons,
    learnedSongs: progress.learnedSongs,
    currentLessonId: currentLesson(progress.completedLessons)?.id ?? null,
    todaySeconds: progress.todaySeconds, isPro, limitReached,
  }), [status, loadError, load, user, progress, devTools, apply, flush, recordActiveSecond, isPro, limitReached]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
