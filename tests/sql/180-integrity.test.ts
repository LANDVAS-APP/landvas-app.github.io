// Integrity: signals (devices, fingerprints, hashed addresses, VPNs, emulators), the pattern scanner, penalties and undo,
// and what a restricted player sees.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';

const db = new TestDb();
let admin: string, alpha: string, alt1: string, alt2: string, honest: string, speedy: string, vpner: string, botty: string;
const svc = { role: 'service_role' as const };
const ping = (uid: string, ip: string, s: Record<string, unknown>) => db.rpc(svc, 'svc_integrity_ping', { p_player: uid, p_ip: ip, p_signals: s });
const arr = (...ids: string[]) => `{${ids.join(',')}}`;
const scan = (uid: string) => db.rpc(admin, 'admin_integrity_player', { p_player: uid });
const keys = (r: any) => r.signals.map((s: any) => s.key);

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 1 });
  admin = await db.newPlayer('mod_mia');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner'), ($1, 'moderator') on conflict do nothing`, [admin]);
  // a self-referrer: two "friends" on her own phone, with look-alike emails
  alpha = await db.newPlayer('alpha_ann');
  alt1 = await db.newPlayer('alt_one'); alt2 = await db.newPlayer('alt_two');
  await db.sql(`update auth.users set email = 'ann.smith@gmail.com' where id = $1`, [alpha]);
  await db.sql(`update auth.users set email = 'annsmith+2@gmail.com' where id = $1`, [alt1]);
  await db.sql(`update auth.users set email = 'ann.smith7@yopmail.com' where id = $1`, [alt2]);
  await db.sql(`insert into referrals (referee_id, referrer_id, code, status, reward_ink, created_at, qualified_at) values
    ($2, $1, 'ANN', 'rewarded', 500, now() - interval '10 days', now() - interval '10 days'),
    ($3, $1, 'ANN', 'rewarded', 500, now() - interval '10 days' + interval '5 minutes', now() - interval '10 days')`, [alpha, alt1, alt2]);
  for (const u of [alpha, alt1, alt2]) await ping(u, '203.0.113.7', { device_id: 'dev-ann-phone', fp: 'fp-ann', platform: 'android', tz: 'America/Denver' });
  // the alts inspire her art
  const pub = (await db.sql(`select id from artwork_publications limit 1`))[0]?.id;
  if (pub) await db.sql(`update artwork_publications set owner_id = $1 where id = $2`, [alpha, pub]);
  // an honest player on a different device
  honest = await db.newPlayer('honest_hal');
  await ping(honest, '198.51.100.20', { device_id: 'dev-hal', fp: 'fp-hal', platform: 'ios' });
});
afterAll(() => db.close());

describe('signals', () => {
  it('records devices and networks, but never the raw address', async () => {
    const rows = await db.sql(`select * from private.sightings where player_id = $1`, [alpha]);
    expect(rows.length).toBe(1);
    expect(rows[0].ip_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(rows)).not.toContain('203.0.113');
    const all = await db.sql(`select string_agg(t::text, ' ') s from private.sightings t`);
    expect(all[0].s).not.toContain('203.0.113.7');
  });
  it('asks the Edge Function to look the address up once, then remembers', async () => {
    const r1 = await ping(honest, '192.0.2.50', { device_id: 'dev-hal' });
    expect(r1.lookup).toBe(true);
    await db.rpc(svc, 'svc_integrity_intel', { p_ip: '192.0.2.50', p_intel: { country: 'US', asn: 7922, as_org: 'Comcast', vpn: false, datacenter: false } });
    const r2 = await ping(honest, '192.0.2.50', { device_id: 'dev-hal' });
    expect(r2.lookup).toBe(false);
  });
  it('players can’t call the service functions', async () => {
    await expect(db.rpc(alpha, 'svc_integrity_ping', { p_player: alpha, p_ip: '1.1.1.1', p_signals: {} })).rejects.toThrow();
  });
});

