import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DIFFICULTY_LABEL, type Difficulty } from '../data/types';
import { normalize, plural } from '../lib';
import { usePageMeta } from '../hooks/usePageMeta';
import { coverFor, useScores } from '../hooks/useScores';
import { Empty, ErrorBox, Spinner } from '../components/Status';
import { useApp } from '../context/AppContext';
import { useUpsell } from '../context/UpsellContext';

const ORDER: Record<Difficulty, number> = { beginner: 0, intermediate: 1, advanced: 2 };
type Sort = 'title' | 'easy' | 'hard' | 'composer';

export default function Scores() {
  usePageMeta('Ноты', 'Библиотека нот для фортепиано: поиск по названию и композитору, фильтры по сложности и жанру. Скачивание PDF — на тарифе Pro.');
  const { scores, error, reload } = useScores();
  const { isPro } = useApp();
  const { offerPro } = useUpsell();
  const freeCount = (scores ?? []).filter((s) => s.free).length;
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<Difficulty | 'all'>('all');
  const [genre, setGenre] = useState('all');
  const [sort, setSort] = useState<Sort>('title');

  const genres = useMemo(() => [...new Set((scores ?? []).map((s) => s.genre).filter(Boolean))].sort(), [scores]);
  const list = useMemo(() => {
    const q = normalize(query);
    const l = (scores ?? []).filter((s) =>
      (level === 'all' || s.difficulty === level) && (genre === 'all' || s.genre === genre)
      && (!q || normalize(`${s.title} ${s.composer} ${s.genre}`).includes(q)));
    const freeFirst = (a: { free?: boolean }, b: { free?: boolean }) => (isPro ? 0 : Number(!a.free) - Number(!b.free));
    return l.sort((a, b) => freeFirst(a, b) || (
      sort === 'easy' ? ORDER[a.difficulty] - ORDER[b.difficulty] || a.title.localeCompare(b.title, 'ru')
      : sort === 'hard' ? ORDER[b.difficulty] - ORDER[a.difficulty] || a.title.localeCompare(b.title, 'ru')
      : sort === 'composer' ? a.composer.localeCompare(b.composer, 'ru') || a.title.localeCompare(b.title, 'ru')
      : a.title.localeCompare(b.title, 'ru')));
  }, [scores, query, level, genre, sort, isPro]);

  const reset = () => { setQuery(''); setLevel('all'); setGenre('all'); };

  return (
    <>
      <h1>Ноты</h1>
      <p className="lead" style={{ maxWidth: 680 }}>{isPro ? 'Ноты для фортепиано: все произведения открыты, PDF можно скачать.' : <>Ноты для фортепиано. На Free для просмотра открыто {freeCount || 'несколько'} произведений, остальные и скачивание PDF — с <Link to="/profile#plans">Pro</Link>.</>}</p>
      {error && !scores ? <ErrorBox message={error} onRetry={reload} /> : !scores ? <Spinner /> : (
        <>
          <input type="search" className="search" placeholder="Поиск по названию, композитору или жанру" aria-label="Поиск нот" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="filters">
            <div className="tabs" style={{ margin: 0 }}>
              {(['all', 'beginner', 'intermediate', 'advanced'] as const).map((t) => (
                <button key={t} className={level === t ? 'active' : ''} onClick={() => setLevel(t)}>{t === 'all' ? 'Все' : DIFFICULTY_LABEL[t]}</button>
              ))}
            </div>
            <label className="sel">Жанр
              <select value={genre} onChange={(e) => setGenre(e.target.value)}><option value="all">Все</option>{genres.map((g) => <option key={g}>{g}</option>)}</select>
            </label>
            <label className="sel">Сортировка
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="title">По названию</option><option value="composer">По композитору</option>
                <option value="easy">Сначала простые</option><option value="hard">Сначала сложные</option>
              </select>
            </label>
          </div>
          {list.length === 0 ? (
            <Empty title="Ничего не найдено"><p className="muted">Попробуйте изменить запрос или фильтры.</p><button className="btn" onClick={reset}>Сбросить</button></Empty>
          ) : (
            <div className="song-grid">
              {list.map((s) => (
                <Link key={s.id} to={`/scores/${s.id}`} className={`song-card card${!isPro && !s.free ? ' locked' : ''}`}
                  onClick={(e) => { if (!isPro && !s.free) { e.preventDefault(); offerPro({ title: `«${s.title}» — в Pro`, text: `На Free для просмотра открыто ${freeCount} ${plural(freeCount, 'нотный лист', 'нотных листа', 'нотных листов')}. С Pro — все ноты и скачивание PDF.`, place: 'score_card' }); } }}>
                  <div className={`cover${!isPro && !s.free ? ' locked' : ''}`} style={{ background: coverFor(s.id) }}><span>♪</span>{!isPro && !s.free && <span className="cover-pro" aria-label="Доступно в Pro">🔒 PRO</span>}</div>
                  <b className="song-title">{s.title}</b>
                  <span className="muted small">{s.composer}</span>
                  <p className="muted small clamp3">{s.description}</p>
                  <div className="row">
                    <span className={`badge lvl-${s.difficulty}`}>{DIFFICULTY_LABEL[s.difficulty]}</span>
                    {s.genre && <span className="badge">{s.genre}</span>}
                    {!isPro && s.free && <span className="badge ok">Бесплатно</span>}
                    <span className={`badge ${s.hasPdf ? 'ok' : ''}`}>{s.hasPdf ? '📄 PDF' : 'PDF скоро'}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
