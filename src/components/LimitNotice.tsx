import { Link } from 'react-router-dom';
import { FREE_DAILY_LIMIT_SEC, useApp } from '../context/AppContext';
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
  const { todaySeconds, isPro } = useApp();
  if (isPro) return <span className="badge pro">Pro · без лимита</span>;
  const pct = Math.min(100, (todaySeconds / FREE_DAILY_LIMIT_SEC) * 100);
  return (
    <div className="time-badge" title="Дневной лимит бесплатных занятий">
      <span>{formatTime(todaySeconds)} / 15:00</span>
      <div className="bar"><div style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
