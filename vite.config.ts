import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Статический фронт: адрес сайта для Open Graph подставляется при сборке (VITE_SITE_URL).
// Если переменная не задана, заглушку заменит сервер Express при отдаче страницы.
const siteUrl = (): Plugin => ({
  name: 'site-url',
  transformIndexHtml: (html) => (process.env.VITE_SITE_URL ? html.replaceAll('__SITE_URL__', process.env.VITE_SITE_URL.replace(/\/$/, '')) : html),
});

export default defineConfig({
  plugins: [react(), siteUrl()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
  preview: { proxy: { '/api': 'http://localhost:3001' } },
});
