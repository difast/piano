import { Link } from 'react-router-dom';
import { COURSE_STAGES } from '../data/course';
import { CourseSummary } from '../components/CourseMap';
import { SONGS } from '../data/songs';
import { useApp } from '../context/AppContext';
import { courseProgress, daysWord, formatDuration, formatTime, levelFor, plural, shiftDay, weekdayShort } from '../lib';
import { ProLock } from '../components/ProLock';
import { AchievementsBoard } from '../components/Achievements';
import { usePageMeta } from '../hooks/usePageMeta';
import { Empty } from '../components/Status';

const dayLabel = (day: string, today: string) =>
  day === today ? 'Сегодня' : day === shiftDay(today, -1) ? 'Вчера' : `${weekdayShort(day)}, ${day.slice(8)}.${day.slice(5, 7)}`;

export default function ProgressPage() {
  usePageMeta('Прогресс', 'Ваш уровень, кубки, челленджи, пройденные уроки и выученные песни.');
  const { completedLessons, learnedSongs, todaySeconds, isPro, currentLessonId, progress, history } = useApp();
  const course = courseProgress(completedLessons);
  const { done, pct } = course;
  const level = levelFor(done);

  const days = Array.from({ length: 7 }, (_, i) => shiftDay(progress.today, i - 6));
  const week = days.map((d) => ({ day: d, sec: history[d] ?? 0 }));
  const weekTotal = week.reduce((a, b) => a + b.sec, 0);
  const max = Math.max(60, ...week.map((w) => w.sec));
  // подробная статистика (Pro): последние 30 дней
  const last30 = Array.from({ length: 30 }, (_, i) => shiftDay(progress.today, -i)).map((d) => history[d] ?? 0);
  const active30 = last30.filter((x) => x > 0);
  const total30 = active30.reduce((a, b) => a + b, 0);
  const best = Object.entries(history).reduce<[string, number] | null>((m, e) => (e[1] > (m?.[1] ?? 0) ? e : m), null);
  let streak = 0;
  for (let d = (history[progress.today] ?? 0) > 0 ? progress.today : shiftDay(progress.today, -1); (history[d] ?? 0) > 0; d = shiftDay(d, -1)) streak++;
  const earlier = Object.entries(history).filter(([d, s]) => s > 0 && d < days[0]).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);

  return (
    <>
      <h1>Прогресс</h1>
      <div className="stats">
        <div className="card stat"><span className="muted small">Текущий уровень</span><b>{level.name}</b></div>
        <div className="card stat"><span className="muted small">Курс пройден</span><b>{pct}%</b></div>
        <div className="card stat"><span className="muted small">Уроков пройдено</span><b>{done} / {course.total}</b></div>
        <div className="card stat"><span className="muted small">Песен выучено</span><b>{learnedSongs.length} / {SONGS.length}</b></div>
        <div className="card stat"><span className="muted small">Занимался сегодня</span><b>{formatTime(todaySeconds)}</b>
          <span className="muted small">{isPro ? 'Pro — без лимита' : `лимит ${formatTime(progress.limitSeconds)}`}</span></div>
      </div>

      <AchievementsBoard />

      {isPro ? (
        <>
          <section className="card">
            <h3>Подробная статистика <span className="badge pro">Pro</span></h3>
            <div className="stats">
              <div className="stat"><span className="muted small">Серия занятий</span><b>{daysWord(streak)}</b><span className="muted small">подряд</span></div>
              <div className="stat"><span className="muted small">За 30 дней</span><b>{formatDuration(total30)}</b><span className="muted small">{active30.length} {plural(active30.length, 'день', 'дня', 'дней')} с занятиями</span></div>
              <div className="stat"><span className="muted small">В среднем</span><b>{formatDuration(active30.length ? total30 / active30.length : 0)}</b><span className="muted small">в день занятий</span></div>
              <div className="stat"><span className="muted small">Лучший день</span><b>{best ? formatDuration(best[1]) : '—'}</b><span className="muted small">{best ? dayLabel(best[0], progress.today) : 'пока нет'}</span></div>
            </div>
          </section>
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

        </>
      ) : (
        <ProLock title="Подробная статистика — в Pro" place="progress">
          <p>Графики занятий по дням, история, серия занятий подряд, среднее и лучшее время — помогают видеть рост и не бросать. Основной прогресс по курсу и песням доступен всем.</p>
          <div className="stats-teaser" aria-hidden>
            {week.map(({ day }, i) => <span key={day} style={{ height: `${[30, 55, 20, 70, 45, 85, 60][i]}%` }} />)}
          </div>
        </ProLock>
      )}

      <section className="card">
        <h3>Прогресс по курсу</h3>
        <CourseSummary />
        {COURSE_STAGES.map((st) => (
          <div key={st.no} className="pp-stage">
            <h4>Этап {st.no}. {st.name} <span className="muted small">· {st.lessons.filter((l) => completedLessons.includes(l.id)).length} из {st.lessons.length}</span></h4>
            <ul className="check-list">
              {st.lessons.map((l) => (
                <li key={l.id} className={completedLessons.includes(l.id) ? 'done' : ''}>
                  <span>{completedLessons.includes(l.id) ? '✓' : l.id === currentLessonId ? '▶' : '○'}</span>
                  {completedLessons.includes(l.id) || l.id === currentLessonId ? <Link to={`/learn/${l.id}`}>{l.order}. {l.title}</Link> : <span>{l.order}. {l.title}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
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
