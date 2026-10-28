import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { transform } from 'esbuild';

/** Browsers we support: iOS/Safari 15+, Chrome/Edge 90+, Firefox 90+. */
const LEGACY_TARGET = ['es2020', 'safari15', 'chrome90', 'firefox90', 'edge90'];

// Modes:
//   (default)  production web app / PWA (Supabase backend when configured)
//   artifact   self-contained playable build (local PGlite backend, memory router, no service worker)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const artifact = mode === 'artifact';
  const pwa = !artifact && env.VITE_SW !== 'off';
  // identifies this build; the running app compares it with /version.json to self-update
  const buildId = process.env.LANDVAS_BUILD_ID || `dev-${Date.now().toString(36)}`;
  return {
    base: artifact ? './' : '/',
    define: { __LANDVAS_BUILD__: JSON.stringify(buildId), __LANDVAS_BUILT_AT__: JSON.stringify(new Date().toISOString()) },
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    plugins: [
      // the map's web worker is copied as a ready-made file, so lower its syntax too
      // (class static blocks break Safari before 16.4, e.g. iOS 16.1)
      {
        name: 'landvas-legacy-worker',
        async generateBundle(_: unknown, bundle: Record<string, any>) {
          for (const f of Object.values(bundle)) {
            if (f.type === 'asset' && /maplibre-gl-worker.*\.m?js$/.test(f.fileName)) {
              const code = typeof f.source === 'string' ? f.source : Buffer.from(f.source).toString('utf8');
              f.source = (await transform(code, { target: LEGACY_TARGET, format: 'esm', loader: 'js' })).code;
            }
          }
        },
      },
      react(),
      tailwindcss(),
      // without the PWA plugin, provide an inert service-worker registration module
      !pwa && {
        name: 'landvas-no-pwa',
        resolveId: (id: string) => (id === 'virtual:pwa-register' ? '\0landvas-no-pwa' : null),
        load: (id: string) => (id === '\0landvas-no-pwa' ? 'export function registerSW() { return () => {}; }' : null),
      },
      pwa &&
        VitePWA({
          registerType: 'autoUpdate',
          injectRegister: false,
          includeAssets: ['favicon.svg', 'icons/*.png'],
          manifest: {
            name: 'LANDVAS — Own a piece. Paint the world.',
            short_name: 'LANDVAS',
            description: 'Claim virtual plots on a world map, fuse them into continuous canvases and paint murals everyone can see.',
            theme_color: '#0A0F24',
            background_color: '#070B1C',
            display: 'standalone',
            orientation: 'any',
            start_url: '/world',
            scope: '/',
            categories: ['games', 'entertainment', 'art'],
            icons: [
              { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          workbox: {
            // a new deploy takes over open tabs right away (the app reloads itself once)
            skipWaiting: true,
            clientsClaim: true,
            cleanupOutdatedCaches: true,
            globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
            globIgnores: ['**/pglite*', '**/*.wasm', '**/*.data', '**/places*.json', 'brand/**', 'og-image.png'],
            maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
            navigateFallback: 'index.html',
            runtimeCaching: [
              { urlPattern: /\.(?:wasm|data)$/, handler: 'CacheFirst', options: { cacheName: 'landvas-engine' } },
              { urlPattern: /\/storage\/v1\/object\/public\/public-art\//, handler: 'CacheFirst',
                options: { cacheName: 'landvas-art', expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 30 } } },
            ],
          },
        }),
    ].filter(Boolean),
    optimizeDeps: { exclude: ['@electric-sql/pglite'] },
    worker: { format: 'es' },
    build: {
      // iOS 15+ Safari, older Android Chrome: modern syntax (class static blocks, etc.) is lowered
      target: LEGACY_TARGET,
      outDir: artifact ? 'dist-artifact' : 'dist',
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 2500,
      sourcemap: !artifact,
    },
    server: { host: true },
  };
});
