// v0.3: the owner claim, plot names, the players directory, the joystick tank,
// GPS snap-back and operator-tunable minigame earnings.
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError, cellCenter } from '../helpers/db';

const db = new TestDb();
afterAll(() => db.close());
const TEST_CODE = 'LV-TEST2-CODE3-FOR4S-QLTST-ABCDE';
const sha = (s: string) => crypto.createHash('sha256').update(s.toUpperCase().replace(/[^A-Z0-9]/g, ''), 'utf8').digest('hex');

// metres per degree of longitude at a latitude (good enough for short test hops)
const east = (p: { lng: number; lat: number }, metres: number) => ({ lng: p.lng + metres / (111320 * Math.cos((p.lat * Math.PI) / 180)), lat: p.lat });
function dist(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const R = 6371008.8, r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

beforeAll(async () => {
  await db.init();
});

describe('owner claim', () => {
  let a: string, b: string;
  beforeAll(async () => {
    a = await db.newPlayer('operator');
    b = await db.newPlayer('intruder');
    await db.sql(`update private.owner_claim set code_sha256 = $1`, [sha(TEST_CODE)]);
  });

  it('nobody is an owner until the code is used', async () => {
    expect(await db.rpc(null, 'owner_status')).toEqual({ claimed: false, is_owner: false });
    await expectError(db.rpc(b, 'admin_overview'), 'forbidden');
  });

  it('a wrong code fails without raising, and is logged', async () => {
    const r = await db.rpc(b, 'claim_owner', { p_code: 'LV-AAAAA-BBBBB-CCCCC-DDDDD-EEEEE' });
    expect(r).toEqual({ ok: false, reason: 'invalid_code' });
    const ev = await db.sql(`select count(*)::int n from private.security_events where player_id = $1 and kind = 'owner_claim_failed'`, [b]);
    expect(ev[0].n).toBe(1);
  });

  it('the right code (any spacing or case) makes the caller the one owner', async () => {
    const r = await db.rpc(a, 'claim_owner', { p_code: ` ${TEST_CODE.toLowerCase().replace(/-/g, ' ')} ` });
    expect(r.ok).toBe(true);
    expect(r.state.roles).toContain('owner');
    expect(await db.rpc(a, 'owner_status')).toEqual({ claimed: true, is_owner: true });
    const ov = await db.rpc(a, 'admin_overview');
    expect(ov.players_total).toBeGreaterThanOrEqual(2);
  });

  it('can never be claimed again, even with the code', async () => {
    expect(await db.rpc(b, 'claim_owner', { p_code: TEST_CODE })).toEqual({ ok: false, reason: 'already_claimed' });
    expect((await db.rpc(b, 'owner_status')).is_owner).toBe(false);
  });

  it('the dev self-grant flag cannot be switched on from the console', async () => {
    await expectError(db.rpc(a, 'admin_set_flag', { p_key: 'local_dev_mode', p_enabled: true }), 'flag_locked');
  });
});

describe('plot names', () => {
  let p: string, q: string;
  const H = { gx: 30000, gy: 24000 };
  beforeAll(async () => {
    p = await db.newPlayer('namer');
    q = await db.newPlayer('neighbour');
    await db.placeAt(p, H.gx, H.gy);
  });

  it('a claim can carry a name, shown on the map and in the panel', async () => {
    const r = await db.rpc(p, 'claim_starter_plot', { p_gx: H.gx, p_gy: H.gy, p_name: "  Aaron's   Corner ✨ " });
    expect(r.name).toBe("Aaron's Corner ✨");
    const rows = await db.rpc(q, 'plots_in_bbox', { p_min_gx: H.gx, p_min_gy: H.gy, p_max_gx: H.gx, p_max_gy: H.gy });
    expect(rows[0][10]).toBe("Aaron's Corner ✨");
    expect((await db.rpc(null, 'plot_details', { p_gx: H.gx, p_gy: H.gy })).name).toBe("Aaron's Corner ✨");
  });

  it('rejects links, markup, slurs and overlong names before claiming', async () => {
    await db.giveInk(p, 500);
    for (const bad of ['visit www.spam.com', 'x'.repeat(33), '<b>hi</b>', 'f u c k', 'FuuUck town', 'big sh1t', 'evil\u202Eright']) {
      await expectError(db.rpc(p, 'acquire_plot', { p_gx: H.gx + 1, p_gy: H.gy, p_idempotency_key: `bad-${bad.length}-${bad.charCodeAt(0)}`, p_name: bad }), 'invalid_plot_name');
    }
    const still = await db.sql(`select owner_id from world_plots where gx = $1 and gy = $2`, [H.gx + 1, H.gy]);
    expect(still[0]?.owner_id ?? null).toBeNull();
    // innocent words that contain short blocked words are fine
    const ok = await db.rpc(p, 'acquire_plot', { p_gx: H.gx + 1, p_gy: H.gy, p_idempotency_key: 'good-name-01', p_name: 'Classic Grapes' });
    expect(ok.name).toBe('Classic Grapes');
  });

  it('owners can rename or clear; others cannot', async () => {
    expect((await db.rpc(p, 'name_plot', { p_gx: H.gx, p_gy: H.gy, p_name: 'Sunrise Lot' })).name).toBe('Sunrise Lot');
    await expectError(db.rpc(q, 'name_plot', { p_gx: H.gx, p_gy: H.gy, p_name: 'Mine now' }), 'not_owner');
    expect((await db.rpc(p, 'name_plot', { p_gx: H.gx, p_gy: H.gy, p_name: '   ' })).name).toBeNull();
    await db.rpc(p, 'name_plot', { p_gx: H.gx, p_gy: H.gy, p_name: 'Sunrise Lot' });
  });

  it('a name never outlives its owner', async () => {
    const owner = (await db.sql(`select player_id from admin_roles where role = 'owner'`))[0].player_id;
    await db.rpc(owner, 'admin_release_plot', { p_gx: H.gx, p_gy: H.gy, p_reason: 'test release' });
    const r = await db.sql(`select name, owner_id from world_plots where gx = $1 and gy = $2`, [H.gx, H.gy]);
    expect(r[0]).toEqual({ name: null, owner_id: null });
  });
});

describe('players directory and land', () => {
  let big: string, hidden: string;
  const B = { gx: 31000, gy: 24000 };
  beforeAll(async () => {
    big = await db.newPlayer('landlord');
    hidden = await db.newPlayer('ghostly');
    await db.placeAt(big, B.gx, B.gy);
    await db.rpc(big, 'claim_starter_plot', { p_gx: B.gx, p_gy: B.gy, p_name: 'HQ' });
    await db.giveInk(big, 1000);
    for (const [i, [dx, dy]] of [[1, 0], [0, 1], [1, 1]].entries()) await db.rpc(big, 'acquire_plot', { p_gx: B.gx + dx, p_gy: B.gy + dy, p_idempotency_key: `ll-${i}-xyz` });
    await db.sql(`update profiles set is_hidden = true where id = $1`, [hidden]);
  });

  it('lists real, visible players with land and art counts — for signed-out visitors too', async () => {
    const d = await db.rpc(null, 'players_directory', { p_sort: 'land' });
    expect(d.rows[0].profile.username).toBe('landlord');
    expect(d.rows[0].plots).toBe(4);
    expect(d.rows.some((r: any) => r.profile.username === 'ghostly')).toBe(false);
    expect(d.total).toBe(d.rows.length);
    const text = JSON.stringify(d);
    expect(text).not.toMatch(/"lng"|"lat"|last_active|email|balance/);
  });

  it('searches by name and sorts', async () => {
    const s = await db.rpc(null, 'players_directory', { p_query: 'LAND' });
    expect(s.rows.map((r: any) => r.profile.username)).toEqual(['landlord']);
    const byName = await db.rpc(null, 'players_directory', { p_sort: 'name', p_limit: 60 });
    const names = byName.rows.map((r: any) => r.profile.username.toLowerCase());
    expect([...names].sort()).toEqual(names);
  });

  it("returns a player's land: canvases with relative plot shapes (names included) and rent rate — never coordinates", async () => {
    const land = await db.rpc(null, 'player_land', { p_username: 'Landlord' });
    expect(land.total_plots).toBe(4);
    expect(land.canvases.length).toBe(4);
    const cells = land.canvases.flatMap((c: any) => c.cells);
    expect(cells.find((x: any[]) => x[6] === 'HQ')).toBeTruthy();
    for (const c of cells) { expect(c[0]).toBe(0); expect(c[1]).toBe(0); }
    expect(JSON.stringify(land)).not.toMatch(new RegExp(`${B.gx}|${B.gy}|"lng"|"lat"|min_gx|center_`));
    expect(Number(land.usd_per_second)).toBeGreaterThan(0);
    await expectError(db.rpc(null, 'player_land', { p_username: 'ghostly' }), 'not_found');
  });
});

describe('joystick tank and GPS snap-back', () => {
  let j: string;
  const home = cellCenter(793600, 1576300);
  beforeAll(async () => {
    j = await db.newPlayer('joyrider');
    await db.rpc(j, 'report_position', { p_lng: home.lng, p_lat: home.lat, p_accuracy_m: 10 });
  });

  it('starts with a full tank (daily refill) and reports it', async () => {
    const ex = await db.rpc(j, 'my_explorer');
    expect(ex.joystick.seconds_left).toBe(60); // one minute a day
    expect(ex.joystick.speed_kmh).toBe(40);
    expect(ex.has_gps_fix).toBe(true);
  });

  it('moves at most the speed allows; a far request is clamped, not teleported', async () => {
    const r = await db.rpc(j, 'joystick_step', { p_lng: east(home, 30).lng, p_lat: home.lat });
    expect(r.mode).toBe('manual');
    expect(r.moved_m).toBeGreaterThan(29);
    expect(r.clamped).toBe(false);
    const far = await db.rpc(j, 'joystick_step', { p_lng: east(home, 5000).lng, p_lat: home.lat });
    expect(far.clamped).toBe(true);
    expect(dist(home, far)).toBeLessThan(30 + 45); // bucket: 4 s at 40 km/h ≈ 44 m
  });

  it('spamming requests cannot beat the speed limit', async () => {
    const before = await db.rpc(j, 'my_explorer');
    let last: any;
    for (let i = 0; i < 20; i++) last = await db.rpc(j, 'joystick_step', { p_lng: east(before, 2000).lng, p_lat: home.lat });
    // 20 back-to-back calls take far less than a second; only the drained bucket's refill is allowed
    expect(dist(before, last)).toBeLessThan(15);
  });

  it('charges the tank one second per second at full speed, and stops when empty', async () => {
    const ex = await db.rpc(j, 'my_explorer');
    expect(ex.joystick.seconds_left).toBeLessThan(60);
    expect(ex.joystick.seconds_left).toBeGreaterThan(50);
    await db.sql(`update explorers set joy_seconds = 0.5, joy_bucket_m = 1000, joy_day = now() + interval '1 day' where player_id = $1`, [j]);
    const r = await db.rpc(j, 'joystick_step', { p_lng: east(ex, 500).lng, p_lat: home.lat });
    expect(r.moved_m).toBeLessThan(6); // 0.5 s at 11.1 m/s
    expect(r.empty).toBe(true);
    const none = await db.rpc(j, 'joystick_step', { p_lng: east(ex, 600).lng, p_lat: home.lat });
    expect(none.moved_m).toBe(0);
  });

  it('a GPS fix snaps the explorer straight back — joystick moves are not jumps', async () => {
    const r = await db.rpc(j, 'report_position', { p_lng: home.lng, p_lat: home.lat, p_accuracy_m: 10 });
    expect(r.accepted).toBe(true);
    expect(r.snapped).toBe(true);
    expect(r.mode).toBe('gps');
    expect(dist(home, r)).toBeLessThan(0.5);
  });

  it('GPS jumps are still judged against the previous real fix', async () => {
    const r = await db.rpc(j, 'report_position', { p_lng: home.lng + 20, p_lat: home.lat, p_accuracy_m: 10 });
    expect(r.reanchored).toBe(true); // first far jump of the day is allowed
    const again = await db.rpc(j, 'report_position', { p_lng: home.lng - 20, p_lat: home.lat, p_accuracy_m: 10 });
    expect(again.accepted).toBe(false);
  });

  it('the joystick needs a recent GPS fix and stays on a leash around it', async () => {
    const leash = await db.newPlayer('leashed');
    await db.rpc(leash, 'report_position', { p_lng: home.lng, p_lat: home.lat, p_accuracy_m: 10 });
    // even with a big tank, it can't wander more than one tank (60 s at 40 km/h ≈ 667 m) from the player
    await db.sql(`update explorers set joy_seconds = 100000, joy_day = now() + interval '1 day', lng = $2, joy_bucket_m = 1000 where player_id = $1`, [leash, east(home, 700).lng]);
    const out = await db.rpc(leash, 'joystick_step', { p_lng: east(home, 740).lng, p_lat: home.lat });
    expect(out.moved_m).toBe(0);
    expect(out.leash).toBe(true);
    const back = await db.rpc(leash, 'joystick_step', { p_lng: east(home, 690).lng, p_lat: home.lat });
    expect(back.moved_m).toBeGreaterThan(5); // heading back toward the player is fine
    await db.sql(`update explorers set gps_at = now() - interval '1 hour' where player_id = $1`, [leash]);
    await expectError(db.rpc(leash, 'joystick_step', { p_lng: home.lng, p_lat: home.lat }), 'gps_required');
  });

  it('rewarded-ad refills are off until an ad network is connected, then idempotent', async () => {
    await db.sql(`update explorers set joy_seconds = 0, joy_day = now() + interval '1 day' where player_id = $1`, [j]);
    await expectError(db.rpc({ role: 'service_role' }, 'svc_ad_reward', { p_player_id: j, p_reward: 'joystick_refill', p_network: 'admob', p_transaction_id: 't1' }), 'ads_disabled');
    await expectError(db.rpc(j, 'svc_ad_reward', { p_player_id: j, p_reward: 'joystick_refill', p_network: 'admob', p_transaction_id: 't1' }), 'permission denied');
    await db.sql(`update feature_flags set enabled = true where key = 'rewarded_ads'`);
    expect((await db.rpc({ role: 'service_role' }, 'svc_ad_reward', { p_player_id: j, p_reward: 'joystick_refill', p_network: 'admob', p_transaction_id: 't1' })).duplicate).toBe(false);
    expect((await db.rpc({ role: 'service_role' }, 'svc_ad_reward', { p_player_id: j, p_reward: 'joystick_refill', p_network: 'admob', p_transaction_id: 't1' })).duplicate).toBe(true);
    expect((await db.rpc(j, 'my_explorer')).joystick.seconds_left).toBe(60);
    await db.sql(`update feature_flags set enabled = false where key = 'rewarded_ads'`);
  });
});

describe('operator-tunable minigame earnings', () => {
  let g: string, owner: string, game: string;
  const P = { gx: 33000, gy: 24000 };
  const win = async () => {
    const sess = await db.rpc(g, 'start_minigame', { p_game: game, p_level: await db.nextLevel(g, P.gx, P.gy), p_gx: P.gx, p_gy: P.gy });
    return db.rpc({ role: 'service_role' }, 'svc_finish_minigame', {
      p_session_id: sess.session_id,
      p_result: { valid: true, passed: true, score: 400, stars: 3, flags: [], suspicious: false, min_duration_ms: 0 },
    });
  };
  beforeAll(async () => {
    owner = (await db.sql(`select player_id from admin_roles where role = 'owner'`))[0].player_id;
    g = await db.newPlayer('earner');
    await db.placeAt(g, P.gx, P.gy);
    await db.rpc(g, 'claim_starter_plot', { p_gx: P.gx, p_gy: P.gy });
    await db.sql(`update world_plots set rarity = 'common' where gx = $1 and gy = $2`, [P.gx, P.gy]);
    game = (await db.rpc(g, 'plot_details', { p_gx: P.gx, p_gy: P.gy })).type_info.minigame;
  });

  it('global and per-game multipliers scale Ink for everyone', async () => {
    const base = (await win()).rewards.ink;
    const cfg = (await db.rpc(owner, 'admin_config_get')).config.minigames.value;
    expect(cfg.ink_multiplier).toBe(1);
    expect(cfg.games[game].ink_multiplier).toBe(1);
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: { ...cfg, ink_multiplier: 2 } });
    const doubled = (await win()).rewards.ink;
    expect(doubled).toBeGreaterThanOrEqual(base * 2 - 1);
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: { ...cfg, ink_multiplier: 1, games: { ...cfg.games, [game]: { ...cfg.games[game], ink_multiplier: 3 } } } });
    const tripled = (await win()).rewards.ink;
    expect(tripled).toBeGreaterThanOrEqual(base * 3 - 1);
    // the operator's per-level table sets Ink per cleared round
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: { ...cfg, games: { ...cfg.games, [game]: { ...cfg.games[game], level_ink: [100] } } } });
    expect((await win()).rewards.ink).toBeGreaterThanOrEqual(100);
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: cfg });
  });

  it('rejects nonsense values', async () => {
    const cfg = (await db.rpc(owner, 'admin_config_get')).config.minigames.value;
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: { ...cfg, ink_multiplier: 500 } }), 'invalid_minigame_config');
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: { ...cfg, rewards: { ...cfg.rewards, score_ink_divisor: 0 } } }), 'invalid_minigame_config');
    await expectError(db.rpc(g, 'admin_config_set', { p_key: 'minigames', p_value: cfg }), 'forbidden');
  });
});

