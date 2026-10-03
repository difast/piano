import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';

const KEY = 'verify_banner_hidden';
const hidden = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };

/** Напоминание подтвердить почту (её нужно подтвердить, чтобы восстановить пароль и получать письма). */
export function VerifyBanner() {
  const { user } = useApp();
  const { pathname } = useLocation();
  const [closed, setClosed] = useState(hidden);
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  if (!user || user.emailVerified !== false || closed || pathname.startsWith('/verify-email')) return null;
  const close = () => { try { sessionStorage.setItem(KEY, '1'); } catch { /* ничего */ } setClosed(true); };
  const resend = async () => {
    setState('busy');
    try { await api.sendVerification(); setState('sent'); } catch (e) { setState('error'); setMsg((e as Error).message); }
  };
  return (
    <div className="verify-banner" role="status">
      <div className="container verify-inner">
        <span>✉️ Подтвердите почту <b>{user.email}</b> — ссылка в письме. Так вы сможете восстановить пароль.</span>
        {state === 'sent' ? <span className="small">Письмо отправлено</span>
          : state === 'error' ? <span className="small">{msg}</span>
          : <button className="btn small" onClick={resend} disabled={state === 'busy'}>Отправить ещё раз</button>}
        <button className="verify-x" aria-label="Скрыть" onClick={close}>×</button>
      </div>
    </div>
  );
}
