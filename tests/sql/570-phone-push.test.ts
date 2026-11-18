// Push notifications to the apps (20261120000100): phones register their push address with the switches the player
// has on; bell alerts of push-worthy kinds are queued for players with a phone (once per cooldown), foxes at an egg are
// found by the minute beat, and the sender claims due pushes with the database's own key, then reports back (dead
// addresses dropped, sandbox ones remembered). A daily cap, a kill switch and stale foxes are honoured at claim time.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, bob: string, cat: string;
const IOS = 'a'.repeat(64), IOS2 = 'b'.repeat(64), FCM = 'fcm-token_ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789';
const svc = { role: 'service_role' as const };
const hookKey = async () => (await db.sql(`select key from private.push_hook`))[0].key as string;
const outbox = (uid: string) => db.sql(`select * from private.push_outbox where player_id = $1 order by id`, [uid]);
const alert = (uid: string, kind: string, actor: string | null, data: object) =>
  db.sql(`insert into player_notifications (player_id, kind, actor_id, data) values ($1, $2, $3, $4)`, [uid, kind, actor, JSON.stringify(data)]);

beforeAll(async () => {
  await db.init();
  ann = await db.newPlayer('push_ann'); bob = await db.newPlayer('push_bob'); cat = await db.newPlayer('push_cat');
  // the kind check on alerts grew with every feature; the trigger doesn't care which, so let any through here
  await db.sql(`alter table player_notifications drop constraint if exists player_notifications_kind_check`);
});
afterAll(() => db.close());

describe('push_register', () => {
  it('checks the address and the platform', async () => {
    await expectError(db.rpc(ann, 'push_register', { p_token: 'nothex', p_platform: 'ios' }), 'bad_token');
    await expectError(db.rpc(ann, 'push_register', { p_token: 'short', p_platform: 'android' }), 'bad_token');
    await expectError(db.rpc(ann, 'push_register', { p_token: IOS, p_platform: 'web' }), 'bad_platform');
    await expect(db.rpc(null, 'push_register', { p_token: IOS, p_platform: 'ios' })).rejects.toThrow();
  });
  it('starts from the default switches and keeps only known ones', async () => {
    const r = await db.rpc(ann, 'push_register', { p_token: IOS, p_platform: 'ios', p_app: '1.0.0 (240)' });
    expect(r.kinds).toEqual(['fox', 'leviathan', 'friends', 'land']);
    const r2 = await db.rpc(ann, 'push_register', { p_token: IOS, p_platform: 'ios', p_kinds: ['visits', 'friends', 'spam'] });
    expect(r2.kinds).toEqual(['friends', 'visits']);
    // a refresh without switches keeps the player's own
    expect((await db.rpc(ann, 'push_register', { p_token: IOS, p_platform: 'ios' })).kinds).toEqual(['friends', 'visits']);
  });
  it('a phone that changes hands belongs to the new player, with the defaults', async () => {
    await db.rpc(bob, 'push_register', { p_token: IOS2, p_platform: 'ios', p_kinds: ['visits'] });
    const r = await db.rpc(cat, 'push_register', { p_token: IOS2, p_platform: 'ios' });
    expect(r.kinds).toEqual(['fox', 'leviathan', 'friends', 'land']);
    expect((await db.sql(`select player_id from private.push_devices where token = $1`, [IOS2]))[0].player_id).toBe(cat);
  });
  it('keeps a player to their last five addresses', async () => {
    for (let i = 0; i < 7; i++) await db.rpc(bob, 'push_register', { p_token: `${i}`.repeat(64), p_platform: 'ios' });
    expect((await db.sql(`select count(*)::int n from private.push_devices where player_id = $1`, [bob]))[0].n).toBe(5);
    await db.sql(`delete from private.push_devices where player_id = $1`, [bob]);
  });
  it('nobody reads the addresses from the app', async () => {
    await expect(db.rpc(ann, 'svc_push_claim', { p_key: await hookKey() })).rejects.toThrow();
    await expect(db.sql(`set local role authenticated; select * from private.push_devices`)).rejects.toThrow();
  });
});

