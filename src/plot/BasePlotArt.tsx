// A Base plot as a little picture, in its rarity's finish — the same looks the map draws (plotTiles baseCell):
// bare slate · blue stone with brass studs · purple with a diamond inlay · gold with a sunburst · iridescent crystal.
import { useId } from 'react';
import { RARITY_ORDER, rarityInfo, type RarityId } from '../shared/rarity';

const SLAB: [string, string][] = [['#5E6A78', '#3D4653'], ['#3D7FC4', '#22508A'], ['#7A4FD8', '#4A2A9A'], ['#E8A928', '#A86A0E'], ['#FF5FB4', '#6E3BFF']];

export function BasePlotArt({ rarity, size = 40, className }: { rarity: RarityId; size?: number | string; className?: string }) {
  const id = useId().replace(/:/g, '');
  const tier = Math.max(0, RARITY_ORDER.indexOf(rarity));
  const info = rarityInfo(rarity);
  const [a, b] = SLAB[tier];
  const sparkle = (x: number, y: number, s: number) => `M${x} ${y - s} L${x + s * 0.25} ${y - s * 0.25} L${x + s} ${y} L${x + s * 0.25} ${y + s * 0.25} L${x} ${y + s} L${x - s * 0.25} ${y + s * 0.25} L${x - s} ${y} L${x - s * 0.25} ${y - s * 0.25}Z`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-label={`${info.name} Base plot`} role="img">
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />{tier === 4 && <stop offset="0.5" stopColor="#3FE0FF" />}<stop offset="1" stopColor={b} />
        </linearGradient>
        <linearGradient id={`${id}bv`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.3" /><stop offset="0.3" stopColor="#fff" stopOpacity="0" /><stop offset="0.75" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.3" /></linearGradient>
      </defs>
      <rect width="100" height="100" rx="18" fill={`url(#${id}s)`} />
      <rect width="100" height="100" rx="18" fill={`url(#${id}bv)`} />
      {tier === 0 && [25, 50, 75].map((x) => <path key={x} d={`M${x} 10 L${x - 12} 90`} stroke="#fff" strokeOpacity="0.09" strokeWidth="2.5" />)}
      {tier === 1 && [[18, 18], [82, 18], [18, 82], [82, 82]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="4.5" fill="#E8C46A" />)}
      {tier === 2 && <path d="M50 20 L80 50 L50 80 L20 50Z" fill="none" stroke={info.glow} strokeWidth="3.5" opacity="0.85" />}
      {tier === 3 && Array.from({ length: 12 }, (_, i) => { const t = (i / 12) * Math.PI * 2; return <path key={i} d={`M50 50 L${50 + Math.cos(t) * 48} ${50 + Math.sin(t) * 48} L${50 + Math.cos(t + 0.13) * 48} ${50 + Math.sin(t + 0.13) * 48}Z`} fill="#FFF4C2" opacity="0.35" />; })}
      {tier === 4 && <>
        <circle cx="50" cy="50" r="33" fill="#fff" opacity="0.4" />
        <path d="M50 21 L66 50 L50 72 L34 50Z" fill="#C9F6FF" />
        <path d="M50 21 L66 50 L50 50Z" fill={info.color} opacity="0.55" />
      </>}
      {tier < 4 && <>
        <path d="M50 64 V34" stroke="#2A1C10" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M50 34 L68 40 L50 46Z" fill={tier ? info.color : '#E9EEF5'} />
      </>}
      {tier >= 3 && [[22, 26, 6], [78, 72, 5], [76, 24, 4]].map(([x, y, s]) => <path key={`${x}`} d={sparkle(x, y, s)} fill={tier === 4 ? '#fff' : '#FFF4C2'} />)}
      <rect x="1.5" y="1.5" width="97" height="97" rx="17" fill="none" stroke={info.color} strokeOpacity={tier ? 0.9 : 0.4} strokeWidth="3" />
    </svg>
  );
}
