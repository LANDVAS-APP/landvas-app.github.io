// LANDVAS canvas editor engine.
// One continuous drawing surface over a fused canvas group, rendered from
// per-plot tiles (see doc.ts). Handles tools, pointer/touch/stylus input,
// gestures, symmetry, layers, undo/redo, image placement and rendering.
import { BRUSHES, brushTip, symmetryPoints, type BrushDef, type BrushId, type SymmetryMode } from './brush';
import { Doc, R, makeCanvas, newLayerId, type CellInfo, type Layer } from './doc';
import { dilate, floodFill } from './fill';
import { History } from './history';

export type ToolId = 'brush' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'ellipse' | 'gradient' | 'move' | 'hand';
type Pt = { x: number; y: number; p: number };
export type Placement = { src: CanvasImageSource & { width: number; height: number }; x: number; y: number; scale: number; rotation: number; flipX: boolean };

export type EditorSettings = {
  tool: ToolId;
  brush: BrushId;
  color: string;
  color2: string;
  sizes: Partial<Record<BrushId, number>>;
  opacity: number;
  hardness: number | null;
  smoothing: number;
  symmetry: SymmetryMode;
  showGrid: boolean;
  snap: boolean;
  shapeFill: boolean;
  tolerance: number;
  sampleAll: boolean;
  gradientOnPaint: boolean;
};

const DEFAULTS: EditorSettings = {
  tool: 'brush', brush: 'round', color: '#FF4D6D', color2: '#22E3FF', sizes: {}, opacity: 1, hardness: null, smoothing: 0.35,
  symmetry: 'off', showGrid: true, snap: false, shapeFill: false, tolerance: 18, sampleAll: false, gradientOnPaint: false,
};

