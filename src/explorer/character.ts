// The explorer character: one SVG drawn from the player's style (hat, held
// tool, outfit, trail, aura). Used by the map marker, the customiser and the
// visit room, so a cosmetic looks the same everywhere.
import type { ExplorerStyle } from '../backend/types';
import { ultraHat, ultraHold, ultraOutfit, ultraTheme } from './ultra';

export const DEFAULT_STYLE: Required<ExplorerStyle> = { hat: 'beret', hold: 'brush', outfit: 'accent', trail: 'none', aura: 'accent', hair: 'short', hairc: 'brown', skin: 'peach', body: 'classic', sex: '', face: 'none' };

export const SKIN: Record<string, string> = {
  porcelain: '#FFF3EA', light: '#FFEEDD', fair: '#F9DCC4', peach: '#FFE2C4', olive: '#D9B28A', golden: '#E8B378', tan: '#E9B98C',
  caramel: '#C98E5C', brown: '#B97F55', chestnut: '#9A6440', deep: '#7A4E31', espresso: '#5E3A24', ebony: '#43291A',
};
export const HAIR_COLOR: Record<string, string> = {
  black: '#23201F', brown: '#6B3E26', auburn: '#8A3B1E', ginger: '#D2691E', red: '#C8452B', blonde: '#F2CF6B', platinum: '#F4ECD2', silver: '#D9DCE6',
  white: '#FAFAFA', pink: '#FF7AB8', purple: '#9B5CFF', blue: '#3E7BFF', teal: '#1FB5A8', green: '#3DBF5A',
};

