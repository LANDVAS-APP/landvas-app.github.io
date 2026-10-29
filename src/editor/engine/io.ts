// Loading, saving and publishing artwork documents.
import { api } from '../../backend/api';
import { getBackend } from '../../backend/backend';
import type { Manifest, ProjectBundle, Publication } from '../../backend/types';
import { Doc, R, tileIsEmpty } from './doc';
import { sha256Hex } from '../../lib/utils';

const toBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), 'image/png'));

export { sha256Hex };

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/** Build a document from the current version of a project (downloads draft tiles). */
export async function loadDoc(bundle: ProjectBundle, onProgress?: (done: number, total: number) => void) {
  const doc = new Doc(bundle.group.cells.map((c) => [c[0], c[1]] as [number, number]));
  const owner = bundle.project.owner_id;
  const jobs: { layerId: string; key: string; hash: string }[] = [];
  for (const ml of bundle.version.manifest.layers) {
    const l = doc.addLayer(ml.name, doc.layers.length, ml.id);
    l.opacity = ml.opacity ?? 1;
    l.visible = ml.visible ?? true;
    for (const [key, hash] of Object.entries(ml.tiles ?? {})) if (doc.byKey.has(key)) jobs.push({ layerId: l.id, key, hash });
  }
  if (!doc.layers.length) doc.addLayer('Layer 1');
  doc.imported = !!(bundle.version.manifest as { imported?: boolean }).imported;
  doc.activeMs = Math.max(0, Number((bundle.version.manifest as { active_ms?: number }).active_ms) || 0);
  let done = 0;
  let missing = 0;
  await pool(jobs, 6, async (j) => {
    const blob = await getBackend().downloadDraftTile(owner, j.hash);
    if (blob) {
      const bmp = await createImageBitmap(blob);
      const t = doc.tile(doc.layer(j.layerId)!, j.key, true)!;
      t.ctx.drawImage(bmp, 0, 0);
      bmp.close?.();
      t.hash = j.hash;
      t.dirty = false;
    } else missing++;
    onProgress?.(++done, jobs.length);
  });
  doc.activeId = doc.layers[doc.layers.length - 1].id;
  doc.touchAll();
  return { doc, missing };
}

/** Upload changed tiles (content-addressed) and return the manifest. */
export async function saveTiles(doc: Doc, ownerId: string, onProgress?: (done: number, total: number) => void): Promise<Manifest> {
  const work: { layer: (typeof doc.layers)[number]; key: string }[] = [];
  for (const l of doc.layers) for (const [key, t] of l.tiles) if (t.dirty || !t.hash) work.push({ layer: l, key });
  let done = 0;
  await pool(work, 4, async ({ layer, key }) => {
    const t = layer.tiles.get(key);
    if (!t) return;
    if (tileIsEmpty(t)) {
      layer.tiles.delete(key);
    } else {
      const blob = await toBlob(t.canvas);
      const hash = await sha256Hex(await blob.arrayBuffer());
      await getBackend().uploadDraftTile(ownerId, hash, blob);
      t.hash = hash;
      t.dirty = false;
    }
    onProgress?.(++done, work.length);
  });
  return {
    ...(doc.imported ? { imported: true } : {}),
    active_ms: Math.round(doc.activeMs),
    layers: doc.layers.map((l) => ({
      id: l.id, name: l.name, opacity: Math.round(l.opacity * 100) / 100, visible: l.visible,
      tiles: Object.fromEntries([...l.tiles].filter(([, t]) => t.hash).map(([k, t]) => [k, t.hash!])),
    })),
  };
}

export type PublishStep = 'saving' | 'preparing' | 'uploading' | 'submitting' | 'processing' | 'done';

/**
 * Publish: save → request a publication → upload one flattened 256px image per
 * plot → submit → wait for the server pipeline (validation, moderation, tiles).
 */
export async function publish(
  doc: Doc,
  ctx: { projectId: string; ownerId: string; versionId: string },
  meta: { title: string; description: string; rights: boolean },
  onStep: (step: PublishStep, detail?: string) => void,
): Promise<Publication> {
  onStep('preparing');
  const req = await api.requestPublication(ctx.projectId, ctx.versionId, meta.title, meta.description, meta.rights);
  const cells = req.cells.map(([gx, gy]) => `${gx}_${gy}`);
  let done = 0;
  onStep('uploading', `0/${cells.length}`);
  await pool(cells, 4, async (key) => {
    const flat = doc.flattenCell(key);
    if (flat) await getBackend().uploadSubmission(ctx.ownerId, req.publication_id, key, await toBlob(flat));
    onStep('uploading', `${++done}/${cells.length}`);
  });
  onStep('submitting');
  await api.submitPublication(req.publication_id);
  onStep('processing');
  void getBackend().kickPipeline();
  const started = Date.now();
  for (;;) {
    const st = await api.publicationStatus(req.publication_id);
    if (['published', 'pending_review', 'rejected', 'failed', 'removed', 'cancelled'].includes(st.status)) {
      onStep('done');
      return st;
    }
    // big murals are rendered in several short server runs; keep nudging the pipeline
    void getBackend().kickPipeline();
    if (Date.now() - started > 8 * 60_000) {
      onStep('done');
      return st;
    }
    await new Promise((r) => setTimeout(r, 900));
  }
}

export const PLOT_RES = R;
