import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';

const IDLE_MS = 60_000; // без действий дольше минуты — время не идёт

/**
 * Считает активное время занятий: пока компонент смонтирован, вкладка видна
 * и пользователь что-то делал за последнюю минуту. Остановка при достижении лимита (Free).
 */
export function usePracticeTimer(enabled = true) {
  const { addPracticeSeconds, limitReached } = useApp();
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return;
    const bump = () => { lastActivity.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, bump));
  }, [enabled]);

  useEffect(() => {
    if (!enabled || limitReached) return;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastActivity.current > IDLE_MS) return;
      addPracticeSeconds(1);
    }, 1000);
    return () => clearInterval(id);
  }, [enabled, limitReached, addPracticeSeconds]);
}
