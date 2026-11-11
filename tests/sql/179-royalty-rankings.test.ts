// Royalty (every Crown held, its kingdom, reign and strength, the royal court) and rankings for every plot rarity.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let king: string, queen: string, shy: string, peasant: string;
const plot = async (uid: string, rarity: string, dx: number, cityId?: number) => {
  const c = cityId ? (await db.sql(`select gx, gy from world_cities where id = $1`, [cityId]))[0] : { gx: 1000 + dx, gy: 1000 };
  await db.sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) values ($1, $2, $3, (select id from plot_types limit 1), $4, now() - interval '3 days')
                on conflict (gx, gy) do update set owner_id = excluded.owner_id, rarity = excluded.rarity`, [c.gx + (cityId ? dx : 0), c.gy, uid, rarity]);
};
beforeAll(async () => {
  await db.init({ ungated: true });
  king = await db.newPlayer('king_kai'); queen = await db.newPlayer('queen_qi'); shy = await db.newPlayer('shy_shah'); peasant = await db.newPlayer('pat_peasant');
  const cities = (await db.sql(`select id from world_cities order by pop desc limit 3`)).map((r: any) => r.id);
  await plot(king, 'crown_country', 0, cities[0]); await plot(king, 'crown', 1, cities[0]);
  await plot(queen, 'crown_state', 0, cities[1]);
  await plot(shy, 'crown', 0, cities[2]);
  await plot(peasant, 'mythic', 2, cities[0]); // a rival in the king's kingdom
  for (let i = 0; i < 3; i++) await plot(queen, 'mythic', 10 + i);
  await plot(king, 'mythic', 20);
});
afterAll(() => db.close());

describe('royalty', () => {
  it('lists every Crown, Country first, with its kingdom, reign and strength — signed out too', async () => {
    const r = await db.rpc(null, 'royalty');
    expect(r.crowns.map((c: any) => c.tier)).toEqual(['crown_country', 'crown_state', 'crown', 'crown']);
    const top = r.crowns[0];
    expect(top.holder.username).toBe('king_kai'); expect(top.kingdom).toBeTruthy();
    expect(top.reign_days).toBe(3); expect(top.rivals).toBeGreaterThanOrEqual(1);
    expect(Number(top.strength)).toBeGreaterThan(0); expect(Number(top.boost)).toBeGreaterThan(1);
    expect(JSON.stringify(r)).not.toMatch(/"gx"|"gy"/); // never where the plot is
    expect(r.totals).toMatchObject({ country: 1, state: 1, city: 2, monarchs: 3 });
    expect(r.court[0].player.username).toBe('king_kai'); expect(r.court[0].crowns).toBe(2);
  });
  it('a player can keep themselves off the Royalty page (they still see themselves)', async () => {
    await db.rpc(shy, 'set_privacy', { p_patch: { royalty: false } });
    const r = await db.rpc(peasant, 'royalty');
    const mine = r.crowns.filter((c: any) => c.tier === 'crown' && !c.holder);
    expect(mine.length).toBe(1);
    expect(r.court.some((x: any) => x.player.username === 'shy_shah')).toBe(false);
    const me = await db.rpc(shy, 'royalty');
    expect(me.crowns.some((c: any) => c.is_me && c.holder?.username === 'shy_shah')).toBe(true);
  });
});

describe('rarity rankings', () => {
  it('every rarity’s totals and its top holder', async () => {
    const all = await db.rpc(null, 'rarity_rankings', {});
    const m = all.find((x: any) => x.rarity === 'mythic');
    expect(m.owned).toBe(5); expect(m.owners).toBe(3); expect(m.top.player.username).toBe('queen_qi'); expect(m.top.value).toBe(3);
  });
  it('the top holders of one rarity, and players hiding their stats aren’t listed', async () => {
    let r = await db.rpc(king, 'rarity_rankings', { p_rarity: 'mythic' });
    expect(r.rows.map((x: any) => x.player.username)[0]).toBe('queen_qi'); expect(r.me).toBe(1);
    await db.rpc(queen, 'set_privacy', { p_patch: { profile_stats: false } });
    r = await db.rpc(king, 'rarity_rankings', { p_rarity: 'mythic' });
    expect(r.rows.some((x: any) => x.player.username === 'queen_qi')).toBe(false);
    await expect(db.rpc(king, 'rarity_rankings', { p_rarity: 'nope' })).rejects.toThrow(/invalid_rarity/);
  });
});
