// Estates & Domains wave 1, step 2: the Museum (Art Domain): more rooms, the Loan Wing, sparks inside paintings,
// Exhibition Night, and the old Starlight Museum's renown moving over.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let mia: string, ari: string, vic: string, kid: string, museum: string, gallery: string, ariStudio: string;
const mine: string[] = [];
const aris: string[] = [];
const renown = async (u: string) => Number((await db.sql(`select coalesce((select renown from player_renown where player_id = $1), 0) r`, [u]))[0].r);

async function group(owner: string, kind: string, n: number) {
  const [g] = await db.sql(`insert into canvas_groups (owner_id, name, kind, plot_count) values ($1, 'Test canvas', $2, $3) returning id`, [owner, kind, n]);
  return g.id as string;
}
async function publish(owner: string, groupId: string, title: string) {
  const [p] = await db.sql(`insert into artwork_projects (owner_id, group_id, title) values ($1, $2, $3) returning id`, [owner, groupId, title]);
  const [v] = await db.sql(`insert into artwork_versions (project_id, owner_id, version_no, kind, manifest, cells, layer_count, tile_count)
                            values ($1, $2, 1, 'initial', '{}', '[]', 1, 1) returning id`, [p.id, owner]);
  const [a] = await db.sql(`insert into artwork_publications (owner_id, project_id, version_id, group_id, title, cells, plot_count, min_gx, min_gy, max_gx, max_gy,
                              center_lng, center_lat, status, rights_affirmed_at, terms_version, preview_path, thumb_path, preview_width, preview_height, published_at)
                            values ($1, $2, $3, $4, $5, '[]', 1, 0, 0, 0, 0, 0, 0, 'published', now(), 'test', 'previews/' || gen_random_uuid() || '.png', 'thumbs/x.png', 320, 240, now()) returning id`,
    [owner, p.id, v.id, groupId, title]);
  return a.id as string;
}
const hang = (u: string, g: string, slot: string, pub: string, frame = 'oak') =>
  db.rpc(u, 'gallery_hang', { p_group: g, p_slot: slot, p_publication: pub, p_frame: frame, p_light: 'warm', p_power: 60, p_aim: 0, p_title: null, p_story: null });
