/**
 * Генератор обложек Piano Lab (SVG). Запуск из frontend: ../backend/node_modules/.bin/tsx scripts/make-covers.ts
 * Песни → public/covers/songs/<id>.svg, ноты (backend/content/scores.json) → public/covers/scores/<id>.svg.
 * Для новой песни/нот добавьте тему в THEMES (иначе тема подберётся автоматически) и перезапустите.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { SONGS } from '../src/data/songs.ts';

type Motif = 'stars' | 'clouds' | 'sun' | 'snow' | 'moon' | 'waves' | 'petals' | 'flame' | 'galaxy' | 'leaves';
interface Theme { from: string; to: string; accent: string; glow: string; motif: Motif; dark?: boolean }

// Тема под настроение произведения
const THEMES: Record<string, Theme> = {
  'interstellar': { from: '#020617', to: '#1e3a8a', accent: '#93c5fd', glow: '#60a5fa', motif: 'galaxy' },
  'nuvole-bianche': { from: '#64748b', to: '#e2e8f0', accent: '#ffffff', glow: '#f8fafc', motif: 'clouds' },
  'ode-to-joy': { from: '#f59e0b', to: '#db2777', accent: '#fef3c7', glow: '#fde68a', motif: 'sun' },
  'twinkle': { from: '#1e1b4b', to: '#6d28d9', accent: '#fde047', glow: '#fef08a', motif: 'stars' },
  'jingle': { from: '#7f1d1d', to: '#dc2626', accent: '#ffffff', glow: '#fecaca', motif: 'snow' },
  'fur-elise': { from: '#831843', to: '#f472b6', accent: '#fce7f3', glow: '#fbcfe8', motif: 'petals' },
  'moonlight': { from: '#0b1023', to: '#334155', accent: '#f1f5f9', glow: '#cbd5e1', motif: 'moon' },
  'river-flows': { from: '#064e3b', to: '#14b8a6', accent: '#ccfbf1', glow: '#99f6e4', motif: 'waves' },
  'clair-de-lune': { from: '#2e1065', to: '#a78bfa', accent: '#f5f3ff', glow: '#ddd6fe', motif: 'moon' },
  'liebestraum': { from: '#3b0711', to: '#be123c', accent: '#ffe4e6', glow: '#fda4af', motif: 'flame' },
  // ноты
  'twinkle-twinkle': { from: '#1e1b4b', to: '#6d28d9', accent: '#fde047', glow: '#fef08a', motif: 'stars' },
  'jingle-bells': { from: '#7f1d1d', to: '#dc2626', accent: '#ffffff', glow: '#fecaca', motif: 'snow' },
  'minuet-in-g': { from: '#14532d', to: '#a3a35a', accent: '#fefce8', glow: '#fef9c3', motif: 'leaves' },
  'moonlight-sonata': { from: '#0b1023', to: '#334155', accent: '#f1f5f9', glow: '#cbd5e1', motif: 'moon' },
};
const FALLBACK: Theme[] = [
  { from: '#312e81', to: '#7c3aed', accent: '#ede9fe', glow: '#c4b5fd', motif: 'stars' },
  { from: '#0c4a6e', to: '#0ea5e9', accent: '#e0f2fe', glow: '#7dd3fc', motif: 'waves' },
  { from: '#78350f', to: '#f59e0b', accent: '#fef3c7', glow: '#fde68a', motif: 'sun' },
  { from: '#4c0519', to: '#e11d48', accent: '#ffe4e6', glow: '#fda4af', motif: 'petals' },
];

const S = 600;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
/** детерминированный «случайный» генератор — обложка не меняется при каждом запуске */
const rng = (seed: string) => { let x = hash(seed) || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; }; };
const r1 = (n: number) => Math.round(n * 10) / 10;

