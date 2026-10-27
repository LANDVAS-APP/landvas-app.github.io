// The browser's local mode runs the very same migrations inside PGlite (WASM
// Postgres). This test proves they apply and the core loop works there too.
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { sqlBundle } from '../helpers/db';

let db: PGlite;

async function rpc(uid: string | null, fn: string, args: Record<string, unknown> = {}) {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid ?? '', role: uid ? 'authenticated' : 'anon' })]);
    await tx.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
    const r = await tx.query<{ r: any }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => args[k]));
    return r.rows[0].r;
  });
}

describe('PGlite local runtime', () => {
  beforeAll(async () => {
    db = new PGlite();
    for (const sql of sqlBundle({ localOverrides: true })) await db.exec(sql);
    await db.exec(`update feature_flags set enabled = false where key = 'location_gated_claims'`);
  }, 120_000);

  it('runs onboarding, claim, draft, fusion and the auto-moderated publish path', async () => {
    const u = (await db.query<{ id: string }>(`insert into auth.users (email) values ('local@example.test') returning id`)).rows[0].id;
    const terms = (await db.query<{ v: string }>(`select value->>'terms_version' v from game_config where key='legal'`)).rows[0].v;
    const st = await rpc(u, 'complete_onboarding', { p_username: 'localartist', p_accept_terms_version: terms });
    expect(st.onboarded).toBe(true);
    await rpc(u, 'claim_starter_plot', { p_gx: 100, p_gy: 100 });
    await db.query(`update resource_balances set amount = 500 where player_id = $1 and resource = 'ink'`, [u]);
    await rpc(u, 'acquire_plot', { p_gx: 101, p_gy: 100, p_idempotency_key: 'local-acquire-1' });
    const groups = await rpc(u, 'my_groups');
    const fused = await rpc(u, 'fuse_groups', { p_group_ids: groups.map((g: any) => g.id) });
    expect(fused.plot_count).toBe(2);
    const proj = await rpc(u, 'get_project', { p_project_id: fused.project_id });
    const saved = await rpc(u, 'save_draft', {
      p_project_id: fused.project_id, p_base_version_id: proj.version.id,
      p_manifest: { layers: [{ id: 'layer-1', name: 'Layer 1', tiles: { '100_100': 'a'.repeat(64), '101_100': 'b'.repeat(64) } }] },
    });
    const req = await rpc(u, 'request_publication', { p_project_id: fused.project_id, p_version_id: saved.version_id, p_title: 'Local mural', p_rights_affirmed: true });
    await rpc(u, 'submit_publication', { p_publication_id: req.publication_id });
    // local mode: pipeline runs as the database owner (no role switch)
    const job = (await db.query<{ r: any }>(`select public.svc_claim_job('local') as r`)).rows[0].r;
    expect(job.kind).toBe('process_publication');
    const processed = (await db.query<{ r: any }>(`select public.svc_publication_processed($1, $2) as r`, [req.publication_id, { ok: true, screening: { provider: 'none' } }])).rows[0].r;
    expect(processed.status).toBe('approved'); // local_overrides sets moderation to auto
    const dev = await rpc(u, 'dev_grant_self_admin');
    expect(dev.roles).toContain('owner');
  });
});
