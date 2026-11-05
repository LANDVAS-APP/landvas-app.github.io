// A Live Arena match, full screen. The host's device runs the game (fixed 30 steps a second) and sends the world
// to everyone ~10 times a second; everyone else sends their stick + button when they change. When the game ends
// the host reports the result to the server, which pays everyone (tickets, a little Ink, squad boost).
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../backend/api';
import { getBackend, toGameError } from '../../backend/backend';
import type { ArenaMatch } from '../../backend/types';
import { cn } from '../../lib/utils';
import { Button, PlayerAvatar } from '../../ui';
import { sfx } from '../sfx';
import { LIVE_DEFS } from './games';
import { ARENA_GAMES, MODE_INFO, TEAM_COLORS, TEAM_NAMES, type Inp, type LP, type LiveResult } from './kit';

type Msg = { t: 's'; k: number; w: unknown } | { t: 'i'; id: string; i: Inp } | { t: 'end'; r: LiveResult };
const STEP = 1 / 30, SNAP_MS = 100, HOST_GONE_MS = 6000;

export function lpOf(m: ArenaMatch): LP[] {
  return [...m.players].sort((a, b) => (a.slot ?? 9) - (b.slot ?? 9)).map((p, i) => ({ id: p.id, slot: p.slot ?? i, team: p.team, name: `@${p.username}`, color: p.accent_color ?? '#fff' }));
}

