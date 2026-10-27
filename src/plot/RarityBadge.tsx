import { Gem } from 'lucide-react';
import { cn } from '../lib/utils';
import { rarityInfo, type RarityId } from '../shared/rarity';

/** Colored rarity chip; Mythic gets an animated rainbow edge. */
export function RarityBadge({ r, small, className }: { r: RarityId | string; small?: boolean; className?: string }) {
  const info = rarityInfo(r);
  const mythic = info.id === 'mythic';
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wider', small ? 'px-1.5 py-0.5 text-[9.5px]' : 'px-2.5 py-1 text-[11px]', mythic && 'rainbow-edge', className)}
      style={{ background: `${info.color}26`, color: info.glow, boxShadow: `inset 0 0 0 1px ${info.color}88, 0 0 14px -4px ${info.color}` }}
    >
      <Gem className={small ? 'h-2.5 w-2.5' : 'h-3 w-3'} style={{ color: info.color }} />
      {info.name}
    </span>
  );
}

export function RarityDot({ r, size = 10 }: { r: RarityId | string; size?: number }) {
  const info = rarityInfo(r);
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: info.color, boxShadow: `0 0 8px ${info.color}` }} />;
}
