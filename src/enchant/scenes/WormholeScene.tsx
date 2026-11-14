// 🌀 Wormhole: a tear in space above your plot. Pick the far end (another plot of yours), then trace the spiral with your
// finger to open it — the server times the trace, your hand's steadiness does the rest. Open, it swirls; every few hours
// something shoots out of it — tap it before it's gone. Fly through it and the map comes out at the other end.
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../../backend/api';
import { qk } from '../../lib/queries';
import { useUi } from '../../lib/store';
import { toMap } from '../../lib/toMap';
import { cn, fmt } from '../../lib/utils';
import { cellCenter } from '../../shared/grid';
import { rarityInfo } from '../../shared/rarity';
import { Button } from '../../ui';
import { centerOf, efx, useLeft, type SceneProps } from '../core';
import { dur } from '../kinds';
import { feel } from '../living';
import { Radar, plotLabel } from '../sizeray';

const DROP = { chest: { e: '🧰', t: 'A chest!' }, star: { e: '⭐', t: 'A falling star (+5 Luck)' }, fox: { e: '🦊', t: 'A fox — chase it back!' }, spores: { e: '🍄', t: 'Spores…' } } as const;
const haversine = (a: [number, number], b: [number, number]) => {
  const R = 6371, dLat = ((b[1] - a[1]) * Math.PI) / 180, dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

/** the trip through: a tunnel, then the map at the far end */
export const useWarp = create<{ to: { gx: number; gy: number } | null; go(to: { gx: number; gy: number }): void; done(): void }>((set) => ({ to: null, go: (to) => set({ to }), done: () => set({ to: null }) }));
// (it's mounted on the map and on the Grimoire's pages — which can be open at once — and only one of them flies you)
let tunnelOwner: symbol | null = null;
export function WarpTunnel() {
  const [me] = useState(() => Symbol('warp'));
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    if (!tunnelOwner) { tunnelOwner = me; setOwner(true); }
    return () => { if (tunnelOwner === me) tunnelOwner = null; };
  }, [me]);
  const to = useWarp((s) => (owner ? s.to : null));
  const nav = useNavigate();
  useEffect(() => {
    if (!to) return;
    feel('heavy');
    const i = setInterval(() => feel('light'), 180);
    const t = setTimeout(() => {
      clearInterval(i);
      const [lng, lat] = cellCenter(to.gx, to.gy);
      toMap(nav, { lng, lat, zoom: 19.2 });
      setTimeout(() => useUi.getState().select(to), 1700);
      feel('success');
      useWarp.getState().done();
    }, 1700);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [to]); // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <AnimatePresence>
      {to && (
        <motion.div key="warp" className="lv-warp fixed inset-0 z-[300] overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="warp-tunnel">
          {Array.from({ length: 14 }, (_, i) => <span key={i} className="lv-warp-ring" style={{ animationDelay: `${i * 0.11}s` }} />)}
          {Array.from({ length: 40 }, (_, i) => <span key={`s${i}`} className="lv-warp-star" style={{ ['--a' as string]: `${(i * 137.5) % 360}deg` }}><i style={{ animationDelay: `${(i % 10) * 0.08}s` }} /></span>)}
          <div className="absolute inset-x-0 bottom-[14%] text-center font-display text-2xl font-black text-white drop-shadow-[0_0_14px_#00E0FF]">Through the wormhole…</div>
        </motion.div>
      )}
    </AnimatePresence>, document.body);
}

/** trace the spiral from the rim to the centre */
function SpiralTrace({ onDone, onCancel }: { onDone(smooth: number): void; onCancel(): void }) {
  const box = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<{ x: number; y: number }[]>([]);
  const st = useRef({ last: null as number | null, total: 0, err: 0, n: 0, done: false });
  const TURNS = 2.25;
  const guide = Array.from({ length: 220 }, (_, i) => { const p = i / 219, th = p * TURNS * Math.PI * 2, r = 46 * (1 - p) + 2; return `${50 + Math.cos(th - Math.PI / 2) * r},${50 + Math.sin(th - Math.PI / 2) * r}`; }).join(' ');
  const move = (e: React.PointerEvent) => {
    if (st.current.done || !(e.buttons || e.pointerType === 'touch')) return;
    const r = box.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100;
    const dx = x - 50, dy = y - 50, rad = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    const s = st.current;
    if (s.last != null) { let d = th - s.last; if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; s.total += Math.abs(d); }
    s.last = th;
    const prog = Math.min(1, s.total / (TURNS * Math.PI * 2));
    const want = 46 * (1 - prog) + 2;
    s.err += Math.abs(rad - want) / 46; s.n++;
    setPath((p) => [...p.slice(-300), { x, y }]);
    if (s.n % 6 === 0) feel('light');
    if ((prog > 0.8 && rad < 10) || prog >= 1) {
      s.done = true;
      const smooth = Math.max(0, Math.min(1, 1 - (s.err / Math.max(1, s.n)) * 2.4));
      onDone(smooth);
    }
  };
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-black/55" data-testid="wormhole-trace">
      <div ref={box} className="relative aspect-square h-[92%]" style={{ touchAction: 'none' }} onPointerMove={move} onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); move(e); }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <polyline points={guide} fill="none" stroke="#9BE7FF" strokeOpacity="0.35" strokeWidth="5" strokeLinecap="round" strokeDasharray="1 3" />
          <polyline points={path.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#00E0FF" strokeWidth="3.4" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 3px #00E0FF)' }} />
          <circle cx="50" cy="4" r="3" fill="#fff" className="lv-sigil-pulse" />
        </svg>
        <span className="pointer-events-none absolute inset-x-0 -bottom-1 text-center text-[11px] font-black text-white/80">Trace the spiral from the white dot into the centre</span>
      </div>
      <button className="lv-x absolute right-3 top-3" onClick={onCancel} aria-label="Stop">×</button>
    </div>
  );
}

