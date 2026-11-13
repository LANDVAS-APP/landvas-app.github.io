// The portal (admin.landvas.app, my.landvas.app): who can call what, two-step sign-in for staff,
// the owner's data explorer and SQL console, and players only ever seeing their own rows.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, cellCenter, expectError } from '../helpers/db';

const db = new TestDb();
let owner: string, mod: string, alice: string, bob: string;
const HOME = { gx: 793536, gy: 1576240 };

/** call as a user with a given sign-in assurance level (aal2 = verified with an authenticator app) */
async function as(uid: string, aal: 'aal1' | 'aal2', fn: string, args: Record<string, unknown> = {}) {
  const c = db.admin;
  const keys = Object.keys(args);
  await c.query('begin');
  try {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated', aal })]);
    await c.query('set local role authenticated');
    const r = await c.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`,
      keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
    await c.query('commit');
    return r.rows[0]?.r;
  } catch (e) {
    await c.query('rollback');
    throw e;
  }
}

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 3 });
  owner = await db.newPlayer('owner_one');
  mod = await db.newPlayer('mod_one');
  alice = await db.newPlayer('alice_p');
  bob = await db.newPlayer('bob_p');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner'), ($2, 'moderator')`, [owner, mod]);
  for (const [uid, dx] of [[alice, 0], [bob, 50]] as const) {
    const { lng, lat } = cellCenter(HOME.gx + dx, HOME.gy);
    await db.rpc(uid, 'report_position', { p_lng: lng, p_lat: lat, p_accuracy_m: 10 });
    await db.rpc(uid, 'claim_starter_plot', { p_gx: HOME.gx + dx, p_gy: HOME.gy });
  }
});
afterAll(() => db.close());

describe('portal: staff access', () => {
  it('who-am-I tells staff from players', async () => {
    expect((await db.rpc(owner, 'portal_whoami')).owner).toBe(true);
    const m = await db.rpc(mod, 'portal_whoami');
    expect(m.staff).toBe(true);
    expect(m.owner).toBe(false);
    expect((await db.rpc(alice, 'portal_whoami')).staff).toBe(false);
  });

  it('players get nothing from admin functions', async () => {
    for (const fn of ['portal_admin_series', 'portal_admin_players', 'portal_admin_map', 'portal_admin_economy', 'portal_admin_tables', 'portal_admin_audit']) {
      await expectError(db.rpc(alice, fn), 'forbidden');
    }
    await expectError(db.rpc(alice, 'portal_admin_player', { p_player: bob }), 'forbidden');
    await expectError(db.rpc(alice, 'portal_admin_sql', { p_query: 'select 1' }), 'forbidden');
  });

  it('moderators see players but not the data explorer, SQL or economy', async () => {
    expect((await db.rpc(mod, 'portal_admin_players', { p_q: 'alice' })).rows).toHaveLength(1);
    const p = await db.rpc(mod, 'portal_admin_player', { p_player: alice });
    expect(p.profile.username).toBe('alice_p');
    expect(p.counts.plots).toBe(1);
    expect(p.player.push_token).toBeUndefined();
    await expectError(db.rpc(mod, 'portal_admin_tables'), 'forbidden');
    await expectError(db.rpc(mod, 'portal_admin_sql', { p_query: 'select 1' }), 'forbidden');
    await expectError(db.rpc(mod, 'portal_admin_economy'), 'forbidden');
  });

  it('daily series: finished days are cached, today is live', async () => {
    const a = await db.rpc(owner, 'portal_admin_series', { p_days: 3, p_tz: 'America/Denver' });
    expect(a.days).toHaveLength(3);
    expect(a.days[2].signups).toBeGreaterThanOrEqual(4);
    const cached = await db.sql(`select count(*)::int n from private.portal_days where tz = 'America/Denver'`);
    expect(cached[0].n).toBe(2);
  });
});

