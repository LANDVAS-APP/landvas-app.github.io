// Places (wave 1, step 1): one live room + chat for every new place, and Art's Studio and Gallery.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ana: string, ben: string, cal: string, studio: string, gallery: string;
const pubs: string[] = [];
const renown = async (u: string) => Number((await db.sql(`select coalesce((select renown from player_renown where player_id = $1), 0) r`, [u]))[0].r);

async function group(owner: string, kind: string, n: number) {
  const [g] = await db.sql(`insert into canvas_groups (owner_id, name, kind, plot_count) values ($1, 'Test canvas', $2, $3) returning id`, [owner, kind, n]);
  return g.id as string;
}
async function publish(owner: string, groupId: string, title: string, status = 'published') {
  const [p] = await db.sql(`insert into artwork_projects (owner_id, group_id, title) values ($1, $2, $3) returning id`, [owner, groupId, title]);
  const [v] = await db.sql(`insert into artwork_versions (project_id, owner_id, version_no, kind, manifest, cells, layer_count, tile_count)
                            values ($1, $2, 1, 'initial', '{}', '[]', 1, 1) returning id`, [p.id, owner]);
  const [a] = await db.sql(`insert into artwork_publications (owner_id, project_id, version_id, group_id, title, cells, plot_count, min_gx, min_gy, max_gx, max_gy,
                              center_lng, center_lat, status, rights_affirmed_at, terms_version, preview_path, thumb_path, preview_width, preview_height, published_at)
                            values ($1, $2, $3, $4, $5, '[]', 1, 0, 0, 0, 0, 0, 0, $6, now(), 'test', 'previews/' || gen_random_uuid() || '.png', 'thumbs/x.png', 320, 240, now()) returning id`,
    [owner, p.id, v.id, groupId, title, status]);
  return a.id as string;
}

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 10 });
  ana = await db.newPlayer('ana_artist'); ben = await db.newPlayer('ben_visitor'); cal = await db.newPlayer('cal_newbie');
  studio = await group(ana, 'canvas', 1);
  gallery = await group(ana, 'atelier', 4);
  for (let i = 0; i < 6; i++) pubs.push(await publish(ana, gallery, `Piece ${i + 1}`, i === 0 ? 'published' : 'superseded'));
  // Ben is an established player with land; Cal joined today and owns nothing
  await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [ben]);
  await db.sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values (900001, 900001, 'graphite', 'common', $1, now())`, [ben]);
});
afterAll(() => db.close());

describe('live rooms in places', () => {
  it('puts players in the same room, lists the others, and keeps out made-up places', async () => {
    const a = await db.rpc(ana, 'place_live', { p_place: `gallery:${gallery}`, p_x: 1, p_z: 2, p_act: null });
    expect(a).toMatchObject({ shard: 0, joined: true, room_size: 10, channel: `place:gallery:${gallery}:0`, members: [] });
    const b = await db.rpc(ben, 'place_live', { p_place: `gallery:${gallery}`, p_x: -1, p_z: 3, p_act: 'admire' });
    expect(b.members.map((m: any) => m.username)).toEqual(['ana_artist']);
    expect(b.members[0]).toMatchObject({ x: 1, z: 2 });
    await expectError(db.rpc(ben, 'place_live', { p_place: `gallery:${studio}` }), 'not_found'); // a plain canvas has no gallery
    await expectError(db.rpc(ben, 'place_live', { p_place: `vault:${gallery}` }), 'not_found');
    await expectError(db.rpc(ben, 'place_live', { p_place: `gallery:not-a-uuid` }), 'not_found');
    expect(await db.rpc(ben, 'place_live', { p_place: `studio:${studio}` })).toMatchObject({ joined: true });
  });

  it('room chat reaches everyone in the room and nobody outside it', async () => {
    await db.rpc(ana, 'place_live', { p_place: `gallery:${gallery}` });
    await db.rpc(ben, 'place_live', { p_place: `gallery:${gallery}` });
    const m = await db.rpc(ben, 'place_chat_send', { p_place: `gallery:${gallery}`, p_body: 'Love the light in here' });
    expect(m).toMatchObject({ body: 'Love the light in here', kind: 'chat' });
    const list = await db.rpc(ana, 'place_chat_list', { p_place: `gallery:${gallery}`, p_after: 0 });
    expect(list.topic).toBe(`pc:gallery:${gallery}:0`);
    expect(list.items.map((i: any) => i.body)).toContain('Love the light in here');
    await expectError(db.rpc(cal, 'place_chat_send', { p_place: `gallery:${gallery}`, p_body: 'hi' }), 'not_in_place');
    expect((await db.rpc(cal, 'place_chat_list', { p_place: `gallery:${gallery}` })).items).toEqual([]);
    await db.rpc(ben, 'place_leave');
    await expectError(db.rpc(ben, 'place_chat_send', { p_place: `gallery:${gallery}`, p_body: 'still here?' }), 'not_in_place');
  });
});

describe('the Studio and the Gallery', () => {
  it('a plain canvas is a Studio; an Art Estate is a Gallery with 3 rooms and a starting Renown charter', async () => {
    const s = await db.rpc(ana, 'art_place', { p_group: studio });
    expect(s).toMatchObject({ tier: 'studio', kind: 'canvas', mine: true });
    expect(s.hall).toBeUndefined();
    const g = await db.rpc(ana, 'art_place', { p_group: gallery });
    expect(g).toMatchObject({ tier: 'gallery', kind: 'atelier', mine: true, hall: { rooms: 3, hangs: [], show: null } });
    expect(g.works).toHaveLength(6); // published and earlier (superseded) versions are all hers to hang
    expect(g.mural.id).toBe(pubs[0]);
    expect(await renown(ana)).toBe(100);
    await db.rpc(ana, 'art_place', { p_group: gallery });
    expect(await renown(ana)).toBe(100); // the charter is once
    const v = await db.rpc(ben, 'art_place', { p_group: gallery });
    expect(v.mine).toBe(false);
    expect(v.works).toBeUndefined();
  });

  it('the old Atelier currency (acclaim) moves over to Renown', async () => {
    await db.sql(`insert into realm_players (player_id, kind, wallet) values ($1, 'atelier', '{"acclaim": 42.5, "paint": 9}')
                  on conflict (player_id, kind) do update set wallet = excluded.wallet`, [ana]);
    await db.rpc(ana, 'art_place', { p_group: gallery });
    expect(await renown(ana)).toBe(142);
    const w = (await db.sql(`select wallet from realm_players where player_id = $1 and kind = 'atelier'`, [ana]))[0].wallet;
    expect(Number(w.acclaim)).toBeCloseTo(0.5); expect(Number(w.paint)).toBe(9);
  });

  it('only the owner hangs, only their own art, only in rooms that exist, and only with frames they have', async () => {
    await expectError(db.rpc(ben, 'gallery_hang', { p_group: gallery, p_slot: 'r1l1', p_publication: pubs[0], p_frame: 'oak', p_light: 'warm', p_power: 60, p_aim: 0 }), 'not_owner');
    await expectError(db.rpc(ana, 'gallery_hang', { p_group: gallery, p_slot: 'r4l1', p_publication: pubs[0], p_frame: 'oak', p_light: 'warm', p_power: 60, p_aim: 0 }), 'bad_slot');
    await expectError(db.rpc(ana, 'gallery_hang', { p_group: gallery, p_slot: 'r1x1', p_publication: pubs[0], p_frame: 'oak', p_light: 'warm', p_power: 60, p_aim: 0 }), 'bad_slot');
    await expectError(db.rpc(ana, 'gallery_hang', { p_group: gallery, p_slot: 'r1l1', p_publication: pubs[0], p_frame: 'gilt', p_light: 'warm', p_power: 60, p_aim: 0 }), 'locked_frame');
    const bens = await publish(ben, await group(ben, 'canvas', 1), 'Ben’s');
    await expectError(db.rpc(ana, 'gallery_hang', { p_group: gallery, p_slot: 'r1l1', p_publication: bens, p_frame: 'oak', p_light: 'warm', p_power: 60, p_aim: 0 }), 'not_your_art');
    const g = await db.rpc(ana, 'gallery_hang', { p_group: gallery, p_slot: 'r1l1', p_publication: pubs[0], p_frame: 'oak', p_light: 'warm', p_power: 60, p_aim: 5,
      p_title: '  Dawn over the canal  ', p_story: 'Painted on the first warm morning of the year.' });
    expect(g.hall.hangs).toHaveLength(1);
    expect(g.hall.hangs[0]).toMatchObject({ slot: 'r1l1', frame: 'oak', power: 60, aim: 5, plaque_title: 'Dawn over the canal' });
    // moving a piece frees its old spot (a piece hangs once per gallery)
    const m = await db.rpc(ana, 'gallery_hang', { p_group: gallery, p_slot: 'r2r1', p_publication: pubs[0], p_frame: 'oak', p_light: 'warm', p_power: 60, p_aim: 0 });
    expect(m.hall.hangs.map((h: any) => h.slot)).toEqual(['r2r1']);
  });

  it('the Renown shop unlocks frames for good, and rooms up to the maximum', async () => {
    await expectError(db.rpc(ana, 'gallery_buy', { p_group: gallery, p_item: 'frames:baroque' }), 'not_enough_renown');
    const g = await db.rpc(ana, 'gallery_buy', { p_group: gallery, p_item: 'frames:gilt' });
    expect(g.me.unlocks).toContain('frames:gilt');
    expect(await renown(ana)).toBe(82);
    await expectError(db.rpc(ana, 'gallery_buy', { p_group: gallery, p_item: 'frames:gilt' }), 'already_yours');
    await expectError(db.rpc(ana, 'gallery_buy', { p_group: gallery, p_item: 'frames:diamond' }), 'not_found');
    await expectError(db.rpc(ana, 'gallery_buy', { p_group: gallery, p_item: 'rooms:4' }), 'not_found');
    await expectError(db.rpc(ana, 'gallery_add_room', { p_group: gallery }), 'not_enough_renown');
    await db.sql(`select private.renown_add($1, 1000, 'test')`, [ana]);
    expect((await db.rpc(ana, 'gallery_add_room', { p_group: gallery })).hall.rooms).toBe(4);
    expect((await db.rpc(ana, 'gallery_add_room', { p_group: gallery })).hall.rooms).toBe(5);
    await expectError(db.rpc(ana, 'gallery_add_room', { p_group: gallery }), 'max_rooms');
    expect(await renown(ana)).toBe(82 + 1000 - 300 - 600);
    await expectError(db.rpc(ana, 'gallery_wall', { p_group: gallery, p_room: 2, p_wall: 'sage' }), 'locked_wall');
    await db.rpc(ana, 'gallery_buy', { p_group: gallery, p_item: 'walls:sage' });
    expect((await db.rpc(ana, 'gallery_wall', { p_group: gallery, p_room: 2, p_wall: 'sage' })).hall.room_walls).toEqual({ 2: 'sage' });
  });

  it('a show needs 3 pieces, scores the walls out of 100, and says what would make it better', async () => {
    await expectError(db.rpc(ana, 'gallery_open_show', { p_group: gallery, p_title: 'First light' }), 'show_too_small');
    await db.rpc(ana, 'gallery_hang', { p_group: gallery, p_slot: 'r2r2', p_publication: pubs[1], p_frame: 'gilt', p_light: 'warm', p_power: 70, p_aim: 0, p_title: 'Two', p_story: 'A story' });
    await db.rpc(ana, 'gallery_hang', { p_group: gallery, p_slot: 'r1l1', p_publication: pubs[2], p_frame: 'oak', p_light: 'warm', p_power: 20, p_aim: 0 });
    const g = await db.rpc(ana, 'gallery_open_show', { p_group: gallery, p_title: 'First light' });
    expect(g.hall.show).toMatchObject({ no: 1, title: 'First light', admires: 0 });
    const s = g.hall.score;
    expect(s.pieces).toBe(3);
    expect(s.total).toBe(s.fill + s.plaques + s.light + s.flow + s.frames);
    expect(s.light).toBe(13); // 2 of 3 lit in the gallery range (45-85)
    expect(s.frames).toBe(8);  // two kinds of frame
    expect(s.plaques).toBe(5); // 1 of 3 has a story: a plaque's title is the piece's own unless given another
    // (a story with no title of its own counts in full: players found a blank title cost them the plaque)
    const t = await db.rpc(ana, 'gallery_hang', { p_group: gallery, p_slot: 'r1l1', p_publication: pubs[2], p_frame: 'oak', p_light: 'warm', p_power: 20, p_aim: 0, p_story: 'Just a line' });
    expect(t.hall.score.plaques).toBe(10);
    expect(s.tips.length).toBeGreaterThan(0);
    await expectError(db.rpc(ana, 'gallery_open_show', { p_group: gallery }), 'show_running');
  });

  it('visitors admire once a day per piece; Renown for both, never for the owner admiring themselves', async () => {
    await expectError(db.rpc(ana, 'gallery_admire', { p_group: gallery, p_publication: pubs[1] }), 'own_gallery');
    await expectError(db.rpc(ben, 'gallery_admire', { p_group: gallery, p_publication: pubs[1] }), 'not_in_place'); // walk in first
    await db.rpc(ben, 'place_live', { p_place: `gallery:${gallery}` });
    await expectError(db.rpc(ben, 'gallery_admire', { p_group: gallery, p_publication: pubs[5] }), 'not_hung');
    const before = await renown(ana);
    const r = await db.rpc(ben, 'gallery_admire', { p_group: gallery, p_publication: pubs[1] });
    expect(r).toMatchObject({ owner_renown: 5, renown: 1, admires: 1, me: 1 });
    expect(await renown(ana)).toBe(before + 5);
    await expectError(db.rpc(ben, 'gallery_admire', { p_group: gallery, p_publication: pubs[1] }), 'already_admired');
    // a brand-new account with no land can admire, but it pays nobody (no farming with extra accounts)
    await db.rpc(cal, 'place_live', { p_place: `gallery:${gallery}` });
    expect(await db.rpc(cal, 'gallery_admire', { p_group: gallery, p_publication: pubs[1] })).toMatchObject({ owner_renown: 0, renown: 0, admires: 2 });
    expect(await renown(ana)).toBe(before + 5);
    const v = await db.rpc(ben, 'art_place', { p_group: gallery });
    expect(v.hall.hangs.find((h: any) => h.piece.id === pubs[1])).toMatchObject({ admires: 2, admired: true });
  });

  it('piece of the week must be on the walls; the plot card shows what’s on', async () => {
    await expectError(db.rpc(ana, 'gallery_potw', { p_group: gallery, p_publication: pubs[5] }), 'not_hung');
    const g = await db.rpc(ana, 'gallery_potw', { p_group: gallery, p_publication: pubs[1] });
    expect(g.hall.piece_of_week.id).toBe(pubs[1]);
    const card = await db.rpc(ben, 'gallery_card', { p_group: gallery });
    expect(card).toMatchObject({ tier: 'gallery', pieces: 3, show: { title: 'First light' }, piece_of_week: { title: 'Piece 2' } });
    expect(await db.rpc(ben, 'gallery_card', { p_group: studio })).toEqual({ tier: 'studio' });
    // taking it down clears it
    const u = await db.rpc(ana, 'gallery_unhang', { p_group: gallery, p_slot: 'r2r2' });
    expect(u.hall.piece_of_week).toBeNull();
  });

  it('a show pays its Renown once when it closes (early, or by itself when the week is up)', async () => {
    const before = await renown(ana);
    const c = await db.rpc(ana, 'gallery_close_show', { p_group: gallery });
    expect(c.closed.renown).toBe(Math.min(200, c.closed.score.total * 2));
    expect(c.closed.admires).toBe(2);
    expect(await renown(ana)).toBe(before + c.closed.renown);
    expect(c.hall.show).toBeNull();
    expect(c.hall.last_show).toMatchObject({ no: 1, title: 'First light' });
    await expectError(db.rpc(ana, 'gallery_close_show', { p_group: gallery }), 'no_show');
    // the next show runs out on its own
    await db.rpc(ana, 'gallery_hang', { p_group: gallery, p_slot: 'r2r2', p_publication: pubs[3], p_frame: 'oak', p_light: 'warm', p_power: 60, p_aim: 0 });
    await db.rpc(ana, 'gallery_open_show', { p_group: gallery });
    await db.sql(`update gallery_halls set show_closes_at = now() - interval '1 minute' where group_id = $1`, [gallery]);
    const mid = await renown(ana);
    const g = await db.rpc(ben, 'art_place', { p_group: gallery });
    expect(g.hall.show).toBeNull();
    expect(g.hall.last_show.no).toBe(2);
    expect(await renown(ana)).toBeGreaterThan(mid);
  });

  it('new owners get the room empty', async () => {
    await db.sql(`update canvas_groups set owner_id = $1 where id = $2`, [ben, gallery]);
    const g = await db.rpc(ben, 'art_place', { p_group: gallery });
    expect(g.mine).toBe(true);
    expect(g.hall.hangs).toEqual([]);
    await db.sql(`update canvas_groups set owner_id = $1 where id = $2`, [ana, gallery]);
  });
});
