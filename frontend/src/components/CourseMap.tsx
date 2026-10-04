import { Link } from 'react-router-dom';
import { COURSE_STAGES, type CourseStage } from '../data/course';
import { LESSON_LEVEL_LABEL, type Lesson } from '../data/types';
import { useApp } from '../context/AppContext';
import { LESSON_STATUS_LABEL, courseProgress, lessonStatus, plural } from '../lib';

const lessonsWord = (n: number) => `${n} ${plural(n, 'урок', 'урока', 'уроков')}`;

/** Сводка: сколько пройдено, сколько осталось, текущий и следующий урок. */
export function CourseSummary({ compact = false }: { compact?: boolean }) {
  const { completedLessons, progress } = useApp();
  const p = courseProgress(completedLessons);
  const savedStage = p.current ? progress.lessonStages[p.current.id] : undefined;
  return (
    <div className="course-summary" data-testid="course-summary">
      <div className="cs-top">
        <div className="cs-count"><b data-testid="course-count">{p.done} / {p.total}</b><span className="muted small">уроков пройдено</span></div>
        <div className="cs-pct"><b data-testid="course-pct">{p.pct}%</b><span className="muted small">курса</span></div>
        <div className="cs-left"><b>{p.left}</b><span className="muted small">{plural(p.left, 'урок остался', 'урока осталось', 'уроков осталось')}</span></div>
      </div>
      <div className="bar big" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done} aria-label="Прогресс по курсу"><div style={{ width: `${p.pct}%` }} /></div>
      {p.finished ? (
        <div className="cs-now done" data-testid="course-finished">
          <span className="cs-emoji">🏆</span>
          <div className="grow"><b>Курс пройден!</b><p className="muted small" style={{ margin: 0 }}>Все {p.total} уроков завершены. Повторяй любимые уроки и разучивай песни.</p></div>
          <Link className="btn" to="/songs">К песням →</Link>
        </div>
      ) : p.current && (
        <div className="cs-now" data-testid="course-current">
          <div className="grow">
            <span className="muted small">{p.done ? 'Сейчас' : 'Начни с'} · Этап {p.current.stageNo} из {COURSE_STAGES.length}</span>
            <b className="cs-title">Урок {p.current.order}. {p.current.title}</b>
            {!compact && p.next && <span className="muted small">Дальше: урок {p.next.order} «{p.next.title}»</span>}
          </div>
          <Link className="btn primary" to={`/learn/${p.current.id}`}>
            {savedStage !== undefined ? `Продолжить с этапа ${savedStage + 1}` : p.done ? 'Начать урок' : 'Начать'} →
          </Link>
        </div>
      )}
    </div>
  );
}

const ICON: Record<string, string> = { done: '✓', locked: '🔒' };

function LessonRow({ l }: { l: Lesson }) {
  const { completedLessons, currentLessonId, progress } = useApp();
  const status = lessonStatus(l, completedLessons, progress.lessonStages);
  const current = l.id === currentLessonId;
  const saved = progress.lessonStages[l.id];
  const badge = current
    ? (saved !== undefined ? `Начат · этап ${saved + 1} из ${l.stages.length}` : 'Текущий урок')
    : status === 'started' ? `Начат · этап ${saved + 1} из ${l.stages.length}` : LESSON_STATUS_LABEL[status];
  const inner = (
    <>
      <span className="num">{ICON[status] ?? l.order}</span>
      <span className="grow">
        <span className="muted small">Урок {l.order} · {LESSON_LEVEL_LABEL[l.level]}</span><br />
        <b>{l.title}</b><br />
        <span className="muted small">{status === 'locked' ? 'Откроется после прохождения предыдущего урока' : l.description}</span>
      </span>
      <span className="lr-side">
        <span className={`badge st-${current ? 'current' : status}`}>{badge}</span>
        <span className="muted small">{l.durationMin} мин</span>
      </span>
    </>
  );
  const cls = `lesson-row${status === 'done' ? ' done' : ''}${current ? ' next' : ''}${status === 'locked' ? ' locked' : ''}`;
  return (
    <li data-lesson={l.id} data-status={status}>
      {status === 'locked' ? <div className={cls} aria-disabled="true">{inner}</div> : <Link to={`/learn/${l.id}`} className={cls} aria-current={current ? 'step' : undefined}>{inner}</Link>}
    </li>
  );
}

function StageCard({ st }: { st: CourseStage }) {
  const { completedLessons, currentLessonId } = useApp();
  const done = st.lessons.filter((l) => completedLessons.includes(l.id)).length;
  const hasCurrent = st.lessons.some((l) => l.id === currentLessonId);
  const finished = done === st.lessons.length;
  const locked = !hasCurrent && done === 0 && !st.lessons.some((l) => l.prerequisites.every((p) => completedLessons.includes(p)));
  const state = finished ? 'done' : hasCurrent ? 'current' : locked ? 'locked' : 'open';
  return (
    <details className={`stage-card st-${state}`} open={hasCurrent} data-stage={st.no}>
      <summary>
        <span className="sc-no">{finished ? '✓' : locked ? '🔒' : st.no}</span>
        <span className="grow">
          <span className="sc-meta">Этап {st.no} из {COURSE_STAGES.length} · <span className={`badge lv-${st.level}`}>{LESSON_LEVEL_LABEL[st.level]}</span>{hasCurrent && <span className="badge st-current">Вы здесь</span>}</span>
          <b className="sc-title">{st.name}</b>
          <span className="muted small">{st.goal}</span>
          <span className="sc-bar"><span className="bar"><span style={{ width: `${(done / st.lessons.length) * 100}%` }} /></span><span className="muted small">{done} из {lessonsWord(st.lessons.length)}</span></span>
        </span>
        <span className="sc-chev" aria-hidden>›</span>
      </summary>
      <ol className="lesson-list">{st.lessons.map((l) => <LessonRow key={l.id} l={l} />)}</ol>
    </details>
  );
}

/** Карта курса: этапы → уроки со статусами. */
export function CourseStages() {
  return <div className="stages">{COURSE_STAGES.map((st) => <StageCard key={st.no} st={st} />)}</div>;
}

/** Компактная программа курса для главной: этапы с уроками и, если есть, прогрессом ученика. */
export function CourseOverview() {
  const { user, completedLessons, currentLessonId } = useApp();
  return (
    <div className="blocks-grid stages-grid">
      {COURSE_STAGES.map((st) => {
        const done = st.lessons.filter((l) => completedLessons.includes(l.id)).length;
        const here = st.lessons.some((l) => l.id === currentLessonId);
        return (
          <div className={`card flat${here ? ' here' : ''}`} key={st.no} data-stage={st.no}>
            <div className="row-between">
              <span className="tag">Этап {st.no}</span>
              <span className={`badge lv-${st.level}`}>{LESSON_LEVEL_LABEL[st.level]}</span>
            </div>
            <h3>{st.name}</h3>
            {user && <div className="sc-bar"><span className="bar"><span style={{ width: `${(done / st.lessons.length) * 100}%` }} /></span><span className="muted small">{done}/{st.lessons.length}</span></div>}
            <ol className="mini-list" start={st.lessons[0].order}>
              {st.lessons.map((l) => {
                const s = user ? lessonStatus(l, completedLessons) : 'available';
                return <li key={l.id} className={`ml-${l.id === currentLessonId ? 'current' : s}`}>{l.title}{user && s === 'done' && ' ✓'}{l.id === currentLessonId && ' ← сейчас'}</li>;
              })}
            </ol>
          </div>
        );
      })}
    </div>
  );
}
