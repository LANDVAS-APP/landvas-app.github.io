// ✨ Stars you can find, see and paint (20261120000080): a blue giant's plots come back in full (they didn't: nobody's
// plots showed on a star of 10,242), your own plots on a star come back on their own, my_stars says where your latest
// plot is and how far the star is, a painting can cover just a part of a big star, and staff see every painting and
// can turn review off, approve everything waiting, and set the sky's sizes and the telescope's reach.
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
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

beforeAll(async () => {
  await db.init({ ungated: true });
  me = await db.newPlayer('sf_me'); you = await db.newPlayer('sf_you'); staff = await db.newPlayer('sf_staff');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner')`, [staff]);
  for (const u of [me, you]) await db.giveInk(u, 5_000_000);
});
afterAll(() => db.close());

describe('finding and seeing your plots', () => {
  let giant: number;
  it('a blue giant’s claimed plots come back in full (and yours on their own)', async () => {
    giant = findStar(2, (x) => x.cls === 'blue' || x.cls === 'red_giant').id;
    await go(me, giant); await go(you, giant);
    for (const c of [100, 101, 5000]) await claim(me, giant, c);
    await claim(you, giant, 9000);
    const all = await db.rpc(me, 'star_plots_of', { p_id: giant });
    expect(all.cells).toBe(10242);
    expect(all.plots.map((p: any[]) => p[0]).sort((a: number, b: number) => a - b)).toEqual([100, 101, 5000, 9000]);
    expect(all.plots.filter((p: any[]) => p[4]).length).toBe(3);
    const mine = await db.rpc(me, 'star_my_plots', { p_id: giant });
    expect(mine.map((p: any[]) => p[0])).toEqual([5000, 101, 100]); // (latest first)
    expect(mine.every((p: any[]) => p[4] === true)).toBe(true);
  });

  it('past plots_full claimed plots, the full list needs the cells asked about', async () => {
    await db.sql(`update game_config set value = value || '{"plots_full": 2}' where key = 'stars'`);
    await expectError(db.rpc(me, 'star_plots_of', { p_id: giant }), 'too_many');
    expect((await db.rpc(me, 'star_plots_of', { p_id: giant, p_cells: '{100,9000}' })).plots.length).toBe(2);
    expect((await db.rpc(me, 'star_my_plots', { p_id: giant })).length).toBe(3);
    await db.sql(`update game_config set value = value || '{"plots_full": 6000}' where key = 'stars'`);
  });

  it('my_stars: how far, its code, where your latest plot is, your painting', async () => {
    const r = await db.rpc(me, 'my_stars');
    const s = r.stars.find((x: any) => x.id === giant);
    expect(s.mine).toBe(3);
    expect(s.last_cell).toBe(5000);
    expect(s.tier).toBe(2);
    expect(Number(s.ly)).toBeGreaterThan(100);
    expect(s.code).toMatch(/^LV-/);
    expect(s.art).toBeNull();
    expect(s.discoverer).toBe(true);
    expect((await db.rpc(you, 'my_stars')).stars.find((x: any) => x.id === giant).discoverer).toBe(false);
  });
});

describe('painting part of a star', () => {
  let big: number;
  it('a painting of a part of the star (its rect) saves, comes back with its rect, and shows on the card', async () => {
    big = findStar(2, (x) => x.cls === 'blue' || x.cls === 'red_giant').id;
    const rect = { u0: 0.95, v0: 0.4, du: 0.1, dv: 0.08 };
    const r = await db.rpc(me, 'star_art_save', { p_id: big, p_img: PNG, p_w: 640, p_h: 256, p_color: '#ff0000', p_rect: rect });
    expect(r.status).toBe('pending');
    const L = await db.rpc(me, 'star_art_layer', { p_id: big, p_owner: me });
    expect(L.rect).toEqual(rect);
    expect(L.w).toBe(640);
    const card = await db.rpc(me, 'star_card', { p_id: big });
    expect(card.art.find((a: any) => a.mine).rect).toEqual(rect);
    expect((await db.rpc(me, 'my_stars')).stars.find((x: any) => x.id === big).art).toBe('pending');
  });
  it('a bad rect or size is refused; a whole-star painting still has to be twice as wide as tall', async () => {
    await expectError(db.rpc(me, 'star_art_save', { p_id: big, p_img: PNG, p_w: 640, p_h: 256, p_color: null, p_rect: { u0: 1.2, v0: 0, du: 0.1, dv: 0.1 } }), 'invalid_rect');
    await expectError(db.rpc(me, 'star_art_save', { p_id: big, p_img: PNG, p_w: 640, p_h: 256, p_color: null, p_rect: { u0: 0.1, v0: 0.95, du: 0.1, dv: 0.2 } }), 'invalid_rect');
    await expectError(db.rpc(me, 'star_art_save', { p_id: big, p_img: PNG, p_w: 640, p_h: 256, p_color: null, p_rect: { u0: 0.1, v0: 0.1, du: 'x', dv: 0.2 } }), 'invalid_rect');
    await expectError(db.rpc(me, 'star_art_save', { p_id: big, p_img: PNG, p_w: 9000, p_h: 256, p_color: null, p_rect: { u0: 0.1, v0: 0.1, du: 0.1, dv: 0.2 } }), 'invalid_image');
    await expectError(db.rpc(me, 'star_art_save', { p_id: big, p_img: PNG, p_w: 640, p_h: 256, p_color: null }), 'invalid_image');
    const whole = await db.rpc(me, 'star_art_save', { p_id: big, p_img: PNG, p_w: 1024, p_h: 512, p_color: null });
    expect(whole.rev).toBeGreaterThan(1);
    expect((await db.rpc(me, 'star_art_layer', { p_id: big, p_owner: me })).rect).toBeNull();
  });
});

