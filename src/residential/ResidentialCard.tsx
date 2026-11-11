// In the plot panel for a Residential plot: your house (its size, what it has, what the next size adds and how
// close you are), or your rentals (when rent day is, and the 50x it pays).
import { ArrowRight, Lock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../backend/api';
import type { CanvasGroup } from '../backend/types';
import { squareProgress } from '../realms/estates/meta';
import { useTicker } from '../play/common';
import { Button } from '../ui';
import { HOUSE_LADDER, LANDLORD_MULT, houseSizeOf, rentDay } from './ladder';

const feats = (s: (typeof HOUSE_LADDER)[number]) => [
  `${s.floors} floor${s.floors > 1 ? 's' : ''}`, s.floors > 1 && 'stairs', s.balcony && 'balconies', s.roof && 'roof terrace', s.elevator && 'lift', s.pool && 'rooftop pool',
].filter(Boolean) as string[];

function Square({ n, have }: { n: number; have: boolean[] }) {
  return (
    <div className="grid shrink-0 gap-[2px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, width: Math.min(76, 14 * n + 6) }} aria-hidden>
      {have.map((h, i) => <div key={i} className="aspect-square rounded-[3px] border" style={h ? { background: '#E0745C', borderColor: '#E0745C' } : { borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.25)' }} />)}
    </div>
  );
}

export function HouseCard({ group }: { group: CanvasGroup }) {
  const nav = useNavigate();
  const cells = (group.cells ?? []) as [number, number, ...unknown[]][];
  const n = houseSizeOf(cells), cur = HOUSE_LADDER[n - 1], next = HOUSE_LADDER[n];
  const p = next ? squareProgress(cells, next.size) : null;
  const have: boolean[] = [];
  if (p) for (let j = 0; j < p.n; j++) for (let i = 0; i < p.n; i++) have.push(!p.missing.some(([x, y]) => x === p.x + i && y === p.y + j));
  return (
    <div className="rounded-2xl border border-[#E0745C]/40 bg-[#E0745C]/10 p-3" data-testid="house-card" data-size={n}>
      <div className="flex items-center gap-3">
        <span className="text-3xl">🏠</span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#E0745C]">Residential · Home · {n}×{n}</div>
          <div className="font-display text-base font-bold">{cur.name}</div>
          <div className="text-xs text-muted">{feats(cur).join(' · ')}</div>
        </div>
        <Button size="sm" variant="primary" onClick={() => nav('/home')} data-testid="open-home">Enter <ArrowRight className="h-4 w-4" /></Button>
      </div>
      {next && p && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface/40 p-2.5" data-testid="house-next">
          <Square n={next.size} have={have} />
          <div className="min-w-0 flex-1 text-xs">
            <div className="flex items-center gap-1 font-bold"><Lock className="h-3 w-3" /> {next.size}×{next.size} {next.name}: {next.unlock}</div>
            <div className="text-muted">Merge {next.size * next.size - p.have} more Home plot{next.size * next.size - p.have === 1 ? '' : 's'} into a {next.size}×{next.size} square.</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function LandlordCard({ group }: { group: CanvasGroup }) {
  useTicker(1000);
  const r = rentDay();
  const left = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
  return (
    <div className="rounded-2xl border border-[#6FA3D9]/40 bg-[#3E6E9C]/15 p-3" data-testid="landlord-card" data-rent-day={r.today}>
      <div className="flex items-center gap-3">
        <span className="text-3xl">🏘️</span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#6FA3D9]">Residential · Landlord · {group.plot_count} plot{group.plot_count === 1 ? '' : 's'}</div>
          {r.today
            ? <div className="font-display text-base font-bold text-gold">💵 It’s rent day! {LANDLORD_MULT}× USD rent for {left(r.end - Date.now())} more</div>
            : <div className="font-display text-base font-bold">Next rent day in {left(r.next - Date.now())}</div>}
          <div className="text-xs text-muted">Your tenants pay on the 1st of every month (UTC, {new Date(r.today ? r.start : r.next).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} your time): these plots earn {LANDLORD_MULT}× their USD rent all day — if this month’s checklist is done.</div>
        </div>
      </div>
      <EstateStatus group={group} />
    </div>
  );
}

/** this estate's checklist at a glance, and the way in */
function EstateStatus({ group }: { group: CanvasGroup }) {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['estates'], queryFn: api.myEstates, staleTime: 60_000 });
  const e = q.data?.find((x) => x.group_id === group.id);
  const done = e ? (['inspect', 'repairs', 'requests', 'garden'] as const).filter((k) => e.tasks[k].done >= e.tasks[k].need).length : 0;
  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl bg-black/20 p-2.5">
      <div className="min-w-0 flex-1 text-xs">
        <div className="font-bold">{e?.eligible ? `✓ Checklist done — ${LANDLORD_MULT}× on rent day` : `📋 Checklist ${done}/4 — needed for ${LANDLORD_MULT}× on rent day`}</div>
        <div className="text-muted">Inspect, fix repairs, help tenants and water the garden in your 3D estate.</div>
      </div>
      <Button size="sm" variant="primary" onClick={() => nav(`/landlord/${group.id}`)} data-testid="enter-estate">🏘️ Enter <ArrowRight className="h-3.5 w-3.5" /></Button>
    </div>
  );
}
