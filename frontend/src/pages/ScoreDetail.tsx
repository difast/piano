import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DIFFICULTY_LABEL } from '../data/types';
import { SONGS } from '../data/songs';
import { api, ApiError, type Score } from '../services/api';
import { track } from '../services/analytics';
import { usePageMeta } from '../hooks/usePageMeta';
import { coverFor } from '../hooks/useScores';
import { ErrorBox, Spinner } from '../components/Status';
import { ScoreDownload } from '../components/ScoreDownload';

export default function ScoreDetail() {
  const { id } = useParams();
  const [score, setScore] = useState<Score | null>(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  usePageMeta(score ? `${score.title} — ноты` : 'Ноты', score?.description || 'Ноты для фортепиано.');

  const load = () => {
    setError(''); setNotFound(false); setScore(null);
    api.score(id!).then((r) => { setScore(r.score); track('score_open', { scoreId: id }); })
      .catch((e: Error) => { if (e instanceof ApiError && e.status === 404) setNotFound(true); else setError(e.message); });
  };
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (notFound) return <div className="page-narrow"><h1>Ноты не найдены</h1><Link to="/scores">← К каталогу нот</Link></div>;
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!score) return <Spinner />;
  const song = score.songId ? SONGS.find((s) => s.id === score.songId) : null;

  return (
    <div className="page-narrow">
      <Link to="/scores" className="muted">← Все ноты</Link>
      <div className="song-head">
        <div className="cover" style={{ background: coverFor(score.id) }}><span>♪</span></div>
        <div>
          <h1>{score.title}</h1>
          <p className="muted">{score.composer}</p>
          <div className="row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={`badge lvl-${score.difficulty}`}>{DIFFICULTY_LABEL[score.difficulty]}</span>
            {score.genre && <span className="badge">{score.genre}</span>}
            {score.pages && <span className="badge">{score.pages} стр.</span>}
          </div>
          <p>{score.description}</p>
        </div>
      </div>
      <section className="card">
        <h3>Ноты для фортепиано</h3>
        <ScoreDownload score={score} />
      </section>
      {song && (
        <section className="card">
          <h3>Разучить песню</h3>
          <p className="muted" style={{ marginTop: 0 }}>Потренируйтесь на виртуальном пианино, а потом играйте по нотам на своём инструменте.</p>
          <Link className="btn" to={`/songs/${song.id}`}>Открыть «{song.title}» →</Link>
        </section>
      )}
    </div>
  );
}
