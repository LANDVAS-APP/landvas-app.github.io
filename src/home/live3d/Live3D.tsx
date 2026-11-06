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
import { LAVA, SIMS3, paintCounts, snap3, type ChairW, type GemW, type HSW, type In3, type LavaW, type P3, type PaintW, type RLW, type SnowW, type SumoW, type TagW, type W3 } from './sims';
import { createWorld3D, type World3D } from './worlds';

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
const STEP = 1 / 30, SNAP_MS = 100, DELAY = 0.14;
// the host going quiet: after QUIET_MS the next player in line asks to take over (the server lets them once the host
// has missed its pings for a few seconds); after LOST_MS with nobody running it, we stop waiting
const QUIET_MS = 2500, LOST_MS = 30000, PING_MS = 2000, DROP_MS = 8000;
type Msg = { t: 's'; e?: number; k: number; h?: string; w: W3 } | { t: 'i'; id: string; i: In3 } | { t: 'end'; r: Record<string, number> };
/** a steady tick from a worker: keeps the host's game running even when its tab is in the background */
function workerTicker(ms: number, f: () => void) {
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms});`], { type: 'text/javascript' }));
    const wk = new Worker(url); wk.onmessage = f;
    return () => { wk.terminate(); URL.revokeObjectURL(url); };
  } catch { const t = setInterval(f, ms); return () => clearInterval(t); }
}
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpAng = (a: number, b: number, k: number) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
/** a world to draw, with everyone's position blended between two moments */
function blend(a: W3, b: W3, k: number): W3 {
  return { ...b, ps: b.ps.map((q) => { const p = a.ps.find((x) => x.id === q.id); return p ? { ...q, x: lerp(p.x, q.x, k), z: lerp(p.z, q.z, k), y: lerp(p.y, q.y, k), face: lerpAng(p.face, q.face, k) } : q; }) };
}
/** sticks are rounded to 16 directions and 3 speeds, so holding one steady sends nothing */
const quant = (i: In3): In3 => { const l = Math.min(1, Math.hypot(i.x, i.y)); if (l < 0.2) return { x: 0, y: 0, b: i.b }; const a = Math.round(Math.atan2(i.y, i.x) / (Math.PI / 8)) * (Math.PI / 8), m = l > 0.75 ? 1 : 0.55; return { x: Math.round(Math.cos(a) * m * 100) / 100, y: Math.round(Math.sin(a) * m * 100) / 100, b: i.b }; };

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
  const [note, setNote] = useState<string | null>(null);
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
      canvas: cv.current, game: game.game, me: myId, world: base, reduceMotion: reduce,
      seats: seats.map((s) => ({ id: s.id, name: s.name, color: s.color, url: svgUrl(explorerSvg((game.players.find((p) => p.id === s.id) as { explorer_style?: ExplorerStyle } | undefined)?.explorer_style, s.p.accent_color ?? s.color, 184)) })),
    });
    // who's running the game right now (it can change hands if the host drops out), and which hand-over we're on
    let amHost = game.host === myId, hostId = game.host, epoch = 0;
    // host: the real world, stepped 30 times a second (and the one before the last step, to draw smoothly between)
    let w: W3 = base, hostPrev: W3 | null = null;
    // guests: the snapshots so far (drawn a moment behind, so there's always one either side), your own explorer
    // moved on your device straight away, and how far that's drifted from what the host says
    const buf: { t: number; w: W3 }[] = [{ t: 0, w: base }];
    let clock = NaN, mine: P3 | null = null, fixX = 0, fixZ = 0;
    let lastSnap = performance.now() + Math.max(0, startAt - Date.now()), lastSent = 0, seq = 0, ended: Record<string, number> | null = null, stop = false;
    let waiting = false, acc = 0, accG = 0, hostLast = performance.now(), last = performance.now(), raf = 0, hudAt = 0, tryAt = 0, trying = false;
    const inputs: Record<string, In3> = {}, heard: Record<string, number> = {}, dropped = new Set<string>();
    for (const id of ids) heard[id] = lastSnap;
    const finish = () => {
      setPhase('end'); sfx.jackpot?.();
      const poll = async (tries = 0) => {
        if (stop) return;
        try { const r = amHost && ended && Object.keys(ended).length ? await api.homeGameReport(game.id, ended) : await api.homeGameGet(game.id); if (r.status === 'done' || r.status === 'cancelled') { setFinal(r); return; } }
        catch (e) { const c = toGameError(e).code; if (c === 'not_host') amHost = false; else if (amHost && c !== 'game_too_fast' && tries > 5) { setFinal({ ...game, status: 'cancelled' }); return; } }
        setTimeout(() => void poll(tries + 1), 1500);
      };
      void poll();
    };
    const onSnap = (m: Extract<Msg, { t: 's' }>) => {
      const e = m.e ?? 0;
      if (m.h === myId || e < epoch || (e === epoch && m.k <= seq)) return;
      // someone else is running it now (we were away, or there was a hand-over)
      if (amHost) { amHost = false; inCh?.close(); inCh = null; mine = null; }
      if (e > epoch || (m.h && m.h !== hostId)) { epoch = e; hostId = m.h ?? hostId; setNote(null); }
      seq = m.k;
      if (waiting) { waiting = false; setNote(null); }
      const now = performance.now() / 1000, nw: W3 = { ...m.w, obs: base.obs };
      // the host's clock, as seen here: snapshots that arrive quickly pull it in straight away, slow ones only a little
      const off = now - nw.t; clock = Number.isNaN(clock) || off < clock ? off : clock + (off - clock) * 0.02;
      buf.push({ t: nw.t, w: nw }); while (buf.length > 12) buf.shift();
      w = nw; lastSnap = performance.now();
      const S = nw.ps.find((p) => p.id === myId);
      if (S) {
        if (!mine) mine = { ...S };
        const ex = S.x - mine.x, ez = S.z - mine.z, err = Math.hypot(ex, ez), sp = Math.hypot(S.vx, S.vz);
        const big = err > 3.5 || Math.abs(S.y - mine.y) > 1.6 || !S.alive || S.alive !== mine.alive || (S.stun > 0.2 && mine.stun <= 0) || S.dash > mine.dash + 0.1;
        if (big) { if (err < 3.5) { fixX += mine.x - S.x; fixZ += mine.z - S.z; } else fixX = fixZ = 0; mine = { ...S }; }
        else {
          const k = err > 0.3 + sp * 0.18 ? 0.25 : 0.06;
          mine.x += ex * k; mine.z += ez * k; fixX -= ex * k; fixZ -= ez * k;
          Object.assign(mine, { alive: S.alive, outAt: S.outAt });
        }
      }
    };
    const onMsg = (raw: unknown) => {
      const m = raw as Msg; if (!m || typeof m !== 'object') return;
      if (m.t === 'i') { if (amHost && ids.includes(m.id)) { inputs[m.id] = m.i; heard[m.id] = performance.now(); if (!sim.knockout) dropped.delete(m.id); } }
      else if (m.t === 's') onSnap(m);
      else if (m.t === 'end' && !ended) { ended = m.r; finish(); }
    };
    const ch = backend.liveChannel?.(`hg:${game.id}`, onMsg) ?? { send() {}, close() {} };
    // the host listens for sticks on a channel of their own, so guests don't all get each other's sticks too
    let inCh: { close(): void } | null = null;
    const listenInputs = () => { inCh ??= backend.liveChannel?.(`hgi:${game.id}`, onMsg) ?? null; };
    if (amHost) listenInputs();

    const takeOver = (oldHost: string) => {
      amHost = true; hostId = myId; epoch += 1; seq = 0; acc = 0; hostPrev = null; hostLast = performance.now();
      w = { ...w, obs: base.obs, ps: w.ps.map((p) => ({ ...p })) };
      const me = w.ps.find((p) => p.id === myId); if (me && mine) Object.assign(me, { x: mine.x, z: mine.z, y: mine.y, vx: mine.vx, vz: mine.vz, vy: mine.vy, face: mine.face, on: mine.on });
      const now = performance.now(); for (const id of ids) heard[id] = now; heard[oldHost] = 0;
      listenInputs();
      waiting = false; setNote('📡 The host dropped out — the game carries on with you running it'); setTimeout(() => setNote(null), 5000);
    };

    // the host's game loop (on a worker tick, so it keeps going in a background tab)
    const hostStep = () => {
      if (!amHost || ended || stop) return;
      const now = performance.now(), since = Date.now() - startAt, dt = Math.min(0.25, (now - hostLast) / 1000); hostLast = now;
      if (since < 0) return;
      acc += dt;
      inputs[myId] = input.current; heard[myId] = now;
      // anyone we haven't heard from in a while has gone: they stand still (or, in a knock-out game, they're out)
      for (const id of ids) if (id !== myId && now - (heard[id] ?? 0) > DROP_MS && !dropped.has(id)) {
        dropped.add(id); inputs[id] = { x: 0, y: 0, b: false };
        if (sim.knockout) { const p = w.ps.find((q) => q.id === id); if (p?.alive) { p.alive = false; p.outAt = w.t; } }
      }
      while (acc >= STEP) { hostPrev = { ...w, ps: w.ps.map((p) => ({ ...p })) }; sim.step(w, inputs, STEP); acc -= STEP; const r = sim.result(w); if (r) { ended = r; break; } }
      // nobody left to play with: it ends now, places as they stand (and the Ink's paid)
      if (!ended && ids.length > 1 && ids.every((id) => id === myId || dropped.has(id))) ended = sim.standings(w);
      if (now - lastSent >= SNAP_MS || ended) { lastSent = now; ch.send({ t: 's', e: epoch, k: ++seq, h: myId, w: snap3(w) }); }
      if (ended) { const r = ended; ch.send({ t: 'end', r }); setTimeout(() => ch.send({ t: 'end', r }), 700); setTimeout(() => ch.send({ t: 'end', r }), 1800); finish(); }
    };
    const stopTicker = workerTicker(1000 / 30, hostStep);
    // the host says it's still here; if someone else has taken over meanwhile, it steps down
    const pinger = setInterval(() => {
      if (!amHost || ended || stop) return;
      api.homeGamePing(game.id).then((r) => { if (r.host && r.host !== myId && amHost) { amHost = false; inCh?.close(); inCh = null; mine = null; lastSnap = performance.now(); } }).catch(() => {});
    }, PING_MS);

    const tick = () => {
      if (stop) return;
      raf = requestAnimationFrame(tick);
      const now = performance.now(), since = Date.now() - startAt, dtF = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (since < 0) setCount(Math.ceil(-since / 1000));
      else if (phaseRef.current === 'count') { phaseRef.current = 'play'; setPhase('play'); sfx.coin(); }
      let view: W3 = w;
      if (amHost) {
        hostStep();
        view = hostPrev && !ended ? blend(hostPrev, w, Math.min(1, acc / STEP)) : w;
      } else {
        // everyone else: drawn a moment in the past, between the two snapshots either side
        const rt = Number.isNaN(clock) ? 0 : now / 1000 - clock - DELAY;
        let a = buf[0], b = buf[buf.length - 1];
        for (let i = buf.length - 1; i > 0; i--) if (buf[i - 1].t <= rt) { a = buf[i - 1]; b = buf[i]; break; }
        view = rt >= b.t || a === b ? b.w : blend(a.w, b.w, Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t || 1))));
        // you: moved here, right away
        if (mine && since >= 0 && !ended) {
          accG += dtF;
          while (accG >= STEP) { sim.move(w, mine, input.current, STEP); accG -= STEP; }
          fixX *= Math.pow(0.002, dtF); fixZ *= Math.pow(0.002, dtF);
        }
        if (mine) { const me = mine; view = { ...view, ps: view.ps.map((p) => (p.id === myId ? { ...p, x: me.x + fixX, z: me.z + fixZ, y: me.y, face: me.face, on: me.on, alive: p.alive } : p)) }; }
        // the host's gone quiet: the next one in line offers to take over
        const quiet = now - lastSnap;
        if (since > 1500 && !ended) {
          const line = ids.filter((id) => id !== hostId), rank = Math.max(0, line.indexOf(myId));
          if (quiet > 1800 && !waiting) { waiting = true; setNote('📡 Waiting for the host…'); }
          if (quiet > QUIET_MS + rank * 1500 && !trying && now - tryAt > 1500) {
            trying = true; tryAt = now;
            const oldHost = hostId;
            api.homeGameTakeover(game.id)
              .then((g) => { trying = false; if (!stop && !ended && g.host === myId && !amHost && performance.now() - lastSnap > QUIET_MS) takeOver(oldHost); })
              .catch((e) => { trying = false; if (toGameError(e).code === 'match_closed' && !ended) { ended = {}; finish(); } });
          }
          if (quiet > LOST_MS) { ended = {}; setPhase('gone'); void (async () => { for (let k = 0; k < 40 && !stop; k++) { try { const r = await api.homeGameGet(game.id); if (r.status === 'done' || r.status === 'cancelled') { setFinal(r); setPhase('end'); return; } } catch { /* keep trying */ } await new Promise((res) => setTimeout(res, 3000)); } })(); }
        }
      }
      world.frame(view, now / 1000, since < 0 ? Math.min(1, -since / 4000) : 0);
      if (now - hudAt > 150) { hudAt = now; setHud(view); }
      (window as unknown as { __live3d: unknown }).__live3d = { w, host: amHost, input: input.current, epoch };
    };
    raf = requestAnimationFrame(tick);
    // guests: send the stick to the host when it changes (rounded, so a steady stick sends nothing new), and a
    // little "still here" every second
    let sentKey = '', sentAt = 0, viaMain = !backend.liveSend;
    const send = (m: Msg) => { if (viaMain) { ch.send(m); return; } void backend.liveSend!(`hgi:${game.id}`, m).then((ok) => { if (!ok) { viaMain = true; ch.send(m); } }); };
    const tx = setInterval(() => {
      if (amHost || ended || Date.now() < startAt - 300) return;
      const i = quant(input.current), key = `${i.x},${i.y},${i.b}`, n = performance.now();
      if ((key !== sentKey && n - sentAt >= 90) || n - sentAt > 1000) { sentKey = key; sentAt = n; send({ t: 'i', id: myId, i }); }
    }, 45);
    return () => { stop = true; cancelAnimationFrame(raf); clearInterval(tx); clearInterval(pinger); stopTicker(); ch.close(); inCh?.close(); world.dispose(); delete (window as unknown as { __live3d?: unknown }).__live3d; };
  }, [game.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // the soundtrack: a chase for tag, tiptoeing then a dark lantern theme for hide & seek, a rumble for the lava,
  // and the ballroom band (which stops dead when it's time to grab a chair). It speeds up near the end, and you
  // hear your heart pound when someone's coming for you.
  const before = useRef(music.nowPlaying);
  const sound = soundtrack(game.game, hud, myId);
  useEffect(() => { if (phase === 'end' || phase === 'gone') { music.stop(); return; } if (sound.track) music.play(sound.track, false); else music.stop(); }, [sound.track, phase]);
  useEffect(() => { music.setTempo(sound.tempo); music.setHeat(sound.heat); }, [sound.tempo, sound.heat]);
  const prevChairs = useRef<string | null>(null);
  useEffect(() => { const ph = game.game === 'chairs' ? (hud as ChairW | null)?.phase ?? null : null; if (ph === 'grab' && prevChairs.current === 'music') sfx.fail(); prevChairs.current = ph; }, [hud, game.game]);
  useEffect(() => () => { music.stop(); if (before.current) music.play(before.current, false); }, []);

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
      {note && phase === 'play' && <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center" data-testid="live3d-note"><span className="rounded-full bg-black/70 px-4 py-2 text-xs font-bold">{note}</span></div>}
      {phase === 'gone' && <div className="absolute inset-0 grid place-items-center bg-black/75 p-6 text-center"><div className="grid gap-3"><div className="text-4xl">📡</div><b>Lost the connection to this game</b><span className="text-sm text-white/70">If it finishes, your places and Ink still count.</span><Button variant="rainbow" onClick={onClose}>Back to the house</Button></div></div>}
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
  if (game === 'lava') { const l = w as LavaW, rising = l.t > LAVA.RISE_AT, soon = !rising && l.t > LAVA.RISE_AT - 8; return { text: `${l.ps.filter((p) => p.alive).length} still standing`, sub: rising ? '🌋 THE LAVA IS RISING!' : soon ? `🌋 lava rises in ${Math.ceil(LAVA.RISE_AT - l.t)}s` : '🌋 keep moving!', hot: rising || soon }; }
  if (game === 'chairs') { const c = w as ChairW; return c.phase === 'music' ? { text: '🎶 Dance!', sub: `${c.ps.filter((p) => p.alive).length} dancers` } : c.phase === 'grab' ? { text: '🪑 GRAB A CHAIR!', hot: true } : { text: c.lost.length ? `${c.lost.map(name).join(', ')} ${c.lost.includes(me) ? 'are' : 'is'} out!` : '…' }; }
  const lead = (pts: Record<string, number>) => { const [id, v] = Object.entries(pts).sort((a, b) => b[1] - a[1])[0] ?? ['', 0]; return !v ? 'nobody’s scored yet' : id === me ? 'you’re winning!' : `${name(id)} leads with ${v}`; };
  if (game === 'sumo') { const s = w as SumoW, meP = w.ps.find((p) => p.id === me), edge = meP?.alive && Math.hypot(meP.x, meP.z) > s.ice - 1.3; return { text: `${w.ps.filter((p) => p.alive).length} on the ice`, sub: edge ? '⚠️ you’re near the edge!' : w.t > 8 ? '🧊 the iceberg’s melting…' : '💥 bump them off!', hot: !!edge }; }
  if (game === 'paint') { const p = w as PaintW, c = paintCounts(p), tot = p.G * p.G, left = Math.max(0, Math.ceil(p.dur - p.t)); const pct = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round((v / tot) * 100)])); return { text: `🎨 You: ${pct[me] ?? 0}%`, sub: `${left}s · ${lead(pct)}`, hot: left <= 10 }; }
  if (game === 'snow') { const s = w as SnowW, left = Math.max(0, Math.ceil(s.dur - s.t)); return { text: `❄️ ${s.hits[me] ?? 0} hits`, sub: `${left}s · ${lead(s.hits)}`, hot: (w.ps.find((p) => p.id === me)?.stun ?? 0) > 0 }; }
  if (game === 'redlight') {
    const r = w as RLW, meP = w.ps.find((p) => p.id === me), fin = r.done[me] != null;
    const place = fin ? Object.values(r.done).filter((t) => t <= r.done[me]).length : 0, togo = meP ? Math.max(0, Math.round(meP.z + (r.HZ ?? 30) - 3)) : 0;
    if (fin) return { text: `🏁 Finished #${place}!`, sub: `${Object.keys(r.done).length}/${w.ps.length} across` };
    if ((meP?.stun ?? 0) > 0.3 && r.light === 'red') return { text: '😱 CAUGHT! Back you go', hot: true };
    return r.light === 'green' ? { text: '🟢 GO GO GO!', sub: `${togo}m to go` } : r.light === 'yellow' ? { text: '🟡 Get ready to stop…', sub: `${togo}m to go`, hot: true } : { text: '🔴 FREEZE!', sub: 'don’t move a muscle', hot: true };
  }
  if (game === 'gems') { const g = w as GemW, left = Math.max(0, Math.ceil(g.dur - g.t)); return { text: `💎 ${g.bag[me] ?? 0}`, sub: `${left}s · ${lead(g.bag)}`, hot: left <= 10 }; }
  return null;
}

