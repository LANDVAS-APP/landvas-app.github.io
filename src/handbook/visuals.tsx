// The Handbook's own pictures: diagrams of how things work, drawn in the game's colours. Pure SVG (and one canvas for
// the plot styles); anything that loops plays only on screen (animateWhenVisible) and holds still when the player has
// asked for less motion.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { animateWhenVisible } from '../lib/inView';
import { useUi } from '../lib/store';
import { drawPlotDesign } from '../map/plotStyle';
import type { PlotTypeId } from '../shared/grid';
import { cn } from '../lib/utils';

export const C = {
  rose: '#FF4D6D', amber: '#FF9F1C', sun: '#FFE14D', mint: '#3DDC97', sky: '#34C3FF', violet: '#8B6BFF', cyan: '#22E3FF', gold: '#FFC93D',
  night: '#070B1C', deep: '#0B1230', surface: '#10183A', raised: '#172253', empty: '#22306F', text: '#EEF1FF', muted: '#A1ABD6', faint: '#6D77A8',
};
const DISPLAY = { fontFamily: 'var(--font-display)', fontWeight: 800 } as const;
const BODY = { fontFamily: 'var(--font-body)', fontWeight: 700 } as const;

const useStill = () => useUi((s) => s.settings.reduceMotion);

/** a plot style's own design, painted the way the map paints it */
export function Swatch({ type, size = 56, seed = 3, className }: { type: PlotTypeId; size?: number; seed?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
    c.width = c.height = Math.round(size * dpr);
    const g = c.getContext('2d');
    if (g) drawPlotDesign(g, type, c.width, seed);
  }, [type, size, seed]);
  return <canvas ref={ref} style={{ width: size, height: size }} className={cn('shrink-0 rounded-xl', className)} aria-hidden />;
}

// ---- the core loop ------------------------------------------------------------------------------------------------

export function CoreLoop() {
  const still = useStill();
  const id = useId().replace(/:/g, '');
  const nodes = [
    { x: 200, y: 46, e: '🎮', t: 'Play', s: 'minigames & more', c: C.mint },
    { x: 336, y: 150, e: '💧', t: 'Earn Ink', s: 'the game’s currency', c: C.sky },
    { x: 290, y: 292, e: '🗺️', t: 'Claim plots', s: 'real places on Earth', c: C.violet },
    { x: 110, y: 292, e: '🎲', t: 'Roll rarity', s: 'Common … Primordial', c: C.amber },
    { x: 64, y: 150, e: '💵', t: 'Rent + games', s: 'every second', c: C.rose },
  ];
  const ring = 'M200 46 C 296 46, 336 90, 336 150 C 336 220, 326 270, 290 292 L 110 292 C 74 270, 64 220, 64 150 C 64 90, 104 46, 200 46 Z';
  return (
    <svg ref={animateWhenVisible} viewBox="0 0 400 350" className="mx-auto h-auto w-full max-w-[460px]" role="img" aria-label="The LANDVAS loop: play to earn Ink, claim plots, roll their rarity, earn rent and unlock more games, then play again">
      <defs>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={C.mint} /><stop offset="0.25" stopColor={C.sky} /><stop offset="0.5" stopColor={C.violet} /><stop offset="0.75" stopColor={C.amber} /><stop offset="1" stopColor={C.rose} />
        </linearGradient>
      </defs>
      <path d={ring} fill="none" stroke={`url(#${id}r)`} strokeWidth="5" strokeLinecap="round" opacity="0.85" strokeDasharray="2 12" />
      {!still && (
        <circle r="7" fill="#fff">
          <animateMotion dur="7s" repeatCount="indefinite" path={ring} />
        </circle>
      )}
      <text x="200" y="166" textAnchor="middle" fill={C.text} style={DISPLAY} fontSize="20">LANDVAS</text>
      <text x="200" y="188" textAnchor="middle" fill={C.muted} style={BODY} fontSize="11.5">the loop that never stops</text>
      {nodes.map((n) => (
        <g key={n.t} transform={`translate(${n.x} ${n.y})`}>
          <circle r="30" fill={C.surface} stroke={n.c} strokeWidth="3" />
          <text y="9" textAnchor="middle" fontSize="24">{n.e}</text>
          <text y="49" textAnchor="middle" fill={C.text} style={DISPLAY} fontSize="13">{n.t}</text>
          <text y="64" textAnchor="middle" fill={C.muted} style={BODY} fontSize="10.5">{n.s}</text>
        </g>
      ))}
    </svg>
  );
}

// ---- the screen, labelled ------------------------------------------------------------------------------------------

