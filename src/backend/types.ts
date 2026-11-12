// Shapes of the JSON returned by the database RPCs (see supabase/migrations).
import type { PlotTypeId } from '../shared/grid';
import type { GameId } from '../shared/minigames/types';
import type { RarityId, RarityInfo } from '../shared/rarity';
import type { RentState } from '../shared/rent';

export type Resource = 'ink' | 'pigments' | 'brush_points' | 'gallery_tokens';
export type Balances = Record<Resource, number>;

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_seed: string;
  avatar_style: 'prism' | 'orbit' | 'mosaic' | 'bloom';
  accent_color: string;
  /** uploaded profile picture (avatars bucket path), or null for the generated avatar */
  avatar_path?: string | null;
  explorer_style?: ExplorerStyle;
  bio: string | null;
  created_at: string;
};

export type ExplorerPart = 'hat' | 'hold' | 'outfit' | 'trail' | 'aura' | 'hair' | 'hairc' | 'skin' | 'body' | 'sex' | 'face';
export type ExplorerStyle = Partial<Record<ExplorerPart, string>>;

export type PlotTypeInfo = {
  id: PlotTypeId;
  name: string;
  minigame: GameId;
  minigame_name: string;
  tagline: string;
  color_primary: string;
  color_secondary: string;
  weight: number;
  sort: number;
  acquire_multiplier: number;
};

export type ShopItem = { key: string; name: string; kind: string; group?: string; part?: string; id?: string; description: string; cost: Partial<Balances>; requires?: string; enabled?: boolean };

export type WorldConfig = {
  ink_uncapped?: boolean;
  grid: { level: number; size: number; plot_px: number; art_min_zoom: number; art_max_zoom: number };
  plot_types: PlotTypeInfo[];
  rarities: RarityInfo[];
  economy: any;
  rent: { enabled: boolean; currency: string; level_bonus: number; max_offline_days: number; boost: { multiplier: number; minutes_per_boost: number; max_stack_hours: number; free_per_day: number; reset_hour_utc: number; reset_hour?: number; reset_tz?: string }; cashout: { minimum_usd: number; methods: string[] }; convert?: { enabled: boolean; ink_per_usd: number } };
  explorer: {
    claim_reach: number; max_speed_kmh: number; manual_travel: boolean; travel_speed_kmh: number; jump_cooldown_hours: number;
    joystick?: { enabled: boolean; speed_kmh: number; tank_seconds: number; daily_refill: boolean; burst_seconds: number };
  };
  limits: { max_canvas_side: number; max_canvas_plots: number; max_layers_base: number; max_layers_hard: number; plot_px: number };
  shop: { items: ShopItem[] };
  legal: { terms_version: string; privacy_version: string; support?: string };
  minigames: any;
  flags: Record<string, { enabled: boolean; config: any }>;
  server_time: string;
};

export type MyState =
  | { onboarded: false; user_id: string; terms_current: string }
  | {
      onboarded: true;
      user_id: string;
      player: { status: string; suspended_until: string | null; suspension_reason: string | null; strikes: number; terms_version: string | null; terms_accepted_at: string | null; starter_plot_claimed: boolean; created_at: string };
      profile: Profile;
      balances: Balances;
      rent: RentState;
      explorer: ExplorerState | null;
      plot_count: number;
      group_count: number;
      unlocks: string[];
      roles: string[];
      artist_level: number;
      achievement_count: number;
      terms_current: string;
      server_time: string;
    };

export type ExplorerState = {
  mode: 'gps' | 'manual' | 'travel';
  trip?: TravelTrip | null;
  vehicle?: VehicleState;
  lng: number;
  lat: number;
  gx: number;
  gy: number;
  origin: { lng: number; lat: number };
  fixed_at: string;
  accuracy_m: number | null;
  dest: { lng: number; lat: number } | null;
  speed_mps: number | null;
  traveling: boolean;
  arrives_at: string | null;
  jump_available_at: string | null;
  reach: number;
  has_gps_fix?: boolean;
  joystick?: JoystickState;
  server_time: string;
};

export type JoystickState = {
  enabled: boolean;
  seconds_left: number;
  tank_seconds: number;
  speed_kmh: number;
  daily_refill: boolean;
  next_refill_at: string;
  ads_enabled: boolean;
  refill_ink?: number;
  ink_refills_left?: number;
};

export type CashoutStatus = {
  enabled: boolean;
  minimum_usd: number;
  methods: string[];
  message: string;
  open_request: { id: string; amount_usd: number; created_at: string } | null;
  history: { id: string; amount_usd: number; status: string; method: string; created_at: string; decided_at: string | null }[];
};

export type Neighbor = { gx: number; gy: number; dir: 'n' | 's' | 'e' | 'w'; plot_type: PlotTypeId | null; rarity: RarityId | null; owned: boolean; is_mine: boolean; owner_username: string | null; group_id: string | null; same_group: boolean };

export type PlotDetails = {
  gx: number;
  gy: number;
  center: { lng: number; lat: number };
  name?: string | null;
  /** null until the plot is claimed — type, minigame and rarity are a surprise */
  plot_type: PlotTypeId | null;
  type_info: PlotTypeInfo | null;
  mystery?: boolean;
  rarity: RarityId | null;
  rarity_info: RarityInfo | null;
  rarity_hidden?: boolean;
  rent: { usd_per_second: number; boost_multiplier: number } | null;
  owned: boolean;
  is_mine: boolean;
  owner: Profile | null;
  level: number;
  claimed_at: string | null;
  locked: boolean;
  reach?: { explorer: boolean; distance: number | null; max: number; in_reach: boolean };
  art: { publication_id: string; title: string; published_at: string; plot_count: number; artist: Profile; appreciation_count: number } | null;
  neighbors: Neighbor[];
  group?: { id: string; name: string; plot_count: number; project_id: string; min_gx: number; min_gy: number; max_gx: number; max_gy: number };
  connections?: { group_id: string; name: string; plot_count: number }[];
  acquire?: { ink?: number; owned?: number; starter_available: boolean };
  available?: boolean;
};

/** Compact row from plots_in_bbox: [gx, gy, type, level, is_mine, group_id, has_art, username, accent, rarity, name] */
export type PlotRow = [number, number, PlotTypeId, number, boolean | null, string | null, boolean, string | null, string | null, RarityId, (string | null)?, PlotKind?, boolean?];

/** One row of the public players directory. */
export type DirectoryPlayer = {
  profile: Profile;
  plots: number;
  artworks: number;
  appreciations: number;
  artist_level: number;
  best_rarity: RarityId | null;
  top_art: { id: string; title: string; thumb_path: string | null } | null;
};

/** Land row from player_land: [gx, gy, rarity, type, level, has_art, group_id, name] */
/** A plot inside a canvas, relative to the canvas corner: [dx, dy, rarity, type, level, has_art, name] (no coordinates) */
export type LandCell = [number, number, RarityId, PlotTypeId, number, boolean, string | null];
export type LandCanvas = { id: string; name: string; plot_count: number; width: number; height: number; cells: LandCell[]; art: ArtworkCard | null };
export type PlayerLand = {
  player: Profile;
  total_plots: number;
  usd_per_second: number;
  rarity_counts: Partial<Record<RarityId, number>>;
  type_counts: Partial<Record<PlotTypeId, number>>;
  canvases: LandCanvas[];
};
/** Admin-only absolute plot row: [gx, gy, rarity, type, level, has_art, group_id, name] */
export type AdminPlot = [number, number, RarityId, PlotTypeId, number, boolean, string | null, string | null];

