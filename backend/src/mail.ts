import nodemailer from 'nodemailer';
import { APP_NAME, FRONTEND } from './config.ts';

/**
 * Отправка писем через SMTP. По умолчанию порт 465 с SSL (secure).
 * Переменные: SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, MAIL_FROM, SUPPORT_EMAIL.
 */
const HOST = (process.env.SMTP_HOST ?? '').trim();
const PORT = Number(process.env.SMTP_PORT) || 465;
const USER = (process.env.SMTP_USER ?? '').trim();
const PASS = process.env.SMTP_PASS ?? '';
export const MAIL_FROM = (process.env.MAIL_FROM || USER).trim();
export const SUPPORT_EMAIL = (process.env.SUPPORT_EMAIL || USER).trim();

export const mailEnabled = () => !!(HOST && USER && PASS && MAIL_FROM);
export const mailMissing = () => ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((k) => !(process.env[k] ?? '').trim());

const transport = mailEnabled()
  ? nodemailer.createTransport({
    host: HOST, port: PORT, secure: PORT === 465, auth: { user: USER, pass: PASS },
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
    // только для локальных тестов с самоподписанным сертификатом
    tls: process.env.SMTP_TLS_INSECURE === '1' ? { rejectUnauthorized: false } : undefined,
  })
  : null;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Простое письмо в фирменной обёртке: заголовок, абзацы, необязательная кнопка. */
function layout(title: string, paragraphs: string[], button?: { url: string; label: string }, footer?: string) {
  const html = `<!doctype html><html><body style="margin:0;background:#fafaf9;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c1917">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #e7e5e4;border-radius:14px">
<tr><td style="padding:24px 24px 8px;font-size:18px;font-weight:700">🎹 ${esc(APP_NAME)}</td></tr>
<tr><td style="padding:0 24px"><h1 style="font-size:20px;margin:12px 0">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px">${esc(p)}</p>`).join('')}
${button ? `<p style="margin:20px 0"><a href="${esc(button.url)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${esc(button.label)}</a></p>
<p style="font-size:12px;color:#78716c;word-break:break-all">Если кнопка не работает, откройте ссылку: ${esc(button.url)}</p>` : ''}
</td></tr>
<tr><td style="padding:12px 24px 24px;font-size:12px;color:#78716c">${esc(footer ?? 'Вы получили это письмо, потому что зарегистрированы на сайте.')}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [title, '', ...paragraphs, ...(button ? ['', `${button.label}: ${button.url}`] : []), '', footer ?? ''].join('\n');
  return { html, text };
}

export async function sendMail(to: string, subject: string, body: { html: string; text: string }, replyTo?: string) {
  if (!transport) throw new Error('Почта не настроена (SMTP_HOST, SMTP_USER, SMTP_PASS)');
  await transport.sendMail({ from: `"${APP_NAME}" <${MAIL_FROM}>`, to, subject, html: body.html, text: body.text, replyTo });
}

/** Проверка соединения с SMTP при запуске (пишет в лог, не падает). */
export async function verifyMail(): Promise<string> {
  if (!transport) return `выключена — не заданы: ${mailMissing().join(', ')}`;
  try { await transport.verify(); return `включена (${HOST}:${PORT}, отправитель ${MAIL_FROM})`; }
  catch (e) { return `ОШИБКА подключения к ${HOST}:${PORT}: ${(e as Error).message}`; }
}

const fmtRub = (v: string) => `${Number(v).toLocaleString('ru-RU')} ₽`;
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }).replace(/\s?г\.$/, '');

