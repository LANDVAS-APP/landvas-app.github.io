// What's happening to the plot you tapped: a Parasite wrapped round it (peel it off), Leviathan ink on it (scrub it off),
// a Size Ray giant (100× its size) you can visit and tip, a tiny plot (100× smaller: look at it through the magnifying glass),
// or a prank someone pulled on your plot (undo it).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { Button } from '../ui';
import { centerOf, efx, useVisitors } from './core';
import { dur } from './kinds';
import { feel, useRub } from './living';
import { PeelOff } from './PeelOff';
import { usePlotArt } from './plotArt';
import { useMySizeRays } from './sizeray';
import { useEffect, useRef, useState } from 'react';
import { drawPlotDesign } from '../map/plotStyle';
import { rarityInfo } from '../shared/rarity';

export function PlotWonders({ gx, gy, plotType }: { gx: number; gy: number; plotType?: string | null }) {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const visitors = useVisitors();
  const rays = useMySizeRays();
  const here = useQuery({ queryKey: ['plot-wonders', gx, gy], queryFn: () => api.enchantMap({ min_gx: gx - 1, min_gy: gy - 1, max_gx: gx + 1, max_gy: gy + 1 }), staleTime: 15_000 });
  const ink = useQuery({ queryKey: ['plot-ink', gx, gy], queryFn: () => api.leviathanMap({ min_gx: gx, min_gy: gy, max_gx: gx, max_gy: gy }), staleTime: 15_000 });
  const scrubBox = useRef<HTMLDivElement>(null);
  const trampled = (ink.data ?? []).find((t) => t.gx === gx && t.gy === gy);
  const scrub = async () => {
    try {
      const r = await api.leviathanScrub(gx, gy);
      feel('success'); efx.burst({ ...centerOf(scrubBox.current), colors: ['#9BE7FF', '#fff', '#B026FF'], count: 70, speed: 10, kind: 'drop' });
      toast.success(`Scrubbed clean! +${r.ink} Ink`);
      invalidateGame(qc); void qc.invalidateQueries({ queryKey: ['plot-ink', gx, gy] }); void qc.invalidateQueries({ queryKey: ['lev-map'] });
    } catch (e) { toast.error(toGameError(e).message); }
  };
  const rub = useRub(1100, () => void scrub());
  const parasite = (visitors.data ?? []).find((v) => v.what === 'parasite' && v.gx === gx && v.gy === gy);
  const size = (here.data?.sizes ?? []).find((s) => s.gx === gx && s.gy === gy);
  const [undoing, setUndoing] = useState(false);
  const undo = async () => {
    setUndoing(true);
    try {
      const r = await api.sizeUndo(gx, gy);
      feel('success'); toast.success(r.was_prank ? 'Prank undone — your plot is its normal size again' : 'Back to its normal size');
      void here.refetch(); void qc.invalidateQueries({ queryKey: ['enchant-map'] }); void qc.invalidateQueries({ queryKey: ['enchant-world'] });
    } catch (e) { toast.error(toGameError(e).message); }
    finally { setUndoing(false); }
  };
  if (!me) return null;
  return (
    <div className="mt-3 grid gap-2 empty:hidden" data-testid="plot-wonders">
      {parasite && (
        <div className="grid gap-2 rounded-2xl border border-[#7CFF6B]/40 bg-[#7CFF6B]/10 p-3">
          <div className="text-[13px] font-black text-[#B6FF8F]">🦠 @{parasite.owner?.username}’s {parasite.stage >= 2 ? 'Symbiote' : 'Parasite'} is wrapped around this plot</div>
          <PeelOff v={parasite} onDone={() => void here.refetch()} />
        </div>
      )}
      {trampled && (
        <div ref={scrubBox} className="grid gap-2 rounded-2xl border border-[#B026FF]/50 bg-[#2A0D5C]/60 p-3" data-testid="plot-trampled">
          <div className="text-[13px] font-black text-[#E5CCFF]">🐉 The Leviathan trampled this plot — it’s covered in ink</div>
          <div className="text-[11.5px] text-white/70">Its minigames pay 40% less until it’s scrubbed, or for {dur((Date.parse(trampled.until) - Date.now()) / 1000)}. Scrubbing pays {trampled.mine ? '12' : '6'} Ink{trampled.mine ? '' : ' (and its owner gets a thank-you)'}.</div>
          <div {...rub.bind} className="lv-scrub relative h-20 overflow-hidden rounded-xl" data-testid="plot-scrub">
            <div className="absolute inset-0 bg-[#2B3B66]" />
            <div className="absolute inset-0 lv-inksplat" style={{ opacity: 1 - rub.progress }} />
            {rub.at && <span className="pointer-events-none absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40 blur-md" style={{ left: rub.at.x, top: rub.at.y }} />}
            <span className="pointer-events-none absolute inset-0 grid place-items-center text-[12px] font-black text-white drop-shadow">{rub.progress < 1 ? `Rub it clean · ${Math.round(rub.progress * 100)}%` : '✨'}</span>
          </div>
          <button className="text-[11px] font-bold text-white/55 underline" onClick={() => void scrub()} data-testid="plot-scrub-tap">…or tap to scrub</button>
        </div>
      )}
      {size && size.mode === 'grow' && (
        <div className="grid gap-2 rounded-2xl border border-[#39FF14]/40 bg-[#39FF14]/10 p-3" data-testid="plot-giant">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{size.prank ? '🤡' : '📡'}</span>
            <div className="min-w-0 flex-1 leading-tight"><div className="text-[13px] font-black text-[#B6FF3D]">GIANT · 100× its size{size.prank ? '' : ` · ×${Number(size.mult).toFixed(1)}`}</div>
              <div className="text-[11px] text-white/60">{dur((Date.parse(size.until) - Date.now()) / 1000)} left · {size.tips} visitors{size.mine ? '' : ` · @${size.owner_name}`}</div></div>
            {!size.mine && !size.visited && !size.by_me && <Button size="sm" variant="rainbow" onClick={async () => { try { const r = await api.sizeGiantVisit(gx, gy); feel('success'); toast.success(`+${r.you} Ink for visiting (they got +${r.them})`); void here.refetch(); invalidateGame(qc); } catch (e) { toast.error(toGameError(e).message); } }} data-testid="plot-giant-visit">Visit · tip</Button>}
          </div>
          {size.prank && <Pranked size={size} undo={undo} undoing={undoing} />}
          {!size.prank && size.mine && <button className="w-fit text-[11px] font-bold text-white/55 underline" onClick={() => void undo()} disabled={undoing} data-testid="plot-size-undo">Shrink it back to normal</button>}
        </div>
      )}
      {size && size.mode === 'shrink' && (
        <div className="grid gap-2 rounded-2xl border border-[#FF00E5]/40 bg-[#FF00E5]/10 p-3" data-testid="plot-tiny">
          <div className="flex items-center gap-2">
            <Magnifier gx={gx} gy={gy} rarity={size.rarity} plotType={plotType} />
            <div className="min-w-0 flex-1 leading-tight"><div className="text-[13px] font-black text-[#FF7AE0]">TINY · 100× smaller</div>
              <div className="text-[11px] text-white/60">{dur((Date.parse(size.until) - Date.now()) / 1000)} left{size.mine && !size.prank ? ' · three micro-gems are hidden in the dust' : size.mine ? '' : ` · @${size.owner_name}’s plot`}</div>
              <div className="text-[10.5px] text-white/45">Shown here under a magnifying glass — on the map it’s a speck.</div></div>
            {size.mine && !size.prank && rays[0] && <Button size="sm" variant="secondary" onClick={() => nav(`/grimoire/${rays[0].id}`)}>Search</Button>}
          </div>
          {size.prank && <Pranked size={size} undo={undo} undoing={undoing} />}
          {!size.prank && size.mine && <button className="w-fit text-[11px] font-bold text-white/55 underline" onClick={() => void undo()} disabled={undoing} data-testid="plot-size-undo">Grow it back to normal</button>}
        </div>
      )}
    </div>
  );
}

