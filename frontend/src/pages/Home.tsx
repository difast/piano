import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { LESSONS } from '../data/course';
import { SONGS } from '../data/songs';
import { DIFFICULTY_LABEL } from '../data/types';
import { usePageMeta } from '../hooks/usePageMeta';
import { track } from '../services/analytics';
import { Piano } from '../components/Piano';
import { Cover } from './Songs';
import { LegalLink } from '../components/LegalLink';

const FAQ = [
  { q: 'Нужно ли пианино или синтезатор?', a: 'Нет. Начать можно прямо в браузере: на сайте есть виртуальное пианино, на нём работают все упражнения. Играть можно мышью, пальцем на телефоне или клавишами компьютера. Когда появится настоящий инструмент, уроки останутся теми же.' },
  { q: 'Я совсем не умею. Мне это подойдёт?', a: 'Да, курс начинается с нуля: с расположения клавиш и названий нот. Каждый следующий урок открывается только после предыдущего, поэтому вы идёте по порядку и не теряетесь.' },
  { q: 'Сколько стоит?', a: 'Начать можно бесплатно: все уроки, песни и пианино доступны на тарифе Free. Единственное ограничение — до 15 минут активных занятий в день. Тариф Pro без ограничения по времени появится позже.' },
  { q: 'Как считаются 15 минут?', a: 'Считается только время, когда вы действительно занимаетесь: открыт урок, песня или пианино, вкладка активна и вы что-то делаете. Если вы отвлеклись больше чем на минуту, счётчик останавливается. Лимит обновляется каждый день.' },
  { q: 'Что будет, если я пропущу несколько дней?', a: 'Ничего страшного. Прогресс сохраняется в аккаунте, вы продолжите ровно с того урока, на котором остановились — на любом устройстве.' },
  { q: 'Работает ли на телефоне?', a: 'Да. Сайт адаптирован под телефон, пианино реагирует на касания. Для звука на iPhone проверьте, что выключен беззвучный режим.' },
  { q: 'Что вы делаете с моими данными?', a: 'Храним только имя, email и ваш прогресс — подробности в политике конфиденциальности. Пароль хранится в зашифрованном виде.' },
];

const STEPS = [
  { n: 1, t: 'Зарегистрируйтесь', d: 'Имя, email и пароль — за минуту. Банковская карта не нужна.' },
  { n: 2, t: 'Проходите уроки по порядку', d: 'Короткое видео, понятная инструкция и упражнение на пианино прямо на сайте.' },
  { n: 3, t: 'Играйте песни и растите', d: 'Выбирайте мелодии своего уровня и следите за прогрессом каждый день.' },
];

const BENEFITS = [
  { e: '📚', t: 'Понятный путь', d: 'Курс «С нуля до уверенной игры» из 12 последовательных уроков. Всегда видно, что пройдено и что дальше.' },
  { e: '🎹', t: 'Пианино в браузере', d: 'Белые и чёрные клавиши, звук, подсветка нот. Мышь, касание или клавиатура компьютера.' },
  { e: '🎵', t: 'Любимые песни', d: 'Каталог песен трёх уровней: начинающий, средний, продвинутый. С подсказками по нотам.' },
  { e: '📈', t: 'Видимый прогресс', d: 'Уровень, процент курса и график занятий за неделю — чтобы регулярность превращалась в привычку.' },
];

