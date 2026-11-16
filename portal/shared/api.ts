// The portal's own database calls (supabase/migrations/…_portal.sql). Every one is authorised in SQL.
import { getBackend } from '../../src/backend/backend';

const rpc = <T = any>(fn: string, args: Record<string, unknown> = {}) => getBackend().rpc<T>(fn, args);

export type WhoAmI = { user_id: string; username: string | null; onboarded: boolean; roles: string[]; staff: boolean; owner: boolean; aal: 'aal1' | 'aal2'; require_mfa: boolean; server_time: string };
export type Day = {
  day: string; ink_in: number; ink_out: number; usd_rent: number; plots: number; released: number; sessions: number; wins: number; cashouts: number; cashout_usd: number;
  res: Record<string, { in: number; out: number; n: number }>; ink_reasons: Record<string, number>; usd: Record<string, number>; plots_by: Record<string, number>;
  signups?: number; active?: number; earners?: number;
};
export type Filter = { col: string; op: string; value?: unknown };
/** Live control → Earning switches (admin_earn_switches) */
export type EarnSwitches = {
  off: { key: string; note: string | null; at: string; by: string | null }[];
  held: Record<string, { n: number; amount: number; last_at: string }>;
  reasons: Record<string, number>; refs: Record<string, number>;
  arcade_games: { id: string; name: string; emoji: string; where: string }[]; secrets: string[];
  minigames: { id: string; name: string }[]; enchantments: { id: string; name: string; emoji: string }[];
  plot_kinds: { id: string; name: string }[]; rarities: { id: string; name: string; tier: string | null; mult: number }[];
};
export type TableInfo = {
  schema: string; name: string; kind: string; rows: number; bytes: number; comment: string | null; rls: boolean; sensitive: boolean; pk: string[];
  columns: { name: string; type: string; nullable: boolean; default: string | null; generated: boolean; comment: string | null }[];
  fks: Record<string, { schema: string; table: string; column: string }>; player_cols: string[];
};

