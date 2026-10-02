import { Link, useLocation } from 'react-router-dom';
import { COURSE_TITLE, LESSONS } from '../data/course';
import { useApp } from '../context/AppContext';
import { isLessonUnlocked } from '../lib';
import { usePageMeta } from '../hooks/usePageMeta';
import { Notice } from '../components/Status';

export default function Learn() {
  usePageMeta('Обучение', 'Курс «С нуля до уверенной игры на пианино»: последовательные уроки с видео, инструкциями и упражнениями.');
  const { completedLessons, currentLessonId } = useApp();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const pct = Math.round((completedLessons.length / LESSONS.length) * 100);
  return (
    <>
      <h1>Обучение</h1>
      {notice && <Notice kind="info">{notice}</Notice>}
      <div className="card course-head">
        <div>
          <h2>{COURSE_TITLE}</h2>
          <p className="muted">{completedLessons.length} из {LESSONS.length} уроков · {pct}%</p>
          <div className="bar big"><div style={{ width: `${pct}%` }} /></div>
        </div>
        {currentLessonId
          ? <Link className="btn primary" to={`/learn/${currentLessonId}`}>{completedLessons.length ? 'Продолжить' : 'Начать'} →</Link>
          : <span className="badge pro">Курс пройден 🎉</span>}
      </div>
      <ol className="lesson-list">
        {[...LESSONS].sort((a, b) => a.order - b.order).map((l) => {
          const done = completedLessons.includes(l.id);
          const current = l.id === currentLessonId;
          const locked = !done && !isLessonUnlocked(l, completedLessons);
          const inner = (
            <>
              <span className="num">{done ? '✓' : locked ? '🔒' : l.order}</span>
              <span className="grow"><b>{l.title}</b><br /><span className="muted small">{locked ? 'Откроется после прохождения предыдущего урока' : l.description}</span></span>
              {current && <span className="badge">Сейчас</span>}
              {done && <span className="badge ok">Пройден</span>}
              <span className="muted small">{l.durationMin} мин</span>
            </>
          );
          const cls = `lesson-row${done ? ' done' : ''}${current ? ' next' : ''}${locked ? ' locked' : ''}`;
          return (
            <li key={l.id}>
              {locked ? <div className={cls} aria-disabled="true">{inner}</div> : <Link to={`/learn/${l.id}`} className={cls}>{inner}</Link>}
            </li>
          );
        })}
      </ol>
    </>
  );
}
