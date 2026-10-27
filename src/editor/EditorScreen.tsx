import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Brush, Circle, Columns2, Eraser, Expand, Grid2X2, Hand, History as HistoryIcon, ImagePlus, Minus, Move, PaintBucket,
  Pencil, Pipette, Plus, Redo2, RotateCw, Send, Slash, Square, Undo2, Blend, FlipHorizontal2, Check, X, Layers3, SlidersHorizontal, Maximize,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import type { ProjectBundle, Publication, VersionInfo } from '../backend/types';
import { config } from '../env';
import { celebrate, invalidateGame, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, timeAgo } from '../lib/utils';
import { cellCenter } from '../shared/grid';
import { Button, Dialog, Field, Spinner, Tabs, Tip, inputCls, useConfirm } from '../ui';
import { BRUSHES } from './engine/brush';
import type { Doc } from './engine/doc';
import { Editor, type ToolId } from './engine/Editor';
import { loadDoc, publish, saveTiles, type PublishStep } from './engine/io';
import { ImportDialog } from './ui/ImportDialog';
import { BrushPanel, ColorPanel, LayersPanel } from './ui/panels';

type ToolDef = { id: string; label: string; icon: any; key: string; apply: (ed: Editor) => void; active: (ed: Editor) => boolean };
const TOOLS: ToolDef[] = [
  { id: 'pencil', label: 'Pencil', icon: Pencil, key: 'P', apply: (e) => e.set({ tool: 'brush', brush: 'pencil' }), active: (e) => e.s.tool === 'brush' && e.s.brush === 'pencil' },
  { id: 'brush', label: 'Paintbrush', icon: Brush, key: 'B', apply: (e) => e.set({ tool: 'brush', brush: ['pencil', 'pixel'].includes(e.s.brush) ? 'round' : e.s.brush }), active: (e) => e.s.tool === 'brush' && !['pencil', 'pixel'].includes(e.s.brush) },
  { id: 'pixel', label: 'Pixel brush', icon: Grid2X2, key: '', apply: (e) => e.set({ tool: 'brush', brush: 'pixel' }), active: (e) => e.s.tool === 'brush' && e.s.brush === 'pixel' },
  { id: 'eraser', label: 'Eraser', icon: Eraser, key: 'E', apply: (e) => e.set({ tool: 'eraser' }), active: (e) => e.s.tool === 'eraser' },
  { id: 'fill', label: 'Fill bucket', icon: PaintBucket, key: 'G', apply: (e) => e.set({ tool: 'fill' }), active: (e) => e.s.tool === 'fill' },
  { id: 'eyedropper', label: 'Eyedropper', icon: Pipette, key: 'I', apply: (e) => e.set({ tool: 'eyedropper' }), active: (e) => e.s.tool === 'eyedropper' },
  { id: 'line', label: 'Straight line', icon: Slash, key: 'L', apply: (e) => e.set({ tool: 'line' }), active: (e) => e.s.tool === 'line' },
  { id: 'rect', label: 'Rectangle', icon: Square, key: 'R', apply: (e) => e.set({ tool: 'rect' }), active: (e) => e.s.tool === 'rect' },
  { id: 'ellipse', label: 'Circle / ellipse', icon: Circle, key: 'O', apply: (e) => e.set({ tool: 'ellipse' }), active: (e) => e.s.tool === 'ellipse' },
  { id: 'gradient', label: 'Gradient', icon: Blend, key: '', apply: (e) => e.set({ tool: 'gradient' }), active: (e) => e.s.tool === 'gradient' },
  { id: 'move', label: 'Move layer', icon: Move, key: 'V', apply: (e) => e.set({ tool: 'move' }), active: (e) => e.s.tool === 'move' },
  { id: 'hand', label: 'Pan', icon: Hand, key: 'H', apply: (e) => e.set({ tool: 'hand' }), active: (e) => e.s.tool === 'hand' },
];

