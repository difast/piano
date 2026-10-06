import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, getAdminToken, setAdminToken } from '../../services/api';
import { usePageMeta } from '../../hooks/usePageMeta';
import './admin.css';

// ---------- типы ответов сервера ----------
type Sub = 'active' | 'pending' | 'canceled' | 'expired' | 'error' | 'none';
interface Source { slug: string; utm_source: string | null; utm_medium?: string | null; utm_campaign: string | null }
interface AdminUser {
  id: number; email: string; createdAt: string; emailVerified: boolean; account: 'active' | 'blocked'; plan: 'free' | 'pro'; planTitle: string; sub: Sub;
  subStart: string | null; subEnd: string | null; lastAmount: number | null; lastPaidAt: string | null; paidTotal: number; paidCount: number; lastActive: string | null; source: Source | null;
  autopay: { plan: string; planTitle: string; card: string | null; since: string | null; fails: number } | null;
}
interface Payment {
  id: string; ykId: string | null; userId: number | null; email: string | null; plan: string; planTitle: string; amount: number; currency: string; status: string;
  date: string; createdAt: string; paidAt: string | null; provider: string; method: string | null; failReason: string | null; source: Source | null; recurring?: boolean;
}
interface Metrics { clicks: number; unique: number; registrations: number; payments: number; payers: number; revenue: number; convReg: number; convPay: number }
interface Dashboard {
  users: { total: number; today: number; d7: number; d30: number; activeToday: number; active7: number; active30: number; free: number; pro: number; blocked: number };
  payments: { count: number; sum: number; today: { count: number; sum: number }; d7: { count: number; sum: number }; d30: { count: number; sum: number }; activeSubs: number; canceledSubs: number; failed: number; pending: number; autopay?: number };
  recentPayments: Payment[];
}
interface Charts { period: string; step: number; days: string[]; registrations: number[]; clicks: number[]; payments: number[]; revenue: number[]; funnel: Metrics }
type Utm = Record<'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content' | 'utm_term', string | null>;
interface Marketing {
  period: string;
  links: (Metrics & { slug: string; title: string; url: string })[];
  totals: Metrics & { allTime: number; today: number; d7: number; d30: number };
  byUtm: (Metrics & { utm: Utm })[];
  breakdown: Record<'device' | 'os' | 'browser' | 'country' | 'lang' | 'referrer' | 'landing', { name: string; count: number }[]>;
  recent: { id: number; at: string; slug: string; utm: Utm; device: string; os: string; browser: string; country: string | null; lang: string | null; referrer: string | null; visitor: string; registered: { id: number; email: string } | null; revenue: number }[];
}

// ---------- форматирование ----------
const TZ = 'Europe/Moscow';
const fmtMoney = (n: number, cur = 'RUB') => `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${cur === 'RUB' ? '₽' : cur}`;
const fmtNum = (n: number) => n.toLocaleString('ru-RU');
const fmtDate = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ }) : '—');
const fmtDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '—');
const dayShort = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const SUB_LABEL: Record<Sub, string> = { active: 'активна', pending: 'ожидает оплаты', canceled: 'отменена', expired: 'истекла', error: 'ошибка', none: '—' };
const PAY_LABEL: Record<string, string> = { succeeded: 'успешно', pending: 'ожидает оплаты', new: 'ожидает оплаты', canceled: 'неуспешный', refunded: 'возврат' };
const PAY_TONE: Record<string, string> = { succeeded: 'ok', pending: 'warn', new: 'warn', canceled: 'bad', refunded: 'muted' };
const SUB_TONE: Record<Sub, string> = { active: 'ok', pending: 'warn', canceled: 'muted', expired: 'muted', error: 'bad', none: 'muted' };
const METHOD: Record<string, string> = { bank_card: 'карта', sbp: 'СБП', yoo_money: 'ЮMoney', sberbank: 'SberPay', tinkoff_bank: 'T-Pay', mobile_balance: 'баланс телефона' };
const DEVICE: Record<string, string> = { mobile: 'телефон', tablet: 'планшет', desktop: 'компьютер' };
const sourceText = (s: Source | null) => (s ? [s.slug, s.utm_source, s.utm_medium, s.utm_campaign].filter(Boolean).join(' · ') : '—');
const Pill = ({ tone, children }: { tone: string; children: ReactNode }) => <span className={`cab-pill ${tone}`}>{children}</span>;

