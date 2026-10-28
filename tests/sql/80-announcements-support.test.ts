// v0.8: update announcements (bell + popup) and in-app support tickets.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let admin: string, p: string, q: string;

beforeAll(async () => {
  await db.init({ ungated: true });
  admin = await db.newPlayer('updatesadmin');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'admin') on conflict do nothing`, [admin]);
  p = await db.newPlayer('ticketfan');
  q = await db.newPlayer('nosyneighbour');
});
afterAll(() => db.close());

describe('announcements', () => {
  it('only staff can post; everyone (even signed out) can read', async () => {
    await expectError(db.rpc(p, 'admin_announcement_save', { p_id: null, p_title: 'Hi', p_body: 'Nope' }), 'forbidden');
    const a = await db.rpc(admin, 'admin_announcement_save', { p_id: null, p_title: 'v0.8 is here', p_body: 'Support tickets and a bell.', p_kind: 'update', p_link: '/support' });
    expect(a.title).toBe('v0.8 is here');
    const anon = await db.rpc(null, 'announcements_list', {});
    expect(anon.items[0].title).toBe('v0.8 is here');
    expect(anon.items[0].unread).toBe(false);
    await expectError(db.rpc(admin, 'admin_announcement_save', { p_id: null, p_title: 'x', p_body: 'y', p_link: 'https://evil.example' }), 'check');
  });

  it('a player sees new updates as unread until they open the bell', async () => {
    const n = await db.rpc(p, 'my_notifications');
    expect(n.unread_announcements).toBe(1);
    await db.rpc(p, 'mark_announcements_seen');
    expect((await db.rpc(p, 'my_notifications')).unread_announcements).toBe(0);
  });

  it('hidden updates disappear for players', async () => {
    const list = await db.rpc(admin, 'admin_announcements');
    await db.rpc(admin, 'admin_announcement_save', { p_id: list[0].id, p_title: list[0].title, p_body: list[0].body, p_active: false });
    expect((await db.rpc(p, 'announcements_list', {})).items).toHaveLength(0);
  });
});

describe('support tickets', () => {
  let id: string;
  it('a player opens a ticket; nobody else can read it', async () => {
    const t = await db.rpc(p, 'support_create', { p_subject: 'Lost my Ink', p_category: 'payments', p_body: 'My Ink vanished after a win.' });
    id = t.id;
    expect(t.status).toBe('open');
    await expectError(db.rpc(q, 'support_ticket', { p_id: id }), 'not_found');
    await expectError(db.rpc(q, 'support_reply', { p_id: id, p_body: 'hi' }), 'not_found');
    await expectError(db.rpc(p, 'admin_support_tickets', {}), 'forbidden');
  });

  it('staff see it, reply, and the player gets a bell notification', async () => {
    const queue = await db.rpc(admin, 'admin_support_tickets', {});
    expect(queue.counts.open).toBe(1);
    expect(queue.tickets[0].player.username).toBe('ticketfan');
    const r = await db.rpc(admin, 'support_reply', { p_id: id, p_body: 'Found it — refunded.' });
    expect(r.status).toBe('answered');
    expect((await db.rpc(p, 'my_notifications')).support_replies).toBe(1);
    const thread = await db.rpc(p, 'support_ticket', { p_id: id });
    expect(thread.thread.map((m: any) => m.is_staff)).toEqual([false, true]);
    expect(thread.thread[1].author.display_name).toBe('LANDVAS Support'); // staff stay anonymous
    expect((await db.rpc(p, 'my_notifications')).support_replies).toBe(0);
  });

  it('players can reply or close their own ticket', async () => {
    expect((await db.rpc(p, 'support_reply', { p_id: id, p_body: 'Thanks!' })).status).toBe('open');
    expect((await db.rpc(p, 'support_set_status', { p_id: id, p_status: 'closed' })).status).toBe('closed');
    expect((await db.rpc(p, 'support_my_tickets'))[0].status).toBe('closed');
  });

  it('no contact email is published', async () => {
    const w = await db.rpc(null, 'world_config');
    expect(JSON.stringify(w)).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
  });
});
