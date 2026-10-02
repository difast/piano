import { Component, type ReactNode } from 'react';
import { track } from '../services/analytics';

interface State { error: Error | null; copied: boolean }

const details = (e: Error) =>
  [`Ошибка: ${e.message || String(e)}`, `Страница: ${window.location.pathname}`, `Браузер: ${navigator.userAgent}`, e.stack ? `\n${e.stack.split('\n').slice(0, 6).join('\n')}` : ''].join('\n');

/** Ловит ошибки отрисовки: вместо белого экрана показываем понятное сообщение и детали для диагностики. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): State { return { error, copied: false }; }

  componentDidCatch(error: Error) {
    console.error('UI error:', error);
    track('ui_error', { message: String(error?.message ?? error).slice(0, 300), path: window.location.pathname, stack: (error?.stack ?? '').slice(0, 500), ua: navigator.userAgent.slice(0, 200) });
  }

  copy = () => {
    const text = details(this.state.error!);
    (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(() => this.setState({ copied: true })).catch(() => this.setState({ copied: false }));
  };

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="state error" role="alert">
        <h2>Что-то пошло не так</h2>
        <p>Страница не смогла загрузиться. Попробуйте обновить её — ваш прогресс сохранён.</p>
        <div className="actions" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={() => window.location.reload()}>Обновить страницу</button>
          <a className="btn" href="/">На главную</a>
          <button className="btn" onClick={this.copy}>{copied ? 'Скопировано ✓' : 'Скопировать детали'}</button>
        </div>
        <pre className="err-details">{details(error)}</pre>
      </div>
    );
  }
}