export function PhoneTour() {
  const marks: [number, number, number][] = [[1, 30, 34], [2, 108, 32], [3, 182, 32], [4, 252, 32], [5, 30, 82], [6, 206, 172], [7, 168, 398], [8, 262, 452], [9, 228, 300]];
  const plots: [number, number, string][] = [[112, 194, C.mint], [130, 194, C.sky], [112, 212, C.violet], [166, 230, C.amber], [184, 230, C.amber], [94, 248, C.rose]];
  return (
    <svg viewBox="0 0 280 500" className="mx-auto h-auto w-full max-w-[300px]" role="img" aria-label="The app's map screen with its parts numbered">
      <rect x="4" y="4" width="272" height="492" rx="36" fill="#05070F" stroke="#2A3566" strokeWidth="2" />
      <rect x="14" y="14" width="252" height="472" rx="28" fill={C.deep} />
      {/* map */}
      {Array.from({ length: 13 }, (_, i) => <line key={`v${i}`} x1={22 + i * 18} y1="100" x2={22 + i * 18} y2="420" stroke="#1C2860" />)}
      {Array.from({ length: 18 }, (_, i) => <line key={`h${i}`} x1="14" y1={104 + i * 18} x2="266" y2={104 + i * 18} stroke="#1C2860" />)}
      <path d="M14 330 C 90 310, 160 360, 266 320 L266 350 C 170 380, 90 340, 14 360 Z" fill="#14205A" />
      {plots.map(([x, y, c], i) => <rect key={i} x={x} y={y} width="16" height="16" rx="3" fill={c} opacity="0.92" />)}
      <rect x="76" y="158" width="126" height="126" fill="none" stroke="#fff" strokeOpacity="0.55" strokeDasharray="4 4" rx="4" />
      <circle cx="140" cy="221" r="7" fill="#fff" /><circle cx="140" cy="221" r="12" fill="none" stroke="#fff" strokeOpacity="0.35" />
      {/* HUD */}
      <rect x="22" y="22" width="236" height="30" rx="15" fill="#0E1640" stroke="#2A3566" />
      <circle cx="40" cy="37" r="10" fill={C.violet} /><text x="40" y="41" textAnchor="middle" fontSize="10" fill="#fff" style={DISPLAY}>S</text>
      <text x="55" y="41" fontSize="8.5" fill={C.muted} style={BODY}>LV 24</text>
      <text x="84" y="41" fontSize="9.5" fill={C.mint} style={DISPLAY}>$0.00041</text>
      <text x="148" y="41" fontSize="9.5" fill={C.sky} style={DISPLAY}>💧1,250</text>
      <circle cx="214" cy="37" r="10" fill="#2A2410" stroke={C.gold} /><text x="214" y="41" textAnchor="middle" fontSize="10">⚡</text>
      <text x="240" y="42" fontSize="12" textAnchor="middle">🔔</text>
      {/* the row of discs */}
      {['🔥', '🍀', '📖', '🐉', '👁️'].map((e, i) => (
        <g key={e} transform={`translate(${64 + i * 38} 76)`}><circle r="15" fill="#141E52" stroke="#2A3566" strokeWidth="1.5" /><text y="5" textAnchor="middle" fontSize="13">{e}</text></g>
      ))}
      {/* the Worlds button, floating on the edge */}
      <g transform="translate(248 306)"><circle r="14" fill="#2B1F7A" stroke={C.violet} strokeWidth="1.5" /><text y="5" textAnchor="middle" fontSize="13">🌍</text>
        <rect x="-17" y="17" width="34" height="11" rx="5.5" fill="#0E1640" /><text y="25.5" textAnchor="middle" fontSize="7" fill="#fff" style={BODY}>Worlds</text></g>
      {/* the World button, held: its actions fan out */}
      {['✈️', '🕹️', '🎡', '📍', '🚀'].map((e, i) => {
        const a = Math.PI * (1.08 + i * 0.21), r = 54;
        return <g key={e} transform={`translate(${140 + Math.cos(a) * r} ${442 + Math.sin(a) * r})`}><circle r="12" fill="#141E52" stroke={C.sky} strokeWidth="1.2" /><text y="4" textAnchor="middle" fontSize="11">{e}</text></g>;
      })}
      {/* tab bar */}
      <rect x="22" y="430" width="236" height="46" rx="23" fill="#0E1640" stroke="#2A3566" />
      {['Play', 'Social', '', 'Inkborn', 'Create'].map((t, i) => t && <text key={t} x={48 + i * 46} y="458" textAnchor="middle" fontSize="8" fill={C.muted} style={BODY}>{t}</text>)}
      <circle cx="140" cy="442" r="22" fill={C.sky} stroke="#fff" strokeWidth="2" /><text x="140" y="447" textAnchor="middle" fontSize="14">🌍</text>
      {/* numbered marks */}
      {marks.map(([n, x, y]) => (
        <g key={n} transform={`translate(${x} ${y - 16})`}><circle r="8" fill={C.rose} stroke="#fff" strokeWidth="1.5" /><text y="3.5" textAnchor="middle" fontSize="9" fill="#fff" style={DISPLAY}>{n}</text></g>
      ))}
    </svg>
  );
}

// ---- claim reach ---------------------------------------------------------------------------------------------------

export function ReachGrid({ reach = 6 }: { reach?: number }) {
  const N = reach * 2 + 5, S = 18, pad = 10, mid = Math.floor(N / 2);
  const mine = new Set(['0,-1', '1,-1', '0,-2', '3,2', '4,2']);
  const theirs = new Set(['-3,1', '-3,2', '-2,2', '5,-4', '2,4', '-5,-5', '7,0', '-7,3']);
  const W = N * S + pad * 2;
  return (
    <svg viewBox={`0 0 ${W} ${W + 26}`} className="mx-auto h-auto w-full max-w-[360px]" role="img" aria-label={`You can claim any free plot within ${reach} plots of your explorer — a square ${reach * 2 + 1} plots across`}>
      {Array.from({ length: N * N }, (_, i) => {
        const x = i % N, y = Math.floor(i / N), dx = x - mid, dy = y - mid, k = `${dx},${dy}`;
        const inside = Math.max(Math.abs(dx), Math.abs(dy)) <= reach;
        const fill = mine.has(k) ? C.mint : theirs.has(k) ? '#55608F' : inside ? '#1B2763' : '#111A44';
        return <rect key={i} x={pad + x * S + 1} y={pad + y * S + 1} width={S - 2} height={S - 2} rx="3" fill={fill} opacity={inside || mine.has(k) || theirs.has(k) ? 1 : 0.55} />;
      })}
      <rect x={pad + (mid - reach) * S} y={pad + (mid - reach) * S} width={(reach * 2 + 1) * S} height={(reach * 2 + 1) * S} rx="6" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="6 5" />
      <circle cx={pad + mid * S + S / 2} cy={pad + mid * S + S / 2} r="6.5" fill="#fff" />
      <text x={W / 2} y={W + 18} textAnchor="middle" fontSize="11" fill={C.muted} style={BODY}>
        <tspan fill={C.mint}>■</tspan> yours  <tspan fill="#8A94C2">■</tspan> taken  <tspan fill="#3A4A9A">■</tspan> free, in reach  ⬜ your explorer
      </text>
    </svg>
  );
}

