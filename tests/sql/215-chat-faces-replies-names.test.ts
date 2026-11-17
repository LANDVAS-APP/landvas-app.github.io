// 💬 The chats get faces and names worth reading: a name wears the colour of its player's rarest plot (or the rarity
// they chose to show off — one they own), a Phantom keeps its secret, the global chat takes replies (with a quote and
// an alert for the one answered), and tapping a name opens a peek at the player that honours their privacy.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, ben: string, cal: string;
let gx = 905_000;
const unburst = () => db.sql(`delete from private.rate_limits where action like '%chat%' or action = 'name_color'`);
const say = async (u: string, body: string, reply?: number) => { await unburst(); return db.rpc(u, 'send_chat_message', { p_body: body, ...(reply ? { p_reply_to: reply } : {}) }); };
const list = (u: string, after = 0) => db.rpc(u, 'global_chat_list', { p_after: after });
/** a plot of this rarity for this player (straight into the world) */
const plot = (u: string, rarity: string, shiny = false) =>
  db.sql(`insert into world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at, shiny) values ($1, 1500000, 'graphite', $2, $3, now(), $4)`, [gx++, rarity, u, shiny]);
const nameOf = async (u: string) => (await db.sql(`select private.name_rarity($1) r`, [u]))[0].r;

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('cf_ann'); ben = await db.newPlayer('cf_ben'); cal = await db.newPlayer('cf_cal');
});
afterAll(() => db.close());

describe('🎨 names wear their rarest plot', () => {
  it('no land: no colour; then the rarest plot decides — every tier, Primordials above all', async () => {
    expect(await nameOf(ann)).toBeNull();
    await plot(ann, 'common');
    expect(await nameOf(ann)).toBe('common');
    await plot(ann, 'mythic');
    expect(await nameOf(ann)).toBe('mythic');
    await plot(ann, 'volcano'); // an expansion ultra counts above a Mythic (it used to count for nothing)
    expect(await nameOf(ann)).toBe('volcano');
    await plot(ann, 'krakatoa'); // a fusion above a single ultra
    expect(await nameOf(ann)).toBe('krakatoa');
    await plot(ann, 'loom'); // and a Primordial above everything
    expect(await nameOf(ann)).toBe('loom');
    const r = (await db.sql(`select private.rarity_rareness('rift') a, private.rarity_rareness('singularity') b, private.rarity_rareness('common') c`))[0];
    expect(r.a).toBeGreaterThan(r.b);
    expect(r.c).toBe(1);
  });

  it('a Phantom shows as the Common it pretends to be; a Doppelgänger shows its disguise', async () => {
    await plot(ben, 'rare');
    await plot(ben, 'phantom');
    expect(await nameOf(ben)).toBe('rare');
    await plot(ben, 'doppelganger');
    expect(await nameOf(ben)).toBe('rare'); // (no disguise chosen: a Common)
    await db.sql(`insert into rarity_powers (gx, gy, rarity, owner_id, state) select gx, gy, rarity, owner_id, '{"disguise":"legendary"}'::jsonb
                  from world_plots where owner_id = $1 and rarity = 'doppelganger' on conflict (gx, gy) do update set state = excluded.state`, [ben]);
    expect(await nameOf(ben)).toBe('legendary');
    const info = await db.rpc(ben, 'name_color_info', {});
    expect(info.options.map((o: any) => o.rarity)).toEqual(['legendary', 'rare', 'common']);
    expect(info.secret).toBe(true);
    await expectError(db.rpc(ben, 'set_name_color', { p_rarity: 'phantom' }), 'name_color_not_owned');
  });

  it('show off a rarity you own; one you don’t is refused; losing it falls back to the rarest', async () => {
    await expectError(db.rpc(ann, 'set_name_color', { p_rarity: 'genesis' }), 'name_color_not_owned');
    const s = await db.rpc(ann, 'set_name_color', { p_rarity: 'mythic' });
    expect(s).toMatchObject({ pick: 'mythic', shown: 'mythic', auto: 'loom' });
    expect(s.options[0]).toMatchObject({ rarity: 'loom', count: 1 });
    expect(await nameOf(ann)).toBe('mythic');
    // a pick forged straight into the profile is ignored
    await db.sql(`update profiles set name_rarity = 'singularity' where id = $1`, [cal]);
    expect(await nameOf(cal)).toBeNull();
    // the Mythic leaves her: back to her rarest
    await db.sql(`update world_plots set owner_id = $2 where owner_id = $1 and rarity = 'mythic'`, [ann, cal]);
    expect(await nameOf(ann)).toBe('loom');
    expect(await nameOf(cal)).toBe('mythic');
    await db.sql(`update world_plots set owner_id = $1 where owner_id = $2 and rarity = 'mythic'`, [ann, cal]);
    expect((await db.rpc(ann, 'set_name_color', { p_rarity: null })).pick).toBeNull();
  });

  it('every chat line carries it (global and the rooms)', async () => {
    const m = await say(ann, 'look at my name');
    expect(m.player.name_rarity).toBe('loom');
    const l = await list(cal);
    expect(l.items.find((x: any) => x.id === m.id).player.name_rarity).toBe('loom');
    const fns = await db.sql(`select proname from pg_proc where proname in ('party_chat_json', 'planet_chat_json', 'home_chat_json', 'clan_chat_json', 'arcade_chat_json', 'arena_chat_json')
                              and pg_get_functiondef(oid) like '%chat_profile_json%'`);
    expect(fns.length).toBe(6);
  });
});

