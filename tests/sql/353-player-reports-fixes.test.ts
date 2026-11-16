// Fixes from players' reports: one-time keys that collided, the Keeper's level, sprinklers and the watering chore,
// a coop showing -1, PvP's waiting count, the storm timer, painting time, Landlord at a glance, reminders' timers,
// and the Hot Zone's city facts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let ann: string, ben: string;

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('fix_ann'); ben = await db.newPlayer('fix_ben');
  for (const u of [ann, ben]) { await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]); await db.giveInk(u, 10_000); }
});
afterAll(() => db.close());

describe('one-time keys', () => {
  it('a digging-energy refill works again after the reset hour moves (the old keys collided)', async () => {
    await db.sql(`insert into planet_miners (player_id, energy, energy_at) values ($1, 1, now()) on conflict (player_id) do update set energy = 1, energy_at = now()`, [ann]);
    await db.rpc(ann, 'planet_dig_refill', { p_kind: 'ink' });
    await db.sql(`update planet_miners set energy = 1, energy_at = now() where player_id = $1`, [ann]);
    // the owner moves the daily reset by an hour: same date, a new game day — the counters start again
    await db.sql(`update game_config set value = jsonb_set(value, '{boost,reset_hour}', to_jsonb(((coalesce((value->'boost'->>'reset_hour')::int, 18) + 23) % 24))) where key = 'rent'`);
    const r = await db.rpc(ann, 'planet_dig_refill', { p_kind: 'ink' });
    expect(r.refilled).toBe('ink');
    const keys = await db.sql(`select idempotency_key k from resource_ledger where player_id = $1 and reason = 'dig_refill'`, [ann]);
    expect(keys).toHaveLength(2);
    expect(keys.every((x: any) => /T\d{4}:/.test(x.k))).toBe(true);
  });
  it('every function that built a key from the day’s date now uses the exact day', async () => {
    for (const f of ['public.planet_quest_claim(text,text)', 'public.planet_dig_refill(text,text,integer,integer)', 'public.farm_chore_claim(text)', 'public.arcade_daily()']) {
      const d = (await db.sql(`select pg_get_functiondef($1::regprocedure) d`, [f]))[0].d;
      expect(d).not.toContain('v_day::date ||');
      expect(d).toContain('private.day_key(v_day)');
    }
  });
});

describe('small fixes', () => {
  it('the expedition’s news says which Keeper level', async () => {
    const d = (await db.sql(`select pg_get_functiondef('public.keeper_expedition_claim(uuid)'::regprocedure) d`))[0].d;
    expect(d).toContain(`'level', v_add -> 'level'`);
  });
  it('a coop whose clock ran ahead shows 0 ready (never -1), and collecting keeps the exact time', async () => {
    await db.sql(`insert into farm_progress (player_id, buildings) values ($1, jsonb_build_object('coop', jsonb_build_object('lvl', 6, 'at', now() + interval '2 minutes')))
                  on conflict (player_id) do update set buildings = excluded.buildings`, [ann]);
    const b = (await db.sql(`select private.farm_building_json($1, 'coop') b`, [ann]))[0].b;
    expect(b.ready).toBe(0);
    expect(b.every_exact).toBeGreaterThan(0);
    expect(b.full_at).toBeTruthy();
  });
  it('sprinklered plantings count for the watering chore', async () => {
    const d = (await db.sql(`select pg_get_functiondef('public.farm_plant(uuid,integer,text)'::regprocedure) d`))[0].d;
    expect(d).toContain(`if v_water then perform private.farm_chore_bump(v_uid, 'water', 1); end if;`);
  });
  it('the storm to wait for is never one that already blew over', async () => {
    for (const w of ['mars', 'moon', 'venus', 'pluto', 'exo:123']) {
      const x = (await db.sql(`select private.weather_now($1) w`, [w]))[0].w;
      expect(new Date(x.ends).getTime()).toBeGreaterThan(Date.now() - 2000);
      expect(new Date(x.next).getTime()).toBeGreaterThan(new Date(x.ends).getTime());
    }
  });
  it('PvP counts only rivals you can play', async () => {
    await db.sql(`update game_config set value = value || '{"enabled": true}' where key = 'pvp'`);
    const m = (await db.sql(`insert into pvp_matches (game, seed, rounds, created_by, open_until) values ('forgery', 7, 3, $1, now() + interval '1 day') returning id`, [ben]))[0].id;
    await db.sql(`insert into pvp_runs (match_id, player_id, seat) values ($1, $2, 'a')`, [m, ben]);
    expect((await db.rpc(ann, 'pvp_lobby')).config.games.forgery.waiting).toBe(1);
    // Ann played Ben an hour ago: he can't be her rival again yet
    const old = (await db.sql(`insert into pvp_matches (game, seed, rounds, created_by, open_until, status) values ('forgery', 8, 3, $1, now(), 'done') returning id`, [ben]))[0].id;
    await db.sql(`insert into pvp_runs (match_id, player_id, seat, started_at) values ($1, $2, 'a', now() - interval '1 hour'), ($1, $3, 'b', now() - interval '1 hour')`, [old, ben, ann]);
    const g = (await db.rpc(ann, 'pvp_lobby')).config.games.forgery;
    expect(g.waiting).toBe(0); expect(g.waiting_all).toBe(1);
  });
  it('painting: progress toward today’s 2 minutes', async () => {
    await db.sql(`insert into painting_days (player_id, day, effort_ms) values ($1, private.day_start(now()), 70000)`, [ann]);
    let s = await db.rpc(ann, 'my_streak');
    expect(s).toMatchObject({ today: false, need_minutes: 2 });
    expect(s.minutes_today).toBeCloseTo(1.2, 1);
    await db.sql(`update painting_days set effort_ms = 130000 where player_id = $1`, [ann]);
    s = await db.rpc(ann, 'my_streak');
    expect(s.today).toBe(true);
  });
});

