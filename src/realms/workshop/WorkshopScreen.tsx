// 🔧 The Inventor's Workshop: build a factory on the workshop floor. Pick a piece from the parts bar and tap the floor
// to place it (it faces the way the arrow says — tap ↻ to turn it before you place it, or tap a placed piece with
// ↻ to turn that). Magnets make scrap; belts carry; presses, coilers, spools, printers and the reactor turn parts
// into better parts; crates collect. What your layout makes comes in every minute, even while you're away.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Menu, RotateCw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../../backend/api';
import { toGameError } from '../../backend/backend';
import type { Realm } from '../../backend/types';
import { invalidateGame } from '../../lib/queries';
import { useUi } from '../../lib/store';
import { cn } from '../../lib/utils';
import { Button, Dialog, PlayerAvatar, Spinner } from '../../ui';
import { sfx } from '../../arcade/sfx';
import { fmt, useRealmCore } from '../core';
import { createFactory3D, type FactoryScene } from './factory3d';
import { WirePuzzle } from './WirePuzzle';
import { countPieces, solve, type FactoryCore, type Grid } from './factoryCore';

const sameGrid = (a: Grid, b: Grid) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every((k) => b[k] && b[k].t === a[k].t && b[k].d === a[k].d); };
const ARROW = ['⬆️', '➡️', '⬇️', '⬅️'];
type Tool = { kind: 'piece'; t: string } | { kind: 'rotate' } | { kind: 'erase' } | { kind: 'look' };

export default function WorkshopScreen({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['factory', id], queryFn: () => api.factoryGet(id), staleTime: 30_000, refetchOnWindowFocus: false });
  if (q.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#2A2230]"><Spinner /></div>;
  if (q.error || !q.data) return <div className="fixed inset-0 grid place-content-center gap-3 bg-[#2A2230] p-6 text-center text-white"><div className="text-5xl">🔧</div><p>This workshop couldn’t be found.</p><Link to="/world"><Button variant="secondary">Back to the map</Button></Link></div>;
  return <Workshop key={q.data.id} data={q.data} />;
}

