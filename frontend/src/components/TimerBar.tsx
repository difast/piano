import { useApp } from '../context/AppContext';
import { formatClock } from '../lib';

const LABEL = { running: '▶ время идёт', idle: '⏸ пауза', off: '⏸ вне занятий', limit: '■ лимит исчерпан' } as const;

/** Постоянно видимый таймер дневного лимита (под шапкой на всех страницах для вошедшего пользователя). */
export function TimerBar() {
  const { user, isPro, remainingSeconds, todaySeconds, progress, clock } = useApp();
  if (!user) return null;
  if (isPro) return null;   // у Pro лимита нет — время занятий показывает значок Pro в шапке
  const pct = Math.min(100, (todaySeconds / progress.limitSeconds) * 100);
  const level = remainingSeconds <= 0 ? 'limit' : remainingSeconds <= 60 ? 'crit' : remainingSeconds <= 300 ? 'warn' : 'ok';
  return (
    <div className={`timerbar ${level} ${clock}`} role="timer" aria-live="off" aria-label={`Осталось сегодня: ${formatClock(remainingSeconds)}`}>
      <div className="container timerbar-inner">
        <span className="tb-main">Осталось сегодня: <b className="tb-time">{formatClock(remainingSeconds)}</b></span>
        <span className="tb-bar" aria-hidden><i style={{ width: `${pct}%` }} /></span>
        <span className="tb-state">{LABEL[clock]}</span>
      </div>
    </div>
  );
}
