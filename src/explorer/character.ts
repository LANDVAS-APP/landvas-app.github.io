// The explorer character: one SVG drawn from the player's style (hat, held
// tool, outfit, trail, aura). Used by the map marker, the customiser and the
// visit room, so a cosmetic looks the same everywhere.
import type { ExplorerStyle } from '../backend/types';

export const DEFAULT_STYLE: Required<ExplorerStyle> = { hat: 'beret', hold: 'brush', outfit: 'accent', trail: 'none', aura: 'accent' };

export function styleOf(s?: ExplorerStyle | null): Required<ExplorerStyle> {
  return { ...DEFAULT_STYLE, ...(s ?? {}) } as Required<ExplorerStyle>;
}

export const AURA_COLORS: Record<string, string> = { ice: '#7FE8FF', fire: '#FF6B2C', gold: '#FFC93D', rainbow: '#FF3D9A' };

let uid = 0;

function outfit(id: string, accent: string, k: string): { defs: string; fill: string; extra: string } {
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
    default:
      return { defs: '', fill: accent, extra: '' };
  }
}

function hat(id: string, k: string): { defs: string; svg: string } {
  switch (id) {
    case 'none':
      return { defs: '', svg: `<path d="M12.5 13 Q23 4 33.5 13 Q28 9.5 23 9.6 Q17 9.6 12.5 13Z" fill="#6B3E26"/>` };
    case 'cap':
      return { defs: '', svg: `<path d="M12 13.5 Q12.5 5 23 5 Q33.5 5 34 13.5Z" fill="#22C7B5"/><rect x="9" y="12" width="12" height="3" rx="1.5" fill="#1A8F82"/><circle cx="23" cy="5.5" r="1.3" fill="#1A8F82"/>` };
    case 'headphones':
      return { defs: '', svg: `<path d="M11.5 16 Q11 3.5 23 3.5 Q35 3.5 34.5 16" fill="none" stroke="#2B2F4A" stroke-width="2.4"/><rect x="8.6" y="13.5" width="5" height="8" rx="2.5" fill="#FF3D9A"/><rect x="32.4" y="13.5" width="5" height="8" rx="2.5" fill="#FF3D9A"/><path d="M12.5 12.5 Q23 6 33.5 12.5 Q28 9 23 9 Q17.5 9 12.5 12.5Z" fill="#6B3E26"/>` };
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
    case 'halo':
      return { defs: '', svg: `<path d="M12.5 13 Q23 4 33.5 13 Q28 9.5 23 9.6 Q17 9.6 12.5 13Z" fill="#6B3E26"/><ellipse class="halo" cx="23" cy="1.8" rx="9" ry="2.6" fill="none" stroke="#FFE14D" stroke-width="2"/>` };
    default: // beret
      return { defs: '', svg: `<path d="M11.5 13.5 Q22 1 34.5 11.5 Q29 9.5 11.5 13.5Z" fill="#FF3D9A"/><circle cx="25" cy="4.6" r="2.1" fill="#FF3D9A"/>` };
  }
}

function hold(id: string): string {
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
  return `<svg viewBox="0 -10 46 68" width="${size}" height="${Math.round(size * 68 / 46)}" aria-hidden="true">
    <defs>${o.defs}${h.defs}</defs>
    <ellipse class="shadow" cx="23" cy="54" rx="11" ry="3.4" fill="rgba(0,0,0,0.45)"/>
    <g class="body"><g class="flip">
      <rect x="16" y="40" width="5" height="11" rx="2.5" fill="#1b1f3d"/>
      <rect x="25" y="40" width="5" height="11" rx="2.5" fill="#1b1f3d"/>
      <rect x="12" y="25.5" width="22" height="19" rx="9.5" fill="${o.fill}"/>
      ${o.extra}
      <rect x="14" y="27.5" width="18" height="6" rx="3" fill="rgba(255,255,255,0.2)"/>
      <circle cx="23" cy="17" r="11" fill="#FFE2C4"/>
      ${h.svg}
      <circle cx="19.3" cy="18" r="1.9" fill="#1b1f3d"/><circle cx="27" cy="18" r="1.9" fill="#1b1f3d"/>
      <circle cx="19.9" cy="17.4" r="0.6" fill="#fff"/><circle cx="27.6" cy="17.4" r="0.6" fill="#fff"/>
      <path d="M19.6 22.2 Q23 25.2 26.6 22.2" stroke="#1b1f3d" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <circle cx="16.8" cy="21.4" r="1.6" fill="#FF9DB8" opacity="0.7"/><circle cx="29.4" cy="21.4" r="1.6" fill="#FF9DB8" opacity="0.7"/>
      ${hold(s.hold)}
    </g></g>
  </svg>`;
}

/** Ring colour for the explorer's aura. */
export function auraColor(style: ExplorerStyle | null | undefined, accent: string) {
  const a = styleOf(style).aura;
  return a === 'accent' ? accent : AURA_COLORS[a] ?? accent;
}

/** Full marker element for the map: aura ring + trail emitter + character. */
export function explorerElement(style: ExplorerStyle | null | undefined, accent: string) {
  const s = styleOf(style);
  const el = document.createElement('div');
  el.className = `lv-explorer aura-${s.aura} trail-${s.trail}`;
  el.innerHTML = `<div class="lv-explorer-ring" style="--c:${auraColor(s, accent)}"></div>
    <div class="lv-trail" aria-hidden="true">${'<i></i>'.repeat(6)}</div>
    ${explorerSvg(s, accent)}`;
  return el;
}
