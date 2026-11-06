// 🔌 Wire Puzzle: a board of wire tiles. Tap a tile to turn it. Get power from the battery to every bulb; each lit
// board scores (more for doing it fast) and a bigger one comes next. 60 seconds.
import { rng } from '../../home/party/kit';
import { sfx } from '../../arcade/sfx';
import { emoji, popText, useGame, type GameProps } from '../games';

// tile shapes as open sides (bit 0 up, 1 right, 2 down, 3 left)
const rot = (m: number, n: number) => { let x = m; for (let i = 0; i < ((n % 4) + 4) % 4; i++) x = ((x << 1) | (x >> 3)) & 15; return x; };
export function WirePuzzle({ seed, level, onEnd, onScore }: GameProps) {
  return useGame(() => {
    const r = rng(seed);
    let N = 4, tiles: { m: number; turn: number; bulb: boolean; src: boolean }[] = [], lit = new Set<number>(), score = 0, t0 = 0, boardT = 0, solved = 0, flash = 0, over = false;
    const pops: { x: number; y: number; t: string; life: number; c: string }[] = [];
    const make = () => {
      // a random spanning tree from the battery, then scramble the turns
      const n = N * N, open = new Array(n).fill(0), seen = new Set([0]), stack = [0];
      while (stack.length) {
        const c = stack[stack.length - 1], x = c % N, y = Math.floor(c / N);
        const opts = ([[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]] as const).filter(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < N && ny < N && !seen.has(ny * N + nx); });
        if (!opts.length) { stack.pop(); continue; }
        const [dx, dy, b] = opts[Math.floor(r() * opts.length)]; const m = (y + dy) * N + x + dx;
        open[c] |= 1 << b; open[m] |= 1 << ((b + 2) % 4); seen.add(m); stack.push(m);
      }
      tiles = open.map((m, i) => ({ m, turn: i === 0 ? 0 : Math.floor(r() * 4), bulb: i !== 0 && [1, 2, 4, 8].includes(m), src: i === 0 }));
      boardT = 0; check();
    };
    const check = () => {
      lit = new Set([0]); const q = [0];
      while (q.length) { const c = q.shift()!, x = c % N, y = Math.floor(c / N), m = rot(tiles[c].m, tiles[c].turn);
        ([[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]] as const).forEach(([dx, dy, b]) => { if (!(m & (1 << b))) return; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) return; const n = ny * N + nx; if (lit.has(n)) return; if (rot(tiles[n].m, tiles[n].turn) & (1 << ((b + 2) % 4))) { lit.add(n); q.push(n); } }); }
      return tiles.every((t, i) => !t.bulb || lit.has(i));
    };
    make();
    const lay = (w: number, h: number) => { const s = Math.min(w - 30, h - 220) / N; return { s, x0: (w - s * N) / 2, y0: 140 + (h - 220 - s * N) / 2 }; };
    let W = 0, H = 0;
    return {
      update(dt: number, t: number) { t0 = t; boardT += dt; if (flash > 0) { flash -= dt; if (flash <= 0) { N = Math.min(7, 4 + Math.floor((solved + Math.min(3, level / 8)) / 2)); make(); } } if (t >= 60) over = true; return over; },
      draw(g: CanvasRenderingContext2D, w: number, h: number) {
        W = w; H = h; const { s, x0, y0 } = lay(w, h);
        g.fillStyle = '#1E1A26'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#2C2636'; g.beginPath(); g.roundRect(x0 - 10, y0 - 10, s * N + 20, s * N + 20, 16); g.fill();
        tiles.forEach((tl, i) => {
          const cx = x0 + (i % N) * s + s / 2, cy = y0 + Math.floor(i / N) * s + s / 2, m = rot(tl.m, tl.turn), on = lit.has(i);
          g.fillStyle = flash > 0 ? '#3A4A2E' : '#3A3346'; g.beginPath(); g.roundRect(cx - s / 2 + 3, cy - s / 2 + 3, s - 6, s - 6, 10); g.fill();
          g.strokeStyle = on ? '#FFD23F' : '#6A6276'; g.lineWidth = s * 0.16; g.lineCap = 'round';
          ([[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]] as const).forEach(([dx, dy, b]) => { if (m & (1 << b)) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + dx * s / 2, cy + dy * s / 2); g.stroke(); } });
          if (on) { g.shadowColor = '#FFD23F'; g.shadowBlur = 10; }
          g.fillStyle = on ? '#FFD23F' : '#6A6276'; g.beginPath(); g.arc(cx, cy, s * 0.1, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
          if (tl.src) emoji(g, '🔋', cx, cy, s * 0.5); else if (tl.bulb) emoji(g, on ? '💡' : '🔘', cx, cy, s * 0.45);
        });
        popText(pops, g, 1 / 60);
        g.fillStyle = '#fff'; g.font = '800 16px ui-rounded, system-ui'; g.textAlign = 'center';
        g.fillText(`Board ${solved + 1} · ${Math.max(0, Math.ceil(60 - t0))}s`, w / 2, 112);
        g.font = '600 13px ui-rounded, system-ui'; g.fillStyle = 'rgba(255,255,255,0.65)'; g.fillText('Tap tiles to turn them · light every bulb 💡', w / 2, h - 30);
      },
      down(p: { x: number; y: number }) {
        if (flash > 0 || over) return; const { s, x0, y0 } = lay(W, H);
        const i = Math.floor((p.x - x0) / s), j = Math.floor((p.y - y0) / s); if (i < 0 || j < 0 || i >= N || j >= N) return;
        const k = j * N + i; if (tiles[k].src) return; tiles[k].turn = (tiles[k].turn + 1) % 4; sfx.tick();
        if (check()) { solved++; const pts = Math.round(N * N * 6 + Math.max(0, 30 - boardT) * 4); score += pts; flash = 0.8; sfx.perfect?.(3); pops.push({ x: W / 2, y: H / 2, t: `⚡ Lit! +${pts}`, life: 1.2, c: '#FFD23F' }); }
      },
      score: () => score,
    };
  }, onEnd, onScore);
}