function motif(t: Theme, id: string): string {
  const r = rng(id + t.motif);
  const out: string[] = [];
  switch (t.motif) {
    case 'stars': case 'galaxy': {
      if (t.motif === 'galaxy') out.push(`<ellipse cx="380" cy="230" rx="260" ry="70" transform="rotate(-24 380 230)" fill="url(#halo)" opacity=".55"/>`);
      for (let i = 0; i < 70; i++) out.push(`<circle cx="${r1(r() * S)}" cy="${r1(r() * S * 0.72)}" r="${r1(0.6 + r() * 1.8)}" fill="${t.accent}" opacity="${r1(0.25 + r() * 0.7)}"/>`);
      for (let i = 0; i < 4; i++) { const x = 60 + r() * 480, y = 40 + r() * 280, k = 10 + r() * 14; out.push(`<path d="M${r1(x)} ${r1(y - k)} L${r1(x + k * .22)} ${r1(y - k * .22)} L${r1(x + k)} ${r1(y)} L${r1(x + k * .22)} ${r1(y + k * .22)} L${r1(x)} ${r1(y + k)} L${r1(x - k * .22)} ${r1(y + k * .22)} L${r1(x - k)} ${r1(y)} L${r1(x - k * .22)} ${r1(y - k * .22)}Z" fill="${t.accent}" filter="url(#soft)"/>`); }
      break;
    }
    case 'moon':
      out.push(`<circle cx="430" cy="150" r="120" fill="url(#halo)" opacity=".8"/><circle cx="430" cy="150" r="62" fill="${t.accent}"/><circle cx="452" cy="138" r="56" fill="url(#bg)" opacity=".92"/>`);
      for (let i = 0; i < 40; i++) out.push(`<circle cx="${r1(r() * S)}" cy="${r1(r() * 320)}" r="${r1(0.5 + r() * 1.3)}" fill="${t.accent}" opacity="${r1(0.2 + r() * 0.6)}"/>`);
      break;
    case 'sun':
      out.push(`<circle cx="440" cy="170" r="190" fill="url(#halo)" opacity=".75"/><circle cx="440" cy="170" r="70" fill="${t.accent}" opacity=".95"/>`);
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; out.push(`<line x1="${r1(440 + Math.cos(a) * 92)}" y1="${r1(170 + Math.sin(a) * 92)}" x2="${r1(440 + Math.cos(a) * 128)}" y2="${r1(170 + Math.sin(a) * 128)}" stroke="${t.accent}" stroke-width="5" stroke-linecap="round" opacity=".7"/>`); }
      break;
    case 'clouds':
      for (let i = 0; i < 6; i++) { const x = r() * 560, y = 60 + r() * 260, w = 90 + r() * 120; out.push(`<g opacity="${r1(0.35 + r() * 0.45)}" filter="url(#soft)"><ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(w)}" ry="${r1(w * .32)}" fill="${t.accent}"/><ellipse cx="${r1(x - w * .35)}" cy="${r1(y - w * .18)}" rx="${r1(w * .45)}" ry="${r1(w * .3)}" fill="${t.accent}"/><ellipse cx="${r1(x + w * .25)}" cy="${r1(y - w * .25)}" rx="${r1(w * .5)}" ry="${r1(w * .35)}" fill="${t.accent}"/></g>`); }
      break;
    case 'snow':
      for (let i = 0; i < 26; i++) { const x = r() * S, y = r() * 380, k = 4 + r() * 10, o = r1(0.35 + r() * 0.6); out.push(`<g stroke="${t.accent}" stroke-width="${r1(1 + k / 8)}" stroke-linecap="round" opacity="${o}">${[0, 60, 120].map((a) => `<line x1="${r1(x - k)}" y1="${r1(y)}" x2="${r1(x + k)}" y2="${r1(y)}" transform="rotate(${a} ${r1(x)} ${r1(y)})"/>`).join('')}</g>`); }
      out.push(`<path d="M0 420 Q150 380 300 410 T600 395 V600 H0Z" fill="${t.accent}" opacity=".12"/>`);
      break;
    case 'waves':
      for (let i = 0; i < 7; i++) { const y = 120 + i * 42; out.push(`<path d="M-20 ${y} C 100 ${y - 34}, 200 ${y + 34}, 320 ${y} S 520 ${y - 34}, 640 ${y}" fill="none" stroke="${t.accent}" stroke-width="${r1(1.5 + i * .35)}" opacity="${r1(0.18 + i * 0.07)}"/>`); }
      break;
    case 'petals':
      for (let i = 0; i < 16; i++) { const x = r() * S, y = r() * 380, k = 10 + r() * 18, a = r() * 180; out.push(`<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(k)}" ry="${r1(k * .45)}" transform="rotate(${r1(a)} ${r1(x)} ${r1(y)})" fill="${t.accent}" opacity="${r1(0.25 + r() * 0.5)}"/>`); }
      break;
    case 'flame':
      out.push(`<circle cx="300" cy="230" r="230" fill="url(#halo)" opacity=".6"/>`);
      for (let i = 0; i < 3; i++) out.push(`<path d="M${300 - 60 + i * 60} 360 C ${230 + i * 60} 280, ${330 + i * 30} 230, ${290 + i * 40} ${120 + i * 20} C ${360 + i * 30} 210, ${380 + i * 20} 290, ${330 + i * 40} 360 Z" fill="${t.accent}" opacity="${0.18 + i * 0.1}" filter="url(#soft)"/>`);
      break;
    case 'leaves':
      for (let i = 0; i < 14; i++) { const x = r() * S, y = r() * 380, k = 12 + r() * 16, a = r() * 360; out.push(`<path d="M${r1(x)} ${r1(y - k)} Q ${r1(x + k)} ${r1(y)} ${r1(x)} ${r1(y + k)} Q ${r1(x - k)} ${r1(y)} ${r1(x)} ${r1(y - k)}Z" transform="rotate(${r1(a)} ${r1(x)} ${r1(y)})" fill="${t.accent}" opacity="${r1(0.2 + r() * 0.45)}"/>`); }
      break;
  }
  return out.join('');
}