/** someone pulled a Size Ray prank on this plot */
function Pranked({ size, undo, undoing }: { size: { mine: boolean; by_name?: string | null; by_me?: boolean; mode: string }; undo(): void; undoing: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-black/25 px-2.5 py-2" data-testid="plot-pranked">
      <div className="min-w-0 flex-1 text-[11.5px] font-bold leading-snug text-white/80">
        {size.mine ? <>🤡 <b>@{size.by_name ?? '?'}</b> zapped your plot {size.mode === 'grow' ? 'GIANT' : 'TINY'} as a prank — only for show, nothing about your game changes.</>
          : size.by_me ? <>🤡 Your prank. Everyone on the map can see it.</>
          : <>🤡 A prank by <b>@{size.by_name ?? '?'}</b> — only for show.</>}
      </div>
      {size.mine && <Button size="sm" variant="secondary" onClick={undo} disabled={undoing} data-testid="plot-prank-undo">Undo it</Button>}
    </div>
  );
}

/** a tiny plot, seen through a magnifying glass: its drawing at a hundredth, then blown up in the lens */
function Magnifier({ gx, gy, rarity, plotType }: { gx: number; gy: number; rarity: string | null; plotType?: string | null }) {
  const art = usePlotArt(gx, gy);
  const c = rarityInfo(rarity ?? 'common').color;
  const swatch = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = swatch.current;
    if (!cv || art || !plotType) return;
    cv.width = cv.height = 96;
    drawPlotDesign(cv.getContext('2d')!, plotType as never, 96, (gx * 31 + gy) % 97);
  }, [art, plotType, gx, gy]);
  return (
    <div className="lv-magnifier relative grid h-16 w-16 shrink-0 place-items-center" aria-hidden>
      <div className="lv-magnifier-lens grid h-14 w-14 place-items-center overflow-hidden rounded-full" style={{ ['--c' as string]: c }}>
        {art ? <img src={art} alt="" className="h-[86%] w-[86%] rounded-[3px] object-cover" style={{ imageRendering: 'pixelated' }} />
          : plotType ? <canvas ref={swatch} className="h-[70%] w-[70%] rounded-[3px]" style={{ outline: `3px solid ${c}` }} />
          : <span className="grid h-[70%] w-[70%] place-items-center rounded-[4px] text-xl" style={{ border: `3px solid ${c}`, background: '#F4EFE6' }}>🖼️</span>}
      </div>
      <span className="lv-magnifier-handle" />
      <span className="absolute -bottom-1 -right-1 h-1 w-1 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} title="its real size" />
    </div>
  );
}
