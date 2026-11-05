// Things Inkborn can wear, won with tickets at arcades (the server's list is the source of truth for prices).
export const WEAR_SLOTS = [
  { slot: 'whead', label: 'Head' }, { slot: 'wface', label: 'Eyes' }, { slot: 'wneck', label: 'Neck' }, { slot: 'waura', label: 'Glow' },
] as const;
export const WEAR: Record<string, { id: string; name: string; emoji: string }[]> = {
  whead: [{ id: 'party', name: 'Party Hat', emoji: '🥳' }, { id: 'crown', name: 'Tiny Crown', emoji: '👑' }, { id: 'propeller', name: 'Propeller Beanie', emoji: '🧢' }, { id: 'headset', name: 'Gamer Headset', emoji: '🎧' }],
  wface: [{ id: 'shades', name: 'Neon Shades', emoji: '🕶️' }, { id: 'stars', name: 'Star Glasses', emoji: '🤩' }, { id: 'visor', name: 'Pixel Visor', emoji: '🥽' }],
  wneck: [{ id: 'bowtie', name: 'Bow Tie', emoji: '🎀' }, { id: 'medal', name: 'Gold Medal', emoji: '🏅' }, { id: 'scarf', name: 'Striped Scarf', emoji: '🧣' }],
  waura: [{ id: 'neon', name: 'Neon Glow', emoji: '💫' }, { id: 'sparkle', name: 'Sparkle Cloud', emoji: '✨' }, { id: 'rainbow', name: 'Rainbow Ring', emoji: '🌈' }],
};