function Workshop({ data }: { data: Realm & { factory_core: FactoryCore } }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const [r, setR] = useState<Realm>(data);
  const [core, setCore] = useState<FactoryCore>(data.factory_core);
  const [grid, setGrid] = useState<Grid>(data.factory_core.grid);
  const [tool, setTool] = useState<Tool>({ kind: 'piece', t: 'belt' });
  const [dir, setDir] = useState(1);
  const [look, setLook] = useState<string | null>(null);
  const [shop, setShop] = useState(false);
  const [menu, setMenu] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'dirty' | 'saving'>('idle');
  const [busy, setBusy] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const cv = useRef<HTMLCanvasElement>(null);
  const scene = useRef<FactoryScene | null>(null);
  const R = useRealmCore({ r, setR, extraGames: { wires: WirePuzzle }, burst: (_a, e) => scene.current?.burst(null, e) });
  const c = core.cfg, wallet = r.me.wallet, sparks = wallet.sparks ?? 0;
  const emojis = useMemo(() => Object.fromEntries(Object.entries(r.cfg.resources).map(([k, v]) => [k, v.emoji])), [r.cfg]);
  const sol = useMemo(() => solve(grid, c), [grid, c]);
  const used = useMemo(() => countPieces(grid), [grid]);
  const left = (t: string) => (core.owned[t] ?? 0) - (used[t] ?? 0);
  const offset = useMemo(() => Date.parse(core.server_time) - Date.now(), [core.server_time]);
  const mins = Math.min(c.cap_hours * 60, (Date.now() + offset - Date.parse(core.collected_at)) / 60000);
  const pending = Object.fromEntries(Object.entries(core.rates).map(([k, v]) => [k, v * Math.max(0, mins)]));
  const pendingAny = Object.values(pending).some((v) => v >= 1);

  useEffect(() => {
    if (!cv.current) return;
    const s = createFactory3D({ canvas: cv.current, cfg: data.factory_core.cfg, emojis, reduceMotion: reduce, onTapCell: (k) => tap.current(k) });
    scene.current = s;
    if (import.meta.env.DEV || location.search.includes('e2e=1')) Object.assign(window, { __landvasFactory: s, __landvasFactoryTap: (k: string) => tap.current(k) });
    return () => { s.dispose(); scene.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scene.current?.setFactory(grid, sol, core.size); }, [grid, sol, core.size]);
  useEffect(() => { scene.current?.setPaused(!!R.game); }, [R.game]);

  // save a moment after you stop building
  const saveT = useRef<number | null>(null);
  const latest = useRef(grid); latest.current = grid;
  const save = async () => {
    saveT.current = null; setSaving('saving');
    try {
      const x = await api.factorySave(r.id, latest.current);
      setCore(x.factory); setR((cur) => ({ ...cur, me: x.me, level: x.level }));
      if (x.got && Object.keys(x.got).length) toast.success(`Collected ${Object.entries(x.got).map(([k, v]) => `${emojis[k]} ${fmt(v)}`).join('  ')}`);
      if (x.level_up) R.levelUp(x.level_up);
      setSaving(sameGrid(latest.current, x.factory.grid) ? 'idle' : 'dirty');
    } catch (e) { toast.error(toGameError(e).message); setGrid(core.grid); setSaving('idle'); }
  };
  const change = (g: Grid) => { if (!r.mine) { toast('Only the owner can build here'); return; } setGrid(g); setSaving('dirty'); if (saveT.current) clearTimeout(saveT.current); saveT.current = window.setTimeout(() => void save(), 1200); };
  useEffect(() => () => { if (saveT.current) { clearTimeout(saveT.current); void api.factorySave(r.id, latest.current).catch(() => {}); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = useRef((k: string) => {});
  tap.current = (k: string) => {
    const here = grid[k];
    if (tool.kind === 'look') { setLook(here ? k : null); return; }
    if (tool.kind === 'erase') { if (here) { const g = { ...grid }; delete g[k]; change(g); sfx.tick(); } return; }
    if (tool.kind === 'rotate') { if (here) { change({ ...grid, [k]: { ...here, d: (here.d + 1) % 4 } }); sfx.tick(); } else setDir((d) => (d + 1) % 4); return; }
    const p = c.pieces[tool.t];
    if (here?.t === tool.t) { change({ ...grid, [k]: { ...here, d: (here.d + 1) % 4 } }); sfx.tick(); return; }
    if (r.level.level < p.level) { toast(`${p.name}s unlock at level ${p.level}`); return; }
    if (left(tool.t) + (here?.t === tool.t ? 1 : 0) < 1) { toast(`No ${p.name}s left — buy more in the parts shop`); setShop(true); return; }
    change({ ...grid, [k]: { t: tool.t, d: dir } }); sfx.perfect?.(1);
  };
  const collect = async () => {
    setBusy('collect');
    try { const x = await api.factoryCollect(r.id); setCore(x.factory); setR((cur) => ({ ...cur, me: x.me, level: x.level })); const got = Object.entries(x.got ?? {}); if (got.length) { sfx.coin(); scene.current?.burst(null, got.flatMap(([k, v]) => Array(Math.min(4, Math.ceil(v / 10))).fill(emojis[k]))); toast.success(`Shipped in ${got.map(([k, v]) => `${emojis[k]} ${fmt(v)}`).join('  ')}${x.ink ? ` · 💧 +${x.ink} Ink` : ''}`); } else toast('Nothing in the crates yet'); if (x.level_up) R.levelUp(x.level_up); invalidateGame(qc); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const buy = async (t: string, n: number) => {
    setBusy(`buy:${t}`);
    try { const x = await api.factoryBuy(r.id, t, n); setCore((cur) => ({ ...x.factory, grid: cur.grid })); setR((cur) => ({ ...cur, me: x.me, level: x.level })); sfx.perfect(2); if (x.level_up) R.levelUp(x.level_up); }
    catch (e) { toast.error(toGameError(e).message === 'Not enough for that yet' ? 'Not enough sparks' : toGameError(e).message); } finally { setBusy(null); }
  };

  const income = Object.entries(sol.income);
  const lk = look ? grid[look] : null, lp = lk ? c.pieces[lk.t] : null, ls = look ? sol.cells[look] : null;
  return (
    <div className="fixed inset-0 z-40 select-none overflow-hidden bg-[#2A2230] text-white" data-testid="realm" data-kind="workshop">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" style={{ touchAction: 'none' }} data-testid="factory-canvas" />
      <div className="pointer-events-none absolute inset-x-0 top-0 grid gap-1.5 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <div className="flex items-start gap-2">
          <button onClick={() => (history.length > 1 ? nav(-1) : nav('/world'))} className="pointer-events-auto grid h-10 w-10 place-items-center rounded-xl bg-black/55 backdrop-blur" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1 rounded-2xl bg-black/55 px-3 py-1.5 backdrop-blur">
            <div className="flex items-center gap-2"><span className="truncate font-display text-base font-black">🔧 {r.name}</span>{!r.mine && <span className="flex items-center gap-1 text-[11px] text-white/70"><PlayerAvatar p={r.owner} size={14} />@{r.owner.username}’s</span>}
              <span className="ml-auto text-[10px] text-white/60" data-testid="factory-saving">{saving === 'saving' ? 'Saving…' : saving === 'dirty' ? 'Unsaved' : 'Saved ✓'}</span></div>
            <div className="mt-0.5 flex items-center gap-2" data-testid="realm-level"><b className="text-xs text-[#FFD23F]">Lv {r.level.level}</b>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#FFD23F]" style={{ width: `${r.level.max ? 100 : (r.level.into / Math.max(1, r.level.need)) * 100}%` }} /></div>
              <span className="text-[10px] text-white/60">{core.size}×{core.size} floor</span></div>
          </div>
          {r.mine && r.me.bonus_ready && <button onClick={() => void R.daily()} className="pointer-events-auto rounded-xl bg-[#FFE14D] px-2.5 py-2 text-xs font-black text-black shadow-lg" data-testid="realm-daily">🎁</button>}
        </div>
        <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" data-testid="factory-output">
          <span className="shrink-0 rounded-full bg-black/60 px-2.5 py-1 text-xs font-black text-[#FFE14D]">⚡ {fmt(sparks)}</span>
          {income.length ? income.map(([k, v]) => <span key={k} className="shrink-0 rounded-full bg-[#3DDC97]/30 px-2 py-1 text-xs font-bold">{emojis[k]} {v < 1 ? v.toFixed(1) : fmt(v)}/min</span>)
            : <span className="shrink-0 rounded-full bg-[#FF4D6D]/30 px-2 py-1 text-xs font-bold">Nothing reaches a 📦 crate yet</span>}
          {r.mine && <button onClick={() => void collect()} disabled={busy === 'collect'} className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-black', pendingAny ? 'bg-[#3DDC97] text-[#0F2A1E]' : 'bg-white/10 text-white/60')} data-testid="factory-collect">📦 Collect {Object.entries(pending).filter(([, v]) => v >= 1).map(([k, v]) => `${emojis[k]}${fmt(v)}`).join(' ')}</button>}
        </div>
      </div>

      {lk && lp && ls && (
        <div className="absolute inset-x-0 bottom-[150px] z-20 flex justify-center px-3" data-testid="factory-look">
          <div className="w-full max-w-sm rounded-3xl bg-black/80 p-3 backdrop-blur">
            <div className="flex items-center gap-2"><span className="text-3xl">{lp.emoji}</span><b className="flex-1">{lp.name}</b><button onClick={() => setLook(null)} className="text-xs text-white/60">close</button></div>
            <p className="mt-1 text-xs text-white/75">{lp.kind === 'source' ? `Makes ${emojis[lp.out!]} ${lp.rate}/min.` : lp.kind === 'machine' ? `Takes ${Object.entries(lp.in ?? {}).map(([k, v]) => `${emojis[k]}×${v}`).join(' + ')} → ${emojis[lp.out!]} (up to ${lp.rate}/min).` : lp.kind === 'belt' ? `Carries up to ${c.belt_cap} parts a minute.` : 'Whatever reaches it goes to your stock.'}</p>
            <p className={cn('mt-1 text-xs font-bold', ls.status === 'ok' ? 'text-[#3DDC97]' : ls.status === 'starved' ? 'text-[#FF8AA0]' : 'text-[#FFB13D]')}>
              {ls.status === 'starved' ? '🔴 Waiting for parts — feed it what it needs' : ls.status === 'spilling' ? '🟠 Its parts fall off the end — point it at a belt, machine or crate' : Object.keys(ls.out).length ? `🟢 Making ${Object.entries(ls.out).map(([k, v]) => `${emojis[k]} ${v.toFixed(1)}/min`).join(', ')}` : lp.kind === 'dock' ? '📦 Collecting' : '…'}</p>
          </div>
        </div>
      )}

      {/* the parts bar */}
      <div className="absolute inset-x-0 bottom-0 grid gap-1.5 p-2 pb-[max(10px,env(safe-area-inset-bottom,0px))]">
        <div className="flex items-center justify-center gap-1.5">
          <button onClick={() => setDir((d) => (d + 1) % 4)} className="flex h-10 items-center gap-1 rounded-xl bg-black/60 px-3 text-sm font-black backdrop-blur" data-testid="factory-dir">Facing {ARROW[dir]}</button>
          {([['look', '🔍'], ['rotate', '↻'], ['erase', '🗑️']] as const).map(([k, e]) => (
            <button key={k} onClick={() => setTool({ kind: k } as Tool)} className={cn('grid h-10 w-10 place-items-center rounded-xl text-lg backdrop-blur', tool.kind === k ? 'bg-[#FFD23F] text-black' : 'bg-black/60')} aria-label={k} data-testid={`factory-tool-${k}`}>{k === 'rotate' ? <RotateCw className="h-4 w-4" /> : k === 'erase' ? <Trash2 className="h-4 w-4" /> : e}</button>
          ))}
          <button onClick={() => setShop(true)} className="h-10 rounded-xl bg-[#3DDC97] px-3 text-sm font-black text-[#0F2A1E]" data-testid="factory-shop">🛒 Parts</button>
          <button onClick={() => setMenu(true)} className="grid h-10 w-10 place-items-center rounded-xl bg-black/60 backdrop-blur" aria-label="More" data-testid="factory-menu"><Menu className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto rounded-2xl bg-black/60 p-1.5 backdrop-blur [scrollbar-width:none]" data-testid="factory-palette">
          {Object.entries(c.pieces).sort((a, b) => a[1].level - b[1].level).map(([k, p]) => {
            const lockd = r.level.level < p.level, n = left(k);
            return (
              <button key={k} onClick={() => setTool({ kind: 'piece', t: k })} className={cn('relative grid h-16 w-16 shrink-0 place-items-center rounded-xl', tool.kind === 'piece' && tool.t === k ? 'bg-[#FFD23F]/30 ring-2 ring-[#FFD23F]' : 'bg-white/5', lockd && 'opacity-40')} data-testid={`factory-piece-${k}`}>
                <span className="text-2xl">{p.emoji}</span><span className="text-[9px] font-bold leading-none">{p.name.split(' ').slice(-1)[0].replace(/^./, (x) => x.toUpperCase())}</span>
                <span className={cn('absolute right-0.5 top-0.5 rounded-full px-1 text-[10px] font-black', n > 0 ? 'bg-[#3DDC97] text-black' : 'bg-white/20')}>{lockd ? `🔒${p.level}` : n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Dialog open={shop} onOpenChange={setShop} title="🛒 Parts shop" description={<>You have <b>⚡ {fmt(sparks)}</b> sparks. Buy pieces, then place them on the floor (you can move them round any time).</>}>
        <div className="grid gap-1.5" data-testid="factory-shop-list">
          {Object.entries(c.pieces).sort((a, b) => a[1].level - b[1].level).map(([k, p]) => {
            const lockd = r.level.level < p.level;
            return (
              <div key={k} className={cn('flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 p-2', lockd && 'opacity-55')} data-testid={`factory-buy-${k}`}>
                <span className="text-2xl">{p.emoji}</span>
                <div className="min-w-0 flex-1"><div className="text-sm font-bold">{p.name} <span className="text-xs font-normal text-muted">· you have {core.owned[k] ?? 0}</span></div>
                  <div className="text-xs text-muted">{p.kind === 'source' ? `Makes ${emojis[p.out!]} ${p.rate}/min` : p.kind === 'machine' ? `${Object.entries(p.in ?? {}).map(([x, v]) => `${emojis[x]}×${v}`).join(' + ')} → ${emojis[p.out!]} · ${p.rate}/min` : p.kind === 'belt' ? 'Carries parts along' : 'Collects whatever reaches it'}</div></div>
                {lockd ? <span className="text-xs text-muted">🔒 Lv {p.level}</span> : r.mine && <div className="flex gap-1">
                  <Button size="sm" variant="primary" disabled={sparks < p.cost} loading={busy === `buy:${k}`} onClick={() => void buy(k, 1)}>⚡ {fmt(p.cost)}</Button>
                  {p.kind === 'belt' && <Button size="sm" variant="secondary" disabled={sparks < p.cost * 5} onClick={() => void buy(k, 5)}>×5</Button>}</div>}
              </div>
            );
          })}
        </div>
      </Dialog>
      <Dialog open={menu} onOpenChange={setMenu} title="🔧 Around the workshop">
        <div className="grid grid-cols-2 gap-2">
          {([['play', '🎮', 'Games', 'Assembly Line, Wire Puzzle'], ['make', '🛠️', 'Inventions', 'Toys, bots, jetpacks…'], ['market', '⚖️', 'Market', 'Sell parts for sparks'], ['build', '👩‍🔧', 'Helpers', 'Work while you’re away'], ['book', '📖', 'Notebook', 'Rare finds']] as const).map(([p, e, n, d]) => (
            <button key={p} onClick={() => { setMenu(false); R.setPanel(p); }} className="grid gap-0.5 rounded-2xl border border-line bg-surface-2/60 p-3 text-left" data-testid={`factory-open-${p}`}><span className="text-3xl">{e}</span><b>{n}</b><span className="text-xs text-muted">{d}</span></button>
          ))}
        </div>
      </Dialog>
      {R.dialogs}
    </div>
  );
}
