// v0.24: rewarded ads are granted only through the verified callback, once each, within a daily cap;
// players can delete their own account.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ada: string;
const genome = { body: 'round', color: '#7FD3F5', eyes: 'big', mood: 'playful' };
const svc = (args: Record<string, unknown>) => db.sql(`select public.svc_ad_verified($1, $2, $3, $4) as r`, [args.p, args.custom, args.net ?? 'admob:test', args.tx]).then((r: any[]) => r[0].r);
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);

beforeAll(async () => {
  await db.init({ ungated: true });
  ada = await db.newPlayer('ada_ads');
});
afterAll(() => db.close());

describe('rewarded ads', () => {
  it('do nothing while ads are switched off', async () => {
    await expect(svc({ p: ada, custom: 'joystick_refill||n1', tx: 't1' })).rejects.toThrow(/ads_disabled/);
  });
  it('a verified ad wakes an Inkborn, once per transaction, and the app can see it landed', async () => {
    await db.sql(`update feature_flags set enabled = true where key = 'rewarded_ads'`);
    const c = await db.rpc(ada, 'inkborn_create', { p_client_key: 'ada-creature-0001', p_name: 'Nib', p_source: 'random', p_genome: genome, p_drawing: null });
    await db.sql(`update inkborn set energy = 10, stats_at = now() where id = $1`, [c.id]);
    const r = await svc({ p: ada, custom: `inkborn_energy|${c.id}|nonce-1`, tx: 'tx-1' });
    expect(r.energy).toBe(50);
    expect((await svc({ p: ada, custom: `inkborn_energy|${c.id}|nonce-1`, tx: 'tx-1' })).duplicate).toBe(true);
    const seen = await db.rpc(ada, 'my_ad_reward', { p_nonce: 'nonce-1' });
    expect(seen.reward).toBe('inkborn_energy');
    expect((await db.rpc(ada, 'ad_status')).used_today).toBe(1);
  });
  it('doubles an Inkborn game payout only once', async () => {
    const c = (await db.rpc(ada, 'my_sanctuaries')).creatures[0];
    await db.sql(`update inkborn set energy = 100, stats_at = now() where id = $1`, [c.id]);
    const g = await db.rpc(ada, 'inkborn_game_start', { p_id: c.id, p_game: 'berrydash' });
    await db.sql(`update inkborn_games set started_at = now() - interval '50 seconds' where id = $1`, [g.session]);
    const f = await db.rpc(ada, 'inkborn_game_finish', { p_session: g.session, p_score: 40 });
    const before = await ink(ada);
    await svc({ p: ada, custom: `game_double|${g.session}|n2`, tx: 'tx-2' });
    expect(await ink(ada)).toBe(before + f.paid);
    await expect(svc({ p: ada, custom: `game_double|${g.session}|n3`, tx: 'tx-3' })).rejects.toThrow(/reward_already_used/);
  });
  it('can’t be used on someone else’s creature, and stop at the daily cap', async () => {
    const other = await db.newPlayer('not_ada');
    const c = (await db.rpc(ada, 'my_sanctuaries')).creatures[0];
    await expect(svc({ p: other, custom: `inkborn_energy|${c.id}|x`, tx: 'tx-x' })).rejects.toThrow(/not_owner/);
    await db.sql(`update game_config set value = jsonb_set(value, '{daily_cap}', '2') where key = 'ads'`);
    await expect(svc({ p: ada, custom: 'joystick_refill||n4', tx: 'tx-4' })).rejects.toThrow(/daily_ad_cap/);
  });
  it('only the server (service role) can grant', async () => {
    await expectError(db.rpc(ada, 'svc_ad_verified', { p_player_id: ada, p_custom: 'joystick_refill||z', p_network: 'x', p_transaction_id: 'z' }), '');
  });
});

describe('deleting your account', () => {
  it('needs the confirmation word, then removes the player and their land', async () => {
    const del = await db.newPlayer('bye_bye');
    await db.rpc(del, 'claim_starter_plot', { p_gx: 3_100_000, p_gy: 1_900_000 });
    await db.rpc(del, 'inkborn_create', { p_client_key: 'bye-creature-0001', p_name: 'Bye', p_source: 'random', p_genome: genome, p_drawing: null });
    await expectError(db.rpc(del, 'delete_my_account', { p_confirm: 'nope' }), 'confirm_delete');
    await db.rpc(del, 'delete_my_account', { p_confirm: 'DELETE' });
    expect((await db.sql(`select count(*)::int n from players where id = $1`, [del]))[0].n).toBe(0);
    expect((await db.sql(`select count(*)::int n from profiles where id = $1`, [del]))[0].n).toBe(0);
    expect((await db.sql(`select count(*)::int n from world_plots where owner_id = $1`, [del]))[0].n).toBe(0);
    expect((await db.sql(`select count(*)::int n from inkborn where owner_id = $1`, [del]))[0].n).toBe(0);
  });
});
