// v0.39 Notifications for what people do with you (friends, sanctuary visits, playdates, warps, bases,
// new planet neighbours) and a 3-a-day egg cap that counts eggs you get as a host too.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let amy: string, ben: string, cal: string, dot: string, eve: string;
const g = (c: string) => ({ body: 'round', color: c, belly: '#FFFFFF', accent: '#8B5CFF', pattern: 'spots', eyes: 'big', ears: 'cat', horns: 'none', tail: 'fluffy', wings: 'none', legs: 2, eyecount: 2, gait: 'walk', cheeks: true, size: 1, mood: 'playful' });
const make = async (uid: string, key: string, name: string, c: string) => (await db.rpc(uid, 'inkborn_create', { p_client_key: key, p_name: name, p_source: 'random', p_genome: g(c), p_drawing: null })).id;
const alerts = async (uid: string) => (await db.rpc(uid, 'my_alerts', { p_limit: 50 })).items as any[];
const kinds = async (uid: string) => (await alerts(uid)).map((a) => a.kind);
const putOn = (uid: string, world: string) =>
  db.sql(`insert into space_pilots (player_id, parts, location) values ($1, '{nose,fins,tank,engine}', $2)
          on conflict (player_id) do update set location = $2, dest = null, arrive_at = null`, [uid, world]);
const playdate = async (guest: string, mine: string, theirs: string) => {
  const s = await db.rpc(guest, 'inkborn_playdate_start', { p_mine: mine, p_theirs: theirs });
  await db.sql(`update inkborn_playdates set started_at = now() - interval '60 seconds' where id = $1`, [s.session]);
  return db.rpc(guest, 'inkborn_playdate_finish', { p_session: s.session, p_score: 120 });
};

beforeAll(async () => {
  await db.init({ ungated: true });
  amy = await db.newPlayer('amy_alert'); ben = await db.newPlayer('ben_alert'); cal = await db.newPlayer('cal_alert');
  dot = await db.newPlayer('dot_alert'); eve = await db.newPlayer('eve_alert');
  for (const p of [amy, ben, cal, dot, eve]) await db.giveInk(p, 3000);
});
afterAll(() => db.close());

describe('Notifications', () => {
  it('friend requests and accepts', async () => {
    await db.rpc(amy, 'friend_request', { p_player_id: ben });
    expect(await kinds(ben)).toContain('friend_request');
    await db.rpc(ben, 'friend_respond', { p_player_id: amy, p_accept: true });
    const a = await alerts(amy);
    expect(a[0]).toMatchObject({ kind: 'friend_accept', actor: { username: 'ben_alert' } });
  });

  it('sanctuary visits, once an hour per visitor, never your own', async () => {
    const h = (await db.sql(`select id from habitats where owner_id = $1 and kind = 'starter'`, [ben]))[0]?.id
      ?? (await db.sql(`insert into habitats (owner_id, kind) values ($1, 'starter') returning id`, [ben]))[0].id;
    expect((await db.rpc(amy, 'sanctuary_visit_ping', { p_habitat: h })).ok).toBe(true);
    await db.rpc(amy, 'sanctuary_visit_ping', { p_habitat: h });
    expect((await kinds(ben)).filter((k) => k === 'sanctuary_visit')).toHaveLength(1);
    expect((await db.rpc(ben, 'sanctuary_visit_ping', { p_habitat: h })).ok).toBe(false);
  });

  it('playdates with your Inkborn, and warps to you', async () => {
    const a = await make(amy, 'amy-pet-0001', 'Pip', '#FF0000');
    const b = await make(ben, 'ben-pet-0001', 'Zap', '#0000FF');
    await playdate(amy, a, b);
    const p = (await alerts(ben)).find((x) => x.kind === 'playdate');
    expect(p).toMatchObject({ actor: { username: 'amy_alert' }, data: { mine: 'Zap', theirs: 'Pip', egg: true } });
    await putOn(ben, 'moon'); await putOn(amy, 'earth');
    await db.rpc(amy, 'space_warp_to_player', { p_player: ben });
    expect((await alerts(ben)).find((x) => x.kind === 'warp')).toMatchObject({ data: { world: 'moon' } });
  });

  it('a new neighbour next to your planet plot, and visits to your base', async () => {
    await putOn(cal, 'moon'); await putOn(dot, 'moon');
    await db.sql(`insert into planet_plots (world, gx, gy, owner_id) values ('moon', 500, 300, $1)`, [cal]);
    await db.sql(`insert into planet_plots (world, gx, gy, owner_id) values ('moon', 501, 301, $1)`, [dot]);
    await db.sql(`insert into planet_plots (world, gx, gy, owner_id) values ('moon', 510, 300, $1)`, [eve]); // not next door
    const n = await alerts(cal);
    expect(n.filter((x) => x.kind === 'neighbor')).toHaveLength(1);
    expect(n[0]).toMatchObject({ kind: 'neighbor', actor: { username: 'dot_alert' }, data: { world: 'moon', gx: 501, gy: 301 } });
    await db.sql(`insert into planet_bases (world, gx, gy, owner_id, layout) values ('moon', 500, 300, $1, '[{"id":"a","k":"dome","x":4,"y":4,"r":0,"c":"#fff"}]')`, [cal]);
    expect((await db.rpc(dot, 'planet_base_visit_ping', { p_world: 'moon', p_gx: 500, p_gy: 300 })).ok).toBe(true);
    expect(await kinds(cal)).toContain('base_visit');
  });
});

describe('Egg cap', () => {
  it('3 eggs a day each, counting the ones you get as a host', async () => {
    const guests = [amy, ben, cal, dot];
    const hostPets: string[] = [], guestPets: string[] = [];
    for (let i = 0; i < 4; i++) {
      hostPets.push(await make(eve, `eve-pet-000${i}`, `E${i}`, '#00FF00'));
      guestPets.push(await make(guests[i], `cap-pet-000${i}`, `G${i}`, '#FFAA00'));
    }
    // four different keepers each play with one of Eve's: Eve only gets the first 3 eggs
    const res = [] as any[];
    for (let i = 0; i < 4; i++) res.push(await playdate(guests[i], guestPets[i], hostPets[i]));
    const amyEggsBefore = Number((await db.sql(`select count(*) n from inkborn_eggs where owner_id = $1`, [amy]))[0].n);
    expect(res.map((r) => !!r.their_egg)).toEqual([true, true, true, false]);
    expect(Number((await db.sql(`select count(*) n from inkborn_eggs where owner_id = $1`, [eve]))[0].n)).toBe(3);
    // and once full, Eve's own playdates give her nothing either
    const e = await playdate(eve, hostPets[0], guestPets[0]);
    expect(e).toMatchObject({ egg: null, no_egg_because: 'daily', eggs_left: 0 });
    expect(Number((await db.sql(`select count(*) n from inkborn_eggs where owner_id = $1`, [amy]))[0].n)).toBe(amyEggsBefore);
  });
});
