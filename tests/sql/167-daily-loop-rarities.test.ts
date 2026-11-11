// v1.1: Uncommon and the ultra rarities (with their abilities), shiny plots, Hot Zones, the plot-type collection,
// and the daily streak with its guaranteed rolls.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';
import { liveRent } from '../../src/shared/rent';

const db = new TestDb();
let ann: string, bo: string, cy: string;
const rate = async (u: string) => Number((await db.sql(`select private.rent_rate($1) r`, [u]))[0].r);
const base = async (id: string) => Number((await db.sql(`select usd_per_second u from plot_rarities where id = $1`, [id]))[0].u);
const own = async (u: string, gx: number, gy: number, rarity: string, extra = '') =>
  db.sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values ($1, $2, 'graphite', $3, $4, now()) on conflict (gx, gy) do update set rarity = excluded.rarity, owner_id = excluded.owner_id ${extra}`, [gx, gy, rarity, u]);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 10 });
  ann = await db.newPlayer('ann_rare'); bo = await db.newPlayer('bo_daily'); cy = await db.newPlayer('cy_hot');
  await db.sql(`update game_config set value = value || '{"one_in": 1000000000}' where key = 'shiny'`); // no surprise shinies
});
afterAll(() => db.close());

describe('rarities', () => {
  it('Uncommon sits between Common and Rare; the ultras are on their own tiny roll', async () => {
    const r = await db.sql(`select id, weight, ppm, sort from plot_rarities order by sort`);
    expect(r.slice(0, 6).map((x: any) => x.id)).toEqual(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']);
    expect(r.slice(6).every((x: any) => x.weight === 0)).toBe(true);
    expect(r.filter((x: any) => x.weight > 0).reduce((a: number, x: any) => a + x.weight, 0)).toBe(1000);
  });
  it('a big sample rolls every normal rarity, about the right mix, and ultras only rarely', async () => {
    const [s] = await db.sql(`select count(*) filter (where r = 'common') c, count(*) filter (where r = 'uncommon') u, count(*) filter (where r = 'rare') ra,
      count(*) filter (where r in ('solar','lunar','comet','ancient','prismatic','genesis')) ul
      from (select private.plot_rarity_for(1000 + i, 2000000 + i * 7) r from generate_series(1, 20000) i) x`);
    expect(Number(s.c) / 20000).toBeGreaterThan(0.3); expect(Number(s.c) / 20000).toBeLessThan(0.4);
    expect(Number(s.u) / 20000).toBeGreaterThan(0.12); expect(Number(s.u) / 20000).toBeLessThan(0.18);
    expect(Number(s.ra) / 20000).toBeGreaterThan(0.26);
    expect(Number(s.ul)).toBeLessThan(80);
  });
});

describe('rent abilities', () => {
  it('shiny earns ×5', async () => {
    await own(ann, 10, 10, 'common', ', shiny = true');
    await db.sql(`update world_plots set shiny = true where gx = 10 and gy = 10`);
    expect(await rate(ann)).toBeCloseTo((await base('common')) * 5, 15);
  });
  it('Ancient grows +3% a day, up to ×6', async () => {
    await db.sql(`delete from world_plots where owner_id = $1`, [ann]);
    await own(ann, 11, 10, 'ancient');
    await db.sql(`update world_plots set claimed_at = now() - interval '10 days' where gx = 11 and gy = 10`);
    expect(await rate(ann)).toBeCloseTo((await base('ancient')) * 1.3, 15);
    await db.sql(`update world_plots set claimed_at = now() - interval '900 days' where gx = 11 and gy = 10`);
    expect(await rate(ann)).toBeCloseTo((await base('ancient')) * 6, 15);
  });
  it('Prismatic and Genesis raise every plot you own', async () => {
    await db.sql(`delete from world_plots where owner_id = $1`, [ann]);
    await own(ann, 12, 10, 'common'); await own(ann, 13, 10, 'prismatic');
    expect(await rate(ann)).toBeCloseTo(((await base('common')) + (await base('prismatic'))) * 1.05, 15);
    await own(ann, 14, 10, 'genesis');
    expect(await rate(ann)).toBeCloseTo(((await base('common')) + (await base('prismatic')) + (await base('genesis'))) * 1.3, 15);
  });
  it('a daily window counts exactly its overlap', async () => {
    const s = async (from: string, to: string, st: number, len: number) => Number((await db.sql(`select private.window_seconds($1::timestamptz, $2::timestamptz, $3, $4) s`, [from, to, st, len]))[0].s);
    expect(await s('2026-03-01T00:00Z', '2026-03-02T00:00Z', 6, 12)).toBe(12 * 3600);
    expect(await s('2026-03-01T05:00Z', '2026-03-01T07:00Z', 6, 12)).toBe(3600);
    expect(await s('2026-03-01T20:00Z', '2026-03-02T04:00Z', 22, 4)).toBe(4 * 3600); // across midnight
    expect(await s('2026-03-01T00:00Z', '2026-03-04T00:00Z', 10, 1)).toBe(3 * 3600);
  });
  it('Solar earns ×3 while the sun is up where it is: the extra shows in rent', async () => {
    await db.sql(`delete from world_plots where owner_id = $1`, [ann]);
    await own(ann, 2097152, 10, 'solar'); // longitude 0: the sun is up 06:00–18:00 UTC
    const w = await db.sql(`select * from private.rent_windows($1)`, [ann]);
    expect(w).toHaveLength(1);
    expect(Number(w[0].start_h)).toBe(6); expect(Number(w[0].len_h)).toBe(12);
    expect(Number(w[0].rate)).toBeCloseTo((await base('solar')) * 2, 15);
    const json = await db.rpc(ann, 'rent_state');
    expect(json.extras.windows).toHaveLength(1);
  });
  it('the phone’s ticker matches the server across sunrise and sunset', async () => {
    await db.sql(`update rent_accounts set settled_at = now() - interval '30 hours', balance_usd = 0, boost_until = null where player_id = $1`, [ann]);
    const st = (await db.rpc(ann, 'my_state')).rent;
    const client = liveRent(st, new Date(st.server_time).getTime());
    const solarDay = (await base('solar')) * 30 * 3600 + (await base('solar')) * 2 * 12 * 3600; // 30h base, plus the ×3 for the 12-15h of daylight
    expect(Number(st.live_usd)).toBeGreaterThan(solarDay * 0.95);
    expect(Math.abs(client - Number(st.live_usd)) / Number(st.live_usd)).toBeLessThan(1e-6);
  });
  it('the collection is an album: every plot type owned shows there, but adds no rent (v1.3)', async () => {
    await db.sql(`delete from world_plots where owner_id = $1`, [ann]);
    const types = (await db.sql(`select id from plot_types order by id`)).map((t: any) => t.id);
    for (let i = 0; i < types.length; i++) await db.sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values ($1, 20, $2, 'common', $3, now())`, [30 + i, types[i], ann]);
    expect(Number((await db.sql(`select private.collection_pct($1) p`, [ann]))[0].p)).toBe(0);
    const c = await db.rpc(ann, 'my_collection');
    expect(c.types.every((t: any) => t.owned >= 1)).toBe(true);
    expect(Number(c.pct)).toBe(0);
  });
});

