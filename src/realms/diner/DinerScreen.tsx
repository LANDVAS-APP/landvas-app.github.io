// 🍔 The Restaurant: run the kitchen. Open for a shift and customers walk in, sit and order. Tap a dish on the menu
// to start cooking it at its station; when it's done, tap the station to put it on your tray (before it burns!);
// tap a table's ticket (or the table) to serve it. Quick service, bigger tips; the ⭐ dish of the day pays double.
// Between shifts: buy and speed up stations, add tables, redecorate, hire a night crew, stock the pantry.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Menu } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../../backend/api';
import { toGameError } from '../../backend/backend';
import type { Bag, Realm } from '../../backend/types';
import { invalidateGame } from '../../lib/queries';
import { useUi } from '../../lib/store';
import { cn } from '../../lib/utils';
import { Button, Dialog, PlayerAvatar, Spinner } from '../../ui';
import { confettiCannons } from '../../ui/confetti';
import { sfx } from '../../arcade/sfx';
import { fmt, useRealmCore } from '../core';
import { BurgerStack } from './BurgerStack';
import { createDiner3D, type DinerScene } from './diner3d';
import { slots, tipFor, STATION_ORDER, type DinerCore, type Shift, type ShiftResult } from './dinerCore';
import { config } from '../../env';

type Cust = { c: Shift['customers'][number]; status: 'coming' | 'queue' | 'seated' | 'eating' | 'done' | 'gone'; table?: number; got: boolean[]; eatUntil?: number };
type Slot = { kind: string; cooking?: { dish: string; start: number; dur: number }; ready?: { dish: string; at: number }; burnt?: number };
type Run = { shift: Shift; t0: number; t: number; served: { i: number; at: number }[]; lastServe: number; cust: Cust[]; tables: (number | null)[]; slots: Slot[]; tray: string[]; stock: Bag; tips: number; lost: number; ended: boolean };

export default function DinerScreen({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['diner', id], queryFn: () => api.dinerGet(id), staleTime: 30_000, refetchOnWindowFocus: false });
  if (q.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#2B1E2A]"><Spinner /></div>;
  if (q.error || !q.data) return <div className="fixed inset-0 grid place-content-center gap-3 bg-[#2B1E2A] p-6 text-center text-white"><div className="text-5xl">🍔</div><p>This restaurant couldn’t be found.</p><Link to="/world"><Button variant="secondary">Back to the map</Button></Link></div>;
  return <Diner key={q.data.id} data={q.data} />;
}

