import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { LESSONS } from '../data/course';
import { useApp } from '../context/AppContext';
import { isLessonUnlocked } from '../lib';
import { usePracticeTimer } from '../hooks/usePracticeTimer';
import { usePageMeta } from '../hooks/usePageMeta';
import { track } from '../services/analytics';
import { VideoPlayer } from '../components/VideoPlayer';
import { LimitNotice } from '../components/LimitNotice';
import { Notice } from '../components/Status';
import { BlockView, type BlockResult } from '../components/lesson/BlockView';

export default function Lesson() {
  const { id } = useParams();
  const lesson = LESSONS.find((l) => l.id === id);
  const { completedLessons, completeLesson, limitReached, currentLessonId, progress, saveStage, notifyHardDone } = useApp();
  const redirectNotice = (useLocation().state as { notice?: string } | null)?.notice;
  const unlocked = !!lesson && (completedLessons.includes(lesson.id) || isLessonUnlocked(lesson, completedLessons));
  const done = !!lesson && completedLessons.includes(lesson.id);
  const [stageIdx, setStageIdx] = useState(0);
  const [maxSeen, setMaxSeen] = useState(0);
  const [results, setResults] = useState<Record<string, BlockResult>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [justDone, setJustDone] = useState(false);
  usePageMeta(lesson ? lesson.title : 'Урок', lesson ? lesson.description : 'Урок курса игры на пианино.');
  usePracticeTimer(unlocked);

  // при открытии урока — продолжаем с сохранённого этапа (пройденные уроки открываем с начала)
  useEffect(() => {
    if (!lesson) return;
    const saved = done ? 0 : Math.min(progress.lessonStages[lesson.id] ?? 0, lesson.stages.length - 1);
    setStageIdx(saved); setMaxSeen(saved); setResults({}); setError(''); setJustDone(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id]);
  useEffect(() => { if (unlocked) track('lesson_start', { lessonId: lesson!.id }); }, [unlocked, lesson?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    const blocks = lesson?.stages.flatMap((s) => s.blocks) ?? [];
    return { plays: blocks.filter((b) => b.type === 'play').length, quizzes: blocks.filter((b) => b.type === 'quiz').length };
  }, [lesson]);

  if (!lesson) return <div className="page-narrow"><h1>Урок не найден</h1><Link to="/learn">← К списку уроков</Link></div>;
  if (!unlocked) {
    return <Navigate to={currentLessonId ? `/learn/${currentLessonId}` : '/learn'} replace state={{ notice: 'Этот урок пока закрыт. Сначала пройдите предыдущие — вот ваш текущий урок.' }} />;
  }

  const stage = lesson.stages[stageIdx];
  const last = stageIdx === lesson.stages.length - 1;
  const next = LESSONS.find((l) => l.order === lesson.order + 1);

  const go = (i: number) => {
    const n = Math.max(0, Math.min(lesson.stages.length - 1, i));
    setStageIdx(n); setMaxSeen((m) => Math.max(m, n));
    if (!done) saveStage(lesson.id, n);
    if (n > stageIdx) track('stage_complete', { lessonId: lesson.id, stage: stageIdx });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const record = (key: string) => (r: BlockResult) => setResults((p) => ({ ...p, [key]: r }));
  const finish = async () => {
    setBusy(true); setError('');
    try { await completeLesson(lesson.id); setJustDone(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const playsDone = Object.entries(results).filter(([, r]) => r.kind === 'play').length;
  const quizFirst = Object.values(results).filter((r) => r.kind === 'quiz' && r.ok).length;
  const quizAll = Object.values(results).filter((r) => r.kind === 'quiz').length;

  return (
    <div className="page-narrow">
      {redirectNotice && <Notice>{redirectNotice}</Notice>}
      <Link to="/learn" className="muted">← Все уроки</Link>
      <header className="lesson-head" style={{ marginTop: 14 }}>
        <span className="block-name">{lesson.block}</span>
        <h1 style={{ marginTop: 4 }}>Урок {lesson.order}. {lesson.title}</h1>
        <div className="lesson-meta">
          <span>Урок {lesson.order} из {LESSONS.length}</span><span>≈ {lesson.durationMin} мин</span><span>{lesson.stages.length} этапов</span>
          {done && <span className="badge ok">✓ Пройден</span>}
        </div>
        <p className="lead" style={{ margin: '4px 0' }}>{lesson.description}</p>
        {stageIdx === 0 && (
          <ul className="goals">{lesson.goals.map((g) => <li key={g}>Ты научишься: {g}</li>)}</ul>
        )}
      </header>

      <div className="stepper" role="list" aria-label="Этапы урока">
        {lesson.stages.map((s, i) => (
          <button key={s.id} role="listitem" className={i === stageIdx ? 'cur' : i <= maxSeen ? 'seen' : ''} onClick={() => i <= maxSeen && go(i)}
            title={`${i + 1}. ${s.title}`} aria-label={`Этап ${i + 1}: ${s.title}`} aria-current={i === stageIdx} />
        ))}
      </div>
      <div className="stage-title">
        <h2>Этап {stageIdx + 1}. {stage.title}</h2>
        <span className="muted">{stageIdx + 1} из {lesson.stages.length} · ≈ {stage.minutes} мин</span>
      </div>

      {limitReached && !done ? <LimitNotice /> : (
        <>
          {stageIdx === 0 && <VideoPlayer url={lesson.videoUrl} title={lesson.title} />}
          <div className="stage-body" key={`${lesson.id}-${stage.id}`}>
            {stage.blocks.map((b, bi) => (
              <BlockView key={bi} block={b} onResult={record(`${stage.id}-${bi}`)} onHardDone={notifyHardDone} />
            ))}
            {last && (
              <section className="results">
                <h3>Итоги урока</h3>
                <ul>
                  <li>Упражнений выполнено: <b>{playsDone} из {totals.plays}</b></li>
                  <li>Тестов с первой попытки: <b>{quizFirst} из {totals.quizzes}</b>{quizAll < totals.quizzes && ' (остальные ещё не отвечены)'}</li>
                </ul>
                <p className="muted small" style={{ margin: '8px 0 0' }}>Не всё получилось? Вернись к нужному этапу по полоске сверху и повтори — «Урок пройден» можно нажать в любой момент.</p>
              </section>
            )}
          </div>
        </>
      )}

      {justDone && <Notice kind="success">🎉 Урок пройден!{next ? ' Следующий урок открыт.' : ' Вы прошли весь курс!'}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="stage-nav">
        <button className="btn" onClick={() => go(stageIdx - 1)} disabled={stageIdx === 0}>← Назад</button>
        {!last && <button className="btn primary" onClick={() => go(stageIdx + 1)}>Далее →</button>}
        {last && !done && <button className="btn primary" onClick={finish} disabled={busy}>{busy ? 'Сохраняем…' : 'Урок пройден'}</button>}
        {last && done && (next ? <Link className="btn primary" to={`/learn/${next.id}`}>Следующий урок →</Link> : <Link className="btn primary" to="/songs">Перейти к песням →</Link>)}
      </div>
    </div>
  );
}
