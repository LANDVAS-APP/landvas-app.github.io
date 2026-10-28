// v0.6 minigames: new games/plot types, 5 rounds, per-plot levels, per-game controls.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let owner: string, p: string;
const A = { gx: 2_100_000, gy: 1_600_000 }, B = { gx: 2_100_001, gy: 1_600_000 };

async function win(uid: string, gx: number, gy: number, game: string, level: number) {
  const s = await db.rpc(uid, 'start_minigame', { p_game: game, p_level: level, p_gx: gx, p_gy: gy });
  return db.rpc({ role: 'service_role' }, 'svc_finish_minigame', {
    p_session_id: s.session_id,
    p_result: { valid: true, passed: true, score: 400, stars: 3, flags: [], suspicious: false, min_duration_ms: 0 },
  });
}

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('mgowner');
  await db.rpc(owner, 'claim_owner', { p_code: 'x' }).catch(() => {});
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner'), ($1, 'admin') on conflict do nothing`, [owner]);
  p = await db.newPlayer('sculptfan');
  await db.rpc(p, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
  await db.giveInk(p, 5000);
  await db.rpc(p, 'acquire_plot', { p_gx: B.gx, p_gy: B.gy, p_idempotency_key: 'minigames-v2-plot-b' });
  // both plots host the new Sculptor game
  await db.sql(`update world_plots set plot_type = 'clay' where (gx, gy) in (($1, $2), ($3, $4))`, [A.gx, A.gy, B.gx, B.gy]);
});
afterAll(() => db.close());