export function WormholeScene({ v, view, act, busy, at }: SceneProps) {
  const plots = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots });
  const [far, setFar] = useState<{ gx: number; gy: number } | null>(null);
  const [third, setThird] = useState<{ gx: number; gy: number } | null>(null);
  const [tracing, setTracing] = useState(false);
  const [opened, setOpened] = useState<any>(null);
  const portal = useRef<HTMLDivElement>(null);
  const openLeft = useLeft(view.open_left, at);
  const canIn = useLeft(view.can_open_in, at);
  const nextDrop = useLeft(view.next_drop_in, at);
  const home: [number, number] = cellCenter(v.gx, v.gy);
  const maxKm: number | null = view.max_km ?? null;
  const list = ((plots.data ?? []) as any[]).filter((p) => !(p.gx === v.gx && p.gy === v.gy)).map((p) => ({ ...p, km: haversine(home, cellCenter(p.gx, p.gy)) }));
  const reachable = list.filter((p) => maxKm == null || p.km <= maxKm);
  const pfar = far ? list.find((p) => p.gx === far.gx && p.gy === far.gy) : null;
  const start = async () => {
    if (!far) return;
    const r = await act('trace', {}, { silent: true });
    if (r) setTracing(true);
  };
  const finish = async (smooth: number) => {
    setTracing(false);
    const args: Record<string, unknown> = { gx: far!.gx, gy: far!.gy, smooth };
    if (third) { args.gx3 = third.gx; args.gy3 = third.gy; }
    const r = await act('open', args, { silent: true });
    if (r) { setOpened(r.result); feel('success'); efx.burst({ ...centerOf(portal.current), colors: ['#7B5CFF', '#00E0FF', '#fff'], count: 260, speed: 16, kind: 'spark' }); setTimeout(() => setOpened(null), 3800); }
  };
  const catchIt = async () => {
    if (!view.drop) return;
    const r = await act('catch', { k: view.drop.k }, { at: centerOf(portal.current) });
    if (r) { feel('success'); if (r.result.luck) efx.burst({ ...centerOf(portal.current), colors: ['#FFD23F', '#fff'], count: 80, speed: 10, kind: 'emoji', emojis: ['⭐', '✨'] }); }
  };
  const isOpen = !!view.open;
  const ends: any[] = view.ends ?? [];
  return (
    <div className="grid gap-3">
      <div className="lv-scene aspect-[4/3] w-full" style={{ background: 'radial-gradient(circle at 50% 50%,#1B0E4A,#05031A 72%)' }} data-testid="wormhole-scene">
        {Array.from({ length: 40 }, (_, i) => <span key={i} className="lv-star absolute h-[2px] w-[2px] rounded-full bg-white" style={{ left: `${(i * 53) % 100}%`, top: `${(i * 37) % 100}%`, animationDelay: `${(i % 9) * 0.4}s` }} />)}
        <div ref={portal} className={cn('lv-vortex absolute left-1/2 top-1/2 aspect-square w-[58%] -translate-x-1/2 -translate-y-1/2', isOpen ? 'open' : 'shut')}>
          <span className="lv-vortex-a" /><span className="lv-vortex-b" /><span className="lv-vortex-c" /><span className="lv-vortex-eye" />
        </div>
        {isOpen && (
          <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2 text-[11px] font-black">
            <span className="rounded-full bg-black/50 px-2.5 py-1 text-[#9BE7FF]">🌀 Open · {dur(openLeft)} · {view.open.stability}% stable</span>
            <span className="rounded-full bg-black/50 px-2.5 py-1 text-white/80">{fmt(Math.round(Number(view.open.km)))} km</span>
          </div>
        )}
        <AnimatePresence>
          {isOpen && view.drop && (
            <motion.button key={view.drop.k} onClick={() => void catchIt()} className="absolute left-1/2 top-1/2 z-[6] text-6xl" initial={{ x: '-50%', y: '-50%', scale: 0.1 }}
              animate={{ x: ['-50%', '40%', '-120%', '-50%'], y: ['-50%', '-160%', '-90%', '-150%'], scale: [0.1, 1.2, 1, 1.1], rotate: [0, 200, 360, 420] }} transition={{ duration: 4, repeat: Infinity, repeatType: 'mirror' }}
              exit={{ scale: 0, opacity: 0 }} data-testid="wormhole-drop" aria-label="Catch it">
              {DROP[view.drop.type as keyof typeof DROP]?.e ?? '✨'}
            </motion.button>
          )}
        </AnimatePresence>
        {isOpen && view.drop && <div className="absolute inset-x-0 bottom-3 text-center text-[13px] font-black text-white drop-shadow">{DROP[view.drop.type as keyof typeof DROP]?.t} Tap it! ({dur(view.drop.left)})</div>}
        {isOpen && !view.drop && <div className="absolute inset-x-0 bottom-3 text-center text-[12px] font-bold text-white/65">Something comes through in {dur(nextDrop)}</div>}
        {!isOpen && <div className="absolute inset-x-0 bottom-3 text-center text-[12px] font-bold text-white/65">{(canIn ?? 0) > 0 ? `It gathers itself — ready in ${dur(canIn)}` : 'Closed. Pick the far end, then trace the spiral.'}</div>}
        <AnimatePresence>
          {opened && (
            <motion.div key="o" className="absolute inset-0 z-[8] grid place-items-center bg-black/60 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="wormhole-opened">
              <div><div className="font-display text-4xl font-black text-[#00E0FF]" style={{ textShadow: '0 0 20px #00E0FF' }}>OPEN!</div>
                <div className="text-[13px] font-bold text-white">{opened.stability}% stable · open for {opened.hours} hours</div></div>
            </motion.div>
          )}
        </AnimatePresence>
        {tracing && <SpiralTrace onDone={(s) => void finish(s)} onCancel={() => setTracing(false)} />}
      </div>
      {isOpen ? (
        <div className="grid gap-2">
          <div className="grid gap-1.5 rounded-2xl bg-white/[0.04] p-2.5" data-testid="wormhole-ends">
            {ends.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-[12.5px]">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#7B5CFF]/30">{e.home ? '🏠' : '🌀'}</span>
                <span className="min-w-0 flex-1 truncate font-bold">{e.name ?? (e.home ? 'The wormhole’s plot' : 'Your plot')}{e.place ? ` · ${e.place}` : ''}</span>
                {e.rarity && <span className="text-[11px] font-black" style={{ color: rarityInfo(e.rarity).color }}>{rarityInfo(e.rarity).name}</span>}
                {!e.home && <Button size="sm" variant="secondary" onClick={() => useWarp.getState().go({ gx: e.gx, gy: e.gy })} data-testid="wormhole-travel">Fly through</Button>}
              </div>
            ))}
          </div>
          <p className="text-[12px] text-white/65">While it’s open: minigame wins at either end pay <b>30% more</b>, and a Giant or Tiny plot at one end reaches the other.</p>
          <Button variant="ghost" onClick={() => void act('close')} disabled={!!busy}>Close it early</Button>
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="flex items-center justify-between text-[12px]"><span className="font-black uppercase tracking-wider text-white/60">The far end</span>
            <span className="font-bold text-white/55">{maxKm ? `within ${Math.round(maxKm)} km (anywhere from level 5)` : 'anywhere on Earth'}</span></div>
          <Radar plots={reachable} picked={far} onPick={(p) => { setFar({ gx: p.gx, gy: p.gy }); if (third?.gx === p.gx && third.gy === p.gy) setThird(null); }} />
          {pfar && <div className="text-center text-[12px] font-black" style={{ color: rarityInfo(pfar.rarity).color }}>{plotLabel(pfar)} · {fmt(Math.round(pfar.km))} km away</div>}
          {list.length > reachable.length && <p className="text-center text-[11px] text-white/50">{list.length - reachable.length} of your plots are too far for a young wormhole.</p>}
          {view.three && far && (
            <details className="rounded-2xl bg-white/[0.04] p-2"><summary className="cursor-pointer text-[12px] font-black text-[#9BE7FF]">⭐ Constellation: add a third plot</summary>
              <div className="mt-2"><Radar plots={reachable.filter((p) => !(p.gx === far.gx && p.gy === far.gy))} picked={third} onPick={(p) => setThird({ gx: p.gx, gy: p.gy })} /></div></details>
          )}
          <Button variant="rainbow" size="lg" disabled={!far || !!busy || (canIn ?? 0) > 0} onClick={() => void start()} data-testid="wormhole-open">
            {(canIn ?? 0) > 0 ? `Recharging · ${dur(canIn)}` : far ? '🌀 Trace the spiral to open it' : 'Pick the far end first'}
          </Button>
        </div>
      )}
      <p className="text-center text-[11px] text-white/55">Opened {view.opens} time{view.opens === 1 ? '' : 's'} · caught {view.catches} · {view.echoes} wins echoed through.</p>
    </div>
  );
}
