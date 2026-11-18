// ✨ Skywright: the stars as land. ~86 billion stars from one seed (checked here by the same hash as the game's code,
// with nothing stored until a plot is claimed) plus the ~5,000 real ones; each star a ball of plots; the first to claim
// is the Discoverer and gets a cut; prices climb a little with every plot on a star; Keystones roll Epic+ and cost 10×;
// rent a tiny bit more than Earth's; paintings that show from Earth once approved.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';
import { TIERS, tileCount, tileStars, genStar, starCode, realStar, CLASSES, type RealCatalog } from '../../src/stars/galaxy';
import cat from '../../src/stars/realStars.json';

const db = new TestDb();
let dis: string, bob: string, cara: string, mod: string;
const CAT = cat as unknown as RealCatalog;

/** the first generated star in a tile that holds one, of a tier and class (if given) */
function findStar(t: number, want?: (s: ReturnType<typeof genStar>) => boolean) {
  for (let f = 0; f < 6; f++) for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) {
    for (const s of tileStars(t, f, i, j)) if (!want || want(s)) return s;
  }
  throw new Error('no star');
}
const card = (uid: string | null, id: number) => db.rpc(uid, 'star_card', { p_id: id });
const go = async (uid: string, id: number) => { await db.rpc(uid, 'star_warp', { p_id: id }); await db.rpc(uid, 'star_rush'); };
const claim = (uid: string, id: number, cell: number, kind = 'base') => db.rpc(uid, 'star_claim', { p_id: id, p_cell: cell, p_kind: kind });
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0].amount);
const earth = async (uid: string) => Number((await db.sql(`select private.sw_earth_price($1) p`, [uid]))[0].p);

