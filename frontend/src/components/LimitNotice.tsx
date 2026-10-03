import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useUpsell } from '../context/UpsellContext';
import { track } from '../services/analytics';

export const LIMIT_TITLE = 'На сегодня достаточно';
export const LIMIT_TEXT = 'Ты использовал свои 15 минут бесплатных занятий.';
export const LIMIT_SUB = 'Прогресс сохранён. Возвращайся завтра или перейди на Pro, чтобы заниматься без ограничений.';

/** Встроенная карточка вместо содержимого урока/песни/пианино, когда дневной лимит исчерпан. */
export function LimitNotice() {
  const { user } = useApp();
  const { offerPro } = useUpsell();
  return (
    <div className="limit-notice big" role="alert">
      <div>
        <h2>{LIMIT_TITLE}</h2>
        <p><b>{LIMIT_TEXT}</b></p>
        <p>{LIMIT_SUB}</p>
      </div>
      <div className="actions">
        <Link to={user ? '/progress' : '/'} className="btn">Продолжить завтра</Link>
        <button className="btn primary" onClick={() => { track('pro_click', { place: 'limit_notice' }); offerPro({ title: 'Занимайтесь без ограничений', text: 'Бесплатные 15 минут на сегодня закончились. С Pro можно продолжить прямо сейчас — без лимита по времени.', place: 'limit_notice' }); }}>Заниматься без ограничений → Pro</button>
      </div>
    </div>
  );
}
