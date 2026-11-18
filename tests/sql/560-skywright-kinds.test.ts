// ✨ Skywright's star-only plot types and each kind of star's own rules: the Forge fuses up the ladder as far as its
// star allows (and tempers iron into Crucible Starsteel); the Grove grows by the star's light (and blooms in a flare);
// the Ranch catches comets that come back; Starsong loops; sails carry elements to another star; the Observatory finds
// exoplanets you can claim; the Hatchery lays plasma eggs; Stargates take a toll and link into highways; a Starbeam Lens
// lifts claims under it a tier; eclipses, pulsars, black holes, lighting a star, a supernova.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';
import { tileStars, genStar } from '../../src/stars/galaxy';

const db = new TestDb();
let me: string, you: string, staff: string;
function findStar(t: number, want: (s: NonNullable<ReturnType<typeof genStar>>) => boolean) {
  for (let f = 0; f < 6; f++) for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) for (const s of tileStars(t, f, i, j)) if (want(s)) return s;
  throw new Error('no star');
}
const go = async (uid: string, id: number) => { await db.rpc(uid, 'star_warp', { p_id: id }); await db.rpc(uid, 'star_rush'); };
const claim = (uid: string, id: number, cell: number, kind = 'base') => db.rpc(uid, 'star_claim', { p_id: id, p_cell: cell, p_kind: kind });
const act = (uid: string, id: number, cell: number, action: string, args: Record<string, unknown> = {}) => db.rpc(uid, 'star_act', { p_id: id, p_cell: cell, p_action: action, p_args: args });
const plot = (uid: string, id: number, cell: number) => db.rpc(uid, 'star_plot', { p_id: id, p_cell: cell });
const els = async (uid: string) => (await db.rpc(uid, 'my_star_things')).els;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0].amount);
const age = (id: number, cell: number, key: string, hours: number) => db.sql(`update star_plots set state = state || jsonb_build_object($3::text, now() - make_interval(hours => $4)) where star_id = $1 and cell = $2`, [id, cell, key, hours]);

beforeAll(async () => {
  await db.init({ ungated: true });
  me = await db.newPlayer('sk_me'); you = await db.newPlayer('sk_you'); staff = await db.newPlayer('sk_staff');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner')`, [staff]);
  for (const u of [me, you]) await db.giveInk(u, 5_000_000);
});
afterAll(() => db.close());