describe('shiny claims', () => {
  it('a fresh claim rolls shiny (forced here), and the claim says so', async () => {
    await db.sql(`update game_config set value = value || '{"one_in": 1}' where key = 'shiny'`);
    const r = await db.rpc(cy, 'quick_buy_plot', { p_idempotency_key: 'shiny-claim-1' });
    expect(r.shiny).toBe(true);
    expect(Number(r.usd_per_second)).toBeCloseTo((await base(r.rarity)) * 5, 15);
    await db.sql(`update game_config set value = value || '{"one_in": 1000000000}' where key = 'shiny'`);
  });
});

describe('the daily streak', () => {
  it('day 1 pays Ink; the same day can’t be claimed twice', async () => {
    const st = await db.rpc(bo, 'daily_status');
    expect(st.streak).toBe(0); expect(st.claimed_today).toBe(false); expect(st.calendar).toHaveLength(30);
    const before = Number((await db.sql(`select private.balances($1) b`, [bo]))[0].b.ink ?? 0);
    const r = await db.rpc(bo, 'daily_claim');
    expect(r.reward).toMatchObject({ day: 1, ink: 20 });
    expect(Number(r.balances.ink)).toBe(before + 20);
    await expectError(db.rpc(bo, 'daily_claim'), 'already_claimed');
  });
  it('day 7 brings a guaranteed Rare-or-better roll; a missed day starts over', async () => {
    await db.sql(`update daily_streaks set last_day = private.today() - 1, streak = 6 where player_id = $1`, [bo]);
    const r = await db.rpc(bo, 'daily_claim');
    expect(r.reward).toMatchObject({ day: 7, ink: 120, ticket: 'rare' });
    expect(r.status.tickets).toHaveLength(1);
    await db.sql(`update daily_streaks set last_day = private.today() - 3 where player_id = $1`, [bo]);
    expect((await db.rpc(bo, 'daily_status')).streak).toBe(0);
    expect((await db.rpc(bo, 'daily_claim')).reward.day).toBe(1);
  });
  it('day 30: a guaranteed Legendary-or-better roll and 500 bonus Ink', async () => {
    await db.sql(`update daily_streaks set last_day = private.today() - 1, streak = 29 where player_id = $1`, [bo]);
    const r = await db.rpc(bo, 'daily_claim');
    expect(r.reward.ticket).toBe('legendary');
    expect(r.reward.ink).toBeGreaterThanOrEqual(500);
  });
  it('a ticket rolls a free plot of at least its rarity, once', async () => {
    const st = await db.rpc(bo, 'daily_status');
    const leg = st.tickets.find((t: any) => t.min_rarity === 'legendary');
    const r = await db.rpc(bo, 'quick_buy_plot', { p_idempotency_key: 'ticket-roll-1', p_ticket: leg.id });
    const [{ sort }] = await db.sql(`select sort from plot_rarities where id = $1`, [r.rarity]);
    expect(Number(sort)).toBeGreaterThanOrEqual(5);
    expect(Number(r.cost.ink)).toBe(0);
    await expectError(db.rpc(bo, 'quick_buy_plot', { p_idempotency_key: 'ticket-roll-2', p_ticket: leg.id }), 'ticket_not_found');
    const rare = st.tickets.find((t: any) => t.min_rarity === 'rare');
    const r2 = await db.rpc(bo, 'quick_buy_plot', { p_idempotency_key: 'ticket-roll-3', p_ticket: rare.id });
    expect(Number((await db.sql(`select sort from plot_rarities where id = $1`, [r2.rarity]))[0].sort)).toBeGreaterThanOrEqual(3);
  });
});

