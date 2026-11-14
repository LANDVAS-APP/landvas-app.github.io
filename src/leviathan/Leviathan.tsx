// 🐉 Fighting the Leviathan: the banner on the map (website) or a medallion and card in the app's HUD row; the fight itself
// — one shared health bar, tap the beast to throw ink bombs, every enchantment you own has a move, a live feed of every
// blow and the top fighters — and the big moments: the warning (the map shakes), the rising, the fall (your loot) and the
// escape.
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { create } from 'zustand';
import { api, type LevState, type Leviathan as Lev } from '../backend/api';
import { toGameError } from '../backend/backend';
import { useHudCard } from '../app/radial';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { toMap } from '../lib/toMap';
import { config } from '../env';
import { cn, safeStorage, saveStorage, timeAgo } from '../lib/utils';
import { isNative } from '../native/native';
import { GameDisc, PlayerAvatar } from '../ui';
import { efx, EnchantFxLayer } from '../enchant/core';
import { dur, kindInfo } from '../enchant/kinds';
import { feel } from '../enchant/living';
import { Sigil } from '../enchant/Sigil';
import { LeviathanArt } from './LeviathanArt';
import { LEV_KEY, STATUS_TEXT, fmtDmg, levHidden, levMult, levPace, levPos, levRampage, levTiny, serverNow, useLeviathan } from './useLeviathan';

export const useLevUi = create<{ fight: boolean; bones: LevState['bones'][number] | null; open(): void; close(): void; showBones(b: LevState['bones'][number] | null): void }>((set) => ({
  fight: false, bones: null, open: () => set({ fight: true }), close: () => set({ fight: false }), showBones: (bones) => set({ bones }),
}));
// (automated browser tests open the fight directly)
if (typeof window !== 'undefined' && config.e2e) (window as any).__landvasLevOpen = () => useLevUi.getState().open(); // eslint-disable-line @typescript-eslint/no-explicit-any

const EFFECT: Record<string, string> = { reveal: 'Foretold where it hides — everyone can see it now!', grow: 'Blew it back up to size — it can be hit again!', shrink: 'Shrunk! Everyone hits ×1.5 for 10 min', freeze: 'Frozen in time for 10 min', foretell: 'Its weak spot is foretold: ×1.25 for 10 min', decoy: 'Distracted by a decoy egg for 5 min', pull: 'Pulled through a wormhole: stalled 5 min' };

function HpBar({ l, big }: { l: Lev; big?: boolean }) {
  const pct = Math.max(0, Math.min(100, (Number(l.hp) / Math.max(1, Number(l.hp_max))) * 100));
  return (
    <div className={cn('lv-lev-hp relative overflow-hidden rounded-full', big ? 'h-5' : 'h-3')} data-testid="lev-hp">
      <motion.span className="absolute inset-y-0 left-0 rounded-full" animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        style={{ background: l.status === 'enraged' ? 'linear-gradient(90deg,#FF2D55,#FF9F1C)' : l.status === 'fleeing' ? 'linear-gradient(90deg,#9BE7FF,#fff)' : 'linear-gradient(90deg,#B026FF,#FF5CDB)' }} />
      {[50, 10].map((m) => <span key={m} className="absolute inset-y-0 w-[2px] bg-white/50" style={{ left: `${m}%` }} />)}
      {big && <span className="absolute inset-0 grid place-items-center text-[11px] font-black text-white drop-shadow">{fmtDmg(Number(l.hp))} / {fmtDmg(Number(l.hp_max))}</span>}
    </div>
  );
}

/** what it's up to right now, in a few words (its powers, a rampage, its speed) */
function levNow(l: Lev): string | null {
  if (l.status === 'warning') return null;
  if (l.hidden) return `🫥 Hiding${l.place ? ` somewhere around ${l.place}` : ''} — search the map`;
  const bits: string[] = [];
  if (levRampage(l)) bits.push('⚡ RAMPAGE');
  if (levHidden(l)) bits.push('🫥 hidden (you found it)');
  if (levTiny(l)) bits.push('🔬 tiny — bombs miss');
  const pace = levPace(l);
  if (!levRampage(l) && Math.abs(pace - 1) > 0.15) bits.push(`${pace > 1 ? '💨' : '🐢'} ×${pace >= 10 ? Math.round(pace) : pace.toFixed(1)} speed`);
  return bits.length ? bits.join(' · ') : null;
}

