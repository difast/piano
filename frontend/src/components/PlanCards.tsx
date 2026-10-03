import type { BillingPlan } from '../services/api';
import { formatPrice, planPeriod } from '../lib';

/** Карточки тарифов Pro: цена, срок, выгода относительно помесячной оплаты. */
export function PlanCards({ plans, busy, onBuy }: { plans: BillingPlan[]; busy: boolean; onBuy: (id: string) => void }) {
  const month = plans.find((p) => p.days > 0 && p.days < 365);
  const best = plans.find((p) => p.days >= 365) ? plans.find((p) => p.days >= 365)!.id : null;
  return (
    <div className="plan-cards">
      {plans.map((p) => {
        const period = planPeriod(p.days);
        let note = '';
        if (p.days === 0) note = 'Один платёж — без продлений и сроков';
        else if (p.days >= 365) {
          const perMonth = Number(p.price) / 12;
          const save = month ? Number(month.price) * 12 - Number(p.price) : 0;
          note = `≈ ${formatPrice(String(Math.round(perMonth)))} в месяц` + (save > 0 ? ` · выгода ${formatPrice(String(Math.round(save)))}` : '');
        } else note = 'Попробовать без обязательств';
        return (
          <div key={p.id} className={`plan-card${p.id === best ? ' best' : ''}${p.days === 0 ? ' forever' : ''}`}>
            {p.id === best && <span className="plan-tag">Выгодно</span>}
            {p.days === 0 && <span className="plan-tag gold">Навсегда</span>}
            <div className="plan-name">{p.days === 0 ? 'Pro навсегда' : `Pro на ${period}`}</div>
            <div className="plan-price">{formatPrice(p.price, p.currency)}{p.days > 0 && <small> / {period}</small>}</div>
            <div className="plan-note">{note}</div>
            <button className="btn primary" disabled={busy} onClick={() => onBuy(p.id)}>Оформить</button>
          </div>
        );
      })}
    </div>
  );
}
