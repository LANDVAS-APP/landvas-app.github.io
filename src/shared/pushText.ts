// What a push says. The database copies push-worthy bell alerts into the push outbox (20261120000100_phone_push.sql,
// private.push_category); the push Edge Function turns each into a title, a line of text and where tapping it goes.
// The wording follows the bell (src/updates/Notifications.tsx), shortened for a lock screen. Any alert the bell shows
// that has no line here still gets a plain one for its switch, so nothing queued is ever dropped for want of words.
import { DEFAULT_RARITIES } from './rarity';

export type PushAlert = { kind: string; sub?: string | null; data?: Record<string, any> | null; actor?: string | null };
export type PushText = { title: string; body: string; to: string };

/** the push switches, as Settings shows them (ids match private.push_kinds_all) */
export const PUSH_KINDS: { id: string; label: string; hint: string; on: boolean }[] = [
  { id: 'fox', label: '🦊 A fox at your egg', hint: 'Your Golden Goose’s egg has a visitor — chase it off before it bites.', on: true },
  { id: 'leviathan', label: '🐉 The Leviathan', hint: 'Heading for your plots, trampled them, or fallen (your share).', on: true },
  { id: 'friends', label: '👋 Friends and parties', hint: 'Friend requests, party invites, replies, splice invites, waves.', on: true },
  { id: 'land', label: '🗺️ Your land and enchantments', hint: 'Parasites, pranks, treasure finds, ultras’ powers, your stars.', on: true },
  { id: 'visits', label: '🏠 Visitors', hint: 'Someone visits your room, arcade, farm or base, or signs your guestbook.', on: false },
];

const CATEGORY_FALLBACK: Record<string, PushText> = {
  fox: { title: '🦊 A fox is at your egg!', body: 'Chase it off before it takes a bite.', to: '/grimoire' },
  leviathan: { title: '🐉 The Leviathan', body: 'Something’s happening with the Leviathan — take a look.', to: '/world' },
  friends: { title: '👋 LANDVAS', body: 'Someone’s reaching out to you.', to: '/together' },
  land: { title: '🗺️ Your land', body: 'Something happened on your land.', to: '/world' },
  visits: { title: '🏠 A visitor', body: 'Someone came by.', to: '/world' },
  test: { title: '🔔 Pushes work!', body: 'This is how LANDVAS reaches you when the app is closed.', to: '/settings' },
};

const num = (n: unknown) => Number(n ?? 0).toLocaleString('en-US');
const ink = (n: unknown) => (Number(n) > 0 ? ` (+${num(n)} Ink)` : '');
const rarity = (r: unknown) => {
  const i = DEFAULT_RARITIES.find((x) => x.id === r);
  return i ? `${i.emoji ? `${i.emoji} ` : ''}${i.name}` : String(r ?? 'rare').replace(/_/g, ' ');
};
const clip = (s: unknown, n = 90) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const fly = (d: Record<string, any>, z: number) => (d.gx != null ? `/world?fly=${d.gx},${d.gy}&z=${z}` : '/world');

