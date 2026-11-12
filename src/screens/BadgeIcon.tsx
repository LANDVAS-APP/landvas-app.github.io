// A badge's medal: its own icon (an emoji, a rarity's plot art, or a plot kind's emoji) in a medal whose shape comes
// from its category and whose metal shows its tier — bronze, silver, gold, platinum, diamond, prismatic. Locked
// badges are a dim silhouette.
import { useId } from 'react';
import { KIND_LABEL } from '../plot/mergeKind';
import { BasePlotArt } from '../plot/BasePlotArt';
import type { PlotKind } from '../backend/types';
import { rarityTier, type RarityId } from '../shared/rarity';

// the first badges were named after icons
const OLD: Record<string, string> = {
  flag: '🚩', brush: '🖌️', frame: '🖼️', link: '🔗', palette: '🎨', grid: '🔲', landmark: '🏛️', map: '🗺️', crown: '👑', globe: '🌐', hammer: '🔨',
  pencil: '✏️', droplet: '💧', shapes: '🔷', sparkles: '✨', gamepad: '🎮', heart: '💖', star: '⭐', gem: '💎', trophy: '🏆', zap: '⚡',
};
export const METALS: [string, string, string][] = [
  ['#C77B3B', '#7A4419', '#F3C089'], // bronze
  ['#C9D2DE', '#6F7B8C', '#FFFFFF'], // silver
  ['#FFD23F', '#B8860B', '#FFF4B8'], // gold
  ['#9EE7E0', '#3E8C8A', '#F0FFFE'], // platinum
  ['#8FD3FF', '#3B5BFF', '#FFFFFF'], // diamond
  ['#FF7AE0', '#5FD3FF', '#FFFFFF'], // prismatic
];
const SHAPES: Record<string, string> = {
  // (100 × 100) medal outlines by category
  hex: 'M50 4 L90 27 L90 73 L50 96 L10 73 L10 27Z',
  shield: 'M50 4 L90 16 L88 56 C84 78 68 90 50 97 C32 90 16 78 12 56 L10 16Z',
  star: 'M50 3 L62 18 L81 13 L82 33 L97 45 L85 60 L90 80 L70 82 L60 97 L50 86 L40 97 L30 82 L10 80 L15 60 L3 45 L18 33 L19 13 L38 18Z',
  round: 'M50 4 A46 46 0 1 1 49.9 4Z',
  diamond: 'M50 3 L95 50 L50 97 L5 50Z',
  ticket: 'M14 10 H86 A8 8 0 0 0 94 18 V82 A8 8 0 0 0 86 90 H14 A8 8 0 0 0 6 82 V18 A8 8 0 0 0 14 10Z',
};
const BY_CAT: Record<string, keyof typeof SHAPES> = {
  creation: 'round', collection: 'hex', exploration: 'diamond', mastery: 'star', community: 'round', rarity: 'shield', daily: 'star', travel: 'ticket', estate: 'hex', kinds: 'shield',
};

export function BadgeIcon({ icon, category, tier = 0, locked, size = 52 }: { icon: string; category: string; tier?: number; locked?: boolean; size?: number }) {
  const id = useId().replace(/:/g, '');
  const [a, b, c] = METALS[Math.max(0, Math.min(METALS.length - 1, tier))];
  const shape = SHAPES[BY_CAT[category] ?? 'round'];
  const inner = icon.startsWith('rarity:') ? null : icon.startsWith('kind:') ? KIND_LABEL[icon.slice(5) as PlotKind]?.emoji ?? '🏷️' : OLD[icon] ?? icon;
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size, filter: locked ? 'grayscale(1) brightness(0.55)' : undefined, opacity: locked ? 0.7 : 1 }} aria-hidden>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id={`${id}m`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c} /><stop offset="0.35" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
          <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.55" /><stop offset="0.5" stopColor="#fff" stopOpacity="0" /></linearGradient>
        </defs>
        {tier >= 4 && !locked && <path d={shape} fill={a} opacity="0.35" transform="translate(50 50) scale(1.12) translate(-50 -50)" />}
        <path d={shape} fill={`url(#${id}m)`} stroke={b} strokeWidth="3" />
        <path d={shape} fill="#14183a" transform="translate(50 50) scale(0.78) translate(-50 -50)" />
        <path d={shape} fill={`url(#${id}s)`} transform="translate(50 50) scale(0.78) translate(-50 -50)" opacity="0.35" />
        {tier >= 2 && <circle cx="50" cy="8" r="4" fill={c} stroke={b} strokeWidth="1.5" />}
      </svg>
      {inner ? <span className="relative leading-none" style={{ fontSize: size * 0.42 }}>{inner}</span>
        : <span className="relative overflow-hidden rounded-[22%]"><BasePlotArt rarity={icon.slice(7) as RarityId} size={size * 0.52} /></span>}
    </span>
  );
}

/** a badge's icon as a single emoji (for toasts and little shelves) */
export function badgeEmoji(icon: string | null | undefined) {
  if (!icon) return '🏅';
  if (icon.startsWith('rarity:')) return '💎';
  if (icon.startsWith('kind:')) return KIND_LABEL[icon.slice(5) as PlotKind]?.emoji ?? '🏅';
  return OLD[icon] ?? icon;
}

/** a badge's tier (its medal's metal): by how big its goal is — or, for a rarity, how rare */
export function tierOf(a: { icon: string; threshold: number }) {
  if (a.icon.startsWith('rarity:')) { const t = rarityTier(a.icon.slice(7)); return Math.min(5, t + (a.threshold > 1 ? 1 : 0)); }
  const n = a.threshold;
  return n <= 1 ? 0 : n <= 5 ? 1 : n <= 25 ? 2 : n <= 100 ? 3 : n <= 1000 ? 4 : 5;
}
