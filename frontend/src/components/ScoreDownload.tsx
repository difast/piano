import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api, type Score } from '../services/api';
import { track } from '../services/analytics';
import { Notice } from './Status';

/** Кнопка скачивания PDF. Сервер проверяет вход и Pro сам — здесь только отображение и запрос. */
export function ScoreDownload({ score }: { score: Score }) {
  const { user, isPro } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!score.hasPdf) return <p className="muted">PDF для этого произведения скоро появится.</p>;

  const download = async () => {
    setBusy(true); setError('');
    try {
      const blob = await api.downloadScore(score.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${score.id}.pdf`; a.style.display = 'none'; document.body.appendChild(a); a.click();
      window.setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
      track('score_download', { scoreId: score.id });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  if (!user) {
    return <div className="actions"><Link className="btn primary" to="/login" state={{ from: `/scores/${score.id}`, notice: 'Войдите, чтобы скачать ноты (доступно в Pro).' }}>Войти, чтобы скачать</Link><span className="muted">PDF доступен в Pro</span></div>;
  }
  if (!isPro) {
    return (
      <div className="pro-lock">
        <span className="badge pro">🔒 Доступно в Pro</span>
        <p className="muted small" style={{ margin: '6px 0' }}>Скачивание PDF-нот доступно на тарифе Pro.</p>
        <Link className="btn primary" to="/profile" onClick={() => track('pro_required', { scoreId: score.id })}>Подключить Pro</Link>
      </div>
    );
  }
  return (
    <>
      <button className="btn primary" onClick={download} disabled={busy}>{busy ? 'Готовим файл…' : 'Скачать ноты (PDF)'}</button>
      {error && <Notice kind="error">{error}</Notice>}
    </>
  );
}
