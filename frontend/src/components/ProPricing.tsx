import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { BillingPlan } from '../services/api';
import { formatPrice, planBenefit, plural } from '../lib';

const LABEL = (days: number) => (days === 0 ? 'Навсегда' : days >= 365 ? 'Год' : 'Месяц');

/** Карточка Pro на главной: переключатель «Месяц / Год / Навсегда» с ценой и выгодой. */
export function ProPricing({ plans, cta, children }: { plans: BillingPlan[]; cta: { to: string; label: string; primary: boolean; onClick?: () => void }; children?: ReactNode }) {
  const initial = plans.find((p) => p.days >= 365) ?? plans[0];
  const [id, setId] = useState(initial.id);
  const p = plans.find((x) => x.id === id) ?? initial;
  const b = planBenefit(p, plans);
  return (
    <>
      {plans.length > 1 && (
        <div className="period-switch" role="tablist" aria-label="Срок Pro">
          {plans.map((x) => {
            const xb = planBenefit(x, plans);
            return (
              <button key={x.id} role="tab" aria-selected={x.id === id} className={x.id === id ? 'on' : ''} onClick={() => setId(x.id)}>
                {LABEL(x.days)}{xb.pct > 0 && <span className="ps-badge">−{xb.pct}%</span>}
              </button>
            );
          })}
        </div>
      )}
      <p className="price">{formatPrice(p.price, p.currency)}<small className="muted">{p.days === 0 ? ' навсегда' : p.days >= 365 ? ' / год' : ' / месяц'}</small></p>
      <p className="plan-benefit">
        {p.days >= 365 && <>≈ {formatPrice(String(b.perMonth))} в месяц{b.save > 0 && <> · <b>выгода {formatPrice(String(b.save))}</b> в сравнении с помесячной оплатой</>}</>}
        {p.days === 0 && (b.months > 0
          ? <>Один платёж — стоит как {b.months} {plural(b.months, 'месяц', 'месяца', 'месяцев')} помесячно, а действует <b>всегда</b></>
          : <>Один платёж — без продлений и сроков</>)}
        {p.days > 0 && p.days < 365 && <>Попробовать Pro без обязательств. Автосписаний нет.</>}
      </p>
      {children}
      <Link className={`btn ${cta.primary ? 'primary' : ''}`} to={cta.to} onClick={cta.onClick}>{cta.label}</Link>
    </>
  );
}
