// Huge murals (hundreds to 10,000+ plots): too big to open in the brush editor at once,
// so this screen places an image across the whole canvas and publishes it, one plot at a
// time — nothing is held in memory but the image and the plot being worked on.
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ImagePlus, Layers, Maximize, Minimize, Send } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import type { Manifest, Publication, ProjectBundle } from '../backend/types';
import { invalidateGame } from '../lib/queries';
import { fmt, sha256Hex } from '../lib/utils';
import { canvasLayout } from '../shared/fusion';
import { PLOT_PX } from '../shared/grid';
import { Button, Field, Spinner, inputCls } from '../ui';

/** Above this many plots the brush editor would need too much memory; use this screen. */
export const EDITOR_MAX_PLOTS = 400;
const R = PLOT_PX;
const MAX_IMAGE_PX = 8192;

async function pool<T>(items: T[], n: number, fn: (t: T, i: number) => Promise<void>, stop: () => boolean) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length && !stop()) { const k = i++; await fn(items[k], k); }
  }));
}
const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode_failed'))), 'image/png'));

type Placement = { bmp: ImageBitmap; mode: 'fit' | 'fill' };

export function HugeMural({ bundle }: { bundle: ProjectBundle }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const layout = useMemo(() => canvasLayout(bundle.group.cells.map((c) => [c[0], c[1]] as [number, number]), R), [bundle]);
  const [place, setPlace] = useState<Placement | null>(null);
  const [mode, setMode] = useState<'fit' | 'fill'>('fill');
  const [keep, setKeep] = useState(false);
  const [step, setStep] = useState<{ label: string; done: number; total: number } | null>(null);
  const [version, setVersion] = useState<{ id: string; manifest: Manifest }>({ id: bundle.version.id, manifest: bundle.version.manifest });
  const [title, setTitle] = useState(bundle.project.title || 'My mural');
  const [rights, setRights] = useState(false);
  const [result, setResult] = useState<Publication | null>(null);
  const cancel = useRef(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const maxLayers = bundle.limits?.max_layers_hard ?? 32;
  const oldLayers = version.manifest.layers ?? [];
  const hasArt = oldLayers.some((l) => Object.keys(l.tiles ?? {}).length > 0);
  const canKeep = hasArt && oldLayers.length < maxLayers;
  const busy = !!step;

  // the mural's shape, with the image laid over it
  useEffect(() => {
    const c = preview.current;
    if (!c) return;
    const k = Math.min(420 / layout.width, 300 / layout.height);
    c.width = Math.max(1, Math.round(layout.width * k));
    c.height = Math.max(1, Math.round(layout.height * k));
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    g.save();
    g.beginPath();
    for (const cell of layout.cells) g.rect(cell.x * k, cell.y * k, Math.ceil(R * k), Math.ceil(R * k));
    g.fillStyle = '#ffffff';
    g.fill();
    g.clip();
    if (place) {
      const p = fitRect(place.bmp, layout.width, layout.height, mode);
      g.imageSmoothingQuality = 'high';
      g.drawImage(place.bmp, p.x * k, p.y * k, p.w * k, p.h * k);
    }
    g.restore();
    if (layout.cells.length <= 2500) {
      g.strokeStyle = 'rgba(11,18,48,0.12)';
      g.lineWidth = 1;
      for (const cell of layout.cells) g.strokeRect(cell.x * k + 0.5, cell.y * k + 0.5, R * k, R * k);
    }
  }, [layout, place, mode]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      const probe = await createImageBitmap(f);
      const s = Math.min(1, MAX_IMAGE_PX / Math.max(probe.width, probe.height));
      const bmp = s < 1 ? await createImageBitmap(f, { resizeWidth: Math.round(probe.width * s), resizeHeight: Math.round(probe.height * s), resizeQuality: 'high' }) : probe;
      if (bmp !== probe) probe.close();
      place?.bmp.close();
      setPlace({ bmp, mode });
    } catch {
      toast.error('That file could not be read as an image.');
    }
  };

  /** One plot of the image (or null where the image doesn't reach). */
  const imageTile = (cx: number, cy: number, tile: HTMLCanvasElement) => {
    if (!place) return false;
    const p = fitRect(place.bmp, layout.width, layout.height, mode);
    const x0 = Math.max(cx, p.x), y0 = Math.max(cy, p.y), x1 = Math.min(cx + R, p.x + p.w), y1 = Math.min(cy + R, p.y + p.h);
    if (x1 <= x0 || y1 <= y0) return false;
    const s = p.w / place.bmp.width;
    const g = tile.getContext('2d')!;
    g.clearRect(0, 0, R, R);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(place.bmp, (x0 - p.x) / s, (y0 - p.y) / s, (x1 - x0) / s, (y1 - y0) / s, x0 - cx, y0 - cy, x1 - x0, y1 - y0);
    return true;
  };

  const placeImage = async () => {
    if (!place) return;
    cancel.current = false;
    const owner = bundle.project.owner_id;
    const tiles: Record<string, string> = {};
    const uploaded = new Set<string>();
    const cells = layout.cells;
    setStep({ label: 'Cutting the image into plots', done: 0, total: cells.length });
    let done = 0;
    try {
      await pool(cells, 6, async (cell) => {
        const tile = document.createElement('canvas');
        tile.width = tile.height = R;
        if (imageTile(cell.x, cell.y, tile)) {
          const blob = await toBlob(tile);
          const hash = await sha256Hex(await blob.arrayBuffer());
          if (!uploaded.has(hash)) { uploaded.add(hash); await getBackend().uploadDraftTile(owner, hash, blob); }
          tiles[cell.key] = hash;
        }
        setStep({ label: 'Cutting the image into plots', done: ++done, total: cells.length });
      }, () => cancel.current);
      if (cancel.current) { toast('Stopped — nothing was changed.'); return; }
      const layer = { id: `layer-img${Date.now().toString(36)}`, name: 'Image', opacity: 1, visible: true, tiles };
      const manifest: Manifest = {
        layers: keep && canKeep ? [...oldLayers, layer] : [layer],
        imported: true,
        ...(version.manifest.active_ms ? { active_ms: version.manifest.active_ms } : {}),
      };
      setStep({ label: 'Saving the draft', done: cells.length, total: cells.length });
      const r = await api.saveDraft(bundle.project.id, version.id, manifest, title);
      setVersion({ id: r.version_id, manifest });
      toast.success(`Image placed across ${fmt(Object.keys(tiles).length)} plots — publish it when you’re ready.`);
    } catch (e) {
      toast.error(toGameError(e).message);
    } finally {
      setStep(null);
    }
  };

  const publishNow = async () => {
    cancel.current = false;
    const owner = bundle.project.owner_id;
    const cache = new Map<string, Promise<ImageBitmap | null>>();
    const tileImg = (hash: string) => {
      if (!cache.has(hash)) {
        if (cache.size > 64) cache.delete(cache.keys().next().value!);
        cache.set(hash, getBackend().downloadDraftTile(owner, hash).then((b) => (b ? createImageBitmap(b) : null)).catch(() => null));
      }
      return cache.get(hash)!;
    };
    try {
      setStep({ label: 'Preparing', done: 0, total: 1 });
      const req = await api.requestPublication(bundle.project.id, version.id, title.trim(), '', rights);
      const keys = req.cells.map(([gx, gy]) => `${gx}_${gy}`);
      let done = 0;
      setStep({ label: 'Uploading plots', done: 0, total: keys.length });
      await pool(keys, 4, async (key) => {
        const c = document.createElement('canvas');
        c.width = c.height = R;
        const g = c.getContext('2d')!;
        let any = false;
        for (const l of version.manifest.layers) {
          if (l.visible === false) continue;
          const h = l.tiles?.[key];
          if (!h) continue;
          const im = await tileImg(h);
          if (!im) continue;
          g.globalAlpha = l.opacity ?? 1;
          g.drawImage(im, 0, 0);
          any = true;
        }
        if (any) await getBackend().uploadSubmission(owner, req.publication_id, key, await toBlob(c));
        setStep({ label: 'Uploading plots', done: ++done, total: keys.length });
      }, () => cancel.current);
      if (cancel.current) { await api.cancelPublication(req.publication_id).catch(() => {}); toast('Publishing stopped.'); return; }
      setStep({ label: 'Rendering your mural on the map', done: 0, total: 0 });
      await api.submitPublication(req.publication_id);
      void getBackend().kickPipeline();
      const started = Date.now();
      for (;;) {
        const st = await api.publicationStatus(req.publication_id);
        if (['published', 'pending_review', 'rejected', 'failed', 'removed', 'cancelled'].includes(st.status) || Date.now() - started > 30 * 60_000) { setResult(st); break; }
        void getBackend().kickPipeline();
        await new Promise((r) => setTimeout(r, 1500));
      }
      invalidateGame(qc);
    } catch (e) {
      toast.error(toGameError(e).message);
    } finally {
      for (const p of cache.values()) void p.then((b) => b?.close());
      setStep(null);
    }
  };

  const tiled = version.manifest.layers.reduce((n, l) => n + Object.keys(l.tiles ?? {}).length, 0);
  return (
    <div className="h-full overflow-y-auto bg-bg" data-testid="huge-mural">
      <div className="gutter mx-auto grid max-w-5xl gap-6 py-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => nav(-1)} disabled={busy}><ArrowLeft className="h-4 w-4" /> Back</Button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-bold">{bundle.group.name}</h1>
            <p className="text-sm text-muted tnum">{fmt(layout.cells.length)} plots · {layout.cols}×{layout.rows} · {fmt(layout.width)}×{fmt(layout.height)} px</p>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
          <div className="glass grid content-start gap-3 rounded-[24px] p-4">
            <div className="flex items-center justify-center rounded-2xl bg-surface-2 p-3"><canvas ref={preview} className="max-w-full shadow-lg" /></div>
            <p className="text-xs text-muted">A mural this big is laid out plot by plot, so it opens here instead of the brush editor (which handles up to {EDITOR_MAX_PLOTS} plots at once). Detach or split off a smaller canvas to paint by hand.</p>
          </div>
          <div className="grid content-start gap-4">
            <div className="glass grid gap-3 rounded-[24px] p-4">
              <div className="font-display text-lg font-semibold">1 · Place an image</div>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line p-5 text-sm font-semibold hover:border-accent">
                <ImagePlus className="h-5 w-5 text-accent-2" /> {place ? `Image ${place.bmp.width}×${place.bmp.height} — choose another` : 'Choose an image'}
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} disabled={busy} data-testid="huge-file" />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={mode === 'fill' ? 'primary' : 'secondary'} onClick={() => setMode('fill')} disabled={busy}><Maximize className="h-4 w-4" /> Fill the mural</Button>
                <Button size="sm" variant={mode === 'fit' ? 'primary' : 'secondary'} onClick={() => setMode('fit')} disabled={busy}><Minimize className="h-4 w-4" /> Fit inside</Button>
              </div>
              {canKeep && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={keep} onChange={(e) => setKeep(e.target.checked)} disabled={busy} />
                  <Layers className="h-4 w-4 text-muted" /> Keep my current art underneath</label>
              )}
              <p className="text-[11px] text-faint">Without that, the image replaces the draft (earlier versions stay in history). Imported images don’t earn the craft bonus.</p>
              <Button variant="rainbow" disabled={!place || busy} onClick={() => void placeImage()} data-testid="huge-place">Place across {fmt(layout.cells.length)} plots</Button>
            </div>
            <div className="glass grid gap-3 rounded-[24px] p-4">
              <div className="font-display text-lg font-semibold">2 · Publish to the map</div>
              <Field label="Title" htmlFor="huge-title"><input id="huge-title" className={inputCls} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} disabled={busy} /></Field>
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface/60 p-3 text-[13px]">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={rights} onChange={(e) => setRights(e.target.checked)} disabled={busy} />
                <span>I created this artwork or have permission to publish it. It follows the Content Policy. I keep my copyright and grant LANDVAS a non-exclusive licence to display it in the game, its gallery and share cards.</span>
              </label>
              <Button variant="primary" disabled={!rights || !title.trim() || busy || tiled === 0} onClick={() => void publishNow()} data-testid="huge-publish"><Send className="h-4 w-4" /> Publish {fmt(layout.cells.length)} plots</Button>
              {tiled === 0 && <p className="text-[11px] text-faint">Place an image first.</p>}
            </div>
            {step && (
              <div className="glass grid gap-2 rounded-[24px] p-4" data-testid="huge-progress">
                <div className="flex items-center justify-between text-sm font-semibold"><span className="flex items-center gap-2"><Spinner /> {step.label}</span>{step.total > 1 && <span className="tnum text-muted">{fmt(step.done)}/{fmt(step.total)}</span>}</div>
                {step.total > 1 && <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-[width]" style={{ width: `${(step.done / step.total) * 100}%` }} /></div>}
                <Button size="sm" variant="ghost" onClick={() => { cancel.current = true; }}>Stop</Button>
              </div>
            )}
            {result && (
              <div className="glass grid gap-2 rounded-[24px] p-4 text-sm" data-testid="huge-result">
                <b>{result.status === 'published' ? 'Live on the map!' : result.status === 'pending_review' ? 'Sent for review — it goes live once approved.' : `Publishing ended: ${result.status}`}</b>
                {result.decision_reason && <p className="text-bad">{result.decision_reason}</p>}
                <Button size="sm" variant="secondary" onClick={() => nav('/world')}>See the map</Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function fitRect(bmp: { width: number; height: number }, W: number, H: number, mode: 'fit' | 'fill') {
  const s = mode === 'fit' ? Math.min(W / bmp.width, H / bmp.height) : Math.max(W / bmp.width, H / bmp.height);
  const w = bmp.width * s, h = bmp.height * s;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}