export default function Home() {
  usePageMeta('Пианино с нуля', 'Научись играть на пианино с нуля: бесплатные уроки, песни и интерактивное пианино прямо в браузере. 15 минут занятий в день бесплатно.');
  const { user, currentLessonId, completedLessons } = useApp();
  useEffect(() => { track('home_view'); }, []);
  const started = completedLessons.length > 0;
  const to = !user ? '/register' : currentLessonId ? `/learn/${currentLessonId}` : '/learn';
  const ctaLabel = started ? 'Продолжить обучение' : 'Начать обучение бесплатно';
  const onCta = (place: string) => () => track('start_learning_click', { loggedIn: !!user, place });
  const totalMin = LESSONS.reduce((a, l) => a + l.durationMin, 0);
  const sample = SONGS.filter((s) => s.notes.length > 0).slice(0, 4);

  return (
    <>
      <section className="hero2">
        <div className="hero-text">
          <span className="eyebrow">Бесплатно · без инструмента · без опыта</span>
          <h1>Научись играть на пианино <span className="accent">с нуля</span></h1>
          <p className="lead">Короткие уроки по {Math.min(...LESSONS.map((l) => l.durationMin))}–{Math.max(...LESSONS.map((l) => l.durationMin))} минут, любимые песни и пианино прямо в браузере. Первая мелодия — уже сегодня.</p>
          <div className="cta-row">
            <Link className="btn primary big" to={to} onClick={onCta('hero')}>{ctaLabel}</Link>
            <a className="btn big" href="#demo">Попробовать пианино</a>
          </div>
          <ul className="checks">
            <li>Регистрация за минуту</li>
            <li>Карта не нужна</li>
            <li>15 минут в день бесплатно</li>
          </ul>
        </div>
        <div className="hero-demo" id="demo">
          <div className="demo-card">
            <p className="demo-title">Нажми на клавишу — это уже пианино</p>
            <Piano startOctave={4} octaves={1} showKeyboardLabels={false} />
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Знакомо?</h2>
        <div className="grid3">
          <div className="card flat"><h3>«Дома нет пианино»</h3><p>Не нужно. Виртуальная клавиатура на сайте подходит для всех упражнений первых уроков.</p></div>
          <div className="card flat"><h3>«Не знаю, с чего начать»</h3><p>Начните с первого урока. Следующий откроется сам, когда вы закончите предыдущий — выбирать не придётся.</p></div>
          <div className="card flat"><h3>«Теория скучная»</h3><p>Каждый урок — это короткое видео и сразу практика. Вы играете с первого занятия, а не читаете учебник.</p></div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Как это работает</h2>
        <div className="grid3">
          {STEPS.map((s) => (
            <div className="card step" key={s.n}><span className="step-n">{s.n}</span><h3>{s.t}</h3><p>{s.d}</p></div>
          ))}
        </div>
        <div className="center"><Link className="btn primary big" to={to} onClick={onCta('steps')}>{ctaLabel}</Link></div>
      </section>

      <section className="section">
        <h2 className="section-title">Всё, что нужно для старта</h2>
        <div className="grid4">
          {BENEFITS.map((b) => (
            <div className="card flat" key={b.t}><div className="emoji">{b.e}</div><h3>{b.t}</h3><p>{b.d}</p></div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Программа курса</h2>
        <p className="section-sub">{LESSONS.length} уроков · около {totalMin} минут занятий в сумме</p>
        <ol className="program">
          {[...LESSONS].sort((a, b) => a.order - b.order).map((l) => (
            <li key={l.id}><span className="num">{l.order}</span><span className="grow">{l.title}</span><span className="muted small">{l.durationMin} мин</span></li>
          ))}
        </ol>
      </section>

      {sample.length > 0 && (
        <section className="section">
          <h2 className="section-title">Песни, которые хочется играть</h2>
          <p className="section-sub">Начните с простых мелодий и двигайтесь к более сложным</p>
          <div className="song-grid">
            {sample.map((s) => (
              <Link key={s.id} to={`/songs/${s.id}`} className="song-card card">
                <Cover cover={s.cover} coverUrl={s.coverUrl} title={s.title} />
                <b className="song-title">{s.title}</b>
                <span className="muted small">{s.artist}</span>
                <div className="row"><span className={`badge lvl-${s.difficulty}`}>{DIFFICULTY_LABEL[s.difficulty]}</span></div>
              </Link>
            ))}
          </div>
          <div className="center"><Link className="btn" to="/songs">Весь каталог песен →</Link></div>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Тарифы</h2>
        <p className="section-sub">Начните бесплатно — платить за старт не нужно</p>
        <div className="plans-grid">
          <div className="card plan featured">
            <span className="badge">Доступно сейчас</span>
            <h3>Free</h3>
            <p className="price">0 ₽</p>
            <ul className="plan-list">
              <li>Все уроки курса</li>
              <li>Каталог песен</li>
              <li>Виртуальное пианино</li>
              <li>Прогресс и статистика</li>
              <li>До 15 минут занятий в день</li>
            </ul>
            <Link className="btn primary" to={to} onClick={onCta('plans')}>{ctaLabel}</Link>
          </div>
          <div className="card plan">
            <span className="badge pro">Скоро</span>
            <h3>Pro</h3>
            <p className="price muted">Скоро</p>
            <ul className="plan-list">
              <li>Всё из тарифа Free</li>
              <li>Занятия без ограничения по времени</li>
              <li>Занимайтесь сколько хочется каждый день</li>
            </ul>
            <button className="btn" disabled>Пока недоступно</button>
          </div>
        </div>
      </section>

      <section className="section narrow-section">
        <h2 className="section-title">Частые вопросы</h2>
        <div className="faq">
          {FAQ.map((f) => (
            <details key={f.q}><summary>{f.q}</summary><p>{f.a}{f.q.startsWith('Что вы делаете') && <> <LegalLink to="/privacy">Политика конфиденциальности</LegalLink>.</>}</p></details>
          ))}
        </div>
      </section>

      <section className="final-cta">
        <h2>Сыграйте первую ноту уже сегодня</h2>
        <p>Бесплатно, без карты и без опыта. Регистрация занимает минуту.</p>
        <Link className="btn white big" to={to} onClick={onCta('final')}>{ctaLabel}</Link>
      </section>
    </>
  );
}
