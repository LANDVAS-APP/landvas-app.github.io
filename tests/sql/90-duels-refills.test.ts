// v0.10: Roller Mural on Prism plots and joystick refills with Ink (staked duels became free PvP minigames: see 96-pvp).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let owner: string, a: string, b: string, c: string;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0].amount);

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('duelowner');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'admin') on conflict do nothing`, [owner]);
  a = await db.newPlayer('dueler_a');
  b = await db.newPlayer('dueler_b');
  c = await db.newPlayer('dueler_c');
  for (const p of [a, b, c]) await db.giveInk(p, 1000);
});
afterAll(() => db.close());

describe('roller mural', () => {
  it('Prism plots now host Roller Mural', async () => {
    const w = await db.rpc(null, 'world_config');
    const prism = w.plot_types.find((t: any) => t.id === 'prism');
    expect(prism.minigame).toBe('rollermural');
    expect(w.minigames.games.rollermural).toBeTruthy();
    expect(w.minigames.games.hueflow).toBeUndefined();
  });
});

describe('joystick refills with Ink', () => {
  it('costs Ink, fills the tank, and is limited per day', async () => {
    const p = await db.newPlayer('refiller');
    await db.giveInk(p, 500);
    await db.placeAt(p, 900000, 900000);
    await expectError(db.rpc(p, 'refill_joystick_with_ink', { p_idempotency_key: 'refill-full-1' }), 'tank_full');
    await db.sql(`update explorers set joy_seconds = 0, joy_day = now() + interval '1 day' where player_id = $1`, [p]);
    const r = await db.rpc(p, 'refill_joystick_with_ink', { p_idempotency_key: 'refill-ok-1' });
    expect(r.joystick.seconds_left).toBe(60);
    expect(await ink(p)).toBe(450);
    expect(r.joystick.ink_refills_left).toBe(2);
  });
});
