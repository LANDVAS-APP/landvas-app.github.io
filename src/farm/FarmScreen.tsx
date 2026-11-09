// Your farm: the 3D farmyard with a bed sheet for planting, watering and harvesting, one-tap
// "harvest all" and "plant all", the market (sell for coins and Ink), the farm games, your farm level
// with its upgrades, buildings, kitchen and orders, the daily chores, and a tractor to drive round.
import { lockLabel, usePlaceAccess } from '../plot/placeAccess';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ClipboardList, Droplets, Gamepad2, ShoppingBasket, Sprout, TrendingUp, Tractor, Wheat } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Farm, FarmBed } from '../backend/types';
import { explorerSvg } from '../explorer/character';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, safeStorage, saveStorage } from '../lib/utils';
import { buzz } from '../native/native';
import { Button, Dialog, PlayerAvatar, ResourceIcon, Spinner } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { createFarm, type FarmScene } from './farm3d';
import { ChoresDialog, choresLeft } from './Chores';
import { Coin, coinFmt, FarmHub, itemInfo, LevelBadge, type HubTab } from './FarmHub';
import { poll } from '../lib/poll';
import { config } from '../env';

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
export const farmKey = (id: string) => ['farm', id] as const;
const LAST_CROP = 'landvas.farm.lastCrop';
const fmtLeft = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };

