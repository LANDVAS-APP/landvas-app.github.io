// The top bar: find any player (name, email or id) or jump to a plot by its coordinates.
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MapPin, Search } from 'lucide-react';
import { PlayerAvatar } from '../../src/ui';
import { cn } from '../../src/lib/utils';
import { portal } from '../shared/api';
import { Badge, statusTone, useDebounced } from '../shared/ui';
import { ago } from '../shared/format';

export function TopSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const nav = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const d = useDebounced(q.trim(), 220);
  const plot = /^\s*(\d{3,8})[\s,·]+(\d{3,8})\s*$/.exec(q.replace(/(\d)\s(?=\d{3}\b)/g, '$1'));
  const res = useQuery({ queryKey: ['top-search', d], queryFn: () => portal.players({ q: d, limit: 8, sort: 'last_active_at' }), enabled: d.length >= 2 });
  const rows = res.data?.rows ?? [];
  const items = [...(plot ? [{ kind: 'plot' as const, gx: Number(plot[1]), gy: Number(plot[2]) }] : []), ...rows.map((r: any) => ({ kind: 'player' as const, r }))];
  useEffect(() => { setI(0); }, [d]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const go = (it: (typeof items)[number]) => {
    setOpen(false); setQ('');
    if (it.kind === 'plot') nav(`/map?gx=${it.gx}&gy=${it.gy}`); else nav(`/players/${it.r.id}`);
  };
  return (
    <div ref={box} className="relative max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <input className="p-input h-10 w-full pl-9" placeholder="Find a player by name, email or id — or a plot by its numbers" value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} aria-label="Search players and plots" data-testid="top-search"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
          if (e.key === 'Enter' && items[i]) go(items[i]);
          if (e.key === 'Escape') setOpen(false);
        }} />
      {open && (d.length >= 2 || plot) && (
        <div className="absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-xl border border-line-strong bg-[rgba(10,15,38,0.98)] shadow-2xl" role="listbox">
          {items.map((it, k) => (
            <button key={it.kind === 'plot' ? 'plot' : it.r.id} role="option" aria-selected={k === i} onMouseEnter={() => setI(k)} onClick={() => go(it)}
              className={cn('flex w-full items-center gap-3 px-3 py-2 text-left text-sm', k === i && 'bg-accent/15')}>
              {it.kind === 'plot' ? (
                <><MapPin className="h-4 w-4 text-accent-2" /><span>Go to plot <b className="tnum">{it.gx} · {it.gy}</b> on the world map</span></>
              ) : (
                <>
                  <PlayerAvatar p={it.r} size={26} />
                  <span className="min-w-0 flex-1"><b>@{it.r.username}</b> <span className="text-faint">{it.r.email}</span></span>
                  <span className="hidden text-xs text-muted sm:inline">{it.r.plots} plots · {ago(it.r.last_active_at)}</span>
                  {it.r.status !== 'active' && <Badge tone={statusTone(it.r.status)}>{it.r.status}</Badge>}
                </>
              )}
            </button>
          ))}
          {!items.length && <div className="px-3 py-3 text-sm text-muted">{res.isFetching ? 'Searching…' : 'No players match.'}</div>}
        </div>
      )}
    </div>
  );
}
