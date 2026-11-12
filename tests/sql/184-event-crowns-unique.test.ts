// Event-roll Crowns are real Crowns: posted on the live feed, on Royalty and the rarity rankings, and one per kingdom.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let owner: string, ann: string, bob: string, cal: string;
let k = 0;
const claim = (uid: string, gx: number, gy: number) => db.rpc(uid, 'acquire_plot', { p_gx: gx, p_gy: gy, p_idempotency_key: `ec-${++k}-00000000` });
let A: any, B: any; // two cities in the same state

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('owner_ola'); ann = await db.newPlayer('ann_a'); bob = await db.newPlayer('bob_b'); cal = await db.newPlayer('cal_c');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner') on conflict do nothing`, [owner]);
  for (const u of [ann, bob, cal]) { await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]); await db.giveInk(u, 100_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  const pair = await db.sql(`select a.id a_id, a.gx a_gx, a.gy a_gy, b.id b_id, b.gx b_gx, b.gy b_gy, a.state, a.country from world_cities a join world_cities b
                               on b.country = a.country and b.state = a.state and b.id <> a.id where a.state is not null order by a.pop desc limit 1`);
  A = { id: pair[0].a_id, gx: pair[0].a_gx, gy: pair[0].a_gy, state: pair[0].state, country: pair[0].country };
  B = { id: pair[0].b_id, gx: pair[0].b_gx, gy: pair[0].b_gy };
});
afterAll(() => db.close());

describe('event-roll Crowns', () => {
  it('a granted State Crown lands in its state, on the feed, on Royalty and in the rarity rankings', async () => {
    await db.rpc(owner, 'admin_grant_roll', { p_player: ann, p_rarity: 'crown_state', p_after: 1 });
    const r = await claim(ann, A.gx, A.gy);
    expect(r.rarity).toBe('crown_state');
    const feed = await db.sql(`select kind, data from feed_events where player_id = $1 order by id`, [ann]);
    expect(feed.find((f: any) => f.kind === 'claim')?.data.rarity).toBe('crown_state');
    expect(feed.find((f: any) => f.kind === 'crown')?.data).toMatchObject({ tier: 'crown_state', place: A.state });
    const roy = await db.rpc(bob, 'royalty', {});
    expect(roy.crowns.filter((c: any) => c.tier === 'crown_state' && c.state === A.state)).toHaveLength(1);
    const rr = await db.rpc(bob, 'rarity_rankings', { p_rarity: 'crown_state' });
    expect(rr.rows.map((x: any) => x.player.id)).toContain(ann);
  });
  it('no second State Crown in that state — not by grant, not by a natural roll', async () => {
    await db.rpc(owner, 'admin_grant_roll', { p_player: bob, p_rarity: 'crown_state', p_after: 1 });
    const r = await claim(bob, B.gx, B.gy);
    expect(r.rarity).not.toBe('crown_state');
    expect((await db.sql(`select private.plot_rarity_for($1, $2) r`, [B.gx + 1, B.gy]))[0].r).not.toBe('crown_state');
    const n = await db.sql(`select count(*)::int n from world_plots p join world_cities k on k.id = p.city_id where p.rarity = 'crown_state' and k.country = $1 and k.state = $2`, [A.country, A.state]);
    expect(n[0].n).toBe(1);
    // Bob's grant is still waiting for a free state
    expect((await db.rpc(owner, 'admin_roll_grants', { p_player: bob })).some((x: any) => !x.used_at && !x.cancelled_at)).toBe(true);
  });
  it('Simple mode quick rolls steer a waiting Crown into the nearest free state', async () => {
    const r = await db.rpc(bob, 'quick_buy_plot', { p_idempotency_key: `ec-quick-0000000` });
    expect(r.rarity).toBe('crown_state');
    const at = (await db.sql(`select k.country, k.state from world_plots p join world_cities k on k.id = p.city_id where p.gx = $1 and p.gy = $2`, [r.gx, r.gy]))[0];
    expect(at.state).not.toBeNull();
    expect(`${at.country}/${at.state}`).not.toBe(`${A.country}/${A.state}`);
  });
  it('a Crown granted outside any kingdom before this fix is moved into a free one', async () => {
    await db.sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) values (20, 20, $1, (select id from plot_types limit 1), 'crown_state', now())`, [cal]);
    expect((await db.sql(`select city_id from world_plots where gx = 20 and gy = 20`))[0].city_id).toBeNull();
    const sql = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../supabase/migrations/20261119000164_event_rolls_public_unique_crowns.sql'), 'utf8');
    const repair = sql.slice(sql.indexOf('-- ---- repair Crowns'), sql.indexOf('-- the Crowns granted this past week'));
    const c = await db.connect(); // a fresh session, like the deploy's migration run
    await c.query(repair);
    const row = (await db.sql(`select p.city_id, k.state, k.country from world_plots p join world_cities k on k.id = p.city_id where p.gx = 20 and p.gy = 20`))[0];
    expect(row?.state).toBeTruthy();
    const dup = await db.sql(`select k.country, k.state, count(*)::int n from world_plots p join world_cities k on k.id = p.city_id where p.rarity = 'crown_state' and p.owner_id is not null group by 1, 2 having count(*) > 1`);
    expect(dup).toHaveLength(0);
  });
});
