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
  const { user, status } = useApp();
  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="logo">🎹 <span>Пианино</span></Link>
          <nav className="nav-desktop" aria-label="Основная навигация">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
          </nav>
          <div className="topbar-right">
            {user && <TimeBadge />}
            {!user && status === 'ready' && <Link to="/login" className="btn small">Войти</Link>}
          </div>
        </div>
      </header>
      <main className="container"><Outlet /></main>
      <nav className="nav-mobile" aria-label="Мобильная навигация">
        {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
      </nav>
      <footer className="footer container muted small">
        <p>© Пианино с нуля · Бесплатные занятия до 15 минут в день</p>
        <p><Link to="/privacy">Политика конфиденциальности</Link> · <Link to="/terms">Пользовательское соглашение</Link></p>
      </footer>
    </>
  );
}