export type FriendStatus = 'none' | 'self' | 'friends' | 'incoming' | 'outgoing';
export type FriendsList = {
  friends: { player: Profile; since: string; plots: number; now?: Whereabouts }[];
  incoming: { player: Profile; at: string }[];
  outgoing: { player: Profile; at: string }[];
};
export type ChatMessage = { id: number; body: string; created_at: string; player: Profile; deleted?: boolean; kind?: 'moderation'; data?: { action?: 'ban' | 'suspend'; until?: string | null } };
/** A player's places, for their profile. */
export type ArcadeMember = Profile & { explorer_style?: unknown; x: number; z: number; playing: string | null };
export type ArcadeMatchPlayer = Profile & { explorer_style?: unknown; score: number | null; finished: boolean; bonus: number; session: string | null };
export type ArcadeMatch = {
  id: string; arcade_id: string; game: string; mode: 'versus' | 'team'; status: 'lobby' | 'playing' | 'done' | 'cancelled'; host: string;
  seed: number | null; target: number | null; created_at: string; started_at: string | null; server_time: string; players: ArcadeMatchPlayer[]; level: number;
};
export type ArcadeLive = { arcade_id: string; shard: number; joined: boolean; room_size: number; channel: string; members: ArcadeMember[]; in_arcade: number; lobbies: ArcadeMatch[]; match: ArcadeMatch | null };
export type HomePlace = { id: string; name: string; plots: number; rarity?: string | null; level?: number; score?: number; starter?: boolean; here?: number };
export type HomeDoorInfo = { privacy: 'public' | 'friends' | 'hidden'; open: boolean; count: number; places: HomePlace[] };
export type HomePlaced = { i: string; x: number; z: number; r: number; c?: number; f?: number };
/** one size of house: what a square of Home plots that big gives you */
export type HouseSize = { size: number; name: string; floors: number; balcony: boolean; roof: boolean; elevator: boolean; pool: boolean; unlock: string };
/** a player's house: may it be visited, and how big it is (the biggest square of their Home plots) */
export type House = HouseSize & { has_home: boolean; legacy: boolean; allowed: boolean; group_id: string | null; plots: number; levels: number; max_items: number; next: HouseSize | null; ladder: HouseSize[] };
export type HomeStatus = { own: boolean; allowed: boolean; has_home: boolean; size: number; name: string; floors: number };
/** a drawing in a check-in book: strokes of points on a 400 x 300 page */
export type BookDrawing = { s: { c: string; w: number; p: number[] }[] };
export type HomeStyleData = { wall?: string; floor?: string; view?: string; mood?: string; wall_color?: string; floor_color?: string; trim?: string; music?: string };
export type HomeData = {
  host: Profile & { explorer_style?: unknown }; own: boolean; house?: House; name: string | null; style: HomeStyleData; layout: HomePlaced[];
  doors: Record<'arcade' | 'habitat' | 'farm' | 'business', HomeDoorInfo> & Partial<Record<RealmKind, HomeDoorInfo>>;
  careers: { arcade: number; keeper: number; farmer: number; merchant: number; creatures: number; plots: number; realms?: Partial<Record<RealmKind, number>> };
  inkborn: { id: string; name: string; genome: unknown; companion: boolean }[];
  items: Record<string, number> | null; tickets: number | null;
  catalog: { max_items: number; free_each: number; styles: Record<'wall' | 'floor' | 'view' | 'mood', string[]>; items: Record<string, { price: { ink?: number; tickets?: number }; mount: string }> };
};
export type HomeGame = {
  id: string; game: string; status: 'lobby' | 'playing' | 'done' | 'cancelled'; host: string; home: string; seed: number | null;
  result: { places?: Record<string, number>; players?: number; boost?: number } | null;
  created_at: string; started_at: string | null; server_time: string;
  players: (Profile & { slot: number | null; place: number | null; ink: number })[];
};
export type HomeLive = { shard: number; joined: boolean; room_size: number; channel: string; members: ArcadeMember[]; in_home: number; tables: HomeGame[]; game: HomeGame | null };
export type ArenaMode = 'duel' | 'teams' | 'ffa' | 'coop';
export type ArenaMatchPlayer = Profile & { explorer_style?: unknown; slot: number | null; team: number | null; place: number | null; tickets: number; ink: number };
export type ArenaMatch = {
  id: string; game: string; mode: ArenaMode; status: 'lobby' | 'playing' | 'done' | 'cancelled'; host: string; seed: number | null;
  result: { places?: Record<string, number>; winner?: number | null; waves?: number; players?: number; boost?: number } | null;
  created_at: string; started_at: string | null; server_time: string; players: ArenaMatchPlayer[];
};
export type ArenaLive = { shard: number; joined: boolean; room_size: number; channel: string; members: ArcadeMember[]; in_arena: number; lobbies: ArenaMatch[]; match: ArenaMatch | null };
export type PlayerPlaces = {
  arcades: { id: string; name: string; plots: number; level: number; plays: number; neon: string; machines: number; emojis: string[]; rarity: string | null; playing: number }[];
  habitats: { id: string; name: string; plots: number; starter: boolean; residents: number; genomes: unknown[]; rarity: string | null }[];
  farms: { id: string; name: string; plots: number; harvests: number; rarity: string | null }[];
  businesses: { id: string; name: string; plots: number; tips: number; alltime: number; rarity: string | null }[];
};
export type FeedEvent = {
  id: number;
  kind: 'join' | 'claim' | 'publish' | 'achievement' | 'referral' | 'level' | 'minigame' | 'pvp' | 'challenge' | 'featured' | 'sketch' | 'duet' | 'stamp'
    | 'planet_plot' | 'settle' | 'exploring' | 'playdate' | 'dig' | 'base' | 'core' | 'harvest' | 'ipo' | 'arcade' | 'luck' | 'crown' | 'flight' | 'estate' | 'moderation' | 'enchant';
  data: Record<string, any>;
  created_at: string;
  player: Profile;
};
export type Referrals = {
  enabled: boolean;
  reward_ink: number;
  referee_reward_ink: number;
  qualify: 'signup' | 'starter_plot' | 'first_win';
  daily_cap: number;
  default_code: string;
  custom_code: string | null;
  share?: { enabled: boolean; pct: number; cap_ink: number };
  stats: { total: number; pending: number; rewarded: number; earned_ink: number; share_ink?: number; share_today?: number };
  recent: { player: Profile; status: string; reward_ink: number; share_ink?: number; created_at: string; qualified_at: string | null }[];
  resets_at?: string;
  referred_by: { player: Profile; status: string; code: string } | null;
  can_redeem: boolean;
};

export type GroupCell = [number, number, PlotTypeId, number, boolean];
export type CanvasGroup = {
  id: string;
  kind?: PlotKind;
  habitat_id?: string | null;
  farm_id?: string | null;
  business_id?: string | null;
  arcade_id?: string | null;
  realm_id?: string | null;
  name: string;
  status: string;
  plot_count: number;
  min_gx: number;
  min_gy: number;
  max_gx: number;
  max_gy: number;
  project_id: string;
  created_at: string;
  updated_at: string;
  cells: GroupCell[];
  project: { id: string; title: string; description: string | null; current_version_id: string; version_count: number; tile_count: number; layer_count: number; updated_at: string } | null;
  latest_publication: { id: string; status: PublicationStatus; title: string; created_at: string; published_at: string | null; decision_reason: string | null; thumb_path: string | null; plot_count: number } | null;
  adjacent_groups: string[];
};

export type ManifestLayer = { id: string; name: string; opacity: number; visible: boolean; tiles: Record<string, string> };
export type Manifest = { layers: ManifestLayer[]; imported?: boolean; active_ms?: number };

export type ProjectBundle = {
  project: { id: string; title: string; description: string | null; status: string; group_id: string; owner_id: string; current_version_id: string; version_count: number; updated_at: string };
  version: { id: string; version_no: number; kind: string; manifest: Manifest; cells: [number, number][]; created_at: string };
  group: CanvasGroup;
  published: [number, number, number][];
  limits: WorldConfig['limits'];
};

export type VersionInfo = { id: string; version_no: number; kind: string; note: string | null; tile_count: number; layer_count: number; plot_count: number; created_at: string; published: boolean };

