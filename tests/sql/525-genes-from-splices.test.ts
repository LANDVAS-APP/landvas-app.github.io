// "How strong is this gene?" read straight from the splices (20261119000525): the same answers as the partner list it
// used to be worked out from, for every enchantment and gene, with splices of every kind live, ended and not yet begun.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let ann: string;
const O = { gx: 793_400, gy: 1_576_300 };
let k = 0;
const claim = (uid: string, dx: number, dy = 0) => db.rpc(uid, 'acquire_plot', { p_gx: O.gx + dx, p_gy: O.gy + dy, p_idempotency_key: `hr-${++k}-00000000` });
const force = (kind: string) => db.sql(`select set_config('landvas.force_enchant', $1, false)`, [kind]);
const KINDS = ['goose', 'splice', 'shard', 'clockwork', 'genie', 'sizeray', 'parasite', 'wormhole', 'pandora', 'origami', 'map', 'oracle', 'deck', 'puppeteer', 'spyglass', 'glyph', 'rod', 'crucible', 'sun', 'stormcoil', 'dejavu'];

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('heavy_ann');
  await db.giveInk(ann, 5_000_000);
  for (const [i, kd] of KINDS.entries()) { await force(kd); await claim(ann, (i % 10) * 3, Math.floor(i / 10) * 3); }
  await force('');
  // the way it was worked out before: from the enchantment's whole partner list
  await db.sql(`create function private.ench_has_gene_before(p_id uuid, p_gene text) returns integer language sql stable as
    $$ select coalesce(max((p ->> 'strength')::int), 0) from jsonb_array_elements(private.ench_partners(p_id)) p where p ->> 'gene' = p_gene $$`);
});
afterAll(() => db.close());

describe('genes', () => {
  it('every gene of every enchantment is as strong as the partner list says, splices of every kind and all', async () => {
    const ids = (await db.sql(`select id, kind from enchantments where owner_id = $1 order by born_at`, [ann]));
    expect(ids.length).toBeGreaterThanOrEqual(15);
    // live splices of every mode between pairs (one stormy), a plot splice, an ended one and one not started yet
    const modes = ['swap', 'graft', 'chimera', 'trinity', 'friend'];
    for (let i = 0; i + 1 < ids.length; i += 2) {
      await db.sql(`insert into enchant_splices (splice_id, player_id, a, b, ends_at, mode, data) values ($1, $2, $1, $3, now() + interval '2 hours', $4, $5)`,
        [ids[i].id, ann, ids[i + 1].id, modes[(i / 2) % modes.length], i % 6 === 0 ? { storm_k: 3 } : {}]);
    }
    await db.sql(`insert into enchant_splices (splice_id, player_id, a, b, ends_at, mode, data, plot_gx, plot_gy) values ($1, $2, $1, null, now() + interval '1 hour', 'plot', '{"plot_kind": "farm"}', 1, 1)`, [ids[0].id, ann]);
    await db.sql(`insert into enchant_splices (splice_id, player_id, a, b, started_at, ends_at, mode) values ($1, $2, $1, $3, now() - interval '3 hours', now() - interval '1 hour', 'swap')`, [ids[2].id, ann, ids[5].id]);
    await db.sql(`insert into enchant_splices (splice_id, player_id, a, b, started_at, ends_at, mode) values ($1, $2, $1, $3, now() + interval '1 hour', now() + interval '2 hours', 'chimera')`, [ids[3].id, ann, ids[6].id]);
    const genes = (await db.sql(`select distinct g from (select private.ench_info(k) ->> 'gene' g from unnest(private.ench_kinds()) k
                                  union select private.plot_trait(x) from unnest(array['farm', 'arcade', 'business', 'habitat', 'canvas']) x) z where g is not null`)).map((r: any) => r.g);
    expect(genes.length).toBeGreaterThan(10);
    const diff = await db.sql(`select e.id, g, private.ench_has_gene(e.id, g) now_k, private.ench_has_gene_before(e.id, g) before_k
                                 from enchantments e, unnest($2::text[]) g
                                where e.owner_id = $1 and private.ench_has_gene(e.id, g) is distinct from private.ench_has_gene_before(e.id, g)`, [ann, genes]);
    expect(diff).toEqual([]);
    const on = await db.sql(`select count(*)::int n from enchantments e, unnest($2::text[]) g where e.owner_id = $1 and private.ench_has_gene(e.id, g) > 0`, [ann, genes]);
    expect(on[0].n).toBeGreaterThan(5); // (genes really are switched on)
    // and the whole Grimoire list still comes back
    const mine = await db.rpc(ann, 'my_enchantments');
    expect(mine.length).toBe(ids.length);
  });
});
