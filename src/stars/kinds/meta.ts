// What the star-only plot types work with: the elements of the fusion ladder, the Lumen Grove's plants (one for each
// kind of light), and the words for each.
export const ELEMENTS: { id: 'h' | 'he' | 'c' | 'o' | 'si' | 'fe' | 'au'; sym: string; name: string; color: string }[] = [
  { id: 'h', sym: 'H', name: 'Hydrogen', color: '#9DE4FF' },
  { id: 'he', sym: 'He', name: 'Helium', color: '#FFE28A' },
  { id: 'c', sym: 'C', name: 'Carbon', color: '#B9B9C8' },
  { id: 'o', sym: 'O', name: 'Oxygen', color: '#7FD4FF' },
  { id: 'si', sym: 'Si', name: 'Silicon', color: '#C9A0FF' },
  { id: 'fe', sym: 'Fe', name: 'Iron', color: '#E08A5B' },
  { id: 'au', sym: 'Au', name: 'Gold', color: '#FFD23F' },
];
export const EL = Object.fromEntries(ELEMENTS.map((e) => [e.id, e])) as Record<string, (typeof ELEMENTS)[number]>;
export const LADDER = ['h', 'he', 'c', 'o', 'si', 'fe'] as const;

export const SPECIES: Record<string, { name: string; emoji: string; light: string; color: string }> = {
  ember_moss: { name: 'Ember moss', emoji: '🔥', light: 'a red star’s', color: '#FF7A5C' },
  amber_fern: { name: 'Amber fern', emoji: '🌿', light: 'an orange star’s', color: '#FFB15C' },
  sunglass_vine: { name: 'Sunglass vine', emoji: '🌻', light: 'a yellow star’s', color: '#FFE14D' },
  pearl_bloom: { name: 'Pearl bloom', emoji: '🤍', light: 'a white star’s', color: '#F4F7FF' },
  frost_lily: { name: 'Frost-lily', emoji: '❄️', light: 'a blue star’s', color: '#9DC4FF' },
  pulse_orchid: { name: 'Pulse orchid', emoji: '💫', light: 'a pulsar’s', color: '#BFEFFF' },
  void_lotus: { name: 'Void lotus', emoji: '🪷', light: 'a black hole’s', color: '#C98AFF' },
};
export const CODEX_ORDER = ['ember_moss', 'amber_fern', 'sunglass_vine', 'pearl_bloom', 'frost_lily', 'pulse_orchid', 'void_lotus'];

/** a short "in 3 h 20 m" / "in 45 s" */
export function until(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.parse(iso) - now) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ${m % 60} m` : `${Math.round(h / 24)} days`;
}