/** Мелодия как светящаяся линия: высота ноты → высота точки. */
const NOTE: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function melody(notes: string[], t: Theme): string {
  const vals = notes.map((n) => { const m = /^([A-G]#?)(\d)$/.exec(n); return m ? Number(m[2]) * 12 + NOTE[m[1]] : NaN; }).filter((v) => !Number.isNaN(v));
  if (vals.length < 3) return '';
  const lo = Math.min(...vals), hi = Math.max(...vals), span = Math.max(4, hi - lo);
  const pts = vals.map((v, i) => [60 + (i / (vals.length - 1)) * 480, 330 - ((v - lo) / span) * 140]);
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {   // сглаживание (Catmull-Rom → Безье)
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    d += ` C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)}, ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)}, ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return `<path d="${d}" fill="none" stroke="${t.glow}" stroke-width="10" stroke-linecap="round" opacity=".25" filter="url(#soft)"/>`
    + `<path d="${d}" fill="none" stroke="${t.accent}" stroke-width="3" stroke-linecap="round" opacity=".9"/>`
    + pts.map(([x, y]) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="6" fill="${t.accent}"/><circle cx="${r1(x)}" cy="${r1(y)}" r="12" fill="${t.accent}" opacity=".18"/>`).join('');
}

/** Нотный стан с несколькими нотами — для обложек раздела «Ноты». */
function staff(t: Theme, id: string): string {
  const r = rng(id + 'staff');
  const y0 = 250;
  const lines = Array.from({ length: 5 }, (_, i) => `<line x1="40" x2="560" y1="${y0 + i * 18}" y2="${y0 + i * 18}" stroke="${t.accent}" stroke-width="2" opacity=".55"/>`).join('');
  const notes = Array.from({ length: 7 }, (_, i) => {
    const x = 130 + i * 60, y = y0 - 9 + Math.round(r() * 8) * 9;
    return `<g fill="${t.accent}"><ellipse cx="${x}" cy="${y}" rx="11" ry="8" transform="rotate(-20 ${x} ${y})"/><rect x="${x + 8}" y="${y - 56}" width="3" height="56"/></g>`;
  }).join('');
  // скрипичный ключ стилизованно
  const clef = `<path d="M78 330 C 60 300, 100 270, 96 236 C 92 210, 70 214, 74 236 C 78 268, 120 280, 112 312 C 106 338, 72 332, 74 312" fill="none" stroke="${t.accent}" stroke-width="4" stroke-linecap="round" opacity=".9"/>`;
  return `<g opacity=".95">${lines}${clef}${notes}</g>`;
}

/** Перенос названия по словам: до 3 строк. */
function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/); const lines: string[] = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  if (lines.length > 3) { lines.length = 3; lines[2] = lines[2].replace(/.{0,2}$/, '…'); }
  return lines;
}

function cover({ id, title, artist, kind, notes }: { id: string; title: string; artist: string; kind: 'song' | 'score'; notes?: string[] }) {
  const t = THEMES[id] ?? FALLBACK[hash(id) % FALLBACK.length];
  const lines = wrap(title, title.length > 26 ? 15 : 14);
  const fs = lines.length > 2 ? 46 : 54;
  const ty = S - 70 - (lines.length - 1) * (fs + 4) - 40;
  const art = kind === 'score' ? staff(t, id) : (notes && notes.length >= 3 ? melody(notes, t) : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" aria-label="${esc(title)} — ${esc(artist)}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.from}"/><stop offset="1" stop-color="${t.to}"/></linearGradient>
  <radialGradient id="halo"><stop offset="0" stop-color="${t.glow}" stop-opacity=".9"/><stop offset="1" stop-color="${t.glow}" stop-opacity="0"/></radialGradient>
  <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .07 0"/></filter>
</defs>
<rect width="${S}" height="${S}" fill="url(#bg)"/>
${motif(t, id)}
${art}
<rect width="${S}" height="${S}" fill="url(#shade)"/>
<rect width="${S}" height="${S}" filter="url(#grain)"/>
<g transform="translate(40 40)">
  <rect width="34" height="22" rx="4" fill="#fff" opacity=".95"/>
  <rect x="7" y="0" width="5" height="13" fill="#111"/><rect x="15" y="0" width="5" height="13" fill="#111"/><rect x="25" y="0" width="5" height="13" fill="#111"/>
  <text x="44" y="17" font-family="Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="18" font-weight="800" letter-spacing="1.5" fill="#fff" opacity=".95">PIANO LAB</text>
</g>
${kind === 'score' ? `<g transform="translate(${S - 40} 40)"><rect x="-86" y="-2" width="86" height="28" rx="14" fill="#fff" opacity=".18"/><text x="-43" y="17" text-anchor="middle" font-family="Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="2" fill="#fff">НОТЫ</text></g>` : ''}
<g font-family="Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" fill="#fff">
${lines.map((l, i) => `  <text x="40" y="${ty + i * (fs + 4)}" font-size="${fs}" font-weight="800" letter-spacing="-1">${esc(l)}</text>`).join('\n')}
  <text x="40" y="${ty + (lines.length - 1) * (fs + 4) + 44}" font-size="24" font-weight="500" opacity=".82">${esc(artist)}</text>
</g>
</svg>
`;
}

const root = new URL('../public/covers/', import.meta.url);
mkdirSync(new URL('songs/', root), { recursive: true });
mkdirSync(new URL('scores/', root), { recursive: true });
for (const s of SONGS) writeFileSync(new URL(`songs/${s.id}.svg`, root), cover({ id: s.id, title: s.title, artist: s.artist, kind: 'song', notes: s.notes }));
const scores = JSON.parse(readFileSync(new URL('../../backend/content/scores.json', import.meta.url), 'utf8')) as { id: string; title: string; composer: string }[];
for (const s of scores) writeFileSync(new URL(`scores/${s.id}.svg`, root), cover({ id: s.id, title: s.title, artist: s.composer.replace(/\s*\(.*\)$/, ''), kind: 'score' }));
console.log(`Обложки: песен ${SONGS.length}, нот ${scores.length}`);