/** the words for one bell alert, or null if this alert never pushes */
function alertText(a: PushAlert): PushText | null {
  const d = (a.data ?? {}) as Record<string, any>;
  const who = a.actor ? `@${a.actor}` : 'Someone';
  switch (a.kind) {
    case 'friend_request': return { title: '👋 Friend request', body: `${who} sent you a friend request`, to: '/social' };
    case 'friend_accept': return { title: '🤝 New friend', body: `${who} accepted your friend request`, to: a.actor ? `/u/${a.actor}` : '/social' };
    case 'party_invite': return { title: '🎉 Party invite', body: `${who} invited you to their party${d.name ? ` “${clip(d.name, 40)}”` : ''}`, to: '/party' };
    case 'party_join': return { title: '🎉 You’re in a party', body: `${who} joined you`, to: '/party' };
    case 'chat_reply': return { title: `💬 ${who} replied`, body: clip(d.body) || 'in the global chat', to: '/social?tab=chat' };
    case 'meet_wave': return { title: '👋 A wave', body: `${who} waved at you — they’re out on GPS ${d.band === 'here' ? 'right by you' : d.band === 'walk' ? 'a short walk away' : 'nearby'}`, to: '/eyes' };
    case 'duet': return { title: '🎨 Duet finished', body: `${who} finished your duet${d.prompt ? `: ${clip(d.prompt, 60)}` : ''}`, to: d.duet_id ? `/duet/${d.duet_id}` : '/duet' };
    case 'playdate': return { title: '💞 A playdate', body: `${who} had a playdate with your ${d.mine ?? 'Inkborn'}${ink(d.tip)}${d.egg ? ' — you got an egg!' : ''}`, to: '/inkborn' };
    case 'gallery':
      if (d.sub === 'loan_request') return { title: '🏛️ A loan request', body: `${who} wants to borrow “${clip(d.title, 40)}” for their museum`, to: '/loans' };
      if (d.sub === 'loan_yes') return { title: '🏛️ Loan agreed', body: `${who} lent you “${clip(d.title, 40)}” — hang it in your Loan Wing`, to: d.group_id ? `/studio/${d.group_id}?room=museum` : '/loans' };
      if (d.sub === 'exhibition') return { title: '✨ Exhibition Night', body: `${who} opened “${clip(d.title, 40)}” — come and take its stamp`, to: d.group_id ? `/studio/${d.group_id}?room=museum` : '/world' };
      return null;
    case 'leviathan':
      switch (d.sub) {
        case 'warning': return { title: '🐉 The Leviathan is coming', body: d.back ? `It’s coming back ${d.where ?? ''} — ×${d.strength ?? 2} stronger. Your damage still counts.`.replace(/\s+/g, ' ') : `Something is rising ${d.where ?? 'from the sea'}. Every player can fight it.`, to: '/world' };
        case 'coming': return { title: d.hunt ? '😡 The ENRAGED Leviathan is hunting you' : `🐉 The Leviathan is coming for you${d.rampage ? ' — on a RAMPAGE' : ''}`, body: 'Get your friends and your enchantments ready.', to: '/world' };
        case 'trampled': return { title: '🐉 Your plots were trampled', body: `The Leviathan trampled your plots${d.place ? ` ${d.place}` : ''} — scrub the ink off to get them paying in full.`, to: '/world' };
        case 'fallen': return { title: '🦴 The Leviathan has fallen!', body: `Your share: #${d.rank ?? '?'}${ink(d.ink)}${d.ticket ? ` and a ${d.ticket} ticket` : ''}`, to: '/world' };
        case 'escaped': return { title: '🌊 The Leviathan escaped', body: `It fled to the sea… it’ll be back stronger${ink(d.ink)}`, to: '/world' };
        case 'blocked': return { title: '📡 Your giant plot held!', body: `It stood in the Leviathan’s way and stopped it (${num(d.dmg)} damage)`, to: '/world' };
        default: return null;
      }
    case 'enchant':
      switch (d.sub) {
        case 'splice_invite': return { title: '🧬 Splice invite', body: `${who} wants to splice with you: ${d.hybrid ?? 'a hybrid'} — say yes in your Grimoire`, to: '/grimoire?tab=visitors' };
        case 'splice_accepted': return { title: '🧬 Spliced!', body: `${who} said yes — you’re spliced: ${d.hybrid ?? 'a hybrid'}`, to: '/grimoire?tab=visitors' };
        case 'parasite_attached': return { title: '🦠 A Parasite on your plot!', body: `${who} let a Parasite loose — peel it off (you get paid for it)`, to: '/grimoire?tab=visitors' };
        case 'symbiote_attached': return { title: '💚 A Symbiote settled in', body: `${who}’s Symbiote settled on your plot — it shares its meals with you`, to: '/grimoire?tab=visitors' };
        case 'size_prank': return { title: '🤡 You’ve been pranked', body: `${who} made your plot ${d.mode === 'grow' ? '100× GIANT' : '100× tiny'} on everyone’s map for ${d.hours ?? 'a few'} h`, to: d.gx != null ? `/world?fly=${d.gx},${d.gy}&z=${d.mode === 'grow' ? 15 : 21.5}` : '/world' };
        case 'treasure_piece': return { title: '🗺️ Treasure found on your plot', body: `${who} found a treasure map piece on your plot${ink(d.ink)}`, to: '/grimoire?tab=visitors' };
        case 'puppet_auto': return { title: '🎭 A show at your plot', body: d.passed ? `${who}’s puppet cleared level ${d.level} of your plot’s game${ink(d.ink)}` : `${who}’s puppet tangled on level ${d.level} of your plot’s game`, to: fly(d, 19) };
        case 'far_sighted': return { title: '🔭 Farsight', body: `Your enchantment spotted ${Number(d.n) > 1 ? `${d.n} unclaimed plots` : 'an unclaimed plot'} nearby — only you can see it. Claim it within a day.`, to: '/world' };
        case 'sun_nova': return { title: '💥 Your Pocket Sun went supernova!', body: '×6 over twice the ground for 15 minutes. Claim inside it now!', to: '/grimoire?tab=visitors' };
        case 'wish_gift': return { title: '🧞 A wish for you', body: `${who} spent a Genie’s wish on you${ink(d.ink)}`, to: '/grimoire?tab=visitors' };
        case 'spore_landed': return { title: '🦠 A spore on your plot', body: `${who} sent a spore onto your plot — your wins there pay +10% for a day`, to: '/grimoire?tab=visitors' };
        case 'prophecy_true_you': return { title: '👁️ A prophecy came true', body: `${who}’s sealed prophecy came true on your roll${ink(d.ink)}`, to: '/grimoire?tab=visitors' };
        case 'mirror_seen': return { title: '🪞 Seen in a Mirror Shard', body: `${who} saw your enchantment in their Mirror Shard and stepped through${ink(d.ink)}`, to: '/grimoire?tab=visitors' };
        case 'glyph_found': return { title: '📜 A page fluttered out', body: `Your Glyphcaster found ${d.name ?? 'a new glyph'}`, to: d.id ? `/grimoire/${d.id}` : '/grimoire' };
        case 'ascended': return { title: Number(d.stars) >= 5 ? '🌌 Ascendant!' : '☄️ Comet-Crowned!', body: Number(d.stars) >= 5 ? 'Your enchantment has all five stars.' : 'Your enchantment reached ★4.', to: '/grimoire' };
        default: return null;
      }
    case 'power':
      switch (d.sub) {
        case 'erupted': return { title: '🌋 Your plot erupted!', body: `${d.n ?? 'New'} obsidian spots only you can claim for the next hour, each a tier higher`, to: fly(d, 18) };
        case 'whisper': return { title: '👻 Your Phantom whispers', body: `A ${rarity(d.rarity)} waits nearby — claim it within a day and it’s yours`, to: fly(d, 18) };
        case 'hatched': return { title: '🦋 Your Chrysalis hatched!', body: `It became ${rarity(d.rarity)}`, to: d.gx != null ? `/powers/${d.gx}_${d.gy}` : '/primordials' };
        case 'midas': return { title: '🖐️ Midas!', body: `A win turned your plot into ${rarity(d.rarity)}`, to: d.gx != null ? `/powers/${d.gx}_${d.gy}` : '/world' };
        case 'gift': return { title: '🌟 A Golden Hour for you', body: `${who} gave you a Golden Hour from their Heart of the World`, to: '/world' };
        case 'decree': return { title: '📜 A new decree', body: `${who} set a rule for the land around you from their Throne of Ink`, to: '/world' };
        case 'stars': return { title: '⭐ Shooting stars near you', body: `${who} called down shooting stars near your land — catch them on the map!`, to: fly(d, 16) };
        case 'genesis': return { title: '🌀 New land near you', body: `${who} raised new land — claims there roll ultras 3× as often for two days`, to: fly(d, 16) };
        case 'ticket': return { title: '🎟️ A gift from the LANDVAS team', body: `${Number(d.n) > 1 ? `${d.n} roll tickets` : 'A roll ticket'}${d.label ? ` — “${clip(d.label, 50)}”` : ''}. Tap to roll it!`, to: '/world?tickets=1' };
        case 'pollinated': return { title: '🐝 Your plot was pollinated', body: `${who}’s bees made your plot’s minigames pay 10% more today`, to: fly(d, 18) };
        default: return null;
      }
    case 'star': {
      const nm = d.name ?? 'your star';
      const to = d.sub === 'art_ok' || d.sub === 'art_no' ? `/star/${d.star}/paint` : `/star/${d.star}`;
      switch (d.sub) {
        case 'cut': return { title: '✨ Discoverer’s cut', body: `${who} claimed a plot on ${nm}, the star you discovered${ink(d.ink)}`, to };
        case 'painted': return { title: '🌟 A Painted Star', body: `${nm} is fully claimed and painted — it shows in everyone’s telescope`, to };
        case 'art_ok': return { title: '🎨 Painting approved', body: `Your painting on ${nm} is on the star for everyone to see`, to };
        case 'art_no': return { title: 'Painting not approved', body: `Your painting on ${nm} wasn’t approved${d.reason ? `: “${clip(d.reason, 60)}”` : ''}`, to };
        case 'toll': return { title: '🌀 Stargate toll', body: `${who} came through your Stargate on ${nm}${ink(d.ink)}`, to };
        case 'supernova': return { title: '💥 Supernova!', body: `${nm} went supernova${ink(d.ink)}`, to };
        default: return null;
      }
    }
    case 'potd': return { title: '⭐ Painting of the Day!', body: `Your “${clip(d.title, 50)}” is the Painting of the Day`, to: d.publication_id ? `/art/${d.publication_id}` : '/world' };
    case 'ultra_set': return { title: '👑 Ultra set unlocked', body: `Your ${rarity(d.rarity)} set is yours — wear it on your explorer`, to: '/explorer' };
    case 'core': return { title: '💖 You reached the core!', body: `A Core heart is yours${ink(d.ink)}`, to: '/world' };
    case 'visit': return { title: '🏠 A visitor', body: d.arcade ? `${who} walked into your arcade` : d.business ? `${who} ${d.tip ? 'bought a lemonade at' : 'is looking round'} your business` : d.farm ? `${who} ${d.help ? 'helped water your crops' : 'is looking round your farm'}` : `${who} visited your room`,
      to: d.arcade ? `/arcade/${d.arcade}` : d.business ? `/business/${d.business}` : d.farm ? `/farm/${d.farm}` : a.actor ? `/u/${a.actor}/home` : '/world' };
    case 'checkin': return { title: '🚪 A check-in', body: `${who} checked into your room${ink(d.ink)}`, to: a.actor ? `/u/${a.actor}/home` : '/world' };
    case 'note': return { title: '💌 Your guestbook', body: `${who} signed it: “${clip(d.body, 70)}”`, to: '/world' };
    case 'sanctuary_visit': return { title: '🐾 A sanctuary visitor', body: `${who} is visiting your sanctuary${d.name ? ` “${clip(d.name, 30)}”` : ''}`, to: d.habitat ? `/habitat/${d.habitat}` : '/habitat' };
    case 'base_visit': return { title: '⛺ A visitor at your base', body: `${who} is looking round your base`, to: '/world' };
    case 'warp': return { title: '🚀 A warp', body: `${who} warped to you`, to: '/world' };
    case 'neighbor': return { title: '📍 A new neighbour', body: `${who} claimed the plot next to yours`, to: '/world' };
    case 'stamp': return { title: '🏷️ A stamp collected', body: `${who} collected stamp #${d.serial ?? '?'} of “${clip(d.title, 40)}”${ink(d.ink)}`, to: d.publication_id ? `/art/${d.publication_id}` : '/world' };
    case 'inspire': return { title: '✨ You inspired someone', body: `${who} was inspired by “${clip(d.title, 50)}”`, to: d.publication_id ? `/art/${d.publication_id}` : '/world' };
    case 'sketch_vote': return { title: '❤️ A vote for your sketch', body: `Someone voted for your sketch of “${clip(d.word, 30)}”`, to: '/sketch' };
    default: return null;
  }
}

/** what a queued push says: its own words if it has them, else its alert's, else a plain line for its switch */
export function pushText(p: { kind: string; title?: string | null; body?: string | null; to?: string | null; alert?: PushAlert | null }): PushText {
  if (p.title && p.body) return { title: p.title, body: p.body, to: p.to || CATEGORY_FALLBACK[p.kind]?.to || '/' };
  const t = p.alert ? alertText(p.alert) : null;
  return t ?? CATEGORY_FALLBACK[p.kind] ?? { title: 'LANDVAS', body: 'Something’s happening in LANDVAS.', to: '/' };
}

/** only paths inside the game are followed from a push */
export const safePushPath = (to: unknown) => (typeof to === 'string' && /^\/(?!\/)[\w\-./?=&,%#:+@]*$/.test(to) ? to : '/');
