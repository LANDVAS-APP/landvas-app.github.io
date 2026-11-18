// ✨ The star chart (/stars): your stars (where you have plots, and the ones you discovered), the Painted Stars, the
// fullest stars, the newest discoveries — tap one for its preview and the way there. Or look one up by its code.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import { ChevronLeft, Eye, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { cn } from '../lib/utils';
import { CLASS_BY_ID, GALAXY_SIZE, type StarClassId } from './galaxy';
import { StarPreview } from './StarPreview';
import type { StarCard } from './types';
import { CODEX_ORDER, EL, ELEMENTS, SPECIES, until } from './kinds/meta';

export default function StarChart() {
  const nav = useNavigate();
  const mine = useQuery({ queryKey: ['my-stars'], queryFn: api.myStars, staleTime: 15_000 });
  const chart = useQuery({ queryKey: ['stars-chart'], queryFn: api.starsChart, staleTime: 60_000 });
  const [open, setOpen] = useState<number | null>(null);
  const [tab, setTab] = useState<'mine' | 'painted' | 'fullest' | 'newest'>('mine');
  const [q, setQ] = useState('');
  const go = async (c: StarCard) => {
    if (c.here) { nav(`/star/${c.id}`); return; }
    try { await api.starWarp(c.id); nav(`/star/${c.id}`); } catch (e) { toast.error(toGameError(e).message); }
  };
  const find = () => {
    const s = q.trim().toUpperCase();
    const m = /^HIP\s*(\d+)$/.exec(s) ?? /^(\d+)$/.exec(s);
    if (m) { setOpen(Number(m[1])); return; }
    const lv = /^LV-?([0-9A-Z]+)$/.exec(s);
    if (lv) { setOpen(parseInt(lv[1], 36)); return; }
    toast('Look a star up by its code', { description: 'Like “LV-3K9F2QX” or “HIP 32349”.' });
  };
  const rows = tab === 'mine' ? (mine.data?.stars ?? []) : tab === 'painted' ? (chart.data?.painted ?? []) : tab === 'fullest' ? (chart.data?.fullest ?? []) : (chart.data?.newest ?? []);
  return (
    <div className="min-h-screen bg-[#05070f] pb-24 text-white" data-testid="star-chart">
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-[#05070f]/95 px-3 pb-2 pt-[max(10px,env(safe-area-inset-top,0px))]">
        <button className="grid h-10 w-10 place-items-center rounded-full bg-white/10" onClick={() => nav(-1)} aria-label="Back"><ChevronLeft className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[20px] font-black">✨ The stars</div>
          <div className="text-[11.5px] text-white/55">{Math.round(GALAXY_SIZE / 1e9)} billion stars · {chart.data?.totals.systems.toLocaleString() ?? '…'} claimed · {chart.data?.totals.painted ?? 0} painted</div>
        </div>
        <button className="lv-btn on h-10 px-3 text-[12.5px]" onClick={() => nav('/eyes?telescope=1')} data-testid="star-chart-telescope"><Eye className="mr-1 inline h-4 w-4" />Telescope</button>
      </div>
      <div className="grid gap-3 px-3">
        <div className="rounded-3xl bg-[linear-gradient(135deg,rgba(139,107,255,0.25),rgba(34,227,255,0.12))] p-4 text-[12.5px] leading-snug text-white/80">
          Look up in <b>Explorer’s Eyes</b> and pinch to zoom: binoculars, telescope, deep field, ultra deep — every zoom shows stars nobody’s seen yet. Tap one to see it up close, then warp there and claim plots on its shell. Star plots pay rent like Earth’s (a little more), and the first to claim a star is its <b>Discoverer</b>.
        </div>
        {mine.data && <div className="grid grid-cols-3 gap-2 text-center">
          <Tile k="Your star plots" v={mine.data.plots.toLocaleString()} />
          <Tile k="Stars" v={String(mine.data.stars.length)} />
          <Tile k="Rent an hour" v={`$${(mine.data.usd_per_second * 3600).toFixed(5)}`} />
        </div>}
        <div className="flex gap-1.5">
          <input className="h-10 min-w-0 flex-1 rounded-xl bg-white/8 px-3 text-[13px] outline-none" placeholder="Find a star by its code (LV-…, HIP …)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && find()} data-testid="star-chart-search" />
          <button className="grid h-10 w-10 place-items-center rounded-xl bg-white/10" onClick={find} aria-label="Find"><Search className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {([['mine', 'Yours'], ['painted', 'Painted'], ['fullest', 'Fullest'], ['newest', 'Newest']] as const).map(([k, l]) => (
            <button key={k} className={cn('shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-black', tab === k ? 'bg-white text-[#0b0b1e]' : 'bg-white/8')} onClick={() => setTab(k)} data-testid={`star-tab-${k}`}>{l}</button>
          ))}
        </div>
        {tab === 'mine' && <Things onOpen={setOpen} />}
        <div className="grid gap-1.5">
          {rows.length === 0 && <div className="rounded-2xl bg-white/5 p-4 text-center text-[13px] text-white/55">{tab === 'mine' ? 'No stars yet — look up through the telescope and find one.' : 'Nothing here yet.'}</div>}
          {rows.map((s) => {
            const C = CLASS_BY_ID[s.cls as StarClassId];
            const r = s as unknown as { id: number; name: string; cells: number; claimed?: number; color?: string | null; mine?: number; discoverer?: boolean | string | null; painted?: boolean };
            return (
              <button key={r.id} className="flex items-center gap-3 rounded-2xl bg-white/6 px-3 py-2.5 text-left" onClick={() => setOpen(r.id)} data-testid="star-row">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xl" style={{ background: `radial-gradient(circle, ${r.color ?? C?.glow ?? '#fff'}, transparent 70%)` }}>{C?.emoji ?? '✨'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-black">{r.name}{r.painted ? ' 🖼️' : ''}</span>
                  <span className="block truncate text-[11.5px] text-white/55">{C?.name} · {(r.claimed ?? 0).toLocaleString()}/{r.cells.toLocaleString()} plots{r.mine ? ` · ${r.mine} yours` : ''}{r.discoverer === true ? ' · 🔭 discovered by you' : typeof r.discoverer === 'string' ? ` · 🔭 @${r.discoverer}` : ''}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <AnimatePresence>{open != null && <StarPreview key={open} id={open} onClose={() => setOpen(null)} onGo={(c) => void go(c)} />}</AnimatePresence>
    </div>
  );
}

function Tile({ k, v }: { k: string; v: string }) {
  return <div className="rounded-2xl bg-white/6 px-2 py-2.5"><div className="font-display text-[17px] font-black">{v}</div><div className="text-[10.5px] font-bold uppercase tracking-wider text-white/45">{k}</div></div>;
}

/** what you've gathered among the stars */
function Things({ onOpen }: { onOpen(id: number): void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['my-star-things'], queryFn: api.myStarThings, staleTime: 20_000 });
  const d = q.data;
  if (!d) return null;
  const any = ELEMENTS.some((e) => d.els[e.id] > 0);
  const collect = async (id: number) => {
    try { const r = await api.starSailCollect(id); toast.success('The sail’s cargo is yours ⛵', { description: Object.entries(r.cargo ?? {}).map(([k, v]) => `${v} ${EL[k]?.name}`).join(', ') }); void qc.invalidateQueries({ queryKey: ['my-star-things'] }); }
    catch (e) { toast.error(toGameError(e).message); }
  };
  return (
    <div className="grid gap-2" data-testid="star-things">
      {any && <div className="flex flex-wrap gap-1.5 rounded-2xl bg-white/5 p-2.5">
        {ELEMENTS.filter((e) => d.els[e.id] > 0).map((e) => <span key={e.id} className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-[12px] font-bold tabular-nums"><span className="grid h-4 min-w-4 place-items-center rounded-full px-0.5 text-[9px] font-black text-[#0b0b1e]" style={{ background: e.color }}>{e.sym}</span>{d.els[e.id].toLocaleString()}</span>)}
      </div>}
      {d.sails_in.map((x) => (
        <div key={x.id} className="flex items-center justify-between gap-2 rounded-2xl bg-[#22E3FF]/10 px-3 py-2 text-[12.5px]">
          <span>⛵ A sail from @{x.from ?? 'someone'}: {Object.entries(x.cargo).map(([k, v]) => `${v} ${EL[k]?.sym}`).join(', ')}</span>
          {x.arrived || Date.parse(x.arrive_at) <= Date.now() ? <button className="rounded-full bg-[#22E3FF] px-3 py-1 text-[11.5px] font-black text-[#0b0b1e]" onClick={() => void collect(x.id)} data-testid="sail-collect">Collect</button> : <span className="text-[11px] text-white/55">lands in {until(x.arrive_at)}</span>}
        </div>
      ))}
      {Object.keys(d.codex).length > 0 && <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-white/5 p-2.5 text-[11.5px]">
        <span className="mr-1 font-black">🌱 Codex {Object.keys(d.codex).length}/7</span>
        {CODEX_ORDER.map((k) => <span key={k} title={SPECIES[k].name} className={cn('rounded-full px-1.5 py-0.5', d.codex[k] ? 'bg-white/12' : 'opacity-30')}>{SPECIES[k].emoji}</span>)}
      </div>}
      {d.exoplanets.map((x) => (
        <div key={x.world} className="flex items-center justify-between gap-2 rounded-2xl bg-white/5 px-3 py-2 text-[12.5px]">
          <span>🪐 <b>{x.name}</b> <span className="text-white/50">· an exoplanet you found</span></span>
          <button className="rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-bold" onClick={() => nav('/space')}>Fly there</button>
        </div>
      ))}
      {d.finds.map((f, i) => (
        <button key={i} className="flex items-center justify-between gap-2 rounded-2xl bg-white/5 px-3 py-2 text-left text-[12.5px]" onClick={() => onOpen(Number(f.data.star))}>
          <span>🕳️ A hidden black hole: <b>{f.data.code}</b></span><span className="text-[11px] font-bold text-[#9DE4FF]">Look</span>
        </button>
      ))}
    </div>
  );
}
