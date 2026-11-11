// A Base plot as a little picture, in its rarity's finish — the same looks the map draws (plotTiles baseCell):
// bare slate · teal with a clover · blue stone with brass studs · purple with a diamond inlay · gold with a sunburst ·
// iridescent crystal — and the ultras: a blazing sun, a crescent moon, a comet, a sandstone temple, prism facets and a
// spiral galaxy. A shiny plot shimmers.
import { useId } from 'react';
import { rarityInfo, type RarityId } from '../shared/rarity';

const SLAB: Record<string, [string, string]> = {
  common: ['#5E6A78', '#3D4653'], uncommon: ['#2AA39A', '#17675F'], rare: ['#3D7FC4', '#22508A'], epic: ['#7A4FD8', '#4A2A9A'],
  legendary: ['#E8A928', '#A86A0E'], mythic: ['#FF5FB4', '#6E3BFF'], solar: ['#FFB43A', '#E0521B'], lunar: ['#1E2A6B', '#0B1033'],
  comet: ['#0E2A4A', '#05101E'], ancient: ['#D9B77A', '#8E6B37'], prismatic: ['#FF7AE0', '#5FD3FF'], genesis: ['#1A0838', '#000004'],
};
const sparkle = (x: number, y: number, s: number) => `M${x} ${y - s} L${x + s * 0.25} ${y - s * 0.25} L${x + s} ${y} L${x + s * 0.25} ${y + s * 0.25} L${x} ${y + s} L${x - s * 0.25} ${y + s * 0.25} L${x - s} ${y} L${x - s * 0.25} ${y - s * 0.25}Z`;

