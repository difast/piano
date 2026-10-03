import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { api, type Achievements, type AchTrack, type Challenge, type Milestone } from '../services/api';
import { plural } from '../lib';

/** Срабатывает один раз, когда элемент появляется на экране (чтобы анимация шла на глазах у пользователя). */
function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    // элемент на экране или уже выше него (страницу прокрутили рывком или открыли по якорю)
    const check = () => { if (el.getBoundingClientRect().top < window.innerHeight * 0.85) { setSeen(true); return true; } return false; };
    if (check()) return;
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(() => { check(); }, { threshold: [0, 0.25, 0.5, 1] }) : null;
    io?.observe(el);
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => { io?.disconnect(); window.removeEventListener('scroll', check); window.removeEventListener('resize', check); };
  }, [seen]);
  return [ref, seen] as const;
}

/** Плавный счётчик 0 → value. */
function CountUp({ value, run, decimals = 0 }: { value: number; run: boolean; decimals?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setV(value); return; }
    let raf = 0; const t0 = performance.now(); const dur = 1400;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / dur); setV(value * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, run]);
  return <>{decimals ? v.toFixed(decimals).replace('.', ',') : Math.round(v)}</>;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

/** Путь к кубкам: шкала заполняется до текущего значения, на ней отметки-кубки. */
function TrackPath({ t }: { t: AchTrack }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const value = t.current;   // шкала показывает текущее значение; полученные кубки остаются открытыми
  const pct = Math.min(100, (value / t.max) * 100);
  const next = t.milestones.find((m) => !m.unlocked);
  const decimals = t.id === 'hours' ? 1 : 0;
  return (
    <div className="ach-track" ref={ref}>
      <div className="ach-head">
        <span className="ach-icon" aria-hidden>{t.icon}</span>
        <b>{t.title}</b>
        <span className="ach-count"><CountUp value={t.current} run={inView} decimals={decimals} /> / {t.max} {t.unit}</span>
      </div>
      <div className="ach-path" role="progressbar" aria-valuemin={0} aria-valuemax={t.max} aria-valuenow={value} aria-label={`${t.title}: ${value} из ${t.max}`}>
        <div className="ach-rail"><div className="ach-fill" style={{ width: inView ? `${pct}%` : 0 }} /></div>
        {t.milestones.map((m, i) => {
          const pos = (m.at / t.max) * 100;
          return (
            <div key={m.id} className={`ach-stop${m.unlocked ? ' on' : ''}${m.isNew ? ' new' : ''}`} style={{ left: `${pos}%`, transitionDelay: inView ? `${0.25 + (pos / 100) * 1.2}s` : '0s' }}
              title={`${m.title} — ${m.desc}`}>
              <span className="ach-cup" aria-hidden>{m.unlocked ? '🏆' : '🔒'}</span>
              <span className={`ach-at${i === 0 && pos < 8 ? ' first' : ''}${pos > 92 ? ' last' : ''}`}>{m.at}</span>
            </div>
          );
        })}
      </div>
      <div className="ach-chips">
        {t.milestones.map((m) => (
          <span key={m.id} className={`ach-chip${m.unlocked ? ' on' : ''}`} title={m.desc}>
            {m.unlocked ? '🏆' : '🔒'} {m.title}{m.unlocked && m.unlockedAt ? <small> · {fmtDate(m.unlockedAt)}</small> : null}
          </span>
        ))}
      </div>
      {next && <p className="ach-next muted small">До кубка «{next.title}»: ещё {formatLeft(next.at - value, t)}</p>}
    </div>
  );
}

function formatLeft(n: number, t: AchTrack) {
  if (t.id === 'hours') return `${(Math.ceil(n * 10) / 10).toString().replace('.', ',')} ч`;
  const words: Record<string, [string, string, string]> = {
    lessons: ['урок', 'урока', 'уроков'], streak: ['день', 'дня', 'дней'], songs: ['песня', 'песни', 'песен'],
    friends: ['друг', 'друга', 'друзей'], challenges: ['челлендж', 'челленджа', 'челленджей'],
  };
  const w = words[t.id] ?? ['', '', ''];
  return `${n} ${plural(n, ...w)}`;
}

