// The LANDVAS logo, drawn as SVG: the source for every icon and brand image (app icons, PWA icons, favicons,
// the brand kit). Used by make-native-assets.mjs, make-icons.mjs and make-brand.mjs.
//
// The mark: a multiverse. Five claimed plots in the LANDVAS "L", each a different world (a painted canvas, a
// forest, a desert at sunset, an ocean, a galaxy), as glossy glowing tiles floating in a nebula beside four
// glass plots still waiting to be claimed.

let seq = 0;
const uid = () => `lv${(++seq).toString(36)}`;

// ---- the five worlds, each drawn in a 100 × 100 box (`p` keeps gradient ids unique) ------------------------------
const SCENE = {
  // a painted canvas: bold, glossy brush strokes and splats
  art: (p) => `<defs>
      <linearGradient id="${p}pa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFBF3"/><stop offset="1" stop-color="#FCE9D2"/></linearGradient>
      <linearGradient id="${p}s1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FF2E74"/><stop offset="1" stop-color="#FF6FA5"/></linearGradient>
      <linearGradient id="${p}s2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FF9F1C"/><stop offset="1" stop-color="#FFD84D"/></linearGradient>
      <linearGradient id="${p}s3" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1FA2FF"/><stop offset="1" stop-color="#5FE0FF"/></linearGradient></defs>
    <rect width="100" height="100" fill="url(#${p}pa)"/>
    <path d="M-6 30 C18 8 40 46 64 24 S98 16 110 28" stroke="url(#${p}s1)" stroke-width="17" fill="none" stroke-linecap="round"/>
    <path d="M-6 30 C18 8 40 46 64 24 S98 16 110 28" stroke="#fff" stroke-opacity="0.35" stroke-width="4" fill="none" stroke-linecap="round" transform="translate(0 -4)"/>
    <path d="M-6 58 C24 38 46 76 70 54 S100 48 110 60" stroke="url(#${p}s2)" stroke-width="16" fill="none" stroke-linecap="round"/>
    <path d="M-6 58 C24 38 46 76 70 54 S100 48 110 60" stroke="#fff" stroke-opacity="0.35" stroke-width="4" fill="none" stroke-linecap="round" transform="translate(0 -4)"/>
    <path d="M-6 86 C30 68 56 102 110 80" stroke="url(#${p}s3)" stroke-width="15" fill="none" stroke-linecap="round"/>
    <circle cx="80" cy="40" r="9" fill="#A45CFF"/><circle cx="77" cy="37" r="3" fill="#fff" opacity="0.6"/>
    <circle cx="20" cy="44" r="4" fill="#3DDC97"/><circle cx="90" cy="74" r="3.5" fill="#FF2E74"/><circle cx="12" cy="72" r="2.5" fill="#A45CFF"/>`,
  // a forest habitat: hills, pines, a pond, a sun
  forest: (p) => `<defs>
      <linearGradient id="${p}sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9EE9FF"/><stop offset="1" stop-color="#E4FBFF"/></linearGradient>
      <linearGradient id="${p}gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6FDB5E"/><stop offset="1" stop-color="#2FA84A"/></linearGradient>
      <radialGradient id="${p}po" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#7FD6FF"/><stop offset="1" stop-color="#1E8FE0"/></radialGradient></defs>
    <rect width="100" height="100" fill="url(#${p}sk)"/>
    <circle cx="78" cy="20" r="10" fill="#FFE14D"/><circle cx="78" cy="20" r="15" fill="#FFE14D" opacity="0.25"/>
    <path d="M-5 46 Q25 26 55 44 T110 40 V105 H-5Z" fill="#9BE07A"/>
    <path d="M-5 56 Q30 42 60 56 T110 52 V105 H-5Z" fill="url(#${p}gr)"/>
    <ellipse cx="62" cy="76" rx="27" ry="13" fill="url(#${p}po)"/><ellipse cx="55" cy="72" rx="10" ry="2.6" fill="#fff" opacity="0.7"/>
    <path d="M20 66 L31 26 L42 66Z" fill="#1B7A43"/><path d="M23 52 L31 26 L39 52Z" fill="#25965A"/>
    <path d="M6 84 L16 50 L26 84Z" fill="#1E8A4C"/><rect x="14.5" y="84" width="3" height="5" fill="#7A4A2A"/>
    <circle cx="88" cy="56" r="10" fill="#2E9E46"/><circle cx="84" cy="52" r="5" fill="#6FDB5E"/>
    <circle cx="36" cy="90" r="3.2" fill="#FF6FB0"/><circle cx="46" cy="94" r="2.6" fill="#FFE14D"/><circle cx="88" cy="92" r="2.8" fill="#FF6FB0"/>`,
  // a desert at sunset: a glowing sun, dunes, a pyramid, a cactus
  desert: (p) => `<defs>
      <linearGradient id="${p}sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B03CC8"/><stop offset="0.45" stop-color="#FF4F7B"/><stop offset="1" stop-color="#FFA24D"/></linearGradient>
      <radialGradient id="${p}su" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFF6B0"/><stop offset="1" stop-color="#FFC93D"/></radialGradient>
      <linearGradient id="${p}d1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFC24D"/><stop offset="1" stop-color="#F08A2B"/></linearGradient>
      <linearGradient id="${p}d2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F29A3A"/><stop offset="1" stop-color="#C9631F"/></linearGradient></defs>
    <rect width="100" height="100" fill="url(#${p}sk)"/>
    <circle cx="38" cy="50" r="26" fill="#FFE14D" opacity="0.22"/><circle cx="38" cy="50" r="17" fill="url(#${p}su)"/>
    <path d="M60 64 L74 40 L88 64Z" fill="#B85A2E"/><path d="M74 40 L88 64 H80Z" fill="#8E3F22"/>
    <path d="M-5 70 Q25 50 55 70 T110 66 V105 H-5Z" fill="url(#${p}d1)"/>
    <path d="M-5 88 Q35 70 70 88 T110 86 V105 H-5Z" fill="url(#${p}d2)"/>
    <path d="M20 84 v-16 m0 7 h-6 v-6 m6 4 h6 v-7" stroke="#2E8B3E" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="70" cy="16" r="1.4" fill="#fff"/><circle cx="88" cy="26" r="1" fill="#fff"/><circle cx="58" cy="10" r="1" fill="#fff"/>`,
  // an ocean world: waves, foam, a sailboat, the sun
  ocean: (p) => `<defs>
      <linearGradient id="${p}sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7BD8FF"/><stop offset="1" stop-color="#D6F4FF"/></linearGradient>
      <linearGradient id="${p}se" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2AA8F0"/><stop offset="1" stop-color="#0B5FB8"/></linearGradient></defs>
    <rect width="100" height="100" fill="url(#${p}sk)"/>
    <circle cx="72" cy="30" r="12" fill="#FFE14D"/><circle cx="72" cy="30" r="18" fill="#FFE14D" opacity="0.25"/>
    <path d="M14 22 q6 -5 12 0 q6 -5 12 0" fill="#fff" opacity="0.85"/>
    <rect y="46" width="100" height="60" fill="url(#${p}se)"/>
    <path d="M38 47 L46 24 L46 47Z" fill="#fff"/><path d="M47 30 L56 47 L47 47Z" fill="#FF4F7B"/><path d="M34 47 H58 L54 54 H38Z" fill="#7A4A2A"/>
    <path d="M0 56 Q12 49 25 56 T50 56 T75 56 T100 56 V63 H0Z" fill="#5CC8FF"/>
    <path d="M0 56 Q12 49 25 56 T50 56 T75 56 T100 56" stroke="#fff" stroke-width="2" fill="none" opacity="0.8"/>
    <path d="M0 76 Q12 69 25 76 T50 76 T75 76 T100 76 V84 H0Z" fill="#1673C4"/>
    <path d="M0 76 Q12 69 25 76 T50 76 T75 76 T100 76" stroke="#BFEAFF" stroke-width="1.6" fill="none" opacity="0.7"/>
    <path d="M72 62 q5 -5 10 0" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
  // a galaxy: a spiral, a ringed planet, a moon, sparkling stars
  galaxy: (p) => `<defs>
      <radialGradient id="${p}bg" cx="40%" cy="55%" r="80%"><stop offset="0" stop-color="#3B1590"/><stop offset="1" stop-color="#10063A"/></radialGradient>
      <radialGradient id="${p}pl" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#9FE8FF"/><stop offset="0.6" stop-color="#2FB8FF"/><stop offset="1" stop-color="#1A5FC0"/></radialGradient>
      <filter id="${p}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter></defs>
    <rect width="100" height="100" fill="url(#${p}bg)"/>
    <ellipse cx="42" cy="60" rx="48" ry="17" transform="rotate(-25 42 60)" fill="#A45CFF" opacity="0.7" filter="url(#${p}b)"/>
    <ellipse cx="42" cy="60" rx="26" ry="8" transform="rotate(-25 42 60)" fill="#FF7AE0" opacity="0.8" filter="url(#${p}b)"/>
    <circle cx="42" cy="60" r="4" fill="#fff"/>
    <ellipse cx="70" cy="30" rx="25" ry="6.5" transform="rotate(-20 70 30)" fill="none" stroke="#FFC93D" stroke-width="3" opacity="0.55"/>
    <circle cx="70" cy="30" r="13" fill="url(#${p}pl)"/>
    <path d="M45.5 33.5 A25 6.5 -20 0 0 94.5 26.5" transform="rotate(0)" fill="none" stroke="#FFE14D" stroke-width="3.4"/>
    <circle cx="24" cy="24" r="4.5" fill="#E8E4FF"/><circle cx="22.6" cy="22.8" r="1.4" fill="#C9C1F5"/>
    ${[[12, 50], [30, 86], [88, 70], [90, 10], [56, 92], [8, 84], [50, 14]].map(([a, b], k) => `<circle cx="${a}" cy="${b}" r="${1.2 + (k % 3) * 0.6}" fill="#fff"/>`).join('')}
    <path d="M86 84 l1.4 -5 l1.4 5 l5 1.4 l-5 1.4 l-1.4 5 l-1.4 -5 l-5 -1.4Z" fill="#fff"/>`,
};
export const GLOWS = { art: '#FF3D7F', forest: '#3DDC97', desert: '#FFB31F', ocean: '#2FB8FF', galaxy: '#A45CFF' };

/** One world as a glossy plot tile, `c` wide, drawn at the origin. */
function tile(id, c, { glow = true, shadow = true } = {}) {
  const p = uid(), r = c * 0.24, u = c / 100;
  return `<defs>
      <clipPath id="${p}c"><rect width="${c}" height="${c}" rx="${r}"/></clipPath>
      <linearGradient id="${p}bv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="0.35" stop-color="#fff" stop-opacity="0"/><stop offset="0.7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.28"/></linearGradient>
      <linearGradient id="${p}rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="1" stop-color="#fff" stop-opacity="0.35"/></linearGradient>
      <filter id="${p}g" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${c * 0.09}"/></filter>
      <filter id="${p}s" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${c * 0.05}"/></filter></defs>
    ${glow ? `<rect x="${-c * 0.04}" y="${-c * 0.04}" width="${c * 1.08}" height="${c * 1.08}" rx="${r}" fill="${GLOWS[id]}" opacity="0.75" filter="url(#${p}g)"/>` : ''}
    ${shadow ? `<rect x="${c * 0.06}" y="${c * 0.1}" width="${c * 0.88}" height="${c * 0.92}" rx="${r}" fill="#05041A" opacity="0.55" filter="url(#${p}s)"/>` : ''}
    <g clip-path="url(#${p}c)"><g transform="scale(${u})">${SCENE[id](p)}</g><rect width="${c}" height="${c}" fill="url(#${p}bv)"/></g>
    <path d="M${c * 0.12} ${c * 0.3} Q${c * 0.14} ${c * 0.1} ${c * 0.36} ${c * 0.08} L${c * 0.72} ${c * 0.08} Q${c * 0.86} ${c * 0.09} ${c * 0.88} ${c * 0.16}" stroke="#fff" stroke-opacity="0.55" stroke-width="${u * 3.2}" fill="none" stroke-linecap="round"/>
    <rect x="${u}" y="${u}" width="${c - 2 * u}" height="${c - 2 * u}" rx="${r - u}" fill="none" stroke="url(#${p}rim)" stroke-width="${u * 2.6}"/>`;
}
/** A plot still waiting for an owner: frosted glass with a dashed rim and a + */
function glassTile(c) {
  const r = c * 0.24, u = c / 100;
  return `<rect width="${c}" height="${c}" rx="${r}" fill="#ffffff" fill-opacity="0.07"/>
    <rect x="${u * 1.5}" y="${u * 1.5}" width="${c - 3 * u}" height="${c - 3 * u}" rx="${r - u}" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="${u * 2.4}" stroke-dasharray="${u * 9} ${u * 7}"/>
    <path d="M${c / 2} ${c * 0.4} V${c * 0.6} M${c * 0.4} ${c / 2} H${c * 0.6}" stroke="#fff" stroke-opacity="0.32" stroke-width="${u * 4}" stroke-linecap="round"/>`;
}

/** The nebula the mark floats in (also the brand backdrop). */
function nebula(S, p, { stars = true } = {}) {
  const st = stars ? Array.from({ length: 80 }, (_, k) => {
    const a = (k * 137.508) % 360, d = ((k * 53) % 100) / 100;
    return `<circle cx="${(S / 2 + Math.cos(a) * d * S * 0.72).toFixed(1)}" cy="${(S / 2 + Math.sin(a) * d * S * 0.72).toFixed(1)}" r="${((S / 1024) * (0.8 + (k % 3) * 0.9)).toFixed(2)}" fill="#fff" opacity="${(0.3 + (k % 5) * 0.13).toFixed(2)}"/>`;
  }).join('') : '';
  const sparkle = (x, y, s) => `<path d="M${x} ${y - s} L${x + s * 0.22} ${y - s * 0.22} L${x + s} ${y} L${x + s * 0.22} ${y + s * 0.22} L${x} ${y + s} L${x - s * 0.22} ${y + s * 0.22} L${x - s} ${y} L${x - s * 0.22} ${y - s * 0.22}Z" fill="#fff" opacity="0.9"/>`;
  return `<defs>
      <linearGradient id="${p}base" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4A1DA8"/><stop offset="0.55" stop-color="#1A0F5C"/><stop offset="1" stop-color="#070A2A"/></linearGradient>
      <radialGradient id="${p}n1" cx="16%" cy="12%" r="62%"><stop offset="0" stop-color="#FF3D9A" stop-opacity="0.95"/><stop offset="1" stop-color="#FF3D9A" stop-opacity="0"/></radialGradient>
      <radialGradient id="${p}n2" cx="88%" cy="88%" r="66%"><stop offset="0" stop-color="#22E3FF" stop-opacity="0.85"/><stop offset="1" stop-color="#22E3FF" stop-opacity="0"/></radialGradient>
      <radialGradient id="${p}n3" cx="88%" cy="14%" r="50%"><stop offset="0" stop-color="#FFB31F" stop-opacity="0.6"/><stop offset="1" stop-color="#FFB31F" stop-opacity="0"/></radialGradient>
      <radialGradient id="${p}n4" cx="20%" cy="92%" r="45%"><stop offset="0" stop-color="#7B5CFF" stop-opacity="0.7"/><stop offset="1" stop-color="#7B5CFF" stop-opacity="0"/></radialGradient></defs>
    <rect width="${S}" height="${S}" fill="url(#${p}base)"/><rect width="${S}" height="${S}" fill="url(#${p}n1)"/><rect width="${S}" height="${S}" fill="url(#${p}n2)"/>
    <rect width="${S}" height="${S}" fill="url(#${p}n3)"/><rect width="${S}" height="${S}" fill="url(#${p}n4)"/>${st}
    ${stars ? sparkle(S * 0.88, S * 0.45, S * 0.025) + sparkle(S * 0.52, S * 0.06, S * 0.018) + sparkle(S * 0.06, S * 0.5, S * 0.015) : ''}`;
}

const LAYOUT = [['art', 0, 0], ['forest', 0, 1], ['desert', 0, 2], ['ocean', 1, 2], ['galaxy', 2, 2]];
/** The full mark. `bg: false` = just the tiles (transparent); `plots: false` = just the nebula. */
export function multiverse(size, pad, { bg = true, plots = true } = {}) {
  const S = size, inner = S - pad * 2, gap = inner * 0.065, c = (inner - gap * 2) / 3;
  const at = (i, j) => [pad + i * (c + gap), pad + j * (c + gap)];
  const p = uid();
  const empties = [[1, 0], [2, 0], [1, 1], [2, 1]].map(([i, j]) => { const [x, y] = at(i, j); return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)})">${glassTile(c)}</g>`; }).join('');
  const lit = LAYOUT.map(([id, i, j]) => { const [x, y] = at(i, j); return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)})">${tile(id, c)}</g>`; }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${bg ? nebula(S, p) : ''}${plots ? empties + lit : ''}</svg>`;
}

