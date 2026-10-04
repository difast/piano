import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SONGS } from '../data/songs';
import { DIFFICULTY_LABEL, type Difficulty } from '../data/types';
import { useApp } from '../context/AppContext';
import { useUpsell } from '../context/UpsellContext';
import { FREE_SONG_IDS } from '../data/config';
import { normalize, plural } from '../lib';
import { usePageMeta } from '../hooks/usePageMeta';
import { Empty } from '../components/Status';

/** Обложка: сгенерированная картинка из public/covers (scripts/make-covers.ts), при её отсутствии — градиент с буквой. */
export function Cover({ cover, coverUrl, title, locked, src }: { cover: string; coverUrl?: string; title: string; locked?: boolean; src?: string }) {
  const [broken, setBroken] = useState(false);
  const url = coverUrl ?? src;
  return (
    <div className={`cover${locked ? ' locked' : ''}`} style={{ background: cover }}>
      {url && !broken
        ? <img src={url} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
        : <span>{title.slice(0, 1)}</span>}
      {locked && <span className="cover-pro" aria-label="Доступно в Pro">🔒 PRO</span>}
    </div>
  );
}

/** Путь к обложке песни. */
export const songCover = (id: string) => `/covers/songs/${id}.svg`;

export default function Songs() {
  usePageMeta('Песни', 'Каталог популярных песен для пианино трёх уровней сложности: начинающий, средний, продвинутый. Поиск по названию и исполнителю.');
  const [filter, setFilter] = useState<Difficulty | 'all'>('all');
  const [query, setQuery] = useState('');
  const { learnedSongs, isPro } = useApp();
  const { offerPro } = useUpsell();
  const isLocked = (id: string) => !isPro && !FREE_SONG_IDS.includes(id);
  const list = useMemo(() => {
    const q = normalize(query);
    return SONGS.filter((s) => {
      if (filter !== 'all' && s.difficulty !== filter) return false;
      if (!q) return true;
      return normalize([s.title, s.artist, ...(s.keywords ?? [])].join(' ')).includes(q);
    })
      // на Free сначала открытые песни, потом закрытые (порядок внутри групп сохраняется)
      .sort((a, b) => (isPro ? 0 : Number(!FREE_SONG_IDS.includes(a.id)) - Number(!FREE_SONG_IDS.includes(b.id))));
  }, [filter, query, isPro]);
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
            <Link key={s.id} to={`/songs/${s.id}`} className={`song-card card${isLocked(s.id) ? ' locked' : ''}`}
              onClick={(e) => { if (isLocked(s.id)) { e.preventDefault(); offerPro({ title: `«${s.title}» — в Pro`, text: `На Free открыто ${FREE_SONG_IDS.length} ${plural(FREE_SONG_IDS.length, 'песня', 'песни', 'песен')}. С Pro доступен весь каталог.`, place: 'song_card' }); } }}>
              <Cover cover={s.cover} coverUrl={s.coverUrl} src={songCover(s.id)} title={s.title} locked={isLocked(s.id)} />
              <b>{s.title}</b>
              <span className="muted small">{s.artist}</span>
              <div className="row">
                <span className={`badge lvl-${s.difficulty}`}>{DIFFICULTY_LABEL[s.difficulty]}</span>
                {learnedSongs.includes(s.id) && <span className="badge ok">✓ Выучена</span>}
                {!isPro && FREE_SONG_IDS.includes(s.id) && <span className="badge ok">Бесплатно</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
