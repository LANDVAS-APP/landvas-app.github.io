// Looping previews of the PvP minigames: two players on the same board. Pure SVG (SMIL);
// a still frame when motion is reduced.
import { useId } from 'react';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import type { PvpGame } from '../shared/pvp';

const C = ['#F5F4EF', '#FF4D6D', '#FFB23F', '#FFE14D', '#3DDC97', '#34C3FF', '#7B5CFF', '#FF4FD8', '#23232A'];

export function PvpPreview({ game, className }: { game: PvpGame; className?: string }) {
  const still = useUi((s) => s.settings.reduceMotion);
  const id = useId().replace(/:/g, '');
  const svg = { viewBox: '0 0 120 120', className: cn('block aspect-square w-full rounded-2xl', className), role: 'img' as const };
  const p = { id, still, svg };
  if (game === 'copycat') return <CopyCatPreview {...p} />;
  if (game === 'turfwars') return <TurfPreview {...p} />;
  if (game === 'paletteclash') return <ClashPreview {...p} />;
  if (game === 'forgery') return <ForgeryPreview {...p} />;
  return <RecallPreview {...p} />;
}

type P = { id: string; still: boolean; svg: { viewBox: string; className: string; role: 'img' } };

/** Two little rival badges in the corners. */
function Versus() {
  return (
    <g fontSize="7" fontWeight="800">
      <rect x="4" y="4" width="22" height="11" rx="5.5" fill="#7B5CFF" /><text x="15" y="12" textAnchor="middle" fill="#fff">YOU</text>
      <rect x="94" y="4" width="22" height="11" rx="5.5" fill="#FF4D6D" /><text x="105" y="12" textAnchor="middle" fill="#fff">RIVAL</text>
    </g>
  );
}

