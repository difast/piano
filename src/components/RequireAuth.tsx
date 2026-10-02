import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useApp } from '../context/AppContext';
import { ErrorBox, Spinner } from './Status';

/** Страница доступна только вошедшему пользователю. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, user, loadError, reload } = useApp();
  const loc = useLocation();
  if (status === 'loading') return <Spinner />;
  if (status === 'error') return <ErrorBox message={loadError} onRetry={reload} />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname, notice: 'Войдите или зарегистрируйтесь, чтобы продолжить.' }} />;
  return <>{children}</>;
}
