import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { useBillingState } from '../hooks/useBilling';
import { AutopayCard, EnableAutopay } from '../components/AutopayCard';
import { formatDate, isForever } from '../lib';
import { PlanCards } from '../components/PlanCards';
import { track } from '../services/analytics';
import { usePageMeta } from '../hooks/usePageMeta';
import { Notice } from '../components/Status';
import { DeleteAccountCard, HelpCard, NotificationsCard, SecurityCard } from '../components/ProfileSections';

export default function Profile() {
  usePageMeta('Профиль', 'Ваш аккаунт и тариф.');
  const { user, logout, setDevPro, devTools, isPro, progress } = useApp();
  const nav = useNavigate();
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cardMsg, setCardMsg] = useState('');
  const [billing, reloadBilling] = useBillingState();
  const plansRef = useRef<HTMLDivElement>(null);
  const { hash } = useLocation();
  // переход по ссылке на тарифы (#plans) — прокручиваем к тарифам, когда они загрузились
  useEffect(() => { if (hash === '#plans' && billing) plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [hash, billing]);
  if (!user) return null;
  const activeUntil = user.proUntil && Date.parse(user.proUntil) > Date.now() ? user.proUntil : null;
  const upgrades = billing?.enabled ? billing.plans.filter((p) => billing.available?.includes(p.id)) : [];

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
          {isPro && user.proUntil && Date.parse(user.proUntil) > Date.now() && <span className="muted small"> · {isForever(user.proUntil) ? 'навсегда' : `действует до ${formatDate(user.proUntil)}`}</span>}
          {!isPro && <span className="muted small"> · {Math.floor(progress.limitSeconds / 60)} минут активных занятий в день</span>}</p>
        <button className="btn small" onClick={async () => { await logout(); nav('/'); }}>Выйти</button>
      </div>
      <div className="card" id="plans" ref={plansRef}>
        {billing?.autopay && <AutopayCard info={billing.autopay} proUntil={user.proUntil ?? null} canAddCard={!!billing.canAddCard} onChanged={(m) => { setCardMsg(m); reloadBilling(); }} />}
        {!billing?.autopay && billing?.canAddCard && <EnableAutopay planTitle={billing.plans.find((p) => p.id === billing.currentPlan)?.title ?? null} />}
        {cardMsg && <Notice kind="success">{cardMsg}</Notice>}
        {isPro ? (
          <>
            <h3>👑 Pro активен</h3>
            <p style={{ margin: '0 0 6px' }}>
              {user.proUntil && Date.parse(user.proUntil) > Date.now()
                ? (isForever(user.proUntil) ? <>Бессрочный доступ — <b>навсегда</b>.</> : <>Подписка действует <b>до {formatDate(user.proUntil)}</b>.</>)
                : 'Pro включён.'}
            </p>
            <ul className="plan-list" style={{ margin: '0 0 8px' }}><li>Занятия без ограничения по времени</li><li>Все песни и ноты, скачивание PDF</li><li>Подробная статистика в разделе «Прогресс»</li></ul>
            {billing?.enabled && !!upgrades.length && <>
              <h4 className="upgrade-title">Перейти на больший тариф</h4>
              <p className="muted small" style={{ margin: '0 0 10px' }}>Новый срок начнётся с момента окончания текущей подписки — оплаченные дни не пропадут.</p>
              <PlanCards plans={upgrades} all={billing.plans} busy={busy} onBuy={buy} after={activeUntil && !isForever(activeUntil) ? activeUntil : null} />
              {msg && <Notice kind="error">{msg}</Notice>}
            </>}
          </>
        ) : (
          <>
            <h3>Pro — безлимитные занятия</h3>
            <ul className="plan-list" style={{ margin: '0 0 12px' }}><li>Занятия без ограничения по времени (в Free — 15 минут в день)</li><li>Все песни и ноты каталога (в Free — несколько)</li><li>Скачивание PDF-нот</li><li>Подробная статистика занятий</li></ul>
            {billing === null && <p className="muted small">Загрузка тарифов…</p>}
            {billing && !billing.enabled && <p className="muted">Оплата скоро появится.</p>}
            {billing?.enabled && (
              <>
                <PlanCards plans={billing.plans} busy={busy} onBuy={buy} />
                <p className="muted small" style={{ marginTop: 10 }}>Оплата банковской картой и другими способами на защищённой странице ЮKassa. Чек придёт на {user.email}. Автопродление (для месяца и года) включится, только если при оплате картой отметить «Запомнить данные карты» (или позже привязать карту здесь, в профиле); удалить карту можно в любой момент.</p>
              </>
            )}
            {msg && <Notice kind="error">{msg}</Notice>}
          </>
        )}
      </div>
      <NotificationsCard />
      <SecurityCard />
      <HelpCard />
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
      <DeleteAccountCard />
    </div>
  );
}
