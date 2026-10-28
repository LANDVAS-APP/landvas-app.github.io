// v0.14: free anonymous PvP minigames in rounds, minigame performance bonuses,
// minigame/PvP wins in the live feed, and per-player minigame stats for staff.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
const svc = { role: 'service_role' } as const;
let owner: string, a: string, b: string, c: string, kid: string;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const rounds = (scores: number[], quality = 80, time = 5000) => scores.map((score) => ({ score, time_ms: time, quality, summary: {} }));
const backdate = () => db.sql(`update pvp_runs set started_at = now() - interval '60 seconds' where finished_at is null`);
const finish = (match: string, player: string, r: unknown[], valid = true) =>
  db.rpc(svc, 'svc_pvp_finish', { p_match_id: match, p_player_id: player, p_result: { valid, rounds: r, flags: [] } });
const pvpCfg = async () => (await db.rpc(owner, 'admin_config_get')).config.pvp.value;
const setPvp = async (patch: (v: any) => any) => db.rpc(owner, 'admin_config_set', { p_key: 'pvp', p_value: patch(await pvpCfg()) });

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('pvpowner');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner'), ($1, 'admin') on conflict do nothing`, [owner]);
  a = await db.newPlayer('rival_a');
  b = await db.newPlayer('rival_b');
  c = await db.newPlayer('rival_c');
  kid = await db.newPlayer('brand_new');
  // accounts must be a day old to earn from PvP: age everyone but the newcomer
  await db.sql(`update players set created_at = now() - interval '3 days' where id <> $1`, [kid]);
});
afterAll(() => db.close());

