// Things on the map, drawn in 3D (v1.0.0): a faceted Ink crystal that turns in the light, a shiny balloon on a
// string, a real 3D gift box (six faces, ribbon and bow) that spins, a bevelled golden star that flips, and a race
// flag that waves. Plain HTML/SVG/CSS 3D — cheap enough for dozens on the map at once.

let n = 0;
const uid = () => `a${(n++).toString(36)}`;

/** a faceted gem: light and dark facets, a rim of light; it rocks to catch the light */
export function crystalArt() {
  const g = uid();
  return `<div class="lv3d crystal"><div class="spin"><svg viewBox="0 0 64 72" width="40" height="45">
    <defs>
      <linearGradient id="${g}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C8F4FF"/><stop offset="1" stop-color="#3FA8FF"/></linearGradient>
      <linearGradient id="${g}b" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7DD3FF"/><stop offset="1" stop-color="#2160D8"/></linearGradient>
      <linearGradient id="${g}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A7BE8"/><stop offset="1" stop-color="#1B2F9E"/></linearGradient>
    </defs>
    <path d="M14 4h36l14 18H0z" fill="url(#${g}a)"/>
    <path d="M14 4 22 22H0z" fill="#E6FBFF"/><path d="M50 4 42 22h22z" fill="#5BB6FF"/><path d="M22 22 32 4l10 18z" fill="#9BE3FF"/>
    <path d="M0 22h22l10 48z" fill="url(#${g}b)"/><path d="M22 22h20L32 70z" fill="#4E9BFF"/><path d="M42 22h22L32 70z" fill="url(#${g}c)"/>
    <path d="M14 4h36l14 18-32 48L0 22z" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M8 18 14 10" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".9"/>
  </svg></div><i class="glint"></i><span class="shadow"></span></div>`;
}

/** a shiny balloon with a knot and a curly string */
export function balloonArt(color = '#FF4F7B') {
  const g = uid();
  return `<div class="lv3d balloon"><div class="sway"><svg viewBox="0 0 48 92" width="34" height="65">
    <defs><radialGradient id="${g}" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".18" stop-color="${color}" stop-opacity=".95"/><stop offset=".85" stop-color="${color}"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs>
    <path d="M24 56c0 6-5 8-2 14s7 8 2 14-3 6-1 8" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="1.3"/>
    <ellipse cx="24" cy="27" rx="21" ry="25" fill="url(#${g})"/>
    <path d="M20 51h8l-2 5h-4z" fill="${color}"/>
    <ellipse cx="16" cy="17" rx="5" ry="8" fill="#fff" opacity=".55" transform="rotate(-25 16 17)"/>
  </svg></div><span class="shadow"></span></div>`;
}

/** a real 3D box: six faces with ribbon, a bow on top; it turns slowly */
export function giftArt() {
  const face = (c: string) => `<i class="${c}"></i>`;
  return `<div class="lv3d gift"><div class="scene"><div class="cube">${['f', 'b', 'l', 'r', 't', 'd'].map(face).join('')}<em class="bow"></em></div></div><span class="shadow"></span></div>`;
}

/** a bevelled golden star that flips like a coin */
export function starArt() {
  const g = uid();
  const pts = Array.from({ length: 10 }, (_, i) => { const a = (Math.PI / 5) * i - Math.PI / 2, r = i % 2 ? 13 : 30; return [32 + Math.cos(a) * r, 34 + Math.sin(a) * r]; });
  const facets = pts.map((p, i) => { const q = pts[(i + 1) % 10]; return `<path d="M32 34L${p[0].toFixed(1)} ${p[1].toFixed(1)}L${q[0].toFixed(1)} ${q[1].toFixed(1)}z" fill="${i % 2 ? '#FFB300' : '#FFE27A'}"/>`; }).join('');
  return `<div class="lv3d star"><div class="flip"><svg viewBox="0 0 64 68" width="40" height="42">
    <defs><radialGradient id="${g}"><stop offset="0" stop-color="#FFF6C4"/><stop offset="1" stop-color="#FFC21A" stop-opacity="0"/></radialGradient></defs>
    <circle cx="32" cy="34" r="31" fill="url(#${g})" opacity=".55"/>${facets}
    <path d="M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}z" fill="none" stroke="#B87400" stroke-width="1.4" stroke-linejoin="round"/>
  </svg></div><span class="shadow"></span></div>`;
}

/** a race flag on a pole, waving */
export function flagArt(color = '#FF4F7B') {
  return `<div class="lv3d flag"><svg viewBox="0 0 60 96" width="44" height="70">
    <ellipse cx="14" cy="91" rx="12" ry="4" fill="#000" opacity=".25"/>
    <rect x="11" y="6" width="5" height="86" rx="2.5" fill="#E8E8EE"/><rect x="11" y="6" width="2" height="86" fill="#fff"/>
    <circle cx="13.5" cy="6" r="5" fill="#FFD84D" stroke="#B88A00"/>
    <g class="wave"><path d="M16 12c10-5 18 5 28 0s12-2 14 0v26c-2-2-6-5-14 0s-18-5-28 0z" fill="${color}"/>
      <path d="M16 12c10-5 18 5 28 0s12-2 14 0v6c-2-2-6-5-14 0s-18-5-28 0z" fill="#fff" opacity=".25"/>
      <path d="M26 18h6v6h-6zM38 18h6v6h-6zM32 24h6v6h-6zM26 30h6v6h-6z" fill="#fff" opacity=".9"/></g>
  </svg></div>`;
}
