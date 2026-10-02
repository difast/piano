import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { Notice, Spinner } from '../components/Status';

export default function Auth({ mode }: { mode: 'login' | 'register' }) {
  const isReg = mode === 'register';
  usePageMeta(isReg ? 'Регистрация' : 'Вход', 'Создайте аккаунт, чтобы сохранять прогресс обучения игре на пианино на любом устройстве.');
  const { user, status, register, login } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const state = loc.state as { from?: string; notice?: string } | null;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (status === 'loading') return <Spinner />;
  if (user) return <Navigate to={state?.from ?? '/learn'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      if (isReg) await register(email, password, name); else await login(email, password);
      nav(state?.from ?? '/learn', { replace: true });
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <form className="card form auth" onSubmit={submit}>
      <h1>{isReg ? 'Создайте аккаунт' : 'Вход'}</h1>
      <p className="muted">{isReg ? 'Бесплатно. Прогресс сохранится и будет доступен на любом устройстве.' : 'С возвращением! Продолжим с того же места.'}</p>
      {state?.notice && <Notice>{state.notice}</Notice>}
      {isReg && <label>Имя (необязательно)<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>}
      <label>Email<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Пароль<input required type="password" minLength={isReg ? 8 : undefined} autoComplete={isReg ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
        {isReg && <span className="muted small">Не короче 8 символов</span>}</label>
      {error && <Notice kind="error">{error}</Notice>}
      <button className="btn primary" disabled={busy}>{busy ? 'Подождите…' : isReg ? 'Зарегистрироваться' : 'Войти'}</button>
      <p className="small">{isReg ? <>Уже есть аккаунт? <Link to="/login" state={state}>Войти</Link></> : <>Нет аккаунта? <Link to="/register" state={state}>Зарегистрироваться</Link></>}</p>
      {isReg && <p className="muted small">Регистрируясь, вы принимаете <Link to="/terms">пользовательское соглашение</Link> и <Link to="/privacy">политику конфиденциальности</Link>.</p>}
    </form>
  );
}
