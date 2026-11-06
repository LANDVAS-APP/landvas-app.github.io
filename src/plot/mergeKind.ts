// Plots only merge with plots of the same type: art canvases with art canvases, arcades with arcades, and so on.
import type { CanvasGroup, PlotKind } from '../backend/types';

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
};
export const kindOf = (groups: CanvasGroup[] | undefined, id: string): PlotKind => groups?.find((g) => g.id === id)?.kind ?? 'canvas';
/** The type the current pick is locked to (that of the first canvas picked), or null with nothing picked. */
export function pickKind(groups: CanvasGroup[] | undefined, picked: string[]): PlotKind | null {
  return picked.length ? kindOf(groups, picked[0]) : null;
}
/** Can this canvas join the pick? */
export function canPick(groups: CanvasGroup[] | undefined, picked: string[], id: string) {
  const k = pickKind(groups, picked);
  return !k || picked.includes(id) || kindOf(groups, id) === k;
}
export const sameKindMessage = (k: PlotKind) => `Only ${KIND_LABEL[k].many} can merge with ${KIND_LABEL[k].many} ${KIND_LABEL[k].emoji}`;
