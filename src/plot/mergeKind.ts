// Plots only merge with plots of the same type: art canvases with art canvases, arcades with arcades, and so on.
import type { CanvasGroup, PlotKind } from '../backend/types';
import { ESTATES, kindFamily } from '../realms/estates/meta';

export const KIND_LABEL: Record<PlotKind, { one: string; many: string; emoji: string }> = {
  canvas: { one: 'art canvas', many: 'art canvases', emoji: '🎨' },
  habitat: { one: 'habitat', many: 'habitats', emoji: '🐾' },
  farm: { one: 'farm', many: 'farms', emoji: '🌾' },
  business: { one: 'business', many: 'businesses', emoji: '🍋' },
  arcade: { one: 'arcade', many: 'arcades', emoji: '🕹️' },
  mine: { one: 'crystal mine', many: 'crystal mines', emoji: '⛏️' },
  sky: { one: 'sky island', many: 'sky islands', emoji: '☁️' },
  workshop: { one: 'workshop', many: 'workshops', emoji: '🛠️' },
  diner: { one: 'restaurant', many: 'restaurants', emoji: '🍳' },
  dungeon: { one: 'dungeon', many: 'dungeons', emoji: '⚔️' },
  brawl: { one: 'arena', many: 'arenas', emoji: '🎨' },
  ...(Object.fromEntries(Object.entries(ESTATES).map(([k, e]) => [k, { one: e.one, many: e.many, emoji: e.emoji }])) as Record<keyof typeof ESTATES, { one: string; many: string; emoji: string }>),
};
export const kindOf = (groups: CanvasGroup[] | undefined, id: string): PlotKind => groups?.find((g) => g.id === id)?.kind ?? 'canvas';
/** The type the current pick is locked to (that of the first canvas picked), or null with nothing picked. */
export function pickKind(groups: CanvasGroup[] | undefined, picked: string[]): PlotKind | null {
  return picked.length ? kindOf(groups, picked[0]) : null;
}
/** Can this canvas join the pick? */
export function canPick(groups: CanvasGroup[] | undefined, picked: string[], id: string) {
  const k = pickKind(groups, picked);
  // an Estate merges with plots of its base type (and stays an Estate)
  return !k || picked.includes(id) || kindFamily(kindOf(groups, id)) === kindFamily(k);
}
export const sameKindMessage = (k: PlotKind) => { const f = kindFamily(k); return `Only ${KIND_LABEL[f].many}${f !== k ? ` and ${KIND_LABEL[k].many}` : ''} can merge with ${KIND_LABEL[k].many} ${KIND_LABEL[k].emoji}`; };
