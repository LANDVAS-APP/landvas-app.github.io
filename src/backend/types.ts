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
  bio: string | null;
  created_at: string;
};

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

export type ShopItem = { key: string; name: string; kind: string; description: string; cost: Partial<Balances>; requires?: string; enabled?: boolean };

export type WorldConfig = {
  grid: { level: number; size: number; plot_px: number; art_min_zoom: number; art_max_zoom: number };
  plot_types: PlotTypeInfo[];
  rarities: RarityInfo[];
  economy: any;
  rent: { enabled: boolean; currency: string; level_bonus: number; max_offline_days: number; boost: { multiplier: number; minutes_per_boost: number; max_stack_hours: number; free_per_day: number; reset_hour_utc: number }; cashout: { minimum_usd: number; methods: string[] } };
  explorer: { claim_reach: number; max_speed_kmh: number; manual_travel: boolean; travel_speed_kmh: number; jump_cooldown_hours: number };
  limits: { max_canvas_side: number; max_canvas_plots: number; max_layers_base: number; max_layers_hard: number; plot_px: number };
  shop: { items: ShopItem[] };
  legal: { terms_version: string; privacy_version: string; support_email: string; abuse_email: string; copyright_email: string };
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
  mode: 'gps' | 'manual';
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
  server_time: string;
};

export type CashoutStatus = {
  enabled: boolean;
  minimum_usd: number;
  methods: string[];
  message: string;
  open_request: { id: string; amount_usd: number; created_at: string } | null;
  history: { id: string; amount_usd: number; status: string; method: string; created_at: string; decided_at: string | null }[];
};

export type Neighbor = { gx: number; gy: number; dir: 'n' | 's' | 'e' | 'w'; plot_type: PlotTypeId; rarity: RarityId; owned: boolean; is_mine: boolean; owner_username: string | null; group_id: string | null; same_group: boolean };

export type PlotDetails = {
  gx: number;
  gy: number;
  center: { lng: number; lat: number };
  plot_type: PlotTypeId;
  type_info: PlotTypeInfo;
  rarity: RarityId;
  rarity_info: RarityInfo;
  rent: { usd_per_second: number; boost_multiplier: number };
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
  acquire?: { ink?: number; owned?: number; plot_type?: string; rarity?: RarityId; starter_available: boolean };
  available?: boolean;
};

/** Compact row from plots_in_bbox: [gx, gy, type, level, is_mine, group_id, has_art, username, accent, rarity] */
export type PlotRow = [number, number, PlotTypeId, number, boolean | null, string | null, boolean, string | null, string | null, RarityId];

export type GroupCell = [number, number, PlotTypeId, number, boolean];
export type CanvasGroup = {
  id: string;
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
export type Manifest = { layers: ManifestLayer[] };

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
  center_lng: number;
  center_lat: number;
  min_gx: number;
  min_gy: number;
  max_gx: number;
  max_gy: number;
  status: PublicationStatus;
  artist: Profile;
  appreciated: boolean;
  note?: string;
  criteria?: string;
};

export type ArtworkDetail = ArtworkCard & {
  description: string | null;
  cells: [number, number][];
  is_owner: boolean;
  color_count: number | null;
  decision_reason: string | null;
  live_plots: number;
  featured: string[];
  more_by_artist: ArtworkCard[];
};

export type Achievement = { key: string; name: string; description: string; icon: string; category: string; threshold: number; reward: Partial<Balances>; progress: number; unlocked_at: string | null; unlocked_by: number };
export type NewAchievement = { key: string; name: string; description: string; icon: string; reward: Partial<Balances> };

export type MinigameStart = { session_id: string; game: GameId; level: number; seed: number; plot_level: number; started_at: string; expires_at: string; server_time: string };
export type MinigameFinish = {
  status: 'validated' | 'rejected' | 'expired';
  valid: boolean;
  passed: boolean;
  score: number;
  stars: number;
  flags: string[];
  new_best: boolean;
  rewards: { ink: number; pigments: number; brush_points: number; held: boolean; multiplier: number; practice: boolean; rewarded_left: number; resets_at: string };
  record: { highest_level: number; best_score: number; plays: number; wins: number };
  balances: Balances;
  achievements: NewAchievement[];
  summary?: Record<string, unknown>;
};

export type MapUpdate = { id: number; kind: 'art' | 'ownership'; min_gx: number; min_gy: number; max_gx: number; max_gy: number; publication_id: string | null };
