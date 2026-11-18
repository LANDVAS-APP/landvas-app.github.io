// Painting a star: the star laid out flat (longitude across, latitude up), your own plots of it lit, everyone else's
// dimmed. Paint across your plots — strokes stay inside them — tap a plot with the bucket to fill just it, or bring in a
// picture and lay it over your plots; ‹ › take you from one of your plots to the next. Watch the star turn with it
// beside you. Save, and once it's approved (if staff review paintings) it shows on the star for everyone: in the
// preview, on the shell, and through the telescope from Earth. Own every plot of a star and paint them all: a
// Painted Star.
//
// A small star is painted as one flat map of the whole star. A bigger one (a white star and up) has plots too small on
// that map, so you paint the part of it round your plots (the one you came from, and your plots near it) at
// a size where each plot is a good few dozen pixels across; that part is what's saved (star_art.rect).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Eraser, Focus, Hand, ImagePlus, PaintBucket, Paintbrush, Redo2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { useOnboardedMe } from '../lib/queries';
import { cn } from '../lib/utils';
import { averageColor, drawPart, fillCell, isWhole, loadImage, partCells, rectAround, shellCells, sizeForRect, starSkin, strokeCell, uvToXY, WHOLE, type UvRect } from './skin';
import { cellAngle, cellAt, cellCenter, dirToUv, uvToDir, type Cell } from './goldberg';
import { StarGlobe } from './StarPreview';
import { loadArtLayers, useMyStarPlots, useStarPlots } from './useStars';
import type { StarPlotRow } from './types';

const PALETTE = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF', '#8B6BFF', '#FF5CDB', '#FFFFFF', '#C9CED9', '#6B7280', '#1F2937', '#0B0B12',
  '#C81E45', '#D06A00', '#D9A900', '#14A36A', '#0B8AD1', '#4A2FD6', '#B026FF', '#8A5A2E', '#F4C6D6', '#9DE4FF', '#FFD2A1', '#22E3FF'];
// (the whole flat map's size for the smaller stars: a plot ~20+ pixels across up to a white star's 3,242)
const sizeFor = (cells: number) => (cells <= 252 ? 1024 : 2048);
type Place = { im: HTMLImageElement; x: number; y: number; s: number };

