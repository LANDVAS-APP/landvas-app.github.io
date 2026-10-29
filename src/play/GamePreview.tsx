// Animated previews of the minigames — a looping glimpse of how each one
// plays. Pure SVG (SMIL), no assets; a still frame when motion is reduced.
import { useId } from 'react';
import type { GameId } from '../shared/minigames';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';

export function GamePreview({ game, size, className }: { game: GameId; size?: number; className?: string }) {
  const still = useUi((s) => s.settings.reduceMotion);
  const id = useId().replace(/:/g, '');
  const style = size ? { width: size, height: size } : undefined;
  const common = { viewBox: '0 0 120 120', className: cn('block rounded-2xl', !size && 'aspect-square w-full', className), style, role: 'img' as const };
  if (game === 'tracecraft') return <TraceCraftPreview {...common} id={id} still={still} />;
  if (game === 'colorburst') return <ColorBurstPreview {...common} id={id} still={still} />;
  if (game === 'paintpop') return <PaintPopPreview {...common} id={id} still={still} />;
  if (game === 'memorymural') return <MemoryMuralPreview {...common} id={id} still={still} />;
  if (game === 'sculptor') return <SculptorPreview {...common} id={id} still={still} />;
  if (game === 'rollermural') return <RollerMuralPreview {...common} id={id} still={still} />;
  if (game === 'mirrorline') return <MirrorlinePreview {...common} id={id} still={still} />;
  return <LightLinesPreview {...common} id={id} still={still} />;
}

type P = { viewBox: string; className: string; style?: React.CSSProperties; role: 'img'; id: string; still: boolean };

