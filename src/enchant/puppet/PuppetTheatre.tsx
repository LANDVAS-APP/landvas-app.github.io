// 🎭 The theatre on the Puppeteer's page: a playlist of plots (yours, or anyone's in reach — from the lists or the map),
// Encore, and the show itself: every act plays live on the stage, the real game on strings, and the curtain calls stack up
// below. It plays on when you leave (the server finishes each act and starts the next while strings last).
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, type PuppetRun } from '../../backend/api';
import { toGameError } from '../../backend/backend';
import { cn } from '../../lib/utils';
import { rarityInfo } from '../../shared/rarity';
import { Button } from '../../ui';
import type { SceneProps } from '../core';
import { dur } from '../kinds';
import { feel } from '../living';
import { usePickOnMapFor } from '../PlotPickOverlay';
import { pickedFor, usePlotPick } from '../plotPick';
import { PUPPET_EVENT, gameName } from './names';
import { PuppetStage } from './PuppetStage';

type Cand = { gx: number; gy: number; rarity: string; name: string | null; game: string; plot_type?: string; owner_name?: string | null; next?: number | null; m?: number; own: boolean };
const key = (p: { gx: number; gy: number }) => `${p.gx}:${p.gy}`;

export function PuppetTheatre({ v, view, act, busy, at }: SceneProps) {
  const qc = useQueryClient();
  const pickOnMap = usePickOnMapFor();
  const show = view.show as { on: boolean; plots: [number, number][]; encore: boolean; waiting?: string | null } | null;
  const runs: PuppetRun[] = view.runs ?? [];
  const calls: PuppetRun[] = view.curtain_calls ?? [];
  const max = Number(view.playlist_max ?? 3), slots = Number(view.slots ?? 1);
  const own: Cand[] = (view.own_plots ?? []).map((p: any) => ({ ...p, own: true }));
  const near: Cand[] = (view.nearby ?? []).map((p: any) => ({ ...p, own: false }));
  // plots picked further out on the map (checked by the server) and the ones already on the show's playlist
  const [extra, setExtra] = useState<Cand[]>([]);
  // (later entries win: the server's own check of a playlist plot over the plain lists)
  const all = useMemo(() => new Map([...own, ...near, ...extra, ...(view.playlist ?? []).filter((p: any) => p.game)].map((p) => [key(p), p as Cand])),
    [view.own_plots, view.nearby, view.playlist, extra]); // eslint-disable-line react-hooks/exhaustive-deps
  const [list, setList] = useState<[number, number][]>(show?.plots ?? []);
  const [encore, setEncore] = useState<boolean>(show?.encore ?? true);
  const [adding, setAdding] = useState<'own' | 'near' | null>(null);
  const on = !!show?.on;
  useEffect(() => { if (show?.plots) setList(show.plots); }, [JSON.stringify(show?.plots)]); // eslint-disable-line react-hooks/exhaustive-deps
  // a plot picked on the map joins the playlist — once the server says the puppet can play it
  useEffect(() => {
    const d = pickedFor(v.id, 'playlist');
    if (!d) return;
    usePlotPick.getState().clear();
    const keep = (d.keep?.list as [number, number][] | undefined) ?? null;
    if (keep) setList(keep);
    void api.enchantAct(v.id, 'peek', { gx: d.plot.gx, gy: d.plot.gy }).then((r) => {
      const p = r.result as Cand & { why?: string | null };
      if (p?.why) { toast.error(toGameError({ message: p.why }).message); return; }
      setExtra((x) => [...x.filter((c) => key(c) !== key(p)), p]);
      setList((l) => (l.some(([x, y]) => x === p.gx && y === p.gy) || l.length >= max ? l : [...l, [p.gx, p.gy]]));
      feel('success');
    }).catch((e) => toast.error(toGameError(e).message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // the server's clock (to know when an act is due)
  const skew = useRef(0);
  useEffect(() => { if (view.server_now) skew.current = Number(view.server_now) - at / 1000; }, [view.server_now, at]);
  // when an act is due — or the show waits for a string — ask the server to move it along (it pays, and raises the next curtain)
  const ticking = useRef(false);
  useEffect(() => {
    if (!on && !runs.length) return;
    const tick = async () => {
      if (ticking.current || document.hidden) return;
      const now = Date.now() / 1000 + skew.current;
      const due = runs.some((r) => !r.finished && r.due_at <= now);
      const idle = on && runs.length < Math.min(slots, list.length || 1);
      if (!due && !(idle && Math.random() < 0.15)) return;
      ticking.current = true;
      try { const r = await api.enchantAct(v.id, 'tick', {}); qc.setQueryData(['enchant', v.id], r); } catch { /* the next tick tries again */ }
      ticking.current = false;
    };
    const t = setInterval(() => void tick(), 1000);
    return () => clearInterval(t);
  }, [on, JSON.stringify(runs.map((r) => [r.id, r.due_at])), slots, list.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // which act the stage shows: it finishes the one it's on (and its bow) before it moves to the next
  const [slot, setSlot] = useState(0);
  const [stage, setStage] = useState<PuppetRun | null>(null);
  useEffect(() => {
    if (stage) return;
    const next = runs.find((r) => r.slot === slot) ?? runs[0];
    if (next) setStage(next);
  }, [JSON.stringify(runs.map((r) => r.id)), slot, !!stage]); // eslint-disable-line react-hooks/exhaustive-deps
  const stageResult = stage ? calls.find((c) => c.id === stage.id)?.result ?? null : null;
  // a new curtain call: a cheer
  const seen = useRef<Set<string>>(new Set(calls.map((c) => c.id)));
  useEffect(() => {
    for (const c of calls) {
      if (seen.current.has(c.id)) continue;
      seen.current.add(c.id);
      if (stage?.id === c.id) continue;
      if (c.result?.passed) toast.success(`🎭 +1 level complete · +${Math.round(Number(c.result.ink))} Ink`, { description: `${gameName(c.game)} level ${c.level} on ${c.own ? 'your plot' : `@${c.owner_name}’s plot`}` });
      else toast(`🪢 The strings tangled on ${gameName(c.game)} level ${c.level}`);
    }
  }, [JSON.stringify(calls.map((c) => c.id))]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    feel('heavy');
    const r = await act('show', { plots: list, encore });
    // (the stage keeps the act it's on; a fresh show's first act takes the stage as soon as it's dealt)
    if (r) window.dispatchEvent(new Event(PUPPET_EVENT));
  };
  const add = (p: Cand) => { setList((l) => (l.some(([x, y]) => x === p.gx && y === p.gy) || l.length >= max ? l : [...l, [p.gx, p.gy]])); feel('light'); };
  // the map: the plots in the lists wear crosshairs, and any plot with a game inside the strings' reach can be tapped
  const reach = view.range_m == null ? null : Number(view.range_m);
  const anchors = useMemo(() => {
    const a: [number, number][] = [];
    if (Array.isArray(view.explorer)) a.push([Number(view.explorer[0]), Number(view.explorer[1])]);
    for (const p of own.slice(0, 30)) a.push([p.gx, p.gy]);
    if (!a.length) a.push([v.gx, v.gy]);
    return a;
  }, [view.explorer, view.own_plots, v.gx, v.gy]); // eslint-disable-line react-hooks/exhaustive-deps
  const onMap = () => pickOnMap({ id: v.id, slot: 'playlist', title: 'Add a plot to the show', emoji: '🎭', color: '#FFB703', back: `/grimoire/${v.id}`, keep: { list },
    hint: reach == null ? 'Tap any plot with a game on it — yours or anyone’s, anywhere' : `Tap any plot with a game on it — yours, or anyone’s within ${reach >= 1000 ? `${Math.round(reach / 1000)} km` : `${reach} m`}`,
    allowed: [...all.values()].map((p) => ({ gx: p.gx, gy: p.gy, rarity: p.rarity, name: p.name, plot_type: p.plot_type, note: `${p.own ? 'yours' : `@${p.owner_name}`} · ${gameName(p.game)}` })),
    free: { anchors: reach == null ? [] : anchors, radiusM: reach, use: 'Add it to the show' } });
  const strings = Number(view.strings ?? 0);

  return (
    <section className="grid gap-2.5 rounded-3xl border border-[#FFB703]/30 bg-[linear-gradient(160deg,#3A0D1255,#1C060755)] p-3" data-testid="puppet-theatre">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-[17px] font-black text-[#FFE8A3]">🎭 The show</span>
        <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-black text-white/70">{view.pay_pct ?? 75}% of a level’s Ink · {slots > 1 ? 'two puppets at once' : 'one act at a time'}</span>
        {on && <span className="ml-auto rounded-full bg-[#3DDC97]/20 px-2 py-0.5 text-[11px] font-black text-[#3DDC97]" data-testid="puppet-on">● LIVE</span>}
      </div>

      {(on || runs.length > 0 || stage) && (
        <div className="grid gap-1.5">
          {slots > 1 && runs.length > 1 && (
            <div className="flex gap-1.5">{[0, 1].map((s) => <button key={s} className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-black', slot === s ? 'bg-[#FFB703] text-[#2A0509]' : 'bg-white/10 text-white/70')}
              onClick={() => { setSlot(s); setStage(null); }} data-testid={`puppet-slot-${s}`}>Puppet {s + 1}</button>)}</div>
          )}
          {stage ? <PuppetStage key={stage.id} run={stage} result={stageResult} onDone={() => setStage(null)} />
            : <div className="grid aspect-[4/3] place-items-center rounded-2xl bg-black/30 text-center text-[12px] text-white/60" data-testid="puppet-waiting">
                {show?.waiting === 'no_strings' ? `🧵 Waiting for a string — the next act starts as soon as one comes back${view.next_in != null ? ` (in ${dur(view.next_in)})` : ''}`
                  : show?.waiting ? `The show is stuck: ${show.waiting.replace(/_/g, ' ')}` : 'The curtain is about to rise…'}
              </div>}
        </div>
      )}

      {/* the playlist */}
      <div className="grid gap-1.5" data-testid="puppet-playlist">
        <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-white/60"><span>Playlist · {list.length}/{max}</span>
          <label className="flex items-center gap-1.5 normal-case tracking-normal"><input type="checkbox" checked={encore} onChange={(e) => { setEncore(e.target.checked); if (on) void act('encore', { on: e.target.checked }); }} data-testid="puppet-encore" />
            <span className="text-[12px] font-bold text-white/80">Encore (keep climbing a plot)</span></label></div>
        <AnimatePresence initial={false}>
          {list.map(([gx, gy], i) => {
            const p = all.get(`${gx}:${gy}`);
            const live = runs.find((r) => r.gx === gx && r.gy === gy);
            return (
              <motion.div key={`${gx}:${gy}`} layout className={cn('flex items-center gap-2 rounded-xl p-2', live ? 'bg-[#FFB703]/15 ring-1 ring-[#FFB703]/50' : 'bg-white/[0.05]')} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} data-testid="puppet-playlist-item">
                <span className="w-5 text-center text-[12px] font-black text-white/50">{i + 1}</span>
                <span className="h-3 w-3 rounded-full" style={{ background: rarityInfo(p?.rarity ?? 'common').color }} />
                <span className="grid min-w-0 flex-1 leading-tight"><span className="truncate text-[12.5px] font-black">{p ? (p.own ? (p.name ?? 'Your plot') : `@${p.owner_name}’s plot`) : `${gx}, ${gy}`}</span>
                  <span className="text-[10.5px] text-white/55">{p ? gameName(p.game) : ''}{live ? ` · 🎭 playing level ${live.level}` : p?.next ? ` · next level ${p.next}` : ''}</span></span>
                <button className="px-1 text-[13px] text-white/50" onClick={() => setList((l) => l.filter((_, j) => j !== i))} aria-label="Take it off the playlist">✕</button>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" disabled={list.length >= max || !own.length} onClick={() => setAdding(adding === 'own' ? null : 'own')} data-testid="puppet-add-own">+ Your plots</Button>
          <Button size="sm" variant="secondary" disabled={list.length >= max || !near.length} onClick={() => setAdding(adding === 'near' ? null : 'near')} data-testid="puppet-add-near">+ Someone’s plot</Button>
          <Button size="sm" variant="ghost" disabled={list.length >= max} onClick={onMap} data-testid="puppet-add-map">🗺️ On the map</Button>
        </div>
        {adding && (
          <div className="grid max-h-[220px] gap-1 overflow-y-auto rounded-xl bg-black/25 p-1.5" data-testid="puppet-add-list">
            {(adding === 'own' ? own : near).filter((p) => !list.some(([x, y]) => x === p.gx && y === p.gy)).map((p) => (
              <button key={key(p)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/5" onClick={() => add(p)} data-testid="puppet-add-pick">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: rarityInfo(p.rarity).color }} />
                <span className="min-w-0 flex-1 truncate text-[12px] font-bold">{p.own ? (p.name ?? 'Your plot') : `@${p.owner_name}`} · {gameName(p.game)}</span>
                <span className="text-[10px] text-white/50">{p.own ? (p.next ? `level ${p.next}` : 'all beaten') : `${((p.m ?? 0) / 1000).toFixed(1)} km`}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="rainbow" size="lg" className="flex-1" disabled={!!busy || !list.length} onClick={() => void start()} data-testid="puppet-show-go">
          {on ? '🎭 Update the show' : strings < 1 && !view.grand_ready && !view.medley ? `🎭 Start the show (strings in ${dur(view.next_in)})` : '🎭 Start the show'}
        </Button>
        {on && <Button size="lg" variant="ghost" disabled={!!busy} onClick={() => void act('stop')} data-testid="puppet-show-stop">Stop</Button>}
      </div>

      {calls.length > 0 && (
        <div className="grid gap-1" data-testid="puppet-calls">
          <div className="text-[11px] font-black uppercase tracking-wider text-white/55">Curtain calls · {view.auto_levels ?? 0} levels cleared on strings{Number(view.auto_ink ?? 0) > 0 ? ` · +${Math.round(Number(view.auto_ink))} Ink` : ''}</div>
          {calls.slice(0, 6).map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-[12px] text-white/80" data-testid="puppet-call">
              <span>{c.result?.passed ? '👏' : '🪢'}</span>
              <span className="min-w-0 flex-1 truncate">{gameName(c.game)} · level {c.level} · {c.own ? 'your plot' : `@${c.owner_name}`}{c.grand ? ' · 🎪' : ''}</span>
              <span className={cn('font-black', c.result?.passed ? 'text-[#3DDC97]' : 'text-white/45')}>{c.result?.passed ? `+${Math.round(Number(c.result.ink))}` : `round ${(c.result?.cleared ?? 0) + 1}`}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-center text-[11px] text-white/50">One string an act. Your plots climb their own levels; anyone else’s climb your puppet’s own ladder there (theirs never move — they get a tip). The show plays on while you’re away, and closes a day after you were last around.</p>
    </section>
  );
}