export default function StarPaint() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = useOnboardedMe();
  const [params] = useSearchParams();
  const card = useQuery({ queryKey: ['star', id], queryFn: () => api.starCard(id), enabled: Number.isFinite(id) });
  const c = card.data ?? null;
  const allQ = useStarPlots(c);
  const myQ = useMyStarPlots(c ? c.id : null, c?.mine ?? 0);
  const myRows: StarPlotRow[] = myQ.data ?? [];
  const myAll = useMemo(() => myRows.map((p) => p[0]), [myRows]);
  // (how sharp a big star's part is: stars.art.region_px pixels a plot, at most stars.art.max_w either way)
  const cfg = useQuery({ queryKey: ['star-reach'], queryFn: api.starReach, staleTime: 120_000 });
  const regionPx = cfg.data?.paint?.region_px ?? 40, maxW = Math.min(4096, cfg.data?.paint?.max_w ?? 2048);
  const cellParam = params.get('cell');

  // ---- what you're painting: the whole star, or (a big star) the part round your plots ------------------------------
  const region = useMemo(() => {
    if (!c || !myAll.length) return null;
    if (c.m < 18) return { rect: WHOLE, cells: myAll, W: sizeFor(c.cells), H: sizeFor(c.cells) / 2 };
    const want = Number(cellParam);
    const focus = myAll.includes(want) ? want : myAll[0];
    const f = cellCenter(c.m, focus);
    // (your plots near that one: as many as fit with each a good size)
    const maxAng = (maxW / regionPx) * 0.42 * cellAngle(c.m);
    const near = myAll.filter((x) => { const q = cellCenter(c.m, x); return Math.acos(Math.max(-1, Math.min(1, q[0] * f[0] + q[1] * f[1] + q[2] * f[2]))) <= maxAng; });
    const rect = rectAround(c.m, near, 2.5);
    if (isWhole(rect)) return { rect: WHOLE, cells: c.m <= 32 ? myAll : near, W: 2048, H: 1024 };
    const [W, H] = sizeForRect(c.m, rect, regionPx, maxW);
    return { rect, cells: near, W, H };
  }, [c?.id, c?.m, myAll, cellParam, regionPx, maxW]); // eslint-disable-line react-hooks/exhaustive-deps
  const rect = region?.rect ?? WHOLE;
  const W = region?.W ?? 1024, H = region?.H ?? 512;
  const myCells = region?.cells ?? [];
  const mine = useMemo(() => new Set(myCells), [myCells]);
  // the plots in view, with their outlines
  const cellMap = useMemo<Map<number, Cell> | null>(() => {
    if (!c || !region) return null;
    const all = c.m <= 32 ? shellCells(c.m) : null;
    return all ? new Map(all.map((x) => [x.id, x])) : partCells(c.m, rect, null);
  }, [c?.id, region]); // eslint-disable-line react-hooks/exhaustive-deps

  const view = useRef<HTMLCanvasElement>(null);
  const paint = useRef<HTMLCanvasElement | null>(null);
  const mask = useRef<HTMLCanvasElement | null>(null);
  const others = useRef<HTMLCanvasElement | null>(null);
  const outline = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<'brush' | 'eraser' | 'fill' | 'hand'>('brush');
  const [color, setColor] = useState('#FF4D6D');
  const [size, setSize] = useState(12);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const box = useRef<HTMLDivElement>(null);
  const [boxSize, setBoxSize] = useState({ w: 360, h: 300 });
  const [rev, setRev] = useState(0);
  const [saving, setSaving] = useState(false);
  const [elsewhere, setElsewhere] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [plotI, setPlotI] = useState(0);
  const undo = useRef<ImageData[]>([]), redo = useRef<ImageData[]>([]);
  const undoMax = W * H > 1_500_000 ? 6 : 14;
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const bx = box.current;
    if (!bx) return;
    const ro = new ResizeObserver(() => setBoxSize({ w: bx.clientWidth, h: bx.clientHeight }));
    ro.observe(bx);
    return () => ro.disconnect();
  }, []);
  // the canvas on screen at zoom 1: as big as fits
  const dispW = Math.max(50, Math.min(boxSize.w, boxSize.h * (W / H))), dispH = dispW * (H / W);

  // the canvases: your painting, the mask of your plots, everyone else's star under it, the plots' outlines
  useEffect(() => {
    if (!c || !me || !region || !cellMap || (c.claimed > myAll.length && !allQ.data && !allQ.isError)) return;
    let live = true;
    setReady(false);
    void (async () => {
      const mk = () => Object.assign(document.createElement('canvas'), { width: W, height: H });
      const p = mk(), m = mk();
      const mg = m.getContext('2d')!;
      mg.fillStyle = '#fff';
      for (const id2 of myCells) { const cell = cellMap.get(id2); if (cell) fillCell(mg, cell, W, H, rect); }
      // your painting so far (laid onto this part of the star)
      try {
        const L = await api.starArtLayer(c.id, me.profile.id);
        if (L?.img) {
          const im = await loadImage(L.img);
          drawPart(p.getContext('2d')!, im, L.rect ?? WHOLE, rect, W, H);
          // (a painting of another part of a big star is replaced by this one when you save)
          const lr = L.rect ?? WHOLE;
          setElsewhere(!isWhole(rect) && !isWhole(lr) && !overlaps(lr, rect));
        }
      } catch { /* a fresh start */ }
      // the rest of the star (others' plots and paintings), dimmed under yours
      let rest = (allQ.data ?? []).filter((x) => !x[4]);
      if (!isWhole(rect) && !allQ.data?.length && c.claimed > myAll.length) {
        try { rest = (await api.starPlotsOf(c.id, [...cellMap.keys()].slice(0, 4000))).plots.filter((x) => !x[4]); } catch { rest = []; }
      }
      const layers = (await loadArtLayers(c)).filter((a) => a.owner !== me.profile.id);
      const o = await starSkin(c.m, rest.filter((x) => cellMap.has(x[0])), layers, W, rect, H);
      if (!live) return;
      // the plots' outlines: everyone's faint, yours bright (so you can see where you can paint)
      const ol = mk();
      const og = ol.getContext('2d')!;
      og.lineWidth = Math.max(1, W / 1400);
      og.strokeStyle = 'rgba(127,168,255,0.22)';
      if (cellMap.size <= 12000) for (const cell of cellMap.values()) if (!mine.has(cell.id)) strokeCell(og, cell, W, H, rect);
      og.strokeStyle = 'rgba(255,255,255,0.95)'; og.lineWidth = Math.max(1.5, W / 700);
      for (const id2 of myCells) { const cell = cellMap.get(id2); if (cell) strokeCell(og, cell, W, H, rect); }
      paint.current = p; mask.current = m; others.current = o; outline.current = ol;
      undo.current = []; redo.current = [];
      setReady(true); setRev((r) => r + 1);
      // start zoomed in on your own plots
      requestAnimationFrame(() => fit());
    })();
    return () => { live = false; };
  }, [c?.id, me?.profile.id, region, cellMap, allQ.data, allQ.isError]); // eslint-disable-line react-hooks/exhaustive-deps

  // what's on screen: the others (dim), your plots (a soft light), your painting, a picture you're placing, the outlines
  const scratch2 = useMemo(() => (typeof document === 'undefined' ? null : Object.assign(document.createElement('canvas'), { width: W, height: H })), [W, H]);
  useEffect(() => {
    const v = view.current;
    if (!v || !ready || !paint.current || !mask.current) return;
    v.width = W; v.height = H;
    const g = v.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#05070f'; g.fillRect(0, 0, W, H);
    if (others.current) { g.globalAlpha = 0.45; g.drawImage(others.current, 0, 0); g.globalAlpha = 1; }
    g.globalAlpha = 0.16; g.drawImage(mask.current, 0, 0); g.globalAlpha = 1;
    g.drawImage(paint.current, 0, 0);
    if (place && scratch2) {
      const w = place.im.width * place.s, h = place.im.height * place.s;
      g.globalAlpha = 0.22; g.drawImage(place.im, place.x - w / 2, place.y - h / 2, w, h); g.globalAlpha = 1;
      const s = scratch2.getContext('2d')!;
      s.globalCompositeOperation = 'source-over'; s.clearRect(0, 0, W, H);
      s.drawImage(place.im, place.x - w / 2, place.y - h / 2, w, h);
      s.globalCompositeOperation = 'destination-in'; s.drawImage(mask.current, 0, 0); s.globalCompositeOperation = 'source-over';
      g.drawImage(scratch2, 0, 0);
      g.strokeStyle = '#22E3FF'; g.lineWidth = Math.max(1, W / 600); g.setLineDash([W / 120, W / 160]); g.strokeRect(place.x - w / 2, place.y - h / 2, w, h); g.setLineDash([]);
    }
    if (outline.current) g.drawImage(outline.current, 0, 0);
  }, [ready, rev, W, H, place, scratch2]);

  // the turning star beside you, with your painting on it (redrawn a moment after you stop)
  const [skin, setSkin] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!ready || !c) return;
    const t = setTimeout(() => {
      const sw = 1024, sh = 512;
      const s = Object.assign(document.createElement('canvas'), { width: sw, height: sh });
      const g = s.getContext('2d')!;
      if (others.current) drawPart(g, others.current, rect, WHOLE, sw, sh);
      if (paint.current) drawPart(g, paint.current, rect, WHOLE, sw, sh);
      setSkin(s);
    }, 400);
    return () => clearTimeout(t);
  }, [rev, ready, c?.id, rect]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- painting ---------------------------------------------------------------------------------------------------
  const scratch = useMemo(() => (typeof document === 'undefined' ? null : Object.assign(document.createElement('canvas'), { width: W, height: H })), [W, H]);
  const stroke = useRef<{ last: [number, number] | null; pid: number } | null>(null);
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  /** screen px → canvas px */
  const k2c = () => W / (dispW * zoomRef.current);
  const toMap = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = view.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const snapshot = () => {
    const g = paint.current!.getContext('2d')!;
    undo.current.push(g.getImageData(0, 0, W, H));
    if (undo.current.length > undoMax) undo.current.shift();
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
    s.lineWidth = Math.max(0.6, size * k2c());
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
  /** the plot under a point of the canvas */
  const cellUnder = (p: [number, number]): number | null => {
    if (!c) return null;
    const u = rect.u0 + (p[0] / W) * rect.du, v = rect.v0 + (1 - p[1] / H) * rect.dv;
    return cellAt(c.m, uvToDir(((u % 1) + 1) % 1, Math.max(0, Math.min(1, v))));
  };
  /** the bucket: fill the plot you tapped (all of your plots with "Fill all") */
  const fillPlot = (p: [number, number] | null) => {
    if (!paint.current || !mask.current || !scratch || !cellMap) return;
    const s = scratch.getContext('2d')!;
    s.clearRect(0, 0, W, H); s.globalCompositeOperation = 'source-over'; s.fillStyle = color;
    if (p) {
      const id2 = cellUnder(p);
      const cell = id2 != null && mine.has(id2) ? cellMap.get(id2) : null;
      if (!cell) { toast('That plot isn’t yours', { description: 'The bucket fills one of your own plots — tap inside a bright outline.' }); return; }
      snapshot(); fillCell(s, cell, W, H, rect);
    } else { snapshot(); s.fillRect(0, 0, W, H); }
    s.globalCompositeOperation = 'destination-in'; s.drawImage(mask.current, 0, 0); s.globalCompositeOperation = 'source-over';
    paint.current.getContext('2d')!.drawImage(scratch, 0, 0);
    setRev((r) => r + 1);
  };
  /** where your plots are on the canvas (their middles) */
  const plotXY = useMemo(() => {
    if (!c) return [] as [number, number][];
    const xy = uvToXY(rect, W, H);
    return myCells.map((id2) => { const [u, v] = dirToUv(cellCenter(c.m, id2)); return xy(u, v); });
  }, [c?.id, myCells, rect, W, H]); // eslint-disable-line react-hooks/exhaustive-deps
  /** zoom to a box of the canvas (x0…x1, y0…y1 in canvas px) */
  const zoomTo = (x0: number, x1: number, y0: number, y1: number, most = 32) => {
    const z = Math.max(1, Math.min(most, Math.min((0.8 * boxSize.w) / Math.max(1e-3, ((x1 - x0) / W) * dispW), (0.8 * boxSize.h) / Math.max(1e-3, ((y1 - y0) / H) * dispH))));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    setZoom(z);
    setPan({ x: -z * (cx / W - 0.5) * dispW, y: -z * (cy / H - 0.5) * dispH });
  };
  /** fit the view to your plots (the box round them, a plot's margin round that) */
  const fit = () => {
    if (!plotXY.length || !c) { setZoom(1); setPan({ x: 0, y: 0 }); return; }
    const pad = (cellAngle(c.m) / Math.PI) * (H / rect.dv) * 0.9;
    const xs = plotXY.map((p) => p[0]), ys = plotXY.map((p) => p[1]);
    zoomTo(Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad);
  };
  /** one of your plots, big in the middle */
  const toPlot = (k: number) => {
    if (!plotXY.length || !c) return;
    const i = ((plotI + k) % plotXY.length + plotXY.length) % plotXY.length;
    setPlotI(i);
    const [x, y] = plotXY[i], pad = (cellAngle(c.m) / Math.PI) * (H / rect.dv) * 1.1;
    zoomTo(x - pad, x + pad, y - pad, y + pad, 48);
  };
  /** zoom about a point on screen (keeping what's under it there) */
  const zoomAt = (k: number, sx?: number, sy?: number) => {
    const bx = box.current;
    if (!bx) return;
    const r = bx.getBoundingClientRect();
    const ox = (sx ?? r.left + r.width / 2) - (r.left + r.width / 2), oy = (sy ?? r.top + r.height / 2) - (r.top + r.height / 2);
    const z0 = zoomRef.current, z1 = Math.max(1, Math.min(48, z0 * k)), f = z1 / z0;
    setZoom(z1);
    setPan((p) => (z1 <= 1 ? { x: 0, y: 0 } : { x: ox - (ox - p.x) * f, y: oy - (oy - p.y) * f }));
  };
  useEffect(() => {
    const bx = box.current;
    if (!bx) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (place) { setPlace((p) => p && { ...p, s: p.s * Math.exp(-e.deltaY * 0.0015) }); return; }
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    bx.addEventListener('wheel', wheel, { passive: false });
    return () => bx.removeEventListener('wheel', wheel);
  }); // (re-bound each render: zoomAt reads the latest state)

  // ---- a picture: bring one in and lay it over your plots ------------------------------------------------------------
  const pickImage = async (f: File | null | undefined) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast.error('That isn’t a picture'); return; }
    if (f.size > 20 * 1024 * 1024) { toast.error('That picture is too big (20 MB at most)'); return; }
    const url = URL.createObjectURL(f);
    try {
      const im = await loadImage(url);
      // (covering your plots in view, to start with)
      const xs = plotXY.map((p) => p[0]), ys = plotXY.map((p) => p[1]);
      const pad = c ? (cellAngle(c.m) / Math.PI) * (H / rect.dv) * 0.6 : 0;
      const bw = xs.length ? Math.max(...xs) - Math.min(...xs) + pad * 2 : W, bh = ys.length ? Math.max(...ys) - Math.min(...ys) + pad * 2 : H;
      const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : W / 2, cy = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : H / 2;
      setPlace({ im, x: cx, y: cy, s: Math.max(bw / im.width, bh / im.height) });
      setTool('hand');
      toast('Drag the picture into place, pinch to size it, then Apply', { description: 'Only the parts over your plots are kept.' });
    } catch { toast.error('That picture wouldn’t open'); }
  };
  const applyPlace = () => {
    if (!place || !paint.current || !mask.current || !scratch) return;
    snapshot();
    const s = scratch.getContext('2d')!;
    const w = place.im.width * place.s, h = place.im.height * place.s;
    s.globalCompositeOperation = 'source-over'; s.clearRect(0, 0, W, H);
    s.drawImage(place.im, place.x - w / 2, place.y - h / 2, w, h);
    s.globalCompositeOperation = 'destination-in'; s.drawImage(mask.current, 0, 0); s.globalCompositeOperation = 'source-over';
    paint.current.getContext('2d')!.drawImage(scratch, 0, 0);
    setPlace(null); setTool('brush'); setRev((r) => r + 1);
  };

  // ---- pointers -----------------------------------------------------------------------------------------------------
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; x: number; y: number } | null>(null);
  const panning = useRef<{ x: number; y: number; moving?: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (!ready) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // two fingers: pinch to zoom and drag to move (whatever the tool; a picture you're placing: its size), the stroke just begun undone
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      if (stroke.current) { stroke.current = null; doUndo(); }
      panning.current = null;
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return;
    }
    if (place) { (e.target as Element).setPointerCapture?.(e.pointerId); panning.current = { x: e.clientX, y: e.clientY, moving: true }; return; }
    if (tool === 'hand') { (e.target as Element).setPointerCapture?.(e.pointerId); panning.current = { x: e.clientX, y: e.clientY }; return; }
    if (tool === 'fill') { fillPlot(toMap(e)); return; }
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
      if (place) { if (pc.d > 10) setPlace((p) => p && { ...p, s: p.s * (d / pc.d) }); }
      else { setPan((p) => ({ x: p.x + (mx - pc.x), y: p.y + (my - pc.y) })); if (pc.d > 10) zoomAt(d / pc.d, mx, my); }
      pinch.current = { d, x: mx, y: my };
      return;
    }
    const pn = panning.current;
    if (pn) {
      const dx = e.clientX - pn.x, dy = e.clientY - pn.y; pn.x = e.clientX; pn.y = e.clientY;
      if (pn.moving) { const k = k2c(); setPlace((p) => p && { ...p, x: p.x + dx * k, y: p.y + dy * k }); }
      else setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      return;
    }
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
      // (the smallest that's still sharp: webp, or png where webp isn't made)
      let img = paint.current.toDataURL('image/webp', 0.86);
      if (!img.startsWith('data:image/webp')) img = paint.current.toDataURL('image/png');
      const r = await api.starArtSave(c.id, img, W, H, averageColor(paint.current), isWhole(rect) ? null : rect);
      toast.success(r.status === 'approved' ? 'Your painting is on the star ✨' : 'Saved — it shows for everyone once it’s approved', { description: r.status === 'approved' ? undefined : 'You see it straight away; others will soon.' });
      setElsewhere(false);
      void qc.invalidateQueries({ queryKey: ['star', c.id] });
      void qc.invalidateQueries({ queryKey: ['my-stars'] });
    } catch (e) { toast.error(toGameError(e).message); }
    finally { setSaving(false); }
  };

  if (!c) return <div className="fixed inset-0 grid place-items-center bg-[#05070f] text-white/70">Loading the star…</div>;
  const none = !myQ.isLoading && !myAll.length;
  return (
    <div className="fixed inset-0 flex flex-col bg-[#05070f] text-white" data-testid="star-paint">
      <div className="flex items-center gap-2 px-3 pb-2 pt-[max(10px,env(safe-area-inset-top,0px))]">
        <button className="grid h-10 w-10 place-items-center rounded-full bg-white/10" onClick={() => nav(-1)} aria-label="Back"><ChevronLeft className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[16px] font-black">Paint {c.name}</div>
          <div className="truncate text-[11px] text-white/55" data-testid="star-paint-count">
            {!isWhole(rect) ? `${myCells.length} of your ${myAll.length} plots, up close` : `${myCells.length} of your plots`} · strokes stay inside them
          </div>
        </div>
        <button className="lv-btn on h-10 px-4" disabled={saving || !ready || !!place} onClick={() => void save()} data-testid="star-paint-save">{saving ? 'Saving…' : 'Save'}</button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={box} className="absolute inset-0 grid place-items-center overflow-hidden">
          <div style={{ width: dispW, height: dispH, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} className="relative origin-center will-change-transform">
            <canvas ref={view} className={cn('h-full w-full touch-none rounded-lg', zoom * (dispW / W) > 3 ? '[image-rendering:pixelated]' : '[image-rendering:auto]')} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} data-testid="star-paint-canvas" />
          </div>
        </div>
        <div className="pointer-events-auto absolute bottom-3 right-3 h-32 w-32 overflow-hidden rounded-full border border-white/15 bg-black/40 shadow-2xl">
          <StarGlobe card={c} plots={allQ.data ?? myRows} skin={skin} className="h-full w-full" />
        </div>
        {myAll.length > 1 && ready && !place && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-black/60 p-1" data-testid="star-paint-plots">
            <button className="grid h-9 w-9 place-items-center rounded-full bg-white/10" onClick={() => toPlot(-1)} aria-label="Your previous plot"><ChevronLeft className="h-4 w-4" /></button>
            <span className="px-1 text-[11.5px] font-black tabular-nums text-[#5CF2FF]">Plot {plotI + 1}/{myCells.length}</span>
            <button className="grid h-9 w-9 place-items-center rounded-full bg-white/10" onClick={() => toPlot(1)} aria-label="Your next plot" data-testid="star-paint-next"><ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
        {place && (
          <div className="absolute inset-x-3 top-3 z-10 mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-[#22E3FF]/40 bg-[#0A0D1C]/95 px-3 py-2 shadow-2xl" data-testid="star-paint-placing">
            <span className="min-w-0 flex-1 text-[12px] leading-snug text-white/75">Drag to move, pinch (or −/+) to size. Only what’s over your plots is kept.</span>
            <button className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-lg" onClick={() => setPlace((p) => p && { ...p, s: p.s / 1.15 })} aria-label="Smaller">−</button>
            <button className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-lg" onClick={() => setPlace((p) => p && { ...p, s: p.s * 1.15 })} aria-label="Bigger">+</button>
            <button className="rounded-full bg-white/10 px-3 py-2 text-[12px] font-bold" onClick={() => { setPlace(null); setTool('brush'); }}>Cancel</button>
            <button className="rounded-full bg-[#22E3FF] px-3 py-2 text-[12px] font-black text-[#0b0b1e]" onClick={applyPlace} data-testid="star-paint-apply">Apply</button>
          </div>
        )}
        {!ready && <div className="absolute inset-0 grid place-items-center px-8 text-center text-sm text-white/60">{none ? 'You don’t have plots on this star yet. Claim one, then paint it.' : 'Laying the star out flat…'}</div>}
      </div>
      <div className="grid gap-2 border-t border-white/10 px-3 pb-[max(10px,env(safe-area-inset-bottom,0px))] pt-2">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {([['brush', Paintbrush, 'Brush'], ['eraser', Eraser, 'Eraser'], ['fill', PaintBucket, 'Fill a plot'], ['hand', Hand, 'Move']] as const).map(([k, I, l]) => (
            <button key={k} className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full', tool === k ? 'bg-[#22E3FF] text-[#0b0b1e]' : 'bg-white/10')} onClick={() => setTool(k)} aria-label={l} title={l} data-testid={`star-tool-${k}`}><I className="h-[18px] w-[18px]" /></button>
          ))}
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10" onClick={() => fileRef.current?.click()} aria-label="Bring in a picture" title="Bring in a picture" data-testid="star-paint-upload"><ImagePlus className="h-[18px] w-[18px]" /></button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = ''; }} data-testid="star-paint-file" />
          <span className="mx-0.5 h-6 w-px shrink-0 bg-white/15" />
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10" onClick={doUndo} aria-label="Undo"><Undo2 className="h-4 w-4" /></button>
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10" onClick={doRedo} aria-label="Redo"><Redo2 className="h-4 w-4" /></button>
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10" onClick={() => zoomAt(0.5)} aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></button>
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10" onClick={() => zoomAt(2)} aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></button>
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10" onClick={fit} aria-label="All your plots" data-testid="star-paint-fit"><Focus className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-2.5">
          {tool === 'fill' ? (
            <>
              <span className="min-w-0 flex-1 text-[11.5px] text-white/60">Tap one of your plots to fill it.</span>
              <button className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-[11.5px] font-bold" onClick={() => fillPlot(null)} data-testid="star-paint-fill-all">Fill all of them</button>
            </>
          ) : (
            <>
              <span className="shrink-0 rounded-full border border-white/20" style={{ width: Math.max(6, Math.min(30, size)), height: Math.max(6, Math.min(30, size)), background: tool === 'eraser' ? 'transparent' : color }} />
              <input type="range" min={2} max={80} value={size} onChange={(e) => setSize(Number(e.target.value))} className="min-w-0 flex-1" aria-label="Brush size" />
            </>
          )}
          <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-white/50">×{zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)}</span>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {PALETTE.map((p) => <button key={p} className={cn('h-8 w-8 shrink-0 rounded-full border-2', color === p ? 'border-white' : 'border-transparent')} style={{ background: p }} onClick={() => { setColor(p); if (tool === 'eraser' || tool === 'hand') setTool('brush'); }} aria-label={p} />)}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-10 shrink-0 rounded-full bg-transparent" aria-label="Any colour" />
        </div>
        {elsewhere && <div className="text-[11px] text-[#FFE28A]">On a star this big a painting covers one part of it: saving here replaces your painting of another part.</div>}
        {c.art.some((a) => a.mine && a.status === 'pending') && <div className="text-[11px] text-[#FFE28A]">Your last painting is waiting to be approved — others will see it soon.</div>}
        {c.art.some((a) => a.mine && a.status === 'rejected') && <div className="text-[11px] text-[#FF9DB0]">Your last painting wasn’t approved. Paint again and save.</div>}
      </div>
    </div>
  );
}

/** whether two parts of the map overlap */
function overlaps(a: UvRect, b: UvRect) {
  if (a.du >= 1 || b.du >= 1) return a.v0 < b.v0 + b.dv && b.v0 < a.v0 + a.dv;
  const du = ((b.u0 - a.u0) % 1 + 1) % 1;
  const uo = du < a.du || du + b.du > 1;
  return uo && a.v0 < b.v0 + b.dv && b.v0 < a.v0 + a.dv;
}
