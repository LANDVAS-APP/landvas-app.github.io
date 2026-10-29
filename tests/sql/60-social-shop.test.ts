// v0.5: mystery plots, the shop and explorer outfits, profile pictures,
// referrals, friends, global chat, the live feed and USD -> Ink conversion.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
afterAll(() => db.close());
beforeAll(async () => {
  await db.init();
});

/** Run raw SQL as a client role (like a direct PostgREST query would). */
async function asRole(role: 'anon' | 'authenticated', uid: string | null, sql: string) {
  const c = db.admin;
  await c.query('begin');
  try {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid ?? '', role })]);
    await c.query(`set local role ${role}`);
    const r = await c.query(sql);
    await c.query('commit');
    return r.rows;
  } catch (e) {
    await c.query('rollback');
    throw e;
  }
}

async function winMinigame(uid: string, gx: number, gy: number) {
  const game = (await db.rpc(uid, 'plot_details', { p_gx: gx, p_gy: gy })).type_info.minigame;
  const sess = await db.rpc(uid, 'start_minigame', { p_game: game, p_level: await db.nextLevel(uid, gx, gy), p_gx: gx, p_gy: gy });
  return db.rpc({ role: 'service_role' }, 'svc_finish_minigame', {
    p_session_id: sess.session_id,
    p_result: { valid: true, passed: true, score: 400, stars: 3, flags: [], suspicious: false, min_duration_ms: 0 },
  });
}

