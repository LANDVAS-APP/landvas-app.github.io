// ⛏️ The Crystal Mine: dig your own mine, tile by tile, down through six layers of rock. Tap rock next to a tunnel
// and your miner walks over and swings until it breaks; each tile costs pickaxe energy, which refills over time.
// Up on the surface: the Trader (sell), the Smelter (bars, lenses, crowns), the Crew camp (miners and machines that
// work while you're away), the Outfitter (pickaxe, energy tank, lungs, lantern, dynamite), the Geode bench (crack
// them open), the Museum (fossils and relics you've dug up) and the Games tent (Deep Dig, Minecart Rush).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../../backend/api';
import { toGameError } from '../../backend/backend';
import type { ExplorerStyle, Realm } from '../../backend/types';
import { explorerSvg } from '../../explorer/character';
import { invalidateGame, useOnboardedMe } from '../../lib/queries';
import { useUi } from '../../lib/store';
import { cn } from '../../lib/utils';
import { buzz } from '../../native/native';
import { Button, Dialog, PlayerAvatar, Spinner } from '../../ui';
import { confettiCannons } from '../../ui/confetti';
import { sfx } from '../../arcade/sfx';
import { fmt, RARITY, useRealmCore } from '../core';
import { createMine3D, type MineBuilding, type MineScene } from './mine3d';
import { MinecartRush } from './MinecartRush';
import { TILE_INFO, digCost, layerAt, mineTile, type MineCore } from './tiles';

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
export const mineKey = (id: string) => ['mine', id] as const;