describe('minigames v2', () => {
  it('there are eight games on eight plot types', async () => {
    const w = await db.rpc(null, 'world_config');
    expect(w.plot_types.map((t: any) => t.minigame).sort()).toEqual(['colorburst', 'lightlines', 'memorymural', 'mirrorline', 'patternshift', 'rollermural', 'sculptor', 'tracecraft']);
  });

  it('levels have five rounds, every plot climbs its own levels, and a beaten level can’t be replayed', async () => {
    const s = await db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: 1, p_gx: A.gx, p_gy: A.gy });
    expect(s.rounds).toBe(5);
    expect((await db.rpc({ role: 'service_role' }, 'svc_get_session', { p_session_id: s.session_id })).rounds).toBe(5);
    await win(p, A.gx, A.gy, 'sculptor', 1);
    // plot A unlocked level 2; plot B (same game) is still on level 1
    await db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: 2, p_gx: A.gx, p_gy: A.gy });
    await expectError(db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: 1, p_gx: A.gx, p_gy: A.gy }), 'level_already_beaten');
    await expectError(db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: 2, p_gx: B.gx, p_gy: B.gy }), 'level_locked');
    const prog = await db.rpc(p, 'my_plot_progress');
    expect(prog[`${A.gx}_${A.gy}`].highest_level).toBe(1);
    expect(prog[`${B.gx}_${B.gy}`].highest_level).toBe(0);
  });

  it('the operator sets max level, rounds and Ink per game', async () => {
    const cfg = (await db.rpc(owner, 'admin_config_get')).config.minigames.value;
    const next = { ...cfg, games: { ...cfg.games, sculptor: { ...cfg.games.sculptor, max_level: 1, rounds: 3, level_ink: [35], plot_level_bonus: 0 } } };
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: next });
    await expectError(db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: 2, p_gx: A.gx, p_gy: A.gy }), 'plot_maxed'); // A beat the only level
    const r = await win(p, B.gx, B.gy, 'sculptor', 1);
    // 35 Ink for completing the level (rounds pay nothing unless set; the score doesn't add Ink), times the rarity bonus
    const mult = Number(r.rewards.multiplier);
    expect(r.rewards.ink).toBe(Math.floor(35 * mult));
    expect(r.rewards.rounds).toBe(3);
    // a beaten level can't be replayed
    await expectError(db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: 1, p_gx: B.gx, p_gy: B.gy }), 'plot_maxed');
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: { ...next, games: { ...next.games, sculptor: { ...next.games.sculptor, rounds: 11 } } } }), 'invalid_minigame_config');
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: cfg });
  });

  it('rounds pay their own Ink; the level Ink only comes with clearing every round', async () => {
    const cfg = (await db.rpc(owner, 'admin_config_get')).config.minigames.value;
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: { ...cfg, games: { ...cfg.games, sculptor: { ...cfg.games.sculptor, level_ink: [20, 30, 40], round_ink: [1, 2, 3, 4, 5], plot_level_bonus: 0 } } } });
    const before = (await db.rpc(p, 'my_plot_progress'))[`${B.gx}_${B.gy}`].highest_level;
    const s = await db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: before + 1, p_gx: B.gx, p_gy: B.gy });
    const r = await db.rpc({ role: 'service_role' }, 'svc_finish_minigame', {
      p_session_id: s.session_id,
      p_result: { valid: true, passed: false, score: 400, stars: 0, flags: [], suspicious: false, min_duration_ms: 0, rounds_passed: 4, rounds_total: 5 },
    });
    expect(r.passed).toBe(false);
    expect(r.rewards.rounds_cleared).toBe(4);
    // 4 of 5 rounds cleared (no mask → rounds 1–4): 1+2+3+4 round Ink, and no level Ink
    expect(r.rewards.ink).toBe(Math.floor(10 * Number(r.rewards.multiplier)));
    expect((await db.rpc(p, 'my_plot_progress'))[`${B.gx}_${B.gy}`].highest_level).toBe(before);
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: cfg });
  });

  it('a boosted game pays more until the boost ends, and every game has a seeded level table', async () => {
    const cfg = (await db.rpc(owner, 'admin_config_get')).config.minigames.value;
    expect(cfg.games.tracecraft.level_ink.length).toBe(60);
    expect(cfg.games.tracecraft.level_ink[0]).toBeGreaterThan(0);
    const until = new Date(Date.now() + 3600_000).toISOString();
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: { ...cfg, games: { ...cfg.games, sculptor: { ...cfg.games.sculptor, level_ink: [10], round_ink: [0, 0, 0, 0, 0], plot_level_bonus: 0, boost: { multiplier: 3, ends_at: until } } } } });
    const r = await win(p, B.gx, B.gy, 'sculptor', await db.nextLevel(p, B.gx, B.gy));
    expect(Number(r.rewards.boost)).toBe(3);
    expect(r.rewards.ink).toBe(Math.floor(10 * Number(r.rewards.multiplier)));
    expect(Number(r.rewards.multiplier)).toBeGreaterThanOrEqual(3);
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: { ...cfg, games: { ...cfg.games, sculptor: { ...cfg.games.sculptor, boost: { multiplier: 99 } } } } }), 'invalid_minigame_config');
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: { ...cfg, games: { ...cfg.games, sculptor: { ...cfg.games.sculptor, level_ink: [5, 'x'] } } } }), 'invalid_minigame_config');
    // an expired boost no longer counts
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: { ...cfg, games: { ...cfg.games, sculptor: { ...cfg.games.sculptor, level_ink: [10], plot_level_bonus: 0, boost: { multiplier: 3, ends_at: new Date(Date.now() - 1000).toISOString() } } } } });
    expect(Number((await win(p, B.gx, B.gy, 'sculptor', await db.nextLevel(p, B.gx, B.gy))).rewards.boost)).toBe(1);
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: cfg });
  });

  it('each round position pays its own Ink, and paid runs can be unlimited', async () => {
    const cfg = (await db.rpc(owner, 'admin_config_get')).config.minigames.value;
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: { ...cfg, limit_paid_runs: false, daily_rewarded_wins_per_game: 0,
      games: { ...cfg.games, sculptor: { ...cfg.games.sculptor, level_ink: [10], plot_level_bonus: 0, round_ink: [0, 0, 5, 10, 100] } } } });
    const lv = (await db.rpc(p, 'my_plot_progress'))[`${B.gx}_${B.gy}`].highest_level + 1;
    const s = await db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: Math.min(lv, 60), p_gx: B.gx, p_gy: B.gy });
    // rounds 1, 2 and 5 cleared: round Ink 0 + 0 + 100, no level Ink (the level isn't complete)
    const r = await db.rpc({ role: 'service_role' }, 'svc_finish_minigame', {
      p_session_id: s.session_id,
      p_result: { valid: true, passed: false, score: 300, stars: 0, flags: [], suspicious: false, min_duration_ms: 0, rounds_passed: 3, rounds_total: 5, rounds_mask: [true, true, false, false, true] },
    });
    expect(r.rewards.unlimited).toBe(true);
    expect(r.rewards.rewarded_left).toBeNull();
    expect(Math.abs(r.rewards.ink - 100 * Number(r.rewards.multiplier))).toBeLessThanOrEqual(1); // paid even with a daily cap of 0
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: { ...cfg, games: { ...cfg.games, sculptor: { ...cfg.games.sculptor, round_ink: [-1] } } } }), 'invalid_minigame_config');
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: cfg });
  });

  it('level Ink 1 with 3 rounds at 0 Ink each: rounds pay nothing, completing the level pays 1', async () => {
    const cfg = (await db.rpc(owner, 'admin_config_get')).config.minigames.value;
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: { ...cfg, limit_paid_runs: false,
      games: { ...cfg.games, sculptor: { ...cfg.games.sculptor, rounds: 3, level_ink: [1], round_ink: [0, 0, 0], plot_level_bonus: 0, ink_multiplier: 1, boost: undefined } } } });
    await db.sql(`update world_plots set rarity = 'common', level = 1 where gx = $1 and gy = $2`, [B.gx, B.gy]);
    const lv = await db.nextLevel(p, B.gx, B.gy);
    const s = await db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: lv, p_gx: B.gx, p_gy: B.gy });
    const part = await db.rpc({ role: 'service_role' }, 'svc_finish_minigame', { p_session_id: s.session_id,
      p_result: { valid: true, passed: false, score: 100, stars: 0, flags: [], suspicious: false, min_duration_ms: 0, rounds_passed: 2, rounds_total: 3, rounds_mask: [true, true, false] } });
    expect(part.rewards.ink).toBe(0);
    const s2 = await db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: lv, p_gx: B.gx, p_gy: B.gy });
    const full = await db.rpc({ role: 'service_role' }, 'svc_finish_minigame', { p_session_id: s2.session_id,
      p_result: { valid: true, passed: true, score: 300, stars: 3, flags: [], suspicious: false, min_duration_ms: 0, rounds_passed: 3, rounds_total: 3, rounds_mask: [true, true, true] } });
    expect(full.rewards.ink).toBe(Math.floor(1 * Number(full.rewards.multiplier)));
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: cfg });
  });

  it('a new owner of a plot starts from level 1', async () => {
    await db.rpc(owner, 'admin_release_plot', { p_gx: A.gx, p_gy: A.gy, p_reason: 'test release' });
    const q = await db.newPlayer('newowner');
    await db.placeAt(q, A.gx, A.gy);
    await db.rpc(q, 'claim_starter_plot', { p_gx: A.gx, p_gy: A.gy });
    await db.sql(`update world_plots set plot_type = 'clay' where gx = $1 and gy = $2`, [A.gx, A.gy]);
    await expectError(db.rpc(q, 'start_minigame', { p_game: 'sculptor', p_level: 2, p_gx: A.gx, p_gy: A.gy }), 'level_locked');
  });
});