describe('PvP minigames', () => {
  it('are free: nobody stakes Ink, and the rival is anonymous', async () => {
    const before = await ink(a);
    const s = await db.rpc(a, 'pvp_play', { p_game: 'forgery', p_idempotency_key: 'pvp-match-key-a-0001' });
    expect(s.rounds).toBe(3);
    expect(s.matched).toBe(false);
    expect(await ink(a)).toBe(before);
    // b is paired with a's open match: same boards
    const t = await db.rpc(b, 'pvp_play', { p_game: 'forgery', p_idempotency_key: 'pvp-match-key-b-0001' });
    expect(t.match_id).toBe(s.match_id);
    expect(t.seed).toBe(s.seed);
    expect(t.matched).toBe(true);
    await backdate();
    const ra = await finish(s.match_id, a, rounds([300, 500, 200]));
    expect(ra.status).toBe('waiting');
    expect(ra.rival).toBeNull(); // nothing about the rival until it's decided
    const rb = await finish(s.match_id, b, rounds([400, 450, 300]));
    expect(rb.status).toBe('done');
    expect(rb.result).toBe('won'); // b took rounds 1 and 3
    expect(rb.per_round).toEqual(['you', 'rival', 'you']);
    expect(rb.rival.name).toBe('Anonymous rival');
    expect(JSON.stringify(rb)).not.toContain('rival_a');
    expect(JSON.stringify(rb)).not.toContain(a);
    expect(rb.you.ink).toBe(10); // the default win pays 10 Ink
    const lobby = await db.rpc(a, 'pvp_lobby');
    const m = lobby.matches.find((x: any) => x.match_id === s.match_id);
    expect(m.result).toBe('lost');
    expect(JSON.stringify(lobby)).not.toContain('rival_b');
    expect(lobby.record.lost).toBe(1);
  });

  it('the operator sets the win Ink, per-round Ink, draws and rounds', async () => {
    await setPvp((v) => ({ ...v, games: { ...v.games, turfwars: { ...v.games.turfwars, rounds: 2, win_ink: 25, draw_ink: 4, round_win_ink: [3, 6] } } }));
    const s = await db.rpc(a, 'pvp_play', { p_game: 'turfwars', p_idempotency_key: 'pvp-match-key-a-0002' });
    expect(s.rounds).toBe(2);
    const t = await db.rpc(c, 'pvp_play', { p_game: 'turfwars', p_idempotency_key: 'pvp-match-key-c-0002' });
    expect(t.match_id).toBe(s.match_id);
    await backdate();
    const before = await ink(a);
    await finish(s.match_id, a, rounds([500, 150]));
    const r = await finish(s.match_id, c, rounds([400, 200]));
    // one round each: equal rounds, a has the higher total → a wins and also takes round 1's Ink
    expect(r.result).toBe('lost');
    expect(r.you.ink).toBe(6); // c took round 2
    expect(await ink(a)).toBe(before + 25 + 3);
    // an exact dead heat pays the draw Ink to both
    const s2 = await db.rpc(b, 'pvp_play', { p_game: 'turfwars', p_idempotency_key: 'pvp-match-key-b-0003' });
    const t2 = await db.rpc(c, 'pvp_play', { p_game: 'turfwars', p_idempotency_key: 'pvp-match-key-c-0003' });
    expect(t2.match_id).toBe(s2.match_id);
    await backdate();
    await finish(s2.match_id, b, rounds([300, 300]));
    const d = await finish(s2.match_id, c, rounds([300, 300]));
    expect(d.result).toBe('draw');
    expect(d.you.ink).toBe(4);
    await expectError(setPvp((v) => ({ ...v, games: { ...v.games, turfwars: { ...v.games.turfwars, win_ink: -1 } } })), 'invalid_pvp_config');
  });

  it('never pairs the same two players again within the cooldown', async () => {
    // a and c just played turfwars: c's next turfwars can't land in a's new match
    const s = await db.rpc(a, 'pvp_play', { p_game: 'turfwars', p_idempotency_key: 'pvp-match-key-a-0004' });
    const t = await db.rpc(c, 'pvp_play', { p_game: 'turfwars', p_idempotency_key: 'pvp-match-key-c-0004' });
    expect(t.match_id).not.toBe(s.match_id);
    await backdate();
    await finish(s.match_id, a, rounds([1, 1]));
    await finish(t.match_id, c, rounds([1, 1]));
  });

  it('pays nothing to new accounts, sloppy runs, or wins over a rival who never played', async () => {
    // a brand-new account wins but earns nothing
    const s = await db.rpc(a, 'pvp_play', { p_game: 'pixelrecall', p_idempotency_key: 'pvp-match-key-a-0005' });
    const t = await db.rpc(kid, 'pvp_play', { p_game: 'pixelrecall', p_idempotency_key: 'pvp-match-key-k-0005' });
    expect(t.match_id).toBe(s.match_id);
    await backdate();
    await finish(s.match_id, a, rounds([10, 10, 10]));
    const r = await finish(s.match_id, kid, rounds([500, 500, 500]));
    expect(r.result).toBe('won');
    expect(r.you.ink).toBe(0);
    expect(r.you.reward.withheld).toBe('account_too_new');
    // a winner whose play is under the quality bar earns nothing
    const f = await db.newPlayer('rival_f'), h = await db.newPlayer('rival_h');
    await db.sql(`update players set created_at = now() - interval '3 days' where id in ($1, $2)`, [f, h]);
    const s2 = await db.rpc(f, 'pvp_play', { p_game: 'pixelrecall', p_idempotency_key: 'pvp-match-key-f-0006' });
    const t2 = await db.rpc(h, 'pvp_play', { p_game: 'pixelrecall', p_idempotency_key: 'pvp-match-key-h-0006' });
    expect(t2.match_id).toBe(s2.match_id);
    await backdate();
    await finish(s2.match_id, f, rounds([10, 10, 10], 10));
    const r2 = await finish(t2.match_id, h, rounds([20, 20, 20], 20));
    expect(r2.result).toBe('won');
    expect(r2.you.reward.withheld).toBe('below_quality_bar');
    // beating a run that couldn't be verified pays nothing either, and abandoned matches take no one else
    const d = await db.newPlayer('rival_d'), e = await db.newPlayer('rival_e');
    await db.sql(`update players set created_at = now() - interval '3 days' where id in ($1, $2)`, [d, e]);
    const s3 = await db.rpc(d, 'pvp_play', { p_game: 'paletteclash', p_idempotency_key: 'pvp-match-key-d-0007' });
    const t3 = await db.rpc(e, 'pvp_play', { p_game: 'paletteclash', p_idempotency_key: 'pvp-match-key-e-0007' });
    expect(t3.match_id).toBe(s3.match_id);
    await backdate();
    await finish(s3.match_id, d, [], false);
    const r3 = await finish(t3.match_id, e, rounds([700, 700, 700]));
    expect(r3.result).toBe('won');
    expect(r3.you.reward.withheld).toBe('rival_did_not_play');
  });

  it('a run claiming more time than really passed is void, and validators can’t be called by players', async () => {
    const s = await db.rpc(b, 'pvp_play', { p_game: 'forgery', p_idempotency_key: 'pvp-match-key-b-0008' });
    const r = await db.rpc(svc, 'svc_pvp_finish', { p_match_id: s.match_id, p_player_id: b, p_result: { valid: true, rounds: rounds([600, 600, 600], 100, 900000), flags: [] } });
    expect(r.you.valid).toBe(false);
    await expectError(db.rpc(b, 'svc_pvp_finish', { p_match_id: s.match_id, p_player_id: b, p_result: {} }), 'permission denied');
    await expectError(db.rpc(a, 'pvp_play', { p_game: 'nope', p_idempotency_key: 'pvp-match-key-a-0009' }), 'invalid_game');
  });

  it('bonuses reward your own play, and the daily limit caps paid matches', async () => {
    await setPvp((v) => ({ ...v, daily_rewarded_matches: 100, games: { ...v.games, forgery: { ...v.games.forgery, bonuses: [{ type: 'all', min_pct: 90, ink: 7 }] } } }));
    const p = await db.newPlayer('bonus_rival');
    await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [p]);
    const s = await db.rpc(p, 'pvp_play', { p_game: 'forgery', p_idempotency_key: 'pvp-match-key-p-0010' });
    await backdate();
    const before = await ink(p);
    const r = await finish(s.match_id, p, rounds([600, 600, 600], 95));
    expect(r.you.bonus.paid).toBe(7);
    expect(await ink(p)).toBe(before + 7);
    await setPvp((v) => ({ ...v, daily_rewarded_matches: 1 }));
    const s2 = await db.rpc(p, 'pvp_play', { p_game: 'forgery', p_idempotency_key: 'pvp-match-key-p-0011' });
    await backdate();
    const r2 = await finish(s2.match_id, p, rounds([600, 600, 600], 95));
    expect(r2.you.bonus.paid).toBe(0);
    expect(r2.you.bonus.withheld).toBe('daily_limit');
  });

  it('staff see who played whom and pairs that keep meeting', async () => {
    const adm = await db.rpc(owner, 'admin_pvp');
    expect(adm.recent.length).toBeGreaterThan(3);
    expect(adm.recent.some((m: any) => m.players?.some((x: any) => x.player.username === 'rival_a'))).toBe(true);
    await expectError(db.rpc(a, 'admin_pvp'), 'forbidden');
  });

  it('PvP wins show in the live feed', async () => {
    const feed = await db.rpc(a, 'feed_recent', { p_limit: 100 });
    const wins = feed.filter((e: any) => e.kind === 'pvp');
    expect(wins.length).toBeGreaterThan(0);
    expect(wins[0].data.game).toBeTruthy();
    expect(JSON.stringify(wins[0].data)).not.toMatch(/rival_|player_id/);
  });
});