describe('mystery plots', () => {
  let p: string;
  const H = { gx: 1_200_000, gy: 1_500_000 };
  beforeAll(async () => {
    p = await db.newPlayer('mystery1');
    await db.placeAt(p, H.gx, H.gy);
  });

  it('an unclaimed plot reveals neither type, minigame, rarity nor rent — not even in the price', async () => {
    const d = await db.rpc(p, 'plot_details', { p_gx: H.gx, p_gy: H.gy });
    expect(d.mystery).toBe(true);
    for (const k of ['plot_type', 'type_info', 'rarity', 'rarity_info', 'rent']) expect(d[k] ?? null).toBeNull();
    expect(Object.keys(d.acquire).sort()).toEqual(['ink', 'owned', 'starter_available']);
    for (const n of d.neighbors) { expect(n.plot_type).toBeNull(); expect(n.rarity).toBeNull(); }
  });

  it('types and rarities come from a keyed hash: neighbours say nothing about each other', async () => {
    const rows = await db.sql<{ same_t: number; same_r: number; n: number }>(`
      select count(*) filter (where private.plot_type_for(gx, gy) = private.plot_type_for(gx + 1, gy))::int as same_t,
             count(*) filter (where private.plot_rarity_for(gx, gy) = private.plot_rarity_for(gx + 1, gy))::int as same_r,
             count(*)::int as n
      from generate_series(5000, 6999) gx, (values (4242)) v(gy)`);
    // independent plots agree by chance only (about 26% for types, 36% for rarities)
    expect(rows[0].same_t / rows[0].n).toBeLessThan(0.4);
    expect(rows[0].same_r / rows[0].n).toBeLessThan(0.5);
    // the key itself is never readable by players
    await expectError(asRole('authenticated', p, 'select * from private.secrets'), 'permission denied');
  });

  it('nobody can look up where someone else’s land or art is by reading the tables directly', async () => {
    const other = await db.newPlayer('mystery2');
    await db.placeAt(other, H.gx + 40, H.gy);
    await db.rpc(other, 'claim_starter_plot', { p_gx: H.gx + 40, p_gy: H.gy });
    for (const t of ['world_plots', 'canvas_groups', 'canvas_group_members', 'artwork_publications']) {
      await expectError(asRole('anon', null, `select * from public.${t} limit 1`), 'permission denied');
    }
    // signed-in players see only their own rows (Supabase Storage's upload rules rely on that)
    const mine = await asRole('authenticated', other, 'select owner_id from public.world_plots');
    expect(mine.length).toBe(1);
    expect(mine[0].owner_id).toBe(other);
    expect(await asRole('authenticated', p, `select * from public.world_plots where owner_id = '${other}'`)).toHaveLength(0);
    expect(await asRole('authenticated', p, `select * from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id where g.owner_id = '${other}'`)).toHaveLength(0);
  });

  it('the real Supabase storage rules let players upload pictures, drafts and artwork to their own folders', async () => {
    // a minimal stand-in for Supabase's storage schema, then the production storage migrations on top
    await db.sql(`
      create schema if not exists storage;
      create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid default auth.uid());
      create or replace function storage.foldername(name text) returns text[] language sql immutable as $f$
        select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $f$;
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon, authenticated;
      grant select, insert, update on storage.objects to authenticated;
      grant execute on function storage.foldername(text) to anon, authenticated;`);
    const fs = await import('node:fs');
    const path = await import('node:path');
    for (const f of ['20261026000009_storage.sql', '20261027000015_avatar_storage.sql']) {
      await db.sql(fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations', f), 'utf8'));
    }
    const name = `${p}/${'ab'.repeat(32)}.webp`;
    await asRole('authenticated', p, `insert into storage.objects (bucket_id, name) values ('avatars', '${name}')`);
    await asRole('authenticated', p, `insert into storage.objects (bucket_id, name) values ('drafts', '${p}/${'cd'.repeat(32)}.png')`);
    await expectError(asRole('authenticated', p, `insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-4000-8000-000000000000/${'ef'.repeat(32)}.webp')`), 'row-level security');
    const listed = await asRole('authenticated', p, `select name from storage.objects where bucket_id = 'avatars'`);
    expect(listed.map((r: any) => r.name)).toContain(name);
    const prof = await db.rpc(p, 'set_avatar_image', { p_path: name });
    expect(prof.avatar_path).toBe(name);
  });

  it('claiming reveals everything', async () => {
    const r = await db.rpc(p, 'claim_starter_plot', { p_gx: H.gx, p_gy: H.gy });
    expect(r.type_info.minigame).toBeTruthy();
    expect(r.rarity_info.id).toBe(r.rarity);
    const d = await db.rpc(null, 'plot_details', { p_gx: H.gx, p_gy: H.gy });
    expect(d.mystery).toBe(false);
    expect(d.plot_type).toBe(r.plot_type);
  });
});

describe('shop, explorer outfits and profile pictures', () => {
  let s: string;
  beforeAll(async () => {
    s = await db.newPlayer('shopper1');
    await db.giveInk(s, 400);
  });

  it('art tools and cosmetics cost Ink; free items are owned by everyone', async () => {
    const r = await db.rpc(s, 'purchase_unlock', { p_key: 'explorer.hat.crown', p_idempotency_key: 'buy-crown-1' });
    expect(r.unlocks).toContain('explorer.hat.crown');
    expect(r.balances.ink).toBe(200);
    await expectError(db.rpc(s, 'purchase_unlock', { p_key: 'explorer.hat.beret', p_idempotency_key: 'buy-beret-1' }), 'already_unlocked');
    const t = await db.rpc(s, 'purchase_unlock', { p_key: 'tool.mixer', p_idempotency_key: 'buy-mixer-1' });
    expect(t.balances.ink).toBe(80);
    await expectError(db.rpc(s, 'purchase_unlock', { p_key: 'explorer.hat.halo', p_idempotency_key: 'buy-halo-1' }), 'insufficient_funds');
  });

  it('you can only wear what you own', async () => {
    const pr = await db.rpc(s, 'equip_explorer', { p_style: { hat: 'crown', trail: 'none' } });
    expect(pr.explorer_style).toEqual({ hat: 'crown', hold: 'brush', outfit: 'accent', trail: 'none', aura: 'accent' });
    await expectError(db.rpc(s, 'equip_explorer', { p_style: { hat: 'halo' } }), 'not_owned');
    await expectError(db.rpc(s, 'equip_explorer', { p_style: { hat: 'sombrero' } }), 'unknown_item');
    const pub = await db.rpc(null, 'profile_by_username', { p_username: 'shopper1' });
    expect(pub.profile.explorer_style.hat).toBe('crown');
  });

  it('profile pictures must live in your own folder; moderators can remove them', async () => {
    const path = `${s}/${'ab'.repeat(16)}.webp`;
    expect((await db.rpc(s, 'set_avatar_image', { p_path: path })).avatar_path).toBe(path);
    const other = await db.newPlayer('shopper2');
    await expectError(db.rpc(other, 'set_avatar_image', { p_path: path }), 'invalid_avatar');
    await expectError(db.rpc(s, 'set_avatar_image', { p_path: `${s}/../evil.webp` }), 'invalid_avatar');
    const mod = await db.newPlayer('modavatar');
    await db.sql(`insert into admin_roles (player_id, role) values ($1, 'moderator')`, [mod]);
    expect((await db.rpc(mod, 'admin_clear_avatar', { p_player_id: s, p_reason: 'test' })).avatar_path).toBeNull();
  });
});

describe('referrals', () => {
  let a: string, b: string, c: string;
  const P = { gx: 1_210_000, gy: 1_500_000 };
  beforeAll(async () => {
    a = await db.newPlayer('inviter1');
    b = await db.newPlayer('newbie1');
    c = await db.newPlayer('newbie2');
  });

  it('everyone has a code; one custom code per account, forever', async () => {
    const r = await db.rpc(a, 'my_referrals');
    expect(r.default_code).toBe('INVITER1');
    expect(r.reward_ink).toBe(500);
    const m = await db.rpc(a, 'create_referral_code', { p_code: 'paint_party' });
    expect(m.custom_code).toBe('PAINT_PARTY');
    await expectError(db.rpc(a, 'create_referral_code', { p_code: 'ANOTHER1' }), 'custom_code_exists');
    await expectError(db.rpc(b, 'create_referral_code', { p_code: 'PAINT_PARTY' }), 'code_taken');
    await expectError(db.rpc(b, 'create_referral_code', { p_code: 'INVITER1' }), 'code_taken');
    await expectError(db.rpc(b, 'create_referral_code', { p_code: 'f u' }), 'invalid_referral_code');
  });

  it('the inviter earns 500 Ink once the new player wins their first minigame', async () => {
    await expectError(db.rpc(a, 'redeem_referral', { p_code: 'PAINT_PARTY' }), 'cannot_refer_self');
    const r = await db.rpc(b, 'redeem_referral', { p_code: 'paint_party' });
    expect(r.referred_by.player.username).toBe('inviter1');
    await expectError(db.rpc(b, 'redeem_referral', { p_code: 'INVITER1' }), 'already_referred');
    const before = (await db.rpc(a, 'my_state')).balances.ink;
    await db.placeAt(b, P.gx, P.gy);
    await db.rpc(b, 'claim_starter_plot', { p_gx: P.gx, p_gy: P.gy });
    expect((await db.rpc(a, 'my_referrals')).stats.pending).toBe(1);
    await winMinigame(b, P.gx, P.gy);
    const after = await db.rpc(a, 'my_referrals');
    expect(after.stats.rewarded).toBe(1);
    expect(after.stats.earned_ink).toBe(500);
    // …plus the earnings share: 10% of the Ink the new player won
    const won = Number((await db.sql(`select coalesce(sum(delta), 0) s from resource_ledger where player_id = $1 and resource = 'ink' and reason = 'minigame'`, [b]))[0].s);
    expect(after.stats.share_ink).toBe(Math.floor(won * 0.1));
    expect((await db.rpc(a, 'my_state')).balances.ink).toBe(before + 500 + Math.floor(won * 0.1));
    const ledger = await db.sql(`select reason from resource_ledger where player_id = $1 and resource = 'ink' and delta > 0`, [a]);
    expect(new Set(ledger.map((l: any) => l.reason))).toEqual(new Set(won >= 10 ? ['referral', 'referral_share'] : ['referral']));
  });

  it('the earnings share stops at its cap and can be switched off', async () => {
    const cap = async (n: number, enabled = true) => {
      const v = (await db.sql(`select value from game_config where key = 'referrals'`))[0].value;
      await db.sql(`update game_config set value = $1 where key = 'referrals'`, [{ ...v, share: { enabled, pct: 10, cap_ink: n } }]);
    };
    await cap(1000);
    const before = (await db.rpc(a, 'my_referrals')).stats.share_ink;
    await db.sql(`select private.grant($1, '{"ink": 25000}'::jsonb, 'minigame', null, null, null)`, [b]);
    expect((await db.rpc(a, 'my_referrals')).stats.share_ink).toBe(1000); // 10% of 25,000 is 2,500, capped at 1,000
    await db.sql(`select private.grant($1, '{"ink": 5000}'::jsonb, 'minigame', null, null, null)`, [b]);
    expect((await db.rpc(a, 'my_referrals')).stats.share_ink).toBe(1000);
    await cap(5000, false);
    await db.sql(`select private.grant($1, '{"ink": 5000}'::jsonb, 'minigame', null, null, null)`, [b]);
    expect((await db.rpc(a, 'my_referrals')).stats.share_ink).toBe(1000); // switched off: nothing more
    expect(before).toBeGreaterThanOrEqual(0);
    await cap(1000);
  });

  it('usernames work as codes too, and the window closes after a week', async () => {
    await db.sql(`update players set created_at = now() - interval '8 days' where id = $1`, [c]);
    await expectError(db.rpc(c, 'redeem_referral', { p_code: 'inviter1' }), 'referral_window_closed');
    await db.sql(`update players set created_at = now() where id = $1`, [c]);
    expect((await db.rpc(c, 'redeem_referral', { p_code: 'inviter1' })).referred_by.code).toBe('INVITER1');
  });
});

describe('friends', () => {
  let x: string, y: string, z: string;
  beforeAll(async () => {
    x = await db.newPlayer('friendx');
    y = await db.newPlayer('friendy');
    z = await db.newPlayer('friendz');
  });

  it('request, accept, list and remove', async () => {
    expect((await db.rpc(x, 'friend_request', { p_player_id: y })).status).toBe('outgoing');
    await expectError(db.rpc(x, 'friend_request', { p_player_id: y }), 'request_pending');
    expect((await db.rpc(y, 'my_friends')).incoming.map((f: any) => f.player.username)).toEqual(['friendx']);
    expect((await db.rpc(y, 'friend_status', { p_player_id: x })).status).toBe('incoming');
    expect((await db.rpc(y, 'friend_respond', { p_player_id: x, p_accept: true })).status).toBe('friends');
    expect((await db.rpc(x, 'my_friends')).friends.map((f: any) => f.player.username)).toEqual(['friendy']);
    await db.rpc(x, 'friend_remove', { p_player_id: y });
    expect((await db.rpc(y, 'my_friends')).friends).toEqual([]);
  });

  it('a request to someone who already asked you becomes a friendship; blocked players cannot ask', async () => {
    await db.rpc(z, 'friend_request', { p_player_id: x });
    expect((await db.rpc(x, 'friend_request', { p_player_id: z })).status).toBe('friends');
    await db.rpc(y, 'block_player', { p_player_id: x, p_on: true });
    await expectError(db.rpc(x, 'friend_request', { p_player_id: y }), 'not_found');
  });
});

describe('global chat', () => {
  let u: string, v: string, mod: string;
  beforeAll(async () => {
    u = await db.newPlayer('chatter1');
    v = await db.newPlayer('chatter2');
    mod = await db.newPlayer('chatmod');
    await db.sql(`insert into admin_roles (player_id, role) values ($1, 'moderator')`, [mod]);
  });

  it('messages are filtered, rate limited and visible to everyone signed in', async () => {
    const m = await db.rpc(u, 'send_chat_message', { p_body: '  hello   world, this is SH1T  ' });
    expect(m.body).toBe('hello world, this is ****');
    await expectError(db.rpc(u, 'send_chat_message', { p_body: 'again too fast' }), 'rate_limited');
    await expectError(db.rpc(v, 'send_chat_message', { p_body: 'join www.spam.gg now' }), 'chat_links');
    const r = await db.rpc(v, 'chat_recent', {});
    expect(r.messages.map((x: any) => x.body)).toContain('hello world, this is ****');
    expect((await db.rpc(v, 'chat_recent', { p_after_id: m.id })).messages).toEqual([]);
  });

  it('reports reach moderators, who can delete messages and mute players', async () => {
    const m = (await db.rpc(v, 'chat_recent', {})).messages.at(-1);
    await db.rpc(v, 'report_chat_message', { p_message_id: m.id, p_reason: 'rude' });
    const q = await db.sql(`select count(*)::int n from moderation_cases where reason = 'chat_message' and status = 'open'`);
    expect(q[0].n).toBe(1);
    await db.rpc(mod, 'admin_delete_chat_message', { p_message_id: m.id, p_reason: 'rude' });
    expect((await db.rpc(v, 'chat_recent', {})).messages.find((x: any) => x.id === m.id)).toBeUndefined();
    await db.rpc(mod, 'admin_mute_player', { p_player_id: u, p_minutes: 30, p_reason: 'cool off' });
    await db.sql(`delete from private.rate_limits where player_id = $1`, [u]);
    await expectError(db.rpc(u, 'send_chat_message', { p_body: 'let me talk' }), 'chat_muted');
    await expectError(db.rpc(u, 'admin_delete_chat_message', { p_message_id: m.id }), 'forbidden');
  });
});

describe('live feed and USD conversion', () => {
  let f: string;
  const F = { gx: 1_220_000, gy: 1_500_000 };
  beforeAll(async () => {
    f = await db.newPlayer('feeder1');
    await db.placeAt(f, F.gx, F.gy);
    await db.rpc(f, 'claim_starter_plot', { p_gx: F.gx, p_gy: F.gy });
  });

  it('joins, claims and badges appear in the public feed — without locations', async () => {
    const feed = await db.rpc(null, 'feed_recent', { p_limit: 100 });
    const mine = feed.filter((e: any) => e.player.username === 'feeder1').map((e: any) => e.kind);
    expect(mine).toEqual(expect.arrayContaining(['join', 'claim', 'achievement']));
    const claim = feed.find((e: any) => e.player.username === 'feeder1' && e.kind === 'claim');
    expect(claim.data.rarity).toBeTruthy();
    expect(JSON.stringify(feed)).not.toMatch(new RegExp(`${F.gx}|"lng"|"lat"`));
    const newer = await db.rpc(null, 'feed_recent', { p_after_id: feed[0].id });
    expect(newer).toEqual([]);
  });

  it('converts USD rent to Ink at $1 = 100 Ink, from a single cent', async () => {
    await db.sql(`update rent_accounts set balance_usd = 0.015, settled_at = now() where player_id = $1`, [f]);
    const ink0 = (await db.rpc(f, 'my_state')).balances.ink;
    const r = await db.rpc(f, 'convert_usd_to_ink', {});
    expect(r.ink).toBe(1);
    expect(Number(r.usd)).toBeCloseTo(0.01, 12);
    expect(Number(r.rent.balance_usd)).toBeCloseTo(0.005, 9);
    expect(r.balances.ink).toBe(ink0 + 1);
    await expectError(db.rpc(f, 'convert_usd_to_ink', {}), 'conversion_too_small');
    await db.sql(`update rent_accounts set balance_usd = 3.5, settled_at = now() where player_id = $1`, [f]);
    const part = await db.rpc(f, 'convert_usd_to_ink', { p_usd: 1, p_idempotency_key: 'convert-usd-0001' });
    expect(part.ink).toBe(100);
    const again = await db.rpc(f, 'convert_usd_to_ink', { p_usd: 1, p_idempotency_key: 'convert-usd-0001' });
    expect(again.ink).toBe(100);
    expect(Number((await db.rpc(f, 'rent_state')).balance_usd)).toBeCloseTo(2.5, 6);
    const kinds = await db.sql(`select kind from rent_ledger where player_id = $1 and kind = 'convert'`, [f]);
    expect(kinds).toHaveLength(2);
  });
});
