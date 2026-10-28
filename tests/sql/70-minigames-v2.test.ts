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
    expect(w.plot_types.map((t: any) => t.minigame).sort()).toEqual(['colorburst', 'hueflow', 'lightlines', 'memorymural', 'mirrorline', 'patternshift', 'sculptor', 'tracecraft']);
  });

  it('levels have five rounds and every plot climbs its own levels', async () => {
    const s = await db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: 1, p_gx: A.gx, p_gy: A.gy });
    expect(s.rounds).toBe(5);
    expect((await db.rpc({ role: 'service_role' }, 'svc_get_session', { p_session_id: s.session_id })).rounds).toBe(5);
    await win(p, A.gx, A.gy, 'sculptor', 1);
    // plot A unlocked level 2; plot B (same game) is still on level 1
    await db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: 2, p_gx: A.gx, p_gy: A.gy });
    await expectError(db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: 2, p_gx: B.gx, p_gy: B.gy }), 'level_locked');
    const prog = await db.rpc(p, 'my_plot_progress');
    expect(prog[`${A.gx}_${A.gy}`].highest_level).toBe(1);
    expect(prog[`${B.gx}_${B.gy}`].highest_level).toBe(0);
  });

  it('the operator sets max level, rounds and Ink per game', async () => {
    const cfg = (await db.rpc(owner, 'admin_config_get')).config.minigames.value;
    const next = { ...cfg, games: { ...cfg.games, sculptor: { ...cfg.games.sculptor, max_level: 1, rounds: 3, base_ink: 100, ink_per_level: 0, plot_level_bonus: 0 } } };
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: next });
    await expectError(db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: 2, p_gx: A.gx, p_gy: A.gy }), 'level_locked');
    const r = await win(p, B.gx, B.gy, 'sculptor', 1);
    // 100 base + 400 score / 80 divisor = 105, times the plot's rarity bonus
    const mult = Number(r.rewards.multiplier);
    expect(r.rewards.ink).toBe(Math.floor(105 * mult));
    const s = await db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: 1, p_gx: B.gx, p_gy: B.gy });
    expect(s.rounds).toBe(3);
    await expectError(db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: { ...next, games: { ...next.games, sculptor: { ...next.games.sculptor, rounds: 11 } } } }), 'invalid_minigame_config');
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: cfg });
  });

  it('every round cleared pays its share of Ink, but only clearing all five levels up', async () => {
    const cfg = (await db.rpc(owner, 'admin_config_get')).config.minigames.value;
    await db.rpc(owner, 'admin_config_set', { p_key: 'minigames', p_value: { ...cfg, games: { ...cfg.games, sculptor: { ...cfg.games.sculptor, base_ink: 100, ink_per_level: 0, plot_level_bonus: 0 } } } });
    const before = (await db.rpc(p, 'my_plot_progress'))[`${B.gx}_${B.gy}`].highest_level;
    const s = await db.rpc(p, 'start_minigame', { p_game: 'sculptor', p_level: before + 1, p_gx: B.gx, p_gy: B.gy });
    const r = await db.rpc({ role: 'service_role' }, 'svc_finish_minigame', {
      p_session_id: s.session_id,
      p_result: { valid: true, passed: false, score: 400, stars: 0, flags: [], suspicious: false, min_duration_ms: 0, rounds_passed: 4, rounds_total: 5 },
    });
    expect(r.passed).toBe(false);
    expect(r.rewards.rounds_cleared).toBe(4);
    // (100 base + 400 / 80) × 4/5 rounds, times the plot's rarity bonus
    expect(r.rewards.ink).toBe(Math.floor((105 * 4) / 5 * Number(r.rewards.multiplier)));
    expect((await db.rpc(p, 'my_plot_progress'))[`${B.gx}_${B.gy}`].highest_level).toBe(before);
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
