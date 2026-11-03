// On-device autosave for the painting editor. Every few seconds the tiles you've changed since the last
// cloud save are kept in IndexedDB (only the tiles that changed since the previous snapshot are
// re-encoded), so a reload, crash or dead battery never loses strokes. After a cloud save the device copy
// is cleared. On opening a canvas, anything still on the device is put back.
import type { Doc, Layer } from './doc';

const DB = 'landvas-drafts', STORE = 'drafts', VERSION = 1;
export type LocalDraft = {
  project: string; base: string; title: string; saved_at: number; active_ms: number; imported: boolean;
  layers: { id: string; name: string; opacity: number; visible: boolean }[];
  tiles: { layer: string; key: string; png: Blob }[];
};

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, VERSION);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'project' }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => { dbp = null; rej(r.error); };
    });
  }
  return dbp;
}
const tx = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const d = await db();
  return new Promise((res, rej) => { const r = f(d.transaction(STORE, mode).objectStore(STORE)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
};
export const readLocalDraft = (project: string) => tx<LocalDraft | undefined>('readonly', (s) => s.get(project)).catch(() => undefined);
export const clearLocalDraft = (project: string) => tx('readwrite', (s) => s.delete(project)).catch(() => undefined);

const toPng = (c: HTMLCanvasElement) => new Promise<Blob | null>((r) => c.toBlob((b) => r(b), 'image/png'));

/** Keeps the device copy of one open canvas up to date. */
export class LocalDrafts {
  private cache = new Map<string, Blob>(); // `${layer}|${key}` → the last PNG kept for a tile
  private busy = false;
  constructor(private project: string) {}

  /** Write the unsaved tiles to the device. Cheap when little changed: only re-encodes tiles touched since last time. */
  async snapshot(doc: Doc, base: string, title: string) {
    if (this.busy) return; this.busy = true;
    try {
      const live = new Set<string>();
      for (const l of doc.layers) for (const [key, t] of l.tiles) {
        if (!t.dirty) continue;
        const id = `${l.id}|${key}`; live.add(id);
        if (t.local || !this.cache.has(id)) { t.local = false; const b = await toPng(t.canvas); if (b) this.cache.set(id, b); }
      }
      for (const id of [...this.cache.keys()]) if (!live.has(id)) this.cache.delete(id);
      const rec: LocalDraft = {
        project: this.project, base, title, saved_at: Date.now(), active_ms: Math.round(doc.activeMs), imported: doc.imported,
        layers: doc.layers.map((l) => ({ id: l.id, name: l.name, opacity: l.opacity, visible: l.visible })),
        tiles: [...this.cache].map(([id, png]) => { const i = id.indexOf('|'); return { layer: id.slice(0, i), key: id.slice(i + 1), png }; }),
      };
      await tx('readwrite', (s) => s.put(rec));
    } catch { /* private mode or storage full: the cloud autosave still runs */ }
    finally { this.busy = false; }
  }

  /** After a cloud save: nothing left that only the device has. */
  async cleared() { this.cache.clear(); await clearLocalDraft(this.project); }
}

/** Put a device copy back into a freshly loaded canvas. Returns how many plot tiles came back. */
export async function applyLocalDraft(doc: Doc, d: LocalDraft): Promise<number> {
  const byId = new Map(doc.layers.map((l) => [l.id, l]));
  const layers: Layer[] = [];
  for (const m of d.layers) {
    const l = byId.get(m.id) ?? { id: m.id, name: m.name, opacity: 1, visible: true, tiles: new Map() };
    l.name = m.name; l.opacity = m.opacity; l.visible = m.visible;
    layers.push(l);
  }
  if (!layers.length) return 0;
  doc.layers = layers;
  doc.activeId = layers[layers.length - 1].id;
  doc.activeMs = Math.max(doc.activeMs, d.active_ms || 0);
  doc.imported = doc.imported || d.imported;
  let n = 0;
  for (const t of d.tiles) {
    const l = doc.layer(t.layer); if (!l || !doc.byKey.has(t.key)) continue;
    try {
      const bmp = await createImageBitmap(t.png);
      const tile = doc.tile(l, t.key, true)!;
      tile.ctx.clearRect(0, 0, tile.canvas.width, tile.canvas.height);
      tile.ctx.drawImage(bmp, 0, 0); bmp.close?.();
      tile.dirty = true; tile.hash = null; tile.local = true; n++;
    } catch { /* skip a damaged tile */ }
  }
  doc.touchAll();
  return n;
}
