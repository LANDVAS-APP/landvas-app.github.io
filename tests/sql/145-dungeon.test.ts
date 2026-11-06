// v0.6.7 The dungeon: runs, floors (only seen rooms are shown), moving room to room, turn-based fights, banking what
// you found (half if the party falls), descending, heroes (hire, train, party).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let uid: string, other: string, realm: string;
const wallet = async () => (await db.sql(`select wallet from realm_players where player_id = $1 and kind = 'dungeon'`, [uid]))[0]?.wallet ?? {};
const setRun = (run: object) => db.sql(`update realm_dungeons set run = $2::jsonb where realm_id = $1`, [realm, JSON.stringify(run)]);
const rawRun = async () => (await db.sql(`select run from realm_dungeons where realm_id = $1`, [realm]))[0].run;

beforeAll(async () => {
  await db.init({ ungated: true });
  uid = await db.newPlayer('hero_one'); other = await db.newPlayer('hero_two');
  realm = (await db.sql(`insert into realms (owner_id, kind) values ($1, 'dungeon') returning id`, [uid]))[0].id;
});
afterAll(() => db.close());

describe('Dungeon', () => {
  it('a floor is a connected maze with stairs; only rooms next to where you’ve been are shown', async () => {
    for (let i = 0; i < 5; i++) {
      const f = (await db.sql(`select private.rdun_floor($1) f`, [i === 4 ? 5 : 1]))[0].f;
      const keys = Object.keys(f.rooms);
      expect(keys.length).toBeGreaterThanOrEqual(9);
      const ts = keys.map((k) => f.rooms[k].t);
      expect(ts.filter((t: string) => t === (i === 4 ? 'boss' : 'stairs')).length).toBe(1);
      // connected: a flood fill from the start reaches every room
      const seen = new Set([f.pos]); const q = [f.pos];
      while (q.length) { const [x, y] = q.shift().split(',').map(Number); for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) { const k = `${x + dx},${y + dy}`; if (f.rooms[k] && !seen.has(k)) { seen.add(k); q.push(k); } } }
      expect(seen.size).toBe(keys.length);
    }
    const s = await db.rpc(uid, 'dungeon_start', { p_id: realm });
    const run = s.dungeon.run;
    expect(run.floor).toBe(1);
    expect(run.party[0].h).toBe('knight');
    const hidden = Object.values(run.rooms as Record<string, { seen: boolean; t: string }>).filter((x) => !x.seen);
    expect(hidden.every((x) => x.t === '?')).toBe(true);
    await expectError(db.rpc(uid, 'dungeon_start', { p_id: realm }), 'dungeon_in_run');
    await expectError(db.rpc(other, 'dungeon_move', { p_id: realm, p_to: '2,3' }), 'not_owner');
  });

  it('moving: next door only; a chest fills the bag; a monster starts a fight; fights go round by round', async () => {
    const base = await rawRun();
    await setRun({ ...base, pos: '2,4', fight: null, bag: {}, rooms: { '2,4': { t: 'start', done: true, seen: true }, '2,3': { t: 'chest', done: false, seen: true }, '2,2': { t: 'monster', done: false, seen: false }, '1,2': { t: 'stairs', done: false, seen: false } } });
    await expectError(db.rpc(uid, 'dungeon_move', { p_id: realm, p_to: '2,2' }), 'invalid_input');
    const m1 = await db.rpc(uid, 'dungeon_move', { p_id: realm, p_to: '2,3' });
    expect(m1.event.chest.loot).toBeGreaterThan(0);
    expect(m1.dungeon.run.rooms['2,2'].seen).toBe(true);
    const m2 = await db.rpc(uid, 'dungeon_move', { p_id: realm, p_to: '2,2' });
    expect(m2.event.fight).toBe(true);
    await expectError(db.rpc(uid, 'dungeon_move', { p_id: realm, p_to: '2,3' }), 'dungeon_in_fight');
    await expectError(db.rpc(uid, 'dungeon_leave', { p_id: realm }), 'dungeon_in_fight');
    // a skill, then it's cooling down
    const a = await db.rpc(uid, 'dungeon_act', { p_id: realm, p_act: 'skill', p_hero: 0, p_target: 0 });
    expect(a.log.some((l: { k: string }) => l.k === 'skill')).toBe(true);
    if (!a.won) await expectError(db.rpc(uid, 'dungeon_act', { p_id: realm, p_act: 'skill', p_hero: 0 }), 'dungeon_cooldown');
    // fight on until it's won
    let r = a; for (let i = 0; i < 30 && !r.won && !r.lost; i++) r = await db.rpc(uid, 'dungeon_act', { p_id: realm, p_act: 'attack', p_hero: 0, p_target: 0 });
    expect(r.won).toBe(true);
    expect(r.drop.loot).toBeGreaterThan(0);
    expect(r.dungeon.run.fight).toBeNull();
    expect(r.dungeon.run.rooms['2,2'].done).toBe(true);
  });

  it('descending, banking, and a fallen party keeps half', async () => {
    await expectError(db.rpc(uid, 'dungeon_descend', { p_id: realm }), 'invalid_input');
    await db.rpc(uid, 'dungeon_move', { p_id: realm, p_to: '1,2' });
    const d = await db.rpc(uid, 'dungeon_descend', { p_id: realm });
    expect(d.dungeon.run.floor).toBe(2);
    expect(d.new_best).toBe(true);
    const bag = (await rawRun()).bag;
    const l = await db.rpc(uid, 'dungeon_leave', { p_id: realm });
    expect(l.summary.bag.loot).toBe(Math.floor(bag.loot));
    expect((await wallet()).loot).toBe(Math.floor(bag.loot));
    expect(l.dungeon.run).toBeNull();
    // a hopeless fight
    await db.rpc(uid, 'dungeon_start', { p_id: realm });
    const base = await rawRun();
    await setRun({ ...base, bag: { loot: 100 }, party: [{ ...base.party[0], hp: 1 }], fight: { enemies: [{ n: 'Ogre', e: '👹', hp: 999, max: 999, atk: 99, stun: 0 }], boss: false, round: 0 } });
    const w0 = (await wallet()).loot;
    let r = await db.rpc(uid, 'dungeon_act', { p_id: realm, p_act: 'attack' });
    for (let i = 0; i < 5 && !r.lost; i++) r = await db.rpc(uid, 'dungeon_act', { p_id: realm, p_act: 'attack' });
    expect(r.lost).toBe(true);
    expect((await wallet()).loot - w0).toBe(50);
  });

  it('heroes: hire (level and loot), train (loot and materials), choose the party; checkpoints after bosses', async () => {
    await expectError(db.rpc(uid, 'dungeon_hero', { p_id: realm, p_act: 'hire', p_hero: 'archer' }), 'level_too_low');
    await db.sql(`update realms set xp = 3000 where id = $1`, [realm]);
    await db.sql(`update realm_players set wallet = '{"loot": 1000, "bone": 50}' where player_id = $1 and kind = 'dungeon'`, [uid]);
    const h = await db.rpc(uid, 'dungeon_hero', { p_id: realm, p_act: 'hire', p_hero: 'archer' });
    expect(h.dungeon.party).toEqual(['knight', 'archer']);
    const t = await db.rpc(uid, 'dungeon_hero', { p_id: realm, p_act: 'train', p_hero: 'knight' });
    expect(t.dungeon.heroes.knight.lv).toBe(2);
    expect(await wallet()).toMatchObject({ loot: 1000 - 300 - 40, bone: 46 });
    await expectError(db.rpc(uid, 'dungeon_hero', { p_id: realm, p_act: 'party', p_party: ['knight', 'knight'] }), 'invalid_input');
    const p = await db.rpc(uid, 'dungeon_hero', { p_id: realm, p_act: 'party', p_party: ['archer'] });
    expect(p.dungeon.party).toEqual(['archer']);
    await expectError(db.rpc(uid, 'dungeon_start', { p_id: realm, p_floor: 6 }), 'invalid_input');
    await db.sql(`update realm_dungeons set bosses = 1 where realm_id = $1`, [realm]);
    const s = await db.rpc(uid, 'dungeon_start', { p_id: realm, p_floor: 6 });
    expect(s.dungeon.run.floor).toBe(6);
    expect(s.dungeon.run.party[0].h).toBe('archer');
  });
});