export type PublicationStatus = 'uploading' | 'processing' | 'pending_review' | 'approved' | 'published' | 'rejected' | 'superseded' | 'removed' | 'cancelled' | 'failed';

export type Publication = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  cells: [number, number][];
  plot_count: number;
  min_gx: number;
  min_gy: number;
  max_gx: number;
  max_gy: number;
  center_lng: number;
  center_lat: number;
  status: PublicationStatus;
  published_at: string | null;
  decision_reason: string | null;
  preview_path: string | null;
  thumb_path: string | null;
  preview_width: number | null;
  preview_height: number | null;
  color_count: number | null;
  appreciation_count: number;
  created_at: string;
};

export type ArtworkCard = {
  id: string;
  title: string;
  plot_count: number;
  published_at: string | null;
  thumb_path: string | null;
  preview_path: string | null;
  preview_width: number | null;
  preview_height: number | null;
  appreciation_count: number;
  /** craft score 0-100 (palette, shading, detail) and the full breakdown for the artist */
  craft_score?: number | null;
  craft?: { score: number; coverage: number; colors: number; shading: number; detail: number; noise: number; tips: string[]; paid?: number; tier_ink?: number; picture?: number; originality?: number; imported?: boolean; similar?: { sim: number; title: string; own: boolean } | null } | null;
  featured?: boolean;
  /** how it was made: drawn in the editor, has an uploaded image, or unknown (published before tracking) */
  made?: ArtMade;
  /** map position — only for the artist and moderators */
  center_lng?: number;
  center_lat?: number;
  min_gx?: number;
  min_gy?: number;
  max_gx?: number;
  max_gy?: number;
  status: PublicationStatus;
  artist: Profile;
  appreciated: boolean;
  note?: string;
  criteria?: string;
};

/** 'drawn' = painted in the LANDVAS editor; 'upload' = an uploaded image is in it; null = predates tracking */
export type ArtMade = 'drawn' | 'upload' | null;

export type ArtworkDetail = Omit<ArtworkCard, 'featured'> & {
  description: string | null;
  cells: [number, number][];
  is_owner: boolean;
  color_count: number | null;
  decision_reason: string | null;
  live_plots: number;
  /** active feature sections ('featured', 'staff_pick', 'spotlight'); empty when not featured */
  featured: string[];
  more_by_artist: ArtworkCard[];
};

export type Achievement = { key: string; name: string; description: string; icon: string; category: string; threshold: number; reward: Partial<Balances>; progress: number; unlocked_at: string | null; unlocked_by: number };
export type NewAchievement = { key: string; name: string; description: string; icon: string; reward: Partial<Balances> };

export type MinigameStart = { session_id: string; game: GameId; level: number; seed: number; plot_level: number; rounds?: number | null; plot_highest_level?: number; max_level?: number; started_at: string; expires_at: string; server_time: string };
export type MinigameFinish = {
  status: 'validated' | 'rejected' | 'expired';
  valid: boolean;
  passed: boolean;
  score: number;
  stars: number;
  flags: string[];
  new_best: boolean;
  rewards: { ink: number; pigments: number; brush_points: number; held: boolean; multiplier: number; practice: boolean; rewarded_left: number; resets_at: string; rounds_cleared?: number; rounds?: number; level_ink?: number; round_ink?: number; bonus_ink?: number; bonuses?: BonusHit[]; quality?: number[] };
  record: { highest_level: number; best_score: number; plays: number; wins: number };
  balances: Balances;
  achievements: NewAchievement[];
  summary?: Record<string, unknown>;
};

export type MapUpdate = { id: number; kind: 'art' | 'ownership'; min_gx: number; min_gy: number; max_gx: number; max_gy: number; publication_id: string | null };

export type Announcement = { id: string; title: string; body: string; kind: 'update' | 'event' | 'maintenance' | 'news'; link: string | null; popup: boolean; published_at: string; unread: boolean;
  content?: import('../updates/Rich').RichContent | null; built_at?: string | null };
export type Notifications = { announcements: Announcement[]; unread_announcements: number; support_replies: number; open_tickets_staff: number | null; drafts_staff?: number | null };
export type AdminAnnouncement = Announcement & { active: boolean; status?: 'draft' | 'published' | 'discarded'; source?: 'manual' | 'auto' | 'backfill'; builds?: { sha: string; at: string; notes: string[] }[]; author?: any };
export type SupportTicket = {
  id: string; subject: string; category: string; status: 'open' | 'answered' | 'closed'; created_at: string; last_message_at: string;
  unread: boolean; messages: number; player?: Profile;
};
export type SupportMessage = { id: number; body: string; is_staff: boolean; created_at: string; author: Partial<Profile> & { display_name?: string } };

/** One bonus rule (minigames and PvP): see the admin's Earnings tab. */
export type BonusRule = { type: 'round' | 'all' | 'count' | 'average'; min_pct: number; ink: number; count?: number };
export type BonusHit = { type: BonusRule['type']; ink: number; round?: number; quality?: number; min_pct?: number; count?: number; average?: number };
export type PvpRoundRun = { score: number; time_ms: number; quality: number; summary?: Record<string, unknown> };
/** A PvP match as its player sees it: never who the rival is. */
export type PvpMatch = {
  match_id: string; game: import('../shared/pvp').PvpGame; rounds: number; created_at: string; finished_at: string | null;
  status: 'playing' | 'waiting' | 'done' | 'expired';
  you: { rounds: PvpRoundRun[] | null; total_score: number | null; avg_quality: number | null; valid: boolean | null; ink: number;
         bonus: { ink: number; paid: number; hits: BonusHit[]; withheld?: string | null } | null;
         reward: { result: 'won' | 'lost' | 'draw'; ink: number; rounds_won: number; withheld?: string | null } | null };
  rival: { name: string; rounds: { score: string; time_ms: string; quality: string }[] | null; total_score: number | null } | null;
  per_round: ('you' | 'rival' | 'tie')[] | null;
  result: 'won' | 'lost' | 'draw' | null;
};
export type PvpStart = { match_id: string; game: import('../shared/pvp').PvpGame; seed: number; rounds: number; started_at: string; expires_at: string; round_seconds: number; matched: boolean; server_time: string };
export type PvpFinish = PvpMatch & { balances: Balances };
export type PvpGameConfig = { enabled: boolean; rounds: number; win_ink: number; draw_ink: number; round_win_ink: number[]; bonuses: BonusRule[]; waiting: number };
export type PvpLobby = {
  config: { enabled: boolean; round_seconds: number; daily_rewarded_matches: number; min_quality_pct: number; min_account_hours: number; games: Record<string, PvpGameConfig> };
  matches: PvpMatch[]; record: { won: number; lost: number; draws: number; ink: number; paid_today: number } | null; resets_at: string;
};

// ---- more ways to earn ----
export type WheelSlice = { label: string; kind: 'ink' | 'pigments' | 'brush_points' | 'gallery_tokens' | 'boost' | 'joystick'; amount: number; color: string; chance?: number };
export type WheelStatus = { enabled: boolean; slices: WheelSlice[]; spins_left: number; last: { slice: number; prize: WheelSlice; at: string } | null; resets_at: string };
export type RoomStatus = { enabled: boolean; own: boolean; checked_in: boolean; signed_today?: boolean; visitor_ink: number; host_ink: number; stay_seconds: number; paid_today: number; visitor_daily: number; old_enough: boolean; visitors_today: number; resets_at: string };
export type CraftTier = { min: number; ink: number };
export type EarnOverview = {
  wheel: { enabled: boolean; spins_left: number };
  rooms: { enabled: boolean; visitor_ink: number; host_ink: number; paid_today: number; visitor_daily: number; host_today: number };
  inspire: { enabled: boolean; artist_ink: number; giver_ink: number; giver_daily: number; given_today: number; earned_today: number };
  craft: { enabled: boolean; tiers: CraftTier[]; plot_bonus_pct: number; best: number | null };
  featured_ink: number; challenges: number; old_enough: boolean; resets_at: string;
};
export type ChallengeEntry = { card: ArtworkCard; votes: number; place: number | null; prize: number; voted: boolean; mine: boolean };
export type Challenge = {
  id: string; title: string; theme: string; starts_at: string; ends_at: string; prizes: number[]; entry_ink: number; status: 'open' | 'done' | 'cancelled' | 'upcoming';
  entries: ChallengeEntry[]; my_votes_left: number; my_entry: string | null;
};
export type ChallengesNow = { enabled: boolean; votes_per_player: number; active: Challenge[]; upcoming: Pick<Challenge, 'id' | 'title' | 'theme' | 'starts_at' | 'ends_at' | 'prizes'>[]; past: Challenge[] };