describe('portal: two-step sign-in', () => {
  it('can only be turned on from a verified sign-in, then every staff function needs one', async () => {
    await expectError(as(owner, 'aal1', 'portal_admin_set_mfa', { p_on: true }), 'mfa_required');
    expect((await as(owner, 'aal2', 'portal_admin_set_mfa', { p_on: true })).require_mfa).toBe(true);
    await expectError(as(owner, 'aal1', 'admin_overview'), 'mfa_required');
    await expectError(as(mod, 'aal1', 'portal_admin_players'), 'mfa_required');
    expect(await as(owner, 'aal2', 'admin_overview')).toBeTruthy();
    // players are never affected
    expect((await as(alice, 'aal1', 'portal_me_summary')).counts.plots).toBe(1);
    await as(owner, 'aal2', 'portal_admin_set_mfa', { p_on: false });
    expect(await as(owner, 'aal1', 'admin_overview')).toBeTruthy();
  });
});

describe('portal: owner data explorer', () => {
  it('lists every table with its key and player columns', async () => {
    const t = await db.rpc(owner, 'portal_admin_tables');
    const wp = t.find((x: any) => x.schema === 'public' && x.name === 'world_plots');
    expect(wp.pk).toEqual(['gx', 'gy']);
    expect(wp.player_cols).toContain('owner_id');
    expect(t.some((x: any) => x.schema === 'private')).toBe(true);
  });

  it('filters, edits with an audit trail, and refuses unsafe edits', async () => {
    const r = await db.rpc(owner, 'portal_admin_rows', { p_schema: 'public', p_table: 'world_plots', p_filters: [{ col: 'owner_id', op: 'eq', value: alice }] });
    expect(r.total).toBe(1);
    const pk = { gx: r.rows[0].gx, gy: r.rows[0].gy };
    const after = await db.rpc(owner, 'portal_admin_row_update', { p_schema: 'public', p_table: 'world_plots', p_pk: pk, p_patch: { name: 'Edited', level: 2 }, p_reason: 'portal test' });
    expect(after.name).toBe('Edited');
    const audit = await db.sql(`select details from audit_logs where action = 'portal.row_update' order by id desc limit 1`);
    expect(audit[0].details.before).toEqual({ name: null, level: 1 });
    expect(audit[0].details.after).toEqual({ name: 'Edited', level: 2 });
    await expectError(db.rpc(owner, 'portal_admin_row_update', { p_schema: 'public', p_table: 'world_plots', p_pk: pk, p_patch: { name: 'x' }, p_reason: '' }), 'reason_required');
    await expectError(db.rpc(owner, 'portal_admin_row_update', { p_schema: 'public', p_table: 'world_plots', p_pk: pk, p_patch: { bx: 1 }, p_reason: 'generated' }), 'column_not_editable');
    await expectError(db.rpc(owner, 'portal_admin_row_update', { p_schema: 'public', p_table: 'audit_logs', p_pk: { id: 1 }, p_patch: { action: 'x' }, p_reason: 'tamper' }), 'read_only_table');
    await expectError(db.rpc(owner, 'portal_admin_rows', { p_schema: 'public', p_table: 'world_plots', p_filters: [{ col: 'gx); drop table players; --', op: 'eq', value: 1 }] }), 'unknown_column');
    await expectError(db.rpc(owner, 'portal_admin_rows', { p_schema: 'pg_catalog', p_table: 'pg_authid' }), 'unknown_table');
  });

  it('inserts and deletes rows, keeping the deleted row in the audit log', async () => {
    await db.rpc(owner, 'portal_admin_row_insert', { p_schema: 'public', p_table: 'feature_flags', p_row: { key: 'portal_t', enabled: true, config: { a: [1] } }, p_reason: 'insert test' });
    expect((await db.sql(`select config from feature_flags where key = 'portal_t'`))[0].config).toEqual({ a: [1] });
    await db.rpc(owner, 'portal_admin_row_delete', { p_schema: 'public', p_table: 'feature_flags', p_pk: { key: 'portal_t' }, p_reason: 'delete test' });
    const a = await db.sql(`select details from audit_logs where action = 'portal.row_delete' order by id desc limit 1`);
    expect(a[0].details.row.key).toBe('portal_t');
  });

  it('never shows the server secrets', async () => {
    await db.sql(`insert into private.secrets (key, value) values ('portal_test_secret', 987654321) on conflict do nothing`);
    const r = await db.rpc(owner, 'portal_admin_rows', { p_schema: 'private', p_table: 'secrets' });
    expect(r.sensitive).toBe(true);
    expect(r.rows.some((x: any) => x.key === 'portal_test_secret')).toBe(true);
    expect(JSON.stringify(r.rows)).not.toContain('987654321');
    expect(JSON.stringify(await db.rpc(owner, 'portal_admin_row', { p_schema: 'private', p_table: 'secrets', p_pk: { key: 'portal_test_secret' } }))).not.toContain('987654321');
    await expectError(db.rpc(owner, 'portal_admin_row_update', { p_schema: 'private', p_table: 'secrets', p_pk: { key: 'portal_test_secret' }, p_patch: { value: 1 }, p_reason: 'nope' }), 'read_only_table');
  });

  it('the SQL console reads but can never write', async () => {
    const ok = await db.rpc(owner, 'portal_admin_sql', { p_query: 'select username from profiles order by username;' });
    expect(ok.columns).toEqual(['username']);
    expect(ok.rows.map((r: any) => r[0])).toContain('alice_p');
    expect((await db.rpc(owner, 'portal_admin_sql', { p_query: `select admin_adjust_balance('${alice}', 'ink', 5, 'sneaky')` })).error).toMatch(/read-only/);
    expect((await db.rpc(owner, 'portal_admin_sql', { p_query: 'with x as (delete from feature_flags returning *) select * from x' })).error).toBeTruthy();
    expect((await db.rpc(owner, 'portal_admin_sql', { p_query: 'select 1; delete from profiles' })).error).toBeTruthy();
    expect((await db.rpc(owner, 'portal_admin_sql', { p_query: "update profiles set bio = 'x'" })).error).toMatch(/Only queries that read/);
    expect((await db.sql(`select count(*)::int n from profiles`))[0].n).toBe(4);
    expect((await db.sql(`select count(*)::int n from audit_logs where action = 'portal.sql'`))[0].n).toBe(4);
  });
});

