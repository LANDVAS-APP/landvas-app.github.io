// The LANDVAS portal: two small websites that are not part of the game or the mobile apps.
//   admin.landvas.app  →  PORTAL_APP=admin   (staff: everything about every player and every table)
//   my.landvas.app     →  PORTAL_APP=my      (players: everything about their own account)
// Dev:   PORTAL_APP=admin npx vite --config portal/vite.config.ts
// Build: PORTAL_APP=admin npx vite build --config portal/vite.config.ts --mode production   (→ dist/portal/admin)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const app = process.env.PORTAL_APP === 'my' ? 'my' : 'admin';
const repo = path.resolve(import.meta.dirname, '..');

export default defineConfig({
  root: path.resolve(import.meta.dirname, app),
  envDir: repo,
  base: '/',
  define: {
    __LANDVAS_BUILD__: JSON.stringify(process.env.LANDVAS_BUILD_ID || `portal-${Date.now().toString(36)}`),
    __LANDVAS_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  resolve: { alias: { '@': path.resolve(repo, 'src') } },
  plugins: [
    react(),
    tailwindcss(),
    // the game's service-worker hook is not used here
    { name: 'portal-no-pwa', resolveId: (id: string) => (id === 'virtual:pwa-register' ? '\0portal-no-pwa' : null), load: (id: string) => (id === '\0portal-no-pwa' ? 'export function registerSW() { return () => {}; }' : null) },
  ],
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  worker: { format: 'es' },
  build: {
    outDir: path.resolve(repo, 'dist/portal', app),
    emptyOutDir: true,
    target: ['es2020', 'safari15', 'chrome90', 'firefox90', 'edge90'],
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
    sourcemap: process.env.LANDVAS_SOURCEMAP === '1',
  },
  server: { host: true, fs: { allow: [repo] } },
});
