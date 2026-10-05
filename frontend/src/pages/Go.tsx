import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, saveMarketingVisit } from '../services/api';
import { anonId } from '../services/analytics';

const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
const fired = new Set<string>();

function uuid(): string {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch { /* небезопасный контекст */ }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Маркетинговая ссылка /go/<slug>?utm_…: записывает переход и сразу открывает главную (без промежуточной страницы).
 * Если сервер не ответил за 1,5 с — всё равно уходим на главную, запрос досылается в фоне (keepalive).
 */
export default function Go() {
  const { slug = '' } = useParams();
  const { search, key } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (fired.has(key)) return;   // защита от повторного запуска эффекта
    fired.add(key);
    const sp = new URLSearchParams(search);
    const utm = Object.fromEntries(UTM.map((k) => [k, sp.get(k)?.slice(0, 100)]).filter(([, v]) => v));
    const visitId = uuid();
    let left = false;
    const go = () => { if (!left) { left = true; navigate('/', { replace: true }); } };
    const timer = window.setTimeout(go, 1500);
    api.marketingClick({ slug: slug.toLowerCase(), visitId, anonId: anonId(), utm, referrer: document.referrer || undefined, lang: navigator.language, landing: '/' })
      // визит запоминаем, только если сервер принял ссылку: переход по неизвестной ссылке не перетирает источник
      .then(() => saveMarketingVisit(visitId))
      .catch(() => undefined)
      .finally(() => { window.clearTimeout(timer); go(); });
  }, [key, search, slug, navigate]);
  return null;
}
