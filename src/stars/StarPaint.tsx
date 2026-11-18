// Painting a star: the whole star laid out flat (longitude across, latitude up), your own plots of it lit, everyone
// else's dimmed. Paint across your plots — strokes stay inside them — and watch the star turn with it beside you. Save,
// and once it's approved it shows on the star for everyone: in the preview, on the shell, and through the telescope
// from Earth. Own every plot of a star and paint them all, and it's a Painted Star.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Eraser, Focus, Hand, PaintBucket, Paintbrush, Redo2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { useOnboardedMe } from '../lib/queries';
import { cn } from '../lib/utils';
import { averageColor, blotCell, cellUv, fillCell, loadImage, shellCells, starSkin } from './skin';
import { cellCenter, dirToUv } from './goldberg';
import { StarGlobe } from './StarPreview';
import { useStarPlots } from './useStars';

const PALETTE = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF', '#8B6BFF', '#FF5CDB', '#FFFFFF', '#C9CED9', '#6B7280', '#1F2937', '#0B0B12',
  '#C81E45', '#D06A00', '#D9A900', '#14A36A', '#0B8AD1', '#4A2FD6', '#B026FF', '#8A5A2E', '#F4C6D6', '#9DE4FF', '#FFD2A1', '#22E3FF'];
// (the flat map's size: a star's plots get ~20 pixels across each on the stars most people own, up to the biggest the
// server takes; the sky and the preview draw it smaller)
const sizeFor = (cells: number) => (cells <= 252 ? 1024 : 2048);

