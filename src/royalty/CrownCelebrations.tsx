// Royal announcements: the newest Crown claims, each as a celebration card with a Snapshot button that saves
// (or shares) the exact card as a PNG, plus a search over every crown holder so anyone can make their own.
// Shown on the home page and the Royalty page. Holders who keep themselves off Royalty are never shown.
import { useQuery } from '@tanstack/react-query';
import { Camera, Crown as CrownIcon, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { cn } from '../lib/utils';
import { PlayerAvatar } from '../ui';
import { confetti } from '../ui/confetti';
import { celebrations, searchCelebrations, snapshotName, TIER_INFO, type Celebration, type RoyalCrown, type RoyalTotals } from './celebration';
import { canvasBlob, drawCelebration, loadSnapFonts, SNAP_DIMS, type SnapSize } from './drawCelebration';

const ROYAL_CONFETTI = ['#FFD84D', '#E8B64A', '#FFF1C2', '#B69CFF', '#7FE3FF', '#FFFFFF'];
const RECENT = 5;

function useFonts() {
  const [ready, setReady] = useState(false);
  useEffect(() => { let live = true; void loadSnapFonts().then(() => live && setReady(true)); return () => { live = false; }; }, []);
  return ready;
}

export function CrownCelebrations({ variant = 'home' }: { variant?: 'home' | 'royalty' }) {
  const q = useQuery({ queryKey: ['royalty'], queryFn: api.royalty, staleTime: 60_000 });
  const all = useMemo(() => celebrations((q.data?.crowns ?? []) as RoyalCrown[], (q.data?.totals ?? null) as RoyalTotals | null), [q.data]);
  const recent = all.slice(0, RECENT);
  const [picked, setPicked] = useState<string | null>(null);
  const [size, setSize] = useState<SnapSize>('square');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const fonts = useFonts();
  const cv = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const cheered = useRef(false);

  const sel = all.find((c) => c.key === picked) ?? all[0] ?? null;
  const results = useMemo(() => searchCelebrations(all, query), [all, query]);

  useEffect(() => { if (sel && cv.current) drawCelebration(sel, size, cv.current); }, [sel, size, fonts]);

  // confetti the first time a fresh crown scrolls into view
  useEffect(() => {
    const el = box.current;
    if (!el || !sel?.fresh || cheered.current || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting) && !cheered.current) { cheered.current = true; cheer(el); io.disconnect(); }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [sel?.fresh]);

  if (!all.length) return null;

  const pick = (c: Celebration) => { setPicked(c.key); setQuery(''); if (box.current) cheer(box.current, 70); };

  const snapshot = async () => {
    if (!sel || busy) return;
    setBusy(true);
    try {
      await loadSnapFonts();
      const blob = await canvasBlob(drawCelebration(sel, size));
      if (!blob) throw new Error('encode_failed');
      const file = new File([blob], snapshotName(sel, size), { type: 'image/png' });
      try {
        // phones get the share sheet (straight to Discord / Reddit); computers just download the PNG
        const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
        if (touch && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: `${sel.handle} — ${TIER_INFO[sel.crown.tier].one}`, text: `All hail ${sel.handle}, ${sel.title}! 👑 landvas.app` }); return; }
      } catch (e) { if ((e as Error)?.name === 'AbortError') return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast.success('Snapshot saved', { description: 'Post it to Discord or Reddit and crown them properly.' });
    } catch {
      toast.error('Couldn’t make the snapshot', { description: 'Try again in a moment.' });
    } finally { setBusy(false); }
  };

  const [W, H] = SNAP_DIMS[size];
  return (
    <section className="grid gap-4" data-testid="crown-celebrations" aria-labelledby="crown-cel-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="crown-cel-title" className={cn('font-display font-black', variant === 'home' ? 'text-3xl md:text-4xl' : 'text-xl')}>
            <span aria-hidden="true">👑 </span>Royal announcements
          </h2>
          <p className="mt-1 text-sm text-muted">The newest Crowns in LANDVAS. Snapshot one and post it to crown them properly.</p>
        </div>
        {variant === 'home' && <Link to="/royalty" className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/15">Every Crown →</Link>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div ref={box} className="relative grid gap-3">
          <div className="relative">
          <div className="overflow-hidden rounded-3xl" style={{ boxShadow: '0 0 0 1.5px rgba(255,216,77,0.35), 0 24px 70px -30px rgba(255,201,61,0.55)' }}>
            <canvas ref={cv} width={W} height={H} className="block h-auto w-full" data-testid="crown-cel-canvas" data-crown={sel?.key}
              role="img" aria-label={sel ? `${sel.headline}: all hail ${sel.handle}, ${sel.title}` : 'Crown celebration'} />
          </div>
            {sel?.fresh && <span className="absolute -top-3 right-8 z-10 rounded-full bg-gold px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-black shadow-lg">New</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={snapshot} disabled={busy} data-testid="crown-cel-snapshot"
              className="lv-cta inline-flex h-12 items-center gap-2 rounded-2xl px-5 text-sm font-extrabold text-white disabled:opacity-60">
              <Camera className="h-5 w-5" aria-hidden="true" /> {busy ? 'Making snapshot…' : 'Snapshot'}
            </button>
            <div className="inline-flex rounded-2xl bg-surface-2 p-1" role="group" aria-label="Snapshot size">
              {(['square', 'wide'] as const).map((s) => (
                <button key={s} type="button" aria-pressed={size === s} onClick={() => setSize(s)} data-testid={`crown-cel-size-${s}`}
                  className={cn('h-10 rounded-xl px-3 text-xs font-bold', size === s ? 'bg-white/15 text-fg' : 'text-muted hover:text-fg')}>
                  {s === 'square' ? 'Square · Discord' : 'Wide · Reddit'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid content-start gap-4">
          <div className="relative">
            <label htmlFor="crown-cel-search" className="mb-1.5 block text-sm font-bold">Find a crown holder</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
              <input id="crown-cel-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Player name or kingdom" autoComplete="off"
                className="h-11 w-full rounded-xl border border-line bg-surface/80 pl-9 pr-10 text-[15px] text-fg placeholder:text-faint focus:border-accent focus:outline-none" data-testid="crown-cel-search" />
              {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-fg"><X className="h-4 w-4" /></button>}
            </div>
            {query.trim() && (
              <ul className="glass absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-auto rounded-2xl p-1" data-testid="crown-cel-results">
                {results.length ? results.map((c) => <li key={c.key}><HolderRow c={c} onPick={pick} active={c.key === sel?.key} /></li>)
                  : <li className="px-3 py-3 text-sm text-muted">No crown holder matches “{query.trim()}”. Only players who hold a Crown show up here.</li>}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1.5 text-sm font-bold">Newest Crowns</h3>
            <ul className="glass grid gap-0.5 rounded-2xl p-1" data-testid="crown-cel-recent">
              {recent.map((c) => <li key={c.key}><HolderRow c={c} onPick={pick} active={c.key === sel?.key} /></li>)}
            </ul>
            {all.length > RECENT && <p className="mt-2 text-xs text-faint">{all.length - RECENT} more crown {all.length - RECENT === 1 ? 'holder' : 'holders'}: search for them above.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function HolderRow({ c, onPick, active }: { c: Celebration; onPick(c: Celebration): void; active: boolean }) {
  const t = TIER_INFO[c.crown.tier];
  return (
    <button type="button" onClick={() => onPick(c)} aria-pressed={active}
      className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left', active ? 'bg-white/10' : 'hover:bg-white/5')}>
      <PlayerAvatar p={c.holder as any} size={36} frame="gold" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{c.holder.display_name || c.handle}</span>
        <span className="block truncate text-xs text-muted"><span style={{ color: t.color }}>{t.one}</span> · {c.crown.kingdom}{c.fresh ? ' · new' : ''}</span>
      </span>
      <CrownIcon className="h-4 w-4 shrink-0" style={{ color: t.color }} aria-hidden="true" />
    </button>
  );
}

function cheer(el: HTMLElement, count = 160) {
  const r = el.getBoundingClientRect();
  confetti({ x: r.left + r.width / 2, y: r.top + r.height * 0.3, count, colors: ROYAL_CONFETTI, power: 1.1 });
}
