// LANDVAS worker: publication/tile pipeline + minigame validation API.
//   DATABASE_URL               Postgres connection (Supabase: direct or pooler, session mode)
//   SUPABASE_URL               https://<project>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  service role key (server only — never ship to clients)
//   PORT                       HTTP port (default 8787)
//   ALLOWED_ORIGINS            comma separated origins for CORS (e.g. https://landvas.app)
//   SCREENING_PROVIDER         none | openai   (OPENAI_API_KEY when openai)
//   POLL_MS                    job poll interval (default 1500)
import os from 'node:os';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { drainQueue } from '../src/server/pipeline';
import { sharpCodec } from './codec-sharp';
import { pgDb } from './db-pg';
import { createApi } from './http';
import { screenerFromEnv } from './screeners';
import { supabaseStore } from './storage-supabase';
import { fsStore } from './storage-fs';

const env = process.env;
const required = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((k) => !env[k]);
if (missing.length && env.LANDVAS_STORAGE !== 'fs') {
  console.error(`[worker] missing configuration: ${missing.join(', ')}. See docs/DEPLOYMENT.md.`);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 6 });
const db = pgDb(pool);
const supabase = env.SUPABASE_URL ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) : null;
const store = env.LANDVAS_STORAGE === 'fs' ? fsStore(env.LANDVAS_STORAGE_DIR ?? './.storage') : supabaseStore(supabase!);
const workerId = `${os.hostname()}:${process.pid}`;
const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));
const deps = { db, store, codec: sharpCodec, screener: screenerFromEnv(env), log, withPyramidLock: db.withPyramidLock };

let running = true;
let lastHousekeeping = 0;
async function loop() {
  while (running) {
    try {
      const n = await drainQueue(deps, workerId, 25);
      if (Date.now() - lastHousekeeping > 10 * 60_000) {
        lastHousekeeping = Date.now();
        log('housekeeping', await db.call('svc_housekeeping'));
      }
      if (n === 0) await new Promise((r) => setTimeout(r, Number(env.POLL_MS ?? 1500)));
    } catch (e) {
      log('loop.error', { error: (e as Error).message });
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

const api = createApi({
  db,
  allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  verify: async (token) => {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  },
  health: async () => ({ ok: true, worker: workerId, time: new Date().toISOString() }),
});
api.listen(Number(env.PORT ?? 8787), () => log('worker.listening', { port: Number(env.PORT ?? 8787), workerId }));
loop();

for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, async () => {
    running = false;
    api.close();
    await pool.end();
    process.exit(0);
  });
