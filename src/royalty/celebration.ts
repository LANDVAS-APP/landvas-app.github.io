// Crown celebrations: the pure bits behind the home page's "royal announcements" and the snapshot cards —
// which Crowns are newest, what number each one was, the words on the card, and searching the crown holders.
// Only Crowns whose holder shows on the Royalty page (holder != null) are ever celebrated.

export type CrownTier = 'crown' | 'crown_state' | 'crown_country';
export type CrownHolder = { id: string; username: string; display_name?: string | null };
export type RoyalCrown = {
  tier: CrownTier; city: string | null; state: string | null; country: string; country_name: string; kingdom: string;
  claimed_at: string; reign_days: number; shiny: boolean; boost: number; full_boost: number;
  is_me?: boolean; holder: CrownHolder | null;
};
export type RoyalTotals = { city?: number; state?: number; country?: number; cities?: number; states?: number; countries?: number };

export const TIER_INFO: Record<CrownTier, { one: string; place: string; title: string; color: string }> = {
  crown_country: { one: 'Country Crown', place: 'country', title: 'Monarch of', color: '#FFD84D' },
  crown_state: { one: 'State Crown', place: 'state', title: 'Ruler of', color: '#B69CFF' },
  crown: { one: 'City Crown', place: 'city', title: 'Sovereign of', color: '#7FE3FF' },
};

export type Celebration = {
  key: string; crown: RoyalCrown; holder: CrownHolder; rank: number;
  /** "FIRST EVER CITY CROWN" or "CITY CROWN #7" */
  headline: string;
  handle: string; title: string; where: string; claimed: string; boost: string;
  /** how many Crowns of this tier are still unclaimed (null when unknown) */
  left: number | null;
  /** claimed in the last two days: worth confetti */
  fresh: boolean;
};

const ms = (iso: string) => new Date(iso).getTime() || 0;
export const crownKey = (c: Pick<RoyalCrown, 'tier' | 'country' | 'state' | 'kingdom'>) => [c.tier, c.country, c.state ?? '', c.kingdom].join('|');

/** The order each Crown was claimed in, within its tier (1 = the first ever). Hidden holders still count. */
export function crownRanks(crowns: RoyalCrown[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const tier of ['crown', 'crown_state', 'crown_country'] as const) {
    crowns.filter((c) => c.tier === tier).sort((a, b) => ms(a.claimed_at) - ms(b.claimed_at))
      .forEach((c, i) => out.set(crownKey(c), i + 1));
  }
  return out;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase();
const leftOf = (tier: CrownTier, t?: RoyalTotals | null) => {
  if (!t) return null;
  const [held, all] = tier === 'crown' ? [t.city, t.cities] : tier === 'crown_state' ? [t.state, t.states] : [t.country, t.countries];
  return typeof held === 'number' && typeof all === 'number' ? Math.max(0, all - held) : null;
};

export function celebrate(crown: RoyalCrown & { holder: CrownHolder }, rank: number, totals?: RoyalTotals | null, now = Date.now()): Celebration {
  const t = TIER_INFO[crown.tier];
  const one = `${crown.shiny ? 'Shiny ' : ''}${t.one}`.toUpperCase();
  const where = crown.tier === 'crown' ? [crown.state, crown.country_name].filter(Boolean).join(' · ')
    : crown.tier === 'crown_state' ? crown.country_name : '';
  return {
    key: crownKey(crown), crown, holder: crown.holder, rank,
    headline: rank === 1 ? `FIRST EVER ${one}` : `${one} #${rank}`,
    handle: `@${crown.holder.username}`,
    title: `${t.title} ${crown.kingdom}`,
    where: where.toUpperCase(),
    claimed: `CROWNED ${fmtDate(crown.claimed_at)}`,
    boost: `×${Number(crown.boost || 1).toFixed(2)} KINGDOM RENT`,
    left: leftOf(crown.tier, totals),
    fresh: now - ms(crown.claimed_at) < 48 * 3600_000,
  };
}

/** Every celebratable Crown (holder shown), newest claim first. */
export function celebrations(crowns: RoyalCrown[] | null | undefined, totals?: RoyalTotals | null, now = Date.now()): Celebration[] {
  const list = crowns ?? [];
  const ranks = crownRanks(list);
  return list.filter((c): c is RoyalCrown & { holder: CrownHolder } => !!c.holder?.username)
    .sort((a, b) => ms(b.claimed_at) - ms(a.claimed_at))
    .map((c) => celebrate(c, ranks.get(crownKey(c)) ?? 1, totals, now));
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/^@/, '').trim();

/** Search crown holders by username, display name, or the kingdom/state/country they rule. */
export function searchCelebrations(all: Celebration[], query: string, limit = 8): Celebration[] {
  const q = norm(query);
  if (!q) return [];
  const scored = all.map((c) => {
    const u = norm(c.holder.username), d = norm(c.holder.display_name ?? ''), k = norm(c.crown.kingdom);
    const place = norm([c.crown.state, c.crown.country_name].filter(Boolean).join(' '));
    const s = u === q ? 0 : u.startsWith(q) ? 1 : d.startsWith(q) ? 2 : u.includes(q) || d.includes(q) ? 3 : k.startsWith(q) ? 4 : k.includes(q) || place.includes(q) ? 5 : -1;
    return { c, s };
  }).filter((x) => x.s >= 0);
  return scored.sort((a, b) => a.s - b.s).slice(0, limit).map((x) => x.c);
}

export const snapshotName = (c: Celebration, size: 'square' | 'wide') =>
  `landvas-crown-${c.holder.username}-${c.crown.kingdom}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '') + `-${size}.png`;
