import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from './AppContext';
import { useBilling } from '../hooks/useBilling';
import { ProPricing } from '../components/ProPricing';
import { api } from '../services/api';
import { track } from '../services/analytics';

export interface Offer { title: string; text?: string; place: string }
const Ctx = createContext<{ offerPro: (o: Offer) => void }>({ offerPro: () => undefined });

/** Окно «Доступно в Pro» с выбором тарифа. Открывается, когда на Free нажимают платную функцию. */
export function UpsellProvider({ children }: { children: ReactNode }) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const offerPro = useCallback((o: Offer) => { setOffer(o); track('pro_upsell_open', { place: o.place }); }, []);
  const value = useMemo(() => ({ offerPro }), [offerPro]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {offer && <UpsellModal offer={offer} onClose={() => setOffer(null)} />}
    </Ctx.Provider>
  );
}

export const useUpsell = () => useContext(Ctx);

function UpsellModal({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const { user } = useApp();
  const billing = useBilling();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const buy = async (planId: string) => {
    track('pay_start', { plan: planId, place: offer.place });
    setBusy(true); setError('');
    try { const { url } = await api.checkout(planId); window.location.href = url; }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };

  const plans = billing?.enabled ? billing.plans.filter((p) => !billing.available || billing.available.includes(p.id)) : [];
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal upsell" role="dialog" aria-modal="true" aria-labelledby="upsell-title" onClick={(e) => e.stopPropagation()}>
        <button ref={closeBtn} className="modal-x" aria-label="Закрыть" onClick={onClose}>×</button>
        <div className="modal-icon" aria-hidden>👑</div>
        <h2 id="upsell-title">{offer.title}</h2>
        <p>{offer.text ?? 'Откройте все возможности с тарифом Pro.'}</p>
        <ul className="plan-list upsell-list">
          <li>Все песни и ноты каталога</li>
          <li>Скачивание PDF-нот</li>
          <li>Занятия без ограничения по времени</li>
          <li>Подробная статистика занятий</li>
        </ul>
        {billing === null ? <p className="muted small">Загрузка тарифов…</p>
          : plans.length ? (
            <div className="upsell-pricing">
              <ProPricing plans={plans} busy={busy} onBuy={user ? buy : undefined}
                cta={{ to: '/register', label: 'Зарегистрироваться и выбрать Pro', primary: true, onClick: () => { track('pro_click', { place: offer.place }); onClose(); } }} />
            </div>
          ) : <Link className="btn primary" to={user ? '/profile#plans' : '/register'} onClick={onClose}>{user ? 'Подробнее о Pro' : 'Зарегистрироваться'}</Link>}
        {error && <p className="notice error" role="alert">{error}</p>}
        <button className="btn link-btn" onClick={onClose}>Не сейчас</button>
      </div>
    </div>
  );
}
