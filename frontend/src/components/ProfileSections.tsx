import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { api, type NotifySettings, type SettingsInfo } from '../services/api';
import { disablePush, enablePush, pushPermission, pushSupported } from '../services/push';
import { track } from '../services/analytics';
import { formatDate, isForever } from '../lib';
import { Modal } from './Modal';
import { Notice } from './Status';

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={`toggle-row${disabled ? ' disabled' : ''}`}>
      <span className="toggle-text"><span>{label}</span>{hint && <span className="muted small">{hint}</span>}</span>
      <input type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

const TIMES = Array.from({ length: 36 }, (_, i) => { const m = 6 * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; });

/** Уведомления: почта, браузер, напоминания и композиция дня. */
export function NotificationsCard() {
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  useEffect(() => { api.settings().then(setInfo).catch((e: Error) => setError(e.message)); }, []);
  if (!info) return <section className="card"><h3>Уведомления</h3>{error ? <Notice kind="error">{error}</Notice> : <p className="muted small">Загрузка…</p>}</section>;
  const s = info.settings;

  const save = async (patch: Partial<NotifySettings>) => {
    const prev = info; setError('');
    setInfo({ ...info, settings: { ...s, ...patch } });
    try { const r = await api.saveSettings(patch); setInfo((i) => i && { ...i, settings: r.settings }); track('settings_change', patch); }
    catch (e) { setInfo(prev); setError((e as Error).message); }
  };
  const setBrowser = async (on: boolean) => {
    setBusy(true); setError('');
    try {
      if (on) { await enablePush(info.pushKey); await save({ browserNotify: true }); toast('Уведомления в браузере включены', 'success'); }
      else { await disablePush(); await save({ browserNotify: false }); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const test = async () => {
    try { const r = await api.pushTest(); toast(r.ok ? 'Отправили пробное уведомление' : 'Не удалось доставить — включите уведомления ещё раз', r.ok ? 'success' : 'warn'); }
    catch (e) { setError((e as Error).message); }
  };
  const noChannel = (s.remind || s.songOfDay) && !s.browserNotify && !s.emailNews;
  const perm = pushPermission();

  return (
    <section className="card">
      <h3>Уведомления</h3>
      <Toggle label="Получать информацию на email" checked={s.emailNews} onChange={(v) => save({ emailNews: v })}
        hint={!info.emailVerified ? 'Письма придут после подтверждения почты' : 'Напоминания, композиция дня и новости сервиса'} />
      <Toggle label="Уведомления в браузере" checked={s.browserNotify} disabled={busy || (!pushSupported() && !s.browserNotify)} onChange={setBrowser}
        hint={!pushSupported() ? 'Этот браузер не поддерживает уведомления. На iPhone добавьте сайт на экран «Домой».'
          : perm === 'denied' ? 'Уведомления запрещены в настройках браузера для этого сайта' : 'Всплывающие уведомления на этом устройстве'} />
      {s.browserNotify && <button className="btn small" onClick={test} style={{ margin: '0 0 8px' }}>Проверить уведомление</button>}
      <Toggle label="Напоминать о занятии" checked={s.remind} onChange={(v) => save({ remind: v })} hint="Только в дни, когда вы ещё не занимались" />
      <label className="toggle-row">
        <span className="toggle-text"><span>Время напоминаний</span><span className="muted small">По московскому времени</span></span>
        <select value={s.remindTime} onChange={(e) => save({ remindTime: e.target.value })} aria-label="Время напоминаний">
          {(TIMES.includes(s.remindTime) ? TIMES : [s.remindTime, ...TIMES]).map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <Toggle label="Композиция дня" checked={s.songOfDay} onChange={(v) => save({ songOfDay: v })}
        hint={<>Каждый день — случайная песня для разучивания. Сегодня: <Link to={`/songs/${info.songOfDay.id}`}>«{info.songOfDay.title}»</Link></>} />
      {noChannel && <Notice>Выберите, куда присылать: включите уведомления в браузере или письма на email.</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
    </section>
  );
}

/** Почта и пароль. */
export function SecurityCard() {
  const { user } = useApp();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  if (!user) return null;
  const resend = async () => {
    setError('');
    try { await api.sendVerification(); setSent(true); toast('Письмо отправлено. Проверьте почту.', 'success'); } catch (e) { setError((e as Error).message); }
  };
  const change = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.changePassword(current, password); setOpen(false); setCurrent(''); setPassword(''); toast('Пароль изменён. На других устройствах нужно войти заново.', 'success'); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="card">
      <h3>Почта и пароль</h3>
      <div className="toggle-row">
        <span className="toggle-text"><span>{user.email}</span>
          <span className={`small ${user.emailVerified ? 'ok-text' : 'warn-text'}`}>{user.emailVerified ? '✓ Почта подтверждена' : 'Почта не подтверждена'}</span></span>
        {!user.emailVerified && <button className="btn small" onClick={resend} disabled={sent}>{sent ? 'Письмо отправлено' : 'Отправить письмо'}</button>}
      </div>
      {!open ? <button className="btn small" onClick={() => setOpen(true)} style={{ marginTop: 10 }}>Сменить пароль</button> : (
        <form className="form inline-form" onSubmit={change}>
          <label>Текущий пароль<input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
          <label>Новый пароль<input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /><span className="muted small">Не короче 8 символов</span></label>
          <div className="actions" style={{ margin: 0 }}>
            <button className="btn primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
            <button type="button" className="btn" onClick={() => { setOpen(false); setError(''); }}>Отмена</button>
          </div>
          <p className="muted small" style={{ margin: 0 }}>Забыли текущий? <Link to="/forgot-password">Сбросить по почте</Link></p>
        </form>
      )}
      {error && <Notice kind="error">{error}</Notice>}
    </section>
  );
}

/** Поддержка, «Рассказать друзьям», купон. */
export function HelpCard() {
  const { user, refresh } = useApp();
  const { toast } = useToast();
  const [modal, setModal] = useState<'support' | 'coupon' | null>(null);
  const [text, setText] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const close = () => { setModal(null); setError(''); setDone(''); };

  const share = async () => {
    const url = window.location.origin;
    const data = { title: 'Пианино с нуля', text: 'Учусь играть на пианино с нуля — попробуй тоже, начать можно бесплатно:', url };
    track('share_click');
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(`${data.text} ${url}`);
      toast('Ссылка скопирована — отправьте её друзьям', 'success');
    } catch (e) { if ((e as Error).name !== 'AbortError') toast(`Скопируйте ссылку: ${url}`, 'info', 9000); }
  };
  const sendSupport = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.support(text.trim()); setDone(`Сообщение отправлено. Ответим на ${user?.email}.`); setText(''); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const redeem = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await api.redeemCoupon(code);
      setDone(isForever(r.proUntil) ? 'Купон активирован: Pro навсегда!' : `Купон активирован: Pro до ${formatDate(r.proUntil)}.`);
      setCode(''); refresh(); track('coupon_redeemed');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <section className="card">
      <h3>Помощь и бонусы</h3>
      <div className="help-buttons">
        <button className="btn" onClick={() => setModal('support')}><span aria-hidden>💬</span> Поддержка</button>
        <button className="btn" onClick={share}><span aria-hidden>🎁</span> Рассказать друзьям</button>
        <button className="btn" onClick={() => setModal('coupon')}><span aria-hidden>🎟️</span> Активировать купон</button>
      </div>
      {modal === 'support' && (
        <Modal title="Написать в поддержку" icon="💬" onClose={close}>
          {done ? <><Notice kind="success">{done}</Notice><button className="btn primary" onClick={close}>Готово</button></> : (
            <form className="form" onSubmit={sendSupport}>
              <p className="muted small" style={{ margin: 0 }}>Опишите вопрос или проблему. Ответим на {user?.email}.</p>
              <textarea required minLength={10} maxLength={4000} rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Например: не приходит письмо, вопрос об оплате, предложение…" aria-label="Сообщение" />
              {error && <Notice kind="error">{error}</Notice>}
              <button className="btn primary" disabled={busy}>{busy ? 'Отправляем…' : 'Отправить'}</button>
            </form>
          )}
        </Modal>
      )}
      {modal === 'coupon' && (
        <Modal title="Активировать купон" icon="🎟️" onClose={close}>
          {done ? <><Notice kind="success">{done}</Notice><button className="btn primary" onClick={close}>Отлично</button></> : (
            <form className="form" onSubmit={redeem}>
              <p className="muted small" style={{ margin: 0 }}>Введите код купона — Pro продлится на указанный в купоне срок.</p>
              <input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Например, PIANO2026" aria-label="Код купона" autoCapitalize="characters" maxLength={40} />
              {error && <Notice kind="error">{error}</Notice>}
              <button className="btn primary" disabled={busy || !code.trim()}>{busy ? 'Проверяем…' : 'Активировать'}</button>
            </form>
          )}
        </Modal>
      )}
    </section>
  );
}

/** Удаление аккаунта с подтверждением паролем. */
export function DeleteAccountCard() {
  const { user, isPro, reload } = useApp();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!user) return null;
  const paid = isPro && !!user.proUntil && Date.parse(user.proUntil) > Date.now();
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.deleteAccount(password); track('account_deleted'); nav('/', { replace: true }); reload(); }
    catch (err) { setError((err as Error).message); setBusy(false); }
  };
  return (
    <section className="card danger-zone">
      <h3>Удаление аккаунта</h3>
      <p className="muted small" style={{ marginTop: 0 }}>Аккаунт, прогресс, история занятий и настройки будут удалены без возможности восстановления.</p>
      <button className="btn danger" onClick={() => setOpen(true)}>Удалить аккаунт</button>
      {open && (
        <Modal title="Удалить аккаунт?" icon="⚠️" onClose={() => { setOpen(false); setError(''); }}>
          <form className="form" onSubmit={submit}>
            <p style={{ margin: 0 }}>Будут удалены прогресс, история занятий, выученные песни и настройки. Восстановить их будет нельзя.</p>
            {paid && <Notice kind="error">У вас действует Pro {isForever(user.proUntil) ? 'навсегда' : `до ${formatDate(user.proUntil!)}`}. После удаления доступ пропадёт, оплата автоматически не возвращается.</Notice>}
            <label>Пароль для подтверждения<input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <label className="check"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /><span>Понимаю, что это действие необратимо</span></label>
            {error && <Notice kind="error">{error}</Notice>}
            <button className="btn danger" disabled={busy || !sure || !password}>{busy ? 'Удаляем…' : 'Удалить навсегда'}</button>
          </form>
        </Modal>
      )}
    </section>
  );
}