export default function EditorScreen() {
  const { groupId } = useParams();
  const [search] = useSearchParams();
  const nav = useNavigate();
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const group = useQuery({ queryKey: ['group', groupId], queryFn: () => api.getGroup(groupId!), enabled: !!groupId });
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ed, setEd] = useState<Editor | null>(null);
  const baseVersion = useRef<string>('');
  const [title, setTitle] = useState('Untitled');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [panel, setPanel] = useState<'color' | 'brush' | 'layers'>('color');
  const [mobileSheet, setMobileSheet] = useState<null | 'color' | 'brush' | 'layers'>(null);
  const [importOpen, setImportOpen] = useState(search.get('start') === 'upload');
  const [publishOpen, setPublishOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => {
    setEd(null);
    setDoc(null);
    setReloadKey((k) => k + 1);
  };

  // load project
  useEffect(() => {
    if (!group.data?.project_id) return;
    let live = true;
    (async () => {
      try {
        const b = await api.getProject(group.data!.project_id);
        if (!live) return;
        setBundle(b);
        setTitle(b.project.title);
        baseVersion.current = b.version.id;
        setSavedAt(b.version.created_at);
        const { doc, missing } = await loadDoc(b, (d, t) => live && setProgress([d, t]));
        if (!live) return;
        if (missing) toast.warning(`${missing} saved tile${missing === 1 ? '' : 's'} could not be downloaded.`);
        setDoc(doc);
      } catch (e) {
        setLoadErr(toGameError(e).message);
      }
    })();
    return () => {
      live = false;
    };
  }, [group.data?.project_id, reloadKey]);

  // create the engine
  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    const e = new Editor(canvasRef.current, doc, { color: me?.profile.accent_color ?? '#FF4D6D' });
    const limits = bundle?.limits;
    const extra = (me?.unlocks ?? []).filter((u) => u.startsWith('layers.extra')).length * 2;
    e.maxLayers = Math.max((limits?.max_layers_base ?? 6) + extra, doc.layers.length);
    e.unlocked = new Set(me?.unlocks ?? []);
    e.toast = (m) => toast(m);
    setEd(e);
    if (config.e2e || import.meta.env.DEV) (window as any).__landvasEditor = e;
    return () => e.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  useSyncExternalStore(ed?.subscribe ?? noopSub, ed?.getVersion ?? zero);

  const save = useCallback(async (force = false): Promise<string | null> => {
    if (!ed || !bundle || !me) return null;
    setSaving(true);
    try {
      const manifest = await saveTiles(ed.doc, me.user_id);
      const r = await api.saveDraft(bundle.project.id, baseVersion.current, manifest, title, undefined, force);
      baseVersion.current = r.version_id;
      ed.dirty = false;
      ed.emit();
      setSavedAt(r.saved_at);
      celebrate(r.achievements);
      invalidateGame(qc);
      return r.version_id;
    } catch (e) {
      const err = toGameError(e);
      if (err.code === 'version_conflict') setConflict(true);
      else toast.error(err.message);
      return null;
    } finally {
      setSaving(false);
    }
  }, [ed, bundle, me, title, qc]);

  // autosave + unload guard
  useEffect(() => {
    if (!ed) return;
    const t = setInterval(() => { if (ed.dirty && !saving) void save(); }, 90_000);
    const before = (e: BeforeUnloadEvent) => { if (ed.dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', before);
    const keys = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); } };
    window.addEventListener('keydown', keys);
    const gesture = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', gesture);
    return () => {
      clearInterval(t);
      window.removeEventListener('beforeunload', before);
      window.removeEventListener('keydown', keys);
      document.removeEventListener('gesturestart', gesture);
    };
  }, [ed, save, saving]);

  const leave = async () => {
    if (ed?.dirty) {
      const ok = await confirm({ title: 'Save before leaving?', body: 'Your latest strokes are not saved yet. Drafts never change the public map.', confirm: 'Save and leave' });
      if (ok) { const v = await save(); if (!v) return; }
      else {
        const discard = await confirm({ title: 'Leave without saving?', body: 'Unsaved changes will be lost.', confirm: 'Discard changes', danger: true });
        if (!discard) return;
      }
    }
    nav(-1);
  };

  const toggleCompare = async () => {
    if (!ed || !bundle) return;
    if (ed.compare) { ed.compare = null; ed.emit(); return; }
    if (!bundle.published.length) return toast('Nothing published on these plots yet — publish to compare before and after.');
    const tiles = new Map<string, ImageBitmap>();
    await Promise.all(bundle.published.map(async ([gx, gy, rev]) => {
      const buf = await getBackend().artTile(16, gx, gy, rev);
      if (buf) tiles.set(`${gx}_${gy}`, await createImageBitmap(new Blob([buf])));
    }));
    ed.compare = { tiles, split: 0.5 };
    ed.emit();
  };

  if (loadErr) return <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center"><p className="text-bad">{loadErr}</p><Button onClick={() => nav('/')}>Back to the map</Button></div>;
  const cols = doc?.layout.cols ?? 1, rows = doc?.layout.rows ?? 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" data-testid="editor">
      {/* top bar */}
      <header className="gutter flex items-center gap-2 border-b border-line bg-bg-2/80 pb-2 pt-[max(8px,env(safe-area-inset-top,0px))]">
        <Button size="icon" variant="ghost" onClick={leave} aria-label="Back"><ArrowLeft className="h-5 w-5" /></Button>
        <div className="min-w-0 flex-1">
          <input value={title} onChange={(e) => { setTitle(e.target.value.slice(0, 80)); if (ed) { ed.dirty = true; ed.emit(); } }}
            className="w-full min-w-0 truncate bg-transparent font-display text-[15px] font-semibold focus:outline-none" aria-label="Artwork title" id="art-title" />
          <div className="truncate text-[11.5px] text-muted tnum">
            {cols}×{rows} canvas · {doc?.cells.length ?? '…'} plot{doc?.cells.length === 1 ? '' : 's'} · {saving ? 'Saving…' : ed?.dirty ? 'Unsaved changes' : savedAt ? `Saved ${timeAgo(savedAt)}` : ''}
          </div>
        </div>
        <div className="hidden items-center gap-1 sm:flex">
          <Tip label="Undo (Ctrl+Z)"><Button size="icon" variant="ghost" disabled={!ed?.history.canUndo} onClick={() => ed?.undo()} aria-label="Undo"><Undo2 className="h-5 w-5" /></Button></Tip>
          <Tip label="Redo (Ctrl+Shift+Z)"><Button size="icon" variant="ghost" disabled={!ed?.history.canRedo} onClick={() => ed?.redo()} aria-label="Redo"><Redo2 className="h-5 w-5" /></Button></Tip>
          <Tip label="Before / after"><Button size="icon" variant={ed?.compare ? 'secondary' : 'ghost'} onClick={toggleCompare} aria-label="Compare with published"><Columns2 className="h-5 w-5" /></Button></Tip>
          <Tip label="Version history"><Button size="icon" variant="ghost" onClick={() => setVersionsOpen(true)} aria-label="Version history"><HistoryIcon className="h-5 w-5" /></Button></Tip>
          <Tip label="Full screen"><Button size="icon" variant="ghost" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {})} aria-label="Full screen"><Maximize className="h-5 w-5" /></Button></Tip>
        </div>
        <Button variant="secondary" size="sm" loading={saving} onClick={() => save()} disabled={!ed} data-testid="save-draft">Save</Button>
        <Button variant="rainbow" size="sm" onClick={() => setPublishOpen(true)} disabled={!ed} data-testid="open-publish"><Send className="h-4 w-4" /> Publish</Button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* tool rail (desktop) */}
        <nav className="hidden w-[58px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-line bg-bg-2/60 py-2 scroll-thin md:flex" aria-label="Tools">
          {ed && TOOLS.map((t) => (
            <Tip key={t.id} label={`${t.label}${t.key ? ` (${t.key})` : ''}`}>
              <button onClick={() => t.apply(ed)} aria-label={t.label} aria-pressed={t.active(ed)}
                className={cn('flex h-10 w-10 items-center justify-center rounded-xl transition', t.active(ed) ? 'bg-accent text-white' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
                <t.icon className="h-[19px] w-[19px]" />
              </button>
            </Tip>
          ))}
          <div className="my-1 h-px w-8 bg-line" />
          <Tip label="Upload image"><button onClick={() => setImportOpen(true)} aria-label="Upload image" className="flex h-10 w-10 items-center justify-center rounded-xl text-gold hover:bg-surface-2"><ImagePlus className="h-[19px] w-[19px]" /></button></Tip>
        </nav>

        {/* canvas */}
        <div ref={hostRef} className="no-touch-scroll relative min-w-0 flex-1 overflow-hidden" style={{ background: 'radial-gradient(ellipse at center, var(--surface) 0%, var(--bg) 75%)' }}>
          <canvas ref={canvasRef} className={cn('absolute inset-0 block', ed?.s.tool === 'hand' || ed?.s.tool === 'move' ? 'cursor-grab' : 'cursor-crosshair')} data-testid="editor-canvas" />
          {!ed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted">
              <Spinner />Loading canvas {progress[1] ? `${progress[0]}/${progress[1]} tiles` : ''}
            </div>
          )}
          {ed && <ZoomControls ed={ed} />}
          {ed?.compare && (
            <div className="glass absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-3 rounded-2xl px-4 py-2 text-xs font-bold">
              <span>Published</span>
              <input type="range" min={0} max={100} value={Math.round(ed.compare.split * 100)} aria-label="Compare split" onChange={(e) => { ed.compare!.split = Number(e.target.value) / 100; ed.requestRender(); ed.emit(); }} />
              <span>Draft</span>
            </div>
          )}
          {ed?.placement && <PlacementBar ed={ed} />}
        </div>

        {/* inspector (desktop) */}
        <aside className="hidden w-[312px] shrink-0 flex-col border-l border-line bg-bg-2/60 lg:flex">
          {ed && <PreviewMini ed={ed} />}
          <div className="px-4 pb-2"><Tabs value={panel} onValueChange={(v) => setPanel(v as any)} items={[{ value: 'color', label: 'Colour' }, { value: 'brush', label: 'Tool' }, { value: 'layers', label: 'Layers' }]} /></div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 scroll-thin">
            {ed && panel === 'color' && <ColorPanel ed={ed} unlocks={ed.unlocked} />}
            {ed && panel === 'brush' && <BrushPanel ed={ed} unlocks={ed.unlocked} />}
            {ed && panel === 'layers' && <LayersPanel ed={ed} />}
          </div>
        </aside>
      </div>

      {/* mobile / tablet toolbar */}
      {ed && (
        <div className="border-t border-line bg-bg-2/90 pb-[env(safe-area-inset-bottom,0px)] lg:hidden">
          <div className="gutter flex items-center gap-1 overflow-x-auto py-2 scroll-thin">
            <button onClick={() => setMobileSheet('color')} className="mr-1 h-10 w-10 shrink-0 rounded-xl border-2 border-line" style={{ background: ed.s.color }} aria-label="Colour" />
            <button onClick={() => ed.undo()} disabled={!ed.history.canUndo} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted disabled:opacity-30" aria-label="Undo"><Undo2 className="h-5 w-5" /></button>
            <button onClick={() => ed.redo()} disabled={!ed.history.canRedo} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted disabled:opacity-30" aria-label="Redo"><Redo2 className="h-5 w-5" /></button>
            <div className="mx-1 h-6 w-px shrink-0 bg-line" />
            {TOOLS.filter((t) => t.id !== 'hand').map((t) => (
              <button key={t.id} onClick={() => t.apply(ed)} aria-label={t.label} aria-pressed={t.active(ed)}
                className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl md:hidden', t.active(ed) ? 'bg-accent text-white' : 'text-muted')}>
                <t.icon className="h-5 w-5" />
              </button>
            ))}
            <button onClick={() => setImportOpen(true)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gold md:hidden" aria-label="Upload image"><ImagePlus className="h-5 w-5" /></button>
            <div className="flex-1" />
            <button onClick={() => setMobileSheet('brush')} className="flex h-10 shrink-0 items-center gap-1 rounded-xl px-2 text-xs font-bold text-muted" aria-label="Tool settings"><SlidersHorizontal className="h-5 w-5" /></button>
            <button onClick={() => setMobileSheet('layers')} className="flex h-10 shrink-0 items-center gap-1 rounded-xl px-2 text-xs font-bold text-muted" aria-label="Layers"><Layers3 className="h-5 w-5" /> {ed.doc.layers.length}</button>
          </div>
        </div>
      )}

      {ed && (
        <Dialog open={!!mobileSheet} onOpenChange={(o) => !o && setMobileSheet(null)} title={mobileSheet === 'color' ? 'Colour' : mobileSheet === 'brush' ? `${ed.s.tool === 'brush' ? BRUSHES[ed.s.brush].name : TOOLS.find((t) => t.active(ed))?.label ?? 'Tool'} settings` : 'Layers'}>
          {mobileSheet === 'color' && <ColorPanel ed={ed} unlocks={ed.unlocked} />}
          {mobileSheet === 'brush' && <BrushPanel ed={ed} unlocks={ed.unlocked} />}
          {mobileSheet === 'layers' && <LayersPanel ed={ed} />}
        </Dialog>
      )}

      {ed && doc && (
        <ImportDialog open={importOpen} onOpenChange={setImportOpen} canvasAspect={doc.width / doc.height}
          onPlace={(img, fit) => { ed.startPlacement(img, fit); ed.set({ tool: 'move' }); }} />
      )}
      {ed && bundle && me && (
        <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} ed={ed} bundle={bundle} title={title} setTitle={setTitle}
          ensureSaved={async () => (ed.dirty || !baseVersion.current ? save() : baseVersion.current)} ownerId={me.user_id} />
      )}
      {bundle && (
        <VersionsDialog open={versionsOpen} onOpenChange={setVersionsOpen} projectId={bundle.project.id} onRestored={() => { setVersionsOpen(false); reload(); }} />
      )}
      <Dialog open={conflict} onOpenChange={setConflict} title="Saved on another device"
        description="Someone (probably you, elsewhere) saved this canvas after you opened it. Keep yours as the newest version, or reload theirs. Either way, every version stays in history."
        footer={<><Button variant="ghost" onClick={() => { setConflict(false); reload(); }}>Reload latest</Button><Button variant="primary" onClick={async () => { setConflict(false); await save(true); }}>Keep mine</Button></>} />
    </div>
  );
}

