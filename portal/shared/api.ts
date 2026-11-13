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
