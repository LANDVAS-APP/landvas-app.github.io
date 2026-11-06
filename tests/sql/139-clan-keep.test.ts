// v0.6.1 The Clan Keep: renames (leader, once in 30 days), the spirit, the daily chest, quarry/training stone,
// building projects.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let lead: string, mem: string, clanId: string;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const stone = async (uid: string) => Number((await db.sql(`select stone from clan_members where player_id = $1`, [uid]))[0].stone);

beforeAll(async () => {
  await db.init({ ungated: true });
  lead = await db.newPlayer('keep_lead'); mem = await db.newPlayer('keep_mem');
  await db.giveInk(lead, 1000);
  clanId = (await db.rpc(lead, 'clan_found', { p_name: 'Keepers', p_tag: 'KEEP', p_emblem: '🏰', p_color: '#7B5CFF' })).id;
  await db.rpc(mem, 'clan_join', { p_id: clanId });
});
afterAll(() => db.close());

describe('Clan Keep', () => {
  it('only the leader renames, and only once every 30 days', async () => {
    await expectError(db.rpc(mem, 'clan_rename', { p_name: 'Members Rule' }), 'clan_leader_only');
    const c = await db.rpc(lead, 'clan_rename', { p_name: 'Keepers of Ink' });
    expect(c.name).toBe('Keepers of Ink');
    await expectError(db.rpc(lead, 'clan_rename', { p_name: 'Again' }), 'clan_rename_wait');
    await db.sql(`update clans set renamed_at = now() - interval '31 days' where id = $1`, [clanId]);
    expect((await db.rpc(lead, 'clan_rename', { p_name: 'Keepers' })).name).toBe('Keepers');
    expect((await db.rpc(lead, 'clan_get')).feed.some((f: any) => f.kind === 'renamed')).toBe(true);
  });

  it('feeding the spirit: once a day each, it grows, gives XP and stone', async () => {
    const xp0 = (await db.rpc(lead, 'clan_get')).xp;
    const k0 = await db.rpc(lead, 'clan_keep');
    expect(k0.spirit).toMatchObject({ stage: 0, name: 'Egg', fed_today: false });
    const r = await db.rpc(lead, 'clan_spirit_feed');
    expect(r).toMatchObject({ grew: true, stage: 1 });
    await expectError(db.rpc(lead, 'clan_spirit_feed'), 'already_fed');
    await db.rpc(mem, 'clan_spirit_feed');
    const k = await db.rpc(mem, 'clan_keep');
    expect(k.spirit.feeds).toBe(2); expect(k.spirit.stage).toBe(1); expect(k.spirit.next).toBe(3); expect(k.spirit.fed_today).toBe(true);
    expect(k.stone).toBe(8);
    expect((await db.rpc(lead, 'clan_get')).xp).toBeGreaterThan(xp0 + 120);
  });

  it('the daily chest opens when enough members come to the Keep', async () => {
    let k = await db.rpc(lead, 'clan_keep');
    expect(k.chest.need).toBe(2);
    await expectError(db.rpc(lead, 'clan_chest_open'), 'visit_keep_first');
    await db.rpc(lead, 'home_live', { p_host: clanId });
    await expectError(db.rpc(lead, 'clan_chest_open'), 'chest_locked');
    await db.rpc(mem, 'home_live', { p_host: clanId });
    k = await db.rpc(lead, 'clan_keep');
    expect(k.chest).toMatchObject({ open: true, visitors: 2 });
    const i0 = await ink(lead), s0 = await stone(lead);
    expect(await db.rpc(lead, 'clan_chest_open')).toMatchObject({ ink: 30, stone: 15 });
    expect((await ink(lead)) - i0).toBe(30); expect((await stone(lead)) - s0).toBe(15);
    await expectError(db.rpc(lead, 'clan_chest_open'), 'already_claimed');
  });

  it('quarry and training give stone, capped by time played and per day; training keeps a weekly best', async () => {
    const p = await db.rpc(mem, 'clan_keep_start', { p_game: 'quarry' });
    // too quick: the score is cut down to what 30s allows pro rata
    const quick = await db.rpc(mem, 'clan_keep_finish', { p_id: p.id, p_score: 160 });
    expect(quick.score).toBeLessThan(20);
    const p2 = await db.rpc(mem, 'clan_keep_start', { p_game: 'quarry' });
    await db.sql(`update clan_plays set started_at = now() - interval '31 seconds' where id = $1`, [p2.id]);
    const r = await db.rpc(mem, 'clan_keep_finish', { p_id: p2.id, p_score: 100 });
    expect(r).toMatchObject({ score: 100, stone: 50 });
    await expectError(db.rpc(mem, 'clan_keep_finish', { p_id: p2.id, p_score: 100 }), 'not_found');
    const t = await db.rpc(mem, 'clan_keep_start', { p_game: 'training' });
    await db.sql(`update clan_plays set started_at = now() - interval '31 seconds' where id = $1`, [t.id]);
    expect((await db.rpc(mem, 'clan_keep_finish', { p_id: t.id, p_score: 240 })).record).toBe(true);
    const k = await db.rpc(lead, 'clan_keep');
    expect(k.training.board[0]).toMatchObject({ id: mem, best: 240 });
    // the daily cap
    for (let i = 0; i < 3; i++) {
      const x = await db.rpc(mem, 'clan_keep_start', { p_game: 'quarry' });
      await db.sql(`update clan_plays set started_at = now() - interval '31 seconds' where id = $1`, [x.id]);
      await db.rpc(mem, 'clan_keep_finish', { p_id: x.id, p_score: 160 });
    }
    const km = await db.rpc(mem, 'clan_keep');
    expect(km.stone_today).toBe(140);
  });

  it('members build monuments with stone together; locked ones need clan levels', async () => {
    const s = await stone(mem);
    await expectError(db.rpc(mem, 'clan_build_give', { p_key: 'dragon', p_amount: 10 }), 'clan_build_locked');
    const r = await db.rpc(mem, 'clan_build_give', { p_key: 'well', p_amount: 100 });
    expect(r).toMatchObject({ gave: 100, done: false });
    expect(await stone(mem)).toBe(s - 100);
    await db.sql(`update clan_members set stone = 500 where player_id = $1`, [lead]);
    const r2 = await db.rpc(lead, 'clan_build_give', { p_key: 'well', p_amount: 500 });
    expect(r2).toMatchObject({ gave: 50, done: true });
    expect(await stone(lead)).toBe(450);
    await expectError(db.rpc(lead, 'clan_build_give', { p_key: 'well', p_amount: 5 }), 'already_built');
    const k = await db.rpc(lead, 'clan_keep');
    expect(k.builds.find((b: any) => b.key === 'well')).toMatchObject({ done: true, progress: 150 });
    await expectError(db.rpc(mem, 'clan_build_give', { p_key: 'forge', p_amount: 999999 }).then(async () => { await db.sql(`update clan_members set stone = 0 where player_id = $1`, [mem]); return db.rpc(mem, 'clan_build_give', { p_key: 'forge', p_amount: 1 }); }), 'not_enough_stone');
  });
});
