// Склеивает dist-preview в один piano-preview.html (JS и CSS внутри файла).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const dir = 'dist-preview';
let html = readFileSync(`${dir}/index.html`, 'utf8');
const assets = readdirSync(`${dir}/assets`);
const css = readFileSync(`${dir}/assets/${assets.find((f) => f.endsWith('.css'))}`, 'utf8');
const js = readFileSync(`${dir}/assets/${assets.find((f) => f.endsWith('.js'))}`, 'utf8').replaceAll('</script', '<\\/script');
const icon = 'data:image/svg+xml,' + encodeURIComponent(readFileSync('public/favicon.svg', 'utf8'));
html = html
  .replace(/<link rel="stylesheet"[^>]*>/, '')
  .replace(/<script type="module"[^>]*><\/script>/, '')
  .replace(/\s*<link rel="(?:icon|shortcut icon|apple-touch-icon|manifest)"[^>]*>/g, '')
  .replace('</head>', () => `<link rel="icon" href="${icon}" />\n</head>`)
  .replace(/<script src="\/config\.js"><\/script>\s*/, '')
  .replace(/.*__SITE_URL__.*\n/g, '')
  .replace('</head>', () => `<style>${css}</style>\n</head>`)
  .replace('</body>', () => `<script type="module">${js}</script>\n</body>`);
writeFileSync('piano-preview.html', html);
console.log('piano-preview.html', (html.length / 1024).toFixed(0) + ' KB');
