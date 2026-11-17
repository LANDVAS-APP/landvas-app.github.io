// Invite cards: a player picks how their invite link looks (theme, emoji, headline, message, what to show off); the
// landing page reads it for anyone (signed out too); the site builds a link page per saved card and marks it built.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let amy: string, ben: string;
const set = (uid: string, o: Partial<{ theme: string; emoji: string | null; headline: string | null; message: string | null; showcase: string; art: string | null }> = {}) =>
  db.rpc(uid, 'invite_card_set', { p_theme: o.theme ?? 'sunset', p_emoji: o.emoji === undefined ? '🎨' : o.emoji, p_headline: o.headline === undefined ? 'Paint the world with me' : o.headline,
    p_message: o.message === undefined ? 'Claim a free plot next to mine.' : o.message, p_showcase: o.showcase ?? 'plots', p_art_id: o.art ?? null });

beforeAll(async () => {
  await db.init({ ungated: true });
  amy = await db.newPlayer('card_amy'); ben = await db.newPlayer('card_ben');
});
afterAll(() => db.close());

describe('your own card', () => {
  it('starts as the default (not saved), with the themes and emojis to pick from', async () => {
    const c = await db.rpc(amy, 'my_invite_card');
    expect(c).toMatchObject({ saved: false, theme: 'aurora', showcase: 'plots', headline: null, page_codes: [] });
    expect(c.themes).toHaveLength(8);
    expect(c.emojis).toContain('👑');
    expect(c.stats).toMatchObject({ plots: 0, art: 0, crew: 0 });
  });
  it('saves a theme, an emoji and tidy words', async () => {
    const c = await set(amy, { headline: '  Paint   the world with me  ' });
    expect(c).toMatchObject({ saved: true, theme: 'sunset', emoji: '🎨', headline: 'Paint the world with me', message: 'Claim a free plot next to mine.', showcase: 'plots' });
    expect((await set(amy, { headline: '', message: null, emoji: null, theme: 'crown', showcase: 'none' }))).toMatchObject({ headline: null, message: null, emoji: null, theme: 'crown', showcase: 'none' });
  });
  it('refuses what doesn’t belong: unknown themes, links, blocked words, too long, someone else’s art', async () => {
    await expectError(set(amy, { theme: 'neon_pink' }), 'invite_card_theme');
    await expectError(set(amy, { emoji: '💩' }), 'invite_card_text');
    await expectError(set(amy, { message: 'join at free-ink.com now' }), 'invite_card_links');
    await expectError(set(amy, { message: 'visit https://example.org' }), 'invite_card_links');
    await expectError(set(amy, { headline: 'this game is shit' }), 'invite_card_language');
    await expectError(set(amy, { headline: 'x'.repeat(61) }), 'invite_card_too_long');
    await expectError(set(amy, { message: '<script>' }), 'invite_card_text');
    await expectError(set(amy, { showcase: 'art', art: '00000000-0000-0000-0000-000000000001' }), 'invite_card_art');
    await expectError(set(amy, { showcase: 'everything' }), 'invite_card_showcase');
    await expectError(db.rpc(null, 'invite_card_set', { p_theme: 'sunset', p_emoji: null, p_headline: null, p_message: null, p_showcase: 'none', p_art_id: null }), 'permission denied');
  });
  it('the preview picture lives in the player’s own folder', async () => {
    await expectError(db.rpc(ben, 'invite_card_image', { p_path: `${ben}/${'a'.repeat(64)}.png` }), 'invite_card_image'); // (no card yet)
    await expectError(db.rpc(amy, 'invite_card_image', { p_path: `${ben}/${'a'.repeat(64)}.png` }), 'invite_card_image');
    await expectError(db.rpc(amy, 'invite_card_image', { p_path: `${amy}/../x.png` }), 'invite_card_image');
    expect((await db.rpc(amy, 'invite_card_image', { p_path: `${amy}/${'b'.repeat(64)}.png` })).image_path).toBe(`${amy}/${'b'.repeat(64)}.png`);
  });
});

