import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { COURSE_BLOCKS, LESSONS } from '../data/course';
import { SONGS } from '../data/songs';
import { DIFFICULTY_LABEL } from '../data/types';
import { usePageMeta } from '../hooks/usePageMeta';
import { track } from '../services/analytics';
import { Piano } from '../components/Piano';
import { Cover } from './Songs';
import { useBilling } from '../hooks/useBilling';
import { ProPricing } from '../components/ProPricing';
import { FREE_SONG_IDS } from '../data/config';
import { plural } from '../lib';
import { LegalLink } from '../components/LegalLink';

const FAQ = [
  { q: 'Нужно ли пианино или синтезатор?', a: 'Не обязательно. Начать можно прямо в браузере: на сайте есть виртуальное пианино, на нём работают все упражнения. А если у вас уже есть пианино или синтезатор — отлично: играйте упражнения и песни на нём, а подсветка нот на экране подскажет, что нажимать. Уроки одинаково подходят и для настоящего инструмента, и для виртуальной клавиатуры.' },
  { q: 'У меня уже есть пианино. Зачем мне сайт?', a: 'Чтобы не гадать, что учить дальше. Здесь есть пошаговый курс с уроками по порядку, песни по уровням сложности и прогресс, который сохраняется в аккаунте. Инструмент остаётся вашим, а сайт даёт план и подсказки.' },
  { q: 'Я совсем не умею. Мне это подойдёт?', a: 'Да, курс начинается с нуля: с расположения клавиш и названий нот. Каждый следующий урок открывается только после предыдущего, поэтому вы идёте по порядку и не теряетесь.' },
  { q: 'Сколько стоит?', a: 'Начать можно бесплатно: на тарифе Free доступны все уроки курса, виртуальное пианино, несколько песен и нот для просмотра — до 15 минут активных занятий в день. Pro снимает лимит по времени, открывает все песни и ноты, скачивание PDF и подробную статистику. Цены — в разделе «Тарифы» выше, автоматических списаний нет.' },
  { q: 'Как считаются 15 минут?', a: 'Считается только время, когда вы действительно занимаетесь: открыт урок, песня или пианино, вкладка активна и вы что-то делаете. Если вы отвлеклись больше чем на минуту, счётчик останавливается. Лимит обновляется каждый день.' },
  { q: 'Что будет, если я пропущу несколько дней?', a: 'Ничего страшного. Прогресс сохраняется в аккаунте, вы продолжите ровно с того урока, на котором остановились — на любом устройстве.' },
  { q: 'Работает ли на телефоне?', a: 'Да. Сайт адаптирован под телефон, пианино реагирует на касания. Для звука на iPhone проверьте, что выключен беззвучный режим.' },
  { q: 'Что вы делаете с моими данными?', a: 'Храним только имя, email и ваш прогресс — подробности в политике конфиденциальности. Пароль хранится в зашифрованном виде.' },
];

const STEPS = [
  { n: 1, t: 'Зарегистрируйтесь', d: 'Имя, email и пароль — за минуту. Банковская карта не нужна.' },
  { n: 2, t: 'Проходите уроки по порядку', d: 'Объяснение, схема клавиш и упражнение — на вашем пианино или на виртуальной клавиатуре сайта. Каждое задание проверяется.' },
  { n: 3, t: 'Играйте песни и растите', d: 'Выбирайте мелодии своего уровня и следите за прогрессом каждый день.' },
];

const BENEFITS = [
  { e: '📚', t: 'Понятный путь', d: `Курс «С нуля до уверенной игры» из ${LESSONS.length} последовательных уроков по 30–40 минут. Всегда видно, что пройдено и что дальше.` },
  { e: '🎹', t: 'Пианино в браузере', d: 'Виртуальная клавиатура со звуком и подсветкой нот: мышь, касание или клавиши компьютера. Подсветка подскажет, что играть и на вашем инструменте.' },
  { e: '🎵', t: 'Песни и ноты', d: 'Каталог песен трёх уровней с подсказками по нотам и библиотека нот для фортепиано (PDF — на тарифе Pro).' },
  { e: '📈', t: 'Видимый прогресс', d: 'Уровень, процент курса и график занятий за неделю — чтобы регулярность превращалась в привычку.' },
];

