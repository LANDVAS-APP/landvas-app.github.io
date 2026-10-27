// Animated previews of the four minigames — a looping glimpse of how each one
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
  if (game === 'patternshift') return <PatternShiftPreview {...common} id={id} still={still} />;
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

function PatternShiftPreview({ id, still, ...svg }: P) {
  const colors = ['#22C7B5', '#FFD43B', '#F5F4EF'];
  const grid = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];
  const cell = 26, x0 = 21, y0 = 18;
  return (
    <svg {...svg} aria-label="PatternShift: slide rows and columns to rebuild the mosaic">
      <defs><clipPath id={`${id}clip`}><rect x={x0} y={y0} width={cell * 3} height={cell * 3} rx="6" /></clipPath></defs>
      <rect width="120" height="120" fill="#10343A" />
      <g clipPath={`url(#${id}clip)`}>
        {grid.map((row, r) => (
          <g key={r}>
            {!still && r === 1 && <animateTransform attributeName="transform" type="translate" values={`0 0;0 0;${-cell} 0;${-cell} 0`} keyTimes="0;0.35;0.55;1" dur="3.2s" repeatCount="indefinite" />}
            {[...row, row[0]].map((c, i) => (
              <rect key={i} x={x0 + i * cell + 2} y={y0 + r * cell + 2} width={cell - 4} height={cell - 4} rx="5" fill={colors[c]} />
            ))}
          </g>
        ))}
      </g>
      <rect x={x0} y={y0} width={cell * 3} height={cell * 3} rx="6" fill="none" stroke="#ffffff" strokeOpacity="0.25" />
      <g>
        {!still && <animate attributeName="opacity" values="0.4;0.4;1;0.4" keyTimes="0;0.35;0.5;1" dur="3.2s" repeatCount="indefinite" />}
        <path d={`M${x0 - 9} ${y0 + cell * 1.5} l6 -5 v10 z`} fill="#FFD43B" />
        <path d={`M${x0 + cell * 3 + 9} ${y0 + cell * 1.5} l-6 -5 v10 z`} fill="#FFD43B" />
      </g>
      <text x="60" y="112" textAnchor="middle" fontSize="8" fontWeight="800" fill="#22C7B5" letterSpacing="1.5">SLIDE · PAR 4</text>
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
