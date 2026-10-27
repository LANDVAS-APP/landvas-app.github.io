// Undo/redo with per-tile pixel snapshots and layer-structure snapshots.
// Memory is bounded: the oldest steps are dropped beyond the budget.
import { R, type Doc, type Layer, type Tile } from './doc';

type PixelSnap = { layer: Layer; key: string; before: ImageData | null; after: ImageData | null };
type Entry = {
  label: string;
  pixels: PixelSnap[];
  layersBefore?: LayerState;
  layersAfter?: LayerState;
  bytes: number;
};
type LayerState = { order: Layer[]; meta: Map<Layer, { name: string; opacity: number; visible: boolean }>; active: string };

const BUDGET = 180 * 1024 * 1024;

export class History {
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  private open: Entry | null = null;
  private touched = new Set<string>();
  onChange: () => void = () => {};

  constructor(private doc: Doc) {}

  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  get size() {
    return this.undoStack.length;
  }

  /** Begin a change. Call snapshotTile() before modifying any tile, then commit(). */
  begin(label: string, structural = false) {
    this.open = { label, pixels: [], bytes: 0, layersBefore: structural ? this.captureLayers() : undefined };
    this.touched.clear();
  }

  /** Capture a tile's pixels before its first modification in the open entry. */
  snapshotTile(layer: Layer, key: string, tile: Tile | null) {
    if (!this.open) return;
    const id = `${layer.id}|${key}`;
    if (this.touched.has(id)) return;
    this.touched.add(id);
    const before = tile ? tile.ctx.getImageData(0, 0, R, R) : null;
    this.open.pixels.push({ layer, key, before, after: null });
    this.open.bytes += before ? before.data.byteLength : 64;
  }

  commit() {
    const e = this.open;
    this.open = null;
    if (!e) return;
    if (e.layersBefore) e.layersAfter = this.captureLayers();
    if (!e.pixels.length && !e.layersBefore) return;
    this.undoStack.push(e);
    this.redoStack = [];
    this.enforceBudget();
    this.onChange();
  }

  cancel() {
    this.open = null;
  }

  undo() {
    const e = this.undoStack.pop();
    if (!e) return;
    for (const s of e.pixels) {
      const t = s.layer.tiles.get(s.key) ?? null;
      s.after = t ? t.ctx.getImageData(0, 0, R, R) : null;
      this.put(s.layer, s.key, s.before);
    }
    if (e.layersBefore) this.restoreLayers(e.layersBefore);
    this.redoStack.push(e);
    this.doc.touchAll();
    this.onChange();
  }

  redo() {
    const e = this.redoStack.pop();
    if (!e) return;
    if (e.layersAfter) this.restoreLayers(e.layersAfter);
    for (const s of e.pixels) this.put(s.layer, s.key, s.after);
    this.undoStack.push(e);
    this.doc.touchAll();
    this.onChange();
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.onChange();
  }

  private put(layer: Layer, key: string, data: ImageData | null) {
    if (!data) {
      layer.tiles.delete(key);
      return;
    }
    const t = this.doc.tile(layer, key, true)!;
    t.ctx.putImageData(data, 0, 0);
    t.dirty = true;
  }

  private captureLayers(): LayerState {
    return {
      order: [...this.doc.layers],
      meta: new Map(this.doc.layers.map((l) => [l, { name: l.name, opacity: l.opacity, visible: l.visible }])),
      active: this.doc.activeId,
    };
  }

  private restoreLayers(s: LayerState) {
    this.doc.layers = [...s.order];
    for (const [l, m] of s.meta) Object.assign(l, m);
    this.doc.activeId = s.active;
  }

  private enforceBudget() {
    let total = this.undoStack.reduce((sum, e) => sum + e.bytes, 0);
    while (total > BUDGET && this.undoStack.length > 1) total -= this.undoStack.shift()!.bytes;
    if (this.undoStack.length > 120) this.undoStack.splice(0, this.undoStack.length - 120);
  }
}