describe('↩️ replies in the global chat', () => {
  it('a reply carries a quote of what it answers, and the one answered gets an alert', async () => {
    const q = await say(ben, 'who wants to team up?');
    const r = await say(cal, 'me! 🙋', q.id);
    expect(r.reply).toMatchObject({ id: q.id, body: 'who wants to team up?', player: { username: 'cf_ben', name_rarity: 'legendary' } });
    const seen = (await list(ann)).items.find((x: any) => x.id === r.id);
    expect(seen.reply).toMatchObject({ id: q.id, player: { username: 'cf_ben' } });
    const a = await db.sql(`select * from player_notifications where player_id = $1 and kind = 'chat_reply'`, [ben]);
    expect(a.length).toBe(1);
    expect(a[0].actor_id).toBe(cal);
    expect(a[0].data).toMatchObject({ id: r.id, body: 'me! 🙋', to: 'who wants to team up?' });
    // the Social page's list carries it too
    const social = await db.rpc(ann, 'chat_recent', { p_after_id: null, p_limit: 80 });
    expect(social.messages.find((x: any) => x.id === r.id).reply.id).toBe(q.id);
  });

  it('no second alert from the same person within two minutes; none for answering yourself', async () => {
    const q = await say(ben, 'and another thing');
    await say(cal, 'yes?', q.id);
    expect((await db.sql(`select count(*)::int n from player_notifications where player_id = $1 and kind = 'chat_reply'`, [ben]))[0].n).toBe(1);
    const mine = await say(ben, 'replying to myself');
    const self = await say(ben, 'still me', mine.id);
    expect(self.reply.id).toBe(mine.id);
    expect((await db.sql(`select count(*)::int n from player_notifications where player_id = $1 and kind = 'chat_reply'`, [ben]))[0].n).toBe(1);
  });

  it('can’t answer a removed message, a missing one or one from someone you blocked', async () => {
    const q = await say(ann, 'soon gone');
    await db.sql(`update chat_messages set deleted_at = now() where id = $1`, [q.id]);
    await expectError(say(ben, 'too late', q.id), 'reply_not_found');
    await expectError(say(ben, 'nothing there', 999_999_999), 'reply_not_found');
    const p = await say(ann, 'blocked words');
    await db.rpc(ben, 'block_player', { p_player_id: ann, p_on: true });
    await expectError(say(ben, 'no', p.id), 'reply_not_found');
    await db.rpc(ben, 'block_player', { p_player_id: ann, p_on: false });
  });

  it('a quote of something since removed says so; one from someone you blocked stays hidden', async () => {
    const q = await say(ann, 'a quotable line');
    const r = await say(cal, 'nice', q.id);
    await db.sql(`update chat_messages set deleted_at = now() where id = $1`, [q.id]);
    expect((await list(ben)).items.find((x: any) => x.id === r.id).reply).toEqual({ id: q.id, gone: true });
    const q2 = await say(ann, 'another quotable line');
    const r2 = await say(cal, 'also nice', q2.id);
    await db.rpc(ben, 'block_player', { p_player_id: ann, p_on: true });
    expect((await list(ben)).items.find((x: any) => x.id === r2.id).reply).toEqual({ id: q2.id, hidden: true });
    await db.rpc(ben, 'block_player', { p_player_id: ann, p_on: false });
  });
});

describe('👀 a peek at a player', () => {
  it('their face, name colour, rarest plot, stats, friend state and clan', async () => {
    await plot(cal, 'epic');
    await db.sql(`update world_plots set shiny = true where owner_id = $1 and rarity = 'epic'`, [cal]);
    const p = await db.rpc(ben, 'player_peek', { p_player: cal });
    expect(p).toMatchObject({ is_me: false, friend: 'none', blocked: false, profile: { username: 'cf_cal', name_rarity: 'epic' },
      rarest: { rarity: 'epic', count: 1, shiny: 1, picked: false } });
    expect(p.stats).toMatchObject({ plots: 1, ultras: 0, artworks: 0 });
    const me = await db.rpc(ann, 'player_peek', { p_player: ann });
    expect(me.is_me).toBe(true);
    expect(me.friend).toBeNull();
    expect(me.stats.ultras).toBeGreaterThanOrEqual(3);
  });

  it('a Phantom stays a Common in someone else’s peek (and on their profile)', async () => {
    const p = await db.rpc(cal, 'player_peek', { p_player: ben });
    expect(p.rarest.rarity).toBe('legendary');
    const prof = await db.rpc(cal, 'profile_by_username', { p_username: 'cf_ben' });
    expect(prof.showcase.rarest.rarity).toBe('legendary');
    const own = await db.rpc(ben, 'profile_by_username', { p_username: 'cf_ben' });
    expect(own.showcase.rarest.rarity).toBe('doppelganger');
  });

  it('private stats stay private; blocked players can’t peek; signed out: no', async () => {
    await db.rpc(cal, 'set_privacy', { p_patch: { profile_stats: false } });
    expect((await db.rpc(ben, 'player_peek', { p_player: cal })).stats).toBeNull();
    expect((await db.rpc(cal, 'player_peek', { p_player: cal })).stats).toBeTruthy();
    await db.rpc(cal, 'block_player', { p_player_id: ben, p_on: true });
    await expectError(db.rpc(ben, 'player_peek', { p_player: cal }), 'not_found');
    await db.rpc(cal, 'block_player', { p_player_id: ben, p_on: false });
    await expect(db.rpc(null, 'player_peek', { p_player: cal })).rejects.toBeTruthy();
  });
});
