import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE задаётся в CI для GitHub Pages: /morozov-collection/
// Две точки входа: index.html — v1 (эпизоды по QR), collector.html — v2 «Коллекционер» (десктоп)
export default defineConfig({
  base: process.env.BASE ?? '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      input: {
        main: new URL('./index.html', import.meta.url).pathname,
        collector: new URL('./collector.html', import.meta.url).pathname,
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      workbox: {
        // Все эпизоды кэшируются при первом скане QR — в зале может не быть сети
        globPatterns: ['**/*.{js,css,html,webp,glb,png,svg}'],
        // v2 тяжёлая и десктопная: посетитель зала не должен скачивать её вместе с v1
        globIgnores: ['collector.html', 'collector/**', 'assets/collector-*'],
        navigateFallbackDenylist: [/collector/],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'Коллекция Морозова',
        short_name: 'Морозов',
        lang: 'ru',
        display: 'standalone',
        background_color: '#1d1a17',
        theme_color: '#1d1a17',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
    {
      // PWA — только для v1: v2 не ставит сервис-воркер и не скачивает офлайн-кэш зала.
      // Стоит после VitePWA, чтобы срабатывать после его вставки в HTML
      name: 'collector-without-pwa',
      enforce: 'post',
      transformIndexHtml: {
        order: 'post',
        handler: (html, ctx) =>
          ctx.filename.endsWith('collector.html')
            ? html
                .replace(/<link rel="manifest"[^>]*>/, '')
                .replace(/<script id="vite-plugin-pwa:register-sw"[^>]*><\/script>/, '')
            : html,
      },
    },
  ],
});