/** Hair: a back layer (behind the head) and a front layer (fringe, over the forehead). */
function hair(id: string, c: string): { back: string; front: string } {
  const fringe = `<path d="M12.5 13 Q23 4 33.5 13 Q28 9.5 23 9.6 Q17 9.6 12.5 13Z" fill="${c}"/>`;
  switch (id) {
    case 'long':
      return { back: `<path d="M11.5 15 Q10 30 12.5 37 L17 36 Q15 26 16 17Z M34.5 15 Q36 30 33.5 37 L29 36 Q31 26 30 17Z" fill="${c}"/>`, front: `<path d="M12 14.5 Q13 5 23 5 Q33 5 34 14.5 Q30 9.8 23 9.8 Q16 9.8 12 14.5Z" fill="${c}"/>` };
    case 'ponytail':
      return { back: `<path class="tail" d="M31 9 Q42 10 40 24 Q38 30 35 31 Q37 22 33 14Z" fill="${c}"/><circle cx="32.5" cy="10.5" r="2" fill="#FF3D9A"/>`, front: fringe };
    case 'pigtails':
      return { back: `<circle cx="9.5" cy="19" r="4.2" fill="${c}"/><circle cx="36.5" cy="19" r="4.2" fill="${c}"/><circle cx="11.6" cy="16" r="1.4" fill="#FF3D9A"/><circle cx="34.4" cy="16" r="1.4" fill="#FF3D9A"/>`, front: fringe };
    case 'bob':
      return { back: `<path d="M11 15 Q10.5 25 13 27 L19 25 Q15 20 15.5 15Z M35 15 Q35.5 25 33 27 L27 25 Q31 20 30.5 15Z" fill="${c}"/>`, front: `<path d="M11.8 15.5 Q12.5 5 23 5 Q33.5 5 34.2 15.5 Q31 11 26 10.6 Q24 13 18 12.5 Q14 12.8 11.8 15.5Z" fill="${c}"/>` };
    case 'bun':
      return { back: `<circle cx="23" cy="4.5" r="4.6" fill="${c}"/>`, front: fringe };
    case 'curly':
      return { back: `<g fill="${c}"><circle cx="12" cy="13" r="3.6"/><circle cx="15.5" cy="8" r="3.8"/><circle cx="21" cy="5.6" r="3.9"/><circle cx="26.5" cy="5.8" r="3.9"/><circle cx="31.4" cy="8.6" r="3.7"/><circle cx="34.4" cy="13.4" r="3.4"/><circle cx="11" cy="18.6" r="3"/><circle cx="35" cy="18.6" r="3"/></g>`, front: `<g fill="${c}"><circle cx="16" cy="10.6" r="2.6"/><circle cx="20.5" cy="9" r="2.6"/><circle cx="25.5" cy="9" r="2.6"/><circle cx="30" cy="10.8" r="2.6"/></g>` };
    case 'braid':
      return { back: `<g fill="${c}"><circle cx="33" cy="22" r="2.6"/><circle cx="34" cy="26.6" r="2.4"/><circle cx="34.6" cy="31" r="2.2"/><circle cx="35" cy="35" r="2"/></g><circle cx="35.2" cy="37.6" r="1.3" fill="#FF3D9A"/>`, front: `<path d="M12 14.5 Q13 5 23 5 Q33 5 34 14.5 Q30 9.8 23 9.8 Q16 9.8 12 14.5Z" fill="${c}"/>` };
    case 'buzz':
      return { back: '', front: `<path d="M12.2 14.5 Q12.3 5.8 23 5.6 Q33.7 5.8 33.8 14.5 Q30 10.6 23 10.6 Q16 10.6 12.2 14.5Z" fill="${c}" opacity="0.8"/>` };
    case 'quiff':
      return { back: '', front: `<path d="M12.3 14 Q12 6.5 18 5.2 Q20 0.2 28 0.8 Q35 2.5 33.8 14 Q31 9.5 25 9.4 Q17 9.6 12.3 14Z" fill="${c}"/><path d="M20 4.5 Q25 1.5 30 3" stroke="rgba(255,255,255,0.3)" stroke-width="0.8" fill="none"/>` };
    case 'sidepart':
      return { back: '', front: `<path d="M12 15.5 Q11.6 5 23 4.8 Q34.4 5 34 14.5 Q31.5 9.5 27 9.2 L26 7.4 Q19 10.5 12 15.5Z" fill="${c}"/><path d="M26 7.4 L25 4.9" stroke="rgba(0,0,0,0.25)" stroke-width="0.6"/>` };
    case 'slick':
      return { back: `<path d="M12 16 Q11.5 10 13 8 L33 8 Q34.5 10 34 16Z" fill="${c}"/>`, front: `<path d="M12.3 13.5 Q12 4.8 23 4.6 Q34 4.8 33.7 13.5 Q31 8.2 23 7.8 Q15 8.2 12.3 13.5Z" fill="${c}"/><path d="M16 7 Q23 4.8 30 7 M17 9 Q23 7 29 9" stroke="rgba(255,255,255,0.35)" stroke-width="0.6" fill="none"/>` };
    case 'mohawk':
      return { back: '', front: `<path d="M12.3 14.5 Q12.4 6 23 5.8 Q33.6 6 33.7 14.5 Q30 10.8 23 10.8 Q16 10.8 12.3 14.5Z" fill="${c}" opacity="0.3"/><path d="M19.5 10.5 L18.5 2 L21 4.5 L23 -2.5 L25 4.5 L27.5 2 L26.5 10.5Z" fill="${c}"/>` };
    case 'pixie':
      return { back: `<path d="M11.5 15 Q11 20 13 22 L15.5 20 Q14 17 14.5 15Z M34.5 15 Q35 20 33 22 L30.5 20 Q32 17 31.5 15Z" fill="${c}"/>`, front: `<path d="M11.6 15.5 Q11.3 4.6 23 4.4 Q34.7 4.6 34.3 14 Q31 10.6 26 11.8 L24.5 9.8 Q20 12.8 15 12.6 Q12.8 13.4 11.6 15.5Z" fill="${c}"/>` };
    case 'waves':
      return { back: `<path d="M11.5 15 Q8.5 21 11.5 26 Q8.5 31 12 36.5 Q10.5 39 13 40 L17.5 36 Q14.2 32 16.4 27 Q14 22 16 17Z M34.5 15 Q37.5 21 34.5 26 Q37.5 31 34 36.5 Q35.5 39 33 40 L28.5 36 Q31.8 32 29.6 27 Q32 22 30 17Z" fill="${c}"/>`, front: `<path d="M12 14.5 Q13 5 23 5 Q33 5 34 14.5 Q31 9.8 26 10 Q24 12 20 10.2 Q15 10 12 14.5Z" fill="${c}"/>` };
    case 'spacebuns':
      return { back: `<circle cx="14" cy="6.2" r="4" fill="${c}"/><circle cx="32" cy="6.2" r="4" fill="${c}"/><path d="M12 7 Q14 4.5 16 7 M30 7 Q32 4.5 34 7" stroke="rgba(0,0,0,0.18)" stroke-width="0.6" fill="none"/>`, front: fringe };
    case 'spiky':
      return { back: '', front: `<path d="M12.5 13 L14 6 L17.5 9.5 L20 3.8 L23 8.6 L26 3.8 L28.5 9.5 L32 6 L33.5 13 Q28 9.5 23 9.6 Q17 9.6 12.5 13Z" fill="${c}"/>` };
    default:
      return { back: '', front: fringe };
  }
}

