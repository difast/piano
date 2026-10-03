import { useEffect, useRef, type ReactNode } from 'react';

/** Простое модальное окно: Esc и клик по фону закрывают, фон не прокручивается. */
export function Modal({ title, onClose, children, icon }: { title: string; onClose: () => void; children: ReactNode; icon?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    (box.current?.querySelector('input, textarea, select') as HTMLElement | null)?.focus();
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div ref={box} className="modal form-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" aria-label="Закрыть" onClick={onClose}>×</button>
        {icon && <div className="modal-icon" aria-hidden>{icon}</div>}
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
