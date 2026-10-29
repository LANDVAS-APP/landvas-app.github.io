// Tiled artwork document for Canvas Fusion.
// ---------------------------------------------------------------------------
// A canvas group is edited as ONE continuous surface ("document pixels"), but
// every layer is stored as one 256x256 tile per member plot, keyed by the
// plot's absolute grid cell. Consequences:
//  * a brush stroke is rasterised into every tile it touches with the same
//    geometry, so it flows across plot borders without a seam;
//  * expanding a canvas only adds tiles — existing art never moves;
//  * irregular canvases cost memory only for the plots they contain;
//  * a published plot image is simply the composite of that cell's tiles.
import { canvasLayout, type CanvasLayout } from '../../shared/fusion';
import { PLOT_PX, type CellTuple } from '../../shared/grid';

export const R = PLOT_PX;

export type Tile = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; dirty: boolean; hash: string | null };
export type Layer = { id: string; name: string; opacity: number; visible: boolean; tiles: Map<string, Tile> };
export type CellInfo = { key: string; gx: number; gy: number; x: number; y: number };

export function makeCanvas(w = R, h = R) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function newTile(): Tile {
  const canvas = makeCanvas();
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
  return { canvas, ctx, dirty: true, hash: null };
}

let idCounter = 0;
export const newLayerId = () => `layer-${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export class Doc {
  layout: CanvasLayout;
  cells: CellInfo[];
  byKey: Map<string, CellInfo>;
  layers: Layer[] = [];
  activeId = '';
  width: number;
  height: number;
  /** cell keys whose composite must be rebuilt */
  dirtyComposite = new Set<string>();
  composite = new Map<string, HTMLCanvasElement>();
  revision = 0;
  /** an uploaded image was placed into the art (imported art doesn't earn the craft bonus) */
  imported = false;
  /** time spent actually painting on this canvas, across sessions (ms) */
  activeMs = 0;

  constructor(cells: CellTuple[]) {
    this.layout = canvasLayout(cells, R);
    this.cells = this.layout.cells.map((c) => ({ key: c.key, gx: c.gx, gy: c.gy, x: c.x, y: c.y }));
    this.byKey = new Map(this.cells.map((c) => [c.key, c]));
    this.width = this.layout.width;
    this.height = this.layout.height;
    for (const c of this.cells) this.dirtyComposite.add(c.key);
  }

  get active(): Layer {
    return this.layers.find((l) => l.id === this.activeId) ?? this.layers[this.layers.length - 1];
  }

  layer(id: string) {
    return this.layers.find((l) => l.id === id);
  }

  addLayer(name: string, index = this.layers.length, id = newLayerId()): Layer {
    const l: Layer = { id, name, opacity: 1, visible: true, tiles: new Map() };
    this.layers.splice(index, 0, l);
    this.activeId = l.id;
    this.touchAll();
    return l;
  }

  /** Get (optionally create) a layer tile for a member cell. */
  tile(layer: Layer, key: string, create: boolean): Tile | null {
    let t = layer.tiles.get(key) ?? null;
    if (!t && create && this.byKey.has(key)) {
      t = newTile();
      layer.tiles.set(key, t);
    }
    return t;
  }

  /** Member cells intersecting a document-space rectangle. */
  cellsIn(x0: number, y0: number, x1: number, y1: number): CellInfo[] {
    const out: CellInfo[] = [];
    const c0 = Math.floor(Math.max(0, x0) / R), c1 = Math.floor(Math.min(this.width - 1, x1) / R);
    const r0 = Math.floor(Math.max(0, y0) / R), r1 = Math.floor(Math.min(this.height - 1, y1) / R);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const cell = this.cellAtColRow(c, r);
        if (cell) out.push(cell);
      }
    return out;
  }

  private grid: (CellInfo | undefined)[] | null = null;
  cellAtColRow(col: number, row: number): CellInfo | undefined {
    if (!this.grid) {
      this.grid = new Array(this.layout.cols * this.layout.rows);
      for (const c of this.cells) this.grid[(c.y / R) * this.layout.cols + c.x / R] = c;
    }
    if (col < 0 || row < 0 || col >= this.layout.cols || row >= this.layout.rows) return undefined;
    return this.grid[row * this.layout.cols + col];
  }

  cellAt(x: number, y: number) {
    return this.cellAtColRow(Math.floor(x / R), Math.floor(y / R));
  }

  touch(key: string) {
    this.dirtyComposite.add(key);
    this.revision++;
  }
  touchAll() {
    for (const c of this.cells) this.dirtyComposite.add(c.key);
    this.revision++;
  }

  /** Rebuild the flattened composite of one cell (visible layers only). */
  compositeOf(key: string, override?: (layer: Layer, ctx: CanvasRenderingContext2D, cell: CellInfo) => boolean): HTMLCanvasElement {
    let c = this.composite.get(key);
    if (!c) {
      c = makeCanvas();
      this.composite.set(key, c);
    }
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, R, R);
    const cell = this.byKey.get(key)!;
    for (const l of this.layers) {
      if (!l.visible) continue;
      if (override && override(l, ctx, cell)) continue;
      const t = l.tiles.get(key);
      if (!t) continue;
      ctx.globalAlpha = l.opacity;
      ctx.drawImage(t.canvas, 0, 0);
    }
    ctx.globalAlpha = 1;
    return c;
  }

  /** Read a composite pixel (eyedropper). */
  samplePixel(x: number, y: number): [number, number, number, number] | null {
    const cell = this.cellAt(x, y);
    if (!cell) return null;
    const c = this.compositeOf(cell.key);
    const d = c.getContext('2d')!.getImageData(Math.floor(x - cell.x), Math.floor(y - cell.y), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }

  /** Flatten every member cell for publishing; transparent cells return null. */
  flattenCell(key: string): HTMLCanvasElement | null {
    const c = makeCanvas();
    const ctx = c.getContext('2d')!;
    let any = false;
    for (const l of this.layers) {
      if (!l.visible) continue;
      const t = l.tiles.get(key);
      if (!t) continue;
      ctx.globalAlpha = l.opacity;
      ctx.drawImage(t.canvas, 0, 0);
      any = true;
    }
    if (!any) return null;
    const data = ctx.getImageData(0, 0, R, R).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return c;
    return null;
  }

  memoryEstimateMB() {
    let tiles = 0;
    for (const l of this.layers) tiles += l.tiles.size;
    return Math.round(((tiles + this.composite.size) * R * R * 4) / 1048576);
  }
}

export function tileIsEmpty(t: Tile): boolean {
  const d = t.ctx.getImageData(0, 0, R, R).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false;
  return true;
}