/** step inside a painting (as the room's heartbeat says), long enough ago to count */
async function inside(u: string, g: string, pub: string, ago = 10) {
  await db.rpc(u, 'place_live', { p_place: `gallery:${g}`, p_x: 0, p_z: 0, p_act: `inside:${pub}` });
  await db.sql(`update place_presence set act_at = now() - make_interval(secs => $2) where player_id = $1`, [u, ago]);
}

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 10 });
  mia = await db.newPlayer('mia_museum'); ari = await db.newPlayer('ari_artist'); vic = await db.newPlayer('vic_visitor'); kid = await db.newPlayer('kid_new');
  museum = await group(mia, 'museum', 9);
  gallery = await group(mia, 'atelier', 4);
  ariStudio = await group(ari, 'canvas', 1);
  for (let i = 0; i < 3; i++) mine.push(await publish(mia, museum, `Mia ${i + 1}`));
  for (let i = 0; i < 3; i++) aris.push(await publish(ari, ariStudio, `Ari ${i + 1}`));
  for (const u of [ari, vic]) {
    await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]);
    await db.sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values ($2, 900100, 'graphite', 'common', $1, now())`, [u, u === ari ? 900100 : 900101]);
  }
});
afterAll(() => db.close());

describe('the Museum', () => {
  it('is the museum tier with 5 rooms to start, and the old Starlight Museum renown moves over to Renown', async () => {
    await db.sql(`insert into realm_players (player_id, kind, wallet) values ($1, 'museum', '{"renown": 42.5}') on conflict (player_id, kind) do update set wallet = excluded.wallet`, [mia]);
    const m = await db.rpc(mia, 'art_place', { p_group: museum });
    expect(m).toMatchObject({ tier: 'museum', kind: 'museum', mine: true, hall: { rooms: 5 } });
    expect(m.museum).toMatchObject({ loans: [], requests: [], exhibition: null, exhibitions: 0, my_stamps: 0, cfg: { loan_slots: 6, secrets_per_piece: 3 } });
    expect(await renown(mia)).toBe(100 + 42); // the charter, and the whole renown (the half stays behind)
    const w = (await db.sql(`select wallet from realm_players where player_id = $1 and kind = 'museum'`, [mia]))[0].wallet;
    expect(Number(w.renown)).toBeCloseTo(0.5);
    // a gallery stays a gallery (no museum part)
    const g = await db.rpc(mia, 'art_place', { p_group: gallery });
    expect(g.tier).toBe('gallery');
    expect(g.museum).toBeUndefined();
  });

  it('an Estate grown into a Museum gets its extra rooms; rooms past that are priced by the museum', async () => {
    await db.rpc(mia, 'art_place', { p_group: gallery });
    await db.sql(`update canvas_groups set kind = 'museum' where id = $1`, [gallery]);
    const m = await db.rpc(mia, 'art_place', { p_group: gallery });
    expect(m.hall.rooms).toBe(5);
    await db.sql(`update player_renown set renown = 5000 where player_id = $1`, [mia]);
    await db.rpc(mia, 'gallery_add_room', { p_group: museum });
    expect(await renown(mia)).toBe(5000 - 800);
    await db.rpc(mia, 'gallery_add_room', { p_group: museum });
    expect(await renown(mia)).toBe(5000 - 800 - 1200);
    await expectError(db.rpc(mia, 'gallery_add_room', { p_group: museum }), 'max_rooms');
    expect((await db.rpc(mia, 'art_place', { p_group: museum })).hall.rooms).toBe(7);
    await db.sql(`update canvas_groups set kind = 'atelier' where id = $1`, [gallery]);
  });
});

describe('the Loan Wing', () => {
  let loan: number;
  it('finds a player’s pieces, asks to borrow one, and the artist hears about it', async () => {
    const f = await db.rpc(mia, 'museum_find_pieces', { p_group: museum, p_username: 'ARI_artist' });
    expect(f.artist.username).toBe('ari_artist');
    expect(f.pieces.map((p: any) => p.id).sort()).toEqual([...aris].sort());
    await expectError(db.rpc(mia, 'museum_find_pieces', { p_group: museum, p_username: 'mia_museum' }), 'own_art');
    await expectError(db.rpc(mia, 'museum_find_pieces', { p_group: museum, p_username: 'nobody_here' }), 'no_such_player');
    await expectError(db.rpc(vic, 'museum_find_pieces', { p_group: museum, p_username: 'ari_artist' }), 'not_owner');
    await expectError(db.rpc(mia, 'museum_find_pieces', { p_group: gallery, p_username: 'ari_artist' }), 'not_found'); // not a museum

    const m = await db.rpc(mia, 'museum_loan_request', { p_group: museum, p_publication: aris[0], p_note: 'For the night room' });
    expect(m.museum.requests).toHaveLength(1);
    loan = m.museum.requests[0].id;
    expect(m.museum.requests[0]).toMatchObject({ status: 'requested', note: 'For the night room', artist: { username: 'ari_artist' } });
    await expectError(db.rpc(mia, 'museum_loan_request', { p_group: museum, p_publication: aris[0] }), 'already_asked');
    await expectError(db.rpc(mia, 'museum_loan_request', { p_group: museum, p_publication: mine[0] }), 'own_art');
    const n = await db.sql(`select kind, data from player_notifications where player_id = $1 order by id desc limit 1`, [ari]);
    expect(n[0]).toMatchObject({ kind: 'gallery', data: { sub: 'loan_request', title: 'Ari 1' } });
    const l = await db.rpc(ari, 'museum_loans');
    expect(l.asked.map((x: any) => x.id)).toEqual([loan]);
  });

  it('only a piece on loan hangs in the Loan Wing, and only your own work hangs in the rooms', async () => {
    await expectError(hang(mia, museum, 'w1', aris[0]), 'not_on_loan');
    await expectError(db.rpc(vic, 'museum_loan_answer', { p_loan: loan, p_yes: true }), 'not_found');
    const l = await db.rpc(ari, 'museum_loan_answer', { p_loan: loan, p_yes: true });
    expect(l.out).toHaveLength(1);
    await expectError(db.rpc(ari, 'museum_loan_answer', { p_loan: loan, p_yes: false }), 'loan_decided');
    expect((await db.sql(`select data from player_notifications where player_id = $1 order by id desc limit 1`, [mia]))[0].data.sub).toBe('loan_yes');
    await expectError(hang(mia, museum, 'r1l1', aris[0]), 'not_your_art');
    await expectError(hang(mia, museum, 'w1', mine[0]), 'not_on_loan'); // your own work belongs in the rooms
    await expectError(hang(mia, museum, 'w7', aris[0]), 'bad_slot');
    await expectError(hang(mia, gallery, 'w1', aris[0]), 'bad_slot'); // galleries have no Loan Wing
    const m = await hang(mia, museum, 'w1', aris[0]);
    expect(m.museum.loans[0]).toMatchObject({ slot: 'w1', status: 'active', piece: { id: aris[0] } });
    await hang(mia, museum, 'r1l1', mine[0]);
    await hang(mia, museum, 'r1r1', mine[1]);
    // the Loan Wing isn't part of the show's score
    expect(m.hall.score.pieces).toBe(0);
    expect((await db.rpc(mia, 'art_place', { p_group: museum })).hall.score.pieces).toBe(2);
  });

  it('admiring a borrowed piece pays its artist too', async () => {
    await db.rpc(vic, 'place_live', { p_place: `gallery:${museum}` });
    const a0 = await renown(ari), m0 = await renown(mia);
    const r = await db.rpc(vic, 'gallery_admire', { p_group: museum, p_publication: aris[0] });
    expect(r.renown).toBe(1);
    expect(await renown(ari)).toBe(a0 + 3);
    expect(await renown(mia)).toBe(m0 + 5);
    // her own piece pays only her
    const a1 = await renown(ari);
    await db.rpc(vic, 'gallery_admire', { p_group: museum, p_publication: mine[0] });
    expect(await renown(ari)).toBe(a1);
  });

  it('a decline, an early end and a loan that runs out all leave the wall empty', async () => {
    await db.rpc(mia, 'museum_loan_request', { p_group: museum, p_publication: aris[1] });
    const asked = (await db.rpc(ari, 'museum_loans')).asked;
    await db.rpc(ari, 'museum_loan_answer', { p_loan: asked[0].id, p_yes: false });
    expect((await db.sql(`select status from museum_loans where id = $1`, [asked[0].id]))[0].status).toBe('declined');
    // the artist takes the borrowed piece back
    const out = (await db.rpc(ari, 'museum_loans')).out;
    await db.rpc(ari, 'museum_loan_end', { p_loan: out[0].id });
    expect((await db.sql(`select count(*)::int n from gallery_hangs where group_id = $1 and slot like 'w%'`, [museum]))[0].n).toBe(0);
    // a fresh loan that runs out comes down by itself
    await db.rpc(mia, 'museum_loan_request', { p_group: museum, p_publication: aris[2] });
    const id = (await db.rpc(ari, 'museum_loans')).asked[0].id;
    await db.rpc(ari, 'museum_loan_answer', { p_loan: id, p_yes: true });
    await hang(mia, museum, 'w2', aris[2]);
    await db.sql(`update museum_loans set ends_at = now() - interval '1 minute' where id = $1`, [id]);
    const m = await db.rpc(vic, 'art_place', { p_group: museum });
    expect(m.museum.loans).toEqual([]);
    expect(m.hall.hangs.some((h: any) => h.slot === 'w2')).toBe(false);
    expect((await db.sql(`select status from museum_loans where id = $1`, [id]))[0].status).toBe('ended');
  });
});

describe('sparks inside paintings', () => {
  it('pays the finder and the artist once per spark, only from inside the painting', async () => {
    await expectError(db.rpc(vic, 'museum_secret', { p_group: museum, p_publication: mine[0], p_n: 1 }), 'not_inside');
    await inside(vic, museum, mine[0], 1);
    await expectError(db.rpc(vic, 'museum_secret', { p_group: museum, p_publication: mine[0], p_n: 1 }), 'not_inside'); // only just stepped in
    await inside(vic, museum, mine[1]);
    await expectError(db.rpc(vic, 'museum_secret', { p_group: museum, p_publication: mine[0], p_n: 1 }), 'not_inside'); // inside a different one
    await inside(vic, museum, mine[0]);
    await expectError(db.rpc(vic, 'museum_secret', { p_group: museum, p_publication: mine[0], p_n: 4 }), 'bad_secret');
    const v0 = await renown(vic), m0 = await renown(mia);
    const r = await db.rpc(vic, 'museum_secret', { p_group: museum, p_publication: mine[0], p_n: 2 });
    expect(r).toMatchObject({ renown: 2, artist_renown: 2, found: [2] });
    expect(await renown(vic)).toBe(v0 + 2);
    expect(await renown(mia)).toBe(m0 + 2);
    await expectError(db.rpc(vic, 'museum_secret', { p_group: museum, p_publication: mine[0], p_n: 2 }), 'already_found');
    await db.rpc(vic, 'museum_secret', { p_group: museum, p_publication: mine[0], p_n: 1 });
    expect((await db.rpc(vic, 'art_place', { p_group: museum })).museum.found[mine[0]]).toEqual([1, 2]);
  });

  it('a new account finds sparks for fun, but nobody is paid; an artist finding their own pays nobody', async () => {
    await inside(kid, museum, mine[0]);
    const m0 = await renown(mia);
    expect(await db.rpc(kid, 'museum_secret', { p_group: museum, p_publication: mine[0], p_n: 1 })).toMatchObject({ renown: 0, artist_renown: 0 });
    await inside(mia, museum, mine[1]);
    expect(await db.rpc(mia, 'museum_secret', { p_group: museum, p_publication: mine[1], p_n: 1 })).toMatchObject({ renown: 0, artist_renown: 0 });
    expect(await renown(mia)).toBe(m0);
  });
});

describe('Exhibition Night', () => {
  it('opens once a week for a piece on the walls, tells recent visitors, and stamps visitors once', async () => {
    await expectError(db.rpc(vic, 'museum_exhibition_open', { p_group: museum, p_publication: mine[0] }), 'not_owner');
    await expectError(db.rpc(mia, 'museum_exhibition_open', { p_group: museum, p_publication: mine[2] }), 'not_hung');
    const m = await db.rpc(mia, 'museum_exhibition_open', { p_group: museum, p_publication: mine[0] });
    expect(m.museum.exhibition).toMatchObject({ no: 1, stamps: 0, piece: { id: mine[0] } });
    expect(m.told).toBe(1); // Vic admired here
    expect((await db.sql(`select data from player_notifications where player_id = $1 order by id desc limit 1`, [vic]))[0].data).toMatchObject({ sub: 'exhibition', no: 1 });
    await expectError(db.rpc(mia, 'museum_exhibition_open', { p_group: museum, p_publication: mine[1] }), 'exhibition_soon');

    await expectError(db.rpc(mia, 'museum_stamp', { p_group: museum }), 'own_gallery');
    await db.rpc(vic, 'place_leave');
    await expectError(db.rpc(vic, 'museum_stamp', { p_group: museum }), 'not_in_place');
    await db.rpc(vic, 'place_live', { p_place: `gallery:${museum}` });
    const v0 = await renown(vic), m0 = await renown(mia);
    const s = await db.rpc(vic, 'museum_stamp', { p_group: museum });
    expect(s).toMatchObject({ renown: 2, no: 1, stamps: 1, my_stamps: 1 });
    expect(await renown(vic)).toBe(v0 + 2);
    expect(await renown(mia)).toBe(m0 + 3);
    await expectError(db.rpc(vic, 'museum_stamp', { p_group: museum }), 'already_stamped');
    expect((await db.rpc(vic, 'art_place', { p_group: museum })).museum.exhibition).toMatchObject({ stamped: true, stamps: 1 });
  });

  it('closes after its hours, and the next one opens a week after the last', async () => {
    await db.sql(`update museum_exhibitions set opened_at = now() - interval '8 days', closes_at = now() - interval '7 days' where group_id = $1`, [museum]);
    const m = await db.rpc(vic, 'art_place', { p_group: museum });
    expect(m.museum.exhibition).toBeNull();
    await expectError(db.rpc(vic, 'museum_stamp', { p_group: museum }), 'no_exhibition');
    const o = await db.rpc(mia, 'museum_exhibition_open', { p_group: museum, p_publication: mine[1] });
    expect(o.museum.exhibition.no).toBe(2);
    expect(o.museum.exhibitions).toBe(2);
  });
});