describe('bell alerts become pushes', () => {
  it('only for players with a phone, and only kinds with a switch they have on', async () => {
    await alert(bob, 'friend_request', ann, {}); // bob: no phone
    expect(await outbox(bob)).toHaveLength(0);
    await alert(ann, 'friend_request', bob, {}); // ann: friends on
    await alert(ann, 'leviathan', null, { sub: 'coming' }); // ann: leviathan off
    await alert(ann, 'enchant', bob, { sub: 'nope_not_a_push' }); // never pushes
    const rows = await outbox(ann);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('friends');
    expect(rows[0].alert).toMatchObject({ kind: 'friend_request', actor: 'push_bob' });
  });
  it('the same kind from the same player pushes once per cooldown', async () => {
    await alert(ann, 'friend_request', bob, {});
    await alert(ann, 'visit', bob, { arcade: 'x' });
    await alert(ann, 'visit', bob, { arcade: 'x' });
    await alert(ann, 'visit', cat, { arcade: 'x' });
    expect((await outbox(ann)).map((r) => r.kind)).toEqual(['friends', 'visits', 'visits']);
  });
  it('never gets in the way of the alert itself', async () => {
    await db.sql(`update game_config set value = value || '{"cooldown_s": "abc"}' where key = 'phone_push'`); // the queueing fails
    await alert(ann, 'party_invite', bob, { name: 'Night owls' });
    expect((await db.sql(`select count(*)::int n from player_notifications where player_id = $1 and kind = 'party_invite'`, [ann]))[0].n).toBe(1);
    await db.sql(`update game_config set value = '{"on": true, "ios": true, "android": true, "daily_cap": 30, "cooldown_s": 600}' where key = 'phone_push'`);
  });
});

describe('the sender', () => {
  it('needs the database’s key', async () => {
    await expectError(db.rpc(svc, 'svc_push_claim', { p_key: 'guess' }), 'forbidden');
    await expectError(db.rpc(svc, 'svc_push_done', { p_key: null, p_results: [] }), 'forbidden');
  });
  it('claims due pushes once, with the phones they go to, and hears back', async () => {
    await db.rpc(ann, 'push_register', { p_token: FCM, p_platform: 'android', p_kinds: ['friends'] });
    const key = await hookKey();
    const { items } = await db.rpc(svc, 'svc_push_claim', { p_key: key });
    const fr = items.find((i: any) => i.kind === 'friends');
    expect(fr.devices.map((d: any) => d.platform).sort()).toEqual(['android', 'ios']);
    const vis = items.filter((i: any) => i.kind === 'visits');
    expect(vis.every((i: any) => i.devices.length === 1 && i.devices[0].token === IOS)).toBe(true);
    expect((await db.rpc(svc, 'svc_push_claim', { p_key: key })).items).toEqual([]); // taken
    await db.rpc(svc, 'svc_push_done', { p_key: key, p_results: [
      { id: fr.id, sent: 1, dead: [FCM], sandbox: [IOS] },
      ...vis.map((i: any) => ({ id: i.id, sent: 0, error: 'BadDeviceToken' })),
    ] });
    const rows = await outbox(ann);
    expect(rows.find((r) => String(r.id) === String(fr.id)).result).toBe('sent');
    expect(rows.filter((r) => r.kind === 'visits').every((r) => r.result === 'BadDeviceToken')).toBe(true);
    expect(await db.sql(`select token from private.push_devices where token = $1`, [FCM])).toHaveLength(0);
    expect((await db.sql(`select apns_env from private.push_devices where token = $1`, [IOS]))[0].apns_env).toBe('sandbox');
  });
  it('a push with nowhere to go, an old one, and the daily cap', async () => {
    const key = await hookKey();
    await db.rpc(ann, 'push_register', { p_token: IOS, p_platform: 'ios', p_kinds: ['friends'] });
    await db.sql(`insert into private.push_outbox (player_id, kind, title, body) values ($1, 'land', 't', 'b'), ($1, 'friends', 'old', 'b')`, [ann]);
    await db.sql(`update private.push_outbox set send_at = now() - interval '3 hours' where title = 'old'`);
    expect((await db.rpc(svc, 'svc_push_claim', { p_key: key })).items).toEqual([]);
    expect((await outbox(ann)).slice(-2).map((r) => r.result)).toEqual(['no_device', 'expired']);
    await db.sql(`update game_config set value = value || '{"daily_cap": 1}' where key = 'phone_push'`);
    await db.sql(`insert into private.push_outbox (player_id, kind, title, body) values ($1, 'friends', 'over', 'b')`, [ann]);
    expect((await db.rpc(svc, 'svc_push_claim', { p_key: key })).items).toEqual([]);
    expect((await outbox(ann)).at(-1).result).toBe('capped');
    // …but a test push always goes
    expect(await db.rpc(ann, 'push_test')).toMatchObject({ ok: true, devices: 1 });
    expect((await db.rpc(svc, 'svc_push_claim', { p_key: key })).items.map((i: any) => i.kind)).toEqual(['test']);
    await db.sql(`update game_config set value = value || '{"daily_cap": 30}' where key = 'phone_push'`);
  });
  it('the kill switch and a platform switch', async () => {
    const key = await hookKey();
    await db.sql(`insert into private.push_outbox (player_id, kind, title, body) values ($1, 'friends', 'x', 'b')`, [ann]);
    await db.sql(`update game_config set value = value || '{"on": false}' where key = 'phone_push'`);
    expect(await db.rpc(svc, 'svc_push_claim', { p_key: key })).toMatchObject({ off: true, items: [] });
    await db.sql(`update game_config set value = value || '{"on": true, "ios": false}' where key = 'phone_push'`);
    await db.rpc(svc, 'svc_push_claim', { p_key: key });
    expect((await outbox(ann)).at(-1).result).toBe('no_device');
    await db.sql(`update game_config set value = value || '{"ios": true}' where key = 'phone_push'`);
  });
  it('a test push says when there is no phone', async () => {
    expect(await db.rpc(bob, 'push_test')).toMatchObject({ ok: false, devices: 0 });
  });
});