export default function StarPaint() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = useOnboardedMe();
  const card = useQuery({ queryKey: ['star', id], queryFn: () => api.starCard(id), enabled: Number.isFinite(id) });
  const c = card.data ?? null;
  const plots = useStarPlots(c);
  const W = c ? sizeFor(c.cells) : 1024, H = W / 2;
  const view = useRef<HTMLCanvasElement>(null);
  const paint = useRef<HTMLCanvasElement | null>(null);
  const mask = useRef<HTMLCanvasElement | null>(null);
  const others = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<'brush' | 'eraser' | 'fill' | 'hand'>('brush');
  const [color, setColor] = useState('#FF4D6D');
  const [size, setSize] = useState(12);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const box = useRef<HTMLDivElement>(null);
  const outline = useRef<HTMLCanvasElement | null>(null);
  const [rev, setRev] = useState(0);
  const [saving, setSaving] = useState(false);
  const undo = useRef<ImageData[]>([]), redo = useRef<ImageData[]>([]);
  const myCells = useMemo(() => (plots.data ?? []).filter((p) => p[4]).map((p) => p[0]), [plots.data]);

  // the canvases: your painting, the mask of your plots, everyone else's star under it
  useEffect(() => {
    if (!c || !me || (c.cells <= 3242 && !plots.data)) return;
    let live = true;
    void (async () => {
      const mk = () => Object.assign(document.createElement('canvas'), { width: W, height: H });
      const p = mk(), m = mk();
      const mg = m.getContext('2d')!;
      mg.fillStyle = '#fff';
      const cells = shellCells(c.m);
      const by = cells ? new Map(cells.map((x) => [x.id, x])) : null;
      for (const id2 of myCells) { const cell = by?.get(id2); if (cell) fillCell(mg, cell, W, H); else blotCell(mg, c.m, id2, W, H); }
      // your painting so far
      try {
        const L = await api.starArtLayer(c.id, me.profile.id);
        if (L?.img) { const im = await loadImage(L.img); p.getContext('2d')!.drawImage(im, 0, 0, W, H); }
      } catch { /* a fresh start */ }
      // the rest of the star (others' plots and paintings), dimmed under yours
      const layers = await Promise.all(c.art.filter((a) => a.owner !== me.profile.id).slice(0, 24).map(async (a) => (await api.starArtLayer(c.id, a.owner).catch(() => null)) ?? a));
      const o = await starSkin(c.m, (plots.data ?? []).filter((x) => !x[4]), layers, W);
      if (!live) return;
      // the plots' outlines: everyone's faint, yours bright (so you can see where you can paint)
      const ol = mk();
      if (cells && cells.length <= 10242) {
        const og = ol.getContext('2d')!;
        og.lineWidth = Math.max(1, W / 1400);
        og.strokeStyle = 'rgba(127,168,255,0.22)';
        const mine = new Set(myCells);
        const draw = (cell: (typeof cells)[number]) => { for (const poly of cellUv(cell)) { og.beginPath(); poly.forEach(([u, v], i) => { const x = u * W, y = (1 - v) * H; if (i) og.lineTo(x, y); else og.moveTo(x, y); }); og.closePath(); og.stroke(); } };
        for (const cell of cells) if (!mine.has(cell.id)) draw(cell);
        og.strokeStyle = 'rgba(255,255,255,0.9)'; og.lineWidth = Math.max(1.5, W / 700);
        for (const cell of cells) if (mine.has(cell.id)) draw(cell);
      }
      if (!live) return;
      paint.current = p; mask.current = m; others.current = o; outline.current = ol;
      setReady(true); setRev((r) => r + 1);
      // start zoomed in on your own plots
      requestAnimationFrame(() => fit());
    })();
    return () => { live = false; };
  }, [c?.id, me?.profile.id, plots.data, W]); // eslint-disable-line react-hooks/exhaustive-deps

  // what's on screen: the others (dim), your plots' outline, your painting
  useEffect(() => {
    const v = view.current;
    if (!v || !ready || !paint.current || !mask.current) return;
    v.width = W; v.height = H;
    const g = v.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#05070f'; g.fillRect(0, 0, W, H);
    if (others.current) { g.globalAlpha = 0.45; g.drawImage(others.current, 0, 0); g.globalAlpha = 1; }
    // (your plots: a soft light where you can paint)
    g.globalAlpha = 0.16; g.drawImage(mask.current, 0, 0); g.globalAlpha = 1;
    g.drawImage(paint.current, 0, 0);
    if (outline.current) g.drawImage(outline.current, 0, 0);
  }, [ready, rev, W, H]);

  // the turning star beside you, with your painting on it (redrawn a moment after you stop)
  const [skin, setSkin] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      const s = Object.assign(document.createElement('canvas'), { width: W, height: H });
      const g = s.getContext('2d')!;
      if (others.current) g.drawImage(others.current, 0, 0);
      if (paint.current) g.drawImage(paint.current, 0, 0);
      setSkin(s);
    }, 400);
    return () => clearTimeout(t);
  }, [rev, ready, W, H]);

  // ---- painting ---------------------------------------------------------------------------------------------------
  const scratch = useMemo(() => (typeof document === 'undefined' ? null : Object.assign(document.createElement('canvas'), { width: W, height: H })), [W, H]);
  const stroke = useRef<{ last: [number, number] | null; pid: number } | null>(null);
  const toMap = (e: React.PointerEvent): [number, number] => {
    const r = view.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const snapshot = () => {
    const g = paint.current!.getContext('2d')!;
    undo.current.push(g.getImageData(0, 0, W, H));
    if (undo.current.length > 14) undo.current.shift();
    redo.current = [];
  };
  const stamp = (from: [number, number] | null, to: [number, number]) => {
    if (!paint.current || !mask.current || !scratch) return;
    const s = scratch.getContext('2d')!;
    s.clearRect(0, 0, W, H);
    s.globalCompositeOperation = 'source-over';
    s.strokeStyle = s.fillStyle = color;
    s.lineCap = s.lineJoin = 'round';
    // (the brush is the same size on screen at any zoom)
    s.lineWidth = Math.max(0.6, (size * W) / (zoomRef.current * Math.max(200, box.current?.clientWidth ?? 400)));
    s.beginPath();
    if (from) { s.moveTo(from[0], from[1]); s.lineTo(to[0], to[1]); s.stroke(); }
    else { s.arc(to[0], to[1], s.lineWidth / 2, 0, Math.PI * 2); s.fill(); }
    // (only inside your own plots)
    s.globalCompositeOperation = 'destination-in';
    s.drawImage(mask.current, 0, 0);
    const g = paint.current.getContext('2d')!;
    g.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    g.drawImage(scratch, 0, 0);
    g.globalCompositeOperation = 'source-over';
    setRev((r) => r + 1);
  };
  const fillAll = () => {
    if (!paint.current || !mask.current || !scratch) return;
    snapshot();
    const s = scratch.getContext('2d')!;
    s.clearRect(0, 0, W, H); s.globalCompositeOperation = 'source-over'; s.fillStyle = color; s.fillRect(0, 0, W, H);
    s.globalCompositeOperation = 'destination-in'; s.drawImage(mask.current, 0, 0);
    paint.current.getContext('2d')!.drawImage(scratch, 0, 0);
    setRev((r) => r + 1);
  };
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  /** fit the view to your plots (the box round them, a plot's margin round that) */
  const fit = () => {
    const bx = box.current;
    if (!bx || !c || !myCells.length) { setZoom(1); setPan({ x: 0, y: 0 }); return; }
    let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
    const us: number[] = [];
    for (const id2 of myCells) { const [u, v] = dirToUv(cellCenter(c.m, id2)); us.push(u); y0 = Math.min(y0, 1 - v); y1 = Math.max(y1, 1 - v); }
    // (across the map's seam: measure from the other side)
    const spread = Math.max(...us) - Math.min(...us);
    const uu = spread > 0.5 ? us.map((u) => (u < 0.5 ? u + 1 : u)) : us;
    x0 = Math.min(...uu); x1 = Math.max(...uu);
    const pad = (Math.PI / Math.max(1, c.m * 3.2)) / Math.PI; // (about a plot)
    x0 -= pad / 2; x1 += pad / 2; y0 -= pad; y1 += pad;
    const Wc = bx.clientWidth, Hc = bx.clientHeight;
    const z = Math.max(1, Math.min(32, Math.min(0.8 / Math.max(1e-4, x1 - x0), (0.8 * Hc) / Math.max(1e-4, (y1 - y0) * Wc / 2))));
    const cx = ((x0 + x1) / 2) % 1, cy = (y0 + y1) / 2;
    setZoom(z);
    setPan({ x: -z * (cx - 0.5) * Wc, y: -z * (cy - 0.5) * (Wc / 2) });
  };
  /** zoom about a point on screen (keeping what's under it there) */
  const zoomAt = (k: number, sx?: number, sy?: number) => {
    const bx = box.current;
    if (!bx) return;
    const r = bx.getBoundingClientRect();
    const ox = (sx ?? r.left + r.width / 2) - (r.left + r.width / 2), oy = (sy ?? r.top + r.height / 2) - (r.top + r.height / 2);
    const z0 = zoomRef.current, z1 = Math.max(1, Math.min(32, z0 * k)), f = z1 / z0;
    setZoom(z1);
    setPan((p) => (z1 <= 1 ? { x: 0, y: 0 } : { x: ox - (ox - p.x) * f, y: oy - (oy - p.y) * f }));
  };
  useEffect(() => {
    const bx = box.current;
    if (!bx) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); };
    bx.addEventListener('wheel', wheel, { passive: false });
    return () => bx.removeEventListener('wheel', wheel);
  }); // (re-bound each render: zoomAt reads the latest state)
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; x: number; y: number } | null>(null);
  const panning = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (!ready) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // two fingers: pinch to zoom and drag to move (whatever the tool), the stroke just begun undone
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      if (stroke.current) { stroke.current = null; doUndo(); }
      panning.current = null;
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return;
    }
    if (tool === 'hand') { (e.target as Element).setPointerCapture?.(e.pointerId); panning.current = { x: e.clientX, y: e.clientY }; return; }
    if (tool === 'fill') { fillAll(); return; }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    snapshot();
    const p = toMap(e);
    stroke.current = { last: p, pid: e.pointerId };
    stamp(null, p);
  };
  const onMove = (e: React.PointerEvent) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pc = pinch.current;
    if (pc && touches.current.size >= 2) {
      const [a, b] = [...touches.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      setPan((p) => ({ x: p.x + (mx - pc.x), y: p.y + (my - pc.y) }));
      if (pc.d > 10) zoomAt(d / pc.d, mx, my);
      pinch.current = { d, x: mx, y: my };
      return;
    }
    const pn = panning.current;
    if (pn) { const dx = e.clientX - pn.x, dy = e.clientY - pn.y; pn.x = e.clientX; pn.y = e.clientY; setPan((p) => ({ x: p.x + dx, y: p.y + dy })); return; }
    const s = stroke.current;
    if (!s || s.pid !== e.pointerId) return;
    const p = toMap(e);
    stamp(s.last, p);
    s.last = p;
  };
  const onUp = (e: React.PointerEvent) => { touches.current.delete(e.pointerId); if (touches.current.size < 2) pinch.current = null; stroke.current = null; panning.current = null; };
  const doUndo = () => { const d = undo.current.pop(); if (!d || !paint.current) return; const g = paint.current.getContext('2d')!; redo.current.push(g.getImageData(0, 0, W, H)); g.putImageData(d, 0, 0); setRev((r) => r + 1); };
  const doRedo = () => { const d = redo.current.pop(); if (!d || !paint.current) return; const g = paint.current.getContext('2d')!; undo.current.push(g.getImageData(0, 0, W, H)); g.putImageData(d, 0, 0); setRev((r) => r + 1); };

  const save = async () => {
    if (!c || !paint.current) return;
    setSaving(true);
    try {
      let img = paint.current.toDataURL('image/webp', 0.86);
      if (!img.startsWith('data:image/webp')) img = paint.current.toDataURL('image/png');
      const r = await api.starArtSave(c.id, img, W, H, averageColor(paint.current));
      toast.success(r.status === 'approved' ? 'Your painting is on the star ✨' : 'Saved — it shows for everyone once it’s approved', { description: r.status === 'approved' ? undefined : 'You see it straight away; others will soon.' });
      void qc.invalidateQueries({ queryKey: ['star', c.id] });
    } catch (e) { toast.error(toGameError(e).message); }
    finally { setSaving(false); }
  };

  if (!c) return <div className="fixed inset-0 grid place-items-center bg-[#05070f] text-white/70">Loading the star…</div>;
  const preview = c && skin ? { ...c } : c;
  return (
    <div className="fixed inset-0 flex flex-col bg-[#05070f] text-white" data-testid="star-paint">
      <div className="flex items-center gap-2 px-3 pb-2 pt-[max(10px,env(safe-area-inset-top,0px))]">
        <button className="grid h-10 w-10 place-items-center rounded-full bg-white/10" onClick={() => nav(-1)} aria-label="Back"><ChevronLeft className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[16px] font-black">Paint {c.name}</div>
          <div className="text-[11px] text-white/55">{myCells.length} of your plots · strokes stay inside them</div>
        </div>
        <button className="lv-btn on h-10 px-4" disabled={saving || !ready} onClick={() => void save()} data-testid="star-paint-save">{saving ? 'Saving…' : 'Save'}</button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={box} className="absolute inset-0 grid place-items-center overflow-hidden">
          <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} className="relative aspect-[2/1] w-full origin-center will-change-transform">
            <canvas ref={view} className={cn('h-full w-full touch-none rounded-lg', zoom > 4 ? '[image-rendering:pixelated]' : '[image-rendering:auto]')} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} data-testid="star-paint-canvas" />
          </div>
        </div>
        {preview && <div className="pointer-events-auto absolute bottom-3 right-3 h-32 w-32 overflow-hidden rounded-full border border-white/15 bg-black/40 shadow-2xl">
          <StarGlobe card={preview} plots={plots.data ?? null} skin={skin} className="h-full w-full" />
        </div>}
        {!ready && <div className="absolute inset-0 grid place-items-center text-sm text-white/60">Laying the star out flat…</div>}
      </div>
      <div className="grid gap-2 border-t border-white/10 px-3 pb-[max(10px,env(safe-area-inset-bottom,0px))] pt-2">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {([['brush', Paintbrush], ['eraser', Eraser], ['fill', PaintBucket], ['hand', Hand]] as const).map(([k, I]) => (
            <button key={k} className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full', tool === k ? 'bg-[#22E3FF] text-[#0b0b1e]' : 'bg-white/10')} onClick={() => setTool(k)} aria-label={k} data-testid={`star-tool-${k}`}><I className="h-[18px] w-[18px]" /></button>
          ))}
          <span className="mx-0.5 h-6 w-px shrink-0 bg-white/15" />
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10" onClick={doUndo} aria-label="Undo"><Undo2 className="h-4 w-4" /></button>
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10" onClick={doRedo} aria-label="Redo"><Redo2 className="h-4 w-4" /></button>
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10" onClick={() => zoomAt(0.5)} aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></button>
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10" onClick={() => zoomAt(2)} aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></button>
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10" onClick={fit} aria-label="Your plots" data-testid="star-paint-fit"><Focus className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="shrink-0 rounded-full border border-white/20" style={{ width: Math.max(6, Math.min(30, size)), height: Math.max(6, Math.min(30, size)), background: tool === 'eraser' ? 'transparent' : color }} />
          <input type="range" min={2} max={60} value={size} onChange={(e) => setSize(Number(e.target.value))} className="min-w-0 flex-1" aria-label="Brush size" />
          <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-white/50">×{zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)}</span>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {PALETTE.map((p) => <button key={p} className={cn('h-8 w-8 shrink-0 rounded-full border-2', color === p ? 'border-white' : 'border-transparent')} style={{ background: p }} onClick={() => { setColor(p); if (tool === 'eraser') setTool('brush'); }} aria-label={p} />)}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-10 shrink-0 rounded-full bg-transparent" aria-label="Any colour" />
        </div>
        {c.art.some((a) => a.mine && a.status === 'pending') && <div className="text-[11px] text-[#FFE28A]">Your last painting is waiting to be approved — others will see it soon.</div>}
        {c.art.some((a) => a.mine && a.status === 'rejected') && <div className="text-[11px] text-[#FF9DB0]">Your last painting wasn’t approved. Paint again and save.</div>}
      </div>
    </div>
  );
}