export default function Home() {
  usePageMeta('Пианино с нуля', 'Научись играть на пианино с нуля: пошаговые уроки и песни — на своём инструменте или на виртуальной клавиатуре в браузере. Бесплатно, 15 минут занятий в день.');
  const { user, currentLessonId, completedLessons, isPro } = useApp();
  const billing = useBilling();
  const proList = (
    <ul className="plan-list">
      <li>Всё из тарифа Free</li>
      <li>Занятия без ограничения по времени</li>
      <li>Все песни и ноты каталога</li>
      <li>Скачивание PDF-нот</li>
      <li>Подробная статистика занятий</li>
    </ul>
  );
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
          <span className="eyebrow">Бесплатно · с пианино или без · с нуля</span>
          <h1>Научись играть на пианино <span className="accent">с нуля</span></h1>
          <p className="lead">{LESSONS.length} интерактивных уроков: объяснение, схема клавиш, упражнения на пианино и закрепление. Занимайтесь на своём инструменте или прямо в браузере. Первая мелодия — уже сегодня.</p>
          <div className="cta-row">
            <Link className="btn primary big" to={to} onClick={onCta('hero')}>{ctaLabel}</Link>
            <a className="btn big" href="#demo">Попробовать пианино</a>
          </div>
          <ul className="checks">
            <li>Регистрация за минуту</li>
            <li>С инструментом и без</li>
            <li>15 минут в день бесплатно</li>
          </ul>
        </div>
        <div className="hero-demo" id="demo">
          <div className="demo-card">
            <p className="demo-title">Нажми на клавишу — это уже пианино</p>
            <Piano from="C4" to="C5" labels="both" showNote glide soundTip />
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Подойдёт, если…</h2>
        <div className="grid4">
          <div className="card flat"><h3>У вас нет пианино</h3><p>Не проблема. Виртуальная клавиатура на сайте подходит для всех упражнений первых уроков.</p></div>
          <div className="card flat"><h3>Пианино есть, но не знаете, с чего начать</h3><p>Курс подскажет порядок, а подсветка нот на экране — что играть на вашем инструменте.</p></div>
          <div className="card flat"><h3>Вы бросали из-за скучной теории</h3><p>Каждый урок — простое объяснение и сразу практика на клавиатуре. Вы играете с первого занятия.</p></div>
          <div className="card flat"><h3>Нужен удобный график</h3><p>Занимайтесь когда удобно: уроки короткие, а прогресс сохраняется на любом устройстве.</p></div>
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
        <p className="section-sub">{LESSONS.length} уроков в {COURSE_BLOCKS.length} блоках · около {Math.round(totalMin / 60)} часов занятий</p>
        <div className="blocks-grid">
          {COURSE_BLOCKS.map((b, bi) => (
            <div className="card flat" key={b.name}>
              <span className="tag">Блок {bi + 1}</span>
              <h3>{b.name}</h3>
              <ol className="mini-list" start={b.lessons[0].order}>
                {b.lessons.map((l) => <li key={l.id}>{l.title}</li>)}
              </ol>
            </div>
          ))}
        </div>
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
              <li>Виртуальное пианино</li>
              <li>{FREE_SONG_IDS.length} {plural(FREE_SONG_IDS.length, 'песня', 'песни', 'песен')} и несколько нот для просмотра</li>
              <li>Прогресс по курсу</li>
              <li>До 15 минут занятий в день</li>
            </ul>
            <Link className="btn primary" to={to} onClick={onCta('plans')}>{ctaLabel}</Link>
          </div>
          <div className="card plan">
            <span className="badge pro">Pro</span>
            <h3>Pro</h3>
            {billing?.enabled && billing.plans.length
              ? <ProPricing plans={billing.plans} cta={
                  isPro && !billing.available?.length ? { to: '/profile', label: '👑 У вас Pro', primary: false }
                  : isPro ? { to: '/profile#plans', label: 'У вас Pro · перейти на больший тариф', primary: false }
                  : user ? { to: '/profile#plans', label: 'Подключить Pro', primary: true, onClick: onCta('pro') }
                  : { to: '/register', label: 'Зарегистрироваться и выбрать', primary: true, onClick: onCta('pro') }}>{proList}</ProPricing>
              : <><p className="price muted">Скоро</p>{proList}<button className="btn" disabled>Пока недоступно</button></>}
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
        <p>Бесплатно, без карты и без опыта — с пианино или без. Регистрация занимает минуту.</p>
        <Link className="btn white big" to={to} onClick={onCta('final')}>{ctaLabel}</Link>
      </section>
    </>
  );
}