export function BasePlotArt({ rarity, shiny, size = 40, className }: { rarity: RarityId; shiny?: boolean; size?: number | string; className?: string }) {
  const id = useId().replace(/:/g, '');
  const info = rarityInfo(rarity);
  const [a, b] = SLAB[rarity] ?? SLAB.common;
  const stake = ['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(rarity);
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-label={`${shiny ? 'Shiny ' : ''}${info.name} Base plot`} role="img">
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />{rarity === 'mythic' && <stop offset="0.5" stopColor="#3FE0FF" />}{rarity === 'prismatic' && <><stop offset="0.33" stopColor="#FFE14D" /><stop offset="0.66" stopColor="#3DDC97" /></>}<stop offset="1" stopColor={b} />
        </linearGradient>
        <linearGradient id={`${id}bv`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.3" /><stop offset="0.3" stopColor="#fff" stopOpacity="0" /><stop offset="0.75" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.3" /></linearGradient>
        <linearGradient id={`${id}sh`} x1="0" y1="0" x2="1" y2="1"><stop offset="0.3" stopColor="#fff" stopOpacity="0" /><stop offset="0.45" stopColor="#fff" stopOpacity="0.55" /><stop offset="0.5" stopColor="#FFE6FF" stopOpacity="0.75" /><stop offset="0.55" stopColor="#C9F8FF" stopOpacity="0.55" /><stop offset="0.7" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <radialGradient id={`${id}g`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#fff" /><stop offset="0.25" stopColor="#FFD6FF" /><stop offset="1" stopColor="#A45CFF" stopOpacity="0" /></radialGradient>
        <clipPath id={`${id}c`}><rect width="100" height="100" rx="18" /></clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <rect width="100" height="100" fill={`url(#${id}s)`} />
        {rarity === 'common' && [25, 50, 75].map((x) => <path key={x} d={`M${x} 10 L${x - 12} 90`} stroke="#fff" strokeOpacity="0.09" strokeWidth="2.5" />)}
        {rarity === 'uncommon' && <g fill="#7CF0B9" opacity="0.9">{[[0, -9], [9, 0], [0, 9], [-9, 0]].map(([dx, dy]) => <circle key={`${dx}${dy}`} cx={74 + dx * 0.9} cy={26 + dy * 0.9} r="7" />)}<path d="M74 26 q6 14 -2 22" stroke="#0E5A3F" strokeWidth="2.5" fill="none" /></g>}
        {rarity === 'rare' && [[18, 18], [82, 18], [18, 82], [82, 82]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="4.5" fill="#E8C46A" />)}
        {rarity === 'epic' && <path d="M50 20 L80 50 L50 80 L20 50Z" fill="none" stroke={info.glow} strokeWidth="3.5" opacity="0.85" />}
        {rarity === 'legendary' && Array.from({ length: 12 }, (_, i) => { const t = (i / 12) * Math.PI * 2; return <path key={i} d={`M50 50 L${50 + Math.cos(t) * 60} ${50 + Math.sin(t) * 60} L${50 + Math.cos(t + 0.13) * 60} ${50 + Math.sin(t + 0.13) * 60}Z`} fill="#FFF4C2" opacity="0.35" />; })}
        {rarity === 'mythic' && <><circle cx="50" cy="50" r="33" fill="#fff" opacity="0.4" /><path d="M50 21 L66 50 L50 72 L34 50Z" fill="#C9F6FF" /><path d="M50 21 L66 50 L50 50Z" fill={info.color} opacity="0.55" /></>}
        {rarity === 'solar' && <>
          {Array.from({ length: 16 }, (_, i) => { const t = (i / 16) * Math.PI * 2; return <path key={i} d={`M50 50 L${50 + Math.cos(t) * 70} ${50 + Math.sin(t) * 70} L${50 + Math.cos(t + 0.1) * 70} ${50 + Math.sin(t + 0.1) * 70}Z`} fill="#FFF1A8" opacity="0.4" />; })}
          <circle cx="50" cy="50" r="24" fill="#FFE14D" /><circle cx="50" cy="50" r="17" fill="#FFF6C9" />
        </>}
        {rarity === 'lunar' && <>
          {[[15, 20], [80, 14], [86, 70], [24, 80], [62, 86], [40, 12]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.4 + (i % 3) * 0.7} fill="#fff" />)}
          <circle cx="52" cy="50" r="26" fill="#E8EEFF" /><circle cx="64" cy="42" r="23" fill={b} /><circle cx="42" cy="58" r="3" fill="#C9D3F5" /><circle cx="36" cy="44" r="2" fill="#C9D3F5" />
        </>}
        {rarity === 'comet' && <>
          {[[12, 70], [84, 20], [70, 86], [30, 14]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.6" fill="#fff" />)}
          <path d="M14 86 L62 38" stroke="#22E3FF" strokeWidth="14" strokeLinecap="round" opacity="0.35" />
          <path d="M22 78 L62 38" stroke="#C9F8FF" strokeWidth="6" strokeLinecap="round" opacity="0.8" />
          <circle cx="66" cy="34" r="11" fill="#fff" /><circle cx="66" cy="34" r="18" fill="#22E3FF" opacity="0.3" />
        </>}
        {rarity === 'ancient' && <>
          <path d="M22 34 L50 18 L78 34Z" fill="#F4E2B8" /><rect x="22" y="34" width="56" height="5" fill="#E9D3A0" />
          {[28, 42, 56, 70].map((x) => <rect key={x} x={x - 3} y="40" width="6" height="34" fill="#F4E2B8" />)}
          <rect x="18" y="74" width="64" height="6" fill="#E9D3A0" />
          <path d="M18 80 q8 -6 14 0 M66 80 q8 -7 16 0" stroke="#5F8A3C" strokeWidth="4" fill="none" strokeLinecap="round" />
        </>}
        {rarity === 'prismatic' && Array.from({ length: 8 }, (_, i) => { const t = (i / 8) * Math.PI * 2; return <path key={i} d={`M50 50 L${50 + Math.cos(t) * 75} ${50 + Math.sin(t) * 75} L${50 + Math.cos(t + Math.PI / 4) * 75} ${50 + Math.sin(t + Math.PI / 4) * 75}Z`} fill={['#FF3D9A', '#FF9F1C', '#FFE14D', '#3DDC97', '#22E3FF', '#2F7BFF', '#A45CFF', '#FF7AE0'][i]} opacity="0.55" />; })}
        {rarity === 'prismatic' && <path d="M50 26 L70 50 L50 74 L30 50Z" fill="#fff" opacity="0.85" />}
        {rarity === 'genesis' && <>
          {Array.from({ length: 22 }, (_, i) => <circle key={i} cx={(i * 37) % 100} cy={(i * 61) % 100} r={0.8 + (i % 3) * 0.6} fill="#fff" opacity="0.8" />)}
          <g transform="rotate(-25 50 50)"><ellipse cx="50" cy="50" rx="40" ry="14" fill="#A45CFF" opacity="0.6" /><ellipse cx="50" cy="50" rx="26" ry="8" fill="#FF7AE0" opacity="0.7" /></g>
          <circle cx="50" cy="50" r="13" fill={`url(#${id}g)`} />
        </>}
        <rect width="100" height="100" fill={`url(#${id}bv)`} />
        {stake && <>
          <path d="M50 64 V34" stroke="#2A1C10" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M50 34 L68 40 L50 46Z" fill={rarity === 'common' ? '#E9EEF5' : info.color} />
        </>}
        {['legendary', 'mythic', 'solar', 'prismatic', 'genesis'].includes(rarity) && [[22, 26, 6], [78, 72, 5], [76, 24, 4]].map(([x, y, s]) => <path key={`${x}`} d={sparkle(x, y, s)} fill={rarity === 'legendary' ? '#FFF4C2' : '#fff'} />)}
        {shiny && <>
          <rect width="100" height="100" fill={`url(#${id}sh)`}><animate attributeName="x" values="-100;100" dur="2.4s" repeatCount="indefinite" /></rect>
          {[[16, 16, 7], [84, 50, 6], [30, 86, 5], [62, 14, 4]].map(([x, y, s]) => <path key={`s${x}`} d={sparkle(x, y, s)} fill="#fff"><animate attributeName="opacity" values="1;0.2;1" dur={`${1 + (x % 3) * 0.4}s`} repeatCount="indefinite" /></path>)}
        </>}
      </g>
      <rect x="1.5" y="1.5" width="97" height="97" rx="17" fill="none" stroke={shiny ? '#fff' : info.color} strokeOpacity={rarity === 'common' && !shiny ? 0.4 : 0.9} strokeWidth="3" />
    </svg>
  );
}
