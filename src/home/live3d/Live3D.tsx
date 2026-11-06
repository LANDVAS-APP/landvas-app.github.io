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
import { LAVA, SIMS3, snap3, type ChairW, type HSW, type In3, type LavaW, type P3, type TagW, type W3 } from './sims';
import { createWorld3D, type World3D } from './worlds';

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
const STEP = 1 / 30, SNAP_MS = 80, GONE_MS = 7000, DELAY = 0.11;
type Msg = { t: 's'; k: number; w: W3 } | { t: 'i'; id: string; i: In3 } | { t: 'end'; r: Record<string, number> };
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
    // host: the real world, stepped 30 times a second (and the one before the last step, to draw smoothly between)
    let w: W3 = base, hostPrev: W3 | null = null;
    // guests: the snapshots so far (drawn a tenth of a second behind, so there's always one either side), your
    // own explorer moved on your device straight away, and how far that's drifted from what the host says
    const buf: { t: number; w: W3 }[] = [{ t: 0, w: base }];
    let clock = NaN, mine: P3 | null = null, fixX = 0, fixZ = 0;
    let lastSnap = 0, seq = 0, ended: Record<string, number> | null = null, stop = false, acc = 0, last = performance.now(), raf = 0, hudAt = 0;
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
    const onSnap = (sw: W3) => {
      const now = performance.now() / 1000, nw: W3 = { ...sw, obs: base.obs };
      // the host's clock, as seen here: snapshots that arrive quickly pull it in straight away, slow ones only a little
      const off = now - nw.t; clock = Number.isNaN(clock) || off < clock ? off : clock + (off - clock) * 0.02;
      buf.push({ t: nw.t, w: nw }); while (buf.length > 12) buf.shift();
      w = nw; lastSnap = performance.now();
      // your own explorer: keep the one moved here, unless the host disagrees by a lot (bumped, tagged, round reset, fell)
      const S = nw.ps.find((p) => p.id === myId);
      if (S) {
        if (!mine) mine = { ...S };
        const ex = S.x - mine.x, ez = S.z - mine.z, err = Math.hypot(ex, ez), sp = Math.hypot(S.vx, S.vz);
        const big = err > 3.5 || Math.abs(S.y - mine.y) > 1.6 || !S.alive || S.alive !== mine.alive || (S.stun > 0.2 && mine.stun <= 0) || S.dash > mine.dash + 0.1;
        if (big) { if (err < 3.5) { fixX += mine.x - S.x; fixZ += mine.z - S.z; } else fixX = fixZ = 0; mine = { ...S }; }
        else {
          // nudge towards the host (more when standing still, when there's no excuse for being apart)
          const k = err > 0.3 + sp * 0.18 ? 0.25 : 0.06;
          mine.x += ex * k; mine.z += ez * k; fixX -= ex * k; fixZ -= ez * k;
          Object.assign(mine, { alive: S.alive, outAt: S.outAt });
        }
      }
    };
    const onMsg = (raw: unknown) => {
      const m = raw as Msg; if (!m || typeof m !== 'object') return;
      if (host && m.t === 'i' && ids.includes(m.id)) inputs[m.id] = m.i;
      else if (!host && m.t === 's' && m.k > seq) { seq = m.k; onSnap(m.w); }
      else if (!host && m.t === 'end' && !ended) { ended = m.r; finish(); }
    };
    const ch = backend.liveChannel?.(`hg:${game.id}`, onMsg) ?? { send() {}, close() {} };
    const tick = () => {
      if (stop) return;
      raf = requestAnimationFrame(tick);
      const now = performance.now(), since = Date.now() - startAt, dtF = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (since < 0) setCount(Math.ceil(-since / 1000));
      else if (phaseRef.current === 'count') { phaseRef.current = 'play'; setPhase('play'); sfx.coin(); }
      let view: W3 = w;
      if (host) {
        if (since >= 0 && !ended) {
          acc += dtF;
          inputs[myId] = input.current;
          while (acc >= STEP) { hostPrev = { ...w, ps: w.ps.map((p) => ({ ...p })) }; sim.step(w, inputs, STEP); acc -= STEP; const r = sim.result(w); if (r) { ended = r; break; } }
          if (now - lastSnap >= SNAP_MS || ended) { lastSnap = now; ch.send({ t: 's', k: ++seq, w: snap3(w) }); }
          if (ended) { const r = ended; ch.send({ t: 'end', r }); setTimeout(() => ch.send({ t: 'end', r }), 700); setTimeout(() => ch.send({ t: 'end', r }), 1800); finish(); }
        }
        view = hostPrev && !ended ? blend(hostPrev, w, Math.min(1, acc / STEP)) : w;
      } else {
        // everyone else: drawn a moment in the past, between the two snapshots either side
        const rt = Number.isNaN(clock) ? 0 : now / 1000 - clock - DELAY;
        let a = buf[0], b = buf[buf.length - 1];
        for (let i = buf.length - 1; i > 0; i--) if (buf[i - 1].t <= rt) { a = buf[i - 1]; b = buf[i]; break; }
        view = rt >= b.t || a === b ? b.w : blend(a.w, b.w, Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t || 1))));
        // you: moved here, right away
        if (mine && since >= 0 && !ended) {
          acc += dtF;
          const live = w;
          while (acc >= STEP) { sim.move(live, mine, input.current, STEP); acc -= STEP; }
          fixX *= Math.pow(0.002, dtF); fixZ *= Math.pow(0.002, dtF);
        }
        if (mine) { const me = mine; view = { ...view, ps: view.ps.map((p) => (p.id === myId ? { ...p, x: me.x + fixX, z: me.z + fixZ, y: me.y, face: me.face, on: me.on, alive: p.alive } : p)) }; }
      }
      if (!host && since > 2500 && !ended && now - lastSnap > GONE_MS) { ended = {}; setPhase('gone'); }
      world.frame(view, now / 1000, since < 0 ? Math.min(1, -since / 4000) : 0);
      if (now - hudAt > 150) { hudAt = now; setHud(view); }
      (window as unknown as { __live3d: unknown }).__live3d = { w, host, input: input.current };
    };
    raf = requestAnimationFrame(tick);
    // guests: send the stick when it changes (rounded, so a steady stick sends nothing new)
    let sentKey = '', sentAt = 0;
    const tx = setInterval(() => {
      if (host || ended || Date.now() < startAt - 300) return;
      const i = quant(input.current), key = `${i.x},${i.y},${i.b}`, n = performance.now();
      if (key !== sentKey || n - sentAt > 1000) { sentKey = key; sentAt = n; ch.send({ t: 'i', id: myId, i }); }
    }, 50);
    return () => { stop = true; cancelAnimationFrame(raf); clearInterval(tx); ch.close(); world.dispose(); delete (window as unknown as { __live3d?: unknown }).__live3d; };
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
  if (game === 'lava') { const l = w as LavaW, rising = l.t > LAVA.RISE_AT, soon = !rising && l.t > LAVA.RISE_AT - 8; return { text: `${l.ps.filter((p) => p.alive).length} still standing`, sub: rising ? '🌋 THE LAVA IS RISING!' : soon ? `🌋 lava rises in ${Math.ceil(LAVA.RISE_AT - l.t)}s` : '🌋 keep moving!', hot: rising || soon }; }
  if (game === 'chairs') { const c = w as ChairW; return c.phase === 'music' ? { text: '🎶 Dance!', sub: `${c.ps.filter((p) => p.alive).length} dancers` } : c.phase === 'grab' ? { text: '🪑 GRAB A CHAIR!', hot: true } : { text: c.lost.length ? `${c.lost.map(name).join(', ')} ${c.lost.includes(me) ? 'are' : 'is'} out!` : '…' }; }
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
  return { track: null, tempo: 1, heat: 0 };
}