export class Editor {
  doc: Doc;
  history: History;
  s: EditorSettings;
  scale = 1;
  ox = 0;
  oy = 0;
  dirty = false;
  maxLayers = 6;
  placement: Placement | null = null;
  compare: { tiles: Map<string, ImageBitmap>; split: number } | null = null;
  unlocked = new Set<string>();

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private raf = 0;
  private needs = true;
  private listeners = new Set<() => void>();
  private version = 0;
  private pointers = new Map<number, { x: number; y: number; type: string }>();
  private gesture: { d0: number; s0: number; mx: number; my: number; dx: number; dy: number } | null = null;
  private panning: { x: number; y: number } | null = null;
  private space = false;
  private penSeen = false;
  private hover: { x: number; y: number } | null = null;
  private stroke: {
    buffer: Map<string, HTMLCanvasElement>; last: Pt; smooth: Pt; rem: number; def: BrushDef; size: number; color: string;
    erase: boolean; started: number; layer: Layer; moved: number;
  } | null = null;
  private drag: { start: Pt; end: Pt; tool: ToolId; layer: Layer } | null = null;
  private moveOffset: { dx: number; dy: number } | null = null;
  private placeDrag: { mode: 'move' | 'scale' | 'rotate'; sx: number; sy: number; p0: Placement } | null = null;
  private checker: CanvasPattern | null = null;
  private hatch: CanvasPattern | null = null;
  private scratch = makeCanvas();
  private ro: ResizeObserver;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, doc: Doc, settings?: Partial<EditorSettings>) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.doc = doc;
    this.history = new History(doc);
    this.history.onChange = () => this.emit();
    this.s = { ...DEFAULTS, ...settings };
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.fit();
    this.loop();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  // ---- state & subscriptions ------------------------------------------------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  emit() {
    this.version++;
    this.needs = true;
    this.listeners.forEach((f) => f());
  }
  set(p: Partial<EditorSettings>) {
    Object.assign(this.s, p);
    this.emit();
  }
  get brushDef(): BrushDef {
    return this.s.tool === 'eraser' ? BRUSHES.eraser : BRUSHES[this.s.brush];
  }
  get size(): number {
    const id: BrushId = this.s.tool === 'eraser' ? 'eraser' : this.s.brush;
    return this.s.sizes[id] ?? BRUSHES[id].defaultSize;
  }
  setSize(v: number) {
    const id: BrushId = this.s.tool === 'eraser' ? 'eraser' : this.s.brush;
    const def = BRUSHES[id];
    this.s.sizes[id] = Math.max(1, Math.min(def.maxSize, id === 'pixel' ? Math.round(v) : v));
    this.emit();
  }
  markChanged() {
    this.dirty = true;
    this.emit();
  }
  requestRender() {
    this.needs = true;
  }

  // ---- view -------------------------------------------------------------------------
  private resize() {
    const host = this.canvas.parentElement ?? this.canvas;
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const w = host.clientWidth, h = host.clientHeight;
    this.canvas.width = Math.max(1, Math.round(w * this.dpr));
    this.canvas.height = Math.max(1, Math.round(h * this.dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.needs = true;
  }
  get viewW() {
    return this.canvas.width / this.dpr;
  }
  get viewH() {
    return this.canvas.height / this.dpr;
  }
  fit() {
    const pad = 32;
    this.scale = Math.min((this.viewW - pad * 2) / this.doc.width, (this.viewH - pad * 2) / this.doc.height);
    this.scale = Math.max(0.05, Math.min(this.scale, 6));
    this.ox = (this.viewW - this.doc.width * this.scale) / 2;
    this.oy = (this.viewH - this.doc.height * this.scale) / 2;
    this.emit();
  }
  zoomAt(factor: number, sx = this.viewW / 2, sy = this.viewH / 2) {
    const ns = Math.max(0.05, Math.min(64, this.scale * factor));
    const dx = (sx - this.ox) / this.scale, dy = (sy - this.oy) / this.scale;
    this.scale = ns;
    this.ox = sx - dx * ns;
    this.oy = sy - dy * ns;
    this.emit();
  }
  toDoc(sx: number, sy: number) {
    return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale };
  }

  // ---- input ----------------------------------------------------------------------------
  private local(e: PointerEvent | WheelEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  private pressure(e: PointerEvent) {
    if (e.pointerType === 'pen') return Math.max(0.05, e.pressure || 0.5);
    return 1;
  }

  private onDown = (e: PointerEvent) => {
    if (this.disposed) return;
    this.canvas.setPointerCapture(e.pointerId);
    const l = this.local(e);
    if (e.pointerType === 'pen') this.penSeen = true;
    this.pointers.set(e.pointerId, { x: l.x, y: l.y, type: e.pointerType });
    const touches = [...this.pointers.values()].filter((p) => p.type === 'touch');
    if (touches.length >= 2 || (this.penSeen && e.pointerType === 'touch' && touches.length >= 1 && this.pointers.size >= 2)) {
      // second finger: abort a just-started stroke and begin pinch/pan
      if (this.stroke && (performance.now() - this.stroke.started < 260 || this.stroke.moved < 6)) this.cancelStroke();
      else if (this.stroke) this.endStroke();
      this.drag = null;
      this.startGesture();
      return;
    }
    if (this.penSeen && e.pointerType === 'touch') {
      // palm rejection: with a stylus in use, single touches pan instead of painting
      this.panning = { x: l.x, y: l.y };
      return;
    }
    if (e.button === 1 || e.button === 2 || this.space || this.s.tool === 'hand') {
      this.panning = { x: l.x, y: l.y };
      return;
    }
    const d = this.toDoc(l.x, l.y);
    const pt: Pt = { x: d.x, y: d.y, p: this.pressure(e) };
    if (this.placement) return this.placeDown(l.x, l.y);
    if (e.altKey && (this.s.tool === 'brush' || this.s.tool === 'fill')) return this.pick(d.x, d.y);
    switch (this.s.tool) {
      case 'brush':
      case 'eraser':
        return this.beginStroke(pt);
      case 'fill':
        return this.applyFill(d.x, d.y);
      case 'eyedropper':
        return this.pick(d.x, d.y);
      case 'line':
      case 'rect':
      case 'ellipse':
      case 'gradient':
      case 'move':
        this.drag = { start: this.snapPt(pt), end: this.snapPt(pt), tool: this.s.tool, layer: this.doc.active };
        if (this.s.tool === 'move') this.moveOffset = { dx: 0, dy: 0 };
        this.needs = true;
        return;
    }
  };

  private onMove = (e: PointerEvent) => {
    const l = this.local(e);
    const prev = this.pointers.get(e.pointerId);
    if (prev) {
      prev.x = l.x;
      prev.y = l.y;
    }
    if (this.gesture) return this.updateGesture();
    if (this.panning) {
      this.ox += l.x - this.panning.x;
      this.oy += l.y - this.panning.y;
      this.panning = { x: l.x, y: l.y };
      this.needs = true;
      return;
    }
    if (this.placeDrag) return this.placeMove(l.x, l.y, e.shiftKey);
    if (this.stroke) {
      const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
      for (const ce of evs.length ? evs : [e]) {
        const cl = this.local(ce);
        const d = this.toDoc(cl.x, cl.y);
        this.strokeTo({ x: d.x, y: d.y, p: this.pressure(ce) });
      }
      return;
    }
    if (this.drag) {
      const d = this.toDoc(l.x, l.y);
      let end = this.snapPt({ x: d.x, y: d.y, p: 1 });
      if (e.shiftKey) end = this.constrain(this.drag.start, end, this.drag.tool);
      this.drag.end = end;
      if (this.drag.tool === 'move') this.moveOffset = { dx: Math.round(end.x - this.drag.start.x), dy: Math.round(end.y - this.drag.start.y) };
      this.needs = true;
      return;
    }
    if (e.pointerType !== 'touch') {
      this.hover = this.toDoc(l.x, l.y);
      this.needs = true;
    }
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.gesture) {
      if (this.pointers.size < 2) this.gesture = null;
      return;
    }
    if (this.panning) {
      this.panning = null;
      this.emit();
      return;
    }
    if (this.placeDrag) {
      this.placeDrag = null;
      this.emit();
      return;
    }
    if (this.stroke) return this.endStroke();
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      if (d.tool === 'move') this.bakeMove(d.layer, this.moveOffset ?? { dx: 0, dy: 0 });
      else if (d.tool === 'gradient') this.applyGradient(d.start, d.end);
      else this.applyShape(d.tool as 'line' | 'rect' | 'ellipse', d.start, d.end);
      this.moveOffset = null;
      this.needs = true;
    }
  };
  private onCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.stroke) this.cancelStroke();
    this.drag = null;
    this.moveOffset = null;
    this.gesture = null;
    this.panning = null;
    this.needs = true;
  };
  private onLeave = () => {
    this.hover = null;
    this.needs = true;
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const l = this.local(e);
    const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50);
    if (e.ctrlKey || e.metaKey) this.zoomAt(Math.exp(-e.deltaY * 0.012), l.x, l.y); // trackpad pinch
    else if (e.shiftKey) {
      this.ox -= e.deltaY;
      this.needs = true;
    } else if (mouseWheel) this.zoomAt(Math.exp(-Math.sign(e.deltaY) * 0.18), l.x, l.y);
    else {
      this.ox -= e.deltaX;
      this.oy -= e.deltaY;
      this.needs = true;
    }
  };
  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (mod) return;
    if (e.key === ' ') {
      this.space = true;
      e.preventDefault();
      return;
    }
    if (this.placement) {
      if (e.key === 'Enter') this.confirmPlacement();
      if (e.key === 'Escape') this.cancelPlacement();
      return;
    }
    const map: Record<string, () => void> = {
      b: () => this.set({ tool: 'brush', brush: this.s.brush === 'pencil' || this.s.brush === 'pixel' ? 'round' : this.s.brush }),
      p: () => this.set({ tool: 'brush', brush: 'pencil' }),
      e: () => this.set({ tool: 'eraser' }),
      g: () => this.set({ tool: 'fill' }),
      i: () => this.set({ tool: 'eyedropper' }),
      l: () => this.set({ tool: 'line' }),
      r: () => this.set({ tool: 'rect' }),
      o: () => this.set({ tool: 'ellipse' }),
      v: () => this.set({ tool: 'move' }),
      h: () => this.set({ tool: 'hand' }),
      x: () => this.set({ color: this.s.color2, color2: this.s.color }),
      '[': () => this.setSize(this.size / 1.2),
      ']': () => this.setSize(this.size * 1.2),
      '0': () => this.fit(),
      '=': () => this.zoomAt(1.25),
      '+': () => this.zoomAt(1.25),
      '-': () => this.zoomAt(0.8),
    };
    map[e.key]?.();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ') this.space = false;
  };

  private startGesture() {
    const pts = [...this.pointers.values()].slice(-2);
    const d0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
    const doc = this.toDoc(mx, my);
    this.gesture = { d0: Math.max(d0, 1), s0: this.scale, mx, my, dx: doc.x, dy: doc.y };
  }
  private updateGesture() {
    const g = this.gesture!;
    const pts = [...this.pointers.values()].slice(-2);
    if (pts.length < 2) return;
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
    this.scale = Math.max(0.05, Math.min(64, g.s0 * (d / g.d0)));
    this.ox = mx - g.dx * this.scale;
    this.oy = my - g.dy * this.scale;
    this.needs = true;
  }

  private snapPt(p: Pt): Pt {
    if (!this.s.snap) return p;
    const step = R / 8;
    return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step, p: p.p };
  }
  private constrain(a: Pt, b: Pt, tool: ToolId): Pt {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (tool === 'rect' || tool === 'ellipse') {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      return { x: a.x + Math.sign(dx || 1) * m, y: a.y + Math.sign(dy || 1) * m, p: b.p };
    }
    const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(dx, dy);
    return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len, p: b.p };
  }

  // ---- strokes ---------------------------------------------------------------------------
  private bufferTile(key: string) {
    const st = this.stroke!;
    let c = st.buffer.get(key);
    if (!c) {
      c = makeCanvas();
      st.buffer.set(key, c);
    }
    return c;
  }

  private beginStroke(p: Pt) {
    const layer = this.doc.active;
    if (!layer || !layer.visible) {
      this.toast?.('Show the layer before painting on it.');
      return;
    }
    const def = this.brushDef;
    if (def.unlock && !this.unlocked.has(def.unlock)) {
      this.toast?.(`${def.name} is locked — unlock it in the Studio with Pigments.`);
      return;
    }
    this.stroke = {
      buffer: new Map(), last: p, smooth: p, rem: 0, def, size: this.size, color: this.s.tool === 'eraser' ? '#000000' : this.s.color,
      erase: this.s.tool === 'eraser', started: performance.now(), layer, moved: 0,
    };
    this.dab(p.x, p.y, p.p);
    this.needs = true;
  }

  private strokeTo(raw: Pt) {
    const st = this.stroke!;
    const k = this.s.tool === 'brush' && st.def.tip === 'square' ? 0 : this.s.smoothing;
    const sm: Pt = { x: st.smooth.x + (raw.x - st.smooth.x) * (1 - k), y: st.smooth.y + (raw.y - st.smooth.y) * (1 - k), p: raw.p };
    st.smooth = sm;
    this.segment(st.last, sm);
    st.moved += Math.hypot(sm.x - st.last.x, sm.y - st.last.y) * this.scale;
    st.last = sm;
    this.needs = true;
  }

  private segment(a: Pt, b: Pt) {
    const st = this.stroke!;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (st.def.tip === 'square') {
      const steps = Math.ceil(dist);
      for (let i = 1; i <= steps; i++) this.dab(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps, b.p);
      return;
    }
    const spacing = Math.max(0.5, st.size * st.def.spacing);
    let t = spacing - st.rem;
    while (t <= dist) {
      const f = t / dist;
      this.dab(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.p + (b.p - a.p) * f);
      t += spacing;
    }
    st.rem = dist - (t - spacing);
  }

  private dab(x: number, y: number, pressure: number) {
    const st = this.stroke!;
    const def = st.def;
    const size = Math.max(0.6, st.size * (def.pressureSize ? 0.15 + 0.85 * pressure : 1));
    const flow = def.flow * (def.pressureFlow ? 0.25 + 0.75 * pressure : 1);
    for (const [sx, sy] of symmetryPoints(x, y, this.s.symmetry, this.doc.width, this.doc.height)) {
      if (def.tip === 'square') {
        const n = Math.max(1, Math.round(st.size));
        const px = Math.floor(sx - n / 2 + 0.5), py = Math.floor(sy - n / 2 + 0.5);
        for (const cell of this.doc.cellsIn(px, py, px + n - 1, py + n - 1)) {
          const c = this.bufferTile(cell.key).getContext('2d')!;
          c.fillStyle = st.color;
          c.fillRect(px - cell.x, py - cell.y, n, n);
          this.doc.touch(cell.key);
        }
      } else if (def.tip === 'scatter') {
        const r = size / 2;
        const count = Math.max(3, Math.round(size * 0.5 * (0.4 + 0.6 * pressure)));
        for (const cell of this.doc.cellsIn(sx - r, sy - r, sx + r, sy + r)) {
          const c = this.bufferTile(cell.key).getContext('2d')!;
          c.fillStyle = st.color;
          for (let k = 0; k < count; k++) {
            const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
            const dx = sx + Math.cos(a) * d - cell.x, dy = sy + Math.sin(a) * d - cell.y;
            if (dx < -2 || dy < -2 || dx > R + 2 || dy > R + 2) continue;
            const s = 0.8 + Math.random() * 1.4;
            c.globalAlpha = flow * (0.5 + Math.random() * 0.5);
            c.fillRect(dx, dy, s, s);
          }
          c.globalAlpha = 1;
          this.doc.touch(cell.key);
        }
      } else {
        const tip = brushTip(def, size, st.color, this.s.tool === 'brush' && this.s.hardness !== null && def.tip === 'round' ? this.s.hardness : undefined);
        const hw = tip.width / 2;
        for (const cell of this.doc.cellsIn(sx - hw, sy - hw, sx + hw, sy + hw)) {
          const c = this.bufferTile(cell.key).getContext('2d')!;
          c.globalAlpha = flow;
          c.drawImage(tip, sx - hw - cell.x, sy - hw - cell.y);
          c.globalAlpha = 1;
          this.doc.touch(cell.key);
        }
      }
    }
  }

  private endStroke() {
    const st = this.stroke!;
    this.segment(st.last, st.smooth);
    this.commitBuffer(st.buffer, st.layer, st.erase ? 'destination-out' : 'source-over', this.s.opacity, st.erase ? 'Erase' : BRUSHES[this.s.brush].name);
    this.stroke = null;
  }

  private cancelStroke() {
    const st = this.stroke;
    this.stroke = null;
    if (st) for (const k of st.buffer.keys()) this.doc.touch(k);
    this.needs = true;
  }

  /** Merge a per-cell buffer into a layer as one undoable step. */
  private commitBuffer(buffer: Map<string, HTMLCanvasElement>, layer: Layer, op: GlobalCompositeOperation, alpha: number, label: string) {
    if (!buffer.size) return;
    this.history.begin(label);
    for (const [key, buf] of buffer) {
      const existing = layer.tiles.get(key) ?? null;
      if (op === 'destination-out' && !existing) continue;
      this.history.snapshotTile(layer, key, existing);
      const t = this.doc.tile(layer, key, true)!;
      t.ctx.globalAlpha = alpha;
      t.ctx.globalCompositeOperation = op;
      t.ctx.drawImage(buf, 0, 0);
      t.ctx.globalAlpha = 1;
      t.ctx.globalCompositeOperation = 'source-over';
      t.dirty = true;
      this.doc.touch(key);
    }
    this.history.commit();
    this.dirty = true;
    this.emit();
  }

  // ---- other tools ---------------------------------------------------------------------------
  toast: ((msg: string) => void) | null = null;

  private pick(x: number, y: number) {
    const px = this.doc.samplePixel(x, y);
    if (!px || px[3] === 0) return;
    const hex = '#' + [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    this.set({ color: hex, tool: this.s.tool === 'eyedropper' ? 'brush' : this.s.tool });
  }

  private applyFill(x: number, y: number) {
    const layer = this.doc.active;
    if (!layer?.visible) return;
    const res = floodFill(this.doc, layer, x, y, this.s.tolerance, this.s.sampleAll);
    if (!res) return;
    dilate(res);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(this.s.color.slice(i, i + 2), 16));
    const buffer = new Map<string, HTMLCanvasElement>();
    for (const cell of this.doc.cells) {
      let any = false;
      const img = new ImageData(R, R);
      for (let yy = 0; yy < R; yy++) {
        const row = (cell.y + yy) * res.width + cell.x;
        for (let xx = 0; xx < R; xx++)
          if (res.mask[row + xx]) {
            const i = (yy * R + xx) * 4;
            img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
            any = true;
          }
      }
      if (!any) continue;
      const c = makeCanvas();
      c.getContext('2d')!.putImageData(img, 0, 0);
      buffer.set(cell.key, c);
    }
    this.commitBuffer(buffer, layer, 'source-over', this.s.opacity, 'Fill');
  }

  private drawPathInCells(cells: CellInfo[], draw: (ctx: CanvasRenderingContext2D) => void) {
    const buffer = new Map<string, HTMLCanvasElement>();
    for (const cell of cells) {
      const c = makeCanvas();
      const ctx = c.getContext('2d')!;
      ctx.translate(-cell.x, -cell.y);
      draw(ctx);
      buffer.set(cell.key, c);
    }
    return buffer;
  }

  private shapePath(ctx: CanvasRenderingContext2D, tool: 'line' | 'rect' | 'ellipse', a: Pt, b: Pt) {
    ctx.beginPath();
    if (tool === 'line') {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    } else if (tool === 'rect') ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    else ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
  }

  private applyShape(tool: 'line' | 'rect' | 'ellipse', a: Pt, b: Pt) {
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1) return;
    const layer = this.doc.active;
    const w = Math.max(1, this.size);
    const cells = this.doc.cellsIn(Math.min(a.x, b.x) - w, Math.min(a.y, b.y) - w, Math.max(a.x, b.x) + w, Math.max(a.y, b.y) + w);
    const buffer = this.drawPathInCells(cells, (ctx) => {
      this.shapePath(ctx, tool, a, b);
      if (this.s.shapeFill && tool !== 'line') {
        ctx.fillStyle = this.s.color2;
        ctx.fill();
      }
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = this.s.color;
      ctx.stroke();
    });
    this.commitBuffer(buffer, layer, 'source-over', this.s.opacity, tool === 'line' ? 'Line' : tool === 'rect' ? 'Rectangle' : 'Ellipse');
  }

  private applyGradient(a: Pt, b: Pt) {
    if (Math.hypot(b.x - a.x, b.y - a.y) < 2) return;
    const layer = this.doc.active;
    const buffer = this.drawPathInCells(this.doc.cells, (ctx) => {
      const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      g.addColorStop(0, this.s.color);
      g.addColorStop(1, this.s.color2);
      ctx.fillStyle = g;
      ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
    });
    this.commitBuffer(buffer, layer, this.s.gradientOnPaint ? 'source-atop' : 'source-over', this.s.opacity, 'Gradient');
  }

  /** Re-rasterise a whole layer with a transform (move / flip). */
  private bakeLayer(layer: Layer, label: string, transform: (ctx: CanvasRenderingContext2D) => void) {
    const big = makeCanvas(this.doc.width, this.doc.height);
    const bctx = big.getContext('2d')!;
    for (const [key, t] of layer.tiles) {
      const cell = this.doc.byKey.get(key);
      if (cell) bctx.drawImage(t.canvas, cell.x, cell.y);
    }
    this.history.begin(label);
    for (const cell of this.doc.cells) {
      const existing = layer.tiles.get(cell.key) ?? null;
      this.history.snapshotTile(layer, cell.key, existing);
      const t = this.doc.tile(layer, cell.key, true)!;
      t.ctx.clearRect(0, 0, R, R);
      t.ctx.save();
      t.ctx.translate(-cell.x, -cell.y);
      transform(t.ctx);
      t.ctx.drawImage(big, 0, 0);
      t.ctx.restore();
      t.dirty = true;
    }
    this.history.commit();
    this.doc.touchAll();
    this.dirty = true;
    this.emit();
  }

  private bakeMove(layer: Layer, off: { dx: number; dy: number }) {
    if (!off.dx && !off.dy) return;
    this.bakeLayer(layer, 'Move layer', (ctx) => ctx.translate(off.dx, off.dy));
  }

  flipLayer(axis: 'h' | 'v') {
    const W = this.doc.width, H = this.doc.height;
    this.bakeLayer(this.doc.active, axis === 'h' ? 'Flip horizontal' : 'Flip vertical', (ctx) => {
      if (axis === 'h') {
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
      } else {
        ctx.translate(0, H);
        ctx.scale(1, -1);
      }
    });
  }

  // ---- layers --------------------------------------------------------------------------------
  addLayer() {
    if (this.doc.layers.length >= this.maxLayers) return this.toast?.(`Layer limit reached (${this.maxLayers}). Unlock more in the Studio.`);
    this.history.begin('Add layer', true);
    const idx = this.doc.layers.indexOf(this.doc.active) + 1;
    this.doc.addLayer(`Layer ${this.doc.layers.length + 1}`, idx);
    this.history.commit();
    this.markChanged();
  }
  duplicateLayer() {
    if (this.doc.layers.length >= this.maxLayers) return this.toast?.(`Layer limit reached (${this.maxLayers}).`);
    const src = this.doc.active;
    this.history.begin('Duplicate layer', true);
    const l = this.doc.addLayer(`${src.name} copy`.slice(0, 40), this.doc.layers.indexOf(src) + 1);
    l.opacity = src.opacity;
    for (const [k, t] of src.tiles) {
      const nt = this.doc.tile(l, k, true)!;
      nt.ctx.drawImage(t.canvas, 0, 0);
    }
    this.history.commit();
    this.markChanged();
  }
  deleteLayer() {
    if (this.doc.layers.length <= 1) return this.toast?.('A canvas needs at least one layer.');
    this.history.begin('Delete layer', true);
    const idx = this.doc.layers.indexOf(this.doc.active);
    this.doc.layers.splice(idx, 1);
    this.doc.activeId = this.doc.layers[Math.max(0, idx - 1)].id;
    this.history.commit();
    this.doc.touchAll();
    this.markChanged();
  }
  mergeDown() {
    const idx = this.doc.layers.indexOf(this.doc.active);
    if (idx <= 0) return;
    const top = this.doc.layers[idx], below = this.doc.layers[idx - 1];
    this.history.begin('Merge down', true);
    for (const [k, t] of top.tiles) {
      if (!top.visible) break;
      this.history.snapshotTile(below, k, below.tiles.get(k) ?? null);
      const bt = this.doc.tile(below, k, true)!;
      bt.ctx.globalAlpha = top.opacity;
      bt.ctx.drawImage(t.canvas, 0, 0);
      bt.ctx.globalAlpha = 1;
      bt.dirty = true;
    }
    this.doc.layers.splice(idx, 1);
    this.doc.activeId = below.id;
    this.history.commit();
    this.doc.touchAll();
    this.markChanged();
  }
  moveLayer(dir: 1 | -1) {
    const idx = this.doc.layers.indexOf(this.doc.active);
    const j = idx + dir;
    if (j < 0 || j >= this.doc.layers.length) return;
    this.history.begin('Reorder layers', true);
    const [l] = this.doc.layers.splice(idx, 1);
    this.doc.layers.splice(j, 0, l);
    this.history.commit();
    this.doc.touchAll();
    this.markChanged();
  }
  updateLayer(id: string, p: Partial<Pick<Layer, 'name' | 'opacity' | 'visible'>>, record = true) {
    const l = this.doc.layer(id);
    if (!l) return;
    if (record) this.history.begin('Layer settings', true);
    Object.assign(l, p);
    if (record) this.history.commit();
    this.doc.touchAll();
    this.markChanged();
  }
  selectLayer(id: string) {
    this.doc.activeId = id;
    this.emit();
  }
  clearLayer() {
    const l = this.doc.active;
    this.history.begin('Clear layer');
    for (const [k, t] of l.tiles) {
      this.history.snapshotTile(l, k, t);
      t.ctx.clearRect(0, 0, R, R);
      t.dirty = true;
    }
    this.history.commit();
    this.doc.touchAll();
    this.markChanged();
  }

  undo() {
    if (this.stroke || this.drag) return;
    this.history.undo();
    this.dirty = true;
    this.emit();
  }
  redo() {
    if (this.stroke || this.drag) return;
    this.history.redo();
    this.dirty = true;
    this.emit();
  }

  // ---- image placement ------------------------------------------------------------------------
  startPlacement(src: Placement['src'], mode: 'fit' | 'fill' = 'fit') {
    const s = mode === 'fit' ? Math.min(this.doc.width / src.width, this.doc.height / src.height) : Math.max(this.doc.width / src.width, this.doc.height / src.height);
    this.placement = { src, x: this.doc.width / 2, y: this.doc.height / 2, scale: s, rotation: 0, flipX: false };
    this.emit();
  }
  updatePlacement(p: Partial<Placement>) {
    if (!this.placement) return;
    Object.assign(this.placement, p);
    this.emit();
  }
  fitPlacement(mode: 'fit' | 'fill') {
    const pl = this.placement;
    if (!pl) return;
    pl.scale = mode === 'fit' ? Math.min(this.doc.width / pl.src.width, this.doc.height / pl.src.height) : Math.max(this.doc.width / pl.src.width, this.doc.height / pl.src.height);
    pl.x = this.doc.width / 2;
    pl.y = this.doc.height / 2;
    pl.rotation = 0;
    this.emit();
  }
  cancelPlacement() {
    this.placement = null;
    this.emit();
  }
  /** Pixels of source image per document pixel — above ~1.5 the image will look soft. */
  placementUpscale() {
    return this.placement ? this.placement.scale : 0;
  }
  confirmPlacement() {
    const pl = this.placement;
    if (!pl) return;
    if (this.doc.layers.length >= this.maxLayers) {
      this.toast?.(`Layer limit reached (${this.maxLayers}). Merge or delete a layer first.`);
      return;
    }
    this.history.begin('Place image', true);
    const layer = this.doc.addLayer('Image', this.doc.layers.indexOf(this.doc.active) + 1);
    for (const cell of this.doc.cells) {
      const t = this.doc.tile(layer, cell.key, true)!;
      t.ctx.save();
      t.ctx.imageSmoothingQuality = 'high';
      t.ctx.translate(-cell.x + pl.x, -cell.y + pl.y);
      t.ctx.rotate(pl.rotation);
      t.ctx.scale(pl.scale * (pl.flipX ? -1 : 1), pl.scale);
      t.ctx.drawImage(pl.src, -pl.src.width / 2, -pl.src.height / 2);
      t.ctx.restore();
      t.dirty = true;
    }
    // drop tiles the image did not touch
    for (const [k, t] of [...layer.tiles]) {
      const d = t.ctx.getImageData(0, 0, R, R).data;
      let any = false;
      for (let i = 3; i < d.length; i += 4) if (d[i]) { any = true; break; }
      if (!any) layer.tiles.delete(k);
    }
    this.history.commit();
    this.placement = null;
    this.doc.touchAll();
    this.markChanged();
  }
  private placeCorners() {
    const pl = this.placement!;
    const hw = (pl.src.width * pl.scale) / 2, hh = (pl.src.height * pl.scale) / 2;
    const c = Math.cos(pl.rotation), s = Math.sin(pl.rotation);
    const pt = (x: number, y: number) => ({ x: this.ox + (pl.x + x * c - y * s) * this.scale, y: this.oy + (pl.y + x * s + y * c) * this.scale });
    return { corners: [pt(-hw, -hh), pt(hw, -hh), pt(hw, hh), pt(-hw, hh)], rot: pt(0, -hh - 36 / this.scale), center: pt(0, 0) };
  }
  private placeDown(sx: number, sy: number) {
    const g = this.placeCorners();
    const near = (p: { x: number; y: number }) => Math.hypot(p.x - sx, p.y - sy) < 22;
    const mode = near(g.rot) ? 'rotate' : g.corners.some(near) ? 'scale' : 'move';
    this.placeDrag = { mode, sx, sy, p0: { ...this.placement! } };
  }
  private placeMove(sx: number, sy: number, shift: boolean) {
    const d = this.placeDrag!;
    const pl = this.placement!;
    if (d.mode === 'move') {
      pl.x = d.p0.x + (sx - d.sx) / this.scale;
      pl.y = d.p0.y + (sy - d.sy) / this.scale;
    } else if (d.mode === 'scale') {
      const cx = this.ox + d.p0.x * this.scale, cy = this.oy + d.p0.y * this.scale;
      const r0 = Math.hypot(d.sx - cx, d.sy - cy), r1 = Math.hypot(sx - cx, sy - cy);
      pl.scale = Math.max(0.01, d.p0.scale * (r1 / Math.max(r0, 1)));
    } else {
      const cx = this.ox + pl.x * this.scale, cy = this.oy + pl.y * this.scale;
      let a = Math.atan2(sy - cy, sx - cx) + Math.PI / 2;
      if (shift) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
      pl.rotation = a;
    }
    this.needs = true;
    this.emit();
  }

  // ---- rendering -------------------------------------------------------------------------------
  private loop = () => {
    if (this.disposed) return;
    if (this.needs) {
      this.needs = false;
      this.render();
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private patterns() {
    if (!this.checker) {
      const c = makeCanvas(16, 16);
      const x = c.getContext('2d')!;
      x.fillStyle = '#d9dce8';
      x.fillRect(0, 0, 16, 16);
      x.fillStyle = '#c5c9da';
      x.fillRect(0, 0, 8, 8);
      x.fillRect(8, 8, 8, 8);
      this.checker = this.ctx.createPattern(c, 'repeat');
      const h = makeCanvas(12, 12);
      const hx = h.getContext('2d')!;
      hx.strokeStyle = 'rgba(140,160,230,0.22)';
      hx.lineWidth = 2;
      hx.beginPath();
      hx.moveTo(-2, 14);
      hx.lineTo(14, -2);
      hx.stroke();
      this.hatch = this.ctx.createPattern(h, 'repeat');
    }
  }

  private render() {
    const ctx = this.ctx;
    this.patterns();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewW, this.viewH);
    const s = this.scale;
    const st = this.stroke;
    const movingLayer = this.moveOffset ? this.drag?.layer : null;
    // canvas shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = 'rgba(0,0,0,0.001)';
    ctx.fillRect(this.ox, this.oy, this.doc.width * s, this.doc.height * s);
    ctx.restore();
    // non-member cells of irregular canvases
    for (let row = 0; row < this.doc.layout.rows; row++)
      for (let col = 0; col < this.doc.layout.cols; col++)
        if (!this.doc.cellAtColRow(col, row)) {
          ctx.fillStyle = this.hatch!;
          ctx.fillRect(this.ox + col * R * s, this.oy + row * R * s, R * s, R * s);
        }
    ctx.imageSmoothingEnabled = s < 2;
    for (const cell of this.doc.cells) {
      const x = this.ox + cell.x * s, y = this.oy + cell.y * s, w = R * s;
      if (x > this.viewW || y > this.viewH || x + w < 0 || y + w < 0) continue;
      ctx.fillStyle = this.checker!;
      ctx.fillRect(x, y, w, w);
      if (this.doc.dirtyComposite.has(cell.key) || st?.buffer.has(cell.key) || movingLayer) {
        this.doc.compositeOf(cell.key, (layer, cctx) => {
          if (movingLayer && layer === movingLayer) return true;
          if (st && layer === st.layer && st.buffer.has(cell.key)) {
            const sc = this.scratch.getContext('2d')!;
            sc.globalCompositeOperation = 'source-over';
            sc.clearRect(0, 0, R, R);
            const t = layer.tiles.get(cell.key);
            if (t) sc.drawImage(t.canvas, 0, 0);
            sc.globalAlpha = this.s.opacity;
            sc.globalCompositeOperation = st.erase ? 'destination-out' : 'source-over';
            sc.drawImage(st.buffer.get(cell.key)!, 0, 0);
            sc.globalAlpha = 1;
            sc.globalCompositeOperation = 'source-over';
            cctx.globalAlpha = layer.opacity;
            cctx.drawImage(this.scratch, 0, 0);
            cctx.globalAlpha = 1;
            return true;
          }
          return false;
        });
        if (!st?.buffer.has(cell.key) && !movingLayer) this.doc.dirtyComposite.delete(cell.key);
      }
      ctx.drawImage(this.doc.composite.get(cell.key) ?? this.doc.compositeOf(cell.key), x, y, w, w);
    }
    // move preview: active layer drawn shifted
    if (movingLayer && this.moveOffset) {
      ctx.save();
      ctx.beginPath();
      for (const c of this.doc.cells) ctx.rect(this.ox + c.x * s, this.oy + c.y * s, R * s, R * s);
      ctx.clip();
      ctx.globalAlpha = movingLayer.opacity;
      for (const [k, t] of movingLayer.tiles) {
        const c = this.doc.byKey.get(k);
        if (c) ctx.drawImage(t.canvas, this.ox + (c.x + this.moveOffset.dx) * s, this.oy + (c.y + this.moveOffset.dy) * s, R * s, R * s);
      }
      ctx.restore();
    }
    // before / after
    if (this.compare) {
      const split = this.ox + this.doc.width * s * this.compare.split;
      ctx.save();
      ctx.beginPath();
      ctx.rect(this.ox, this.oy, split - this.ox, this.doc.height * s);
      ctx.clip();
      for (const cell of this.doc.cells) {
        const x = this.ox + cell.x * s, y = this.oy + cell.y * s;
        ctx.fillStyle = '#0B1230';
        ctx.fillRect(x, y, R * s, R * s);
        const bmp = this.compare.tiles.get(cell.key);
        if (bmp) ctx.drawImage(bmp, x, y, R * s, R * s);
      }
      ctx.restore();
      ctx.fillStyle = '#FFE14D';
      ctx.fillRect(split - 1, this.oy - 8, 2, this.doc.height * s + 16);
    }
    this.renderOverlays();
  }

  private renderOverlays() {
    const ctx = this.ctx;
    const s = this.scale;
    // fine pixel grid when deeply zoomed (pixel art)
    if (this.s.showGrid && s >= 10) {
      ctx.strokeStyle = 'rgba(120,130,170,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x0 = Math.max(0, Math.floor(-this.ox / s)), x1 = Math.min(this.doc.width, Math.ceil((this.viewW - this.ox) / s));
      const y0 = Math.max(0, Math.floor(-this.oy / s)), y1 = Math.min(this.doc.height, Math.ceil((this.viewH - this.oy) / s));
      for (let x = x0; x <= x1; x++) { ctx.moveTo(Math.round(this.ox + x * s) + 0.5, this.oy + y0 * s); ctx.lineTo(Math.round(this.ox + x * s) + 0.5, this.oy + y1 * s); }
      for (let y = y0; y <= y1; y++) { ctx.moveTo(this.ox + x0 * s, Math.round(this.oy + y * s) + 0.5); ctx.lineTo(this.ox + x1 * s, Math.round(this.oy + y * s) + 0.5); }
      ctx.stroke();
    } else if (this.s.showGrid && this.s.snap) {
      ctx.strokeStyle = 'rgba(160,175,240,0.18)';
      ctx.beginPath();
      for (let x = 0; x <= this.doc.width; x += R / 8) { ctx.moveTo(this.ox + x * s, this.oy); ctx.lineTo(this.ox + x * s, this.oy + this.doc.height * s); }
      for (let y = 0; y <= this.doc.height; y += R / 8) { ctx.moveTo(this.ox, this.oy + y * s); ctx.lineTo(this.ox + this.doc.width * s, this.oy + y * s); }
      ctx.stroke();
    }
    // plot boundaries: dashed inside, luminous outline outside
    if (this.s.showGrid) {
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(201,246,255,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const c of this.doc.cells) {
        const right = this.doc.cellAt(c.x + R, c.y), below = this.doc.cellAt(c.x, c.y + R);
        if (right) { ctx.moveTo(this.ox + (c.x + R) * s, this.oy + c.y * s); ctx.lineTo(this.ox + (c.x + R) * s, this.oy + (c.y + R) * s); }
        if (below) { ctx.moveTo(this.ox + c.x * s, this.oy + (c.y + R) * s); ctx.lineTo(this.ox + (c.x + R) * s, this.oy + (c.y + R) * s); }
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.strokeStyle = '#22E3FF';
    ctx.shadowColor = '#22E3FF';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const c of this.doc.cells) {
      const x = this.ox + c.x * s, y = this.oy + c.y * s, w = R * s;
      if (!this.doc.cellAt(c.x, c.y - R)) { ctx.moveTo(x, y); ctx.lineTo(x + w, y); }
      if (!this.doc.cellAt(c.x, c.y + R)) { ctx.moveTo(x, y + w); ctx.lineTo(x + w, y + w); }
      if (!this.doc.cellAt(c.x - R, c.y)) { ctx.moveTo(x, y); ctx.lineTo(x, y + w); }
      if (!this.doc.cellAt(c.x + R, c.y)) { ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + w); }
    }
    ctx.stroke();
    ctx.restore();
    // symmetry guides
    if (this.s.symmetry !== 'off' && (this.s.tool === 'brush' || this.s.tool === 'eraser')) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,79,216,0.7)';
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      const cx = this.ox + (this.doc.width / 2) * s, cy = this.oy + (this.doc.height / 2) * s;
      if (this.s.symmetry === 'vertical' || this.s.symmetry === 'quad') { ctx.moveTo(cx, this.oy); ctx.lineTo(cx, this.oy + this.doc.height * s); }
      if (this.s.symmetry === 'horizontal' || this.s.symmetry === 'quad') { ctx.moveTo(this.ox, cy); ctx.lineTo(this.ox + this.doc.width * s, cy); }
      if (this.s.symmetry === 'radial') for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 4000, cy + Math.sin(a) * 4000); }
      ctx.stroke();
      ctx.restore();
    }
    // shape / gradient previews
    const d = this.drag;
    if (d && d.tool !== 'move') {
      ctx.save();
      ctx.translate(this.ox, this.oy);
      ctx.scale(s, s);
      if (d.tool === 'gradient') {
        ctx.lineWidth = 2 / s;
        ctx.strokeStyle = '#ffffff';
        ctx.setLineDash([6 / s, 4 / s]);
        ctx.beginPath();
        ctx.moveTo(d.start.x, d.start.y);
        ctx.lineTo(d.end.x, d.end.y);
        ctx.stroke();
        for (const [p, c] of [[d.start, this.s.color], [d.end, this.s.color2]] as const) {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 7 / s, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        this.shapePath(ctx, d.tool as 'line' | 'rect' | 'ellipse', d.start, d.end);
        ctx.globalAlpha = this.s.opacity;
        if (this.s.shapeFill && d.tool !== 'line') {
          ctx.fillStyle = this.s.color2;
          ctx.fill();
        }
        ctx.lineWidth = Math.max(1, this.size);
        ctx.lineCap = 'round';
        ctx.strokeStyle = this.s.color;
        ctx.stroke();
      }
      ctx.restore();
    }
    // placement
    if (this.placement) {
      const pl = this.placement;
      ctx.save();
      ctx.beginPath();
      for (const c of this.doc.cells) ctx.rect(this.ox + c.x * s, this.oy + c.y * s, R * s, R * s);
      ctx.clip();
      ctx.globalAlpha = 0.92;
      ctx.translate(this.ox + pl.x * s, this.oy + pl.y * s);
      ctx.rotate(pl.rotation);
      ctx.scale(pl.scale * s * (pl.flipX ? -1 : 1), pl.scale * s);
      ctx.drawImage(pl.src, -pl.src.width / 2, -pl.src.height / 2);
      ctx.restore();
      const g = this.placeCorners();
      ctx.save();
      ctx.strokeStyle = '#FFE14D';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      g.corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.moveTo((g.corners[0].x + g.corners[1].x) / 2, (g.corners[0].y + g.corners[1].y) / 2);
      ctx.lineTo(g.rot.x, g.rot.y);
      ctx.stroke();
      ctx.fillStyle = '#0B1230';
      for (const p of [...g.corners, g.rot]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
    // brush cursor
    if (this.hover && !this.stroke && !this.placement && (this.s.tool === 'brush' || this.s.tool === 'eraser')) {
      const r = (Math.max(1, this.size) / 2) * s;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.ox + this.hover.x * s, this.oy + this.hover.y * s, Math.max(2, r), 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.arc(this.ox + this.hover.x * s, this.oy + this.hover.y * s, Math.max(2, r) + 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Small downscaled preview of the whole canvas (map look at lower zoom). */
  renderPreview(target: HTMLCanvasElement, maxDim = 220) {
    const k = Math.min(1, maxDim / Math.max(this.doc.width, this.doc.height));
    target.width = Math.max(1, Math.round(this.doc.width * k));
    target.height = Math.max(1, Math.round(this.doc.height * k));
    const c = target.getContext('2d')!;
    c.clearRect(0, 0, target.width, target.height);
    c.imageSmoothingQuality = 'high';
    for (const cell of this.doc.cells) c.drawImage(this.doc.compositeOf(cell.key), cell.x * k, cell.y * k, R * k, R * k);
  }

  /** Test hook: draw a programmatic stroke (used by end-to-end tests). */
  testStroke(points: { x: number; y: number }[], tool: ToolId = 'brush') {
    const prev = this.s.tool;
    this.s.tool = tool;
    this.beginStroke({ ...points[0], p: 1 });
    for (const p of points.slice(1)) this.strokeTo({ ...p, p: 1 });
    this.endStroke();
    this.s.tool = prev;
  }
}

export { newLayerId };