// ---- how far each vehicle roams -------------------------------------------------------------------------------------

export function RangeRings({ items }: { items: { name: string; emoji: string; m: number; cost: string }[] }) {
  const max = Math.max(...items.map((x) => x.m));
  const R = (m: number) => 26 + Math.sqrt(m / max) * 124;
  const colors = [C.mint, C.sky, C.amber, C.rose];
  return (
    <svg viewBox="0 0 340 330" className="mx-auto h-auto w-full max-w-[380px]" role="img" aria-label="How far you can roam from where you really are, with each vehicle">
      {[...items].reverse().map((x, i) => {
        const c = colors[items.length - 1 - i] ?? C.violet;
        return <circle key={x.name} cx="170" cy="165" r={R(x.m)} fill={`${c}14`} stroke={c} strokeWidth="2" strokeDasharray={i === 0 ? '0' : '5 4'} />;
      })}
      {items.map((x, i) => {
        // each label sits on its own ring, at its own angle, so none overlap
        const c = colors[i] ?? C.violet, r = R(x.m), a = [90, -28, 208, -90][i] ?? -90;
        const lx = Math.max(52, Math.min(288, 170 + Math.cos((a * Math.PI) / 180) * r)), ly = 165 + Math.sin((a * Math.PI) / 180) * r;
        return (
          <g key={x.name} transform={`translate(${lx} ${ly})`}>
            <rect x="-50" y="-11" width="100" height="22" rx="11" fill={C.night} stroke={c} />
            <text y="4" textAnchor="middle" fontSize="10" fill={C.text} style={BODY}>{x.emoji} {x.name} · {x.m >= 1000 ? `${x.m / 1000} km` : `${x.m} m`}</text>
          </g>
        );
      })}
      <circle cx="170" cy="165" r="6" fill="#fff" />
      <text x="170" y="186" textAnchor="middle" fontSize="9.5" fill={C.muted} style={BODY}>where you are</text>
    </svg>
  );
}

// ---- bigger places open more ---------------------------------------------------------------------------------------

