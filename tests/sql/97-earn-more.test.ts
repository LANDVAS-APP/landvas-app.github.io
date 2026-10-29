// v0.15: Paint Pop on Mosaic plots, and more ways to earn Ink — the daily wheel, room
// check-ins, Inspire, the craft bonus, Featured picks and weekly challenges.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
const svc = { role: 'service_role' } as const;
const H = (n: number) => n.toString(16).padStart(64, '0');
let owner: string, ana: string, ben: string, cal: string, kid: string;
const ink = async (uid: string) => Number((await db.sql(`select amount from resource_balances where player_id = $1 and resource = 'ink'`, [uid]))[0]?.amount ?? 0);
const old = (uid: string) => db.sql(`update players set created_at = now() - interval '3 days' where id = $1`, [uid]);
const earnCfg = async () => (await db.rpc(owner, 'admin_config_get')).config.earn.value;
const setEarn = async (patch: (v: any) => any) => db.rpc(owner, 'admin_config_set', { p_key: 'earn', p_value: patch(await earnCfg()) });
let n = 0;
const key = (p: string) => `${p}-test-key-${String(++n).padStart(6, '0')}`;
const spots: Record<string, [number, number]> = {};

/** Paint and publish the player's starter canvas (auto moderation). */
async function publish(uid: string, title: string, craft?: number) {
  const [gx, gy] = spots[uid];
  const g = (await db.rpc(uid, 'my_groups'))[0];
  const p = await db.rpc(uid, 'get_project', { p_project_id: g.project_id });
  const s = await db.rpc(uid, 'save_draft', { p_project_id: g.project_id, p_base_version_id: p.version.id, p_manifest: { layers: [{ id: 'layer-1', name: 'L', tiles: { [`${gx}_${gy}`]: H(++n) } }] } });
  const req = await db.rpc(uid, 'request_publication', { p_project_id: g.project_id, p_version_id: s.version_id, p_title: title, p_rights_affirmed: true });
  await db.rpc(uid, 'submit_publication', { p_publication_id: req.publication_id });
  await db.rpc(svc, 'svc_publication_processed', { p_publication_id: req.publication_id, p_result: { ok: true, screening: { provider: 'none' } } });
  if (craft != null) await db.rpc(svc, 'svc_record_craft', { p_publication_id: req.publication_id, p_craft: { score: craft, colors: 9 } });
  await db.rpc(svc, 'svc_mark_published', { p_publication_id: req.publication_id, p_cell_revs: { [`${gx}_${gy}`]: ++n } });
  return req.publication_id as string;
}

beforeAll(async () => {
  await db.init({ ungated: true });
  owner = await db.newPlayer('earnowner');
  await db.sql(`insert into admin_roles (player_id, role) values ($1, 'owner'), ($1, 'admin') on conflict do nothing`, [owner]);
  const mod = (await db.rpc(owner, 'admin_config_get')).config.moderation.value;
  await db.rpc(owner, 'admin_config_set', { p_key: 'moderation', p_value: { ...mod, mode: 'auto' } });
  ana = await db.newPlayer('ana_paints');
  ben = await db.newPlayer('ben_visits');
  cal = await db.newPlayer('cal_votes');
  kid = await db.newPlayer('new_kid');
  for (const [i, p] of [ana, ben, cal, kid].entries()) {
    spots[p] = [2_300_000 + i * 50, 1_400_000];
    await db.rpc(p, 'claim_starter_plot', { p_gx: spots[p][0], p_gy: spots[p][1] });
  }
  for (const p of [ana, ben, cal]) await old(p);
});
afterAll(() => db.close());

describe('Paint Pop', () => {
  it('replaces PatternShift on Mosaic plots, with 3 rounds', async () => {
    const w = await db.rpc(null, 'world_config');
    expect(w.plot_types.find((t: any) => t.id === 'mosaic').minigame).toBe('paintpop');
    expect(w.minigames.games.paintpop.rounds).toBe(3);
    expect(w.minigames.games.patternshift).toBeUndefined();
  });
});

