import { api } from './api';

/** Браузерные уведомления (Web Push). На iPhone работают только у сайта, установленного на экран «Домой» (iOS 16.4+). */
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushPermission = (): NotificationPermission | 'unsupported' => (pushSupported() ? Notification.permission : 'unsupported');

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function registration() {
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/** Включает уведомления в этом браузере: спрашивает разрешение, подписывается и сообщает серверу. */
export async function enablePush(publicKey: string) {
  if (!pushSupported()) throw new Error('Этот браузер не поддерживает уведомления. На iPhone сначала добавьте сайт на экран «Домой».');
  if (!publicKey) throw new Error('Уведомления временно недоступны.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Вы запретили уведомления. Разрешите их в настройках браузера для этого сайта.');
  let sub: PushSubscription;
  try {
    const reg = await registration();
    await navigator.serviceWorker.ready;
    sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  } catch {
    // браузер отказал в подписке (режим инкогнито, блокировка, нет сервиса уведомлений)
    throw new Error('Не удалось включить уведомления в этом браузере. Проверьте, что уведомления разрешены для сайта и это не режим инкогнито, и попробуйте ещё раз.');
  }
  await api.pushSubscribe(sub.toJSON());
}

/** Отключает уведомления в этом браузере. */
export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await api.pushUnsubscribe(sub.endpoint).catch(() => undefined); await sub.unsubscribe().catch(() => undefined); }
}
