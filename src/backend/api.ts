// Typed RPC wrappers. Every write is authorised and validated in SQL.
import { getBackend } from './backend';
import type {
  Achievement, ArtworkCard, ArtworkDetail, CanvasGroup, Manifest, MinigameFinish, MinigameStart, MyState, PlotDetails,
  PlotRow, ProjectBundle, Publication, VersionInfo, WorldConfig, Balances, Profile, NewAchievement, ExplorerState, CashoutStatus,
  DirectoryPlayer, PlayerLand, Notifications, Announcement, SupportTicket, SupportMessage, Duel, DuelLobby, DuelStart, ExplorerStyle, FriendStatus, FriendsList, ChatMessage, FeedEvent, Referrals, PlotTypeInfo,
} from './types';
import type { RarityInfo } from '../shared/rarity';
import type { RentState } from '../shared/rent';
import type { RarityId } from '../shared/rarity';

const rpc = <T,>(fn: string, args?: Record<string, unknown>) => getBackend().rpc<T>(fn, args);
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
  joystickStep: (lng: number, lat: number) =>
    rpc<ExplorerState & { moved_m: number; clamped: boolean; empty: boolean }>('joystick_step', { p_lng: lng, p_lat: lat }),

  // duels & joystick refills
  duelsLobby: () => rpc<DuelLobby>('duels_lobby'),
  duelCreate: (game: string, stake: number, invite?: string | null) => rpc<DuelStart>('duel_create', { p_game: game, p_stake: stake, p_invite: invite || null, p_idempotency_key: idemKey('duel') }),
  duelAccept: (id: string) => rpc<DuelStart>('duel_accept', { p_duel_id: id, p_idempotency_key: idemKey('duel-accept') }),
  duelCancel: (id: string) => rpc<Duel>('duel_cancel', { p_duel_id: id }),
  duelFinish: (id: string, log: unknown) => getBackend().finishDuel(id, log),
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

  // profile picture & explorer
  setAvatarImage: (path: string | null) => rpc<Profile>('set_avatar_image', { p_path: path }),
  equipExplorer: (style: ExplorerStyle) => rpc<Profile>('equip_explorer', { p_style: style }),

  // referrals
  myReferrals: () => rpc<Referrals>('my_referrals'),
  createReferralCode: (code: string) => rpc<Referrals>('create_referral_code', { p_code: code }),
  redeemReferral: (code: string) => rpc<Referrals>('redeem_referral', { p_code: code }),

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
  galleryList: (section: string, limit = 24, offset = 0, bbox?: { min_gx: number; min_gy: number; max_gx: number; max_gy: number }) =>
    rpc<ArtworkCard[]>('gallery_list', { p_section: section, p_limit: limit, p_offset: offset, p_bbox: bbox ?? null }),
  trendingArtists: () => rpc<{ artist: Profile; appreciations: number; top_artwork: ArtworkCard | null }[]>('trending_artists', { p_days: 7, p_limit: 12 }),
  artworkDetail: (id: string) => rpc<ArtworkDetail>('artwork_detail', { p_publication_id: id }),
  appreciate: (id: string, on: boolean) => rpc<{ appreciated: boolean; appreciation_count: number; achievements: NewAchievement[] }>('appreciate', { p_publication_id: id, p_on: on }),
  profileByUsername: (u: string) => rpc<any>('profile_by_username', { p_username: u }),
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
  devGrantSelfAdmin: () => rpc<MyState>('dev_grant_self_admin'),

  // admin
  admin: {
    overview: () => rpc<any>('admin_overview'),
    announcements: () => rpc<(Announcement & { active: boolean; author?: any })[]>('admin_announcements'),
    saveAnnouncement: (a: { id?: string | null; title: string; body: string; kind: string; link?: string | null; popup: boolean; active: boolean }) =>
      rpc<Announcement>('admin_announcement_save', { p_id: a.id ?? null, p_title: a.title, p_body: a.body, p_kind: a.kind, p_link: a.link || null, p_popup: a.popup, p_active: a.active }),
    deleteAnnouncement: (id: string) => rpc<{ ok: boolean }>('admin_announcement_delete', { p_id: id }),
    duels: () => rpc<any>('admin_duels'),
    supportTickets: (status?: string | null) => rpc<{ tickets: SupportTicket[]; counts: { open: number; answered: number; closed: number } }>('admin_support_tickets', { p_status: status ?? null }),
    searchPlayers: (q: string) => rpc<any[]>('admin_search_players', { p_query: q, p_limit: 60 }),
    playerDetail: (id: string) => rpc<any>('admin_player_detail', { p_player_id: id }),
    setPlayerStatus: (id: string, status: string, until: string | null, reason: string) =>
      rpc('admin_set_player_status', { p_player_id: id, p_status: status, p_until: until, p_reason: reason }),
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
