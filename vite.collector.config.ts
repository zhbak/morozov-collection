import { defineConfig } from 'vite';

// v2 «Коллекционер»: вторая сборка в тот же dist после v1 (npm run build).
// public/ уже скопирован сборкой v1, PWA здесь нет — сервис-воркер v1 исключает collector из precache.
export default defineConfig({
  base: process.env.BASE ?? '/',
  publicDir: false,
  build: {
    target: 'es2022',
    emptyOutDir: false,
    chunkSizeWarningLimit: 6000,
    rolldownOptions: {
      input: { collector: new URL('./collector.html', import.meta.url).pathname },
      output: {
        entryFileNames: 'assets/collector-[hash].js',
        chunkFileNames: 'assets/collector-[name]-[hash].js',
        assetFileNames: 'assets/collector-[name]-[hash][extname]',
      },
    },
  },
});