export const portal = {
  whoami: () => rpc<WhoAmI>('portal_whoami'),
  // staff
  series: (days: number, tz: string) => rpc<{ tz: string; days: Day[] }>('portal_admin_series', { p_days: days, p_tz: tz }),
  players: (a: { q?: string; status?: string | null; role?: string | null; sort?: string; desc?: boolean; limit?: number; offset?: number }) =>
    rpc<{ total: number; rows: any[]; statuses: Record<string, number> }>('portal_admin_players', {
      p_q: a.q || null, p_status: a.status ?? null, p_role: a.role ?? null, p_sort: a.sort ?? 'last_active_at', p_desc: a.desc ?? true, p_limit: a.limit ?? 50, p_offset: a.offset ?? 0,
    }),
  player: (id: string) => rpc<any>('portal_admin_player', { p_player: id }),
  playerTables: (id: string) => rpc<{ schema: string; table: string; column: string; rows: number }[]>('portal_admin_player_tables', { p_player: id }),
  playerSeries: (id: string, days: number, tz: string) => rpc<Day[]>('portal_admin_player_series', { p_player: id, p_days: days, p_tz: tz }),
  ledger: (a: { player?: string | null; kind?: 'resource' | 'usd'; resource?: string | null; reason?: string | null; before?: number | null; limit?: number }) =>
    rpc<{ rows: any[]; next: number | null }>('portal_admin_ledger', {
      p_player: a.player ?? null, p_kind: a.kind ?? 'resource', p_resource: a.resource ?? null, p_reason: a.reason ?? null, p_before: a.before ?? null, p_limit: a.limit ?? 100,
    }),
  economy: (days: number) => rpc<any>('portal_admin_economy', { p_days: days }),
  map: (player?: string | null) => rpc<{ owners: [string, string][]; plots: [number, number, string, number, number, string, number, string | null][] }>('portal_admin_map', { p_player: player ?? null }),
  audit: (a: { q?: string; action?: string | null; actor?: string | null; target?: string | null; before?: number | null; limit?: number }) =>
    rpc<{ rows: any[]; next: number | null; actions: string[] }>('portal_admin_audit', {
      p_q: a.q || null, p_action: a.action ?? null, p_actor: a.actor ?? null, p_target: a.target ?? null, p_before: a.before ?? null, p_limit: a.limit ?? 100,
    }),
  names: (ids: string[]) => rpc<Record<string, string>>('portal_admin_names', { p_ids: ids }),
  // owner
  tables: () => rpc<TableInfo[]>('portal_admin_tables'),
  rows: (a: { schema: string; table: string; filters?: Filter[]; sort?: string | null; desc?: boolean; limit?: number; offset?: number }) =>
    rpc<{ rows: any[]; total: number; exact: boolean; pk: string[]; sensitive: boolean }>('portal_admin_rows', {
      p_schema: a.schema, p_table: a.table, p_filters: a.filters ?? [], p_sort: a.sort ?? null, p_desc: a.desc ?? true, p_limit: a.limit ?? 50, p_offset: a.offset ?? 0,
    }),
  row: (schema: string, table: string, pk: Record<string, unknown>) => rpc<any>('portal_admin_row', { p_schema: schema, p_table: table, p_pk: pk }),
  rowUpdate: (schema: string, table: string, pk: Record<string, unknown>, patch: Record<string, unknown>, reason: string) =>
    rpc<any>('portal_admin_row_update', { p_schema: schema, p_table: table, p_pk: pk, p_patch: patch, p_reason: reason }),
  rowInsert: (schema: string, table: string, row: Record<string, unknown>, reason: string) => rpc<any>('portal_admin_row_insert', { p_schema: schema, p_table: table, p_row: row, p_reason: reason }),
  rowDelete: (schema: string, table: string, pk: Record<string, unknown>, reason: string) => rpc<any>('portal_admin_row_delete', { p_schema: schema, p_table: table, p_pk: pk, p_reason: reason }),
  sql: (query: string) => rpc<{ columns: string[]; rows: unknown[][]; count: number; truncated: boolean; ms: number; error?: string; state?: string }>('portal_admin_sql', { p_query: query }),
  setMfa: (on: boolean) => rpc<WhoAmI>('portal_admin_set_mfa', { p_on: on }),
  // arcade secrets (economy staff)
  secrets: () => rpc<SecretsAdmin>('admin_arcade_secrets'),
  secretSave: (id: string, cfg: Record<string, any>) => rpc<SecretsAdmin>('admin_arcade_secret_save', { p_id: id, p_cfg: cfg }),
  secretFinder: (id: string, player: string, found: boolean) => rpc<SecretStats>('admin_arcade_secret_finder', { p_id: id, p_player: player, p_found: found }),
  // fair play: the egg loop (moderators look, economy staff fix) and ultras & rent
  earnSwitches: () => rpc<EarnSwitches>('admin_earn_switches'),
  earnSwitch: (key: string, off: boolean, note: string | null) => rpc<EarnSwitches>('admin_earn_switch', { p_key: key, p_off: off, p_note: note }),
  eggLoopScan: (min = 1) => rpc<EggLoopScan>('admin_egg_loop_scan', { p_min: min }),
  eggLoopPlayer: (id: string) => rpc<EggLoopPlayer>('admin_egg_loop_player', { p_player: id }),
  eggLoopFix: (id: string, plots: { gx: number; gy: number; action: 'downgrade' | 'take'; rarity?: string | null }[], reason: string) =>
    rpc<EggLoopPlayer & { done: number; results: { gx: number; gy: number; ok: boolean; why?: string }[] }>('admin_egg_loop_fix', { p_player: id, p_plots: plots, p_reason: reason }),
  eggLoopUndo: (fix: number) => rpc<EggLoopPlayer>('admin_egg_loop_undo', { p_fix: fix }),
  eggLoopReverse: (id: string, plots: { gx: number; gy: number }[], mode: 'all' | 'extra', reason: string, preview: boolean) =>
    rpc<any>('admin_egg_loop_reverse', { p_player: id, p_plots: plots, p_mode: mode, p_reason: reason, p_preview: preview }),
  eggLoopReverseUndo: (id: number) => rpc<EggLoopPlayer & { ink_returned: number; usd_returned: number }>('admin_egg_loop_reverse_undo', { p_id: id }),
  ultraScan: (a: { q?: string; min?: number; sort?: 'boosted' | 'ultras' | 'crowns' | 'plots'; limit?: number }) =>
    rpc<UltraScan>('admin_ultra_scan', { p_q: a.q || null, p_min: a.min ?? 1, p_sort: a.sort ?? 'boosted', p_limit: a.limit ?? 200 }),
  playerUltras: (id: string) => rpc<PlayerUltras>('admin_player_ultras', { p_player: id }),
  // players
  me: () => rpc<any>('portal_me_summary'),
  meSeries: (days: number, tz: string) => rpc<Day[]>('portal_me_series', { p_days: days, p_tz: tz }),
  meLedger: (a: { resource?: string | null; reason?: string | null; from?: string | null; to?: string | null; before?: number | null; limit?: number }) =>
    rpc<{ rows: any[]; next: number | null; reasons: { resource: string; reason: string; in: number; out: number; n: number }[] }>('portal_me_ledger', {
      p_resource: a.resource ?? null, p_reason: a.reason ?? null, p_from: a.from ?? null, p_to: a.to ?? null, p_before: a.before ?? null, p_limit: a.limit ?? 100,
    }),
  meRent: (a: { kind?: string | null; before?: number | null; limit?: number }) =>
    rpc<{ rows: any[]; next: number | null; totals: Record<string, { usd: number; n: number }> }>('portal_me_rent', { p_kind: a.kind ?? null, p_before: a.before ?? null, p_limit: a.limit ?? 100 }),
  mePlots: () => rpc<{ mult: number; plots: MyPlot[] }>('portal_me_plots'),
  mePlot: (gx: number, gy: number) => rpc<any>('portal_me_plot', { p_gx: gx, p_gy: gy }),
  meTables: () => rpc<{ schema: string; table: string; column: string; rows: number }[]>('portal_me_tables'),
  meRows: (table: string, column: string, limit = 100, offset = 0, full = false) =>
    rpc<{ rows: any[]; total: number }>('portal_me_rows', { p_table: table, p_column: column, p_limit: limit, p_offset: offset, p_full: full }),
};