export function MergeLadder() {
  const steps = [
    { g: [1, 1], label: '1 plot', sub: '¼ of its games', c: C.sky },
    { g: [2, 1], label: '2–3 plots', sub: '½ of its games', c: C.mint },
    { g: [4, 1], label: '4+ plots', sub: 'all its games', c: C.amber },
    { g: [2, 2], label: '2×2 square', sub: 'can become its Estate', c: C.rose },
    { g: [3, 3], label: '3×3 square', sub: 'can become its Domain', c: C.violet },
  ];
  return (
    <div className="hb-ladder" role="img" aria-label="One plot opens a quarter of a place's games; two or three open half; four or more open all; a 2 by 2 square can become an Estate, a 3 by 3 square a Domain">
      {steps.map((s, i) => {
        const cell = 14, w = s.g[0] * cell, h = s.g[1] * cell;
        return (
          <div key={i} className="st">
            <svg viewBox={`-4 -4 ${w + 8} ${h + 8}`} width={(w + 8) * 1.6} height={(h + 8) * 1.6} aria-hidden>
              {Array.from({ length: s.g[0] * s.g[1] }, (_, k) => <rect key={k} x={(k % s.g[0]) * cell + 1} y={Math.floor(k / s.g[0]) * cell + 1} width={cell - 2} height={cell - 2} rx="3" fill={s.c} />)}
              {i >= 3 && <rect x="-2.5" y="-2.5" width={w + 5} height={h + 5} rx="5" fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.2" />}
            </svg>
            <b>{s.label}</b><span>{s.sub}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---- the roll, frame by frame -------------------------------------------------------------------------------------

export function RollStrip() {
  const frames = [
    { t: '1 · The drop', s: 'ink falls and splashes' },
    { t: '2 · The drum', s: 'rarities spin past' },
    { t: '3 · The tag', s: 'its minigame lands' },
    { t: '4 · The reveal', s: 'the plot rises' },
  ];
  return (
    <div className="hb-frames" role="img" aria-label="A roll: the ink drop, the spinning drum of rarities, the minigame tag, then the reveal">
      {frames.map((f, i) => (
        <div key={i} className="f">
          <svg viewBox="0 0 120 150" className="h-auto w-full" aria-hidden>
            <rect width="120" height="150" rx="14" fill={C.surface} stroke="#2A3566" />
            <rect x="14" y="14" width="92" height="122" rx="10" fill="#F3E9D2" />
            {i === 0 && <><circle cx="60" cy="64" r="10" fill={C.violet} /><path d="M60 30 Q 65 46 60 53 Q 55 46 60 30Z" fill={C.violet} /><circle cx="42" cy="84" r="4.5" fill={C.violet} opacity="0.7" /><circle cx="80" cy="78" r="3.5" fill={C.violet} opacity="0.7" /><circle cx="70" cy="96" r="2.5" fill={C.violet} opacity="0.6" /></>}
            {i === 1 && <>
              <rect x="20" y="40" width="80" height="66" rx="6" fill="#141E52" />
              {['RARE', 'EPIC', 'LEGENDARY'].map((r, k) => <text key={r} x="60" y={58 + k * 20} textAnchor="middle" fontSize={k === 1 ? 13 : 9} fill={k === 1 ? '#C9A2FF' : '#6D77A8'} style={DISPLAY}>{r}</text>)}
              <rect x="17" y="64" width="86" height="20" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
            </>}
            {i === 2 && <>
              <ellipse cx="60" cy="66" rx="36" ry="32" fill="#A45CFF" opacity="0.9" />
              <text x="60" y="71" textAnchor="middle" fontSize="13" fill="#fff" style={DISPLAY}>EPIC</text>
              <rect x="20" y="110" width="80" height="18" rx="9" fill="#0B1230" /><text x="60" y="123" textAnchor="middle" fontSize="8.5" fill={C.sun} style={DISPLAY}>💡 LIGHTLINES</text>
            </>}
            {i === 3 && <>
              <rect x="14" y="14" width="92" height="122" rx="10" fill="#A45CFF" />
              {Array.from({ length: 8 }, (_, k) => <line key={k} x1="60" y1="70" x2={60 + Math.cos((k * Math.PI) / 4) * 60} y2={70 + Math.sin((k * Math.PI) / 4) * 60} stroke="#fff" strokeOpacity="0.25" strokeWidth="6" />)}
              <rect x="37" y="46" width="46" height="46" rx="9" fill="#170F3D" stroke="#DABDFF" strokeWidth="2.5" />
              <text x="60" y="116" textAnchor="middle" fontSize="13" fill="#fff" style={DISPLAY}>EPIC!</text>
            </>}
          </svg>
          <b>{f.t}</b><span>{f.s}</span>
        </div>
      ))}
    </div>
  );
}

// ---- a 24-hour day with the boost in it -----------------------------------------------------------------------------

export function BoostDay({ hours, mult }: { hours: number; mult: number }) {
  const W = 360, x0 = 12, w = 336, hw = w / 24, top = 34, base = 132, H = base - top;
  const startH = 18; // e.g. used at 6 pm
  return (
    <svg viewBox={`0 0 ${W} 176`} className="mx-auto h-auto w-full max-w-[520px]" role="img" aria-label={`A day of rent: ${hours} boosted hours earn ×${mult}`}>
      <text x={x0} y="16" fontSize="12" fill={C.muted} style={BODY}>Rent earned in each hour of one day</text>
      <g transform={`translate(${x0} 22)`}><rect width="10" height="10" rx="2" fill={C.mint} /><text x="14" y="9" fontSize="10.5" fill={C.text} style={BODY}>boosted ×{mult}</text>
        <rect x="104" width="10" height="10" rx="2" fill="#5B6BC4" /><text x="118" y="9" fontSize="10.5" fill={C.text} style={BODY}>normal</text></g>
      {Array.from({ length: 24 }, (_, h) => {
        const boosted = ((h - startH + 24) % 24) < hours;
        const bh = boosted ? H - 6 : Math.max(5, (H - 6) / Math.max(2, mult));
        return <rect key={h} x={x0 + h * hw + 1.5} y={base - bh} width={hw - 3} height={bh} rx="3" fill={boosted ? C.mint : '#5B6BC4'} />;
      })}
      <line x1={x0} x2={x0 + w} y1={base + 1} y2={base + 1} stroke="#2A3566" />
      {[0, 6, 12, 18].map((h) => <text key={h} x={x0 + h * hw + hw / 2} y={base + 16} textAnchor="middle" fontSize="11" fill={C.faint} style={BODY}>{h}:00</text>)}
      <text x={x0 + w} y={base + 36} textAnchor="end" fontSize="12" fill={C.mint} style={DISPLAY}>{fmt1(hours)} h × {mult} = {fmt1(hours * mult)} hours’ worth of rent</text>
    </svg>
  );
}
const fmt1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString();

// ---- simple bars ---------------------------------------------------------------------------------------------------

export function Bars({ rows, unit, max: maxIn }: { rows: { label: ReactNode; v: number; c: string; note?: ReactNode }[]; unit(v: number): string; max?: number }) {
  const max = maxIn ?? Math.max(1e-12, ...rows.map((r) => r.v));
  return (
    <div className="hb-bars">
      {rows.map((r, i) => (
        <div key={i} className="row">
          <span className="l">{r.label}</span>
          <span className="track"><i style={{ width: `${Math.max(2, Math.min(100, (r.v / max) * 100))}%`, background: r.c }} /></span>
          <span className="v">{unit(r.v)}{r.note && <em>{r.note}</em>}</span>
        </div>
      ))}
    </div>
  );
}

// ---- the week of the daily streak -----------------------------------------------------------------------------------

export function StreakWeek({ ink, ticket, day30Ink, day30Ticket }: { ink: number[]; ticket: string; day30Ink: number; day30Ticket: string }) {
  return (
    <div className="hb-streak">
      {ink.map((x, i) => (
        <div key={i} className={cn('d', i === 6 && 'big')}>
          <span className="n">Day {i + 1}</span>
          <span className="e">{i === 6 ? '🎟️' : '💧'}</span>
          <b>{x}</b>
          {i === 6 && <span className="t">+ {ticket}+ roll</span>}
        </div>
      ))}
      <div className="d gold">
        <span className="n">Day 30</span><span className="e">🏆</span><b>+{day30Ink}</b><span className="t">+ {day30Ticket}+ roll</span>
      </div>
    </div>
  );
}

// ---- the daily wheel ------------------------------------------------------------------------------------------------

export function WheelPie({ slices }: { slices: { label: string; color: string; weight: number }[] }) {
  const total = slices.reduce((s, x) => s + x.weight, 0) || 1;
  let a = -Math.PI / 2;
  const R = 92, cx = 100, cy = 100;
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[220px_1fr]">
      <svg viewBox="0 0 200 200" className="mx-auto h-auto w-full max-w-[220px]" role="img" aria-label="The daily wheel's slices, sized by how often each comes up">
        {slices.map((s) => {
          const da = (s.weight / total) * Math.PI * 2, a2 = a + da;
          const large = da > Math.PI ? 1 : 0;
          const d = `M${cx} ${cy} L${cx + R * Math.cos(a)} ${cy + R * Math.sin(a)} A${R} ${R} 0 ${large} 1 ${cx + R * Math.cos(a2)} ${cy + R * Math.sin(a2)} Z`;
          a = a2;
          return <path key={s.label} d={d} fill={s.color} stroke={C.deep} strokeWidth="2" />;
        })}
        <circle cx={cx} cy={cy} r="22" fill={C.deep} stroke="#fff" strokeWidth="2" /><text x={cx} y={cy + 6} textAnchor="middle" fontSize="16">🎡</text>
      </svg>
      <div className="grid gap-1.5">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-[13px]"><i className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} /><span className="flex-1 font-semibold">{s.label}</span><span className="tnum text-muted">{Math.round((s.weight / total) * 1000) / 10}%</span></div>
        ))}
      </div>
    </div>
  );
}

// ---- rerolls: see every roll, keep one -----------------------------------------------------------------------------

export function RerollFan({ rolls, keep }: { rolls: { name: string; color: string }[]; keep: number }) {
  return (
    <div className="hb-fan">
      {rolls.map((r, i) => (
        <div key={i} className={cn('card', i === keep && 'keep')} style={{ ['--c' as string]: r.color }}>
          <span className="n">Roll {i + 1}</span>
          <b>{r.name}</b>
          {i === keep && <span className="k">✓ KEEP</span>}
        </div>
      ))}
    </div>
  );
}

// ---- a meter (Luck, energy, a spring) ------------------------------------------------------------------------------

export function Meter({ value, max, color, label, marks }: { value: number; max: number; color: string; label: ReactNode; marks?: number[] }) {
  return (
    <div className="hb-meter">
      <div className="top"><span>{label}</span><b className="tnum">{value} / {max}</b></div>
      <div className="bar"><i style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%`, background: color }} />{marks?.map((m) => <s key={m} style={{ left: `${(m / max) * 100}%` }} />)}</div>
    </div>
  );
}

// ---- the Hot Zone ---------------------------------------------------------------------------------------------------

export function HotZone({ city, ultra, shiny }: { city: string; ultra: number; shiny: number }) {
  const still = useStill();
  return (
    <svg ref={animateWhenVisible} viewBox="0 0 360 220" className="mx-auto h-auto w-full max-w-[420px]" role="img" aria-label={`Today's Hot Zone is ${city}: claims there roll twice and keep the better, ultras ×${ultra}, shiny ×${shiny}`}>
      <rect width="360" height="220" rx="16" fill={C.deep} />
      {Array.from({ length: 19 }, (_, i) => <line key={`a${i}`} x1={i * 20} y1="0" x2={i * 20} y2="220" stroke="#16215A" />)}
      {Array.from({ length: 12 }, (_, i) => <line key={`b${i}`} x1="0" y1={i * 20} x2="360" y2={i * 20} stroke="#16215A" />)}
      <circle cx="180" cy="110" r="84" fill="#FF4D6D22" stroke={C.rose} strokeWidth="2.5" strokeDasharray="7 6" />
      <circle cx="180" cy="110" r="84" fill="none" stroke={C.amber} strokeWidth="1.5" opacity="0.5">
        {!still && <animate attributeName="opacity" values="0.6;0;0.6" dur="2.6s" repeatCount="indefinite" />}
      </circle>
      <text x="180" y="104" textAnchor="middle" fontSize="26">🔥</text>
      <text x="180" y="128" textAnchor="middle" fontSize="15" fill="#fff" style={DISPLAY}>{city}</text>
      <g transform="translate(18 18)"><rect width="104" height="24" rx="12" fill={C.night} stroke={C.rose} /><text x="52" y="16" textAnchor="middle" fontSize="10" fill="#fff" style={BODY}>🎲🎲 best of 2</text></g>
      <g transform="translate(238 18)"><rect width="104" height="24" rx="12" fill={C.night} stroke={C.violet} /><text x="52" y="16" textAnchor="middle" fontSize="10" fill="#fff" style={BODY}>🌌 ultras ×{ultra}</text></g>
      <g transform="translate(128 182)"><rect width="104" height="24" rx="12" fill={C.night} stroke={C.sun} /><text x="52" y="16" textAnchor="middle" fontSize="10" fill="#fff" style={BODY}>✨ shiny ×{shiny}</text></g>
    </svg>
  );
}

// ---- the solar system ------------------------------------------------------------------------------------------------

export function Planets({ worlds }: { worlds: { name: string; color: string; r: number; note: string; tier: number }[] }) {
  return (
    <div className="hb-planets no-scrollbar">
      {worlds.map((w) => (
        <div key={w.name} className="p">
          <svg viewBox="0 0 60 60" width="54" height="54" aria-hidden>
            <defs><radialGradient id={`pl-${w.name.replace(/\W/g, '')}`} cx="35%" cy="35%" r="70%"><stop offset="0" stopColor="#fff" stopOpacity="0.55" /><stop offset="0.35" stopColor={w.color} /><stop offset="1" stopColor="#000" stopOpacity="0.85" /></radialGradient></defs>
            <circle cx="30" cy="30" r={Math.max(9, Math.min(26, 6 + w.r))} fill={`url(#pl-${w.name.replace(/\W/g, '')})`} />
          </svg>
          <b>{w.name}</b>
          <span>{w.note}</span>
          <i className={cn('tier', `t${w.tier}`)}>Tier {w.tier}</i>
        </div>
      ))}
    </div>
  );
}

// ---- A + B = C ------------------------------------------------------------------------------------------------------

export function Recipe({ a, b, to, note }: { a: ReactNode; b: ReactNode; to: ReactNode; note?: ReactNode }) {
  return (
    <div className="hb-recipe">
      <span className="x">{a}</span><i>+</i><span className="x">{b}</span><i>=</i><span className="x to">{to}</span>
      {note && <p>{note}</p>}
    </div>
  );
}

// ---- a day plan ------------------------------------------------------------------------------------------------------

export function Timeline({ items }: { items: { t: string; e: string; title: string; body: ReactNode; c: string }[] }) {
  return (
    <ol className="hb-timeline">
      {items.map((x) => (
        <li key={x.title} style={{ ['--c' as string]: x.c }}>
          <span className="dot">{x.e}</span>
          <div><span className="when">{x.t}</span><b className="ttl">{x.title}</b><div className="body">{x.body}</div></div>
        </li>
      ))}
    </ol>
  );
}

// ---- stars -------------------------------------------------------------------------------------------------------------

export function StarLadder({ steps }: { steps: { stars: number; copies: string; power: string }[] }) {
  return (
    <div className="hb-stars">
      {steps.map((s) => (
        <div key={s.stars} className="s">
          <span className="pips">{'★'.repeat(s.stars)}<i>{'★'.repeat(Math.max(0, steps.length - s.stars))}</i></span>
          <b>{s.copies}</b>
          <span>{s.power}</span>
        </div>
      ))}
    </div>
  );
}

// ---- how big a plot is ----------------------------------------------------------------------------------------------

export function PlotScale() {
  return (
    <svg viewBox="0 0 360 200" className="mx-auto h-auto w-full max-w-[460px]" role="img" aria-label="A house with the plot grid over it: six to eight plots cover one house">
      <rect width="360" height="200" rx="16" fill={C.deep} />
      {/* street */}
      <rect x="0" y="160" width="360" height="40" fill="#141B44" />
      {Array.from({ length: 9 }, (_, i) => <rect key={i} x={10 + i * 40} y="178" width="22" height="4" rx="2" fill="#3A4680" />)}
      {/* house, seen from above */}
      <rect x="96" y="38" width="150" height="104" rx="6" fill="#5B3B2E" />
      <path d="M96 38 L171 82 L246 38 Z" fill="#7A4A36" /><path d="M96 142 L171 98 L246 142 Z" fill="#6A3F2F" />
      <rect x="162" y="82" width="18" height="16" fill="#3A2418" />
      <rect x="40" y="58" width="38" height="70" rx="8" fill="#1F5B3A" /><circle cx="59" cy="72" r="13" fill="#2E8B57" /><circle cx="56" cy="104" r="15" fill="#2E8B57" />
      {/* the grid */}
      {Array.from({ length: 7 }, (_, i) => <line key={`v${i}`} x1={84 + i * 34} y1="26" x2={84 + i * 34} y2="160" stroke="#fff" strokeOpacity="0.55" strokeDasharray="3 3" />)}
      {Array.from({ length: 5 }, (_, i) => <line key={`h${i}`} x1="84" y1={26 + i * 34} x2={288} y2={26 + i * 34} stroke="#fff" strokeOpacity="0.55" strokeDasharray="3 3" />)}
      <rect x="118" y="60" width="34" height="34" fill={C.mint} fillOpacity="0.35" stroke={C.mint} strokeWidth="2" />
      <g transform="translate(118 46)"><path d="M0 4 L34 4" stroke={C.sun} strokeWidth="1.5" /><path d="M0 0 L0 8 M34 0 L34 8" stroke={C.sun} strokeWidth="1.5" /></g>
      <text x="135" y="40" textAnchor="middle" fontSize="11" fill={C.sun} style={DISPLAY}>≈ 7–10 m</text>
      <text x="300" y="80" fontSize="11" fill={C.text} style={BODY}>one plot</text>
      <path d="M298 76 L156 76" stroke={C.mint} strokeWidth="1.2" strokeDasharray="2 3" />
      <text x="300" y="118" fontSize="10.5" fill={C.muted} style={BODY}>6–8 cover</text>
      <text x="300" y="132" fontSize="10.5" fill={C.muted} style={BODY}>a house</text>
    </svg>
  );
}

// ---- the claim preview ----------------------------------------------------------------------------------------------

export function ClaimMock({ price, free }: { price: number; free: number }) {
  const types = [['🟩', 'Base'], ['🎨', 'Art'], ['🌳', 'Habitat'], ['🌾', 'Farm'], ['🍋', 'Business'], ['🕹️', 'Arcade']];
  return (
    <div className="hb-claim" role="img" aria-label="The claim preview: pick what the plot becomes, then claim it">
      <div className="top"><span className="sw" /><div><b>Free plot</b><span>Next to your land · in reach</span></div><span className="x">✕</span></div>
      <div className="lbl">What this plot becomes</div>
      <div className="types">{types.map(([e, t], i) => <span key={t} className={i === 0 ? 'on' : ''}>{e}<i>{t}</i></span>)}</div>
      <div className="meta"><span>✎ Name it</span>{free > 0 && <span className="ok">🎁 {free} free plots left</span>}<span className="link">🎲 See the odds</span></div>
      <div className="btn">Claim · {free > 0 ? 'Free' : `${price} Ink`}</div>
    </div>
  );
}

// ---- a trip: board, ride, arrive, roam ------------------------------------------------------------------------------

export function TravelRoute() {
  const stops: [number, number][] = [[64, 150], [120, 120], [176, 132], [232, 92]];
  return (
    <svg viewBox="0 0 360 200" className="mx-auto h-auto w-full max-w-[460px]" role="img" aria-label="A trip: board near you, pass real stations, arrive and roam about 2.5 km">
      <rect width="360" height="200" rx="16" fill={C.deep} />
      {Array.from({ length: 18 }, (_, i) => <line key={i} x1={i * 20} y1="0" x2={i * 20} y2="200" stroke="#16215A" />)}
      <path d="M30 168 Q 64 150 64 150 T 120 120 T 176 132 T 232 92 T 300 62" fill="none" stroke={C.sky} strokeWidth="3" strokeDasharray="7 6" strokeLinecap="round" />
      {stops.map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="6" fill={C.surface} stroke={C.sun} strokeWidth="2.5" /><text x={x} y={y + 20} textAnchor="middle" fontSize="12">🎫</text></g>)}
      <circle cx="30" cy="168" r="8" fill="#fff" /><text x="30" y="192" textAnchor="middle" fontSize="10" fill={C.muted} style={BODY}>you board</text>
      <circle cx="300" cy="62" r="46" fill={`${C.mint}1f`} stroke={C.mint} strokeWidth="1.5" strokeDasharray="5 4" />
      <circle cx="300" cy="62" r="8" fill={C.mint} /><text x="300" y="66" textAnchor="middle" fontSize="9">🚉</text>
      <text x="300" y="124" textAnchor="middle" fontSize="10.5" fill={C.mint} style={DISPLAY}>arrive · roam ≈ 2.5 km</text>
      <text x="148" y="34" textAnchor="middle" fontSize="11" fill={C.text} style={BODY}>🎫 a souvenir stamp at every new stop</text>
    </svg>
  );
}

// ---- digging down -----------------------------------------------------------------------------------------------------

export function DigLayers({ layers }: { layers: { name: string; to: number; color: string; ink: number }[] }) {
  return (
    <div className="hb-layers" role="img" aria-label="The layers of a planet plot, from the surface to the core">
      <div className="sky">⛏️ the surface</div>
      {layers.map((l, i) => (
        <div key={l.name} className="l" style={{ background: l.color, ['--h' as string]: `${30 + i * 6}px` }}>
          <b>{l.name}</b><span>to {l.to >= 1000 ? `${(l.to / 1000).toLocaleString()} km` : `${l.to} m`} · first time through +{l.ink} Ink</span>
        </div>
      ))}
    </div>
  );
}

// ---- a plot's 60 levels -----------------------------------------------------------------------------------------------

export function LevelTrack({ ink, at }: { ink: number[]; at: number }) {
  const max = Math.max(1, ...ink);
  const W = 360, H = 120, bw = W / ink.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 34}`} className="mx-auto h-auto w-full max-w-[520px]" role="img" aria-label="Ink for each of a plot's levels: higher levels pay more">
      {ink.map((v, i) => {
        const h = (v / max) * (H - 10);
        const done = i + 1 < at, now = i + 1 === at;
        return <rect key={i} x={i * bw + 0.8} y={H - h} width={bw - 1.6} height={h} rx="1.5" fill={now ? C.sun : done ? '#3A4A9A' : C.mint} opacity={done ? 0.7 : 1} />;
      })}
      <line x1="0" x2={W} y1={H + 1} y2={H + 1} stroke="#2A3566" />
      <text x="0" y={H + 16} fontSize="11" fill={C.faint} style={BODY}>Lv 1 · {ink[0]} Ink</text>
      <text x={W} y={H + 16} textAnchor="end" fontSize="11" fill={C.faint} style={BODY}>Lv {ink.length} · {ink[ink.length - 1]} Ink</text>
      <text x={(at - 0.5) * bw} y={H + 30} textAnchor="middle" fontSize="11" fill={C.sun} style={DISPLAY}>▲ next: Lv {at}</text>
    </svg>
  );
}

// ---- the reset, on a clock --------------------------------------------------------------------------------------------

export function ResetClock({ label }: { label: string }) {
  const m = /(\d{1,2}):(\d{2})\s*([AP]M)?/i.exec(label);
  let h = m ? Number(m[1]) % 12 : 6; const min = m ? Number(m[2]) : 0;
  if (m?.[3]?.toUpperCase() === 'PM') h += 12;
  const a = (((h % 12) + min / 60) / 12) * Math.PI * 2 - Math.PI / 2, am = (min / 60) * Math.PI * 2 - Math.PI / 2;
  return (
    <svg viewBox="0 0 160 184" width="140" height="161" className="mx-auto" role="img" aria-label={`The game day resets at ${label} your time`}>
      <circle cx="80" cy="80" r="70" fill={C.deep} stroke={C.gold} strokeWidth="3" />
      {Array.from({ length: 12 }, (_, i) => { const t = (i / 12) * Math.PI * 2; return <line key={i} x1={80 + Math.cos(t) * 58} y1={80 + Math.sin(t) * 58} x2={80 + Math.cos(t) * 64} y2={80 + Math.sin(t) * 64} stroke={C.muted} strokeWidth={i % 3 ? 1.5 : 3} />; })}
      <line x1="80" y1="80" x2={80 + Math.cos(a) * 36} y2={80 + Math.sin(a) * 36} stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <line x1="80" y1="80" x2={80 + Math.cos(am) * 52} y2={80 + Math.sin(am) * 52} stroke={C.gold} strokeWidth="3" strokeLinecap="round" />
      <circle cx="80" cy="80" r="5" fill={C.gold} />
      <text x="80" y="176" textAnchor="middle" fontSize="15" fill="#FFC93D" style={DISPLAY}>{label}</text>
    </svg>
  );
}

// ---- an egg -------------------------------------------------------------------------------------------------------------

export function Egg({ a = '#FFB3E6', b = '#8B6BFF', size = 72 }: { a?: string; b?: string; size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 60 72" width={size} height={size * 1.2} aria-hidden>
      <defs><radialGradient id={`${id}e`} cx="35%" cy="30%" r="75%"><stop offset="0" stopColor="#fff" /><stop offset="0.35" stopColor={a} /><stop offset="1" stopColor={b} /></radialGradient></defs>
      <path d="M30 4 C 48 4 56 36 56 48 C 56 62 44 70 30 70 C 16 70 4 62 4 48 C 4 36 12 4 30 4Z" fill={`url(#${id}e)`} />
      <path d="M10 44 L18 38 L26 46 L34 38 L42 46 L50 40" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="2" />
      <circle cx="22" cy="24" r="3" fill="#fff" opacity="0.7" /><circle cx="38" cy="56" r="2.5" fill="#fff" opacity="0.5" />
    </svg>
  );
}

// ---- a party ------------------------------------------------------------------------------------------------------------

// ---- a Crown's share of its kingdom ----------------------------------------------------------------------------------

export function CrownShare({ inkPct, rentPct, lockDays, tick }: { inkPct: number; rentPct: number; lockDays: number; tick: number }) {
  const still = useStill();
  const others: [number, string, string][] = [[0, '#8B6BFF', 'A'], [60, '#3DDC97', 'M'], [120, '#FF9F1C', 'K'], [180, '#34C3FF', 'J'], [240, '#FF4D6D', 'R'], [300, '#FFE14D', 'T']];
  const at = (deg: number, r: number) => [120 + r * Math.cos(((deg - 90) * Math.PI) / 180), 118 + r * Math.sin(((deg - 90) * Math.PI) / 180)] as const;
  return (
    <svg ref={animateWhenVisible} viewBox="0 0 360 236" className="mx-auto h-auto w-full max-w-[440px]" role="img"
      aria-label={`A Crown takes a ${inkPct}% share of the Ink or ${rentPct}% of the rent of every other player with land in its kingdom; the holder picks one, locked for ${lockDays} days`}>
      <rect width="360" height="236" rx="16" fill={C.deep} />
      <circle cx="120" cy="118" r="94" fill="#FFC93D10" stroke={C.gold} strokeWidth="2" strokeDasharray="7 6" />
      <text x="120" y="16" textAnchor="middle" fontSize="11" fill={C.gold} style={BODY}>YOUR KINGDOM</text>
      {others.map(([deg, col, l]) => {
        const [x, y] = at(deg, 70);
        return (
          <g key={l}>
            <line x1={x} y1={y} x2="120" y2="118" stroke={col} strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="3 4" />
            {!still && (
              <circle r="3" fill={col}>
                <animateMotion dur="2.4s" begin={`-${(deg / 150).toFixed(2)}s`} repeatCount="indefinite" path={`M${x},${y} L120,118`} />
              </circle>
            )}
            <rect x={x - 15} y={y - 15} width="30" height="30" rx="8" fill={C.raised} stroke={col} strokeWidth="1.5" />
            <text x={x} y={y + 5} textAnchor="middle" fontSize="13" fill="#fff" style={DISPLAY}>{l}</text>
          </g>
        );
      })}
      <circle cx="120" cy="118" r="27" fill={C.night} stroke={C.gold} strokeWidth="2.5" />
      <text x="120" y="127" textAnchor="middle" fontSize="24">👑</text>
      <text x="120" y="231" textAnchor="middle" fontSize="10.5" fill={C.muted} style={BODY}>nobody earns less: the share is minted for you</text>
      <text x="293" y="26" textAnchor="middle" fontSize="11" fill={C.muted} style={BODY}>PICK ONE</text>
      <g transform="translate(232 36)">
        <rect width="122" height="70" rx="14" fill={C.surface} stroke={C.sky} strokeWidth="1.5" />
        <text x="61" y="22" textAnchor="middle" fontSize="14" fill="#fff" style={DISPLAY}>💧 Ink share</text>
        <text x="61" y="41" textAnchor="middle" fontSize="11.5" fill={C.text} style={BODY}>{inkPct}% of their Ink</text>
        <text x="61" y="57" textAnchor="middle" fontSize="10.5" fill={C.muted} style={BODY}>paid every {tick} min</text>
      </g>
      <text x="293" y="121" textAnchor="middle" fontSize="11" fill={C.faint} style={BODY}>or</text>
      <g transform="translate(232 128)">
        <rect width="122" height="70" rx="14" fill={C.surface} stroke={C.mint} strokeWidth="1.5" />
        <text x="61" y="22" textAnchor="middle" fontSize="14" fill="#fff" style={DISPLAY}>💵 Rent share</text>
        <text x="61" y="41" textAnchor="middle" fontSize="11.5" fill={C.text} style={BODY}>{rentPct}% of their rent</text>
        <text x="61" y="57" textAnchor="middle" fontSize="10.5" fill={C.muted} style={BODY}>added to your rent</text>
      </g>
      <text x="293" y="216" textAnchor="middle" fontSize="11" fill={C.gold} style={BODY}>🔒 locked {lockDays} days</text>
    </svg>
  );
}

export function PartyMock() {
  const members: [string, string, string][] = [['S', '#8B6BFF', '🕹️ in an arcade'], ['M', '#3DDC97', '🎮 playing…'], ['K', '#FF9F1C', '✈️ on the way to London']];
  return (
    <div className="hb-party" role="img" aria-label="A party: its name, what it's up to, members and what each is doing, and party chat">
      <div className="hd"><b>🎉 Night Owls</b><span className="pub">Public</span><span className="act">🕹️ Arcade</span></div>
      {members.map(([n, c, doing]) => (
        <div key={n} className="m"><span className="av" style={{ background: c }}>{n}</span><span className="dn">{doing}</span><span className="j">{doing.startsWith('🕹️') ? 'Join' : doing.startsWith('✈️') ? 'Show' : ''}</span></div>
      ))}
      <div className="chat"><span><b>Mia:</b> Hot Zone is Tokyo today 🔥</span><span><b>Kai:</b> flying there now ✈️</span></div>
    </div>
  );
}
