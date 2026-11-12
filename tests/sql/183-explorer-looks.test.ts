// Explorer studio looks: male/female hair and builds, faces, more skin tones and hair colours — free, and wearable.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let max: string;
beforeAll(async () => { await db.init({ ungated: true }); max = await db.newPlayer('max_looks'); });
afterAll(() => db.close());

describe('explorer looks', () => {
  it('new pieces are free and tagged by sex', async () => {
    const items = (await db.sql(`select value -> 'items' i from game_config where key = 'shop'`))[0].i as any[];
    const by = (k: string) => items.find((i) => i.key === k);
    expect(by('explorer.hair.quiff').sex).toBe('m'); expect(by('explorer.hair.ponytail').sex).toBe('f'); expect(by('explorer.hair.curly').sex).toBeUndefined();
    expect(by('explorer.face.beard').sex).toBe('m'); expect(by('explorer.skin.ebony').cost).toEqual({});
    expect(items.filter((i) => i.part === 'skin').length).toBeGreaterThanOrEqual(13);
  });
  it('a full male look with a face saves', async () => {
    const p = await db.rpc(max, 'equip_explorer', { p_style: { sex: 'm', hair: 'mohawk', body: 'slim', face: 'goatee', skin: 'olive', hairc: 'teal' } });
    expect(p.explorer_style).toMatchObject({ sex: 'm', hair: 'mohawk', body: 'slim', face: 'goatee', skin: 'olive', hairc: 'teal' });
    await expect(db.rpc(max, 'equip_explorer', { p_style: { face: 'monocle' } })).rejects.toThrow(/unknown_item/);
  });
});
