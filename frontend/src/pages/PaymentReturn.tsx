import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api, type OrderStatus } from '../services/api';
import { track } from '../services/analytics';
import { formatDate, isForever } from '../lib';
import { usePageMeta } from '../hooks/usePageMeta';
import { Spinner } from '../components/Status';

type View = 'wait' | 'ok' | 'canceled' | 'late' | 'error';

/** Сюда ЮKassa возвращает покупателя. Статус берём с сервера (его обновляют уведомления ЮKassa и сверка по API). */
export default function PaymentReturn() {
  usePageMeta('Оплата', 'Статус оплаты подписки Pro.');
  const [params] = useSearchParams();
  const order = params.get('order') ?? '';
  const resumeKey = params.get('r') ?? '';
  const { refresh, user, status } = useApp();
  const loc = useLocation();
  const [view, setView] = useState<View>('wait');
  // 'checking' — проверяем вход; 'need-login' — вход не восстановить, просим войти
  const [auth, setAuth] = useState<'checking' | 'ok' | 'need-login'>('checking');

  // Покупатель мог вернуться в другой браузер (банковское приложение, сайт с экрана «Домой»):
  // одноразовый ключ из ссылки возврата восстанавливает вход.
  useEffect(() => {
    if (status !== 'ready') return;
    if (user) { setAuth('ok'); return; }
    if (!resumeKey || !order) { setAuth('need-login'); return; }
    let off = false;
    api.resumePayment(order, resumeKey)
      .then(async () => { await refresh(); if (!off) { track('pay_resume'); setAuth('ok'); } })
      .catch(() => { if (!off) setAuth('need-login'); });
    return () => { off = true; };
  }, [status, user, order, resumeKey, refresh]);
  const [info, setInfo] = useState<OrderStatus | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (auth !== 'ok') return;
    if (!order) { setView('error'); setErr('Не указан номер заказа.'); return; }
    let stop = false;
    let tries = 0;
    const step = async () => {
      if (stop) return;
      try {
        const o = await api.order(order);
        if (stop) return;
        setInfo(o);
        if (o.status === 'succeeded' || o.status === 'card_saved') { setView('ok'); if (o.kind !== 'card') track('pay_success'); refresh(); return; }
        if (o.status === 'canceled') { setView('canceled'); track('pay_canceled'); return; }
        if (o.status === 'refunded') { setView('error'); setErr('Платёж был возвращён.'); return; }
      } catch (e) { if (!stop) { setView('error'); setErr((e as Error).message); } return; }
      if (++tries >= 20) { setView('late'); return; }   // ~1 минута
      setTimeout(step, 3000);
    };
    step();
    return () => { stop = true; };
  }, [order, refresh, auth]);

  const card = info?.kind === 'card';
  const title = card ? 'Привязка карты' : 'Оплата Pro';
  if (auth === 'need-login') {
    return (
      <div className="page-narrow">
        <h1>{title}</h1>
        <div className="card">
          <p><b>Войдите в аккаунт, чтобы увидеть статус оплаты</b></p>
          <p className="muted">Если оплата прошла, Pro уже подключён к вашему аккаунту — он появится сразу после входа.</p>
          <Link className="btn primary" to="/login" state={{ from: `${loc.pathname}?order=${order}` }}>Войти</Link>
        </div>
      </div>
    );
  }
  if (auth === 'checking') return <div className="page-narrow"><h1>{title}</h1><div className="card"><Spinner label="Проверяем оплату…" /></div></div>;
  return (
    <div className="page-narrow">
      <h1>{title}</h1>
      <div className="card">
        {view === 'wait' && <Spinner label="Проверяем оплату…" />}
        {view === 'ok' && card && <>
          <p><b>✅ Карта привязана</b></p>
          <p>Она будет использоваться для автопродления Pro. Проверочный 1 ₽ отменён — деньги вернутся на карту (обычно сразу, иногда банк возвращает их в течение нескольких дней).</p>
          <p className="muted small">Основную карту можно выбрать в профиле.</p>
          <Link className="btn primary" to="/profile#plans">В профиль</Link>
        </>}
        {view === 'ok' && !card && <>
          <p><b>✅ Оплата прошла. Pro подключён!</b></p>
          {info?.proUntil && <p>{isForever(info.proUntil) ? 'Pro подключён навсегда.' : `Pro действует до ${formatDate(info.proUntil)}.`}</p>}
          <p className="muted small">Чек придёт на вашу почту от ЮKassa.</p>
          <Link className="btn primary" to="/learn">Продолжить занятия</Link>
        </>}
        {view === 'canceled' && <>
          <p><b>{card ? 'Карта не привязана' : 'Оплата не прошла'}</b></p>
          <p className="muted">{card ? 'Деньги не списаны. Можно попробовать ещё раз в профиле или привязать другую карту.' : 'Деньги не списаны. Можно попробовать ещё раз или выбрать другой способ оплаты.'}</p>
          <Link className="btn primary" to="/profile">Вернуться к тарифам</Link>
        </>}
        {view === 'late' && <>
          <p><b>Платёж ещё обрабатывается</b></p>
          <p className="muted">{card ? 'Обычно это занимает меньше минуты. Карта появится в профиле, как только банк подтвердит привязку.' : 'Обычно это занимает меньше минуты. Pro подключится автоматически, как только банк подтвердит оплату — обновите страницу профиля чуть позже.'}</p>
          <Link className="btn" to="/profile">В профиль</Link>
        </>}
        {view === 'error' && <>
          <p><b>⚠️ {err || 'Не удалось проверить оплату'}</b></p>
          <Link className="btn" to="/profile">В профиль</Link>
        </>}
      </div>
    </div>
  );
}
