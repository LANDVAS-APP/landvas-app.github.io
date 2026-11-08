// Arcades together: a live room of up to 10 visitors (you see each other walking about), and matches on any
// cabinet for 2-4 players in the room. Versus: everyone plays the same round at the same time, top score wins
// bonus tickets. Team: same round, scores add up toward a shared target, and everyone gets the bonus.
// The heartbeat (every few seconds) keeps your place in the room, lists the open lobbies and your match;
// positions and live scores stream over the room's realtime channel in between.
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import type { Arcade, ArcadeLive, ArcadeMatch, ExplorerStyle } from '../backend/types';
import { explorerSvg } from '../explorer/character';
import { cn } from '../lib/utils';
import { Button, PlayerAvatar } from '../ui';
import type { HallScene } from './hall3d';
import { sfx } from './sfx';

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
type Msg = { t: 'pos'; id: string; x: number; z: number; f: number; p: string | null } | { t: 'score'; m: string; id: string; s: number };

export function useArcadeLive(opts: { arcadeId: string; myId: string | undefined; hall: React.RefObject<HallScene | null>; playing: string | null }) {
  const [live, setLive] = useState<ArcadeLive | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({}); // live scores in your match, by player
  const ref = useRef(opts); ref.current = opts;
  const send = useRef<((m: Msg) => void) | null>(null);
  const beatNow = useRef<() => void>(() => {});
  useEffect(() => {
    if (!opts.myId) return;
    const backend = getBackend(), myId = opts.myId, arcade = opts.arcadeId;
    let stopped = false, ch: { send(m: unknown): void; close(): void } | null = null, chName = '', members = new Set<string>();
    const urls = new Map<string, string>();
    let soon: ReturnType<typeof setTimeout> | null = null;
    const onMsg = (raw: unknown) => {
      const m = raw as Msg;
      if (!m || !('id' in m)) return;
      // someone new is here: fetch the room's list now rather than at the next check-in
      if (!members.has(m.id)) { if (m.id !== myId && !soon) soon = setTimeout(() => { soon = null; void beat(); }, 600); return; }
      if (m.t === 'pos') ref.current.hall.current?.moveOther(m.id, m.x, m.z, m.f, m.p);
      else if (m.t === 'score') setScores((s) => (s[m.id] === m.s ? s : { ...s, [m.id]: m.s }));
    };
    const beat = async () => {
      if (stopped || document.hidden) return;
      const pose = ref.current.hall.current?.pose();
      try {
        const r = await api.arcadeLive(arcade, pose?.x ?? null, pose?.z ?? null, ref.current.playing);
        if (stopped) return;
        members = new Set(r.members.map((m) => m.id));
        ref.current.hall.current?.setOthers(r.members.map((m) => {
          let u = urls.get(m.id);
          if (!u) { u = svgUrl(explorerSvg(m.explorer_style as ExplorerStyle | undefined, m.accent_color ?? '#7B5CFF', 184)); urls.set(m.id, u); }
          return { id: m.id, url: u, name: `@${m.username}`, x: m.x, z: m.z, playing: m.playing };
        }));
        if (r.channel !== chName) { ch?.close(); chName = r.channel; ch = backend.liveChannel?.(r.channel, onMsg) ?? null; }
        setLive(r);
      } catch { /* try again next beat */ }
    };
    beatNow.current = () => void beat();
    send.current = (m) => ch?.send(m);
    void beat();
    // a check-in keeps you in the room (each one is a database write); moves themselves go over the live channel
    const hb = setInterval(() => void beat(), backend.mode === 'local' ? 1000 : 5000);
    let lastKey = '', lastAt = 0;
    const tx = setInterval(() => {
      const p = ref.current.hall.current?.pose(); if (!p || !ch) return;
      const key = `${p.x.toFixed(2)},${p.z.toFixed(2)},${p.face},${ref.current.playing ?? ''}`, now = performance.now();
      if (key !== lastKey || now - lastAt > 1500) { lastKey = key; lastAt = now; ch.send({ t: 'pos', id: myId, x: p.x, z: p.z, f: p.face, p: ref.current.playing }); }
    }, 120);
    return () => { stopped = true; if (soon) clearTimeout(soon); clearInterval(hb); clearInterval(tx); ch?.close(); send.current = null; void api.arcadeLeave().catch(() => {}); };
  }, [opts.arcadeId, opts.myId]);
  // a new match: forget the old live scores
  const matchId = live?.match?.id;
  useEffect(() => setScores({}), [matchId]);
  return { live, scores, send: (m: Msg) => send.current?.(m), refresh: () => beatNow.current() };
}

const MODE = { versus: { label: 'Versus', emoji: '⚔️', color: '#FF3D6E', blurb: 'Same round, same time — top score wins bonus tickets' }, team: { label: 'Team', emoji: '🤝', color: '#22E3FF', blurb: 'Your scores add up — hit the target and everyone gets the bonus' } } as const;

