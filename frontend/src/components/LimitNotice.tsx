import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export const LIMIT_TITLE = 'На сегодня достаточно';
export const LIMIT_TEXT = 'Ты использовал свои 15 минут бесплатных занятий.';
export const LIMIT_SUB = 'Прогресс сохранён. Возвращайся завтра или перейди на Pro, чтобы заниматься без ограничений.';

/** Встроенная карточка вместо содержимого урока/песни/пианино, когда дневной лимит исчерпан. */
export function LimitNotice() {
  const { user } = useApp();
  return (
    <div className="limit-notice big" role="alert">
      <div>
        <h2>{LIMIT_TITLE}</h2>
        <p><b>{LIMIT_TEXT}</b></p>
        <p>{LIMIT_SUB}</p>
      </div>
      <div className="actions">
        <Link to={user ? '/progress' : '/'} className="btn">Продолжить завтра</Link>
        <Link to="/profile" className="btn primary">Заниматься без ограничений → Pro</Link>
      </div>
    </div>
  );
}
