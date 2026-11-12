// Your business: Main Street in 3D up top, the lemonade stand to tap, and the tycoon below — ventures to buy,
// upgrades, the company (going public, dividends, your rank) and the business games. Cash ticks up live
// between syncs; taps are banked every couple of seconds.
import { IfCapped } from '../ui/IfCapped';
import { lockLabel, usePlaceAccess } from '../plot/placeAccess';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Briefcase, Building2, Gamepad2, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { BizState, BizUpgrade, BizVenture, Business } from '../backend/types';
import { invalidateGame } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';
import { Button, Dialog, PlayerAvatar, ResourceIcon, Spinner } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { duration, money, perSec, rankOf } from './money';
import { createStreet, type StreetScene } from './street3d';
import { config } from '../env';

export const bizKey = (id: string) => ['business', id] as const;
type Tab = 'ventures' | 'upgrades' | 'company' | 'games';

export default function BusinessScreen() {
  const { id } = useParams();
  const q = useQuery({ queryKey: bizKey(id!), queryFn: () => api.bizGet(id!), staleTime: Infinity, refetchOnWindowFocus: false });
  if (q.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#9AD8FF]"><Spinner /></div>;
  if (q.error || !q.data) {
    return (
      <div className="fixed inset-0 grid place-content-center gap-3 bg-[#2E3340] p-6 text-center text-white">
        <div className="text-5xl">🍋</div><p>This business couldn’t be found.</p>
        <Link to="/world"><Button variant="secondary">Back to the map</Button></Link>
      </div>
    );
  }
  return <BusinessView b={q.data} />;
}

/** Cost of buying q more of a venture whose next one costs c1 (each one 15% dearer). */
const costOf = (c1: number, q: number) => (c1 * (1.15 ** q - 1)) / 0.15;
const maxOf = (c1: number, cash: number) => Math.max(0, Math.floor(Math.log((cash * 0.15) / c1 + 1) / Math.log(1.15)));

function upgradeEffect(u: BizUpgrade, ventures: BizVenture[]) {
  if (u.kind === 'venture') return `${ventures.find((v) => v.key === u.venture)?.name ?? 'It'}s earn ×2`;
  if (u.kind === 'tap') return u.pct ? `Taps also earn ${Math.round(u.pct * 100)}% of your income a second` : `Taps earn ×${u.x}`;
  if (u.golden && u.golden !== 1) return 'Golden customers come more often';
  if (u.golden_dur && u.golden_dur !== 1) return 'Golden customer bonuses last twice as long';
  return `Everything earns ×${u.x}`;
}
function upgradeNeed(u: BizUpgrade, ventures: BizVenture[]) {
  if (u.kind === 'venture') return `Own ${u.need} ${ventures.find((v) => v.key === u.venture)?.name ?? ''}`;
  if (u.kind === 'tap') return `Tap ${Number(u.need).toLocaleString()} times`;
  return `Earn ${money(u.need ?? 0)} in total`;
}

function BusinessView({ b }: { b: Business }) {
  const nav = useNavigate();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const cv = useRef<HTMLCanvasElement>(null);
  const street = useRef<StreetScene | null>(null);
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const sc = createStreet({ canvas: c, seed: b.seed, reduceMotion: reduce });
    street.current = sc;
    if (import.meta.env.DEV || config.e2e) (window as any).__landvasStreet = sc;
    return () => { sc.dispose(); street.current = null; };
  }, [b.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#1B1F2B] text-white" data-testid="business">
      <canvas ref={cv} className="absolute inset-x-0 top-0 h-[44%] w-full touch-pan-y" data-testid="street-canvas" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <button onClick={() => nav(-1)} className="pointer-events-auto rounded-2xl bg-black/45 p-2.5 backdrop-blur" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
        <button onClick={() => nav('/home')} className="pointer-events-auto rounded-2xl bg-black/45 p-2.5 backdrop-blur text-lg leading-none" aria-label="Go home" title="Your home" data-testid="go-home">🏠</button>
        {!b.mine && (
          <div className="min-w-0 flex-1 rounded-2xl bg-black/45 px-3 py-2 backdrop-blur">
            <div className="flex items-center gap-2"><PlayerAvatar p={b.owner} size={22} /><div className="truncate font-display text-lg font-bold">@{b.owner.username}’s business</div></div>
          </div>
        )}
      </div>
      {b.mine && b.state ? <Tycoon b={b} street={street} /> : <Visitor b={b} street={street} />}
    </div>
  );
}

