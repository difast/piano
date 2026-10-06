import { useState } from 'react';
import { api, type AutopayInfo } from '../services/api';
import { formatDate, formatPrice } from '../lib';
import { track } from '../services/analytics';
import { Notice } from './Status';

/**
 * Привязанная карта и автопродление Pro: что, когда и сколько спишется, и кнопка «Отвязать карту».
 * Отвязка удаляет у нас данные для повторных списаний и отключает автопродление (ЮKassa об этом сообщать не нужно).
 */
export function AutopayCard({ info, proUntil, onUnlinked }: { info: AutopayInfo; proUntil: string | null; onUnlinked: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = !!proUntil && Date.parse(proUntil) > Date.now();
  const unlink = async () => {
    if (!window.confirm(`Отвязать карту ${info.card ?? ''}?\n\nДанные для автоматической оплаты будут удалены, автопродление отключится, списаний больше не будет.${active ? ` Pro продолжит действовать до ${formatDate(proUntil!)}.` : ''}`)) return;
    setBusy(true); setError('');
    try { await api.cancelAutopay(); track('autopay_cancel'); onUnlinked(); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <div className="autopay-card" data-testid="autopay">
      <h4>💳 Привязанная карта</h4>
      <p className="autopay-cardname"><b>{info.card ?? 'Сохранённый способ оплаты'}</b></p>
      <p>
        Автопродление включено: {info.planTitle}{info.amount && <> — <b>{formatPrice(info.amount, info.currency)}</b></>}
        {info.chargeAt && <><br />Следующее списание: <b>{formatDate(info.chargeAt)}</b></>}
      </p>
      <p className="muted small">За 3 дня до списания пришлём напоминание на почту. Отвязать карту можно в любой момент — после этого списаний не будет, оплаченный срок Pro сохранится.</p>
      <button className="btn" onClick={unlink} disabled={busy}>{busy ? 'Отвязываем…' : 'Отвязать карту'}</button>
      {error && <Notice kind="error">{error}</Notice>}
    </div>
  );
}