describe('the plot types', () => {
  it('every type can be chosen when claiming; the Stargate and the Lens only on a Keystone', async () => {
    const kinds = (await db.rpc(me, 'star_kinds')).map((k: any) => k.id);
    expect(kinds).toEqual(['base', 'art', 'forge', 'grove', 'ranch', 'song', 'sails', 'observatory', 'hatchery', 'gate', 'lens']);
    const s = findStar(2, (x) => x.cls === 'yellow');
    await go(me, s.id);
    await expectError(claim(me, s.id, 40, 'gate'), 'keystone_only');
    expect((await claim(me, s.id, 40, 'forge')).kind).toBe('forge');
    expect((await claim(me, s.id, 0, 'gate')).kind).toBe('gate');
  });

  it('🔥 the Forge gathers hydrogen and fuses it as far as its star allows; iron tempers into Crucible Starsteel', async () => {
    const red = findStar(2, (x) => x.cls === 'red_dwarf');
    await go(me, red.id);
    await claim(me, red.id, 30, 'forge');
    await age(red.id, 30, 'at', 5);
    const v = (await plot(me, red.id, 30)).view;
    expect(v).toMatchObject({ top: 'he', rate: 6 });
    expect(v.ready).toBe(30);
    const r = await act(me, red.id, 30, 'collect');
    expect(r.result.h).toBeGreaterThanOrEqual(30); // (×2 in a flare)
    expect((await plot(me, red.id, 30)).view.ready).toBe(0);
    await act(me, red.id, 30, 'fuse', { from: 'h', times: 2 });
    expect(await els(me)).toMatchObject({ he: 2 });
    // a red dwarf stops at helium
    await db.sql(`insert into star_elements (player_id, element, amount) values ($1, 'he', 100) on conflict (player_id, element) do update set amount = 100`, [me]);
    await expectError(act(me, red.id, 30, 'fuse', { from: 'he' }), 'too_heavy');
    await expectError(act(me, red.id, 30, 'fuse', { from: 'h', times: 500 }), 'not_enough');
    // a supergiant reaches iron; iron tempers into Starsteel — in your Crucible
    const sg = findStar(3, (x) => x.cls === 'supergiant');
    await go(me, sg.id);
    await claim(me, sg.id, 20, 'forge');
    expect((await plot(me, sg.id, 20)).view.top).toBe('fe');
    await db.sql(`insert into star_elements (player_id, element, amount) values ($1, 'si', 40) on conflict (player_id, element) do update set amount = 40`, [me]);
    await act(me, sg.id, 20, 'fuse', { from: 'si', times: 10 });
    expect((await els(me)).fe).toBe(10);
    await expectError(act(me, sg.id, 20, 'temper'), 'no_crucible');
    const cru = (await db.sql(`insert into enchantments (gx, gy, owner_id, kind, serial, sigil, state) values (1, 1, $1, 'crucible', 1, 1, '{"metal": {"iron": 2}}') returning id`, [me]))[0].id;
    await act(me, sg.id, 20, 'temper');
    const st = (await db.sql(`select state from enchantments where id = $1`, [cru]))[0].state;
    expect(st.metal).toEqual({ iron: 2, starsteel: 1 });
    expect((await els(me)).fe).toBe(7);
  });

  it('🌱 the Grove grows its star’s plant; harvest it for Ink and a page in the codex', async () => {
    const s = findStar(2, (x) => x.cls === 'blue');
    await go(me, s.id);
    await claim(me, s.id, 50, 'grove');
    await act(me, s.id, 50, 'plant');
    await expectError(act(me, s.id, 50, 'harvest'), 'not_ready');
    await expectError(act(me, s.id, 50, 'plant'), 'already_planted');
    await age(s.id, 50, 'planted_at', 7);
    const before = await ink(me);
    const r = await act(me, s.id, 50, 'harvest');
    expect(r.result).toMatchObject({ species: 'frost_lily', ink: 12, codex: 1 });
    expect(await ink(me)).toBe(before + 12);
    expect((await db.rpc(me, 'my_star_things')).codex).toEqual({ frost_lily: 1 });
  });

  it('☄️ the Ranch catches a passing comet; it comes back with ice', async () => {
    const s = findStar(2, (x) => x.cls === 'orange');
    await go(me, s.id);
    await claim(me, s.id, 60, 'ranch');
    let v = (await plot(me, s.id, 60)).view;
    // (wait for a pass: move the clock of this plot's window by asking until one's on — or skip ahead by changing the schedule)
    if (!v.pass.now) await db.sql(`update game_config set value = jsonb_set(value, '{kinds,ranch,window_min}', '180') where key = 'stars'`);
    v = (await plot(me, s.id, 60)).view;
    expect(v.pass.now).toBe(true);
    const c = (await act(me, s.id, 60, 'catch')).result.comet;
    expect(c.name).toMatch(/^C\/\d{4} [A-Z]\d$/);
    await expectError(act(me, s.id, 60, 'catch'), 'caught_already');
    await expectError(act(me, s.id, 60, 'harvest'), 'nothing_ready');
    await db.sql(`update star_plots set state = jsonb_set(state, '{comets,0,last}', to_jsonb(now() - interval '20 hours')) where star_id = $1 and cell = 60`, [s.id]);
    const r = await act(me, s.id, 60, 'harvest');
    expect(r.result.h).toBeGreaterThan(0);
    expect(r.result.ink).toBeGreaterThan(0);
    expect((await plot(me, s.id, 60)).view.comets[0].returns).toBeGreaterThan(0);
    await db.sql(`update game_config set value = jsonb_set(value, '{kinds,ranch,window_min}', '25') where key = 'stars'`);
  });

  it('🎵 Starsong keeps a loop of the star’s notes, and anyone can hear the star', async () => {
    const s = findStar(2, (x) => x.cls === 'white');
    await go(me, s.id);
    await claim(me, s.id, 70, 'song');
    await expectError(act(me, s.id, 70, 'compose', { loop: 'abc' }), 'invalid_loop');
    await act(me, s.id, 70, 'compose', { loop: '0.2.4.7.', tempo: 120 });
    expect(await db.rpc(null, 'star_songs', { p_id: s.id })).toEqual([{ cell: 70, loop: '0.2.4.7.', tempo: 120, by: 'sk_me' }]);
  });

  it('⛵ sails carry elements to another player’s star; they collect it when it lands', async () => {
    const s = findStar(2, (x) => x.cls === 'blue');
    const t = findStar(2, (x) => x.cls === 'yellow' && x.id !== s.id);
    await go(me, s.id);
    await claim(me, s.id, 80, 'sails');
    await expectError(act(me, s.id, 80, 'launch', { to: 'sk_you', element: 'he', amount: 5 }), 'no_star');
    await go(you, t.id); await claim(you, t.id, 90, 'sails');
    await db.sql(`insert into star_elements (player_id, element, amount) values ($1, 'he', 50) on conflict (player_id, element) do update set amount = 50`, [me]);
    const r = (await act(me, s.id, 80, 'launch', { to: 'sk_you', element: 'he', amount: 5 })).result;
    expect(r.to_star).toBe(t.id);
    expect((await els(me)).he).toBe(45);
    const inbox = (await db.rpc(you, 'my_star_things')).sails_in;
    expect(inbox).toEqual([expect.objectContaining({ from: 'sk_me', cargo: { he: 5 }, arrived: false })]);
    await expectError(db.rpc(you, 'star_sail_collect', { p_id: inbox[0].id }), 'not_arrived');
    await db.sql(`update star_sails set arrive_at = now() - interval '1 second' where id = $1`, [inbox[0].id]);
    expect((await db.rpc(you, 'star_sail_collect', { p_id: inbox[0].id })).els.he).toBe(5);
    expect((await db.sql(`select data from player_notifications where player_id = $1 and kind = 'star' order by id desc limit 1`, [you]))[0].data.sub).toBe('sail');
  });

  it('🔭 an Observatory reaches deeper from Earth, and surveys: an exoplanet is a world you can claim', async () => {
    const s = findStar(2, (x) => x.cls === 'yellow');
    expect((await db.rpc(me, 'star_reach')).reach).toBe(3);
    await go(me, s.id);
    await claim(me, s.id, 100, 'observatory');
    expect((await db.rpc(me, 'star_reach')).reach).toBe(4);
    // survey until an exoplanet turns up (each survey is a fresh roll; the wait between them skipped here)
    let found: any = null;
    for (let k = 0; k < 30 && !found; k++) {
      const r = (await act(me, s.id, 100, 'survey')).result;
      if (r.kind === 'exoplanet') found = r;
      await db.sql(`update star_plots set state = state - 'last' where star_id = $1 and cell = 100`, [s.id]);
    }
    expect(found).toBeTruthy();
    const world = found.data.world;
    expect((await db.sql(`select private.planet_open($1, $2) ok`, [me, world]))[0].ok).toBe(true);
    expect((await db.sql(`select private.planet_open($1, $2) ok`, [you, world]))[0].ok).toBe(false);
    expect((await db.sql(`select visited from space_pilots where player_id = $1`, [me]))[0].visited).toContain(world);
    expect((await db.rpc(me, 'my_star_things')).exoplanets[0]).toMatchObject({ world });
    await act(me, s.id, 100, 'survey').catch(() => null);
    await expectError(act(me, s.id, 100, 'survey'), 'too_soon');
  });

  it('🐣 the Hatchery lays a plasma egg in its star’s colours', async () => {
    const s = findStar(1, (x) => x.cls === 'neutron');
    await go(me, s.id);
    await claim(me, s.id, 5, 'hatchery');
    const r = (await act(me, s.id, 5, 'collect')).result;
    expect(r.egg).toMatchObject({ kind: 'cosmic', ready: false, hatched: false });
    const g = (await db.sql(`select genome from inkborn_eggs where id = $1`, [r.egg.id]))[0].genome;
    expect(g).toMatchObject({ gait: 'hover', tail: 'flame', eyecount: 1 });
    await db.sql(`select private.check_genome($1::jsonb)`, [JSON.stringify(g)]);
    await expectError(act(me, s.id, 5, 'collect'), 'too_soon');
  });

  it('🌀 a Stargate takes a toll of others’ warps; two of your gates linked make a highway', async () => {
    const a = findStar(2, (x) => x.cls === 'yellow');
    const b = findStar(2, (x) => x.cls === 'orange');
    // (me has a gate on a from the first test; build one on b and link them)
    await go(me, b.id);
    await claim(me, b.id, 1, 'gate');
    await act(me, b.id, 1, 'link', { star: a.id, cell: 0 });
    expect((await plot(me, a.id, 0)).view.link).toEqual({ star: b.id, cell: 1 });
    // you warp to a: cheaper, and its keeper (me) takes a toll
    await db.rpc(you, 'star_home');
    const card = await db.rpc(you, 'star_card', { p_id: a.id });
    expect(card.warp.gate).toBe(true);
    const before = await ink(me);
    const tolls0 = (await plot(me, a.id, 0)).view.tolls;
    await db.rpc(you, 'star_warp', { p_id: a.id });
    const toll = Math.floor(card.warp.ink * 0.25);
    expect(toll).toBeGreaterThan(0);
    expect(await ink(me)).toBe(before + toll);
    expect((await plot(me, a.id, 0)).view.tolls).toBe(tolls0 + toll);
    // from b, a is down the highway: a few seconds and a quarter of the fuel
    const hw = (await db.rpc(me, 'star_card', { p_id: a.id })).warp;
    expect(hw).toMatchObject({ highway: true, secs: 3 });
  });

  it('🔦 a Starbeam Lens: claims under its beam on Earth roll a tier higher; first person can see it', async () => {
    const s = findStar(2, (x) => x.cls === 'yellow');
    await go(me, s.id);
    await claim(me, s.id, 2, 'lens');
    const r = (await act(me, s.id, 2, 'focus', { gx: 2_000_000, gy: 1_500_000 })).result;
    expect(r).toMatchObject({ gx: 2_000_000, gy: 1_500_000, radius: 60 });
    await expectError(act(me, s.id, 2, 'focus', { gx: 2_000_000, gy: 1_500_000 }), 'too_soon');
    expect((await db.sql(`select private.sw_in_beam(2000010, 1500020) a, private.sw_in_beam(2000100, 1500000) b`))[0]).toEqual({ a: true, b: false });
    expect(await db.rpc(you, 'star_beams_near', { p_gx: 2_001_000, p_gy: 1_500_000 })).toEqual([expect.objectContaining({ star: s.id, by: 'sk_me' })]);
    expect((await db.sql(`select private.rx_claim_bump($1, 2000010, 1500020) b`, [you]))[0].b).toBe(1);
    expect((await db.sql(`select private.rx_claim_bump($1, 2000500, 1500020) b`, [you]))[0].b).toBe(0);
  });
});

