import { Component, type ReactNode } from 'react';

interface State { error: Error | null }

/** Ловит ошибки отрисовки: вместо белого экрана показываем понятное сообщение. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error) { console.error('UI error:', error); }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="state error" role="alert">
        <h2>Что-то пошло не так</h2>
        <p>Страница не смогла загрузиться. Попробуйте обновить её — ваш прогресс сохранён.</p>
        <div className="actions" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={() => window.location.reload()}>Обновить страницу</button>
          <a className="btn" href="/">На главную</a>
        </div>
        <p className="muted small">{this.state.error.message}</p>
      </div>
    );
  }
}
