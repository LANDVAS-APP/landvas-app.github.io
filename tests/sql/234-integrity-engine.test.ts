// The integrity engine v2: honest players (families, carriers, identical phones, players whose rent ticks all night,
// VPN users) stay clear; referral farms, account switchers, double payouts, balances changed outside the ledger, sources
// paying one player far beyond anyone, tampered arcade scores and mechanics repeated far beyond anyone are caught —
// and staff get a radar of the whole game and a referral-fraud list.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let admin: string;
const svc = { role: 'service_role' as const };
const ping = (uid: string, ip: string, s: Record<string, unknown>) => db.rpc(svc, 'svc_integrity_ping', { p_player: uid, p_ip: ip, p_signals: s });
const scan = (uid: string) => db.rpc(admin, 'admin_integrity_player', { p_player: uid });
const keys = (r: any) => r.signals.map((s: any) => s.key);
const email = (uid: string, e: string) => db.sql(`update auth.users set email = $2 where id = $1`, [uid, e]);
const verify = (uid: string) => db.sql(`insert into private.email_verifications (user_id, via) values ($1, 'test') on conflict do nothing`, [uid]);
const earn = (uid: string, n: number, reason = 'minigame', refType: string | null = null, refId: string | null = null) =>
  db.sql(`select private.ledger_apply($1, 'ink', $2, $3, $4, $5)`, [uid, n, reason, refType, refId]);
const play = (uid: string, n: number, at = "now() - interval '3 days'", every = '17 minutes') => db.sql(`insert into minigame_sessions (player_id, game, level, seed, gx, gy, status, expires_at, passed, play_ms, started_at, finished_at)
  select $1::uuid, 'tracecraft', 5, k, 1, 1, 'validated', now() + interval '1 hour', true, 30000 + (k % 7) * 1500, ${at} + k * interval '${every}', ${at} + k * interval '${every}' + (30000 + (k % 7) * 1500) * interval '1 millisecond'
  from generate_series(1, $2) k`, [uid, n]);
const invite = (from: string, to: string, ago = '10 days') => db.sql(`insert into referrals (referee_id, referrer_id, code, status, reward_ink, created_at, qualified_at)
  values ($2, $1, 'X', 'rewarded', 500, now() - $3::interval, now() - $3::interval)`, [from, to, ago]);
const old = (uid: string, ago = '10 days') => db.sql(`update players set created_at = now() - $2::interval where id = $1`, [uid, ago]);
const player = async (name: string, mail?: string) => { const u = await db.newPlayer(name); if (mail) await email(u, mail); return u; };

beforeAll(async () => {
  await db.init({ ungated: true, freePlots: 1 });
  admin = await db.newPlayer('mod_max');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner'), ($1, 'moderator') on conflict do nothing`, [admin]);
});
afterAll(() => db.close());

describe('reading emails', () => {
  it('tells keyboard mashes and random letters from real names', async () => {
    const g = async (e: string) => Number((await db.sql(`select private.email_gibberish($1) g`, [e]))[0].g);
    for (const e of ['john.smith@gmail.com', 'christopher.nguyen@outlook.com', 'ahmed.khan2001@gmail.com', 'srinivasan.k@gmail.com', 'przemyslaw@wp.pl', 'mary@icloud.com'])
      expect(await g(e), e).toBeLessThan(0.5);
    for (const e of ['xk7q2m9z@gmail.com', 'asdfghjkl@yahoo.com', 'zxcvbnm@mail.com', 'kjhsdf8723@gmail.com', 'tvhgqpz@gmail.com'])
      expect(await g(e), e).toBeGreaterThanOrEqual(0.5);
  });
  it('knows throwaway inboxes, by name and by pattern', async () => {
    const [r] = await db.sql(`select private.email_temp('a@10minutemail.com') a, private.email_temp('a@tempmail.plus') b, private.email_temp('a@my-temp-mail.xyz') c,
      private.email_temp('a@mailinator.com') d, private.email_temp('a@gmail.com') e, private.email_temp('a@company.co.uk') f`);
    expect(r).toEqual({ a: true, b: true, c: true, d: true, e: false, f: false });
  });
  it('spots near-copies of an email', async () => {
    const [r] = await db.sql(`select private.email_lookalike('ann.smith@gmail.com', 'annsmith+2@gmail.com') a, private.email_lookalike('ann.smith@gmail.com', 'ann.smith7@yopmail.com') b,
      private.email_lookalike('jessica.parker@gmail.com', 'jessica.parkr@gmail.com') c, private.email_lookalike('mike@gmail.com', 'mary@gmail.com') d,
      private.email_lookalike('sarah.carter@gmail.com', 'lily.carter@gmail.com') e`);
    expect(r.a).toMatch(/same inbox/); expect(r.b).toMatch(/different numbers/); expect(r.c).toMatch(/letters apart/);
    expect(r.d).toBeNull(); expect(r.e).toBeNull();
  });
});

