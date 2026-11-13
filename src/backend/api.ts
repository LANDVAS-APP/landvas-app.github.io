// Typed RPC wrappers. Every write is authorised and validated in SQL.
import { getBackend } from './backend';
import type {
  Achievement, ArtworkCard, ArtworkDetail, CanvasGroup, Manifest, MinigameFinish, MinigameStart, MyState, PlotDetails,
  PlotRow, ProjectBundle, Publication, VersionInfo, WorldConfig, Balances, Profile, NewAchievement, ExplorerState, CashoutStatus,
  DirectoryPlayer, PlayerLand, Notifications, Announcement, SupportTicket, SupportMessage, PvpLobby, PvpStart, EarnOverview, WheelStatus, WheelSlice, RoomStatus, ChallengesNow, Challenge, ExplorerStyle, FriendStatus, FriendsList, ChatMessage, FeedEvent, Referrals, PlotTypeInfo, AppConfig, EmailStatus, OtaManifest } from './types';
import type { RarityInfo } from '../shared/rarity';
import type { RentState } from '../shared/rent';
import type { RarityId } from '../shared/rarity';
import { NATIVE_APP } from '../app/buildFlags';
export type EstateTask = { done: number; need: number; today?: boolean; left_today?: number };
export type EstateState = { group_id: string; name: string; houses: number; cycle: string; today: string; rent_day: boolean; next_rent_day: string; multiplier: number; eligible: boolean;
  tasks: { inspect: EstateTask; repairs: EstateTask; requests: EstateTask; garden: EstateTask }; spots: { idx: number; house: number; what: string; fixed: boolean }[] };
export type EnchantBrief = { id: string; kind: string; serial: number; sigil: number; nickname: string | null; level: number; gx: number; gy: number; titles: string[];
  born_place: string | null; born_at: string; minted: number; population: number; name: string; emoji: string; gene?: string | null };
export type EnchantPartner = { kind: string; id: string | null; gene: string; resonant: boolean; strength: number; perfect: boolean; hybrid: string; ends_at: string; started_at?: string;
  mode: 'swap' | 'graft' | 'chimera' | 'trinity' | 'plot' | 'friend'; aberration: string | null; unstable: boolean; plot_kind: string | null; plot: [number, number] | null; friend: any };
export type PlotSize = { mode: 'grow' | 'shrink'; mult: number; until: string; owner: string; linked: boolean; id: number; prank?: boolean; by_name?: string | null };
export type EnchantView = EnchantBrief & { status: string; xp: number; xp_next: number; xp_prev: number; stats: Record<string, number>; owner: any; first_owner: any;
  clock?: { now: string; skip_s: number; frozen_until: string | null }; partner: EnchantPartner | null; partners?: EnchantPartner[]; size?: PlotSize | null; updated_at?: string;
  view: any; reflected: any; reflect_kind: string | null; attention: string | null; server_time: string; mine?: boolean };
export type EnchantVisitor = { id: string; kind: string; mirror: boolean; owner: any; serial: number; stage: number; feeds?: number; welcomed: boolean; gx: number; gy: number; at: number; hatch_at: number | null; what: 'parasite' | 'egg' };
export type MapSize = { gx: number; gy: number; mode: 'grow' | 'shrink'; mult: number; until: string; from: string; mine: boolean; owner_name: string | null; rarity: string | null; name: string | null; visited: boolean; tips: number;
  /** 100 for a giant, 0.01 for a tiny plot; a prank is someone else's zap, just for show */
  scale?: number; prank?: boolean; by_name?: string | null; by_me?: boolean; plot_type?: string | null };
export type MapWormhole = { id: string; mine: boolean; owner_name?: string | null; until?: number; ends: { gx: number; gy: number; home: boolean; name: string | null; rarity: string | null; place: string | null }[] };
export type EnchantMap = { plots: { id: string; gx: number; gy: number; kind: string; serial: number; level: number; nickname: string | null; status: string; mine: boolean; owner_name: string | null; sigil: number; partner: string | null; frozen: boolean; reflect: string | null; updated_at?: string }[];
  attached: { id: string; what: 'parasite' | 'egg'; stage: number; feeds: number; gx: number; gy: number; at: number | null; hatch_at: number | null; welcomed: boolean; home: [number, number] | null; owner_name: string | null; cells: [number, number][] | null; mine: boolean; on_mine: boolean }[];
  giants: { gx: number; gy: number; mult: number }[]; sizes: MapSize[]; wormholes: MapWormhole[] };
export type EnchantWorld = { giants: { gx: number; gy: number; mult: number; until: string; rarity: string | null; owner_name: string | null; mine: boolean; prank?: boolean; by_name?: string | null }[]; wormholes: MapWormhole[] };
export type LevPos = { lng: number; lat: number; km: number; seg: number; heading: number; done: boolean; paused: boolean };
export type Leviathan = { id: string; gen: number; status: 'warning' | 'walking' | 'enraged' | 'fleeing'; strength: number; hp: number; hp_max: number; path: [number, number][]; path_km: number; speed_kmh: number;
  walk_s: number; walk_at: string; pause_until: string | null; rise_at: string; spawned_at: string; origin: string; exit_sea: string | null; place: string | null; trail: [number, number][];
  shrunk_until: string | null; foretold_until: string | null; roar_at: string | null; target: { gx: number; gy: number; owner_name: string; giant: boolean } | null; cities: string[] | null; pos: LevPos; fighters: number };
export type LevMove = { id: string; kind: string; serial: number; level: number; sigil: number; name: string; move: string; effect: string | null; dmg: number; ready_in: number };
export type LevState = { server_time: string; lev: Leviathan | null;
  feed: { id: number; name: string | null; label: string; emoji: string; dmg: number; at: string; move: string }[] | null;
  top: { player: any; dmg: number; me: boolean }[] | null;
  me: { dmg: number; hits: number; bombs: number; bombs_max: number; bomb_regen_s: number; next_bomb_in: number | null; moves: LevMove[]; rank: number | null; trampled: number } | null;
  last: { id: string; gen: number; status: 'fallen' | 'escaped'; ended_at: string; place: string | null; hp: number; hp_max: number; strength: number; exit_sea: string | null; fighters: number; top: { player: any; dmg: number }[] | null;
    loot: { loot: { fell: boolean; rank: number; share: number; ink: number; enchant?: number; ticket?: string } | null; seen: boolean; dmg: number } | null } | null;
  next_at: string | null; bones: { id: number; gen: number; lng: number; lat: number; at: string; place: string | null; players: number; top: string | null }[] };
export type SpliceFriend = { friend: any; enchantments: { id: string; kind: string; serial: number; sigil: number; level: number; nickname: string | null }[] };
export type SpliceInvite = { id: number; from: any; expires_at: string; theirs: EnchantBrief; yours: EnchantBrief; hybrid: string; perfect: boolean };
export type LuckState = { enabled: boolean; luck: number; max: number; rolls: number; ultra_x: number; armed: number; can_reroll: number; per_roll: number; max_rerolls: number; ink_per_point: number; ink_left_today: number; sacrificed: number; lucky_rolls: number;
  enchant: number; enchant_max: number; enchant_ink: number; enchant_step: number; enchant_base: number; enchant_pct: number };