function Diner({ data }: { data: Realm & { diner_core: DinerCore } }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const [r, setR] = useState<Realm>(data);
  const [core, setCore] = useState<DinerCore>(data.diner_core);
  const [dlg, setDlg] = useState<'upgrades' | 'pantry' | 'menu' | 'more' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ShiftResult | null>(null);
  const [, render] = useState(0);
  const cv = useRef<HTMLCanvasElement>(null);
  const scene = useRef<DinerScene | null>(null);
  const run = useRef<Run | null>(null);
  const R = useRealmCore({ r, setR, extraGames: { stack: BurgerStack }, burst: (_a, e) => scene.current?.burst(null, e) });
  const c = core.cfg, wallet = r.me.wallet, tips = wallet.tips ?? 0;
  const emo = (k: string) => r.cfg.resources[k]?.emoji ?? c.dishes[k]?.emoji ?? '❔';
  const layout = useMemo(() => slots(core.stations), [core.stations]);
  const apply = (x: { diner: DinerCore; me: Realm['me']; level: Realm['level']; level_up?: number | null }) => { setCore(x.diner); setR((cur) => ({ ...cur, me: x.me, level: x.level })); if (x.level_up) R.levelUp(x.level_up); };
  const act = async <T,>(k: string, f: () => Promise<T>) => { setBusy(k); try { return await f(); } catch (e) { const er = toGameError(e); toast.error(er.code === 'not_enough' ? 'Not enough tips for that yet' : er.code === 'level_too_low' ? 'Level up your restaurant first' : er.message); return null; } finally { setBusy(null); } };

  useEffect(() => {
    if (!cv.current) return;
    const s = createDiner3D({ canvas: cv.current, reduceMotion: reduce, onTapStation: (i) => tapSlot.current(i), onTapTable: (t) => tapTable.current(t) });
    scene.current = s;
    if (import.meta.env.DEV || config.e2e) Object.assign(window, { __landvasDiner: { scene: s, run: () => run.current } });
    return () => { s.dispose(); scene.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scene.current?.setLayout(layout, core.tables, core.decor, core.crew); }, [layout, core.tables, core.decor, core.crew]);
  useEffect(() => { scene.current?.setPaused(!!R.game); }, [R.game]);

  // ---- the shift -------------------------------------------------------------------------------------------------------
  const open = async () => {
    const x = await act('open', () => api.dinerOpen(r.id));
    if (!x) return;
    const sh = x.shift;
    run.current = { shift: sh, t0: performance.now(), t: 0, served: [], lastServe: -1e9, cust: sh.customers.map((cu) => ({ c: cu, status: 'coming', got: cu.order.map(() => false) })),
      tables: Array(core.tables).fill(null), slots: layout.map((s) => ({ kind: s.kind })), tray: [], stock: { ...wallet }, tips: 0, lost: 0, ended: false };
    scene.current?.setOpen(true); sfx.win?.(1); render((n) => n + 1);
  };
  const close = async () => {
    const ru = run.current; if (!ru || ru.ended) return;
    ru.ended = true; scene.current?.clear(); scene.current?.chefTo({});
    for (let i = 0; i < ru.slots.length; i++) scene.current?.setStation(i, { kind: ru.slots[i].kind });
    const x = await act('close', () => api.dinerClose(r.id, ru.shift.id, ru.served));
    run.current = null; render((n) => n + 1);
    if (!x) return;
    apply(x); setResult(x.result); invalidateGame(qc);
    if (x.result.stars >= 3 || x.result.best) { confettiCannons(); sfx.win(4); } else sfx.coin();
  };
  useEffect(() => {
    const iv = setInterval(() => {
      const ru = run.current, s = scene.current; if (!ru || ru.ended) return;
      const t = performance.now() - ru.t0; ru.t = t; const pat = ru.shift.patience * 1000;
      if (t >= ru.shift.seconds * 1000) { void close(); return; }
      for (const cu of ru.cust) {
        if (cu.status === 'coming' && cu.c.at <= t) cu.status = 'queue';
        if (cu.status === 'queue') { const free = ru.tables.findIndex((x) => x === null); if (free >= 0) { ru.tables[free] = cu.c.i; cu.table = free; cu.status = 'seated'; s?.enter(cu.c.i, cu.c.look, free, cu.c.look % 2, cu.c.order.map(emo)); } }
        if (cu.status === 'queue' || cu.status === 'seated') {
          const wait = t - cu.c.at;
          if (wait > pat) { if (cu.status === 'seated') { s?.leave(cu.c.i, false); ru.tables[cu.table!] = null; } cu.status = 'gone'; ru.lost++; sfx.fail(); continue; }
          if (cu.status === 'seated') s?.order(cu.c.i, cu.c.order.filter((_, k) => !cu.got[k]).map(emo), 1 - wait / pat);
        }
        if (cu.status === 'eating' && t >= (cu.eatUntil ?? 0)) { cu.status = 'done'; ru.tables[cu.table!] = null; s?.leave(cu.c.i, true, tipFor(cu.c.order, (ru.served.find((x) => x.i === cu.c.i)?.at ?? t) - cu.c.at, ru.shift.patience, core.decor, c, ru.shift.special)); }
      }
      ru.slots.forEach((sl, i) => {
        if (sl.cooking && t >= sl.cooking.start + sl.cooking.dur) { sl.ready = { dish: sl.cooking.dish, at: t }; sl.cooking = undefined; sfx.tick(); }
        if (sl.ready && t - sl.ready.at > c.burn_seconds * 1000) { sl.ready = undefined; sl.burnt = t; sfx.fail(); s?.burst({ slot: i }, ['🔥', '💨']); }
        if (sl.burnt && t - sl.burnt > 2500) sl.burnt = undefined;
        s?.setStation(i, { kind: sl.kind, cooking: sl.cooking && { emoji: emo(sl.cooking.dish), p: (t - sl.cooking.start) / sl.cooking.dur }, ready: sl.ready && emo(sl.ready.dish), burnt: !!sl.burnt });
      });
      render((n) => n + 1);
    }, 100);
    return () => clearInterval(iv);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { const ru = run.current; if (ru && !ru.ended) void api.dinerClose(r.id, ru.shift.id, ru.served).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cook = (dish: string) => {
    const ru = run.current; if (!ru) return;
    const d = c.dishes[dish];
    const short = Object.entries(d.in).find(([k, v]) => (ru.stock[k] ?? 0) < v);
    if (short) { toast(`Out of ${emo(short[0])} ${r.cfg.resources[short[0]]?.name ?? short[0]} — stock up in the pantry`); return; }
    const i = ru.slots.findIndex((s) => s.kind === d.station && !s.cooking && !s.ready && !s.burnt);
    if (i < 0) { toast(`${c.stations[d.station].emoji} Every ${c.stations[d.station].name.toLowerCase()} is busy`); return; }
    for (const [k, v] of Object.entries(d.in)) ru.stock[k] = (ru.stock[k] ?? 0) - v;
    ru.slots[i].cooking = { dish, start: ru.t, dur: (ru.shift.secs[dish] ?? d.seconds) * 1000 };
    scene.current?.chefTo({ slot: i }); sfx.tick(); render((n) => n + 1);
  };
  const tapSlot = useRef((i: number) => {});
  tapSlot.current = (i: number) => {
    const ru = run.current; if (!ru) return; const sl = ru.slots[i]; if (!sl) return;
    if (sl.burnt) { sl.burnt = undefined; return; }
    if (!sl.ready) { if (sl.cooking) toast('Still cooking…'); return; }
    if (ru.tray.length >= c.tray) { toast('Your tray is full — serve a table first'); return; }
    ru.tray.push(sl.ready.dish); sl.ready = undefined; scene.current?.chefTo({ slot: i }); sfx.perfect?.(1); render((n) => n + 1);
  };
  const serve = (ci: number) => {
    const ru = run.current; if (!ru) return; const cu = ru.cust[ci]; if (!cu || cu.status !== 'seated') return;
    let any = false;
    cu.c.order.forEach((d, k) => { if (cu.got[k]) return; const at = ru.tray.indexOf(d); if (at >= 0) { ru.tray.splice(at, 1); cu.got[k] = true; any = true; } });
    if (!any) { toast(`They ordered ${cu.c.order.filter((_, k) => !cu.got[k]).map(emo).join(' ')} — cook it first`); return; }
    scene.current?.chefTo({ table: cu.table });
    if (cu.got.every(Boolean)) {
      const at = Math.max(Math.round(ru.t), ru.lastServe + 400); ru.lastServe = at; ru.served.push({ i: cu.c.i, at });
      cu.status = 'eating'; cu.eatUntil = ru.t + 1800; const tip = tipFor(cu.c.order, at - cu.c.at, ru.shift.patience, core.decor, c, ru.shift.special); ru.tips += tip;
      scene.current?.order(cu.c.i, [], 1); scene.current?.burst({ table: cu.table }, ['😋', ...(cu.c.order.includes(ru.shift.special) ? ['⭐'] : [])]); sfx.coin();
    } else sfx.tick();
    render((n) => n + 1);
  };
  const tapTable = useRef((t: number) => {});
  tapTable.current = (t: number) => { const ru = run.current; if (!ru) return; const i = ru.tables[t]; if (i !== null && i !== undefined) serve(i); };

  // ---- between shifts --------------------------------------------------------------------------------------------------
  const buy = async (what: 'station' | 'speed' | 'table' | 'decor' | 'crew', arg?: string) => { const x = await act(`${what}:${arg ?? ''}`, () => api.dinerBuy(r.id, what, arg)); if (x) { apply(x); sfx.perfect(2); scene.current?.burst(null, ['✨', '🎉']); } };
  const jar = async () => { const x = await act('jar', () => api.dinerJar(r.id)); if (x) { apply(x); const g = x.got?.tips ?? 0; if (g) { sfx.coin(); scene.current?.burst(null, ['💵', '💵', '🫙']); toast.success(`The night crew left 💵 ${fmt(g)} in the jar${x.ink ? ` · 💧 +${x.ink} Ink` : ''}`); } else toast('The jar’s empty — hire a night crew to earn while you’re away'); } };
  const pantry = async (items: Record<string, number | boolean>) => { const x = await act('pantry', () => api.dinerPantry(r.id, items)); if (x) { apply(x); sfx.coin(); toast.success(`Delivered: ${Object.entries(x.got ?? {}).map(([k, v]) => `${emo(k)} ${v}`).join('  ')}`); } };

  const ru = run.current;
  const t = ru?.t ?? 0, left = ru ? Math.max(0, ru.shift.seconds - t / 1000) : 0;
  const special = ru?.shift.special;
  const stock = ru?.stock ?? wallet;
  const seated = ru ? ru.cust.filter((x) => x.status === 'seated' || x.status === 'eating').sort((a, b) => (a.table ?? 0) - (b.table ?? 0)) : [];
  const waiting = ru ? ru.cust.filter((x) => x.status === 'queue').length : 0;
  const crewPending = useMemo(() => {
    if (!core.crew) return 0;
    const hrs = Math.min(c.crew_cap_hours, (Date.now() + (Date.parse(core.server_time) - Date.now()) - Date.parse(core.crew_at)) / 3.6e6);
    return Math.floor(core.crew * c.crew_tips_per_hour * (1 + core.decor * c.decor.tip_bonus) * Math.max(0, hrs));
  }, [core, c, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const ingredients = Object.keys(c.pantry);

  return (
    <div className="fixed inset-0 z-40 select-none overflow-hidden bg-[#2B1E2A] text-white" data-testid="realm" data-kind="diner">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" style={{ touchAction: 'none' }} data-testid="diner-canvas" />
      {/* top */}
      <div className="pointer-events-none absolute inset-x-0 top-0 grid gap-1.5 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <div className="flex items-start gap-2">
          <button onClick={() => (history.length > 1 ? nav(-1) : nav('/world'))} className="pointer-events-auto grid h-10 w-10 place-items-center rounded-xl bg-black/55 backdrop-blur" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1 rounded-2xl bg-black/55 px-3 py-1.5 backdrop-blur">
            <div className="flex items-center gap-2"><span className="truncate font-display text-base font-black">🍔 {r.name}</span>{!r.mine && <span className="flex items-center gap-1 text-[11px] text-white/70"><PlayerAvatar p={r.owner} size={14} />@{r.owner.username}’s</span>}
              <span className="ml-auto shrink-0 rounded-full bg-[#3DDC97]/25 px-2 text-xs font-black text-[#B8FFDD]" data-testid="diner-tips">💵 {fmt(tips)}</span></div>
            <div className="mt-0.5 flex items-center gap-2" data-testid="realm-level"><b className="text-xs text-[#FFD23F]">Lv {r.level.level}</b>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#FFD23F]" style={{ width: `${r.level.max ? 100 : (r.level.into / Math.max(1, r.level.need)) * 100}%` }} /></div>
              <span className="text-[10px] text-white/60">{c.decor.names[core.decor]}</span></div>
          </div>
          {r.mine && r.me.bonus_ready && !ru && <button onClick={() => void R.daily()} className="pointer-events-auto rounded-xl bg-[#FFE14D] px-2.5 py-2 text-xs font-black text-black shadow-lg" data-testid="realm-daily">🎁</button>}
        </div>
        {ru && (
          <div className="grid gap-1.5" data-testid="diner-shift">
            <div className="flex items-center gap-2 rounded-2xl bg-black/60 px-3 py-1.5 backdrop-blur">
              <span className="text-sm font-black tabular-nums">⏱ {Math.ceil(left)}s</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15"><div className={cn('h-full rounded-full', left < 15 ? 'bg-[#FF4D6D]' : 'bg-[#3DDC97]')} style={{ width: `${(left / ru.shift.seconds) * 100}%` }} /></div>
              <span className="text-xs font-black text-[#B8FFDD]">💵 ~{fmt(ru.tips)}</span>
              <span className="text-xs">✅ {ru.served.length}</span>{ru.lost > 0 && <span className="text-xs text-[#FF8AA0]">😡 {ru.lost}</span>}
            </div>
            <div className="pointer-events-auto flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" data-testid="diner-tickets">
              {seated.map((cu) => {
                const mood = 1 - (t - cu.c.at) / (ru.shift.patience * 1000);
                return (
                  <button key={cu.c.i} onClick={() => serve(cu.c.i)} className={cn('shrink-0 rounded-xl border-2 bg-[#FFFDF5] px-2 py-1 text-left text-black shadow', cu.status === 'eating' ? 'border-[#3DDC97] opacity-70' : mood > 0.5 ? 'border-white' : mood > 0.25 ? 'border-[#FFB13D]' : 'border-[#FF4D6D]')} data-testid={`diner-ticket-${cu.c.i}`}>
                    <div className="text-[9px] font-black text-black/50">TABLE {(cu.table ?? 0) + 1}</div>
                    <div className="flex gap-0.5 text-xl">{cu.c.order.map((d, k) => <span key={k} className={cn('relative', cu.got[k] && 'opacity-35')}>{emo(d)}{d === special && <span className="absolute -right-1 -top-1 text-[10px]">⭐</span>}</span>)}</div>
                    {cu.status === 'seated' ? <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-black/10"><div className={cn('h-full', mood > 0.5 ? 'bg-[#3DDC97]' : mood > 0.25 ? 'bg-[#FFB13D]' : 'bg-[#FF4D6D]')} style={{ width: `${Math.max(0, mood) * 100}%` }} /></div> : <div className="text-[9px] font-bold text-[#1E9E63]">Eating 😋</div>}
                  </button>
                );
              })}
              {waiting > 0 && <span className="shrink-0 self-center rounded-full bg-black/60 px-2 py-1 text-xs">🚪 {waiting} waiting for a table</span>}
              {!seated.length && !waiting && <span className="shrink-0 rounded-full bg-black/50 px-2 py-1 text-xs text-white/70">Waiting for customers…</span>}
            </div>
          </div>
        )}
      </div>

      {/* bottom */}
      <div className="absolute inset-x-0 bottom-0 grid gap-1.5 p-2 pb-[max(10px,env(safe-area-inset-bottom,0px))]">
        {ru ? (
          <>
            <div className="flex items-stretch gap-1.5">
              <div className="flex shrink-0 items-center gap-1 rounded-2xl bg-[#C8CCD4]/90 px-2 py-1 text-black" data-testid="diner-tray">
                <span className="text-[10px] font-black">TRAY</span>
                {Array.from({ length: c.tray }, (_, i) => <span key={i} className="grid h-9 w-9 place-items-center rounded-full bg-white text-xl shadow-inner">{ru.tray[i] ? emo(ru.tray[i]) : ''}</span>)}
              </div>
              <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-2xl bg-black/60 p-1 backdrop-blur [scrollbar-width:none]" data-testid="diner-slots">
                {ru.slots.map((sl, i) => (
                  <button key={i} onClick={() => tapSlot.current(i)} className={cn('relative grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl', sl.ready ? 'animate-pulse bg-[#3DDC97]' : sl.burnt ? 'bg-[#5A2A2A]' : sl.cooking ? 'bg-white/15' : 'bg-white/5')} data-testid={`diner-slot-${i}`} data-ready={sl.ready ? sl.ready.dish : ''}>
                    {sl.ready ? emo(sl.ready.dish) : sl.burnt ? '💨' : sl.cooking ? <span className="opacity-60">{emo(sl.cooking.dish)}</span> : <span className="opacity-40">{c.stations[sl.kind].emoji}</span>}
                    {sl.cooking && <span className="absolute inset-x-1 bottom-1 h-1 overflow-hidden rounded-full bg-black/40"><span className="block h-full bg-[#FFD23F]" style={{ width: `${Math.min(100, ((t - sl.cooking.start) / sl.cooking.dur) * 100)}%` }} /></span>}
                    {sl.ready && <span className="absolute inset-x-1 bottom-1 h-1 overflow-hidden rounded-full bg-black/30"><span className="block h-full bg-[#FF4D6D]" style={{ width: `${Math.min(100, ((t - sl.ready.at) / (c.burn_seconds * 1000)) * 100)}%` }} /></span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-1.5 overflow-x-auto rounded-2xl bg-black/65 p-1.5 backdrop-blur [scrollbar-width:none]" data-testid="diner-menu">
              {ru.shift.menu.map((d) => {
                const dd = c.dishes[d], ok = Object.entries(dd.in).every(([k, v]) => (stock[k] ?? 0) >= v);
                return (
                  <button key={d} onClick={() => cook(d)} className={cn('relative grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-white/10 active:scale-95', !ok && 'opacity-40', d === special && 'ring-2 ring-[#FFD23F]')} data-testid={`diner-cook-${d}`}>
                    <span className="text-3xl leading-none">{dd.emoji}</span><span className="text-[9px] font-bold">💵{dd.price * (d === special ? c.special_mult : 1)}</span>
                    {d === special && <span className="absolute -right-1 -top-1 rounded-full bg-[#FFD23F] px-1 text-[9px] font-black text-black">⭐×{c.special_mult}</span>}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            {r.mine && <button onClick={() => void open()} disabled={busy === 'open'} className="mx-auto w-full max-w-sm rounded-2xl bg-[#FF5C5C] py-3.5 font-display text-xl font-black text-white shadow-[0_6px_0_#B8323A] active:translate-y-1 active:shadow-[0_2px_0_#B8323A]" data-testid="diner-open">🔔 Open for a shift</button>}
            <div className="mx-auto flex flex-wrap justify-center gap-2 text-[11px] text-white/80"><span className="rounded-full bg-black/55 px-2 py-0.5">🏆 Best shift 💵 {fmt(core.best_tips)}</span><span className="rounded-full bg-black/55 px-2 py-0.5">🍽️ {fmt(core.served)} served</span><span className="rounded-full bg-black/55 px-2 py-0.5">🪑 {core.tables} tables</span></div>
            <div className="grid grid-cols-5 gap-1.5">
              {([['upgrades', '🛠️', 'Upgrades'], ['pantry', '🧺', 'Pantry'], ['jar', '🫙', crewPending ? `💵${fmt(crewPending)}` : 'Tip jar'], ['menu', '📋', 'Menu'], ['more', '☰', 'More']] as const).map(([k, e, n]) => (
                <button key={k} onClick={() => (k === 'jar' ? void jar() : setDlg(k))} className={cn('grid h-14 place-items-center rounded-2xl bg-black/60 py-1 text-[10px] font-bold backdrop-blur', k === 'jar' && crewPending > 0 && 'bg-[#3DDC97]/40', k === 'pantry' && core.pantry_ready && 'ring-2 ring-[#FFD23F]')} data-testid={`diner-${k}`}>
                  <span className="text-xl leading-none">{k === 'more' ? <Menu className="h-5 w-5" /> : e}</span>{n}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* upgrades */}
      <Dialog open={dlg === 'upgrades'} onOpenChange={(o) => setDlg(o ? 'upgrades' : null)} title="🛠️ Upgrades" description={<>You have <b>💵 {fmt(tips)}</b> in tips.</>}>
        <div className="grid gap-3" data-testid="diner-upgrades">
          <section className="grid gap-1.5"><h3 className="text-xs font-black uppercase text-muted">Kitchen stations</h3>
            {STATION_ORDER.map((k) => {
              const sc = c.stations[k], have = core.stations[k] ?? { n: 0, speed: 0 }, lockd = r.level.level < sc.level, nextCost = sc.cost[have.n], spCost = sc.speed_cost * (have.speed + 1) ** 2;
              return (
                <div key={k} className={cn('flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 p-2', lockd && 'opacity-55')} data-testid={`diner-station-${k}`}>
                  <span className="text-2xl">{sc.emoji}</span>
                  <div className="min-w-0 flex-1"><div className="text-sm font-bold">{sc.name} {have.n > 0 && <span className="text-xs font-normal text-muted">×{have.n} · speed {'⚡'.repeat(have.speed)}{'·'.repeat(c.speed_max - have.speed)}</span>}</div>
                    <div className="text-xs text-muted">Cooks {Object.values(c.dishes).filter((d) => d.station === k).map((d) => d.emoji).join(' ')}</div></div>
                  {lockd ? <span className="text-xs text-muted">🔒 Lv {sc.level}</span> : <div className="flex gap-1">
                    {nextCost !== undefined && <Button size="sm" variant={have.n ? 'secondary' : 'primary'} disabled={tips < nextCost} loading={busy === `station:${k}`} onClick={() => void buy('station', k)}>{have.n ? '+1' : 'Buy'} 💵{fmt(nextCost)}</Button>}
                    {have.n > 0 && have.speed < c.speed_max && <Button size="sm" variant="secondary" disabled={tips < spCost} loading={busy === `speed:${k}`} onClick={() => void buy('speed', k)}>⚡ 💵{fmt(spCost)}</Button>}
                  </div>}
                </div>
              );
            })}
          </section>
          <section className="grid gap-1.5"><h3 className="text-xs font-black uppercase text-muted">Dining room</h3>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 p-2" data-testid="diner-buy-table"><span className="text-2xl">🪑</span><div className="flex-1"><div className="text-sm font-bold">Tables · {core.tables}/{c.tables.max}</div><div className="text-xs text-muted">More tables, more customers each shift</div></div>
              {core.tables < c.tables.max ? <Button size="sm" variant="primary" disabled={tips < c.tables.cost[core.tables]} loading={busy === 'table:'} onClick={() => void buy('table')}>💵 {fmt(c.tables.cost[core.tables])}</Button> : <span className="text-xs text-muted">Full house</span>}</div>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 p-2" data-testid="diner-buy-decor"><span className="text-2xl">🪴</span><div className="flex-1"><div className="text-sm font-bold">Decor · {c.decor.names[core.decor]}</div><div className="text-xs text-muted">Each step: +{c.decor.tip_bonus * 100}% tips, +{c.decor.patience_bonus}s patience{core.decor + 1 < c.decor.names.length ? ` · next: ${c.decor.names[core.decor + 1]}` : ''}</div></div>
              {core.decor + 1 < c.decor.cost.length ? <Button size="sm" variant="primary" disabled={tips < c.decor.cost[core.decor + 1]} loading={busy === 'decor:'} onClick={() => void buy('decor')}>💵 {fmt(c.decor.cost[core.decor + 1])}</Button> : <span className="text-xs text-muted">Fanciest in town</span>}</div>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 p-2" data-testid="diner-buy-crew"><span className="text-2xl">🧑‍🍳</span><div className="flex-1"><div className="text-sm font-bold">Night crew · {c.crew.names[core.crew]}</div><div className="text-xs text-muted">Earns 💵 {fmt(c.crew_tips_per_hour * Math.max(1, core.crew + 1))}/hour while you’re away (up to {c.crew_cap_hours}h){core.crew + 1 < c.crew.names.length ? ` · next: ${c.crew.names[core.crew + 1]}` : ''}</div></div>
              {core.crew + 1 < c.crew.cost.length ? <Button size="sm" variant="primary" disabled={tips < c.crew.cost[core.crew + 1]} loading={busy === 'crew:'} onClick={() => void buy('crew')}>💵 {fmt(c.crew.cost[core.crew + 1])}</Button> : <span className="text-xs text-muted">Dream team</span>}</div>
          </section>
        </div>
      </Dialog>

      {/* pantry */}
      <Dialog open={dlg === 'pantry'} onOpenChange={(o) => setDlg(o ? 'pantry' : null)} title="🧺 Pantry" description={<>Ingredients for your dishes. Your suppliers (the helpers) send them in too.</>}>
        <div className="grid gap-1.5" data-testid="diner-pantry-list">
          <Button variant="primary" disabled={!core.pantry_ready} loading={busy === 'pantry'} onClick={() => void pantry({ _free: true })} data-testid="diner-pantry-free">{core.pantry_ready ? `🚚 Free daily delivery: ${Object.entries(c.pantry_free).map(([k, v]) => `${emo(k)} ${v}`).join(' ')}` : '🚚 Next free delivery tomorrow'}</Button>
          {ingredients.map((k) => {
            const lv = r.cfg.resources[k]?.level ?? 1, lockd = r.level.level < lv;
            return (
              <div key={k} className={cn('flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 p-2', lockd && 'opacity-55')} data-testid={`diner-pantry-${k}`}>
                <span className="text-2xl">{emo(k)}</span>
                <div className="flex-1"><div className="text-sm font-bold">{r.cfg.resources[k]?.name ?? k}</div><div className="text-xs text-muted">You have {fmt(wallet[k] ?? 0)} · 💵 {c.pantry[k]} each</div></div>
                {lockd ? <span className="text-xs text-muted">🔒 Lv {lv}</span> : <div className="flex gap-1">{[5, 20].map((n) => <Button key={n} size="sm" variant="secondary" disabled={tips < n * c.pantry[k]} onClick={() => void pantry({ [k]: n })}>+{n}</Button>)}</div>}
              </div>
            );
          })}
        </div>
      </Dialog>

      {/* the menu */}
      <Dialog open={dlg === 'menu'} onOpenChange={(o) => setDlg(o ? 'menu' : null)} title="📋 The menu">
        <div className="grid gap-1.5" data-testid="diner-menu-list">
          {Object.entries(c.dishes).sort((a, b) => a[1].level - b[1].level).map(([k, d]) => {
            const on = core.menu.includes(k);
            return (
              <div key={k} className={cn('flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 p-2', !on && 'opacity-55')}>
                <span className="text-3xl">{d.emoji}</span>
                <div className="flex-1"><div className="text-sm font-bold">{d.name} <span className="font-normal text-muted">· 💵 {d.price}</span></div>
                  <div className="text-xs text-muted">{c.stations[d.station].emoji} {d.seconds}s · {Object.entries(d.in).map(([x, v]) => `${emo(x)}×${v}`).join(' ') || 'nothing needed'}</div></div>
                {!on && <span className="text-xs text-muted">{r.level.level < d.level ? `🔒 Lv ${d.level}` : `Needs a ${c.stations[d.station].name.toLowerCase()}`}</span>}
              </div>
            );
          })}
        </div>
      </Dialog>

      {/* more */}
      <Dialog open={dlg === 'more'} onOpenChange={(o) => setDlg(o ? 'more' : null)} title="🍔 Around the restaurant">
        <div className="grid grid-cols-2 gap-2">
          {([['play', '🎮', 'Games', 'Order Up!, Burger Stack'], ['build', '🚜', 'Suppliers', 'Farms that send ingredients'], ['make', '🥧', 'Catering', 'Cook big orders to sell'], ['market', '⚖️', 'Market', 'Sell for tips'], ['book', '📖', 'Recipe book', 'Rare finds']] as const).map(([p, e, n, d]) => (
            <button key={p} onClick={() => { setDlg(null); R.setPanel(p); }} className="grid gap-0.5 rounded-2xl border border-line bg-surface-2/60 p-3 text-left" data-testid={`diner-open-${p}`}><span className="text-3xl">{e}</span><b>{n}</b><span className="text-xs text-muted">{d}</span></button>
          ))}
        </div>
      </Dialog>

      {/* the shift's result */}
      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)} title={result ? (result.stars >= 3 ? '🌟 What a shift!' : result.stars ? '🍽️ Shift over' : '😓 Tough shift') : ''}>
        {result && (
          <div className="grid gap-2 text-center" data-testid="diner-result">
            <div className="text-4xl">{'⭐'.repeat(result.stars)}{'☆'.repeat(3 - result.stars)}</div>
            <div className="text-sm">Served <b>{result.served}</b> of {result.customers} customers</div>
            <div className="font-display text-3xl font-black text-[#1E9E63]">💵 {fmt(result.tips)}</div>
            {result.best && <div className="text-sm font-bold text-[#E8A000]">🏆 New best shift!</div>}
            {result.ink > 0 && <div className="text-sm">💧 +{result.ink} Ink</div>}
            {Object.keys(result.used).length > 0 && <div className="text-xs text-muted">Used {Object.entries(result.used).map(([k, v]) => `${emo(k)} ${v}`).join('  ')}</div>}
            <Button variant="primary" onClick={() => setResult(null)}>Nice!</Button>
          </div>
        )}
      </Dialog>
      {R.dialogs}
    </div>
  );
}