describe('admin → Stars', () => {
  it('every painting by its state; approve everything waiting at once', async () => {
    const yours = findStar(1, (x) => x.cls === 'yellow').id;
    await go(you, yours); await claim(you, yours, 30);
    await db.rpc(you, 'star_art_save', { p_id: yours, p_img: PNG, p_w: 512, p_h: 256, p_color: null });
    const waiting = await db.rpc(staff, 'admin_star_art_list', { p_status: 'pending' });
    expect(waiting.length).toBe(2);
    expect(waiting[0]).toHaveProperty('m');
    expect(waiting.some((w: any) => w.username === 'sf_you' && w.plots === 1)).toBe(true);
    await expectError(db.rpc(me, 'admin_star_art_list', { p_status: 'pending' }), 'forbidden');
    await expectError(db.rpc(staff, 'admin_star_art_list', { p_status: 'nope' }), 'invalid_value');
    const r = await db.rpc(staff, 'admin_star_art_approve_all');
    expect(r).toEqual({ approved: 2, left: 0 });
    expect((await db.rpc(staff, 'admin_star_art_list', { p_status: 'approved' })).length).toBe(2);
    // take one down again
    await db.rpc(staff, 'admin_star_art_review', { p_star: yours, p_owner: you, p_approve: false, p_reason: 'not on a star' });
    const no = await db.rpc(staff, 'admin_star_art_list', { p_status: 'rejected' });
    expect(no[0].reason).toBe('not on a star');
  });
  it('review off: a painting is on the star straight away', async () => {
    await db.rpc(staff, 'admin_set_star_settings', { p_value: { art: { review: false } } });
    const s = findStar(1, (x) => x.cls === 'orange').id;
    await go(me, s); await claim(me, s, 20);
    expect((await db.rpc(me, 'star_art_save', { p_id: s, p_img: PNG, p_w: 512, p_h: 256, p_color: null })).status).toBe('approved');
    await db.rpc(staff, 'admin_set_star_settings', { p_value: { art: { review: true } } });
  });
  it('the sky’s sizes, the telescope’s reach, the full-list limit and the painting’s detail can be set (and are checked)', async () => {
    const d = await db.rpc(staff, 'admin_set_star_settings', { p_value: { sky: { size_k: 20 }, reach: { base: 2 }, plots_full: 8000, art: { region_px: 30 } } });
    expect(d.settings.sky).toMatchObject({ size_k: 20, shell_x: 2.6 });
    expect(d.settings.reach).toMatchObject({ base: 2, one: 4 });
    expect(d.settings.art).toMatchObject({ region_px: 30, review: true, max_w: 2048 });
    expect(d.settings.plots_full).toBe(8000);
    const reach = await db.rpc(you, 'star_reach');
    expect(reach.reach).toBe(2);
    expect(reach.sky.size_k).toBe(20);
    await expectError(db.rpc(staff, 'admin_set_star_settings', { p_value: { reach: { base: 9 } } }), 'invalid_value');
    await expectError(db.rpc(staff, 'admin_set_star_settings', { p_value: { sky: { nope: 1 } } }), 'invalid_value');
    await expectError(db.rpc(staff, 'admin_set_star_settings', { p_value: { art: { max_w: 99999 } } }), 'invalid_value');
    await db.rpc(staff, 'admin_set_star_settings', { p_value: { sky: { size_k: 10 }, reach: { base: 3 } } });
    expect((await db.rpc(you, 'star_reach')).reach).toBe(3);
  });
  it('the new helpers that read tables keep their plans (PL/pgSQL)', async () => {
    const rows = await db.sql(`select p.proname, l.lanname from pg_proc p join pg_language l on l.oid = p.prolang join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and p.proname in ('star_my_plots', 'my_stars', 'sw_reach', 'star_reach', 'star_art_layer', 'admin_star_art_list')`);
    expect(rows.length).toBe(6);
    for (const r of rows) expect(r.lanname, r.proname).toBe('plpgsql');
  });
});