describe('no more false flags', () => {
  it('a busy address (a mobile carrier, a café) links nobody', async () => {
    const crowd: string[] = [];
    const names = ['olivia', 'marcus', 'priya', 'tomasz', 'keiko', 'diego', 'amara', 'liam'];
    for (let i = 0; i < 8; i++) { const u = await player(`${names[i]}_on_wifi`, `${names[i]}.${['reyes', 'okafor', 'shah', 'nowak', 'tanaka', 'silva', 'eze', 'byrne'][i]}@gmail.com`); crowd.push(u); await ping(u, '198.51.100.77', { device_id: `dev-cafe-${i}`, fp: `fp-cafe-${i}` }); }
    await invite(crowd[0], crowd[1]); await old(crowd[1]); await verify(crowd[1]); await play(crowd[1], 12); await earn(crowd[1], 60);
    const r = await scan(crowd[0]);
    expect(keys(r)).not.toContain('shared_ip');
    expect(r.linked.every((x: any) => !x.via.includes('ip'))).toBe(true);
    expect(r.level).toBe('low');
  });
  it('identical phones on different networks aren’t one person', async () => {
    const a = await player('twin_a'), b = await player('twin_b');
    await ping(a, '203.0.113.10', { device_id: 'dev-ta', fp: 'fp-iphone-15-ios18' });
    await ping(b, '192.0.2.99', { device_id: 'dev-tb', fp: 'fp-iphone-15-ios18' });
    const r = await scan(a);
    expect(keys(r)).not.toContain('shared_fingerprint');
    expect(r.level).toBe('low');
  });
  it('a family at home: mum invites her son, he really plays — nobody is flagged', async () => {
    const mum = await player('sarah_c', 'sarah.carter@gmail.com'), son = await player('leo_c', 'leo.carter@gmail.com');
    await ping(mum, '203.0.113.50', { device_id: 'dev-sarah', fp: 'fp-sarah' });
    await ping(son, '203.0.113.50', { device_id: 'dev-leo', fp: 'fp-leo' });
    await invite(mum, son); await old(son); await verify(son); await play(son, 14);
    await db.sql(`insert into room_checkins (host_id, visitor_id, day, visitor_ink, host_ink) select $1, $2, current_date - k, 2, 2 from generate_series(0, 2) k`, [mum, son]);
    const m = await scan(mum);
    expect(m.level).toBe('low');
    const ref = m.referrals.find((x: any) => x.username === 'leo_c');
    expect(ref.suspicion).toBeLessThan(60);
    expect(ref.verified).toBe(true);
    const s = await scan(son);
    expect(['low', 'watch']).toContain(s.level);
    expect(s.signals.find((x: any) => x.key === 'invited_by_linked')?.label ?? '').toMatch(/family or housemates/);
  });
  it('rent, enchantments and invites pay all night — that isn’t "never sleeps"', async () => {
    const r = await player('night_rent');
    await db.sql(`insert into resource_ledger (player_id, resource, delta, balance_after, reason, created_at)
      select $1, 'ink', 1, k, case when k % 2 = 0 then 'rent' else 'enchant' end, date_trunc('day', now()) - interval '2 days' + k * interval '1 hour' from generate_series(1, 47) k`, [r]);
    await db.sql(`update resource_balances set amount = 47 where player_id = $1 and resource = 'ink'`, [r]);
    expect(keys(await scan(r))).not.toContain('no_sleep');
  });
  it('a VPN (or iCloud Private Relay) alone never makes anyone high', async () => {
    const v = await player('vpn_val');
    for (const [ip, i] of [['10.8.0.1', { vpn: true, country: 'NL', as_org: 'NordVPN' }], ['10.8.0.2', { vpn: true, country: 'US', as_org: 'Apple iCloud Private Relay' }],
      ['10.8.0.3', { datacenter: true, country: 'DE', as_org: 'Hetzner' }], ['10.8.0.4', { tor: true, country: 'FR' }]] as const) {
      await db.rpc(svc, 'svc_integrity_intel', { p_ip: ip, p_intel: i });
      await ping(v, ip, { device_id: 'dev-val' });
    }
    const r = await scan(v);
    expect(keys(r)).toEqual(expect.arrayContaining(['vpn', 'tor']));
    expect(['low', 'watch']).toContain(r.level);
    expect(r.families.location).toBeLessThanOrEqual(0.3);
  });
});