/** Hears every new balance a call hands back (so the app can show it without re-reading your whole state). */
let balanceSink: ((fn: string, b: Balances) => void) | null = null;
export const onBalances = (cb: typeof balanceSink) => { balanceSink = cb; };
/** Hears the name of every call made (so a refresh afterwards can be limited to what those calls can change). */
let callSink: ((fn: string) => void) | null = null;
export const onCall = (cb: typeof callSink) => { callSink = cb; };
const rpc = async <T,>(fn: string, args?: Record<string, unknown>) => {
  callSink?.(fn);
  const r = await getBackend().rpc<T>(fn, args);
  const b = (r as { balances?: unknown } | null)?.balances;
  if (balanceSink && b && typeof b === 'object' && !Array.isArray(b)) balanceSink(fn, b as Balances);
  return r;
};
export const idemKey = (op: string) => `${op}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export type ClaimResult = {
  gx: number; gy: number; group_id: string; plot_type: string; rarity: RarityId; usd_per_second: number; name: string | null;
  rarity_info?: RarityInfo; type_info?: PlotTypeInfo;
  balances: Balances; rent: RentState; achievements: NewAchievement[];
};
export type MinigameRecords = {
  records: Record<string, { highest_level: number; best_score: number; plays: number; wins: number; total_score: number; last_played_at: string }>;
  level_bests: Record<string, number>;
  rewarded_today: Record<string, number>;
  daily_rewarded_wins_per_game: number;
  resets_at: string;
};

export const api = {
  worldConfig: () => rpc<WorldConfig>('world_config'),
  /** the live settings for the apps and the game's pages (versions, maintenance, pages switched off, links) */
  appConfig: () => rpc<AppConfig>('app_config'),
  /** the file list of the current live build for one kind of app binary */
  otaManifest: (compat: string) => rpc<OtaManifest | null>('ota_manifest', { p_compat: compat }),
  myState: () => rpc<MyState>('my_state'),
  completeOnboarding: (a: { username: string; displayName?: string; avatarSeed: string; avatarStyle: string; accentColor: string; termsVersion: string }) =>
    rpc<MyState>('complete_onboarding', {
      p_username: a.username, p_display_name: a.displayName ?? null, p_avatar_seed: a.avatarSeed,
      p_avatar_style: a.avatarStyle, p_accent_color: a.accentColor, p_accept_terms_version: a.termsVersion,
    }),
  acceptTerms: (version: string) => rpc<MyState>('accept_terms', { p_version: version }),
  updateProfile: (p: { displayName?: string; bio?: string; avatarSeed?: string; avatarStyle?: string; accentColor?: string; featured?: string | null; favorites?: string[] }) =>
    rpc<Profile>('update_profile', {
      p_display_name: p.displayName, p_bio: p.bio, p_avatar_seed: p.avatarSeed, p_avatar_style: p.avatarStyle,
      p_accent_color: p.accentColor, p_featured_publication_id: p.featured ?? undefined, p_favorite_publication_ids: p.favorites,
    }),

  // map
  plotBlocks: (blocks: [number, number][]) => rpc<Record<string, PlotRow[]>>('plot_blocks', { p_blocks: blocks }),
  plotsInBbox: (minGx: number, minGy: number, maxGx: number, maxGy: number) =>
    rpc<PlotRow[]>('plots_in_bbox', { p_min_gx: minGx, p_min_gy: minGy, p_max_gx: maxGx, p_max_gy: maxGy }),
  densityInBbox: (z: number, x0: number, y0: number, x1: number, y1: number) =>
    rpc<[number, number, number][]>('density_in_bbox', { p_z: z, p_x0: x0, p_y0: y0, p_x1: x1, p_y1: y1 }),
  artTileIndex: (z: number, blocks: [number, number][]) => rpc<Record<string, [number, number, number][]>>('art_tile_index', { p_z: z, p_blocks: blocks }),
  plotDetails: (gx: number, gy: number) => rpc<PlotDetails>('plot_details', { p_gx: gx, p_gy: gy }),

  // ownership & economy
  claimStarter: (gx: number, gy: number, name?: string) =>
    rpc<ClaimResult>('claim_starter_plot', { p_gx: gx, p_gy: gy, ...(name?.trim() ? { p_name: name.trim() } : {}) }),
  acquirePlot: (gx: number, gy: number, name?: string) =>
    rpc<ClaimResult & { cost: { ink: number } }>('acquire_plot', { p_gx: gx, p_gy: gy, p_idempotency_key: idemKey('acquire'), ...(name?.trim() ? { p_name: name.trim() } : {}) }),
  /** simple mode: buy a plot from the home screen; the server picks where (and so its rarity) */
  quickBuyPlot: (opts: { ticket?: string; hot?: boolean } = {}) => rpc<ClaimResult & { starter: boolean; shiny?: boolean; hot_zone?: boolean; lucky?: boolean; choices?: RarityId[] | null; choice_types?: string[] | null; choice_shiny?: boolean[] | null; cost: { ink: number }; next_cost: { ink: number; free_left: number } }>('quick_buy_plot', { p_idempotency_key: idemKey('quickbuy'), p_ticket: opts.ticket ?? null, p_hot: !!opts.hot }),
  /** the daily streak: status, and today's check-in */
  dailyStatus: () => rpc<import('./types').DailyStatus>('daily_status'),
  /** every Ultra plot you own and where it stands today */
  myUltras: () => rpc<import('./types').MyUltras>('my_ultras'),
  dailyClaim: () => rpc<{ reward: import('./types').StreakReward & { ticket_id?: string | null }; status: import('./types').DailyStatus; balances: Balances }>('daily_claim'),
  /** today's Hot Zone (a real city with boosted rarities) and tomorrow's */
  hotZone: () => rpc<import('./types').HotZoneInfo>('hot_zone_today'),
  hotZoneCrowd: () => rpc<{ now: number; today: number }>('hot_zone_crowd'),
  /** your plot-type album and the rarities you've found */
  myCollection: () => rpc<import('./types').Collection>('my_collection'),
  // Landlord estates: the monthly checklist that earns rent day
  estateVisit: (id: string) => rpc<EstateState>('estate_visit', { p_group: id }),
  estateRepair: (id: string, idx: number) => rpc<EstateState>('estate_repair', { p_group: id, p_idx: idx }),
  estateRequest: (id: string, help: boolean) => rpc<EstateState>('estate_request', { p_group: id, p_help: help }),
  estateGarden: (id: string) => rpc<EstateState>('estate_garden', { p_group: id }),
  myEstates: () => rpc<EstateState[]>('my_estates'),
  // the Altar of Luck
  luckStatus: () => rpc<LuckState & { per_roll: number; max_rolls: number; plots: { gx: number; gy: number; rarity: RarityId; shiny: boolean; name: string | null; luck: number }[];
    inkborn: { id: string; name: string; genome: unknown; bond: number; luck: number }[]; eggs: { id: string; kind: string; shell: Record<string, string>; mutated: boolean; luck: number }[] }>('luck_status'),
  luckSacrificeInkborn: (id: string) => rpc<LuckState & { gained: number }>('luck_sacrifice_inkborn', { p_id: id }),
  luckSacrificeEgg: (id: string) => rpc<LuckState & { gained: number }>('luck_sacrifice_egg', { p_id: id }),
  /** keep one of the rolls Luck gave you */
  luckArm: (rerolls: number) => rpc<LuckState>('luck_arm', { p_rerolls: rerolls }),
  luckPick: (gx: number, gy: number, idx: number) => rpc<{ rarity: RarityId; usd_per_second: number; achievements: NewAchievement[] }>('luck_pick', { p_gx: gx, p_gy: gy, p_idx: idx }),
  luckSacrificePlot: (gx: number, gy: number) => rpc<LuckState & { gained: number; rarity: RarityId }>('luck_sacrifice_plot', { p_gx: gx, p_gy: gy }),
  luckOfferInkAmount: (ink: number) => rpc<LuckState & { gained: number; cost: number }>('luck_offer_ink_amount', { p_ink: ink }),
  luckEnchant: (charges: number) => rpc<LuckState & { bought: number; cost: number }>('luck_enchant', { p_charges: charges }),
  // enchantments (the Grimoire)
  myEnchantments: () => rpc<EnchantView[]>('my_enchantments'),
  enchantGet: (id: string) => rpc<EnchantView>('enchant_get', { p_id: id }),
  enchantAt: (gx: number, gy: number) => rpc<(EnchantBrief & { owner: any; mine: boolean; partner: any; status: string }) | null>('enchant_at', { p_gx: gx, p_gy: gy }),
  enchantAct: (id: string, action: string, args: Record<string, unknown> = {}) => rpc<EnchantView & { result: any }>('enchant_act', { p_id: id, p_action: action, p_args: args }),
  enchantChronicle: (id: string, before: number | null = null) => rpc<{ id: number; kind: string; data: any; at: string }[]>('enchant_chronicle', { p_id: id, p_before: before }),
  enchantVisitors: () => rpc<EnchantVisitor[]>('enchant_visitors'),
  enchantVisitorAct: (id: string, action: 'shake' | 'welcome' | 'eject') => rpc<{ result: any; visitors: EnchantVisitor[] }>('enchant_visitor_act', { p_id: id, p_action: action }),
  enchantMap: (b: { min_gx: number; min_gy: number; max_gx: number; max_gy: number }) => rpc<EnchantMap>('enchant_map', { p_min_gx: b.min_gx, p_min_gy: b.min_gy, p_max_gx: b.max_gx, p_max_gy: b.max_gy }),
  enchantBestiary: () => rpc<{ kinds: { kind: string; name: string; emoji: string; population: number; minted: number; mine: number }[]; codex: string[]; trinities: string[]; plots: string[]; aberrations: string[]; aberrations_total: number;
    chance: { base: number; charges: number; step: number } }>('enchant_bestiary'),
  enchantWorld: () => rpc<EnchantWorld>('enchant_world'),
  sizeGiantVisit: (gx: number, gy: number) => rpc<{ tipped: boolean; you: number; them: number }>('size_giant_visit', { p_gx: gx, p_gy: gy }),
  sizeUndo: (gx: number, gy: number) => rpc<{ undone: boolean; was_prank: boolean }>('size_undo', { p_gx: gx, p_gy: gy }),
  spliceFriends: () => rpc<SpliceFriend[]>('splice_friends'),
  spliceInvites: () => rpc<SpliceInvite[]>('splice_invites'),
  spliceInviteRespond: (id: number, accept: boolean) => rpc<{ accepted?: boolean; declined?: boolean; hybrid?: string; invites: SpliceInvite[] }>('splice_invite_respond', { p_id: id, p_accept: accept }),
  // the Leviathan
  leviathanState: () => rpc<LevState>('leviathan_state', { p_tick: true }),
  leviathanHit: (move: 'bomb' | 'enchant', n = 1, enchant: string | null = null) => rpc<LevState & { dmg: number; effect: string | null; label: string; fell: boolean }>('leviathan_hit', { p_move: move, p_n: n, p_enchant: enchant }),
  leviathanScrub: (gx: number, gy: number) => rpc<{ scrubbed: boolean; ink: number }>('leviathan_scrub', { p_gx: gx, p_gy: gy }),
  leviathanSeen: (id: string) => rpc<void>('leviathan_seen', { p_lev: id }),
  leviathanMap: (b: { min_gx: number; min_gy: number; max_gx: number; max_gy: number }) => rpc<{ gx: number; gy: number; until: string; mine: boolean }[] | null>('leviathan_map', { p_min_gx: b.min_gx, p_min_gy: b.min_gy, p_max_gx: b.max_gx, p_max_gy: b.max_gy }),
  luckOfferInk: (points: number) => rpc<LuckState & { gained: number; cost: number }>('luck_offer_ink', { p_points: points }),
  /** every city's Crown and who holds it */
  crowns: () => rpc<{ total: number; states: number; countries: number; held: { tier: RarityId; city: string; country: string; holder: string; since: string; mine: boolean; strength: number; rivals: number; need: number }[] }>('crowns'),
  quickBuyQuote: () => rpc<{ ink: number; owned: number; free_left: number; starter: boolean; enabled: boolean }>('quick_buy_quote'),
  namePlot: (gx: number, gy: number, name: string | null) => rpc<{ gx: number; gy: number; name: string | null }>('name_plot', { p_gx: gx, p_gy: gy, p_name: name }),
  upgradePlot: (gx: number, gy: number) =>
    rpc<{ plot: PlotDetails; balances: Balances; rent: RentState; achievements: NewAchievement[] }>('upgrade_plot', { p_gx: gx, p_gy: gy, p_idempotency_key: idemKey('upgrade') }),

  // USD rent & boost
  rentState: () => rpc<RentState>('rent_state'),
  activateBoost: () => rpc<RentState>('activate_boost', { p_idempotency_key: idemKey('boost') }),
  myRentLedger: (limit = 50) => rpc<any[]>('my_rent_ledger', { p_limit: limit }),
  cashoutStatus: () => rpc<CashoutStatus>('cashout_status'),
  requestCashout: (method: string, destination: string) =>
    rpc<{ ok: boolean; request_id: string; amount_usd: number; rent: RentState }>('request_cashout', { p_method: method, p_destination: destination, p_idempotency_key: idemKey('cashout') }),
  cancelCashout: (id: string) => rpc<CashoutStatus>('cancel_cashout', { p_request_id: id }),

  // explorer (the player's own position; never visible to others)
  myExplorer: () => rpc<ExplorerState | null>('my_explorer'),
  reportPosition: (lng: number, lat: number, accuracy: number | null) =>
    rpc<ExplorerState & { accepted: boolean; rejected?: string; wait_seconds?: number; reanchored?: boolean; placed?: boolean }>('report_position', { p_lng: lng, p_lat: lat, p_accuracy_m: accuracy }),
  /** Home: back to your last real location (no GPS prompt) */
  explorerHome: () => rpc<ExplorerState>('explorer_home'),
  joystickStep: (lng: number, lat: number) =>
    rpc<ExplorerState & { moved_m: number; clamped: boolean; empty: boolean }>('joystick_step', { p_lng: lng, p_lat: lat }),

  // travel: ride to real stations and airports (Train and Plane plots)
  travelStatus: () => rpc<import('./types').TravelStatus>('travel_status'),
  travelSearch: (mode: import('./types').TravelMode, q: string | null, at?: { lng: number; lat: number }) =>
    rpc<import('./types').TravelStop[]>('travel_search', { p_mode: mode, p_q: q, p_lng: at?.lng ?? null, p_lat: at?.lat ?? null }),
  travelPlan: (mode: import('./types').TravelMode, to: string) => rpc<import('./types').TravelPlan>('travel_plan', { p_mode: mode, p_to: to }),
  travelDepart: (mode: import('./types').TravelMode, to: string) => rpc<import('./types').TravelStatus>('travel_depart', { p_mode: mode, p_to: to }),
  travelHome: () => rpc<import('./types').TravelStatus>('travel_home'),
  travelFast: () => rpc<import('./types').TravelStatus & { fast_cost: number }>('travel_fast'),
  /** fly anywhere: a pin (or the Hot Zone) — uses one of today's trips */
  travelFlyTo: (lng: number, lat: number, name?: string) => rpc<import('./types').TravelStatus>('travel_fly_to', { p_lng: lng, p_lat: lat, p_name: name ?? null }),
  /** 2 more trips today for 100 Ink */
  travelRefill: () => rpc<{ left: number; cost: number; balances: Balances }>('travel_refill'),
  travelPassport: () => rpc<import('./types').TravelStamp[]>('travel_passport'),
  travelBuildings: (b: { w: number; s: number; e: number; n: number }) => rpc<import('./types').TravelBuilding[]>('travel_buildings', { p_w: b.w, p_s: b.s, p_e: b.e, p_n: b.n }),
  travelTraffic: () => rpc<import('./types').TravelTraffic[]>('travel_traffic'),
  travelShare: (share: boolean) => rpc<{ share: boolean }>('travel_share', { p_share: share }),
  // out and about: vehicles, finds, travel groups
  vehicleBuy: (kind: 'bike' | 'car' | 'jet') => rpc<ExplorerState & { balances: Balances; cost: number }>('vehicle_buy', { p_kind: kind }),
  vehicleUse: (kind: import('./types').VehicleKind) => rpc<ExplorerState>('vehicle_use', { p_kind: kind }),
  mapFinds: (b: { w: number; s: number; e: number; n: number }) => rpc<import('./types').MapFind[]>('map_finds', { p_w: b.w, p_s: b.s, p_e: b.e, p_n: b.n }),
  mapFindClaim: (id: string) => rpc<import('./types').MapFindClaim>('map_find_claim', { p_id: id }),
  travelGroup: () => rpc<import('./types').TravelGroupState>('travel_group'),
  travelGroupCreate: () => rpc<import('./types').TravelGroupState>('travel_group_create'),
  travelGroupJoin: (code: string) => rpc<import('./types').TravelGroupState>('travel_group_join', { p_code: code }),
  travelGroupInvite: (username: string) => rpc<import('./types').TravelGroupState>('travel_group_invite', { p_username: username }),
  travelGroupAccept: (id: string) => rpc<import('./types').TravelGroupState>('travel_group_accept', { p_group: id }),
  travelGroupDecline: (id: string) => rpc<import('./types').TravelGroupState>('travel_group_decline', { p_group: id }),
  travelGroupLeave: () => rpc<import('./types').TravelGroupState>('travel_group_leave'),
  groupGameStatus: () => rpc<import('./types').GroupGame | null>('group_game_status'),
  groupGameStart: (kind: import('./types').GroupGameKind) => rpc<import('./types').GroupGame>('group_game_start', { p_kind: kind }),
  groupGameHit: (game: string, item: number) => rpc<import('./types').GroupGame>('group_game_hit', { p_game: game, p_item: item }),
  groupPhoto: () => rpc<import('./types').GroupPhoto>('travel_group_photo'),
  groupPhotos: () => rpc<import('./types').GroupPhoto[]>('travel_group_photos'),
  travelGroupKick: (id: string) => rpc<import('./types').TravelGroupState>('travel_group_kick', { p_player: id }),
  travelStop: (id: string) => rpc<import('./types').TravelStopInfo>('travel_stop', { p_id: id }),

  // more ways to earn
  earnOverview: () => rpc<EarnOverview>('earn_overview'),
  wheelStatus: () => rpc<WheelStatus>('wheel_status'),
  wheelSpin: () => rpc<{ slice: number; prize: WheelSlice; spins_left: number; balances: Balances; resets_at: string }>('wheel_spin', { p_idempotency_key: idemKey('wheel') }),
  roomEnter: (username: string) => rpc<RoomStatus>('room_enter', { p_username: username }),
  roomCheckin: (username: string) => rpc<RoomStatus & { earned: number; host_earned: number; balances: Balances }>('room_checkin', { p_username: username }),
  challenges: () => rpc<ChallengesNow>('challenges_current'),
  challengeEnter: (challengeId: string, publicationId: string) => rpc<Challenge & { earned: number }>('challenge_enter', { p_challenge_id: challengeId, p_publication_id: publicationId }),
  challengeVote: (challengeId: string, publicationId: string, on: boolean) => rpc<Challenge>('challenge_vote', { p_challenge_id: challengeId, p_publication_id: publicationId, p_on: on }),
  // PvP minigames (free, anonymous)
  pvpLobby: () => rpc<PvpLobby>('pvp_lobby'),
  pvpPlay: (game: string) => rpc<PvpStart>('pvp_play', { p_game: game, p_idempotency_key: idemKey('pvp-play') }),
  pvpFinish: (matchId: string, log: unknown) => getBackend().finishPvp(matchId, log),
  refillJoystickWithInk: () => rpc<ExplorerState & { balances: Balances; cost: number }>('refill_joystick_with_ink', { p_idempotency_key: idemKey('refill') }),
  // updates & support
  notifications: () => rpc<Notifications>('my_notifications'),
  announcements: () => rpc<{ items: Announcement[]; unread: number }>('announcements_list', { p_limit: 30 }),
  markAnnouncementsSeen: () => rpc<{ ok: boolean }>('mark_announcements_seen'),
  supportCreate: (subject: string, category: string, body: string) => rpc<SupportTicket>('support_create', { p_subject: subject, p_category: category, p_body: body }),
  supportMine: () => rpc<SupportTicket[]>('support_my_tickets'),
  supportTicket: (id: string) => rpc<SupportTicket & { thread: SupportMessage[] }>('support_ticket', { p_id: id }),
  supportReply: (id: string, body: string) => rpc<SupportTicket>('support_reply', { p_id: id, p_body: body }),
  supportSetStatus: (id: string, status: 'open' | 'closed') => rpc<SupportTicket>('support_set_status', { p_id: id, p_status: status }),
  publicStats: () => rpc<{ players: number; artworks: number; plots: number; painted_plots: number }>('public_stats'),

  // players
  playersDirectory: (query: string, sort: string, limit = 30, offset = 0) =>
    rpc<{ total: number; rows: DirectoryPlayer[]; sort: string }>('players_directory', { p_query: query, p_sort: sort, p_limit: limit, p_offset: offset }),
  playerLand: (username: string) => rpc<PlayerLand>('player_land', { p_username: username }),
  playerPlaces: (username: string) => rpc<import('./types').PlayerPlaces>('player_places', { p_username: username }),

  // profile picture & explorer
  setAvatarImage: (path: string | null) => rpc<Profile>('set_avatar_image', { p_path: path }),
  equipExplorer: (style: ExplorerStyle) => rpc<Profile>('equip_explorer', { p_style: style }),

  // referrals
  myReferrals: () => rpc<Referrals>('my_referrals'),
  createReferralCode: (code: string) => rpc<Referrals>('create_referral_code', { p_code: code }),
  redeemReferral: (code: string) => rpc<Referrals>('redeem_referral', { p_code: code }),
  // email confirmation (every player confirms their email before playing)
  myEmailStatus: () => rpc<EmailStatus>('my_email_status'),

  // friends
  friendStatus: (id: string) => rpc<{ status: FriendStatus }>('friend_status', { p_player_id: id }),
  friendRequest: (id: string) => rpc<{ status: FriendStatus }>('friend_request', { p_player_id: id }),
  friendRespond: (id: string, accept: boolean) => rpc<{ status: FriendStatus }>('friend_respond', { p_player_id: id, p_accept: accept }),
  friendRemove: (id: string) => rpc<{ status: FriendStatus }>('friend_remove', { p_player_id: id }),
  myFriends: () => rpc<FriendsList>('my_friends'),

  // chat & live feed
  chatRecent: (afterId?: number | null) => rpc<{ messages: ChatMessage[]; muted_until: string | null; enabled: boolean }>('chat_recent', { p_after_id: afterId ?? null, p_limit: 80 }),
  sendChat: (body: string) => rpc<ChatMessage>('send_chat_message', { p_body: body }),
  reportChat: (id: number, reason: string) => rpc('report_chat_message', { p_message_id: id, p_reason: reason }),
  feed: (afterId?: number | null, beforeId?: number | null, limit = 40) => rpc<FeedEvent[]>('feed_recent', { p_after_id: afterId ?? null, p_before_id: beforeId ?? null, p_limit: limit }),

  // the Guide: every live rate and real averages (works signed out)
  gameGuide: () => rpc<import('../guide/model').Guide>('game_guide'),

  // USD rent -> Ink
  convertUsd: (usd: number | null) => rpc<{ ink: number; usd: number; rate: number; balances: Balances; rent: RentState }>('convert_usd_to_ink', { p_usd: usd, p_idempotency_key: idemKey('convert') }),

  // the operator
  ownerStatus: () => rpc<{ claimed: boolean; is_owner: boolean }>('owner_status'),
  claimOwner: (code: string) => rpc<{ ok: boolean; reason?: string; state?: MyState }>('claim_owner', { p_code: code }),
  purchaseUnlock: (key: string) => rpc<{ balances: Balances; unlocks: string[] }>('purchase_unlock', { p_key: key, p_idempotency_key: idemKey('unlock') }),
  myPlots: () => rpc<any[]>('my_plots'),
  myLedger: (limit = 50) => rpc<any[]>('my_ledger', { p_limit: limit }),
  myPalettes: () => rpc<{ id: string; name: string; colors: string[] }[]>('my_palettes'),
  savePalette: (id: string | null, name: string, colors: string[]) => rpc('save_palette', { p_id: id, p_name: name, p_colors: colors }),
  deletePalette: (id: string) => rpc('delete_palette', { p_id: id }),

  // canvas fusion
  myGroups: () => rpc<CanvasGroup[]>('my_groups'),
  // creative games
  myStreak: () => rpc<import('./types').Streak>('my_streak'),
  // Inkborn
  setGroupKind: (groupId: string, kind: import('./types').PlotKind) => rpc<CanvasGroup>('set_group_kind', { p_group_id: groupId, p_kind: kind }),
  mySanctuaries: () => rpc<import('./types').Sanctuaries>('my_sanctuaries'),
  setCompanion: (id: string | null) => rpc<{ companion: import('./types').Companion | null }>('inkborn_set_companion', { p_id: id }),
  sanctuaryDirectory: (query: string, sort: 'lively' | 'new' | 'friends', offset = 0) =>
    rpc<{ items: import('./types').SanctuaryCard[] }>('sanctuary_directory', { p_query: query || null, p_sort: sort, p_limit: 24, p_offset: offset }),
  playdateStart: (mine: string, theirs: string) => rpc<import('./types').PlaydateStart>('inkborn_playdate_start', { p_mine: mine, p_theirs: theirs }),
  playdateFinish: (session: string, score: number) => rpc<import('./types').PlaydateFinish>('inkborn_playdate_finish', { p_session: session, p_score: score }),
  inkEggs: () => rpc<import('./types').InkEgg[]>('inkborn_eggs'),
  inkEggsSeen: () => rpc<{ ok: true }>('inkborn_eggs_seen'),
  inkEggHatch: (egg: string, name: string) => rpc<{ inkborn: import('./types').Inkborn; egg: import('./types').InkEgg }>('inkborn_egg_hatch', { p_egg: egg, p_name: name }),
  habitatGet: (id: string | null) => rpc<import('./types').Habitat>('habitat_get', { p_id: id }),
  farmGet: (id: string) => rpc<import('./types').Farm>('farm_get', { p_id: id }),
  farmForPlot: (gx: number, gy: number) => rpc<{ farm_id: string; name: string; owner: Profile; plots: number; growing: number } | null>('farm_for_plot', { p_gx: gx, p_gy: gy }),
  farmPlant: (farm: string, bed: number, crop: string) => rpc<import('./types').Farm>('farm_plant', { p_farm: farm, p_bed: bed, p_crop: crop }),
  farmWater: (farm: string, bed: number) => rpc<import('./types').Farm>('farm_water', { p_farm: farm, p_bed: bed }),
  farmHarvest: (farm: string, bed: number | null) => rpc<import('./types').Farm>('farm_harvest', { p_farm: farm, p_bed: bed }),
  farmSell: (item: string, qty: number) => rpc<{ sold: number; item: string; paid: number; coins: number; items: Record<string, number>; ink_today: number; daily_cap: number; level_up: number; progress: import('./types').FarmProgress }>('farm_sell', { p_item: item, p_qty: qty }),
  farmUpgrade: (key: string) => rpc<import('./types').FarmProgressResult>('farm_upgrade', { p_key: key }),
  farmBuild: (key: string) => rpc<import('./types').FarmProgressResult>('farm_build', { p_key: key }),
  farmCollect: (key: string) => rpc<import('./types').FarmProgressResult>('farm_collect', { p_key: key }),
  farmCraft: (recipe: string, times: number) => rpc<import('./types').FarmProgressResult>('farm_craft', { p_recipe: recipe, p_times: times }),
  farmOrderFill: (slot: number) => rpc<import('./types').FarmProgressResult>('farm_order_fill', { p_slot: slot }),
  farmChoreClaim: (key: string) => rpc<{ chores: import('./types').FarmChores; paid: number; all_done: boolean }>('farm_chore_claim', { p_key: key }),
  farmTractorTally: (beds: number) => rpc<import('./types').FarmChores>('farm_tractor_tally', { p_beds: beds }),
  farmOrderSkip: (slot: number) => rpc<import('./types').FarmProgressResult>('farm_order_skip', { p_slot: slot }),
  farmGameStart: (farm: string, game: string) => rpc<{ session: string; seed: number; seconds: number; game: string; ink_today: number; daily_cap: number }>('farm_game_start', { p_farm: farm, p_game: game }),
  farmGameFinish: (session: string, score: number) => rpc<{ score: number; earned: number; paid: number; capped: boolean; bonus: Record<string, number>; best: number | null; coins?: number; level_up?: number }>('farm_game_finish', { p_session: session, p_score: score }),
  realmGet: (id: string) => rpc<import('./types').Realm>('realm_get', { p_id: id }),
  realmForPlot: (gx: number, gy: number) => rpc<{ realm_id: string; kind: import('./types').RealmKind; name: string; owner: Profile; plots: number; level: number; plays: number } | null>('realm_for_plot', { p_gx: gx, p_gy: gy }),
  realmCollect: (id: string) => rpc<{ got: import('./types').Bag; level_up: number | null; view: import('./types').Realm }>('realm_collect', { p_id: id }),
  realmBuy: (id: string, type: 'producers' | 'upgrades', item: string) => rpc<{ view: import('./types').Realm }>('realm_buy', { p_id: id, p_type: type, p_item: item }),
  realmMake: (id: string, recipe: string, n = 1) => rpc<{ made: import('./types').Bag; first: boolean; level_up: number | null; view: import('./types').Realm }>('realm_make', { p_id: id, p_recipe: recipe, p_n: n }),
  realmSell: (kind: string, res: string, n?: number) => rpc<{ sold: number; got: number; me: import('./types').RealmMe }>('realm_sell', { p_kind: kind, p_res: res, p_n: n ?? null }),
  /** which of a place's games are open for the size of its land */
  placeAccess: (kind: 'arcade' | 'farm' | 'business' | 'realm', id: string) => rpc<import('./types').PlaceAccess>('place_access', { p_kind: kind, p_id: id }),
  realmStart: (id: string, game: string) => rpc<{ session: string; seed: number; game: string; level: number; best: number | null; record: number | null }>('realm_start', { p_id: id, p_game: game }),
  realmFinish: (session: string, score: number) => rpc<import('./types').RealmFinish>('realm_finish', { p_session: session, p_score: score }),
  realmDaily: (kind: string) => rpc<{ amount: number; streak: number; paid: number; me: import('./types').RealmMe }>('realm_daily', { p_kind: kind }),
  arcadeGet: (id: string) => rpc<import('./types').Arcade>('arcade_get', { p_id: id }),
  arcadeForPlot: (gx: number, gy: number) => rpc<{ arcade_id: string; name: string; owner: Profile; plots: number; level: number; plays: number; machines: number } | null>('arcade_for_plot', { p_gx: gx, p_gy: gy }),
  arcadeStart: (arcade: string, game: string, mode: import('./types').ArcadeMode = 'classic') => rpc<{ session: string; seed: number; game: string; mode: import('./types').ArcadeMode; level: number; hot: boolean; best: number | null; record: number | null }>('arcade_start', { p_arcade: arcade, p_game: game, p_mode: mode }),
  arcadeFinish: (session: string, score: number) => rpc<import('./types').ArcadeFinish>('arcade_finish', { p_session: session, p_score: score }),
  carnivalStart: (arcade: string, game: string) => rpc<{ session: string; seed: number; game: string; seconds: number; mult: number }>('carnival_start', { p_arcade: arcade, p_game: game }),
  carnivalTreat: (arcade: string, treat: string) => rpc<{ treat: string; me: import('./types').ArcadeMe; carnival: import('./types').CarnivalMe }>('carnival_treat', { p_arcade: arcade, p_treat: treat }),
  carnivalFortune: (arcade: string) => rpc<{ fortune: import('./types').CarnivalFortune; me: import('./types').ArcadeMe; carnival: import('./types').CarnivalMe }>('carnival_fortune', { p_arcade: arcade }),
  carnivalRide: (arcade: string, ride: string) => rpc<{ ride: string; tickets: number; seconds: number; me: import('./types').ArcadeMe; carnival: import('./types').CarnivalMe }>('carnival_ride', { p_arcade: arcade, p_ride: ride }),
  carnivalFireworks: (arcade: string) => rpc<{ ok: boolean; me: import('./types').ArcadeMe }>('carnival_fireworks', { p_arcade: arcade }),
  arcadeForGroup: (group: string) => rpc<string | null>('arcade_for_group', { p_group: group }),
  arcadeDaily: () => rpc<{ tickets: number; streak: number; paid: number; me: import('./types').ArcadeMe }>('arcade_daily'),
  arcadePrize: (prize: string) => rpc<{ prize: import('./types').ArcadePrize; me: import('./types').ArcadeMe }>('arcade_prize', { p_prize: prize }),
  arcadeUnlock: (arcade: string, game: string) => rpc<import('./types').Arcade>('arcade_unlock', { p_arcade: arcade, p_game: game }),
  arcadeUpgrade: (arcade: string, game: string) => rpc<import('./types').Arcade>('arcade_upgrade', { p_arcade: arcade, p_game: game }),
  arcadeDecor: (arcade: string, slot: string, id: string) => rpc<import('./types').Arcade>('arcade_decor', { p_arcade: arcade, p_slot: slot, p_id: id }),
  arcadeHallOfFame: (game: string, mode: import('./types').ArcadeMode = 'classic') => rpc<{ player: Profile; score: number }[]>('arcade_hall_of_fame', { p_game: game, p_mode: mode }),
  arcadeLive: (arcade: string, x: number | null, z: number | null, playing: string | null) => rpc<import('./types').ArcadeLive>('arcade_live', { p_arcade: arcade, p_x: x, p_z: z, p_playing: playing }),
  arcadeLeave: () => rpc<void>('arcade_leave'),
  arcadeMatchCreate: (arcade: string, game: string, mode: 'versus' | 'team') => rpc<import('./types').ArcadeMatch>('arcade_match_create', { p_arcade: arcade, p_game: game, p_mode: mode }),
  arcadeMatchJoin: (match: string) => rpc<import('./types').ArcadeMatch>('arcade_match_join', { p_match: match }),
  arcadeMatchLeave: (match: string) => rpc<void>('arcade_match_leave', { p_match: match }),
  arcadeMatchStart: (match: string) => rpc<import('./types').ArcadeMatch>('arcade_match_start', { p_match: match }),
  homeGet: (username: string) => rpc<import('./types').HomeData>('home_get', { p_username: username }),
  homeSave: (name: string | null, style: import('./types').HomeStyleData, layout: import('./types').HomePlaced[]) => rpc<import('./types').HomeData>('home_save', { p_name: name, p_style: style, p_layout: layout }),
  homeDoors: (doors: Record<string, string>) => rpc<import('./types').HomeData>('home_doors', { p_doors: doors }),
  homeBuy: (item: string, key: string) => rpc<{ item: string; qty: number; balances: Balances; tickets: number }>('home_buy', { p_item: item, p_idempotency_key: key }),
  homeLive: (host: string, x: number | null, z: number | null, f: number | null = null) => rpc<import('./types').HomeLive>('home_live', { p_host: host, p_x: x, p_z: z, p_f: f }),
  homeStatus: (username: string) => rpc<import('./types').HomeStatus>('home_status', { p_username: username }),
  homeLeave: () => rpc<void>('home_leave', {}),
  homeGameCreate: (home: string, game: string) => rpc<import('./types').HomeGame>('home_game_create', { p_home: home, p_game: game }),
  homeGameJoin: (id: string) => rpc<import('./types').HomeGame>('home_game_join', { p_game: id }),
  homeGameLeave: (id: string) => rpc<void>('home_game_leave', { p_game: id }),
  homeGameStart: (id: string) => rpc<import('./types').HomeGame>('home_game_start', { p_game: id }),
  homeGameReport: (id: string, places: Record<string, number>) => rpc<import('./types').HomeGame>('home_game_report', { p_game: id, p_places: places }),
  homeChatSend: (home: string, body: string) => rpc<import('./types').PlanetChatMsg>('home_chat_send', { p_home: home, p_body: body }),
  homeChatList: (home: string, after: number) => rpc<{ items: import('./types').PlanetChatMsg[]; shard: number | null }>('home_chat_list', { p_home: home, p_after: after }),
  homeGamePing: (id: string) => rpc<{ host: string; status: string }>('home_game_ping', { p_game: id }),
  homeGameTakeover: (id: string) => rpc<import('./types').HomeGame>('home_game_takeover', { p_game: id }),
  factoryGet: (id: string) => rpc<import('./types').Realm & { factory_core: import('../realms/workshop/factoryCore').FactoryCore }>('factory_get', { p_id: id }),
  factoryBuy: (id: string, piece: string, n = 1) => rpc<{ factory: import('../realms/workshop/factoryCore').FactoryCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null; got?: import('./types').Bag; ink?: number }>('factory_buy', { p_id: id, p_piece: piece, p_n: n }),
  factorySave: (id: string, grid: import('../realms/workshop/factoryCore').Grid) => rpc<{ factory: import('../realms/workshop/factoryCore').FactoryCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null; got?: import('./types').Bag; ink?: number }>('factory_save', { p_id: id, p_grid: grid }),
  factoryCollect: (id: string) => rpc<{ factory: import('../realms/workshop/factoryCore').FactoryCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null; got?: import('./types').Bag; ink?: number }>('factory_collect', { p_id: id }),
  dinerGet: (id: string) => rpc<import('./types').Realm & { diner_core: import('../realms/diner/dinerCore').DinerCore }>('diner_get', { p_id: id }),
  dinerOpen: (id: string) => rpc<{ shift: import('../realms/diner/dinerCore').Shift }>('diner_open', { p_id: id }),
  dinerClose: (id: string, shift: string, served: { i: number; at: number }[]) => rpc<{ diner: import('../realms/diner/dinerCore').DinerCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null; got?: import('./types').Bag; ink?: number } & { result: import('../realms/diner/dinerCore').ShiftResult }>('diner_close', { p_id: id, p_shift: shift, p_served: served }),
  dinerBuy: (id: string, what: 'station' | 'speed' | 'table' | 'decor' | 'crew', arg?: string) => rpc<{ diner: import('../realms/diner/dinerCore').DinerCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null; got?: import('./types').Bag; ink?: number }>('diner_buy', { p_id: id, p_what: what, p_arg: arg ?? null }),
  dinerJar: (id: string) => rpc<{ diner: import('../realms/diner/dinerCore').DinerCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null; got?: import('./types').Bag; ink?: number }>('diner_jar', { p_id: id }),
  dinerPantry: (id: string, items: Record<string, number | boolean>) => rpc<{ diner: import('../realms/diner/dinerCore').DinerCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null; got?: import('./types').Bag; ink?: number }>('diner_pantry', { p_id: id, p_items: items }),
  dungeonGet: (id: string) => rpc<import('./types').Realm & { dungeon_core: import('../realms/dungeon/dungeonCore').DungeonCore }>('dungeon_get', { p_id: id }),
  dungeonStart: (id: string, floor = 1) => rpc<{ dungeon: import('../realms/dungeon/dungeonCore').DungeonCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null }>('dungeon_start', { p_id: id, p_floor: floor }),
  dungeonMove: (id: string, to: string) => rpc<{ dungeon: import('../realms/dungeon/dungeonCore').DungeonCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null } & { event: import('../realms/dungeon/dungeonCore').MoveEvent }>('dungeon_move', { p_id: id, p_to: to }),
  dungeonDescend: (id: string) => rpc<{ dungeon: import('../realms/dungeon/dungeonCore').DungeonCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null } & { new_best: boolean }>('dungeon_descend', { p_id: id }),
  dungeonAct: (id: string, act: 'attack' | 'skill' | 'potion' | 'bomb', hero = 0, target = 0) => rpc<{ dungeon: import('../realms/dungeon/dungeonCore').DungeonCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null } & import('../realms/dungeon/dungeonCore').ActResult>('dungeon_act', { p_id: id, p_act: act, p_hero: hero, p_target: target }),
  dungeonLeave: (id: string) => rpc<{ dungeon: import('../realms/dungeon/dungeonCore').DungeonCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null } & { summary: import('../realms/dungeon/dungeonCore').RunSummary }>('dungeon_leave', { p_id: id }),
  dungeonHero: (id: string, act: 'hire' | 'train' | 'party', hero?: string, party?: string[]) => rpc<{ dungeon: import('../realms/dungeon/dungeonCore').DungeonCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null }>('dungeon_hero', { p_id: id, p_act: act, p_hero: hero ?? null, p_party: party ?? null }),
  brawlGet: (id: string) => rpc<import('./types').Realm & { brawl: import('../brawl/types').BrawlMe }>('brawl_get', { p_id: id }),
  brawlDeckSave: (slot: number, name: string, cards: string[], terrains: string[]) => rpc<import('../brawl/types').BrawlMe>('brawl_deck_save', { p_slot: slot, p_name: name, p_cards: cards, p_terrains: terrains }),
  brawlDeckUse: (slot: number) => rpc<import('../brawl/types').BrawlMe>('brawl_deck_use', { p_slot: slot }),
  brawlPackOpen: (free = false) => rpc<{ cards: import('../brawl/types').PackCard[]; me: import('../brawl/types').BrawlMe }>('brawl_pack_open', { p_free: free }),
  brawlCraft: (card: string, dust = false) => rpc<import('../brawl/types').BrawlMe>('brawl_craft', { p_card: card, p_dust: dust }),
  brawlQueueLeave: () => rpc<import('../brawl/types').BrawlMe>('brawl_queue_leave', {}),
  brawlView: (match: string) => rpc<import('../brawl/types').MatchView>('brawl_view', { p_match: match }),
  brawlLeaderboard: () => rpc<import('../brawl/types').Leaderboard>('brawl_leaderboard', {}),
  brawlHistory: () => rpc<import('../brawl/types').HistoryRow[]>('brawl_history', {}),
  brawlOp: (body: import('../shared/brawl/server').BrawlBody) => getBackend().brawl(body),
  skyGet: (id: string) => rpc<import('./types').Realm & { sky_core: import('../realms/sky/skyCore').SkyCore }>('sky_get', { p_id: id }),
  skyExpand: (id: string, q: number, r: number) => rpc<{ sky: import('../realms/sky/skyCore').SkyCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null }>('sky_expand', { p_id: id, p_q: q, p_r: r }),
  skyBuild: (id: string, q: number, r: number, b: string) => rpc<{ sky: import('../realms/sky/skyCore').SkyCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null }>('sky_build', { p_id: id, p_q: q, p_r: r, p_b: b }),
  skyUpgrade: (id: string, q: number, r: number) => rpc<{ sky: import('../realms/sky/skyCore').SkyCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null }>('sky_upgrade', { p_id: id, p_q: q, p_r: r }),
  skyClear: (id: string, q: number, r: number) => rpc<{ sky: import('../realms/sky/skyCore').SkyCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null }>('sky_clear', { p_id: id, p_q: q, p_r: r }),
  skyHarvest: (id: string, keys: string[] | null) => rpc<{ sky: import('../realms/sky/skyCore').SkyCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null } & { loot: import('./types').Bag; got: Record<string, number>; boosted: string[] }>('sky_harvest', { p_id: id, p_keys: keys }),
  skyDeliver: (id: string, order: string) => rpc<{ sky: import('../realms/sky/skyCore').SkyCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null } & { reward: number; ink: number }>('sky_deliver', { p_id: id, p_order: order }),
  skyReroll: (id: string, order: string) => rpc<{ sky: import('../realms/sky/skyCore').SkyCore; me: import('./types').RealmMe; level: import('./types').Realm['level']; level_up?: number | null }>('sky_reroll', { p_id: id, p_order: order }),
  mineGet: (id: string) => rpc<import('./types').Realm & { mine_core: import('../realms/mine/tiles').MineCore }>('mine_get', { p_id: id }),
  mineDig: (id: string, cells: number[], blast: number | null = null) => rpc<{ dug: number[]; loot: import('./types').Bag; finds: { id: string; new: boolean; at: number }[]; xp: number; ink: number; level_up: number | null; mine: import('../realms/mine/tiles').MineCore; me: import('./types').RealmMe; level: import('./types').Realm['level'] }>('mine_dig', { p_id: id, p_cells: cells, p_blast: blast }),
  mineTool: (id: string, tool: string) => rpc<{ mine: import('../realms/mine/tiles').MineCore; me: import('./types').RealmMe }>('mine_tool', { p_id: id, p_tool: tool }),
  mineBuyDynamite: (id: string, n: number) => rpc<{ mine: import('../realms/mine/tiles').MineCore; me: import('./types').RealmMe }>('mine_buy_dynamite', { p_id: id, p_n: n }),
  mineCrack: (id: string) => rpc<{ loot: import('./types').Bag; find: string | null; new: boolean; ink: number; level_up: number | null; me: import('./types').RealmMe }>('mine_crack', { p_id: id }),
  clanRename: (name: string) => rpc<import('./types').Clan>('clan_rename', { p_name: name }),
  clanKeep: () => rpc<import('./types').ClanKeep>('clan_keep', {}),
  clanSpiritFeed: () => rpc<{ grew: boolean; stage: number; xp: number; stone: number }>('clan_spirit_feed', {}),
  clanChestOpen: () => rpc<{ ink: number; stone: number }>('clan_chest_open', {}),
  clanKeepStart: (game: 'quarry' | 'training') => rpc<{ id: string; seed: number; seconds: number }>('clan_keep_start', { p_game: game }),
  clanKeepFinish: (id: string, score: number) => rpc<{ score: number; stone: number; capped: boolean; record: boolean }>('clan_keep_finish', { p_id: id, p_score: score }),
  clanBuildGive: (key: string, amount: number) => rpc<{ gave: number; done: boolean }>('clan_build_give', { p_key: key, p_amount: amount }),
  clanHome: () => rpc<import('./types').ClanHome>('clan_home', {}),
  clanList: (q: string | null, sort: 'week' | 'level' | 'new' = 'week') => rpc<import('./types').ClanCard[]>('clan_list', { p_q: q, p_sort: sort }),
  clanBoard: (kind: 'week' | 'last' | 'level') => rpc<import('./types').ClanBoard>('clan_board', { p_kind: kind }),
  clanGet: (id: string | null = null) => rpc<import('./types').Clan>('clan_get', { p_id: id }),
  clanFound: (f: { name: string; tag: string; emblem: string; color: string; motto: string | null; privacy: string }) =>
    rpc<import('./types').Clan>('clan_found', { p_name: f.name, p_tag: f.tag, p_emblem: f.emblem, p_color: f.color, p_motto: f.motto, p_privacy: f.privacy }),
  clanEdit: (patch: Record<string, string | null>) => rpc<import('./types').Clan>('clan_edit', { p_patch: patch }),
  clanJoin: (id: string) => rpc<{ joined: boolean; asked?: boolean; clan?: import('./types').Clan }>('clan_join', { p_id: id }),
  clanInvite: (username: string) => rpc<{ invited: import('./types').Profile }>('clan_invite', { p_username: username }),
  clanAnswer: (ask: number, yes: boolean) => rpc<unknown>('clan_answer', { p_ask: ask, p_yes: yes }),
  clanUninvite: (ask: number) => rpc<import('./types').Clan>('clan_uninvite', { p_ask: ask }),
  clanLeave: () => rpc<{ closed: boolean }>('clan_leave', {}),
  clanKick: (player: string) => rpc<import('./types').Clan>('clan_kick', { p_player: player }),
  clanSetRole: (player: string, role: 'leader' | 'officer' | 'member') => rpc<import('./types').Clan>('clan_set_role', { p_player: player, p_role: role }),
  clanChatSend: (body: string) => rpc<import('./types').PlanetChatMsg>('clan_chat_send', { p_body: body }),
  clanChatList: (after: number) => rpc<{ items: import('./types').PlanetChatMsg[]; clan?: string | null }>('clan_chat_list', { p_after: after }),
  clanHallSave: (name: string | null, style: import('./types').HomeStyleData, layout: import('./types').HomePlaced[]) => rpc<import('./types').Clan>('clan_hall_save', { p_name: name, p_style: style, p_layout: layout }),
  clanClaim: (key: string) => rpc<{ ink: number; key: string }>('clan_claim', { p_key: key }),
  clanChallenge: (clan: string) => rpc<import('./types').Clan>('clan_challenge', { p_clan: clan }),
  clanBattleAnswer: (battle: string, yes: boolean) => rpc<import('./types').Clan>('clan_battle_answer', { p_battle: battle, p_yes: yes }),
  homeGameGet: (id: string) => rpc<import('./types').HomeGame>('home_game_get', { p_game: id }),
  arenaLive: (x: number | null, z: number | null, playing: string | null, from: string | null) => rpc<import('./types').ArenaLive>('arena_live', { p_x: x, p_z: z, p_playing: playing, p_from: from }),
  arenaLeave: () => rpc<void>('arena_leave', {}),
  arenaCreate: (game: string, mode: import('./types').ArenaMode) => rpc<import('./types').ArenaMatch>('arena_create', { p_game: game, p_mode: mode }),
  arenaJoin: (match: string) => rpc<import('./types').ArenaMatch>('arena_join', { p_match: match }),
  arenaLeaveMatch: (match: string) => rpc<void>('arena_leave_match', { p_match: match }),
  arenaStart: (match: string) => rpc<import('./types').ArenaMatch>('arena_start', { p_match: match }),
  arenaReport: (match: string, result: unknown) => rpc<import('./types').ArenaMatch>('arena_report', { p_match: match, p_result: result }),
  arenaGet: (match: string) => rpc<import('./types').ArenaMatch>('arena_get', { p_match: match }),
  arcadeMatchResult: (match: string) => rpc<import('./types').ArcadeMatch>('arcade_match_result', { p_match: match }),
  arcadeCosmetic: (key: string) => rpc<{ item: import('./types').ArcadeCosmetic; me: import('./types').ArcadeMe }>('arcade_cosmetic', { p_key: key }),
  inkbornWear: (id: string, slot: string, item: string | null) => rpc<import('./types').Inkborn>('inkborn_wear', { p_id: id, p_slot: slot, p_item: item }),
  bizGet: (id: string) => rpc<import('./types').Business>('biz_get', { p_id: id }),
  bizForPlot: (gx: number, gy: number) => rpc<{ business_id: string; name: string; owner: Profile; plots: number; alltime: number } | null>('biz_for_plot', { p_gx: gx, p_gy: gy }),
  bizSync: (taps: number) => rpc<import('./types').BizState>('biz_sync', { p_taps: taps }),
  bizBuy: (key: string, qty: number) => rpc<import('./types').BizState>('biz_buy', { p_key: key, p_qty: qty }),
  bizUpgrade: (key: string) => rpc<import('./types').BizState>('biz_upgrade', { p_key: key }),
  bizGolden: () => rpc<import('./types').BizState>('biz_golden'),
  bizIpo: () => rpc<import('./types').BizState>('biz_ipo'),
  bizDividend: () => rpc<import('./types').BizState>('biz_dividend'),
  bizTip: (id: string) => rpc<{ paid: number; owner_cash: number }>('biz_tip', { p_biz: id }),
  bizGameStart: (biz: string, game: string) => rpc<{ session: string; seed: number; seconds: number; game: string; ink_today: number; daily_cap: number }>('biz_game_start', { p_biz: biz, p_game: game }),
  bizGameFinish: (session: string, score: number) => rpc<{ score: number; earned: number; paid: number; capped: boolean; cash: number; best: number | null }>('biz_game_finish', { p_session: session, p_score: score }),
  myFarms: () => rpc<{ farms: { id: string; name: string; plots: number; beds_count: number; growing: number; ready: number }[]; items: Record<string, number>; ink_today: number; config: import('./types').FarmConfig }>('my_farms'),
  habitatForPlot: (gx: number, gy: number) => rpc<{ habitat_id: string; name: string; owner: Profile; plots: number; creatures: number } | null>('habitat_for_plot', { p_gx: gx, p_gy: gy }),
  habitatSaveLayout: (id: string, layout: import('./types').Decor[], rev: number) => rpc<import('./types').Habitat>('habitat_save_layout', { p_id: id, p_layout: layout, p_rev: rev }),
  inkbornCreate: (a: { clientKey: string; name: string; source: 'drawn' | 'random' | 'custom'; genome: unknown; drawing: unknown; habitatId?: string | null }) =>
    rpc<import('./types').Inkborn>('inkborn_create', { p_client_key: a.clientKey, p_name: a.name, p_source: a.source, p_genome: a.genome, p_drawing: a.drawing ?? null, p_habitat_id: a.habitatId ?? null }),
  inkbornUpdate: (id: string, name: string | null, genome: unknown | null) => rpc<import('./types').Inkborn>('inkborn_update', { p_id: id, p_name: name, p_genome: genome }),
  inkbornMove: (id: string, habitatId: string) => rpc<import('./types').Inkborn>('inkborn_move', { p_id: id, p_habitat_id: habitatId }),
  // Space
  spaceState: () => rpc<import('./types').SpaceState>('space_state'),
  spaceBuild: (part: string) => rpc<import('./types').SpaceState>('space_build', { p_part: part }),
  spaceUpgradeEngine: () => rpc<import('./types').SpaceState>('space_upgrade_engine'),
  spaceLaunch: (dest: string) => rpc<import('./types').SpaceState>('space_launch', { p_dest: dest }),
  spaceRush: () => rpc<import('./types').SpaceState & { rush_paid: number }>('space_rush'),
  spaceCollect: () => rpc<import('./types').SpaceState>('space_collect'),
  spaceSettle: (name: string) => rpc<import('./types').SpaceState>('space_settle', { p_name: name }),
  spaceWorld: (world: string) => rpc<{ world: string; pilots: number; here: number; recent: Profile[] }>('space_world', { p_world: world }),
  spaceGameStart: (game: string) => rpc<{ session: string; seed: number; game: string; seconds: number }>('space_game_start', { p_game: game }),
  /** `known`: members whose profiles the phone already has (they come back as just their position) */
  planetLive: (world: string, d?: number[] | null, face?: number[] | null, hop = 0, known?: string[] | null) =>
    rpc<import('./types').PlanetLive>('planet_live', { p_world: world, p_d: d ?? null, p_face: face ?? null, p_hop: hop, ...(known?.length ? { p_known: known } : {}) }),
  planetLeave: () => rpc<{ ok: true }>('planet_leave'),
  planetPlotsNear: (world: string, gx0: number, gx1: number, gy0: number, gy1: number) =>
    rpc<import('./types').PlanetPlot[]>('planet_plots_near', { p_world: world, p_gx0: gx0, p_gx1: gx1, p_gy0: gy0, p_gy1: gy1 }),
  planetSectors: (world: string, size: number) => rpc<[number, number, number, boolean][]>('planet_sectors', { p_world: world, p_size: size }),
  digState: (world: string, gx?: number, gy?: number) => rpc<import('./types').DigState>('planet_dig_state', { p_world: world, p_gx: gx ?? null, p_gy: gy ?? null }),
  dig: (world: string, taps: number, d: number[] | null, gx: number, gy: number) => rpc<import('./types').DigState>('planet_dig', { p_world: world, p_taps: taps, p_d: d, p_gx: gx, p_gy: gy }),
  digRefill: (kind: 'free' | 'ink' | 'ration', world: string, gx: number, gy: number) => rpc<import('./types').DigState>('planet_dig_refill', { p_kind: kind, p_world: world, p_gx: gx, p_gy: gy }),
  craftTool: (tool: string) => rpc<import('./types').DigState>('planet_craft_tool', { p_tool: tool }),
  setActivity: (kind: import('./types').ActivityKind, detail: Record<string, string> = {}) => rpc<{ ok: true }>('set_activity', { p_kind: kind, p_detail: detail }),
  warpToPlayer: (player: string) => rpc<import('./types').SpaceState & { spawn: { d: number[]; player: string } | null; with: Profile }>('space_warp_to_player', { p_player: player }),
  spaceSocial: () => rpc<import('./types').SpaceSocial>('space_worlds_social'),
  planetQuests: (world: string) => rpc<import('./types').PlanetQuests>('planet_quests', { p_world: world }),
  planetQuestClaim: (world: string, quest: string) => rpc<import('./types').PlanetQuests>('planet_quest_claim', { p_world: world, p_quest: quest }),
  planetChatSend: (world: string, body: string) => rpc<import('./types').PlanetChatMsg>('planet_chat_send', { p_world: world, p_body: body }),
  planetChatList: (world: string, after: number) => rpc<{ items: import('./types').PlanetChatMsg[]; shard: number | null }>('planet_chat_list', { p_world: world, p_after: after }),
  roverState: () => rpc<import('./types').RoverState>('rover_state'),
  roverBuy: (model: string) => rpc<import('./types').RoverState>('rover_buy', { p_model: model }),
  roverRefuel: (ice: number, ink: number) => rpc<import('./types').RoverState>('rover_refuel', { p_ice: ice, p_ink: ink }),
  roverDrive: (world: string, on: boolean, d: number[] | null) => rpc<import('./types').RoverState>('rover_drive', { p_world: world, p_on: on, p_d: d }),
  roverTick: (world: string, d: number[] | null) => rpc<import('./types').RoverState>('rover_tick', { p_world: world, p_d: d }),
  sanctuaryVisitPing: (habitat: string) => rpc<{ ok: boolean }>('sanctuary_visit_ping', { p_habitat: habitat }),
  baseVisitPing: (world: string, gx: number, gy: number) => rpc<{ ok: boolean }>('planet_base_visit_ping', { p_world: world, p_gx: gx, p_gy: gy }),
  baseCatalog: () => rpc<import('./types').BaseCatalog>('planet_base_catalog'),
  baseSave: (world: string, gx: number, gy: number, layout: import('./types').BaseModule[], rev: number, w = 1, h = 1) =>
    rpc<{ layout: import('./types').BaseModule[]; rev: number; w: number; h: number; spent: Record<string, number>; refunded: Record<string, number>; items: Record<string, number>; state?: import('./types').BaseState }>('planet_base_save', { p_world: world, p_gx: gx, p_gy: gy, p_layout: layout, p_rev: rev, p_w: w, p_h: h }),
  baseState: (world: string, gx: number, gy: number) => rpc<import('./types').BaseState>('planet_base_state', { p_world: world, p_gx: gx, p_gy: gy }),
  baseCollect: (world: string, gx: number, gy: number) => rpc<import('./types').BaseState>('planet_base_collect', { p_world: world, p_gx: gx, p_gy: gy }),
  baseUpgrade: (world: string, gx: number, gy: number, id: string) => rpc<import('./types').BaseState>('planet_base_upgrade', { p_world: world, p_gx: gx, p_gy: gy, p_id: id }),
  researchBuy: (node: string) => rpc<import('./types').BaseResearch & { bought: string }>('base_research_buy', { p_node: node }),
  planetOverview: () => rpc<import('./types').PlanetOverview>('planet_overview'),
  planetHere: (world: string) => rpc<import('./types').PlanetHere>('planet_here', { p_world: world }),
  planetDiscoveries: (world: string) => rpc<import('./types').Discoveries>('planet_discoveries', { p_world: world }),
  planetFind: (world: string, kind: 'shard' | 'alien' | 'poi', idx: number, d: number[] | null) => rpc<import('./types').FindResult>('planet_find', { p_world: world, p_kind: kind, p_idx: idx, p_d: d }),
  baseView: (world: string, gx: number, gy: number) => rpc<import('./types').BaseView>('planet_base_view', { p_world: world, p_gx: gx, p_gy: gy }),
  planetMap: (world: string) => rpc<import('./types').PlanetMap>('planet_map', { p_world: world }),
  planetMeteors: (world: string) => rpc<import('./types').MeteorShower>('planet_meteors', { p_world: world }),
  planetMeteorGrab: (world: string, idx: number, d: number[] | null) => rpc<{ paid: number; earned: number; golden: boolean; capped: boolean }>('planet_meteor_grab', { p_world: world, p_idx: idx, p_d: d }),
  planetClaim: (world: string, gx: number, gy: number) => rpc<import('./types').PlanetMap & { claimed: [number, number]; paid: number; rarity: string; games_unlocked: string[] }>('planet_claim', { p_world: world, p_gx: gx, p_gy: gy }),
  planetRename: (world: string, gx: number, gy: number, name: string) => rpc<{ ok: true }>('planet_rename', { p_world: world, p_gx: gx, p_gy: gy, p_name: name }),
  myPlanetPlots: () => rpc<{ world: string; gx: number; gy: number; name: string | null; rarity: string; games: string[]; claimed_at: string }[]>('my_planet_plots'),
  planetGameStart: (world: string, gx: number, gy: number, game: string) =>
    rpc<{ session: string; seed: number; game: string; seconds: number; rewarded: boolean; rounds_left: number; rarity: string; mult: number }>('planet_game_start', { p_world: world, p_gx: gx, p_gy: gy, p_game: game }),
  planetGameFinish: (session: string, score: number) =>
    rpc<{ score: number; earned: number; paid: number; capped: boolean; rewarded: boolean; mult?: number; best: number | null; repeat?: boolean }>('planet_game_finish', { p_session: session, p_score: score }),
  spaceGameFinish: (session: string, score: number) => rpc<{ score: number; earned: number; paid: number; capped: boolean; best: number | null; repeat?: boolean }>('space_game_finish', { p_session: session, p_score: score }),
  habitatResidents: (groupIds: string[]) => rpc<Record<string, import('./types').Resident[]>>('habitat_residents', { p_groups: groupIds }),
  inkbornCare: (id: string, action: import('./types').CareAction) => rpc<import('./types').Inkborn & { reaction: string; bond_gain: number }>('inkborn_care', { p_id: id, p_action: action }),
  inkbornRelease: (id: string) => rpc('inkborn_release', { p_id: id }),
  adStatus: () => rpc<{ enabled: boolean; used_today: number; daily_cap: number; rewards: Record<string, { enabled: boolean; label: string }> }>('ad_status'),
  myAdReward: (nonce: string) => rpc<{ reward: string; result: Record<string, unknown>; at: string } | null>('my_ad_reward', { p_nonce: nonce }),
  deleteMyAccount: () => rpc<{ ok: boolean }>('delete_my_account', { p_confirm: 'DELETE' }),
  inkbornEconomy: () => rpc<import('./types').InkbornEconomy>('inkborn_economy'),
  habitatSpring: (id: string) => rpc<import('./types').SpringState>('habitat_spring', { p_id: id }),
  habitatCollect: (id: string) => rpc<import('./types').SpringState & { paid: number; capped?: boolean }>('habitat_collect', { p_id: id }),
  inkbornJobStart: (id: string, job: string) => rpc<import('./types').Inkborn>('inkborn_job_start', { p_id: id, p_job: job }),
  keeperGet: () => rpc<import('./types').Keeper>('keeper_get'),
  keeperEventsSeen: (upto: number) => rpc<void>('keeper_events_seen', { p_upto: upto }),
  keeperUpgrade: (key: string) => rpc<import('./types').Keeper>('keeper_upgrade', { p_key: key }),
  keeperBake: (treat: string, times: number) => rpc<import('./types').Keeper>('keeper_bake', { p_treat: treat, p_times: times }),
  keeperFeedTreat: (id: string, treat: string) => rpc<import('./types').Keeper>('keeper_feed_treat', { p_id: id, p_treat: treat }),
  keeperWishClaim: (id: number) => rpc<import('./types').Keeper>('keeper_wish_claim', { p_id: id }),
  keeperExpeditionStart: (region: string, team: string[]) => rpc<import('./types').Keeper>('keeper_expedition_start', { p_region: region, p_team: team }),
  keeperExpeditionClaim: (id: string) => rpc<import('./types').Keeper>('keeper_expedition_claim', { p_id: id }),
  inkbornJobClaim: (id: string) => rpc<import('./types').Inkborn & { paid: number; earned: number; capped: boolean }>('inkborn_job_claim', { p_id: id }),
  inkbornGameStart: (id: string, game: string) => rpc<{ session: string; seed: number; game: string; seconds: number }>('inkborn_game_start', { p_id: id, p_game: game }),
  inkbornGameFinish: (session: string, score: number) => rpc<{ score: number; earned: number; paid: number; capped: boolean; best: number | null; repeat?: boolean }>('inkborn_game_finish', { p_session: session, p_score: score }),
  myAlerts: (limit = 50) => rpc<{ unread: number; items: import('./types').Alert[] }>('my_alerts', { p_limit: limit }),
  alertsUnread: () => rpc<number>('alerts_unread'),
  markAlertsRead: () => rpc<number>('mark_alerts_read'),
  roomSocial: (username: string) => rpc<import('./types').RoomSocial>('room_social', { p_username: username }),
  roomNote: (username: string, body: string, drawing: import('./types').BookDrawing | null = null) => rpc<import('./types').RoomSocial>('room_note', { p_username: username, p_body: body, p_drawing: drawing }),
  roomNoteDelete: (id: number) => rpc('room_note_delete', { p_id: id }),
  sketchArtistsToday: () => rpc<{ count: number; artists: Profile[] }>('sketch_artists_today'),
  adminSetSketchWord: NATIVE_APP ? (undefined as never) : (word: string) => rpc<{ word: string; custom: boolean }>('admin_set_sketch_word', { p_word: word }),
  adminSetPotd: NATIVE_APP ? (undefined as never) : (id: string | null, note?: string) => rpc<{ ok: boolean; title?: string }>('admin_set_potd', { p_publication_id: id, p_note: note ?? null }),
  myEarningsToday: () => rpc<{ total: number; resets_at: string; by_reason: Record<string, number> }>('my_earnings_today'),
  mySketches: (limit = 60) => rpc<{ id: string; word: string; strokes: import('../shared/strokes').Stroke[]; votes: number; place: number | null; prize: number; day: string; live: boolean }[]>('my_sketches', { p_limit: limit }),
  sketchPublic: (id: string) => rpc<{ id: string; word: string; strokes: import('../shared/strokes').Stroke[]; place: number | null; day: string; voting: boolean; artist: import('./types').Profile | null } | null>('sketch_public', { p_id: id }),
  myDoodles: (limit = 60) => rpc<import('./types').DoodleMine['drawings']>('my_doodles', { p_limit: limit }),
  sketchToday: () => rpc<import('./types').SketchToday>('sketch_today'),
  sketchStart: () => rpc<import('./types').SketchToday>('sketch_start'),
  sketchSubmit: (strokes: unknown) => rpc<import('./types').SketchToday>('sketch_submit', { p_strokes: strokes }),
  sketchVote: (id: string, on: boolean) => rpc<import('./types').SketchToday>('sketch_vote', { p_sketch_id: id, p_on: on }),
  doodleMine: () => rpc<import('./types').DoodleMine>('doodle_mine'),
  doodleDrawStart: () => rpc<{ doodle_id: string; choices: string[]; draw_seconds: number }>('doodle_draw_start'),
  doodleDrawSubmit: (id: string, choice: number, strokes: unknown) => rpc<{ ok: boolean; word: string }>('doodle_draw_submit', { p_doodle_id: id, p_choice: choice, p_strokes: strokes }),
  doodleGuessStart: () => rpc<import('./types').DoodleGuess>('doodle_guess_start'),
  doodleGuess: (id: string, guess: string) => rpc<{ correct: boolean; over: boolean; word?: string | null; ink: number; ms?: number; tries_left?: number; drawer_paid?: boolean }>('doodle_guess', { p_doodle_id: id, p_guess: guess }),
  duetStart: () => rpc<import('./types').Duet>('duet_start'),
  duetSubmit: (id: string, strokes: unknown) => rpc<import('./types').Duet>('duet_submit', { p_duet_id: id, p_strokes: strokes }),
  duetsMine: () => rpc<{ enabled: boolean; complete_ink: number; waiting: number; duets: import('./types').Duet[] }>('duets_mine'),
  duetPublic: (id: string) => rpc<import('./types').DuetPublic | null>('duet_public', { p_duet_id: id }),
  duetsRecent: (limit = 24) => rpc<import('./types').DuetPublic[]>('duets_recent', { p_limit: limit }),
  stampInfo: (id: string) => rpc<import('./types').StampInfo>('stamp_info', { p_publication_id: id }),
  stampCollect: (id: string) => rpc<import('./types').StampInfo & { serial: number }>('stamp_collect', { p_publication_id: id, p_idempotency_key: `stamp-${id}-${Date.now().toString(36)}` }),
  stampBook: (username: string) => rpc<(ArtworkCard & { serial: number; collected_at: string })[]>('stamp_book', { p_username: username }),
  fuseCost: (ids: string[]) => rpc<{ added_plots: number; ink: number; balance: number }>('fuse_cost', { p_group_ids: ids }),
  myArtFingerprints: () => rpc<{ id: string; title: string; fp: string; group_id: string; own: boolean }[]>('my_art_fingerprints'),
  getGroup: (id: string) => rpc<CanvasGroup>('get_group', { p_group_id: id }),
  fuseGroups: (ids: string[], name?: string) => rpc<CanvasGroup & { achievements: NewAchievement[] }>('fuse_groups', { p_group_ids: ids, p_name: name ?? null }),
  detachPlots: (groupId: string, cells: [number, number][]) => rpc<{ group: CanvasGroup; new_groups: CanvasGroup[] }>('detach_plots', { p_group_id: groupId, p_cells: cells }),
  renameGroup: (id: string, name: string) => rpc<CanvasGroup>('rename_group', { p_group_id: id, p_name: name }),

  // artwork
  getProject: (id: string) => rpc<ProjectBundle>('get_project', { p_project_id: id }),
  projectVersions: (id: string) => rpc<VersionInfo[]>('project_versions', { p_project_id: id }),
  getVersion: (id: string) => rpc<{ id: string; manifest: Manifest; cells: [number, number][]; owner_id: string }>('get_version', { p_version_id: id }),
  saveDraft: (projectId: string, baseVersionId: string, manifest: Manifest, title?: string, description?: string, force = false) =>
    rpc<{ version_id: string; version_no: number; saved_at: string; achievements: NewAchievement[] }>('save_draft', {
      p_project_id: projectId, p_base_version_id: baseVersionId, p_manifest: manifest, p_title: title ?? null, p_description: description ?? null, p_force: force,
    }),
  restoreVersion: (projectId: string, versionId: string) => rpc<ProjectBundle>('restore_version', { p_project_id: projectId, p_version_id: versionId }),
  requestPublication: (projectId: string, versionId: string, title: string, description: string, rights: boolean) =>
    rpc<{ publication_id: string; cells: [number, number][]; upload_prefix: string }>('request_publication', {
      p_project_id: projectId, p_version_id: versionId, p_title: title, p_description: description, p_rights_affirmed: rights,
    }),
  submitPublication: (id: string) => rpc<{ status: string }>('submit_publication', { p_publication_id: id }),
  cancelPublication: (id: string) => rpc('cancel_publication', { p_publication_id: id }),
  publicationStatus: (id: string) => rpc<Publication>('publication_status', { p_publication_id: id }),
  myPublications: () => rpc<Publication[]>('my_publications'),

  // minigames
  myPlotProgress: () => rpc<Record<string, { game: string; highest_level: number; best_score: number; plays: number; wins: number }>>('my_plot_progress'),
  startMinigame: (game: string, level: number, gx: number, gy: number) => rpc<MinigameStart>('start_minigame', { p_game: game, p_level: level, p_gx: gx, p_gy: gy }),
  finishMinigame: (sessionId: string, log: unknown) => getBackend().finishMinigame(sessionId, log) as Promise<MinigameFinish>,
  myMinigameRecords: () => rpc<MinigameRecords>('my_minigame_records'),

  // social
  featuredToday: (limit = 12) => rpc<(ArtworkCard & { pick: 'potd' | 'staff' | 'community'; note?: string | null })[]>('featured_today', { p_limit: limit }),
  galleryList: (section: string, limit = 24, offset = 0, bbox?: { min_gx: number; min_gy: number; max_gx: number; max_gy: number }) =>
    rpc<ArtworkCard[]>('gallery_list', { p_section: section, p_limit: limit, p_offset: offset, p_bbox: bbox ?? null }),
  trendingArtists: () => rpc<{ artist: Profile; appreciations: number; top_artwork: ArtworkCard | null }[]>('trending_artists', { p_days: 7, p_limit: 12 }),
  artworkDetail: (id: string) => rpc<ArtworkDetail>('artwork_detail', { p_publication_id: id }),
  appreciate: (id: string, on: boolean) => rpc<{ appreciated: boolean; appreciation_count: number; artist_ink?: number; earned?: number; first?: boolean; achievements: NewAchievement[] }>('appreciate', { p_publication_id: id, p_on: on }),
  profileByUsername: (u: string) => rpc<any>('profile_by_username', { p_username: u }),
  setShowcaseBadge: (key: string | null) => rpc<{ showcase_badge: string | null }>('set_showcase_badge', { p_key: key }),
  myPrivacy: () => rpc<Record<string, boolean>>('my_privacy'),
  setPrivacy: (patch: Record<string, boolean>) => rpc<Record<string, boolean>>('set_privacy', { p_patch: patch }),
  royalty: () => rpc<any>('royalty'),
  bannedPlayers: (q: string) => rpc<{ total: number; rows: any[] }>('banned_players', { p_q: q || null, p_limit: 100 }),
  integrityPing: async (signals: Record<string, unknown>) => { const b = getBackend(); if (b.integrityPing) await b.integrityPing(signals); else await rpc('integrity_ping', { p_signals: signals }); },
  myRestriction: () => rpc<any>('my_restriction'),
  rarityRankings: () => rpc<any[]>('rarity_rankings', {}),
  rarityRanking: (rarity: string) => rpc<{ rarity: string; owned: number; rows: any[]; me: number | null }>('rarity_rankings', { p_rarity: rarity }),
  leaderboard: (kind: string, game?: string) => rpc<{ kind: string; rows: any[] }>('leaderboard', { p_kind: kind, p_game: game ?? null }),
  achievements: () => rpc<Achievement[]>('achievements_catalog'),
  events: () => rpc<any[]>('events_list'),
  joinEvent: (id: string) => rpc<any[]>('join_event', { p_event_id: id }),
  reportArtwork: (id: string, reason: string, details: string) => rpc('report_artwork', { p_publication_id: id, p_reason: reason, p_details: details }),
  blockPlayer: (id: string, on: boolean) => rpc('block_player', { p_player_id: id, p_on: on }),
  myBlocks: () => rpc<Profile[]>('my_blocks'),
  submitAppeal: (id: string, message: string) => rpc('submit_appeal', { p_publication_id: id, p_message: message }),
  submitCopyrightClaim: (a: { publicationId: string; name: string; email: string; work: string; signature: string }) =>
    rpc('submit_copyright_claim', {
      p_publication_id: a.publicationId, p_claimant_name: a.name, p_claimant_email: a.email, p_work_description: a.work,
      p_good_faith: true, p_accuracy: true, p_signature: a.signature,
    }),

  reportClientError: (message: string, context: Record<string, unknown>) => rpc('report_client_error', { p_message: message, p_context: context }),
  devGrantSelfAdmin: NATIVE_APP ? (undefined as never) : () => rpc<MyState>('dev_grant_self_admin'),

  // admin (left out of the iOS / Android apps: staff use the admin portal)
  admin: NATIVE_APP ? (undefined as never) : {
    rollGrants: (player: string | null) => rpc<any[]>('admin_roll_grants', { p_player: player }),
    grantRoll: (player: string, rarity: string, after: number, count: number, shiny: boolean, note: string | null, mode: 'claim' | 'luck' = 'claim', slot: number | null = null, plotType: string | null = null) =>
      rpc<any[]>('admin_grant_roll', { p_player: player, p_rarity: rarity, p_after: after, p_count: count, p_shiny: shiny, p_note: note, p_mode: mode, p_slot: slot, p_plot_type: plotType }),
    cancelRollGrant: (id: number) => rpc<any[]>('admin_cancel_roll_grant', { p_id: id }),
    inkPacing: () => rpc<{ config: Record<string, any>; today: any[]; totals?: { players: number; earned: number; paid: number; over_target: number } }>('admin_ink_pacing'),
    setInkPacing: (config: Record<string, unknown>) => rpc<{ config: Record<string, any>; today: any[]; totals?: { players: number; earned: number; paid: number; over_target: number } }>('admin_set_ink_pacing', { p_config: config }),
    leviathan: (action: 'summon' | 'dismiss' | 'status', args: Record<string, unknown> = {}) => rpc<LevState & { cfg: any; history: any[] }>('admin_leviathan', { p_action: action, p_args: args }),
    giveEnchantment: (player: string, kind: string, reason: string, near: { gx: number; gy: number } | null) =>
      rpc<EnchantBrief>('admin_give_enchantment', { p_player: player, p_kind: kind, p_reason: reason, p_near_gx: near?.gx ?? null, p_near_gy: near?.gy ?? null }),
    playerPlots: (player: string) => rpc<any[]>('admin_player_plots', { p_player: player }),
    takePlot: (gx: number, gy: number, reason: string) => rpc<any[]>('admin_take_plot', { p_gx: gx, p_gy: gy, p_reason: reason }),
    setPlotRarity: (gx: number, gy: number, rarity: string, shiny: boolean, reason: string, post = true) =>
      rpc<any[]>('admin_set_plot_rarity', { p_gx: gx, p_gy: gy, p_rarity: rarity, p_shiny: shiny, p_reason: reason, p_post: post }),
    givePlot: (player: string, rarity: string, shiny: boolean, plotType: string | null, reason: string, post: boolean, near: { gx: number; gy: number } | null) =>
      rpc<{ gx: number; gy: number; rarity: string; plots: any[] }>('admin_give_plot', { p_player: player, p_rarity: rarity, p_shiny: shiny, p_plot_type: plotType, p_reason: reason, p_post: post, p_near_gx: near?.gx ?? null, p_near_gy: near?.gy ?? null }),
    integrityList: (level: string | null, q: string) => rpc<any>('admin_integrity_list', { p_level: level, p_q: q || null, p_limit: 200 }),
    integrityScan: (offset: number) => rpc<{ scanned: number; total: number; next: number | null }>('admin_integrity_scan', { p_offset: offset, p_limit: 50 }),
    integrityPlayer: (id: string) => rpc<any>('admin_integrity_player', { p_player: id }),
    integrityPreview: (ids: string[], scope: Record<string, unknown>) => rpc<any[]>('admin_integrity_preview', { p_players: ids, p_scope: scope }),
    integrityAct: (ids: string[], kind: string, until: string | null, preset: string | null, reason: string, proof: string[], scope: Record<string, unknown>, announce: string | null) =>
      rpc<any>('admin_integrity_act', { p_players: ids, p_kind: kind, p_until: until, p_preset: preset, p_reason: reason, p_proof: proof, p_scope: scope, p_announce: announce }),
    integrityUndo: (id: number) => rpc<any>('admin_integrity_undo', { p_action: id }),
    overview: () => rpc<any>('admin_overview'),
    announcements: () => rpc<import('./types').AdminAnnouncement[]>('admin_announcements'),
    draftAnnouncement: (a: { title: string; body: string; kind: Announcement['kind']; link: string | null; popup: boolean }) =>
      rpc<Announcement>('admin_announcement_draft', { p_title: a.title, p_body: a.body, p_kind: a.kind, p_link: a.link || null, p_popup: a.popup }),
    publishAnnouncement: (a: { id: string; title: string; body: string; kind: Announcement['kind']; link: string | null; popup: boolean }) =>
      rpc<Announcement>('admin_announcement_publish', { p_id: a.id, p_title: a.title, p_body: a.body, p_kind: a.kind, p_link: a.link || null, p_popup: a.popup }),
    saveAnnouncement: (a: { id?: string | null; title: string; body: string; kind: string; link?: string | null; popup: boolean; active: boolean }) =>
      rpc<Announcement>('admin_announcement_save', { p_id: a.id ?? null, p_title: a.title, p_body: a.body, p_kind: a.kind, p_link: a.link || null, p_popup: a.popup, p_active: a.active }),
    deleteAnnouncement: (id: string) => rpc<{ ok: boolean }>('admin_announcement_delete', { p_id: id }),
    announcementContent: (id: string, content: import('../updates/Rich').RichContent | null) => rpc<Announcement>('admin_announcement_content', { p_id: id, p_content: content }),
    pvp: () => rpc<any>('admin_pvp'),
    challenges: () => rpc<any[]>('admin_challenges'),
    saveChallenge: (c: { id?: string | null; title: string; theme: string; starts_at: string; ends_at: string; prizes: number[]; entry_ink: number }) =>
      rpc<any[]>('admin_challenge_save', { p_id: c.id ?? null, p_title: c.title, p_theme: c.theme, p_starts_at: c.starts_at, p_ends_at: c.ends_at, p_prizes: c.prizes, p_entry_ink: c.entry_ink }),
    cancelChallenge: (id: string) => rpc<any[]>('admin_challenge_cancel', { p_id: id }),
    playerMinigames: (id: string) => rpc<any>('admin_player_minigames', { p_player_id: id }),
    supportTickets: (status?: string | null) => rpc<{ tickets: SupportTicket[]; counts: { open: number; answered: number; closed: number } }>('admin_support_tickets', { p_status: status ?? null }),
    searchPlayers: (q: string) => rpc<any[]>('admin_search_players', { p_query: q, p_limit: 60 }),
    playerDetail: (id: string) => rpc<any>('admin_player_detail', { p_player_id: id }),
    setPlayerStatus: (id: string, status: string, until: string | null, reason: string, announce: string | null = null) =>
      rpc('admin_set_player_status', { p_player_id: id, p_status: status, p_until: until, p_reason: reason, p_announce: announce }),
    adjustBalance: (id: string, resource: string, delta: number, reason: string) =>
      rpc('admin_adjust_balance', { p_player_id: id, p_resource: resource, p_delta: delta, p_reason: reason }),
    setRole: (id: string, role: string, on: boolean) => rpc('admin_set_role', { p_player_id: id, p_role: role, p_on: on }),
    hideProfile: (id: string, hidden: boolean, reason: string) => rpc('admin_hide_profile', { p_player_id: id, p_hidden: hidden, p_reason: reason }),
    plotLookup: (gx: number, gy: number) => rpc<any>('admin_plot_lookup', { p_gx: gx, p_gy: gy }),
    setPlotLock: (gx: number, gy: number, locked: boolean, reason: string) => rpc('admin_set_plot_lock', { p_gx: gx, p_gy: gy, p_locked: locked, p_reason: reason }),
    releasePlot: (gx: number, gy: number, reason: string) => rpc('admin_release_plot', { p_gx: gx, p_gy: gy, p_reason: reason }),
    clearPlotName: (gx: number, gy: number, reason: string) => rpc('admin_clear_plot_name', { p_gx: gx, p_gy: gy, p_reason: reason }),
    clearAvatar: (id: string, reason: string) => rpc('admin_clear_avatar', { p_player_id: id, p_reason: reason }),
    deleteChat: (id: number, reason?: string) => rpc('admin_delete_chat_message', { p_message_id: id, p_reason: reason ?? null }),
    mutePlayer: (id: string, minutes: number, reason?: string) => rpc<{ muted_until: string | null }>('admin_mute_player', { p_player_id: id, p_minutes: minutes, p_reason: reason ?? null }),
    updatePlotType: (id: string, patch: Record<string, unknown>) => rpc('admin_update_plot_type', { p_id: id, p_patch: patch }),
    updateRarity: (id: RarityId, patch: Record<string, unknown>) => rpc('admin_update_rarity', { p_id: id, p_patch: patch }),
    adjustRent: (id: string, deltaUsd: number, reason: string) => rpc<RentState>('admin_adjust_rent', { p_player_id: id, p_delta_usd: deltaUsd, p_reason: reason }),
    cashoutQueue: (status: string | null = 'requested') => rpc<any[]>('admin_cashout_queue', { p_status: status }),
    decideCashout: (id: string, decision: 'paid' | 'rejected', providerRef?: string, note?: string) =>
      rpc<any[]>('admin_decide_cashout', { p_request_id: id, p_decision: decision, p_provider_ref: providerRef ?? null, p_note: note ?? null }),
    queue: (status = 'open', kind?: string) => rpc<{ cases: any[]; pending_publications: number }>('admin_moderation_queue', { p_status: status, p_kind: kind ?? null }),
    pendingPublications: () => rpc<any[]>('admin_pending_publications', { p_limit: 100 }),
    reviewMode: () => rpc<{ reviews: boolean; mode: string; pending: number }>('admin_review_mode'),
    setReviewMode: (reviews: boolean) => rpc<{ reviews: boolean; mode: string; approved: number; pending: number }>('admin_set_review_mode', { p_reviews: reviews }),
    approveAllPending: () => rpc<{ approved: number }>('admin_approve_all_pending'),
    reviewPublication: (id: string, decision: 'approve' | 'reject', reason?: string) =>
      rpc('admin_review_publication', { p_publication_id: id, p_decision: decision, p_reason: reason ?? null }),
    removePublication: (id: string, reason: string, strike: boolean) => rpc('admin_remove_publication', { p_publication_id: id, p_reason: reason, p_strike: strike }),
    restorePublication: (id: string, reason: string) => rpc('admin_restore_publication', { p_publication_id: id, p_reason: reason }),
    resolveCase: (id: string, status: string, resolution: string) => rpc('admin_resolve_case', { p_case_id: id, p_status: status, p_resolution: resolution }),
    configGet: () => rpc<any>('admin_config_get'),
    configSet: (key: string, value: unknown) => rpc<any>('admin_config_set', { p_key: key, p_value: value }),
    setFlag: (key: string, enabled: boolean) => rpc('admin_set_flag', { p_key: key, p_enabled: enabled }),
    sessions: (filter: string, game?: string) => rpc<any[]>('admin_minigame_sessions', { p_filter: filter, p_game: game ?? null }),
    reviewSession: (id: string, decision: 'clear' | 'void', reason: string) => rpc('admin_review_session', { p_session_id: id, p_decision: decision, p_reason: reason }),
    events: () => rpc<any[]>('admin_events'),
    upsertEvent: (e: Record<string, unknown>) => rpc('admin_upsert_event', { p_event: e }),
    setEventStatus: (id: string, status: string) => rpc('admin_set_event_status', { p_event_id: id, p_status: status }),
    finalizeEvent: (id: string) => rpc('admin_finalize_event', { p_event_id: id }),
    feature: (id: string, section: string, on: boolean, note?: string, criteria?: string) =>
      rpc('admin_feature', { p_publication_id: id, p_section: section, p_on: on, p_note: note ?? null, p_criteria: criteria ?? null }),
    galleryCandidates: () => rpc<any[]>('admin_gallery_candidates'),
    jobs: (status?: string) => rpc<any[]>('admin_jobs', { p_status: status ?? null }),
    retryJob: (id: number) => rpc('admin_retry_job', { p_job_id: id }),
    audit: (limit = 100) => rpc<any[]>('admin_audit_log', { p_limit: limit }),
    clientErrors: () => rpc<any[]>('admin_client_errors', { p_limit: 100 }),
  },
};
