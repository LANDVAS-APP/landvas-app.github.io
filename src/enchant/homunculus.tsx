// 🧫 The Homunculus, drawn from what it's grown: every enchantment you've spliced gives it a part (goose wings, a genie's
// smoke tail, parasite tendrils, clockwork gears, a glass eye…). Bigger at higher levels; glowing if an Aberration made it.
// One SVG string, so the Grimoire scene and the map marker draw exactly the same creature.
import { kindInfo } from './kinds';

export type HomuPart = { k: string; lv?: number; glow?: boolean; heir?: boolean; from?: string | null };

const NAMES: Record<string, string> = {
  goose: 'golden wings', genie: 'a smoke tail', map: 'map-patch skin', parasite: 'tendrils', cuckoo: 'a beak and crest', pandora: 'horns',
  clockwork: 'a clockwork gear', sizeray: 'an antenna', shard: 'a glass eye', wormhole: 'a swirling belly', oracle: 'a third eye',
  ouroboros: 'a serpent tail', stormcoil: 'crackling sparks',
};
/** what a part looks like, in words ("golden wings") */
export const partName = (k: string) => NAMES[k] ?? `a ${kindInfo(k).name} part`;

function part(k: string, s: number, glow: boolean) {
  const g = glow ? ' glow' : '';
  const sc = (cx: number, cy: number, body: string) => `<g transform="translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})" class="p-${k}${g}">${body}</g>`;
  switch (k) {
    case 'goose': return sc(50, 58, `<path class="wing" d="M31 50 Q8 36 11 66 Q20 60 31 63 Z" fill="#FFD23F" stroke="#B57C00" stroke-width="1.5"/><path class="wing r" d="M69 50 Q92 36 89 66 Q80 60 69 63 Z" fill="#FFD23F" stroke="#B57C00" stroke-width="1.5"/>`);
    case 'genie': return sc(50, 84, `<path d="M44 78 Q36 92 50 95 Q64 98 58 88 Q54 84 60 82" fill="none" stroke="#A78BFA" stroke-width="7" stroke-linecap="round" opacity="0.9"/><circle cx="61" cy="81" r="3" fill="#22E3FF"/>`);
    case 'map': return sc(50, 62, `<rect x="40" y="55" width="9" height="8" rx="1" fill="#E9C46A" stroke="#8B5E34" stroke-dasharray="2 1.5"/><rect x="54" y="64" width="8" height="7" rx="1" fill="#E9C46A" stroke="#8B5E34" stroke-dasharray="2 1.5"/><path d="M57 66 l3 3 M60 66 l-3 3" stroke="#FF3B30" stroke-width="1.2"/>`);
    case 'parasite': return sc(50, 80, `<path class="tend" d="M40 76 Q36 86 41 92 Q45 97 40 100" fill="none" stroke="#7CFF6B" stroke-width="3.2" stroke-linecap="round"/><path class="tend" d="M50 80 Q54 90 49 96" fill="none" stroke="#B026FF" stroke-width="3.2" stroke-linecap="round"/><path class="tend" d="M60 76 Q65 86 60 92 Q56 97 61 100" fill="none" stroke="#7CFF6B" stroke-width="3.2" stroke-linecap="round"/>`);
    case 'cuckoo': return sc(50, 36, `<path d="M46 43 L50 50 L54 43 Z" fill="#FF9F1C" stroke="#8A4B00" stroke-width="1"/><path d="M48 22 Q44 12 50 8 Q50 16 53 10 Q56 16 52 22" fill="#4CC9F0" stroke="#06222C" stroke-width="1"/>`);
    case 'pandora': return sc(50, 26, `<path d="M38 28 Q30 16 36 8 Q38 18 43 24 Z" fill="#FF4D6D" stroke="#2A0A3D" stroke-width="1.2"/><path d="M62 28 Q70 16 64 8 Q62 18 57 24 Z" fill="#FF4D6D" stroke="#2A0A3D" stroke-width="1.2"/>`);
    case 'clockwork': {
      const pts = Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 9 : 7; return `${(70 + Math.cos(a) * r).toFixed(1)},${(46 + Math.sin(a) * r).toFixed(1)}`; }).join(' ');
      return sc(70, 46, `<polygon class="gear" points="${pts}" fill="#D4A373" stroke="#3A2A1A" stroke-width="1.2"/><circle cx="70" cy="46" r="2.6" fill="#3A2A1A"/>`);
    }
    case 'sizeray': return sc(50, 18, `<line x1="50" y1="24" x2="50" y2="8" stroke="#39FF14" stroke-width="2.4"/><circle cx="50" cy="7" r="4" fill="#FF00E5" stroke="#39FF14" stroke-width="1.5"/>`);
    case 'shard': return sc(43, 37, `<path d="M43 31 L48 37 L43 43 L38 37 Z" fill="#C0F5FF" stroke="#7DD3FC" stroke-width="1.4"/><path d="M40 35 L43 32" stroke="#fff" stroke-width="1.2"/>`);
    case 'wormhole': return sc(50, 64, `<circle cx="50" cy="64" r="8" fill="#0A0630" stroke="#7B5CFF" stroke-width="2.4"/><path d="M50 58 A6 6 0 1 1 44 64 A4 4 0 1 1 50 60" fill="none" stroke="#00E0FF" stroke-width="1.8"/>`);
    case 'oracle': return sc(50, 27, `<path d="M42 28 Q50 20 58 28 Q50 34 42 28 Z" fill="#FFF0FB" stroke="#5B2BFF" stroke-width="1.4"/><circle cx="50" cy="28" r="3" fill="#FF5CDB"/><circle cx="50" cy="28" r="1.2" fill="#1C0730"/>`);
    case 'ouroboros': return sc(50, 86, `<path d="M62 80 Q78 86 70 96 Q58 102 44 96 Q34 90 40 84" fill="none" stroke="#3DDC97" stroke-width="5" stroke-linecap="round"/><circle cx="40" cy="84" r="3.4" fill="#0E7C5A"/>`);
    case 'stormcoil': return sc(50, 28, `<polyline class="spark" points="28,22 33,28 29,30 35,37" fill="none" stroke="#7DF9FF" stroke-width="2.2"/><polyline class="spark" points="72,22 67,28 71,30 65,37" fill="none" stroke="#FFE8A3" stroke-width="2.2"/><polyline class="spark" points="44,10 47,15 44,16 48,21" fill="none" stroke="#7DF9FF" stroke-width="1.8"/>`);
    default: return '';
  }
}

