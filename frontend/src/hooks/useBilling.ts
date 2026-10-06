import { useCallback, useEffect, useState } from 'react';
import { api, type BillingInfo } from '../services/api';

/** Тарифы и цены приходят с сервера (цены задаются на бэкенде). null — ещё грузится. */
export function useBilling(): BillingInfo | null {
  return useBillingState()[0];
}

/** То же, плюс функция перезагрузки (например, после отключения автопродления). */
export function useBillingState(): [BillingInfo | null, () => void] {
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const load = useCallback(() => { api.billingPlans().then(setInfo).catch(() => setInfo({ enabled: false, plans: [], proUntil: null })); }, []);
  useEffect(load, [load]);
  return [info, load];
}