const noopSub = () => () => {};
const zero = () => 0;

function ZoomControls({ ed }: { ed: Editor }) {
  return (
    <div className="glass absolute bottom-3 right-3 flex items-center gap-1 rounded-2xl p-1">
      <button className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-2" onClick={() => ed.zoomAt(0.8)} aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
      <button className="h-8 min-w-14 rounded-lg px-1 text-xs font-bold tnum hover:bg-surface-2" onClick={() => ed.fit()} title="Fit (0)">{Math.round(ed.scale * 100)}%</button>
      <button className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-2" onClick={() => ed.zoomAt(1.25)} aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
      <button className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-2" onClick={() => ed.fit()} aria-label="Fit canvas"><Expand className="h-4 w-4" /></button>
    </div>
  );
}

function PreviewMini({ ed }: { ed: Editor }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rev = ed.doc.revision;
  useEffect(() => {
    const t = setTimeout(() => ref.current && ed.renderPreview(ref.current, 264), 350);
    return () => clearTimeout(t);
  }, [rev, ed]);
  return (
    <div className="m-4 grid gap-1.5">
      <div className="eyebrow">Map preview</div>
      <div className="flex justify-center rounded-xl border border-line bg-[var(--map-land)] p-2">
        <canvas ref={ref} className="max-h-36 max-w-full" style={{ imageRendering: 'auto' }} />
      </div>
    </div>
  );
}

