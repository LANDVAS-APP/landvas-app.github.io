// v0.21: final votes, notifications, room guestbook and visitors, sketch word and
// Painting of the Day picked by the operator, new explorer looks.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
const svc = { role: 'service_role' } as const;
const H = (n: number) => n.toString(16).padStart(64, '0');
let owner: string, ann: string, ben: string;
const strokes = (n = 4) => Array.from({ length: n }, (_, k) => ({ c: (k % 5) + 1, w: 12, p: [100 + k * 50, 200, k * 100, 300 + k * 40, 500, k * 100 + 60] }));

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('cmowner');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner'), ($1, 'admin') on conflict do nothing`, [owner]);
  const mod = (await db.rpc(owner, 'admin_config_get')).config.moderation.value;
  await db.rpc(owner, 'admin_config_set', { p_key: 'moderation', p_value: { ...mod, mode: 'auto' } });
  ann = await db.newPlayer('ann_hosts');
  ben = await db.newPlayer('ben_visits');
  await db.sql(`update players set created_at = now() - interval '5 days' where id = any($1)`, [[ann, ben]]);
  await db.rpc(ann, 'claim_starter_plot', { p_gx: 2_900_000, p_gy: 1_800_000 });
  await db.rpc(ben, 'claim_starter_plot', { p_gx: 2_900_100, p_gy: 1_800_000 });
});
afterAll(() => db.close());

describe('community', () => {
  it('the operator sets the sketch word; who is sketching shows; votes are final and notify', async () => {
    const r = await db.rpc(owner, 'admin_set_sketch_word', { p_word: 'Paper Crane' });
    expect(r.word).toBe('paper crane');
    expect((await db.rpc(ann, 'sketch_today')).word).toBe('paper crane');
    await db.rpc(ann, 'sketch_start');
    await db.rpc(ann, 'sketch_submit', { p_strokes: strokes() });
    const who = await db.rpc({ role: 'anon' }, 'sketch_artists_today');
    expect(who.artists[0].username).toBe('ann_hosts');
    const id = (await db.rpc(ann, 'sketch_today')).mine.id;
    await db.rpc(ben, 'sketch_vote', { p_sketch_id: id, p_on: true });
    await expectError(db.rpc(ben, 'sketch_vote', { p_sketch_id: id, p_on: false }), 'vote_final');
    const n = await db.rpc(ann, 'my_alerts');
    expect(n.items.some((x: any) => x.kind === 'sketch_vote' && x.actor === null)).toBe(true);
  });

  it('room visitors, check-ins and notes notify the host and show on the room', async () => {
    await db.rpc(ben, 'room_enter', { p_username: 'ann_hosts' });
    await db.rpc(ben, 'room_note', { p_username: 'ann_hosts', p_body: 'Love your murals!' });
    const social = await db.rpc({ role: 'anon' }, 'room_social', { p_username: 'ann_hosts' });
    expect(social.visitors[0].player.username).toBe('ben_visits');
    expect(social.notes[0].body).toBe('Love your murals!');
    const n = await db.rpc(ann, 'my_alerts');
    expect(n.items.map((x: any) => x.kind)).toEqual(expect.arrayContaining(['visit', 'note']));
    expect(await db.rpc(ann, 'alerts_unread')).toBeGreaterThan(0);
    await db.rpc(ann, 'mark_alerts_read');
    expect(await db.rpc(ann, 'alerts_unread')).toBe(0);
  });

  it('inspiring art notifies the artist; the operator picks the Painting of the Day', async () => {
    const g = (await db.rpc(ann, 'my_groups'))[0];
    const p = await db.rpc(ann, 'get_project', { p_project_id: g.project_id });
    const sv = await db.rpc(ann, 'save_draft', { p_project_id: g.project_id, p_base_version_id: p.version.id, p_manifest: { layers: [{ id: 'layer-1', name: 'L', tiles: { '2900000_1800000': H(1) } }] } });
    const req = await db.rpc(ann, 'request_publication', { p_project_id: g.project_id, p_version_id: sv.version_id, p_title: 'Lilies', p_rights_affirmed: true });
    await db.rpc(ann, 'submit_publication', { p_publication_id: req.publication_id });
    await db.rpc(svc, 'svc_publication_processed', { p_publication_id: req.publication_id, p_result: { ok: true, screening: { provider: 'none' } } });
    await db.rpc(svc, 'svc_mark_published', { p_publication_id: req.publication_id, p_cell_revs: { '2900000_1800000': 1 } });
    await db.rpc(ben, 'appreciate', { p_publication_id: req.publication_id, p_on: true });
    expect((await db.rpc(ann, 'my_alerts')).items[0]).toMatchObject({ kind: 'inspire', actor: { username: 'ben_visits' } });
    await db.rpc(owner, 'admin_set_potd', { p_publication_id: req.publication_id, p_note: 'Gorgeous light' });
    const today = await db.rpc({ role: 'anon' }, 'featured_today', { p_limit: 6 });
    expect(today[0]).toMatchObject({ id: req.publication_id, pick: 'potd', note: 'Gorgeous light' });
  });

  it('new explorer looks are free to wear', async () => {
    const pr = await db.rpc(ann, 'equip_explorer', { p_style: { hair: 'ponytail', hairc: 'red', skin: 'brown', body: 'dress' } });
    expect(pr.explorer_style).toMatchObject({ hair: 'ponytail', hairc: 'red', skin: 'brown', body: 'dress' });
  });
});
