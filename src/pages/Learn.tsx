import { Link } from 'react-router-dom';
import { COURSE_TITLE, LESSONS } from '../data/course';
import { useApp } from '../context/AppContext';

export default function Learn() {
  const { completedLessons, nextLessonId } = useApp();
  const pct = Math.round((completedLessons.length / LESSONS.length) * 100);
  return (
    <>
      <h1>Обучение</h1>
      <div className="card course-head">
        <div>
          <h2>{COURSE_TITLE}</h2>
          <p className="muted">{completedLessons.length} из {LESSONS.length} уроков · {pct}%</p>
          <div className="bar big"><div style={{ width: `${pct}%` }} /></div>
        </div>
        {nextLessonId
          ? <Link className="btn primary" to={`/learn/${nextLessonId}`}>Следующий урок →</Link>
          : <span className="badge pro">Курс пройден 🎉</span>}
      </div>
      <ol className="lesson-list">
        {LESSONS.map((l, i) => {
          const done = completedLessons.includes(l.id);
          const next = l.id === nextLessonId;
          return (
            <li key={l.id}>
              <Link to={`/learn/${l.id}`} className={`lesson-row${done ? ' done' : ''}${next ? ' next' : ''}`}>
                <span className="num">{done ? '✓' : i + 1}</span>
                <span className="grow"><b>{l.title}</b><br /><span className="muted small">{l.summary}</span></span>
                {next && <span className="badge">Далее</span>}
                <span className="muted small">{l.durationMin} мин</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </>
  );
}