describe('the scanner', () => {
  it('catches a self-referrer: shared device, look-alike and throwaway emails, alts that stopped playing', async () => {
    const r = await scan(alpha);
    expect(keys(r)).toEqual(expect.arrayContaining(['shared_device', 'self_referral_device', 'self_referral_email', 'disposable_referrals']));
    expect(['high', 'severe']).toContain(r.level);
    expect(r.score).toBeGreaterThanOrEqual(45);
    const linked = r.linked.map((x: any) => x.username).sort();
    expect(linked).toEqual(['alt_one', 'alt_two']);
    expect(r.referrals.find((x: any) => x.username === 'alt_one').email).toBe('annsmith+2@gmail.com');
    expect(r.devices[0].shared_with).toBe(2);
    expect(JSON.stringify(r)).not.toContain('203.0.113');
  });
  it('profiles every invited account: email tricks, link, play, and its own suspicion', async () => {
    const r = await scan(alpha);
    const a1 = r.referrals.find((x: any) => x.username === 'alt_one');
    expect(a1.linked_via).toContain('device');
    expect(a1.email_flags.join(' ')).toMatch(/\+tag alias/);
    expect(a1.suspicion).toBeGreaterThanOrEqual(50);
    expect(a1.reasons.join(' ')).toMatch(/same device as the inviter/);
    const a2 = r.referrals.find((x: any) => x.username === 'alt_two');
    expect(a2.email_flags.join(' ')).toMatch(/throwaway/);
    expect(keys(r)).toContain('suspicious_referral_tree');
    expect(r.signals.find((x: any) => x.key === 'self_referral_device').points).toBeGreaterThanOrEqual(60);
  });
  it('alts that vote for the inviter’s Sketch of the Day win, inspire and stamp their art', async () => {
    const sk = (await db.sql(`insert into sketches (player_id, day, word, submitted_at, votes, place, prize) values ($1, date_trunc('day', now()) - interval '2 days', 'dragon', now() - interval '2 days', 3, 1, 100) returning id`, [alpha]))[0].id;
    await db.sql(`insert into sketch_votes (sketch_id, voter_id, day) values ($1, $2, now() - interval '2 days'), ($1, $3, now() - interval '2 days'), ($1, $4, now() - interval '2 days')`, [sk, alt1, alt2, honest]);
    const r = await scan(alpha);
    expect(keys(r)).toEqual(expect.arrayContaining(['propped_wins', 'referrals_boost_referrer']));
    const w = r.signals.find((x: any) => x.key === 'propped_wins').evidence[0];
    expect(w).toMatchObject({ kind: 'Sketch of the Day', place: 1, votes: 3, from_own: 2 });
    expect(r.referrals.find((x: any) => x.username === 'alt_one').help['sketch votes']).toBe(1);
  });
  it('the alts are flagged too (invited by an account on their own device)', async () => {
    expect(keys(await scan(alt1))).toEqual(expect.arrayContaining(['shared_device', 'invited_by_linked']));
  });
  it('an honest player stays clear', async () => {
    const r = await scan(honest);
    expect(r.level).toBe('low'); expect(r.signals).toEqual([]);
  });
  it('linked accounts feeding Ink (room check-ins) are a severe signal', async () => {
    await db.sql(`insert into room_checkins (host_id, visitor_id, day, visitor_ink, host_ink) select $1, $2, current_date - k, 2, 2 from generate_series(0, 4) k`, [alpha, alt1]);
    const r = await scan(alpha);
    const s = r.signals.find((x: any) => x.key === 'linked_inflows');
    expect(s.severity).toBe('severe'); expect(s.evidence[0].username).toBe('alt_one');
    expect(r.inflows.find((x: any) => x.username === 'alt_one').linked).toBe(true);
  });
  it('impossible speed: wins far faster than the fastest 5% of everyone', async () => {
    speedy = await db.newPlayer('speedy_sam');
    for (const o of [honest, alt1, alt2]) await db.sql(`insert into minigame_sessions (player_id, game, level, seed, gx, gy, status, expires_at, passed, play_ms, started_at, finished_at)
      select $1::uuid, 'tracecraft', 5, k, 1, 1, 'validated', now() + interval '1 hour', true, 20000 + k * 300, now() - interval '1 day', now() - interval '1 day' from generate_series(1, 10) k`, [o]);
    await db.sql(`insert into minigame_sessions (player_id, game, level, seed, gx, gy, status, expires_at, passed, play_ms, started_at, finished_at)
      select $1::uuid, 'tracecraft', 5, k, 1, 1, 'validated', now() + interval '1 hour', true, 2000, now() - interval '2 hours' + k * interval '37 seconds', now() from generate_series(1, 15) k`, [speedy]);
    await db.sql(`delete from private.integrity_baseline`);
    const r = await scan(speedy);
    expect(keys(r)).toContain('impossible_speed');
    expect(keys(r)).not.toContain('steady_timing'); // 15 plays is too few to call it a script
    expect(keys(await scan(honest))).not.toContain('impossible_speed');
  });
  it('machine-steady timing between plays looks like a script', async () => {
    botty = await db.newPlayer('botty_bo');
    await db.sql(`insert into arcade_plays (player_id, game, seed, started_at) select $1, 'snake', k, now() - interval '3 hours' + k * interval '30 seconds' from generate_series(1, 60) k`, [botty]);
    await ping(botty, '198.51.100.99', { device_id: 'dev-bot', automation: true, reasons: ['navigator.webdriver'] });
    const r = await scan(botty);
    expect(keys(r)).toEqual(expect.arrayContaining(['steady_timing', 'automation']));
    expect(r.level).not.toBe('low');
  });
  it('VPNs, Tor and emulators are weighed', async () => {
    vpner = await db.newPlayer('vpn_vic');
    for (const [ip, i] of [['10.9.0.1', { vpn: true, country: 'NL', as_org: 'NordVPN' }], ['10.9.0.2', { datacenter: true, country: 'DE', as_org: 'Hetzner' }], ['10.9.0.3', { tor: true, country: 'FR' }]] as const) {
      await db.rpc(svc, 'svc_integrity_intel', { p_ip: ip, p_intel: i });
      await ping(vpner, ip, { device_id: 'dev-vic', emulator: true, reasons: ['gpu:SwiftShader'] });
    }
    const r = await scan(vpner);
    expect(keys(r)).toEqual(expect.arrayContaining(['vpn', 'tor', 'emulator']));
    expect(r.networks.some((n: any) => n.provider === 'NordVPN' && n.vpn)).toBe(true);
  });
  it('the admin list ranks everyone by risk; players can’t see it', async () => {
    await db.rpc(admin, 'admin_integrity_scan', { p_offset: 0, p_limit: 100 });
    const l = await db.rpc(admin, 'admin_integrity_list', { p_level: 'flagged' });
    expect(l.rows[0].score).toBeGreaterThanOrEqual(l.rows[l.rows.length - 1].score);
    expect(l.rows.some((x: any) => x.player.username === 'alpha_ann')).toBe(true);
    expect(l.rows.some((x: any) => x.player.username === 'honest_hal')).toBe(false);
    await expect(db.rpc(alpha, 'admin_integrity_list', {})).rejects.toThrow(/forbidden|admin/);
  });
});

