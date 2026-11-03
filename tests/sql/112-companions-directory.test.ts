// v0.32 Companions (one starred Inkborn that roams with you) and the sanctuary directory.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ada: string, bix: string, cal: string;
let adaPet: string, bixPet: string;
const g = { body: 'round', color: '#FF5C8A', belly: '#FFE0EA', eyes: 'big', ears: 'cat', tail: 'fluffy', mood: 'playful' };
const make = async (uid: string, key: string, name: string) => (await db.rpc(uid, 'inkborn_create', { p_client_key: key, p_name: name, p_source: 'random', p_genome: g, p_drawing: null })).id;

beforeAll(async () => {
  await db.init({ ungated: true });
  ada = await db.newPlayer('ada_keeper'); bix = await db.newPlayer('bix_keeper'); cal = await db.newPlayer('cal_empty');
  adaPet = await make(ada, 'ada-pet-000001', 'Pip');
  bixPet = await make(bix, 'bix-pet-000001', 'Zap');
  await db.rpc(cal, 'my_sanctuaries');
});
afterAll(() => db.close());

describe('Companions', () => {
  it('star one of yours; it shows up for your live group', async () => {
    await expectError(db.rpc(ada, 'inkborn_set_companion', { p_id: bixPet }), 'not_owner');
    const r = await db.rpc(ada, 'inkborn_set_companion', { p_id: adaPet });
    expect(r.companion).toMatchObject({ id: adaPet, name: 'Pip' });
    expect((await db.rpc(ada, 'my_sanctuaries')).companion_id).toBe(adaPet);
    for (const u of [ada, bix]) {
      await db.sql(`insert into space_pilots (player_id, parts, location) values ($1, '{nose,fins,tank,engine}', 'moon') on conflict (player_id) do update set location = 'moon', dest = null`, [u]);
      await db.rpc(u, 'planet_live', { p_world: 'moon' });
    }
    const seen = await db.rpc(bix, 'planet_live', { p_world: 'moon' });
    expect(seen.members[0].companion).toMatchObject({ name: 'Pip' });
    await db.rpc(ada, 'inkborn_set_companion', { p_id: null });
    expect((await db.rpc(ada, 'my_sanctuaries')).companion_id).toBeNull();
  });
});

describe('Sanctuary directory', () => {
  it('lists other people’s sanctuaries that have creatures, and searches by name', async () => {
    const all = await db.rpc(ada, 'sanctuary_directory', {});
    expect(all.items.map((x: any) => x.owner.username)).toEqual(['bix_keeper']); // not yours, not empty ones
    expect(all.items[0]).toMatchObject({ creatures: 1, preview: [{ name: 'Zap' }], friend: false });
    expect((await db.rpc(ada, 'sanctuary_directory', { p_query: 'BIX' })).items).toHaveLength(1);
    expect((await db.rpc(ada, 'sanctuary_directory', { p_query: 'nobody' })).items).toHaveLength(0);
    expect((await db.rpc(ada, 'sanctuary_directory', { p_sort: 'friends' })).items).toHaveLength(0);
    await db.sql(`insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [ada, bix]);
    const fr = await db.rpc(ada, 'sanctuary_directory', { p_sort: 'friends' });
    expect(fr.items[0]).toMatchObject({ friend: true });
  });
});
