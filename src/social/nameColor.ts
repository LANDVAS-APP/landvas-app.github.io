// A player's name wears the colour of their rarest plot — or of the rarity they chose to show off (one they own) — in
// every chat. A plain colour (a big one, like a peek's title, with a soft glow for an ultra); a Primordial's name is a
// band of its two colours. Always made readable on the panel it sits on (the chat boxes over the map are dark
// whatever the page's theme). Nothing here moves: names sit still, on phones too.
import type { CSSProperties } from 'react';
import { readableOn, pageIsDark } from '../lib/readable';
import { isPrimordial, rarityInfo, rarityTier } from '../shared/rarity';

export type Named = { name_rarity?: string | null; accent_color?: string | null } | null | undefined;
export type Ground = 'dark' | 'light' | 'page';

const ground = (bg: Ground): 'dark' | 'light' => (bg === 'page' ? (pageIsDark() ? 'dark' : 'light') : bg);

/** the colour of a player's name, readable on this ground (their accent colour while they have no land) */
export function nameColor(p: Named, bg: Ground = 'page'): string {
  const g = ground(bg);
  if (!p?.name_rarity) return readableOn(p?.accent_color || '#9FD3FF', g);
  return readableOn(rarityInfo(p.name_rarity).color, g);
}

/** how a player's name is drawn: its colour, and a Primordial's a band of its two colours. `glow`: a big name (a
 *  peek's title) also gets a soft halo of its rarity's glow when it's an ultra (in a list it would smudge) */
export function nameStyle(p: Named, bg: Ground = 'page', glow = false): CSSProperties {
  const g = ground(bg);
  const color = nameColor(p, bg);
  if (!p?.name_rarity) return { color };
  const r = rarityInfo(p.name_rarity);
  const tier = rarityTier(r.id);
  if (isPrimordial(r.id) && g === 'dark') {
    const glow = readableOn(r.glow, 'dark');
    return { color, backgroundImage: `linear-gradient(100deg, ${color} 0%, ${glow} 55%, ${color} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' };
  }
  if (glow && tier >= 5 && g === 'dark') return { color, textShadow: `0 0 18px ${r.glow}38` };
  return { color };
}

/** what a name's colour means, for a tooltip ("Rarest plot: Volcano") */
export function nameTitle(p: Named, picked?: boolean): string | undefined {
  if (!p?.name_rarity) return undefined;
  const r = rarityInfo(p.name_rarity);
  return `${picked ? 'Showing off' : 'Rarest plot'}: ${r.emoji ? `${r.emoji} ` : ''}${r.name}`;
}
