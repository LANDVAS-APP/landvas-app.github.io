// One picture for a whole Estate (2x2) or Domain (3x3): instead of a floor tile per plot, the merged land is painted
// as a single bird's-eye scene of that place, stretched over its whole square. Every tile it reaches paints the same
// scene (positioned from the land's corner), clipped to its own plots, so it reads as one picture across tiles.
import type { PlotKind } from '../backend/types';

type G = CanvasRenderingContext2D;
type Box = { x: number; y: number; w: number; h: number; s: number; big: boolean; r: () => number };

const rnd = (seed: number) => { let a = seed >>> 0 || 1; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };
const at = (b: Box, u: number, v: number): [number, number] => [b.x + u * b.w, b.y + v * b.h];
const circ = (g: G, x: number, y: number, r: number, c: string) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2); g.fill(); };
const ell = (g: G, x: number, y: number, rx: number, ry: number, c: string, rot = 0) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2); g.fill(); };
const rect = (g: G, x: number, y: number, w: number, h: number, c: string, r = 0) => { g.fillStyle = c; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
const line = (g: G, pts: [number, number][], c: string, w: number) => { g.strokeStyle = c; g.lineWidth = Math.max(0.5, w); g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
const star = (g: G, x: number, y: number, r: number, c: string, n = 5) => { g.fillStyle = c; g.beginPath(); for (let k = 0; k < n * 2; k++) { const a = (k / (n * 2)) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); };
const tree = (g: G, x: number, y: number, r: number, c = '#3E8A3A') => { circ(g, x + r * 0.15, y + r * 0.2, r, 'rgba(0,0,0,0.18)'); circ(g, x, y, r, c); circ(g, x - r * 0.3, y - r * 0.3, r * 0.45, 'rgba(255,255,255,0.18)'); };
const emo = (g: G, e: string, x: number, y: number, size: number) => { if (size < 5) return; g.font = `${Math.round(size)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, x, y); };
const ground = (g: G, b: Box, a: string, c: string) => { const gr = g.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h); gr.addColorStop(0, a); gr.addColorStop(1, c); g.fillStyle = gr; g.fillRect(b.x, b.y, b.w, b.h); };
const speckle = (g: G, b: Box, n: number, colors: string[], size: number) => { for (let i = 0; i < n; i++) { g.globalAlpha = 0.3 + b.r() * 0.6; circ(g, b.x + b.r() * b.w, b.y + b.r() * b.h, size * (0.4 + b.r()), colors[i % colors.length]); } g.globalAlpha = 1; };

const SCENES: Partial<Record<PlotKind, (g: G, b: Box) => void>> = {
  // ---------------------------------------------------------------- Estates (2x2)
  atelier(g, b) { // a sunlit studio: herringbone floor, easels round a skylight, paint splats
    ground(g, b, '#E9D3B0', '#CBA77A');
    g.globalAlpha = 0.25; for (let i = 0; i < 14; i++) line(g, [at(b, 0, i / 7 - 0.5), at(b, 1, i / 7 + 0.5)], '#8B6A44', b.s * 0.006); g.globalAlpha = 1;
    const [cx, cy] = at(b, 0.5, 0.5); rect(g, cx - b.s * 0.18, cy - b.s * 0.18, b.s * 0.36, b.s * 0.36, '#BFE3FF', b.s * 0.02); line(g, [[cx, cy - b.s * 0.18], [cx, cy + b.s * 0.18]], '#fff', b.s * 0.01); line(g, [[cx - b.s * 0.18, cy], [cx + b.s * 0.18, cy]], '#fff', b.s * 0.01);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, x = cx + Math.cos(a) * b.s * 0.32, y = cy + Math.sin(a) * b.s * 0.32; rect(g, x - b.s * 0.05, y - b.s * 0.04, b.s * 0.1, b.s * 0.08, '#FFFDF6', b.s * 0.005); circ(g, x, y, b.s * 0.022, ['#FF5A5F', '#22B8FF', '#FFE14D', '#3DDC97', '#B36BFF', '#FF8A2A'][k]); }
    speckle(g, b, 30, ['#FF5A5F', '#22B8FF', '#FFE14D', '#3DDC97'], b.s * 0.012);
  },
  reserve(g, b) { // a wild reserve: meadow, a river, a watchtower and grazing deer
    ground(g, b, '#8CC653', '#5E9A36');
    line(g, [at(b, -0.05, 0.3), at(b, 0.3, 0.45), at(b, 0.55, 0.35), at(b, 1.05, 0.6)], '#3B8FD0', b.s * 0.09); line(g, [at(b, -0.05, 0.3), at(b, 0.3, 0.45), at(b, 0.55, 0.35), at(b, 1.05, 0.6)], '#7FD3FF', b.s * 0.03);
    for (let i = 0; i < 16; i++) { const [x, y] = at(b, b.r(), b.r()); if (Math.abs(y - (b.y + b.h * 0.45)) > b.s * 0.12) tree(g, x, y, b.s * (0.04 + b.r() * 0.03), b.r() < 0.5 ? '#3E7D3A' : '#2F6A2E'); }
    const [tx, ty] = at(b, 0.75, 0.22); rect(g, tx - b.s * 0.05, ty - b.s * 0.05, b.s * 0.1, b.s * 0.1, '#8B5A2B', b.s * 0.01); rect(g, tx - b.s * 0.07, ty - b.s * 0.07, b.s * 0.14, b.s * 0.04, '#5A3A20');
    for (const [u, v] of [[0.3, 0.75], [0.45, 0.8], [0.2, 0.62]]) emo(g, '🦌', ...at(b, u, v), b.s * 0.07);
  },
  ranch(g, b) { // a horse ranch: paddocks with white fences, a red barn, a round pen
    ground(g, b, '#B8D86A', '#8CB84A');
    rect(g, ...at(b, 0.05, 0.05), b.w * 0.42, b.h * 0.4, '#D9C08A'); g.strokeStyle = '#FFFFFF'; g.lineWidth = b.s * 0.012; g.strokeRect(...at(b, 0.05, 0.05), b.w * 0.42, b.h * 0.4);
    const [px, py] = at(b, 0.73, 0.72); circ(g, px, py, b.s * 0.2, '#D9C08A'); g.beginPath(); g.arc(px, py, b.s * 0.2, 0, Math.PI * 2); g.stroke();
    const [bx, by] = at(b, 0.62, 0.08); rect(g, bx, by, b.w * 0.3, b.h * 0.24, '#C8352C', b.s * 0.01); line(g, [[bx, by + b.h * 0.12], [bx + b.w * 0.3, by + b.h * 0.12]], '#7A1E18', b.s * 0.015); rect(g, bx + b.w * 0.11, by + b.h * 0.15, b.w * 0.08, b.h * 0.09, '#F5EEDC');
    line(g, [at(b, 0.5, 1), at(b, 0.5, 0.5), at(b, 0.62, 0.3)], '#C9A06A', b.s * 0.05);
    emo(g, '🐎', ...at(b, 0.25, 0.25), b.s * 0.09); emo(g, '🐴', ...at(b, 0.73, 0.72), b.s * 0.08); emo(g, '🐎', ...at(b, 0.2, 0.75), b.s * 0.07);
  },
  exchange(g, b) { // a city block of towers seen from above, with a plaza and a ticker ring
    ground(g, b, '#3A4250', '#2A3038');
    line(g, [at(b, 0.5, 0), at(b, 0.5, 1)], '#55606E', b.s * 0.06); line(g, [at(b, 0, 0.5), at(b, 1, 0.5)], '#55606E', b.s * 0.06);
    for (const [u, v] of [[0.22, 0.22], [0.78, 0.22], [0.22, 0.78], [0.78, 0.78]]) { const [x, y] = at(b, u, v), w = b.s * 0.3; rect(g, x - w / 2 + b.s * 0.02, y - w / 2 + b.s * 0.02, w, w, 'rgba(0,0,0,0.35)', b.s * 0.01); rect(g, x - w / 2, y - w / 2, w, w, '#7AA8C8', b.s * 0.01); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) rect(g, x - w / 2 + w * (0.1 + i * 0.22), y - w / 2 + w * (0.1 + j * 0.22), w * 0.14, w * 0.14, b.r() < 0.6 ? '#FFE9A8' : '#3A5878'); }
    const [cx, cy] = at(b, 0.5, 0.5); circ(g, cx, cy, b.s * 0.12, '#D9B24A'); circ(g, cx, cy, b.s * 0.08, '#3DDC97'); emo(g, '📈', cx, cy, b.s * 0.09);
  },
  boardwalk(g, b) { // a seaside boardwalk: sand, waves, the pier and a big wheel
    ground(g, b, '#F2D9A0', '#E8C886'); rect(g, b.x, b.y + b.h * 0.6, b.w, b.h * 0.4, '#2F8FD0');
    for (let i = 0; i < 6; i++) line(g, [at(b, 0, 0.66 + i * 0.06), at(b, 1, 0.64 + i * 0.06)], 'rgba(255,255,255,0.35)', b.s * 0.008);
    rect(g, ...at(b, 0, 0.42), b.w, b.h * 0.14, '#A9865E'); for (let i = 0; i < 20; i++) line(g, [at(b, i / 20, 0.42), at(b, i / 20, 0.56)], '#8E6E4A', b.s * 0.004);
    rect(g, ...at(b, 0.62, 0.5), b.w * 0.1, b.h * 0.42, '#A9865E');
    const [wx, wy] = at(b, 0.28, 0.22); g.strokeStyle = '#FF3D9A'; g.lineWidth = b.s * 0.015; g.beginPath(); g.arc(wx, wy, b.s * 0.15, 0, Math.PI * 2); g.stroke(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; line(g, [[wx, wy], [wx + Math.cos(a) * b.s * 0.15, wy + Math.sin(a) * b.s * 0.15]], '#FFFFFF', b.s * 0.005); circ(g, wx + Math.cos(a) * b.s * 0.15, wy + Math.sin(a) * b.s * 0.15, b.s * 0.02, ['#FFE14D', '#22B8FF', '#3DDC97', '#FF5A5F'][k % 4]); }
    emo(g, '🎪', ...at(b, 0.78, 0.2), b.s * 0.12); for (const u of [0.1, 0.5, 0.9]) emo(g, '⛱️', ...at(b, u, 0.34), b.s * 0.06);
  },
  gemheart(g, b) { // a crystal cavern: dark rock, glowing veins and a giant geode
    ground(g, b, '#2A1E3A', '#14101C');
    for (let i = 0; i < 7; i++) { const pts: [number, number][] = []; let u = b.r(), v = b.r(); for (let k = 0; k < 5; k++) { pts.push(at(b, u, v)); u += (b.r() - 0.5) * 0.3; v += (b.r() - 0.5) * 0.3; } line(g, pts, ['#B36BFF', '#00E5FF', '#FF4FD8'][i % 3], b.s * 0.01); }
    const [cx, cy] = at(b, 0.5, 0.5); circ(g, cx, cy, b.s * 0.24, '#4A3A5A'); circ(g, cx, cy, b.s * 0.19, '#7A2CFF');
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.fillStyle = ['#C9A6FF', '#8AF0FF', '#FF9AE8'][k % 3]; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a - 0.2) * b.s * 0.18, cy + Math.sin(a - 0.2) * b.s * 0.18); g.lineTo(cx + Math.cos(a + 0.2) * b.s * 0.18, cy + Math.sin(a + 0.2) * b.s * 0.18); g.fill(); }
    emo(g, '💎', cx, cy, b.s * 0.12);
  },
  skyport(g, b) { // a cloud harbour: clouds, docks and moored balloons
    ground(g, b, '#9ED8FF', '#6CB8F0');
    for (let i = 0; i < 9; i++) { const [x, y] = at(b, b.r(), b.r()); ell(g, x, y, b.s * (0.1 + b.r() * 0.08), b.s * 0.06, 'rgba(255,255,255,0.9)'); }
    const [cx, cy] = at(b, 0.5, 0.5); circ(g, cx, cy, b.s * 0.18, '#C9A06A'); for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.6; line(g, [[cx, cy], [cx + Math.cos(a) * b.s * 0.38, cy + Math.sin(a) * b.s * 0.38]], '#A9865E', b.s * 0.05); emo(g, '🎈', cx + Math.cos(a) * b.s * 0.38, cy + Math.sin(a) * b.s * 0.38, b.s * 0.09); }
    emo(g, '⚓', cx, cy, b.s * 0.1);
  },
  foundry(g, b) { // a steel works: plates, rails, a molten pour and smokestacks
    ground(g, b, '#5A5A64', '#3A3A42');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) rect(g, ...at(b, i / 4 + 0.01, j / 4 + 0.01), b.w / 4 - b.s * 0.02, b.h / 4 - b.s * 0.02, (i + j) % 2 ? '#4A4A52' : '#55555E', b.s * 0.008);
    line(g, [at(b, 0, 0.7), at(b, 1, 0.7)], '#8A8A94', b.s * 0.02); line(g, [at(b, 0, 0.76), at(b, 1, 0.76)], '#8A8A94', b.s * 0.02);
    const [cx, cy] = at(b, 0.45, 0.4); circ(g, cx, cy, b.s * 0.14, '#2A2A30'); const gr = g.createRadialGradient(cx, cy, 1, cx, cy, b.s * 0.12); gr.addColorStop(0, '#FFE14D'); gr.addColorStop(1, '#FF5A1F'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, b.s * 0.11, 0, Math.PI * 2); g.fill();
    for (const [u, v] of [[0.82, 0.18], [0.82, 0.42], [0.15, 0.2]]) { circ(g, ...at(b, u, v), b.s * 0.06, '#2A2A30'); circ(g, ...at(b, u, v), b.s * 0.035, '#111'); }
    emo(g, '⚙️', ...at(b, 0.22, 0.6), b.s * 0.09);
  },
  foodhall(g, b) { // a food hall: tiled floor, rings of stalls round long tables, paper lanterns
    ground(g, b, '#F5E6C8', '#E8D4AA');
    for (let i = 0; i < 3; i++) rect(g, ...at(b, 0.2, 0.25 + i * 0.22), b.w * 0.6, b.h * 0.07, '#A9865E', b.s * 0.01);
    const stalls = ['#E85D75', '#22B8FF', '#3DDC97', '#FFB13D', '#B36BFF', '#FF8A2A'];
    stalls.forEach((c, k) => { const [x, y] = at(b, k < 3 ? 0.07 : 0.93, 0.2 + (k % 3) * 0.3); rect(g, x - b.s * 0.06, y - b.s * 0.08, b.s * 0.12, b.s * 0.16, c, b.s * 0.01); });
    for (let i = 0; i < 8; i++) circ(g, ...at(b, 0.15 + i * 0.1, 0.1), b.s * 0.022, '#FF5A5F');
    emo(g, '🍜', ...at(b, 0.5, 0.48), b.s * 0.08); emo(g, '🍱', ...at(b, 0.35, 0.7), b.s * 0.06); emo(g, '🍣', ...at(b, 0.65, 0.26), b.s * 0.06);
  },
  citadel(g, b) { // a dark fortress: a star wall, a keep and a sleeping dragon in the yard
    ground(g, b, '#3A3240', '#24202A');
    const [cx, cy] = at(b, 0.5, 0.5); g.fillStyle = '#5A5060'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, r = k % 2 ? b.s * 0.32 : b.s * 0.45; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); g.fill();
    circ(g, cx, cy, b.s * 0.28, '#2E2834'); rect(g, cx - b.s * 0.1, cy - b.s * 0.18, b.s * 0.2, b.s * 0.2, '#6A6070', b.s * 0.01); circ(g, cx, cy - b.s * 0.08, b.s * 0.04, '#A855F7');
    emo(g, '🐉', cx + b.s * 0.08, cy + b.s * 0.14, b.s * 0.13); for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; circ(g, cx + Math.cos(a) * b.s * 0.45, cy + Math.sin(a) * b.s * 0.45, b.s * 0.025, '#FF8A2A'); }
  },
  colosseum(g, b) { // a great oval arena with tiers of seats and a painted floor
    ground(g, b, '#D9C8A0', '#C2AE84');
    const [cx, cy] = at(b, 0.5, 0.5); for (let k = 0; k < 5; k++) ell(g, cx, cy, b.s * (0.46 - k * 0.04), b.s * (0.38 - k * 0.035), k % 2 ? '#E2C38A' : '#B8A070');
    ell(g, cx, cy, b.s * 0.26, b.s * 0.2, '#C9A06A'); for (let k = 0; k < 4; k++) ell(g, cx + (k - 1.5) * b.s * 0.1, cy, b.s * 0.04, b.s * 0.14, ['#FF5A5F', '#22B8FF', '#FFE14D', '#3DDC97'][k]);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; circ(g, cx + Math.cos(a) * b.s * 0.47, cy + Math.sin(a) * b.s * 0.39, b.s * 0.015, '#FF5A5F'); }
  },
  // ---------------------------------------------------------------- Domains (3x3)
  museum(g, b) { // a museum under the night sky: a glass dome full of constellations, wings with skylights
    ground(g, b, '#0E1028', '#1A1D3A');
    speckle(g, b, 80, ['#FFFFFF', '#C3D0FF'], b.s * 0.004);
    for (const [u, v] of [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85], [0.5, 0.1], [0.5, 0.9]]) { rect(g, ...at(b, u - 0.1, v - 0.07), b.w * 0.2, b.h * 0.14, '#2A2E5A', b.s * 0.01); rect(g, ...at(b, u - 0.07, v - 0.04), b.w * 0.14, b.h * 0.08, '#6C7BFF', b.s * 0.01); }
    const [cx, cy] = at(b, 0.5, 0.5); const gr = g.createRadialGradient(cx, cy, 1, cx, cy, b.s * 0.3); gr.addColorStop(0, '#3A2AA0'); gr.addColorStop(1, '#0A0A30'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, b.s * 0.3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#C3D0FF'; g.lineWidth = b.s * 0.004; for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI; g.beginPath(); g.ellipse(cx, cy, b.s * 0.3, b.s * 0.3 * Math.abs(Math.cos(a)), 0, 0, Math.PI * 2); g.stroke(); }
    const C: [number, number][] = [[-0.15, -0.1], [-0.05, -0.15], [0.06, -0.05], [0.14, -0.12], [0.1, 0.08], [-0.08, 0.12]]; line(g, C.map(([u, v]) => [cx + u * b.s, cy + v * b.s]), 'rgba(255,225,77,0.8)', b.s * 0.005); C.forEach(([u, v]) => star(g, cx + u * b.s, cy + v * b.s, b.s * 0.018, '#FFE14D'));
  },
  sanctuary(g, b) { // a misty lake with a lily-ringed spirit spring, a jetty and swans
    ground(g, b, '#5E8A3A', '#3E6E2A');
    const [cx, cy] = at(b, 0.5, 0.52); ell(g, cx, cy, b.s * 0.46, b.s * 0.4, '#2F7FA8'); ell(g, cx, cy, b.s * 0.4, b.s * 0.34, '#3B8FB8');
    for (let i = 0; i < 26; i++) { const a = b.r() * Math.PI * 2, d = 0.25 + b.r() * 0.12; circ(g, cx + Math.cos(a) * b.s * d, cy + Math.sin(a) * b.s * d * 0.85, b.s * 0.018, '#3E8A4A'); }
    const gr = g.createRadialGradient(cx, cy, 1, cx, cy, b.s * 0.12); gr.addColorStop(0, '#E8FFFF'); gr.addColorStop(1, 'rgba(138,240,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, b.s * 0.12, 0, Math.PI * 2); g.fill();
    rect(g, ...at(b, 0.47, 0.84), b.w * 0.06, b.h * 0.16, '#9C7A55'); emo(g, '🦢', cx - b.s * 0.2, cy - b.s * 0.08, b.s * 0.07); emo(g, '🦢', cx + b.s * 0.22, cy + b.s * 0.1, b.s * 0.06);
    for (let i = 0; i < 18; i++) { const [x, y] = at(b, b.r(), b.r() < 0.5 ? b.r() * 0.12 : 0.9 + b.r() * 0.1); tree(g, x, y, b.s * 0.03, '#2F6A2E'); }
  },
  kingdom(g, b) { // a walled kingdom: patchwork fields outside, a moat, a castle in the middle
    ground(g, b, '#E0B84A', '#B8A040');
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== 1 || j !== 1) { rect(g, ...at(b, i / 3 + 0.01, j / 3 + 0.01), b.w / 3 - b.s * 0.02, b.h / 3 - b.s * 0.02, ['#E0B84A', '#7DBB4A', '#9B5DE5', '#C98A4A', '#5E9A36'][(i * 3 + j) % 5], b.s * 0.01); for (let k = 0; k < 5; k++) line(g, [at(b, i / 3 + 0.03, j / 3 + 0.05 + k * 0.055), at(b, i / 3 + 0.3, j / 3 + 0.05 + k * 0.055)], 'rgba(0,0,0,0.12)', b.s * 0.004); }
    const [cx, cy] = at(b, 0.5, 0.5); circ(g, cx, cy, b.s * 0.2, '#3B6E8A'); rect(g, cx - b.s * 0.13, cy - b.s * 0.13, b.s * 0.26, b.s * 0.26, '#C9B89A', b.s * 0.01);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { circ(g, cx + dx * b.s * 0.13, cy + dy * b.s * 0.13, b.s * 0.04, '#B0A080'); circ(g, cx + dx * b.s * 0.13, cy + dy * b.s * 0.13, b.s * 0.025, '#2A4A9A'); }
    rect(g, cx - b.s * 0.06, cy - b.s * 0.06, b.s * 0.12, b.s * 0.12, '#2A4A9A', b.s * 0.01); emo(g, '👑', cx, cy, b.s * 0.07);
  },
  megacorp(g, b) { // one huge glass tower roof seen from above, a helipad and a plaza of fountains
    ground(g, b, '#C8D0D6', '#A8B0B6');
    for (let i = 0; i < 6; i++) { line(g, [at(b, i / 6, 0), at(b, i / 6, 1)], 'rgba(255,255,255,0.4)', b.s * 0.003); line(g, [at(b, 0, i / 6), at(b, 1, i / 6)], 'rgba(255,255,255,0.4)', b.s * 0.003); }
    const [cx, cy] = at(b, 0.5, 0.5), R = b.s * 0.34; rect(g, cx - R + b.s * 0.03, cy - R + b.s * 0.03, R * 2, R * 2, 'rgba(0,0,0,0.3)', b.s * 0.03);
    const gr = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R); gr.addColorStop(0, '#9FE8E0'); gr.addColorStop(1, '#1E6A70'); rect(g, cx - R, cy - R, R * 2, R * 2, '#1E2A44', b.s * 0.03); g.fillStyle = gr; g.beginPath(); g.roundRect(cx - R * 0.9, cy - R * 0.9, R * 1.8, R * 1.8, b.s * 0.02); g.fill();
    circ(g, cx, cy, b.s * 0.12, '#2A3A4A'); g.strokeStyle = '#FFE14D'; g.lineWidth = b.s * 0.01; g.beginPath(); g.arc(cx, cy, b.s * 0.1, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#FFE14D'; g.font = `900 ${Math.round(b.s * 0.1)}px ui-rounded, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', cx, cy);
    for (const [u, v] of [[0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92]]) circ(g, ...at(b, u, v), b.s * 0.04, '#7FD3FF');
  },
  galaxypark(g, b) { // a moon theme park: craters, neon walk star, a coaster loop, a saucer
    ground(g, b, '#8C8A98', '#6A6878');
    for (let i = 0; i < 10; i++) { const [x, y] = at(b, b.r(), b.r()), r = b.s * (0.03 + b.r() * 0.05); circ(g, x, y, r, '#7A7886'); g.strokeStyle = '#A09EAC'; g.lineWidth = b.s * 0.004; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); }
    const [cx, cy] = at(b, 0.5, 0.5); g.shadowColor = '#FF2E88'; g.shadowBlur = b.s * 0.03; for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; line(g, [[cx, cy], [cx + Math.cos(a) * b.s * 0.48, cy + Math.sin(a) * b.s * 0.48]], k % 2 ? '#FF2E88' : '#00E5FF', b.s * 0.012); } g.shadowBlur = 0;
    g.strokeStyle = '#FFE14D'; g.lineWidth = b.s * 0.012; g.beginPath(); g.ellipse(cx + b.s * 0.22, cy - b.s * 0.22, b.s * 0.16, b.s * 0.1, 0.5, 0, Math.PI * 2); g.stroke();
    ell(g, cx, cy, b.s * 0.12, b.s * 0.1, '#F0F0F8'); circ(g, cx, cy, b.s * 0.05, '#9AE6FF'); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; circ(g, cx + Math.cos(a) * b.s * 0.1, cy + Math.sin(a) * b.s * 0.08, b.s * 0.01, k % 2 ? '#FF2E88' : '#00E5FF'); }
    emo(g, '🎡', ...at(b, 0.22, 0.75), b.s * 0.1); emo(g, '🚀', ...at(b, 0.78, 0.75), b.s * 0.08);
  },
  core(g, b) { // a ring of black rock round a molten core, cracks of lava running out to the edges
    ground(g, b, '#2A1E1A', '#1A1210');
    const [cx, cy] = at(b, 0.5, 0.5);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + b.r() * 0.3; let x = cx, y = cy; const pts: [number, number][] = [[x, y]]; for (let k = 0; k < 5; k++) { x += Math.cos(a + (b.r() - 0.5) * 0.8) * b.s * 0.12; y += Math.sin(a + (b.r() - 0.5) * 0.8) * b.s * 0.12; pts.push([x, y]); } g.shadowColor = '#FF5A1F'; g.shadowBlur = b.s * 0.02; line(g, pts, '#FF5A1F', b.s * 0.012); g.shadowBlur = 0; }
    const gr = g.createRadialGradient(cx, cy, 1, cx, cy, b.s * 0.22); gr.addColorStop(0, '#FFF6A8'); gr.addColorStop(0.4, '#FFB020'); gr.addColorStop(0.8, '#FF3A00'); gr.addColorStop(1, 'rgba(120,20,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, b.s * 0.22, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 3; k++) { g.strokeStyle = '#3A2A22'; g.lineWidth = b.s * 0.015; g.beginPath(); g.ellipse(cx, cy, b.s * (0.17 + k * 0.03), b.s * (0.08 + k * 0.03), k * 0.9, 0, Math.PI * 2); g.stroke(); }
  },
  observatory(g, b) { // a mountaintop compass-rose terrace, the great dome and an orrery
    ground(g, b, '#1C2A5A', '#14204A');
    speckle(g, b, 50, ['#FFFFFF'], b.s * 0.004);
    const [cx, cy] = at(b, 0.5, 0.55); g.strokeStyle = '#C9A64A'; g.lineWidth = b.s * 0.008; for (const r of [0.42, 0.28]) { g.beginPath(); g.arc(cx, cy, b.s * r, 0, Math.PI * 2); g.stroke(); }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; line(g, [[cx + Math.cos(a) * b.s * 0.28, cy + Math.sin(a) * b.s * 0.28], [cx + Math.cos(a) * b.s * (k % 2 ? 0.36 : 0.45), cy + Math.sin(a) * b.s * (k % 2 ? 0.36 : 0.45)]], '#C9A64A', b.s * 0.008); }
    const [dx, dy] = at(b, 0.5, 0.22); circ(g, dx, dy, b.s * 0.16, '#E8E4DC'); rect(g, dx - b.s * 0.02, dy - b.s * 0.16, b.s * 0.04, b.s * 0.32, '#1C2A5A');
    circ(g, cx, cy, b.s * 0.05, '#FFB020'); for (let k = 0; k < 4; k++) { g.strokeStyle = 'rgba(201,166,74,0.6)'; g.lineWidth = b.s * 0.003; g.beginPath(); g.arc(cx, cy, b.s * (0.09 + k * 0.045), 0, Math.PI * 2); g.stroke(); const a = k * 1.9; circ(g, cx + Math.cos(a) * b.s * (0.09 + k * 0.045), cy + Math.sin(a) * b.s * (0.09 + k * 0.045), b.s * 0.015, ['#6C9BFF', '#FF8AD8', '#7CE0B0', '#C9A6FF'][k]); }
  },
  automaton(g, b) { // an art-deco factory floor: gold chevrons, a ring conveyor and a robot at its heart
    ground(g, b, '#1C160C', '#100C06');
    g.strokeStyle = 'rgba(245,184,61,0.55)'; g.lineWidth = b.s * 0.004; for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { const [x, y] = at(b, (i + 0.5) / 6, (j + 0.5) / 6), r = b.s * 0.05; g.beginPath(); g.moveTo(x - r, y); g.lineTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.closePath(); g.stroke(); }
    const [cx, cy] = at(b, 0.5, 0.5); g.strokeStyle = '#3A3A3A'; g.lineWidth = b.s * 0.07; g.beginPath(); g.roundRect(cx - b.s * 0.32, cy - b.s * 0.32, b.s * 0.64, b.s * 0.64, b.s * 0.08); g.stroke();
    g.strokeStyle = '#F5B83D'; g.lineWidth = b.s * 0.006; g.setLineDash([b.s * 0.02, b.s * 0.02]); g.beginPath(); g.roundRect(cx - b.s * 0.32, cy - b.s * 0.32, b.s * 0.64, b.s * 0.64, b.s * 0.08); g.stroke(); g.setLineDash([]);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; rect(g, cx + Math.cos(a) * b.s * 0.3 - b.s * 0.02, cy + Math.sin(a) * b.s * 0.3 - b.s * 0.02, b.s * 0.04, b.s * 0.04, ['#C9A06A', '#D0D4DC'][k % 2]); }
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.fillStyle = '#F5B83D'; g.fillRect(cx + Math.cos(a) * b.s * 0.13 - b.s * 0.015, cy + Math.sin(a) * b.s * 0.13 - b.s * 0.015, b.s * 0.03, b.s * 0.03); } circ(g, cx, cy, b.s * 0.13, '#F5B83D'); circ(g, cx, cy, b.s * 0.08, '#1C160C'); emo(g, '🤖', cx, cy, b.s * 0.11);
  },
  banquet(g, b) { // a pastel palace on clouds: a giant tiered cake, tea tables and a chocolate river
    ground(g, b, '#FFF4F8', '#FFE0EE');
    for (let i = 0; i < 12; i++) { const [x, y] = at(b, b.r(), b.r() < 0.5 ? b.r() * 0.1 : 0.92 + b.r() * 0.08); circ(g, x, y, b.s * 0.06, 'rgba(255,255,255,0.95)'); }
    line(g, [at(b, 0, 0.8), at(b, 0.3, 0.72), at(b, 0.6, 0.82), at(b, 1, 0.74)], '#6B3A1E', b.s * 0.06);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) { g.globalAlpha = 0.35; rect(g, ...at(b, 0.1 + x * 0.1, 0.12 + y * 0.07), b.w * 0.1, b.h * 0.07, '#FFD6E6'); } g.globalAlpha = 1;
    const [cx, cy] = at(b, 0.5, 0.42); for (let k = 0; k < 4; k++) circ(g, cx, cy, b.s * (0.24 - k * 0.055), ['#FFFFFF', '#FFB8D8', '#FFF0A8', '#B8E8FF'][k]); for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; circ(g, cx + Math.cos(a) * b.s * 0.21, cy + Math.sin(a) * b.s * 0.21, b.s * 0.015, '#E04E6E'); } circ(g, cx, cy, b.s * 0.03, '#FFD23F');
    for (const [u, v] of [[0.15, 0.3], [0.85, 0.3], [0.2, 0.62], [0.8, 0.62]]) { circ(g, ...at(b, u, v), b.s * 0.05, '#FFFFFF'); emo(g, '🧁', ...at(b, u, v), b.s * 0.05); }
  },
  abyss(g, b) { // a void with a seven-point rune circle, rune stones circling and the great eye
    ground(g, b, '#0A0612', '#06020E');
    const [cx, cy] = at(b, 0.5, 0.5); g.shadowColor = '#7A2CFF'; g.shadowBlur = b.s * 0.03; g.strokeStyle = '#7A2CFF'; g.lineWidth = b.s * 0.008; g.beginPath(); g.arc(cx, cy, b.s * 0.42, 0, Math.PI * 2); g.stroke();
    g.beginPath(); for (let k = 0; k <= 7; k++) { const a = ((k * 3) / 7) * Math.PI * 2 - Math.PI / 2; const x = cx + Math.cos(a) * b.s * 0.42, y = cy + Math.sin(a) * b.s * 0.42; if (k) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); g.shadowBlur = 0;
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; rect(g, cx + Math.cos(a) * b.s * 0.47 - b.s * 0.02, cy + Math.sin(a) * b.s * 0.47 - b.s * 0.03, b.s * 0.04, b.s * 0.06, '#2A2036', b.s * 0.005); }
    ell(g, cx, cy, b.s * 0.16, b.s * 0.1, '#E8E0F0'); circ(g, cx, cy, b.s * 0.08, '#7A2CFF'); circ(g, cx, cy, b.s * 0.035, '#000000'); circ(g, cx - b.s * 0.02, cy - b.s * 0.02, b.s * 0.012, '#FFFFFF');
  },
  titans(g, b) { // a marble temple top: a colonnade square, four statues and three element braziers
    ground(g, b, '#E8E2D4', '#D0C8B4');
    g.strokeStyle = '#C9A64A'; g.lineWidth = b.s * 0.008; for (let k = 0; k < 3; k++) g.strokeRect(...at(b, 0.08 + k * 0.08, 0.08 + k * 0.08), b.w * (0.84 - k * 0.16), b.h * (0.84 - k * 0.16));
    for (let i = 0; i < 8; i++) for (const v of [0.05, 0.95]) { circ(g, ...at(b, 0.06 + i * 0.125, v), b.s * 0.025, '#F8F4EC'); circ(g, ...at(b, v, 0.06 + i * 0.125), b.s * 0.025, '#F8F4EC'); }
    for (const [u, v] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) { circ(g, ...at(b, u, v), b.s * 0.07, '#BFB8A8'); circ(g, ...at(b, u, v), b.s * 0.04, '#F8F4EC'); }
    const [cx, cy] = at(b, 0.5, 0.5); circ(g, cx, cy, b.s * 0.16, '#C9A64A'); [['#FF5A1F', -1], ['#3FA7FF', 0], ['#3DDC97', 1]].forEach(([c, k]) => { const x = cx + (k as number) * b.s * 0.08; circ(g, x, cy, b.s * 0.04, '#8A7A50'); const gr = g.createRadialGradient(x, cy, 1, x, cy, b.s * 0.05); gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(1, c as string); g.fillStyle = gr; g.beginPath(); g.arc(x, cy, b.s * 0.03, 0, Math.PI * 2); g.fill(); });
    emo(g, '⚡', cx, cy - b.s * 0.24, b.s * 0.08);
  },
};