export function styleOf(s?: ExplorerStyle | null): Required<ExplorerStyle> {
  return { ...DEFAULT_STYLE, ...(s ?? {}) } as Required<ExplorerStyle>;
}

export const AURA_COLORS: Record<string, string> = { ice: '#7FE8FF', fire: '#FF6B2C', gold: '#FFC93D', rainbow: '#FF3D9A', neon: '#FF3D9A', arcade: '#22E3FF' };

let uid = 0;

function outfit(id: string, accent: string, k: string): { defs: string; fill: string; extra: string } {
  const u = ultraOutfit(id, k); if (u) return u;
  switch (id) {
    case 'midnight':
      return { defs: '', fill: '#1B2A5E', extra: `<rect x="12" y="25.5" width="22" height="19" rx="9.5" fill="none" stroke="#C9D3F0" stroke-width="1"/><line x1="23" y1="26" x2="23" y2="44" stroke="#C9D3F0" stroke-width="0.8"/>` };
    case 'camo':
      return {
        defs: `<clipPath id="c${k}"><rect x="12" y="25.5" width="22" height="19" rx="9.5"/></clipPath>`,
        fill: '#2E7D4F',
        extra: `<g clip-path="url(#c${k})"><circle cx="16" cy="30" r="3.5" fill="#FF3D9A"/><circle cx="27" cy="29" r="3" fill="#FFB31F"/><circle cx="22" cy="38" r="4" fill="#22C7B5"/><circle cx="31" cy="40" r="3" fill="#8B5CFF"/><circle cx="14" cy="41" r="2.5" fill="#1b1f3d"/></g>`,
      };
    case 'galaxy':
      return {
        defs: `<linearGradient id="g${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2B0F5E"/><stop offset="0.55" stop-color="#5B2BC9"/><stop offset="1" stop-color="#FF3D9A"/></linearGradient>`,
        fill: `url(#g${k})`,
        extra: `<circle cx="17" cy="30" r="0.9" fill="#fff"/><circle cx="28" cy="33" r="0.7" fill="#fff"/><circle cx="21" cy="39" r="0.8" fill="#fff"/><circle cx="30" cy="28.5" r="0.5" fill="#fff"/><circle cx="25" cy="42" r="0.6" fill="#BFF"/>`,
      };
    case 'rainbow':
      return {
        defs: `<linearGradient id="g${k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FF3D6E"/><stop offset="0.2" stop-color="#FFB31F"/><stop offset="0.4" stop-color="#FFE14D"/><stop offset="0.6" stop-color="#3DDC97"/><stop offset="0.8" stop-color="#2FB8FF"/><stop offset="1" stop-color="#A45CFF"/></linearGradient>`,
        fill: `url(#g${k})`,
        extra: '',
      };
    case 'gold':
      return {
        defs: `<linearGradient id="g${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF1A8"/><stop offset="0.45" stop-color="#FFC93D"/><stop offset="1" stop-color="#C98A12"/></linearGradient>`,
        fill: `url(#g${k})`,
        extra: `<path d="M15 31 L19 29" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>`,
      };
    case 'pixel': // an 8-bit checker jacket
      return {
        defs: `<clipPath id="c${k}"><rect x="12" y="25.5" width="22" height="19" rx="9.5"/></clipPath>`,
        fill: '#22E3FF',
        extra: `<g clip-path="url(#c${k})">${Array.from({ length: 30 }, (_, i) => { const x = 12 + (i % 6) * 3.7, y = 25.5 + Math.floor(i / 6) * 3.8; return (i + Math.floor(i / 6)) % 2 ? `<rect x="${x}" y="${y}" width="3.7" height="3.8" fill="${['#FF3D9A', '#8B5CFF', '#FFE14D'][i % 3]}"/>` : ''; }).join('')}</g>`,
      };
    case 'synth': // synthwave: a sunset gradient with neon grid lines
      return {
        defs: `<linearGradient id="g${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF3D9A"/><stop offset="0.5" stop-color="#8B2BE2"/><stop offset="1" stop-color="#1B0F4A"/></linearGradient><clipPath id="c${k}"><rect x="12" y="25.5" width="22" height="19" rx="9.5"/></clipPath>`,
        fill: `url(#g${k})`,
        extra: `<g clip-path="url(#c${k})" stroke="#22E3FF" stroke-width="0.6" opacity="0.85"><line x1="12" y1="38" x2="34" y2="38"/><line x1="12" y1="41" x2="34" y2="41"/><line x1="12" y1="44" x2="34" y2="44"/><line x1="23" y1="36" x2="17" y2="45"/><line x1="23" y1="36" x2="29" y2="45"/><line x1="23" y1="36" x2="23" y2="45"/></g><circle cx="23" cy="31.5" r="3.2" fill="#FFE14D" opacity="0.9"/>`,
      };
    case 'champion': // a gold-trimmed winner's jacket with a star
      return {
        defs: `<linearGradient id="g${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14162B"/><stop offset="1" stop-color="#2B2F5A"/></linearGradient>`,
        fill: `url(#g${k})`,
        extra: `<rect x="12" y="25.5" width="22" height="19" rx="9.5" fill="none" stroke="#FFC93D" stroke-width="1.4"/><path d="M23 29 L24.4 32 L27.6 32.3 L25.2 34.4 L25.9 37.6 L23 36 L20.1 37.6 L20.8 34.4 L18.4 32.3 L21.6 32Z" fill="#FFC93D"/>`,
      };
    default:
      return { defs: '', fill: accent, extra: '' };
  }
}

