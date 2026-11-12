// Granted rolls (event prizes): a chosen rarity lands on a chosen upcoming roll for one player, and nobody else's rolls change.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let owner: string, eve: string, other: string;
const O = { gx: 3_300_000, gy: 2_200_000 };
let k = 0;
const claim = (uid: string, x: number) => db.rpc(uid, 'acquire_plot', { p_gx: O.gx + x, p_gy: O.gy + (uid === other ? 50 : 0), p_idempotency_key: `gr-${++k}-00000000` });

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('owner_ola'); eve = await db.newPlayer('event_eve'); other = await db.newPlayer('other_otto');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner') on conflict do nothing`, [owner]);
  for (const u of [eve, other]) { await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]); await db.giveInk(u, 100_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
});
afterAll(() => db.close());

describe('granted rolls', () => {
  it('only the owner can grant', async () => {
    await expect(db.rpc(eve, 'admin_grant_roll', { p_player: eve, p_rarity: 'mythic' })).rejects.toThrow(/forbidden|admin/);
  });
  it('a Mythic on her 3rd roll from now, twice in a row — exactly there', async () => {
    const g = await db.rpc(owner, 'admin_grant_roll', { p_player: eve, p_rarity: 'mythic', p_after: 3, p_count: 2, p_note: 'Winter event' });
    expect(g.filter((x: any) => !x.used_at).map((x: any) => x.in)).toEqual([3, 4]);
    const got: string[] = [];
    for (let i = 0; i < 5; i++) got.push((await claim(eve, i)).rarity);
    expect(got[2]).toBe('mythic'); expect(got[3]).toBe('mythic');
    expect((await db.rpc(owner, 'admin_roll_grants', { p_player: eve })).every((x: any) => x.used_at)).toBe(true);
    const audit = await db.sql(`select action from audit_logs where target_id = $1 and action like 'rolls.%'`, [eve]);
    expect(audit.map((a: any) => a.action)).toEqual(expect.arrayContaining(['rolls.grant', 'rolls.grant_used']));
  });
  it('a shiny grant, and other players’ rolls are untouched', async () => {
    await db.rpc(owner, 'admin_grant_roll', { p_player: eve, p_rarity: 'legendary', p_after: 1, p_shiny: true });
    const natural = (await db.sql(`select private.plot_rarity_for($1, $2) r`, [O.gx, O.gy + 50]))[0].r;
    const o = await claim(other, 0);
    expect(o.rarity).toBe(natural); // Otto's roll is exactly what the spot rolls for anyone
    const r = await claim(eve, 10);
    expect(r.rarity).toBe('legendary'); expect(r.shiny).toBe(true);
  });
  it('cancelled grants never land', async () => {
    const g = await db.rpc(owner, 'admin_grant_roll', { p_player: eve, p_rarity: 'mythic', p_after: 1 });
    const pending = g.find((x: any) => !x.used_at && !x.cancelled_at);
    await db.rpc(owner, 'admin_cancel_roll_grant', { p_id: pending.id });
    const natural = (await db.sql(`select private.plot_rarity_for($1, $2) r`, [O.gx + 20, O.gy]))[0].r;
    expect((await claim(eve, 20)).rarity).toBe(natural);
    expect((await db.rpc(owner, 'admin_roll_grants', { p_player: eve })).find((x: any) => x.id === pending.id).cancelled_at).toBeTruthy();
  });
  it('a City Crown grant waits for a claim inside a city whose Crown is free', async () => {
    const c = (await db.sql(`select id, gx, gy from world_cities order by pop desc limit 1`))[0];
    await db.rpc(owner, 'admin_grant_roll', { p_player: eve, p_rarity: 'crown', p_after: 1 });
    // a claim far from any city: the grant waits
    const far = await db.rpc(eve, 'acquire_plot', { p_gx: 10, p_gy: 10, p_idempotency_key: `gr-far-00000000` });
    expect(far.rarity).not.toBe('crown');
    const inCity = await db.rpc(eve, 'acquire_plot', { p_gx: c.gx, p_gy: c.gy, p_idempotency_key: `gr-city-0000000` });
    expect(inCity.rarity).toBe('crown');
  });
});
