// Ultra sets: every ultra rarity has its own explorer look (hat, outfit, held relic, aura, trail) and its own
// Inkborn wear. Pieces are ids starting with "x" (xkraken, xcity…), unlocked by getting a plot of that rarity.
import type { RarityId } from '../shared/rarity';

export type UltraTheme = { set: string; rarity: RarityId; name: string; emoji: string; a: string; b: string; c: string };

const T = (set: string, rarity: RarityId, name: string, emoji: string, a: string, b: string, c: string): UltraTheme => ({ set, rarity, name, emoji, a, b, c });
export const ULTRA_THEMES: UltraTheme[] = [
  T('xsolar', 'solar', 'Solar', '☀️', '#FF9F1C', '#B4410C', '#FFE08A'),
  T('xlunar', 'lunar', 'Lunar', '🌙', '#8FA8FF', '#1E2A6B', '#E1E8FF'),
  T('xcomet', 'comet', 'Comet', '☄️', '#22E3FF', '#0B3A6B', '#C9F8FF'),
  T('xchaos', 'chaos', 'Chaos', '🎲', '#FF2E63', '#3B0A1E', '#FFE14D'),
  T('xphoenix', 'phoenix', 'Phoenix', '🔥', '#FF5A1F', '#7A1405', '#FFD166'),
  T('xgemini', 'gemini', 'Gemini', '♊', '#F472B6', '#6B1D4A', '#FBCFE8'),
  T('xkraken', 'kraken', 'Kraken', '🐙', '#0EA5A4', '#063F45', '#99F6E4'),
  T('xancient', 'ancient', 'Ancient', '🏛️', '#C9A66B', '#5C4423', '#F1E2BF'),
  T('xmirror', 'mirror', 'Mirror', '🪞', '#7DD3FC', '#1E3A5F', '#F0F9FF'),
  T('xprismatic', 'prismatic', 'Prismatic', '🌈', '#FF7AE0', '#5B21B6', '#FFFFFF'),
  T('xcity', 'crown', 'City Crown', '👑', '#FFD23F', '#8A5A00', '#FFF4B8'),
  T('xstate', 'crown_state', 'State Crown', '👑', '#C084FC', '#4C1D95', '#F5D0FE'),
  T('xcountry', 'crown_country', 'Country Crown', '👑', '#F43F5E', '#7F1D1D', '#FFE4E6'),
  T('xgenesis', 'genesis', 'Genesis', '🌌', '#FFFFFF', '#4C1D95', '#FFD6FF'),
  T('xsingularity', 'singularity', 'Singularity', '🕳️', '#B4FF39', '#0A0A0A', '#F2FFD6'),
];
const BY_SET = Object.fromEntries(ULTRA_THEMES.map((t) => [t.set, t]));
const BY_RARITY = Object.fromEntries(ULTRA_THEMES.map((t) => [t.rarity, t]));
export const ultraTheme = (id: string | null | undefined): UltraTheme | undefined => (id ? BY_SET[id] : undefined);
export const ultraOfRarity = (r: string | null | undefined): UltraTheme | undefined => (r ? BY_RARITY[r] : undefined);

const crownPath = (spikes: number, y0: number, top: number, w = 22, x0 = 12) => {
  // a crown band from x0 to x0+w at y0 with `spikes` points reaching `top`
  let d = `M${x0} ${y0} L${x0} ${top + 3}`;
  for (let i = 0; i < spikes; i++) {
    const xa = x0 + (w * (i + 0.5)) / spikes, xb = x0 + (w * (i + 1)) / spikes;
    d += ` L${xa.toFixed(2)} ${top} L${xb.toFixed(2)} ${top + 3 + (i === spikes - 1 ? 0 : 3)}`;
  }
  return `${d} L${x0 + w} ${y0}Z`;
};

