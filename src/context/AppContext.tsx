import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth, type Profile } from '../services/auth';
import { localStore } from '../services/storage';
import { todayKey } from '../lib';
import { LESSONS } from '../data/course';

export const FREE_DAILY_LIMIT_SEC = 15 * 60;

interface Progress {
  completedLessons: string[];
  learnedSongs: string[];
  /** секунды занятий по дням: { '2026-10-02': 540 } */
  practiceSeconds: Record<string, number>;
}

const PROGRESS_KEY = 'piano:progress';
const EMPTY: Progress = { completedLessons: [], learnedSongs: [], practiceSeconds: {} };

interface AppState {
  profile: Profile | null;
  register: (name: string, email: string) => void;
  logout: () => void;
  setPro: (v: boolean) => void;
  completedLessons: string[];
  learnedSongs: string[];
  toggleLesson: (id: string, done: boolean) => void;
  toggleSong: (id: string) => void;
  nextLessonId: string | null;
  todaySeconds: number;
  limitReached: boolean;
  isPro: boolean;
  addPracticeSeconds: (sec: number) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(() => auth.load());
  const [progress, setProgress] = useState<Progress>(() => ({ ...EMPTY, ...localStore.get<Progress>(PROGRESS_KEY, EMPTY) }));
  const [today, setToday] = useState(todayKey());

  useEffect(() => localStore.set(PROGRESS_KEY, progress), [progress]);

  // смена суток при открытой вкладке
  useEffect(() => {
    const id = setInterval(() => setToday(todayKey()), 30_000);
    return () => clearInterval(id);
  }, []);

  const register = useCallback((name: string, email: string) => {
    const p: Profile = { name, email, isPro: false, createdAt: new Date().toISOString() };
    auth.save(p);
    setProfile(p);
  }, []);
  const logout = useCallback(() => { auth.clear(); setProfile(null); }, []);
  const setPro = useCallback((v: boolean) => {
    setProfile((p) => { if (!p) return p; const n = { ...p, isPro: v }; auth.save(n); return n; });
  }, []);

  const toggleLesson = useCallback((id: string, done: boolean) => {
    setProgress((p) => ({
      ...p,
      completedLessons: done ? [...new Set([...p.completedLessons, id])] : p.completedLessons.filter((x) => x !== id),
    }));
  }, []);
  const toggleSong = useCallback((id: string) => {
    setProgress((p) => ({
      ...p,
      learnedSongs: p.learnedSongs.includes(id) ? p.learnedSongs.filter((x) => x !== id) : [...p.learnedSongs, id],
    }));
  }, []);
  const addPracticeSeconds = useCallback((sec: number) => {
    const k = todayKey();
    setProgress((p) => ({ ...p, practiceSeconds: { ...p.practiceSeconds, [k]: (p.practiceSeconds[k] ?? 0) + sec } }));
  }, []);

  const value = useMemo<AppState>(() => {
    const todaySeconds = progress.practiceSeconds[today] ?? 0;
    const isPro = !!profile?.isPro;
    return {
      profile, register, logout, setPro,
      completedLessons: progress.completedLessons,
      learnedSongs: progress.learnedSongs,
      toggleLesson, toggleSong,
      nextLessonId: LESSONS.find((l) => !progress.completedLessons.includes(l.id))?.id ?? null,
      todaySeconds, isPro,
      limitReached: !isPro && todaySeconds >= FREE_DAILY_LIMIT_SEC,
      addPracticeSeconds,
    };
  }, [profile, progress, today, register, logout, setPro, toggleLesson, toggleSong, addPracticeSeconds]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
