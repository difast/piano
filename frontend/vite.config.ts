import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Адрес сайта для Open Graph подставляется при сборке (VITE_SITE_URL, например https://app.example.ru).
// Если не задан — ссылки в метатегах будут относительными.
const siteUrl = (): Plugin => ({
  name: 'site-url',
  transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', (process.env.VITE_SITE_URL ?? '').replace(/\/$/, '')),
});

export default defineConfig({
  plugins: [react(), siteUrl()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
  preview: { proxy: { '/api': 'http://localhost:3001' } },
});