/** explorer hat for an ultra set (46 × 58 character space, head centred at 23,17 r 11) */
export function ultraHat(id: string, k: string): { defs: string; svg: string } {
  const t = BY_SET[id]; if (!t) return { defs: '', svg: '' };
  const g = `uh${k}`;
  const grad = `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.c}"/><stop offset="0.5" stop-color="${t.a}"/><stop offset="1" stop-color="${t.b}"/></linearGradient>`;
  const glow = (s: string) => `<g class="ultra-glow" style="filter:drop-shadow(0 0 2px ${t.a})">${s}</g>`;
  switch (id) {
    case 'xsolar': return { defs: grad, svg: glow(`<g class="spin-slow" style="transform-origin:23px 6px">${Array.from({ length: 10 }, (_, i) => `<path d="M23 6 L21.8 -5 L24.2 -5Z" fill="${t.c}" transform="rotate(${i * 36 - 90} 23 6)" opacity="0.95"/>`).join('')}</g><circle cx="23" cy="6" r="6.5" fill="url(#${g})" stroke="${t.b}" stroke-width="0.6"/><circle cx="21" cy="4.5" r="1.6" fill="#fff" opacity="0.7"/><path d="M12 12.8 Q23 8 34 12.8" stroke="${t.a}" stroke-width="2.2" fill="none"/>`) };
    case 'xlunar': return { defs: grad, svg: glow(`<path d="M12.5 12.6 Q23 8.5 33.5 12.6" stroke="${t.c}" stroke-width="1.6" fill="none"/><path d="M27 -3 A8 8 0 1 0 27 11 A6 6 0 1 1 27 -3Z" fill="url(#${g})" stroke="${t.b}" stroke-width="0.5"/><circle class="spark" cx="15" cy="3" r="1" fill="#fff"/><circle class="spark" cx="31" cy="1" r="0.8" fill="#fff"/><circle cx="23" cy="10.5" r="1.4" fill="${t.c}"/>`) };
    case 'xcomet': return { defs: grad, svg: glow(`<path d="M11.5 14 Q11 4 23 3.5 Q35 4 34.5 14Z" fill="url(#${g})" stroke="${t.b}" stroke-width="0.6"/><path d="M13 12 Q23 9 33 12" stroke="#0B1530" stroke-width="2.5" fill="none" opacity="0.6"/><path d="M33 5 Q43 -2 46 -6 Q40 2 35 9Z" fill="${t.c}" opacity="0.85"/><path d="M33 7 Q41 3 45 1 Q39 6 34 10Z" fill="${t.a}" opacity="0.7"/><circle cx="23" cy="3.6" r="2.2" fill="#fff"/>`) };
    case 'xchaos': return { defs: grad, svg: `<path d="M12 13 Q12 6 18 5 L5 -2 Q12 3 16 4 Z" fill="${t.a}"/><path d="M34 13 Q34 6 28 5 L41 -2 Q34 3 30 4 Z" fill="${t.b}" stroke="${t.a}" stroke-width="0.4"/><path d="M14 13 Q23 -6 32 13Z" fill="${t.a}"/><path d="M23 13 L23 1 Q28 5 32 13Z" fill="#14162B"/><circle cx="5" cy="-2" r="2" fill="${t.c}"/><circle cx="41" cy="-2" r="2" fill="${t.c}"/><g transform="rotate(-12 23 4)"><rect x="20" y="1" width="6" height="6" rx="1.3" fill="#fff" stroke="#14162B" stroke-width="0.5"/><circle cx="21.8" cy="2.8" r="0.6" fill="#14162B"/><circle cx="23" cy="4" r="0.6" fill="#14162B"/><circle cx="24.2" cy="5.2" r="0.6" fill="#14162B"/></g>` };
    case 'xphoenix': return { defs: grad, svg: glow(`<g class="flicker">${[-14, -6, 0, 6, 14].map((r, i) => `<path d="M23 12 Q${21 - i * 0.3} 3 23 ${-6 + Math.abs(r) * 0.4} Q${25 + i * 0.3} 3 23 12Z" fill="${i % 2 ? t.c : t.a}" transform="rotate(${r} 23 12)"/>`).join('')}</g><path d="M12 13.5 Q23 8.5 34 13.5" stroke="${t.b}" stroke-width="2" fill="none"/><circle cx="23" cy="10.8" r="1.5" fill="${t.c}"/>`) };
    case 'xgemini': return { defs: grad, svg: glow(`<circle cx="14" cy="7" r="4.4" fill="${t.a}"/><circle cx="32" cy="7" r="4.4" fill="${t.c}" stroke="${t.a}" stroke-width="0.6"/><path d="M14 4.8 L14.7 6.4 L16.4 6.5 L15.1 7.6 L15.5 9.3 L14 8.4 L12.5 9.3 L12.9 7.6 L11.6 6.5 L13.3 6.4Z" fill="#fff"/><path d="M32 4.8 L32.7 6.4 L34.4 6.5 L33.1 7.6 L33.5 9.3 L32 8.4 L30.5 9.3 L30.9 7.6 L29.6 6.5 L31.3 6.4Z" fill="${t.a}"/><path d="M18 4 Q23 1 28 4" stroke="${t.a}" stroke-width="1" stroke-dasharray="1 1" fill="none"/>`) };
    case 'xkraken': return { defs: grad, svg: `<path d="M11.5 13 Q10 -4 23 -5 Q36 -4 34.5 13Z" fill="url(#${g})" stroke="${t.b}" stroke-width="0.6"/><circle cx="19" cy="3" r="2.6" fill="#fff"/><circle cx="27" cy="3" r="2.6" fill="#fff"/><circle cx="19.5" cy="3.4" r="1.3" fill="#14162B"/><circle cx="27.5" cy="3.4" r="1.3" fill="#14162B"/><g class="sway" fill="${t.a}" stroke="${t.b}" stroke-width="0.4">${[[12, 1], [15.5, 1], [30.5, -1], [34, -1]].map(([x, s]) => `<path d="M${x} 12 Q${x - 4 * s} 17 ${x - 2 * s} 22 Q${x - 6 * s} 19 ${x - 5 * s} 13Z"/>`).join('')}</g><g fill="${t.c}">${[16, 21, 26, 30].map((x) => `<circle cx="${x}" cy="10" r="0.9"/>`).join('')}</g>` };
    case 'xancient': return { defs: grad, svg: glow(`<path d="M12 12 Q23 3 34 12" stroke="${t.b}" stroke-width="1" fill="none"/>${Array.from({ length: 7 }, (_, i) => { const x = 13.5 + i * 1.7; const y = 11.3 - Math.sin((i / 6) * Math.PI) * 0.8 - i * 0.9; return `<ellipse cx="${x}" cy="${y + i * 0.2}" rx="3" ry="1.4" fill="${t.a}" transform="rotate(${-40 + i * 6} ${x} ${y})"/><ellipse cx="${46 - x}" cy="${y + i * 0.2}" rx="3" ry="1.4" fill="${t.c}" stroke="${t.a}" stroke-width="0.3" transform="rotate(${40 - i * 6} ${46 - x} ${y})"/>`; }).join('')}<circle cx="23" cy="4" r="1.6" fill="${t.c}" stroke="${t.b}" stroke-width="0.4"/>`) };
    case 'xmirror': return { defs: `<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="0.3" stop-color="${t.a}"/><stop offset="0.55" stop-color="#fff"/><stop offset="1" stop-color="${t.b}"/></linearGradient>`, svg: `<path d="M11.5 14 Q11 4 23 3 Q35 4 34.5 14Z" fill="url(#${g})" stroke="${t.b}" stroke-width="0.6"/><rect x="12.5" y="14" width="21" height="6.6" rx="3.3" fill="url(#${g})" stroke="${t.b}" stroke-width="0.5"/><path class="shine" d="M15 15 L19 15 L17 20 L13 20Z" fill="#fff" opacity="0.8"/>` };
    case 'xprismatic': return { defs: `<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF3D6E"/><stop offset="0.25" stop-color="#FFE14D"/><stop offset="0.5" stop-color="#3DDC97"/><stop offset="0.75" stop-color="#2FB8FF"/><stop offset="1" stop-color="#A45CFF"/></linearGradient>`, svg: glow(`<path d="M12.5 12.8 Q23 8.5 33.5 12.8" stroke="#fff" stroke-width="1.4" fill="none"/><path d="M23 -7 L29 3 L23 11 L17 3Z" fill="url(#${g})" stroke="#fff" stroke-width="0.6"/><path d="M23 -7 L23 11 M17 3 L29 3" stroke="#fff" stroke-width="0.4" opacity="0.7"/><path d="M15 5 L17.5 8.5 L15 11 L12.5 8.5Z" fill="url(#${g})" opacity="0.85"/><path d="M31 5 L33.5 8.5 L31 11 L28.5 8.5Z" fill="url(#${g})" opacity="0.85"/>`) };
    case 'xcity': return { defs: grad, svg: glow(`<path d="${crownPath(5, 13, 1)}" fill="url(#${g})" stroke="${t.b}" stroke-width="0.6"/><rect x="12" y="10.5" width="22" height="2.5" fill="${t.b}" opacity="0.5"/>${[14.2, 18.6, 23, 27.4, 31.8].map((x, i) => `<circle cx="${x}" cy="${i === 2 ? 1 : 1.5}" r="1.1" fill="${t.c}"/>`).join('')}<circle cx="23" cy="8" r="1.8" fill="#FF3D6E"/><circle cx="17" cy="9" r="1.1" fill="#22E3FF"/><circle cx="29" cy="9" r="1.1" fill="#3DDC97"/>`) };
    case 'xstate': return { defs: grad, svg: glow(`<path d="M11.5 13 L11.5 4 L15 7.5 L18 -1 L23 5 L28 -1 L31 7.5 L34.5 4 L34.5 13Z" fill="url(#${g})" stroke="${t.b}" stroke-width="0.6"/><path d="M23 5 L23 -6" stroke="${t.a}" stroke-width="1"/><circle cx="23" cy="-7" r="2.2" fill="${t.c}" stroke="${t.a}" stroke-width="0.5"/><path d="M20 9 L23 6 L26 9 L23 12Z" fill="#fff" opacity="0.9"/><circle cx="15.5" cy="10" r="1.1" fill="#FFD23F"/><circle cx="30.5" cy="10" r="1.1" fill="#FFD23F"/>`) };
    case 'xcountry': return { defs: `${grad}<linearGradient id="${g}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF4B8"/><stop offset="1" stop-color="#D99A0B"/></linearGradient>`, svg: glow(`<path d="M11.5 13 Q11 2 23 1 Q35 2 34.5 13Z" fill="url(#${g})"/><path d="M11.5 13 L11.5 6 Q17 -2 23 -4 Q29 -2 34.5 6 L34.5 13" fill="none" stroke="url(#${g}g)" stroke-width="1.6"/><path d="M23 -4 L23 13 M14 10 Q23 -6 32 10" fill="none" stroke="url(#${g}g)" stroke-width="1.2"/><rect x="11" y="10.8" width="24" height="2.6" rx="1" fill="url(#${g}g)"/><path d="M23 -10 L23 -4 M20.5 -7.5 L25.5 -7.5" stroke="url(#${g}g)" stroke-width="1.6" stroke-linecap="round"/>${[14, 18.5, 23, 27.5, 32].map((x, i) => `<circle cx="${x}" cy="12.1" r="0.8" fill="${['#22E3FF', '#3DDC97', '#fff', '#3DDC97', '#22E3FF'][i]}"/>`).join('')}`) };
    case 'xgenesis': return { defs: grad, svg: `<ellipse class="halo" cx="23" cy="1" rx="11" ry="3" fill="none" stroke="#fff" stroke-width="1.6" style="filter:drop-shadow(0 0 3px ${t.c})"/><g class="spin-slow" style="transform-origin:23px 1px">${[0, 120, 240].map((r, i) => `<circle cx="${23 + Math.cos((r * Math.PI) / 180) * 11}" cy="${1 + Math.sin((r * Math.PI) / 180) * 3}" r="${1.4 - i * 0.2}" fill="${['#FFD6FF', '#9EE7FF', '#FFE14D'][i]}"/>`).join('')}</g><circle cx="23" cy="-4" r="2" fill="#fff" style="filter:drop-shadow(0 0 3px #FFD6FF)"/>` };
    case 'xsingularity': return { defs: `<radialGradient id="${g}"><stop offset="0.45" stop-color="#000"/><stop offset="0.7" stop-color="${t.a}"/><stop offset="1" stop-color="${t.a}" stop-opacity="0"/></radialGradient>`, svg: `<g class="spin-slow" style="transform-origin:23px 0px"><ellipse cx="23" cy="0" rx="13" ry="3.2" fill="none" stroke="${t.a}" stroke-width="1.4" opacity="0.9"/><ellipse cx="23" cy="0" rx="9" ry="2.2" fill="none" stroke="${t.c}" stroke-width="0.7" opacity="0.8"/></g><circle cx="23" cy="0" r="5.4" fill="url(#${g})"/><circle cx="23" cy="0" r="3" fill="#000"/>` };
  }
  return { defs: '', svg: '' };
}