export function LiveGame({ match, myId, onClose }: { match: ArenaMatch; myId: string; onClose(m: ArenaMatch | null): void }) {
  const def = LIVE_DEFS[match.game], info = ARENA_GAMES[match.game];
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef<Inp>({ x: 0, y: 0, b: false });
  const [phase, setPhase] = useState<'count' | 'play' | 'end' | 'gone'>('count');
  const [count, setCount] = useState(4);
  const [final, setFinal] = useState<ArenaMatch | null>(null);
  const [actionCd, setActionCd] = useState(false);
  const host = match.host === myId;

  useEffect(() => {
    if (!def) return;
    const backend = getBackend(), players = lpOf(match);
    const offset = Date.parse(match.server_time) - Date.now();
    const startAt = Date.parse(match.started_at ?? match.server_time) - offset;
    let w: any = def.init(players, match.seed ?? 1, match.mode); // eslint-disable-line @typescript-eslint/no-explicit-any
    let prev: any = null, gotAt = performance.now(), lastSnap = performance.now(), seq = 0, ended: LiveResult | null = null, stop = false; // eslint-disable-line @typescript-eslint/no-explicit-any
    const inputs: Record<string, Inp> = {};
    const render = def.renderer();
    const onMsg = (raw: unknown) => {
      const m = raw as Msg; if (!m || typeof m !== 'object') return;
      if (host && m.t === 'i' && players.some((p) => p.id === m.id)) inputs[m.id] = m.i;
      else if (!host && m.t === 's' && m.k > seq) { seq = m.k; prev = w; w = m.w; gotAt = performance.now(); lastSnap = gotAt; }
      else if (!host && m.t === 'end' && !ended) { ended = m.r; finish(); }
    };
    const ch = backend.liveChannel?.(`arena-m:${match.id}`, onMsg) ?? { send() {}, close() {} };

    // the end: the host reports (the server wants the game to have run a little while), everyone fetches the payout
    const finish = () => {
      setPhase('end'); sfx.jackpot?.();
      const poll = async (tries = 0) => {
        if (stop) return;
        try {
          const r = host ? await api.arenaReport(match.id, ended) : await api.arenaGet(match.id);
          if (r.status === 'done' || r.status === 'cancelled') { setFinal(r); return; }
        } catch (e) {
          if (host && toGameError(e).code !== 'game_too_fast' && tries > 3) { setFinal({ ...match, status: 'cancelled' }); return; }
        }
        setTimeout(() => void poll(tries + 1), 1500);
      };
      void poll();
    };

    // host: the simulation
    let acc = 0, last = performance.now(), raf = 0;
    const tick = () => {
      if (stop) return;
      const now = performance.now(), sinceStart = Date.now() - startAt;
      if (sinceStart < 0) setCount(Math.ceil(-sinceStart / 1000));
      else if (phaseRef.current === 'count') { phaseRef.current = 'play'; setPhase('play'); sfx.coin(); }
      if (host && sinceStart >= 0 && !ended) {
        acc += Math.min(0.25, (now - last) / 1000);
        inputs[myId] = input.current;
        while (acc >= STEP) { prev = null; def.step(w, inputs, STEP); acc -= STEP; const r = def.result(w); if (r) { ended = r; break; } }
        if (now - lastSnap >= SNAP_MS || ended) { lastSnap = now; seq++; ch.send({ t: 's', k: seq, w: def.snap ? def.snap(w) : w }); }
        if (ended) { ch.send({ t: 's', k: ++seq, w: def.snap ? def.snap(w) : w }); ch.send({ t: 'end', r: ended }); const r = ended; setTimeout(() => ch.send({ t: 'end', r }), 600); setTimeout(() => ch.send({ t: 'end', r }), 1800); finish(); }
      }
      if (!host && sinceStart > 1500 && !ended && now - lastSnap > HOST_GONE_MS) { ended = {}; setPhase('gone'); }
      last = now;
      // draw
      const c = canvas.current;
      if (c) {
        const dpr = Math.min(2, window.devicePixelRatio || 1), cw = c.clientWidth, chh = c.clientHeight;
        if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(chh * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(chh * dpr); }
        const g = c.getContext('2d')!;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const a = host ? 1 : Math.min(1, (now - gotAt) / SNAP_MS);
        try { render(g, cw, chh, w, prev, a, myId, now / 1000); } catch { /* a malformed snapshot: skip the frame */ }
      }
      (window as any).__arenaGame = { w, host, phase: phaseRef.current, ended, input: input.current }; // eslint-disable-line @typescript-eslint/no-explicit-any
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // guests: send the stick when it changes (and now and then anyway)
    let sentKey = '', sentAt = 0;
    const tx = setInterval(() => {
      if (host || ended || Date.now() < startAt - 300) return;
      const i = input.current, key = `${i.x.toFixed(1)},${i.y.toFixed(1)},${i.b}`, now = performance.now();
      if (key !== sentKey || now - sentAt > 1000) { sentKey = key; sentAt = now; ch.send({ t: 'i', id: myId, i: { x: +i.x.toFixed(2), y: +i.y.toFixed(2), b: i.b } }); }
    }, 100);
    return () => { stop = true; cancelAnimationFrame(raf); clearInterval(tx); ch.close(); delete (window as any).__arenaGame; }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }, [match.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const phaseRef = useRef(phase);

  // keyboard
  useEffect(() => {
    const keys = new Set<string>();
    const upd = () => {
      const x = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
      const y = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0);
      if (keys.size || stickOn.current === false) input.current = { x, y, b: keys.has(' ') };
    };
    const dn = (e: KeyboardEvent) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault(); keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key); upd(); };
    const up = (e: KeyboardEvent) => { keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); upd(); };
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);

  // the touch stick: drag anywhere on the play area
  const stickOn = useRef(false);
  const [stick, setStick] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const R = 56;
  const onDown = (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); stickOn.current = true; setStick({ ox: e.clientX, oy: e.clientY, x: 0, y: 0 }); };
  const onMove = (e: React.PointerEvent) => {
    if (!stick) return;
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const l = Math.hypot(dx, dy);
    if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
    setStick({ ...stick, x: dx, y: dy });
    input.current = { ...input.current, x: dx / R, y: def?.controls.stick === 'x' ? 0 : dy / R };
  };
  const onUp = () => { stickOn.current = false; setStick(null); input.current = { ...input.current, x: 0, y: 0 }; };
  const press = (b: boolean) => {
    input.current = { ...input.current, b };
    if (b) { setActionCd(true); setTimeout(() => setActionCd(false), 400); }
  };

  if (!def || !info) return null;
  const md = MODE_INFO[match.mode];
  return (
    <div className="fixed inset-0 z-[80] select-none bg-black text-white" data-testid="arena-game" style={{ touchAction: 'none' }}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 p-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-black" style={{ boxShadow: `inset 0 0 0 1.5px ${info.color}` }}>{info.emoji} {info.name} · {md.label}</span>
        {host && <span className="rounded-full bg-black/60 px-2 py-1 text-[10px] text-white/70">you're hosting</span>}
      </div>
      {stick && <div className="pointer-events-none absolute" style={{ left: stick.ox - R, top: stick.oy - R, width: R * 2, height: R * 2 }}>
        <div className="absolute inset-0 rounded-full border-2 border-white/30 bg-white/5" />
        <div className="absolute h-12 w-12 rounded-full bg-white/50" style={{ left: R - 24 + stick.x, top: R - 24 + stick.y }} />
      </div>}
      {def.controls.action && phase === 'play' && (
        <button className={cn('absolute bottom-8 right-6 grid h-24 w-24 place-items-center rounded-full text-sm font-black shadow-2xl transition-transform', actionCd ? 'scale-90' : '')}
          style={{ background: `radial-gradient(circle at 35% 30%, #fff8, ${info.color})`, boxShadow: `0 0 30px ${info.color}`, marginBottom: 'env(safe-area-inset-bottom)' }}
          onPointerDown={(e) => { e.stopPropagation(); press(true); }} onPointerUp={() => press(false)} onPointerLeave={() => press(false)} data-testid="arena-action">
          {def.controls.action}
        </button>
      )}
      {phase === 'play' && <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] text-white/60" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>{info.how}</p>}
      {phase === 'count' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40">
          <div className="grid justify-items-center gap-2 text-center">
            <div className="text-5xl">{info.emoji}</div>
            <div className="font-display text-2xl font-black">{info.name}</div>
            <div className="max-w-xs text-sm text-white/80">{info.how}</div>
            {match.mode === 'teams' && <div className="flex gap-3 text-xs">{[0, 1].map((t) => <span key={t} style={{ color: TEAM_COLORS[t] }}><b>{TEAM_NAMES[t]}:</b> {match.players.filter((p) => p.team === t).map((p) => p.id === myId ? 'You' : `@${p.username}`).join(' & ')}</span>)}</div>}
            <motion.div key={count} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-7xl font-black" style={{ color: info.color, textShadow: `0 0 30px ${info.color}` }}>{count}</motion.div>
          </div>
        </div>
      )}
      {phase === 'gone' && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 p-6 text-center">
          <div className="grid gap-3"><div className="text-4xl">📡</div><b>The host dropped out</b><p className="text-sm text-white/70">This game can't finish without them, so nobody is paid for it.</p><Button variant="rainbow" onClick={() => onClose(null)} data-testid="arena-close">Back to the arena</Button></div>
        </div>
      )}
      {phase === 'end' && <ArenaResults m={final} myId={myId} onClose={() => onClose(final)} />}
    </div>
  );
}

