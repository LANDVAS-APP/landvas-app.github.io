import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, FlipHorizontal2, FlipVertical2, Layers3, Lock, Merge, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../backend/api';
import { toGameError } from '../../backend/backend';
import { cn } from '../../lib/utils';
import { PALETTES } from '../../shared/color';
import { Button, Slider, Switch, inputCls } from '../../ui';
import { BRUSHES, type BrushId } from '../engine/brush';
import { R, type Layer } from '../engine/doc';
import type { Editor } from '../engine/Editor';
import { ColorPicker } from './ColorPicker';

export function ColorPanel({ ed, unlocks }: { ed: Editor; unlocks: Set<string> }) {
  const qc = useQueryClient();
  const palettes = useQuery({ queryKey: ['palettes'], queryFn: api.myPalettes });
  const [recent, setRecent] = useState<string[]>([]);
  const lastRef = useRef(ed.s.color);
  useEffect(() => {
    if (ed.s.color !== lastRef.current) {
      lastRef.current = ed.s.color;
      setRecent((r) => [ed.s.color, ...r.filter((c) => c !== ed.s.color)].slice(0, 12));
    }
  });
  const savePalette = async () => {
    const colors = [...new Set([ed.s.color, ed.s.color2, ...recent])].slice(0, 16);
    try {
      await api.savePalette(null, `Palette ${new Date().toLocaleDateString()}`, colors);
      void qc.invalidateQueries({ queryKey: ['palettes'] });
      toast.success('Palette saved');
    } catch (e) { toast.error(toGameError(e).message); }
  };
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <button className="relative h-12 w-14" onClick={() => ed.set({ color: ed.s.color2, color2: ed.s.color })} aria-label="Swap primary and secondary colours" title="Swap (X)">
          <span className="absolute bottom-0 right-0 h-8 w-8 rounded-lg border-2 border-bg" style={{ background: ed.s.color2 }} />
          <span className="absolute left-0 top-0 h-8 w-8 rounded-lg border-2 border-bg shadow" style={{ background: ed.s.color }} />
        </button>
        <p className="text-xs text-muted">Primary paints strokes; secondary fills shapes and ends gradients. Alt-click the canvas to pick a colour.</p>
      </div>
      {unlocks.has('tool.mixer') ? <ColorPicker value={ed.s.color} onChange={(c) => ed.set({ color: c })} /> : (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line-strong p-3 text-xs text-muted" data-testid="mixer-locked">
          <span className="h-10 w-10 shrink-0 rounded-xl opacity-60" style={{ background: 'conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }} />
          <span><b className="text-fg">Colour Mixer</b> — pick any colour and type hex codes. Buy it in the Studio shop; until then, paint with your palettes and the eyedropper.</span>
          <Lock className="h-4 w-4 shrink-0 text-gold" />
        </div>
      )}
      {recent.length > 0 && <Swatches title="Recent" colors={recent} ed={ed} />}
      {Object.entries(PALETTES).map(([id, p]) => {
        const locked = !!p.unlock && !unlocks.has(p.unlock);
        return <Swatches key={id} title={p.name + (locked ? ' · buy in the Studio' : '')} colors={p.colors} ed={ed} locked={locked} />;
      })}
      {(palettes.data ?? []).map((p) => (
        <Swatches key={p.id} title={p.name} colors={p.colors} ed={ed} onDelete={async () => { await api.deletePalette(p.id); void qc.invalidateQueries({ queryKey: ['palettes'] }); }} />
      ))}
      <Button size="sm" variant="secondary" onClick={savePalette}><Save className="h-4 w-4" /> Save current colours as a palette</Button>
    </div>
  );
}

function Swatches({ title, colors, ed, locked, onDelete }: { title: string; colors: string[]; ed: Editor; locked?: boolean; onDelete?(): void }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between"><span className="eyebrow">{title}</span>{onDelete && <button className="text-[11px] text-faint hover:text-bad" onClick={onDelete}>Remove</button>}</div>
      <div className={cn('grid grid-cols-8 gap-1.5', locked && 'pointer-events-none opacity-30 grayscale-[35%]')} aria-disabled={locked || undefined}>
        {colors.map((c, i) => (
          <button key={c + i} title={c} aria-label={`Colour ${c}`} onClick={() => ed.set({ color: c })} onContextMenu={(e) => { e.preventDefault(); ed.set({ color2: c }); }}
            className={cn('aspect-square rounded-md border', ed.s.color === c ? 'border-fg ring-2 ring-accent-2' : 'border-line')} style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

const STYLE_ORDER: BrushId[] = ['round', 'ink', 'marker', 'airbrush', 'spray', 'calligraphy'];

export function BrushPanel({ ed, unlocks }: { ed: Editor; unlocks: Set<string> }) {
  const t = ed.s.tool;
  const def = ed.brushDef;
  const isBrush = t === 'brush' || t === 'eraser';
  return (
    <div className="grid gap-4">
      {t === 'brush' && !['pencil', 'pixel'].includes(ed.s.brush) && (
        <div className="grid grid-cols-3 gap-1.5">
          {STYLE_ORDER.map((id) => {
            const b = BRUSHES[id];
            const locked = b.unlock && !unlocks.has(b.unlock);
            return (
              <button key={id} onClick={() => ed.set({ brush: id })} disabled={!!locked} title={locked ? 'Buy it in the Studio shop' : b.name}
                className={cn('flex items-center justify-center gap-1 rounded-xl border px-2 py-2 text-[11.5px] font-bold', ed.s.brush === id ? 'border-accent bg-accent/15' : 'border-line', locked && 'opacity-40')}>
                {locked && <Lock className="h-3 w-3 text-gold" />}{b.name}
              </button>
            );
          })}
        </div>
      )}
      {(isBrush || ['line', 'rect', 'ellipse'].includes(t)) && (
        <>
          <Slider id="size" label={t === 'brush' && ed.s.brush === 'pixel' ? 'Pixel size' : 'Size'} min={1} max={ed.sizeCap(def)} step={ed.s.brush === 'pixel' ? 1 : 0.5} value={ed.size} onChange={(v) => ed.setSize(v)} format={(v) => `${Math.round(v * 10) / 10} px`} />
          {ed.sizeCap(def) < def.maxSize && <p className="-mt-2 flex items-center gap-1 text-[11px] text-faint"><Lock className="h-3 w-3 text-gold" /> Up to {def.maxSize} px with Giant Brushes from the Studio.</p>}
        </>
      )}
      {t !== 'hand' && t !== 'move' && t !== 'eyedropper' && (
        <Slider id="opacity" label="Opacity" min={0.05} max={1} step={0.01} value={ed.s.opacity} onChange={(v) => ed.set({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
      )}
      {t === 'brush' && def.tip === 'round' && ed.s.brush !== 'pencil' && (
        <Slider id="hardness" label="Hardness" min={0} max={1} step={0.01} value={ed.s.hardness ?? def.hardness} onChange={(v) => ed.set({ hardness: v })} format={(v) => `${Math.round(v * 100)}%`} />
      )}
      {isBrush && <Slider id="smooth" label="Stabilizer" min={0} max={0.9} step={0.01} value={ed.s.smoothing} onChange={(v) => ed.set({ smoothing: v })} format={(v) => `${Math.round(v * 100)}%`} />}
      {isBrush && (
        <div>
          <div className="eyebrow mb-1.5 flex items-center gap-1">Symmetry{!unlocks.has('tool.symmetry') && <><Lock className="h-3 w-3 text-gold" /><span className="normal-case tracking-normal text-faint">Mirror is free · more in the Studio</span></>}</div>
          <div className="grid grid-cols-5 gap-1">
            {(['off', 'vertical', 'horizontal', 'quad', 'radial'] as const).map((m) => (
              <button key={m} onClick={() => ed.set({ symmetry: m })} disabled={m !== 'off' && m !== 'vertical' && !unlocks.has('tool.symmetry')} className={cn('rounded-lg border py-1.5 text-[11px] font-bold capitalize disabled:opacity-45', ed.s.symmetry === m ? 'border-[#FF4FD8] bg-[#FF4FD8]/15' : 'border-line text-muted')}>
                {m === 'vertical' ? 'Mirror' : m === 'horizontal' ? 'Flip' : m}
              </button>
            ))}
          </div>
        </div>
      )}
      {t === 'fill' && (
        <>
          <Slider id="tolerance" label="Tolerance" min={0} max={100} value={ed.s.tolerance} onChange={(v) => ed.set({ tolerance: v })} format={(v) => `${v}%`} />
          <Switch id="sample-all" label="Sample all layers" hint="Fill regions bounded by lines on other layers" checked={ed.s.sampleAll} onCheckedChange={(v) => ed.set({ sampleAll: v })} />
        </>
      )}
      {(t === 'rect' || t === 'ellipse') && <Switch id="shape-fill" label="Fill with secondary colour" checked={ed.s.shapeFill} onCheckedChange={(v) => ed.set({ shapeFill: v })} />}
      {t === 'gradient' && <Switch id="grad-paint" label="Only over painted pixels" hint="Tints existing paint instead of covering the layer" checked={ed.s.gradientOnPaint} onCheckedChange={(v) => ed.set({ gradientOnPaint: v })} />}
      <div className="grid gap-0.5 border-t border-line pt-3">
        <Switch id="grid" label="Plot borders & grid" checked={ed.s.showGrid} onCheckedChange={(v) => ed.set({ showGrid: v })} />
        <Switch id="snap" label="Snap shapes to grid" hint="32 px steps — 8 per plot" checked={ed.s.snap} onCheckedChange={(v) => ed.set({ snap: v })} />
      </div>
    </div>
  );
}

export function LayersPanel({ ed }: { ed: Editor }) {
  const layers = [...ed.doc.layers].reverse();
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1.5">
        <IconBtn label="New layer" onClick={() => ed.addLayer()}><Plus className="h-4 w-4" /></IconBtn>
        <IconBtn label="Duplicate layer" onClick={() => ed.duplicateLayer()}><Copy className="h-4 w-4" /></IconBtn>
        <IconBtn label="Merge down" onClick={() => ed.mergeDown()}><Merge className="h-4 w-4" /></IconBtn>
        <IconBtn label="Move up" onClick={() => ed.moveLayer(1)}><ArrowUp className="h-4 w-4" /></IconBtn>
        <IconBtn label="Move down" onClick={() => ed.moveLayer(-1)}><ArrowDown className="h-4 w-4" /></IconBtn>
        <IconBtn label="Flip layer horizontally" onClick={() => ed.flipLayer('h')}><FlipHorizontal2 className="h-4 w-4" /></IconBtn>
        <IconBtn label="Flip layer vertically" onClick={() => ed.flipLayer('v')}><FlipVertical2 className="h-4 w-4" /></IconBtn>
        <IconBtn label="Delete layer" onClick={() => ed.deleteLayer()}><Trash2 className="h-4 w-4" /></IconBtn>
      </div>
      <div className="grid gap-1.5">
        {layers.map((l) => <LayerRow key={l.id} l={l} ed={ed} active={l.id === ed.doc.active.id} />)}
      </div>
      <p className="text-xs text-faint"><Layers3 className="mr-1 inline h-3.5 w-3.5" />{ed.doc.layers.length} of {ed.maxLayers} layers · hidden layers are not published</p>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick(): void; children: React.ReactNode }) {
  return <button title={label} aria-label={label} onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted hover:border-line-strong hover:text-fg">{children}</button>;
}

function LayerRow({ l, ed, active }: { l: Layer; ed: Editor; active: boolean }) {
  const thumb = useRef<HTMLCanvasElement>(null);
  const [editing, setEditing] = useState(false);
  const rev = ed.doc.revision;
  useEffect(() => {
    const c = thumb.current;
    if (!c) return;
    const k = 44 / Math.max(ed.doc.width, ed.doc.height);
    c.width = Math.max(1, Math.round(ed.doc.width * k));
    c.height = Math.max(1, Math.round(ed.doc.height * k));
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, c.width, c.height);
    for (const [key, t] of l.tiles) {
      const cell = ed.doc.byKey.get(key);
      if (cell) x.drawImage(t.canvas, cell.x * k, cell.y * k, R * k, R * k);
    }
  }, [rev, l, ed]);
  return (
    <div onClick={() => ed.selectLayer(l.id)} className={cn('grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-2 rounded-xl border p-2', active ? 'border-accent bg-accent/10' : 'border-line hover:border-line-strong')}>
      <canvas ref={thumb} className="checker h-11 w-11 rounded-md object-contain" />
      <div className="min-w-0">
        {editing ? (
          <input autoFocus className={inputCls + ' h-7 text-sm'} defaultValue={l.name} maxLength={40} aria-label="Layer name"
            onBlur={(e) => { ed.updateLayer(l.id, { name: e.target.value.trim() || l.name }); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        ) : (
          <button className="block w-full truncate text-left text-sm font-semibold" onDoubleClick={() => setEditing(true)} title="Double-click to rename">{l.name}</button>
        )}
        <input type="range" min={0} max={100} value={Math.round(l.opacity * 100)} aria-label={`${l.name} opacity`}
          onChange={(e) => ed.updateLayer(l.id, { opacity: Number(e.target.value) / 100 }, false)}
          onPointerUp={() => ed.markChanged()} className="mt-1 h-1 w-full accent-[var(--accent)]" onClick={(e) => e.stopPropagation()} />
      </div>
      <button aria-label={l.visible ? 'Hide layer' : 'Show layer'} onClick={(e) => { e.stopPropagation(); ed.updateLayer(l.id, { visible: !l.visible }); }} className="p-1 text-muted hover:text-fg">
        {l.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>
    </div>
  );
}
