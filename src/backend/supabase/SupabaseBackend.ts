// SupabaseBackend — production multiplayer backend.
//  * Auth: Supabase Auth (email + password, magic links; add OAuth providers in the dashboard)
//  * Game state: Postgres RPCs (SECURITY DEFINER) through PostgREST
//  * Storage: drafts/submissions (private, RLS by user folder), public-art (CDN)
//  * Realtime: postgres_changes on public.map_updates, with polling fallback
//  * Minigame validation + art pipeline: Supabase Edge Functions (supabase/functions-src)
//    holding the service key; clients never submit scores, only move logs
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../env';
import { GameError, toGameError, type Backend, type Session } from '../backend';
import type { PvpFinish, MapUpdate, MinigameFinish } from '../types';

const PIPELINE_RPCS = new Set([
  'submit_publication', 'admin_review_publication', 'admin_remove_publication', 'admin_restore_publication', 'admin_release_plot',
  'publication_status', 'admin_set_review_mode', 'admin_approve_all_pending', 'admin_retry_job',
]);

async function functionError(error: any): Promise<GameError> {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return new GameError(body.error, body.detail);
  } catch {
    /* not JSON */
  }
  return new GameError('minigame_error', error?.message);
}

export class SupabaseBackend implements Backend {
  private lastKick = 0;
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
    if (PIPELINE_RPCS.has(fn)) void this.kickPipeline();
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
  async uploadAvatar(ownerId: string, name: string, image: Blob) {
    // names are content hashes, so an existing object is already the same picture
    const { error } = await this.sb.storage.from('avatars').upload(`${ownerId}/${name}`, image, { contentType: image.type, upsert: false, cacheControl: '31536000' });
    if (error && !/exists|Duplicate|409/i.test(error.message)) throw new GameError('upload_failed', error.message);
  }
  async avatarUrl(path: string | null | undefined) {
    return path ? `${config.supabaseUrl}/storage/v1/object/public/avatars/${path}` : null;
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
    if (config.workerUrl) {
      // optional self-hosted worker (worker/main.ts)
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
    const { data, error } = await this.sb.functions.invoke('minigame-finish', { body: { session_id: sessionId, log } });
    if (error) throw await functionError(error);
    return data as MinigameFinish;
  }

  async finishPvp(matchId: string, log: unknown): Promise<PvpFinish> {
    if (config.workerUrl) {
      const { data } = await this.sb.auth.getSession();
      const res = await fetch(`${config.workerUrl}/v1/minigames/finish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ match_id: matchId, log }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new GameError(body.error ?? 'pvp_error');
      return body as PvpFinish;
    }
    const { data, error } = await this.sb.functions.invoke('minigame-finish', { body: { match_id: matchId, log } });
    if (error) throw await functionError(error);
    return data as PvpFinish;
  }

  /** Ask the pipeline Edge Function to process queued publications (idempotent). */
  async kickPipeline() {
    if (config.workerUrl || Date.now() - this.lastKick < 4000) return;
    this.lastKick = Date.now();
    try {
      await this.sb.functions.invoke('pipeline', { body: {} });
    } catch {
      /* the next kick or the cron catches up */
    }
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
