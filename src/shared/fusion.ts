// Canvas Fusion geometry shared by the client, worker and tests.
// The server (SQL) is authoritative; these helpers power previews and layout.
import { GRID_SIZE, PLOT_PX, adjacent, cellKey, unwrapCells, wrapGx, type CellTuple } from './grid';

export function isConnected(cells: CellTuple[]): boolean {
  if (cells.length === 0) return false;
  return components(cells)[0].length === uniq(cells).length;
}

function uniq(cells: CellTuple[]): CellTuple[] {
  const seen = new Set<string>();
  const out: CellTuple[] = [];
  for (const c of cells) {
    const k = cellKey(c[0], c[1]);
    if (!seen.has(k)) {
      seen.add(k);
      out.push([wrapGx(c[0]), c[1]]);
    }
  }
  return out;
}

/** Connected components (cardinal adjacency with x-wrap), largest first. */
export function components(cells: CellTuple[]): CellTuple[][] {
  const list = uniq(cells);
  const index = new Map(list.map((c) => [cellKey(c[0], c[1]), c] as const));
  const seen = new Set<string>();
  const out: CellTuple[][] = [];
  for (const start of list) {
    const sk = cellKey(start[0], start[1]);
    if (seen.has(sk)) continue;
    const comp: CellTuple[] = [];
    const stack = [start];
    seen.add(sk);
    while (stack.length) {
      const c = stack.pop()!;
      comp.push(c);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n: CellTuple = [wrapGx(c[0] + dx), c[1] + dy];
        const k = cellKey(n[0], n[1]);
        if (!seen.has(k) && index.has(k)) {
          seen.add(k);
          stack.push(index.get(k)!);
        }
      }
    }
    out.push(comp);
  }
  return out.sort((a, b) => b.length - a.length);
}

export function canFuse(a: CellTuple[], b: CellTuple[]): boolean {
  for (const x of a) for (const y of b) if (adjacent({ gx: x[0], gy: x[1] }, { gx: y[0], gy: y[1] })) return true;
  return false;
}

/**
 * Layout of a canvas in "document pixels": the editor works on one continuous
 * surface whose origin is the unwrapped bounding-box corner. Because artwork is
 * keyed by absolute plot cells, expanding the canvas never moves existing art.
 */
export type CanvasLayout = {
  cells: { key: string; gx: number; gy: number; ugx: number; col: number; row: number; x: number; y: number }[];
  cols: number;
  rows: number;
  width: number;
  height: number;
  minGx: number;
  minGy: number;
  wrapped: boolean;
  byKey: Map<string, { col: number; row: number; x: number; y: number }>;
};

export function canvasLayout(cells: CellTuple[], plotPx = PLOT_PX): CanvasLayout {
  const u = unwrapCells(uniq(cells));
  const out: CanvasLayout['cells'] = u.cells.map(([ugx, gy]) => {
    const col = ugx - u.minGx;
    const row = gy - u.minGy;
    return { key: cellKey(ugx, gy), gx: wrapGx(ugx), gy, ugx, col, row, x: col * plotPx, y: row * plotPx };
  });
  return {
    cells: out,
    cols: u.width,
    rows: u.height,
    width: u.width * plotPx,
    height: u.height * plotPx,
    minGx: u.minGx,
    minGy: u.minGy,
    wrapped: u.wrapped,
    byKey: new Map(out.map((c) => [c.key, { col: c.col, row: c.row, x: c.x, y: c.y }])),
  };
}

/**
 * Outline segments of a cell set (edges not shared with another member), in
 * unwrapped grid units. Used to draw luminous canvas borders on the map.
 */
export function outlineEdges(cells: CellTuple[]): [[number, number], [number, number]][] {
  const u = unwrapCells(uniq(cells));
  const set = new Set(u.cells.map(([x, y]) => `${x},${y}`));
  const edges: [[number, number], [number, number]][] = [];
  for (const [x, y] of u.cells) {
    if (!set.has(`${x},${y - 1}`)) edges.push([[x, y], [x + 1, y]]);
    if (!set.has(`${x},${y + 1}`)) edges.push([[x, y + 1], [x + 1, y + 1]]);
    if (!set.has(`${x - 1},${y}`)) edges.push([[x, y], [x, y + 1]]);
    if (!set.has(`${x + 1},${y}`)) edges.push([[x + 1, y], [x + 1, y + 1]]);
  }
  return edges;
}

export const GRID_WRAP = GRID_SIZE;
