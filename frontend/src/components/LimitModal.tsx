import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { LIMIT_SUB, LIMIT_TEXT, LIMIT_TITLE } from './LimitNotice';
import { track } from '../services/analytics';

/** Полноценное окно, когда дневное время закончилось. Прогресс урока при этом сохранён. */
export function LimitModal() {
  const { limitModal, closeLimitModal } = useApp();
  const nav = useNavigate();
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!limitModal) return;
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLimitModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [limitModal, closeLimitModal]);

  if (!limitModal) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={closeLimitModal}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="limit-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon" aria-hidden>🎹</div>
        <h2 id="limit-title">{LIMIT_TITLE}</h2>
        <p><b>{LIMIT_TEXT}</b></p>
        <p>{LIMIT_SUB}</p>
        <div className="actions">
          <button className="btn" onClick={() => { closeLimitModal(); nav('/progress'); }}>Продолжить завтра</button>
          <button ref={primary} className="btn primary" onClick={() => { track('pro_click', { place: 'limit_modal' }); closeLimitModal(); nav('/profile'); }}>Заниматься без ограничений → Pro</button>
        </div>
      </div>
    </div>
  );
}
