// Runtime configuration from Vite env (see .env.example).
const e = import.meta.env;

export const config = {
  backend: (e.VITE_BACKEND === 'supabase' && e.VITE_SUPABASE_URL && e.VITE_SUPABASE_ANON_KEY ? 'supabase' : 'local') as 'local' | 'supabase',
  supabaseUrl: (e.VITE_SUPABASE_URL as string) || '',
  supabaseAnonKey: (e.VITE_SUPABASE_ANON_KEY as string) || '',
  workerUrl: ((e.VITE_WORKER_URL as string) || '').replace(/\/$/, ''),
  mapStyleUrl: (e.VITE_MAP_STYLE_URL as string) || '',
  /** TileJSON of OpenMapTiles-schema vector tiles for streets & buildings (e.g. OpenFreeMap). */
  streets: (e.VITE_STREETS as string) || '',
  router: ((e.VITE_ROUTER as string) || 'browser') as 'browser' | 'hash' | 'memory',
  defaultTheme: ((e.VITE_DEFAULT_THEME as string) || 'dark') as 'dark' | 'light' | 'system',
  fonts: ((e.VITE_FONTS as string) || 'self') as 'self' | 'google',
  serviceWorker: e.VITE_SW !== 'off' && e.MODE !== 'artifact',
  supportEmail: (e.VITE_SUPPORT_EMAIL as string) || 'support@example.com',
  isArtifact: e.MODE === 'artifact',
  e2e: typeof location !== 'undefined' && /[?&]e2e=1/.test(location.search),
};

export type AppConfig = typeof config;
