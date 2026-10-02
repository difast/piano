import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';

const IDLE_MS = 60_000; // без действий дольше минуты — время не идёт

/**
 * Считает активное время: компонент на экране + вкладка видна + за последнюю минуту
 * были действия пользователя. Секунды отправляются на сервер, он ведёт лимит.
 */
export function usePracticeTimer(enabled = true) {
  const { recordActiveSecond, limitReached, user } = useApp();
  const lastActivity = useRef(Date.now());
  const on = enabled && !!user;

  useEffect(() => {
    if (!on) return;
    lastActivity.current = Date.now();
    const bump = () => { lastActivity.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, bump));
  }, [on]);

  useEffect(() => {
    if (!on || limitReached) return;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastActivity.current > IDLE_MS) return;
      recordActiveSecond();
    }, 1000);
    return () => clearInterval(id);
  }, [on, limitReached, recordActiveSecond]);
}