export default function FarmScreen() {
  const { id } = useParams();
  const q = useQuery({ queryKey: farmKey(id!), queryFn: () => api.farmGet(id!), refetchInterval: poll(120_000) });
  if (q.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#8FD3FF]"><Spinner /></div>;
  if (q.error || !q.data) {
    return (
      <div className="fixed inset-0 grid place-content-center gap-3 bg-[#6CB84A] p-6 text-center text-white">
        <div className="text-5xl">🌾</div><p>This farm couldn’t be found.</p>
        <Link to="/world"><Button variant="secondary">Back to the map</Button></Link>
      </div>
    );
  }
  return <FarmView f={q.data} />;
}

function FarmView({ f }: { f: Farm }) {
  // a farm on more merged plots has more of its games open
  const access = usePlaceAccess('farm', f.id).data;
  const qc = useQueryClient();
  const nav = useNavigate();
  const me = useOnboardedMe();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const haptics = useUi((s) => s.settings.haptics);
  const cv = useRef<HTMLCanvasElement>(null);
  const scene = useRef<FarmScene | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [market, setMarket] = useState(false);
  const [games, setGames] = useState(false);
  const [hub, setHub] = useState(false);
  const [hubTab, setHubTab] = useState<HubTab>('orders');
  const [chores, setChores] = useState(false);
  const [drive, setDrive] = useState(false);
  const [lastCrop, setLastCrop] = useState(() => safeStorage<string>(LAST_CROP, 'carrot'));
  // server time, so the countdowns are right whatever the phone's clock says
  const skew = useMemo(() => new Date(f.server_time).getTime() - Date.now(), [f.server_time]);
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => { const t = setInterval(() => setNow(Date.now() + skew), 1000); return () => clearInterval(t); }, [skew]);
  const crops = f.config.crops;
  const bedAt = (i: number) => f.beds.find((b) => b.idx === i) ?? null;
  const isReady = (b: FarmBed) => b.ready || now >= new Date(b.ready_at).getTime();
  const readyCount = f.beds.filter(isReady).length;
  const emptyCount = f.beds_count - f.beds.length;
  const set = (r: Farm) => qc.setQueryData(farmKey(f.id), (old: Farm | undefined) => ({ ...r, progress: r.progress ?? old?.progress }));
  const lvl = f.progress?.level ?? 1;
  const needLvl = (crop: string) => f.config.progression?.crop_levels[crop] ?? 1;
  const levelUp = (n?: number, level?: number) => { if (n) { confettiCannons(); toast.success(`🌾 Farm level ${level ?? ''}!`, { description: 'New crops, upgrades and buildings may have unlocked — tap 📈 Grow.' }); } };
  // the tractor: plant, water or harvest whatever bed it rolls onto
  const fRef = useRef(f); fRef.current = f;
  const cropRef = useRef(lastCrop); cropRef.current = lastCrop;
  const tractorBusy = useRef(new Set<number>());
  const tally = useRef(0);
  const flushTally = () => { const n = tally.current; tally.current = 0; if (n > 0) api.farmTractorTally(n).then((c) => qc.setQueryData(farmKey(f.id), (old: Farm | undefined) => old?.progress ? { ...old, progress: { ...old.progress, chores: c } } : old)).catch(() => undefined); };
  const onTractor = useRef<(i: number) => void>(() => undefined);
  onTractor.current = (i: number) => {
    const cur = fRef.current; if (!cur.mine || tractorBusy.current.has(i)) return;
    const bed = cur.beds.find((b) => b.idx === i);
    const nowS = Date.now() + skew;
    let call: (() => Promise<Farm>) | null = null, kind: 'plant' | 'water' | 'harvest' = 'plant';
    if (!bed) { call = () => api.farmPlant(cur.id, i, cropRef.current); kind = 'plant'; }
    else if (bed.ready || nowS >= new Date(bed.ready_at).getTime()) { call = () => api.farmHarvest(cur.id, i); kind = 'harvest'; }
    else if (!bed.watered) { call = () => api.farmWater(cur.id, i); kind = 'water'; }
    if (!call) return;
    tractorBusy.current.add(i);
    call().then((r) => {
      set(r);
      if (kind === 'harvest') { const got = Object.entries(r.harvested ?? {}); scene.current?.burst(i, 'harvest', got.map(([k]) => itemInfo(cur.config, k).emoji)); levelUp(r.level_up, r.level); }
      else scene.current?.burst(i, kind === 'water' ? 'water' : 'plant');
      if (kind !== 'water') { tally.current++; if (tally.current >= 5) flushTally(); }
      if (haptics) buzz('light');
    }).catch((e) => { const ge = toGameError(e); if (ge.code !== 'bed_taken' && ge.code !== 'not_ready') toast.error(ge.message, { id: 'tractor-err' }); })
      .finally(() => { tractorBusy.current.delete(i); });
  };
  useEffect(() => { scene.current?.setTractor(drive); if (!drive) { flushTally(); invalidateGame(qc); } }, [drive]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => flushTally(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = cv.current; if (!c) return;
    const sc = createFarm({ canvas: c, beds: f.beds_count, seed: f.seed, reduceMotion: reduce, explorerUrl: svgUrl(explorerSvg(me?.profile.explorer_style, me?.profile.accent_color ?? '#7B5CFF', 184)), onPick: (i) => setSel(i), onTractorOver: (i) => onTractor.current(i) });
    scene.current = sc;
    if (import.meta.env.DEV || config.e2e) Object.assign(window as any, { __landvasFarm: sc, __landvasFarmPick: (i: number | null) => setSel(i) });
    return () => { sc.dispose(); scene.current = null; };
  }, [f.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scene.current?.setBedCount(f.beds_count); }, [f.beds_count]);
  useEffect(() => { scene.current?.setBeds(f.beds, crops, now); }, [f.beds, crops, now]);
  useEffect(() => { scene.current?.select(sel); }, [sel]);
  const bKey = JSON.stringify(Object.fromEntries(Object.entries(f.progress?.buildings ?? {}).map(([k, b]) => [k, [b.lvl, b.ready > 0]])));
  useEffect(() => { scene.current?.setBuildings(f.progress?.buildings ?? {}); }, [bKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (key: string, fn: () => Promise<Farm>, after?: (r: Farm) => void) => {
    setBusy(key);
    // (watering changes nothing outside the farm, so there's nothing else to refresh)
    try { const r = await fn(); set(r); after?.(r); if (!key.startsWith('water-')) invalidateGame(qc); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const plant = (bed: number, crop: string) => act(`plant-${bed}`, () => api.farmPlant(f.id, bed, crop), () => {
    setLastCrop(crop); saveStorage(LAST_CROP, crop); scene.current?.burst(bed, 'plant'); if (haptics) buzz('light');
  });
  const water = (bed: number) => act(`water-${bed}`, () => api.farmWater(f.id, bed), () => { scene.current?.burst(bed, 'water'); if (haptics) buzz('light'); });
  const harvest = (bed: number | null) => act(`harvest-${bed ?? 'all'}`, () => api.farmHarvest(f.id, bed), (r) => {
    const got = Object.entries(r.harvested ?? {});
    const idxs = bed != null ? [bed] : f.beds.filter(isReady).map((b) => b.idx);
    for (const i of idxs) { const b = bedAt(i); if (b) scene.current?.burst(i, 'harvest', Array(3).fill(crops[b.crop]?.emoji ?? '🌾')); }
    if (r.golden) { confettiCannons(); toast.success(`✨ ${r.golden} golden harvest${r.golden === 1 ? '' : 's'}!`, { description: 'Golden produce sells for 5x at the market.' }); }
    else toast.success(`Harvested ${got.map(([k, n]) => `${n} ${crops[k.replace('golden_', '')]?.emoji ?? k}`).join(' ')}`);
    levelUp(r.level_up, r.level);
    if (haptics) buzz('success');
    setSel(null);
  });
  const plantAll = async () => {
    if (lvl < needLvl(lastCrop)) { toast.error('Pick a crop you’ve unlocked first.'); return; }
    const empties = Array.from({ length: f.beds_count }, (_, i) => i).filter((i) => !bedAt(i));
    if (!empties.length) return;
    setBusy('plant-all');
    let r: Farm | null = null, n = 0;
    try { for (const i of empties) { r = await api.farmPlant(f.id, i, lastCrop); n++; scene.current?.burst(i, 'plant'); } }
    catch (e) { toast.error(toGameError(e).message); }
    finally { if (r) set(r); invalidateGame(qc); setBusy(null); if (n) toast.success(`Planted ${n} bed${n === 1 ? '' : 's'} of ${crops[lastCrop]?.emoji} ${crops[lastCrop]?.name.toLowerCase()}`); }
  };

  const selBed = sel != null ? bedAt(sel) : null;
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#8FD3FF] text-white" data-testid="farm">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" data-testid="farm-canvas" />
      {/* top */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <button onClick={() => nav(-1)} className="pointer-events-auto rounded-2xl bg-black/45 p-2.5 backdrop-blur" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
        <button onClick={() => nav('/home')} className="pointer-events-auto rounded-2xl bg-black/45 p-2.5 backdrop-blur text-lg leading-none" aria-label="Go home" title="Your home" data-testid="go-home">🏠</button>
        <div className="min-w-0 flex-1 rounded-2xl bg-black/45 px-3 py-2 backdrop-blur">
          <div className="flex items-center gap-2">
            {!f.mine && <PlayerAvatar p={f.owner} size={22} />}
            <div className="truncate font-display text-lg font-bold leading-tight">{f.mine ? f.name : `@${f.owner.username}’s farm`}</div>
          </div>
          <div className="text-[11px] text-white/75">🌱 {f.beds.length}/{f.beds_count} beds growing · {f.harvests} harvested{f.plots > 1 ? ` · ${f.plots} plots` : ''}{!f.mine && f.owner_level ? ` · farm level ${f.owner_level}` : ''}</div>
        </div>
        {f.mine && f.progress && <LevelBadge p={f.progress} onClick={() => { setHubTab('upgrades'); setHub(true); }} />}
      </div>
      {f.mine && f.items && (
        <div className="no-scrollbar pointer-events-none absolute inset-x-0 top-[calc(max(12px,env(safe-area-inset-top,0px))+64px)] flex gap-1.5 overflow-x-auto px-3" data-testid="farm-items">
          {Object.entries(f.items).map(([k, n]) => (
            <span key={k} title={itemInfo(f.config, k).name} className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-bold backdrop-blur', k.startsWith('golden_') ? 'bg-[#FFC93D]/80 text-black' : 'bg-black/45')}>{k.startsWith('golden_') ? '✨' : ''}{itemInfo(f.config, k).emoji} {n}</span>
          ))}
        </div>
      )}
      {/* the bed you picked */}
      <AnimatePresence>
        {f.mine && sel != null && (
          <motion.div key="bed" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            className="absolute inset-x-3 bottom-[calc(max(12px,env(safe-area-inset-bottom,0px))+76px)] mx-auto max-w-md rounded-3xl border border-white/15 bg-black/70 p-3 shadow-2xl backdrop-blur" data-testid="farm-bed">
            {!selBed ? (
              <>
                <div className="mb-2 flex items-center justify-between text-sm font-bold"><span>🌱 Plant bed {sel + 1}</span><button className="text-xs text-white/60" onClick={() => setSel(null)}>Close</button></div>
                <div className="grid grid-cols-4 gap-1.5" data-testid="crop-picker">
                  {Object.entries(crops).sort((a, b) => a[1].minutes - b[1].minutes).map(([k, c]) => {
                    const locked = lvl < needLvl(k);
                    return (
                      <button key={k} onClick={() => plant(sel, k)} disabled={!!busy || locked} data-testid={`plant-${k}`}
                        className={cn('grid justify-items-center gap-0.5 rounded-2xl p-2 text-center', lastCrop === k ? 'bg-white/20 ring-1 ring-white/50' : 'bg-white/10', 'hover:bg-white/25 disabled:opacity-50')}>
                        <span className={cn('text-2xl', locked && 'grayscale')}>{c.emoji}</span>
                        <span className="w-full truncate text-[10.5px] font-bold">{c.name}</span>
                        <span className="text-[9.5px] text-white/65">{locked ? `🔒 level ${needLvl(k)}` : <>{c.minutes < 60 ? `${c.minutes}m` : `${c.minutes / 60}h`} · {c.seed ? <>{c.seed}💧</> : 'free'}</>}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : isReady(selBed) ? (
              <div className="flex items-center gap-3">
                <span className="text-4xl">{crops[selBed.crop]?.emoji}</span>
                <div className="min-w-0 flex-1"><div className="font-bold">{crops[selBed.crop]?.name} is ready!</div><div className="text-xs text-white/65">{selBed.watered ? 'Watered: +1 extra' : 'Harvest it — sometimes it comes up golden ✨'}</div></div>
                <Button variant="rainbow" loading={busy === `harvest-${sel}`} onClick={() => harvest(sel)} data-testid="farm-harvest"><Wheat className="h-4 w-4" /> Harvest</Button>
              </div>
            ) : (
              <div className="grid gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{crops[selBed.crop]?.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{crops[selBed.crop]?.name} · ready in {fmtLeft(new Date(selBed.ready_at).getTime() - now)}</div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#7BD957]" style={{ width: `${Math.min(100, ((now - new Date(selBed.planted_at).getTime()) / Math.max(1, new Date(selBed.ready_at).getTime() - new Date(selBed.planted_at).getTime())) * 100)}%` }} /></div>
                  </div>
                  {!selBed.watered
                    ? <Button variant="secondary" loading={busy === `water-${sel}`} onClick={() => water(sel)} data-testid="farm-water"><Droplets className="h-4 w-4" /> Water</Button>
                    : <span className="rounded-full bg-[#4FA8FF]/30 px-2 py-1 text-[11px] font-bold">💧 Watered</span>}
                </div>
                {!selBed.watered && <div className="text-[11px] text-white/60">Watering makes it grow {Math.round(f.config.water_speedup * 100)}% faster and gives +1 at harvest.</div>}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {/* the bar */}
      {f.mine ? (
        <div className="absolute inset-x-0 bottom-0 grid justify-items-center gap-2 p-3 pb-[max(12px,env(safe-area-inset-bottom,0px))]">
          {drive ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-black/55 px-3 py-1.5 text-xs font-bold backdrop-blur" data-testid="tractor-hint">🚜 Drag any way to drive · rolls over beds to plant {crops[lastCrop]?.emoji}, water and harvest</span>
              <Button variant="rainbow" onClick={() => setDrive(false)} data-testid="tractor-off">Park</Button>
            </div>
          ) : (
            <>
              {(readyCount > 0 || emptyCount > 0) && (
                <div className="flex justify-center gap-2">
                  {readyCount > 0 && <Button variant="rainbow" loading={busy === 'harvest-all'} onClick={() => harvest(null)} data-testid="farm-harvest-all"><Wheat className="h-4 w-4" /> Harvest all ({readyCount})</Button>}
                  {emptyCount > 0 && <Button variant="secondary" loading={busy === 'plant-all'} onClick={plantAll} data-testid="farm-plant-all"><Sprout className="h-4 w-4" /> Plant all {crops[lastCrop]?.emoji}</Button>}
                </div>
              )}
              <div className="flex max-w-full flex-wrap justify-center gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => { setSel(null); setDrive(true); }} data-testid="farm-tractor"><Tractor className="h-4 w-4" /> Tractor</Button>
                <Button size="sm" variant="secondary" onClick={() => setChores(true)} data-testid="farm-chores-btn"><ClipboardList className="h-4 w-4" /> Chores{choresLeft(f.progress?.chores) ? <span className="ml-0.5 rounded-full bg-[#FF4D6D] px-1.5 text-[10px] text-white">{choresLeft(f.progress?.chores)}</span> : null}</Button>
                <Button size="sm" variant="secondary" onClick={() => { setHubTab('orders'); setHub(true); }} data-testid="farm-hub-btn"><TrendingUp className="h-4 w-4" /> Grow{f.progress?.orders.some((o) => o.ready && o.can_fill) ? <span className="ml-0.5 h-2 w-2 rounded-full bg-[#FF4D6D]" /> : null}</Button>
                <Button size="sm" variant="secondary" onClick={() => setMarket(true)} data-testid="farm-market"><ShoppingBasket className="h-4 w-4" /> Market</Button>
                <Button size="sm" variant="secondary" onClick={() => setGames(true)} data-testid="farm-games"><Gamepad2 className="h-4 w-4" /> Games</Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 p-3 pb-[max(12px,env(safe-area-inset-bottom,0px))] text-center text-xs text-white/85"><span className="rounded-full bg-black/45 px-3 py-1.5 backdrop-blur">You’re visiting — @{f.owner.username} will see you dropped by 🌾</span></div>
      )}
      {f.mine && <Market open={market} onOpenChange={setMarket} f={f} />}
      {f.mine && f.progress && <FarmHub open={hub} onOpenChange={setHub} f={f} tab={hubTab} setTab={setHubTab} />}
      {f.mine && f.progress && <ChoresDialog open={chores} onOpenChange={setChores} f={f} haptics={haptics} />}
      {f.mine && (
        <Dialog open={games} onOpenChange={setGames} title="🎮 Farm games" description={access && access.open < access.total ? `${access.open} of ${access.total} open — merge more farm plots into this farm to open the rest.` : 'Quick, easy and fun. Every game pays Ink, Farm Coins, XP and a basket of produce.'}>
          <div className="grid grid-cols-2 gap-2" data-testid="farm-games-list">
            {Object.entries(f.config.games).sort(([a], [b]) => (access ? access.games.indexOf(a) - access.games.indexOf(b) : 0)).map(([k, g]) => { const land = lockLabel(access, k); return (
              <button key={k} disabled={!!land} onClick={() => nav(`/farm/${f.id}/play/${k}`)} data-testid={`farm-game-${k}`} className={cn('relative grid justify-items-center gap-1 rounded-2xl bg-surface-2 p-3 text-center hover:bg-surface-3', land && 'opacity-55')}>
                <span className={cn('text-4xl', land && 'grayscale')}>{g.emoji}</span><b className="text-sm">{g.name}</b>
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase text-accent">{g.dim}</span>
                <span className="text-[11px] text-muted">{land ? `🔒 Opens at ${land}` : `up to ${g.max_ink} Ink`}</span>
              </button>
            ); })}
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Market({ open, onOpenChange, f }: { open: boolean; onOpenChange(o: boolean): void; f: Farm }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [today, setToday] = useState(f.ink_today ?? 0);
  useEffect(() => setToday(f.ink_today ?? 0), [f.ink_today]);
  const crops = f.config.crops;
  const items = Object.entries(f.items ?? {}).filter(([, n]) => n > 0);
  const priceOf = (k: string) => itemInfo(f.config, k).sell;
  const sell = async (k: string, n: number) => {
    setBusy(k);
    try {
      const r = await api.farmSell(k, n);
      qc.setQueryData(farmKey(f.id), (old: Farm | undefined) => old && ({ ...old, items: r.items, ink_today: r.ink_today, progress: r.progress })); setToday(r.ink_today); invalidateGame(qc);
      toast.success(`Sold ${r.sold} ${itemInfo(f.config, k).emoji} for ${r.coins} 🪙${r.paid ? ` + ${r.paid} Ink` : ''}`);
      if (r.level_up) { confettiCannons(); toast.success(`🌾 Farm level ${r.progress.level}!`); }
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const capLeft = Math.max(0, f.config.daily_cap - today);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="🧺 Farmers’ market" description={`Sell for Farm Coins 🪙 (always) and Ink (${today}/${f.config.daily_cap} farm Ink today).`}>
      <div className="grid gap-2" data-testid="market">
        <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-ok" style={{ width: `${Math.min(100, (today / f.config.daily_cap) * 100)}%` }} /></div>
        {!items.length && <p className="py-4 text-center text-sm text-muted">Nothing to sell yet — harvest some crops (or win a farm game).</p>}
        {items.map(([k, n]) => (
          <div key={k} className={cn('flex items-center gap-3 rounded-2xl p-2.5', k.startsWith('golden_') ? 'bg-[#FFC93D]/15' : 'bg-surface-2')}>
            <span className="text-2xl">{itemInfo(f.config, k).emoji}</span>
            <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{k.startsWith('golden_') ? '✨ ' : ''}{itemInfo(f.config, k).name} × {n}</div><div className="flex items-center gap-0.5 text-[11px] text-muted"><Coin /> {coinFmt(priceOf(k))}{capLeft ? <> + <ResourceIcon r="ink" className="h-3 w-3" /></> : null} each</div></div>
            <Button size="sm" variant="rainbow" loading={busy === k} onClick={() => sell(k, n)} data-testid={`sell-${k}`}>Sell all</Button>
          </div>
        ))}
        {!capLeft && items.length > 0 && <p className="text-center text-xs text-muted">You’ve had today’s farm Ink — sales still pay Farm Coins for upgrades.</p>}
      </div>
    </Dialog>
  );
}
