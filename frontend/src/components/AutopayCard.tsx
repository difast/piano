import { useState } from 'react';
import { api, type AutopayInfo } from '../services/api';
import { formatDate, formatPrice } from '../lib';
import { track } from '../services/analytics';
import { Notice } from './Status';

/** Автопродление Pro в профиле: что, когда и сколько спишется, и кнопка отключения. */
export function AutopayCard({ info, proUntil, onChange }: { info: AutopayInfo; proUntil: string | null; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancel = async () => {
    if (!window.confirm(`Отключить автопродление? Списаний больше не будет. Pro продолжит действовать${proUntil ? ` до ${formatDate(proUntil)}` : ''}.`)) return;
    setBusy(true); setError('');
    try { await api.cancelAutopay(); track('autopay_cancel'); onChange(); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <div className="autopay-card" data-testid="autopay">
      <h4>🔁 Автопродление включено</h4>
      <p>
        {info.planTitle}{info.amount && <> — <b>{formatPrice(info.amount, info.currency)}</b></>}
        {info.chargeAt && <><br />Следующее списание: <b>{formatDate(info.chargeAt)}</b></>}
        {info.card && <><br />Способ оплаты: {info.card}</>}
      </p>
      <p className="muted small">За 3 дня до списания пришлём напоминание на почту. После отключения Pro действует до конца оплаченного срока.</p>
      <button className="btn" onClick={cancel} disabled={busy}>{busy ? 'Отключаем…' : 'Отключить автопродление'}</button>
      {error && <Notice kind="error">{error}</Notice>}
    </div>
  );
}
