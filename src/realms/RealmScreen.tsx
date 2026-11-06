// A realm plot (Crystal Mine, Sky Island, Inventor's Workshop, Restaurant, Dungeon): walk round it with your explorer.
// Step up to a station and its button appears (or tap a station in the bar along the bottom to walk there):
//   play     the signature minigame (anyone can play; the owner gets a cut of visitors' hauls)
//   collect  bring in what your producers made while you were away
//   build    producers and upgrades
//   make     recipes (bars, gadgets, dishes, potions…)
//   market   sell resources for the place's currency
//   book     the collection of rare finds, and the zones you've opened (and what's next)
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Lock, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Bag, ExplorerStyle, Realm, RealmFinish, RealmItem } from '../backend/types';
import { explorerSvg } from '../explorer/character';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { Button, Dialog, PlayerAvatar, Spinner } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { sfx } from '../arcade/sfx';
import { REALM_GAMES } from './games';
import { REALM_META } from './kinds';
import { createRealm3D, STATIONS, type RealmScene, type Station } from './realm3d';

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : Math.floor(n).toLocaleString());
const RARITY: Record<string, string> = { common: '#9AA0B0', uncommon: '#3DDC97', rare: '#22B8FF', epic: '#B57BFF', legendary: '#FFB13D' };
export const realmKey = (id: string) => ['realm', id] as const;