function PlacementBar({ ed }: { ed: Editor }) {
  const up = ed.placementUpscale();
  const sharp = up <= 1.5;
  return (
    <div className="glass absolute inset-x-3 bottom-16 mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2 rounded-2xl p-2 md:bottom-3">
      <span className={cn('rounded-full px-2.5 py-1 text-[11.5px] font-bold', sharp ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn')}>
        {sharp ? 'Sharp' : `Enlarged ${up.toFixed(1)}× — may look soft`}
      </span>
      <Button size="sm" variant="ghost" onClick={() => ed.fitPlacement('fit')}>Fit</Button>
      <Button size="sm" variant="ghost" onClick={() => ed.fitPlacement('fill')}>Fill</Button>
      <Button size="sm" variant="ghost" onClick={() => ed.updatePlacement({ rotation: (ed.placement!.rotation + Math.PI / 2) % (Math.PI * 2) })} aria-label="Rotate 90 degrees"><RotateCw className="h-4 w-4" /></Button>
      <Button size="sm" variant="ghost" onClick={() => ed.updatePlacement({ flipX: !ed.placement!.flipX })} aria-label="Flip"><FlipHorizontal2 className="h-4 w-4" /></Button>
      <Button size="sm" variant="ghost" onClick={() => ed.cancelPlacement()}><X className="h-4 w-4" /> Cancel</Button>
      <Button size="sm" variant="primary" onClick={() => ed.confirmPlacement()} data-testid="confirm-placement"><Check className="h-4 w-4" /> Place on canvas</Button>
    </div>
  );
}

const STEP_LABEL: Record<PublishStep, string> = {
  saving: 'Saving draft', preparing: 'Preparing plot images', uploading: 'Uploading plots', submitting: 'Submitting', processing: 'Validating, screening and rendering map tiles', done: 'Done',
};

function PublishDialog({ open, onOpenChange, ed, bundle, title, setTitle, ensureSaved, ownerId }: {
  open: boolean; onOpenChange(o: boolean): void; ed: Editor; bundle: ProjectBundle; title: string; setTitle(t: string): void;
  ensureSaved(): Promise<string | null>; ownerId: string;
}) {
  const [desc, setDesc] = useState(bundle.project.description ?? '');
  const [rights, setRights] = useState(false);
  const [step, setStep] = useState<{ s: PublishStep; d?: string } | null>(null);
  const [result, setResult] = useState<Publication | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const qc = useQueryClient();
  const nav = useNavigate();
  const requestFly = useUi((s) => s.requestFly);
  useEffect(() => {
    if (open) {
      setResult(null);
      setError(null);
      setStep(null);
      setTimeout(() => preview.current && ed.renderPreview(preview.current, 360), 30);
    }
  }, [open, ed]);
  const go = async () => {
    setError(null);
    try {
      setStep({ s: 'saving' });
      const v = await ensureSaved();
      if (!v) throw new Error('Save failed');
      const pub = await publish(ed.doc, { projectId: bundle.project.id, ownerId, versionId: v }, { title, description: desc, rights }, (s, d) => setStep({ s, d }));
      setResult(pub);
      invalidateGame(qc);
      void qc.invalidateQueries({ queryKey: ['publications'] });
    } catch (e) {
      setError(toGameError(e).message);
      setStep(null);
    }
  };
  const viewOnMap = () => {
    const c = ed.doc.cells[0];
    const [lng, lat] = cellCenter(c.gx, c.gy);
    requestFly({ lng, lat, zoom: Math.max(13.5, 16 - Math.log2(Math.max(ed.doc.layout.cols, ed.doc.layout.rows)) - 0.6) });
    useUi.getState().setMode('canvas');
    nav('/');
  };
  const busy = !!step && !result;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)} title={result ? publishTitle(result) : 'Publish to the world map'} wide>
      {!result ? (
        <div className="grid gap-5 md:grid-cols-[1fr_1.1fr]">
          <div className="grid content-start gap-2">
            <div className="checker flex items-center justify-center rounded-2xl p-3"><canvas ref={preview} className="max-h-64 max-w-full" /></div>
            <p className="text-xs text-muted tnum">{ed.doc.cells.length} plot{ed.doc.cells.length === 1 ? '' : 's'} · each becomes a 256×256 map tile. Hidden layers are left out.</p>
          </div>
          <div className="grid content-start gap-4">
            <Field label="Title" htmlFor="pub-title"><input id="pub-title" className={inputCls} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} disabled={busy} /></Field>
            <Field label="Description (optional)" htmlFor="pub-desc"><textarea id="pub-desc" className={inputCls + ' h-20 py-2'} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} disabled={busy} /></Field>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface/60 p-3 text-[13px]">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={rights} onChange={(e) => setRights(e.target.checked)} disabled={busy} data-testid="rights" />
              <span>I created this artwork or have permission to publish it. It follows the Content Policy. I keep my copyright and grant LANDVAS a non-exclusive licence to display it in the game, its gallery and share cards.</span>
            </label>
            {step && (
              <div className="grid gap-1 rounded-2xl border border-line p-3 text-sm">
                {(['saving', 'preparing', 'uploading', 'submitting', 'processing'] as PublishStep[]).map((s, i, arr) => {
                  const cur = arr.indexOf(step.s);
                  return (
                    <div key={s} className={cn('flex items-center gap-2', i < cur ? 'text-ok' : i === cur ? 'font-bold text-fg' : 'text-faint')}>
                      {i < cur ? <Check className="h-4 w-4" /> : i === cur ? <Spinner className="h-4 w-4" /> : <span className="h-4 w-4" />}
                      {STEP_LABEL[s]}{i === cur && step.d ? ` · ${step.d}` : ''}
                    </div>
                  );
                })}
              </div>
            )}
            {error && <p className="text-sm font-semibold text-bad">{error}</p>}
            <Button variant="rainbow" size="lg" disabled={!rights || !title.trim() || busy} loading={busy} onClick={go} data-testid="publish">
              <Send className="h-4 w-4" /> Publish {ed.doc.cells.length > 1 ? 'mural' : 'artwork'}
            </Button>
            <p className="text-xs text-faint">Saving drafts never changes the map. Publishing replaces the art currently shown on these plots{getBackend().mode === 'local' ? '.' : ' after review.'}</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-muted">
            {result.status === 'published' && 'Your art is live. Anyone exploring this part of the world now sees it on the map.'}
            {result.status === 'pending_review' && 'It passed automated checks and is waiting for a moderator. It appears on the map as soon as it is approved — usually within a day.'}
            {(result.status === 'rejected' || result.status === 'failed') && (result.decision_reason ?? 'The artwork was not accepted.')}
            {result.status === 'processing' && 'Still processing — check back in a moment from My Canvases.'}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Keep painting</Button>
            {result.status === 'published' && <Button variant="secondary" onClick={() => nav(`/art/${result.id}`)}>Open artwork page</Button>}
            {result.status === 'published' && <Button variant="primary" onClick={viewOnMap} data-testid="view-on-map">View on the map</Button>}
          </div>
        </div>
      )}
    </Dialog>
  );
}
const publishTitle = (p: Publication) => (p.status === 'published' ? 'Published to the world' : p.status === 'pending_review' ? 'Submitted for review' : p.status === 'processing' ? 'Processing' : 'Not published');

