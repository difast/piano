import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { daysLeft, daysWord, formatDate, formatDuration } from '../lib';

/** Значок Pro в шапке: по нажатию — карточка со сроком подписки и временем занятий за сегодня. */
export function ProChip() {
  const { user, isPro, todaySeconds } = useApp();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!user || !isPro) return null;

  const until = user.proUntil && Date.parse(user.proUntil) > Date.now() ? user.proUntil : null;
  const left = until ? daysLeft(until) : null;
  const soon = left !== null && left <= 7;

  return (
    <div className="pro-chip-wrap" ref={box}>
      <button className={`pro-chip${soon ? ' soon' : ''}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}
        title={until ? `Pro до ${formatDate(until)}` : 'Pro'}>
        <span aria-hidden>👑</span> Pro{soon && <small> · {left === 0 ? 'сегодня' : `${left} дн.`}</small>}
      </button>
      {open && (
        <div className="pro-pop" role="dialog" aria-label="Подписка Pro">
          <div className="pro-pop-head"><span aria-hidden>👑</span><b>Pro активен</b></div>
          <ul>
            <li><span>Занятия</span><b>без ограничений</b></li>
            <li><span>Сегодня занимался</span><b>{formatDuration(todaySeconds)}</b></li>
            {until && <li><span>Действует до</span><b>{formatDate(until)}</b></li>}
            {left !== null && <li><span>Осталось</span><b className={soon ? 'warn' : ''}>{left === 0 ? 'последний день' : daysWord(left)}</b></li>}
          </ul>
          {until && <Link className={`btn ${soon ? 'primary' : ''} small`} to="/profile#plans">Продлить Pro</Link>}
        </div>
      )}
    </div>
  );
}