// ======================================================================================================
// The owner's tycoon
// ======================================================================================================
function Tycoon({ b, street }: { b: Business; street: React.MutableRefObject<StreetScene | null> }) {
  // a business on more merged plots has more of its games open
  const access = usePlaceAccess('business', b.id).data;
  const qc = useQueryClient();
  const haptics = useUi((s) => s.settings.haptics);
  const reduce = useUi((s) => s.settings.reduceMotion);
  const [s, setS] = useState<BizState>(b.state!);
  const [tab, setTab] = useState<Tab>('ventures');
  const [amt, setAmt] = useState<1 | 10 | 0>(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [away, setAway] = useState(b.away ?? null);
  const [ipoAsk, setIpoAsk] = useState(false);
  // live numbers between syncs
  const recv = useRef(Date.now());
  const skew = useRef(new Date(b.state!.server_time).getTime() - Date.now());
  const pending = useRef(0);
  const [, force] = useState(0);
  // the panel only needs to catch up a couple of times a second; the cash itself ticks smoothly on its own
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 500); return () => clearInterval(t); }, []);
  const now = Date.now() + skew.current;
  const buffOn = s.buff && new Date(s.buff.until).getTime() > now ? s.buff : null;
  const frenzyMult = buffOn?.kind === 'frenzy' ? buffOn.mult : 1;
  const stormMult = buffOn?.kind === 'storm' ? buffOn.mult : 1;
  const cash = s.cash + (s.income * frenzyMult * (Date.now() - recv.current)) / 1000 + pending.current * s.tap_value * stormMult;
  const apply = useCallback((r: BizState, sentTaps = 0) => {
    pending.current = Math.max(0, pending.current - sentTaps);
    recv.current = Date.now(); skew.current = new Date(r.server_time).getTime() - Date.now();
    setS(r);
    qc.setQueryData(bizKey(b.id), (old: Business | undefined) => old && { ...old, state: r, away: null });
  }, [b.id, qc]);
  useEffect(() => { street.current?.setVentures(Object.fromEntries(s.ventures.map((v) => [v.key, v.owned])), s.income); }, [s.ventures, s.income, street]);
  useEffect(() => { street.current?.setFrenzy(!!buffOn && buffOn.kind === 'frenzy'); }, [buffOn, street]);
  useEffect(() => { if (away && away.earned > 0) confettiCannons(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // bank taps every couple of seconds (and check in now and then anyway)
  const syncing = useRef(false);
  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    const n = pending.current;
    try { apply(await api.bizSync(n), n); } catch { /* try again next time */ } finally { syncing.current = false; }
  }, [apply]);
  useEffect(() => {
    let quiet = 0;
    const t = setInterval(() => { quiet += 1; if (pending.current > 0 || quiet >= 24) { quiet = 0; void sync(); } }, 5000); // taps every 5 s; idle re-sync every 2 min
    const hide = () => { if (document.visibilityState === 'hidden' && pending.current > 0) void sync(); };
    document.addEventListener('visibilitychange', hide);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', hide); if (pending.current > 0) void api.bizSync(pending.current).catch(() => undefined); };
  }, [sync]);
  const act = async (key: string, fn: () => Promise<BizState>, ok?: (r: BizState) => void) => {
    setBusy(key);
    try { if (pending.current > 0) await sync(); const r = await fn(); apply(r); ok?.(r); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };

  // ---- tapping --------------------------------------------------------------------------------------------
  type Float = { id: number; x: number; y: number; text: string };
  const [floats, setFloats] = useState<Float[]>([]);
  const fid = useRef(0);
  const [pressT, setPressT] = useState(0);
  const tap = (e: React.PointerEvent) => {
    pending.current += 1;
    street.current?.tap();
    setPressT(Date.now());
    if (haptics && pending.current % 4 === 0) buzz('light');
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const id = ++fid.current;
    setFloats((f) => [...f.slice(-14), { id, x: e.clientX - r.left + (Math.random() - 0.5) * 30, y: e.clientY - r.top - 10, text: `+${money(s.tap_value * stormMult)}` }]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 900);
  };

  // ---- golden customers ---------------------------------------------------------------------------------
  const gAt = new Date(s.golden_at).getTime();
  const goldenHere = now >= gAt && now <= gAt + (s.golden_window - 3) * 1000;
  const gPos = useMemo(() => { const h = Math.abs(Math.sin(gAt / 1000)) * 1000; return { left: 10 + (h % 70), top: 12 + ((h * 7) % 26) }; }, [gAt]);
  const golden = () => act('golden', () => api.bizGolden(), (r) => {
    const g = r.golden!; confettiCannons(); if (haptics) buzz('success');
    if (g.kind === 'lucky') toast.success(`🤑 Lucky sale! +${money(g.gain)}`, { description: g.ink ? `+${g.ink} Ink too` : undefined });
    else if (g.kind === 'frenzy') toast.success(`🔥 FRENZY! Everything earns ×${r.buff?.mult ?? 7}`, { description: `for ${duration((new Date(r.buff!.until).getTime() - Date.now()) / 1000)}` });
    else toast.success(`⚡ TAP STORM! Taps earn ×${r.buff?.mult ?? 50}`, { description: 'Tap the stand as fast as you can!' });
  });

  // ---- buying -----------------------------------------------------------------------------------------------
  const buy = (v: BizVenture) => {
    const q = amt === 0 ? maxOf(v.cost, cash) : amt;
    if (q <= 0) return;
    void act(`buy-${v.key}`, () => api.bizBuy(v.key, amt === 0 ? 0 : amt), (r) => {
      if (haptics) buzz('light');
      if (r.milestones?.length) { confettiCannons(); toast.success(`${v.emoji} ${r.milestones.at(-1)} ${v.name}s — they now earn double!`, { description: r.ink ? `+${r.ink} Ink` : undefined }); }
    });
  };
  const rank = rankOf(s.alltime);
  const affordableUps = s.upgrades.filter((u) => u.cost <= cash).length;
  const revealed = s.ventures.filter((v) => v.revealed);
  const hidden = s.ventures.find((v) => !v.revealed);

  return (
    <>
      {/* the money */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-[max(12px,env(safe-area-inset-top,0px))]">
        <div className="ml-14 mr-3 flex flex-col items-center rounded-3xl bg-black/50 px-4 py-1.5 text-center backdrop-blur" data-testid="biz-cash-box">
          <LiveCash data-testid="biz-cash" calc={() => s.cash + (s.income * frenzyMult * (Date.now() - recv.current)) / 1000 + pending.current * s.tap_value * stormMult} />
          <div className="flex items-center gap-2 text-xs font-bold text-[#B8F5A0]">
            <span data-testid="biz-income">{perSec(s.income * frenzyMult)}</span>
            {s.shares > 0 && <span className="rounded-full bg-[#7B5CFF]/60 px-1.5 text-[10px] text-white">📈 +{Math.round(s.shares * 2)}%</span>}
          </div>
          <div className="text-[10px] text-white/70">{rank.emoji} {rank.title}</div>
        </div>
      </div>
      {/* buffs */}
      <AnimatePresence>
        {buffOn && (
          <motion.div key="buff" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
            className={cn('pointer-events-none absolute left-1/2 top-[calc(max(12px,env(safe-area-inset-top,0px))+92px)] -translate-x-1/2 rounded-full px-4 py-1.5 text-sm font-black shadow-xl', buffOn.kind === 'frenzy' ? 'bg-[#FF8A3D] text-black' : 'bg-[#FFE14D] text-black')} data-testid="biz-buff">
            {buffOn.kind === 'frenzy' ? `🔥 Frenzy ×${buffOn.mult}` : `⚡ Tap storm ×${buffOn.mult}`} · {Math.ceil((new Date(buffOn.until).getTime() - now) / 1000)}s
          </motion.div>
        )}
      </AnimatePresence>
      {/* a golden customer */}
      <AnimatePresence>
        {goldenHere && (
          <motion.button key={s.golden_at} onClick={golden} disabled={busy === 'golden'} data-testid="biz-golden"
            initial={{ scale: 0, rotate: -30 }} animate={{ scale: [1, 1.12, 1], rotate: 0, y: reduce ? 0 : [0, -8, 0] }} exit={{ scale: 0, opacity: 0 }}
            transition={{ repeat: Infinity, duration: 1.4 }}
            className="absolute z-20 grid h-20 w-20 place-items-center rounded-full text-5xl"
            style={{ left: `${gPos.left}%`, top: `${gPos.top}%`, background: 'radial-gradient(circle, #FFE98A 0%, #FFC93D 55%, rgba(255,201,61,0) 72%)', filter: 'drop-shadow(0 0 18px #FFD84D)' }}
            aria-label="A golden customer! Tap them">🤩</motion.button>
        )}
      </AnimatePresence>
      {/* the stand to tap */}
      <div className="absolute inset-x-0 top-[44%] z-10 flex -translate-y-1/2 justify-center">
        <button onPointerDown={tap} data-testid="biz-tap"
          className="relative grid h-28 w-28 touch-manipulation select-none place-items-center rounded-full border-4 border-white/90 shadow-[0_10px_30px_rgba(0,0,0,0.45)] transition-transform duration-75"
          style={{ transform: !reduce && Date.now() - pressT < 90 ? 'scale(0.9)' : 'scale(1)', background: stormMult > 1 ? 'radial-gradient(circle at 35% 30%, #FFF6B0, #FFC93D 60%, #FF8A3D)' : 'radial-gradient(circle at 35% 30%, #FFF9C4, #FFE14D 55%, #F5B400)' }}
          aria-label="Sell a lemonade">
          <span className="pointer-events-none text-6xl">🍋</span>
          <span className="pointer-events-none absolute -bottom-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-black">{money(s.tap_value * stormMult)} a cup</span>
          {floats.map((f) => (
            <motion.span key={f.id} initial={{ y: 0, opacity: 1, scale: 0.8 }} animate={{ y: -70, opacity: 0, scale: 1.15 }} transition={{ duration: 0.9, ease: 'easeOut' }}
              className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap font-display text-lg font-black text-white [text-shadow:0_2px_0_rgba(0,0,0,0.5)]" style={{ left: f.x, top: f.y }}>{f.text}</motion.span>
          ))}
        </button>
      </div>
      {/* the tycoon */}
      <div className="absolute inset-x-0 bottom-0 top-[44%] flex flex-col rounded-t-3xl bg-[#F6F1E7] pt-16 text-[#2A2E38]" data-testid="biz-panel">
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2">
          {([['ventures', <Building2 key="v" className="h-3.5 w-3.5" />, 'Ventures', 0], ['upgrades', <Sparkles key="u" className="h-3.5 w-3.5" />, 'Upgrades', affordableUps], ['company', <Briefcase key="c" className="h-3.5 w-3.5" />, 'Company', s.dividend_ready || s.shares_on_ipo >= 1 ? 1 : 0], ['games', <Gamepad2 key="g" className="h-3.5 w-3.5" />, 'Games', 0]] as const).map(([k, icon, label, badge]) => (
            <button key={k} onClick={() => setTab(k)} data-testid={`biz-tab-${k}`}
              className={cn('flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold', tab === k ? 'bg-[#2A2E38] text-white' : 'bg-white text-[#2A2E38] shadow-sm')}>
              {icon}{label}{badge ? <span className="ml-0.5 rounded-full bg-[#FF4D6D] px-1.5 text-[10px] text-white">{k === 'upgrades' ? badge : '!'}</span> : null}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(16px,env(safe-area-inset-bottom,0px))]">
          {tab === 'ventures' && (
            <div className="grid gap-2" data-testid="biz-ventures">
              <div className="flex items-center justify-end gap-1 text-xs font-bold">
                Buy {([1, 10, 0] as const).map((a) => <button key={a} onClick={() => setAmt(a)} data-testid={`biz-amt-${a}`} className={cn('rounded-full px-2.5 py-1', amt === a ? 'bg-[#2A2E38] text-white' : 'bg-white shadow-sm')}>{a === 0 ? 'Max' : `×${a}`}</button>)}
              </div>
              {revealed.map((v) => {
                const q = amt === 0 ? maxOf(v.cost, cash) : amt;
                const c = q > 0 ? costOf(v.cost, q) : v.cost;
                const can = q > 0 && cash >= c;
                const toNext = v.next_milestone ? Math.min(1, v.owned / v.next_milestone) : 1;
                return (
                  <div key={v.key} className="flex items-center gap-3 rounded-2xl bg-white p-2.5 shadow-sm" data-testid={`venture-${v.key}`}>
                    <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#FFF3C4] text-3xl">{v.emoji}
                      {v.owned > 0 && <span className="absolute -bottom-1 -right-1 rounded-full bg-[#2A2E38] px-1.5 text-[10px] font-black text-white">{v.owned}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{v.name}</div>
                      <div className="text-[11px] text-[#6B7080]">{v.owned ? <>{perSec(v.rate)} · {money(v.each)}/s each</> : <>earns {money(v.each)}/s each</>}</div>
                      {v.next_milestone && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#ECE6DA]"><div className="h-full rounded-full bg-[#3DDC97]" style={{ width: `${toNext * 100}%` }} /></div>
                          <span className="text-[9.5px] font-bold text-[#6B7080]">{v.next_milestone}: ×2</span>
                        </div>
                      )}
                    </div>
                    <button onClick={() => buy(v)} disabled={!can || !!busy} data-testid={`buy-${v.key}`}
                      className={cn('grid min-w-[86px] shrink-0 justify-items-center rounded-2xl px-2 py-1.5 text-white transition active:scale-95', can ? 'bg-[#2E9E4E] shadow-[0_3px_0_#1E6B34]' : 'bg-[#B9BCC6]')}>
                      <span className="text-[10px] font-bold uppercase">Buy {amt === 0 ? `×${q}` : `×${amt}`}</span>
                      <span className="text-sm font-black">{money(c)}</span>
                    </button>
                  </div>
                );
              })}
              {hidden && <div className="rounded-2xl border-2 border-dashed border-[#D9D2C4] p-3 text-center text-xs text-[#6B7080]">🔒 Something new unlocks at {money(hidden.cost * 0.4)} earned…</div>}
            </div>
          )}

          {tab === 'upgrades' && (
            <div className="grid gap-2" data-testid="biz-upgrades">
              {!s.upgrades.length && <p className="py-3 text-center text-sm text-[#6B7080]">No upgrades to buy right now — keep growing!</p>}
              <div className="grid grid-cols-2 gap-2">
                {s.upgrades.map((u) => {
                  const can = cash >= u.cost;
                  return (
                    <button key={u.key} disabled={!can || !!busy} data-testid={`upgrade-${u.key}`}
                      onClick={() => act(`up-${u.key}`, () => api.bizUpgrade(u.key), () => { if (haptics) buzz('success'); toast.success(`${u.emoji} ${u.name}!`, { description: upgradeEffect(u, s.ventures) }); })}
                      className={cn('grid gap-0.5 rounded-2xl p-2.5 text-left transition active:scale-95', can ? 'bg-white shadow-[0_3px_0_#E0D7C4] ring-2 ring-[#3DDC97]' : 'bg-white/60 opacity-70')}>
                      <span className="text-2xl">{u.emoji}</span>
                      <span className="text-[12.5px] font-bold leading-tight">{u.name}</span>
                      <span className="text-[10.5px] leading-tight text-[#6B7080]">{upgradeEffect(u, s.ventures)}</span>
                      <span className={cn('mt-1 text-sm font-black', can ? 'text-[#2E9E4E]' : 'text-[#6B7080]')}>{money(u.cost)}</span>
                    </button>
                  );
                })}
              </div>
              {s.upgrades_next.length > 0 && (
                <>
                  <div className="pt-2 text-[11px] font-bold uppercase tracking-wide text-[#6B7080]">Coming up</div>
                  {s.upgrades_next.map((u) => (
                    <div key={u.key} className="flex items-center gap-2 rounded-2xl bg-white/50 p-2 text-xs text-[#6B7080]"><span className="text-lg grayscale">{u.emoji}</span><b className="flex-1">{u.name}</b><span>{upgradeNeed(u, s.ventures)}</span></div>
                  ))}
                </>
              )}
            </div>
          )}

          {tab === 'company' && (
            <div className="grid gap-2" data-testid="biz-company">
              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{rank.emoji}</span>
                  <div className="min-w-0 flex-1"><div className="text-xs font-bold uppercase text-[#6B7080]">Your title</div><div className="font-display text-lg font-black">{rank.title}</div></div>
                </div>
                {rank.next && (
                  <div className="mt-2">
                    <div className="h-2 overflow-hidden rounded-full bg-[#ECE6DA]"><div className="h-full rounded-full bg-[#7B5CFF]" style={{ width: `${Math.min(100, (Math.log10(s.alltime + 1) / Math.log10(rank.next[0])) * 100)}%` }} /></div>
                    <div className="mt-1 text-[11px] text-[#6B7080]">Next: {rank.next[2]} {rank.next[1]} at {money(rank.next[0])} earned all-time ({money(s.alltime)} so far)</div>
                  </div>
                )}
              </div>
              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2"><span className="text-3xl">💰</span><div className="flex-1"><b>Daily dividend</b><div className="text-[11px] text-[#6B7080]">{s.dividend_ink} Ink and 10 minutes of income, once a day. More shares, bigger dividend.</div></div></div>
                <Button className="mt-2 w-full" variant="rainbow" disabled={!s.dividend_ready} loading={busy === 'div'} data-testid="biz-dividend"
                  onClick={() => act('div', () => api.bizDividend(), (r) => { confettiCannons(); toast.success(`Dividend paid: +${r.dividend!.ink} Ink · +${money(r.dividend!.cash)}`); invalidateGame(qc); })}>
                  {s.dividend_ready ? 'Collect dividend' : 'Collected today ✓'}
                </Button>
              </div>
              <div className="rounded-2xl bg-[#2A2E38] p-3 text-white shadow-sm" data-testid="biz-ipo-card">
                <div className="flex items-center gap-2"><span className="text-3xl">🔔</span><div className="flex-1"><b>Go public (IPO)</b><div className="text-[11px] text-white/70">Start over with your shares: each share makes everything earn 2% more, forever.</div></div></div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-white/10 p-2"><div className="text-[10px] uppercase text-white/60">Shares</div><div className="font-black">{s.shares.toLocaleString()}</div></div>
                  <div className="rounded-xl bg-white/10 p-2"><div className="text-[10px] uppercase text-white/60">On IPO</div><div className="font-black text-[#B8F5A0]">+{s.shares_on_ipo.toLocaleString()}</div></div>
                  <div className="rounded-xl bg-white/10 p-2"><div className="text-[10px] uppercase text-white/60">Next share</div><div className="text-xs font-black">{money(s.next_share_at)}</div></div>
                </div>
                <Button className="mt-2 w-full" variant="rainbow" disabled={s.shares_on_ipo < 1} onClick={() => setIpoAsk(true)} data-testid="biz-ipo">
                  {s.shares_on_ipo >= 1 ? `Ring the bell — +${s.shares_on_ipo} shares` : 'Not big enough to go public yet'}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-2xl bg-white p-2.5 shadow-sm"><div className="text-[#6B7080]">Earned all-time</div><b>{money(s.alltime)}</b></div>
                <div className="rounded-2xl bg-white p-2.5 shadow-sm"><div className="text-[#6B7080]">Cups sold by hand</div><b>{Number(s.taps).toLocaleString()}</b></div>
                <div className="rounded-2xl bg-white p-2.5 shadow-sm"><div className="text-[#6B7080]">Upgrades</div><b>{s.upgrades_owned}</b></div>
                <div className="rounded-2xl bg-white p-2.5 shadow-sm"><div className="text-[#6B7080]">Business plots</div><b>{s.plots}{s.plots > 1 ? ` (+${(s.plots - 1) * 10}%)` : ''}</b></div>
              </div>
              <p className="text-center text-[11px] text-[#6B7080]"><IfCapped>Business Ink today: {s.ink_today}/{s.daily_cap}. </IfCapped>Every extra business plot you own adds 10% to all income.</p>
            </div>
          )}

          {tab === 'games' && (
            <div className="grid grid-cols-2 gap-2" data-testid="biz-games">
              {Object.entries(b.games).sort(([x], [y]) => (access ? access.games.indexOf(x) - access.games.indexOf(y) : 0)).map(([k, g]) => { const land = lockLabel(access, k); return land ? (
                <div key={k} data-testid={`biz-game-${k}`} data-locked="1" className="grid justify-items-center gap-1 rounded-2xl bg-white/60 p-3 text-center opacity-60 shadow-sm">
                  <span className="text-4xl grayscale">{g.emoji}</span><b className="text-sm">{g.name}</b>
                  <span className="text-[11px] text-[#6B7080]">🔒 Opens when the business is {land}</span>
                </div>
              ) : (
                <Link key={k} to={`/business/${b.id}/play/${k}`} data-testid={`biz-game-${k}`} className="grid justify-items-center gap-1 rounded-2xl bg-white p-3 text-center shadow-sm hover:bg-[#FFF8E1]">
                  <span className="text-4xl">{g.emoji}</span><b className="text-sm">{g.name}</b>
                  <span className="rounded-full bg-[#7B5CFF]/15 px-2 py-0.5 text-[10px] font-bold uppercase text-[#7B5CFF]">{g.dim}</span>
                  <span className="text-[11px] text-[#6B7080]">up to {g.max_ink} Ink + cash</span>
                </Link>
              ); })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!away && away.earned > 0} onOpenChange={() => setAway(null)} title="👋 Welcome back!" description={away ? `You were away for ${duration(away.seconds)}.` : ''}>
        <div className="grid justify-items-center gap-3 py-2 text-center" data-testid="biz-away">
          <div className="text-5xl">💸</div>
          <div className="text-sm text-muted">While you were gone, your business made</div>
          <div className="font-display text-4xl font-black text-ok">{money(away?.earned ?? 0)}</div>
          <Button variant="rainbow" onClick={() => setAway(null)}>Nice!</Button>
        </div>
      </Dialog>
      <Dialog open={ipoAsk} onOpenChange={setIpoAsk} title="🔔 Go public?" description="Your company lists on the stock market.">
        <div className="grid gap-3 text-sm">
          <ul className="grid gap-1.5">
            <li>📈 You get <b>{s.shares_on_ipo} new shares</b> ({Math.round((s.shares + s.shares_on_ipo) * 2)}% bonus to everything, forever).</li>
            <li>🔄 Your cash, ventures and upgrades start again from a lemonade stand.</li>
            <li>🏅 Your title, all-time earnings and shares stay.</li>
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIpoAsk(false)}>Not yet</Button>
            <Button variant="rainbow" loading={busy === 'ipo'} data-testid="biz-ipo-confirm"
              onClick={() => act('ipo', () => api.bizIpo(), (r) => { setIpoAsk(false); confettiCannons(); toast.success(`🔔 You’re public! ${r.ipo!.shares} shares`, { description: r.ipo!.ink ? `+${r.ipo!.ink} Ink` : undefined }); invalidateGame(qc); })}>Ring the bell</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** The cash counter: updates its own text every frame (no React re-render), so it's smooth and cheap. */
function LiveCash({ calc, ...rest }: { calc(): number; 'data-testid'?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const f = useRef(calc); f.current = calc;
  useEffect(() => {
    let raf = 0, last = '';
    const tick = () => { raf = requestAnimationFrame(tick); const v = f.current(); const t = money(v, { cents: v < 1000 }); if (t !== last && el.current) { el.current.textContent = t; last = t; } };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={el} className="font-display text-3xl font-black leading-tight tnum" {...rest} />;
}

// ======================================================================================================
// Visiting someone's business
// ======================================================================================================
function Visitor({ b, street }: { b: Business; street: React.MutableRefObject<StreetScene | null> }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [tipped, setTipped] = useState(!!b.tipped_today);
  const p = b.public!;
  const rank = rankOf(p.alltime);
  useEffect(() => { street.current?.setVentures(p.ventures, p.income); }, [p, street]);
  const tip = async () => {
    setBusy(true);
    try { const r = await api.bizTip(b.id); setTipped(true); confettiCannons(); street.current?.tap(); toast.success(`🍋 Bought a lemonade! +${r.paid} Ink`, { description: `@${b.owner.username} gets a rush of ${money(r.owner_cash)}.` }); invalidateGame(qc); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return (
    <div className="absolute inset-x-0 bottom-0 top-[44%] grid content-start gap-3 rounded-t-3xl bg-[#F6F1E7] p-4 text-[#2A2E38]" data-testid="biz-visitor">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
        <span className="text-4xl">{rank.emoji}</span>
        <div className="min-w-0 flex-1"><div className="text-xs font-bold uppercase text-[#6B7080]">{rank.title}</div><div className="truncate font-display text-lg font-black">{b.name}</div>
          <div className="text-xs text-[#6B7080]">{perSec(p.income)} · {money(p.alltime)} earned{p.shares ? ` · ${p.shares} shares` : ''}</div></div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(p.ventures).filter(([, n]) => n > 0).map(([k, n]) => <span key={k} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold shadow-sm">{({ lemonade: '🍋', cookies: '🍪', food_truck: '🚚', coffee: '☕', bookstore: '📚', arcade: '🕹️', hotel: '🏨', tech: '💻', bank: '🏦', space: '🚀' } as Record<string, string>)[k]} {n}</span>)}
      </div>
      <Button variant="rainbow" size="lg" disabled={tipped} loading={busy} onClick={tip} data-testid="biz-tip">
        {tipped ? 'You bought a lemonade today ✓' : <>🍋 Buy a lemonade (+2 <ResourceIcon r="ink" className="h-4 w-4" />)</>}
      </Button>
      <p className="text-center text-xs text-[#6B7080]">Buying a lemonade sends @{b.owner.username} a rush of customers. Once a day per business.</p>
    </div>
  );
}
