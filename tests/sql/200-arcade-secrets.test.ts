// Arcade secrets: the Founder's Code (trace the logo's L across the floor plan -> LAND GRAB), the Back Room (claw down
// the chute every go -> a token -> the ticket machine -> PROTO-0), the B-Side (songs slowest to fastest + a thump),
// their games (bounty once, 3x Ink uncapped, B-Side charts unlock in order) and the admin page's calls.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ow: string, pl: string, ad: string, arcId: string;
const A = { gx: 3_420_000, gy: 2_120_000 };
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const play = async (uid: string, game: string, score: number, secs = 60) => {
  const s = await db.rpc(uid, 'arcade_start', { p_arcade: arcId, p_game: game });
  await db.sql(`update arcade_plays set started_at = now() - make_interval(secs => $2) where id = $1`, [s.session, secs]);
  await db.rpc(uid, 'arcade_finish', { p_session: s.session, p_score: score });
  return s.session as string;
};
const check = (uid: string, session: string) => db.rpc(uid, 'arcade_secret_check', { p_session: session });
const event = (uid: string, secret: string, kind: string, data: unknown = {}) => db.rpc(uid, 'arcade_secret_event', { p_secret: secret, p_kind: kind, p_data: data });
const splay = async (uid: string, secret: string, game: string, score: number, meta: unknown = {}, secs = 60, mode = 'classic') => {
  const s = await db.rpc(uid, 'arcade_secret_start', { p_secret: secret, p_game: game, p_mode: mode });
  await db.sql(`update arcade_secret_plays set started_at = now() - make_interval(secs => $2) where id = $1`, [s.session, secs]);
  return db.rpc(uid, 'arcade_secret_finish', { p_session: s.session, p_score: score, p_meta: meta });
};
const chute = Array.from({ length: 5 }, () => [0.08, 0.93]);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 4 });
  await db.sql(`update game_config set value = jsonb_set(value, '{steps}', '[[1, 1]]') where key = 'plot_access'`);
  ow = await db.newPlayer('sec_owner'); pl = await db.newPlayer('sec_player'); ad = await db.newPlayer('sec_admin');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'economy')`, [ad]);
  await db.giveInk(ow, 100);
  await db.rpc(ow, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  const groupId = (await db.rpc(ow, 'my_groups'))[0].id;
  arcId = (await db.rpc(ow, 'set_group_kind', { p_group_id: groupId, p_kind: 'arcade' })).arcade_id;
  await db.sql(`update arcades set machines = '{"stacker": 1, "cyclone": 1, "snake": 1, "bop": 1, "claw": 1, "airhockey": 1, "maze": 1, "rhythm": 1, "racer": 1}' where id = $1`, [arcId]);
});
afterAll(() => db.close());

describe('nothing shows until it’s found', () => {
  it('a new player has found nothing, and can’t reach any secret game', async () => {
    expect(await db.rpc(pl, 'arcade_secrets_me', {})).toEqual({ found: [], token_until: null, bside: null, proto: null });
    for (const s of ['founder', 'backroom', 'bside']) {
      expect(await db.rpc(pl, 'arcade_secret_get', { p_secret: s })).toEqual({ found: false });
      await expectError(db.rpc(pl, 'arcade_secret_start', { p_secret: s, p_game: 'landgrab' }), 'not_found');
    }
    expect(JSON.stringify(await db.sql(`select value from game_config`))).not.toMatch(/token_minutes|any_position|"thumps"/);
  });
});

describe('the Founder’s Code', () => {
  it('the L traced the wrong way, or with a gap, does nothing', async () => {
    // the right cabinets, upside down
    for (const g of ['airhockey', 'claw', 'bop', 'stacker']) await play(pl, g, 30);
    let last = await play(pl, 'snake', 30);
    expect(await check(pl, last)).toEqual({ opened: false });
    // a straight line
    for (const g of ['snake', 'stacker', 'bop', 'maze']) await play(pl, g, 30);
    last = await play(pl, 'rhythm', 30);
    expect(await check(pl, last)).toEqual({ opened: false });
  });
  it('down the left side and along the bottom opens it — anywhere on the floor — with its bounty, once', async () => {
    const before = await ink(pl);
    // the L one row further forward: Ink Tower, Bop-a-Bot, Ink Maze, then Rhythm Rush and Neon Racer
    for (const g of ['stacker', 'bop', 'maze', 'rhythm']) await play(pl, g, 30);
    const last = await play(pl, 'racer', 30);
    const r = await check(pl, last);
    expect(r).toMatchObject({ opened: true, secret: 'founder', first: true, bounty: 1000 });
    expect(await ink(pl) - before).toBeGreaterThanOrEqual(1000);
    expect((await check(pl, last)).first).toBe(false);
    expect((await db.rpc(pl, 'arcade_secrets_me', {})).found).toEqual(['founder']);
  });
  it('LAND GRAB pays 3x Ink, uncapped, and remembers the best level', async () => {
    const before = await ink(pl);
    const r = await splay(pl, 'founder', 'landgrab', 5000, { level: 3 });
    expect(r).toMatchObject({ score: 5000, paid: 6, tickets: 100, new_best: true });
    expect(r.data.level).toBe(3);
    expect(await ink(pl) - before).toBe(6);
    const g = await db.rpc(pl, 'arcade_secret_get', { p_secret: 'founder' });
    expect(g.found).toBe(true);
    expect(g.boards['landgrab:classic'][0].score).toBe(5000);
  });
});

describe('the Back Room', () => {
  it('a claw round that dropped anywhere else gives nothing; down the chute every go gives a token', async () => {
    let s = await play(pl, 'claw', 0);
    expect(await event(pl, 'backroom', 'claw', { session: s, drops: [...chute.slice(0, 4), [0.5, 0.5]] })).toEqual({ token: false });
    expect(await event(pl, 'backroom', 'feed')).toEqual({ opened: false });
    s = await play(pl, 'claw', 0);
    const t = await event(pl, 'backroom', 'claw', { session: s, drops: chute });
    expect(t.token).toBe(true);
    expect((await db.rpc(pl, 'arcade_secrets_me', {})).token_until).toBeTruthy();
  });
  it('an old token is no good', async () => {
    await db.sql(`update arcade_secret_state set data = jsonb_set(data, '{token_until}', to_jsonb(now() - interval '1 minute')) where player_id = $1 and secret = 'backroom'`, [pl]);
    expect(await event(pl, 'backroom', 'feed')).toEqual({ opened: false });
  });
  it('feeding a fresh token to the ticket machine opens the back room, once', async () => {
    const s = await play(pl, 'claw', 0);
    await event(pl, 'backroom', 'claw', { session: s, drops: chute });
    const r = await event(pl, 'backroom', 'feed');
    expect(r).toMatchObject({ opened: true, secret: 'backroom', first: true, bounty: 750 });
    expect(await event(pl, 'backroom', 'feed')).toEqual({ opened: false }); // the token was used
    const p = await splay(pl, 'backroom', 'proto', 450, { stage: 31 });
    expect(p.paid).toBe(3);
    expect(p.data.stage).toBe(31);
  });
});

describe('the B-Side', () => {
  const tracks = (ids: string[], secs = 12) => ids.map((id) => ({ id, secs }));
  it('the wrong order or a song cut short does nothing', async () => {
    expect(await event(pl, 'bside', 'thump', { tracks: tracks(['neon', 'chill', 'funk', 'pixel', 'boss']) })).toEqual({ opened: false });
    expect(await event(pl, 'bside', 'thump', { tracks: [...tracks(['chill', 'neon', 'funk', 'pixel']), { id: 'boss', secs: 2 }] })).toEqual({ opened: false });
  });
  it('slowest to fastest, then a thump, opens it', async () => {
    const r = await event(pl, 'bside', 'thump', { tracks: tracks(['boss', 'chill', 'neon', 'funk', 'pixel', 'boss']) });
    expect(r).toMatchObject({ opened: true, secret: 'bside', first: true, bounty: 750 });
  });
  it('each song’s chart opens when the one before it is cleared; Track 00 when all are cleared on Hard', async () => {
    await expectError(db.rpc(pl, 'arcade_secret_start', { p_secret: 'bside', p_game: 'bside.neon.easy' }), 'locked');
    await expectError(db.rpc(pl, 'arcade_secret_start', { p_secret: 'bside', p_game: 'bside.after.easy' }), 'locked');
    await expectError(db.rpc(pl, 'arcade_secret_start', { p_secret: 'bside', p_game: 'bside.chill.insane' }), 'invalid_game');
    // played but failed: still locked
    await splay(pl, 'bside', 'bside.chill.easy', 600, { clear: false });
    await expectError(db.rpc(pl, 'arcade_secret_start', { p_secret: 'bside', p_game: 'bside.neon.easy' }), 'locked');
    const r = await splay(pl, 'bside', 'bside.chill.easy', 900, { clear: true, fc: true });
    expect(r.data.cleared.chill).toEqual(['easy']);
    expect(r.data.fc.chill).toEqual(['easy']);
    expect(r.paid).toBe(3);
    const n = await db.rpc(pl, 'arcade_secret_start', { p_secret: 'bside', p_game: 'bside.neon.easy' });
    expect(n.session).toBeTruthy();
    // every song full-combo'd on Expert: a golden jukebox
    for (const s of ['chill', 'neon', 'funk', 'pixel', 'boss']) {
      await db.sql(`update arcade_secret_state set data = jsonb_set(data, '{cleared,${s}}', '["hard"]') where player_id = $1 and secret = 'bside'`, [pl]);
    }
    expect((await db.rpc(pl, 'arcade_secret_start', { p_secret: 'bside', p_game: 'bside.after.expert' })).session).toBeTruthy();
    await db.sql(`update arcade_secret_state set data = jsonb_set(data, '{fc}', '{"chill": ["expert"], "neon": ["expert"], "funk": ["expert"], "pixel": ["expert"]}') where player_id = $1 and secret = 'bside'`, [pl]);
    const last = await splay(pl, 'bside', 'bside.boss.expert', 900, { clear: true, fc: true });
    expect(last.data.gold).toBe(true);
    expect((await db.rpc(pl, 'arcade_secrets_me', {})).found.sort()).toEqual(['backroom', 'bside', 'founder']);
  });
});

describe('admin.landvas.app → Arcade secrets', () => {
  it('is staff-only', async () => {
    await expectError(db.rpc(pl, 'admin_arcade_secrets', {}), 'forbidden');
    await expectError(db.rpc(pl, 'admin_arcade_secret_save', { p_id: 'founder', p_cfg: {} }), 'forbidden');
  });
  it('lists every secret with its recipe, numbers and finders, and the hall’s floor plan', async () => {
    const r = await db.rpc(ad, 'admin_arcade_secrets', {});
    expect(r.secrets.map((s: any) => s.id)).toEqual(['mirror', 'founder', 'backroom', 'bside']);
    const f = r.secrets.find((s: any) => s.id === 'founder');
    expect(f.cfg.shape).toHaveLength(5);
    expect(f.stats.finders).toBe(1);
    expect(f.stats.recent[0].player.username).toBe('sec_player');
    expect(r.secrets.find((s: any) => s.id === 'bside').stats.ink).toBeGreaterThanOrEqual(750);
    const snake = r.cabinets.find((c: any) => c.id === 'snake');
    expect(snake.cell).toEqual([0, 0]);
    expect(r.cabinets.find((c: any) => c.id === 'racer').cell).toEqual([2, 3]);
  });
  it('saves a checked recipe (and refuses a broken one), audited', async () => {
    const cur = (await db.rpc(ad, 'admin_arcade_secrets', {})).secrets.find((s: any) => s.id === 'backroom').cfg;
    await expectError(db.rpc(ad, 'admin_arcade_secret_save', { p_id: 'backroom', p_cfg: { ...cur, zone: 'nowhere' } }), 'invalid_config');
    await expectError(db.rpc(ad, 'admin_arcade_secret_save', { p_id: 'backroom', p_cfg: { ...cur, ink_mult: 99 } }), 'invalid_config');
    const r = await db.rpc(ad, 'admin_arcade_secret_save', { p_id: 'backroom', p_cfg: { ...cur, zone: 'center', goes: 3, bounty: 900 } });
    expect(r.secrets.find((s: any) => s.id === 'backroom').cfg).toMatchObject({ zone: 'center', goes: 3, bounty: 900 });
    const audit = await db.sql(`select count(*)::int n from audit_logs where action = 'arcade_secret.save'`);
    expect(audit[0].n).toBeGreaterThan(0);
  });
  it('a daily cap holds Ink to that many a day when uncapped is off', async () => {
    const cur = (await db.rpc(ad, 'admin_arcade_secrets', {})).secrets.find((s: any) => s.id === 'founder').cfg;
    await db.rpc(ad, 'admin_arcade_secret_save', { p_id: 'founder', p_cfg: { ...cur, uncapped: false, daily_cap: 8 } });
    const r = await splay(pl, 'founder', 'landgrab', 5000);
    expect(r.paid).toBe(2); // 6 already paid today
    await db.rpc(ad, 'admin_arcade_secret_save', { p_id: 'founder', p_cfg: { ...cur, uncapped: true, daily_cap: 0 } });
  });
  it('can give a secret to a player or take it away', async () => {
    await db.rpc(ad, 'admin_arcade_secret_finder', { p_id: 'bside', p_player: ow, p_found: true });
    expect((await db.rpc(ow, 'arcade_secrets_me', {})).found).toEqual(['bside']);
    await db.rpc(ad, 'admin_arcade_secret_finder', { p_id: 'mirror', p_player: ow, p_found: true });
    expect((await db.rpc(ow, 'arcade_mirror_get', {})).found).toBe(true);
    await db.rpc(ad, 'admin_arcade_secret_finder', { p_id: 'bside', p_player: ow, p_found: false });
    await db.rpc(ad, 'admin_arcade_secret_finder', { p_id: 'mirror', p_player: ow, p_found: false });
    expect((await db.rpc(ow, 'arcade_secrets_me', {})).found).toEqual([]);
  });
  it('switching a secret off hides it from its finders', async () => {
    const cur = (await db.rpc(ad, 'admin_arcade_secrets', {})).secrets.find((s: any) => s.id === 'founder').cfg;
    await db.rpc(ad, 'admin_arcade_secret_save', { p_id: 'founder', p_cfg: { ...cur, enabled: false } });
    expect((await db.rpc(pl, 'arcade_secrets_me', {})).found).not.toContain('founder');
    expect(await db.rpc(pl, 'arcade_secret_get', { p_secret: 'founder' })).toEqual({ found: false });
    await db.rpc(ad, 'admin_arcade_secret_save', { p_id: 'founder', p_cfg: { ...cur, enabled: true } });
  });
});
