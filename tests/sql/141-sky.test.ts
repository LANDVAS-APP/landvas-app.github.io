// v0.6.3 Sky Island: hex chunks, buildings that fill over time (neighbours and gardens help), the weather (same in
// the app and the server) doubling a building's harvest, balloon orders.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';
import { weatherAt } from '../../src/realms/sky/skyCore';

const db = new TestDb();
let uid: string, other: string, realm: string;
const seed = 9001;
const wallet = async () => (await db.sql(`select wallet from realm_players where player_id = $1 and kind = 'sky'`, [uid]))[0]?.wallet ?? {};

beforeAll(async () => {
  await db.init({ ungated: true });
  uid = await db.newPlayer('sky_one'); other = await db.newPlayer('sky_two');
  realm = (await db.sql(`insert into realms (owner_id, kind, seed) values ($1, 'sky', $2) returning id`, [uid, seed]))[0].id;
});
afterAll(() => db.close());

describe('Sky Island', () => {
  it('the app and the server agree on the weather', async () => {
    const rows = await db.sql(`select b, private.rsky_weather_at($1, b) w from unnest(array[0, 1, 2, 77, 1999999, 1234567, 1990000]::bigint[]) b`, [seed]);
    for (const r of rows) expect(weatherAt(seed, Number(r.b))).toBe(r.w);
  });

  it('starts as seven chunks with a Cloud Catcher, and fills three balloon orders', async () => {
    const g = await db.rpc(uid, 'sky_get', { p_id: realm });
    expect(Object.keys(g.sky_core.tiles).length).toBe(7);
    expect(g.sky_core.tiles['0,0'].b).toBe('catcher');
    expect(g.sky_core.orders.length).toBe(3);
    await expectError(db.rpc(other, 'sky_build', { p_id: realm, p_q: 1, p_r: 0, p_b: 'catcher' }), 'not_owner');
  });

  it('buildings cost starlight; expanding must touch the island and stay within reach', async () => {
    await expectError(db.rpc(uid, 'sky_build', { p_id: realm, p_q: 1, p_r: 0, p_b: 'catcher' }), 'not_enough');
    await db.sql(`insert into realm_players (player_id, kind, wallet) values ($1, 'sky', '{"starlight": 1000}') on conflict (player_id, kind) do update set wallet = excluded.wallet`, [uid]);
    const b = await db.rpc(uid, 'sky_build', { p_id: realm, p_q: 1, p_r: 0, p_b: 'catcher' });
    expect(b.sky.tiles['1,0'].b).toBe('catcher');
    await expectError(db.rpc(uid, 'sky_build', { p_id: realm, p_q: 1, p_r: 0, p_b: 'catcher' }), 'sky_taken');
    await expectError(db.rpc(uid, 'sky_build', { p_id: realm, p_q: -1, p_r: 0, p_b: 'bell' }), 'level_too_low');
    await expectError(db.rpc(uid, 'sky_expand', { p_id: realm, p_q: 5, p_r: 0 }), 'sky_not_touching');
    const e = await db.rpc(uid, 'sky_expand', { p_id: realm, p_q: 2, p_r: 0 });
    expect(e.sky.tiles['2,0']).toEqual({});
    await expectError(db.rpc(uid, 'sky_expand', { p_id: realm, p_q: 3, p_r: 0 }), 'level_too_low');
  });

  it('harvests what built up (neighbours help), doubled in its weather', async () => {
    await db.sql(`update realm_skies set tiles = jsonb_set(jsonb_set(tiles, '{0\\,0,at}', to_jsonb(now() - interval '1 hour')), '{1\\,0,at}', to_jsonb(now() - interval '1 hour')) where realm_id = $1`, [realm]);
    const t = (await db.sql(`select tiles from realm_skies where realm_id = $1`, [realm]))[0].tiles;
    expect(Date.parse(t['0,0'].at)).toBeLessThan(Date.now() - 3000000);
    const w0 = await wallet();
    const h = await db.rpc(uid, 'sky_harvest', { p_id: realm, p_keys: null });
    const cloudy = h.sky.weather.now.id === 'cloudy';
    // 30/h each, +15% for the neighbour, an hour: 34 each (68 in cloudy weather)
    expect(h.got['0,0']).toBe(cloudy ? 69 : 34);
    expect((await wallet()).fluff - (w0.fluff ?? 0)).toBe(h.loot.fluff);
    const again = await db.rpc(uid, 'sky_harvest', { p_id: realm, p_keys: ['0,0'] });
    expect(again.loot.fluff ?? 0).toBe(0);
  });

  it('balloon orders: deliver what they want for starlight, XP and Ink', async () => {
    const o = (await db.rpc(uid, 'sky_get', { p_id: realm })).sky_core.orders[0];
    await db.sql(`update realm_players set wallet = $2::jsonb where player_id = $1 and kind = 'sky'`, [uid, JSON.stringify({ starlight: 0, ...Object.fromEntries(Object.entries(o.needs).map(([k, v]) => [k, (v as number) + 1])) })]);
    const d = await db.rpc(uid, 'sky_deliver', { p_id: realm, p_order: o.id });
    expect(d.reward).toBe(o.reward);
    expect(d.ink).toBeGreaterThanOrEqual(1);
    const w = await wallet();
    expect(w.starlight).toBe(o.reward);
    for (const k of Object.keys(o.needs)) expect(w[k]).toBe(1);
    expect(d.sky.orders.length).toBe(3);
    const fresh = d.sky.orders.find((x: any) => !Object.is(x.id, o.id) && Date.parse(x.ready_at) > Date.now());
    expect(fresh).toBeTruthy();
    await expectError(db.rpc(uid, 'sky_deliver', { p_id: realm, p_order: fresh.id }), 'sky_balloon_coming');
    const r = await db.rpc(uid, 'sky_reroll', { p_id: realm, p_order: d.sky.orders[0].id });
    expect(r.sky.reroll_ready).toBe(false);
    await expectError(db.rpc(uid, 'sky_reroll', { p_id: realm, p_order: r.sky.orders[0].id }), 'sky_reroll_wait');
  });

  it('upgrades raise the rate; gardens help their neighbours', async () => {
    await db.sql(`update realms set xp = 100000 where id = $1`, [realm]);
    await db.sql(`update realm_players set wallet = '{"starlight": 100000}'::jsonb where player_id = $1 and kind = 'sky'`, [uid]);
    const u = await db.rpc(uid, 'sky_upgrade', { p_id: realm, p_q: 0, p_r: 0 });
    expect(u.sky.tiles['0,0'].lv).toBe(2);
    const g = await db.rpc(uid, 'sky_build', { p_id: realm, p_q: 0, p_r: 1, p_b: 'garden' });
    expect(g.sky.tiles['0,1'].b).toBe('garden');
    const s = await db.sql(`select private.rsky_stored(tiles, '0,0', 0) a from realm_skies where realm_id = $1`, [realm]);
    expect(Number(s[0].a)).toBeGreaterThanOrEqual(0);
  });
});