describe('penalties', () => {
  let action: number;
  it('previews the invite Ink and the plots bought with it', async () => {
    await db.sql(`insert into resource_ledger (player_id, resource, delta, balance_after, reason) values ($1, 'ink', 1000, 0, 'referral')`, [alpha]);
    await db.giveInk(alpha, 300);
    // three plots she bought for 100 Ink each
    for (let i = 0; i < 3; i++) {
      await db.sql(`insert into world_plots (gx, gy, owner_id, plot_type, rarity, claimed_at) values ($1, 5000, $2, (select id from plot_types limit 1), 'common', now())`, [5000 + i, alpha]);
      await db.sql(`insert into plot_ownership (gx, gy, player_id, method, cost, acquired_at) values ($1, 5000, $2, 'acquire', '{"ink":100}', now() - ($3 || ' minutes')::interval)`, [5000 + i, alpha, 10 - i]);
    }
    const [p] = await db.rpc(admin, 'admin_integrity_preview', { p_players: arr(alpha), p_scope: { referrals: true, plots: true, extra: 400 } });
    expect(p.plan.target).toBe(1400); expect(p.plan.balance).toBe(300); expect(p.plan.take).toBe(300);
    expect(p.plan.plots.length).toBe(3); expect(p.plan.plots[0].gx).toBe(5002); // newest first
  });
  it('suspends with a reason and proof, takes the Ink and those plots', async () => {
    const until = new Date(Date.now() + 7 * 864e5).toISOString();
    const r = await db.rpc(admin, 'admin_integrity_act', { p_players: arr(alpha), p_kind: 'suspend', p_until: until, p_preset: 'self_referral',
      p_reason: 'You invited accounts you control to collect invite bonuses.', p_proof: ['2 invited accounts use your phone', 'Look-alike emails'], p_scope: { referrals: true, plots: true },
      p_announce: '{name} was suspended for 7 days for self-referring with alt accounts.' });
    action = r.results[0].action;
    expect(r.results[0].ink_removed).toBe(300);
    const bal = (await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [alpha]))[0].amount;
    expect(Number(bal)).toBe(0);
    expect((await db.sql(`select count(*)::int n from world_plots where owner_id = $1 and gx between 5000 and 5002`, [alpha]))[0].n).toBe(0);
    await expect(db.rpc(alpha, 'luck_status', {})).rejects.toThrow(/account_restricted/);
  });
  it('everyone sees the announcement in the live chat, marked as moderation', async () => {
    await db.sql(`insert into player_blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing`, [honest, alpha]).catch(() => {});
    const c = await db.rpc(honest, 'chat_recent', {});
    const m = c.messages.find((x: any) => x.kind === 'moderation');
    expect(m.body).toBe('@alpha_ann was suspended for 7 days for self-referring with alt accounts.'); expect(m.data.action).toBe('suspend'); expect(m.player.username).toBe('alpha_ann');
  });
  it('the player sees why, the proof and where to appeal', async () => {
    const m = await db.rpc(alpha, 'my_restriction', {});
    expect(m).toMatchObject({ status: 'suspended', title: 'Self-referral', appeal_email: 'dev@landvas.app', ink_removed: 300, plots_removed: 3 });
    expect(m.proof).toEqual(['2 invited accounts use your phone', 'Look-alike emails']);
    expect(await db.rpc(honest, 'my_restriction', {})).toBeNull();
  });
  it('undo gives the Ink back (with what the plots cost) and lifts it', async () => {
    const u = await db.rpc(admin, 'admin_integrity_undo', { p_action: action });
    expect(u.ink_returned).toBe(600);
    expect((await db.sql(`select status from players where id = $1`, [alpha]))[0].status).toBe('active');
    await expect(db.rpc(admin, 'admin_integrity_undo', { p_action: action })).rejects.toThrow(/already_undone/);
    const c = await db.rpc(honest, 'chat_recent', {});
    expect(c.messages.some((x: any) => x.kind === 'moderation')).toBe(false); // the announcement comes down too
  });
  it('a moderator without the economy role can restrict but not take Ink', async () => {
    const mod = await db.newPlayer('mod_only');
    await db.sql(`insert into admin_roles (player_id, role) values ($1, 'moderator')`, [mod]);
    await expect(db.rpc(mod, 'admin_integrity_act', { p_players: arr(alt2), p_kind: 'ban', p_until: null, p_preset: 'multi_account', p_reason: 'Alt account', p_proof: [], p_scope: { all: true } })).rejects.toThrow(/forbidden/);
    const r = await db.rpc(mod, 'admin_integrity_act', { p_players: arr(alt2), p_kind: 'ban', p_until: null, p_preset: 'multi_account', p_reason: 'Alt account', p_proof: [], p_scope: {} });
    expect(r.results[0].ink_removed).toBe(0);
    expect((await db.rpc(alt2, 'my_restriction', {})).status).toBe('banned');
  });
});

