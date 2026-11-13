// The Leviathan itself: a colossal beast of living ink — four great legs, a ridge of glowing spines, tentacles off its
// back, a long head with a lantern-glow jaw. It walks; when frozen it stands rimed in frost; when shrunk it's smaller and
// sparks; when its weak spot is foretold a target burns on its chest; enraged, its eyes go red; fleeing, it's pale.
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export type LevLook = { status: string; paused?: boolean; shrunk?: boolean; foretold?: boolean; hit?: number; facing?: 1 | -1 };

export function LeviathanArt({ status, paused, shrunk, foretold, hit = 0, facing = 1, className }: LevLook & { className?: string }) {
  const eye = status === 'enraged' ? '#FF2D55' : status === 'fleeing' ? '#C9F2FF' : status === 'warning' ? '#9BE7FF' : '#22E3FF';
  const glow = status === 'enraged' ? '#FF2D55' : '#B026FF';
  const walking = !paused && status !== 'warning';
  return (
    <div className={cn('lv-lev relative', walking && 'walking', status === 'enraged' && 'enraged', status === 'fleeing' && 'fleeing', paused && 'frozen', className)}
      style={{ transform: `scaleX(${facing}) scale(${shrunk ? 0.74 : 1})` }}>
      <svg viewBox="0 0 240 200" className="h-full w-full overflow-visible" aria-hidden>
        <defs>
          <radialGradient id="lv-body" cx="45%" cy="35%" r="75%"><stop offset="0" stopColor="#3A1C78" /><stop offset="0.55" stopColor="#170A35" /><stop offset="1" stopColor="#05020F" /></radialGradient>
          <linearGradient id="lv-spine" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#1A0B3D" /><stop offset="1" stopColor={glow} /></linearGradient>
          <filter id="lv-blur"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        <ellipse cx="120" cy="188" rx="92" ry="10" fill="#000" opacity="0.45" />
        {/* tentacles off its back */}
        {[0, 1, 2, 3].map((i) => <path key={i} className="lv-lev-tent" style={{ animationDelay: `${i * 0.4}s`, transformOrigin: `${70 + i * 22}px 70px` }}
          d={`M${70 + i * 22} 70 Q${55 + i * 22} ${20 - i * 4} ${30 + i * 30} ${10 + (i % 2) * 8}`} stroke="#2A1260" strokeWidth={9 - i} fill="none" strokeLinecap="round" />)}
        {/* tail */}
        <path className="lv-lev-tail" d="M40 120 Q8 110 6 80 Q4 60 22 52" stroke="url(#lv-body)" strokeWidth="18" fill="none" strokeLinecap="round" />
        {/* legs */}
        {[[64, 0], [92, 1], [148, 0], [176, 1]].map(([x, alt], i) => (
          <g key={i} className={cn('lv-lev-leg', alt ? 'b' : 'a')} style={{ transformOrigin: `${x}px 128px` }}>
            <path d={`M${x - 12} 120 L${x - 16} 178 L${x + 10} 178 L${x + 12} 120Z`} fill="#0D0622" />
            <path d={`M${x - 18} 180 l6 -8 l6 8 l6 -8 l6 8 l6 -8 l2 8Z`} fill="#E5D9FF" opacity="0.85" />
          </g>
        ))}
        {/* body */}
        <path d="M30 120 Q34 62 96 52 Q150 40 190 70 Q214 90 206 124 Q196 150 120 152 Q44 152 30 120Z" fill="url(#lv-body)" stroke={glow} strokeOpacity="0.35" strokeWidth="2" />
        {/* spines */}
        {Array.from({ length: 8 }, (_, i) => { const x = 56 + i * 17, y = 58 - Math.sin((i / 7) * Math.PI) * 10; return <path key={i} d={`M${x - 7} ${y + 8} L${x} ${y - 20 - (i % 2) * 6} L${x + 7} ${y + 8}Z`} fill="url(#lv-spine)" className="lv-lev-spine" style={{ animationDelay: `${i * 0.15}s` }} />; })}
        {/* bioluminescent spots */}
        {[[70, 96], [96, 86], [122, 100], [150, 88], [172, 104], [110, 124], [140, 126], [84, 118]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3 + (i % 3)} fill={i % 2 ? '#22E3FF' : '#FF5CDB'} className="lv-lev-spot" style={{ animationDelay: `${i * 0.3}s` }} />)}
        {/* neck and head */}
        <g className="lv-lev-head" style={{ transformOrigin: '196px 84px' }}>
          <path d="M186 78 Q210 50 224 44 Q240 40 238 58 Q236 72 222 78 Q212 84 204 96Z" fill="url(#lv-body)" stroke={glow} strokeOpacity="0.4" strokeWidth="2" />
          <path d="M214 70 Q230 74 238 66" stroke="#FFE8A3" strokeWidth="2" fill="none" opacity="0.8" />
          {Array.from({ length: 5 }, (_, i) => <path key={i} d={`M${216 + i * 4} 70 l1.6 4 l1.6 -4Z`} fill="#fff" />)}
          <circle cx="226" cy="54" r="5" fill={eye} filter="url(#lv-blur)" /><circle cx="226" cy="54" r="3.4" fill={eye} className="lv-lev-eye" />
          <circle cx="216" cy="56" r="2.6" fill={eye} className="lv-lev-eye" />
        </g>
        {/* ink dripping off it */}
        {[60, 100, 140, 180].map((x, i) => <circle key={i} cx={x} cy={150} r="3" fill="#3A1C78" className="lv-lev-drip" style={{ animationDelay: `${i * 0.6}s` }} />)}
        {foretold && <g className="lv-lev-weak"><circle cx="118" cy="104" r="18" fill="none" stroke="#FF5CDB" strokeWidth="3" /><circle cx="118" cy="104" r="8" fill="none" stroke="#FF5CDB" strokeWidth="2" /><path d="M118 80 V128 M94 104 H142" stroke="#FF5CDB" strokeWidth="1.5" /></g>}
        {paused && <path d="M30 120 Q34 62 96 52 Q150 40 190 70 Q214 90 206 124 Q196 150 120 152 Q44 152 30 120Z" fill="#C9F2FF" opacity="0.35" />}
      </svg>
      {paused && <span className="absolute -right-2 top-0 text-2xl">❄️</span>}
      {shrunk && <span className="absolute -left-2 top-0 text-xl lv-ench-rune">📡</span>}
      {hit > 0 && <motion.span key={hit} className="pointer-events-none absolute inset-0 rounded-full" initial={{ opacity: 0.9, scale: 0.6 }} animate={{ opacity: 0, scale: 1.4 }} transition={{ duration: 0.5 }} style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.8), transparent 60%)' }} />}
    </div>
  );
}