function ChallengeCard({ c }: { c: Challenge }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const pct = Math.min(100, (c.current / c.target) * 100);
  const ends = c.kind === 'day' ? 'до конца дня' : `до ${fmtDate(`${c.endsAt}T12:00:00Z`)}`;
  return (
    <div className={`challenge${c.done ? ' done' : ''}`} ref={ref}>
      <span className="ch-icon" aria-hidden>{c.done ? '✅' : c.icon}</span>
      <div className="ch-body">
        <div className="ch-top"><b>{c.title}</b><span className="ch-kind">{c.kind === 'day' ? 'Сегодня' : 'Неделя'}</span></div>
        <span className="muted small">{c.desc}</span>
        <div className="ch-bar"><div style={{ width: inView ? `${pct}%` : 0 }} /></div>
        <span className="small">{c.done ? 'Выполнено!' : <><CountUp value={c.current} run={inView} /> / {c.target} {c.unit} · {ends}</>}</span>
      </div>
    </div>
  );
}

/** Раздел «Кубки и челленджи» на странице прогресса. */
export function AchievementsBoard() {
  const [data, setData] = useState<Achievements | null>(null);
  const [error, setError] = useState('');
  const { toast } = useToast();
  const load = useCallback(() => { api.achievements().then(setData).catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => { load(); window.addEventListener('achievements:refresh', load); return () => window.removeEventListener('achievements:refresh', load); }, [load]);
  if (error && !data) return null;
  if (!data) return <section className="card"><h3>Кубки</h3><p className="muted small">Загрузка…</p></section>;
  const share = async () => {
    const url = `${window.location.origin}/?ref=${data.referral.code}`;
    const text = 'Учусь играть на пианино с нуля — присоединяйся, начать можно бесплатно:';
    try {
      if (navigator.share) { await navigator.share({ title: 'Пианино с нуля', text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`); toast('Ссылка-приглашение скопирована', 'success');
    } catch (e) { if ((e as Error).name !== 'AbortError') toast(`Ваша ссылка: ${url}`, 'info', 9000); }
  };
  return (
    <>
      <section className="card" id="challenges">
        <div className="between"><h3>Челленджи</h3><span className="muted small">Выполненные приближают кубки ⚡</span></div>
        <div className="challenges">{data.challenges.map((c) => <ChallengeCard key={c.id} c={c} />)}</div>
      </section>
      <section className="card" id="trophies">
        <div className="between"><h3>Кубки</h3><span className="ach-total">🏆 {data.unlocked} / {data.total}</span></div>
        {data.tracks.map((t) => <TrackPath key={t.id} t={t} />)}
        <div className="ach-invite">
          <span>🤝 Пригласите друзей по своей ссылке — друг засчитывается, когда зарегистрируется и пройдёт первый урок. Сейчас: <b>{data.referral.friends} / 5</b></span>
          <button className="btn small primary" onClick={share}>Пригласить друзей</button>
        </div>
      </section>
    </>
  );
}

/** Следит за новыми кубками и показывает праздничное окно. */
export function AchievementWatcher() {
  const { user, status } = useApp();
  const { pathname } = useLocation();
  const [fresh, setFresh] = useState<Milestone[]>([]);
  const check = useCallback(() => {
    if (!user) return;
    api.achievements().then((a) => {
      const n = a.tracks.flatMap((t) => t.milestones.filter((m) => m.isNew));
      if (n.length) setFresh(n);
    }).catch(() => undefined);
  }, [user]);
  useEffect(() => { if (status === 'ready') check(); }, [status, pathname, check]);
  useEffect(() => {
    const on = () => window.setTimeout(check, 400);
    window.addEventListener('achievements:check', on);
    const iv = window.setInterval(check, 5 * 60_000);
    return () => { window.removeEventListener('achievements:check', on); window.clearInterval(iv); };
  }, [check]);
  if (!fresh.length) return null;
  const close = () => {
    api.achievementsSeen(fresh.map((m) => m.id)).catch(() => undefined);
    setFresh([]);
    window.dispatchEvent(new Event('achievements:refresh'));
  };
  return (
    <div className="modal-backdrop" role="presentation" onClick={close}>
      <div className="modal trophy-modal" role="dialog" aria-modal="true" aria-label="Новый кубок" onClick={(e) => e.stopPropagation()}>
        <div className="confetti" aria-hidden>{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ ['--i' as string]: i } as React.CSSProperties} />)}</div>
        <div className="trophy-big" aria-hidden>🏆</div>
        <h2>{fresh.length > 1 ? `Новые кубки: ${fresh.length}!` : 'Новый кубок!'}</h2>
        <ul className="trophy-list">
          {fresh.slice(0, 5).map((m) => <li key={m.id}><b>{m.title}</b><span className="muted small">{m.desc}</span></li>)}
        </ul>
        <div className="actions">
          {pathname !== '/progress' && <Link className="btn" to="/progress#trophies" onClick={close}>Все кубки</Link>}
          <button className="btn primary" onClick={close} autoFocus>Ура!</button>
        </div>
      </div>
    </div>
  );
}