describe('review switch', () => {
  let owner: string, artist: string;
  const H = (n: number) => n.toString(16).padStart(64, '0');
  const A = { gx: 34000, gy: 24000 };
  async function submit(uid: string, title: string, n: number, gi = 0) {
    const g = (await db.rpc(uid, 'my_groups'))[gi];
    const p = await db.rpc(uid, 'get_project', { p_project_id: g.project_id });
    const s = await db.rpc(uid, 'save_draft', {
      p_project_id: g.project_id, p_base_version_id: p.version.id,
      p_manifest: { layers: [{ id: 'layer-1', name: 'L', tiles: { [`${g.cells[0][0]}_${g.cells[0][1]}`]: H(n) } }] },
    });
    const req = await db.rpc(uid, 'request_publication', { p_project_id: g.project_id, p_version_id: s.version_id, p_title: title, p_rights_affirmed: true });
    await db.rpc(uid, 'submit_publication', { p_publication_id: req.publication_id });
    const r = await db.rpc({ role: 'service_role' }, 'svc_publication_processed', { p_publication_id: req.publication_id, p_result: { ok: true, preview_path: 'p.png', thumb_path: 't.png', screening: { provider: 'none', flagged: false } } });
    return { id: req.publication_id as string, status: r.status as string };
  }
  beforeAll(async () => {
    owner = (await db.sql(`select player_id from admin_roles where role = 'owner'`))[0].player_id;
    artist = await db.newPlayer('painter9');
    await db.placeAt(artist, A.gx, A.gy);
    await db.rpc(artist, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
    await db.giveInk(artist, 500);
    for (const [i, [dx, dy]] of [[1, 0], [0, 1], [1, 1]].entries()) await db.rpc(artist, 'acquire_plot', { p_gx: A.gx + dx, p_gy: A.gy + dy, p_idempotency_key: `rv-${i}-acq` });
    await db.placeAt(owner, A.gx + 5, A.gy);
    await db.rpc(owner, 'claim_starter_plot', { p_gx: A.gx + 5, p_gy: A.gy });
  });

  it('with reviews on, players’ art waits for review; the owner’s own art goes straight through', async () => {
    expect((await db.rpc(owner, 'admin_review_mode')).reviews).toBe(true);
    const a = await submit(artist, 'Waiting one', 1);
    expect(a.status).toBe('pending_review');
    const mine = await submit(owner, 'Owner art', 2);
    expect(mine.status).toBe('approved');
    const list = await db.rpc(owner, 'admin_pending_publications');
    expect(list.map((x: any) => x.title)).toEqual(['Waiting one']);
    await expectError(db.rpc(artist, 'admin_pending_publications'), 'forbidden');
  });

  it('turning reviews off publishes what is waiting and lets new art straight through', async () => {
    const off = await db.rpc(owner, 'admin_set_review_mode', { p_reviews: false });
    expect(off).toMatchObject({ reviews: false, mode: 'auto', approved: 1, pending: 0 });
    const st = await db.sql(`select status from artwork_publications where title = 'Waiting one'`);
    expect(st[0].status).toBe('approved');
    const b = await submit(artist, 'Instant', 3, 1);
    expect(b.status).toBe('approved');
    const jobs = await db.sql(`select count(*)::int n from private.render_jobs where kind = 'publish_publication' and status = 'queued'`);
    expect(jobs[0].n).toBeGreaterThanOrEqual(3);
    const on = await db.rpc(owner, 'admin_set_review_mode', { p_reviews: true });
    expect(on.mode).toBe('manual');
    expect((await submit(artist, 'Back to waiting', 4, 2)).status).toBe('pending_review');
    expect((await db.rpc(owner, 'admin_approve_all_pending')).approved).toBe(1);
  });
});
