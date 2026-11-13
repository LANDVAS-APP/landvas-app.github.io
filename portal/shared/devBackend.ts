// Dev only (VITE_PORTAL_DEV_API): the portal against a local database through scripts/portal-dev-bridge.mjs.
// Signing in picks any existing account by email; no password. Never part of a production build.
import { GameError, type Backend, type Session } from '../../src/backend/backend';

const KEY = 'portal-dev-session';

export class DevBackend {
  readonly mode = 'supabase' as const;
  readonly ephemeral = false;
  private current: Session | null = null;
  private aal: 'aal1' | 'aal2' = 'aal1';
  private listeners = new Set<(s: Session | null) => void>();
  constructor(private url: string) {
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s?.userId) { this.current = { userId: s.userId, email: s.email }; this.aal = s.aal ?? 'aal1'; } } catch { /* fresh */ }
  }
  async init() {}
  session() { return this.current; }
  onAuthChange(cb: (s: Session | null) => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  private save() { localStorage.setItem(KEY, JSON.stringify(this.current ? { ...this.current, aal: this.aal } : null)); this.listeners.forEach((cb) => cb(this.current)); }
  async users(): Promise<{ id: string; email: string; username: string | null }[]> { return (await fetch(`${this.url}/users`)).json(); }
  async signIn(email: string) {
    const u = (await this.users()).find((x) => x.email === email.trim().toLowerCase() || x.username === email.trim());
    if (!u) throw new GameError('invalid_credentials', 'No local account with that email.');
    this.current = { userId: u.id, email: u.email }; this.aal = 'aal1'; this.save();
  }
  async signUp(): Promise<{ needsConfirmation: boolean }> { throw new GameError('not_available', 'Create accounts in the game.'); }
  async signOut() { this.current = null; this.save(); }
  /** dev stand-in for verifying an authenticator code */
  devVerify() { this.aal = 'aal2'; this.save(); }
  devAal() { return this.aal; }
  async rpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const r = await fetch(`${this.url}/rpc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uid: this.current?.userId, aal: this.aal, fn, args }) });
    const j = await r.json();
    if (j.error) { const m = String(j.error.message); throw new GameError(/^[a-z_]+$/.test(m) ? m : 'unknown_error', /^[a-z_]+$/.test(m) ? undefined : m, j.error.detail ?? undefined); }
    return j.data as T;
  }
  async publicAssetUrl() { return null; }
  async privateAssetUrl() { return null; }
  async avatarUrl() { return null; }
  async artTile() { return null; }
  async uploadDraftTile() {} async downloadDraftTile() { return null; } async uploadSubmission() {} async uploadAvatar() {}
  async finishMinigame(): Promise<any> { throw new GameError('not_available'); }
  async finishPvp(): Promise<any> { throw new GameError('not_available'); }
  async brawl(): Promise<any> { throw new GameError('not_available'); }
  async kickPipeline() {}
  subscribeMapUpdates() { return () => {}; }
}

export const asBackend = (b: DevBackend) => b as unknown as Backend;