// ---- creative games ----
import type { Stroke } from '../shared/strokes';
export type Streak = { enabled: boolean; days: number; today: boolean; bonus_pct: number; step_pct: number; max_pct: number; resets_at: string };
export type SketchEntry = { id: string; word: string; strokes: Stroke[]; votes: number | null; place: number | null; prize: number; mine: boolean; voted: boolean; artist: Profile | null };
export type SketchToday = {
  enabled: boolean; word: string; day: string; ends_at: string; minutes: number; prizes: number[]; votes_per_player: number; votes_left: number;
  mine: { id: string; started_at: string; submitted: boolean; deadline: string; strokes: Stroke[] | null; votes: number } | null;
  entries: SketchEntry[]; yesterday: SketchEntry[]; yesterday_word: string; server_time: string;
};
export type DoodleMine = { enabled: boolean; guesser_ink: number; drawer_ink: number; draw_seconds: number; guess_seconds: number; open: number;
  drawings: { id: string; word: string; strokes: Stroke[]; guesses: number; solved: number; ink: number; created_at: string }[]; stats: { guessed: number; tried: number; ink: number } };
export type DoodleGuess = { doodle_id: string; strokes: Stroke[]; letters: number; shape: string; tries: number; started_at: string; guess_seconds: number; server_time: string };
export type Duet = { id: string; prompt: string; status: 'top' | 'waiting' | 'bottom' | 'done' | 'expired'; created_at: string; done_at: string | null; half: 'top' | 'bottom' | null; ink: number;
  top: Stroke[] | null; bottom: Stroke[] | null; edge: Stroke[] | null; partner: Profile | null };
export type DuetPublic = { id: string; prompt: string; top: Stroke[]; bottom: Stroke[]; done_at: string; painters: Profile[] };
export type StampInfo = { enabled: boolean; price: number; supply: number; artist_pct: number; collected: number; mine: number | null; recent: Profile[] };

export type Alert = { id: number; kind: 'stamp' | 'visit' | 'checkin' | 'inspire' | 'sketch_vote' | 'note' | 'potd' | 'duet' | 'doodle' | 'friend_request' | 'friend_accept' | 'sanctuary_visit' | 'playdate' | 'warp' | 'base_visit' | 'neighbor' | 'core' | 'ultra_set' | 'enchant'; data: Record<string, any>; created_at: string; read: boolean; actor: Profile | null };
export type RoomSocial = {
  visitors: { player: Profile; at: string; checked_in: boolean }[]; visits: number; checkins: number;
  notes: { id: number; body: string; drawing?: BookDrawing | null; at: string; author: Profile; mine: boolean }[]; is_host: boolean;
};

// ---- Inkborn ----
export type PlotKind = 'base' | 'canvas' | 'habitat' | 'farm' | 'business' | 'arcade' | 'home' | 'landlord' | 'train' | 'plane' | RealmKind;
/** The 2x2 merge tier: each base type's Estate (see src/realms/estates). */
export type EstateKind = 'atelier' | 'reserve' | 'ranch' | 'exchange' | 'boardwalk' | 'gemheart' | 'skyport' | 'foundry' | 'foodhall' | 'citadel' | 'colosseum';
/** The 3x3 merge tier: each base type's Domain. */
export type DomainKind = 'museum' | 'sanctuary' | 'kingdom' | 'megacorp' | 'galaxypark' | 'core' | 'observatory' | 'automaton' | 'banquet' | 'abyss' | 'titans';
export type RealmKind = 'mine' | 'sky' | 'workshop' | 'diner' | 'dungeon' | 'brawl' | EstateKind | DomainKind;
export type BizVenture = { key: string; name: string; emoji: string; owned: number; cost: number; cost10: number; max_q: number; rate: number; each: number; next_milestone: number | null; revealed: boolean };
export type BizUpgrade = { key: string; kind: 'venture' | 'tap' | 'global'; venture: string | null; name: string; emoji: string; cost: number; x?: number; pct?: number; golden?: number; golden_dur?: number; need?: number };
export type BizBuff = { kind: 'frenzy' | 'storm'; mult: number; until: string };
export type BizState = {
  cash: number; income: number; tap_value: number; run_earned: number; alltime: number; shares: number; shares_on_ipo: number; next_share_at: number; ipos: number;
  taps: number; multiplier: number; plots: number; ventures: BizVenture[]; upgrades_owned: number; upgrades: BizUpgrade[]; upgrades_next: BizUpgrade[];
  golden_at: string; golden_window: number; buff: BizBuff | null; dividend_ready: boolean; dividend_ink: number; ink_today: number; daily_cap: number; server_time: string;
  tapped?: number; tap_gain?: number; away?: { seconds: number; earned: number } | null;
  bought?: string; qty?: number; spent?: number; milestones?: number[]; ink?: number; upgraded?: string; name?: string;
  golden?: { kind: 'lucky' | 'frenzy' | 'storm'; gain: number; ink: number }; ipo?: { new_shares: number; shares: number; ink: number }; dividend?: { ink: number; cash: number };
};
export type BizGameInfo = { name: string; emoji: string; dim: '2d' | '3d'; seconds: number; max_score: number; points_per_ink: number; max_ink: number };
export type Business = {
  id: string; group_id: string | null; seed: number; name: string; plots: number; owner: Profile; mine: boolean; tips: number; games: Record<string, BizGameInfo>;
  state?: BizState; away?: { seconds: number; earned: number } | null;
  public?: { alltime: number; shares: number; ipos: number; income: number; ventures: Record<string, number> }; tipped_today?: boolean;
};
export type FarmCrop = { name: string; emoji: string; seed: number; minutes: number; yield: [number, number]; sell: number; color: string };
export type FarmGameInfo = { name: string; emoji: string; dim: '2d' | '3d'; seconds: number; max_score: number; points_per_ink: number; max_ink: number };
export type FarmConfig = { beds_base: number; beds_per_plot: number; beds_max: number; daily_cap: number; water_speedup: number; golden_chance: number; golden_mult: number;
  crops: Record<string, FarmCrop>; games: Record<string, FarmGameInfo>;
  progression?: { crop_levels: Record<string, number>; level_coins: number; price_per_level: number };
  upgrades?: Record<string, FarmUpgradeInfo>; buildings?: Record<string, FarmBuildingInfo>;
  products?: Record<string, { name: string; emoji: string; sell: number }>; recipes?: Record<string, FarmRecipe>;
  orders?: { slots: number; per_day: number; wait_minutes: number } };