describe('the daily wheel', () => {
  it('spins once a day for a prize, with the odds shown', async () => {
    const st = await db.rpc(ana, 'wheel_status');
    expect(st.spins_left).toBe(1);
    expect(st.slices.length).toBe(8);
    expect(Math.round(st.slices.reduce((s: number, x: any) => s + Number(x.chance), 0))).toBe(100);
    const r = await db.rpc(ana, 'wheel_spin', { p_idempotency_key: key('wheel') });
    expect(r.prize.label).toBeTruthy();
    expect(r.spins_left).toBe(0);
    await expectError(db.rpc(ana, 'wheel_spin', { p_idempotency_key: key('wheel') }), 'wheel_used');
  });
  it('pays every kind of prize', async () => {
    // a one-slice wheel per kind
    for (const [kind, amount] of [['ink', 7], ['boost', 30], ['joystick', 1], ['pigments', 4]] as const) {
      await setEarn((v) => ({ ...v, wheel: { enabled: true, spins_per_day: 50, slices: [{ label: 'X', kind, amount, weight: 1, color: '#fff' }, { label: 'never', kind: 'ink', amount: 1, weight: 0, color: '#000' }] } }));
      const before = await ink(ben);
      const r = await db.rpc(ben, 'wheel_spin', { p_idempotency_key: key('wheel') });
      expect(r.prize.kind).toBe(kind);
      if (kind === 'ink') expect(await ink(ben)).toBe(before + 7);
      if (kind === 'boost') expect((await db.sql(`select boost_until > now() + interval '25 minutes' b from rent_accounts where player_id = $1`, [ben]))[0].b).toBe(true);
    }
    await expectError(setEarn((v) => ({ ...v, wheel: { ...v.wheel, slices: [{ label: 'bad', kind: 'cash', amount: 1, weight: 1 }, { label: 'b', kind: 'ink', amount: 1, weight: 1 }] } })), 'invalid_earn_config');
  });
});

describe('room check-ins', () => {
  it('pay the visitor and the host once a day, after a short look around', async () => {
    const st = await db.rpc(ben, 'room_enter', { p_username: 'ana_paints' });
    expect(st.checked_in).toBe(false);
    await expectError(db.rpc(ben, 'room_checkin', { p_username: 'ana_paints' }), 'look_around_first');
    await db.sql(`update room_visits set entered_at = now() - interval '20 seconds'`);
    const [bv, av] = [await ink(ben), await ink(ana)];
    const r = await db.rpc(ben, 'room_checkin', { p_username: 'ana_paints' });
    expect(r.earned).toBe(2);
    expect(r.host_earned).toBe(2);
    expect(await ink(ben)).toBe(bv + 2);
    expect(await ink(ana)).toBe(av + 2);
    await expectError(db.rpc(ben, 'room_checkin', { p_username: 'ana_paints' }), 'already_checked_in');
    await db.rpc(ana, 'room_enter', { p_username: 'ana_paints' });
    await expectError(db.rpc(ana, 'room_checkin', { p_username: 'ana_paints' }), 'own_room');
  });
  it('new accounts check in but earn nothing (so extra accounts can’t farm a room)', async () => {
    await db.rpc(kid, 'room_enter', { p_username: 'ana_paints' });
    await db.sql(`update room_visits set entered_at = now() - interval '20 seconds'`);
    const av = await ink(ana);
    const r = await db.rpc(kid, 'room_checkin', { p_username: 'ana_paints' });
    expect(r.earned).toBe(0);
    expect(r.host_earned).toBe(0);
    expect(await ink(ana)).toBe(av);
  });
});