function hat(id: string, k: string): { defs: string; svg: string } {
  if (ultraTheme(id)) return ultraHat(id, k);
  switch (id) {
    case 'none':
      return { defs: '', svg: '' };
    case 'cap':
      return { defs: '', svg: `<path d="M12 13.5 Q12.5 5 23 5 Q33.5 5 34 13.5Z" fill="#22C7B5"/><rect x="9" y="12" width="12" height="3" rx="1.5" fill="#1A8F82"/><circle cx="23" cy="5.5" r="1.3" fill="#1A8F82"/>` };
    case 'headphones':
      return { defs: '', svg: `<path d="M11.5 16 Q11 3.5 23 3.5 Q35 3.5 34.5 16" fill="none" stroke="#2B2F4A" stroke-width="2.4"/><rect x="8.6" y="13.5" width="5" height="8" rx="2.5" fill="#FF3D9A"/><rect x="32.4" y="13.5" width="5" height="8" rx="2.5" fill="#FF3D9A"/>` };
    case 'tophat':
      return { defs: '', svg: `<rect x="10" y="10" width="26" height="3.4" rx="1.7" fill="#14162B"/><rect x="15" y="-4" width="16" height="15" rx="2" fill="#14162B"/><rect x="15" y="6" width="16" height="3" fill="#FF3D9A"/>` };
    case 'wizard':
      return {
        defs: `<linearGradient id="w${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B2BC9"/><stop offset="1" stop-color="#8B5CFF"/></linearGradient>`,
        svg: `<path d="M10 13 L36 13 L26 -9 Z" fill="url(#w${k})"/><ellipse cx="23" cy="13" rx="14" ry="2.6" fill="#2A1F8F"/><text x="20" y="8" font-size="5" fill="#FFE14D">✦</text><text x="25" y="1" font-size="3.6" fill="#FFE14D">✦</text>`,
      };
    case 'crown':
      return {
        defs: `<linearGradient id="cr${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF1A8"/><stop offset="1" stop-color="#E5A112"/></linearGradient>`,
        svg: `<path d="M12.5 12.5 L12.5 3 L17.5 8 L23 1 L28.5 8 L33.5 3 L33.5 12.5 Z" fill="url(#cr${k})" stroke="#B87A0B" stroke-width="0.6"/><circle cx="23" cy="8.5" r="1.6" fill="#FF3D9A"/><circle cx="16.5" cy="10" r="1" fill="#22E3FF"/><circle cx="29.5" cy="10" r="1" fill="#3DDC97"/>`,
      };
    case 'pixelcrown':
      return { defs: '', svg: `<g shape-rendering="crispEdges"><rect x="12" y="8" width="22" height="5" fill="#FFC93D"/><rect x="12" y="4" width="3" height="4" fill="#FFC93D"/><rect x="21.5" y="2" width="3" height="6" fill="#FFC93D"/><rect x="31" y="4" width="3" height="4" fill="#FFC93D"/><rect x="16" y="9.5" width="2" height="2" fill="#FF3D9A"/><rect x="22" y="9.5" width="2" height="2" fill="#22E3FF"/><rect x="28" y="9.5" width="2" height="2" fill="#3DDC97"/><rect x="12" y="12" width="22" height="1.2" fill="#B87A0B"/></g>` };
    case 'propeller':
      return { defs: '', svg: `<path d="M12 13.5 Q12.5 5 23 5 Q33.5 5 34 13.5Z" fill="#FF3D9A"/><path d="M12.6 10 Q23 6 33.4 10" stroke="#FFE14D" stroke-width="1.6" fill="none"/><rect x="22.3" y="1.5" width="1.4" height="4" fill="#2B2F4A"/><g class="spin"><ellipse cx="18.5" cy="1.4" rx="4.6" ry="1.2" fill="#22E3FF"/><ellipse cx="27.5" cy="1.4" rx="4.6" ry="1.2" fill="#3DDC97"/></g><circle cx="23" cy="1.4" r="1.2" fill="#FFE14D"/>` };
    case 'visor':
      return { defs: `<linearGradient id="v${k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22E3FF"/><stop offset="0.5" stop-color="#8B5CFF"/><stop offset="1" stop-color="#FF3D9A"/></linearGradient>`,
        svg: `<path d="M11.5 14.5 Q23 9 34.5 14.5" stroke="#2B2F4A" stroke-width="2" fill="none"/><rect x="13" y="14" width="20" height="6.6" rx="3.3" fill="#14162B"/><rect x="14" y="15" width="18" height="4.6" rx="2.3" fill="url(#v${k})" opacity="0.92"/><rect x="15" y="15.6" width="7" height="1" rx="0.5" fill="#fff" opacity="0.6"/>` };
    case 'antennae':
      return { defs: '', svg: `<path d="M18 9 Q15 3 12.5 1" stroke="#3DDC97" stroke-width="1.3" fill="none"/><path d="M28 9 Q31 3 33.5 1" stroke="#3DDC97" stroke-width="1.3" fill="none"/><circle class="spark" cx="12.5" cy="1" r="2" fill="#B6FF3D"/><circle class="spark" cx="33.5" cy="1" r="2" fill="#B6FF3D"/><path d="M12.5 13.5 Q22 7 33.5 13.5" stroke="#3DDC97" stroke-width="2" fill="none"/>` };
    case 'halo':
      return { defs: '', svg: `<ellipse class="halo" cx="23" cy="1.8" rx="9" ry="2.6" fill="none" stroke="#FFE14D" stroke-width="2"/>` };
    default: // beret
      return { defs: '', svg: `<path d="M11.5 13.5 Q22 1 34.5 11.5 Q29 9.5 11.5 13.5Z" fill="#FF3D9A"/><circle cx="25" cy="4.6" r="2.1" fill="#FF3D9A"/>` };
  }
}

