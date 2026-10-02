import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { billing, PLANS } from '../services/billing';

export default function Profile() {
  const { profile, register, logout, setPro, isPro } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');

  const buy = async (id: (typeof PLANS)[number]['id']) => {
    try { const { url } = await billing.createCheckout(id, profile!.email); window.location.href = url; }
    catch (e) { setMsg((e as Error).message); }
  };

  if (!profile) {
    return (
      <>
        <h1>Профиль</h1>
        <form className="card form" onSubmit={(e) => { e.preventDefault(); register(name.trim(), email.trim()); }}>
          <h3>Создайте профиль, чтобы сохранять прогресс</h3>
          <label>Имя<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Как вас зовут?" /></label>
          <label>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
          <button className="btn primary">Начать бесплатно</button>
          <p className="muted small">Пока данные хранятся только в вашем браузере.</p>
        </form>
      </>
    );
  }
  return (
    <>
      <h1>Профиль</h1>
      <div className="card">
        <p><b>{profile.name}</b><br /><span className="muted">{profile.email}</span></p>
        <p>Тариф: <span className={`badge ${isPro ? 'pro' : ''}`}>{isPro ? 'Pro' : 'Free'}</span></p>
        <button className="btn small" onClick={logout}>Выйти</button>
      </div>
      {!isPro && (
        <div className="card">
          <h3>Pro — безлимитные занятия</h3>
          <p>В Free доступно 15 минут занятий в день. Pro снимает ограничение.</p>
          <div className="plans">
            {PLANS.map((p) => (
              <button key={p.id} className="btn primary" onClick={() => buy(p.id)}>{p.title} {p.note && <small>({p.note})</small>}</button>
            ))}
          </div>
          {msg && <p className="muted small" role="status">{msg}</p>}
          {import.meta.env.DEV && <button className="btn small" onClick={() => setPro(true)}>[dev] Включить Pro</button>}
        </div>
      )}
      {isPro && import.meta.env.DEV && <button className="btn small" onClick={() => setPro(false)}>[dev] Выключить Pro</button>}
    </>
  );
}
