import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, getToken, normalizeState, setToken, type ProgressState, type Snapshot, type User } from '../services/api';
import { track } from '../services/analytics';
import { levelFor, currentLesson, practiceStreak, shiftDay } from '../lib';
import { FREE_DAILY_LIMIT_SEC } from '../data/config';
import { LESSONS } from '../data/course';
import { useToast } from './ToastContext';

type Status = 'loading' | 'ready' | 'error';
export type ClockState = 'off' | 'running' | 'idle' | 'limit';

interface AppState {
  status: Status;
  loadError: string;
  reload: () => void;
  /** тихо обновляет пользователя и прогресс (без экрана загрузки) */
  refresh: () => Promise<void>;
  user: User | null;
  progress: ProgressState;
  devTools: boolean;
  register: (email: string, password: string, name: string, consent: boolean) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  completeLesson: (id: string) => Promise<void>;
  setSongLearned: (id: string, learned: boolean) => Promise<void>;
  setDevPro: (v: boolean) => Promise<void>;
  saveStage: (lessonId: string, stage: number) => void;
  /** Страница сообщает, идёт ли сейчас обучение (урок, песня, пианино): только тогда тикает таймер. */
  setLearning: (on: boolean) => void;
  notifyHardDone: () => void;
  completedLessons: string[];
  learnedSongs: string[];
  currentLessonId: string | null;
  /** секунды занятий сегодня (сервер + ещё не подтверждённые) */
  todaySeconds: number;
  remainingSeconds: number;
  history: Record<string, number>;
  isPro: boolean;
  limitReached: boolean;
  clock: ClockState;
  limitModal: boolean;
  closeLimitModal: () => void;
}

