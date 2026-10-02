import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { LESSONS } from '../data/course';
import { usePageMeta } from '../hooks/usePageMeta';
import { track } from '../services/analytics';

export default function Home() {
  usePageMeta('Пианино с нуля', 'Научись играть на пианино с нуля: бесплатные уроки, песни и интерактивное пианино прямо в браузере. 15 минут занятий в день бесплатно.');
  const { user, currentLessonId, completedLessons } = useApp();
  useEffect(() => { track('home_view'); }, []);
  const started = completedLessons.length > 0;
  const to = !user ? '/register' : currentLessonId ? `/learn/${currentLessonId}` : '/learn';
  return (
    <>
      <section className="hero">
        <h1>Научись играть на пианино <span className="accent">с нуля</span></h1>
        <p className="lead">Короткие уроки, любимые песни и пианино прямо в браузере. Без инструмента, без опыта, бесплатно.</p>
        <Link className="btn primary big" to={to} onClick={() => track('start_learning_click', { loggedIn: !!user })}>
          {started ? 'Продолжить обучение' : 'Начать обучение бесплатно'}
        </Link>
        <p className="muted small">15 минут занятий в день бесплатно · Pro — без ограничений</p>
      </section>

      <section className="grid3">
        <div className="card"><div className="emoji">📚</div><h3>Понятный путь</h3><p>{LESSONS.length} уроков от первой ноты до первой песни. Всегда видно, что дальше.</p></div>
        <div className="card"><div className="emoji">🎵</div><h3>Песни, которые хочется играть</h3><p>Каталог популярных мелодий трёх уровней сложности.</p></div>
        <div className="card"><div className="emoji">🎹</div><h3>Пианино в браузере</h3><p>Играйте мышью, пальцем на телефоне или клавишами компьютера.</p></div>
      </section>

      <section className="steps">
        <h2>Как это работает</h2>
        <ol>
          <li><b>Открой урок</b> — посмотри видео и прочитай инструкцию.</li>
          <li><b>Потренируйся</b> на пианино на сайте.</li>
          <li><b>Отметь «Урок пройден»</b> — откроется следующий. Прогресс сохраняется в аккаунте.</li>
        </ol>
        <Link className="btn" to="/piano">Попробовать пианино →</Link>
      </section>
    </>
  );
}
