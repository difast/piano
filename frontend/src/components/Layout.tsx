import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { useApp } from '../context/AppContext';
import { TimerBar } from './TimerBar';
import { LimitModal } from './LimitModal';
import { LegalLink } from './LegalLink';
import { LEGAL_LINKS, OPERATOR } from '../data/legal';

const NAV = [
  { to: '/', label: 'Главная', icon: '🏠', end: true },
  { to: '/learn', label: 'Обучение', icon: '📚' },
  { to: '/songs', label: 'Песни', icon: '🎵' },
  { to: '/scores', label: 'Ноты', icon: '🎼' },
  { to: '/piano', label: 'Пианино', icon: '🎹' },
  { to: '/progress', label: 'Прогресс', icon: '📈' },
  { to: '/profile', label: 'Профиль', icon: '👤' },
];

export function Layout() {
  const { user, status, isPro, logout } = useApp();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const burger = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  // меню закрывается при переходе на другую страницу
  useEffect(() => { setOpen(false); }, [pathname]);

  // пока меню открыто: Esc закрывает, фон не прокручивается, фокус уходит в меню и возвращается на кнопку
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const toggle = burger.current;
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); toggle?.focus({ preventScroll: true }); };
  }, [open]);

  // при расширении окна до «десктопа» меню закрываем
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 901px)');
    const on = () => { if (mq.matches) setOpen(false); };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="logo">🎹 <span>Пианино</span></Link>
          <nav className="nav-desktop" aria-label="Основная навигация">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
          </nav>
          <div className="topbar-right">
            {!user && status === 'ready' && <Link to="/login" className="btn small login-btn">Войти</Link>}
            <button ref={burger} className="burger" aria-label="Открыть меню" aria-expanded={open} aria-controls="side-menu" onClick={() => setOpen(true)}>
              <span /><span /><span />
            </button>
          </div>
        </div>
      </header>

      <div className={`drawer-backdrop${open ? ' open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside id="side-menu" className={`drawer${open ? ' open' : ''}`} role="dialog" aria-modal="true" aria-label="Главное меню" aria-hidden={!open}>
        <div className="drawer-head">
          <Link to="/" className="logo">🎹 <span>Пианино</span></Link>
          <button ref={closeBtn} className="drawer-close" aria-label="Закрыть меню" onClick={() => setOpen(false)}>✕</button>
        </div>
        <nav className="drawer-nav" aria-label="Меню">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}><span className="ico" aria-hidden>{n.icon}</span>{n.label}</NavLink>
          ))}
        </nav>
        <div className="drawer-user">
          {user ? (
            <>
              <div className="who"><b>{user.name || 'Без имени'}</b><span className="muted small">{user.email}</span>
                <span className={`badge ${isPro ? 'pro' : ''}`}>{isPro ? 'Pro' : 'Free'}</span></div>
              <button className="btn" onClick={async () => { await logout(); setOpen(false); nav('/'); }}>Выйти</button>
            </>
          ) : (
            <>
              <Link className="btn primary" to="/register">Начать бесплатно</Link>
              <Link className="btn" to="/login">Войти</Link>
            </>
          )}
        </div>
      </aside>

      <TimerBar />
      <main className="container"><ErrorBoundary key={pathname}><Outlet /></ErrorBoundary></main>
      <LimitModal />
      <footer className="footer container muted small">
        <p>© Пианино с нуля · Бесплатные занятия до 15 минут в день</p>
        <p>{LEGAL_LINKS.map((l, i) => <span key={l.to}>{i > 0 && ' · '}<LegalLink to={l.to}>{l.label}</LegalLink></span>)}</p>
        <p>{OPERATOR.name} · ОГРН {OPERATOR.ogrn} · ИНН {OPERATOR.inn} · КПП {OPERATOR.kpp}<br />{OPERATOR.address}</p>
      </footer>
    </>
  );
}
