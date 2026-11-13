import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { transform } from 'esbuild';
import { FAQ } from './src/home/faq';

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
      // the FAQ rich result is generated from the same answers the homepage shows
      {
        name: 'landvas-faq-jsonld',
        transformIndexHtml(html: string) {
          const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
          return html.replace(/<script type="application\/ld\+json">\{"@context": "https:\/\/schema.org", "@type": "FAQPage"[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(ld)}</script>`);
        },
      },
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
      // the iOS / Android apps never contain the admin screens: in the native build anything under src/admin is an
      // empty module (App.tsx has no /admin page there either; see src/app/buildFlags.ts)
      mode === 'native' && {
        name: 'landvas-no-admin-in-apps',
        enforce: 'pre' as const,
        async resolveId(id: string, importer?: string) {
          if (!importer || !/(^|\/)admin\//.test(id)) return null;
          const r = await (this as any).resolve(id, importer, { skipSelf: true });
          return r && r.id.includes(`${path.sep}src${path.sep}admin${path.sep}`) ? '\0landvas-empty' : null;
        },
        load: (id: string) => (id === '\0landvas-empty' ? 'export default function Nothing() { return null; }' : null),
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
          registerType: 'prompt',
          injectRegister: false,
          includeAssets: ['favicon.svg', 'favicon.ico', 'favicon-*.png', 'icons/*.png'],
          manifest: {
            name: 'LANDVAS — Own a piece. Play it your way.',
            short_name: 'LANDVAS',
            description: 'The world-map game you play your way: claim plots, then paint, raise creatures, battle, explore and collect.',
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
            // a new deploy takes over once the app says so (it waits while someone is drawing)
            skipWaiting: false,
            clientsClaim: true,
            cleanupOutdatedCaches: true,
            globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
            // admin-only screen and non-Latin font subsets still load on demand, they just aren't
            // pre-downloaded onto every player's device
            globIgnores: ['**/pglite*', '**/LocalBackend-*.js', '**/*.wasm', '**/*.data', '**/places*.json', 'brand/**', 'og-image.png',
              '**/AdminScreen-*.js', '**/*-{cyrillic,cyrillic-ext,greek,vietnamese}-wght-*.woff2'],
            maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
            navigateFallback: 'index.html',
            runtimeCaching: [
              { urlPattern: /\.(?:wasm|data)$/, handler: 'CacheFirst',
                options: { cacheName: 'landvas-engine', expiration: { maxEntries: 4, purgeOnQuotaError: true } } },
              // artwork tiles: keep the recently seen ones on the device, not an ever-growing pile
              { urlPattern: /\/storage\/v1\/object\/public\/public-art\//, handler: 'CacheFirst',
                options: { cacheName: 'landvas-art', expiration: { maxEntries: 1200, maxAgeSeconds: 60 * 60 * 24 * 14, purgeOnQuotaError: true } } },
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
      // source maps double the deploy size and are never served to players; opt in for debugging
      sourcemap: process.env.LANDVAS_SOURCEMAP === '1',
    },
    server: { host: true },
  };
});
