import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SONGS } from '../data/songs';
import { DIFFICULTY_LABEL, type Difficulty } from '../data/types';
import { useApp } from '../context/AppContext';
import { FREE_SONG_IDS } from '../data/config';
import { normalize, plural } from '../lib';
import { usePageMeta } from '../hooks/usePageMeta';
import { Empty } from '../components/Status';

export function Cover({ cover, coverUrl, title }: { cover: string; coverUrl?: string; title: string }) {
  return (
    <div className="cover" style={{ background: coverUrl ? `center/cover url(${coverUrl})` : cover }}>
      {!coverUrl && <span>{title.slice(0, 1)}</span>}
    </div>
  );
}

export default function Songs() {
  usePageMeta('Песни', 'Каталог популярных песен для пианино трёх уровней сложности: начинающий, средний, продвинутый. Поиск по названию и исполнителю.');
  const [filter, setFilter] = useState<Difficulty | 'all'>('all');
  const [query, setQuery] = useState('');
  const { learnedSongs, isPro } = useApp();
  const list = useMemo(() => {
    const q = normalize(query);
    return SONGS.filter((s) => {
      if (filter !== 'all' && s.difficulty !== filter) return false;
      if (!q) return true;
      return normalize([s.title, s.artist, ...(s.keywords ?? [])].join(' ')).includes(q);
    });
  }, [filter, query]);
  const tabs: ('all' | Difficulty)[] = ['all', 'beginner', 'intermediate', 'advanced'];
  const reset = () => { setQuery(''); setFilter('all'); };
  return (
    <>
      <h1>Песни</h1>
      {!isPro && <p className="muted" style={{ marginTop: -4 }}>На тарифе Free открыто {FREE_SONG_IDS.length} {plural(FREE_SONG_IDS.length, 'песня', 'песни', 'песен')}. Все остальные — с <Link to="/profile#plans">Pro</Link>.</p>}
      <input type="search" className="search" placeholder="Поиск по названию или исполнителю" aria-label="Поиск песен"
        value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t} className={filter === t ? 'active' : ''} onClick={() => setFilter(t)}>
            {t === 'all' ? 'Все' : DIFFICULTY_LABEL[t]}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty title="Ничего не найдено">
          <p className="muted">Попробуйте другое название или исполнителя.</p>
          <button className="btn" onClick={reset}>Сбросить поиск и фильтр</button>
        </Empty>
      ) : (
        <div className="song-grid">
          {list.map((s) => (
            <Link key={s.id} to={`/songs/${s.id}`} className={`song-card card${!isPro && !FREE_SONG_IDS.includes(s.id) ? ' locked' : ''}`}>
              <Cover cover={s.cover} coverUrl={s.coverUrl} title={s.title} />
              <b>{s.title}</b>
              <span className="muted small">{s.artist}</span>
              <div className="row">
                <span className={`badge lvl-${s.difficulty}`}>{DIFFICULTY_LABEL[s.difficulty]}</span>
                {learnedSongs.includes(s.id) && <span className="badge ok">✓ Выучена</span>}
                {!isPro && !FREE_SONG_IDS.includes(s.id) && <span className="badge pro">🔒 Pro</span>}
                {!isPro && FREE_SONG_IDS.includes(s.id) && <span className="badge ok">Бесплатно</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
