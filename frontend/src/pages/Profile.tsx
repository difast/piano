import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { billing, PLANS } from '../services/billing';
import { track } from '../services/analytics';
import { usePageMeta } from '../hooks/usePageMeta';
import { Notice } from '../components/Status';

export default function Profile() {
  usePageMeta('Профиль', 'Ваш аккаунт и тариф.');
  const { user, logout, setDevPro, devTools, isPro, progress } = useApp();
  const nav = useNavigate();
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  if (!user) return null;

  const buy = async (id: (typeof PLANS)[number]['id']) => {
    track('pro_click', { plan: id });
    try { const { url } = await billing.createCheckout(id, user.email); window.location.href = url; }
    catch (e) { setMsg((e as Error).message); }
  };
  const toggleDev = async () => { try { await setDevPro(!isPro); } catch (e) { setError((e as Error).message); } };

  return (
    <div className="page-narrow">
      <h1>Профиль</h1>
      <div className="card">
        <p><b>{user.name || 'Без имени'}</b><br /><span className="muted">{user.email}</span></p>
        <p>Тариф: <span className={`badge ${isPro ? 'pro' : ''}`}>{isPro ? 'Pro' : 'Free'}</span>
          {!isPro && <span className="muted small"> · {Math.floor(progress.limitSeconds / 60)} минут активных занятий в день</span>}</p>
        <button className="btn small" onClick={async () => { await logout(); nav('/'); }}>Выйти</button>
      </div>
      {!isPro && (
        <div className="card">
          <h3>Pro — безлимитные занятия</h3>
          <ul className="plan-list" style={{ margin: '0 0 12px' }}><li>Занятия без ограничения по времени (в Free — 15 минут в день)</li><li>Скачивание PDF-нот в разделе «Ноты»</li></ul>
          <div className="plans">
            {PLANS.map((p) => <button key={p.id} className="btn primary" onClick={() => buy(p.id)}>{p.title}{p.note && <small> ({p.note})</small>}</button>)}
          </div>
          {msg && <Notice>{msg}</Notice>}
        </div>
      )}
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
          <p className="muted small">Тестовый режим (оплаты пока нет)</p>
          <button className="btn small" onClick={toggleDev}>[dev] {isPro ? 'Выключить Pro' : 'Включить Pro'}</button>
          {error && <Notice kind="error">{error}</Notice>}
        </div>
      )}
    </div>
  );
}