/** explorer outfit for an ultra set (body 12–34 × 25.5–44.5) */
export function ultraOutfit(id: string, k: string): { defs: string; fill: string; extra: string } | null {
  const t = BY_SET[id]; if (!t) return null;
  const g = `uo${k}`, c = `uc${k}`;
  const clip = `<clipPath id="${c}"><rect x="12" y="25.5" width="22" height="19" rx="9.5"/></clipPath>`;
  const lin = (dir = 'x2="0" y2="1"') => `<linearGradient id="${g}" x1="0" y1="0" ${dir}><stop offset="0" stop-color="${t.a}"/><stop offset="1" stop-color="${t.b}"/></linearGradient>`;
  const em = (y = 35, s = 5) => `<text x="23" y="${y}" font-size="${s}" text-anchor="middle" dominant-baseline="middle">${t.emoji}</text>`;
  const C = (inner: string) => `<g clip-path="url(#${c})">${inner}</g>`;
  switch (id) {
    case 'xsolar': return { defs: lin() + clip, fill: `url(#${g})`, extra: C(`${Array.from({ length: 12 }, (_, i) => `<path d="M23 35 L${23 + Math.cos(i * 0.5236) * 20} ${35 + Math.sin(i * 0.5236) * 20} L${23 + Math.cos(i * 0.5236 + 0.18) * 20} ${35 + Math.sin(i * 0.5236 + 0.18) * 20}Z" fill="${t.c}" opacity="0.35"/>`).join('')}<circle cx="23" cy="35" r="4.2" fill="${t.c}"/>`) };
    case 'xlunar': return { defs: lin() + clip, fill: `url(#${g})`, extra: C(`${[[15, 29], [30, 31], [18, 41], [28, 40], [21, 28], [32, 37]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.6" fill="#fff"/>`).join('')}<path d="M25 31 A4.5 4.5 0 1 0 25 39 A3.4 3.4 0 1 1 25 31Z" fill="${t.c}"/>`) };
    case 'xcomet': return { defs: lin('x2="1" y2="0"') + clip, fill: `url(#${g})`, extra: C(`<path d="M12 40 L30 30" stroke="${t.c}" stroke-width="2.4" stroke-linecap="round"/><path d="M12 35 L24 28" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity="0.7"/><path d="M16 44 L34 34" stroke="${t.c}" stroke-width="1.2" opacity="0.6"/><circle cx="30.5" cy="29.8" r="2" fill="#fff"/>`) };
    case 'xchaos': return { defs: clip, fill: t.a, extra: C(`<rect x="23" y="25" width="12" height="20" fill="#14162B"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${12 + ((i * 7) % 20)}" y="${27 + i * 3.4}" width="${4 + (i % 3) * 3}" height="1.2" fill="${i % 2 ? t.c : '#22E3FF'}" opacity="0.85"/>`).join('')}<rect x="19" y="32" width="8" height="8" rx="1.6" fill="#fff" transform="rotate(14 23 36)"/><circle cx="21" cy="34" r="0.8" fill="#14162B"/><circle cx="25" cy="38" r="0.8" fill="#14162B"/><circle cx="23" cy="36" r="0.8" fill="#14162B"/>`) };
    case 'xphoenix': return { defs: lin() + clip, fill: `url(#${g})`, extra: C(`${[-1, 1].map((s) => [0, 1, 2].map((i) => `<path d="M23 ${30 + i * 4} Q${23 + s * 8} ${28 + i * 4} ${23 + s * 13} ${33 + i * 4} Q${23 + s * 7} ${34 + i * 4} 23 ${34 + i * 4}Z" fill="${i % 2 ? t.c : '#FFB31F'}" opacity="0.9"/>`).join('')).join('')}`) };
    case 'xgemini': return { defs: clip, fill: t.a, extra: C(`<rect x="23" y="25" width="12" height="20" fill="${t.c}"/><circle cx="18" cy="35" r="2.6" fill="${t.c}"/><circle cx="28" cy="35" r="2.6" fill="${t.a}"/><line x1="23" y1="25" x2="23" y2="45" stroke="${t.b}" stroke-width="0.6"/>`) };
    case 'xkraken': return { defs: lin() + clip, fill: `url(#${g})`, extra: C(`${[[17, 28, 1], [29, 28, -1], [20, 44, 1], [26, 44, -1]].map(([x, y, s]) => `<path d="M${x} ${y} Q${x + 6 * s} ${36} ${x + 2 * s} ${y > 30 ? 34 : 40}" stroke="${t.c}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`).join('')}${[[18.5, 32], [27.5, 32], [21, 39], [25, 39], [23, 35]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.9" fill="#fff" opacity="0.85"/>`).join('')}`) };
    case 'xancient': return { defs: clip, fill: '#F5EEDC', extra: C(`<path d="M12 31 L34 25 L34 29 L12 35Z" fill="${t.a}"/><g stroke="${t.b}" stroke-width="0.8" fill="none"><path d="M12 42 h3 v-2 h-2 v-1 h3 v3 h3 v-2 h-2 v-1 h3 v3 h3 v-2 h-2 v-1 h3 v3 h3 v-2 h-2 v-1 h3 v3"/></g><circle cx="16" cy="32.5" r="1.5" fill="${t.c}" stroke="${t.b}" stroke-width="0.4"/>`) };
    case 'xmirror': return { defs: `<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E9F6FF"/><stop offset="0.35" stop-color="${t.a}"/><stop offset="0.5" stop-color="#fff"/><stop offset="0.7" stop-color="${t.a}"/><stop offset="1" stop-color="${t.b}"/></linearGradient>${clip}`, fill: `url(#${g})`, extra: C(`<path class="shine" d="M14 44 L22 25 L26 25 L18 44Z" fill="#fff" opacity="0.55"/><line x1="23" y1="26" x2="23" y2="44" stroke="${t.b}" stroke-width="0.5"/>`) };
    case 'xprismatic': return { defs: `<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF3D6E"/><stop offset="0.25" stop-color="#FFE14D"/><stop offset="0.5" stop-color="#3DDC97"/><stop offset="0.75" stop-color="#2FB8FF"/><stop offset="1" stop-color="#A45CFF"/></linearGradient>${clip}`, fill: `url(#${g})`, extra: C(`<g stroke="#fff" stroke-width="0.5" opacity="0.7" fill="none"><path d="M12 30 L23 26 L34 30 L23 36Z"/><path d="M12 30 L23 36 L12 42 M34 30 L23 36 L34 42 M23 36 L23 45"/></g>`) };
    case 'xcity': case 'xstate': case 'xcountry': {
      const sash = id === 'xcountry' ? `<path d="M13 28 L33 42" stroke="#FFD23F" stroke-width="2.6"/><circle cx="23" cy="35" r="2" fill="#FFD23F" stroke="#B87A0B" stroke-width="0.4"/>` : '';
      return { defs: lin() + clip, fill: `url(#${g})`, extra: C(`<rect x="12" y="25" width="22" height="3.6" fill="#fff"/>${[14, 18, 22, 26, 30].map((x) => `<rect x="${x + 0.8}" y="25.8" width="0.9" height="1.8" fill="#14162B"/>`).join('')}<rect x="21.5" y="28" width="3" height="17" fill="#FFD23F" opacity="${id === 'xcountry' ? 0 : 0.9}"/>${sash}`) };
    }
    case 'xgenesis': return { defs: `<radialGradient id="${g}" cx="0.4" cy="0.4"><stop offset="0" stop-color="#FFD6FF"/><stop offset="0.4" stop-color="#8B5CFF"/><stop offset="1" stop-color="#1B0F4A"/></radialGradient>${clip}`, fill: `url(#${g})`, extra: C(`${[[16, 30], [29, 29], [20, 40], [30, 41], [25, 34], [14, 37]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${0.5 + (i % 3) * 0.2}" fill="#fff"/>`).join('')}<ellipse cx="23" cy="35" rx="7" ry="2" fill="none" stroke="#fff" stroke-width="0.5" opacity="0.6" transform="rotate(-20 23 35)"/>`) };
    case 'xsingularity': return { defs: `<radialGradient id="${g}" cx="0.5" cy="0.55"><stop offset="0.25" stop-color="#000"/><stop offset="0.5" stop-color="#14210A"/><stop offset="1" stop-color="#0A0A0A"/></radialGradient>${clip}`, fill: `url(#${g})`, extra: C(`<ellipse cx="23" cy="35.5" rx="8" ry="2.2" fill="none" stroke="${t.a}" stroke-width="1.2"/><circle cx="23" cy="35.5" r="3" fill="#000" stroke="${t.c}" stroke-width="0.4"/>`) };
  }
  return { defs: '', fill: t.a, extra: em() };
}

/** the held relic for an ultra set */
export function ultraHold(id: string): string {
  const t = BY_SET[id]; if (!t) return '';
  if (id === 'xkraken') return `<g transform="rotate(18 36 30)"><rect x="35.3" y="14" width="1.6" height="24" rx="0.8" fill="${t.b}"/><path d="M32 16 L32 11 M36.1 14 L36.1 8 M40.2 16 L40.2 11 M32 16 Q36.1 19 40.2 16" stroke="${t.c}" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M31.3 11.5 L32 9.5 L32.7 11.5Z M35.4 8.5 L36.1 6.3 L36.8 8.5Z M39.5 11.5 L40.2 9.5 L40.9 11.5Z" fill="${t.c}"/></g>`;
  if (id === 'xcountry') return `<g transform="rotate(14 36 30)"><rect x="35.4" y="10" width="1.6" height="20" fill="#E5E8F5"/><path d="M35.4 10 L36.2 6.5 L37 10Z" fill="#fff"/><rect x="32.5" y="29.5" width="7.4" height="1.6" rx="0.8" fill="#FFD23F"/><rect x="35.5" y="31" width="1.4" height="5" fill="${t.b}"/><circle cx="36.2" cy="37" r="1.1" fill="#FFD23F"/></g>`;
  if (id === 'xgemini') return `<g transform="rotate(22 36 30)"><rect x="34" y="20" width="1.4" height="16" rx="0.7" fill="${t.b}"/><rect x="37.4" y="22" width="1.4" height="14" rx="0.7" fill="${t.b}"/><circle class="spark" cx="34.7" cy="18.5" r="2" fill="${t.a}"/><circle class="spark" cx="38.1" cy="20.5" r="2" fill="${t.c}"/></g>`;
  // a staff topped with a glowing orb of the ultra
  return `<g transform="rotate(16 36 30)"><rect x="35.3" y="18" width="1.6" height="20" rx="0.8" fill="${t.b}"/><circle cx="36.1" cy="15" r="4.2" fill="${t.a}" opacity="0.35" class="spark"/><circle cx="36.1" cy="15" r="3.2" fill="${t.c}" stroke="${t.a}" stroke-width="0.7"/><text x="36.1" y="15.4" font-size="4" text-anchor="middle" dominant-baseline="middle">${t.emoji}</text></g>`;
}
