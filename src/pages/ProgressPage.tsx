import { Link } from 'react-router-dom';
import { LESSONS, LEVELS } from '../data/course';
import { SONGS } from '../data/songs';
import { FREE_DAILY_LIMIT_SEC, useApp } from '../context/AppContext';
import { formatTime } from '../lib';

export default function ProgressPage() {
  const { completedLessons, learnedSongs, todaySeconds, isPro, nextLessonId } = useApp();
  const done = completedLessons.length;
  const pct = Math.round((done / LESSONS.length) * 100);
  const level = [...LEVELS].reverse().find((l) => done >= l.from)!;
  return (
    <>
      <h1>Прогресс</h1>
      <div className="stats">
        <div className="card stat"><span className="muted small">Текущий уровень</span><b>{level.name}</b></div>
        <div className="card stat"><span className="muted small">Курс пройден</span><b>{pct}%</b></div>
        <div className="card stat"><span className="muted small">Уроков пройдено</span><b>{done} / {LESSONS.length}</b></div>
        <div className="card stat"><span className="muted small">Песен выучено</span><b>{learnedSongs.length} / {SONGS.length}</b></div>
        <div className="card stat"><span className="muted small">Занимался сегодня</span><b>{formatTime(todaySeconds)}</b>
          <span className="muted small">{isPro ? 'без лимита' : `лимит ${formatTime(FREE_DAILY_LIMIT_SEC)}`}</span></div>
      </div>

      <section className="card">
        <h3>Прогресс по курсу</h3>
        <div className="bar big"><div style={{ width: `${pct}%` }} /></div>
        <ul className="check-list">
          {LESSONS.map((l) => (
            <li key={l.id} className={completedLessons.includes(l.id) ? 'done' : ''}>
              <span>{completedLessons.includes(l.id) ? '✓' : '○'}</span>
              <Link to={`/learn/${l.id}`}>{l.title}</Link>
            </li>
          ))}
        </ul>
        {nextLessonId && <Link className="btn primary" to={`/learn/${nextLessonId}`}>Продолжить обучение</Link>}
      </section>

      <section className="card">
        <h3>Изученные песни</h3>
        {learnedSongs.length === 0 ? <p className="muted">Пока нет. <Link to="/songs">Выбрать песню →</Link></p> : (
          <ul className="check-list">
            {SONGS.filter((s) => learnedSongs.includes(s.id)).map((s) => (
              <li key={s.id} className="done"><span>✓</span><Link to={`/songs/${s.id}`}>{s.title} — {s.artist}</Link></li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