function VersionsDialog({ open, onOpenChange, projectId, onRestored }: { open: boolean; onOpenChange(o: boolean): void; projectId: string; onRestored(): void }) {
  const q = useQuery({ queryKey: ['versions', projectId], queryFn: () => api.projectVersions(projectId), enabled: open });
  const [busy, setBusy] = useState<string | null>(null);
  const kinds: Record<string, string> = { initial: 'Created', save: 'Saved', merge: 'Canvases fused', split: 'Plots detached', restore: 'Restored' };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Version history" description="Every save, fusion and split is kept as an immutable version. Restoring creates a new version on top — nothing is lost.">
      {q.isLoading && <Spinner />}
      <div className="grid max-h-[50vh] gap-1.5 overflow-y-auto scroll-thin">
        {(q.data ?? []).map((v: VersionInfo, i) => (
          <div key={v.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-2.5">
            <div className="min-w-0">
              <div className="text-sm font-semibold">v{v.version_no} · {kinds[v.kind] ?? v.kind} {v.published && <span className="ml-1 rounded-full bg-ok/15 px-1.5 py-0.5 text-[10px] font-bold text-ok">published</span>}</div>
              <div className="text-xs text-muted tnum">{timeAgo(v.created_at)} · {v.plot_count} plot{v.plot_count === 1 ? '' : 's'} · {v.tile_count} tiles · {v.layer_count} layers</div>
            </div>
            {i > 0 && (
              <Button size="sm" loading={busy === v.id} onClick={async () => {
                setBusy(v.id);
                try { await api.restoreVersion(projectId, v.id); toast.success(`Restored v${v.version_no}`); onRestored(); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
              }}>Restore</Button>
            )}
          </div>
        ))}
      </div>
    </Dialog>
  );
}

export type { ToolId };
