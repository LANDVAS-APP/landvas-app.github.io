// Splice Traits you can see and use: Seeking buries real chests you dig up (Grimoire or map), Wishing and Trickster pay
// where they'd have nothing to do, the Clockwork chimes and the Oracle is paid so Ink Traits work on them too.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, bob: string;
const O = { gx: 794_300, gy: 1_577_100 };
let n = 0;
const claim = (uid: string, dx: number, dy = 0) => db.rpc(uid, 'acquire_plot', { p_gx: O.gx + dx, p_gy: O.gy + dy, p_idempotency_key: `tc-${++n}-00000000` });
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
async function enchant(uid: string, kind: string, dx: number, dy = 0) {
  await force(kind);
  const r = await claim(uid, dx, dy);
  await force('');
  return r.enchant.id as string;
}
const act = (uid: string, id: string, action: string, args: Record<string, unknown> = {}) => db.rpc(uid, 'enchant_act', { p_id: id, p_action: action, p_args: args });
const charges = (id: string, k: number) => db.sql(`update enchantments set state = state || jsonb_build_object('charges', $2::int, 'charge_at', extract(epoch from now())) where id = $1`, [id, k]);
const pay = async (id: string, base = 100) => (await db.sql(`select private.ench_pay($1, $2, 'test') r`, [id, base]))[0].r;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0].amount);
const open = async (uid: string) => (await db.sql(`select * from seek_chests where player_id = $1 and dug_at is null order by id`, [uid]));

const ids: Record<string, string> = {};
beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('tc_ann'); bob = await db.newPlayer('tc_bob');
  for (const u of [ann, bob]) { await db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [u]); await db.giveInk(u, 200_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  await db.sql(`update game_config set value = value || '{"splice": {"aberration": 0, "unstable": 0}}' where key = 'enchantments'`);
  ids.splice = await enchant(ann, 'splice', 0);
  ids.goose = await enchant(ann, 'goose', 4); ids.map = await enchant(ann, 'map', 8); ids.genie = await enchant(ann, 'genie', 12);
  ids.cuckoo = await enchant(ann, 'crucible', 16); ids.clock = await enchant(ann, 'clockwork', 20); ids.worm = await enchant(ann, 'wormhole', 24);
});
afterAll(() => db.close());
const end = () => act(ann, ids.splice, 'unsplice');
const graft = async (host: string, donor: string) => { await charges(ids.splice, 2); return act(ann, ids.splice, 'splice', { mode: 'graft', a: host, b: donor }); };

describe('🗺️ Seeking buries a real chest you can dig up', () => {
  it('a Goose wearing the Map’s Seeking buries chests by its plot, shown on its page, the Map’s page and the map', async () => {
    await graft(ids.goose, ids.map);
    let buried = 0;
    for (let i = 0; i < 14 && buried === 0; i++) buried += (await pay(ids.goose)).chests;
    expect(buried).toBeGreaterThan(0);
    const rows = await open(ann);
    expect(rows.length).toBe(buried);
    const c = rows[0];
    expect(c).toMatchObject({ enchant_id: ids.goose, source_id: ids.map, finder_kind: 'goose', ink: 50 });
    const g = (await db.sql(`select gx, gy from enchantments where id = $1`, [ids.goose]))[0];
    expect(Math.abs(c.gx - g.gx) + Math.abs(c.gy - g.gy)).toBeLessThanOrEqual(14);
    const ev = (await db.sql(`select data from enchant_events where enchant_id = $1 and kind = 'paid' and (data ->> 'chests')::int > 0 order by id desc limit 1`, [ids.goose]))[0].data;
    expect(ev.mods.some((m: any) => /Seeking: a chest buried/.test(m.label))).toBe(true);
    expect(ev.base).toBe(100);
    const goose = await db.rpc(ann, 'enchant_get', { p_id: ids.goose });
    expect(goose.chests.length).toBe(buried);
    expect((await db.rpc(ann, 'enchant_get', { p_id: ids.map })).chests.length).toBe(buried);
    expect((await db.rpc(ann, 'enchant_get', { p_id: ids.genie })).chests.length).toBe(0);
    expect((await db.rpc(ann, 'seek_chests')).length).toBe(buried);
    const m = await db.rpc(ann, 'enchant_map', { p_min_gx: c.gx - 20, p_min_gy: c.gy - 20, p_max_gx: c.gx + 20, p_max_gy: c.gy + 20 });
    expect(m.chests.some((x: any) => Number(x.id) === Number(c.id))).toBe(true);
    const mb = await db.rpc(bob, 'enchant_map', { p_min_gx: c.gx - 20, p_min_gy: c.gy - 20, p_max_gx: c.gx + 20, p_max_gy: c.gy + 20 });
    expect(mb.chests).toHaveLength(0);
    await end();
  });
  it('dig it up with a tap: +50 Ink, once, only your own', async () => {
    const c = (await open(ann))[0];
    await expectError(db.rpc(bob, 'seek_chest_dig', { p_id: c.id }), 'not_found');
    const before = await ink(ann);
    const r = await db.rpc(ann, 'seek_chest_dig', { p_id: c.id });
    expect(r.ink).toBe(50);
    expect(await ink(ann)).toBe(before + 50);
    await expectError(db.rpc(ann, 'seek_chest_dig', { p_id: c.id }), 'not_found');
    expect((await db.sql(`select (stats ->> 'chests')::int n from enchantments where id = $1`, [ids.goose]))[0].n).toBe(1);
  });
  it('a chest keeps 7 days; an old one is gone', async () => {
    const id = (await db.sql(`insert into seek_chests (player_id, enchant_id, finder_kind, gx, gy, ink, expires_at) values ($1, $2, 'goose', 1, 1, 50, now() - interval '1 minute') returning id`, [ann, ids.goose]))[0].id;
    await expectError(db.rpc(ann, 'seek_chest_dig', { p_id: id }), 'chest_gone');
    expect((await db.rpc(ann, 'seek_chests')).some((x: any) => Number(x.id) === Number(id))).toBe(false);
  });
  it('with 25 chests waiting, a new one is paid out at once instead', async () => {
    await db.sql(`delete from seek_chests where player_id = $1`, [ann]);
    await db.sql(`insert into seek_chests (player_id, finder_kind, gx, gy, ink) select $1, 'goose', g, 1, 50 from generate_series(1, 25) g`, [ann]);
    await graft(ids.goose, ids.map);
    let got: any = null;
    for (let i = 0; i < 14 && !got; i++) { const p = await pay(ids.goose); if (p.mods.some((m: any) => /paid now/.test(m.label))) got = p; }
    expect(got).toBeTruthy();
    expect(got.chests).toBe(0);
    expect((await open(ann)).length).toBe(25);
    await end();
    await db.sql(`delete from seek_chests where player_id = $1`, [ann]);
  });
});

