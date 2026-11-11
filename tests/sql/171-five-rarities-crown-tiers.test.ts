// v1.3: Dragon, Eclipse, Vampire, Mirror and Singularity; the collection is an album now (no bonus); and Crowns in
// three tiers (City ×1.5, State ×5, Country ×10), each only as strong as the number of other players in its kingdom.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let a: string, b: string;
const own = (u: string, gx: number, gy: number, rarity: string, plot_type = 'graphite') =>
  db.sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values ($1, $2, $3, $4, $5, now())`, [gx, gy, plot_type, rarity, u]);
const cfg = (patch: object) => db.sql(`update game_config set value = value || $1::jsonb where key = 'rarity_abilities'`, [JSON.stringify(patch)]);
const mult = async (gx: number, gy: number) => Number((await db.sql(`select private.plot_day_mult(p, private.game_day(now())) m from world_plots p where gx = $1 and gy = $2`, [gx, gy]))[0].m);
const rentMult = async (u: string) => Number((await db.sql(`select private.rent_mult($1) m`, [u]))[0].m);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 10 });
  a = await db.newPlayer('ana_ultra'); b = await db.newPlayer('ben_near');
  await db.sql(`update game_config set value = value || '{"one_in": 1000000000}' where key = 'shiny'`);
});
afterAll(() => db.close());

describe('the rarity table', () => {
  it('has the five new ultras, Singularity at 1 in 1,000,000, and three Crowns', async () => {
    const r = Object.fromEntries((await db.sql(`select id, ppm, name from plot_rarities`)).map((x: any) => [x.id, x]));
    expect(r.singularity.ppm).toBe(1);
    for (const id of ['phoenix', 'kraken', 'gemini', 'mirror']) expect(r[id].ppm).toBeGreaterThan(0);
    expect(r.eclipse).toBeUndefined(); expect(r.vampire).toBeUndefined(); expect(r.dragon).toBeUndefined();
    expect(r.crown.name).toBe('City Crown'); expect(r.crown_state.name).toBe('State Crown'); expect(r.crown_country.name).toBe('Country Crown');
    expect(Object.keys(r).length).toBe(21);
  });
  it('the collection is an album now: owning every type adds nothing', async () => {
    const types = ['graphite', 'pigment', 'mosaic', 'prism', 'fresco', 'bloom', 'neon', 'ember'];
    const [t] = await db.sql(`select array_agg(id) ids from plot_types`);
    let i = 0; for (const ty of (t.ids ?? types)) await own(b, 100 + i++, 4_000_000, 'common', ty);
    expect(await rentMult(b)).toBeCloseTo(1, 9);
    await db.sql(`delete from world_plots where owner_id = $1`, [b]);
  });
});

describe('the new ultras', () => {
  it('Phoenix (with the Dragon’s old power) grows +10% per streak day, up to a 365-day streak, and sleeps when it breaks', async () => {
    await own(a, 10, 4_000_000, 'phoenix');
    expect(await mult(10, 4_000_000)).toBe(1);
    await db.sql(`insert into daily_streaks (player_id, last_day, streak, best, total_days) values ($1, private.game_day(now()), 12, 12, 12)`, [a]);
    expect(await mult(10, 4_000_000)).toBeCloseTo(2.2, 9);
    await db.sql(`update daily_streaks set streak = 300 where player_id = $1`, [a]);
    expect(await mult(10, 4_000_000)).toBeCloseTo(31, 9);
    await db.sql(`update daily_streaks set last_day = private.game_day(now()) - 3 where player_id = $1`, [a]);
    expect(await mult(10, 4_000_000)).toBe(1);
  });
  it('Kraken: +75% per neighbouring plot of another player (within ~200 m), up to ×20 — your own don’t count (v1.3b)', async () => {
    await own(a, 500, 4_000_000, 'kraken');
    expect(await mult(500, 4_000_000)).toBe(1);
    await own(a, 503, 4_000_000, 'common');
    expect(await mult(500, 4_000_000)).toBe(1);
    await own(b, 505, 4_000_003, 'common'); await own(b, 515, 4_000_000, 'common'); await own(b, 540, 4_000_000, 'common'); // (the last is too far)
    expect(await mult(500, 4_000_000)).toBe(2.5);
    for (let i = 0; i < 40; i++) await own(b, 490 + (i % 20), 4_000_005 + Math.floor(i / 20), 'common');
    expect(await mult(500, 4_000_000)).toBe(20);
  });
  it('Gemini: ×12 each once you own a pair', async () => {
    await own(a, 700, 4_000_000, 'gemini');
    expect(await mult(700, 4_000_000)).toBe(1);
    await own(a, 710, 4_000_000, 'gemini');
    expect(await mult(700, 4_000_000)).toBe(12); expect(await mult(710, 4_000_000)).toBe(12);
  });
  it('Mirror copies the rate of your best other plot', async () => {
    await own(a, 900, 4_000_000, 'mirror');
    const [r] = await db.sql(`select (select usd_per_second from plot_rarities where id = 'phoenix') d, (select usd_per_second from plot_rarities where id = 'mirror') m`);
    // a's best other plot is the Kraken (its own rate, without its day multiplier)
    const [v] = await db.sql(`select usd_per_second u from plot_rarities where id = 'kraken'`);
    expect(await mult(900, 4_000_000)).toBeCloseTo(Math.max(1, Number(v.u) / Number(r.m), Number(r.d) / Number(r.m)), 6);
    await own(a, 901, 4_000_000, 'genesis');
    const [g] = await db.sql(`select usd_per_second u from plot_rarities where id = 'genesis'`);
    expect(await mult(900, 4_000_000)).toBeCloseTo(Number(g.u) / Number(r.m), 6);
  });
  it('Singularity doubles everything you own', async () => {
    const before = await rentMult(a);
    await own(a, 1200, 4_000_000, 'singularity');
    expect(await rentMult(a)).toBeCloseTo(before + 1, 9);
  });
});

describe('Crowns in three tiers', () => {
  let c: string, k: any;
  beforeAll(async () => {
    c = await db.newPlayer('cleo_crowns');
    [k] = await db.sql(`select id, gx, gy, state, country from world_cities where name = 'Denver' and country = 'US'`);
  });
  it('every city knows its state and country', async () => {
    expect(k.state).toBe('Colorado');
    const at = (await db.sql(`select private.city_at($1, $2) c`, [k.gx + 10, k.gy + 10]))[0].c;
    expect(at).toMatchObject({ name: 'Denver', state: 'Colorado', country: 'US', country_name: 'United States of America' });
  });
  it('a Country Crown rolls first, then a State Crown, each only while its kingdom has none', async () => {
    await cfg({ crown_country: { ppm: 1000000, pct: 900, need: 100 } });
    const r1 = (await db.sql(`select private.take_plot($1, $2, $3, 'acquire', '{}') r`, [c, k.gx + 1, k.gy + 1]))[0].r;
    expect(r1.rarity).toBe('crown_country');
    await cfg({ crown_state: { ppm: 1000000, pct: 400, need: 25 } });
    // the USA's Crown is taken: next in line is Colorado's
    const r2 = (await db.sql(`select private.take_plot($1, $2, $3, 'acquire', '{}') r`, [c, k.gx + 2, k.gy + 2]))[0].r;
    expect(r2.rarity).toBe('crown_state');
    // both taken: no second State or Country Crown
    const r3 = (await db.sql(`select private.take_plot($1, $2, $3, 'acquire', '{}') r`, [c, k.gx + 3, k.gy + 3]))[0].r;
    expect(['crown_state', 'crown_country']).not.toContain(r3.rarity);
    await cfg({ crown_country: { ppm: 5, pct: 900, need: 100 }, crown_state: { ppm: 50, pct: 400, need: 25 } });
  });
  it('a Crown is only as strong as its kingdom: no other players there, no boost', async () => {
    const pct = Number((await db.sql(`select private.crown_pct($1) p`, [c]))[0].p);
    expect(pct).toBe(0);
    // 25 others in Colorado (Denver): the State Crown is full (×5) and the Country Crown at 25/100 (+225%)
    for (let i = 0; i < 25; i++) { const u = await db.newPlayer(`co_${i}`); await db.sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values ($1, $2, 'graphite', 'common', $3, now())`, [k.gx + 100 + i, k.gy + 100, u]); }
    const held = (await db.rpc(c, 'crowns')).held;
    expect(held.find((h: any) => h.tier === 'crown_state')).toMatchObject({ city: 'Colorado', strength: 1, rivals: 25, mine: true });
    expect(held.find((h: any) => h.tier === 'crown_country')).toMatchObject({ city: 'United States of America', rivals: 25, need: 100 });
    expect(Number((await db.sql(`select private.crown_pct($1) p`, [c]))[0].p)).toBeCloseTo(400 + 900 * 0.25 + (held.some((h: any) => h.tier === 'crown') ? 50 : 0), 6);
  });
});
