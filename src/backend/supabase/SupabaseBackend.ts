// SupabaseBackend — production multiplayer backend.
//  * Auth: Supabase Auth (email + password, magic links; add OAuth providers in the dashboard)
//  * Game state: Postgres RPCs (SECURITY DEFINER) through PostgREST
//  * Storage: drafts/submissions (private, RLS by user folder), public-art (CDN)
//  * Map updates: polled (map_updates_since); live channels (broadcast only) for matches and rooms
//  * Minigame validation + art pipeline: Supabase Edge Functions (supabase/functions-src)
//    holding the service key; clients never submit scores, only move logs
import { poll } from '../../lib/poll';
import { guard, isStrain, timedFetch } from './guard';
import { GRID_SIZE } from '../../shared/grid';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../env';
import { GameError, toGameError, type Backend, type Session } from '../backend';
import type { PvpFinish, MapUpdate, MinigameFinish } from '../types';
import { NATIVE_APP } from '../../app/buildFlags';

const PIPELINE_RPCS = new Set([
  'submit_publication', 'publication_status',
  // staff calls: never in the iOS / Android apps
  ...(NATIVE_APP ? [] : ['admin_review_publication', 'admin_remove_publication', 'admin_restore_publication', 'admin_release_plot', 'admin_set_review_mode', 'admin_approve_all_pending', 'admin_retry_job']),
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

/** Calls that only make sense for a signed-in player (sent while signed out they just fail on the server). */
const PLAYER_ONLY = /^(my_|report_position$|set_activity$|arcade_live$|arena_live$|planet_live$|home_live$|brawl_|planet_meteor|planet_find$|biz_sync$|space_state$|rover_tick$|dig$)/;

/** where email links land: this site — or, from the phone app (whose own address isn't a website), landvas.app,
 *  which says you're confirmed; the app signs you in by itself when you come back to it */
function redirectTo() {
  return /^https?:\/\/localhost(:\d+)?$|^capacitor:/.test(location.origin) && (window as { Capacitor?: { isNativePlatform?(): boolean } }).Capacitor?.isNativePlatform?.()
    ? 'https://landvas.app/welcome?confirmed=1' : `${location.origin}/welcome?confirmed=1`;
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
      global: { fetch: timedFetch },
    });
  }

  authClient() {
    return this.sb.auth;
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
    const { data, error } = await this.sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
    if (error) throw new GameError(error.message.includes('registered') ? 'email_taken' : 'auth_error', error.message);
    return { needsConfirmation: !data.session };
  }
  async signIn(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw /not confirmed/i.test(error.message) ? new GameError('email_not_confirmed') : new GameError('invalid_credentials', error.message);
  }
  async sendMagicLink(email: string) {
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    if (error) throw new GameError('auth_error', error.message);
  }
  async signOut() {
    await this.sb.auth.signOut();
  }
  async resetPassword(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` });
    if (error) throw new GameError(/rate/i.test(error.message) ? 'email_rate_limited' : 'auth_error', error.message);
  }
  async updatePassword(password: string) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw new GameError('auth_error', error.message);
  }
  async resendConfirmation(email: string) {
    const { error } = await this.sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo() } });
    if (error) throw new GameError(/rate/i.test(error.message) ? 'email_rate_limited' : 'auth_error', error.message);
  }
  onPasswordRecovery(cb: () => void) {
    const { data } = this.sb.auth.onAuthStateChange((e) => { if (e === 'PASSWORD_RECOVERY') cb(); });
    return () => data.subscription.unsubscribe();
  }

  async rpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    // signed out (or the sign-in lapsed): a player's own calls would only bounce off the server, so don't send them
    if (!this.session() && PLAYER_ONLY.test(fn)) throw new GameError('not_signed_in', 'Sign in to keep playing.');
    // the server is struggling: background refreshes wait a moment so what you tap gets through
    if (guard.skip(fn)) throw new GameError('server_busy', 'The server is busy — trying again shortly.');
    const clean = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
    const t0 = Date.now();
    let data: unknown, error: { code?: string; message: string; details?: string } | null, status = 0;
    try { ({ data, error, status } = await this.sb.rpc(fn, clean)); }
    catch (e) { guard.record(Date.now() - t0, true); throw toGameError(e); }
    guard.record(Date.now() - t0, !!error && isStrain({ ...error, status }));
    if (error) {
      // the server didn't take our sign-in: refresh it once (a phone that slept past its token's expiry), else sign out
      if (error.code === '42501' && /permission denied for function/i.test(error.message) && this.session() && !this.refreshing) {
        this.refreshing = true;
        const { error: e2 } = await this.sb.auth.refreshSession().catch((x) => ({ error: x }));
        setTimeout(() => { this.refreshing = false; }, 30_000);
        if (!e2) return this.rpc<T>(fn, args);
      }
      throw toGameError({ message: error.message, detail: error.details });
    }
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

  async integrityPing(signals: Record<string, unknown>) {
    const { error } = await this.sb.functions.invoke('integrity', { body: signals });
    if (error) await this.rpc('integrity_ping', { p_signals: signals }); // the function is unreachable: the database still sees the address
  }

  async brawl(body: import('../../shared/brawl/server').BrawlBody) {
    const { data, error } = await this.sb.functions.invoke('brawl', { body });
    if (error) { const e = await functionError(error); throw e.code === 'minigame_error' ? new GameError('brawl_error', e.message) : e; }
    return data;
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

  private sendOnly = new Map<string, ReturnType<SupabaseClient['channel']>>();
  async liveSend(name: string, m: unknown) {
    let ch = this.sendOnly.get(name);
    if (!ch) { ch = this.sb.channel(name, { config: { broadcast: { self: false, ack: false } } }); this.sendOnly.set(name, ch); }
    try { const r = await ch.httpSend('m', m as object, { timeout: 4000 }); return r.success; } catch { return false; }
  }

  liveChannel(name: string, onMessage: (m: unknown) => void, presence?: { me: string; onPeer(id: string, here: boolean): void }) {
    let ready = false;
    const ch = this.sb.channel(name, { config: { broadcast: { self: false, ack: false }, ...(presence ? { presence: { key: presence.me } } : {}) } })
      .on('broadcast', { event: 'm' }, (p) => onMessage(p.payload));
    if (presence) {
      ch.on('presence', { event: 'join' }, ({ key }) => { if (key && key !== presence.me) presence.onPeer(key, true); });
      ch.on('presence', { event: 'leave' }, ({ key }) => { if (key && key !== presence.me) presence.onPeer(key, false); });
    }
    ch.subscribe((status) => {
      ready = status === 'SUBSCRIBED';
      if (ready && presence) void ch.track({ at: Date.now() });
    });
    return {
      // not connected yet (or reconnecting): send it over HTTP instead, so the message is never dropped
      send: (m: unknown) => { if (ready) void ch.send({ type: 'broadcast', event: 'm', payload: m }); else void this.liveSend(name, m); },
      close: () => { void this.sb.removeChannel(ch); },
    };
  }

  /**
   * New map tiles, by asking every so often (the database-change feed this used to listen to kept the database busy
   * decoding every write, which ate the free plan's disk budget). Checks right away when the app comes back to the
   * front, and not at all while it's in the background. The newest update seen is kept for the whole visit (and can
   * be restored from the last one), so a map that opens again gets exactly the changes since, not everything.
   */
  private mapSeen = 0;
  private refreshing = false;

  /**
   * Pushes: the database tells this phone when its alerts change (or there's news), so it doesn't have to keep
   * asking. Listens on the player's own private topic and on the shared news topic while signed in.
   */
  onPush(cb: (kind: string) => void) {
    let chans: { close(): void }[] = [], uid: string | null = null, gone = false;
    const hear = (m: unknown) => { const k = (m as { t?: string } | null)?.t; if (typeof k === 'string') cb(k); };
    const join = async () => {
      const me = this.session()?.userId ?? null;
      if (me === uid) return;
      uid = me; chans.forEach((c) => c.close()); chans = [];
      if (!me) return;
      try {
        const topic = await this.rpc<string | null>('my_push_topic');
        if (gone || uid !== me) return;
        chans = [this.liveChannel('news', hear), ...(topic ? [this.liveChannel(topic, hear)] : [])];
      } catch { /* the slow checks still catch up */ }
    };
    void join();
    const off = this.onAuthChange(() => void join());
    return () => { gone = true; off(); chans.forEach((c) => c.close()); };
  }
  mapCursor() { return this.mapSeen; }
  setMapCursor(id: number) { if (!this.mapSeen && id > 0) this.mapSeen = id; }
  subscribeMapUpdates(cb: (u: MapUpdate) => void) {
    let busy = false;
    const check = async () => {
      if (busy || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
      busy = true;
      try {
        const since = this.mapSeen;
        const r = await this.rpc<{ latest_id: number; updates: MapUpdate[] }>('map_updates_since', { p_since_id: since });
        if (since !== 0) {
          for (const u of r.updates) cb(u);
          // more changed than one answer holds: start over rather than miss any
          const last = r.updates.length ? r.updates[r.updates.length - 1].id : since;
          if (last < r.latest_id) cb({ id: r.latest_id, kind: 'ownership', min_gx: 0, min_gy: 0, max_gx: GRID_SIZE - 1, max_gy: GRID_SIZE - 1, publication_id: null });
        }
        this.mapSeen = Math.max(this.mapSeen, r.latest_id);
      } catch {
        /* offline */
      } finally { busy = false; }
    };
    void check();
    const timer = setInterval(() => void check(), poll(20_000));
    const onShow = () => void check();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onShow);
    };
  }
}
