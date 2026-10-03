import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { usePageMeta } from '../hooks/usePageMeta';
import { Notice, Spinner } from '../components/Status';

/** «Забыли пароль?» — письмо со ссылкой для сброса. */
export function ForgotPassword() {
  usePageMeta('Восстановление пароля', 'Получите ссылку для сброса пароля на почту.');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.forgotPassword(email.trim()); setSent(true); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <form className="card form auth" onSubmit={submit}>
      <h1>Восстановление пароля</h1>
      {sent ? <>
        <Notice kind="success">Если аккаунт с адресом <b>{email}</b> существует, мы отправили на него письмо со ссылкой. Она действует 1 час.</Notice>
        <p className="muted small">Не пришло? Проверьте папку «Спам» или попробуйте ещё раз через несколько минут.</p>
        <Link className="btn" to="/login">Вернуться ко входу</Link>
      </> : <>
        <p className="muted">Укажите почту, с которой регистрировались, — пришлём ссылку для нового пароля.</p>
        <label>Email<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {error && <Notice kind="error">{error}</Notice>}
        <button className="btn primary" disabled={busy}>{busy ? 'Отправляем…' : 'Получить ссылку'}</button>
        <p className="small"><Link to="/login">← Вспомнил пароль</Link></p>
      </>}
    </form>
  );
}

/** Новый пароль по ссылке из письма. После сохранения пользователь сразу в аккаунте. */
export function ResetPassword() {
  usePageMeta('Новый пароль', 'Задайте новый пароль для входа.');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { refresh } = useApp();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    if (password !== repeat) { setError('Пароли не совпадают'); return; }
    setBusy(true);
    try { await api.resetPassword(token, password); await refresh(); nav('/learn', { replace: true, state: { notice: 'Пароль изменён' } }); }
    catch (err) { setError((err as Error).message); setBusy(false); }
  };
  if (!token) return <div className="card form auth"><h1>Ссылка неполная</h1><p className="muted">Откройте ссылку из письма целиком или запросите новую.</p><Link className="btn primary" to="/forgot-password">Запросить ссылку</Link></div>;
  return (
    <form className="card form auth" onSubmit={submit}>
      <h1>Новый пароль</h1>
      <p className="muted">Придумайте новый пароль — не короче 8 символов. На других устройствах потребуется войти заново.</p>
      <label>Новый пароль<input required type="password" minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <label>Повторите пароль<input required type="password" minLength={8} autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} /></label>
      {error && <Notice kind="error">{error}{/ссылк/i.test(error) && <> <Link to="/forgot-password">Запросить новую</Link></>}</Notice>}
      <button className="btn primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить и войти'}</button>
    </form>
  );
}

/** Подтверждение почты по ссылке из письма. */
export function VerifyEmail() {
  usePageMeta('Подтверждение почты', 'Подтверждение адреса электронной почты.');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { refresh, user } = useApp();
  const [state, setState] = useState<'wait' | 'ok' | 'error'>('wait');
  const [error, setError] = useState('');
  useEffect(() => {
    let off = false;
    api.verifyEmail(token).then(() => { if (!off) { setState('ok'); refresh(); } })
      .catch((e: Error) => { if (!off) { setState('error'); setError(e.message); } });
    return () => { off = true; };
  }, [token, refresh]);
  return (
    <div className="card form auth">
      <h1>Подтверждение почты</h1>
      {state === 'wait' && <Spinner label="Проверяем ссылку…" />}
      {state === 'ok' && <><Notice kind="success">Почта подтверждена. Спасибо!</Notice><Link className="btn primary" to={user ? '/learn' : '/login'}>{user ? 'К занятиям' : 'Войти'}</Link></>}
      {state === 'error' && <><Notice kind="error">{error}</Notice>
        {user ? <p className="muted small">Новое письмо можно отправить из <Link to="/profile">профиля</Link>.</p> : <Link className="btn" to="/login">Войти</Link>}</>}
    </div>
  );
}
