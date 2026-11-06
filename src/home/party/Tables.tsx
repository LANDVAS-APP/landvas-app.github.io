// Starting and joining house party games: the game picker, the invite everyone in the room sees, and the table
// (seats filling up, the host's Start button).
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../backend/api';
import { toGameError } from '../../backend/backend';
import type { HomeGame } from '../../backend/types';
import { cn } from '../../lib/utils';
import { Button, PlayerAvatar } from '../../ui';
import { sfx } from '../../arcade/sfx';
import { GAME_META, PARTY_ORDER } from './index';
import { SEAT_COLORS } from './kit';

export function GamePicker({ home, here, onClose, onMade }: { home: string; here: number; onClose(): void; onMade(): void }) {
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const make = async (id: string) => {
    setBusy(id);
    try { await api.homeGameCreate(home, id); sfx.coin(); onMade(); onClose(); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-[#1C1512] p-4 pb-[max(16px,env(safe-area-inset-bottom,0px))] text-white shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()} data-testid="party-picker">
        <div className="mb-1 flex items-center gap-2"><span className="text-2xl">🎲</span><b className="flex-1 font-display text-xl">Party games</b><button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button></div>
        <p className="mb-3 text-xs text-white/70">Pick a game — everyone in the house gets an invite. {here > 1 ? `${here} people are here.` : 'Nobody else is here yet: invite some friends over!'}</p>
        {(['3d', 'party', 'board'] as const).map((kind) => (
          <div key={kind} className="mb-3">
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/50">{kind === '3d' ? '🌍 Live 3D games — off somewhere new' : kind === 'party' ? 'Party games' : 'Board games'}</div>
            <div className="grid grid-cols-2 gap-2">
              {PARTY_ORDER.map((id) => GAME_META[id]).filter((d) => d && d.kind === kind).map((d) => (
                <button key={d.id} disabled={!!busy} onClick={() => void make(d.id)} className="grid gap-1 rounded-2xl bg-white/10 p-3 text-left hover:bg-white/15 disabled:opacity-60" style={{ boxShadow: `inset 0 0 0 1.5px ${d.color}66` }} data-testid={`party-new-${d.id}`}>
                  <div className="flex items-center gap-2"><span className="text-3xl">{d.emoji}</span><span className="min-w-0"><b className="block truncate">{busy === d.id ? '…' : d.name}</b><span className="text-[10px] text-white/60">{d.min === d.max ? `${d.min} players` : `${d.min}–${d.max} players`}</span></span></div>
                  <span className="text-[11px] leading-snug text-white/70">{d.blurb}</span>
                  {d.place && <span className="text-[10px] font-bold" style={{ color: d.color }}>📍 {d.place}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="text-center text-[10px] text-white/50">Win Ink — bigger parties pay more · up to 500 Ink a day</p>
      </motion.div>
    </div>
  );
}

/** someone opened a table: one tap to sit down, wherever you are in the house */
export function TableInvite({ t, onJoined }: { t: HomeGame; onJoined(): void }) {
  const [busy, setBusy] = useState(false);
  const d = GAME_META[t.game]; if (!d) return null;
  const host = t.players.find((p) => p.id === t.host) ?? t.players[0];
  return (
    <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="pointer-events-auto mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-black/75 p-2 pl-3 text-white shadow-2xl backdrop-blur" style={{ boxShadow: `0 0 20px ${d.color}55, inset 0 0 0 1.5px ${d.color}` }} data-testid="party-invite">
      <span className="text-2xl">{d.emoji}</span>
      <div className="min-w-0 flex-1 text-xs"><b>@{host?.username}</b> wants to play <b>{d.name}</b> <span className="text-white/60">{t.players.length}/{d.max}</span></div>
      <Button size="sm" variant="rainbow" loading={busy} data-testid="party-join" onClick={async () => { setBusy(true); try { await api.homeGameJoin(t.id); sfx.coin(); onJoined(); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); } }}>Join</Button>
    </motion.div>
  );
}

export function TableLobby({ t, myId, onChange }: { t: HomeGame; myId: string; onChange(): void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const d = GAME_META[t.game]; if (!d) return null;
  const host = t.host === myId, ready = t.players.length >= d.min;
  const run = async (k: string, f: () => Promise<unknown>) => { setBusy(k); try { await f(); onChange(); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); } };
  return (
    <div className="pointer-events-auto w-full max-w-md rounded-3xl bg-black/80 p-4 text-white shadow-2xl backdrop-blur" style={{ boxShadow: `0 0 30px ${d.color}55, inset 0 0 0 2px ${d.color}` }} data-testid="party-lobby">
      <div className="flex items-center gap-2"><span className="text-3xl">{d.emoji}</span><div className="min-w-0 flex-1"><div className="font-display text-lg font-black">{d.name}</div><div className="text-[11px] text-white/70">{d.how}</div></div></div>
      <div className={cn('mt-3 grid gap-2', d.max <= 2 ? 'grid-cols-2' : 'grid-cols-4')}>
        {Array.from({ length: d.max }, (_, i) => {
          const p = t.players[i];
          return (
            <div key={i} className={cn('grid justify-items-center gap-1 rounded-2xl p-2 text-center', p ? 'bg-white/10' : 'border border-dashed border-white/20')}>
              {p ? <><span className="rounded-full p-0.5" style={{ background: SEAT_COLORS[i % SEAT_COLORS.length] }}><PlayerAvatar p={p} size={32} /></span><span className="w-full truncate text-[10px] font-bold">{p.id === myId ? 'You' : `@${p.username}`}{p.id === t.host ? ' 👑' : ''}</span></>
                : <span className="py-3 text-[10px] text-white/40">{i < d.min ? 'needed' : 'open'}</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="ghost" size="sm" className="!text-white" loading={busy === 'leave'} onClick={() => run('leave', () => api.homeGameLeave(t.id))} data-testid="party-leave-table">Leave</Button>
        {host ? <Button variant="rainbow" size="sm" className="ml-auto" disabled={!ready} loading={busy === 'start'} onClick={() => run('start', () => api.homeGameStart(t.id))} data-testid="party-start">{ready ? `▶ Start (${t.players.length})` : `Waiting for ${d.min - t.players.length} more…`}</Button>
          : <span className="ml-auto self-center text-xs text-white/70">Waiting for the host…</span>}
      </div>
    </div>
  );
}