describe('a fox at the egg', () => {
  it('is found once per visit, and not sent once it has been chased', async () => {
    await db.rpc(bob, 'push_register', { p_token: IOS2, p_platform: 'ios', p_kinds: ['fox'] });
    const g = (await db.sql(`insert into enchantments (gx, gy, owner_id, kind, serial, sigil, nickname) values (7, 7, $1, 'goose', 990001, 4242, 'Honk') returning id`, [bob]))[0].id;
    // the egg was laid so that its first fox arrived a minute ago
    await db.sql(`update enchantments set state = jsonb_build_object('egg_at', extract(epoch from now()) - (private.goose_visits(e, 0, 0))[1] - 60, 'eggs', 0)
                  from enchantments e where e.id = $1 and enchantments.id = e.id`, [g]);
    expect((await db.sql(`select private.push_foxes() n`))[0].n).toBe(1);
    expect((await db.sql(`select private.push_foxes() n`))[0].n).toBe(0);
    const [row] = (await outbox(bob)).filter((r) => r.kind === 'fox');
    expect(row).toMatchObject({ title: '🦊 A fox is at your egg!', to_path: `/grimoire/${g}` });
    expect(row.body).toContain('Honk');
    // chased before the sender got to it: it doesn't go
    await db.sql(`update enchantments set state = state || '{"chased": [0]}' where id = $1`, [g]);
    expect((await db.rpc(svc, 'svc_push_claim', { p_key: await hookKey() })).items.filter((i: any) => i.kind === 'fox')).toEqual([]);
    expect((await outbox(bob)).find((r) => r.kind === 'fox').result).toBe('stale');
  });
  it('the minute beat runs without pg_cron or pg_net and tidies up', async () => {
    await db.sql(`update private.push_outbox set created_at = now() - interval '4 days' where player_id = $1`, [ann]);
    await db.sql(`select private.push_tick()`);
    expect(await outbox(ann)).toHaveLength(0);
  });
});

describe('waking the sender', () => {
  it('calls the push function with the key, once per transaction and every few seconds', async () => {
    await db.sql(`create schema if not exists net; create table if not exists net.calls (url text, headers jsonb);
      create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
      returns bigint language sql as $$ insert into net.calls values (url, headers); select 1::bigint $$;`);
    await db.sql(`insert into game_config (key, value, description) values ('push', '{"url": "https://api.example.test", "key": "pk"}', 'test') on conflict (key) do update set value = excluded.value`);
    await db.sql(`update private.push_hook set kicked_at = '-infinity'`);
    await alert(ann, 'party_invite', cat, {});
    await alert(ann, 'friend_request', cat, {});
    const calls = await db.sql(`select * from net.calls`);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.example.test/functions/v1/push');
    expect(calls[0].headers['x-landvas-push']).toBe(await hookKey());
    await db.sql(`select private.push_kick()`);
    expect(await db.sql(`select * from net.calls`)).toHaveLength(1); // too soon
    await db.sql(`select private.push_kick(true)`);
    expect(await db.sql(`select * from net.calls`)).toHaveLength(2);
  });
});
