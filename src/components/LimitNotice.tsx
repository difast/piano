import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatTime } from '../lib';

export const LIMIT_MESSAGE = 'Ты достиг дневного лимита. Возвращайся завтра или подключи Pro для безлимитных занятий.';

export function LimitNotice() {
  return (
    <div className="limit-notice" role="alert">
      <p>{LIMIT_MESSAGE}</p>
      <Link to="/profile" className="btn primary">Подключить Pro</Link>
    </div>
  );
}

export function TimeBadge() {
  const { todaySeconds, isPro, progress } = useApp();
  if (isPro) return <span className="badge pro">Pro · без лимита</span>;
  const pct = Math.min(100, (todaySeconds / progress.limitSeconds) * 100);
  return (
    <div className="time-badge" title="Дневной лимит бесплатных занятий">
      <span>{formatTime(Math.min(todaySeconds, progress.limitSeconds))} / {formatTime(progress.limitSeconds)}</span>
      <div className="bar"><div style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