/** The mark as a rounded app-icon tile with see-through corners and a soft rim (web, brand kit). */
export function multiverseTile(size, pad = size * 0.12) {
  const p = uid(), r = size * 0.225;
  const inner = multiverse(size, pad).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs><clipPath id="${p}t"><rect width="${size}" height="${size}" rx="${r}"/></clipPath>
    <linearGradient id="${p}e" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF7AB8"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.5"/><stop offset="1" stop-color="#5FE0FF"/></linearGradient></defs>
    <g clip-path="url(#${p}t)">${inner}</g>
    <rect x="${size * 0.006}" y="${size * 0.006}" width="${size * 0.988}" height="${size * 0.988}" rx="${r}" fill="none" stroke="url(#${p}e)" stroke-width="${size * 0.012}" opacity="0.8"/></svg>`;
}

/** One world as its own glowing plot tile (for banners and posters). */
export function worldTile(id, size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="overflow:visible">${tile(id, size, { glow: false, shadow: false })}</svg>`;
}

/** The five worlds' colours, for tiny sizes. */
export const WORLDS = [
  { at: [0, 0], a: '#FFF4E6', b: '#FF2E74' }, // art
  { at: [0, 1], a: '#9EE9FF', b: '#2FA84A' }, // forest
  { at: [0, 2], a: '#FF4F7B', b: '#FFA24D' }, // desert
  { at: [1, 2], a: '#7BD8FF', b: '#0B5FB8' }, // ocean
  { at: [2, 2], a: '#A45CFF', b: '#10063A' }, // galaxy
];
/** The mark simplified for favicons (16-64 px): the nebula and the L of five world tiles, no scenes. */
export function multiverseSmall(size = 64, { rounded = true } = {}) {
  const S = size, pad = S * 0.11, inner = S - pad * 2, gap = inner * 0.07, c = (inner - gap * 2) / 3, r = c * 0.26;
  const at = (i, j) => [pad + i * (c + gap), pad + j * (c + gap)];
  const R = rounded ? S * 0.225 : 0;
  const lit = WORLDS.map((w, k) => `<linearGradient id="w${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${w.a}"/><stop offset="1" stop-color="${w.b}"/></linearGradient>`).join('');
  const tiles = WORLDS.map((w, k) => { const [x, y] = at(...w.at); return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${c.toFixed(2)}" height="${c.toFixed(2)}" rx="${r.toFixed(2)}" fill="url(#w${k})" stroke="#fff" stroke-opacity="0.75" stroke-width="${(S / 64).toFixed(2)}"/>`; }).join('');
  const empty = [[1, 0], [2, 0], [1, 1], [2, 1]].map(([i, j]) => { const [x, y] = at(i, j); return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${c.toFixed(2)}" height="${c.toFixed(2)}" rx="${r.toFixed(2)}" fill="#fff" fill-opacity="0.12"/>`; }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4A1DA8"/><stop offset="1" stop-color="#070A2A"/></linearGradient>
    <radialGradient id="n1" cx="16%" cy="12%" r="70%"><stop offset="0" stop-color="#FF3D9A" stop-opacity="0.85"/><stop offset="1" stop-color="#FF3D9A" stop-opacity="0"/></radialGradient>
    <radialGradient id="n2" cx="88%" cy="88%" r="70%"><stop offset="0" stop-color="#22E3FF" stop-opacity="0.8"/><stop offset="1" stop-color="#22E3FF" stop-opacity="0"/></radialGradient>${lit}</defs>
    <rect width="${S}" height="${S}" rx="${R}" fill="url(#base)"/><rect width="${S}" height="${S}" rx="${R}" fill="url(#n1)"/><rect width="${S}" height="${S}" rx="${R}" fill="url(#n2)"/>
    ${empty}${tiles}</svg>`;
}
