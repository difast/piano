import { useEffect } from 'react';

const SITE = 'Пианино с нуля';

function setMeta(selector: string, attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.content = value;
}

/** Title и description страницы (и Open Graph). */
export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    const full = title === SITE ? title : `${title} — ${SITE}`;
    document.title = full;
    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[property="og:title"]', 'property', 'og:title', full);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
  }, [title, description]);
}
