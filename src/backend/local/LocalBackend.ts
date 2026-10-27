// LocalBackend — the full LANDVAS backend running inside the browser.
// The exact production migrations run on PGlite (Postgres compiled to WASM),
// RPCs execute under the `authenticated` role with RLS just like on Supabase,
// images live in IndexedDB, and the shared pipeline renders map tiles in-page.
import { PGlite } from '@electric-sql/pglite';
import shimSql from '../../../supabase/local/shim.sql?raw';
import overridesSql from '../../../supabase/local/local_overrides.sql?raw';
import { drainQueue, type BlobStore, type PipelineDeps } from '../../server/pipeline';
import { validateMinigame } from '../../shared/minigames';
import type { GameId } from '../../shared/minigames/types';
import { GameError, toGameError, type Backend, type Session } from '../backend';
import type { MapUpdate, MinigameFinish } from '../types';
import { BlobDb } from './blobs';
import { canvasCodec } from './codec-canvas';

const migrationFiles = import.meta.glob('../../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const SESSION_KEY = 'landvas.local.session';
const PIPELINE_RPCS = new Set([
  'submit_publication', 'admin_review_publication', 'admin_remove_publication', 'admin_restore_publication', 'admin_release_plot',
  'admin_retry_job', 'admin_set_review_mode', 'admin_approve_all_pending',
]);

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hashPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16)), iterations = 120_000) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(bits)}`;
}
async function verifyPassword(password: string, stored: string) {
  const [, iter, salt] = stored.split('$');
  return (await hashPassword(password, unb64(salt), Number(iter))) === stored;
}

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function writeSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable: session lives in memory only */
  }
}

export class LocalBackend implements Backend {
  readonly mode = 'local' as const;
  ephemeral = false;
  private db!: PGlite;
  private blobs = new BlobDb();
  private current: Session | null = null;
  private authListeners = new Set<(s: Session | null) => void>();
  private mapListeners = new Set<(u: MapUpdate) => void>();
  private lastUpdateId = 0;
  private urlCache = new Map<string, string>();
  private draining: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  async init() {
    await this.acquireTabLock();
    await this.blobs.open();
    try {
      this.db = await PGlite.create('idb://landvas-world-v1', { relaxedDurability: true });
    } catch {
      this.db = await PGlite.create();
      this.ephemeral = true;
    }
    this.ephemeral = this.ephemeral || this.blobs.ephemeral;
    await this.migrate();
    const s = readSession();
    if (s) {
      const ok = await this.db.query('select 1 from auth.users where id = $1', [s.userId]);
      this.current = ok.rows.length ? s : null;
    }
    const latest = await this.db.query<{ id: number }>('select coalesce(max(id), 0)::int as id from public.map_updates');
    this.lastUpdateId = latest.rows[0].id;
    this.timer = setInterval(() => void this.kickPipeline(), 8000);
    void this.kickPipeline();
  }

  /** IndexedDB-backed Postgres must have a single writer: one tab at a time. */
  private acquireTabLock(): Promise<void> {
    const locks = (navigator as any).locks;
    if (!locks?.request) return Promise.resolve();
    return new Promise((resolve, reject) => {
      locks
        .request('landvas-local-world', { ifAvailable: true }, (lock: unknown) => {
          if (!lock) {
            reject(new GameError('open_elsewhere'));
            return;
          }
          resolve();
          return new Promise(() => {}); // hold for the lifetime of the tab
        })
        .catch(reject);
    });
  }

  private async migrate() {
    await this.db.exec(`create schema if not exists local_meta;
      create table if not exists local_meta.migrations (name text primary key, applied_at timestamptz not null default now());`);
    const applied = new Set((await this.db.query<{ name: string }>('select name from local_meta.migrations')).rows.map((r) => r.name));
    const names = Object.keys(migrationFiles).sort();
    const pending = names.filter((n) => !applied.has(n.split('/').pop()!));
    if (pending.length) {
      await this.db.exec(shimSql);
      for (const path of pending) {
        const name = path.split('/').pop()!;
        const sql = migrationFiles[path];
        await this.db.transaction(async (tx) => {
          if (!sql.startsWith('-- @supabase-only')) await tx.exec(sql);
          await tx.query('insert into local_meta.migrations (name) values ($1)', [name]);
        });
      }
    }
    await this.db.exec(overridesSql);
  }

  // ---- auth -------------------------------------------------------------------

  session() {
    return this.current;
  }
  onAuthChange(cb: (s: Session | null) => void) {
    this.authListeners.add(cb);
    return () => void this.authListeners.delete(cb);
  }
  private setSession(s: Session | null) {
    this.current = s;
    writeSession(s);
    this.authListeners.forEach((cb) => cb(s));
  }
  async signUp(email: string, password: string) {
    email = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new GameError('invalid_email');
    if (password.length < 8) throw new GameError('weak_password');
    const exists = await this.db.query('select 1 from auth.users where email = $1', [email]);
    if (exists.rows.length) throw new GameError('email_taken');
    const hash = await hashPassword(password);
    const r = await this.db.query<{ id: string }>('insert into auth.users (email, encrypted_password) values ($1, $2) returning id', [email, hash]);
    this.setSession({ userId: r.rows[0].id, email });
    return { needsConfirmation: false };
  }
  async signIn(email: string, password: string) {
    email = email.trim().toLowerCase();
    const r = await this.db.query<{ id: string; encrypted_password: string }>('select id, encrypted_password from auth.users where email = $1', [email]);
    const row = r.rows[0];
    if (!row || !(await verifyPassword(password, row.encrypted_password))) throw new GameError('invalid_credentials');
    await this.db.query('update auth.users set last_sign_in_at = now() where id = $1', [row.id]);
    this.setSession({ userId: row.id, email });
  }
  async signOut() {
    this.setSession(null);
  }
  async localAccounts() {
    return (await this.db.query<{ email: string }>('select email from auth.users order by last_sign_in_at desc nulls last, created_at desc')).rows;
  }

  // ---- database ---------------------------------------------------------------

  async rpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!/^[a-z_][a-z0-9_]*$/.test(fn)) throw new GameError('invalid_function');
    const keys = Object.keys(args).filter((k) => args[k] !== undefined);
    const uid = this.current?.userId ?? '';
    const role = uid ? 'authenticated' : 'anon';
    try {
      const result = await this.db.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role })]);
        await tx.query(`set local role ${role}`);
        const r = await tx.query<{ r: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => args[k]));
        return r.rows[0]?.r as T;
      });
      if (PIPELINE_RPCS.has(fn)) void this.kickPipeline();
      void this.pollUpdates();
      return result;
    } catch (e) {
      throw toGameError(e);
    }
  }

  /** Service-level call (pipeline): runs as the database owner, like the worker's service role. */
  private async svc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const keys = Object.keys(args);
    const r = await this.db.query<{ r: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => args[k]));
    return r.rows[0]?.r as T;
  }

  // ---- storage ----------------------------------------------------------------

  private store: BlobStore = {
    get: (bucket, path) => this.blobs.get(`${bucket}/${path}`),
    put: (bucket, path, bytes) => this.blobs.put(`${bucket}/${path}`, bytes),
  };

  async uploadDraftTile(ownerId: string, hash: string, png: Blob) {
    const key = `drafts/${ownerId}/${hash}.png`;
    if (await this.blobs.has(key)) return;
    await this.blobs.put(key, new Uint8Array(await png.arrayBuffer()));
  }
  async downloadDraftTile(ownerId: string, hash: string) {
    const bytes = await this.blobs.get(`drafts/${ownerId}/${hash}.png`);
    return bytes ? new Blob([bytes as BlobPart], { type: 'image/png' }) : null;
  }
  async uploadSubmission(ownerId: string, publicationId: string, cellKey: string, png: Blob) {
    await this.blobs.put(`submissions/${ownerId}/${publicationId}/${cellKey}.png`, new Uint8Array(await png.arrayBuffer()));
  }
  private async objectUrl(key: string) {
    if (this.urlCache.has(key)) return this.urlCache.get(key)!;
    const bytes = await this.blobs.get(key);
    if (!bytes) return null;
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/png' }));
    this.urlCache.set(key, url);
    return url;
  }
  async publicAssetUrl(path: string | null | undefined) {
    return path ? this.objectUrl(`public-art/${path}`) : null;
  }
  async privateAssetUrl(bucketPath: string | null | undefined) {
    return bucketPath ? this.objectUrl(bucketPath) : null;
  }
  async artTile(z: number, x: number, y: number, rev: number) {
    const bytes = await this.blobs.get(`public-art/tiles/${z}/${x}/${y}/${rev}.png`);
    return bytes ? (bytes.slice().buffer as ArrayBuffer) : null;
  }

  // ---- pipeline, minigames, realtime --------------------------------------------

  private deps(): PipelineDeps {
    return { db: { call: (fn, args) => this.svc(fn, args ?? {}) }, store: this.store, codec: canvasCodec };
  }

  kickPipeline(): Promise<void> {
    if (!this.draining) {
      this.draining = (async () => {
        try {
          const n = await drainQueue(this.deps(), 'local-tab', 50);
          if (n > 0) await this.pollUpdates();
        } catch (e) {
          console.warn('[landvas] local pipeline error', e);
        } finally {
          this.draining = null;
        }
      })();
    }
    return this.draining;
  }

  async finishMinigame(sessionId: string, log: unknown): Promise<MinigameFinish> {
    const s = await this.svc<any>('svc_get_session', { p_session_id: sessionId });
    if (!s || s.player_id !== this.current?.userId) throw new GameError('session_not_found');
    if (s.status !== 'active') throw new GameError('session_closed');
    const verdict = validateMinigame(s.game as GameId, Number(s.seed), s.level, log);
    try {
      const res = await this.svc<MinigameFinish>('svc_finish_minigame', { p_session_id: sessionId, p_result: verdict });
      void this.pollUpdates();
      return { ...res, summary: verdict.summary };
    } catch (e) {
      throw toGameError(e);
    }
  }

  private polling: Promise<void> | null = null;
  private pollUpdates(): Promise<void> {
    if (!this.mapListeners.size) return Promise.resolve();
    this.polling = (this.polling ?? Promise.resolve()).then(() => this.pollOnce()).catch(() => {});
    return this.polling;
  }
  private async pollOnce() {
    if (!this.mapListeners.size) return;
    const r = await this.svc<{ latest_id: number; updates: MapUpdate[] }>('map_updates_since', { p_since_id: this.lastUpdateId });
    for (const u of r.updates) {
      this.lastUpdateId = Math.max(this.lastUpdateId, u.id);
      this.mapListeners.forEach((cb) => cb(u));
    }
  }

  subscribeMapUpdates(cb: (u: MapUpdate) => void) {
    this.mapListeners.add(cb);
    void this.pollUpdates();
    return () => void this.mapListeners.delete(cb);
  }

  async resetLocalData() {
    if (this.timer) clearInterval(this.timer);
    writeSession(null);
    await this.db.close().catch(() => {});
    await BlobDb.destroy();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('/pglite/landvas-world-v1');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  }
}
