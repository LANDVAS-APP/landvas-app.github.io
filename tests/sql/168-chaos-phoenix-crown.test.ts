// v1.2: Chaos (a new multiplier every day), Phoenix (lit on days you check in, fading when you don't, reborn ×10 when
// you're back) and the Crown (one per city, 2× rent on everything). Prismatic is now 1 in 100,000.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';
import { liveRent } from '../../src/shared/rent';

const db = new TestDb();
let cara: string, phil: string, kim: string, lee: string;
const base = async (id: string) => Number((await db.sql(`select usd_per_second u from plot_rarities where id = $1`, [id]))[0].u);
const own = (u: string, gx: number, gy: number, rarity: string) =>
  db.sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values ($1, $2, 'graphite', $3, $4, now())`, [gx, gy, rarity, u]);
const cfg = (patch: object) => db.sql(`update game_config set value = value || $1::jsonb where key = 'rarity_abilities'`, [JSON.stringify(patch)]);
const settledAgo = async (u: string, hours: number) => {
  await db.sql(`insert into rent_accounts (player_id, settled_at) values ($1, now()) on conflict do nothing`, [u]);
  await db.sql(`update rent_accounts set settled_at = now() - make_interval(hours => $2), balance_usd = 0, boost_until = null where player_id = $1`, [u, hours]);
};
const live = async (u: string) => { const st = (await db.rpc(u, 'my_state')).rent; return { st, server: Number(st.live_usd), client: liveRent(st, new Date(st.server_time).getTime()) }; };

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 10 });
  cara = await db.newPlayer('cara_chaos'); phil = await db.newPlayer('phil_phoenix'); kim = await db.newPlayer('kim_crown'); lee = await db.newPlayer('lee_crown');
  await db.sql(`update game_config set value = value || '{"one_in": 1000000000}' where key = 'shiny'`);
});
afterAll(() => db.close());

describe('rarity table', () => {
  it('Prismatic is 1 in 100,000; Chaos, Phoenix and Crown are there', async () => {
    const r = Object.fromEntries((await db.sql(`select id, ppm from plot_rarities`)).map((x: any) => [x.id, x.ppm]));
    expect(r.prismatic).toBe(10);
    expect(r.chaos).toBe(300); expect(r.phoenix).toBe(300); expect(r.crown).toBe(0); // (the Crown has its own roll, in cities)
  });
});

describe('Chaos', () => {
  it('its multiplier is the same all day and comes from the configured values', async () => {
    const days = await db.sql(`select private.chaos_mult(7, 7, d::date) m from generate_series(date '2026-01-01', date '2026-03-01', interval '1 day') d`);
    const vals = new Set(days.map((x: any) => Number(x.m)));
    for (const v of vals) expect([0, 0.5, 1, 2, 3, 5, 10, 20]).toContain(v);
    expect(vals.size).toBeGreaterThan(4); // it really changes day to day
  });
  it('earns its day’s multiplier, and the phone’s ticker matches the server', async () => {
    await cfg({ chaos: { values: [4] } });
    await own(cara, 100, 100, 'chaos');
    await settledAgo(cara, 30);
    const { server, client } = await live(cara);
    expect(server / ((await base('chaos')) * 4 * 30 * 3600)).toBeCloseTo(1, 5);
    expect(Math.abs(client - server) / server).toBeLessThan(1e-6);
    const [p] = await db.rpc(cara, 'my_plots');
    expect(Number(p.today_mult)).toBe(4);
    await cfg({ chaos: { values: [0] } });
    await settledAgo(cara, 5);
    expect((await live(cara)).server).toBeCloseTo(0, 15); // a ×0 day earns nothing
    await cfg({ chaos: { values: [0, 0.5, 1, 1, 2, 2, 3, 5, 10, 20] } });
  });
});

describe('Phoenix', () => {
  it('lit (×2) on a day you checked in', async () => {
    await own(phil, 200, 200, 'phoenix');
    await db.rpc(phil, 'daily_claim');
    const [p] = await db.rpc(phil, 'my_plots');
    expect(Number(p.today_mult)).toBe(2);
  });
  it('fades 25% for each day missed', async () => {
    await db.sql(`update daily_streaks set last_day = private.today() - 2 where player_id = $1`, [phil]);
    expect(Number((await db.rpc(phil, 'my_plots'))[0].today_mult)).toBe(0.5);
    await db.sql(`update daily_streaks set last_day = private.today() - 9 where player_id = $1`, [phil]);
    expect(Number((await db.rpc(phil, 'my_plots'))[0].today_mult)).toBe(0); // ashes
  });
  it('reborn ×10 the day you come back — and rent is settled at that moment', async () => {
    await settledAgo(phil, 3);
    const before = Number((await db.sql(`select lifetime_usd from rent_accounts where player_id = $1`, [phil]))[0].lifetime_usd);
    await db.rpc(phil, 'daily_claim');
    expect(Number((await db.rpc(phil, 'my_plots'))[0].today_mult)).toBe(10);
    // the 3 hours as ashes earned nothing
    const after = Number((await db.sql(`select lifetime_usd from rent_accounts where player_id = $1`, [phil]))[0].lifetime_usd);
    expect(after - before).toBeCloseTo(0, 15);
    // from now on it earns ×10, and the ticker agrees
    await db.sql(`update rent_accounts set settled_at = now() - interval '1 hour', balance_usd = 0 where player_id = $1`, [phil]);
    const { server, client } = await live(phil);
    expect(server).toBeGreaterThan((await base('phoenix')) * 10 * 3600 * 0.5); // (part of that hour may be yesterday)
    expect(Math.abs(client - server) / server).toBeLessThan(1e-6);
  });
});

describe('the Crown', () => {
  it('only one per city: once a city has its Crown, nobody else can roll it there', async () => {
    const [tokyo] = await db.sql(`select gx, gy from world_cities where name = 'Tokyo'`);
    // force every roll in cities to be a Crown
    await cfg({ crown: { ppm: 1000000, pct: 100, max: 1 } });
    const a = await db.sql(`select private.take_plot($1, $2, $3, 'acquire', '{}') r`, [kim, tokyo.gx + 3, tokyo.gy + 3]);
    expect(a[0].r.rarity).toBe('crown');
    const b = await db.sql(`select private.take_plot($1, $2, $3, 'acquire', '{}') r`, [lee, tokyo.gx + 9, tokyo.gy + 9]);
    expect(b[0].r.rarity).not.toBe('crown');
    expect(Number((await db.sql(`select count(*) n from world_plots where rarity = 'crown'`))[0].n)).toBe(1);
    // and outside any city the Crown never rolls
    expect((await db.sql(`select private.plot_rarity_for(5, 5) r`))[0].r).not.toBe('crown');
    await cfg({ crown: { ppm: 1000, pct: 100, max: 1 } });
  });
  it('its holder earns 2× on all their rent, and the city lists them', async () => {
    expect(Number((await db.sql(`select private.rent_mult($1) m`, [kim]))[0].m)).toBeCloseTo(2, 6);
    const crowns = await db.rpc(kim, 'crowns');
    expect(crowns.total).toBeGreaterThan(2500);
    expect(crowns.held).toEqual([expect.objectContaining({ city: 'Tokyo', country: 'JP', holder: 'kim_crown' })]);
  });
  it('every city in the world has a Crown to win, not just the Hot Zone cities', async () => {
    // a small city that was never a Hot Zone: Sunnyvale
    const [boise] = await db.sql(`select id, gx, gy from world_cities where name = 'Sunnyvale' and country = 'US'`);
    expect(boise).toBeTruthy();
    expect((await db.sql(`select private.city_at($1, $2) ->> 'name' n`, [boise.gx + 40, boise.gy - 30]))[0].n).toBe('Sunnyvale');
    await cfg({ crown: { ppm: 1000000, pct: 100, max: 1 } });
    const a = await db.sql(`select private.take_plot($1, $2, $3, 'acquire', '{}') r`, [lee, boise.gx + 2, boise.gy + 2]);
    expect(a[0].r.rarity).toBe('crown');
    await cfg({ crown: { ppm: 1000, pct: 100, max: 1 } });
    expect((await db.rpc(lee, 'crowns')).held.map((c: any) => c.city).sort()).toEqual(['Sunnyvale', 'Tokyo']);
  });
  it('the Hot Zone is a different city every day, drawn from all of them', async () => {
    const days = await db.sql(`select private.hot_zone(date '2027-01-01' + i) ->> 'id' id from generate_series(0, 59) i`);
    const ids = new Set(days.map((d: any) => d.id));
    expect(ids.size).toBeGreaterThan(50);
    expect([...ids].some((id) => Number(id) > 200)).toBe(true); // (not just the biggest cities)
  });
});