function CopyCatPreview({ still, svg }: P) {
  // a little heart drawn cell by cell on both canvases
  const heart = [[1, 0], [2, 0], [4, 0], [5, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [2, 4], [3, 4], [4, 4], [3, 5]];
  const cell = (ox: number, oy: number, s: number, delay: (k: number) => number, dur: number) => heart.map(([x, y], k) => (
    <rect key={k} x={ox + x * s} y={oy + y * s} width={s - 0.4} height={s - 0.4} fill={k === 1 || k === 4 ? '#FFE14D' : '#FF4FD8'} opacity={still ? 1 : 0}>
      {!still && <animate attributeName="opacity" values="0;0;1;1;0" keyTimes={`0;${delay(k)};${Math.min(0.95, delay(k) + 0.02)};0.92;1`} dur={`${dur}s`} repeatCount="indefinite" />}
    </rect>
  ));
  return (
    <svg {...svg} aria-label="Copy Cat: both players paint the example drawing — the closest copy wins">
      <rect width="120" height="120" fill="#1a1530" />
      <Versus />
      <rect x="44" y="20" width="32" height="28" rx="4" fill="#F5F4EF" />
      {heart.map(([x, y], k) => <rect key={k} x={49 + x * 3.2} y={24 + y * 3.2} width="3" height="3" fill={k === 1 || k === 4 ? '#FFE14D' : '#FF4FD8'} />)}
      <text x="60" y="56" textAnchor="middle" fontSize="6" fontWeight="800" fill="#FF4FD8" letterSpacing="1">EXAMPLE</text>
      <rect x="6" y="62" width="50" height="46" rx="5" fill="#F5F4EF" />
      <rect x="64" y="62" width="50" height="46" rx="5" fill="#F5F4EF" />
      {cell(11, 66, 5.4, (k) => 0.05 + k * 0.026, 4)}
      {cell(69, 66, 5.4, (k) => 0.08 + k * 0.03 + (k % 5 === 0 ? 0.04 : 0), 4)}
      <text x="31" y="116" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#3DDC97">97%</text>
      <text x="89" y="116" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#B9C3D8">88%</text>
    </svg>
  );
}

function TurfPreview({ still, svg }: P) {
  const n = 6, s = 15, ox = 15, oy = 22;
  const vals = [2, 5, 1, 7, 3, 4, 6, 0, 3, 2, 8, 1, 1, 4, 9, 5, 2, 6, 3, 7, 2, 0, 4, 3, 5, 1, 6, 3, 8, 2, 4, 2, 1, 5, 3, 7];
  const mine = [14, 15, 20, 26, 27, 9, 10];
  const theirs = [14, 13, 8, 2, 3, 19];
  return (
    <svg {...svg} aria-label="Turf Wars: claim the most valuable land in 16 strokes">
      <rect width="120" height="120" fill="#0b1226" />
      <Versus />
      {vals.map((v, i) => (
        <g key={i}>
          <rect x={ox + (i % n) * s} y={oy + Math.floor(i / n) * s} width={s - 2} height={s - 2} rx="2" fill={`rgba(61,220,151,${0.06 + v * 0.05})`} />
          <text x={ox + (i % n) * s + 6.5} y={oy + Math.floor(i / n) * s + 9} textAnchor="middle" fontSize="6" fontWeight="800" fill="#E8ECF7" opacity="0.7">{v || ''}</text>
        </g>
      ))}
      {mine.map((i, k) => (
        <rect key={`m${i}`} x={ox + (i % n) * s} y={oy + Math.floor(i / n) * s} width={s - 2} height={s - 2} rx="2" fill="#7B5CFF" opacity={still ? 0.85 : 0}>
          {!still && <animate attributeName="opacity" values="0;0;0.85;0.85;0" keyTimes={`0;${0.08 + k * 0.1};${0.1 + k * 0.1};0.92;1`} dur="4.5s" repeatCount="indefinite" />}
        </rect>
      ))}
      {theirs.map((i, k) => k > 0 && (
        <rect key={`t${i}`} x={ox + (i % n) * s + 3} y={oy + Math.floor(i / n) * s + 3} width={s - 8} height={s - 8} rx="1.5" fill="#FF4D6D" opacity={still ? 0.8 : 0}>
          {!still && <animate attributeName="opacity" values="0;0;0.8;0.8;0" keyTimes={`0;${0.12 + k * 0.11};${0.14 + k * 0.11};0.92;1`} dur="4.5s" repeatCount="indefinite" />}
        </rect>
      ))}
      <text x="60" y="116" textAnchor="middle" fontSize="7" fontWeight="800" fill="#3DDC97" letterSpacing="1">LAND 41 · 33</text>
    </svg>
  );
}

function ClashPreview({ still, svg }: P) {
  const pig = ['#FF2E4D', '#FFE14D', '#14B8FF', '#F5F4EF', '#2BD96B', '#5B3BFF'];
  return (
    <svg {...svg} aria-label="Palette Clash: name the two pigments that make each swatch, faster than your rival">
      <rect width="120" height="120" fill="#1b1424" />
      <Versus />
      <circle cx="60" cy="44" r="18" fill="#FF9A48">
        {!still && <animate attributeName="fill" values="#FF9A48;#FF9A48;#89CDA6;#89CDA6;#FF9A48" keyTimes="0;0.45;0.5;0.95;1" dur="4s" repeatCount="indefinite" />}
      </circle>
      <text x="60" y="72" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#B9C3D8" letterSpacing="1">WHICH TWO?</text>
      {pig.map((c, i) => (
        <g key={c}>
          <circle cx={18 + i * 17} cy="92" r="7" fill={c} stroke="#fff" strokeOpacity="0.25" />
          {(i === 0 || i === 1) && !still && (
            <circle cx={18 + i * 17} cy="92" r="9.5" fill="none" stroke="#fff" strokeWidth="2" opacity="0">
              <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes={`0;${0.1 + i * 0.1};${0.12 + i * 0.1};0.42;0.45;1`} dur="4s" repeatCount="indefinite" />
            </circle>
          )}
        </g>
      ))}
      <text x="60" y="114" textAnchor="middle" fontSize="7" fontWeight="800" fill="#3DDC97" letterSpacing="1">EXACT · 100</text>
    </svg>
  );
}

function ForgeryPreview({ still, svg }: P) {
  const n = 6, s = 7.5;
  const grid = Array.from({ length: n * n }, (_, i) => [1, 5, 3, 6][(Math.floor((i % n) / 2) + Math.floor(i / n / 2)) % 4]);
  const changed = [8, 21, 33];
  return (
    <svg {...svg} aria-label="Spot the Forgery: tap the pixels the forger changed">
      <rect width="120" height="120" fill="#20170b" />
      <Versus />
      <g transform="translate(14 24)">{grid.map((c, i) => <rect key={i} x={(i % n) * s} y={Math.floor(i / n) * s} width={s} height={s} fill={C[c]} />)}</g>
      <g transform="translate(61 24)">
        {grid.map((c, i) => <rect key={i} x={(i % n) * s} y={Math.floor(i / n) * s} width={s} height={s} fill={C[changed.includes(i) ? 8 - (c % 3) : c]} />)}
        {changed.map((i, k) => (
          <circle key={i} cx={(i % n + 0.5) * s} cy={(Math.floor(i / n) + 0.5) * s} r={s * 0.7} fill="none" stroke="#3DDC97" strokeWidth="1.8" opacity={still ? 1 : 0}>
            {!still && <animate attributeName="opacity" values="0;0;1;1;0" keyTimes={`0;${0.2 + k * 0.2};${0.22 + k * 0.2};0.92;1`} dur="4s" repeatCount="indefinite" />}
          </circle>
        ))}
      </g>
      <text x="36" y="80" textAnchor="middle" fontSize="6" fontWeight="800" fill="#B9C3D8" letterSpacing="1">ORIGINAL</text>
      <text x="84" y="80" textAnchor="middle" fontSize="6" fontWeight="800" fill="#FFB23F" letterSpacing="1">FORGERY</text>
      <text x="60" y="104" textAnchor="middle" fontSize="7" fontWeight="800" fill="#3DDC97" letterSpacing="1">FOUND 3/6</text>
    </svg>
  );
}

function RecallPreview({ still, svg }: P) {
  const n = 5, s = 13, ox = 27.5, oy = 26;
  const target = [0, 5, 5, 0, 0, 5, 1, 1, 5, 0, 0, 1, 3, 1, 0, 0, 5, 1, 5, 0, 0, 0, 5, 0, 0];
  return (
    <svg {...svg} aria-label="Pixel Recall: memorise the mural, then repaint it from memory">
      <rect width="120" height="120" fill="#0f1a2a" />
      <Versus />
      <rect x={ox - 3} y={oy - 3} width={n * s + 4} height={n * s + 4} rx="4" fill="#F5F4EF" />
      {target.map((c, i) => c !== 0 && (
        <rect key={i} x={ox + (i % n) * s} y={oy + Math.floor(i / n) * s} width={s - 1} height={s - 1} fill={C[c]}>
          {!still && <animate attributeName="opacity" values="1;1;0;0;1;1" keyTimes={`0;0.3;0.33;${0.4 + (i % 7) * 0.05};${0.42 + (i % 7) * 0.05};1`} dur="5s" repeatCount="indefinite" />}
        </rect>
      ))}
      <text x="60" y="108" textAnchor="middle" fontSize="7" fontWeight="800" fill="#34C3FF" letterSpacing="1">LOOK · HIDE · PAINT</text>
    </svg>
  );
}