export default function RealmScreen() {
  const { id } = useParams();
  const q = useQuery({ queryKey: realmKey(id!), queryFn: () => api.realmGet(id!), staleTime: 30_000, refetchOnWindowFocus: false });
  if (q.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#0C0A12]"><Spinner /></div>;
  if (q.error || !q.data) return <div className="fixed inset-0 grid place-content-center gap-3 bg-[#0C0A12] p-6 text-center text-white"><div className="text-5xl">🗺️</div><p>This place couldn’t be found.</p><Link to="/world"><Button variant="secondary">Back to the map</Button></Link></div>;
  return <RealmView key={q.data.id} r={q.data} />;
}

function RealmView({ r: initial }: { r: Realm }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = useOnboardedMe();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const [r, setR] = useState(initial);
  useEffect(() => setR(initial), [initial]);
  const meta = REALM_META[r.kind], cfg = r.cfg;
  const cur = cfg.resources[cfg.currency];
  const cv = useRef<HTMLCanvasElement>(null);
  const scene = useRef<RealmScene | null>(null);
  const [near, setNear] = useState<Station | null>(null);
  const [panel, setPanel] = useState<Station | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [game, setGame] = useState<{ session: string; seed: number; level: number; id: string } | null>(null);
  const [result, setResult] = useState<RealmFinish | null>(null);
  const [live, setLive] = useState(0);
  const scoreNow = useRef(0);
  const offset = useMemo(() => Date.parse(r.server_time) - Date.now(), [r.server_time]);

  // the scene
  useEffect(() => {
    if (!cv.current) return;
    const style = me?.profile.explorer_style as ExplorerStyle | undefined;
    scene.current = createRealm3D({
      canvas: cv.current, kind: r.kind, seed: r.seed, reduceMotion: reduce,
      explorerUrl: svgUrl(explorerSvg(style, me?.profile.accent_color ?? '#7B5CFF', 184)),
      zoneLevels: cfg.zones.map((z) => z.level), producerIds: Object.keys(cfg.producers),
      onNear: (s) => setNear(s),
    });
    return () => { scene.current?.dispose(); scene.current = null; };
  }, [r.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // what's piled up so far (worked out here every second from the rates)
  const pending = useMemo<Bag>(() => {
    if (!r.mine) return {};
    const mins = Math.min((Date.now() + offset - Date.parse(r.collected_at)) / 60000, r.away_hours * 60);
    return Object.fromEntries(Object.entries(r.rates).map(([k, v]) => [k, v * Math.max(0, mins)]));
  }, [r, offset, live]); // eslint-disable-line react-hooks/exhaustive-deps
  const pendingAny = Object.values(pending).some((v) => v >= 1);
  useEffect(() => { const t = setInterval(() => setLive((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { scene.current?.setState(r.level.level, r.producers, pendingAny); }, [r.level.level, r.producers, pendingAny]);

  const zoneNow = [...cfg.zones].reverse().find((z) => r.level.level >= z.level) ?? cfg.zones[0];
  const zoneNext = cfg.zones.find((z) => r.level.level < z.level);
  const wallet = r.me.wallet;
  const sorted = Object.entries(cfg.resources).filter(([k]) => k !== cfg.currency).sort((a, b) => (a[1].made ? 100 : 0) + (a[1].tier ?? 0) - ((b[1].made ? 100 : 0) + (b[1].tier ?? 0)));
  const have = (k: string) => Math.floor(wallet[k] ?? 0);
  const can = (cost: Bag) => Object.entries(cost).every(([k, v]) => (wallet[k] ?? 0) >= v);
  const costLine = (cost: Bag) => Object.entries(cost).map(([k, v]) => <span key={k} className={cn('whitespace-nowrap', (wallet[k] ?? 0) < v && 'text-[#FF8A8A]')}>{cfg.resources[k]?.emoji} {fmt(v)}</span>);
  const levelUp = (lv: number | null | undefined) => { if (!lv) return; sfx.win(5); confettiCannons(); const z = cfg.zones.find((x) => x.level === lv); toast.success(z ? `Level ${lv}! ${z.name} is open 🎉` : `Level ${lv}! 🎉`, { duration: 4000 }); };
  const act = async <T,>(key: string, f: () => Promise<T>) => {
    setBusy(key);
    try { return await f(); } catch (e) { const er = toGameError(e); toast.error(er.code === 'not_enough' ? 'Not enough for that yet' : er.code === 'level_too_low' ? 'Level this place up first' : er.message); return null; } finally { setBusy(null); }
  };
  const open = (s: Station) => { if (s === 'collect') void collect(); else setPanel(s); };
  const collect = async () => {
    if (!r.mine) { toast('Only the owner can collect here'); return; }
    const res = await act('collect', () => api.realmCollect(r.id));
    if (!res) return;
    const got = Object.entries(res.got).filter(([, v]) => v >= 1);
    scene.current?.burst('collect', got.flatMap(([k, v]) => Array(Math.min(4, Math.ceil(v / 20))).fill(cfg.resources[k]?.emoji ?? '✨')));
    if (got.length) { sfx.coin(); toast.success(`Collected ${got.map(([k, v]) => `${cfg.resources[k]?.emoji} ${fmt(v)}`).join('  ')}`); } else toast('Nothing to collect yet — build producers to make resources while you’re away');
    setR(res.view); levelUp(res.level_up); invalidateGame(qc);
  };
  const buy = async (type: 'producers' | 'upgrades', item: string) => { const res = await act(`${type}:${item}`, () => api.realmBuy(r.id, type, item)); if (res) { sfx.perfect(2); setR(res.view); scene.current?.burst('build', [cfg[type][item].emoji]); } };
  const make = async (recipe: string, n: number) => { const res = await act(`make:${recipe}`, () => api.realmMake(r.id, recipe, n)); if (res) { sfx.coin(); setR(res.view); scene.current?.burst('make', Array(Math.min(8, n)).fill(cfg.recipes[recipe].emoji)); if (res.first) toast.success(`First ${cfg.recipes[recipe].name}! ${cfg.recipes[recipe].emoji}`); levelUp(res.level_up); } };
  const sell = async (res: string, n?: number) => { const out = await act(`sell:${res}`, () => api.realmSell(r.kind, res, n)); if (out) { sfx.tickets?.(8); setR({ ...r, me: out.me }); scene.current?.burst('market', [cur.emoji, cur.emoji, cur.emoji]); toast.success(`Sold ${fmt(out.sold)} ${cfg.resources[res].emoji} for ${cur.emoji} ${fmt(out.got)}`); } };
  const daily = async () => { const out = await act('daily', () => api.realmDaily(r.kind)); if (out) { sfx.jackpot(); setR({ ...r, me: out.me }); toast.success(`Daily bonus: ${cur.emoji} ${out.amount}${out.paid ? ` and 💧 ${out.paid} Ink` : ''} · ${out.streak}-day streak`); invalidateGame(qc); } };
  const play = async () => {
    const gid = Object.keys(cfg.games)[0];
    const s = await act('play', () => api.realmStart(r.id, gid));
    if (s) { setPanel(null); scoreNow.current = 0; setGame({ session: s.session, seed: s.seed, level: s.level, id: gid }); }
  };
  const ending = useRef(false);
  const finish = async (score: number) => {
    const g = game!; if (!g || ending.current) return; ending.current = true; const minS = cfg.games[g.id].min_seconds;
    // a round that ended very quickly waits out the minimum (so it still counts)
    for (let tries = 0; tries < 30; tries++) {
      try {
        const res = await api.realmFinish(g.session, score);
        setResult(res); setGame(null);
        const fresh = await api.realmGet(r.id); setR(fresh);
        levelUp(res.level_up); if (res.finds.some((f) => f.new)) sfx.jackpot(); invalidateGame(qc);
        return;
      } catch (e) { if (toGameError(e).code !== 'game_too_fast') { toast.error(toGameError(e).message); setGame(null); return; } await new Promise((res) => setTimeout(res, Math.min(minS, 2) * 1000)); }
    }
    setGame(null);
  };
  useEffect(() => { if (!game) ending.current = false; }, [game]);

  const Game = game ? REALM_GAMES[game.id] : null;
  const gcfg = cfg.games[Object.keys(cfg.games)[0]];
  const nearLabel: Record<Station, string> = { play: `${gcfg.emoji} Play ${gcfg.name}`, collect: pendingAny ? `Collect ${Object.entries(pending).filter(([, v]) => v >= 1).slice(0, 3).map(([k, v]) => `${cfg.resources[k]?.emoji}${fmt(v)}`).join(' ')}` : 'Collect', build: `🏗️ ${meta.crew}`, make: `🔨 ${meta.make}`, market: `⚖️ ${meta.market}`, book: `📖 ${meta.book}` };
  const icons: Record<Station, string> = { play: gcfg.emoji, collect: '📦', build: '🏗️', make: '🔨', market: '⚖️', book: '📖' };

  return (
    <div className="fixed inset-0 z-40 select-none overflow-hidden bg-black text-white" data-testid="realm" data-kind={r.kind}>
      <canvas ref={cv} className="absolute inset-0 h-full w-full" style={{ touchAction: 'none' }} data-testid="realm-canvas" />
      {/* top: where you are, the level, your wallet */}
      <div className="pointer-events-none absolute inset-x-0 top-0 grid gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <div className="flex items-start gap-2">
          <button onClick={() => (history.length > 1 ? nav(-1) : nav('/world'))} className="pointer-events-auto grid h-10 w-10 place-items-center rounded-xl bg-black/55 backdrop-blur" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1 rounded-2xl bg-black/55 px-3 py-1.5 backdrop-blur">
            <div className="truncate font-display text-base font-black">{cfg.emoji} {r.name}</div>
            <div className="flex items-center gap-2 text-[11px] text-white/75">
              {!r.mine && <span className="flex items-center gap-1"><PlayerAvatar p={r.owner} size={14} /> @{r.owner.username}’s</span>}
              <span>📍 {zoneNow.name}</span>
            </div>
            <div className="mt-1 flex items-center gap-2" data-testid="realm-level">
              <b className="text-xs" style={{ color: cfg.color }}>Lv {r.level.level}</b>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full" style={{ width: `${r.level.max ? 100 : (r.level.into / Math.max(1, r.level.need)) * 100}%`, background: cfg.color }} /></div>
              {zoneNext && <span className="text-[10px] text-white/60">🔓 {zoneNext.name} at {zoneNext.level}</span>}
            </div>
          </div>
          {r.mine && r.me.bonus_ready && <button onClick={() => void daily()} className="pointer-events-auto rounded-xl bg-[#FFE14D] px-2.5 py-2 text-xs font-black text-black shadow-lg" data-testid="realm-daily">🎁 Daily</button>}
        </div>
        <div className="pointer-events-auto flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" data-testid="realm-wallet">
          <span className="shrink-0 rounded-full bg-black/60 px-2.5 py-1 text-xs font-black backdrop-blur" style={{ color: '#FFE14D' }}>{cur.emoji} {fmt(wallet[cfg.currency] ?? 0)}</span>
          {sorted.filter(([k]) => have(k) > 0).map(([k, v]) => <span key={k} className="shrink-0 rounded-full bg-black/50 px-2 py-1 text-xs font-bold backdrop-blur">{v.emoji} {fmt(have(k))}</span>)}
        </div>
      </div>
      {/* bottom: the station you're at, and a bar to get to any of them */}
      <div className="absolute inset-x-0 bottom-0 grid justify-items-center gap-2 p-3 pb-[max(14px,env(safe-area-inset-bottom,0px))]">
        <AnimatePresence>
          {near && !panel && !game && (
            <motion.div key={near} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}>
              <Button variant="rainbow" size="lg" loading={busy === near || (near === 'play' && busy === 'play')} onClick={() => open(near)} data-testid="realm-action">{nearLabel[near]}</Button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex gap-1.5 rounded-2xl bg-black/55 p-1.5 backdrop-blur" data-testid="realm-stations">
          {STATIONS.map((s) => (
            <button key={s} onClick={() => { scene.current?.walkTo(s); open(s); }} className={cn('relative grid h-11 w-11 place-items-center rounded-xl text-xl', near === s ? 'bg-white/25' : 'bg-white/5 hover:bg-white/15')} aria-label={nearLabel[s]} data-testid={`realm-go-${s}`}>
              {icons[s]}
              {s === 'collect' && pendingAny && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-[#FFE14D] shadow" />}
            </button>
          ))}
        </div>
      </div>

      {/* ---- panels ---- */}
      <Dialog open={panel === 'play'} onOpenChange={(o) => !o && setPanel(null)} title={<>{gcfg.emoji} {gcfg.name}</>} description={gcfg.blurb}
        footer={<Button variant="rainbow" loading={busy === 'play'} onClick={() => void play()} data-testid="realm-play">Play</Button>}>
        <div className="grid gap-3 text-sm">
          <div className="flex flex-wrap gap-1.5">{gcfg.drops.map((d) => <span key={d.res} className={cn('rounded-full px-2 py-1 text-xs', r.level.level >= d.level ? 'bg-surface-2' : 'bg-surface-2/40 text-muted')}>{cfg.resources[d.res]?.emoji} {cfg.resources[d.res]?.name}{r.level.level < d.level && ` · Lv ${d.level}`}</span>)}</div>
          <p className="text-xs text-muted">Free to play. Your score turns into resources from every zone this {meta.one} has opened, a chance of rare finds, XP{r.mine ? '' : ' for the owner’s place (and they get a 10% cut)'} and a little Ink ({r.me.ink_today}/{r.me.daily_cap} today).{r.effects.game_mult > 0 && ` Upgrades here add +${Math.round(r.effects.game_mult * 100)}%.`}</p>
          <div className="flex gap-3 text-xs"><span>Your best: <b>{r.me.best[Object.keys(cfg.games)[0]] ?? 0}</b></span><span>Plays here: <b>{r.plays}</b></span></div>
          <div className="grid gap-1">
            <b className="text-xs">🏆 Top scores here</b>
            {(r.boards[Object.keys(cfg.games)[0]] ?? []).map((b, i) => <div key={i} className="flex items-center gap-2 text-xs"><span className="w-4 text-muted">{i + 1}</span><PlayerAvatar p={b.player} size={18} /><span className="flex-1 truncate">@{b.player.username}</span><b>{b.score}</b></div>)}
            {!(r.boards[Object.keys(cfg.games)[0]] ?? []).length && <span className="text-xs text-muted">No scores yet — be the first!</span>}
          </div>
        </div>
      </Dialog>

      <Dialog open={panel === 'build'} onOpenChange={(o) => !o && setPanel(null)} title={<>🏗️ {meta.crew}</>} description={r.mine ? `They make resources every minute, even while you’re away (up to ${r.away_hours} hours). Collect them at the stash.` : `@${r.owner.username}’s ${meta.one}.`}>
        <div className="grid gap-4">
          <section className="grid gap-1.5">
            {Object.entries(cfg.producers).sort((a, b) => a[1].order - b[1].order).map(([k, p]) => <ItemRow key={k} id={k} it={p} lv={r.producers[k] ?? 0} cost={r.costs.producers[k]} locked={r.level.level < (p.level ?? 1)} mine={r.mine} busy={busy === `producers:${k}`} can={can(r.costs.producers[k] ?? {})} costLine={costLine}
              extra={<>{Object.entries(p.makes ?? {}).map(([res, v]) => <span key={res}>{cfg.resources[res]?.emoji} {(v * Math.max(1, r.producers[k] ?? 0) * (1 + r.effects.prod_mult)).toFixed(1)}/min{!(r.producers[k] ?? 0) && ' each'}</span>)}</>}
              onBuy={() => void buy('producers', k)} />)}
          </section>
          <section className="grid gap-1.5">
            <b className="text-sm">⬆️ Upgrades</b>
            {Object.entries(cfg.upgrades).sort((a, b) => a[1].order - b[1].order).map(([k, u]) => <ItemRow key={k} id={k} it={u} lv={r.upgrades[k] ?? 0} cost={r.costs.upgrades[k]} locked={false} mine={r.mine} busy={busy === `upgrades:${k}`} can={can(r.costs.upgrades[k] ?? {})} costLine={costLine} extra={<span>{u.blurb}</span>} onBuy={() => void buy('upgrades', k)} />)}
          </section>
        </div>
      </Dialog>

      <Dialog open={panel === 'make'} onOpenChange={(o) => !o && setPanel(null)} title={<>🔨 {meta.make}</>} description="Turn resources into things worth a lot more at the market (and XP for the place).">
        <div className="grid gap-1.5">
          {Object.entries(cfg.recipes).sort((a, b) => a[1].level - b[1].level || a[1].order - b[1].order).map(([k, rc]) => {
            const locked = r.level.level < rc.level, ok = can(rc.in), max = Math.floor(Math.min(...Object.entries(rc.in).map(([res, n]) => (wallet[res] ?? 0) / n)));
            return (
              <div key={k} className={cn('flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 p-2', locked && 'opacity-55')} data-testid={`realm-recipe-${k}`}>
                <span className="text-2xl">{rc.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{rc.name} <span className="text-xs font-normal text-muted">· sells {cur.emoji}{cfg.resources[k]?.sell}{(r.me.made[k] ?? 0) > 0 && ` · made ${r.me.made[k]}`}</span></div>
                  <div className="flex flex-wrap gap-x-2 text-xs">{costLine(rc.in)}</div>
                </div>
                {locked ? <span className="flex items-center gap-1 text-xs text-muted"><Lock className="h-3 w-3" /> Lv {rc.level}</span>
                  : !r.mine ? null
                  : <div className="flex gap-1"><Button size="sm" variant="primary" disabled={!ok} loading={busy === `make:${k}`} onClick={() => void make(k, 1)}>Make</Button>{max > 1 && <Button size="sm" variant="secondary" disabled={!ok} onClick={() => void make(k, Math.min(100, max))}>×{Math.min(100, max)}</Button>}</div>}
              </div>
            );
          })}
        </div>
      </Dialog>

      <Dialog open={panel === 'market'} onOpenChange={(o) => !o && setPanel(null)} title={<>⚖️ {meta.market}</>} description={<>You have <b>{cur.emoji} {fmt(wallet[cfg.currency] ?? 0)} {cur.name}</b>. Sell what you don’t need.</>}>
        <div className="grid gap-1.5">
          {sorted.filter(([, v]) => v.sell).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 p-2" data-testid={`realm-sell-${k}`}>
              <span className="text-2xl">{v.emoji}</span>
              <div className="min-w-0 flex-1"><div className="text-sm font-bold">{v.name}</div><div className="text-xs text-muted">You have {fmt(have(k))} · {cur.emoji} {v.sell} each</div></div>
              <Button size="sm" variant="secondary" disabled={have(k) < 1} loading={busy === `sell:${k}`} onClick={() => void sell(k, Math.min(10, have(k)))}>Sell {Math.min(10, Math.max(1, have(k)))}</Button>
              <Button size="sm" variant="primary" disabled={have(k) < 1} onClick={() => void sell(k)}>All</Button>
            </div>
          ))}
        </div>
      </Dialog>

      <Dialog open={panel === 'book'} onOpenChange={(o) => !o && setPanel(null)} title={<>📖 {meta.book}</>} description={`${Object.keys(r.me.finds).length} of ${Object.keys(cfg.finds).length} found. Rare ones turn up as you play; the first epic or legendary of each pays Ink.`}>
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Object.entries(cfg.finds).sort((a, b) => a[1].order - b[1].order).map(([k, f]) => {
              const n = r.me.finds[k] ?? 0;
              return (
                <div key={k} className="grid justify-items-center gap-0.5 rounded-xl border p-2 text-center" style={{ borderColor: n ? RARITY[f.rarity] : 'var(--line)', background: n ? `${RARITY[f.rarity]}1A` : undefined }} data-testid={`realm-find-${k}`}>
                  <span className={cn('text-3xl', !n && 'opacity-25 grayscale')}>{n ? f.emoji : '❔'}</span>
                  <span className="text-[11px] font-bold leading-tight">{n ? f.name : '???'}</span>
                  <span className="text-[10px] capitalize" style={{ color: RARITY[f.rarity] }}>{f.rarity}{n > 1 && ` ×${n}`}</span>
                  {!n && r.level.level < f.level && <span className="text-[10px] text-muted">from Lv {f.level}</span>}
                </div>
              );
            })}
          </div>
          <section className="grid gap-1.5">
            <b className="text-sm">🗺️ Zones</b>
            {cfg.zones.map((z) => (
              <div key={z.id} className={cn('flex items-center gap-2 rounded-xl border border-line p-2 text-sm', r.level.level < z.level && 'opacity-60')}>
                <span className="w-12 text-xs font-bold" style={{ color: cfg.color }}>Lv {z.level}</span>
                <div className="min-w-0 flex-1"><b>{z.name}</b><div className="text-xs text-muted">{z.blurb}</div></div>
                {r.level.level >= z.level ? <span>✅</span> : <Lock className="h-4 w-4 text-muted" />}
              </div>
            ))}
          </section>
        </div>
      </Dialog>

      {/* ---- the minigame ---- */}
      {game && Game && (
        <div className="fixed inset-0 z-[70] bg-black" data-testid="realm-game">
          <Game seed={game.seed} level={game.level} onEnd={(s) => void finish(s)} onScore={(s) => { scoreNow.current = s; }} />
          <div className="pointer-events-none absolute left-1/2 top-[max(12px,env(safe-area-inset-top,0px))] -translate-x-1/2 rounded-full bg-black/55 px-4 py-1.5 font-display text-xl font-black" data-testid="realm-score"><ScoreLive get={() => scoreNow.current} /></div>
          <button onClick={() => void finish(scoreNow.current)} className="absolute right-3 top-[max(12px,env(safe-area-inset-top,0px))] rounded-xl bg-black/55 p-2" aria-label="Stop"><X className="h-5 w-5" /></button>
        </div>
      )}
      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)} title={<>{gcfg.emoji} {result?.new_best ? 'New best! ' : ''}Score {result?.score ?? 0}</>}
        footer={<><Button variant="secondary" onClick={() => setResult(null)}>Done</Button><Button variant="rainbow" onClick={() => { setResult(null); void play(); }} data-testid="realm-again">Play again</Button></>}>
        {result && (
          <div className="grid gap-3 text-sm" data-testid="realm-result">
            <div className="flex flex-wrap gap-1.5">{Object.entries(result.loot).map(([k, v]) => <span key={k} className="rounded-full bg-surface-2 px-2.5 py-1 font-bold">{cfg.resources[k]?.emoji} +{fmt(v)}</span>)}{!Object.keys(result.loot).length && <span className="text-muted">Nothing this time — try again!</span>}</div>
            {result.finds.length > 0 && <div className="grid gap-1"><b>✨ Found!</b><div className="flex flex-wrap gap-2">{result.finds.map((f, i) => { const d = cfg.finds[f.id]; return <span key={i} className="rounded-xl border px-2 py-1" style={{ borderColor: RARITY[d.rarity] }}>{d.emoji} {d.name}{f.new && <b className="ml-1 text-[#FFB13D]">NEW</b>}</span>; })}</div></div>}
            <div className="text-xs text-muted">{result.paid > 0 ? `💧 +${result.paid} Ink` : result.earned > 0 ? 'Today’s Ink cap is reached here' : 'Score more for Ink'}{result.new_record && ' · 🏆 a new record here!'}</div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

/** the score, ticking over */
function ScoreLive({ get }: { get(): number }) {
  const [v, setV] = useState(0);
  useEffect(() => { const t = setInterval(() => setV(get()), 100); return () => clearInterval(t); }, [get]);
  return <>{v.toLocaleString()}</>;
}

function ItemRow({ id, it, lv, cost, locked, mine, busy, can, costLine, extra, onBuy }: { id: string; it: RealmItem; lv: number; cost?: Bag; locked: boolean; mine: boolean; busy: boolean; can: boolean; costLine(c: Bag): React.ReactNode; extra: React.ReactNode; onBuy(): void }) {
  const maxed = lv >= it.max;
  return (
    <div className={cn('flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 p-2', locked && 'opacity-55')} data-testid={`realm-item-${id}`}>
      <span className="text-2xl">{it.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">{it.name} {lv > 0 && <span className="text-xs font-normal text-muted">· lv {lv}</span>}</div>
        <div className="flex flex-wrap gap-x-2 text-xs text-muted">{extra}</div>
        {!locked && !maxed && cost && <div className="flex flex-wrap gap-x-2 text-xs">{costLine(cost)}</div>}
      </div>
      {locked ? <span className="flex items-center gap-1 text-xs text-muted"><Lock className="h-3 w-3" /> Lv {it.level}</span>
        : maxed ? <span className="text-xs font-bold text-[#3DDC97]">MAX</span>
        : mine ? <Button size="sm" variant={lv ? 'secondary' : 'primary'} disabled={!can} loading={busy} onClick={onBuy}>{lv ? 'Upgrade' : 'Build'}</Button> : null}
    </div>
  );
}