export const mails = {
  welcome: (name: string) => layout(`${name ? `${name}, д` : 'Д'}обро пожаловать в ${APP_NAME}!`, [
    'Почта подтверждена — теперь вы сможете восстановить доступ, если забудете пароль.',
    'С чего начать:',
    '1. Пройдите первый урок «Знакомство с клавиатурой» — это 5–10 минут.',
    '2. Сыграйте «Оду к радости» на виртуальном пианино или на своём инструменте.',
    '3. Включите напоминания в профиле — регулярность важнее длительности.',
    'Бесплатно доступны все уроки курса и до 15 минут занятий в день. Удачи — у вас всё получится!',
  ], FRONTEND ? { url: `${FRONTEND}/learn`, label: 'Начать первый урок' } : undefined),
  proEnding: (until: string) => layout('Pro скоро закончится', [
    `Ваша подписка Pro действует до ${fmtDay(until)}.`,
    'После этого снова будет бесплатный тариф: 15 минут занятий в день, несколько песен и нот. Прогресс, кубки и история занятий сохранятся.',
    'Если хотите заниматься без перерыва — можно уже сейчас перейти на тариф с большим сроком: новый срок начнётся после окончания текущего, оплаченные дни не пропадут.',
  ], FRONTEND ? { url: `${FRONTEND}/profile#plans`, label: 'Выбрать тариф' } : undefined, 'Автопродление не включено — подписка не продлится сама.'),
  proEnded: (until: string) => layout('Подписка Pro закончилась', [
    `Срок Pro истёк ${fmtDay(until)}. Снова действует бесплатный тариф: 15 минут занятий в день, несколько песен и нот для просмотра.`,
    'Ваш прогресс, кубки и история занятий сохранены — можно продолжать с того же места.',
    'Чтобы снова заниматься без ограничений, со всеми песнями, нотами и скачиванием PDF, оформите Pro в профиле.',
  ], FRONTEND ? { url: `${FRONTEND}/profile#plans`, label: 'Вернуть Pro' } : undefined, 'Вопросы — просто ответьте на это письмо.'),
  proPaid: (o: { planTitle: string; amount: string; until: string; forever: boolean; startsLater: string | null; renewed?: boolean; autopay?: { chargeAt: string; amount: string } | null }) => layout(o.renewed ? 'Pro продлён 👑' : 'Спасибо! Pro подключён 👑', [
    `Тариф: ${o.planTitle} — ${fmtRub(o.amount)}.`,
    o.forever ? 'Pro подключён навсегда — без продлений и сроков.'
      : o.renewed ? `Подписка продлена автоматически. Pro действует до ${fmtDay(o.until)}.`
      : o.startsLater ? `Новый срок начнётся ${fmtDay(o.startsLater)}, после окончания текущей подписки. Pro действует до ${fmtDay(o.until)}.`
      : `Pro действует до ${fmtDay(o.until)}.`,
    'Теперь вам доступны: занятия без ограничения по времени, все песни и ноты каталога, скачивание PDF-нот и подробная статистика занятий.',
    o.autopay
      ? `Кассовый чек пришлёт ЮKassa отдельным письмом. Включено автопродление: следующее списание — ${fmtDay(o.autopay.chargeAt)}, ${fmtRub(o.autopay.amount)}. Не позднее чем за 3 дня до списания пришлём напоминание; сменить основную карту, привязать другую или удалить карту можно в профиле в любой момент.`
      : o.forever ? 'Кассовый чек пришлёт ЮKassa отдельным письмом.'
      : 'Кассовый чек пришлёт ЮKassa отдельным письмом. Автопродление не включено — подписка закончится по окончании срока.',
  ], FRONTEND ? { url: `${FRONTEND}/learn`, label: 'Продолжить занятия' } : undefined, 'Вопросы по оплате — просто ответьте на это письмо или напишите в поддержку из профиля.'),
  // ---- автопродление ----
  autopayReminder: (o: { planTitle: string; amount: string; chargeAt: string; until: string; card: string | null; others?: number }) => layout('Скоро продлим Pro', [
    `${fmtDay(o.chargeAt)} мы автоматически продлим вашу подписку «${o.planTitle}» и спишем ${fmtRub(o.amount)}${o.card ? ` с ${o.others ? 'основной ' : ''}карты ${o.card}` : ''}.`,
    ...(o.others ? ['Если списать с основной карты не получится (после трёх попыток), попробуем другие привязанные карты. Основную карту можно сменить, а лишние — удалить в профиле.'] : []),
    `Текущий срок Pro — до ${fmtDay(o.until)}. После продления занятия продолжатся без перерыва.`,
    'Если продлевать не нужно — удалите привязанные карты в профиле до даты списания. Pro продолжит действовать до конца оплаченного срока.',
  ], FRONTEND ? { url: `${FRONTEND}/profile#plans`, label: 'Управлять подпиской' } : undefined, 'Вы получили это письмо, потому что включили автопродление Pro при оплате.'),
  autopayFailed: (o: { planTitle: string; amount: string; until: string; card: string | null; next: 'retry' | 'fallback' | 'none' }) => layout('Не удалось продлить Pro', [
    o.next === 'none'
      ? `Не получилось списать ${fmtRub(o.amount)} за подписку «${o.planTitle}» ни с одной привязанной карты. Обычно причина — недостаточно средств или ограничения банка.`
      : `Не получилось списать ${fmtRub(o.amount)}${o.card ? ` с карты ${o.card}` : ''} за подписку «${o.planTitle}». Обычно причина — недостаточно средств или ограничения банка.`,
    o.next === 'retry' ? 'Мы попробуем ещё раз примерно через 8 часов. Можно пополнить карту, сменить основную карту или оплатить Pro вручную в профиле.'
      : o.next === 'fallback' ? 'Сейчас попробуем списать с другой привязанной карты. Если не получится — автопродление отключится.'
        : 'Повторных попыток не будет — автопродление отключено, данные карт удалены. Оплатить Pro можно вручную в профиле.',
    `Pro действует до ${fmtDay(o.until)}.`,
  ], FRONTEND ? { url: `${FRONTEND}/profile#plans`, label: 'Открыть профиль' } : undefined, 'Вопросы по оплате — просто ответьте на это письмо.'),
  autopayCanceled: (o: { until: string; forever?: boolean; card?: string | null }) => layout('Карта отвязана', [
    `Вы удалили ${o.card ? `карту ${o.card}` : 'карту'} — это была последняя привязанная карта. Данные для автоматической оплаты удалены, автопродление Pro отключено. Больше списаний не будет.`,
    o.forever ? 'Ваш Pro бессрочный.' : `Pro продолжит действовать до ${fmtDay(o.until)}. После этого снова будет бесплатный тариф, прогресс сохранится.`,
    'Включить автопродление снова можно в профиле («Привязать карту») или при следующей оплате картой: отметьте «Запомнить данные карты» на странице оплаты.',
  ], FRONTEND ? { url: `${FRONTEND}/profile#plans`, label: 'Открыть профиль' } : undefined, 'Если вы не отвязывали карту — ответьте на это письмо.'),
  cardAdded: (o: { card: string }) => layout('Карта привязана', [
    `Карта ${o.card} привязана к вашему аккаунту для автопродления Pro. Проверочный платёж 1 ₽ отменён — деньги вернутся на карту (обычно сразу, иногда банк возвращает их в течение нескольких дней).`,
    'Основная карта для списаний выбирается в профиле. Если списать с основной не получится, попробуем другие привязанные карты. Удалить любую карту можно в профиле в любой момент.',
  ], FRONTEND ? { url: `${FRONTEND}/profile#plans`, label: 'Открыть профиль' } : undefined, 'Если вы не привязывали карту — ответьте на это письмо.'),
  cardRemoved: (o: { card: string }) => layout('Карта удалена', [
    `Карта ${o.card} удалена — данные для списаний с неё больше не хранятся, списаний с неё не будет.`,
    'Автопродление Pro продолжит работать с другими привязанными картами.',
  ], FRONTEND ? { url: `${FRONTEND}/profile#plans`, label: 'Открыть профиль' } : undefined, 'Если вы не удаляли карту — ответьте на это письмо.'),
  verify: (url: string) => layout('Подтвердите почту', ['Чтобы подтвердить адрес электронной почты, нажмите кнопку ниже. Ссылка действует 3 дня.', 'Если вы не регистрировались, просто проигнорируйте письмо.'], { url, label: 'Подтвердить почту' }),
  reset: (url: string) => layout('Сброс пароля', ['Вы запросили сброс пароля. Нажмите кнопку, чтобы задать новый пароль. Ссылка действует 1 час и сработает один раз.', 'Если вы не запрашивали сброс — ничего не делайте, пароль останется прежним.'], { url, label: 'Задать новый пароль' }),
  passwordChanged: () => layout('Пароль изменён', ['Пароль от вашего аккаунта только что изменили. Все остальные устройства вышли из аккаунта.', 'Если это были не вы — сразу восстановите доступ через «Забыли пароль?» на странице входа и напишите в поддержку.'], FRONTEND ? { url: `${FRONTEND}/forgot-password`, label: 'Восстановить доступ' } : undefined),
  accountDeleted: () => layout('Аккаунт удалён', ['Ваш аккаунт и прогресс удалены по вашему запросу. Спасибо, что занимались с нами!', 'Если это были не вы — напишите в поддержку, ответив на это письмо.']),
  support: (from: string, name: string, userId: number | null, message: string) => layout('Сообщение в поддержку', [`От: ${name ? `${name} ` : ''}<${from}>${userId ? `, id ${userId}` : ''}`, ...message.split(/\n+/)], undefined, 'Ответьте на это письмо — ответ уйдёт пользователю.'),
  supportCopy: (message: string) => layout('Мы получили ваше сообщение', ['Спасибо! Мы ответим на этот адрес в ближайшее время.', 'Ваше сообщение:', ...message.split(/\n+/)]),
  reminder: (url: string, name: string) => layout(`${name ? `${name}, ` : ''}пора позаниматься 🎹`, ['Даже 10 минут в день дают заметный результат. Ваш прогресс сохранён — продолжите с того же места.'], { url, label: 'Продолжить занятие' }, 'Напоминания можно выключить в профиле в разделе «Уведомления».'),
  songOfDay: (url: string, title: string, artist: string) => layout('Композиция дня', [`Сегодня советуем: «${title}» — ${artist}. Попробуйте сыграть её на пианино!`], { url, label: 'Открыть композицию' }, 'Рассылку можно выключить в профиле в разделе «Уведомления».'),
};