describe('referral fraud', () => {
  let farmer: string; const fakes: string[] = [];
  beforeAll(async () => {
    farmer = await player('farmer_joe', 'farmer.joe@gmail.com');
    await ping(farmer, '203.0.113.80', { device_id: 'dev-joe', fp: 'fp-joe' });
    const mails = ['farmer.joe7@gmail.com', 'xk7q2m9z@gmail.com', 'bob@mailinator.com', 'jane@tempmail.plus', 'zxcvbnm1@gmail.com'];
    for (let i = 0; i < mails.length; i++) {
      const u = await player(`joe_fake_${i}`, mails[i]); fakes.push(u);
      await invite(farmer, u, `${10 * 24 * 60 - i * 7} minutes`); await old(u);
      await db.sql(`update auth.users set email_confirmed_at = null where id = $1`, [u]);
    }
    await ping(fakes[0], '203.0.113.80', { device_id: 'dev-joe', fp: 'fp-joe' }); // on his own phone
    await earn(farmer, 2500, 'referral');
  });

  it('scores each invited account on its own: email, link, play, what it paid', async () => {
    const r = await scan(farmer);
    const by = (n: string) => r.referrals.find((x: any) => x.username === n);
    expect(by('joe_fake_0').reasons.join(' | ')).toMatch(/own device/);
    expect(by('joe_fake_0').reasons.join(' | ')).toMatch(/near-copy of the inviter/);
    expect(by('joe_fake_1').reasons.join(' | ')).toMatch(/keyboard-mash|random-letter/);
    expect(by('joe_fake_2').reasons.join(' | ')).toMatch(/throwaway/);
    for (const f of r.referrals) {
      expect(f.verified).toBe(false); expect(f.plays).toBe(0);
      expect(f.reasons.join(' ')).toMatch(/never played a game/);
    }
    expect(by('joe_fake_0').suspicion).toBeGreaterThanOrEqual(85);
  });
  it('a referral farm is severe, with proof', async () => {
    const r = await scan(farmer);
    expect(keys(r)).toEqual(expect.arrayContaining(['fake_referrals', 'self_referral_device', 'junk_signups']));
    expect(r.level).toBe('severe');
    expect(r.proof).toBe(true);
    expect(r.families.referral).toBeGreaterThanOrEqual(0.9);
    expect(r.signals[0].proof).toBe(true); // proof first
  });
  it('the referral list puts the worst inviters first, with every invited account’s evidence; honest inviters stay off it', async () => {
    await expectError(db.rpc(farmer, 'admin_referral_fraud', {}), 'forbidden');
    const l = await db.rpc(admin, 'admin_referral_fraud', { p_min: 1 });
    expect(l.rows[0].player.username).toBe('farmer_joe');
    expect(l.rows[0]).toMatchObject({ invited: 5, never_played: 5, unverified: 5 });
    expect(l.rows[0].fake).toBeGreaterThanOrEqual(4); expect(l.rows[0].temp).toBeGreaterThanOrEqual(2);
    expect(l.rows[0].paid_fake).toBeGreaterThan(0);
    expect(l.rows[0].referees[0].reasons.length).toBeGreaterThan(0);
    expect(l.rows.some((x: any) => x.player.username === 'sarah_c')).toBe(false);
  });
  it('one person switching accounts: the invited account only plays in the gaps of the inviter’s games', async () => {
    const sw = await player('switch_sam', 'sam.rivera@gmail.com'), alt = await player('switch_alt', 'sky.walker@gmail.com');
    await invite(sw, alt); await old(alt); await verify(alt);
    await play(sw, 12, "now() - interval '2 days'", '20 minutes');
    await play(alt, 12, "now() - interval '2 days' + interval '6 minutes'", '20 minutes');
    const r = await scan(sw);
    const a = r.referrals.find((x: any) => x.username === 'switch_alt');
    expect(a.switching).toBe(true);
    expect(a.reasons.join(' ')).toMatch(/switching accounts/);
  });
});

