import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SONGS } from '../data/songs';
import { DIFFICULTY_LABEL } from '../data/types';
import { useApp } from '../context/AppContext';
import { usePracticeTimer } from '../hooks/usePracticeTimer';
import { Cover } from './Songs';
import { VideoPlayer } from '../components/VideoPlayer';
import { Piano } from '../components/Piano';
import { LimitNotice } from '../components/LimitNotice';

export default function SongDetail() {
  const { id } = useParams();
  const song = SONGS.find((s) => s.id === id);
  const { learnedSongs, toggleSong, limitReached } = useApp();
  const [showHint, setShowHint] = useState(false);
  usePracticeTimer(!!song);
  if (!song) return <><h1>Песня не найдена</h1><Link to="/songs">← К каталогу</Link></>;
  const learned = learnedSongs.includes(song.id);

  return (
    <>
      <Link to="/songs" className="muted">← Все песни</Link>
      <div className="song-head">
        <Cover cover={song.cover} coverUrl={song.coverUrl} title={song.title} />
        <div>
          <h1>{song.title}</h1>
          <p className="muted">{song.artist}</p>
          <span className={`badge lvl-${song.difficulty}`}>{DIFFICULTY_LABEL[song.difficulty]}</span>
          <p>{song.description}</p>
        </div>
      </div>

      {limitReached ? <LimitNotice /> : (
        <>
          <VideoPlayer url={song.videoUrl} title={song.title} />
          <section className="card">
            <h3>Как разучить</h3>
            <ol>{song.steps.map((t, i) => <li key={i}>{t}</li>)}</ol>
            <p><b>Ноты:</b> <span className="notes">{song.notes.map((n) => n.replace(/\d/, '')).join(' – ')}</span></p>
          </section>
          <section className="card">
            <h3>Попробуйте на пианино</h3>
            <button className="btn small" onClick={() => setShowHint((v) => !v)}>{showHint ? 'Скрыть подсказку' : 'Подсветить ноты песни'}</button>
            <Piano octaves={3} hint={showHint ? song.notes : []} showKeyboardLabels={false} />
          </section>
        </>
      )}
      <div className="actions">
        <button className={`btn ${learned ? '' : 'primary'}`} onClick={() => toggleSong(song.id)}>
          {learned ? '✓ Песня выучена (отменить)' : 'Отметить как выученную'}
        </button>
      </div>
    </>
  );
}
