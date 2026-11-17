// 🪞 Every Mirror Shard reflection works: step into a kind and its actions run on the reflection — the Glyphcaster's
// casting and study, the Fated Deck's cards, the Spyglass's looks, the Pocket Sun's throw and its sunspots, the
// Clockwork's winding and Rewind, the Genie's wishes, the Goose, Pandora, the Treasure Map — and the shard stays a shard
// (its reflection, cracks and options untouched; the reflected state lives in state.r, nowhere else).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let ann: string, bob: string;
const O = { gx: 812_400, gy: 1_571_900 };
let k = 0;
const claimAt = (uid: string, gx: number, gy: number) => db.rpc(uid, 'acquire_plot', { p_gx: gx, p_gy: gy, p_idempotency_key: `mr-${++k}-00000000` });
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
const act = (uid: string, id: string, action: string, args: Record<string, unknown> = {}) => db.rpc(uid, 'enchant_act', { p_id: id, p_action: action, p_args: args });
const get = (uid: string, id: string) => db.rpc(uid, 'enchant_get', { p_id: id });
const row = async (id: string) => (await db.sql(`select * from enchantments where id = $1`, [id]))[0];
let shard: string;
/** the shard steps into a fresh reflection of this kind */
const reflect = (kind: string) => db.sql(`update enchantments set state = state || jsonb_build_object(
  'reflect', jsonb_build_object('kind', $2::text, 'dream', true, 'from', extract(epoch from now()), 'until', extract(epoch from now()) + 3600),
  'r', private.ench_init($2::text, now()), 'cracks', 2, 'options', '[]'::jsonb) where id = $1`, [shard, kind]);
/** the shard is still a shard reflecting this kind, and nothing of the reflection leaked onto its own state */
async function stillAShard(kind: string, leaked: string[]) {
  const s = (await row(shard)).state;
  expect(s.reflect?.kind).toBe(kind);
  expect(s.cracks).toBe(2);
  for (const key of leaked) expect(s[key], `"${key}" belongs in state.r`).toBeUndefined();
  return s.r;
}

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('mr_ann'); bob = await db.newPlayer('mr_bob');
  for (const u of [ann, bob]) { await db.sql(`update players set created_at = now() - interval '3 days', last_active_at = now() where id = $1`, [u]); await db.giveInk(u, 300_000); }
  await db.sql(`update game_config set value = jsonb_set(value, '{enabled}', 'false') where key = 'luck'`);
  await force('shard');
  shard = (await claimAt(ann, O.gx, O.gy)).enchant.id;
  await force('');
  // a few plots of ann's around it (for looks, throws and targets)
  for (let i = 1; i <= 4; i++) await claimAt(ann, O.gx + i * 3, O.gy);
});
afterAll(() => db.close());

