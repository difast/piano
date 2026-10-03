import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useApp } from '../context/AppContext';
import { track } from '../services/analytics';

/** Карточка «Доступно в Pro» с понятной кнопкой: гостю — регистрация, на Free — выбор тарифа. */
export function ProLock({ title, children, place }: { title: string; children?: ReactNode; place: string }) {
  const { user } = useApp();
  return (
    <div className="card pro-lock-card">
      <span className="pro-lock-ico" aria-hidden>🔒</span>
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
      <Link className="btn primary" to={user ? '/profile#plans' : '/register'} onClick={() => track('pro_click', { place })}>
        {user ? 'Открыть с Pro' : 'Зарегистрироваться'}
      </Link>
    </div>
  );
}
