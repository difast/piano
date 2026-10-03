import type { BillingPlan } from '../services/api';
import { formatDate, formatPrice, planBenefit, planPeriod, plural } from '../lib';

/**
 * Карточки тарифов Pro: цена, срок, выгода относительно помесячной оплаты.
 * after — дата окончания текущей подписки: тогда показываем, с какого момента начнётся новый тариф.
 */
export function PlanCards({ plans, all = plans, busy, onBuy, after }: { plans: BillingPlan[]; all?: BillingPlan[]; busy: boolean; onBuy: (id: string) => void; after?: string | null }) {
  const best = plans.find((p) => p.days >= 365)?.id ?? null;
  return (
    <div className="plan-cards">
      {plans.map((p) => {
        const period = planPeriod(p.days);
        const b = planBenefit(p, all);
        const note = p.days === 0
          ? (b.months > 0 ? `Один платёж — как ${b.months} ${plural(b.months, 'месяц', 'месяца', 'месяцев')} помесячно, а действует всегда` : 'Один платёж — без продлений и сроков')
          : p.days >= 365 ? `≈ ${formatPrice(String(b.perMonth))} в месяц` + (b.save > 0 ? ` · выгода ${formatPrice(String(b.save))} (−${b.pct}%)` : '')
          : 'Попробовать без обязательств';
        const start = after && p.days > 0
          ? `Начнётся ${formatDate(after)}, после текущей подписки. Pro будет до ${formatDate(new Date(Date.parse(after) + p.days * 86_400_000).toISOString())}.`
          : after && p.days === 0 ? 'Действует сразу после оплаты — навсегда.' : '';
        return (
          <div key={p.id} className={`plan-card${p.id === best ? ' best' : ''}${p.days === 0 ? ' forever' : ''}`}>
            {p.id === best && <span className="plan-tag">Выгодно</span>}
            {p.days === 0 && <span className="plan-tag gold">Навсегда</span>}
            <div className="plan-name">{p.days === 0 ? 'Pro навсегда' : `Pro на ${period}`}</div>
            <div className="plan-price">{formatPrice(p.price, p.currency)}{p.days > 0 && <small> / {period}</small>}</div>
            <div className="plan-note">{note}</div>
            {start && <div className="plan-start">{start}</div>}
            <button className="btn primary" disabled={busy} onClick={() => onBuy(p.id)}>{after ? 'Перейти' : 'Оформить'}</button>
          </div>
        );
      })}
    </div>
  );
}