describe('exploits, including ones nobody has found yet', () => {
  let dp: string, mm: string, whale: string, tamper: string, spammer: string; const normals: string[] = [];
  beforeAll(async () => {
    for (let i = 0; i < 6; i++) { const u = await player(`normal_${i}`); normals.push(u); await earn(u, 90 + i * 5); }
    whale = await player('whale_wes'); await earn(whale, 20000);
    dp = await player('double_dee');
    for (let k = 0; k < 3; k++) { const ref = `00000000-0000-4000-8000-00000000000${k}`; for (let j = 0; j < 3; j++) await earn(dp, 40, 'minigame', 'minigame_session', ref); }
    mm = await player('mismatch_mo'); await earn(mm, 100); await db.giveInk(mm, 5000);
    tamper = await player('tamper_tim');
    await db.sql(`insert into arcade_plays (player_id, game, seed, started_at, finished_at, score, claimed_score) select $1, 'snake', k, now() - interval '1 hour', now() - interval '59 minutes', 900, 9000000 from generate_series(1, 3) k`, [tamper]);
    spammer = await player('spam_sid');
    for (const u of normals) await db.sql(`insert into private.fairplay_log (player_id, kind) select $1, 'test_poke' from generate_series(1, 3)`, [u]);
    await db.sql(`insert into private.fairplay_log (player_id, kind) select $1, 'test_poke' from generate_series(1, 400)`, [spammer]);
    await db.sql(`delete from private.integrity_baseline`);
  });

  it('the same payout paid more than once', async () => {
    const r = await scan(dp);
    const s = r.signals.find((x: any) => x.key === 'double_paid');
    expect(s).toMatchObject({ family: 'exploit', proof: true, impact: 240 });
    expect(r.level).toBe('high'); // three times: look now (ten or more, or with anything else, is severe)
  });
  it('an Ink balance changed outside the ledger', async () => {
    const r = await scan(mm);
    expect(r.signals.find((x: any) => x.key === 'balance_mismatch')).toMatchObject({ proof: true });
    expect(r.level).toBe('severe');
  });
  it('a source paying one player far beyond anyone (the abuser doesn’t skew "normal")', async () => {
    const r = await scan(whale);
    const s = r.signals.find((x: any) => x.key === 'source_outlier');
    expect(s.evidence[0].source).toBe('minigame');
    expect(s.impact).toBeGreaterThan(15000);
    expect(r.level).not.toBe('severe'); // a hint to look at, not proof
    expect(keys(await scan(normals[5]))).not.toContain('source_outlier');
  });
  it('arcade scores sent above what’s humanly possible', async () => {
    expect(keys(await scan(tamper))).toContain('arcade_tamper');
  });
  it('any game action repeated far more than anyone does', async () => {
    const r = await scan(spammer);
    expect(r.signals.find((x: any) => x.key === 'repeated_mechanic').evidence[0].action).toBe('test_poke');
    expect(keys(await scan(normals[0]))).not.toContain('repeated_mechanic');
  });
  it('the radar: what’s going wrong in the whole game right now', async () => {
    await expectError(db.rpc(whale, 'admin_exploit_radar', {}), 'forbidden');
    const r = await db.rpc(admin, 'admin_exploit_radar', {});
    const mg = r.sources.find((x: any) => x.source === 'minigame');
    expect(mg).toMatchObject({ key: 'reason:minigame' });
    expect(mg.top.player.username).toBe('whale_wes');
    expect(r.double_paid.find((x: any) => x.ref_type === 'minigame_session')).toMatchObject({ groups: 3, players: 1, extra_ink: 240 });
    expect(r.mismatched.some((x: any) => x.player.username === 'mismatch_mo')).toBe(true);
    expect(r.actions.find((x: any) => x.action === 'test_poke').today).toBeGreaterThanOrEqual(418);
    expect(r.arcade_tamper[0]).toMatchObject({ game: 'snake', plays: 3, players: 1 });
    expect(r.top.length).toBeGreaterThan(0);
    expect(Array.isArray(r.switches_off)).toBe(true);
  });
});

describe('the scanner keeps itself fresh', () => {
  it('rescans active players on its own, and the list shows families and impact', async () => {
    await db.sql(`update private.integrity_scores set scanned_at = now() - interval '1 day'`);
    const [n] = await db.sql(`select private.integrity_auto_scan() n`);
    expect(n.n).toBeGreaterThan(5);
    const l = await db.rpc(admin, 'admin_integrity_list', { p_level: 'flagged' });
    const row = l.rows.find((x: any) => x.player.username === 'farmer_joe');
    expect(row.version).toBe(2);
    expect(row.families.referral).toBeGreaterThan(0.9);
    expect(row.proof).toBe(true);
    expect(l.rows.some((x: any) => x.player.username === 'sarah_c')).toBe(false);
  });
});