export type FarmUpgradeInfo = { name: string; emoji: string; desc: string; level: number; base: number; growth: number; max: number };
export type FarmBuildingInfo = { name: string; emoji: string; item?: string; level: number; build: number; minutes?: number; cap?: number; upgrade: number; growth: number; max: number };
export type FarmRecipe = { name: string; emoji: string; building: string; needs: Record<string, number>; makes: number; sell: number };
export type FarmBuildingState = { key: string; lvl: number; ready: number; every_min: number | null; cap: number | null; since: string | null; cost: number };
export type FarmOrder = { slot: number; wants: Record<string, number>; coins: number; xp: number; ink: number; available_at: string; ready: boolean; can_fill: boolean };
export type FarmProgress = {
  level: number; xp: number; level_xp: number; next_xp: number; coins: number; upgrades: Record<string, number>; upgrade_costs: Record<string, number>;
  buildings: Record<string, FarmBuildingState>; orders: FarmOrder[]; orders_left: number; chores?: FarmChores;
};
export type FarmChore = { key: string; name: string; emoji: string; kind: 'tap' | 'count'; seconds?: number; target?: number; ink: number; progress: number; done: boolean; ready: boolean };
export type FarmChores = { list: FarmChore[]; bonus_ink: number; bonus_coins: number; resets_at: string };
export type FarmProgressResult = FarmProgress & { items?: Record<string, number>; level_up?: number; balances?: unknown;
  bought?: string; built?: string; to?: number; spent?: number; collected?: Record<string, number>; crafted?: string; times?: number; filled?: { coins: number; xp: number; ink: number } };
export type FarmBed = { idx: number; crop: string; planted_at: string; ready_at: string; watered: boolean; ready: boolean };
export type Farm = {
  id: string; group_id: string | null; seed: number; name: string; plots: number; owner: Profile; mine: boolean; harvests: number; cells: [number, number][];
  beds_count: number; beds: FarmBed[]; items: Record<string, number> | null; ink_today: number | null; config: FarmConfig; server_time: string;
  harvested?: Record<string, number>; beds_harvested?: number; golden?: number; level_up?: number; level?: number; sprinkled?: boolean;
  progress?: FarmProgress; owner_level?: number; buildings_built?: string[];
};
export type Inkborn = {
  id: string; name: string; source: 'drawn' | 'random' | 'custom' | 'bred'; genome: import('../inkborn/genome').Genome; personality: string;
  habitat_id: string | null; bond: number; happiness: number; energy: number; created_at: string; mine: boolean;
  portrait_status: 'none' | 'unconfigured' | 'queued' | 'ready' | 'failed'; portrait_path: string | null;
  drawing?: import('../shared/strokes').Stroke[] | null; last_fed: string | null; last_played: string | null;
  job?: string | null; job_until?: string | null; job_started?: string | null; level?: number; xp?: number;
};
export type KeeperMaterial = { name: string; emoji: string };
export type KeeperTreat = { name: string; emoji: string; level: number; needs: Record<string, number>; happiness?: number; energy?: number; xp?: number; bond?: number };
export type KeeperUpgrade = { name: string; emoji: string; desc: string; level: number; base: number; growth: number; max: number };
export type KeeperRegion = { order: number; name: string; emoji: string; level: number; minutes: number; power: number; favours: string; glimmer: number; xp: number; cxp: number; ink: number; loot: Record<string, [number, number]>; treasures: string[] };
export type KeeperConfig = {
  materials: Record<string, KeeperMaterial>; treats: Record<string, KeeperTreat>; upgrades: Record<string, KeeperUpgrade>; regions: Record<string, KeeperRegion>;
  expedition: { team_max: number; energy: number; treasure_chance: number; set_bonus_glimmer: number };
  wishes: { max_per_day: number; all_done_ink: number; all_done_glimmer: number };
};
export type KeeperCreature = { id: string; name: string; genome: import('../inkborn/genome').Genome; personality: string; bond: number; level: number; xp: number; level_xp: number; next_xp: number;
  job: string | null; job_until: string | null; happiness: number; energy: number };
export type KeeperWish = { id: number; inkborn: string; name: string; kind: 'care' | 'job' | 'game' | 'treat'; target: string | null; done: boolean; claimed: boolean };
export type KeeperExpeditionResult = { success: boolean; loot: Record<string, number>; glimmer: number; xp: number; ink: number; treasure: string | null; set_complete: boolean; level_up: number };
export type KeeperExpedition = { id: string; region: string; team: string[]; power: number; chance: number; started_at: string; ends_at: string; done: boolean; result: KeeperExpeditionResult | null; claimed: boolean };
export type KeeperEvent = { id: number; at: string; kind: string; data: Record<string, any> };
export type Keeper = {
  level: number; xp: number; level_xp: number; next_xp: number; glimmer: number; materials: Record<string, number>; treats: Record<string, number>;
  upgrades: Record<string, number>; upgrade_costs: Record<string, number>; treasures: string[]; creatures: KeeperCreature[]; wishes: KeeperWish[];
  expeditions: KeeperExpedition[]; events: KeeperEvent[]; resets_at: string; config: KeeperConfig; server_time: string;
  result?: KeeperExpeditionResult; all_done?: boolean; ink?: number; bought?: string; to?: number; baked?: string; times?: number; fed?: string; creature_level_up?: number; chance?: number;
};
export type InkbornJob = { label: string; minutes: number; ink: number; energy: number };
export type InkbornGameCfg = { enabled: boolean; seconds: number; energy: number; max_score: number; points_per_ink: number; max_ink: number };
export type InkbornEconomy = {
  made: number; next_cost: number; ink_today: number; daily_cap: number;
  jobs: Record<string, InkbornJob>; games: Record<string, InkbornGameCfg>; spring: { enabled: boolean; per_creature_hour: number; per_spring_hour: number; max_springs: number; min_happiness: number; max_hours: number };
};
export type SpringState = { happy: number; springs: number; hours: number; rate: number; ready: number; full_in_hours: number; enabled: boolean };
export type CareAction = 'pet' | 'feed' | 'play' | 'brush' | 'fetch' | 'trick' | 'bathe' | 'hideseek';
/** A creature as the map sees it on someone's habitat plot. */
export type Resident = { id: string; name: string; genome: import('../inkborn/genome').Genome; personality: string; mine: boolean; happiness: number; energy: number };
export type Decor = { id: string; k: string; x: number; y: number; f?: 0 | 1 };
export type Habitat = {
  id: string; kind: 'starter' | 'plot'; biome: 'woodland'; seed: number; layout: Decor[]; layout_rev: number; owner: Profile; is_owner: boolean;
  group_id: string | null; name: string; plots: number; capacity: number; active: boolean; cells: [number, number][]; creatures: Inkborn[];
};
export type Sanctuaries = {
  habitats: { id: string; kind: 'starter' | 'plot'; group_id: string | null; plots: number; capacity: number; creatures: number; name: string }[];
  creatures: Inkborn[]; starter_id: string; companion_id?: string | null; max_creatures: number; ai_portraits: boolean;
};

// ---- Space ----
export type SpaceWorldCfg = { tier: number; minutes: number; fuel: number; sample: number; first: number };
export type SpaceGameCfg = { enabled: boolean; seconds: number; max_score: number; points_per_ink: number; max_ink: number };
export type SpaceConfig = {
  enabled: boolean; daily_cap: number; parts: Record<string, { label: string; ink: number }>; engine_upgrade_ink: number[];
  worlds: Record<string, SpaceWorldCfg>; games: Record<string, SpaceGameCfg>;
  fast_travel?: { enabled: boolean; base_ink: number; ink_per_minute: number };
};
export type SpaceState = {
  parts: string[]; built: boolean; engine: number; location: string; dest: string | null; depart_at: string | null; arrive_at: string | null;
  exo_seed: number | null; home_seed: number | null; home_name: string | null; visited: string[]; samples: Record<string, string | boolean>;
  launches: number; ink_today: number; rush_cost: number | null; day: string; server_time: string; config: SpaceConfig; balances: Balances;
  fuel_spent?: number; paid?: number; first_bonus?: number; capped?: boolean;
  /** destinations you can warp to — free and instant */ warps?: string[]; warped?: boolean;
};

export type CosmicRarity = { id: string; name: string; weight: number; mult: number; color: string };
/** A placed piece: where (metres from the base's south-west corner), its angle in degrees (old layouts: r quarter turns),
 *  how high it sits (z), its size per axis, main and accent colour, material and style variant. */