function Countdown({ to }: { to: string }) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  return <>{dur((Date.parse(to) - serverNow()) / 1000)}</>;
}

/** the website: a banner across the top of the map */
export function LeviathanBanner() {
  const q = useLeviathan();
  const l = q.data?.lev;
  if (!l) return null;
  return (
    <motion.button onClick={() => useLevUi.getState().open()} className={cn('lv-lev-banner pointer-events-auto grid w-[min(420px,100%)] gap-1.5 rounded-2xl px-3 py-2 text-left', l.status, levRampage(l) && 'rampage', l.hidden && 'veiled')}
      initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} data-testid="lev-banner">
      <div className="flex items-center gap-2">
        <span className="text-2xl lv-lev-bob">🐉</span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-display text-[15px] font-black text-white">The Leviathan {STATUS_TEXT[l.status]}</div>
          <div className="truncate text-[11px] font-bold text-white/70">{l.status === 'warning' ? <>{l.origin} · rises in <Countdown to={l.rise_at} /></> : levNow(l) ?? `${l.place ?? ''} · ${l.fighters} fighting`}</div>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[#2A0D44]">{l.status === 'warning' ? 'Watch' : 'FIGHT'}</span>
      </div>
      {l.status !== 'warning' && <HpBar l={l} />}
    </motion.button>
  );
}

