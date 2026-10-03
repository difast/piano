import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { track } from '../services/analytics';
import { daysLeft, daysWord, formatDate } from '../lib';

const KEY = 'pro_notice_closed';
const read = () => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } };
const write = (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* недоступно */ } };

/**
 * Всплывающее уведомление о конце подписки: за 7, 3 и 1 день, в последний день и после окончания (14 дней).
 * Закрытое уведомление не возвращается до следующего порога (или до следующего дня в последние сутки).
 */
export function ProExpiryNotice() {
  const { user, isPro, status } = useApp();
  const { pathname } = useLocation();
  const [closed, setClosed] = useState(read);
  const [shown, setShown] = useState(false);

  const until = user?.proUntil ?? null;
  let stage: string | null = null;
  let kind: 'soon' | 'last' | 'ended' = 'soon';
  if (user && until) {
    const left = daysLeft(until);
    const ended = Date.parse(until) <= Date.now();
    if (ended && !isPro && Date.now() - Date.parse(until) < 14 * 86_400_000) { stage = `ended`; kind = 'ended'; }
    else if (!ended && left <= 1) { stage = `d${left}:${new Date().toDateString()}`; kind = 'last'; }
    else if (!ended && left <= 3) stage = 'd3';
    else if (!ended && left <= 7) stage = 'd7';
  }
  const id = stage && until ? `${until}|${stage}` : null;
  const visible = status === 'ready' && !!id && closed !== id && !pathname.startsWith('/payment');

  // небольшая задержка, чтобы уведомление «всплывало», а не появлялось вместе со страницей
  useEffect(() => {
    if (!visible) { setShown(false); return; }
    const t = window.setTimeout(() => { setShown(true); track('pro_expiry_notice', { stage: kind }); }, 900);
    return () => window.clearTimeout(t);
  }, [visible, kind]);

  if (!visible || !shown || !until) return null;
  const close = () => { write(id!); setClosed(id!); };
  const left = daysLeft(until);
  const title = kind === 'ended' ? 'Подписка Pro закончилась'
    : kind === 'last' ? (left === 0 ? 'Pro заканчивается сегодня' : 'Pro заканчивается завтра')
    : `Pro закончится через ${daysWord(left)}`;
  const text = kind === 'ended'
    ? `Срок истёк ${formatDate(until)}. Снова действует лимит 15 минут в день, скачивание нот недоступно. Прогресс сохранён.`
    : `Подписка действует до ${formatDate(until)}. Продлите заранее — новый срок добавится к оставшемуся, ничего не потеряется.`;

  return (
    <div className={`pro-notice ${kind}`} role="status" aria-live="polite">
      <span className="pro-notice-ico" aria-hidden>{kind === 'ended' ? '⏳' : '👑'}</span>
      <div className="pro-notice-body">
        <b>{title}</b>
        <p>{text}</p>
        <div className="pro-notice-actions">
          <Link className="btn primary small" to="/profile#plans" onClick={() => { track('pro_click', { place: `expiry_${kind}` }); close(); }}>{kind === 'ended' ? 'Вернуть Pro' : 'Продлить Pro'}</Link>
          <button className="btn small" onClick={close}>Позже</button>
        </div>
      </div>
      <button className="pro-notice-x" aria-label="Закрыть" onClick={close}>×</button>
    </div>
  );
}
