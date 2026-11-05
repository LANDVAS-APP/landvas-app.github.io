// Backend abstraction. The game talks to exactly two kinds of backend:
//  * SupabaseBackend — production: Postgres RPCs via PostgREST, Supabase Auth,
//    Storage and Realtime, plus the LANDVAS worker for minigame validation.
//  * LocalBackend   — the same SQL migrations running in-browser on PGlite,
//    with IndexedDB storage and the shared pipeline. Zero setup, single device.
import { config } from '../env';
import type { MapUpdate, MinigameFinish, PvpFinish } from './types';

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
  /** email a password-reset link (to /reset-password) */
  resetPassword?(email: string): Promise<void>;
  /** set a new password for the signed-in account (after a reset link) */
  updatePassword?(password: string): Promise<void>;
  /** send the sign-up confirmation email again */
  resendConfirmation?(email: string): Promise<void>;
  /** fires when a password-reset link was opened */
  onPasswordRecovery?(cb: () => void): () => void;
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
  /** Store a profile picture (already cropped and re-encoded) at avatars/<owner>/<name>. */
  uploadAvatar(ownerId: string, name: string, image: Blob): Promise<void>;
  /** URL for a profile picture path (profiles.avatar_path). */
  avatarUrl(path: string | null | undefined): Promise<string | null>;
  /** Encoded PNG bytes of a published map art tile. */
  artTile(z: number, x: number, y: number, rev: number, signal?: AbortSignal): Promise<ArrayBuffer | null>;
  finishMinigame(sessionId: string, log: unknown): Promise<MinigameFinish>;
  /** Submit a PvP run's move log (every round); the server replays it against the match's boards. */
  finishPvp(matchId: string, log: unknown): Promise<PvpFinish>;
  /** Local mode runs the pipeline in-page after submission/admin actions. */
  kickPipeline(): Promise<void>;
  subscribeMapUpdates(cb: (u: MapUpdate) => void): () => void;
  /** A low-latency message channel shared by everyone in one live group (positions on a planet). */
  liveChannel?(name: string, onMessage: (m: unknown) => void): { send(m: unknown): void; close(): void };
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
  onboarding_required: 'Finish setting up your player profile first.',
  account_restricted: 'Your account is restricted. Check Settings for details.',
  plot_unavailable: 'Someone already owns this plot — try a neighbour.',
  starter_already_claimed: 'You already claimed your free starter plot.',
  insufficient_funds: 'Not enough yet — win plot minigames to earn more Ink.',
  out_of_reach: 'That plot is too far from your explorer. Travel closer first.',
  explorer_required: 'Turn on your location to place your explorer.',
  level_already_beaten: 'You’ve already beaten that level on this plot — play the next one.',
  plot_maxed: 'This plot has beaten every level of its game.',
  pvp_disabled: 'PvP minigames aren’t open right now.',
  wheel_disabled: 'The daily wheel is resting today.',
  wheel_used: 'You’ve used today’s spin — come back tomorrow.',
  rooms_disabled: 'Room check-ins are paused right now.',
  own_room: 'This is your own room.',
  look_around_first: 'Look around the room for a few seconds first.',
  already_checked_in: 'You’ve already checked in here today.',
  challenge_closed: 'That challenge isn’t taking entries or votes right now.',
  not_your_artwork: 'Pick one of your own published artworks.',
  invalid_result: 'That result didn’t add up — the game wasn’t counted.',
  not_in_arcade: 'Step into the arcade first (and stay in the same room as the others).',
  match_closed: 'That game has already started or closed.',
  match_full: 'That game is full (4 players).',
  not_host: 'Only the player who set it up can start it.',
  need_players: 'Wait for at least one more player to join.',
  mixed_plot_kinds: 'Only plots of the same type can merge (art with art, arcades with arcades…) — switch one first.',
  habitat_plot: 'This plot is an Inkborn Habitat. Switch it back to an Art Canvas to publish art.',
  invalid_plot_kind: 'That plot type isn’t available.',
  daily_ad_cap: 'That’s all the bonus ads for today — more after the evening reset.',
  ads_disabled: 'Bonus ads aren’t switched on right now.',
  reward_already_used: 'That bonus was already used.',
  account_has_payments: 'Your account has payment records — contact support and we’ll delete it for you.',
  confirm_delete: 'Type DELETE to confirm.',
  inkborn_busy: 'They’re away on a job right now — wait for them to come back.',
  not_in_flight: 'You’re not flying anywhere right now.',
  rocket_not_built: 'Finish building your rocket first — it needs all four parts.',
  space_in_flight: 'Your rocket is already flying — wait until it lands.',
  engine_too_small: 'Your engine can’t reach that far yet — upgrade it in the hangar.',
  engine_maxed: 'Your engine is already the biggest there is.',
  invalid_world: 'That world isn’t on the star charts.',
  no_home_world: 'You haven’t settled a home world yet — jump to a far-off world and settle it.',
  not_on_a_world: 'Land on a world first.',
  playdate_own: 'Pick one of their creatures — playdates are with someone else’s Inkborn.',
  egg_not_ready: 'Not quite ready — the egg is still wobbling.',
  egg_hatched: 'That egg has already hatched.',
  no_energy: 'Out of digging energy — it refills over time.',
  not_enough_materials: 'You don’t have enough materials for that yet.',
  invalid_tool: 'That tool doesn’t exist.',
  area_too_big: 'That’s too big an area to load at once.',
  not_in_space: 'They’re not out on another world right now.',
  room_full: 'Their group is full right now — try again in a bit.',
  not_friends: 'Only friends can warp to someone’s home world.',
  world_taken: 'This world is already someone’s home.',
  already_home: 'This is already your home world.',
  invalid_activity: 'Unknown activity.',
  invalid_target: 'You can’t warp to yourself.',
  meteor_taken: 'Someone got to that meteorite first!',
  meteor_gone: 'That meteorite has burned out — a new shower is on its way.',
  too_far: 'Get closer — walk right up to it.',
  arcade_only: 'That’s an arcade prize — win it with tickets at any arcade’s prize counter.',
  machine_locked: 'That cabinet isn’t in this arcade yet.',
  not_enough_tickets: 'Not enough tickets yet — play a few rounds!',
  level_too_low: 'Level your arcade up first — every game played in it gives XP.',
  storm_over: 'The storm has passed — the shards have blown away. Another storm will roll in soon.',
  already_found: 'You’ve already found this one.',
  research_needed: 'Research this first — open the Research tab in your base.',
  not_enough_research: 'Not enough research points yet — build a lab to make more.',
  land_first: 'Land there first — fly your rocket to this world to buy plots on it.',
  invalid_plot: 'That plot isn’t on this world’s map.',
  samples_taken: 'You’ve already collected today’s samples here — come back tomorrow, or try another world.',
  invalid_part: 'That isn’t a rocket part.',
  inkborn_tired: 'Too sleepy for that — let them rest a while (energy refills by itself).',
  invalid_job: 'That job isn’t available.',
  no_job: 'They aren’t on a job.',
  job_not_done: 'They’re not back yet.',
  game_too_fast: 'That round finished too quickly to count.',
  invalid_game: 'That game isn’t available.',
  layout_conflict: 'This was changed somewhere else — reopen it to see the latest.',
  too_many_decorations: 'This habitat is full of decorations — merge more habitat plots for more space.',
  invalid_layout: 'Something is placed outside the space (or isn’t allowed there).',
  too_many_creatures: 'You have the most Inkborn allowed right now.',
  habitat_full: 'That habitat is full — connect more habitat plots for more room.',
  invalid_genome: 'That creature design couldn’t be saved.',
  invalid_name: 'Pick a friendlier name (1–24 letters).',
  vote_final: 'Votes are final once they’re placed.',
  invalid_word: 'That word can’t be used.',
  room_not_found: 'That room isn’t open.',
  email_not_confirmed: 'Please confirm your email first — tap the link we sent you (check spam too).',
  email_rate_limited: 'Too many emails just now — wait a minute and try again.',
  feature_disabled: 'That’s taking a break right now.',
  invalid_drawing: 'Draw a little more first.',
  sketch_time_up: 'Time’s up for today’s sketch.',
  sketch_already_submitted: 'You’ve already sent today’s sketch.',
  sketch_not_started: 'Start your sketch first.',
  voting_closed: 'Voting for that sketch has closed.',
  own_sketch: 'You can’t vote for your own sketch.',
  no_votes_left: 'You’ve used all of today’s votes.',
  no_doodles_yet: 'No new drawings to guess right now — draw one for others!',
  time_up: 'Time’s up.',
  not_your_turn: 'That half isn’t yours to paint.',
  own_artwork: 'You can’t collect your own art.',
  already_collected: 'You already have this stamp.',
  sold_out: 'All the stamps for this piece are taken.',
  daily_limit: 'You’ve reached today’s limit — more after the daily reset.',
  account_too_new: 'New accounts can do this after their first day.',
  invalid_creative_config: 'Some creative-games settings are out of range.',
  too_similar: 'This is very similar to one of your earlier pieces — paint something new for the challenge.',
  made_before_challenge: 'Enter something you published after the challenge started — make it for the theme!',
  cannot_vote_own: 'You can’t vote for your own entry.',
  account_too_new_to_vote: 'New accounts can vote after their first day, once they own a plot.',
  out_of_votes: 'You’ve used all your votes for this challenge.',
  invalid_challenge: 'Those challenge settings aren’t valid.',
  invalid_earn_config: 'Those settings aren’t valid.',
  pvp_in_progress: 'Finish the PvP match you’re already playing first.',
  match_unavailable: 'That match isn’t available any more.',
  invalid_pvp_config: 'Those PvP settings aren’t valid.',
  invalid_bonus_rules: 'One of the bonus rules isn’t valid (percent 0–100, Ink 0 or more; “N rounds” rules need a count of 1–10).',
  run_finished: 'That run is already recorded.',
  player_not_found: 'No player with that username.',
  refill_limit_reached: 'No Ink refills left today. Your tank refills for free tomorrow.',
  tank_full: 'Your joystick tank is already full.',
  gps_required: 'Turn on your location — your explorer follows your real GPS position.',
  jump_cooldown: 'Teleporting is turned off — your explorer follows your GPS.',
  invalid_plot_name: 'Plot names use up to 32 letters, numbers, spaces and simple punctuation.',
  'invalid_plot_name:too_long': 'Plot names can be up to 32 characters.',
  'invalid_plot_name:links': 'Plot names can’t contain links.',
  'invalid_plot_name:language': 'Please pick a friendlier name — that one isn’t allowed.',
  'invalid_plot_name:characters': 'Plot names can’t contain symbols like < > { } @ or invisible characters.',
  joystick_disabled: 'The joystick is switched off right now.',
  flag_locked: 'That switch can’t be changed from the console.',
  legal_signoff_required: 'This feature needs legal sign-off before it can be switched on.',
  invalid_minigame_config: 'Those minigame values are out of range.',
  invalid_explorer_config: 'Those explorer values are out of range.',
  invalid_economy_config: 'Those economy values are out of range.',
  invalid_rent_config: 'Those rent values are out of range.',
  invalid_rate: 'USD rates must be between 0 and 0.001 per second.',
  reason_required: 'Add a short reason (it goes in the audit log).',
  cannot_moderate_self: 'You can’t do that to your own account.',
  not_owner: 'You do not own this.',
  farm_level_needed: 'Your farm level isn’t high enough for that yet — keep farming!',
  not_enough_coins: 'Not enough Farm Coins yet — sell produce or fill orders to earn more.',
  not_enough_produce: 'You don’t have enough of that produce yet.',
  not_built: 'Build that first.',
  maxed: 'That’s already at its highest level.',
  orders_done_today: 'You’ve filled all of today’s orders — new customers come tomorrow.',
  not_enough_cash: 'Not enough cash yet — tap the stand, or wait for your ventures to earn it.',
  upgrade_locked: 'That upgrade isn’t unlocked yet.',
  already_owned: 'You already have that.',
  no_customer: 'That customer has gone — another will turn up soon.',
  not_ready_for_ipo: 'Not big enough to go public yet — keep growing!',
  own_business: 'That’s your own business!',
  keeper_level_needed: 'Your keeper level isn’t high enough for that yet.',
  not_enough_glimmer: 'Not enough Glimmer yet — care for your creatures, send them on jobs and grant their wishes.',
  no_treat: 'You don’t have that treat — bake one first.',
  on_expedition: 'They’re away on an expedition — bring the whole team home from the Keeper’s Lodge.',
  invalid_team: 'Pick one to three creatures for the team.',
  bed_taken: 'Something’s already growing in that bed.',
  not_done_yet: 'Not quite done yet — keep going!',
  already_done: 'Already ticked off today.',
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
  // shop & explorer
  unknown_item: 'That item isn’t in the shop any more.',
  not_owned: 'Buy that item in the shop first.',
  invalid_avatar: 'That picture couldn’t be used. Try a JPG, PNG or WebP image.',
  upload_failed: 'The upload didn’t go through. Check your connection and try again.',
  // friends
  cannot_friend_self: 'That’s you!',
  already_friends: 'You’re already friends.',
  request_pending: 'Your friend request is waiting for an answer.',
  friend_limit: 'You’ve reached the friend limit.',
  // chat
  chat_disabled: 'The chat is switched off right now.',
  chat_muted: 'You’re muted in the chat for a while.',
  chat_empty: 'Type a message first.',
  chat_too_long: 'Messages can be up to 300 characters.',
  chat_invalid: 'That message contains characters that aren’t allowed.',
  chat_links: 'Links aren’t allowed in the chat — it keeps everyone safe from scams.',
  // referrals
  referrals_disabled: 'Invites are switched off right now.',
  already_referred: 'You’ve already used an invite code.',
  referral_window_closed: 'Invite codes can only be entered in your first days of playing.',
  invalid_referral_code: 'That invite code doesn’t exist.',
  'invalid_referral_code:format': 'Codes use 4–16 letters, numbers or underscores.',
  'invalid_referral_code:language': 'Please pick a friendlier code — that one isn’t allowed.',
  referral_code_unavailable: 'That invite code can’t be used.',
  cannot_refer_self: 'You can’t use your own invite code.',
  custom_code_exists: 'You already made your custom code — each account gets one.',
  code_taken: 'That code is taken. Try another.',
  // USD -> Ink
  conversion_disabled: 'Converting USD to Ink is switched off right now.',
  conversion_too_small: 'The smallest conversion is $0.01 (1 Ink).',
  invalid_amount: 'Enter an amount above $0.',
  ink_minigame_only: 'Ink can only be earned in minigames.',
};

export function friendlyError(code: string, detail?: string) {
  return (detail && MESSAGES[`${code}:${detail}`]) || MESSAGES[code] || (detail ? `${code.replace(/_/g, ' ')} (${detail})` : 'Something went wrong. Please try again.');
}

export function toGameError(e: unknown): GameError {
  if (e instanceof GameError) return e;
  const msg = String((e as any)?.message ?? e ?? 'error');
  const detail = (e as any)?.detail ?? (e as any)?.details;
  const code = /^[a-z_]+$/.test(msg) ? msg : msg.match(/\b([a-z]+(?:_[a-z]+)+)\b/)?.[1] ?? 'unknown_error';
  return new GameError(code, (detail && MESSAGES[`${code}:${detail}`]) || MESSAGES[code] || (code === 'unknown_error' ? msg : undefined), detail);
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