describe('minigame performance bonuses', () => {
  let p: string;
  const G = { gx: 2_200_000, gy: 1_500_000 };
  let level = 0;
  const start = () => db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: ++level, p_gx: G.gx, p_gy: G.gy });
  const result = (quality: number[], mask?: boolean[]) => ({
    valid: true, passed: (mask ?? quality.map(() => true)).every(Boolean), score: 500, stars: 3, flags: [], suspicious: false, min_duration_ms: 12000,
    rounds_passed: (mask ?? quality.map(() => true)).filter(Boolean).length, rounds_total: quality.length, rounds_mask: mask ?? quality.map(() => true), rounds_quality: quality,
  });

  beforeAll(async () => {
    p = await db.newPlayer('bonus_painter');
    await db.rpc(p, 'claim_starter_plot', { p_gx: G.gx, p_gy: G.gy });
    await db.sql(`update world_plots set plot_type = 'clay', rarity = 'common', level = 1 where gx = $1 and gy = $2`, [G.gx, G.gy]);
    const cfg = (await db.rpc(owner, 'admin_config_get')).config.minigames.value;
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: { ...cfg, limit_paid_runs: false, ink_multiplier: 1, games: { ...cfg.games, sculptor: {
      ...cfg.games.sculptor, rounds: 3, level_ink: [10], round_ink: [0, 0, 0], plot_level_bonus: 0, ink_multiplier: 1, boost: null,
      bonuses: [
        { type: 'round', min_pct: 75, ink: 1 }, { type: 'round', min_pct: 90, ink: 3 },
        { type: 'all', min_pct: 90, ink: 5 }, { type: 'count', count: 2, min_pct: 95, ink: 2 }, { type: 'average', min_pct: 85, ink: 4 },
      ] } } } });
  });

  async function play(quality: number[], mask?: boolean[]) {
    const s = await start();
    await db.sql(`update minigame_sessions set started_at = now() - interval '30 seconds' where id = $1`, [s.session_id]);
    return db.rpc(svc, 'svc_finish_minigame', { p_session_id: s.session_id, p_result: result(quality, mask) });
  }

  it('pays round tiers, all-rounds, N-rounds and average bonuses, with a breakdown', async () => {
    const mult = Number((await db.sql(`select ink_reward_multiplier m from plot_rarities where id = 'common'`))[0].m);
    // 96, 97, 92: three 90%+ rounds (3 each), all ≥ 90 (5), two ≥ 95 (2), average ≥ 85 (4) — plus the level's 10
    const r = await play([96, 97, 92]);
    expect(r.rewards.bonus_ink).toBe(Math.floor((9 + 5 + 2 + 4) * mult));
    expect(r.rewards.ink).toBe(Math.floor((10 + 20) * mult));
    expect(r.rewards.bonuses.map((h: any) => h.type).sort()).toEqual(['all', 'average', 'count', 'round', 'round', 'round']);
    // 80, 70, 95: round tiers 1 + 0 + 3; not all ≥ 90; one ≥ 95; average 81.7 < 85
    const r2 = await play([80, 70, 95]);
    expect(r2.rewards.bonus_ink).toBe(Math.floor(4 * mult));
    // a failed round pays no round bonus and no level bonuses
    const r3 = await play([99, 99, 40], [true, true, false]);
    expect(r3.passed).toBe(false);
    expect(r3.rewards.bonus_ink).toBe(Math.floor((3 + 3 + 2) * mult));
  });

  it('rejects broken bonus rules', async () => {
    const cfg = (await db.rpc(owner, 'admin_config_get')).config.minigames.value;
    const bad = (rule: unknown) => db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: { ...cfg, games: { ...cfg.games, sculptor: { ...cfg.games.sculptor, bonuses: [rule] } } } });
    await expectError(bad({ type: 'round', min_pct: 120, ink: 1 }), 'invalid_bonus_rules');
    await expectError(bad({ type: 'magic', min_pct: 50, ink: 1 }), 'invalid_bonus_rules');
    await expectError(bad({ type: 'count', min_pct: 50, ink: 1 }), 'invalid_bonus_rules');
  });

  it('cleared levels show in the live feed (not every run)', async () => {
    const feed = await db.rpc(a, 'feed_recent', { p_limit: 100 });
    const mg = feed.filter((e: any) => e.kind === 'minigame' && e.player.username === 'bonus_painter');
    expect(mg).toHaveLength(1);
    expect(mg[0].data.game).toBe('sculptor');
  });

  it('staff see exactly how a player earns', async () => {
    const st = await db.rpc(owner, 'admin_player_minigames', { p_player_id: p });
    const sc = st.games.find((g: any) => g.game === 'sculptor');
    expect(sc.plays).toBe(3);
    expect(sc.levels_cleared).toBe(2);
    expect(Number(sc.avg_clear_ms)).toBe(12000);
    expect(Number(sc.avg_quality)).toBeGreaterThan(80);
    expect(Number(sc.bonus_ink)).toBeGreaterThan(0);
    const last = st.sessions[0];
    expect(last.quality).toEqual([99, 99, 40]);
    expect(last.breakdown.bonuses.length).toBe(3);
    expect(st.ink_sources.find((x: any) => x.reason === 'minigame').total).toBeGreaterThan(0);
    expect(st.plots[0].game).toBe('sculptor');
    const pv = await db.rpc(owner, 'admin_player_minigames', { p_player_id: a });
    expect(pv.pvp.record.matches).toBeGreaterThan(2);
    expect(pv.pvp.rivals.length).toBeGreaterThan(0);
    await expectError(db.rpc(p, 'admin_player_minigames', { p_player_id: p }), 'forbidden');
  });
});

describe('retiring staked duels', () => {
  const old = new TestDb();
  afterAll(() => old.close());
  it('hands every unsettled stake back', async () => {
    await old.init({ ungated: true, skip: ['20261028000028_pvp_bonuses_stats.sql'] });
    const x = await old.newPlayer('old_dueler');
    await old.giveInk(x, 500);
    await old.sql(`update game_config set value = value || '{"enabled": true}' where key = 'duels'`);
    await old.rpc(x, 'duel_create', { p_game: 'forgery', p_stake: 120, p_idempotency_key: 'old-duel-1' });
    expect(Number((await old.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [x]))[0].amount)).toBe(380);
    await old.sql(fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261028000028_pvp_bonuses_stats.sql'), 'utf8'));
    expect(Number((await old.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [x]))[0].amount)).toBe(500);
    expect((await old.sql(`select status from duels`))[0].status).toBe('cancelled');
  });
});