export type BaseModule = { id: string; k: string; x: number; y: number; r?: number; a?: number; z?: number; sx?: number; sy?: number; sz?: number; c?: string; c2?: string; m?: string; v?: number };
export type BaseModDef = {
  name: string; emoji: string; w: number; d: number; h?: number; cat?: string; prim?: boolean; req?: string; cost: Record<string, number>;
  fx?: { power?: number; crew?: number; out?: Record<string, number>; ink?: number; research?: number; storage?: number; boost?: number;
    convert?: { from: Record<string, number>; to: Record<string, number>; times: number }; sell?: Record<string, number> & { per?: number; max?: number } };
};
export type BaseEcon = {
  power: { supply: number; demand: number }; crew: { have: number; need: number }; efficiency: number; boost: number;
  out: Record<string, number>; ink: number; research: number; storage_cap: number;
  convert: { from: Record<string, number>; to: Record<string, number>; rate: number }[]; sell: (Record<string, number> & { rate: number })[];
  buildings: { id: string; k: string; lv: number; mult: number }[];
};
export type BaseResearch = { points: number; unlocked: string[] };
export type BaseState = {
  econ: BaseEcon; storage: Record<string, number>; ink_pending: number; research_pending: number; levels: Record<string, number>; prod_at: string;
  upgrades: Record<string, Record<string, number>>; research: BaseResearch;
  collected?: Record<string, number>; ink?: number; research_gained?: number; upgraded?: string; to?: number;
};
export type Discoveries = {
  enabled: boolean; server_time: string;
  weather: { kind: string; name: string; emoji: string; active: boolean; starts: string; ends: string; next: string; win: number; shards: { i: number; d: number[]; rare: boolean; taken: boolean }[] };
  aliens: { i: number; d: number[]; species: AlienSpecies; found: boolean }[];
  pois: { i: number; d: number[]; kind: string; found: boolean }[];
  codex: Record<string, number>;
  species: AlienSpecies[];
  poi_kinds: Record<string, { name: string; emoji: string; ink: number }>;
  weather_kinds: Record<string, { name: string; emoji: string; item: string; rare: string }>;
};
export type AlienSpecies = { id: string; name: string; emoji: string; rarity: string; ink: number };
export type FindResult = { kind: 'shard' | 'alien' | 'poi'; idx: number; paid: number; earned: number; items: Record<string, number>; species: AlienSpecies | null; new_species: boolean; poi: string | null };
export type BaseView = { world: string; gx: number; gy: number; w: number; h: number; layout: BaseModule[]; rev: number; mine: boolean; owner: Profile; name: string | null; modules: number; plot_m: number; catalog: { modules: Record<string, { name: string; emoji: string; w: number; d: number }> } };
export type PlanetPlot = { gx: number; gy: number; name: string | null; mine: boolean; rarity: string; owner: { username: string; accent: string | null }; base?: { layout: BaseModule[]; rev: number; w?: number; h?: number } | null; in_base?: [number, number] | null; shaft?: { depth: number; cored: boolean } | null };
export type PlanetMap = {
  world: string; rows: number; cols: number; radius: number; claimed: number; games: string[]; bonus_game: string; rarities: CosmicRarity[]; bonus_from: number; luck: number; price: number; landed: boolean;
  plots: PlanetPlot[]; pilots: (Profile & { explorer_style?: unknown })[]; ink_today: number; daily_cap: number;
};
export type Companion = { id: string; name: string; genome: import('../inkborn/genome').Genome };
export type LiveMember = Profile & { explorer_style?: unknown; d: number[]; face: number[]; hop: number; companion?: Companion | null };
export type PlanetLive = {
  world: string; shard: number; joined: boolean; spawn: { d: number[]; player: string } | null; group_size: number;
  channel: string; members: LiveMember[]; on_world: number;
};
export type Meteor = { i: number; d: number[]; golden: boolean; taken: boolean; mine: boolean; by: string | null };
export type MeteorShower = { win: number; started_at: string; ends_at: string; reach_m: number; meteors: Meteor[] };
export type InkEgg = {
  id: string; kind: 'speckled' | 'swirl' | 'starry' | 'striped' | 'glimmer' | 'cosmic'; shell: { a: string; b: string; c: string };
  parents: { name: string; owner: string; genome: import('../inkborn/genome').Genome }[]; mutated: boolean;
  laid_at: string; hatch_at: string; ready: boolean; hatched: boolean; seen: boolean; genome: import('../inkborn/genome').Genome | null;
};
export type PlaydateStart = {
  session: string; seed: number; seconds: number; egg_score: number; eggs_left: number;
  mine: { id: string; name: string; genome: import('../inkborn/genome').Genome };
  theirs: { id: string; name: string; genome: import('../inkborn/genome').Genome; owner: Profile };
};
export type PlaydateFinish = { score: number; earned: number; paid: number; capped: boolean; host_tip: number; egg: InkEgg | null; their_egg: { kind: string } | null; no_egg_because: string | null; repeat?: boolean; eggs_left?: number };
export type SanctuaryCard = {
  id: string; kind: 'starter' | 'plot'; plots: number; creatures: number; capacity: number; name: string; owner: Profile; friend: boolean; active_at: string;
  preview: { name: string; genome: import('../inkborn/genome').Genome }[];
};
export type MineLayer = { id: string; name: string; to: number; hardness: number; color: string; finds: Record<string, number>; first_ink: number };
export type MineTool = { id: string; name: string; power: number; cost: Record<string, number> };
export type DigState = {
  world: string | null; depth: number; shaft: number[] | null; layers_reached: number; tools: string[]; power: number;
  energy: number; energy_max: number; regen_per_minute: number; items: Record<string, number>;
  refills?: { free_left: number; ink_left: number };
  config: { taps_per_second: number; find_chance: number; layers: MineLayer[]; tools: MineTool[]; items: Record<string, { name: string; emoji: string }>; energy: { max: number; per_tap: number; regen_per_minute: number };
    refills?: { free_per_day: number; ink: { cost: number; energy: number; per_day: number }; ration: { cost: Record<string, number>; energy: number } } };
  dug?: number; finds?: Record<string, number>; new_layers?: string[]; layer_ink?: number; crafted?: string;
  gx?: number; gy?: number; cored?: boolean; my_shafts?: { gx: number; gy: number; depth: number; cored: boolean }[]; reached_core?: boolean; core_ink?: number; party?: number; party_mult?: number; refilled?: string; added?: number;
};
export type ActivityKind = 'map' | 'planet' | 'dig' | 'space' | 'game' | 'inkborn' | 'sanctuary' | 'playdate' | 'create' | 'gallery' | 'social' | 'other';
export type Whereabouts = {
  online: boolean;
  activity: { kind: ActivityKind; detail: Record<string, string>; at: string } | null;
  space: { location: string; dest: string | null; arrive_at: string | null; home_seed: number | null; home_name: string | null; at_home: boolean } | null;
  room: { live: boolean; in_room?: number; room_size?: number } | null;
};
export type SpaceSocial = {
  friends: { player: Profile; now: Whereabouts }[];
  new_worlds: { player: Profile; seed: number; name: string; at: string }[];
};
export type BaseCatalog = {
  config: {
    max_modules: number; max_modules_total?: number; max_merge?: number; refund: number; palette: string[]; modules: Record<string, BaseModDef>;
    max_z?: number; scale?: [number, number]; max_level?: number;
    materials?: Record<string, { name: string; req?: string }>; categories?: Record<string, { name: string; emoji: string }>;
    research?: Record<string, { name: string; emoji: string; cost: number; desc: string }>;
  };
  items: Record<string, number>; item_info: Record<string, { name: string; emoji: string }>; plot_m: number; research?: BaseResearch;
};
export type PlanetQuest = { id: string; metric: string; target: number; title: string; emoji?: string; ink: number; items: Record<string, number>; progress: number; done: boolean; claimed: boolean };
export type PlanetQuests = {
  world: string; day: string; resets_at: string; solo: PlanetQuest[]; item_info: Record<string, { name: string; emoji: string }>;
  crew: (PlanetQuest & { min_share: number; mine: number; can_claim: boolean; crew: (Profile & { amount: number })[]; crew_size: number }) | null;
  claimed_quest?: string; paid?: number; earned?: number; items_got?: Record<string, number>;
};
export type PlanetChatMsg = { id: number; body: string; at: string; player: Profile };
export type RoverModel = { id: string; name: string; emoji: string; speed: number; tank: number; burn_per_km: number; cost: Record<string, number> };
export type RoverState = {
  owned: string[]; active: string | null; fuel: number; tank: number; driving: boolean; world: string | null; km: number; km_today: number;
  config: { enabled: boolean; fuel_per_ice: number; fuel_per_ink: number; models: RoverModel[] }; items: Record<string, number>; item_info: Record<string, { name: string; emoji: string }>;
  bought?: string; added?: number; moved_m?: number; burned?: number; out_of_fuel?: boolean;
};

