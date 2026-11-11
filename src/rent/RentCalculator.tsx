// My Plots' rent calculator: what your land makes in a day, a week and a month — normally, and if you kept a boost
// running 24/7 — and how much of it each rarity and each plot type brings in. Everything comes from the same rent
// state the money ticker uses (the base rate, Solar/Lunar/Comet windows, today's Chaos-style multipliers, rent day).
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../backend/api';
import { qk } from '../lib/queries';
import { cn } from '../lib/utils';
import { PLOT_TYPES } from '../map/plotStyle';
import { rarityInfo, type RarityId } from '../shared/rarity';
import { formatUsd, type RentState } from '../shared/rent';
import { useRent } from './RentHud';

const DAY = 86400;
export function rentProjection(r: RentState) {
  const base = Number(r.rate_usd_per_second) || 0;
  const boost = Number(r.boost?.multiplier) || 1;
  const windows = (r.extras?.windows ?? []).reduce((s, w) => s + Number(w.rate) * Number(w.len) * 3600, 0);
  const daily = Number(r.extras?.daily?.rate ?? 0) * DAY;
  const landlordMonth = r.landlord ? Number(r.landlord.rate) * (Number(r.landlord.multiplier) - 1) * DAY : 0;
  const day = (b: number) => base * b * DAY + windows + daily;
  return {
    base, boost,
    normal: { day: day(1), week: day(1) * 7, month: day(1) * 30 + landlordMonth },
    boosted: { day: day(boost), week: day(boost) * 7, month: day(boost) * 30 + landlordMonth },
    landlordMonth,
  };
}

type Plot = { rarity: RarityId; plot_type: string; usd_per_second: number | string };

export function RentCalculator() {
  const { rent } = useRent();
  const plots = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots, staleTime: 60_000 });
  const [open, setOpen] = useState(false);
  const [by, setBy] = useState<'rarity' | 'type'>('rarity');
  if (!rent) return null;
  const p = rentProjection(rent);
  const list = (plots.data ?? []) as Plot[];
  const total = list.reduce((s, x) => s + (Number(x.usd_per_second) || 0), 0) || 1;
  const groups = new Map<string, { n: number; usd: number }>();
  for (const x of list) {
    const k = by === 'rarity' ? x.rarity : x.plot_type;
    const g = groups.get(k) ?? { n: 0, usd: 0 };
    g.n++; g.usd += Number(x.usd_per_second) || 0; groups.set(k, g);
  }
  const rows = [...groups.entries()].sort((a, b) => b[1].usd - a[1].usd);
  const cell = (v: number, hi = false) => <span className={cn('tnum', hi && 'font-black text-[#3DDC97]')}>{formatUsd(v)}</span>;
  return (
    <div className="glass rounded-3xl p-4" data-testid="rent-calculator">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen((o) => !o)}>
        <span className="font-display text-[15px] font-bold">🧮 Rent calculator</span>
        <span className="text-xs font-bold text-muted">{formatUsd(p.normal.day)}/day{open ? ' ▲' : ' ▼'}</span>
      </button>
      {open && (
        <div className="mt-3 grid gap-4">
          <div className="overflow-hidden rounded-2xl border border-line">
            <div className="grid grid-cols-[1fr_1fr_1fr] bg-surface-2/70 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-muted"><span /><span>Normal</span><span>Boosted 24/7 (×{p.boost})</span></div>
            {(['day', 'week', 'month'] as const).map((k) => (
              <div key={k} className="grid grid-cols-[1fr_1fr_1fr] border-t border-line px-3 py-2 text-sm" data-testid={`calc-${k}`}>
                <span className="font-bold capitalize">Per {k}</span>{cell(p.normal[k])}{cell(p.boosted[k], true)}
              </div>
            ))}
          </div>
          <p className="-mt-2 text-[11px] text-muted">
            From your current rate ({formatUsd(p.base)}/s), Solar/Lunar/Comet hours and today’s day-by-day multipliers{p.landlordMonth ? ', plus rent day (in the month)' : ''}. Boosts multiply the base rate; ultra extras and rent day aren’t boosted.
          </p>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-black uppercase tracking-wider text-muted">Where it comes from</span>
              <div className="flex rounded-full bg-surface-2 p-0.5 text-[11px] font-bold">
                {(['rarity', 'type'] as const).map((b) => <button key={b} className={cn('rounded-full px-2.5 py-1', by === b && 'bg-accent text-white')} onClick={() => setBy(b)} data-testid={`calc-by-${b}`}>{b === 'rarity' ? 'Rarity' : 'Plot type'}</button>)}
              </div>
            </div>
            {rows.map(([k, g]) => {
              const share = g.usd / total;
              const color = by === 'rarity' ? rarityInfo(k).color : PLOT_TYPES[k as keyof typeof PLOT_TYPES]?.a ?? '#888';
              const name = by === 'rarity' ? `${rarityInfo(k).emoji ?? ''} ${rarityInfo(k).name}` : PLOT_TYPES[k as keyof typeof PLOT_TYPES]?.name ?? k;
              return (
                <div key={k} className="grid gap-1" data-testid="calc-row">
                  <div className="flex items-baseline justify-between text-[12px]"><span className="font-bold" style={{ color }}>{name} <span className="text-muted">×{g.n}</span></span><span className="tnum text-muted">{Math.round(share * 100)}% · {formatUsd(p.normal.day * share)}/day</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.max(2, share * 100)}%`, background: color }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