describe('the landing page', () => {
  it('anyone (signed out too) sees who invited them, their card and what they get', async () => {
    await set(amy, { theme: 'ocean', emoji: '👑', headline: 'Build an empire with me', message: 'Free plot, no catch.' });
    const p = await db.rpc(null, 'invite_card', { p_code: 'card_amy' });
    expect(p).toMatchObject({ code: 'CARD_AMY', enabled: true, is_me: false, player: { username: 'card_amy' },
      card: { saved: true, theme: 'ocean', emoji: '👑', headline: 'Build an empire with me', message: 'Free plot, no catch.' } });
    expect(p.player.id).toBeUndefined();
    expect(p.card.page_codes).toBeUndefined();
    expect(typeof p.referee_reward_ink).toBe('number');
    expect((await db.rpc(amy, 'invite_card', { p_code: 'CARD_AMY' })).is_me).toBe(true);
  });
  it('a custom code works too; a code that doesn’t exist, or a suspended player’s, shows nothing', async () => {
    await db.rpc(amy, 'create_referral_code', { p_code: 'AMYPAINTS' });
    expect((await db.rpc(null, 'invite_card', { p_code: 'amypaints' })).player.username).toBe('card_amy');
    expect(await db.rpc(null, 'invite_card', { p_code: 'NOPE_NOPE' })).toBeNull();
    expect(await db.rpc(null, 'invite_card', { p_code: 'x; drop' })).toBeNull();
    // a player who never saved a card still has a page (the default card)
    expect((await db.rpc(null, 'invite_card', { p_code: 'CARD_BEN' })).card).toMatchObject({ saved: false, theme: 'aurora' });
    await db.sql(`update players set status = 'suspended' where id = $1`, [ben]);
    expect(await db.rpc(null, 'invite_card', { p_code: 'CARD_BEN' })).toBeNull();
    await db.sql(`update players set status = 'active' where id = $1`, [ben]);
  });
});

describe('link pages', () => {
  it('the build lists every saved card (both codes), never a banned player’s', async () => {
    await set(ben, { headline: 'Ben’s crew' });
    const all = await db.rpc(null, 'invite_cards_for_pages');
    const a = all.find((x: any) => x.username === 'card_amy');
    expect(a).toMatchObject({ headline: 'Build an empire with me', emoji: '👑' });
    expect(a.codes.sort()).toEqual(['AMYPAINTS', 'CARD_AMY']);
    await db.sql(`update players set status = 'banned' where id = $1`, [ben]);
    expect((await db.rpc(null, 'invite_cards_for_pages')).some((x: any) => x.username === 'card_ben')).toBe(false);
    await db.sql(`update players set status = 'active' where id = $1`, [ben]);
  });
  it('once the deploy has built them, the card knows its codes have pages', async () => {
    expect((await db.sql(`select private.invite_pages_built(array['AMYPAINTS', 'CARD_AMY', 'CARD_BEN']) n`))[0].n).toBe(2);
    expect((await db.rpc(amy, 'my_invite_card')).page_codes.sort()).toEqual(['AMYPAINTS', 'CARD_AMY']);
    await expectError(db.rpc(amy, 'invite_pages_built', { p_codes: ['X'] }), '');
  });
  it('staff can switch cards off: no changes, the plain card everywhere, no custom pages — and back on, as they were', async () => {
    await db.sql(`update game_config set value = value || '{"cards": {"enabled": false}}'::jsonb where key = 'referrals'`);
    await expectError(set(amy), 'invite_cards_off');
    expect((await db.rpc(amy, 'my_invite_card')).enabled).toBe(false);
    expect((await db.rpc(null, 'invite_card', { p_code: 'CARD_AMY' })).card).toMatchObject({ saved: false, theme: 'aurora', headline: null });
    expect(await db.rpc(null, 'invite_cards_for_pages')).toEqual([]);
    await db.sql(`update game_config set value = value - 'cards' where key = 'referrals'`);
    expect((await db.rpc(amy, 'my_invite_card')).enabled).toBe(true);
    expect((await db.rpc(null, 'invite_card', { p_code: 'CARD_AMY' })).card).toMatchObject({ saved: true, headline: 'Build an empire with me' });
  });
});
