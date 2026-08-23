/**
 * Сглобяване на сайта.
 *
 * Преди: един файл от 13 MB, който всеки посетител сваля целия.
 * Сега: малък HTML + хеширани файлове, които се кешират от браузъра, и
 * учебното съдържание идва от API-то според това какво е купено.
 */
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    // В разработка /api се препраща към локалния backend, за да няма CORS.
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY ?? 'http://localhost:3000', changeOrigin: true },
      '/health': { target: process.env.VITE_API_PROXY ?? 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    // НЕ 'true' в production: публикуваните .js.map връщат целия четим
    // сорс (включително коментарите и логиката на плащанията) на всеки,
    // който отвори DevTools. Ако ти трябват source maps за Sentry и
    // подобни, ползвай 'hidden' — файловете се генерират, но браузърът
    // не е упътен към тях, и НЕ ги качвай на сървъра.
    sourcemap: false,
    minify: 'terser',
    // Прагът алармира, ако бъндълът тръгне да расте отново.
    chunkSizeWarningLimit: 500,
  },
});
