import { Link, useLocation } from 'react-router-dom';
import { COURSE_BLOCKS, COURSE_TITLE, LESSONS } from '../data/course';
import { useApp } from '../context/AppContext';
import { isLessonUnlocked } from '../lib';
import { usePageMeta } from '../hooks/usePageMeta';
import { Notice } from '../components/Status';

export default function Learn() {
  usePageMeta('Обучение', 'Курс «С нуля до уверенной игры на пианино»: 24 интерактивных урока с упражнениями прямо на клавиатуре.');
  const { completedLessons, currentLessonId, progress } = useApp();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const pct = Math.round((completedLessons.length / LESSONS.length) * 100);
  const total = LESSONS.reduce((a, l) => a + l.durationMin, 0);
  return (
    <div className="page-narrow">
      <h1>Обучение</h1>
      {notice && <Notice kind="info">{notice}</Notice>}
      <div className="card course-head">
        <div>
          <h2>{COURSE_TITLE}</h2>
          <p className="muted">{completedLessons.length} из {LESSONS.length} уроков · {pct}% · около {Math.round(total / 60)} часов занятий</p>
          <div className="bar big"><div style={{ width: `${pct}%` }} /></div>
        </div>
        {currentLessonId
          ? <Link className="btn primary" to={`/learn/${currentLessonId}`}>{completedLessons.length || progress.lessonStages[currentLessonId] ? 'Продолжить' : 'Начать'} →</Link>
          : <span className="badge pro">Курс пройден 🎉</span>}
      </div>
      {COURSE_BLOCKS.map((b, bi) => {
        const doneCount = b.lessons.filter((l) => completedLessons.includes(l.id)).length;
        return (
          <section key={b.name}>
            <div className="block-group"><h3>Блок {bi + 1}. {b.name}</h3><span className="muted">{doneCount} из {b.lessons.length}</span></div>
            <ol className="lesson-list">
              {b.lessons.map((l) => {
                const done = completedLessons.includes(l.id);
                const current = l.id === currentLessonId;
                const locked = !done && !isLessonUnlocked(l, completedLessons);
                const stage = progress.lessonStages[l.id];
                const inner = (
                  <>
                    <span className="num">{done ? '✓' : locked ? '🔒' : l.order}</span>
                    <span className="grow"><b>{l.title}</b><br /><span className="muted small">{locked ? 'Откроется после прохождения предыдущего урока' : l.description}</span></span>
                    {current && <span className="badge">{stage ? `Этап ${stage + 1} из ${l.stages.length}` : 'Сейчас'}</span>}
                    {done && <span className="badge ok">Пройден</span>}
                    <span className="muted small">{l.durationMin} мин</span>
                  </>
                );
                const cls = `lesson-row${done ? ' done' : ''}${current ? ' next' : ''}${locked ? ' locked' : ''}`;
                return <li key={l.id}>{locked ? <div className={cls} aria-disabled="true">{inner}</div> : <Link to={`/learn/${l.id}`} className={cls}>{inner}</Link>}</li>;
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
