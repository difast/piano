import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { LESSONS } from '../data/course';
import { useApp } from '../context/AppContext';
import { isLessonUnlocked } from '../lib';
import { usePracticeTimer } from '../hooks/usePracticeTimer';
import { usePageMeta } from '../hooks/usePageMeta';
import { track } from '../services/analytics';
import { VideoPlayer } from '../components/VideoPlayer';
import { Piano } from '../components/Piano';
import { LimitNotice } from '../components/LimitNotice';
import { Notice } from '../components/Status';

export default function Lesson() {
  const { id } = useParams();
  const idx = LESSONS.findIndex((l) => l.id === id);
  const lesson = LESSONS[idx];
  const { completedLessons, completeLesson, limitReached, currentLessonId } = useApp();
  const unlocked = !!lesson && (completedLessons.includes(lesson.id) || isLessonUnlocked(lesson, completedLessons));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [justDone, setJustDone] = useState(false);
  const redirectNotice = (useLocation().state as { notice?: string } | null)?.notice;
  usePageMeta(lesson ? lesson.title : 'Урок', lesson ? lesson.description : 'Урок курса игры на пианино.');
  usePracticeTimer(unlocked);
  useEffect(() => { if (unlocked) track('lesson_start', { lessonId: lesson.id }); }, [unlocked, lesson?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setJustDone(false); setError(''); }, [id]);

  if (!lesson) return <><h1>Урок не найден</h1><Link to="/learn">← К списку уроков</Link></>;
  if (!unlocked) {
    return <Navigate to={currentLessonId ? `/learn/${currentLessonId}` : '/learn'} replace state={{ notice: 'Этот урок пока закрыт. Сначала пройдите предыдущие — вот ваш текущий урок.' }} />;
  }
  const done = completedLessons.includes(lesson.id);
  const next = LESSONS.find((l) => l.order === lesson.order + 1);

  const finish = async () => {
    setBusy(true); setError('');
    try { await completeLesson(lesson.id); setJustDone(true); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="page-narrow">
      {redirectNotice && <Notice>{redirectNotice}</Notice>}
      <Link to="/learn" className="muted">← Все уроки</Link>
      <p className="muted small" style={{ marginTop: 16 }}>Урок {lesson.order} из {LESSONS.length}</p>
      <h1>{lesson.title}</h1>
      <p className="lead">{lesson.description}</p>

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

      {justDone && <Notice kind="success">🎉 Урок пройден!{next ? ' Следующий урок открыт.' : ' Вы прошли весь курс!'}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="actions">
        {!done && <button className="btn primary" onClick={finish} disabled={busy}>{busy ? 'Сохраняем…' : 'Урок пройден'}</button>}
        {done && <span className="badge ok">✓ Урок пройден</span>}
        {done && next && <Link className="btn primary" to={`/learn/${next.id}`}>Следующий урок →</Link>}
        {done && !next && <Link className="btn primary" to="/songs">Перейти к песням →</Link>}
      </div>
    </div>
  );
}
