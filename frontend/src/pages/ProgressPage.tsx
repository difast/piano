import { Link } from 'react-router-dom';
import { LESSONS } from '../data/course';
import { SONGS } from '../data/songs';
import { useApp } from '../context/AppContext';
import { formatTime, levelFor, shiftDay, weekdayShort } from '../lib';
import { usePageMeta } from '../hooks/usePageMeta';
import { Empty } from '../components/Status';

const dayLabel = (day: string, today: string) =>
  day === today ? 'Сегодня' : day === shiftDay(today, -1) ? 'Вчера' : `${weekdayShort(day)}, ${day.slice(8)}.${day.slice(5, 7)}`;

export default function ProgressPage() {
  usePageMeta('Прогресс', 'Ваш уровень, пройденные уроки, выученные песни и статистика занятий за неделю.');
  const { completedLessons, learnedSongs, todaySeconds, isPro, currentLessonId, progress, history } = useApp();
  const done = completedLessons.length;
  const pct = Math.round((done / LESSONS.length) * 100);
  const level = levelFor(done);

  const days = Array.from({ length: 7 }, (_, i) => shiftDay(progress.today, i - 6));
  const week = days.map((d) => ({ day: d, sec: history[d] ?? 0 }));
  const weekTotal = week.reduce((a, b) => a + b.sec, 0);
  const max = Math.max(60, ...week.map((w) => w.sec));
  const earlier = Object.entries(history).filter(([d, s]) => s > 0 && d < days[0]).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);

  return (
    <>
      <h1>Прогресс</h1>
      <div className="stats">
        <div className="card stat"><span className="muted small">Текущий уровень</span><b>{level.name}</b></div>
        <div className="card stat"><span className="muted small">Курс пройден</span><b>{pct}%</b></div>
        <div className="card stat"><span className="muted small">Уроков пройдено</span><b>{done} / {LESSONS.length}</b></div>
        <div className="card stat"><span className="muted small">Песен выучено</span><b>{learnedSongs.length} / {SONGS.length}</b></div>
        <div className="card stat"><span className="muted small">Занимался сегодня</span><b>{formatTime(todaySeconds)}</b>
          <span className="muted small">{isPro ? 'Pro — без лимита' : `лимит ${formatTime(progress.limitSeconds)}`}</span></div>
      </div>

      <section className="card">
        <div className="between"><h3>Занятия за 7 дней</h3><span className="muted">Всего: <b>{formatTime(weekTotal)}</b></span></div>
        <ul className="chart" aria-label="График занятий за 7 дней">
          {week.map(({ day, sec }) => (
            <li key={day}>
              <span className="d">{dayLabel(day, progress.today) === 'Сегодня' ? 'Сегодня' : weekdayShort(day)}</span>
              <span className="track">{sec > 0 ? <span className="fill" style={{ width: `${Math.max(3, (sec / max) * 100)}%` }} /> : null}</span>
              <span className="v">{sec > 0 ? formatTime(sec) : '—'}</span>
            </li>
          ))}
        </ul>
        {weekTotal === 0 && <p className="muted small">Пока нет занятий за эту неделю. Начните урок — и здесь появится график.</p>}
      </section>

      <section className="card">
        <h3>История занятий</h3>
        <ul className="history">
          {[...week].reverse().filter((w) => w.sec > 0).map((w) => <li key={w.day}><span>{dayLabel(w.day, progress.today)}</span><b>{formatTime(w.sec)}</b></li>)}
          {earlier.map(([d, s]) => <li key={d}><span>{dayLabel(d, progress.today)}</span><b>{formatTime(s)}</b></li>)}
        </ul>
        {weekTotal === 0 && earlier.length === 0 && <Empty title="История пока пуста" />}
      </section>

      <section className="card">
        <h3>Прогресс по курсу</h3>
        <div className="bar big"><div style={{ width: `${pct}%` }} /></div>
        <ul className="check-list">
          {LESSONS.map((l) => (
            <li key={l.id} className={completedLessons.includes(l.id) ? 'done' : ''}>
              <span>{completedLessons.includes(l.id) ? '✓' : l.id === currentLessonId ? '▶' : '○'}</span>
              {completedLessons.includes(l.id) || l.id === currentLessonId ? <Link to={`/learn/${l.id}`}>{l.title}</Link> : <span>{l.title}</span>}
            </li>
          ))}
        </ul>
        {currentLessonId && <Link className="btn primary" to={`/learn/${currentLessonId}`}>Продолжить обучение</Link>}
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
