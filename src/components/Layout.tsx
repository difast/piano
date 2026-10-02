import { NavLink, Outlet, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { TimeBadge } from './LimitNotice';

const NAV = [
  { to: '/', label: 'Главная', end: true },
  { to: '/learn', label: 'Обучение' },
  { to: '/songs', label: 'Песни' },
  { to: '/piano', label: 'Пианино' },
  { to: '/progress', label: 'Прогресс' },
  { to: '/profile', label: 'Профиль' },
];

export function Layout() {
  const { profile } = useApp();
  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="logo">🎹 <span>Пианино</span></Link>
          <nav className="nav-desktop">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
          </nav>
          <div className="topbar-right">
            {profile && <TimeBadge />}
            {!profile && <Link to="/profile" className="btn small">Войти</Link>}
          </div>
        </div>
      </header>
      <main className="container"><Outlet /></main>
      <nav className="nav-mobile">
        {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
      </nav>
      <footer className="footer container muted small">© Пианино с нуля · Бесплатные занятия до 15 минут в день</footer>
    </>
  );
}