export type PlanetOverview = {
  worlds: { world: string; rows: number; cols: number; claimed: number; mine: number; here_now: number }[];
  plots: { world: string; gx: number; gy: number; name: string | null; rarity: string; rows: number; base: number }[];
};
export type PlanetHere = { player: Profile; d: number[]; friend: boolean; with_you: boolean; seen: number }[];

export type ArcadeGameInfo = { order: number; name: string; emoji: string; color: string; level: number; cost: number; min_seconds: number; max_score: number; tickets_per_point: number; points_per_ink: number; max_ink: number };
export type ArcadePrize = { id: string; name: string; emoji: string; tickets: number; tier: number };
export type ArcadeMe = { tickets: number; lifetime: number; prizes: Record<string, number>; bonus_ready: boolean; streak: number; ink_today: number; daily_cap: number | null; ink_progress?: number; best: Record<string, number>; best_endless?: Record<string, number>; played_today?: string[]; owned?: string[] };
export type ArcadeCosmetic = { key: string; name: string; emoji: string; tickets: number; kind: 'explorer' | 'inkborn'; part: string; id?: string };
export type ArcadeMode = 'classic' | 'endless';
export type Arcade = {
  id: string; group_id: string; seed: number; name: string; plots: number; owner: Profile; mine: boolean;
  level: { level: number; xp: number; into: number; need: number; max: boolean }; plays: number;
  machines: Record<string, number>; decor: { floor: string; neon: string; lights: string }; decor_owned: string[]; shelf: Record<string, number>;
  games: Record<string, ArcadeGameInfo>; prizes: ArcadePrize[]; decor_catalog: Record<'floor' | 'neon' | 'lights', { id: string; name: string; tickets: number }[]>;
  upgrade: { max: number; bonus: number; costs: Record<string, number> };
  boards: Record<string, { player: Profile; score: number }[]>; boards_endless?: Record<string, { player: Profile; score: number }[]>; me: ArcadeMe; server_time: string;
  cosmetics?: ArcadeCosmetic[]; hot?: { game: string | null; until: string; tickets: number; ink: number }; first_play_tickets?: number;
  /** an Arcade Estate's carnival, out the front door (null for a plain arcade) */ carnival?: ArcadeCarnival | null;
};
export type CarnivalFortune = { card: string; tickets: number; lucky: string | null };
export type CarnivalMe = { treat: { id: string; until: string } | null; fortune: CarnivalFortune | null; fortune_ready: boolean; rides_today: string[] };
export type ArcadeCarnival = {
  games: Record<string, { name: string; emoji: string; order: number; blurb: string; seconds: number }>;
  treats: Record<string, { name: string; emoji: string; cost: number; minutes: number; bonus: number }>;
  rides: Record<string, { name: string; emoji: string; seconds: number; daily_tickets: number }>;
  fortune: { tickets: [number, number]; lucky_chance: number; lucky_mult: number };
  fireworks: { cost: number; xp: number };
  me: CarnivalMe; boards: Record<string, { player: Profile; score: number }[]>;
};
export type ArcadeFinish = { mode?: ArcadeMode; ink_progress?: number; bonus?: string[]; hot?: boolean; score: number; tickets: number; earned: number; paid: number; capped: boolean; best: number; new_best: boolean; record: number; new_record: boolean; owner_cut: number; level_up: number | null; me: ArcadeMe; repeat?: boolean };

