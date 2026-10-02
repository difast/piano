import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SONGS } from '../data/songs';
import { DIFFICULTY_LABEL, type Difficulty } from '../data/types';
import { useApp } from '../context/AppContext';

export function Cover({ cover, coverUrl, title }: { cover: string; coverUrl?: string; title: string }) {
  return (
    <div className="cover" style={{ background: coverUrl ? `center/cover url(${coverUrl})` : cover }}>
      {!coverUrl && <span>{title.slice(0, 1)}</span>}
    </div>
  );
}

export default function Songs() {
  const [filter, setFilter] = useState<Difficulty | 'all'>('all');
  const { learnedSongs } = useApp();
  const list = SONGS.filter((s) => filter === 'all' || s.difficulty === filter);
  const tabs: ('all' | Difficulty)[] = ['all', 'beginner', 'intermediate', 'advanced'];
  return (
    <>
      <h1>Песни</h1>
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t} className={filter === t ? 'active' : ''} onClick={() => setFilter(t)}>
            {t === 'all' ? 'Все' : DIFFICULTY_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="song-grid">
        {list.map((s) => (
          <Link key={s.id} to={`/songs/${s.id}`} className="song-card card">
            <Cover cover={s.cover} coverUrl={s.coverUrl} title={s.title} />
            <b>{s.title}</b>
            <span className="muted small">{s.artist}</span>
            <div className="row">
              <span className={`badge lvl-${s.difficulty}`}>{DIFFICULTY_LABEL[s.difficulty]}</span>
              {learnedSongs.includes(s.id) && <span className="badge">✓ Выучена</span>}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