/** the app: a medallion in the HUD row */
export function LeviathanDisc() {
  const q = useLeviathan();
  const l = q.data?.lev;
  const card = useHudCard((s) => s.card);
  const toggle = useHudCard((s) => s.toggle);
  if (!l) return null;
  return (
    <GameDisc tone={l.status === 'enraged' ? 'crimson' : 'violet'} size={44} glow={card !== 'lev'} on={card === 'lev'} onClick={() => { feel('light'); toggle('lev'); }}
      aria-label="The Leviathan" data-testid="lev-disc">
      <span className="text-[20px] leading-none lv-lev-bob">🐉</span>
    </GameDisc>
  );
}
export function LeviathanCard({ onClose }: { onClose(): void }) {
  const q = useLeviathan();
  const l = q.data?.lev;
  if (!l) return null;
  return (
    <motion.div className={cn('lv-mcard pointer-events-auto w-[min(360px,100%)]', l.status === 'enraged' ? 't-crimson' : 't-violet')} data-testid="lev-card"
      initial={{ opacity: 0, scale: 0.7, y: -14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: -10, transition: { duration: 0.14 } }} transition={{ type: 'spring', stiffness: 520, damping: 34 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="kicker">🐉 Leviathan #{l.gen}{Number(l.strength) > 1 ? ` · ×${l.strength} stronger` : ''}</div>
          <div className="font-display text-[20px] font-black leading-tight">{l.status === 'warning' ? 'Something is rising…' : `It ${STATUS_TEXT[l.status]}`}</div>
          <div className="text-[12px] font-semibold text-white/65">{l.status === 'warning' ? <>{l.origin} · <Countdown to={l.rise_at} /></> : levNow(l) ?? l.place}</div></div>
        <button className="lv-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="relative mx-auto my-2 h-28 w-40"><LeviathanArt status={l.status} className="h-full w-full" /></div>
      {l.status !== 'warning' && <HpBar l={l} big />}
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="lv-mstat"><b className="tnum">{l.fighters}</b><i>fighting</i></div>
        <div className="lv-mstat"><b className="tnum">{fmtDmg(q.data?.me?.dmg ?? 0)}</b><i>your damage</i></div>
      </div>
      <button className="lv-cta gold mt-3 w-full" onClick={() => { onClose(); useLevUi.getState().open(); }} data-testid="lev-open">{l.status === 'warning' ? '🐉 Watch it rise' : '⚔️ FIGHT IT'}<span>bombs, your enchantments, the live feed</span></button>
    </motion.div>
  );
}

/** the fight */
export function LeviathanFight() {
  const fight = useLevUi((s) => s.fight);
  return createPortal(<AnimatePresence>{fight && <Fight key="f" />}</AnimatePresence>, document.body);
}

type Fly = { id: number; x: number; y: number; dmg?: number; label?: string };
function Fight() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const me = useOnboardedMe();
  const q = useLeviathan(true);
  const st = q.data;
  const l = st?.lev;
  const beast = useRef<HTMLDivElement>(null);
  const [flies, setFlies] = useState<Fly[]>([]);
  const [hit, setHit] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [bombs, setBombs] = useState<number | null>(null);
  const pending = useRef(0);
  const sending = useRef(false);
  const app = isNative();
  useEffect(() => { if (st?.me) setBombs(st.me.bombs - pending.current); }, [st?.me?.bombs]); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = (r: LevState) => { qc.setQueryData([...LEV_KEY, !!me], r); invalidateGame(qc); };
  // taps are gathered and sent a few at a time (up to 10 a throw)
  const flush = async () => {
    if (sending.current || pending.current < 1) return;
    sending.current = true;
    const n = Math.min(10, pending.current); pending.current -= n;
    try {
      const r = await api.leviathanHit('bomb', n);
      apply(r);
      const c = centerOf(beast.current);
      setFlies((f) => [...f, { id: Math.random(), x: c.x + (Math.random() - 0.5) * 80, y: c.y - 40, dmg: r.dmg, label: r.missed ? `${r.missed} missed — it’s tiny!` : undefined }]);
      if (r.fell) feel('success');
    } catch (e) { pending.current = 0; toast.error(toGameError(e).message); void q.refetch(); }
    finally { sending.current = false; if (pending.current > 0) setTimeout(() => void flush(), 250); }
  };
  useEffect(() => { const t = setInterval(() => void flush(), 700); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const hiddenFromMe = !!l?.hidden;
  const throwBomb = (e: React.PointerEvent) => {
    if (!l || l.status === 'warning' || !me || hiddenFromMe) return;
    if ((bombs ?? 0) < 1) { toast('Out of ink bombs — one comes back every minute.'); return; }
    feel('light'); setHit((h) => h + 1);
    setBombs((b) => (b ?? 1) - 1); pending.current += 1;
    setFlies((f) => [...f.slice(-14), { id: Math.random(), x: e.clientX, y: e.clientY }]);
    efx.burst({ x: e.clientX, y: e.clientY, colors: ['#2A1260', '#B026FF', '#FF5CDB'], count: 18, speed: 8, kind: 'drop' });
  };
  const move = async (id: string) => {
    feel('heavy');
    try {
      const r = await api.leviathanHit('enchant', 1, id);
      apply(r); setHit((h) => h + 1);
      const c = centerOf(beast.current);
      efx.burst({ ...c, colors: ['#FFD23F', '#FF5CDB', '#22E3FF', '#fff'], count: 160, speed: 15, kind: 'spark' });
      setFlies((f) => [...f, { id: Math.random(), x: c.x, y: c.y - 60, dmg: r.dmg, label: r.label }]);
      if (r.effect && EFFECT[r.effect]) { setBanner(EFFECT[r.effect]); setTimeout(() => setBanner(null), 3200); }
    } catch (e) { toast.error(toGameError(e).message); }
  };
  const flyTo = () => {
    if (!l) return;
    const p = levPos(l);
    useLevUi.getState().close();
    // (hidden: to the middle of the haze, close enough to start searching)
    toMap(nav, { lng: p.lng, lat: p.lat, zoom: l.hidden ? 9.6 : levTiny(l) ? 12 : 8.5 });
  };
  return (
    <motion.div className={cn('lv-lev-fight pointer-events-auto fixed inset-0 z-[140] flex flex-col overflow-y-auto', app && 'app')} initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 34 }} data-testid="lev-fight">
      <EnchantFxLayer />
      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 pb-2 pt-[max(14px,env(safe-area-inset-top,0px))]">
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[10.5px] font-black uppercase tracking-[0.16em] text-[#FFC6F3]">Leviathan #{l?.gen ?? ''}{l && Number(l.strength) > 1 ? ` · it came back ×${l.strength} stronger` : ''}</div>
          <div className="font-display text-[22px] font-black text-white">{l ? `It ${STATUS_TEXT[l.status]}` : st?.last ? (st.last.status === 'fallen' ? 'The Leviathan has fallen' : 'It escaped to the sea') : 'The sea is quiet'}</div>
        </div>
        <button className="lv-x" onClick={() => useLevUi.getState().close()} aria-label="Close" data-testid="lev-close">×</button>
      </div>
      {l ? (
        <div className="grid grid-cols-1 gap-3 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
          {l.status !== 'warning' && <HpBar l={l} big />}
          <div className="flex flex-wrap gap-1.5 text-[11px] font-black">
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/85">📍 {l.status === 'warning' ? l.origin : l.place}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/85">⚔️ {l.fighters} fighting</span>
            {levMult(l) > 1 && <span className="rounded-full bg-[#FF5CDB] px-2.5 py-1 text-white">💥 hits ×{levMult(l)}</span>}
            {l.target?.owner_name && <span className="rounded-full bg-[#FF2D55] px-2.5 py-1 text-white">🎯 heading for @{l.target.owner_name}{l.target.player ? '' : `’s ${l.target.giant ? 'giant ' : ''}plot`}</span>}
            {levRampage(l) && <span className="rounded-full bg-[#FF9F1C] px-2.5 py-1 text-[#2A0D00]" data-testid="lev-rampage">⚡ RAMPAGE · <Countdown to={l.rampage_until!} /></span>}
            {levTiny(l) && <span className="rounded-full bg-[#22E3FF] px-2.5 py-1 text-[#06222C]" data-testid="lev-tiny">🔬 TINY — half your bombs miss · <Countdown to={l.tiny_until!} /></span>}
            {l.hidden_until && <span className="rounded-full bg-[#6B2BD9] px-2.5 py-1 text-white" data-testid="lev-hidden">🫥 {l.hidden ? 'HIDING' : 'Hidden — you found it'} · <Countdown to={l.hidden_until} /></span>}
            {!levRampage(l) && Math.abs(levPace(l) - 1) > 0.15 && <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/85">{levPace(l) > 1 ? '💨' : '🐢'} ×{levPace(l) >= 10 ? Math.round(levPace(l)) : levPace(l).toFixed(1)} speed</span>}
            {l.status === 'fleeing' && <span className="rounded-full bg-[#9BE7FF] px-2.5 py-1 text-[#06222C]">🌊 racing {l.exit_sea ?? 'to the sea'} — finish it!</span>}
          </div>
          <div ref={beast} className="lv-lev-arena relative grid h-[min(46vh,360px)] touch-none select-none place-items-center overflow-hidden rounded-[28px]" onPointerDown={throwBomb} data-testid="lev-arena">
            <div className="lv-lev-sea absolute inset-x-0 bottom-0 h-1/3" />
            <div className={cn('relative h-[86%] w-[96%]', levTiny(l) && 'lv-lev-tinyart', hiddenFromMe && 'opacity-0')}><LeviathanArt status={l.status} paused={levPos(l).paused} shrunk={!!l.shrunk_until && Date.parse(l.shrunk_until) > serverNow()} foretold={!!l.foretold_until && Date.parse(l.foretold_until) > serverNow()} hit={hit} className="h-full w-full" /></div>
            {hiddenFromMe && (
              <div className="absolute inset-0 grid place-items-center px-6 text-center" data-testid="lev-fog">
                <div className="grid justify-items-center gap-2">
                  <div className="text-5xl">🫥</div>
                  <div className="font-display text-[20px] font-black text-white">It’s hiding</div>
                  <div className="text-[12.5px] font-bold text-white/75">Only players who find it can hit it. Zoom in on the haze on the map and look around — it tells you when you’re getting warm. (The Oracle Eye’s move shows everyone where it is.)</div>
                  <button className="lv-cta gold mt-1 px-5" onPointerDown={(e) => e.stopPropagation()} onClick={flyTo} data-testid="lev-search">🔍 Search the map</button>
                </div>
              </div>
            )}
            {l.status === 'warning'
              ? <div className="absolute inset-x-0 bottom-4 text-center"><div className="font-display text-2xl font-black text-white">Rises in <Countdown to={l.rise_at} /></div><div className="text-[12px] font-bold text-white/70">{l.origin}</div></div>
              : !hiddenFromMe && <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[13px] font-black text-white drop-shadow">{me ? (levTiny(l) ? 'It’s TINY — tap fast, half your bombs miss' : 'TAP IT to throw ink bombs') : 'Sign in to fight it'}</div>}
            <AnimatePresence>{banner && <motion.div key={banner} className="absolute inset-x-6 top-4 rounded-2xl bg-black/70 px-3 py-2 text-center text-[13px] font-black text-[#FFE8A3]" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>{banner}</motion.div>}</AnimatePresence>
          </div>
          {createPortal(<div className="pointer-events-none fixed inset-0 z-[160]">{flies.map((f) => <Flyer key={f.id} f={f} onDone={() => setFlies((x) => x.filter((y) => y.id !== f.id))} />)}</div>, document.body)}
          {me && st?.me && l.status !== 'warning' && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="lv-mstat"><b className="tnum" data-testid="lev-bombs">{bombs ?? st.me.bombs}</b><i>💣 bombs</i></div>
                <div className="lv-mstat"><b className="tnum">{fmtDmg(st.me.dmg)}</b><i>your damage</i></div>
                <div className="lv-mstat"><b className="tnum">{st.me.rank ? `#${st.me.rank}` : '—'}</b><i>your rank</i></div>
              </div>
              {st.me.next_bomb_in != null && <p className="-mt-1 text-[11px] font-semibold text-white/50">Next bomb in {dur(st.me.next_bomb_in)} · a bank of {st.me.bombs_max}</p>}
              <div className="grid grid-cols-1 gap-1.5" data-testid="lev-moves">
                <div className="text-[11px] font-black uppercase tracking-wider text-white/60">Your enchantments’ moves (each every 3 hours)</div>
                {st.me.moves.length ? st.me.moves.map((m) => (
                  <button key={m.id} disabled={m.ready_in > 0} onClick={() => void move(m.id)} className={cn('lv-lev-move flex items-center gap-2.5 rounded-2xl p-2 text-left', m.ready_in > 0 && 'opacity-45')} style={{ ['--a' as string]: kindInfo(m.kind).a }} data-testid="lev-move">
                    <Sigil kind={m.kind} seed={m.sigil} size={40} still />
                    <span className="min-w-0 flex-1 leading-tight"><b className="block truncate text-[13px] text-white">{m.move}</b><i className="block truncate text-[11px] not-italic text-white/60">{m.name} · ~{fmtDmg(m.dmg)}{m.effect ? ` · ${EFFECT[m.effect]?.split(':')[0].split('!')[0]}` : ''}</i></span>
                    <span className="shrink-0 rounded-full bg-black/30 px-2 py-1 text-[11px] font-black text-white">{m.ready_in > 0 ? dur(m.ready_in) : 'READY'}</span>
                  </button>
                )) : <p className="text-[12px] text-white/55">Enchantments each get a move against it. Ink bombs are for everyone.</p>}
              </div>
            </>
          )}
          <div className="grid grid-cols-1 gap-1" data-testid="lev-feed">
            <div className="text-[11px] font-black uppercase tracking-wider text-white/60">Live</div>
            <AnimatePresence initial={false}>
              {(st?.feed ?? []).slice(0, 12).map((h) => (
                <motion.div key={h.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 text-[12.5px]">
                  <span>{h.emoji}</span>
                  {h.move === 'heal'
                    ? <span className="min-w-0 flex-1 truncate text-white/85"><b className="text-[#9BE7FF]">The Leviathan</b> {h.label.toLowerCase()}</span>
                    : <span className="min-w-0 flex-1 truncate text-white/85"><b className="text-white">@{h.name ?? '?'}</b> {h.move === 'giant' ? '’s giant plot stood in its way' : `· ${h.label}`}</span>}
                  <b className={cn('shrink-0', h.move === 'heal' ? 'text-[#7CFFB2]' : 'text-[#FF8FD0]')}>{h.move === 'heal' ? '+' : ''}{fmtDmg(h.dmg)}</b>
                </motion.div>
              ))}
            </AnimatePresence>
            {!(st?.feed ?? []).length && <p className="text-[12px] text-white/50">{l.status === 'warning' ? 'Nobody can touch it until it rises.' : 'Be the first to strike.'}</p>}
          </div>
          {(st?.top ?? []).length > 0 && (
            <div className="grid grid-cols-1 gap-1" data-testid="lev-top">
              <div className="text-[11px] font-black uppercase tracking-wider text-white/60">Top fighters</div>
              {st!.top!.map((t, i) => (
                <div key={t.player.id} className={cn('flex items-center gap-2 rounded-xl px-2 py-1 text-[12.5px]', t.me && 'bg-white/10')}>
                  <b className="w-5 text-white/60">{i + 1}</b><PlayerAvatar p={t.player} size={22} /><span className="min-w-0 flex-1 truncate font-bold">@{t.player.username}</span><b className="text-[#FFE8A3]">{fmtDmg(t.dmg)}</b>
                </div>
              ))}
            </div>
          )}
          <button className={cn('w-full', app ? 'lv-cta' : 'rounded-2xl bg-white/10 py-3 text-[13px] font-black')} onClick={flyTo} data-testid="lev-fly">🗺️ Show me where it is</button>
          <p className="text-center text-[11px] text-white/50">If it falls, its bones stay on the map where it died — and everyone who hit it shares the loot. If it reaches the sea, it comes back stronger.</p>
        </div>
      ) : (
        <div className="grid gap-3 px-4 pb-10 text-center">
          <div className="mx-auto h-40 w-56 opacity-60"><LeviathanArt status="warning" paused className="h-full w-full" /></div>
          {st?.next_at && <p className="text-[14px] font-bold text-white/80">The next one rises in <Countdown to={st.next_at} />.</p>}
          {st?.last && <p className="text-[12px] text-white/60">Last time: Leviathan #{st.last.gen} {st.last.status === 'fallen' ? `fell ${st.last.place ?? ''}` : 'escaped to the sea'} {timeAgo(st.last.ended_at)} · {st.last.fighters} fought it.</p>}
        </div>
      )}
    </motion.div>
  );
}

function centerOf(el: Element | null) { const r = el?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 }; }

function Flyer({ f, onDone }: { f: Fly; onDone(): void }) {
  useEffect(() => { const t = setTimeout(onDone, f.dmg != null ? 1400 : 700); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (f.dmg != null) return (
    <motion.div className="absolute -translate-x-1/2 text-center" style={{ left: f.x, top: f.y }} initial={{ y: 0, scale: 0.4, opacity: 0 }} animate={{ y: -70, scale: 1, opacity: [0, 1, 1, 0] }} transition={{ duration: 1.3 }}>
      <div className="font-display text-[32px] font-black leading-none text-white" style={{ textShadow: '0 0 18px #FF5CDB, 0 3px 0 #2A0D44' }}>−{fmtDmg(f.dmg)}</div>
      {f.label && <div className="mt-1 whitespace-nowrap rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-black text-[#FFE8A3]">{f.label}</div>}
    </motion.div>
  );
  return <motion.span className="absolute text-2xl" style={{ left: f.x - 12, top: f.y - 12 }} initial={{ scale: 1.4, opacity: 1 }} animate={{ y: -50, scale: 0.4, opacity: 0, rotate: 200 }} transition={{ duration: 0.6 }}>💣</motion.span>;
}

/** the big moments, once each: the warning, the rising, the fall (with your loot), the escape — and its bones */
export function LeviathanMoments() {
  const q = useLeviathan();
  const qc = useQueryClient();
  const st = q.data;
  const l = st?.lev;
  const bones = useLevUi((s) => s.bones);
  const seen = safeStorage<Record<string, string>>('landvas.leviathan.seen', {});
  const [moment, setMoment] = useState<{ kind: 'warning' | 'risen' | 'fallen' | 'escaped'; id: string } | null>(null);
  useEffect(() => {
    if (!st) return;
    if (l && l.status === 'warning' && seen[l.id] !== 'warning' && seen[l.id] !== 'risen') { setMoment({ kind: 'warning', id: l.id }); quake(); scheduleRise(l); }
    else if (l && l.status !== 'warning' && seen[l.id] !== 'risen') { setMoment({ kind: 'risen', id: l.id }); quake(); }
    else if (!l && st.last?.loot?.loot && !st.last.loot.seen) setMoment({ kind: st.last.status === 'fallen' ? 'fallen' : 'escaped', id: st.last.id });
  }, [st?.lev?.id, st?.lev?.status, st?.last?.id, st?.last?.loot?.seen]); // eslint-disable-line react-hooks/exhaustive-deps
  // its powers and the owner's tricks, as they happen (a toast each, once — not for what was already going on when you came)
  const powers = useRef<Record<string, string>>({});
  const mountedAt = useRef(Date.now());
  useEffect(() => {
    if (!l || l.status === 'warning') return;
    const said = powers.current;
    const tell = (key: string, at: string | null | undefined, text: string, desc: string) => {
      if (!at || Date.parse(at) <= serverNow()) return;
      const k = `${l.id}:${key}:${at}`;
      if (said[key] === k) return;
      const first = said[key] === undefined && Date.now() - mountedAt.current < 4000;
      said[key] = k;
      if (!first) { toast(text, { description: desc }); feel('medium'); }
    };
    tell('tiny', l.tiny_until, '🔬 The Leviathan shrank itself!', 'It’s tiny — half the ink bombs miss. A Size Ray move blows it back up.');
    tell('hidden', l.hidden_until, '🫥 The Leviathan vanished!', 'It’s hiding somewhere on the map — zoom in and search to find it (and fight it).');
    tell('rampage', l.rampage_until, '⚡ The Leviathan is on a RAMPAGE!', l.target?.owner_name ? `It’s charging at @${l.target.owner_name}.` : 'It’s charging across the map.');
  }, [l?.id, l?.tiny_until, l?.hidden_until, l?.rampage_until, l?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = () => {
    if (!moment) return;
    if (moment.kind === 'warning' || moment.kind === 'risen') saveStorage('landvas.leviathan.seen', { ...seen, [moment.id]: moment.kind });
    else void api.leviathanSeen(moment.id).then(() => qc.invalidateQueries({ queryKey: LEV_KEY }));
    setMoment(null);
  };
  const loot = st?.last?.loot?.loot;
  return createPortal(
    <AnimatePresence>
      {moment && (
        <motion.div key={moment.kind} className={cn('lv-lev-moment pointer-events-auto fixed inset-0 z-[260] grid place-items-center px-6 text-center', moment.kind)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid={`lev-moment-${moment.kind}`}>
          <motion.div className="grid justify-items-center gap-3" initial={{ scale: 0.6, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 160, damping: 16, delay: 0.2 }}>
            <div className="h-44 w-60"><LeviathanArt status={moment.kind === 'fallen' ? 'fleeing' : moment.kind === 'escaped' ? 'fleeing' : 'walking'} paused={moment.kind === 'fallen'} className={cn('h-full w-full', moment.kind === 'fallen' && 'rotate-[18deg] opacity-80')} /></div>
            {moment.kind === 'warning' && l && <>
              <div className="font-display text-[30px] font-black leading-tight text-white">Something is rising {l.origin}.</div>
              <div className="text-[15px] font-bold text-white/80">The Leviathan rises in <Countdown to={l.rise_at} />. Every player on Earth will see it — and every player can fight it.</div>
            </>}
            {moment.kind === 'risen' && l && <>
              <div className="font-display text-[32px] font-black leading-tight text-white">THE LEVIATHAN HAS RISEN</div>
              <div className="text-[15px] font-bold text-white/80">It came ashore {l.origin} and it’s walking inland{l.place ? ` — ${l.place} now` : ''}. Throw everything you have at it.</div>
            </>}
            {moment.kind === 'fallen' && <>
              <div className="font-display text-[32px] font-black leading-tight text-[#FFE8A3]">THE LEVIATHAN HAS FALLEN</div>
              <div className="text-[14px] font-bold text-white/80">Its bones will lie {st?.last?.place ?? 'where it fell'} forever. {Number(st?.last?.fighters ?? 0) === 1 ? 'One player brought it down.' : `${st?.last?.fighters} players brought it down.`}</div>
              {loot && <div className="grid gap-1 rounded-2xl bg-black/40 px-4 py-3 text-[14px] font-black text-white" data-testid="lev-loot">
                <div>Your share: #{loot.rank} · {loot.share}% of the damage</div>
                <div className="text-[22px] text-[#B79CFF]">+{loot.ink} Ink</div>
                {loot.enchant && <div>✨ +1 Enchanted Luck</div>}
                {loot.ticket && <div>🎟️ A {loot.ticket === 'legendary' ? 'Legendary+' : 'Epic+'} roll ticket</div>}
              </div>}
            </>}
            {moment.kind === 'escaped' && <>
              <div className="font-display text-[30px] font-black leading-tight text-[#9BE7FF]">It escaped back to the sea…</div>
              <div className="text-[14px] font-bold text-white/80">It will return next week — stronger.{loot ? ` For standing against it: +${loot.ink} Ink.` : ''}</div>
            </>}
            <div className="flex gap-2">
              {(moment.kind === 'warning' || moment.kind === 'risen') && <button className="lv-cta gold px-5" onClick={() => { done(); useLevUi.getState().open(); }} data-testid="lev-moment-go">{moment.kind === 'warning' ? '🐉 Watch it rise' : '⚔️ FIGHT IT'}</button>}
              <button className="rounded-full bg-white/15 px-5 py-3 text-[14px] font-black text-white" onClick={done} data-testid="lev-moment-ok">{moment.kind === 'fallen' || moment.kind === 'escaped' ? 'Collect' : 'Later'}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
      {bones && (
        <motion.button key="bones" className="pointer-events-auto fixed inset-0 z-[250] grid place-items-center bg-black/60 px-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => useLevUi.getState().showBones(null)} data-testid="lev-bones-card">
          <div className="grid gap-1.5 rounded-3xl border border-white/20 bg-[#12051F] px-6 py-5"><span className="text-5xl">🦴</span>
            <div className="font-display text-xl font-black text-white">Leviathan #{bones.gen} fell here</div>
            <div className="text-[13px] text-white/70">{bones.place ?? ''} · {new Date(bones.at).toLocaleDateString()} · {bones.players} players fought it{bones.top ? ` · the last word belonged to @${bones.top}` : ''}</div></div>
        </motion.button>
      )}
    </AnimatePresence>, document.body);
}

/** the map shakes */
function quake() {
  feel('heavy'); setTimeout(() => feel('heavy'), 250); setTimeout(() => feel('medium'), 600);
  const el = document.querySelector('[data-testid=world-map]')?.parentElement;
  if (!el) return;
  el.classList.remove('lv-quake'); void (el as HTMLElement).offsetWidth; el.classList.add('lv-quake');
  setTimeout(() => el.classList.remove('lv-quake'), 2200);
}

/** in the app: a notification on this phone when it rises (nothing leaves the phone) */
async function scheduleRise(l: Lev) {
  if (!isNative()) return;
  try {
    const { LocalNotifications: LN } = await import('@capacitor/local-notifications');
    const p = await LN.checkPermissions();
    if (p.display !== 'granted') return;
    const at = new Date(Date.parse(l.rise_at));
    if (at.getTime() < Date.now() + 30_000) return;
    await LN.schedule({ notifications: [{ id: 7300 + (l.gen % 100), title: '🐉 The Leviathan has risen', body: `It came ashore ${l.origin}. Every player can fight it — open LANDVAS.`, schedule: { at, allowWhileIdle: true }, extra: { to: '/world' } }] });
  } catch { /* not allowed: the in-game warning still shows */ }
}
