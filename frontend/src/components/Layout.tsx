import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { useApp } from '../context/AppContext';
import { TimerBar } from './TimerBar';
import { LimitModal } from './LimitModal';
import { LegalLink } from './LegalLink';
import { LEGAL_LINKS, OPERATOR } from '../data/legal';

const NAV = [
  { to: '/', label: 'Главная', end: true },
  { to: '/learn', label: 'Обучение' },
  { to: '/songs', label: 'Песни' },
  { to: '/scores', label: 'Ноты' },
  { to: '/piano', label: 'Пианино' },
  { to: '/progress', label: 'Прогресс' },
  { to: '/profile', label: 'Профиль' },
];

export function Layout() {
  const { user, status } = useApp();
  const { pathname } = useLocation();
  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="logo">🎹 <span>Пианино</span></Link>
          <nav className="nav-desktop" aria-label="Основная навигация">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
          </nav>
          <div className="topbar-right">
            {!user && status === 'ready' && <Link to="/login" className="btn small">Войти</Link>}
          </div>
        </div>
      </header>
      <TimerBar />
      <main className="container"><ErrorBoundary key={pathname}><Outlet /></ErrorBoundary></main>
      <nav className="nav-mobile" aria-label="Мобильная навигация">
        {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
      </nav>
      <LimitModal />
      <footer className="footer container muted small">
        <p>© Пианино с нуля · Бесплатные занятия до 15 минут в день</p>
        <p>{LEGAL_LINKS.map((l, i) => <span key={l.to}>{i > 0 && ' · '}<LegalLink to={l.to}>{l.label}</LegalLink></span>)}</p>
        <p>{OPERATOR.name} · ОГРН {OPERATOR.ogrn} · ИНН {OPERATOR.inn} · КПП {OPERATOR.kpp}<br />{OPERATOR.address}</p>
      </footer>
    </>
  );
}