export const hasTierScene = (k: PlotKind | null | undefined) => !!k && k in SCENES;

/** Paint the whole land's scene into [x0,x1]×[y0,y1] (tile pixels), clipped to the given plot squares. */
export function tierScene(g: G, kind: PlotKind, x0: number, y0: number, x1: number, y1: number, clip: [number, number, number][], seed: number, big: boolean, trim: string) {
  const paint = SCENES[kind];
  if (!paint || !clip.length) return;
  const w = x1 - x0, h = y1 - y0;
  g.save();
  g.beginPath(); for (const [px, py, cs] of clip) g.rect(px, py, cs, cs); g.clip();
  paint(g, { x: x0, y: y0, w, h, s: Math.min(w, h), big, r: rnd(seed) });
  // a vignette and the land's frame, so it reads as one place
  const vg = g.createRadialGradient(x0 + w / 2, y0 + h / 2, Math.min(w, h) * 0.35, x0 + w / 2, y0 + h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.28)'); g.fillStyle = vg; g.fillRect(x0, y0, w, h);
  g.restore();
  // the frame: one band in the place's colour round the outside, and a gold inner line for a Domain
  const s = Math.min(w, h), bw = Math.max(1.5, s * (big ? 0.022 : 0.028));
  g.save(); g.beginPath(); for (const [px, py, cs] of clip) g.rect(px, py, cs, cs); g.clip();
  g.strokeStyle = trim; g.lineWidth = bw * 2; g.strokeRect(x0, y0, w, h);
  if (big) { g.strokeStyle = '#FFD65A'; g.lineWidth = Math.max(1, s * 0.008); g.strokeRect(x0 + bw * 1.8, y0 + bw * 1.8, w - bw * 3.6, h - bw * 3.6); }
  g.restore();
}