/** the creature as an SVG string: a pink-and-violet body, a face, and every part it has grown */
export function homuSvg(parts: HomuPart[] | null | undefined, opts: { asleep?: boolean; id?: string } = {}) {
  const ps = (parts ?? []).filter((p) => p && p.k);
  const has = (k: string) => ps.some((p) => p.k === k);
  const id = opts.id ?? 'h';
  const glowAll = ps.some((p) => p.glow);
  const back = ['goose', 'genie', 'parasite', 'ouroboros'], front = ['map', 'wormhole', 'cuckoo', 'pandora', 'clockwork', 'sizeray', 'shard', 'oracle', 'stormcoil'];
  const draw = (list: string[]) => list.map((k) => { const p = ps.find((x) => x.k === k); return p ? part(k, 0.8 + 0.2 * Math.min(3, Math.max(1, p.lv ?? 1)), !!p.glow) : ''; }).join('');
  const eyes = opts.asleep
    ? `<path d="M40 38 q3 3 6 0 M54 38 q3 3 6 0" stroke="#22061A" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
    : `${has('shard') ? '' : '<circle cx="43" cy="37" r="3.2" fill="#22061A"/><circle cx="44" cy="36" r="1" fill="#fff"/>'}<circle cx="57" cy="37" r="3.2" fill="#22061A"/><circle cx="58" cy="36" r="1" fill="#fff"/>`;
  return `<svg viewBox="0 0 100 104" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>`
    + `<radialGradient id="${id}b" cx="45%" cy="35%" r="70%"><stop offset="0" stop-color="#FFE0EF"/><stop offset="0.55" stop-color="#FF9AC8"/><stop offset="1" stop-color="#8A3FFC"/></radialGradient></defs>`
    + (glowAll ? `<circle cx="50" cy="55" r="40" fill="#FF5CDB" opacity="0.18"/>` : '')
    + draw(back)
    + `<ellipse cx="50" cy="62" rx="19" ry="21" fill="url(#${id}b)" stroke="#5A1E4A" stroke-width="1.6"/>`
    + `<circle cx="50" cy="38" r="16" fill="url(#${id}b)" stroke="#5A1E4A" stroke-width="1.6"/>`
    + `<path d="M36 60 q-6 6 -4 12 M64 60 q6 6 4 12" stroke="#5A1E4A" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
    + eyes + (has('cuckoo') ? '' : `<path d="M46 45 q4 3 8 0" stroke="#5A1E4A" stroke-width="1.6" fill="none" stroke-linecap="round"/>`)
    + `<ellipse cx="44" cy="78" rx="4" ry="2.4" fill="#5A1E4A"/><ellipse cx="56" cy="78" rx="4" ry="2.4" fill="#5A1E4A"/>`
    + draw(front) + `</svg>`;
}

export function HomunculusFigure({ parts, size = 120, asleep, walking, id }: { parts: HomuPart[] | null | undefined; size?: number | string; asleep?: boolean; walking?: boolean; id?: string }) {
  return <div className={`lv-homu-figure${walking ? ' walking' : ''}`} style={{ width: size, aspectRatio: '100 / 104' }} dangerouslySetInnerHTML={{ __html: homuSvg(parts, { asleep, id }) }} />;
}
