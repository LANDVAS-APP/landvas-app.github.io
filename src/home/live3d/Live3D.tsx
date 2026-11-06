// A 3D party game: you're whisked from the house to a whole new place (Candy Park, the Moonlit Garden, the Volcano
// Lake, the Grand Ballroom) and play live with everyone. The host's device runs the game 30 times a second and
// sends it out ~12 times a second; everyone else sends their stick and button. The host reports the places.
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../backend/api';
import { getBackend, toGameError } from '../../backend/backend';
import type { ExplorerStyle, HomeGame } from '../../backend/types';
import { explorerSvg } from '../../explorer/character';
import { music } from '../../arcade/music';
import { sfx } from '../../arcade/sfx';
import { cn } from '../../lib/utils';
import { useUi } from '../../lib/store';
import { Button } from '../../ui';
import { PartyResults, seatsOf } from '../party/PartyGame';
import { SIMS3, snap3, type ChairW, type HSW, type In3, type LavaW, type TagW, type W3 } from './sims';
import { createWorld3D, type World3D } from './worlds';

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
const STEP = 1 / 30, SNAP_MS = 80, GONE_MS = 7000;
type Msg = { t: 's'; k: number; w: W3 } | { t: 'i'; id: string; i: In3 } | { t: 'end'; r: Record<string, number> };

