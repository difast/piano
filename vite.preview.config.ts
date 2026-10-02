import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Автономная демо-сборка: один JS-чанк, мок-API внутри, роутинг через #.
export default defineConfig({
  plugins: [react()],
  base: './',
  define: { 'import.meta.env.VITE_PREVIEW': '"1"' },
  publicDir: false,
  build: { outDir: 'dist-preview', emptyOutDir: true, rollupOptions: { output: { inlineDynamicImports: true } } },
});