describe('Inspire, the craft bonus and Featured', () => {
  let art: string;
  it('craft pays the best tier reached, scaled by canvas size, and only improvements pay again', async () => {
    const before = await ink(ana);
    art = await publish(ana, 'Sunrise', 65);
    expect(await ink(ana)).toBe(before + 12); // 60+ tier
    const card = (await db.rpc(ana, 'artwork_detail', { p_publication_id: art }));
    expect(card.craft_score ?? card.card?.craft_score).toBe(65);
    const b2 = await ink(ana);
    await publish(ana, 'Sunrise again', 62); // same tier: nothing more
    expect(await ink(ana)).toBe(b2);
    art = await publish(ana, 'Sunrise, better', 85); // 80+ tier: pays the difference
    expect(await ink(ana)).toBe(b2 + 25 - 12);
  });
  it('inspiring art pays its artist (and the inspirer a little), once per piece', async () => {
    const [av, cv] = [await ink(ana), await ink(cal)];
    const r = await db.rpc(cal, 'appreciate', { p_publication_id: art, p_on: true });
    expect(r.artist_ink).toBe(2);
    expect(r.earned).toBe(1);
    expect(await ink(ana)).toBe(av + 2);
    expect(await ink(cal)).toBe(cv + 1);
    await db.rpc(cal, 'appreciate', { p_publication_id: art, p_on: false });
    const again = await db.rpc(cal, 'appreciate', { p_publication_id: art, p_on: true });
    expect(again.artist_ink).toBe(0); // un-inspiring and re-inspiring pays nothing
    const k = await db.rpc(kid, 'appreciate', { p_publication_id: art, p_on: true });
    expect(k.artist_ink).toBe(0); // too new to pay out
  });
  it('a staff Featured pick pays the artist once and shows on the card', async () => {
    const av = await ink(ana);
    await db.rpc(owner, 'admin_feature', { p_publication_id: art, p_section: 'featured', p_on: true });
    await db.rpc(owner, 'admin_feature', { p_publication_id: art, p_section: 'staff_pick', p_on: true });
    expect(await ink(ana)).toBe(av + 25);
    const feed = await db.rpc(ana, 'feed_recent', { p_limit: 50 });
    expect(feed.some((e: any) => e.kind === 'featured')).toBe(true);
  });
});

describe('weekly challenges', () => {
  it('take entries made for the theme, count votes from established accounts, and pay the podium', async () => {
    const start = new Date(Date.now() - 3600_000).toISOString(), end = new Date(Date.now() + 86400_000).toISOString();
    const list = await db.rpc(owner, 'admin_challenge_save', { p_id: null, p_title: 'Neon city', p_theme: 'Glowing streets at night', p_starts_at: start, p_ends_at: end, p_prizes: [100, 50, 25], p_entry_ink: 5 });
    const ch = list[0].id;
    const artA = await publish(ana, 'Neon A');
    const artB = await publish(ben, 'Neon B');
    const av = await ink(ana);
    await db.rpc(ana, 'challenge_enter', { p_challenge_id: ch, p_publication_id: artA });
    expect(await ink(ana)).toBe(av + 5);
    await db.rpc(ben, 'challenge_enter', { p_challenge_id: ch, p_publication_id: artB });
    await expectError(db.rpc(ana, 'challenge_vote', { p_challenge_id: ch, p_publication_id: artA }), 'cannot_vote_own');
    await expectError(db.rpc(kid, 'challenge_vote', { p_challenge_id: ch, p_publication_id: artA }), 'account_too_new_to_vote');
    await db.rpc(cal, 'challenge_vote', { p_challenge_id: ch, p_publication_id: artA });
    await db.rpc(ben, 'challenge_vote', { p_challenge_id: ch, p_publication_id: artA });
    await db.rpc(ana, 'challenge_vote', { p_challenge_id: ch, p_publication_id: artB });
    const cur = await db.rpc(cal, 'challenges_current');
    expect(cur.active[0].entries[0].votes).toBe(2);
    expect(cur.active[0].my_votes_left).toBe(2);
    // the week ends
    await db.sql(`update challenges set ends_at = now() - interval '1 minute' where id = $1`, [ch]);
    const [a0, b0] = [await ink(ana), await ink(ben)];
    const done = await db.rpc(cal, 'challenges_current');
    expect(done.past[0].entries.map((e: any) => e.place)).toEqual([1, 2]);
    expect(await ink(ana)).toBe(a0 + 100);
    expect(await ink(ben)).toBe(b0 + 50);
    await expectError(db.rpc(ana, 'challenge_enter', { p_challenge_id: ch, p_publication_id: artA }), 'challenge_closed');
  });
});

describe('one place to see it all', () => {
  it('lists today’s ways to earn', async () => {
    const o = await db.rpc(ben, 'earn_overview');
    expect(o.rooms.paid_today).toBe(1);
    expect(o.inspire.artist_ink).toBe(2);
    expect(o.craft.tiers.length).toBe(3);
    await expectError(db.rpc(ben, 'admin_challenges'), 'forbidden');
  });
});
