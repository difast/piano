import { useEffect, useState } from 'react';
import { api, type BillingInfo } from '../services/api';

/** Тарифы и цены приходят с сервера (цены задаются на бэкенде). null — ещё грузится. */
export function useBilling(): BillingInfo | null {
  const [info, setInfo] = useState<BillingInfo | null>(null);
  useEffect(() => { api.billingPlans().then(setInfo).catch(() => setInfo({ enabled: false, plans: [], proUntil: null })); }, []);
  return info;
}