function TraceCraftPreview({ id, still, ...svg }: P) {
  const path = 'M60 18 L71 45 L100 46 L77 64 L86 93 L60 76 L34 93 L43 64 L20 46 L49 45 Z';
  return (
    <svg {...svg} aria-label="TraceCraft: trace the glowing shape in one steady stroke">
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2c3247" /><stop offset="1" stopColor="#151927" /></linearGradient>
        <filter id={`${id}glow`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <rect width="120" height="120" fill={`url(#${id}bg)`} />
      {Array.from({ length: 14 }, (_, i) => <line key={i} x1={-20 + i * 11} y1="0" x2={20 + i * 11} y2="120" stroke="#ffffff" strokeOpacity="0.04" />)}
      <path d={path} fill="none" stroke="#B9C3D8" strokeOpacity="0.35" strokeWidth="2.2" strokeDasharray="2 4" strokeLinejoin="round" />
      <path d={path} fill="none" stroke="#E8ECF7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" filter={`url(#${id}glow)`}
        pathLength={100} strokeDasharray="100" strokeDashoffset={still ? 0 : 100}>
        {!still && <animate attributeName="stroke-dashoffset" values="100;0;0;100" keyTimes="0;0.7;0.9;1" dur="4s" repeatCount="indefinite" />}
      </path>
      {!still && (
        <g>
          <circle r="4.5" fill="#ffffff" filter={`url(#${id}glow)`}>
            <animateMotion dur="4s" repeatCount="indefinite" keyPoints="0;1;1;0" keyTimes="0;0.7;0.9;1" calcMode="linear" path={path} />
          </circle>
        </g>
      )}
      <text x="60" y="112" textAnchor="middle" fontSize="8" fontWeight="800" fill="#B9C3D8" letterSpacing="1.5">TRACE · 98%</text>
    </svg>
  );
}

function ColorBurstPreview({ id, still, ...svg }: P) {
  const drops = [
    { x: 42, c: '#FFD43B', d: 0 },
    { x: 60, c: '#2F6BFF', d: 0.6 },
    { x: 78, c: '#FFFFFF', d: 1.2 },
  ];
  return (
    <svg {...svg} aria-label="ColorBurst: mix pigments until you match the target colour">
      <defs>
        <radialGradient id={`${id}bg`} cx="0.5" cy="0.35" r="0.8"><stop offset="0" stopColor="#4a2238" /><stop offset="1" stopColor="#1d0f1a" /></radialGradient>
      </defs>
      <rect width="120" height="120" fill={`url(#${id}bg)`} />
      <g>
        <rect x="88" y="10" width="22" height="22" rx="6" fill="#58C46A" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.5" />
        <text x="99" y="40" textAnchor="middle" fontSize="6" fontWeight="800" fill="#ffffff" opacity="0.7">TARGET</text>
      </g>
      {drops.map((d) => (
        <circle key={d.x} cx={d.x} cy={still ? 70 : 18} r="5" fill={d.c} opacity={still ? 0 : 1}>
          {!still && <animate attributeName="cy" values="18;74;74" keyTimes="0;0.35;1" dur="3s" begin={`${d.d}s`} repeatCount="indefinite" />}
          {!still && <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.33;0.4;1" dur="3s" begin={`${d.d}s`} repeatCount="indefinite" />}
        </circle>
      ))}
      <ellipse cx="60" cy="86" rx="34" ry="16" fill="#120a14" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="2" />
      <ellipse cx="60" cy="84" rx="28" ry="11" fill={still ? '#58C46A' : '#FFD43B'}>
        {!still && <animate attributeName="fill" values="#FFD43B;#FFD43B;#3fa36a;#58C46A;#58C46A" keyTimes="0;0.25;0.55;0.75;1" dur="3s" repeatCount="indefinite" />}
        {!still && <animate attributeName="rx" values="22;28;30;28" dur="3s" repeatCount="indefinite" />}
      </ellipse>
      <g opacity={still ? 1 : 0}>
        {!still && <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.72;0.78;0.95;1" dur="3s" repeatCount="indefinite" />}
        <circle cx="60" cy="58" r="9" fill="#3DDC97" />
        <path d="M55.5 58 L59 61.5 L65 55" stroke="#0b1a12" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <text x="60" y="112" textAnchor="middle" fontSize="8" fontWeight="800" fill="#FFB23F" letterSpacing="1.5">ΔE 1.8 · MATCH</text>
    </svg>
  );
}

function PaintPopPreview({ id, still, ...svg }: P) {
  const cols = ['#FF4D6D', '#34C3FF', '#FFE14D', '#3DDC97'];
  const grid = [[0, 1, 2, 1], [3, 0, 0, 2], [1, 3, 2, 3], [2, 1, 3, 0]];
  const cell = 19, x0 = 10, y0 = 16;
  return (
    <svg {...svg} aria-label="Paint Pop: swap paint blobs to match three and paint the picture">
      <rect width="120" height="120" fill="#10343A" />
      {grid.map((row, r) => row.map((c, k) => (
        <circle key={`${r}${k}`} cx={x0 + k * cell + cell / 2} cy={y0 + r * cell + cell / 2} r={cell * 0.4} fill={cols[c]}>
          {!still && r === 1 && k >= 0 && k <= 2 && c === 0 && <animate attributeName="r" values={`${cell * 0.4};${cell * 0.4};0;${cell * 0.4}`} keyTimes="0;0.4;0.55;1" dur="2.6s" repeatCount="indefinite" />}
          {!still && r === 0 && k === 0 && <animate attributeName="r" values={`${cell * 0.4};${cell * 0.4};0;${cell * 0.4}`} keyTimes="0;0.4;0.55;1" dur="2.6s" repeatCount="indefinite" />}
        </circle>
      )))}
      <rect x="88" y="22" width="26" height="26" rx="4" fill="#F5F4EF" />
      <rect x="92" y="26" width="9" height="9" fill="#FF4D6D">{!still && <animate attributeName="opacity" values="0.15;0.15;1;1" keyTimes="0;0.5;0.6;1" dur="2.6s" repeatCount="indefinite" />}</rect>
      <rect x="101" y="35" width="9" height="9" fill="#34C3FF" opacity="0.9" />
      <text x="60" y="110" textAnchor="middle" fontSize="8" fontWeight="800" fill="#22C7B5" letterSpacing="1.5">POP · PAINT</text>
      <defs><clipPath id={`${id}clip`}><rect width="120" height="120" /></clipPath></defs>
    </svg>
  );
}

function LightLinesPreview({ id, still, ...svg }: P) {
  const beam = 'M14 30 L82 30 L82 82 L106 82';
  return (
    <svg {...svg} aria-label="LightLines: flip mirrors to bend each beam into its target">
      <defs>
        <radialGradient id={`${id}bg`} cx="0.5" cy="0.5" r="0.8"><stop offset="0" stopColor="#2a1a63" /><stop offset="1" stopColor="#0d0826" /></radialGradient>
        <filter id={`${id}glow`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <rect width="120" height="120" fill={`url(#${id}bg)`} />
      {Array.from({ length: 5 }, (_, i) => <line key={`h${i}`} x1="8" x2="112" y1={14 + i * 22} y2={14 + i * 22} stroke="#ffffff" strokeOpacity="0.05" />)}
      <rect x="6" y="24" width="10" height="12" rx="3" fill="#22E3FF" />
      <path d={beam} fill="none" stroke="#22E3FF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" filter={`url(#${id}glow)`}
        pathLength={100} strokeDasharray="100" strokeDashoffset={still ? 0 : 100}>
        {!still && <animate attributeName="stroke-dashoffset" values="100;0;0;100" keyTimes="0;0.55;0.9;1" dur="3.4s" repeatCount="indefinite" />}
      </path>
      <line x1="75" y1="23" x2="89" y2="37" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="75" y1="89" x2="89" y2="75" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round">
        {!still && <animateTransform attributeName="transform" type="rotate" values="90 82 82;90 82 82;0 82 82;0 82 82" keyTimes="0;0.15;0.3;1" dur="3.4s" repeatCount="indefinite" />}
      </line>
      <g filter={`url(#${id}glow)`}>
        <path d="M108 82 l-6 -8 l6 -8 l6 8 z" transform="translate(-2 8)" fill="#8B5CFF" stroke="#22E3FF" strokeWidth="1.5">
          {!still && <animate attributeName="fill" values="#3a2a7a;#3a2a7a;#22E3FF;#22E3FF;#3a2a7a" keyTimes="0;0.55;0.6;0.9;1" dur="3.4s" repeatCount="indefinite" />}
        </path>
      </g>
      <rect x="30" y="56" width="16" height="16" rx="3" fill="#1b1440" stroke="#ffffff" strokeOpacity="0.2" />
      <text x="60" y="112" textAnchor="middle" fontSize="8" fontWeight="800" fill="#B9A6FF" letterSpacing="1.5">FLIPS 1 · ★★★</text>
    </svg>
  );
}

function MemoryMuralPreview({ id, still, ...svg }: P) {
  const pal = ['#F5F4EF', '#FF4D6D', '#FFB23F', '#34C3FF'];
  const pic = [0, 1, 1, 0, 1, 2, 2, 1, 1, 2, 2, 1, 0, 3, 3, 0];
  return (
    <svg {...svg} aria-label="Memory Mural: memorise the painting, then repaint it from memory">
      <defs><linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3a1f2c" /><stop offset="1" stopColor="#150c16" /></linearGradient></defs>
      <rect width="120" height="120" fill={`url(#${id}bg)`} />
      {pic.map((c, i) => {
        const x = 24 + (i % 4) * 18, y = 16 + Math.floor(i / 4) * 18;
        return (
          <rect key={i} x={x} y={y} width="17" height="17" rx="2" fill={pal[c]}>
            {!still && c !== 0 && <animate attributeName="fill" values={`${pal[c]};${pal[c]};#F5F4EF;#F5F4EF;${pal[c]};${pal[c]}`} keyTimes={`0;0.3;0.34;${(0.42 + i * 0.025).toFixed(3)};${(0.44 + i * 0.025).toFixed(3)};1`} dur="5s" repeatCount="indefinite" />}
          </rect>
        );
      })}
      <text x="60" y="112" textAnchor="middle" fontSize="8" fontWeight="800" fill="#FFB0C0" letterSpacing="1.5">REMEMBER · REPAINT</text>
    </svg>
  );
}

function SculptorPreview({ id, still, ...svg }: P) {
  const shape = (k: number[]) => k.map((r, i) => { const a = (i / k.length) * Math.PI * 2 - Math.PI / 2; return `${i ? 'L' : 'M'}${(60 + Math.cos(a) * r).toFixed(1)} ${(54 + Math.sin(a) * r).toFixed(1)}`; }).join(' ') + 'Z';
  const target = shape([30, 26, 34, 26, 30, 26, 34, 26]);
  const a = shape([24, 24, 24, 24, 24, 24, 24, 24]);
  return (
    <svg {...svg} aria-label="Sculptor: push and pull the clay until it matches the outline">
      <defs>
        <radialGradient id={`${id}bg`} cx="0.5" cy="0.4" r="0.8"><stop offset="0" stopColor="#3a2a20" /><stop offset="1" stopColor="#120c08" /></radialGradient>
        <radialGradient id={`${id}clay`} cx="0.4" cy="0.35" r="0.75"><stop offset="0" stopColor="#F2C49B" /><stop offset="0.6" stopColor="#C8794A" /><stop offset="1" stopColor="#8A4B2A" /></radialGradient>
      </defs>
      <rect width="120" height="120" fill={`url(#${id}bg)`} />
      <path d={target} fill="none" stroke="#22E3FF" strokeWidth="1.6" strokeDasharray="4 3" />
      <path d={still ? target : a} fill={`url(#${id}clay)`} stroke="#5a2f19" strokeWidth="1.2">
        {!still && <animate attributeName="d" values={`${a};${target};${target};${a}`} keyTimes="0;0.6;0.9;1" dur="4s" repeatCount="indefinite" />}
      </path>
      <text x="60" y="112" textAnchor="middle" fontSize="8" fontWeight="800" fill="#F2C49B" letterSpacing="1.5">MATCH · 94%</text>
    </svg>
  );
}

function RollerMuralPreview({ id, still, ...svg }: P) {
  const W = '#F5F4EF', A = '#7B5CFF', B = '#FFB23F';
  // final mural after: column 1 in A, then row 2 in B
  const final = (r: number, c: number) => (r === 2 ? B : c === 1 ? A : W);
  return (
    <svg {...svg} aria-label="Roller Mural: roll whole rows and columns to recreate the mural">
      <rect width="120" height="120" fill="#14253A" />
      {Array.from({ length: 16 }, (_, k) => {
        const r = Math.floor(k / 4), c = k % 4;
        const x = 30 + c * 19, y = 18 + r * 19;
        const f = final(r, c);
        const mid = c === 1 ? A : W;
        return (
          <rect key={k} x={x} y={y} width="17" height="17" rx="3" fill={still ? f : W}>
            {!still && <animate attributeName="fill" values={`${W};${W};${mid};${mid};${f};${f};${W}`} keyTimes="0;0.2;0.25;0.5;0.55;0.92;1" dur="4s" repeatCount="indefinite" />}
          </rect>
        );
      })}
      {!still && (
        <rect x="30" y="14" width="17" height="6" rx="3" fill={A}>
          <animate attributeName="y" values="14;14;90;90;14" keyTimes="0;0.2;0.25;0.95;1" dur="4s" repeatCount="indefinite" />
        </rect>
      )}
      <text x="60" y="112" textAnchor="middle" fontSize="8" fontWeight="800" fill="#B4F5E5" letterSpacing="1.5">STROKES 2 · PAR 2</text>
    </svg>
  );
}

function MirrorlinePreview({ id, still, ...svg }: P) {
  const pal = ['#F5F4EF', '#34C3FF', '#7B5CFF', '#FF4FD8'];
  const half = [[0, 1, 2], [1, 3, 2], [2, 2, 1], [0, 1, 3]];
  return (
    <svg {...svg} aria-label="Mirrorline: paint the missing half as a perfect reflection">
      <rect width="120" height="120" fill="#0a1830" />
      {half.map((row, y) => row.map((c, x) => (
        <g key={`${x}${y}`}>
          <rect x={14 + x * 15} y={18 + y * 18} width="14" height="17" rx="2" fill={pal[c]} opacity="0.95" />
          <rect x={92 - x * 15} y={18 + y * 18} width="14" height="17" rx="2" fill={still ? pal[c] : '#F5F4EF'}>
            {!still && <animate attributeName="fill" values={`#F5F4EF;#F5F4EF;${pal[c]};${pal[c]};#F5F4EF`} keyTimes={`0;${(0.15 + (y * 3 + x) * 0.05).toFixed(2)};${(0.17 + (y * 3 + x) * 0.05).toFixed(2)};0.92;1`} dur="4.2s" repeatCount="indefinite" />}
          </rect>
        </g>
      )))}
      <line x1="60" y1="12" x2="60" y2="96" stroke="#22E3FF" strokeWidth="2" strokeDasharray="4 3" />
      <text x="60" y="112" textAnchor="middle" fontSize="8" fontWeight="800" fill="#BFE9FF" letterSpacing="1.5">MIRROR · 100%</text>
    </svg>
  );
}