describe('Hot Zones', () => {
  it('today’s zone is a real city; a quick buy there lands inside it', async () => {
    const z = await db.rpc(cy, 'hot_zone_today');
    expect(z.today.name).toBeTruthy(); expect(z.tomorrow.name).toBeTruthy();
    await db.sql(`select private.ledger_apply($1, 'ink', 1000, 'admin_adjust', 'test', 'test', 'hot-roll-ink')`, [cy]);
    const r = await db.rpc(cy, 'quick_buy_plot', { p_idempotency_key: 'hot-roll-1', p_hot: true });
    expect(r.hot_zone).toBe(true);
    expect(Math.hypot(r.gx - z.today.gx, r.gy - z.today.gy)).toBeLessThanOrEqual(z.today.radius);
  });
  it('inside the zone rarities roll better (best of two)', async () => {
    const z = await db.rpc(cy, 'hot_zone_today');
    const [s] = await db.sql(`select avg((select sort from plot_rarities where id = private.plot_rarity_for($1 + i, $2 + i))) hot,
       avg((select sort from plot_rarities where id = private.plot_rarity_for(100 + i, 3000000 + i))) cold from generate_series(1, 3000) i`, [z.today.gx - 1500, z.today.gy - 1500]);
    expect(Number(s.hot)).toBeGreaterThan(Number(s.cold) + 0.4);
  });
});