function ArenaResults({ m, myId, onClose }: { m: ArenaMatch | null; myId: string; onClose(): void }) {
  const me = m?.players.find((p) => p.id === myId);
  useEffect(() => { if (m?.status === 'done' && me?.place === 1) sfx.jackpot?.(); }, [m?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return <div className="absolute inset-0 grid place-items-center bg-black/60"><div className="lv-arc-marquee text-2xl">GAME OVER!</div></div>;
  if (m.status === 'cancelled') return <div className="absolute inset-0 grid place-items-center bg-black/70 p-6 text-center"><div className="grid gap-3"><b>That game didn't count</b><Button variant="rainbow" onClick={onClose} data-testid="arena-close">Back to the arena</Button></div></div>;
  const coop = m.mode === 'coop', teams = m.mode === 'teams';
  const win = teams ? m.result?.winner : null;
  const title = coop ? `${m.result?.waves ?? 0} WAVES HELD!` : teams ? (win == null ? 'DRAW!' : me?.team === win ? '★ YOUR TEAM WINS! ★' : `${TEAM_NAMES[win]} wins`) : me?.place === 1 ? '★ YOU WIN! ★' : `@${[...m.players].sort((a, b) => (a.place ?? 9) - (b.place ?? 9))[0]?.username} WINS`;
  const rows = [...m.players].sort((a, b) => (a.place ?? 9) - (b.place ?? 9) || (a.slot ?? 0) - (b.slot ?? 0));
  const boost = m.result?.boost ?? 1;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 grid place-items-center bg-black/75 p-6" data-testid="arena-results">
      <div className="grid w-full max-w-sm justify-items-center gap-3">
        <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="lv-arc-marquee text-center text-2xl" style={{ ['--glow' as string]: me?.place === 1 ? '#FFD84D' : '#22E3FF' }}>{title}</motion.div>
        <div className="grid w-full gap-1.5">
          {rows.map((p) => (
            <div key={p.id} className={cn('flex items-center gap-2 rounded-xl px-2 py-2 text-sm', p.id === myId ? 'bg-white/20' : 'bg-white/10')} style={teams && p.team != null ? { boxShadow: `inset 3px 0 0 ${TEAM_COLORS[p.team]}` } : undefined}>
              {!coop && <b className={cn('w-5 text-center', p.place === 1 ? 'text-[#FFD84D]' : 'text-white/60')}>{p.place === 1 ? '👑' : p.place}</b>}
              <PlayerAvatar p={p} size={24} /><span className="min-w-0 flex-1 truncate font-bold">{p.id === myId ? 'You' : `@${p.username}`}</span>
              <span className="lv-arc-ticket text-[11px]" data-testid="arena-tickets">+{p.tickets} 🎟️</span>
              {p.ink > 0 && <span className="text-[11px] font-black text-[#B6FF3D]">+{Number(p.ink).toFixed(2)} 💧</span>}
            </div>
          ))}
        </div>
        {boost > 1 && <p className="text-[11px] text-[#3DDC97]" data-testid="arena-boost">🔥 Squad of {m.result?.players}: +{Math.round((boost - 1) * 100)}% tickets & Ink</p>}
        <Button variant="rainbow" onClick={onClose} data-testid="arena-close">Back to the arena</Button>
      </div>
    </motion.div>
  );
}