describe('portal: players see only their own data', () => {
  it('summary, plots and plot detail are theirs alone', async () => {
    const s = await db.rpc(alice, 'portal_me_summary');
    expect(s.counts.plots).toBe(1);
    expect(s.player.push_token).toBeUndefined();
    const p = await db.rpc(alice, 'portal_me_plots');
    expect(p.plots).toHaveLength(1);
    expect(p.plots[0].rate).toBeGreaterThan(0);
    const { gx, gy } = p.plots[0];
    expect((await db.rpc(alice, 'portal_me_plot', { p_gx: gx, p_gy: gy })).plot.mine).toBe(true);
    await expectError(db.rpc(bob, 'portal_me_plot', { p_gx: gx, p_gy: gy }), 'not_your_plot');
  });

  it('ledgers and the all-my-data explorer only return their rows, without internal columns', async () => {
    const l = await db.rpc(alice, 'portal_me_ledger', {});
    expect(l.rows.length).toBeGreaterThan(0);
    const tables = await db.rpc(alice, 'portal_me_tables');
    expect(tables.some((t: any) => t.table === 'world_plots')).toBe(true);
    expect(tables.some((t: any) => t.schema === 'private' || t.table === 'audit_logs')).toBe(false);
    const rows = await db.rpc(alice, 'portal_me_rows', { p_table: 'resource_ledger', p_column: 'player_id' });
    expect(rows.rows.every((r: any) => r.player_id === alice && !('idempotency_key' in r) && !('actor_id' in r))).toBe(true);
    await expectError(db.rpc(alice, 'portal_me_rows', { p_table: 'audit_logs', p_column: 'actor_id' }), 'unknown_table');
    await expectError(db.rpc(alice, 'portal_me_rows', { p_table: 'resource_ledger', p_column: 'actor_id' }), 'unknown_table');
    await expectError(db.rpc(alice, 'portal_me_rows', { p_table: 'secrets', p_column: 'player_id' }), 'unknown_table');
  });

  it('daily series work in the player’s own time zone', async () => {
    const d = await db.rpc(alice, 'portal_me_series', { p_days: 7, p_tz: 'Europe/London' });
    expect(d).toHaveLength(7);
    expect(d[6].plots).toBe(1);
  });
});
