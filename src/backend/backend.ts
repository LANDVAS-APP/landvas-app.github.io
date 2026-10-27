// Backend abstraction. The game talks to exactly two kinds of backend:
//  * SupabaseBackend — production: Postgres RPCs via PostgREST, Supabase Auth,
//    Storage and Realtime, plus the LANDVAS worker for minigame validation.
//  * LocalBackend   — the same SQL migrations running in-browser on PGlite,
//    with IndexedDB storage and the shared pipeline. Zero setup, single device.
import { config } from '../env';
import type { MapUpdate, MinigameFinish } from './types';

export type Session = { userId: string; email: string | null };

export interface Backend {
  readonly mode: 'local' | 'supabase';
  /** True when local data cannot persist (private browsing, blocked storage). */
  readonly ephemeral: boolean;
  init(): Promise<void>;
  session(): Session | null;
  onAuthChange(cb: (s: Session | null) => void): () => void;
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<void>;
  sendMagicLink?(email: string): Promise<void>;
  signOut(): Promise<void>;
  localAccounts?(): Promise<{ email: string }[]>;
  rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<T>;
  uploadDraftTile(ownerId: string, hash: string, png: Blob): Promise<void>;
  downloadDraftTile(ownerId: string, hash: string): Promise<Blob | null>;
  uploadSubmission(ownerId: string, publicationId: string, cellKey: string, png: Blob): Promise<void>;
  /** URL for a public-art asset (preview, thumb). */
  publicAssetUrl(path: string | null | undefined): Promise<string | null>;
  /** URL for a not-yet-public processed asset (owner/moderators only). */
  privateAssetUrl(bucketPath: string | null | undefined): Promise<string | null>;
  /** Encoded PNG bytes of a published map art tile. */
  artTile(z: number, x: number, y: number, rev: number, signal?: AbortSignal): Promise<ArrayBuffer | null>;
  finishMinigame(sessionId: string, log: unknown): Promise<MinigameFinish>;
  /** Local mode runs the pipeline in-page after submission/admin actions. */
  kickPipeline(): Promise<void>;
  subscribeMapUpdates(cb: (u: MapUpdate) => void): () => void;
  resetLocalData?(): Promise<void>;
}

/** A game rule violation or failure with a stable machine code from the server. */
export class GameError extends Error {
  constructor(public code: string, message?: string, public detail?: string) {
    super(message ?? friendlyError(code, detail));
  }
}

const MESSAGES: Record<string, string> = {
  not_authenticated: 'Please sign in to do that.',
  onboarding_required: 'Finish setting up your artist profile first.',
  account_restricted: 'Your account is restricted. Check Settings for details.',
  plot_unavailable: 'Someone already owns this plot — try a neighbour.',
  starter_already_claimed: 'You already claimed your free starter plot.',
  insufficient_funds: 'Not enough resources yet. Play a plot minigame or collect production to earn more.',
  not_owner: 'You do not own this.',
  not_connected: 'Those canvases do not touch — plots must share an edge.',
  canvas_too_large: 'That canvas would exceed the current size limit.',
  need_two_groups: 'Pick at least two canvases to connect.',
  publication_in_progress: 'This canvas has a publication in review or processing. Wait for it to finish.',
  version_conflict: 'This artwork was saved from another device. Reload to get the latest version, or overwrite it.',
  version_out_of_date: 'Save your latest changes before publishing.',
  terms_required: 'Please accept the current Terms to continue.',
  rights_affirmation_required: 'Confirm that you have the rights to publish this artwork.',
  rate_limited: 'Slow down a little — try again in a moment.',
  username_taken: 'That username is taken.',
  username_reserved: 'That username is reserved.',
  invalid_username: 'Usernames use 3–20 letters, numbers or underscores.',
  tile_outside_canvas: 'Part of this artwork lies outside your canvas.',
  too_many_layers: 'Too many layers to connect these canvases. Merge some layers first.',
  cannot_detach_all: 'Keep at least one plot in the canvas.',
  level_locked: 'Clear the previous level first.',
  wrong_plot_type: 'This plot hosts a different minigame.',
  minigame_unavailable: 'This minigame is temporarily unavailable.',
  session_closed: 'That run already ended.',
  session_expired: 'That run expired. Start a new one.',
  claim_a_plot_first: 'Claim a plot before appreciating artwork.',
  cannot_appreciate_own: 'You cannot appreciate your own artwork.',
  forbidden: 'You do not have permission for that.',
  max_level: 'Already at the maximum level.',
  already_unlocked: 'Already unlocked.',
  requires_unlock: 'Unlock the previous item first.',
  plot_limit_reached: 'You reached the plot limit.',
  not_found: 'Not found.',
  open_elsewhere: 'LANDVAS is already open in another tab. Close it there and reload.',
  invalid_credentials: 'Email or password is incorrect.',
  email_taken: 'An account with that email already exists on this device.',
  weak_password: 'Use at least 8 characters for your password.',
  invalid_email: 'Enter a valid email address.',
};

export function friendlyError(code: string, detail?: string) {
  return MESSAGES[code] ?? (detail ? `${code.replace(/_/g, ' ')} (${detail})` : 'Something went wrong. Please try again.');
}

export function toGameError(e: unknown): GameError {
  if (e instanceof GameError) return e;
  const msg = String((e as any)?.message ?? e ?? 'error');
  const detail = (e as any)?.detail ?? (e as any)?.details;
  const code = /^[a-z_]+$/.test(msg) ? msg : msg.match(/\b([a-z]+(?:_[a-z]+)+)\b/)?.[1] ?? 'unknown_error';
  return new GameError(code, MESSAGES[code] ?? (code === 'unknown_error' ? msg : undefined), detail);
}

let instance: Backend | null = null;
let initPromise: Promise<Backend> | null = null;

export function getBackend(): Backend {
  if (!instance) throw new Error('backend not initialised');
  return instance;
}

export function initBackend(): Promise<Backend> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const b: Backend =
      config.backend === 'supabase'
        ? new (await import('./supabase/SupabaseBackend')).SupabaseBackend()
        : new (await import('./local/LocalBackend')).LocalBackend();
    await b.init();
    instance = b;
    return b;
  })();
  return initPromise;
}
