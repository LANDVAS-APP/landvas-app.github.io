// Global chat lines arrive with the push (20261119000530): each new global message is also sent, as the line itself,
// on the private 'global-chat:lines' channel — not from hidden or banned players, not while staff have the global chat
// off — and the nudge older apps listen for still goes out. Realtime isn't part of the test database, so a stand-in
// realtime.send records what would have been sent.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let ann: string, ben: string;
const unburst = () => db.sql(`delete from private.rate_limits where action like '%chat%'`);
const say = async (u: string, body: string) => { await unburst(); return db.rpc(u, 'send_chat_message', { p_body: body }); };
const sent = () => db.sql(`select topic, event, private, payload from realtime.sent order by n`);

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('gl_ann'); ben = await db.newPlayer('gl_ben');
  await db.sql(`create schema if not exists realtime;
    create table realtime.sent (n bigint generated always as identity, payload jsonb, event text, topic text, private boolean);
    create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as
      $$ insert into realtime.sent (payload, event, topic, private) values (payload, event, topic, private) $$;
    create table realtime.messages (topic text, extension text, payload jsonb);
    alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;`);
});
afterAll(() => db.close());

describe('global chat lines', () => {
  it('a new global message goes out as the line itself on the private channel, shaped like the list’s items', async () => {
    const m = await say(ann, 'hello world');
    const s = await sent();
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ topic: 'global-chat:lines', event: 'line', private: true });
    const listed = (await db.rpc(ben, 'global_chat_list', { p_after: 0 })).items.find((x: any) => x.id === m.id);
    expect(s[0].payload).toEqual(listed);
  });

  it('nothing goes out from a hidden or banned player, or while the global chat is switched off', async () => {
    await db.sql(`truncate realtime.sent`);
    await db.sql(`update profiles set is_hidden = true where id = $1`, [ben]);
    await say(ben, 'can you see me');
    await db.sql(`update profiles set is_hidden = false where id = $1`, [ben]);
    await db.sql(`update feature_flags set enabled = false where key = 'global_chat'`);
    await say(ann, 'anyone?').catch(() => null);
    await db.sql(`update feature_flags set enabled = true where key = 'global_chat'`);
    expect(await sent()).toHaveLength(0);
    await say(ben, 'back again');
    expect(await sent()).toHaveLength(1);
  });

  it('a push that fails never stops the message', async () => {
    await db.sql(`create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language plpgsql as $$ begin raise exception 'realtime is down'; end $$`);
    const m = await say(ann, 'still here');
    expect(m.id).toBeGreaterThan(0);
  });

  it('signed-in players may listen on the lines channel, and there is no way to post on it', async () => {
    // run the migration again now that a realtime schema exists, as on Supabase
    await db.sql(fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261119000530_global_chat_lines.sql'), 'utf8'));
    const pol = await db.sql(`select cmd, roles::text, qual from pg_policies where schemaname = 'realtime' and tablename = 'messages'`);
    expect(pol).toHaveLength(1);
    expect(pol[0].cmd).toBe('SELECT');
    expect(pol[0].roles).toContain('authenticated');
    expect(pol[0].qual).toContain('global-chat:lines');
  });
});
