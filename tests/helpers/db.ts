// Test database helper: creates a fresh database, applies the local shim plus
// every migration (skipping @supabase-only files), and offers helpers to call
// RPCs as anonymous users, authenticated players, the service role or admins.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type Conn = pg.Client;

const ROOT = path.resolve(__dirname, '../..');

export function migrationFiles(): string[] {
  const dir = path.join(ROOT, 'supabase/migrations');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => path.join(dir, f))
    .filter((f) => !fs.readFileSync(f, 'utf8').startsWith('-- @supabase-only'));
}

export function sqlBundle(opts: { localOverrides?: boolean; skip?: string[] } = {}): string[] {
  const parts = [fs.readFileSync(path.join(ROOT, 'supabase/local/shim.sql'), 'utf8')];
  for (const f of migrationFiles()) if (!opts.skip?.some((k) => f.endsWith(k))) parts.push(fs.readFileSync(f, 'utf8'));
  if (opts.localOverrides) parts.push(fs.readFileSync(path.join(ROOT, 'supabase/local/local_overrides.sql'), 'utf8'));
  return parts;
}

function pgConfig() {
  const raw = process.env.LANDVAS_TEST_PG;
  if (!raw) throw new Error('LANDVAS_TEST_PG not set — global setup did not run');
  return JSON.parse(raw) as { host: string; port: number; user: string; password: string };
}

export class TestDb {
  name: string;
  admin!: Conn;
  private pool: Conn[] = [];

  constructor(name?: string) {
    this.name = name ?? `t_${crypto.randomBytes(5).toString('hex')}`;
  }

  async connect(): Promise<Conn> {
    const c = new pg.Client({ ...pgConfig(), database: this.name });
    await c.connect();
    this.pool.push(c);
    return c;
  }

  /**
   * @param opts.ungated turn off location-gated claims (for suites that test
   *   other systems and claim plots all over the grid)
   */
  async init(opts: { localOverrides?: boolean; ungated?: boolean; skip?: string[] } = {}) {
    const root = new pg.Client({ ...pgConfig(), database: 'postgres' });
    await root.connect();
    // like Supabase: UTF-8 text (the test cluster's default template may be SQL_ASCII)
    await root.query(`create database ${this.name} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
    await root.end();
    this.admin = await this.connect();
    for (const sql of sqlBundle(opts)) await this.admin.query(sql);
    if (opts.ungated) await this.admin.query(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
    return this;
  }

  /** Put a player's explorer on a plot instantly (test shortcut: a first GPS fix there). */
  async placeAt(uid: string, gx: number, gy: number) {
    await this.sql('delete from explorers where player_id = $1', [uid]);
    const { lng, lat } = cellCenter(gx, gy);
    return this.rpc(uid, 'report_position', { p_lng: lng, p_lat: lat, p_accuracy_m: 10 });
  }

  /** The next level a plot can play (beaten levels can't be replayed). */
  async nextLevel(uid: string, gx: number, gy: number) {
    const r = await this.sql('select coalesce(max(highest_level), 0) + 1 as n from plot_game_progress where gx = $1 and gy = $2 and player_id = $3', [gx, gy, uid]);
    return Number(r[0].n);
  }

  /** Credit Ink as if earned from minigame wins. */
  async giveInk(uid: string, amount: number) {
    await this.sql(`update resource_balances set amount = amount + $2 where player_id = $1 and resource = 'ink'`, [uid, amount]);
  }

  async close() {
    for (const c of this.pool) await c.end().catch(() => {});
    const root = new pg.Client({ ...pgConfig(), database: 'postgres' });
    await root.connect();
    await root.query(`drop database if exists ${this.name} with (force)`);
    await root.end();
  }

  async createUser(email = `${crypto.randomBytes(4).toString('hex')}@example.test`): Promise<string> {
    const r = await this.admin.query('insert into auth.users (email) values ($1) returning id', [email]);
    return r.rows[0].id as string;
  }

  /** Call a public RPC with named arguments as a given role/user. */
  async rpc<T = any>(
    who: { uid?: string | null; role?: 'anon' | 'authenticated' | 'service_role' } | string | null,
    fn: string,
    args: Record<string, unknown> = {},
    conn?: Conn,
  ): Promise<T> {
    const c = conn ?? this.admin;
    const spec = typeof who === 'string' || who === null ? { uid: who, role: who ? 'authenticated' : 'anon' } : who;
    const role = spec.role ?? (spec.uid ? 'authenticated' : 'anon');
    const keys = Object.keys(args);
    const call = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
    const values = keys.map((k) => {
      const v = args[k];
      return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
    });
    await c.query('begin');
    try {
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: spec.uid ?? '', role }),
      ]);
      await c.query(`set local role ${role}`);
      const r = await c.query(call, values);
      await c.query('commit');
      return r.rows[0]?.r as T;
    } catch (e) {
      await c.query('rollback');
      throw e;
    }
  }

  /** Run raw SQL as the database owner (service-side bookkeeping in tests). */
  async sql<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
    const r = await this.admin.query(text, params as any[]);
    return r.rows as T[];
  }

  async onboard(uid: string, username: string) {
    const terms = (await this.sql(`select value->>'terms_version' as v from public.game_config where key = 'legal'`))[0].v;
    return this.rpc(uid, 'complete_onboarding', { p_username: username, p_accept_terms_version: terms });
  }

  async newPlayer(username: string) {
    const uid = await this.createUser(`${username.toLowerCase()}@example.test`);
    await this.onboard(uid, username);
    return uid;
  }
}

/** Plots per axis (Web Mercator zoom 22). */
export const GRID = 4194304;

export function cellCenter(gx: number, gy: number) {
  const n = Math.PI * (1 - (2 * (gy + 0.5)) / GRID);
  return { lng: ((gx + 0.5) / GRID) * 360 - 180, lat: (180 / Math.PI) * Math.atan(Math.sinh(n)) };
}

export async function expectError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e: any) {
    if (!String(e.message).includes(code)) {
      throw new Error(`expected error "${code}" but got "${e.message}"`);
    }
    return;
  }
  throw new Error(`expected error "${code}" but call succeeded`);
}