/** which tune, how fast, and how hot (0..1: more drums, then a heartbeat) */
function soundtrack(game: string, w: W3 | null, me: string): { track: string | null; tempo: number; heat: number } {
  if (!w) return { track: null, tempo: 1, heat: 0 };
  const meP = w.ps.find((p) => p.id === me);
  const near = (id: string) => { const o = w.ps.find((p) => p.id === id); return o && meP ? Math.hypot(o.x - meP.x, o.z - meP.z) : 99; };
  const q = (x: number) => Math.round(x * 4) / 4; // only change in steps, so the music isn't fiddled with every frame
  if (game === 'tag') {
    const t = w as TagW, left = t.dur - t.t, d = t.it === me ? 99 : near(t.it);
    return { track: 'chase', tempo: left < 15 ? 1.15 : 1, heat: q(t.it === me ? 0.45 : d < 4 ? 1 : d < 8 ? 0.5 : 0) };
  }
  if (game === 'hide') {
    const h = w as HSW, left = h.ends - h.t;
    if (h.phase === 'hide') return { track: 'sneak', tempo: left < 5 ? 1.15 : 1, heat: 0 };
    if (h.phase === 'seek') {
      if (h.seeker === me) return { track: 'stalk', tempo: left < 15 ? 1.2 : 1, heat: left < 15 ? 0.5 : 0.25 };
      const d = h.found[me] != null ? 99 : near(h.seeker);
      return { track: 'stalk', tempo: left < 15 ? 1.2 : 1, heat: q(d < 4 ? 1 : d < 8 ? 0.75 : d < 12 ? 0.4 : 0) };
    }
    return { track: 'sneak', tempo: 0.9, heat: 0 };
  }
  if (game === 'lava') {
    const l = w as LavaW, out = l.ps.filter((p) => !p.alive).length / Math.max(1, l.ps.length);
    return { track: 'magma', tempo: q(1 + out * 0.2 + (l.t > LAVA.RISE_AT ? 0.1 : 0)), heat: l.t > LAVA.RISE_AT ? 0.5 : 0 };
  }
  if (game === 'chairs') { const c = w as ChairW; return { track: c.phase === 'music' ? (c.round % 2 ? 'swing' : 'disco') : null, tempo: 1 + Math.min(0.25, c.round * 0.06), heat: 0 }; }
  if (game === 'sumo') { const s = w as SumoW, edge = meP?.alive ? Math.hypot(meP.x, meP.z) - s.ice : -9; return { track: 'frost', tempo: q(1 + Math.min(0.25, Math.max(0, s.R0 - s.ice) * 0.05)), heat: edge > -1.3 ? 0.8 : 0 }; }
  if (game === 'paint') { const p = w as PaintW; return { track: 'splat', tempo: p.dur - p.t < 15 ? 1.15 : 1, heat: p.dur - p.t < 15 ? 0.45 : 0 }; }
  if (game === 'snow') { const s = w as SnowW; return { track: 'jingle', tempo: s.dur - s.t < 15 ? 1.15 : 1, heat: 0 }; }
  // the doll sings while you can run, and goes silent when she turns round
  if (game === 'redlight') { const r = w as RLW; return { track: r.light === 'red' ? null : 'doll', tempo: r.light === 'yellow' ? 1.5 : 1 + Math.min(0.3, r.k * 0.03), heat: 0 }; }
  if (game === 'gems') { const g = w as GemW; return { track: 'shanty', tempo: g.dur - g.t < 15 ? 1.15 : 1, heat: 0 }; }
  return { track: null, tempo: 1, heat: 0 };
}