// ---- realm plot types (mine, sky island, workshop, restaurant, dungeon) ----
export type Bag = Record<string, number>;
export type RealmRes = { name: string; emoji: string; sell?: number; tier?: number; level?: number; currency?: boolean; made?: boolean };
export type RealmItem = { name: string; emoji: string; blurb?: string; order: number; level?: number; max: number; cost: Bag; growth: number; makes?: Bag; effect?: Record<string, number> };
export type RealmRecipe = { name: string; emoji: string; order: number; level: number; in: Bag; out: Bag; xp: number };
export type RealmFind = { name: string; emoji: string; rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'; level: number; order: number; ink: number };
export type RealmGame = { name: string; emoji: string; blurb: string; level: number; min_seconds: number; max_score: number; drops: { res: string; per_point: number; level: number }[] };
export type RealmCfg = {
  name: string; emoji: string; color: string; currency: string; resources: Record<string, RealmRes>;
  zones: { id: string; name: string; level: number; blurb: string }[];
  producers: Record<string, RealmItem>; upgrades: Record<string, RealmItem>; recipes: Record<string, RealmRecipe>; finds: Record<string, RealmFind>; games: Record<string, RealmGame>;
};
export type RealmMe = { wallet: Bag; lifetime: Bag; finds: Record<string, number>; made: Record<string, number>; bonus_ready: boolean; streak: number; ink_today: number; daily_cap: number; best: Record<string, number> };
export type Realm = {
  id: string; kind: RealmKind; group_id: string | null; seed: number; name: string; plots: number; owner: Profile; mine: boolean;
  level: { level: number; xp: number; into: number; need: number; max: boolean }; plays: number;
  producers: Record<string, number>; upgrades: Record<string, number>; rates: Bag; pending: Bag | null; collected_at: string; away_hours: number;
  effects: { game_mult: number; rare_mult: number; prod_mult: number };
  costs: { producers: Record<string, Bag>; upgrades: Record<string, Bag> };
  cfg: RealmCfg; boards: Record<string, { player: Profile; score: number }[]>; me: RealmMe; server_time: string;
};
export type RealmFinish = {
  score: number; loot: Bag; finds: { id: string; new: boolean }[]; paid: number; earned: number; best: number; new_best: boolean; record: number; new_record: boolean;
  level_up: number | null; me: RealmMe; repeat?: boolean;
};

// ---- clans ----------------------------------------------------------------------------------------------------------
export type ClanRole = 'leader' | 'officer' | 'member';
export type ClanPrivacy = 'open' | 'request' | 'invite';
export type ClanCard = {
  id: string; name: string; tag: string; emblem: string; color: string; motto: string | null; privacy: ClanPrivacy;
  level: number; xp: number; wins: number; losses: number; members: number; cap: number; week_score: number; in_hall: number; renamed_at?: string | null;
};
export type ClanLevel = { level: number; xp: number; into: number; need: number; max: boolean };
export type ClanGoal = { n: number; k: string; cat: string; emoji: string; label: string; unit: 'ink' | 'min'; target: number; progress: number; done: boolean; reward: number; claimed: boolean; claim: string | null };
export type ClanBattle = {
  id: string; status: 'pending' | 'live' | 'done' | 'declined' | 'expired'; challenger: boolean; created_at: string; starts_at: string | null; ends_at: string | null;
  us: number; them: number; won: boolean | null; tie: boolean; vs: ClanCard; mine: number; claim: string | null; claim_ink: number;
};
export type ClanMember = Profile & { role: ClanRole; joined_at: string; explorer_style?: unknown; week_ink: number; week_secs: number; in_hall: boolean };
export type ClanAsk = { id: number; player: Profile; created_at: string };
export type ClanFeedItem = { id: number; kind: string; data: Record<string, unknown>; created_at: string; who: Profile | null; vs: ClanCard | null };
export type Clan = ClanCard & {
  role: ClanRole | null; leader: string | null; created_at: string; level_info: ClanLevel; members_list: ClanMember[];
  asked: boolean; invited: number | null; season_rank: number | null; recent_battles: ClanBattle[];
  // members only
  hall?: { name: string | null; style: HomeStyleData; layout: HomePlaced[] };
  week?: string; week_ends?: string; goals?: ClanGoal[]; last_goals?: ClanGoal[];
  season?: { rank: number | null; ink: number; claim: string | null };
  me?: { week_ink: number; week_secs: number }; battles?: ClanBattle[];
  requests?: ClanAsk[] | null; invites_out?: ClanAsk[] | null; feed?: ClanFeedItem[];
  catalog?: HomeData['catalog']; unlocks?: Record<string, number>;
};
export type ClanHome = {
  clan: (ClanCard & { role: ClanRole }) | null;
  invites: { id: number; clan: ClanCard; by: Profile | null; created_at: string }[];
  requests: string[]; rejoin_at: string | null;
  cfg: { found_cost: number; emblems: string[]; colors: string[]; perks: { level: number; emoji: string; text: string }[]; season: { top: number; ink: number }[]; battle: { hours: number; win_ink: number; lose_ink: number } };
};
export type ClanBoard = { kind: 'week' | 'last' | 'level'; week?: string; ends_at?: string; rows: (ClanCard & { rank: number; score?: number; prize?: number })[]; mine: number | null };
export type ClanBuild = { key: string; name: string; emoji: string; cost: number; level: number; xp: number; progress: number; done: boolean; done_at: string | null; locked: boolean };
export type ClanKeep = {
  clan: ClanCard & { role: ClanRole; renamed_at: string | null };
  stone: number; stone_today: number; stone_cap: number; level: number;
  spirit: { seed: number; bond: number; feeds: number; stage: number; name: string; names: string[]; next: number | null; fed_today: boolean; feeders_today: Profile[]; feed_stone: number; feed_xp: number };
  chest: { need: number; visitors: number; open: boolean; here_today: boolean; claimed: boolean; claim: string | null; ink: number; stone: number; who: Profile[] };
  builds: ClanBuild[];
  training: { mine: number; board: (Profile & { best: number })[] };
};

/** Which of a place's games are open: a quarter on one plot, half on two or three, all on four or more. */
export type PlaceAccess = { plots: number; total: number; open: number; games: string[]; allowed: string[]; next: { plots: number; open: number } | null };

// ---- Travel (v0.9.7) ----------------------------------------------------------------------------
export type TravelMode = 'train' | 'plane';
export type TravelStop = { id: string; kind: 'station' | 'airport'; name: string; code: string; country: string; region: string; lng: number; lat: number; km?: number | null; from_point_km?: number };
export type TravelWayStop = { id: string; name: string; country: string; lng: number; lat: number; t: number };
export type TravelTrip = {
  id: string; mode: TravelMode | 'home'; km: number; leg: number; departs_at: string; arrives_at: string; arrived: boolean;
  from: TravelStop | null; to: TravelStop | null; stops: TravelWayStop[]; group?: boolean;
};
export type TravelArrival = { home?: true; stop?: TravelStop; new_stamp?: boolean; new_country?: boolean; ink?: number; mode?: TravelMode };
export type TravelStatus = {
  train: { plots: number; left: number }; plane: { plots: number; left: number };
  trip: TravelTrip | null; arrival: TravelArrival | null; away: boolean; stamps: number; countries: number; share?: boolean; explorer: ExplorerState | null;
  /** after boarding as a group's leader: who rode along */
  group?: { with: string[]; left_behind: string[] } | null;
};
/** someone else's ride or flight (a train from home shows from its first stop: `from` is null) */
export type TravelTraffic = Profile & {
  trip: string; mode: TravelMode; km: number | null; arrived: boolean; from: TravelStop | null; to: TravelStop; stops: TravelWayStop[];
  /** set off from home: only where it's going shows (no start, no route, no departure time) */
  inbound?: boolean; starts_at: string | null; arrives_at: string;
};
export type TravelPlan = { mode: TravelMode; from: TravelStop; to: TravelStop; board_km: number; left: number; plots: number; km: number; seconds: number; stops: TravelWayStop[] };
export type TravelStamp = TravelStop & { first_at: string; last_at: string; visits: number };
export type TravelBuilding = TravelStop & { visitors: number };
export type TravelStopInfo = TravelStop & { visitors: number; recent: (Profile & { at: string })[]; mine: { first_at: string; visits: number } | null };

// ---- out and about (v0.9.9) ------------------------------------------------------------------------
export type VehicleKind = 'walk' | 'bike' | 'car' | 'jet';
export type VehicleInfo = { id: VehicleKind; name: string; speed_kmh: number; range_m: number; ink: number; fuel: boolean; needs: VehicleKind | null; owned: boolean };
export type VehicleState = { current: VehicleKind; speed_kmh: number; range_m: number; fuel: boolean; all: VehicleInfo[] };
export type MapFindKind = 'crystal' | 'balloon' | 'gift' | 'star';
export type MapFind = { id: string; kind: MapFindKind; lng: number; lat: number };
export type MapFindClaim = { id: string; kind: MapFindKind; ink: number; capped: boolean; today: number; balances: Balances };
/** a group member: where they are only while they're away travelling (never GPS, never home) */
export type TravelGroupMember = Profile & {
  leader: boolean; me: boolean; away: boolean;
  lng?: number; lat?: number; traveling?: boolean; dest_lng?: number | null; dest_lat?: number | null; arrives_at?: string | null;
  fixed_at?: string; speed_mps?: number | null; origin_lng?: number; origin_lat?: number; vehicle?: VehicleKind;
  trip?: { mode: TravelMode | 'home'; to: string | null } | null;
};
export type TravelGroupState = {
  group: { id: string; code: string; leader: boolean; max: number; members: TravelGroupMember[]; invited: Profile[];
    /** the group's private live channel (members only; it changes when someone leaves) */ channel?: string;
    /** a game under way */ game?: { id: string; kind: GroupGameKind; ends_at: string } | null } | null;
  invites: { group_id: string; by: Profile; size: number }[];
};

// ---- travelling together, live (v1.0.0) -------------------------------------------------------------
export type GroupGameKind = 'balloons' | 'race';
export type GroupGame = {
  id: string; kind: GroupGameKind; lng: number; lat: number; starts_at: string; ends_at: string; over: boolean; late?: boolean;
  winner: Profile | null; started_by: string;
  items: { i: number; lng: number; lat: number; c: string; by: string | null }[];
  scores: { id: string; username: string; n: number; me: boolean }[];
};
export type GroupPhoto = { id: string; taken_at: string; stop: TravelStop | null; members: Profile[] };

// ---- v1.1: the daily loop ---------------------------------------------------------------------------------------
export type StreakReward = { day: number; ink: number; ticket: RarityId | null };
export type DailyStatus = { enabled: boolean; streak: number; claimed_today: boolean; best: number; next: StreakReward; calendar: StreakReward[];
  tickets: { id: string; min_rarity: RarityId; source: string }[]; resets_at: string };
export type HotZone = { name: string; gx: number; gy: number; radius: number; day: string };
export type HotZoneInfo = { today: HotZone | null; tomorrow: HotZone | null; ends_at: string; ultra_mult: number; shiny_mult: number; crown_free?: boolean; roll_ink?: number };
export type Collection = { types: { id: PlotTypeId; name: string; owned: number }[]; rarities: { id: RarityId; owned: number; shiny: number }[];
  tiers: { types: number; pct: number }[]; pct: number; multiplier: number };