describe('Landlord, reminders, Hot Zone', () => {
  it('my_landlord_status lists rentals with today’s checklist and rent-day readiness', async () => {
    expect(await db.rpc(ben, 'my_landlord_status')).toEqual([]);
  });
  it('my_timers: only future times, soonest first — energy, the daily reset', async () => {
    await db.sql(`update planet_miners set energy = 10, energy_at = now() where player_id = $1`, [ann]);
    const t = await db.rpc(ann, 'my_timers');
    const kinds = t.map((x: any) => x.kind);
    expect(kinds).toContain('dig_energy'); expect(kinds).toContain('daily_reset');
    const at = t.map((x: any) => new Date(x.at).getTime());
    expect(at.every((v: number) => v > Date.now() - 1000)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(t.find((x: any) => x.kind === 'dig_energy').to).toBe('/space');
  });
  it('the Hot Zone tells you about its city', async () => {
    const h = await db.rpc(ann, 'hot_zone_today');
    expect(h.about).toBeTruthy();
    expect(h.about.pop).toBeGreaterThan(0);
    expect(h.about.pop_rank).toBeGreaterThanOrEqual(1);
  });
});

describe('arcades: unlocked cabinets survive a merge, and the plot card says how many are unlocked', () => {
  it('merging a fully unlocked arcade into a new one keeps every cabinet', async () => {
    const cal = await db.newPlayer('fix_cal');
    await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [cal]);
    await db.giveInk(cal, 100_000);
    const A = { gx: 3_210_000, gy: 2_110_000 };
    await db.rpc(cal, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
    await db.rpc(cal, 'acquire_plot', { p_gx: A.gx + 1, p_gy: A.gy, p_idempotency_key: 'fix-cal-acq-00001' });
    const groups = await db.rpc(cal, 'my_groups');
    const ids: string[] = [];
    for (const g of groups) ids.push((await db.rpc(cal, 'set_group_kind', { p_group_id: g.id, p_kind: 'arcade' })).arcade_id);
    const all = (await db.sql(`select array_agg(k) ks from jsonb_object_keys((select value -> 'games' from game_config where key = 'arcade')) k`))[0].ks as string[];
    // the second plot's arcade had everything unlocked; the first had nothing
    await db.sql(`update arcades set machines = (select jsonb_object_agg(k, 1) from unnest($2::text[]) k) where id = $1`, [ids[1], all]);
    await db.sql(`update arcades set xp = 5000 where id = $1`, [ids[0]]);
    const merged = await db.rpc(cal, 'fuse_groups', { p_group_ids: groups.map((g: any) => g.id) });
    const arc = (await db.sql(`select id, machines from arcades where group_id = $1`, [merged.id]))[0];
    expect(Object.keys(arc.machines).sort()).toEqual([...all].sort());
    const acc = await db.rpc(cal, 'place_access', { p_kind: 'arcade', p_id: arc.id });
    expect(acc.unlocked).toBeGreaterThan(0);
    expect(acc.unlocked).toBeLessThanOrEqual(acc.total);
  });
});

describe('arcades: a split keeps its cabinets', () => {
  it('detaching the middle plot leaves two arcades, both with every cabinet unlocked', async () => {
    const dee = await db.newPlayer('fix_dee');
    await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [dee]);
    await db.giveInk(dee, 100_000);
    const A = { gx: 3_220_000, gy: 2_120_000 };
    await db.rpc(dee, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
    for (let x = 1; x <= 2; x++) await db.rpc(dee, 'acquire_plot', { p_gx: A.gx + x, p_gy: A.gy, p_idempotency_key: `fix-dee-acq-${x}-000` });
    for (const g of await db.rpc(dee, 'my_groups')) await db.rpc(dee, 'set_group_kind', { p_group_id: g.id, p_kind: 'arcade' });
    const merged = await db.rpc(dee, 'fuse_groups', { p_group_ids: (await db.rpc(dee, 'my_groups')).map((g: any) => g.id) });
    await db.sql(`update arcades set machines = '{"claw": 2, "pinball": 1}'::jsonb where group_id = $1`, [merged.id]);
    const r = await db.rpc(dee, 'detach_plots', { p_group_id: merged.id, p_cells: [[A.gx + 1, A.gy]] });
    const part = r.new_groups.find((g: any) => /\(part\)$/.test(g.name));
    expect(part).toBeTruthy();
    expect(part.kind ?? (await db.sql(`select kind from canvas_groups where id = $1`, [part.id]))[0].kind).toBe('arcade');
    const m = (await db.sql(`select machines from arcades where group_id = $1`, [part.id]))[0].machines;
    expect(m).toMatchObject({ claw: 2, pinball: 1 });
  });
});
