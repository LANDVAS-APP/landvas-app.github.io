// Every enchantment's own sigil, drawn from its seed: a ring of runes, a seeded star, orbit marks and halos that grow
// with its level — no two alike. Pure SVG; the rings turn on the compositor.
import { useMemo } from 'react';
import { kindInfo } from './kinds';
import './enchant.css';

const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';

function rng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x6D2B79F5 >>> 0), (s >>> 8) / 16777216);
}

export function Sigil({ kind, seed, size = 64, level = 1, still, glow = true, className }: { kind: string; seed: number; size?: number | string; level?: number; still?: boolean; glow?: boolean; className?: string }) {
  const k = kindInfo(kind);
  const d = useMemo(() => {
    const r = rng(seed);
    const points = 5 + Math.floor(r() * 5);
    const inner = 0.36 + r() * 0.22;
    const twist = r() * Math.PI;
    const ticks = 12 + Math.floor(r() * 4) * 4;
    const runes = Array.from({ length: 8 + Math.floor(r() * 6) }, () => RUNES[Math.floor(r() * RUNES.length)]);
    const orbs = Array.from({ length: 2 + Math.floor(r() * 3) }, () => ({ a: r() * Math.PI * 2, rr: 30 + r() * 6, s: 1.5 + r() * 2 }));
    const star = Array.from({ length: points * 2 }, (_, i) => {
      const a = twist + (i * Math.PI) / points, rad = i % 2 ? 22 * inner : 22;
      return `${(50 + Math.cos(a) * rad).toFixed(2)},${(50 + Math.sin(a) * rad).toFixed(2)}`;
    }).join(' ');
    const hue = Math.floor(r() * 40) - 20;
    return { star, ticks, runes, orbs, hue, petals: 3 + Math.floor(r() * 4) };
  }, [seed]);
  const gid = `sg${seed}`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={{ filter: `hue-rotate(${d.hue}deg)` }} aria-hidden>
      <defs>
        <radialGradient id={`${gid}c`} cx="50%" cy="45%" r="60%"><stop offset="0" stopColor={k.a} stopOpacity="0.95" /><stop offset="0.6" stopColor={k.b} stopOpacity="0.55" /><stop offset="1" stopColor="#0b0618" stopOpacity="0.95" /></radialGradient>
        <linearGradient id={`${gid}r`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE8A3" /><stop offset="0.5" stopColor={k.a} /><stop offset="1" stopColor="#FFE8A3" /></linearGradient>
      </defs>
      {glow && <circle cx="50" cy="50" r="47" fill={k.a} opacity="0.18" className={still ? undefined : 'lv-sigil-pulse'} />}
      <circle cx="50" cy="50" r="44" fill={`url(#${gid}c)`} stroke={`url(#${gid}r)`} strokeWidth="2.2" />
      {/* the rune ring */}
      <g className={still ? undefined : 'lv-sigil-spin'}>
        <circle cx="50" cy="50" r="37" fill="none" stroke="#FFE8A3" strokeOpacity="0.5" strokeWidth="0.6" />
        {Array.from({ length: d.ticks }, (_, i) => {
          const a = (i / d.ticks) * Math.PI * 2;
          return <line key={i} x1={50 + Math.cos(a) * 40} y1={50 + Math.sin(a) * 40} x2={50 + Math.cos(a) * (i % 4 ? 42 : 43.5)} y2={50 + Math.sin(a) * (i % 4 ? 42 : 43.5)} stroke="#FFE8A3" strokeOpacity="0.7" strokeWidth="0.7" />;
        })}
        {d.runes.map((ch, i) => {
          const a = (i / d.runes.length) * Math.PI * 2 - Math.PI / 2;
          return <text key={i} x={50 + Math.cos(a) * 33} y={50 + Math.sin(a) * 33} fontSize="5.2" fill="#FFF3C9" fillOpacity="0.85" textAnchor="middle" dominantBaseline="central"
            transform={`rotate(${(a * 180) / Math.PI + 90} ${50 + Math.cos(a) * 33} ${50 + Math.sin(a) * 33})`}>{ch}</text>;
        })}
      </g>
      {/* the star */}
      <g className={still ? undefined : 'lv-sigil-spin-r'}>
        <polygon points={d.star} fill="none" stroke={k.a} strokeWidth="1.2" strokeOpacity="0.9" />
        {Array.from({ length: d.petals }, (_, i) => <ellipse key={i} cx="50" cy="50" rx="25" ry="8" fill="none" stroke="#FFE8A3" strokeOpacity="0.25" strokeWidth="0.6" transform={`rotate(${(i * 180) / d.petals} 50 50)`} />)}
        {d.orbs.map((o, i) => <circle key={i} cx={50 + Math.cos(o.a) * o.rr} cy={50 + Math.sin(o.a) * o.rr} r={o.s} fill="#FFF3C9" />)}
      </g>
      {/* level halos */}
      {Array.from({ length: Math.min(4, Math.floor((level - 1) / 2)) }, (_, i) => <circle key={i} cx="50" cy="50" r={47.5 - i * 1.6} fill="none" stroke="#FFD23F" strokeOpacity={0.5 - i * 0.08} strokeWidth="0.8" strokeDasharray={`${2 + i} ${3 + i}`} />)}
      <text x="50" y="52" fontSize="30" textAnchor="middle" dominantBaseline="central" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.6))' }}>{k.emoji}</text>
    </svg>
  );
}
