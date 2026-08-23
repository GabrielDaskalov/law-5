/**
 * Сглобяване за демонстрационния файл: всичко в един JS, без отделни
 * парчета. Така няма импорти между модули и целият сайт се побира в
 * един .html файл, който се отваря с двоен клик.
 */
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist-demo',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
});
