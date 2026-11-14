// Fix: sacrificing an unhatched egg at the Altar of Luck used to free that day's egg slot again (the 3-a-day cap
// counted the eggs still in the nest), so playdate -> egg -> sacrifice looped forever for unlimited Luck. A sacrificed
// egg now still counts toward the day's 3.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let amy: string, ben: string;
const g = (c: string) => ({ body: 'round', color: c, belly: '#FFFFFF', accent: '#8B5CFF', pattern: 'spots', eyes: 'big', ears: 'cat', horns: 'none', tail: 'fluffy', wings: 'none', legs: 2, eyecount: 2, gait: 'walk', cheeks: true, size: 1, mood: 'playful' });
const make = async (uid: string, key: string, name: string, c: string) => (await db.rpc(uid, 'inkborn_create', { p_client_key: key, p_name: name, p_source: 'random', p_genome: g(c), p_drawing: null })).id;
const playdate = async (guest: string, mine: string, theirs: string) => {
  const s = await db.rpc(guest, 'inkborn_playdate_start', { p_mine: mine, p_theirs: theirs });
  await db.sql(`update inkborn_playdates set started_at = now() - interval '60 seconds' where id = $1`, [s.session]);
  return db.rpc(guest, 'inkborn_playdate_finish', { p_session: s.session, p_score: 120 });
};
const nest = async (uid: string) => Number((await db.sql(`select count(*) n from inkborn_eggs where owner_id = $1`, [uid]))[0].n);
const luck = async (uid: string) => Number((await db.sql(`select coalesce((select luck from player_luck where player_id = $1), 0) l`, [uid]))[0].l);

beforeAll(async () => {
  await db.init({ ungated: true });
  amy = await db.newPlayer('amy_eggloop'); ben = await db.newPlayer('ben_eggloop');
  for (const p of [amy, ben]) await db.giveInk(p, 3000);
});
afterAll(() => db.close());

describe('sacrificing eggs at the altar', () => {
  it("doesn't give the day's egg back: 3 eggs a day, sacrificed or not", async () => {
    const mine = await make(amy, 'amy-loop-0001', 'Pip', '#FF0000');
    const theirs: string[] = [];
    for (let i = 0; i < 5; i++) theirs.push(await make(ben, `ben-loop-000${i}`, `B${i}`, '#0000FF'));
    // the loop: an egg from each playdate, straight onto the altar
    for (let i = 0; i < 3; i++) {
      const r = await playdate(amy, mine, theirs[i]);
      expect(r.egg).not.toBeNull();
      await db.rpc(amy, 'luck_sacrifice_egg', { p_id: r.egg.id });
      expect(await nest(amy)).toBe(0);
    }
    const gained = await luck(amy);
    expect(gained).toBeGreaterThan(0);
    // the nest is empty but the day's 3 are used up: no 4th or 5th egg, and no more Luck from eggs today
    const s = await db.rpc(amy, 'inkborn_playdate_start', { p_mine: mine, p_theirs: theirs[3] });
    expect(s.eggs_left).toBe(0);
    await db.sql(`update inkborn_playdates set started_at = now() - interval '60 seconds' where id = $1`, [s.session]);
    expect(await db.rpc(amy, 'inkborn_playdate_finish', { p_session: s.session, p_score: 120 })).toMatchObject({ egg: null, no_egg_because: 'daily', eggs_left: 0 });
    expect(await playdate(amy, mine, theirs[4])).toMatchObject({ egg: null, no_egg_because: 'daily' });
    expect(await nest(amy)).toBe(0);
    expect(await luck(amy)).toBe(gained);
  });

  it('the same goes for eggs you get as the host', async () => {
    // Ben hosted all five: his first 3 count, and sacrificing them doesn't make room for more
    expect(await nest(ben)).toBe(3);
    for (const e of await db.sql(`select id from inkborn_eggs where owner_id = $1`, [ben])) await db.rpc(ben, 'luck_sacrifice_egg', { p_id: e.id });
    expect(await nest(ben)).toBe(0);
    const cal = await db.newPlayer('cal_eggloop'); await db.giveInk(cal, 3000);
    const c1 = await make(cal, 'cal-loop-0001', 'Cee', '#00FF00');
    const r = await playdate(cal, c1, (await db.sql(`select id from inkborn where owner_id = $1 order by created_at limit 1`, [ben]))[0].id);
    expect(r.egg).not.toBeNull(); // Cal still gets hers
    expect(r.their_egg ?? null).toBeNull(); // Ben is full for today
    expect(await nest(ben)).toBe(0);
  });

  it('the cap still opens again the next day', async () => {
    await db.sql(`update private.egg_lays set laid_at = laid_at - interval '1 day' where owner_id = $1`, [amy]);
    const mine = (await db.sql(`select id from inkborn where owner_id = $1 limit 1`, [amy]))[0].id;
    const fresh = await make(ben, 'ben-loop-0009', 'B9', '#0000FF');
    expect((await playdate(amy, mine, fresh)).egg).not.toBeNull();
  });
});