describe('each kind of star’s own rules', () => {
  it('a binary eclipses (witness it for Luck); a red dwarf flares; a pulsar beats; a black hole bends time', async () => {
    const bin = findStar(2, (x) => x.binary && x.cls === 'yellow');
    const card = await db.rpc(me, 'star_card', { p_id: bin.id });
    expect(card.binary).toBe(true);
    expect(card.nature.eclipse).toBeTruthy();
    const red = findStar(2, (x) => x.cls === 'red_dwarf');
    expect((await db.rpc(me, 'star_card', { p_id: red.id })).nature.flare).toMatchObject({ next_at: expect.any(String) });
    // the pulsar game: on the beat scores high
    const ns = findStar(1, (x) => x.cls === 'neutron');
    const per = (await db.rpc(me, 'star_card', { p_id: ns.id })).nature.pulse.period_ms;
    const taps = Array.from({ length: 16 }, (_, i) => 1000 + i * per + (i % 2 ? 6 : -6));
    const r = (await act(me, ns.id, 5, 'pulse', { taps })).result;
    expect(r.score).toBeGreaterThan(0.85);
    expect(r.ink).toBeGreaterThan(15);
    const off = (await act(me, ns.id, 5, 'pulse', { taps: taps.map((t, i) => t + (i % 2 ? per * 0.4 : 0)) })).result;
    expect(off.score).toBeLessThan(0.5);
    // black hole: an enchantment's clock jumps ahead, once a day
    const bh = findStar(3, (x) => x.cls === 'black_hole');
    await go(me, bh.id);
    await claim(me, bh.id, 400);
    const en = (await db.sql(`select id from enchantments where owner_id = $1 limit 1`, [me]))[0].id;
    await expectError(act(me, bh.id, 400, 'dilate', { enchantment: en }).then(() => act(me, bh.id, 400, 'dilate', { enchantment: en })), 'daily_limit');
    expect(Number((await db.sql(`select clock_skip from enchantments where id = $1`, [en]))[0].clock_skip)).toBe(3600);
  });

  it('light a star with your elements: brighter in everyone’s sky, on the feed', async () => {
    const s = findStar(2, (x) => x.cls === 'white');
    await db.sql(`insert into star_elements (player_id, element, amount) values ($1, 'he', 100), ($1, 'c', 100) on conflict (player_id, element) do update set amount = 100`, [me]);
    expect((await act(me, s.id, 70, 'light')).result.lit).toBe(1);
    expect((await act(me, s.id, 70, 'light')).result.lit).toBe(2);
    expect(await els(me)).toMatchObject({ he: 40, c: 70 });
    expect((await db.rpc(null, 'stars_seen', { p_ids: `{${s.id}}` }))[0].lit).toBe(2);
    expect((await db.sql(`select count(*) n from feed_events where kind = 'star' and data->>'sub' = 'lit'`))[0].n).toBe('2');
  });

  it('a supernova (staff set it off): gold and Ink for everyone with a plot on it, once', async () => {
    const s = findStar(2, (x) => x.cls === 'orange');
    await expectError(db.rpc(me, 'admin_star_supernova', { p_star: s.id }), 'forbidden');
    const before = await ink(me);
    const owners = Number((await db.sql(`select count(distinct owner_id) n from star_plots where star_id = $1`, [s.id]))[0].n);
    const mine = Number((await db.sql(`select count(*) n from star_plots where star_id = $1 and owner_id = $2`, [s.id, me]))[0].n);
    const r = await db.rpc(staff, 'admin_star_supernova', { p_star: s.id });
    expect(r.owners).toBe(owners);
    expect(mine).toBeGreaterThan(0);
    expect((await els(me)).au).toBe(mine);
    expect(await ink(me)).toBe(before + 50 * mine);
    expect((await db.rpc(null, 'star_card', { p_id: s.id })).nature.supernova).toMatchObject({ glowing: true });
    await expectError(db.rpc(staff, 'admin_star_supernova', { p_star: s.id }), 'already_happened');
  });

  it('badges for the new types', async () => {
    const m = (await db.sql(`select private.sw_metrics($1) m`, [me]))[0].m;
    expect(m['stars.exoplanets']).toBeGreaterThan(0);
    expect(m['stars.lit']).toBe(2);
    expect(m['stars.iron']).toBeGreaterThan(0);
    const got = (await db.sql(`select achievement_key k from player_achievements where player_id = $1`, [me])).map((x: any) => x.k);
    expect(got).toEqual(expect.arrayContaining(['sw_exo', 'sw_light', 'sw_iron']));
  });

  it('the CDN snapshots: the claimed real stars and the star chart are exactly what the calls give, for anyone', async () => {
    const real = await db.rpc(null, 'world_snapshot', { p_key: 'stars_real' });
    expect(real.snapshot).toBe('stars_real');
    expect(real.items).toEqual(await db.rpc(me, 'stars_seen_real'));
    const chart = await db.rpc(null, 'world_snapshot', { p_key: 'stars_chart' });
    const { snapshot, built_at, ...rest } = chart;
    expect(snapshot).toBe('stars_chart'); expect(built_at).toBeTruthy();
    expect(rest).toEqual(await db.rpc(you, 'stars_chart'));
    expect(rest.totals.systems).toBeGreaterThan(0);
  });

  it('every Skywright helper that reads a table keeps its plan (PL/pgSQL), and so does the rent rate', async () => {
    const sqlish = await db.sql(`select p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace join pg_language l on l.oid = p.prolang
      where s.nspname in ('public', 'private') and l.lanname = 'sql' and p.provolatile <> 'i' and p.prosrc ~* '\\mfrom\\M' and not p.proretset
        and (p.proname ~ '^(sw_|star_|stars_)' or (s.nspname = 'private' and p.proname = 'rent_rate'))`);
    expect(sqlish.map((r: any) => r.proname)).toEqual([]);
  });

  it('admin: each type’s numbers can be changed (one type at a time, the others kept)', async () => {
    await db.rpc(staff, 'admin_set_star_settings', { p_value: { kinds: { forge: { h_per_hour: 9 } } } });
    const cfg = (await db.sql(`select value from game_config where key = 'stars'`))[0].value;
    expect(cfg.kinds.forge).toMatchObject({ h_per_hour: 9, cap_hours: 24 });
    expect(cfg.kinds.grove).toMatchObject({ grow_hours: 6 });
    await expectError(db.rpc(staff, 'admin_set_star_settings', { p_value: { kinds: { forge: { h_per_hour: -1 } } } }), 'invalid_value');
  });
});
