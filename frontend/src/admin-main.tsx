import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import Admin from './pages/admin/Admin';
import { api } from './services/api';

/**
 * Отдельная страница админ-кабинета (/admin/): без основного приложения сайта.
 * Любая ошибка показывается на экране и отправляется на сервер (видна в логах бэкенда).
 */
const report = (message: string, stack = '') => {
  try { api.event({ name: 'admin_error', props: { message: message.slice(0, 300), stack: stack.slice(0, 600), ua: navigator.userAgent.slice(0, 200) } }).catch(() => undefined); } catch { /* ничего */ }
};
window.addEventListener('error', (e) => { if (e.message) report(e.message, e.error?.stack); });
window.addEventListener('unhandledrejection', (e) => { const r = e.reason as Error | undefined; report(`Promise: ${r?.message ?? String(r)}`, r?.stack); });

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { report(error.message, error.stack); }
  render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    return (
      <div style={{ padding: 24, maxWidth: 720, margin: '0 auto', color: '#1c1917', fontFamily: 'system-ui, sans-serif' }}>
        <h2>Ошибка в админ-кабинете</h2>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#f5f5f4', padding: 12, borderRadius: 8, fontSize: 12 }}>{`${e.message}\n${(e.stack ?? '').split('\n').slice(0, 8).join('\n')}\n${navigator.userAgent}`}</pre>
        <button style={{ font: 'inherit', padding: '8px 16px' }} onClick={() => window.location.reload()}>Обновить</button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(<StrictMode><Boundary><Admin /></Boundary></StrictMode>);
