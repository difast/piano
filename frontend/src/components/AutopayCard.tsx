import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type AutopayInfo, type SavedCard } from '../services/api';
import { formatDate, formatPrice } from '../lib';
import { track } from '../services/analytics';
import { Notice } from './Status';

/** Привязать карту: проверочный платёж 1 ₽ на странице ЮKassa (деньги замораживаются и сразу возвращаются). */
export function AddCardButton({ label, primary = false }: { label: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const add = async () => {
    setBusy(true); setError('');
    track('card_add');
    try { const { url } = await api.addCard(); window.location.href = url; }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <>
      <button className={`btn${primary ? ' primary' : ''}`} onClick={add} disabled={busy} data-testid="add-card">{busy ? 'Открываем ЮKassa…' : label}</button>
      {error && <Notice kind="error">{error}</Notice>}
    </>
  );
}

const CHECK_NOTE = 'Для привязки ЮKassa заморозит на карте 1 ₽ и сразу вернёт его — списания не будет.';

/**
 * Привязанные карты и автопродление Pro: что, когда и сколько спишется; основная карта, «Сделать основной», «Удалить» (по одной),
 * «Привязать другую карту». Удаление стирает у нас данные для списаний с этой карты (ЮKassa сообщать не нужно).
 */
export function AutopayCard({ info, proUntil, canAddCard, onChanged }: { info: AutopayInfo; proUntil: string | null; canAddCard: boolean; onChanged: (msg: string) => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const active = !!proUntil && Date.parse(proUntil) > Date.now();
  const many = info.cards.length > 1;
  const run = async (id: number, fn: () => Promise<unknown>, msg: string) => {
    setBusy(id); setError('');
    try { await fn(); onChanged(msg); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };
  const remove = (c: SavedCard) => {
    const last = info.cards.length === 1;
    const text = last
      ? `Удалить карту ${c.title}?\n\nЭто последняя привязанная карта: данные для автоматической оплаты будут удалены, автопродление отключится, списаний больше не будет.${active ? ` Pro продолжит действовать до ${formatDate(proUntil!)}.` : ''}`
      : `Удалить карту ${c.title}?\n\nСписаний с неё больше не будет.${c.primary ? ' Основной станет следующая карта из списка.' : ''}`;
    if (!window.confirm(text)) return;
    track('card_delete', { last });
    run(c.id, () => api.deleteCard(c.id), last
      ? `Карта удалена. Автопродление отключено, списаний больше не будет${active ? `. Pro действует до ${formatDate(proUntil!)}` : ''}.`
      : `Карта ${c.title} удалена.`);
  };
  return (
    <div className="autopay-card" data-testid="autopay">
      <h4>💳 {many ? 'Привязанные карты' : 'Привязанная карта'}</h4>
      <ul className="card-list">
        {info.cards.map((c) => (
          <li key={c.id} className={c.primary ? 'is-primary' : ''} data-testid="saved-card">
            <span className="card-name"><b>{c.title}</b>{c.primary && many && <span className="badge small">основная</span>}</span>
            <span className="card-actions">
              {!c.primary && <button className="btn small" disabled={busy !== null} onClick={() => { track('card_primary'); run(c.id, () => api.primaryCard(c.id), `Основная карта — ${c.title}.`); }}>Сделать основной</button>}
              <button className="btn small" disabled={busy !== null} onClick={() => remove(c)}>{busy === c.id ? 'Удаляем…' : 'Удалить'}</button>
            </span>
          </li>
        ))}
      </ul>
      <p>
        Автопродление включено: {info.planTitle}{info.amount && <> — <b>{formatPrice(info.amount, info.currency)}</b></>}
        {info.chargeAt && <><br />Следующее списание: <b>{formatDate(info.chargeAt)}</b>{info.card && many && <> с основной карты</>}</>}
      </p>
      <p className="muted small">
        Не позднее чем за 3 дня до списания пришлём напоминание на почту.
        {many ? ' Если списать с основной карты не получится (3 попытки), попробуем другие привязанные карты.' : ''}
        {' '}Удалить карту можно в любой момент — после удаления последней карты списаний не будет, оплаченный срок Pro сохранится.
      </p>
      {canAddCard && <>
        <AddCardButton label="Привязать другую карту" />
        <p className="muted small" style={{ marginTop: 6 }}>{CHECK_NOTE}</p>
      </>}
      {error && <Notice kind="error">{error}</Notice>}
    </div>
  );
}

/** Pro на месяц или год без автопродления: можно привязать карту и включить автопродление. */
export function EnableAutopay({ planTitle }: { planTitle: string | null }) {
  return (
    <div className="autopay-card" data-testid="enable-autopay">
      <h4>💳 Автопродление выключено</h4>
      <p>Привяжите карту — подписка{planTitle ? ` «${planTitle}»` : ''} будет продлеваться автоматически, без перерыва в занятиях. Не позднее чем за 3 дня до списания пришлём напоминание; удалить карту можно в любой момент.</p>
      <AddCardButton label="Привязать карту" />
      <p className="muted small" style={{ marginTop: 6 }}>{CHECK_NOTE} Нажимая кнопку, вы соглашаетесь с условиями автопродления в <Link to="/terms">оферте</Link>.</p>
    </div>
  );
}
