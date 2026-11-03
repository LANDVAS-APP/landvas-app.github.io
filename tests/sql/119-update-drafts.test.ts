// v0.40 Auto-written update drafts: each build adds to a draft that players never see until staff approve it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let admin: string, p: string;
const build = (o: object) => db.sql(`select private.build_update_draft($1::jsonb) r`, [JSON.stringify(o)]).then((r) => r[0].r);

beforeAll(async () => {
  await db.init({ ungated: true });
  admin = await db.newPlayer('draftadmin');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'admin') on conflict do nothing`, [admin]);
  p = await db.newPlayer('draftplayer');
});
afterAll(() => db.close());

describe('update drafts', () => {
  it('a build makes a draft that players can’t see; staff can', async () => {
    const r = await build({ sha: 'aaa111', title: 'Rovers!', body: '• Drive rovers', notes: ['Drive rovers'] });
    expect(r).toMatchObject({ ok: true, merged: false });
    expect((await db.rpc(null, 'announcements_list', {})).items).toHaveLength(0);
    expect((await db.rpc(p, 'my_notifications')).drafts_staff).toBeNull();
    expect((await db.rpc(admin, 'my_notifications')).drafts_staff).toBe(1);
    const list = await db.rpc(admin, 'admin_announcements');
    expect(list[0]).toMatchObject({ status: 'draft', source: 'auto', title: 'Rovers!' });
    expect(list[0].builds[0]).toMatchObject({ sha: 'aaa111', notes: ['Drive rovers'] });
  });

  it('later builds add to the waiting draft; the same build twice is ignored', async () => {
    expect(await build({ sha: 'bbb222', title: 'Eggs', body: '• 3 eggs a day', notes: ['3 eggs a day'] })).toMatchObject({ merged: true });
    expect(await build({ sha: 'bbb222', title: 'Eggs', body: '• 3 eggs a day' })).toMatchObject({ ok: false, why: 'seen' });
    expect(await build({ sha: 'ccc333', body: '  ' })).toMatchObject({ ok: false, why: 'empty' });
    const [d] = await db.rpc(admin, 'admin_announcements');
    expect(d.title).toBe('Rovers!');
    expect(d.body).toBe('• Drive rovers\n• 3 eggs a day');
    expect(d.builds).toHaveLength(2);
    // editing keeps it a draft
    await db.rpc(admin, 'admin_announcement_save', { p_id: d.id, p_title: 'Rovers & eggs', p_body: d.body, p_kind: 'update', p_link: '/space', p_popup: true, p_active: true });
    expect((await db.rpc(null, 'announcements_list', {})).items).toHaveLength(0);
  });

  it('approving publishes it to everyone; players can’t approve', async () => {
    const [d] = await db.rpc(admin, 'admin_announcements');
    await expectError(db.rpc(p, 'admin_announcement_publish', { p_id: d.id, p_title: 'x', p_body: 'y' }), 'forbidden');
    const r = await db.rpc(admin, 'admin_announcement_publish', { p_id: d.id, p_title: 'Rovers & eggs', p_body: 'All new!', p_kind: 'update', p_link: '/space', p_popup: true });
    expect(r).toMatchObject({ status: 'published', title: 'Rovers & eggs' });
    const seen = await db.rpc(p, 'my_notifications');
    expect(seen.announcements[0]).toMatchObject({ title: 'Rovers & eggs', body: 'All new!', link: '/space', popup: true, unread: true });
    expect((await db.rpc(admin, 'my_notifications')).drafts_staff).toBe(0);
    await expectError(db.rpc(admin, 'admin_announcement_publish', { p_id: d.id, p_title: 'again', p_body: 'x' }), 'not_found');
    // the next build starts a fresh draft
    expect(await build({ sha: 'ddd444', title: 'Next', body: '• more' })).toMatchObject({ merged: false });
  });

  it('players can never call the draft writer', async () => {
    await expectError(db.sql(`set local role authenticated; select private.build_update_draft('{}'::jsonb)`), 'permission denied');
  });
});

describe('hand-written drafts', () => {
  it('staff can save one to preview, then publish it', async () => {
    await expectError(db.rpc(p, 'admin_announcement_draft', { p_title: 'x', p_body: 'y' }), 'forbidden');
    const d = await db.rpc(admin, 'admin_announcement_draft', { p_title: 'Halloween event', p_body: 'Spooky plots!', p_kind: 'event' });
    expect(d.status).toBe('draft');
    expect((await db.rpc(null, 'announcements_list', {})).items.some((a: any) => a.title === 'Halloween event')).toBe(false);
    await db.rpc(admin, 'admin_announcement_publish', { p_id: d.id, p_title: 'Halloween event', p_body: 'Spooky plots!', p_kind: 'event' });
    expect((await db.rpc(null, 'announcements_list', {})).items[0].title).toBe('Halloween event');
  });
});
