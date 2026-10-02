import { Link, useParams } from 'react-router-dom';
import { LESSONS } from '../data/course';
import { useApp } from '../context/AppContext';
import { usePracticeTimer } from '../hooks/usePracticeTimer';
import { VideoPlayer } from '../components/VideoPlayer';
import { Piano } from '../components/Piano';
import { LimitNotice } from '../components/LimitNotice';

export default function Lesson() {
  const { id } = useParams();
  const idx = LESSONS.findIndex((l) => l.id === id);
  const lesson = LESSONS[idx];
  const { completedLessons, toggleLesson, limitReached } = useApp();
  usePracticeTimer(!!lesson);

  if (!lesson) return <><h1>Урок не найден</h1><Link to="/learn">← К списку уроков</Link></>;
  const done = completedLessons.includes(lesson.id);
  const next = LESSONS[idx + 1];

  return (
    <>
      <Link to="/learn" className="muted">← Все уроки</Link>
      <p className="muted small" style={{ marginTop: 16 }}>Урок {idx + 1} из {LESSONS.length}</p>
      <h1>{lesson.title}</h1>
      <p className="lead">{lesson.summary}</p>

      {limitReached ? <LimitNotice /> : (
        <>
          <VideoPlayer url={lesson.videoUrl} title={lesson.title} />
          <section className="card">
            <h3>Инструкция</h3>
            <ol>{lesson.instructions.map((t, i) => <li key={i}>{t}</li>)}</ol>
          </section>
          <section className="card">
            <h3>Упражнение: {lesson.exercise.title}</h3>
            <p>{lesson.exercise.description}</p>
            <Piano hint={lesson.exercise.notes} octaves={3} showKeyboardLabels={false} />
            <p className="muted small">Подсвеченные клавиши — подсказка.</p>
          </section>
        </>
      )}

      <div className="actions">
        <button className={`btn ${done ? '' : 'primary'}`} onClick={() => toggleLesson(lesson.id, !done)}>
          {done ? '✓ Урок пройден (отменить)' : 'Урок пройден'}
        </button>
        {done && next && <Link className="btn primary" to={`/learn/${next.id}`}>Следующий урок →</Link>}
      </div>
    </>
  );
}