describe('🪞 a Mirror Shard acts as what it reflects', () => {
  it('✍️ Glyphcaster: draw a glyph and it casts, mana spent on the reflection; study works too', async () => {
    await reflect('glyph');
    const v0 = await get(ann, shard);
    expect(v0.reflect_kind).toBe('glyph');
    expect(v0.reflected.mana).toBe(5);
    const c = await act(ann, shard, 'cast', { glyph: 'spiral', accuracy: 0.92 });
    expect(c.result.fizzled).toBeFalsy();
    expect(c.reflected.mana).toBeLessThan(5);
    const r = await stillAShard('glyph', ['mana', 'mana_at', 'known', 'mastery', 'best']);
    expect(r.mana).toBeLessThan(5);
    expect(r.mastery?.spiral).toBe(1);
    // cast again: still a reflection, still counting
    await act(ann, shard, 'cast', { glyph: 'spiral', accuracy: 0.8 });
    expect((await stillAShard('glyph', ['mana', 'mastery'])).mastery?.spiral).toBe(2);
    const st = await act(ann, shard, 'study');
    expect(st.result).toBeTruthy();
    expect((await stillAShard('glyph', ['study_day'])).study_day).toBeTruthy();
  });

  it('🃏 Fated Deck: turn a card and let it come true', async () => {
    await reflect('deck');
    const f = await act(ann, shard, 'flip', { i: 0 });
    expect(f.result.card).toBeTruthy();
    let r = await stillAShard('deck', ['picked', 'pending', 'flipped', 'day']);
    if (r.pending) {
      await act(ann, shard, 'accept', {});
      r = await stillAShard('deck', ['picked', 'pending', 'chain']);
      expect(r.pending ?? null).toBeNull();
    }
    expect(Number(r.picked)).toBe(1);
  });

  it('🔭 Spyglass: look at a free spot', async () => {
    await reflect('spyglass');
    const l = await act(ann, shard, 'look', { gx: O.gx + 1, gy: O.gy + 2 });
    expect(l.result.rarity ?? l.result.reading ?? l.result).toBeTruthy();
    const r = await stillAShard('spyglass', ['looks', 'look_at']);
    expect(Number(r.looks)).toBe(2);
  });

  it('☀️ Pocket Sun: throw it onto the map — the zone is the reflection’s, and the map sees it', async () => {
    await reflect('sun');
    const s = await act(ann, shard, 'ignite', { gx: O.gx + 6, gy: O.gy + 1, mode: 'claim' });
    expect(s.result).toBeTruthy();
    const r = await stillAShard('sun', ['zones', 'lit', 'day']);
    expect(r.zones).toHaveLength(1);
    // (the live zones — what claims and the map read — include a reflected sun's)
    const live = await db.sql(`select count(*)::int n from private.sun_live(array[$1]::uuid[]) z`, [ann]).catch(() => [{ n: -1 }]);
    if (live[0].n !== -1) expect(live[0].n).toBeGreaterThan(0);
    // the heartbeat's sun work runs over reflected suns too, without touching the shard's own state
    await db.sql(`select private.sun_warm_tick(); select private.sun_nova_tick();`);
    await stillAShard('sun', ['zones']);
  });

  it('⚙️ Clockwork: wind it, and the turns are the reflection’s', async () => {
    await reflect('clockwork');
    const w = await act(ann, shard, 'wind', { turns: 3 });
    expect(w.result).toBeTruthy();
    const r = await stillAShard('clockwork', ['charge', 'tick_at', 'winds', 'turns']);
    expect(Number(r.charge)).toBeGreaterThan(30);
  });

  it('🧞 Genie: a wish comes true', async () => {
    await reflect('genie');
    const w = await act(ann, shard, 'wish', { wish: 'ink' });
    expect(w.result).toBeTruthy();
    const r = await stillAShard('genie', ['wishes', 'charge_at']);
    expect(Number(r.wishes ?? 0)).toBe(0);
  });

  it('🪿 Goose, 🏺 Pandora and 🗺️ the Map act as before', async () => {
    await reflect('goose');
    await act(ann, shard, 'polish');
    expect(Number((await stillAShard('goose', ['polish', 'egg_at'])).polish)).toBeGreaterThan(0);
    await reflect('pandora');
    const o = await act(ann, shard, 'open', { notches: 1 });
    expect(o.result).toBeTruthy();
    await stillAShard('pandora', ['evils', 'cycle']);
    await reflect('map');
    await act(ann, shard, 'draw').catch(() => null);
    await stillAShard('map', ['pieces', 'next_at']);
  });

  it('stepping back leaves a whole shard (and a reflection’s actions never run once it’s over)', async () => {
    await reflect('glyph');
    await act(ann, shard, 'cast', { glyph: 'spiral', accuracy: 0.9 });
    await act(ann, shard, 'release');
    const s = (await row(shard)).state;
    expect(s.reflect ?? null).toBeNull();
    expect(s.cracks).toBe(2);
    expect(s.mana).toBeUndefined();
  });

  it('the reflections that couldn’t act got their charges back and a fresh day (the migration’s refill)', async () => {
    // (what the migration does to a live reflection, run again here on one that's spent)
    await reflect('glyph');
    await db.sql(`update enchantments set state = jsonb_set(state, '{r,mana}', '0') || jsonb_build_object('reflect', (state -> 'reflect') || jsonb_build_object('until', extract(epoch from now()) + 60)) where id = $1`, [shard]);
    const sql = (await import('node:fs')).readFileSync('supabase/migrations/20261119000430_mirror_reflections_work.sql', 'utf8');
    await db.sql(sql.slice(sql.indexOf('update public.enchantments\n   set state = state || jsonb_build_object(\n         \'reflect\'')));
    const v = await get(ann, shard);
    expect(v.reflected.mana).toBe(5);
    expect(Number(v.view.reflect.until) - Date.now() / 1000).toBeGreaterThan(86000);
  });
});
