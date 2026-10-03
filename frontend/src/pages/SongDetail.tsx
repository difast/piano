import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SONGS } from '../data/songs';
import { DIFFICULTY_LABEL } from '../data/types';
import { useApp } from '../context/AppContext';
import { usePracticeTimer } from '../hooks/usePracticeTimer';
import { usePageMeta } from '../hooks/usePageMeta';
import { track } from '../services/analytics';
import { Cover } from './Songs';
import { VideoPlayer } from '../components/VideoPlayer';
import { Piano } from '../components/Piano';
import { ScoreDownload } from '../components/ScoreDownload';
import { useScores } from '../hooks/useScores';
import { fitRange } from '../services/notes';
import { LimitNotice } from '../components/LimitNotice';
import { Notice } from '../components/Status';
import { ProLock } from '../components/ProLock';
import { FREE_SONG_IDS } from '../data/config';
import { plural } from '../lib';

export default function SongDetail() {
  const { id } = useParams();
  const song = SONGS.find((s) => s.id === id);
  const { learnedSongs, setSongLearned, limitReached, isPro } = useApp();
  const [showHint, setShowHint] = useState(false);
  const { scores } = useScores();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  usePageMeta(song ? `${song.title} — ${song.artist}` : 'Песня', song?.description ?? 'Песня для пианино.');
  const locked = !!song && !isPro && !FREE_SONG_IDS.includes(song.id);
  usePracticeTimer(!!song && !locked);
  useEffect(() => { if (song) track('song_open', { songId: song.id }); }, [song?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setShowHint(false); setError(''); }, [id]);
  if (!song) return <><h1>Песня не найдена</h1><Link to="/songs">← К каталогу</Link></>;
  const learned = learnedSongs.includes(song.id);
  const hasNotes = song.notes.length > 0;
  const range = fitRange(hasNotes ? song.notes : ['C4', 'C5'], 8);
  const songScores = (scores ?? []).filter((x) => x.songId === song.id);

  const toggle = async () => {
    setBusy(true); setError('');
    try { await setSongLearned(song.id, !learned); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="page-narrow">
      <Link to="/songs" className="muted">← Все песни</Link>
      <div className="song-head">
        <Cover cover={song.cover} coverUrl={song.coverUrl} title={song.title} locked={locked} />
        <div>
          <h1>{song.title}</h1>
          <p className="muted">{song.artist}</p>
          <span className={`badge lvl-${song.difficulty}`}>{DIFFICULTY_LABEL[song.difficulty]}</span>
          <p>{song.description}</p>
        </div>
      </div>

      {locked ? (
        <ProLock title="Эта песня доступна в Pro" place="song">
          <p>На тарифе Free открыто {FREE_SONG_IDS.length} {plural(FREE_SONG_IDS.length, 'песня', 'песни', 'песен')}. С Pro — весь каталог песен и нот, скачивание PDF и занятия без ограничения по времени.</p>
        </ProLock>
      ) : limitReached ? <LimitNotice /> : (
        <>
          <VideoPlayer url={song.videoUrl} title={song.title} />
          <section className="card">
            <h3>Как разучить</h3>
            <ol>{song.learningSteps.map((t, i) => <li key={i}>{t}</li>)}</ol>
            {hasNotes && <p><b>Ноты:</b> <span className="notes">{song.notes.map((n) => n.replace(/\d/, '')).join(' – ')}</span></p>}
          </section>
          <section className="card">
            <h3>Попробуйте на пианино</h3>
            {hasNotes && <button className="btn small" onClick={() => setShowHint((v) => !v)}>{showHint ? 'Скрыть подсказку' : 'Подсветить ноты песни'}</button>}
            <Piano from={range.from} to={range.to} labels="both" keyboard hint={showHint ? song.notes : []} />
          </section>
        </>
      )}
      {!locked && <section className="card">
        <h3>Ноты для фортепиано</h3>
        {songScores.length === 0 ? <p className="muted" style={{ margin: 0 }}>Нотный текст для этой песни пока не добавлен. Загляните в раздел «<Link to="/scores">Ноты</Link>».</p> : (
          songScores.map((sc) => (
            <div key={sc.id} className="score-row">
              <div><b>{sc.title}</b><br /><Link to={`/scores/${sc.id}`} className="muted small">Подробнее о нотах</Link></div>
              <ScoreDownload score={sc} />
            </div>
          ))
        )}
      </section>}
      {error && <Notice kind="error">{error}</Notice>}
      {!locked && <div className="actions">
        <button className={`btn ${learned ? '' : 'primary'}`} onClick={toggle} disabled={busy}>
          {learned ? '✓ Песня выучена (отменить)' : 'Отметить как выученную'}
        </button>
      </div>}
    </div>
  );
}
