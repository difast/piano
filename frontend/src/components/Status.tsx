import type { ReactNode } from 'react';

export const Spinner = ({ label = 'Загрузка…' }: { label?: string }) => (
  <div className="state" role="status"><div className="spinner" /><p className="muted">{label}</p></div>
);

export const ErrorBox = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="state error" role="alert">
    <p>⚠️ {message}</p>
    {onRetry && <button className="btn" onClick={onRetry}>Повторить</button>}
  </div>
);

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="state"><p><b>{title}</b></p>{children}</div>
);

export const Notice = ({ kind = 'info', children }: { kind?: 'info' | 'success' | 'error'; children: ReactNode }) => (
  <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>
);