describe('ban announcements reach the live chat and feed from every path', () => {
  const notices = async (viewer: string) => {
    const chat = (await db.rpc(viewer, 'chat_recent', {})).messages.filter((m: any) => m.kind === 'moderation');
    const feed = (await db.rpc(viewer, 'feed_recent', { p_limit: 100 })).filter((e: any) => e.kind === 'moderation');
    return { chat, feed };
  };
  it('the Players tab Ban button posts a default notice (chat + feed), even to players who hid feed activity', async () => {
    const v = await db.newPlayer('banme_ben');
    await db.rpc(v, 'set_privacy', { p_patch: { feed: false } });
    await db.rpc(admin, 'admin_set_player_status', { p_player_id: v, p_status: 'banned', p_reason: 'Self-referring with alts' });
    const n = await notices(honest);
    expect(n.chat.some((m: any) => m.body === '@banme_ben was banned for: Self-referring with alts.' && m.data.action === 'ban')).toBe(true);
    expect(n.feed.some((e: any) => e.player.username === 'banme_ben' && /was banned/.test(e.data.summary))).toBe(true);
  });
  it('a custom summary is used as written', async () => {
    const v = await db.newPlayer('susp_sue');
    await db.rpc(admin, 'admin_set_player_status', { p_player_id: v, p_status: 'suspended', p_until: new Date(Date.now() + 864e5).toISOString(), p_reason: 'x', p_announce: '{name} was suspended for vote farming.' });
    expect((await notices(honest)).chat.some((m: any) => m.body === '@susp_sue was suspended for vote farming.')).toBe(true);
    // reactivating takes the notices down
    await db.rpc(admin, 'admin_set_player_status', { p_player_id: v, p_status: 'active', p_reason: '' });
    const n = await notices(honest);
    expect(n.chat.some((m: any) => /susp_sue/.test(m.body))).toBe(false);
    expect(n.feed.some((e: any) => e.player.username === 'susp_sue')).toBe(false);
  });
  it('the Integrity panel with the announcement switched off posts nothing; with it on, exactly one notice', async () => {
    const q = await db.newPlayer('quiet_quin'), l = await db.newPlayer('loud_lou');
    await db.rpc(admin, 'admin_integrity_act', { p_players: `{${q}}`, p_kind: 'ban', p_until: null, p_preset: 'other', p_reason: 'Quiet ban', p_proof: [], p_scope: {}, p_announce: null });
    await db.rpc(admin, 'admin_integrity_act', { p_players: `{${l}}`, p_kind: 'ban', p_until: null, p_preset: 'other', p_reason: 'Loud ban', p_proof: [], p_scope: {}, p_announce: '{name} was banned for cheating.' });
    const n = await notices(honest);
    expect(n.chat.some((m: any) => /quiet_quin/.test(m.body))).toBe(false);
    expect(n.chat.filter((m: any) => /loud_lou/.test(m.body)).length).toBe(1);
    expect(n.feed.filter((e: any) => e.player.username === 'loud_lou').length).toBe(1);
  });
});
