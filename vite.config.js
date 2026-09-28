import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { devTools } from './scripts/dev-tools-plugin.js';

export default defineConfig({
  // Relative base so the build works at https://<user>.github.io/breath/ (or any sub-path).
  base: './',
  plugins: [
    tailwindcss(),
    devTools(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/*.svg', 'icons/*.png', 'audio/manifest.json'],
      manifest: {
        name: 'Breath — calm the mind',
        short_name: 'Breath',
        description: 'Guided breathing, soundscapes and gentle trance. Works fully offline.',
        theme_color: '#05060f',
        background_color: '#05060f',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        categories: ['health', 'lifestyle', 'music'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // App shell is precached. Audio is cached on demand (and via "Save for offline").
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}', 'audio/manifest.json'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/audio/') && url.pathname.endsWith('.mp3'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'breath-media',
              rangeRequests: true,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/audio/manifest.json'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'breath-manifest' },
          },
        ],
      },
    }),
  ],
  server: {
    // The studio writes generated audio here; don't full-reload the page on every save.
    watch: { ignored: ['**/public/audio/**'] },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      // The /dev tool is dev-server only and never shipped.
      input: { main: 'index.html' },
    },
  },
});