beforeAll(async () => {
  await db.init({ ungated: true });
  dis = await db.newPlayer('sw_dis'); bob = await db.newPlayer('sw_bob'); cara = await db.newPlayer('sw_cara'); mod = await db.newPlayer('sw_mod');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'moderator')`, [mod]);
  for (const u of [dis, bob, cara]) await db.giveInk(u, 1_000_000);
});
afterAll(() => db.close());

describe('the galaxy: the database and the game agree on every star', () => {
  it('tile counts, star kinds, distances and codes match the game’s own code, tier by tier', async () => {
    const ids: number[] = [];
    const want: Record<number, any> = {};
    for (let t = 1; t <= 5; t++) {
      const N = TIERS[t].n;
      for (let n = 0; n < 24; n++) {
        const f = n % 6, i = (n * 7919 + t * 31) % N, j = (n * 104729 + t * 17) % N;
        const c = Number((await db.sql(`select private.sw_tile_count($1, $2, $3, $4) c`, [t, f, i, j]))[0].c);
        expect(c).toBe(tileCount(t, f, i, j));
        for (const s of tileStars(t, f, i, j)) { ids.push(s.id); want[s.id] = s; }
      }
    }
    expect(ids.length).toBeGreaterThan(60);
    const rows = await db.sql(`select x.id, private.sw_star(x.id) s from unnest($1::bigint[]) x(id)`, [ids]);
    for (const r of rows) {
      const s = want[Number(r.id)];
      expect(r.s, `star ${r.id}`).toMatchObject({ tier: s.tier, cls: s.cls, m: s.m, cells: s.cells, ly: s.ly, code: s.code });
    }
  });

  it('a star that isn’t there (past a tile’s count, off the grid) is nobody’s', async () => {
    const t = 3, N = TIERS[t].n;
    let f = 0, i = 0, j = 0;
    while (tileCount(t, f, i, j) >= 6) j++;
    const idPast = ((t * 8 + f) * 131072 + i) * 131072 * 16 + j * 16 + tileCount(t, f, i, j);
    expect((await db.sql(`select private.sw_star($1) s`, [idPast]))[0].s).toBeNull();
    const idOff = ((t * 8 + 6) * 131072 + 0) * 131072 * 16;
    expect((await db.sql(`select private.sw_star($1) s`, [idOff]))[0].s).toBeNull();
    const idBigI = ((t * 8 + 0) * 131072 + N) * 131072 * 16;
    expect((await db.sql(`select private.sw_star($1) s`, [idBigI]))[0].s).toBeNull();
    await expectError(card(dis, idPast), 'no_such_star');
  });

  it('the real stars: every one with the kind and distance the game gives it (Sirius, Betelgeuse, Polaris…)', async () => {
    const sample = CAT.stars.filter((r, n) => n % 97 === 0 || ['Sirius', 'Betelgeuse', 'Polaris', 'Vega', 'Rigel'].includes(r[6]));
    const rows = (await db.sql(`select hip, cls, ly, name from real_stars where hip = any ($1::int[])`, [sample.map((r) => r[0])])).map((r) => ({ ...r, ly: Number(r.ly) }));
    expect(rows.length).toBe(sample.length);
    const by = new Map(rows.map((r) => [Number(r.hip), r]));
    for (const r of sample) {
      const s = realStar(r, CAT);
      expect(by.get(r[0]), s.name).toMatchObject({ cls: s.cls, ly: s.ly });
    }
    expect(Number((await db.sql(`select count(*) n from real_stars`))[0].n)).toBe(CAT.stars.length);
    const bet = CAT.stars.find((r) => r[6] === 'Betelgeuse')!;
    expect(await card(null, bet[0])).toMatchObject({ tier: 0, cls: 'supergiant', code: `HIP ${bet[0]}`, name: 'Betelgeuse', claimed: 0 });
  });

  it('every kind of star: its plots (10·m² + 2), as the game has them', async () => {
    const rows = await db.sql(`select id, m, weight from private.sw_classes order by sort`);
    expect(rows.map((r) => [r.id, r.m, r.weight])).toEqual(CLASSES.map((c) => [c.id, c.m, c.weight]));
    expect(starCode(findStar(2).id)).toMatch(/^LV-[0-9A-Z]+$/);
  });
});

describe('claiming plots on a star', () => {
  let star: ReturnType<typeof genStar> & {};
  beforeAll(() => { star = findStar(2, (s) => !!s && s.cls === 'orange')!; });

  it('a star nobody has claimed: no Discoverer, the Earth price, the warp’s fuel and time by its distance', async () => {
    const c = await card(dis, star.id);
    const e = await earth(dis);
    expect(c).toMatchObject({ id: star.id, claimed: 0, discoverer: null, cells: star.cells, here: false, painted: false });
    expect(c.price).toMatchObject({ earth: e, ink: e, premium: 0 });
    expect(c.keystone_price.ink).toBe(e * 10);
    expect(c.warp.ink).toBeGreaterThan(30);
    expect(c.warp.secs).toBeGreaterThanOrEqual(14);
  });

  it('you place plots on a star once you’re there (warp, then arrive)', async () => {
    await expectError(claim(dis, star.id, 20), 'not_at_star');
    const before = await ink(dis);
    const w = await db.rpc(dis, 'star_warp', { p_id: star.id });
    expect(w.dest_star).toBe(star.id);
    expect(await ink(dis)).toBe(before - w.cost);
    await expectError(claim(dis, star.id, 20), 'not_at_star');
    await db.rpc(dis, 'star_rush');
    expect(await db.rpc(dis, 'star_where')).toMatchObject({ at_star: star.id, dest_star: null });
    expect((await card(dis, star.id)).here).toBe(true);
  });

  it('the first plot makes you its Discoverer (and it’s on the feed)', async () => {
    const e = await earth(dis);
    const before = await ink(dis);
    const r = await claim(dis, star.id, 20);
    expect(r).toMatchObject({ star: star.id, cell: 20, keystone: false, discovered: true, discoverer_cut: 0, claimed: 1 });
    expect(r.cost.ink).toBe(e);
    expect(await ink(dis)).toBe(before - e);
    const c = await card(bob, star.id);
    expect(c.discoverer).toMatchObject({ username: 'sw_dis' });
    expect((await db.sql(`select count(*) n from feed_events where kind = 'star' and player_id = $1 and data->>'sub' = 'discovered'`, [dis]))[0].n).toBe('1');
    await expectError(claim(dis, star.id, 20), 'plot_unavailable');
    await expectError(claim(dis, star.id, star.cells), 'invalid_plot');
  });

  it('each plot on a star costs a little more than the last: Earth × (1 + 0.05·√n)', async () => {
    await go(bob, star.id);
    for (let n = 1; n <= 4; n++) {
      const e = await earth(bob);
      const r = await claim(bob, star.id, 20 + n);
      expect(r.cost.ink).toBe(Math.round(e * (1 + 0.05 * Math.sqrt(n))));
      expect(r.claimed).toBe(n + 1);
    }
  });

  it('the Discoverer gets 10% of what others pay above the Earth price (as Ink) — never of their own', async () => {
    const before = await ink(dis);
    const e = await earth(cara);
    await go(cara, star.id);
    const n = (await card(cara, star.id)).claimed;
    const r = await claim(cara, star.id, 40);
    const premium = Math.round(e * (1 + 0.05 * Math.sqrt(n))) - e;
    expect(r.discoverer_cut).toBe(Math.max(1, Math.floor(premium * 0.1)));
    expect(r.discoverer_cut).toBeGreaterThan(0);
    expect(await ink(dis)).toBe(before + r.discoverer_cut);
    const note = await db.sql(`select data from player_notifications where player_id = $1 and kind = 'star' and data->>'sub' = 'cut' order by created_at desc limit 1`, [dis]);
    expect(note[0].data).toMatchObject({ star: star.id, ink: r.discoverer_cut, by: 'sw_cara' });
    // (the Discoverer's own next plot pays them nothing)
    const own = await claim(dis, star.id, 41);
    expect(own.discoverer_cut).toBe(0);
  });

  it('Keystones (the 12 pentagons): Epic or better, 10× the price, and the cut on their premium too', async () => {
    const e = await earth(bob);
    const n = (await card(bob, star.id)).claimed;
    const before = await ink(dis);
    const r = await claim(bob, star.id, 3);
    expect(r.keystone).toBe(true);
    const price = Math.round(e * (1 + 0.05 * Math.sqrt(n)));
    expect(r.cost.ink).toBe(price * 10);
    const sort = (await db.sql(`select sort from plot_rarities where id = $1`, [r.rarity]))[0].sort;
    const epic = (await db.sql(`select sort from plot_rarities where id = 'epic'`))[0].sort;
    expect(sort).toBeGreaterThanOrEqual(epic);
    expect(r.discoverer_cut).toBe(Math.max(1, Math.floor((price - e) * 10 * 0.1)));
    expect(await ink(dis)).toBe(before + r.discoverer_cut);
  });

  it('no Ultras on stars (for now): every roll is on the everyday ladder', async () => {
    const ultras = (await db.sql(`select id from plot_rarities where coalesce(ppm, 0) > 0 or coalesce(ppb, 0) > 0`)).map((r) => r.id);
    const rolls = await db.sql(`select private.sw_roll($1, c, c < 12) r from generate_series(0, 2000) c`, [star.id]);
    for (const r of rolls) expect(ultras).not.toContain(r.r);
    const keys = await db.sql(`select distinct private.sw_roll($1, c, true) r from generate_series(0, 400) c`, [star.id]);
    const epic = (await db.sql(`select sort from plot_rarities where id = 'epic'`))[0].sort;
    for (const k of keys) expect((await db.sql(`select sort from plot_rarities where id = $1`, [k.r]))[0].sort).toBeGreaterThanOrEqual(epic);
  });

  it('star plots pay USD rent: the same rarity’s Earth rent × 1.1', async () => {
    const rows = await db.sql(`select sp.rarity, sp.shiny, r.usd_per_second e, private.sw_plot_rate(sp.rarity, sp.shiny) s from star_plots sp join plot_rarities r on r.id = sp.rarity where sp.owner_id = $1`, [bob]);
    expect(rows.length).toBe(5);
    for (const r of rows) if (!r.shiny) expect(Number(r.s)).toBeCloseTo(Number(r.e) * 1.1, 12);
    const rate = Number((await db.sql(`select private.rent_rate($1) r`, [bob]))[0].r);
    const sum = rows.reduce((a, r) => a + Number(r.s), 0);
    const mult = Number((await db.sql(`select private.rent_mult($1) m`, [bob]))[0].m);
    expect(rate).toBeCloseTo(sum * mult, 10);
  });

  it('naming: the Discoverer names the star; plot owners name their plots', async () => {
    await expectError(db.rpc(bob, 'star_name', { p_id: star.id, p_name: 'Bobstar' }), 'not_discoverer');
    expect(await db.rpc(dis, 'star_name', { p_id: star.id, p_name: 'Lantern' })).toMatchObject({ name: 'Lantern' });
    expect((await card(null, star.id)).name).toBe('Lantern');
    expect(await db.rpc(bob, 'star_name_plot', { p_id: star.id, p_cell: 21, p_name: 'Porch' })).toMatchObject({ name: 'Porch' });
    await expectError(db.rpc(bob, 'star_name_plot', { p_id: star.id, p_cell: 20, p_name: 'Mine now' }), 'not_owner');
  });

  it('the sky asks which stars are claimed: their colour, how full, their art’s revision', async () => {
    const l = await db.rpc(null, 'stars_seen', { p_ids: `{${star.id},${star.id + 1}}` });
    expect(l).toEqual([expect.objectContaining({ id: star.id, cells: star.cells, painted: false, name: 'Lantern' })]);
    const my = await db.rpc(bob, 'my_stars');
    expect(my.plots).toBe(5);
    expect(my.stars[0]).toMatchObject({ id: star.id, mine: 5, discoverer: false });
    expect((await db.rpc(dis, 'my_stars')).stars[0]).toMatchObject({ id: star.id, discoverer: true });
    const ch = await db.rpc(null, 'stars_chart');
    expect(ch.newest[0]).toMatchObject({ id: star.id, discoverer: 'sw_dis' });
  });

  it('deep stars (ultra deep, the far galaxy) take an Observatory to find; ones already found are on the chart', async () => {
    expect((await db.rpc(dis, 'star_reach')).reach).toBe(3);
    const deep = findStar(4);
    await expectError(db.rpc(dis, 'star_warp', { p_id: deep.id }), 'out_of_reach');
    // (found by someone, it's anyone's to visit)
    await db.sql(`insert into star_systems (star_id, tier, cls, m, cells, discoverer_id) values ($1, 4, $2, $3, $4, $5)`, [deep.id, deep.cls, deep.m, deep.cells, cara]);
    const w = await db.rpc(dis, 'star_warp', { p_id: deep.id });
    expect(w.dest_star).toBe(deep.id);
    await db.rpc(dis, 'star_home');
    expect(await db.rpc(dis, 'star_where')).toMatchObject({ at_star: null, dest_star: null });
  });
});

describe('painting a star', () => {
  let small: ReturnType<typeof genStar> & {};
  const img = (c: string) => `data:image/png;base64,${Buffer.from('fake-' + c).toString('base64')}`;
  beforeAll(async () => {
    small = findStar(1, (s) => !!s && s.cls === 'neutron')!;
    expect(small.cells).toBe(12);
  });

  it('only plot owners paint; a painting waits for review before others see it', async () => {
    await go(dis, small.id);
    await claim(dis, small.id, 0);
    await expectError(db.rpc(bob, 'star_art_save', { p_id: small.id, p_img: img('a'), p_w: 256, p_h: 128, p_color: '#ff0000' }), 'not_owner');
    await expectError(db.rpc(dis, 'star_art_save', { p_id: small.id, p_img: 'javascript:alert(1)', p_w: 256, p_h: 128, p_color: '#ff0000' }), 'invalid_image');
    await expectError(db.rpc(dis, 'star_art_save', { p_id: small.id, p_img: img('a'), p_w: 256, p_h: 100, p_color: '#ff0000' }), 'invalid_image');
    const r = await db.rpc(dis, 'star_art_save', { p_id: small.id, p_img: img('a'), p_w: 256, p_h: 128, p_color: '#ff0000' });
    expect(r).toMatchObject({ rev: 1, status: 'pending' });
    expect(await db.rpc(bob, 'star_art_layer', { p_id: small.id, p_owner: dis })).toBeNull();
    expect(await db.rpc(dis, 'star_art_layer', { p_id: small.id, p_owner: dis })).toMatchObject({ rev: 1, status: 'pending' });
    expect((await card(bob, small.id)).art).toEqual([]);
  });

  it('staff approve it in the portal; then it’s on the star for everyone (its colour in the sky)', async () => {
    await expectError(db.rpc(bob, 'admin_star_art_queue'), 'forbidden');
    const q = await db.rpc(mod, 'admin_star_art_queue');
    expect(q).toEqual([expect.objectContaining({ star: small.id, owner: dis, username: 'sw_dis', status: 'pending' })]);
    await db.rpc(mod, 'admin_star_art_review', { p_star: small.id, p_owner: dis, p_approve: true });
    expect(await db.rpc(bob, 'star_art_layer', { p_id: small.id, p_owner: dis })).toMatchObject({ status: 'approved' });
    const c = await card(bob, small.id);
    expect(c.art).toEqual([expect.objectContaining({ owner: dis, status: 'approved' })]);
    expect(c.color?.toLowerCase()).toBe('#ff0000');
    expect(c.art_rev).toBeGreaterThan(0);
    expect((await db.sql(`select count(*) n from audit_logs where action = 'star_art_review'`))[0].n).toBe('1');
  });

  it('a rejected painting never shows (and its painter hears why)', async () => {
    await go(bob, small.id);
    await claim(bob, small.id, 1);
    await db.rpc(bob, 'star_art_save', { p_id: small.id, p_img: img('b'), p_w: 256, p_h: 128, p_color: '#00ff00' });
    await db.rpc(mod, 'admin_star_art_review', { p_star: small.id, p_owner: bob, p_approve: false, p_reason: 'Not this' });
    expect(await db.rpc(cara, 'star_art_layer', { p_id: small.id, p_owner: bob })).toBeNull();
    expect((await db.sql(`select data from player_notifications where player_id = $1 and kind = 'star' order by id desc limit 1`, [bob]))[0].data).toMatchObject({ sub: 'art_no', reason: 'Not this' });
    expect(await db.rpc(bob, 'star_art_layer', { p_id: small.id, p_owner: bob })).toMatchObject({ status: 'rejected' });
  });

  it('every plot claimed and every owner’s painting approved: a Painted Star', async () => {
    // (the rest of the small star to its two owners; bob's painting again, approved)
    for (let c = 2; c < small.cells; c++) await claim(c % 2 ? bob : dis, small.id, c);
    expect((await card(bob, small.id)).claimed).toBe(small.cells);
    expect((await card(bob, small.id)).painted).toBe(false);
    await db.rpc(bob, 'star_art_save', { p_id: small.id, p_img: img('c'), p_w: 256, p_h: 128, p_color: '#0000ff' });
    await db.rpc(mod, 'admin_star_art_review', { p_star: small.id, p_owner: bob, p_approve: true });
    const c = await card(cara, small.id);
    expect(c.painted).toBe(true);
    expect(c.painted_at).toBeTruthy();
    expect((await db.rpc(null, 'stars_chart')).painted[0]).toMatchObject({ id: small.id });
  });
});
