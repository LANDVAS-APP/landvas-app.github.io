// The player's rocket, drawn from the parts they've built: missing parts show as dashed outlines
// (so building it feels like assembling a kit), and a bigger engine gets side boosters.
import { motion } from 'motion/react';

export const PARTS = ['nose', 'tank', 'fins', 'engine'] as const;
export type Part = (typeof PARTS)[number];
export const PART_INFO: Record<Part, { label: string; emoji: string; blurb: string }> = {
  nose: { label: 'Nose cone', emoji: '🔺', blurb: 'Slices through the sky and holds the pilot seat.' },
  tank: { label: 'Fuel tank', emoji: '🛢️', blurb: 'Carries the Ink that burns as fuel.' },
  fins: { label: 'Fins', emoji: '🪽', blurb: 'Keeps the rocket flying straight.' },
  engine: { label: 'Engine', emoji: '🔥', blurb: 'The bigger it is, the farther you can go.' },
};

export function Rocket({ parts, engine = 1, flame = false, size = 180, accent = '#8B5CFF', className }: {
  parts: string[]; engine?: number; flame?: boolean; size?: number; accent?: string; className?: string;
}) {
  const has = (p: Part) => parts.includes(p);
  const ghost = { fill: 'none', stroke: 'rgba(255,255,255,0.35)', strokeDasharray: '4 4', strokeWidth: 1.5 };
  return (
    <svg viewBox="0 0 120 200" width={size * 0.6} height={size} className={className} aria-label={`Rocket: ${parts.length} of 4 parts built`} role="img">
      <defs>
        <linearGradient id="rk-body" x1="0" x2="1"><stop offset="0" stopColor="#D9E2F2" /><stop offset="0.45" stopColor="#FFFFFF" /><stop offset="1" stopColor="#A9B6CF" /></linearGradient>
        <linearGradient id="rk-flame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFF6B0" /><stop offset="0.45" stopColor="#FFB13D" /><stop offset="1" stopColor="#FF3D9A" stopOpacity="0" /></linearGradient>
      </defs>
      {/* flame */}
      {flame && has('engine') && (
        <motion.path d="M48 166 Q60 215 72 166 Z" fill="url(#rk-flame)" animate={{ scaleY: [1, 1.35, 0.9, 1.25, 1] }} transition={{ duration: 0.35, repeat: Infinity }} style={{ transformOrigin: '60px 166px' }} />
      )}
      {/* boosters (engine Mk II / III) */}
      {has('engine') && engine >= 2 && [26, 94].map((x) => (
        <g key={x}>
          <rect x={x - 7} y={108} width={14} height={50} rx={6} fill="url(#rk-body)" stroke="#7D8AA8" />
          <path d={`M${x - 7} 112 Q${x} 92 ${x + 7} 112 Z`} fill={accent} />
          {flame && <motion.path d={`M${x - 5} 158 Q${x} 185 ${x + 5} 158 Z`} fill="url(#rk-flame)" animate={{ scaleY: [1, 1.4, 1] }} transition={{ duration: 0.3, repeat: Infinity }} style={{ transformOrigin: `${x}px 158px` }} />}
        </g>
      ))}
      {/* fins */}
      {has('fins') ? (
        <g fill={accent}><path d="M38 120 L16 158 L38 152 Z" /><path d="M82 120 L104 158 L82 152 Z" /><rect x="57" y="138" width="6" height="22" rx="2" /></g>
      ) : <g {...ghost}><path d="M38 120 L16 158 L38 152 Z" /><path d="M82 120 L104 158 L82 152 Z" /></g>}
      {/* tank / body */}
      {has('tank') ? (
        <g>
          <rect x="38" y="62" width="44" height="96" rx="10" fill="url(#rk-body)" stroke="#7D8AA8" />
          <rect x="38" y="104" width="44" height="8" fill={accent} opacity="0.85" />
          <circle cx="60" cy="84" r="10" fill="#1B2A5E" stroke="#C9D3E6" strokeWidth="3" />
          <circle cx="57" cy="81" r="3" fill="#7EC8F5" />
        </g>
      ) : <rect x="38" y="62" width="44" height="96" rx="10" {...ghost} />}
      {/* nose */}
      {has('nose') ? <path d="M38 66 Q60 0 82 66 Z" fill={accent} stroke="#4B3A8F" /> : <path d="M38 66 Q60 0 82 66 Z" {...ghost} />}
      {/* engine bell */}
      {has('engine') ? (
        <g><path d="M46 156 L74 156 L78 170 L42 170 Z" fill="#59647D" stroke="#2E3548" />{engine >= 3 && <rect x="44" y="152" width="32" height="5" rx="2" fill="#FFC93D" />}</g>
      ) : <path d="M46 156 L74 156 L78 170 L42 170 Z" {...ghost} />}
    </svg>
  );
}
