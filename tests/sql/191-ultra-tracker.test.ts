// The Ultra tracker: every Ultra plot you own with today's multiplier, Phoenix stacking on the streak.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let u: string;
const give = (gx: number, gy: number, rarity: string) =>
  db.sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at) values ($1, $2, 'graphite', $3, $4, now())`, [gx, gy, rarity, u]);

beforeAll(async () => {
  await db.init({ ungated: true });
  u = await db.newPlayer('uma_ultra');
});
afterAll(() => db.close());

describe('my_ultras', () => {
  it('is empty without Ultra plots, and Phoenix sits at ×1 without a streak', async () => {
    await give(9000, 9000, 'common');
    const r = await db.rpc(u, 'my_ultras');
    expect(r.plots).toEqual([]);
    expect(Number(r.phoenix.now)).toBe(1);
    expect(Number(r.phoenix.next)).toBeCloseTo(1.1, 5);
  });

  it('lists Chaos with a value from its table and Phoenix with the streak multiplier', async () => {
    await give(9001, 9000, 'chaos');
    await give(9002, 9000, 'phoenix');
    await give(9003, 9000, 'phoenix');
    await give(9004, 9000, 'solar');
    await db.sql(`insert into daily_streaks (player_id, last_day, streak, best, total_days) values ($1, private.game_day(now()) - 1, 20, 20, 20)
                  on conflict (player_id) do update set last_day = excluded.last_day, streak = 20`, [u]);
    const r = await db.rpc(u, 'my_ultras');
    const chaos = r.plots.find((p: any) => p.rarity === 'chaos');
    const values = (r.chaos_values as unknown[]).map(Number);
    expect(values).toContain(Number(chaos.mult));
    expect(chaos.daily).toBe(true);
    const ph = r.plots.filter((p: any) => p.rarity === 'phoenix');
    expect(ph).toHaveLength(2);
    for (const p of ph) expect(Number(p.mult)).toBeCloseTo(3, 5); // 1 + 0.1 × 20
    expect(Number(r.phoenix.now)).toBeCloseTo(3, 5);
    expect(Number(r.phoenix.next)).toBeCloseTo(3.1, 5); // checking in today makes it 21 days
    expect(r.checked_in).toBe(false);
    const solar = r.plots.find((p: any) => p.rarity === 'solar');
    expect(solar.daily).toBe(false);
    expect(Number(solar.window.len)).toBe(12);
    expect(typeof solar.window.open).toBe('boolean');
  });

  it('a missed day puts the Phoenix out', async () => {
    await db.sql(`update daily_streaks set last_day = private.game_day(now()) - 3 where player_id = $1`, [u]);
    const r = await db.rpc(u, 'my_ultras');
    expect(Number(r.phoenix.now)).toBe(1);
    for (const p of r.plots.filter((p: any) => p.rarity === 'phoenix')) expect(Number(p.mult)).toBe(1);
  });
});
