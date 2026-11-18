// World snapshots for the CDN (20261119000540): world_snapshot is the public view (as nobody, whoever asks), and the
// Leviathan as a player sees it — the snapshot merged with leviathan_me by the app (src/leviathan/levMerge.ts) — is
// exactly what leviathan_state gives them, in every stage: none out, the warning, walking and fighting, hidden and
// spotted, fallen with loot, and down in the deep. The map layers say whose things are, and the app config says where
// the CDN is.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';
import { levMerge } from '../../src/leviathan/levMerge';

const db = new TestDb();
let owner: string, ann: string, bob: string;
let k = 0;
const claimAt = (uid: string, gx: number, gy: number) => db.rpc(uid, 'acquire_plot', { p_gx: gx, p_gy: gy, p_idempotency_key: `ws-${++k}-00000000` });
const cellAt = async (lng: number, lat: number) => (await db.sql(`select private.lev_cell($1, $2) c`, [lng, lat]))[0].c as number[];
const lev = async () => (await db.sql(`select * from leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1`))[0];
const tick = () => db.sql(`select private.leviathan_tick() t`);

/** what a player's app shows (snapshot + their part) next to what the old call says, minus what moves with the clock */
async function both(uid: string) {
  await db.sql(`update leviathans set last_tick = now() where status in ('warning', 'walking', 'enraged', 'fleeing')`); // (no beat in between)
  const full = await db.rpc(uid, 'leviathan_state', { p_tick: false });
  const mine = await db.rpc(uid, 'leviathan_me');
  const world = await db.rpc(null, 'world_snapshot', { p_key: 'leviathan' });
  const strip = (s: any) => {
    const c = JSON.parse(JSON.stringify(s));
    delete c.server_time;
    if (c.lev) delete c.lev.pos;
    return c;
  };
  return { app: strip(levMerge(world, mine, uid)), full: strip(full), world, mine };
}

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('ws_owner'); ann = await db.newPlayer('ws_ann'); bob = await db.newPlayer('ws_bob');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner') on conflict do nothing`, [owner]);
  for (const u of [ann, bob]) { await db.sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = $1`, [u]); await db.giveInk(u, 200_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  await db.sql(`update game_config set value = value || '{"enabled": false}' where key = 'leviathan'`);
  for (let i = 0; i < 4; i++) { const [gx, gy] = await cellAt(-122.68 + i * 0.001, 45.52); await claimAt(ann, gx, gy); }
});
afterAll(() => db.close());

describe('world_snapshot', () => {
  it('only the known snapshots, each stamped with when it was built', async () => {
    expect(await db.rpc(null, 'world_snapshot', { p_key: 'players' })).toBeNull();
    for (const key of ['leviathan', 'hot_zone', 'enchant_world', 'primordials', 'travel']) {
      const s = await db.rpc(null, 'world_snapshot', { p_key: key });
      expect(s.snapshot).toBe(key);
      expect(Date.parse(s.built_at)).toBeGreaterThan(Date.now() - 60_000);
    }
    expect((await db.rpc(null, 'world_snapshot', { p_key: 'travel' })).items).toEqual([]);
  });
  it('is the public view whoever asks: a signed-in player gets nothing of their own in it', async () => {
    const a = await db.rpc(ann, 'world_snapshot', { p_key: 'leviathan' });
    const n = await db.rpc(null, 'world_snapshot', { p_key: 'leviathan' });
    delete a.built_at; delete n.built_at; delete a.server_time; delete n.server_time;
    expect(a).toEqual(n);
    expect(a.me).toBeNull();
  });
  it('is read-only (the CDN calls it with GET)', async () => {
    const [f] = await db.sql(`select provolatile v from pg_proc where proname = 'world_snapshot'`);
    expect(f.v).toBe('s');
  });
  it('leviathan_me is only for a signed-in player', async () => {
    await expectError(db.rpc(null, 'leviathan_me'), 'permission denied');
  });
  it('a signed-in player’s next call still knows who they are', async () => {
    await db.rpc(ann, 'world_snapshot', { p_key: 'leviathan' });
    expect((await db.rpc(ann, 'leviathan_me')).me).toBeNull(); // (signed in fine: no Leviathan out, so no part yet)
  });
});

describe('the Leviathan, snapshot + your part = what you always saw', () => {
  it('none out', async () => {
    const { app, full } = await both(ann);
    expect(full.lev).toBeNull();
    expect(app).toEqual(full);
  });
  it('the warning', async () => {
    await db.rpc(owner, 'admin_leviathan', { p_action: 'summon', p_args: { warn_min: 30 } });
    const { app, full } = await both(ann);
    expect(full.lev.status).toBe('warning');
    expect(app).toEqual(full);
  });
  it('walking, and you in the fight: your bombs, damage, rank and the top list with you in it', async () => {
    await db.sql(`update leviathans set rise_at = now() - interval '1 second', walk_at = now() - interval '1 second' where status = 'warning'`);
    await tick();
    expect((await lev()).status).toBe('walking');
    await db.rpc(ann, 'leviathan_hit', { p_move: 'bomb', p_n: 5 });
    await db.rpc(bob, 'leviathan_hit', { p_move: 'bomb', p_n: 3 });
    const { app, full, world, mine } = await both(ann);
    expect(full.me.dmg).toBeGreaterThan(0);
    expect(full.top.some((t: any) => t.me)).toBe(true);
    expect(world.me).toBeNull();
    expect(mine.lev).toBeNull();
    expect(app).toEqual(full);
    const b = await both(bob);
    expect(b.app).toEqual(b.full);
  });
  it('hidden: the world sees haze; one who spotted it sees it as it is', async () => {
    const l = await lev();
    await db.sql(`select private.lev_power($1, 'hidden', 30)`, [l.id]);
    const notSpotted = await both(bob);
    expect(notSpotted.full.lev.hidden).toBe(true);
    expect(notSpotted.mine.lev).toBeNull();
    expect(notSpotted.app).toEqual(notSpotted.full);
    await db.sql(`update leviathan_players set spotted_at = now() where player_id = $1`, [ann]);
    const spotted = await both(ann);
    expect(spotted.full.lev.hidden).toBe(false);
    expect(spotted.world.lev.hidden).toBe(true);
    expect(spotted.app).toEqual(spotted.full);
    await db.sql(`update leviathans set hidden_until = null where id = $1`, [l.id]);
  });
  it('fallen: the bones, and your own loot', async () => {
    const l = await lev();
    await db.sql(`update leviathans set hp = 60 where id = $1`, [l.id]);
    await db.sql(`update leviathan_players set bombs = 60 where player_id = $1`, [ann]);
    await db.rpc(ann, 'leviathan_hit', { p_move: 'bomb', p_n: 5 });
    const { app, full, world } = await both(ann);
    expect(full.lev).toBeNull();
    expect(full.last.loot.loot.fell).toBe(true);
    expect(world.last.loot).toBeNull();
    expect(app).toEqual(full);
    const b = await both(bob);
    expect(b.app).toEqual(b.full);
  });
  it('down in the deep: when it comes back, and the damage you did', async () => {
    await db.rpc(owner, 'admin_leviathan', { p_action: 'summon', p_args: { warn_min: 0 } });
    await db.sql(`update leviathans set rise_at = now() - interval '1 second', walk_at = now() - interval '1 second' where status = 'warning'`);
    await tick();
    await db.sql(`update leviathan_players set bombs = 60 where player_id = $1`, [ann]);
    await db.rpc(ann, 'leviathan_hit', { p_move: 'bomb', p_n: 2 });
    await db.rpc(owner, 'admin_leviathan', { p_action: 'submerge', p_args: {} });
    const { app, full } = await both(ann);
    expect(full.deep).toBeTruthy();
    expect(Number(full.deep.my_dmg)).toBeGreaterThan(0);
    expect(app).toEqual(full);
  });
});

describe('the map layers and the app config', () => {
  it('giants, wormholes and primordial plots say whose they are', async () => {
    const src = await db.sql(`select pg_get_functiondef('public.enchant_world()'::regprocedure) e, pg_get_functiondef('public.primordials_world()'::regprocedure) p`);
    expect((src[0].e.match(/'owner_id'/g) ?? []).length).toBe(2);
    expect(src[0].p).toContain(`'owner_id', w.owner_id`);
  });
  it('the app config says where the CDN is (off until the deploy switches it on)', async () => {
    const c = await db.rpc(null, 'app_config');
    expect(c.cdn).toEqual({ enabled: false });
    expect(c.ota_builds).toBeDefined();
  });
});
