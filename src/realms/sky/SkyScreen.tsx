// ☁️ Sky Island: your floating island of hexagonal sky-chunks. Tap a chunk to build on it (Cloud Catchers, Bird
// Nests, Wind Turbines, Rainbow Prisms, Sun Mirrors, Moon Bells, Sky Gardens), tap a building to harvest, upgrade
// or clear it. Matching neighbours make more; gardens help everything round them. The weather changes every
// 15 minutes: harvest a building while it's its weather for double. Grow the island chunk by chunk, and fill the
// hot-air balloons' orders for starlight. The crew, workshop, market, book and games are in the menu.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Hammer, Menu } from 'lucide-react';
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
import { sfx } from '../../arcade/sfx';
import { fmt, useRealmCore } from '../core';
import { createSky3D, type SkyScene } from './sky3d';
import { KiteFlyer } from './KiteFlyer';
import { frontier, parse, storedNow, weatherAt, type SkyCore } from './skyCore';

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
export const skyKey = (id: string) => ['sky', id] as const;
type SkyRes = Awaited<ReturnType<typeof api.skyBuild>>;

export default function SkyScreen({ id }: { id: string }) {
  const q = useQuery({ queryKey: skyKey(id), queryFn: () => api.skyGet(id), staleTime: 30_000, refetchOnWindowFocus: false });
  if (q.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#9CCBF0]"><Spinner /></div>;
  if (q.error || !q.data) return <div className="fixed inset-0 grid place-content-center gap-3 bg-[#9CCBF0] p-6 text-center text-white"><div className="text-5xl">☁️</div><p>This island couldn’t be found.</p><Link to="/world"><Button variant="secondary">Back to the map</Button></Link></div>;
  return <Sky key={q.data.id} data={q.data} />;
}

function Sky({ data }: { data: Realm & { sky_core: SkyCore } }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = useOnboardedMe();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const haptics = useUi((s) => s.settings.haptics);
  const [r, setR] = useState<Realm>(data);
  const [core, setCore] = useState<SkyCore>(data.sky_core);
  const offset = useMemo(() => Date.parse(core.server_time) - Date.now(), [core.server_time]);
  const cv = useRef<HTMLCanvasElement>(null);
  const scene = useRef<SkyScene | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [ghost, setGhost] = useState<string | null>(null);
  const [expand, setExpand] = useState(false);
  const [orders, setOrders] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const R = useRealmCore({ r, setR, extraGames: { kite: KiteFlyer }, burst: (_a, e) => scene.current?.burst(null, e) });
  const c = core.cfg, wallet = r.me.wallet, star = wallet.starlight ?? 0;
  const emojis = useMemo(() => Object.fromEntries(Object.entries(r.cfg.resources).map(([k, v]) => [k, v.emoji])), [r.cfg]);
  // the weather, worked out here the same way as on the server
  const nowMs = Date.now() + offset;
  const block = Math.floor(nowMs / (c.weather_minutes * 60000));
  const weather = c.weathers[weatherAt(r.seed, block)], next = c.weathers[weatherAt(r.seed, block + 1)];
  const left = Math.max(0, (block + 1) * c.weather_minutes * 60000 - nowMs);
  const boosted = Object.entries(c.buildings).find(([, b]) => b.weather === weather.id);
  const ready = Object.keys(core.tiles).filter((k) => storedNow(core, k, nowMs) >= 1);
  const readyOrders = core.orders.filter((o) => Date.parse(o.ready_at) <= nowMs);

  useEffect(() => {
    if (!cv.current) return;
    const s = createSky3D({
      canvas: cv.current, seed: r.seed, reduceMotion: reduce,
      explorerUrl: svgUrl(explorerSvg(me?.profile.explorer_style as ExplorerStyle | undefined, me?.profile.accent_color ?? '#7B5CFF', 184)),
      onTapTile: (k) => tapTile.current(k), onTapGhost: (k) => { setGhost(k); setSel(null); }, onTapBalloon: () => setOrders(true), onTapNothing: () => setSel(null),
    });
    scene.current = s;
    if (import.meta.env.DEV || location.search.includes('e2e=1')) Object.assign(window, { __landvasSky: s, __landvasSkyTap: (k: string) => tapTile.current(k), __landvasSkyGhost: (k: string) => setGhost(k) });
    return () => { s.dispose(); scene.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scene.current?.setStored((k, now) => storedNow(core, k, now + offset)); }, [core, offset]);
  useEffect(() => { scene.current?.setIsland(core, emojis, expand && r.mine, frontier(core)); }, [core, emojis, expand, r.mine]);
  useEffect(() => { scene.current?.setOrders(core.orders, Date.now() + offset); }, [core, offset, readyOrders.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scene.current?.setWeather(weather.id); }, [weather.id]);
  useEffect(() => { scene.current?.select(sel); }, [sel]);
  useEffect(() => { scene.current?.setPaused(!!R.game); }, [R.game]);
  const tapTile = useRef((k: string) => {}); tapTile.current = (k: string) => { setSel((cur) => (cur === k ? null : k)); setGhost(null); };

  const run = async <T extends SkyRes>(key: string, f: () => Promise<T>, after?: (x: T) => void) => {
    if (!r.mine) { toast('Only the owner can do that here'); return null; }
    setBusy(key);
    try {
      const x = await f(); setCore(x.sky); setR((cur) => ({ ...cur, me: x.me, level: x.level })); if (x.level_up) R.levelUp(x.level_up); after?.(x); invalidateGame(qc); return x;
    } catch (e) { const er = toGameError(e); toast.error(er.code === 'not_enough' ? 'Not enough for that yet' : er.code === 'level_too_low' ? 'Level the island up first' : er.message); return null; }
    finally { setBusy(null); }
  };
  const harvest = (keys: string[] | null) => run('harvest', () => api.skyHarvest(r.id, keys), (x) => {
    const got = Object.entries(x.got);
    for (const [k, n] of got) scene.current?.burst(k, Array(Math.min(6, Math.max(1, Math.ceil(n / 10)))).fill(emojis[c.buildings[x.sky.tiles[k]?.b ?? '']?.makes ?? ''] ?? '✨'));
    if (!got.length) { toast('Nothing ready yet — buildings fill up over time'); return; }
    sfx.coin(); if (haptics) buzz('medium');
    toast.success(`Harvested ${Object.entries(x.loot).map(([k, v]) => `${emojis[k]} ${fmt(v)}`).join('  ')}${x.boosted.length ? `  ·  ${weather.emoji} ×2 weather bonus!` : ''}`);
  });

  const t = sel ? core.tiles[sel] : null, tb = t?.b ? c.buildings[t.b] : null;
  const stored = sel ? storedNow(core, sel, nowMs) : 0;
  const upCost = t?.b && tb ? Math.round(tb.cost * c.upgrade.cost_mult ** (t.lv ?? 1)) : 0;
  const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
  return (
    <div className="fixed inset-0 z-40 select-none overflow-hidden bg-[#9CCBF0] text-white" data-testid="realm" data-kind="sky">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" style={{ touchAction: 'none' }} data-testid="sky-canvas" />
      <div className="pointer-events-none absolute inset-x-0 top-0 grid gap-1.5 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <div className="flex items-start gap-2">
          <button onClick={() => (history.length > 1 ? nav(-1) : nav('/world'))} className="pointer-events-auto grid h-10 w-10 place-items-center rounded-xl bg-[#1E2A4A]/70 backdrop-blur" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1 rounded-2xl bg-[#1E2A4A]/70 px-3 py-1.5 backdrop-blur">
            <div className="flex items-center gap-2"><span className="truncate font-display text-base font-black">☁️ {r.name}</span>{!r.mine && <span className="flex items-center gap-1 text-[11px] text-white/70"><PlayerAvatar p={r.owner} size={14} />@{r.owner.username}’s</span>}</div>
            <div className="mt-0.5 flex items-center gap-2" data-testid="realm-level"><b className="text-xs text-[#BDEBFF]">Lv {r.level.level}</b>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#BDEBFF]" style={{ width: `${r.level.max ? 100 : (r.level.into / Math.max(1, r.level.need)) * 100}%` }} /></div>
              <span className="text-[10px] text-white/60">{Object.keys(core.tiles).length} chunks</span></div>
          </div>
          {r.mine && r.me.bonus_ready && <button onClick={() => void R.daily()} className="pointer-events-auto rounded-xl bg-[#FFE14D] px-2.5 py-2 text-xs font-black text-black shadow-lg" data-testid="realm-daily">🎁</button>}
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-[#1E2A4A]/70 px-3 py-1.5 text-xs backdrop-blur" data-testid="sky-weather">
          <span className="text-xl">{weather.emoji}</span>
          <span className="min-w-0 flex-1"><b>{weather.name}</b>{boosted && <span className="text-[#FFE36B]"> · {boosted[1].emoji} {boosted[1].name}s harvest ×{c.weather_mult}</span>}</span>
          <span className="shrink-0 text-white/70">{next.emoji} in {mm}:{String(ss).padStart(2, '0')}</span>
        </div>
        <div className="pointer-events-auto flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" data-testid="realm-wallet">
          <span className="shrink-0 rounded-full bg-[#1E2A4A]/75 px-2.5 py-1 text-xs font-black text-[#FFE36B] backdrop-blur">✨ {fmt(star)}</span>
          {Object.entries(r.cfg.resources).filter(([k, v]) => k !== 'starlight' && (wallet[k] ?? 0) >= 1 && !v.made).map(([k, v]) => <span key={k} className="shrink-0 rounded-full bg-[#1E2A4A]/60 px-2 py-1 text-xs font-bold backdrop-blur">{v.emoji} {fmt(wallet[k])}</span>)}
        </div>
      </div>

      {/* what you've picked */}
      {(sel || ghost) && !R.game && (
        <div className="absolute inset-x-0 bottom-[86px] z-20 flex justify-center px-3" data-testid="sky-panel">
          <div className="w-full max-w-md rounded-3xl bg-[#1E2A4A]/92 p-3 shadow-2xl backdrop-blur">
            {ghost ? (
              <div className="grid gap-2">
                <b className="text-base">🏝️ A new sky-chunk</b>
                <p className="text-sm text-white/75">Grow the island here. The more chunks you have, the more you can build (and the more each new one costs).</p>
                <div className="flex gap-2"><Button variant="ghost" onClick={() => setGhost(null)}>Not now</Button>
                  <Button variant="rainbow" className="flex-1" disabled={star < core.expand_cost} loading={busy === 'expand'} data-testid="sky-expand-go"
                    onClick={() => { const [q, rr] = parse(ghost); void run('expand', () => api.skyExpand(r.id, q, rr), () => { sfx.perfect(3); scene.current?.burst(ghost, ['✨', '☁️', '✨']); setGhost(null); }); }}>Add it · ✨ {fmt(core.expand_cost)}</Button></div>
              </div>
            ) : t && !t.b ? (
              <div className="grid gap-2">
                <div className="flex items-center justify-between"><b className="text-base">🏗️ Build here</b><button onClick={() => setSel(null)} className="text-xs text-white/60">close</button></div>
                <div className="grid max-h-[38vh] gap-1.5 overflow-y-auto">
                  {Object.entries(c.buildings).sort((a, b) => a[1].level - b[1].level).map(([k, b]) => {
                    const locked = r.level.level < b.level;
                    return (
                      <button key={k} disabled={locked || star < b.cost || busy != null} onClick={() => { const [q, rr] = parse(sel!); void run(`build:${k}`, () => api.skyBuild(r.id, q, rr, k), () => { sfx.perfect(2); scene.current?.burst(sel, [b.emoji, '✨']); }); }}
                        className={cn('flex items-center gap-2 rounded-2xl bg-white/10 p-2 text-left disabled:opacity-50', !locked && star >= b.cost && 'hover:bg-white/20')} data-testid={`sky-build-${k}`}>
                        <span className="text-3xl">{b.emoji}</span>
                        <span className="min-w-0 flex-1"><b className="block text-sm">{b.name}</b>
                          <span className="block text-xs text-white/70">{b.makes ? `${emojis[b.makes]} ${b.per_hour}/h · ${c.weathers.find((w) => w.id === b.weather)?.emoji} weather ×2` : '+10% to every building next to it'}</span></span>
                        <span className="text-xs font-black">{locked ? `🔒 Lv ${b.level}` : `✨ ${fmt(b.cost)}`}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : t && tb ? (
              <div className="grid gap-2">
                <div className="flex items-center gap-2"><span className="text-3xl">{tb.emoji}</span>
                  <span className="min-w-0 flex-1"><b className="block">{tb.name} <span className="text-xs font-normal text-white/60">lv {t.lv ?? 1}/{c.upgrade.max}</span></b>
                    <span className="block text-xs text-white/70">{tb.makes ? `${emojis[tb.makes]} ${(tb.per_hour * (1 + c.upgrade.rate_per_level * ((t.lv ?? 1) - 1))).toFixed(1)}/h base · holds ${c.cap_hours}h · ${c.weathers.find((w) => w.id === tb.weather)?.emoji} ×2` : 'Helps every building next to it'}</span></span>
                  <button onClick={() => setSel(null)} className="text-xs text-white/60">close</button></div>
                {tb.makes && <div className="flex items-center gap-2"><span className="text-2xl">{emojis[tb.makes]}</span><b className="text-xl" data-testid="sky-stored">{Math.floor(stored)}</b>{tb.weather === weather.id && <span className="rounded-full bg-[#FFD23F] px-2 text-xs font-black text-[#2A1A08]">×{c.weather_mult} now!</span>}</div>}
                <div className="flex flex-wrap gap-2">
                  {tb.makes && <Button variant="rainbow" disabled={stored < 1} loading={busy === 'harvest'} onClick={() => void harvest([sel!])} data-testid="sky-harvest-one">Harvest</Button>}
                  {tb.makes && (t.lv ?? 1) < c.upgrade.max && <Button variant="secondary" disabled={star < upCost} loading={busy === 'upgrade'} onClick={() => { const [q, rr] = parse(sel!); void run('upgrade', () => api.skyUpgrade(r.id, q, rr), () => { sfx.perfect(3); scene.current?.burst(sel, ['⬆️', '✨']); }); }} data-testid="sky-upgrade">Upgrade · ✨ {fmt(upCost)}</Button>}
                  <Button variant="ghost" className="text-white/80" loading={busy === 'clear'} onClick={() => { if (!confirm(`Take down the ${tb.name}? You won’t get the starlight back.`)) return; const [q, rr] = parse(sel!); void run('clear', () => api.skyClear(r.id, q, rr)); }}>Take down</Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* the bottom bar */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center p-3 pb-[max(14px,env(safe-area-inset-bottom,0px))]">
        <div className="flex gap-1.5 rounded-2xl bg-[#1E2A4A]/75 p-1.5 backdrop-blur" data-testid="sky-bar">
          {r.mine && <button onClick={() => { setExpand((x) => !x); setSel(null); setGhost(null); }} className={cn('flex h-12 items-center gap-1 rounded-xl px-3 text-sm font-black', expand ? 'bg-[#FFD23F] text-[#2A1A08]' : 'bg-white/10')} data-testid="sky-grow"><Hammer className="h-4 w-4" />{expand ? 'Done' : 'Grow'}</button>}
          {r.mine && <button onClick={() => void harvest(null)} disabled={busy === 'harvest'} className={cn('relative flex h-12 items-center gap-1 rounded-xl px-3 text-sm font-black', ready.length ? 'bg-[#3DDC97] text-[#0F2A1E]' : 'bg-white/10')} data-testid="sky-harvest-all">🌾 Harvest{ready.length > 0 && <span className="rounded-full bg-black/25 px-1.5 text-xs">{ready.length}</span>}</button>}
          <button onClick={() => setOrders(true)} className={cn('relative flex h-12 items-center gap-1 rounded-xl px-3 text-sm font-black', readyOrders.length ? 'bg-[#FF8AB3] text-[#2A0A1A]' : 'bg-white/10')} data-testid="sky-orders">🎈 {readyOrders.length}</button>
          <button onClick={() => setMenu(true)} className="grid h-12 w-12 place-items-center rounded-xl bg-white/10" aria-label="More" data-testid="sky-menu"><Menu className="h-5 w-5" /></button>
        </div>
      </div>
      {expand && !sel && !ghost && <div className="pointer-events-none absolute inset-x-0 bottom-[86px] flex justify-center"><span className="rounded-full bg-[#1E2A4A]/80 px-3 py-1.5 text-xs backdrop-blur">Tap a ✚ at the edge to add a chunk · next one ✨ {fmt(core.expand_cost)}</span></div>}

      <Dialog open={orders} onOpenChange={setOrders} title="🎈 Balloon orders" description={<>Balloons dock wanting things from your island. Fill an order for starlight, XP and a little Ink. {core.deliveries > 0 && `${core.deliveries} delivered so far.`}</>}>
        <div className="grid gap-2" data-testid="sky-orders-list">
          {core.orders.map((o) => {
            const coming = Date.parse(o.ready_at) > nowMs, can = Object.entries(o.needs).every(([k, n]) => (wallet[k] ?? 0) >= n);
            return (
              <div key={o.id} className="grid gap-2 rounded-2xl border border-line bg-surface-2/60 p-3" data-testid="sky-order">
                <div className="flex items-center gap-2"><span className="text-3xl">{o.balloon}</span>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">{Object.entries(o.needs).map(([k, n]) => <span key={k} className={cn('rounded-full px-2 py-0.5 text-sm font-bold', (wallet[k] ?? 0) >= n ? 'bg-[#3DDC97]/20' : 'bg-[#FF6B6B]/15')}>{emojis[k]} {fmt(Math.min(wallet[k] ?? 0, n))}/{n}</span>)}</div></div>
                <div className="flex items-center gap-2 text-sm"><span className="flex-1">Pays <b>✨ {fmt(o.reward)}</b> · 💧 {o.ink}</span>
                  {coming ? <span className="text-xs text-muted">arriving in {Math.ceil((Date.parse(o.ready_at) - nowMs) / 1000)}s</span> : <>
                    {r.mine && core.reroll_ready && <Button size="sm" variant="ghost" onClick={() => void run(`reroll:${o.id}`, () => api.skyReroll(r.id, o.id))}>Send away</Button>}
                    {r.mine && <Button size="sm" variant="rainbow" disabled={!can} loading={busy === `deliver:${o.id}`} onClick={() => void run(`deliver:${o.id}`, () => api.skyDeliver(r.id, o.id), (x) => { sfx.jackpot(); toast.success(`Delivered! ✨ +${fmt(x.reward)}${x.ink ? ` · 💧 +${x.ink} Ink` : ''}`); })} data-testid="sky-deliver">Deliver</Button>}
                  </>}
                </div>
              </div>
            );
          })}
        </div>
      </Dialog>
      <Dialog open={menu} onOpenChange={setMenu} title="☁️ Around the island">
        <div className="grid grid-cols-2 gap-2">
          {([['play', '🎮', 'Games', 'Sky Glide, Kite Flyer'], ['build', '🧑‍✈️', 'Sky crew', 'Helpers who work while you’re away'], ['make', '🔨', 'Workshop', 'Cushions, kites, lanterns…'], ['market', '⚖️', 'Market', 'Sell for starlight'], ['book', '📖', 'Sky journal', 'Rare finds']] as const).map(([p, e, n, d]) => (
            <button key={p} onClick={() => { setMenu(false); R.setPanel(p); }} className="grid gap-0.5 rounded-2xl border border-line bg-surface-2/60 p-3 text-left" data-testid={`sky-open-${p}`}><span className="text-3xl">{e}</span><b>{n}</b><span className="text-xs text-muted">{d}</span></button>
          ))}
          {r.mine && R.pendingAny && <button onClick={() => { setMenu(false); void R.collect(); }} className="grid gap-0.5 rounded-2xl bg-[#3DDC97]/20 p-3 text-left"><span className="text-3xl">📦</span><b>Collect</b><span className="text-xs text-muted">What your crew made</span></button>}
        </div>
      </Dialog>
      {R.dialogs}
    </div>
  );
}
