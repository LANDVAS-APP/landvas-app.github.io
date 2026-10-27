// SupabaseBackend — production multiplayer backend.
//  * Auth: Supabase Auth (email + password, magic links; add OAuth providers in the dashboard)
//  * Game state: Postgres RPCs (SECURITY DEFINER) through PostgREST
//  * Storage: drafts/submissions (private, RLS by user folder), public-art (CDN)
//  * Realtime: postgres_changes on public.map_updates, with polling fallback
//  * Minigame validation: LANDVAS worker HTTP API (never trusts client scores)
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../env';
import { GameError, toGameError, type Backend, type Session } from '../backend';
import type { MapUpdate, MinigameFinish } from '../types';

export class SupabaseBackend implements Backend {
  readonly mode = 'supabase' as const;
  readonly ephemeral = false;
  private sb: SupabaseClient;
  private current: Session | null = null;
  private listeners = new Set<(s: Session | null) => void>();
  private signedCache = new Map<string, { url: string; at: number }>();

  constructor() {
    this.sb = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }

  async init() {
    const { data } = await this.sb.auth.getSession();
    this.current = data.session ? { userId: data.session.user.id, email: data.session.user.email ?? null } : null;
    this.sb.auth.onAuthStateChange((_e, s) => {
      const next = s ? { userId: s.user.id, email: s.user.email ?? null } : null;
      if (next?.userId === this.current?.userId) return;
      this.current = next;
      this.listeners.forEach((cb) => cb(next));
    });
  }

  session() {
    return this.current;
  }
  onAuthChange(cb: (s: Session | null) => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
  async signUp(email: string, password: string) {
    const { data, error } = await this.sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
    if (error) throw new GameError(error.message.includes('registered') ? 'email_taken' : 'auth_error', error.message);
    return { needsConfirmation: !data.session };
  }
  async signIn(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new GameError('invalid_credentials', error.message);
  }
  async sendMagicLink(email: string) {
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    if (error) throw new GameError('auth_error', error.message);
  }
  async signOut() {
    await this.sb.auth.signOut();
  }

  async rpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const clean = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
    const { data, error } = await this.sb.rpc(fn, clean);
    if (error) throw toGameError({ message: error.message, detail: error.details });
    return data as T;
  }

  async uploadDraftTile(ownerId: string, hash: string, png: Blob) {
    const { error } = await this.sb.storage.from('drafts').upload(`${ownerId}/${hash}.png`, png, { contentType: 'image/png', upsert: false });
    if (error && !/exists|Duplicate|409/i.test(error.message)) throw new GameError('upload_failed', error.message);
  }
  async downloadDraftTile(ownerId: string, hash: string) {
    const { data, error } = await this.sb.storage.from('drafts').download(`${ownerId}/${hash}.png`);
    return error ? null : data;
  }
  async uploadSubmission(ownerId: string, publicationId: string, cellKey: string, png: Blob) {
    const { error } = await this.sb.storage.from('submissions').upload(`${ownerId}/${publicationId}/${cellKey}.png`, png, { contentType: 'image/png', upsert: true });
    if (error) throw new GameError('upload_failed', error.message);
  }
  async publicAssetUrl(path: string | null | undefined) {
    return path ? `${config.supabaseUrl}/storage/v1/object/public/public-art/${path}` : null;
  }
  async privateAssetUrl(bucketPath: string | null | undefined) {
    if (!bucketPath) return null;
    const cached = this.signedCache.get(bucketPath);
    if (cached && Date.now() - cached.at < 50 * 60_000) return cached.url;
    const [bucket, ...rest] = bucketPath.split('/');
    const { data } = await this.sb.storage.from(bucket).createSignedUrl(rest.join('/'), 3600);
    if (!data?.signedUrl) return null;
    this.signedCache.set(bucketPath, { url: data.signedUrl, at: Date.now() });
    return data.signedUrl;
  }
  async artTile(z: number, x: number, y: number, rev: number, signal?: AbortSignal) {
    const res = await fetch(`${config.supabaseUrl}/storage/v1/object/public/public-art/tiles/${z}/${x}/${y}/${rev}.png`, { signal });
    if (!res.ok) return null;
    return res.arrayBuffer();
  }

  async finishMinigame(sessionId: string, log: unknown): Promise<MinigameFinish> {
    if (!config.workerUrl) throw new GameError('worker_not_configured', 'VITE_WORKER_URL is not set; minigame results cannot be validated.');
    const { data } = await this.sb.auth.getSession();
    const res = await fetch(`${config.workerUrl}/v1/minigames/finish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify({ session_id: sessionId, log }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new GameError(body.error ?? 'minigame_error');
    return body as MinigameFinish;
  }

  async kickPipeline() {
    /* the worker processes jobs server-side */
  }

  subscribeMapUpdates(cb: (u: MapUpdate) => void) {
    let lastId = 0;
    let live = false;
    const channel = this.sb
      .channel('map-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'map_updates' }, (payload) => {
        const u = payload.new as MapUpdate;
        lastId = Math.max(lastId, u.id);
        cb(u);
      })
      .subscribe((status) => {
        live = status === 'SUBSCRIBED';
      });
    // polling fallback (and catch-up after reconnects)
    const poll = setInterval(async () => {
      try {
        const r = await this.rpc<{ latest_id: number; updates: MapUpdate[] }>('map_updates_since', { p_since_id: lastId });
        if (lastId === 0) {
          lastId = r.latest_id;
          return;
        }
        if (!live) for (const u of r.updates) cb(u);
        lastId = Math.max(lastId, r.latest_id);
      } catch {
        /* offline */
      }
    }, 20_000);
    return () => {
      clearInterval(poll);
      void this.sb.removeChannel(channel);
    };
  }
}