export default function MineScreen({ id }: { id: string }) {
  const q = useQuery({ queryKey: mineKey(id), queryFn: () => api.mineGet(id), staleTime: 30_000, refetchOnWindowFocus: false });
  if (q.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#1A1210]"><Spinner /></div>;
  if (q.error || !q.data) return <div className="fixed inset-0 grid place-content-center gap-3 bg-[#1A1210] p-6 text-center text-white"><div className="text-5xl">⛏️</div><p>This mine couldn’t be found.</p><Link to="/world"><Button variant="secondary">Back to the map</Button></Link></div>;
  return <Mine key={q.data.id} data={q.data} />;
}

function Mine({ data }: { data: Realm & { mine_core: MineCore } }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = useOnboardedMe();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const haptics = useUi((s) => s.settings.haptics);
  const [r, setR] = useState<Realm>(data);
  const [core, setCore] = useState<MineCore>(data.mine_core);
  const coreAt = useRef(performance.now());
  const cv = useRef<HTMLCanvasElement>(null);
  const scene = useRef<MineScene | null>(null);
  const [depth, setDepth] = useState(0);
  const [blast, setBlast] = useState(false);
  const [shop, setShop] = useState<'outfitter' | 'bench' | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const c = core.cfg;
  const R = useRealmCore({ r, setR, extraGames: { cart: MinecartRush }, burst: (_at, e) => scene.current?.burst(-1, e) });
  const wallet = r.me.wallet;
  const pick = core.tools.pick ?? 0;

  // energy: what the server said, plus the refill since, minus digs on their way
  const reserved = useRef(0);
  const energyNow = () => Math.min(core.energy_max, core.energy + (core.rate * (performance.now() - coreAt.current)) / 60000) - reserved.current;
  const energy = energyNow();
  const nextIn = energy >= core.energy_max ? 0 : Math.ceil(((1 - ((energy + reserved.current) % 1)) / core.rate) * 60);

  // the scene
  useEffect(() => {
    if (!cv.current) return;
    const s = createMine3D({
      canvas: cv.current, seed: r.seed, cfg: data.mine_core.cfg, reduceMotion: reduce,
      explorerUrl: svgUrl(explorerSvg(me?.profile.explorer_style as ExplorerStyle | undefined, me?.profile.accent_color ?? '#7B5CFF', 184)),
      onTapTile: (idx) => tap.current(idx), onTapBuilding: (b) => building.current(b), onBreak: (idx) => broke.current(idx), onDepth: setDepth,
    });
    s.setState({ dug: data.mine_core.dug, lamp: data.mine_core.tools.lamp ?? 0, deepest: data.mine_core.deepest });
    scene.current = s;
    if (import.meta.env.DEV || location.search.includes('e2e=1')) Object.assign(window, { __landvasMine: s, __landvasMineTap: (i: number) => tap.current(i), __landvasMineBuilding: (b: MineBuilding) => building.current(b) });
    return () => { s.dispose(); scene.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scene.current?.setPaused(!!R.game); }, [R.game]);

  // digging: the miner swings, the tile breaks here, the server confirms in batches
  const queue = useRef<{ idx: number; cost: number }[]>([]);
  const sending = useRef(false);
  const flushT = useRef<number | null>(null);
  const apply = (res: Awaited<ReturnType<typeof api.mineDig>>, sent: { idx: number; cost: number }[]) => {
    const ok = new Set(res.dug), lost = sent.filter((s) => !ok.has(s.idx));
    for (const s of sent) reserved.current -= s.cost;
    if (lost.length) { scene.current?.unmark(lost.map((l) => l.idx)); toast('Some digs didn’t count — out of energy?'); }
    setCore(res.mine); coreAt.current = performance.now();
    setR((cur) => ({ ...cur, me: res.me, level: res.level }));
    const all = new Set(res.mine.dug); for (const q of queue.current) all.add(q.idx);
    scene.current?.setState({ dug: [...all], lamp: res.mine.tools.lamp ?? 0, deepest: res.mine.deepest });
    for (const f of res.finds) {
      const d = r.cfg.finds[f.id];
      if (d) { toast.success(`${d.emoji} ${f.new ? 'New find' : 'Found'}: ${d.name}!`, { description: f.new ? `It’s in the Museum now (${d.rarity}).` : undefined }); if (f.new) { sfx.jackpot(); confettiCannons(); } }
    }
    if (res.ink > 0) toast.success(`💧 +${res.ink} Ink — ${res.mine.deepest} metres down!`);
    if (res.level_up) R.levelUp(res.level_up);
    invalidateGame(qc);
  };
  const flush = async () => {
    flushT.current = null;
    if (sending.current || !queue.current.length) return;
    sending.current = true;
    const sent = queue.current.splice(0, 40);
    try { apply(await api.mineDig(r.id, sent.map((s) => s.idx)), sent); }
    catch (e) { for (const s of sent) reserved.current -= s.cost; scene.current?.unmark(sent.map((s) => s.idx)); toast.error(toGameError(e).message); }
    finally { sending.current = false; if (queue.current.length) schedule(); }
  };
  const schedule = () => { if (flushT.current == null) flushT.current = window.setTimeout(() => void flush(), 650); };
  useEffect(() => () => { if (flushT.current != null) { clearTimeout(flushT.current); void flush(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const planned = useRef(new Map<number, number>()); // tile -> energy it'll cost
  const tap = useRef((idx: number) => {}); const broke = useRef((idx: number) => {}); const building = useRef((b: MineBuilding) => {});
  tap.current = (idx: number) => {
    if (!r.mine) { toast('Only the owner digs this mine — visit the 🎪 games tent!'); return; }
    if (core.dug.includes(idx) || planned.current.has(idx) || queue.current.some((q) => q.idx === idx)) return;
    const x = idx % c.width, y = Math.floor(idx / c.width), k = mineTile(r.seed, x, y, c);
    if (blast) {
      if (core.dynamite < 1) { toast('Out of dynamite — the Outfitter sells more'); setShop('outfitter'); return; }
      setBlast(false);
      void (async () => {
        try { const res = await api.mineDig(r.id, [], idx); scene.current?.blast(idx); if (haptics) buzz('heavy'); sfx.thud?.(); apply(res, []); popLoot(idx, res.loot); }
        catch (e) { toast.error(toGameError(e).message); }
      })();
      return;
    }
    if (!scene.current?.canReach(idx, new Set([...planned.current.keys(), ...queue.current.map((q) => q.idx)]))) { toast('Dig next to a tunnel (or from the surface)'); return; }
    const cost = digCost(y, k, c, pick);
    if (energyNow() < cost) { toast(`Out of energy ⚡ — it refills ${core.rate.toFixed(1)}/min. Upgrade at the Outfitter, or blast with 🧨!`); return; }
    reserved.current += cost; planned.current.set(idx, cost);
    scene.current.dig(idx, Math.max(1, Math.min(8, cost * 2)));
  };
  const popLoot = (idx: number, loot: Record<string, number>) => {
    const e = Object.entries(loot).flatMap(([k, v]) => Array(Math.min(4, Math.ceil(v))).fill(r.cfg.resources[k]?.emoji ?? (k === 'geode' ? '🪨' : '✨')));
    if (e.length) scene.current?.burst(idx, e);
  };
  broke.current = (idx: number) => {
    const cost = planned.current.get(idx) ?? 0; planned.current.delete(idx);
    const x = idx % c.width, y = Math.floor(idx / c.width), k = mineTile(r.seed, x, y, c);
    scene.current?.markDug([idx]);
    const loot = c.tiles[k]?.loot ?? {};
    const e = Object.keys(loot).map((res) => r.cfg.resources[res]?.emoji ?? (res === 'geode' ? '🪨' : '')).filter(Boolean);
    if (k === 'chest') e.push('🪙', '🪙', '🪙'); if (k === 'fossil' || k === 'relic') e.push('✨');
    if (e.length) scene.current?.burst(idx, e);
    if (haptics) buzz(k === 'gem' || k === 'chest' ? 'medium' : 'light');
    if (k === 'gem' || k === 'chest' || k === 'crystal') sfx.coin(); else sfx.tick();
    if (k === 'lava') toast('🔥 Lava! That cost extra energy.');
    if (k === 'cave') toast('🕳️ You broke into a cave!');
    queue.current.push({ idx, cost }); schedule();
  };
  building.current = (b: MineBuilding) => {
    if (b === 'trader') R.setPanel('market'); else if (b === 'smelter') R.setPanel('make'); else if (b === 'crew') R.setPanel('build');
    else if (b === 'museum') R.setPanel('book'); else if (b === 'games') R.setPanel('play'); else setShop(b);
  };

  const layer = layerAt(depth, c);
  const cur = r.cfg.resources[r.cfg.currency];
  const chips = useMemo(() => Object.entries(r.cfg.resources).filter(([k, v]) => k !== r.cfg.currency && !v.made && (wallet[k] ?? 0) >= 1).slice(0, 6), [r.cfg, wallet]);
  return (
    <div className="fixed inset-0 z-40 select-none overflow-hidden bg-black text-white" data-testid="realm" data-kind="mine">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" style={{ touchAction: 'none' }} data-testid="mine-canvas" />
      <div className="pointer-events-none absolute inset-x-0 top-0 grid gap-1.5 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <div className="flex items-start gap-2">
          <button onClick={() => (history.length > 1 ? nav(-1) : nav('/world'))} className="pointer-events-auto grid h-10 w-10 place-items-center rounded-xl border border-[#FFD98A]/40 bg-[#1A1210]/80 backdrop-blur" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1 rounded-2xl border border-[#FFD98A]/40 bg-[#1A1210]/80 px-3 py-1.5 backdrop-blur">
            <div className="flex items-center gap-2"><span className="truncate font-display text-base font-black">⛏️ {r.name}</span>{!r.mine && <span className="flex items-center gap-1 text-[11px] text-white/70"><PlayerAvatar p={r.owner} size={14} />@{r.owner.username}’s</span>}</div>
            <div className="mt-0.5 flex items-center gap-2" data-testid="realm-level"><b className="text-xs text-[#FFD98A]">Lv {r.level.level}</b>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#FFD98A]" style={{ width: `${r.level.max ? 100 : (r.level.into / Math.max(1, r.level.need)) * 100}%` }} /></div></div>
            <div className="mt-1 flex items-center gap-2 text-[11px]" data-testid="mine-depth"><span>📏 <b>{depth} m</b> · {layer.name}</span><span className="text-white/60">deepest {core.deepest} m</span></div>
          </div>
        </div>
        {r.mine && (
          <div className="flex items-center gap-2 rounded-2xl border border-[#FFD98A]/40 bg-[#1A1210]/80 px-3 py-1.5 backdrop-blur" data-testid="mine-energy">
            <span className="text-sm">⚡</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gradient-to-r from-[#FFD23F] to-[#FF9A3A] transition-[width]" style={{ width: `${(Math.max(0, energy) / core.energy_max) * 100}%` }} /></div>
            <b className="text-xs tabular-nums">{Math.floor(Math.max(0, energy))}/{core.energy_max}</b>
            {nextIn > 0 && <span className="text-[10px] text-white/60">+1 in {nextIn}s</span>}
          </div>
        )}
        <div className="pointer-events-auto flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" data-testid="realm-wallet">
          <span className="shrink-0 rounded-full bg-black/60 px-2.5 py-1 text-xs font-black text-[#FFE14D] backdrop-blur">{cur.emoji} {fmt(wallet[r.cfg.currency] ?? 0)}</span>
          {(wallet.geode ?? 0) >= 1 && <button onClick={() => setShop('bench')} className="shrink-0 rounded-full bg-[#8C7A9A]/70 px-2 py-1 text-xs font-bold backdrop-blur">🪨 {fmt(wallet.geode)} geodes</button>}
          {chips.map(([k, v]) => <span key={k} className="shrink-0 rounded-full bg-black/50 px-2 py-1 text-xs font-bold backdrop-blur">{v.emoji} {fmt(wallet[k])}</span>)}
        </div>
      </div>
      {/* right: dynamite, up, down, daily, crew stash */}
      <div className="absolute right-3 top-1/2 grid -translate-y-1/2 gap-2">
        {r.mine && <button onClick={() => setBlast((b) => !b)} className={cn('relative grid h-12 w-12 place-items-center rounded-2xl border text-2xl backdrop-blur', blast ? 'border-[#FF6A1F] bg-[#FF6A1F]/70 ring-2 ring-[#FFB13D]' : 'border-[#FFD98A]/40 bg-[#1A1210]/80')} aria-label="Dynamite" data-testid="mine-dynamite">🧨<span className="absolute -bottom-1 -right-1 rounded-full bg-black px-1.5 text-[10px] font-black">{core.dynamite}</span></button>}
        <button onClick={() => scene.current?.goSurface()} className="grid h-12 w-12 place-items-center rounded-2xl border border-[#FFD98A]/40 bg-[#1A1210]/80 backdrop-blur" aria-label="Up to the surface" data-testid="mine-up"><ArrowUp className="h-5 w-5" /></button>
        <button onClick={() => scene.current?.goDeepest()} className="grid h-12 w-12 place-items-center rounded-2xl border border-[#FFD98A]/40 bg-[#1A1210]/80 backdrop-blur" aria-label="Down to the deepest tunnel"><ArrowDown className="h-5 w-5" /></button>
        {r.mine && r.me.bonus_ready && <button onClick={() => void R.daily()} className="grid h-12 w-12 place-items-center rounded-2xl bg-[#FFE14D] text-2xl text-black shadow-lg" aria-label="Daily bonus" data-testid="realm-daily">🎁</button>}
        {r.mine && R.pendingAny && <button onClick={() => void R.collect()} className="grid h-12 w-12 place-items-center rounded-2xl bg-[#3DDC97] text-2xl shadow-lg" aria-label="Collect from your crew" data-testid="mine-collect">📦</button>}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 pb-[max(14px,env(safe-area-inset-bottom,0px))]">
        <div className={cn('rounded-full px-4 py-2 text-center text-xs backdrop-blur', blast ? 'bg-[#FF6A1F]/85 font-bold' : 'bg-black/60 text-white/85')}>
          {blast ? '🧨 Tap rock next to a tunnel to blast 3×3 (free!)' : depth < 2 ? 'Tap the camp’s buildings · tap the rock below to start digging' : 'Tap rock next to a tunnel to dig · drag to look round'}
        </div>
      </div>

      <Dialog open={shop === 'outfitter'} onOpenChange={(o) => !o && setShop(null)} title="⛏️ The Outfitter" description={<>You have <b>{cur.emoji} {fmt(wallet.gold ?? 0)}</b>. Better tools dig deeper, faster.</>}>
        <Outfitter r={r} core={core} onCore={(m, meNew) => { setCore(m); coreAt.current = performance.now(); setR((x) => ({ ...x, me: meNew })); scene.current?.setState({ dug: m.dug, lamp: m.tools.lamp ?? 0, deepest: m.deepest }); }} />
      </Dialog>
      <Dialog open={shop === 'bench'} onOpenChange={(o) => !o && setShop(null)} title="🪨 The Geode bench" description="Geodes turn up in the rock from 20 metres down. Crack them open for crystals — sometimes gems, sometimes something rare.">
        <Bench r={r} onMe={(m) => setR((x) => ({ ...x, me: m }))} levelUp={R.levelUp} haptics={haptics} />
      </Dialog>
      {R.dialogs}
    </div>
  );
}

function Outfitter({ r, core, onCore }: { r: Realm; core: MineCore; onCore(m: MineCore, me: Realm['me']): void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const gold = r.me.wallet.gold ?? 0;
  const run = async (k: string, f: () => Promise<{ mine: MineCore; me: Realm['me'] }>) => { setBusy(k); try { const x = await f(); onCore(x.mine, x.me); sfx.perfect(2); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); } };
  return (
    <div className="grid gap-1.5" data-testid="mine-outfitter">
      {Object.entries(core.cfg.tools).map(([k, t]) => {
        const lv = core.tools[k] ?? 0, cost = core.tool_costs[k];
        return (
          <div key={k} className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 p-2" data-testid={`mine-tool-${k}`}>
            <span className="text-2xl">{t.emoji}</span>
            <div className="min-w-0 flex-1"><div className="text-sm font-bold">{t.name} <span className="text-xs font-normal text-muted">· lv {lv}/{t.max}</span></div><div className="text-xs text-muted">{t.blurb}</div></div>
            {cost == null ? <span className="text-xs font-bold text-[#3DDC97]">MAX</span>
              : r.mine && <Button size="sm" variant="primary" disabled={gold < cost} loading={busy === k} onClick={() => void run(k, () => api.mineTool(r.id, k))}>🪙 {fmt(cost)}</Button>}
          </div>
        );
      })}
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 p-2">
        <span className="text-2xl">🧨</span>
        <div className="min-w-0 flex-1"><div className="text-sm font-bold">Dynamite <span className="text-xs font-normal text-muted">· you have {core.dynamite}/{core.cfg.dynamite.max}</span></div><div className="text-xs text-muted">Blasts a 3×3 hole for no energy at all.</div></div>
        {r.mine && <Button size="sm" variant="primary" disabled={gold < core.cfg.dynamite.cost || core.dynamite >= core.cfg.dynamite.max} loading={busy === 'tnt'} onClick={() => void run('tnt', () => api.mineBuyDynamite(r.id, 1))} data-testid="mine-buy-tnt">🪙 {core.cfg.dynamite.cost}</Button>}
      </div>
      <p className="text-xs text-muted">⚡ {core.energy_max} energy, refilling {core.rate.toFixed(1)} a minute.</p>
    </div>
  );
}

function Bench({ r, onMe, levelUp, haptics }: { r: Realm; onMe(m: Realm['me']): void; levelUp(lv: number | null | undefined): void; haptics: boolean }) {
  const [taps, setTaps] = useState(0);
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<{ loot: Record<string, number>; find: string | null; new: boolean } | null>(null);
  const have = Math.floor(r.me.wallet.geode ?? 0);
  const NEED = 5;
  const hitIt = async () => {
    if (busy || have < 1) return;
    if (got) { setGot(null); setTaps(0); return; }
    const n = taps + 1; setTaps(n); sfx.tick(); if (haptics) buzz('light');
    if (n < NEED || !r.mine) return;
    setBusy(true);
    try { const res = await api.mineCrack(r.id); setGot(res); onMe(res.me); sfx.jackpot(); if (res.new) confettiCannons(); levelUp(res.level_up); if (res.ink) toast.success(`💧 +${res.ink} Ink`); }
    catch (e) { toast.error(toGameError(e).message); setTaps(0); } finally { setBusy(false); }
  };
  const f = got?.find ? r.cfg.finds[got.find] : null;
  return (
    <div className="grid justify-items-center gap-3 py-2" data-testid="mine-bench">
      <button onClick={() => void hitIt()} disabled={have < 1 && !got} className="relative grid h-40 w-40 place-items-center rounded-full bg-gradient-to-b from-[#3A2E44] to-[#1E1726] text-7xl shadow-inner active:scale-95 disabled:opacity-40" data-testid="mine-geode">
        {got ? <span className="animate-bounce">{Object.keys(got.loot).includes('gem') ? '💎' : '🔮'}</span> : <span style={{ transform: `rotate(${(taps % 2 ? 1 : -1) * taps * 3}deg)`, filter: `brightness(${1 + taps * 0.08})` }}>🪨</span>}
        {!got && taps > 0 && <span className="pointer-events-none absolute inset-0 grid place-items-center text-5xl opacity-70">{'💥'.repeat(0)}{['', '⚡', '✨', '💫', '🌟'][Math.min(4, taps)]}</span>}
      </button>
      {got ? (
        <div className="grid justify-items-center gap-1 text-center">
          <div className="flex flex-wrap justify-center gap-1.5">{Object.entries(got.loot).map(([k, v]) => <span key={k} className="rounded-full bg-surface-2 px-2.5 py-1 font-bold">{r.cfg.resources[k]?.emoji} +{v}</span>)}</div>
          {f && <span className="rounded-xl border px-2 py-1" style={{ borderColor: RARITY[f.rarity] }}>{f.emoji} {f.name}{got.new && <b className="ml-1 text-[#FFB13D]">NEW</b>}</span>}
          <span className="text-xs text-muted">Tap to crack another ({have} left)</span>
        </div>
      ) : <p className="text-sm text-muted">{have < 1 ? 'No geodes yet — dig below 20 metres to find them.' : `${have} geode${have === 1 ? '' : 's'} · tap it ${NEED - taps} more time${NEED - taps === 1 ? '' : 's'} to crack it open`}</p>}
    </div>
  );
}