/** Start a match from the cabinet you're standing at. */
export function MatchButtons({ arcade, game, onMatch, disabled }: { arcade: string; game: string; onMatch(m: ArcadeMatch): void; disabled?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const go = async (mode: 'versus' | 'team') => {
    setBusy(mode);
    try { const m = await api.arcadeMatchCreate(arcade, game, mode); sfx.coin(); onMatch(m); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  return (
    <div className="flex gap-2" data-testid="match-buttons">
      {(['versus', 'team'] as const).map((m) => (
        <button key={m} disabled={disabled || !!busy} onClick={() => void go(m)} data-testid={`match-new-${m}`}
          className="flex items-center gap-1.5 rounded-2xl bg-black/70 px-3 py-2 text-xs font-black text-white shadow-lg backdrop-blur disabled:opacity-50" style={{ boxShadow: `inset 0 0 0 1.5px ${MODE[m].color}` }}>
          <span className="text-base">{MODE[m].emoji}</span>{busy === m ? '…' : `${MODE[m].label} with others`}
        </button>
      ))}
    </div>
  );
}

/** Someone in your room is gathering players: one tap to join. */
export function InviteBanner({ a, live, myId, onJoined }: { a: Arcade; live: ArcadeLive; myId: string; onJoined(m: ArcadeMatch): void }) {
  const [busy, setBusy] = useState(false);
  const inv = live.lobbies.find((m) => !m.players.some((p) => p.id === myId) && m.players.length < 4);
  if (!inv || live.match?.status === 'lobby' || live.match?.status === 'playing') return null;
  const host = inv.players.find((p) => p.id === inv.host) ?? inv.players[0];
  const g = a.games[inv.game], md = MODE[inv.mode];
  return (
    <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="pointer-events-auto mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-black/80 p-2 pl-3 text-white shadow-2xl backdrop-blur" style={{ boxShadow: `0 0 24px ${md.color}66, inset 0 0 0 1.5px ${md.color}` }} data-testid="match-invite">
      {host && <PlayerAvatar p={host} size={28} />}
      <div className="min-w-0 flex-1 text-xs"><b>@{host?.username}</b> is starting <b>{md.emoji} {md.label}</b> on <b>{g?.emoji} {g?.name}</b><span className="text-white/60"> · {inv.players.length}/4</span></div>
      <Button size="sm" variant="rainbow" loading={busy} data-testid="match-join" onClick={async () => {
        setBusy(true);
        try { const m = await api.arcadeMatchJoin(inv.id); sfx.coin(); onJoined(m); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
      }}>Join</Button>
    </motion.div>
  );
}

/** Your lobby: who's in, and (for the host) Start. */
export function LobbyPanel({ a, m, myId, onChange }: { a: Arcade; m: ArcadeMatch; myId: string; onChange(): void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const host = m.host === myId, g = a.games[m.game], md = MODE[m.mode];
  const run = async (k: string, f: () => Promise<unknown>) => { setBusy(k); try { await f(); onChange(); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); } };
  return (
    <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="pointer-events-auto mx-auto w-full max-w-md rounded-3xl bg-black/85 p-4 text-white shadow-2xl backdrop-blur" style={{ boxShadow: `0 0 30px ${md.color}55, inset 0 0 0 2px ${md.color}` }} data-testid="match-lobby">
      <div className="flex items-center gap-2">
        <span className="text-3xl">{g?.emoji}</span>
        <div className="min-w-0 flex-1"><div className="font-display text-lg font-black">{md.emoji} {md.label} · {g?.name}</div><div className="text-[11px] text-white/70">{md.blurb}</div></div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }, (_, i) => {
          const p = m.players[i];
          return (
            <div key={i} className={cn('grid justify-items-center gap-1 rounded-2xl p-2 text-center', p ? 'bg-white/10' : 'border border-dashed border-white/20')}>
              {p ? <><PlayerAvatar p={p} size={36} /><span className="w-full truncate text-[10px] font-bold">@{p.username}{p.id === m.host ? ' 👑' : ''}</span></> : <span className="py-3 text-[10px] text-white/40">waiting…</span>}
            </div>
          );
        })}
      </div>
      {m.mode === 'team' && m.target && <div className="mt-2 text-center text-xs text-white/80">Team target: <b className="text-[#22E3FF]">{m.target.toLocaleString()}</b> points together</div>}
      <div className="mt-3 flex gap-2">
        <Button variant="ghost" size="sm" className="!text-white" loading={busy === 'leave'} onClick={() => run('leave', () => api.arcadeMatchLeave(m.id))} data-testid="match-leave">Leave</Button>
        {host
          ? <Button variant="rainbow" size="sm" className="ml-auto" disabled={m.players.length < 2} loading={busy === 'start'} onClick={() => run('start', () => api.arcadeMatchStart(m.id))} data-testid="match-start">{m.players.length < 2 ? 'Waiting for players…' : `▶ Start (${m.players.length} players)`}</Button>
          : <span className="ml-auto self-center text-xs text-white/70">Waiting for the host to start…</span>}
      </div>
    </motion.div>
  );
}

/** Live scores across the top of the cabinet while a match is on. */
export function MatchStrip({ m, scores, myId, myScore }: { m: ArcadeMatch; scores: Record<string, number>; myId: string; myScore: number }) {
  const rows = m.players.map((p) => ({ p, s: p.id === myId ? myScore : (p.finished ? p.score ?? 0 : scores[p.id] ?? 0), done: p.finished }));
  const total = rows.reduce((n, r) => n + r.s, 0);
  const sorted = m.mode === 'versus' ? [...rows].sort((x, y) => y.s - x.s) : rows;
  return (
    <div className="w-full max-w-[560px] rounded-2xl bg-black/70 p-2 text-white" data-testid="match-strip">
      {m.mode === 'team' && m.target ? (
        <div className="mb-1.5">
          <div className="flex justify-between text-[10px] font-black"><span>🤝 TEAM</span><span className="tnum">{total.toLocaleString()} / {m.target.toLocaleString()}</span></div>
          <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-white/15"><motion.div className="h-full rounded-full bg-gradient-to-r from-[#22E3FF] to-[#3DDC97]" animate={{ width: `${Math.min(100, (total / m.target) * 100)}%` }} /></div>
        </div>
      ) : null}
      <div className="flex gap-1.5">
        {sorted.map((r, i) => (
          <div key={r.p.id} className={cn('flex min-w-0 flex-1 items-center gap-1 rounded-xl px-1.5 py-1', r.p.id === myId ? 'bg-white/20' : 'bg-white/5')}>
            {m.mode === 'versus' && <span className={cn('text-[10px] font-black', i === 0 ? 'text-[#FFD84D]' : 'text-white/60')}>{i + 1}</span>}
            <PlayerAvatar p={r.p} size={18} />
            <span className="min-w-0 flex-1 truncate text-[10px] font-bold">{r.p.id === myId ? 'You' : `@${r.p.username}`}</span>
            <b className="font-mono text-[11px] tnum">{r.s}</b>{r.done && <span className="text-[9px]">✓</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The final standings (polls until everyone's in). */
export function MatchResults({ a, matchId, myId, onDone }: { a: Arcade; matchId: string; myId: string; onDone(m: ArcadeMatch): void }) {
  const [m, setM] = useState<ArcadeMatch | null>(null);
  useEffect(() => {
    let stop = false, done = false;
    const poll = async () => {
      try {
        const r = await api.arcadeMatchResult(matchId); if (stop) return; setM(r);
        if (r.status === 'done' && !done) { done = true; onDone(r); const me = r.players.find((p) => p.id === myId); if (me?.bonus) { sfx.jackpot(); } return; }
      } catch { /* keep trying */ }
      if (!stop) setTimeout(() => void poll(), 1500);
    };
    void poll();
    return () => { stop = true; };
  }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return <div className="font-mono text-sm text-white/70">Waiting for the others…</div>;
  const rows = [...m.players].sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
  const total = m.players.reduce((n, p) => n + (p.score ?? 0), 0);
  const me = m.players.find((p) => p.id === myId);
  return (
    <div className="grid w-full max-w-xs justify-items-center gap-2" data-testid="match-results">
      <div className="lv-arc-marquee text-xl" style={{ ['--glow' as string]: m.mode === 'versus' ? '#FF3D6E' : '#22E3FF' }}>
        {m.status !== 'done' ? 'WAITING FOR THE OTHERS…' : m.mode === 'versus' ? (me?.bonus ? '★ YOU WIN! ★' : `@${rows[0]?.username} WINS`) : total >= (m.target ?? 0) ? '★ TEAM TARGET HIT! ★' : 'SO CLOSE!'}
      </div>
      {m.mode === 'team' && m.target && <div className="font-mono text-sm">Team: <b className="text-[#22E3FF]">{total}</b> / {m.target}</div>}
      <div className="grid w-full gap-1">
        {rows.map((p, i) => (
          <div key={p.id} className={cn('flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm', p.id === myId ? 'bg-white/20' : 'bg-white/10')}>
            {m.mode === 'versus' && <b className={cn('w-4 text-center', i === 0 ? 'text-[#FFD84D]' : 'text-white/60')}>{i + 1}</b>}
            <PlayerAvatar p={p} size={22} /><span className="min-w-0 flex-1 truncate font-bold">@{p.username}</span>
            <b className="font-mono">{p.finished ? p.score ?? 0 : '…'}</b>
            {p.bonus > 0 && <span className="lv-arc-ticket text-[10px]">+{p.bonus} 🎟️</span>}
          </div>
        ))}
      </div>
      {m.status === 'done' && <p className="text-[11px] text-white/60">{a.games[m.game]?.name} · {m.mode === 'versus' ? 'top score takes the bonus' : 'everyone shares the team bonus'}</p>}
    </div>
  );
}
