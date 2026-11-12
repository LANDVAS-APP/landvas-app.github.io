// Kingdoms count everyone in the state / country (not only inside a city's circle), and the owner's plot tools.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let owner: string, queen: string, eve: string; const others: string[] = [];
let k = 0;
const claim = (uid: string, gx: number, gy: number) => db.rpc(uid, 'acquire_plot', { p_gx: gx, p_gy: gy, p_idempotency_key: `kr-${++k}-00000000` });
let SLC: any;

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('owner_ola'); queen = await db.newPlayer('queen_q'); eve = await db.newPlayer('eve_e');
  for (let i = 0; i < 5; i++) others.push(await db.newPlayer(`utahn_${i}`));
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner') on conflict do nothing`, [owner]);
  for (const u of [queen, eve, ...others]) { await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]); await db.giveInk(u, 100_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  SLC = (await db.sql(`select id, gx, gy, radius, state from world_cities where name = 'Salt Lake City'`))[0];
});
afterAll(() => db.close());

describe('kingdom regions', () => {
  it('players outside the city circle but in the state count toward the State Crown', async () => {
    await db.rpc(owner, 'admin_grant_roll', { p_player: queen, p_rarity: 'crown_state', p_after: 1 });
    expect((await claim(queen, SLC.gx, SLC.gy)).rarity).toBe('crown_state');
    // five players ~40-60 km south (Provo-ish), well outside Salt Lake City's circle
    for (let i = 0; i < 5; i++) await claim(others[i], SLC.gx + 200 + i * 7, SLC.gy + 5000 + i * 600);
    const out = await db.sql(`select city_id, region_city_id from world_plots where owner_id = any($1)`, [others]);
    expect(out.every((r: any) => r.city_id === null && r.region_city_id === SLC.id)).toBe(true);
    const roy = await db.rpc(eve, 'royalty', {});
    const c = roy.crowns.find((x: any) => x.tier === 'crown_state' && x.state === SLC.state);
    expect(c.rivals).toBe(5);
    // a City Crown still counts only the city
    expect((await db.sql(`select private.kingdom_rivals('crown', $1, $2) n`, [SLC.id, queen]))[0].n).toBe(0);
  });
});

describe('owner plot tools', () => {
  it('only the owner', async () => {
    await expect(db.rpc(eve, 'admin_player_plots', { p_player: queen })).rejects.toThrow(/forbidden|admin/);
  });
  let removed: any;
  it('take a Crown away: the kingdom is free again and the spot is a plain roll', async () => {
    const plots = await db.rpc(owner, 'admin_player_plots', { p_player: queen });
    const crown = plots.find((p: any) => p.rarity === 'crown_state');
    expect(crown.kingdom).toBe(SLC.state); removed = crown;
    await db.rpc(owner, 'admin_take_plot', { p_gx: crown.gx, p_gy: crown.gy, p_reason: 'wrong state, swapping' });
    const row = (await db.sql(`select owner_id, rarity from world_plots where gx = $1 and gy = $2`, [crown.gx, crown.gy]))[0];
    expect(row.owner_id).toBeNull(); expect(row.rarity).not.toMatch(/^crown/);
    expect((await db.sql(`select private.crown_state_held($1, $2) h`, ['US', SLC.state]))[0].h).toBe(false);
  });
  it('give a State Crown: lands in the nearest free state, posted on the feed', async () => {
    const r = await db.rpc(owner, 'admin_give_plot', { p_player: queen, p_rarity: 'crown_state', p_reason: 'sorry for the mixup', p_near_gx: removed.gx, p_near_gy: removed.gy });
    const at = (await db.sql(`select p.owner_id, p.rarity, k.state from world_plots p join world_cities k on k.id = p.city_id where p.gx = $1 and p.gy = $2`, [r.gx, r.gy]))[0];
    expect(at.owner_id).toBe(queen); expect(at.rarity).toBe('crown_state'); expect(at.state).toBe(SLC.state);
    expect((await db.sql(`select count(*)::int n from feed_events where player_id = $1 and kind = 'crown'`, [queen]))[0].n).toBeGreaterThanOrEqual(2);
    // a second one can't go in the same state — it goes to another free one
    const r2 = await db.rpc(owner, 'admin_give_plot', { p_player: eve, p_rarity: 'crown_state', p_reason: 'event prize', p_near_gx: removed.gx, p_near_gy: removed.gy });
    const at2 = (await db.sql(`select k.state from world_plots p join world_cities k on k.id = p.city_id where p.gx = $1 and p.gy = $2`, [r2.gx, r2.gy]))[0];
    expect(at2.state).not.toBe(SLC.state);
  });
  it('give a shiny Mythic of a chosen minigame, quietly', async () => {
    const type = (await db.sql(`select id from plot_types order by id limit 1`))[0].id;
    const before = (await db.sql(`select count(*)::int n from feed_events where player_id = $1`, [eve]))[0].n;
    const r = await db.rpc(owner, 'admin_give_plot', { p_player: eve, p_rarity: 'mythic', p_shiny: true, p_plot_type: type, p_reason: 'outage make-good', p_post: false });
    const row = (await db.sql(`select owner_id, rarity, shiny, plot_type from world_plots where gx = $1 and gy = $2`, [r.gx, r.gy]))[0];
    expect(row).toEqual({ owner_id: eve, rarity: 'mythic', shiny: true, plot_type: type });
    expect((await db.sql(`select count(*)::int n from feed_events where player_id = $1`, [eve]))[0].n).toBe(before);
  });
  it('change a plot in place; a Crown only where the kingdom is free', async () => {
    const p = (await db.rpc(owner, 'admin_player_plots', { p_player: others[0] }))[0];
    await db.rpc(owner, 'admin_set_plot_rarity', { p_gx: p.gx, p_gy: p.gy, p_rarity: 'legendary', p_shiny: true, p_reason: 'bug make-good' });
    expect((await db.sql(`select rarity, shiny from world_plots where gx = $1 and gy = $2`, [p.gx, p.gy]))[0]).toEqual({ rarity: 'legendary', shiny: true });
    // Salt Lake City's state is held again (queen) — this plot's region doesn't matter, it's outside any city: no Crown
    await expect(db.rpc(owner, 'admin_set_plot_rarity', { p_gx: p.gx, p_gy: p.gy, p_rarity: 'crown_state', p_shiny: false, p_reason: 'try it' })).rejects.toThrow(/crown_taken/);
    const audit = await db.sql(`select action from audit_logs where action in ('plot.taken', 'plot.given', 'plot.rarity_set')`);
    expect(new Set(audit.map((a: any) => a.action)).size).toBe(3);
  });
});
