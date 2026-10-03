import type { ReactNode } from 'react';
import { useUpsell } from '../context/UpsellContext';

/** Карточка «Доступно в Pro»: кнопка открывает окно с выбором тарифа. */
export function ProLock({ title, children, place }: { title: string; children?: ReactNode; place: string }) {
  const { offerPro } = useUpsell();
  return (
    <div className="card pro-lock-card">
      <span className="pro-lock-ico" aria-hidden>🔒</span>
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
      <button className="btn primary" onClick={() => offerPro({ title, place })}>Открыть с Pro</button>
    </div>
  );
}