const EMPTY: ProgressState = { completedLessons: [], learnedSongs: [], lessonStages: {}, history: {}, today: '', todaySeconds: 0, limitSeconds: FREE_DAILY_LIMIT_SEC, limitReached: false };
const IDLE_MS = window.__APP_CONFIG__?.idleMs ?? 60_000; // без действий дольше минуты — время не идёт
const FLUSH_SEC = 5;         // как часто отправляем накопленное время на сервер
const MAX_DT_MS = 10_000;    // слишком длинный «провал» (сон, заморозка вкладки) не считаем
const SYNC_EVERY_MS = 30_000; // периодическая сверка с сервером (другие вкладки/устройства)

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [progress, setProgress] = useState<ProgressState>(EMPTY);
  const [devTools, setDevTools] = useState(false);
  const [extra, setExtra] = useState(0);        // секунды, которые сервер ещё не подтвердил
  const [learning, setLearningState] = useState(false);
  const [idle, setIdle] = useState(false);
  const [limitModal, setLimitModal] = useState(false);

  // --- «живое» состояние часов (рефы, чтобы не зависеть от перерисовок) ---
  const learningRef = useRef(false);
  const userRef = useRef<User | null>(null);
  const progressRef = useRef<ProgressState>(EMPTY);
  const lastTick = useRef(Date.now());
  const lastActivity = useRef(Date.now());
  const pendingMs = useRef(0);
  const inflight = useRef(0);
  const flushing = useRef(false);
  const shown = useRef(new Set<string>());
  const lessonsThisSession = useRef(0);
  userRef.current = user;
  progressRef.current = progress;

  const calcExtra = () => inflight.current + Math.floor(pendingMs.current / 1000);
  const refreshExtra = useCallback(() => { const n = calcExtra(); setExtra((p) => (p === n ? p : n)); }, []);

  const applyServerState = useCallback((st: ProgressState) => {
    setProgress((p) => ({ ...st, history: { ...p.history, ...st.history } }));
    refreshExtra();
  }, [refreshExtra]);

  const apply = useCallback((s: Snapshot) => {
    if (!s?.user) throw new Error('Сервис временно недоступен. Попробуйте через пару минут.');
    setUser(s.user); setProgress(normalizeState(s.state)); setDevTools(!!s.devTools);
  }, []);

  const load = useCallback(() => {
    setStatus('loading');
    const sent = getToken();
    api.me().then((r) => {
      // гость: стираем ключ, только если это тот же ключ, с которым спрашивали (вход в другой вкладке не теряется)
      if (r.user) apply(r as Snapshot); else { if (getToken() === sent) setToken(null); setUser(null); setProgress(EMPTY); }
      setStatus('ready');
    }).catch((e: Error) => { setLoadError(e.message); setStatus('error'); });
  }, [apply]);
  useEffect(() => { load(); }, [load]);
  // Страница восстановлена кнопкой «Назад» из кэша браузера (например, вернулись со страницы оплаты) — тихо обновляем данные
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) refreshRef.current(); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);
  const refresh = useCallback(async () => {
    try { const r = await api.me(); if (r.user) apply(r as Snapshot); } catch { /* оставляем прежние данные */ }
  }, [apply]);
  const refreshRef = useRef(refresh); refreshRef.current = refresh;

  // --- отправка накопленного времени ---
  const flush = useCallback((keepalive = false) => {
    const secs = Math.floor(pendingMs.current / 1000);
    if (secs <= 0 || flushing.current || !userRef.current) return;
    pendingMs.current -= secs * 1000;
    inflight.current += secs;
    flushing.current = true;
    api.tick(secs, keepalive)
      .then((r) => { inflight.current -= secs; applyServerState(normalizeState(r?.state)); })
      .catch(() => { inflight.current -= secs; pendingMs.current += secs * 1000; })
      .finally(() => { flushing.current = false; refreshExtra(); });
  }, [applyServerState, refreshExtra]);

  /** Сверка с сервером без начисления времени (источник истины — сервер). */
  const syncNow = useCallback(() => {
    if (!userRef.current) return;
    api.tick(0).then((r) => applyServerState(normalizeState(r?.state))).catch(() => undefined);
  }, [applyServerState]);

  /** Начисляет реальное время, прошедшее с прошлого вызова, только если страница видима и пользователь активен. */
  const accrue = useCallback((ignoreVisibility = false) => {
    const now = Date.now();
    const dt = now - lastTick.current;
    lastTick.current = now;
    if (!learningRef.current || !userRef.current) return;
    if (!ignoreVisibility && document.visibilityState !== 'visible') return;
    if (dt <= 0 || dt > MAX_DT_MS) return;
    const activeUntil = lastActivity.current + IDLE_MS;
    const credited = Math.max(0, Math.min(now, activeUntil) - (now - dt));
    const idleNow = now > activeUntil;
    setIdle((p) => (p === idleNow ? p : idleNow));
    if (credited <= 0) return;
    const p = progressRef.current;
    if (!userRef.current.isPro && p.todaySeconds + calcExtra() >= p.limitSeconds) return;
    pendingMs.current += credited;
    const reached = !userRef.current.isPro && p.todaySeconds + calcExtra() >= p.limitSeconds;
    // лимит достигнут — сразу сообщаем серверу, не дожидаясь обычного интервала
    if (reached || Math.floor(pendingMs.current / 1000) >= FLUSH_SEC) flush();
    refreshExtra();
  }, [flush, refreshExtra]);

  useEffect(() => {
    const id = window.setInterval(() => accrue(), 1000);
    const syncId = window.setInterval(() => { if (learningRef.current && document.visibilityState === 'visible') syncNow(); }, SYNC_EVERY_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        accrue(true);   // успеваем засчитать время до ухода
        flush(true);
      } else {
        lastTick.current = Date.now();   // время «вне вкладки» не засчитываем
        lastActivity.current = Date.now();
        syncNow();
      }
    };
    const onHide = () => { accrue(true); flush(true); };
    let lastMove = 0;
    const bump = () => { lastActivity.current = Date.now(); setIdle(false); };
    const bumpMove = () => { const t = Date.now(); if (t - lastMove > 1000) { lastMove = t; bump(); } };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    window.addEventListener('mousemove', bumpMove, { passive: true });
    return () => {
      window.clearInterval(id); window.clearInterval(syncId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      events.forEach((e) => window.removeEventListener(e, bump));
      window.removeEventListener('mousemove', bumpMove);
    };
  }, [accrue, flush, syncNow]);

  const setLearning = useCallback((on: boolean) => {
    if (on) { lastTick.current = Date.now(); lastActivity.current = Date.now(); }
    else { accrue(true); flush(); }
    learningRef.current = on;
    setLearningState(on); setIdle(false);
  }, [accrue, flush]);

  // --- производные значения ---
  const isPro = !!user?.isPro;
  const todaySeconds = progress.todaySeconds + extra;
  const remainingSeconds = isPro ? Infinity : Math.max(0, progress.limitSeconds - todaySeconds);
  const limitReached = !!user && !isPro && (progress.limitReached || todaySeconds >= progress.limitSeconds);
  const clock: ClockState = !user || !learning ? 'off' : limitReached ? 'limit' : idle || document.visibilityState !== 'visible' ? 'idle' : 'running';
  const historyLive = useMemo(() => (progress.today ? { ...progress.history, [progress.today]: todaySeconds } : progress.history), [progress.history, progress.today, todaySeconds]);

  // --- предупреждения о лимите ---
  const prevRemaining = useRef<number | null>(null);
  useEffect(() => {
    if (!user || isPro) { prevRemaining.current = null; return; }
    const prev = prevRemaining.current;
    prevRemaining.current = remainingSeconds;
    if (prev === null || prev <= remainingSeconds) return; // только когда время реально убывает
    const day = progress.today;
    if (prev > 300 && remainingSeconds <= 300 && remainingSeconds > 60 && !shown.current.has(`w5:${day}`)) {
      shown.current.add(`w5:${day}`); toast('Осталось 5 минут занятий сегодня.', 'warn');
    }
    if (prev > 60 && remainingSeconds <= 60 && remainingSeconds > 0 && !shown.current.has(`w1:${day}`)) {
      shown.current.add(`w1:${day}`); toast('Осталась 1 минута. Заканчивай упражнение.', 'warn', 7000);
    }
    if (remainingSeconds <= 0 && !shown.current.has(`w0:${day}`)) {
      shown.current.add(`w0:${day}`); setLimitModal(true); track('limit_reached');
    }
  }, [remainingSeconds, user, isPro, progress.today, toast]);

  // --- мотивация за занятия ---
  const prevToday = useRef(0);
  useEffect(() => {
    const prev = prevToday.current; prevToday.current = todaySeconds;
    if (!user || todaySeconds <= prev || prev === 0 && todaySeconds > 120) return; // игнорируем начальную загрузку
    const day = progress.today;
    const cross = (t: number) => prev < t && todaySeconds >= t;
    if (cross(60) && !shown.current.has(`d1:${day}`)) {
      shown.current.add(`d1:${day}`);
      const past = Object.entries(progress.history).filter(([d, s]) => d < day && s > 0).map(([d]) => d).sort();
      const streak = practiceStreak(historyLive, day);
      if (past.length === 0) toast('Первый день занятий. Отличное начало!', 'success');
      else if (past[past.length - 1] < shiftDay(day, -3)) toast('С возвращением! Рады, что ты снова занимаешься.', 'success');
      else if ([3, 5, 7, 14, 30].includes(streak)) toast(`Занимаешься ${streak} дн. подряд. Так держать!`, 'success');
    }
    if (cross(600) && !shown.current.has(`d10:${day}`)) { shown.current.add(`d10:${day}`); toast('Сегодня ты уже занимался 10 минут.', 'info'); }
  }, [todaySeconds, user, progress.today, progress.history, historyLive, toast]);

  // --- действия ---
  const completeLesson = useCallback(async (id: string) => {
    const before = progressRef.current.completedLessons.length;
    const snap = await api.completeLesson(id);
    apply(snap);
    track('lesson_complete', { lessonId: id });
    window.dispatchEvent(new Event('achievements:check'));
    const count = normalizeState(snap.state).completedLessons.length;
    if (count <= before) return;
    lessonsThisSession.current += 1;
    const lesson = LESSONS.find((l) => l.id === id);
    const next = LESSONS.find((l) => l.id === currentLesson(normalizeState(snap.state).completedLessons)?.id);
    const msgs: string[] = [];
    if (lesson?.milestone) msgs.push(lesson.milestone);
    else if (count === 1) msgs.push('Отличное начало. Первый урок позади.');
    else if (count === 3) msgs.push('Уже 3 урока. Продолжай в том же темпе.');
    else if (count === 12) msgs.push('Половина курса пройдена!');
    else if (lessonsThisSession.current === 2) msgs.push('Два урока подряд — отличный темп.');
    if (levelFor(count).name !== levelFor(before).name) msgs.push(`Новый уровень: ${levelFor(count).name}.`);
    else if (lesson && next && next.block !== lesson.block) msgs.push(`Открыта новая тема: «${next.block}».`);
    msgs.slice(0, 2).forEach((m, i) => window.setTimeout(() => toast(m, 'success'), i * 900));
  }, [apply, toast]);

  const setSongLearned = useCallback(async (id: string, learned: boolean) => {
    const first = progressRef.current.learnedSongs.length === 0;
    apply(await api.setSongLearned(id, learned));
    window.dispatchEvent(new Event('achievements:check'));
    if (learned) {
      track('song_learned', { songId: id });
      toast(first ? 'Первая песня выучена!' : 'Ещё одна песня в копилке. Так держать!', 'success');
    }
  }, [apply, toast]);

  const saveStage = useCallback((lessonId: string, stage: number) => {
    setProgress((p) => ({ ...p, lessonStages: { ...p.lessonStages, [lessonId]: stage } }));
    api.saveStage(lessonId, stage).catch(() => undefined);
  }, []);

  const notifyHardDone = useCallback(() => { toast('Сложное упражнение пройдено. Отлично!', 'success'); }, [toast]);

  const logout = useCallback(async () => {
    accrue(true); flush();
    await api.logout().catch(() => undefined);
    setUser(null); setProgress(EMPTY); setDevTools(false); setExtra(0);
    pendingMs.current = 0; inflight.current = 0; setLimitModal(false);
  }, [accrue, flush]);

  const value = useMemo<AppState>(() => ({
    status, loadError, reload: load, refresh, user, progress, devTools,
    register: async (email, password, name, consent) => { apply(await api.register(email, password, name, consent)); track('signup'); },
    login: async (email, password) => { apply(await api.login(email, password)); track('login'); },
    logout, completeLesson, setSongLearned,
    setDevPro: async (v) => { apply(await api.setDevPro(v)); },
    saveStage, setLearning, notifyHardDone,
    completedLessons: progress.completedLessons, learnedSongs: progress.learnedSongs,
    currentLessonId: currentLesson(progress.completedLessons)?.id ?? null,
    todaySeconds, remainingSeconds, history: historyLive, isPro, limitReached, clock, limitModal,
    closeLimitModal: () => setLimitModal(false),
  }), [status, loadError, load, refresh, user, progress, devTools, apply, logout, completeLesson, setSongLearned, saveStage, setLearning, notifyHardDone, todaySeconds, remainingSeconds, historyLive, isPro, limitReached, clock, limitModal]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