describe('🧞🪺 Wishing and Tempered always do something', () => {
  it('Wishing on a Goose (no charges to keep): +50% Ink when grafted', async () => {
    await graft(ids.goose, ids.genie);
    const p = await pay(ids.goose);
    expect(p.mods.some((m: any) => m.label === 'Wishing +50%')).toBe(true);
    await end();
  });
  it('Tempered (the Crucible’s) on a Wormhole (no bad luck to dodge): +40% Ink when grafted; on a Goose it dodges foxes instead', async () => {
    await graft(ids.worm, ids.cuckoo);
    expect((await pay(ids.worm)).mods.some((m: any) => m.label === 'Tempered +40%')).toBe(true);
    await end();
    await graft(ids.goose, ids.cuckoo);
    expect((await pay(ids.goose)).mods.some((m: any) => /Tempered/.test(m.label))).toBe(false);
    await end();
  });
});

describe('⚙️👁️ the Clockwork chimes and the Oracle is paid, so Ink Traits work on them', () => {
  it('winding the day’s last turn chimes and pays — and a Golden Trait boosts it', async () => {
    await graft(ids.clock, ids.goose);
    const a = await act(ann, ids.clock, 'wind', { turns: 14 });
    expect(a.result.chimed).toBe(false);
    const b = await act(ann, ids.clock, 'wind', { turns: 1 });
    expect(b.result.chimed).toBe(true);
    expect(b.result.pay.base).toBeGreaterThanOrEqual(30);
    expect(b.result.pay.mods.some((m: any) => /Golden/.test(m.label))).toBe(true);
    await expectError(act(ann, ids.clock, 'wind', { turns: 1 }), 'wound_out');
    await end();
  });
  it('a prophecy the Oracle saw comes true: the Oracle is paid', async () => {
    const eye = await enchant(ann, 'oracle', 40);
    await db.sql(`update game_config set value = value || '{"base_pct": 0}' where key = 'enchantments'`);
    await act(ann, eye, 'gaze', { what: 'roll' });
    const before = Number((await db.sql(`select coalesce((stats ->> 'ink')::int, 0) n from enchantments where id = $1`, [eye]))[0].n);
    await claim(ann, 44);
    const after = Number((await db.sql(`select coalesce((stats ->> 'ink')::int, 0) n from enchantments where id = $1`, [eye]))[0].n);
    expect(after).toBeGreaterThan(before);
    expect((await db.sql(`select count(*)::int n from enchant_events where enchant_id = $1 and kind = 'paid' and data ->> 'what' = 'a prophecy came true'`, [eye]))[0].n).toBe(1);
  });
});