export type MyPlot = {
  gx: number; gy: number; rarity: string; plot_type: string; level: number; name: string | null; shiny: boolean; locked: boolean; claimed_at: string | null;
  painted: boolean; art_publication_id: string | null; rate: number; base_rate: number; city: string | null; state: string | null; country: string | null; country_name: string | null;
  group: { id: string; name: string; kind: string; plots: number } | null;
  enchantment: { id: string; kind: string; nickname: string | null; level: number; serial: number; status: string } | null;
  progress: { game: string; level: number; best: number; plays: number; wins: number; at: string } | null;
  acquired: { method: string; cost: Record<string, number> | null; at: string } | null;
};

export type SecretStats = { finders: number; finders_7d: number; plays: number; plays_24h: number; players_24h: number; ink: number; ink_7d: number; tokens?: number | null;
  games: Record<string, number>; recent: { player: { id: string; username: string; [k: string]: any }; found_at: string }[] };
export type SecretRow = { id: string; cfg: Record<string, any>; updated_at: string; updated_by: { username: string } | null; stats: SecretStats };
export type HallCabinet = { id: string; name: string; emoji: string; color: string; order: number; level: number | null; cell: [number, number] | null };
export type SecretsAdmin = { secrets: SecretRow[]; cabinets: HallCabinet[] };

export type EggLoopStats = { sacrificed: number; luck_from_inkborn: number; luck_total: number; first_at: string | null; last_at: string | null; peak_day: number;
  made: number; alive: number; eggs: number; after_fix: number; could_have: number; excess: number };
export type EggLoopScan = { fixed_at: string; rows: { player: any; email: string | null; status: string; stats: EggLoopStats;
  rolls: { n: number; improved: number; ultras: number; open: number; fixed: number } }[] };
export type EggLoopPlot = { gx: number; gy: number; rolled_at: string; options: string[]; shinies: boolean[] | null; kept: number; kept_rarity: string; own: string; own_shiny: boolean;
  improved: boolean; ultra: boolean; in_window: boolean; theirs: boolean; rarity: string | null; shiny: boolean; name: string | null; level: number | null;
  fix: { id: number; action: 'downgrade' | 'take'; from: string; to: string | null; at: string } | null };
export type EggLoopPlayer = { player: any; email: string | null; stats: EggLoopStats; fixed_at: string; days: { day: string; inkborn: number; luck: number }[];
  plots: EggLoopPlot[]; fixes: { id: number; gx: number; gy: number; action: 'downgrade' | 'take'; from: string; from_shiny: boolean; to: string | null; to_shiny: boolean | null;
    reason: string; at: string; by: string | null; undone_at: string | null }[];
  reversals: { id: number; mode: 'all' | 'extra'; plots: number; ink_games: number; usd: number; usd_taken: number; usd_as_ink: number; ink_taken: number;
    plots_removed: { gx: number; gy: number; rarity: string; ink: number }[]; plots_ink: number; debt: number; reason: string; at: string; by: string | null; undone_at: string | null }[];
  owed: number; tiers: { id: string; name: string; ultra: boolean }[]; can_fix: boolean; can_take: boolean };
export type UltraRow = { player: any; email: string | null; ultras: number; crowns: number; shiny_ultras: number; plots: number; rate: number; day: number; day_free_boosts: number;
  day_boosted: number; by_rarity: { rarity: string; n: number }[]; egg_loop: number };
export type UltraScan = { boost_mult: number; free_boost_seconds: number; totals: { players: number; ultras: number; crowns: number; day: number; day_boosted: number }; rows: UltraRow[] };
export type PlayerUltras = { plots: number; ultras: number; crowns: number; shiny_ultras: number; by_rarity: { rarity: string; n: number; shiny: number }[];
  list: { gx: number; gy: number; rarity: string; shiny: boolean; level: number; name: string | null; claimed_at: string | null; rate: number; luck: boolean }[];
  rent_mult: number; boost_mult: number; free_boost_seconds: number; rate: number; ultra_rate: number; extras_day: number; day: number; day_free_boosts: number; day_boosted: number;
  egg_loop: EggLoopStats | null };