const PERIODS = [['7', '7 дней'], ['30', '30 дней'], ['90', '90 дней'], ['all', 'Всё время']] as const;
function PeriodSwitch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="cab-seg" role="group" aria-label="Период">
      {PERIODS.map(([v, l]) => <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)} aria-pressed={value === v}>{l}</button>)}
    </div>
  );
}

function useAdmin<T>(path: string, params: Record<string, string | number | undefined>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const key = JSON.stringify(params);
  const load = useCallback(() => {
    let alive = true;
    setError('');
    api.admin<T>(path, JSON.parse(key)).then((d) => alive && setData(d)).catch((e) => alive && setError((e as Error).message));
    return () => { alive = false; };
  }, [path, key]);
  useEffect(load, [load]);
  return { data, error, reload: load };
}

const Kpi = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => (
  <div className="cab-kpi"><span className="cab-kpi-l">{label}</span><b>{value}</b>{sub && <span className="cab-kpi-s">{sub}</span>}</div>
);

// ---------- графики: один ряд — столбики цвета бренда, подпись при наведении ----------
function Bars({ title, days, values, step, format = fmtNum }: { title: string; days: string[]; values: number[]; step: number; format?: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const W = 600, H = 140, gap = days.length > 60 ? 1 : 2;
  const bw = Math.max(1, (W - gap * (days.length - 1)) / days.length);
  const i = hover ?? days.length - 1;
  const label = (d: string) => (step > 1 ? `неделя с ${dayShort(d)}` : dayShort(d));
  return (
    <figure className="cab-chart">
      <figcaption><span>{title}</span><b>{format(total)}</b></figcaption>
      <div className="cab-chart-tip" aria-live="polite">{label(days[i])}: <b>{format(values[i])}</b></div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${title}: всего ${format(total)}`} onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="cab-axis" />
        {values.map((v, k) => {
          const h = v ? Math.max(3, (v / max) * (H - 6)) : 0;
          const x = k * (bw + gap);
          return (
            <g key={days[k]} onMouseEnter={() => setHover(k)} onTouchStart={() => setHover(k)}>
              <rect x={x} y={0} width={bw + gap} height={H} fill="transparent" />
              {h > 0 && <rect x={x} y={H - h} width={bw} height={h} rx={Math.min(3, bw / 2)} className={`cab-bar${k === i ? ' on' : ''}`} />}
            </g>
          );
        })}
      </svg>
      <div className="cab-chart-x"><span>{dayShort(days[0])}</span><span>{dayShort(days[days.length - 1])}</span></div>
    </figure>
  );
}

function Funnel({ m }: { m: Metrics }) {
  const steps = [
    { l: 'Уникальные переходы', v: m.unique, note: `${fmtNum(m.clicks)} кликов всего` },
    { l: 'Регистрации', v: m.registrations, note: `${m.convReg}% от переходов` },
    { l: 'Оплатили Pro', v: m.payers, note: `${m.convPay}% от переходов · ${fmtMoney(m.revenue)}` },
  ];
  const max = Math.max(1, steps[0].v);
  return (
    <figure className="cab-chart cab-funnel">
      <figcaption><span>Воронка: переход → регистрация → оплата</span></figcaption>
      {steps.map((s) => (
        <div className="cab-fstep" key={s.l}>
          <div className="cab-frow"><span>{s.l}</span><b>{fmtNum(s.v)}</b></div>
          <div className="cab-ftrack"><div style={{ width: `${(s.v / max) * 100}%` }} /></div>
          <span className="cab-kpi-s">{s.note}</span>
        </div>
      ))}
    </figure>
  );
}

function ChartsBlock() {
  const [period, setPeriod] = useState('30');
  const { data, error } = useAdmin<Charts>('/charts', { period });
  return (
    <section className="cab-card">
      <div className="cab-head"><h2>Динамика</h2><PeriodSwitch value={period} onChange={setPeriod} /></div>
      {error && <p className="cab-err">{error}</p>}
      {data && (
        <div className="cab-charts">
          <Bars title="Регистрации" days={data.days} values={data.registrations} step={data.step} />
          <Bars title="Клики по маркетинговым ссылкам" days={data.days} values={data.clicks} step={data.step} />
          <Bars title="Оплаты" days={data.days} values={data.payments} step={data.step} />
          <Bars title="Выручка" days={data.days} values={data.revenue} step={data.step} format={(n) => fmtMoney(n)} />
          <Funnel m={data.funnel} />
        </div>
      )}
    </section>
  );
}

function PaymentsTable({ rows, compact = false }: { rows: Payment[]; compact?: boolean }) {
  if (!rows.length) return <p className="cab-empty">Платежей пока нет.</p>;
  return (
    <div className="cab-table-wrap">
      <table className="cab-table">
        <thead><tr><th>Дата</th><th>Пользователь</th><th>Тариф</th><th className="r">Сумма</th><th>Статус</th>{!compact && <><th>Источник</th><th>Оплата</th><th>ID платежа</th></>}</tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="nw">{fmtDateTime(p.date)}</td>
              <td>{p.email ?? <span className="cab-muted">аккаунт удалён</span>}{p.userId && <span className="cab-muted"> · #{p.userId}</span>}</td>
              <td className="nw">{p.planTitle}{p.recurring && <span className="cab-muted small"> · автосписание</span>}</td>
              <td className="r nw">{fmtMoney(p.amount, p.currency)}</td>
              <td><Pill tone={PAY_TONE[p.status] ?? 'muted'}>{PAY_LABEL[p.status] ?? p.status}</Pill>{p.failReason && <span className="cab-muted small"> {p.failReason}</span>}</td>
              {!compact && <>
                <td>{sourceText(p.source)}</td>
                <td className="nw">{p.provider}{p.method && ` · ${METHOD[p.method] ?? p.method}`}</td>
                <td className="mono">{p.ykId ?? p.id}</td>
              </>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- разделы ----------
function DashboardTab() {
  const { data, error } = useAdmin<Dashboard>('/dashboard', {});
  if (error) return <p className="cab-err">{error}</p>;
  if (!data) return <p className="cab-muted">Загрузка…</p>;
  const { users: u, payments: p } = data;
  return (
    <>
      <section className="cab-card">
        <h2>Пользователи</h2>
        <div className="cab-kpis">
          <Kpi label="Всего" value={fmtNum(u.total)} sub={u.blocked ? `заблокировано: ${u.blocked}` : undefined} />
          <Kpi label="Новые сегодня" value={fmtNum(u.today)} />
          <Kpi label="За 7 дней" value={fmtNum(u.d7)} />
          <Kpi label="За 30 дней" value={fmtNum(u.d30)} />
          <Kpi label="Активные за 7 дней" value={fmtNum(u.active7)} sub={`сегодня ${u.activeToday} · за 30 дней ${u.active30}`} />
          <Kpi label="Free" value={fmtNum(u.free)} />
          <Kpi label="Pro" value={fmtNum(u.pro)} />
        </div>
      </section>
      <section className="cab-card">
        <h2>Оплаты</h2>
        <div className="cab-kpis">
          <Kpi label="Успешных оплат" value={fmtNum(p.count)} />
          <Kpi label="Сумма оплат" value={fmtMoney(p.sum)} />
          <Kpi label="Сегодня" value={fmtMoney(p.today.sum)} sub={`${p.today.count} шт.`} />
          <Kpi label="За 7 дней" value={fmtMoney(p.d7.sum)} sub={`${p.d7.count} шт.`} />
          <Kpi label="За 30 дней" value={fmtMoney(p.d30.sum)} sub={`${p.d30.count} шт.`} />
          <Kpi label="Активные подписки" value={fmtNum(p.activeSubs)} sub={`с автопродлением: ${p.autopay ?? 0}`} />
          <Kpi label="Отменённые (возвраты)" value={fmtNum(p.canceledSubs)} />
          <Kpi label="Неуспешные платежи" value={fmtNum(p.failed)} sub={p.pending ? `ожидают оплаты: ${p.pending}` : undefined} />
        </div>
      </section>
      <ChartsBlock />
      <section className="cab-card">
        <div className="cab-head"><h2>Последние платежи</h2><a href="#payments" className="cab-link">Все платежи →</a></div>
        <PaymentsTable rows={data.recentPayments} compact />
      </section>
    </>
  );
}

function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <div className="cab-pager">
      <button className="cab-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>←</button>
      <span>{page} из {pages}</span>
      <button className="cab-btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>→</button>
    </div>
  );
}

function UsersTab() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [plan, setPlan] = useState('');
  const [sub, setSub] = useState('');
  const [account, setAccount] = useState('');
  const [source, setSource] = useState('');
  const [autopay, setAutopay] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, reload } = useAdmin<{ total: number; page: number; pageSize: number; users: AdminUser[] }>('/users', { q: query, plan, sub, account, source, autopay, page });
  useEffect(() => { const t = window.setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300); return () => window.clearTimeout(t); }, [q]);
  const toggleBlock = async (u: AdminUser) => {
    const block = u.account === 'active';
    if (!window.confirm(block ? `Заблокировать ${u.email}? Пользователь выйдет со всех устройств и не сможет войти.` : `Разблокировать ${u.email}?`)) return;
    try { await api.adminBlock(u.id, block); reload(); } catch (e) { window.alert((e as ApiError).message); }
  };
  const sel = (v: string, set: (s: string) => void, opts: [string, string][], label: string) => (
    <label className="cab-field"><span>{label}</span>
      <select value={v} onChange={(e) => { set(e.target.value); setPage(1); }}>{opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    </label>
  );
  return (
    <section className="cab-card">
      <div className="cab-head"><h2>Пользователи{data && <span className="cab-muted"> · {fmtNum(data.total)}</span>}</h2></div>
      <div className="cab-filters">
        <label className="cab-field grow"><span>Поиск</span><input type="search" placeholder="email или ID" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {sel(plan, setPlan, [['', 'Все'], ['free', 'Free'], ['pro', 'Pro']], 'Тариф')}
        {sel(sub, setSub, [['', 'Все'], ['active', 'активна'], ['pending', 'ожидает оплаты'], ['canceled', 'отменена'], ['expired', 'истекла'], ['error', 'ошибка'], ['none', 'нет оплат']], 'Оплата')}
        {sel(account, setAccount, [['', 'Все'], ['active', 'активен'], ['blocked', 'заблокирован']], 'Аккаунт')}
        {sel(source, setSource, [['', 'Все'], ['marketing', 'по ссылке'], ['direct', 'напрямую']], 'Источник')}
        {sel(autopay, setAutopay, [['', 'Все'], ['on', 'включено'], ['off', 'выключено']], 'Автопродление')}
      </div>
      {error && <p className="cab-err">{error}</p>}
      {data && (data.users.length === 0 ? <p className="cab-empty">Никого не найдено.</p> : (
        <div className="cab-table-wrap">
          <table className="cab-table">
            <thead><tr>
              <th>ID</th><th>Email</th><th>Регистрация</th><th>Аккаунт</th><th>Тариф</th><th>Оплата</th><th>Pro с</th><th>Pro до</th>
              <th className="r">Посл. оплата</th><th>Дата оплаты</th><th className="r">Всего оплат</th><th>Автопродление</th><th>Активность</th><th>Источник</th><th />
            </tr></thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className={u.account === 'blocked' ? 'dim' : ''}>
                  <td className="mono">{u.id}</td>
                  <td>{u.email}{!u.emailVerified && <span className="cab-muted small" title="почта не подтверждена"> ✉︎?</span>}</td>
                  <td className="nw">{fmtDate(u.createdAt)}</td>
                  <td><Pill tone={u.account === 'active' ? 'ok' : 'bad'}>{u.account === 'active' ? 'активен' : 'заблокирован'}</Pill></td>
                  <td className="nw"><Pill tone={u.plan === 'pro' ? 'pro' : 'muted'}>{u.plan === 'pro' ? 'Pro' : 'Free'}</Pill>{u.plan === 'pro' && <span className="cab-muted small"> {u.planTitle.replace('Pro · ', '')}</span>}</td>
                  <td><Pill tone={SUB_TONE[u.sub]}>{SUB_LABEL[u.sub]}</Pill></td>
                  <td className="nw">{fmtDate(u.subStart)}</td>
                  <td className="nw">{u.subEnd === 'forever' ? 'навсегда' : fmtDate(u.subEnd)}</td>
                  <td className="r nw">{u.lastAmount != null ? fmtMoney(u.lastAmount) : '—'}</td>
                  <td className="nw">{fmtDate(u.lastPaidAt)}</td>
                  <td className="r nw">{u.paidTotal ? fmtMoney(u.paidTotal) : '—'}{u.paidCount > 1 && <span className="cab-muted small"> ({u.paidCount})</span>}</td>
                  <td className="nw">{u.autopay ? <><Pill tone={u.autopay.fails ? 'warn' : 'ok'}>вкл</Pill> <span className="cab-muted small">{u.autopay.planTitle.replace('Pro · ', '')}{u.autopay.card && ` · ${u.autopay.card}`}{u.autopay.fails > 0 && ` · неудач: ${u.autopay.fails}`}</span></> : <span className="cab-muted">—</span>}</td>
                  <td className="nw">{fmtDate(u.lastActive)}</td>
                  <td>{sourceText(u.source)}</td>
                  <td><button className="cab-btn small" onClick={() => toggleBlock(u)}>{u.account === 'active' ? 'Заблокировать' : 'Разблокировать'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {data && <Pager page={data.page} total={data.total} size={data.pageSize} onPage={setPage} />}
    </section>
  );
}

const todayMsk = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function PaymentsTab() {
  const [from, setFrom] = useState(shift(todayMsk(), -29));
  const [to, setTo] = useState(todayMsk());
  const [status, setStatus] = useState('');
  const [plan, setPlan] = useState('');
  const [page, setPage] = useState(1);
  const { data, error } = useAdmin<{ total: number; page: number; pageSize: number; payments: Payment[]; sum: { succeeded: number; count: number } }>('/payments', { from, to, status, plan, page });
  const preset = (days: number | null) => { setTo(todayMsk()); setFrom(days ? shift(todayMsk(), -(days - 1)) : ''); setPage(1); };
  return (
    <section className="cab-card">
      <div className="cab-head"><h2>Платежи</h2>
        <div className="cab-seg">{([[7, '7 дней'], [30, '30 дней'], [90, '90 дней'], [null, 'Всё время']] as const).map(([d, l]) => <button key={l} onClick={() => preset(d)}>{l}</button>)}</div>
      </div>
      <div className="cab-filters">
        <label className="cab-field"><span>С</span><input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label>
        <label className="cab-field"><span>По</span><input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label>
        <label className="cab-field"><span>Статус</span>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Все</option><option value="succeeded">успешно</option><option value="pending">ожидает оплаты</option><option value="canceled">неуспешный</option><option value="refunded">возврат</option>
          </select></label>
        <label className="cab-field"><span>Тариф</span>
          <select value={plan} onChange={(e) => { setPlan(e.target.value); setPage(1); }}>
            <option value="">Все</option><option value="pro-month">Pro · месяц</option><option value="pro-year">Pro · год</option><option value="pro-forever">Pro · навсегда</option>
          </select></label>
      </div>
      {error && <p className="cab-err">{error}</p>}
      {data && (
        <>
          <div className="cab-total" data-testid="payments-total">
            Итого успешных за период: <b>{fmtMoney(data.sum.succeeded)}</b> <span className="cab-muted">· {data.sum.count} оплат · всего записей {data.total}</span>
          </div>
          <PaymentsTable rows={data.payments} />
          <Pager page={data.page} total={data.total} size={data.pageSize} onPage={setPage} />
        </>
      )}
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    setDone(true); window.setTimeout(() => setDone(false), 1500);
  };
  return <button className="cab-btn primary" onClick={copy}>{done ? 'Скопировано ✓' : 'Копировать'}</button>;
}

const UTM_FIELDS = [['utm_source', 'источник'], ['utm_medium', 'тип'], ['utm_campaign', 'кампания'], ['utm_content', 'объявление'], ['utm_term', 'ключ']] as const;
function LinkBuilder({ base }: { base: string }) {
  const [v, setV] = useState<Record<string, string>>({ utm_source: 'instagram', utm_medium: 'bio', utm_campaign: '' });
  const qs = new URLSearchParams(Object.entries(v).filter(([, x]) => x.trim()).map(([k, x]) => [k, x.trim()])).toString();
  const url = `${base}${qs ? `?${qs}` : ''}`;
  return (
    <div className="cab-builder">
      <h3>Ссылка с UTM-метками</h3>
      <p className="cab-muted small">Для Reels, рекламы, блогеров — отдельная метка, и статистика разделится в таблице ниже.</p>
      <div className="cab-filters">
        {UTM_FIELDS.map(([k, l]) => (
          <label className="cab-field" key={k}><span>{k} <i>({l})</i></span><input value={v[k] ?? ''} maxLength={100} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>
        ))}
      </div>
      <div className="cab-linkrow"><code>{url}</code><CopyButton text={url} /></div>
    </div>
  );
}

function MarketingTab() {
  const [period, setPeriod] = useState('30');
  const { data, error } = useAdmin<Marketing>('/marketing', { period });
  if (error) return <p className="cab-err">{error}</p>;
  if (!data) return <p className="cab-muted">Загрузка…</p>;
  const t = data.totals;
  const utmCell = (s: string | null) => s ?? <span className="cab-muted">—</span>;
  return (
    <>
      <section className="cab-card">
        <div className="cab-head"><h2>Маркетинговые ссылки</h2><PeriodSwitch value={period} onChange={setPeriod} /></div>
        {data.links.map((l) => (
          <div className="cab-mlink" key={l.slug} data-testid={`mlink-${l.slug}`}>
            <div className="cab-linkrow"><b>{l.title}</b><code>{l.url}</code><CopyButton text={l.url} /></div>
            <div className="cab-kpis">
              <Kpi label="Клики" value={fmtNum(l.clicks)} sub={`уникальных ${fmtNum(l.unique)}`} />
              <Kpi label="Регистрации" value={fmtNum(l.registrations)} sub={`конверсия ${l.convReg}%`} />
              <Kpi label="Оплаты" value={fmtNum(l.payments)} sub={`покупателей ${l.payers} · ${l.convPay}%`} />
              <Kpi label="Выручка" value={fmtMoney(l.revenue)} />
            </div>
          </div>
        ))}
        <LinkBuilder base={data.links[0]?.url ?? ''} />
      </section>
      <section className="cab-card">
        <h2>Все переходы</h2>
        <div className="cab-kpis" data-testid="mkt-totals">
          <Kpi label="Кликов за период" value={fmtNum(t.clicks)} sub={`за всё время ${fmtNum(t.allTime)}`} />
          <Kpi label="Уникальные" value={fmtNum(t.unique)} />
          <Kpi label="Сегодня" value={fmtNum(t.today)} />
          <Kpi label="За 7 дней" value={fmtNum(t.d7)} />
          <Kpi label="За 30 дней" value={fmtNum(t.d30)} />
          <Kpi label="Регистрации" value={fmtNum(t.registrations)} sub={`клик → регистрация ${t.convReg}%`} />
          <Kpi label="Оплаты" value={fmtNum(t.payments)} sub={`клик → оплата ${t.convPay}%`} />
          <Kpi label="Выручка" value={fmtMoney(t.revenue)} />
        </div>
        <p className="cab-muted small">Конверсии считаются от уникальных посетителей. Регистрация засчитывается переходу, если была в течение 30 дней после него.</p>
      </section>
      <section className="cab-card">
        <h2>По UTM-меткам</h2>
        {data.byUtm.length === 0 ? <p className="cab-empty">Переходов за период нет.</p> : (
          <div className="cab-table-wrap">
            <table className="cab-table" data-testid="utm-table">
              <thead><tr><th>source</th><th>medium</th><th>campaign</th><th>content</th><th>term</th><th className="r">Клики</th><th className="r">Уник.</th><th className="r">Рег.</th><th className="r">Оплаты</th><th className="r">Выручка</th><th className="r">Конв. рег.</th><th className="r">Конв. опл.</th></tr></thead>
              <tbody>
                {data.byUtm.map((r, i) => (
                  <tr key={i}>
                    <td>{utmCell(r.utm.utm_source)}</td><td>{utmCell(r.utm.utm_medium)}</td><td>{utmCell(r.utm.utm_campaign)}</td><td>{utmCell(r.utm.utm_content)}</td><td>{utmCell(r.utm.utm_term)}</td>
                    <td className="r">{r.clicks}</td><td className="r">{r.unique}</td><td className="r">{r.registrations}</td><td className="r">{r.payments}</td>
                    <td className="r nw">{fmtMoney(r.revenue)}</td><td className="r">{r.convReg}%</td><td className="r">{r.convPay}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="cab-card">
        <h2>Кто переходит</h2>
        <div className="cab-breakdown">
          {([['device', 'Устройство'], ['os', 'ОС'], ['browser', 'Браузер'], ['country', 'Страна'], ['lang', 'Язык браузера'], ['referrer', 'Откуда (сайт)']] as const).map(([k, l]) => (
            <div key={k}>
              <h3>{l}</h3>
              {data.breakdown[k].length === 0 ? <p className="cab-muted small">нет данных</p> : (
                <ul>{data.breakdown[k].map((r) => (
                  <li key={r.name}><span>{k === 'device' ? DEVICE[r.name] ?? r.name : r.name}</span><b>{r.count}</b>
                    <i style={{ width: `${(r.count / Math.max(1, data.breakdown[k][0].count)) * 100}%` }} /></li>
                ))}</ul>
              )}
            </div>
          ))}
        </div>
        <p className="cab-muted small">Страна определяется, только если её передаёт сеть доставки; город не определяется. IP-адреса не сохраняются.</p>
      </section>
      <section className="cab-card">
        <h2>Последние переходы</h2>
        {data.recent.length === 0 ? <p className="cab-empty">Переходов за период нет.</p> : (
          <div className="cab-table-wrap">
            <table className="cab-table" data-testid="clicks-table">
              <thead><tr><th>Время</th><th>Ссылка</th><th>UTM</th><th>Устройство</th><th>Откуда</th><th>Посетитель</th><th>Регистрация</th><th className="r">Принёс</th></tr></thead>
              <tbody>
                {data.recent.map((c) => (
                  <tr key={c.id}>
                    <td className="nw">{fmtDateTime(c.at)}</td>
                    <td>{c.slug}</td>
                    <td>{Object.values(c.utm).filter(Boolean).join(' · ') || '—'}</td>
                    <td className="nw">{DEVICE[c.device] ?? c.device} · {c.os} · {c.browser}{c.lang && ` · ${c.lang}`}{c.country && ` · ${c.country}`}</td>
                    <td>{c.referrer ?? '—'}</td>
                    <td className="mono">{c.visitor}</td>
                    <td>{c.registered ? <>{c.registered.email} <span className="cab-muted">#{c.registered.id}</span></> : '—'}</td>
                    <td className="r nw">{c.revenue ? fmtMoney(c.revenue) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

// ---------- вход и каркас ----------
function LoginForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.adminLogin(password); setPassword(''); onDone(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <form className="cab-card cab-login" onSubmit={submit}>
      <h1>Вход в админ-кабинет</h1>
      <label className="cab-field"><span>Пароль</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus /></label>
      {error && <p className="cab-err">{error}</p>}
      <button className="cab-btn primary" disabled={busy || !password}>{busy ? 'Проверяем…' : 'Войти'}</button>
    </form>
  );
}

const TABS = [['dashboard', 'Dashboard'], ['users', 'Пользователи'], ['payments', 'Платежи'], ['marketing', 'Маркетинг']] as const;
type Tab = (typeof TABS)[number][0];
const tabFromHash = (): Tab => (TABS.find(([k]) => `#${k}` === window.location.hash)?.[0] ?? 'dashboard');

export default function Admin() {
  usePageMeta('Админ-кабинет', 'Служебная страница.');
  const [access, setAccess] = useState<'checking' | 'ok' | 'login' | 'verify'>('checking');
  const [tab, setTab] = useState<Tab>(tabFromHash);
  useEffect(() => {
    // служебная страница не индексируется
    const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex, nofollow'; document.head.appendChild(m);
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => { m.remove(); window.removeEventListener('hashchange', onHash); };
  }, []);
  const check = useCallback(() => {
    let alive = true;
    setAccess('checking');
    const dbg = (window as unknown as { __adminDebug?: (s: string, x?: Record<string, unknown>) => void }).__adminDebug;
    dbg?.('check-start');
    api.admin<{ email: string | null }>('/me').then(() => { dbg?.('check-ok'); if (alive) setAccess('ok'); })
      .catch((e) => { dbg?.('check-fail', { status: (e as ApiError).status, message: (e as Error).message }); if (!alive) return; if ((e as ApiError).status !== 403) setAdminToken(null); setAccess((e as ApiError).status === 403 && !getAdminToken() ? 'verify' : 'login'); });
    return () => { alive = false; };
  }, []);
  useEffect(check, [check]);
  const logout = async () => { await api.adminLogout().catch(() => undefined); setAccess('login'); };

  let body: ReactNode;
  if (access === 'checking') body = <p className="cab-muted">Загрузка…</p>;
  else if (access === 'login' || access === 'verify') body = (
    <>
      {access === 'verify' && <p className="cab-muted" style={{ textAlign: 'center' }}>Чтобы входить без пароля, подтвердите email аккаунта администратора.</p>}
      <LoginForm onDone={check} />
    </>
  );
  else body = (
    <>
      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'marketing' && <MarketingTab />}
    </>
  );
  return (
    <div className="cab-root">
      <header className="cab-top">
        <b className="cab-brand">Piano Lab · админ</b>
        {access === 'ok' && (
          <>
            <nav className="cab-tabs" aria-label="Разделы">
              {TABS.map(([k, l]) => <a key={k} href={`#${k}`} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined}>{l}</a>)}
            </nav>
            <span className="cab-user"><button className="cab-btn small" onClick={logout}>Выйти</button></span>
          </>
        )}
      </header>
      <main className="cab-main">{body}</main>
    </div>
  );
}