/** glasses, freckles, beards… drawn over the face (hair colour for facial hair) */
function face(id: string, hc: string): { under: string; over: string } {
  switch (id) {
    case 'glasses': return { under: '', over: `<g fill="rgba(200,230,255,0.18)" stroke="#1b1f3d" stroke-width="0.9"><circle cx="19.3" cy="18" r="3"/><circle cx="27" cy="18" r="3"/></g><path d="M22.3 17.8 Q23.15 17 24 17.8 M16.3 17.6 L12.8 16.6 M30 17.6 L33.2 16.6" stroke="#1b1f3d" stroke-width="0.9" fill="none"/>` };
    case 'freckles': return { under: `<g fill="#B7663D" opacity="0.55">${[[15.6, 20.2], [17.2, 21.3], [16.4, 22.4], [18.4, 20.6], [30.4, 20.2], [28.8, 21.3], [29.6, 22.4], [27.6, 20.6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.42"/>`).join('')}</g>`, over: '' };
    case 'beautymark': return { under: '', over: `<circle cx="28.6" cy="22.6" r="0.55" fill="#3A2016"/>` };
    case 'stubble': return { under: `<path d="M13.6 19.5 Q14.4 27.6 23 28.2 Q31.6 27.6 32.4 19.5 Q30.5 25 23 25.4 Q15.5 25 13.6 19.5Z" fill="${hc}" opacity="0.28"/><path d="M19.4 21.2 Q23 20.2 26.6 21.2 L26.6 22 Q23 21.2 19.4 22Z" fill="${hc}" opacity="0.28"/>`, over: '' };
    case 'mustache': return { under: '', over: `<path d="M18.8 21.9 Q20.6 20.2 23 21.3 Q25.4 20.2 27.2 21.9 Q25.6 23 23 22.2 Q20.4 23 18.8 21.9Z" fill="${hc}"/>` };
    case 'goatee': return { under: '', over: `<path d="M19.4 21.8 Q21 20.6 23 21.4 Q25 20.6 26.6 21.8 Q25 22.6 23 22.1 Q21 22.6 19.4 21.8Z" fill="${hc}"/><path d="M20.6 24.6 Q23 25.6 25.4 24.6 Q25 28 23 28.4 Q21 28 20.6 24.6Z" fill="${hc}"/>` };
    case 'beard': return { under: `<path d="M12.8 17.5 Q13 28.6 23 29.6 Q33 28.6 33.2 17.5 Q31.5 22 29 23 Q26 25.5 23 25.4 Q20 25.5 17 23 Q14.5 22 12.8 17.5Z" fill="${hc}"/>`, over: `<path d="M18.8 21.9 Q20.6 20.2 23 21.3 Q25.4 20.2 27.2 21.9 Q25.6 23 23 22.2 Q20.4 23 18.8 21.9Z" fill="${hc}"/>` };
    default: return { under: '', over: '' };
  }
}

function hold(id: string): string {
  if (ultraTheme(id)) return ultraHold(id);
  switch (id) {
    case 'pencil':
      return `<g transform="rotate(28 36 30)"><rect x="34.6" y="19" width="3.2" height="17" rx="0.6" fill="#FFC93D"/><rect x="34.6" y="34" width="3.2" height="2.6" fill="#FF8FA3"/><path d="M34.6 19 L36.2 14.5 L37.8 19Z" fill="#F3D9B1"/><path d="M35.7 15.8 L36.2 14.5 L36.7 15.8Z" fill="#2A2F45"/></g>`;
    case 'roller':
      return `<g transform="rotate(20 36 30)"><rect x="35" y="23" width="2" height="14" rx="1" fill="#8B5A2B"/><path d="M36 23 L36 20 L41 20" stroke="#9AA3C7" stroke-width="1.2" fill="none"/><rect x="37.5" y="15.5" width="9" height="5" rx="2.2" fill="#3DDC97"/></g>`;
    case 'spray':
      return `<g transform="rotate(14 36 30)"><rect x="33.5" y="21" width="6" height="13" rx="2" fill="#FF3D9A"/><rect x="34.7" y="18.4" width="3.6" height="3" rx="1" fill="#E5E8F5"/><circle cx="40.5" cy="18" r="0.9" fill="#FF3D9A" opacity="0.8"/><circle cx="42.5" cy="16.5" r="0.7" fill="#FF3D9A" opacity="0.6"/></g>`;
    case 'palette':
      return `<g transform="rotate(-10 37 29)"><ellipse cx="37.5" cy="29" rx="7" ry="5.4" fill="#E8C9A0"/><circle cx="34.8" cy="27.5" r="1.3" fill="#FF3D9A"/><circle cx="37.8" cy="26.3" r="1.3" fill="#2FB8FF"/><circle cx="40.6" cy="28" r="1.3" fill="#FFE14D"/><circle cx="38.5" cy="31.3" r="1.3" fill="#3DDC97"/><circle cx="35.4" cy="31" r="1" fill="#C9A26B"/></g>`;
    case 'wand':
      return `<g transform="rotate(28 36 30)"><rect x="35.2" y="18" width="1.8" height="18" rx="0.9" fill="#2B2F4A"/><path class="spark" d="M36.1 12 L37.3 15.3 L40.6 15.6 L38 17.6 L38.9 20.9 L36.1 19 L33.3 20.9 L34.2 17.6 L31.6 15.6 L34.9 15.3Z" fill="#FFE14D"/></g>`;
    case 'joystick':
      return `<g transform="rotate(8 37 30)"><rect x="32.5" y="30" width="9" height="4.2" rx="1.2" fill="#14162B"/><rect x="36.4" y="22" width="1.3" height="8.5" fill="#9AA3C7"/><circle cx="37" cy="21.3" r="2.6" fill="#FF3D3D"/><circle cx="36.2" cy="20.5" r="0.8" fill="#fff" opacity="0.7"/><circle cx="34.5" cy="32" r="0.8" fill="#22E3FF"/><circle cx="39.8" cy="32" r="0.8" fill="#FFE14D"/></g>`;
    case 'plush':
      return `<g transform="rotate(-8 37 29)"><circle cx="37.5" cy="29.5" r="4.6" fill="#C98A4E"/><circle cx="34.2" cy="25.6" r="1.7" fill="#C98A4E"/><circle cx="40.8" cy="25.6" r="1.7" fill="#C98A4E"/><circle cx="37.5" cy="30.8" r="2" fill="#F2D2A9"/><circle cx="36" cy="28.6" r="0.6" fill="#1b1f3d"/><circle cx="39" cy="28.6" r="0.6" fill="#1b1f3d"/><path d="M36.8 30.6 L38.2 30.6 L37.5 31.4Z" fill="#1b1f3d"/><path d="M34.5 33.4 L37.5 34.8 L40.5 33.4 L40 35.6 L35 35.6Z" fill="#FF3D9A"/></g>`;
    case 'tickets':
      return `<g class="spark"><path d="M34 33 Q38 28 36 22 Q34 17 39 13" stroke="#FFC93D" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-dasharray="3 1.2"/><path d="M34 33 Q38 28 36 22 Q34 17 39 13" stroke="#B36B00" stroke-width="0.5" fill="none" stroke-dasharray="0.6 3.6"/></g>`;
    default: // brush
      return `<g transform="rotate(28 36 30)"><rect x="34.8" y="22" width="2.6" height="15" rx="1.2" fill="#8B5A2B"/><path d="M34.4 22 Q36.1 15.5 37.8 22Z" fill="#22E3FF"/></g>`;
  }
}

/** The character's SVG markup (46 x 58 viewBox, feet at the bottom). */
export function explorerSvg(style: ExplorerStyle | null | undefined, accent: string, size = 46) {
  const s = styleOf(style);
  const k = `${++uid}`;
  const o = outfit(s.outfit, accent, k);
  const h = hat(s.hat, k);
  const skin = SKIN[s.skin] ?? SKIN.peach;
  const hc = HAIR_COLOR[s.hairc] ?? HAIR_COLOR.brown;
  const hr = hair(s.hair, hc);
  const fc = face(s.face, hc);
  const dress = s.body === 'dress' || s.body === 'skirt';
  // male or female (older looks that never chose: lashes follow the hair, as before)
  const female = s.sex === 'f' || (s.sex !== 'm' && (dress || ['long', 'ponytail', 'pigtails', 'bun', 'braid', 'bob', 'pixie', 'waves', 'spacebuns'].includes(s.hair)));
  const lashes = female;
  const torso = s.body === 'dress'
    ? `<path d="M14 27.5 Q23 23.5 32 27.5 L36 46 Q23 49.5 10 46Z" fill="${o.fill}"/>`
    : s.body === 'skirt'
      ? `<rect x="13" y="25.5" width="20" height="12" rx="7" fill="${o.fill}"/><path d="M13 35 L33 35 L36 45 Q23 48 10 45Z" fill="${o.fill}"/><rect x="13" y="34.2" width="20" height="2" fill="rgba(0,0,0,0.18)"/>`
      : s.sex === 'f'
        ? `<path d="M13.5 30 Q13.5 25.5 18 25.5 L28 25.5 Q32.5 25.5 32.5 30 Q31 35 32.5 40 Q33 44.5 28 44.5 L18 44.5 Q13 44.5 13.5 40 Q15 35 13.5 30Z" fill="${o.fill}"/>`
        : s.sex === 'm' && s.body === 'broad'
          ? `<path d="M9.4 31 Q9.4 25 16 25 L30 25 Q36.6 25 36.6 31 L35 40 Q34.5 44.5 29.5 44.5 L16.5 44.5 Q11.5 44.5 11 40Z" fill="${o.fill}"/>`
        : s.sex === 'm' && s.body === 'slim'
          ? `<path d="M13 30.5 Q13 25.5 17.5 25.5 L28.5 25.5 Q33 25.5 33 30.5 L32.5 40 Q32 44.5 28 44.5 L18 44.5 Q14 44.5 13.5 40Z" fill="${o.fill}"/>`
        : s.sex === 'm'
          ? `<path d="M11 31 Q11 25.5 16.5 25.5 L29.5 25.5 Q35 25.5 35 31 L34 40 Q33.5 44.5 29 44.5 L17 44.5 Q12.5 44.5 12 40Z" fill="${o.fill}"/>`
          : `<rect x="12" y="25.5" width="22" height="19" rx="9.5" fill="${o.fill}"/>`;
  return `<svg viewBox="0 -10 46 68" width="${size}" height="${Math.round(size * 68 / 46)}" aria-hidden="true">
    <defs>${o.defs}${h.defs}</defs>
    <ellipse class="shadow" cx="23" cy="54" rx="11" ry="3.4" fill="rgba(0,0,0,0.45)"/>
    <g class="body"><g class="flip">
      <rect x="16" y="40" width="5" height="11" rx="2.5" fill="${dress ? skin : '#1b1f3d'}"/>
      <rect x="25" y="40" width="5" height="11" rx="2.5" fill="${dress ? skin : '#1b1f3d'}"/>
      ${dress ? '<rect x="15.5" y="48.5" width="6" height="2.8" rx="1.4" fill="#1b1f3d"/><rect x="24.5" y="48.5" width="6" height="2.8" rx="1.4" fill="#1b1f3d"/>' : ''}
      ${torso}
      ${dress ? '' : o.extra}
      <rect x="14" y="27.5" width="18" height="6" rx="3" fill="rgba(255,255,255,0.2)"/>
      ${hr.back}
      <circle cx="23" cy="17" r="11" fill="${skin}"/>
      ${fc.under}
      ${hr.front}
      ${h.svg}
      <circle cx="19.3" cy="18" r="1.9" fill="#1b1f3d"/><circle cx="27" cy="18" r="1.9" fill="#1b1f3d"/>
      <circle cx="19.9" cy="17.4" r="0.6" fill="#fff"/><circle cx="27.6" cy="17.4" r="0.6" fill="#fff"/>
      ${lashes ? '<path d="M17.2 16.4 L16.2 15.4 M17.8 15.9 L17.3 14.7 M28.8 16.4 L29.8 15.4 M28.2 15.9 L28.7 14.7" stroke="#1b1f3d" stroke-width="0.8" stroke-linecap="round"/>' : ''}
      ${s.sex === 'm' ? '<path d="M17.3 14.6 L21.2 14.1 M25.1 14.1 L29 14.6" stroke="#1b1f3d" stroke-width="1.1" stroke-linecap="round" opacity="0.75"/>' : ''}
      <path d="M19.6 22.2 Q23 25.2 26.6 22.2" stroke="${s.sex === 'f' ? '#D9456B' : '#1b1f3d'}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <circle cx="16.8" cy="21.4" r="1.6" fill="#FF9DB8" opacity="${s.face === 'beard' ? 0 : 0.7}"/><circle cx="29.4" cy="21.4" r="1.6" fill="#FF9DB8" opacity="${s.face === 'beard' ? 0 : 0.7}"/>
      ${fc.over}
      ${hold(s.hold)}
    </g></g>
  </svg>`;
}

/** Ring colour for the explorer's aura. */
export function auraColor(style: ExplorerStyle | null | undefined, accent: string) {
  const a = styleOf(style).aura;
  return a === 'accent' ? accent : ultraTheme(a)?.a ?? AURA_COLORS[a] ?? accent;
}

/** extra classes and CSS variables for ultra auras and trails */
export function ultraFx(style: ExplorerStyle | null | undefined): { cls: string; vars: Record<string, string> } {
  const s = styleOf(style);
  const a = ultraTheme(s.aura), t = ultraTheme(s.trail);
  const vars: Record<string, string> = {};
  if (a) { vars['--c2'] = a.c; vars['--c3'] = a.b; }
  if (t) { vars['--te'] = `"${t.emoji}"`; vars['--tc'] = t.a; }
  return { cls: [a && 'aura-ultra', t && 'trail-ultra'].filter(Boolean).join(' '), vars };
}

/** Full marker element for the map: aura ring + trail emitter + character. */
export function explorerElement(style: ExplorerStyle | null | undefined, accent: string) {
  const s = styleOf(style);
  const el = document.createElement('div');
  const fx = ultraFx(s);
  el.className = `lv-explorer aura-${s.aura} trail-${s.trail} ${fx.cls}`;
  for (const [k, v] of Object.entries(fx.vars)) el.style.setProperty(k, v);
  el.innerHTML = `<div class="lv-explorer-ring" style="--c:${auraColor(s, accent)}"></div>
    <div class="lv-trail" aria-hidden="true">${'<i></i>'.repeat(6)}</div>
    ${explorerSvg(s, accent)}`;
  return el;
}