export function Live3D({ game, myId, onClose }: { game: HomeGame; myId: string; onClose(): void }) {
  const sim = SIMS3[game.game];
  const reduce = useUi((s) => s.settings.reduceMotion);
  const cv = useRef<HTMLCanvasElement>(null);
  const input = useRef<In3>({ x: 0, y: 0, b: false });
  const [phase, setPhase] = useState<'count' | 'play' | 'end' | 'gone'>('count');
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const [count, setCount] = useState(4);
  const [final, setFinal] = useState<HomeGame | null>(null);
  const [hud, setHud] = useState<W3 | null>(null);
  const host = game.host === myId;
  const seats = useRef(seatsOf(game)).current;

  useEffect(() => {
    if (!sim || !cv.current) return;
    const backend = getBackend();
    const offset = Date.parse(game.server_time) - Date.now();
    const startAt = Date.parse(game.started_at ?? game.server_time) - offset;
    const ids = seats.map((s) => s.id);
    const base = sim.init(ids, game.seed ?? 1);
    const world: World3D = createWorld3D({
      canvas: cv.current, game: game.game, me: myId, obs: base.obs, reduceMotion: reduce,
      seats: seats.map((s) => ({ id: s.id, name: s.name, color: s.color, url: svgUrl(explorerSvg((game.players.find((p) => p.id === s.id) as { explorer_style?: ExplorerStyle } | undefined)?.explorer_style, s.p.accent_color ?? s.color, 184)) })),
    });
    let w: W3 = base, prev: W3 | null = null, gotAt = performance.now(), lastSnap = 0, seq = 0, ended: Record<string, number> | null = null, stop = false, acc = 0, last = performance.now(), raf = 0, hudAt = 0;
    const inputs: Record<string, In3> = {};
    const finish = () => {
      setPhase('end'); sfx.jackpot?.();
      const poll = async (tries = 0) => {
        if (stop) return;
        try { const r = host ? await api.homeGameReport(game.id, ended!) : await api.homeGameGet(game.id); if (r.status === 'done' || r.status === 'cancelled') { setFinal(r); return; } }
        catch (e) { if (host && toGameError(e).code !== 'game_too_fast' && tries > 3) { setFinal({ ...game, status: 'cancelled' }); return; } }
        setTimeout(() => void poll(tries + 1), 1500);
      };
      void poll();
    };
    const onMsg = (raw: unknown) => {
      const m = raw as Msg; if (!m || typeof m !== 'object') return;
      if (host && m.t === 'i' && ids.includes(m.id)) inputs[m.id] = m.i;
      else if (!host && m.t === 's' && m.k > seq) { seq = m.k; prev = w; w = { ...m.w, obs: base.obs }; gotAt = performance.now(); lastSnap = gotAt; }
      else if (!host && m.t === 'end' && !ended) { ended = m.r; finish(); }
    };
    const ch = backend.liveChannel?.(`hg:${game.id}`, onMsg) ?? { send() {}, close() {} };
    const tick = () => {
      if (stop) return;
      raf = requestAnimationFrame(tick);
      const now = performance.now(), since = Date.now() - startAt;
      if (since < 0) setCount(Math.ceil(-since / 1000));
      else if (phaseRef.current === 'count') { phaseRef.current = 'play'; setPhase('play'); sfx.coin(); }
      if (host && since >= 0 && !ended) {
        acc += Math.min(0.25, (now - last) / 1000);
        inputs[myId] = input.current;
        while (acc >= STEP) { prev = null; sim.step(w, inputs, STEP); acc -= STEP; const r = sim.result(w); if (r) { ended = r; break; } }
        if (now - lastSnap >= SNAP_MS || ended) { lastSnap = now; ch.send({ t: 's', k: ++seq, w: snap3(w) }); }
        if (ended) { const r = ended; ch.send({ t: 'end', r }); setTimeout(() => ch.send({ t: 'end', r }), 700); setTimeout(() => ch.send({ t: 'end', r }), 1800); finish(); }
      }
      if (!host && since > 2500 && !ended && now - lastSnap > GONE_MS) { ended = {}; setPhase('gone'); }
      last = now;
      const a = host ? 1 : Math.min(1, (now - gotAt) / SNAP_MS);
      world.frame(w, prev, a, now / 1000, since < 0 ? Math.min(1, -since / 4000) : 0);
      if (now - hudAt > 150) { hudAt = now; setHud(w); }
      (window as unknown as { __live3d: unknown }).__live3d = { w, host, input: input.current };
    };
    raf = requestAnimationFrame(tick);
    // guests: send the stick when it changes
    let sentKey = '', sentAt = 0;
    const tx = setInterval(() => {
      if (host || ended || Date.now() < startAt - 300) return;
      const i = input.current, key = `${i.x.toFixed(1)},${i.y.toFixed(1)},${i.b}`, n = performance.now();
      if (key !== sentKey || n - sentAt > 900) { sentKey = key; sentAt = n; ch.send({ t: 'i', id: myId, i: { x: +i.x.toFixed(2), y: +i.y.toFixed(2), b: i.b } }); }
    }, 70);
    return () => { stop = true; cancelAnimationFrame(raf); clearInterval(tx); ch.close(); world.dispose(); delete (window as unknown as { __live3d?: unknown }).__live3d; };
  }, [game.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // the ballroom's music: it plays while you dance and stops when it's time to grab a chair
  const before = useRef(music.nowPlaying);
  const chairPhase = game.game === 'chairs' ? (hud as ChairW | null)?.phase : null;
  useEffect(() => { if (game.game !== 'chairs') return; if (chairPhase === 'music') music.play('disco', false); else music.stop(); }, [chairPhase, game.game]);
  useEffect(() => () => { if (game.game === 'chairs') { music.stop(); if (before.current) music.play(before.current, false); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // keyboard
  useEffect(() => {
    const keys = new Set<string>();
    const upd = () => { input.current = { x: (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0), y: (keys.has('arrowdown') || keys.has('s') ? 1 : 0) - (keys.has('arrowup') || keys.has('w') ? 1 : 0), b: keys.has(' ') }; };
    const dn = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault(); keys.add(k); upd(); };
    const up = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); upd(); };
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);
  // the touch stick
  const [stick, setStick] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const R = 56;
  const onDown = (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); setStick({ ox: e.clientX, oy: e.clientY, x: 0, y: 0 }); };
  const onMove = (e: React.PointerEvent) => { if (!stick) return; let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const l = Math.hypot(dx, dy); if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; } setStick({ ...stick, x: dx, y: dy }); input.current = { ...input.current, x: dx / R, y: dy / R }; };
  const onUp = () => { setStick(null); input.current = { ...input.current, x: 0, y: 0 }; };
  const press = (b: boolean) => { input.current = { ...input.current, b }; };

  if (!sim) return null;
  const me = hud?.ps.find((p) => p.id === myId);
  const status = statusLine(game.game, hud, myId, seats);
  const blind = game.game === 'hide' && (hud as HSW | null)?.phase === 'hide' && (hud as HSW).seeker === myId;
  return (
    <div className="fixed inset-0 z-[80] select-none bg-black text-white" data-testid="live3d" style={{ touchAction: 'none' }}>
      <canvas ref={cv} className="absolute inset-0 h-full w-full" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} data-testid="live3d-canvas" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <div className="rounded-2xl bg-black/55 px-3 py-1.5 backdrop-blur"><div className="font-display text-base font-black">{sim.emoji} {sim.name}</div><div className="text-[10px] text-white/70">📍 {sim.place}</div></div>
        {status && <div className={cn('ml-auto rounded-2xl px-3 py-1.5 text-right text-sm font-black backdrop-blur', status.hot ? 'bg-[#FF2D55]/85' : 'bg-black/55')} data-testid="live3d-status">{status.text}{status.sub && <div className="text-[10px] font-bold opacity-80">{status.sub}</div>}</div>}
        {phase === 'play' && <button onClick={onClose} className="pointer-events-auto rounded-xl bg-black/55 p-2" aria-label="Leave the game"><X className="h-4 w-4" /></button>}
      </div>
      {stick && <div className="pointer-events-none absolute" style={{ left: stick.ox - R, top: stick.oy - R, width: R * 2, height: R * 2 }}><div className="absolute inset-0 rounded-full border-2 border-white/30 bg-white/5" /><div className="absolute h-12 w-12 rounded-full bg-white/50" style={{ left: R - 24 + stick.x, top: R - 24 + stick.y }} /></div>}
      {phase === 'play' && me?.alive !== false && !blind && (
        <button className="absolute bottom-8 right-6 grid h-24 w-24 place-items-center rounded-full text-sm font-black shadow-2xl active:scale-90" style={{ background: `radial-gradient(circle at 35% 30%, #fff8, ${sim.color})`, boxShadow: `0 0 26px ${sim.color}`, marginBottom: 'env(safe-area-inset-bottom)' }}
          onPointerDown={(e) => { e.stopPropagation(); press(true); }} onPointerUp={() => press(false)} onPointerLeave={() => press(false)} data-testid="live3d-action">{sim.action}</button>
      )}
      {phase === 'play' && me && !me.alive && game.game !== 'hide' && <div className="pointer-events-none absolute inset-x-0 bottom-10 text-center"><span className="rounded-full bg-black/60 px-4 py-2 text-sm font-bold">You’re out — watching the rest 👀</span></div>}
      {blind && <div className="absolute inset-0 grid place-items-center bg-black/95" data-testid="live3d-blind"><div className="text-center"><div className="text-6xl">🙈</div><div className="mt-2 font-display text-3xl font-black">You’re the seeker!</div><div className="mt-1 text-white/70">Counting… everyone’s hiding</div><div className="mt-3 font-display text-6xl font-black text-[#8B5CFF]">{Math.max(0, Math.ceil((hud as HSW).ends - (hud as HSW).t))}</div></div></div>}
      {/* off to a whole new place */}
      <AnimatePresence>
        {phase === 'count' && (
          <motion.div exit={{ opacity: 0 }} transition={{ duration: 0.8 }} className="pointer-events-none absolute inset-0 grid place-items-center">
            <motion.div initial={{ scale: 3, opacity: 1 }} animate={{ scale: 0, opacity: 0.6 }} transition={{ duration: 1.6, ease: 'easeIn' }} className="absolute h-[140vmax] w-[140vmax] rounded-full" style={{ background: `radial-gradient(circle, transparent 30%, ${sim.color} 31%, #120C1C 45%)` }} />
            <div className="relative grid max-w-xs justify-items-center gap-2 rounded-3xl bg-black/55 px-6 py-5 text-center backdrop-blur">
              <div className="text-xs font-bold uppercase tracking-widest text-white/70">off to</div>
              <div className="font-display text-3xl font-black" style={{ color: sim.color }}>{sim.place}</div>
              <div className="text-5xl">{sim.emoji}</div>
              <p className="text-sm text-white/85">{sim.how}</p>
              <motion.div key={count} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-6xl font-black">{count}</motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {phase === 'gone' && <div className="absolute inset-0 grid place-items-center bg-black/75 p-6 text-center"><div className="grid gap-3"><div className="text-4xl">📡</div><b>The host dropped out</b><Button variant="rainbow" onClick={onClose}>Back to the house</Button></div></div>}
      {phase === 'end' && <PartyResults g={final} myId={myId} onClose={onClose} />}
    </div>
  );
}

function statusLine(game: string, w: W3 | null, me: string, seats: { id: string; name: string }[]): { text: string; sub?: string; hot?: boolean } | null {
  if (!w) return null;
  const name = (id: string) => (id === me ? 'You' : seats.find((s) => s.id === id)?.name ?? '');
  if (game === 'tag') { const t = w as TagW; return { text: t.it === me ? 'You’re IT! 🏃' : `${name(t.it)} is it`, sub: `${Math.max(0, Math.ceil(t.dur - t.t))}s · ${Math.round(t.pts[me] ?? 0)} pts`, hot: t.it === me }; }
  if (game === 'hide') {
    const h = w as HSW, left = Math.max(0, Math.ceil(h.ends - h.t)), hiders = h.ps.length - 1, found = Object.keys(h.found).length;
    if (h.phase === 'hide') return { text: h.seeker === me ? 'Counting…' : `Hide! ${left}s`, sub: `${name(h.seeker)} ${h.seeker === me ? 'are' : 'is'} seeking`, hot: h.seeker !== me };
    if (h.phase === 'seek') return { text: h.seeker === me ? `Find them! ${found}/${hiders}` : h.found[me] != null ? 'Found! 👻' : `Stay hidden… ${left}s`, sub: `${left}s left · round ${h.round + 1}/${h.rounds}` };
    return { text: h.phase === 'done' ? 'All done!' : `Round over — ${found}/${hiders} found` };
  }
  if (game === 'lava') { const l = w as LavaW; return { text: `${l.ps.filter((p) => p.alive).length} still standing`, sub: '🌋 keep moving!' }; }
  if (game === 'chairs') { const c = w as ChairW; return c.phase === 'music' ? { text: '🎶 Dance!', sub: `${c.ps.filter((p) => p.alive).length} dancers` } : c.phase === 'grab' ? { text: '🪑 GRAB A CHAIR!', hot: true } : { text: c.lost.length ? `${c.lost.map(name).join(', ')} ${c.lost.includes(me) ? 'are' : 'is'} out!` : '…' }; }
  return null;
}
