import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE задаётся в CI для GitHub Pages: /morozov-collection/
export default defineConfig({
  base: process.env.BASE ?? '/',
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      workbox: {
        // Все эпизоды кэшируются при первом скане QR — в зале может не быть сети
        globPatterns: ['**/*.{js,css,html,webp,glb,png,svg}'],
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
  ],
});
