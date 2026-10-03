import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { useBilling } from '../hooks/useBilling';
import { formatDate, formatPrice } from '../lib';
import { track } from '../services/analytics';
import { usePageMeta } from '../hooks/usePageMeta';
import { Notice } from '../components/Status';

export default function Profile() {
  usePageMeta('Профиль', 'Ваш аккаунт и тариф.');
  const { user, logout, setDevPro, devTools, isPro, progress } = useApp();
  const nav = useNavigate();
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const billing = useBilling();
  const plansRef = useRef<HTMLDivElement>(null);
  const { hash } = useLocation();
  // переход по ссылке «Продлить Pro» (#plans) — прокручиваем к тарифам, когда они загрузились
  useEffect(() => { if (hash === '#plans' && billing) plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [hash, billing]);
  if (!user) return null;

  const buy = async (id: string) => {
    track('pay_start', { plan: id });
    setBusy(true); setMsg('');
    try { const { url } = await api.checkout(id); window.location.href = url; }
    catch (e) { setMsg((e as Error).message); setBusy(false); }
  };
  const toggleDev = async () => { try { await setDevPro(!isPro); } catch (e) { setError((e as Error).message); } };

  return (
    <div className="page-narrow">
      <h1>Профиль</h1>
      <div className="card">
        <p><b>{user.name || 'Без имени'}</b><br /><span className="muted">{user.email}</span></p>
        <p>Тариф: <span className={`badge ${isPro ? 'pro' : ''}`}>{isPro ? 'Pro' : 'Free'}</span>
          {isPro && user.proUntil && <span className="muted small"> · действует до {formatDate(user.proUntil)}</span>}
          {!isPro && <span className="muted small"> · {Math.floor(progress.limitSeconds / 60)} минут активных занятий в день</span>}</p>
        <button className="btn small" onClick={async () => { await logout(); nav('/'); }}>Выйти</button>
      </div>
      <div className="card" id="plans" ref={plansRef}>
        <h3>{isPro ? 'Продлить Pro' : 'Pro — безлимитные занятия'}</h3>
        {isPro && user.proUntil && <p className="muted small" style={{ marginTop: -6 }}>Новый срок добавится к текущему: подписка продлится после {formatDate(user.proUntil)}.</p>}
        {!isPro && <ul className="plan-list" style={{ margin: '0 0 12px' }}><li>Занятия без ограничения по времени (в Free — 15 минут в день)</li><li>Скачивание PDF-нот в разделе «Ноты»</li></ul>}
        {billing === null && <p className="muted small">Загрузка тарифов…</p>}
        {billing && !billing.enabled && <p className="muted">Оплата скоро появится.</p>}
        {billing?.enabled && (
          <>
            <div className="plans">
              {billing.plans.map((p) => (
                <button key={p.id} className="btn primary" disabled={busy} onClick={() => buy(p.id)}>
                  {p.title} — {formatPrice(p.price, p.currency)}
                </button>
              ))}
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>Оплата банковской картой и другими способами на защищённой странице ЮKassa. Подписка не продлевается автоматически. Чек придёт на {user.email}.</p>
          </>
        )}
        {msg && <Notice kind="error">{msg}</Notice>}
      </div>
      <div className="card install-tip">
        <h3>Установите как приложение</h3>
        <p className="muted" style={{ margin: '0 0 8px' }}>Значок на экране телефона — и сайт открывается как приложение, без адресной строки.</p>
        <ul className="plan-list" style={{ margin: 0 }}>
          <li><b>iPhone (Safari):</b> кнопка «Поделиться» → «На экран “Домой”».</li>
          <li><b>Android (Chrome):</b> меню ⋮ → «Установить приложение» или «Добавить на главный экран».</li>
        </ul>
      </div>
      {devTools && (
        <div className="card">
          <p className="muted small">Тестовый режим</p>
          <button className="btn small" onClick={toggleDev}>[dev] {isPro ? 'Выключить Pro' : 'Включить Pro'}</button>
          {error && <Notice kind="error">{error}</Notice>}
        </div>
      )}
    </div>
  );
}
