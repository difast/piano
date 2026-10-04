import { useLocation } from 'react-router-dom';
import { COURSE_STAGES, COURSE_TITLE, LESSONS } from '../data/course';
import { usePageMeta } from '../hooks/usePageMeta';
import { Notice } from '../components/Status';
import { CourseStages, CourseSummary } from '../components/CourseMap';

export default function Learn() {
  usePageMeta('Обучение', `Курс «${COURSE_TITLE}»: ${LESSONS.length} интерактивных уроков в ${COURSE_STAGES.length} этапах с упражнениями прямо на клавиатуре.`);
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const total = LESSONS.reduce((a, l) => a + l.durationMin, 0);
  return (
    <div className="page-narrow">
      <h1>Обучение</h1>
      {notice && <Notice kind="info">{notice}</Notice>}
      <div className="card course-head">
        <div>
          <h2>{COURSE_TITLE}</h2>
          <p className="muted" style={{ margin: 0 }}>{LESSONS.length} уроков · {COURSE_STAGES.length} этапов · от начального уровня до продвинутого · около {Math.round(total / 60)} часов занятий</p>
          <CourseSummary />
        </div>
      </div>
      <CourseStages />
    </div>
  );
}
