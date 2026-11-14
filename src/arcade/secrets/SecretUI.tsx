// The arcade's secrets, on screen: a cabinet for a secret game, the Back Room (PROTO-0 and the sticky notes), the
// B-Side's record sleeve (every song's chart, its locks and full combos), the rusty token and the moments each secret
// opens with. The server decides everything; nothing here shows for someone who hasn't found it.
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Infinity as InfinityIcon, Lock, RotateCcw, X } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { api } from '../../backend/api';
import { toGameError } from '../../backend/backend';
import type { ArcadeFinish, ArcadeMe, ArcadeMode, SecretGames } from '../../backend/types';
import { invalidateGame } from '../../lib/queries';
import { cn } from '../../lib/utils';
import { Dialog, ResourceIcon } from '../../ui';
import { confettiCannons } from '../../ui/confetti';
import type { ArenaProps } from '../games';
import { TRACKS } from '../music';
import { sfx } from '../sfx';
import { BSide, chartFor, type BSideDiff, type Pad } from './bside';
import { LandGrab } from './landgrab';
import { LOGO, takeMeta } from './meta';
import { NOTES, PROTO_COUNT, Proto } from './proto';

export const secretsKey = ['arcade-secrets'] as const;
export const secretKey = (s: string) => ['arcade-secret', s] as const;
const tix = (n: number) => Math.round(n).toLocaleString();

/** each secret's look, everywhere it appears */
export const SECRET_LOOK: Record<string, { name: string; emoji: string; color: string; bg: string }> = {
  founder: { name: 'The Founder’s Code', emoji: '🟩', color: '#3DDC97', bg: `linear-gradient(135deg, ${LOGO.join(', ')})` },
  backroom: { name: 'The Back Room', emoji: '🚪', color: '#FFB13D', bg: 'radial-gradient(120% 100% at 50% 0%, #6B4A1C, #1A1208 70%)' },
  bside: { name: 'The B-Side', emoji: '💿', color: '#B57BFF', bg: 'radial-gradient(120% 100% at 50% 0%, #4B2A8C, #0B0620 70%)' },
};

const SONGS_AFTER = 'after';
export const songInfo = (id: string) => TRACKS.find((t) => t.id === id);

// ---- a cabinet for a secret's game ------------------------------------------------------------------------------
type Phase = { k: 'attract' } | { k: 'count'; n: number; session: string; seed: number; level: number } | { k: 'play'; session: string; seed: number; level: number }
  | { k: 'done'; r: (ArcadeFinish & { data?: Record<string, any> }) | null; score: number; meta: Record<string, any> };
export function SecretCabinet(p: {
  secret: string; game: string; title: string; emoji: string; color: string; how: string; bonus?: string; endless?: string; modes?: boolean;
  Arena: (a: ArenaProps & any) => ReactElement | null; extra?: Record<string, unknown>; inkMult: number; best?: number; record?: number;
  me: ArcadeMe; haptics: boolean; reduce: boolean; onExit(): void; onMe(m: ArcadeMe): void; onData?(d: Record<string, any> | undefined): void;
}) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ k: 'attract' });
  const [mode, setMode] = useState<ArcadeMode>('classic');
  const [busy, setBusy] = useState(false);
  const [counted, setCounted] = useState(0);
  const start = async () => {
    setBusy(true);
    try { const r = await api.arcadeSecretStart(p.secret, p.game, mode); sfx.coin(); takeMeta(); setPhase({ k: 'count', n: 3, session: r.session, seed: r.seed, level: r.level }); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (phase.k !== 'count') return;
    sfx.blip(phase.n === 1 ? 12 : 0);
    const t = setTimeout(() => setPhase(phase.n > 1 ? { ...phase, n: phase.n - 1 } : { k: 'play', session: phase.session, seed: phase.seed, level: phase.level }), 650);
    return () => clearTimeout(t);
  }, [phase]);
  const finish = async (session: string, score: number) => {
    const meta = takeMeta() as Record<string, any>;
    try {
      const r = await api.arcadeSecretFinish(session, score, meta);
      p.onMe(r.me); p.onData?.(r.data); invalidateGame(qc); void qc.invalidateQueries({ queryKey: secretKey(p.secret) }); void qc.invalidateQueries({ queryKey: secretsKey });
      setCounted(0); setPhase({ k: 'done', r, score: r.score, meta });
      if (r.new_record || r.new_best || meta.fc) confettiCannons();
    } catch (e) { toast.error(toGameError(e).message); setPhase({ k: 'done', r: null, score, meta }); }
  };
  useEffect(() => {
    if (phase.k !== 'done' || !phase.r?.tickets) return;
    const total = phase.r.tickets; sfx.tickets(total);
    const step = Math.max(1, Math.ceil(total / 40));
    const t = setInterval(() => setCounted((c) => { const n = Math.min(total, c + step); if (n >= total) clearInterval(t); return n; }), 35);
    return () => clearInterval(t);
  }, [phase]);
  const Arena = p.Arena;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}
      className="absolute inset-0 z-30 flex flex-col items-center bg-black/40 px-2 pb-[max(10px,env(safe-area-inset-bottom,0px))] pt-[max(10px,env(safe-area-inset-top,0px))]" style={{ ['--glow' as string]: p.color }} data-testid="secret-cabinet">
      <div className="flex w-full max-w-[560px] items-center gap-2 pb-2">
        <button onClick={p.onExit} className="rounded-xl bg-black/60 p-2" aria-label="Step back from the cabinet" data-testid="secret-exit"><X className="h-5 w-5" /></button>
        <div className="lv-arc-marquee min-w-0 flex-1 truncate text-center text-xl">{p.emoji} {p.title}</div>
        <div className="lv-arc-ticket text-xs">🎟️ {tix(p.me.tickets)}</div>
      </div>
      <div className="lv-arc-crt min-h-0 w-full max-w-[560px] flex-1">
        {phase.k === 'play' && (
          <div className="absolute inset-0" data-testid="secret-screen">
            <Arena key={phase.session} seed={phase.seed} level={phase.level} mode={mode} haptics={p.haptics} reduce={p.reduce} onEnd={(s: number) => void finish(phase.session, s)} {...(p.extra ?? {})} />
          </div>
        )}
        {phase.k !== 'play' && (
          <div className="absolute inset-0 grid place-items-center overflow-y-auto p-5 text-center" style={{ background: `radial-gradient(120% 90% at 50% 10%, ${p.color}55, #05040F 70%)` }}>
            <AnimatePresence mode="wait">
              {phase.k === 'attract' && (
                <motion.div key="attract" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="grid justify-items-center gap-3">
                  <motion.div animate={p.reduce ? undefined : { y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} className="text-7xl">{p.emoji}</motion.div>
                  <div className="lv-arc-marquee text-3xl">{p.title}</div>
                  <div className="rounded-full bg-[#FFE14D] px-3 py-1 text-[11px] font-black text-[#2A1A00]">✦ SECRET · ×{p.inkMult} INK · NO CAP</div>
                  {p.modes !== false && (
                    <div className="flex rounded-2xl bg-black/50 p-1" role="tablist" data-testid="secret-mode">
                      {(['classic', 'endless'] as const).map((md) => (
                        <button key={md} role="tab" aria-selected={mode === md} onClick={() => { setMode(md); sfx.blip(md === 'endless' ? 9 : 4); }} data-testid={`secret-mode-${md}`}
                          className={cn('flex items-center gap-1 rounded-xl px-4 py-1.5 font-mono text-xs font-black uppercase', mode === md ? 'bg-[var(--glow)] text-black shadow-[0_0_16px_var(--glow)]' : 'text-white/70')}>
                          {md === 'endless' && <InfinityIcon className="h-3.5 w-3.5" />}{md}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="max-w-xs text-sm text-white/85">{mode === 'endless' && p.endless ? p.endless : p.how}</p>
                  {p.bonus && <p className="max-w-xs rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold text-[#FFE14D]">{p.bonus}</p>}
                  <div className="font-mono text-xs text-white/60">YOUR BEST {p.best ?? 0} · RECORD {p.record ?? 0}</div>
                  <button onClick={start} disabled={busy} className="lv-arc-bigbtn !h-20 !w-auto !rounded-3xl px-8 text-lg" data-testid="secret-start">{busy ? '…' : '▶ PRESS START'}</button>
                </motion.div>
              )}
              {phase.k === 'count' && <motion.div key={`c${phase.n}`} initial={{ scale: 2.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} className="lv-arc-marquee text-9xl">{phase.n}</motion.div>}
              {phase.k === 'done' && (
                <motion.div key="done" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid justify-items-center gap-2.5" data-testid="secret-done">
                  {phase.r?.new_record ? <div className="lv-arc-marquee text-2xl" style={{ ['--glow' as string]: '#FFE14D' }}>★ NEW SECRET RECORD ★</div> : phase.r?.new_best ? <div className="lv-arc-marquee text-xl">NEW PERSONAL BEST</div> : null}
                  {p.secret === 'bside' && (
                    <div className="flex flex-wrap justify-center gap-1.5 text-xs font-black" data-testid="bside-result">
                      <span className={cn('rounded-full px-2.5 py-1', phase.meta.clear ? 'bg-[#3DDC97] text-[#06210F]' : 'bg-[#FF3D6E]')}>{phase.meta.clear ? `CLEARED · RANK ${phase.meta.rank}` : 'FAILED'}</span>
                      {phase.meta.fc && <span className="rounded-full bg-[#FFE14D] px-2.5 py-1 text-[#2A1A00]">★ FULL COMBO</span>}
                      {phase.meta.acc != null && <span className="rounded-full bg-white/10 px-2.5 py-1">{phase.meta.acc}% · max combo {phase.meta.combo}</span>}
                    </div>
                  )}
                  {p.secret === 'founder' && phase.meta.level != null && <div className="text-xs font-black text-[#3DDC97]">MAP {phase.meta.level} REACHED</div>}
                  {p.secret === 'backroom' && phase.meta.stage != null && <div className="text-xs font-black text-[#FFB13D]">STAGE {phase.meta.stage}</div>}
                  <div className="font-mono text-6xl font-black text-[#FFE14D]" style={{ textShadow: '0 0 24px #FFB13D' }}>{phase.score}</div>
                  {phase.r && (
                    <>
                      <div className="lv-arc-ticket text-2xl">🎟️ +{counted}</div>
                      <span className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-sm font-bold" data-testid="secret-ink"><ResourceIcon r="ink" className="h-4 w-4" /> +{phase.r.paid} Ink</span>
                    </>
                  )}
                  <div className="mt-1 flex gap-2">
                    <button onClick={() => setPhase({ k: 'attract' })} className="lv-arc-bigbtn !h-14 !w-auto !rounded-2xl px-5 text-sm" data-testid="secret-again"><RotateCcw className="mr-1 inline h-4 w-4" />PLAY AGAIN</button>
                    <button onClick={p.onExit} className="rounded-2xl bg-white/10 px-5 text-sm font-bold">Step back</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export const LANDGRAB = {
  title: 'LAND GRAB', emoji: '🟩', color: '#3DDC97', Arena: LandGrab,
  how: 'You’re a drop of ink on a blank map. Swipe to steer. Leave your land, loop back, and everything you closed off is yours. Smudges dry up your wet trail. Claim 75% of three maps.',
  bonus: '★ Gold plots pay 250 · a claim of 10% or more in one go pays ×2 · clear a map fast for a time bonus',
  endless: 'Map after map, more smudges and faster every time. An extra life every second map.',
};
export const PROTO = {
  title: 'PROTO-0', emoji: '📟', color: '#FFB13D', Arena: Proto,
  how: 'A broken prototype. Do what it says — TAP! DODGE! CATCH! DON’T TOUCH! — before the fuse runs out. Four lives. Ship it: clear 30 stages.',
  bonus: '⚠ Every 15th stage is a BOSS: the screen tears and left is right · it patches in new games at stage 25 and 50',
  endless: 'It never ships. How far can you get?',
};

// ---- the Back Room ----------------------------------------------------------------------------------------------
export function BackRoom({ stage, onBack, onPlay, reduce }: { stage: number; onBack(): void; onPlay(): void; reduce: boolean }) {
  useEffect(() => { sfx.thud(); }, []);
  const got = NOTES.filter(([s]) => stage >= s);
  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-[#0E0A05] text-white" data-testid="backroom">
      <svg viewBox="0 0 400 700" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="br-light" cx="50%" cy="22%" r="70%"><stop offset="0" stopColor="#FFCB78" stopOpacity="0.55" /><stop offset="0.5" stopColor="#6B4A1C" stopOpacity="0.25" /><stop offset="1" stopColor="#0E0A05" stopOpacity="0" /></radialGradient>
          <linearGradient id="br-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2A1F12" /><stop offset="1" stopColor="#1A130A" /></linearGradient>
        </defs>
        <rect width="400" height="700" fill="url(#br-wall)" />
        {/* floorboards */}
        <rect y="520" width="400" height="180" fill="#20170C" />
        {Array.from({ length: 9 }, (_, i) => <line key={i} x1={i * 50} y1="520" x2={i * 50 - 40} y2="700" stroke="#140E07" strokeWidth="2" />)}
        {/* boxes */}
        <g fill="#5C4120" stroke="#3A2810" strokeWidth="2"><rect x="18" y="430" width="90" height="90" /><rect x="40" y="370" width="66" height="60" /><rect x="300" y="450" width="84" height="70" /></g>
        <g fill="#7A5A30" fontFamily="monospace" fontSize="11"><text x="28" y="480">ARCADE</text><text x="28" y="494">PARTS</text><text x="308" y="490">TICKETS 1983</text></g>
        {/* the prototype cabinet */}
        <g data-testid="proto-cab">
          <rect x="140" y="250" width="120" height="270" rx="6" fill="#2D2418" stroke="#FFB13D" strokeOpacity="0.5" strokeWidth="2" />
          <rect x="152" y="268" width="96" height="30" rx="3" fill="#FFB13D" fillOpacity="0.85" />
          <text x="200" y="289" textAnchor="middle" fontFamily="ui-monospace, monospace" fontWeight="900" fontSize="16" fill="#2A1A00">PROTO-0</text>
          <rect x="155" y="310" width="90" height="80" rx="4" fill="#120E08" stroke="#5C4120" />
          <text x="200" y="350" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="10" fill="#FFB13D" className={reduce ? undefined : 'lv-br-blink'}>INSERT TICKET</text>
          <rect x="165" y="400" width="70" height="22" rx="3" fill="#1A140C" />
          <circle cx="182" cy="411" r="6" fill="#FF3D6E" /><circle cx="218" cy="411" r="6" fill="#3DDC97" />
          <rect x="182" y="445" width="36" height="8" rx="2" fill="#000" />
          {/* the sticky note on it */}
          <g transform="rotate(-6 236 268)"><rect x="214" y="246" width="54" height="40" fill="#FFE14D" /><text x="241" y="262" textAnchor="middle" fontFamily="ui-rounded, system-ui" fontWeight="800" fontSize="8.5" fill="#5A4300">DO NOT</text><text x="241" y="274" textAnchor="middle" fontFamily="ui-rounded, system-ui" fontWeight="800" fontSize="8.5" fill="#5A4300">SHIP</text></g>
        </g>
        {/* dust in the light */}
        <rect width="400" height="700" fill="url(#br-light)" />
      </svg>
      {/* the bulb, swinging a little on its cord */}
      <div className={cn('pointer-events-none absolute left-1/2 top-0 h-[22%] w-px origin-top bg-[#3A2D1C]', !reduce && 'lv-br-swing')}>
        <div className="absolute -bottom-3 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full bg-[#FFE6A8] shadow-[0_0_40px_14px_rgba(255,203,120,0.55)]" />
      </div>
      {/* sticky notes on the wall: one more for every milestone in PROTO-0 */}
      <div className="absolute inset-x-3 top-[max(70px,env(safe-area-inset-top,0px))] grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="backroom-notes">
        {NOTES.map(([s, text], i) => {
          const open = stage >= s;
          return (
            <div key={s} className={cn('rounded-sm p-2 text-[10.5px] font-bold leading-snug shadow-lg', open ? 'bg-[#FFE14D] text-[#4A3800]' : 'bg-[#FFE14D]/15 text-white/40')} style={{ transform: `rotate(${((i * 37) % 7) - 3}deg)` }}>
              {open ? text : `🔒 reach stage ${s} in PROTO-0`}
            </div>
          );
        })}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
        <button onClick={onPlay} className="lv-arc-play flex items-center gap-3 rounded-3xl bg-gradient-to-br from-[#FFB13D] to-[#7A3A1A] px-5 py-3 text-left shadow-2xl" data-testid="backroom-play">
          <span className="text-4xl">📟</span>
          <span><span className="block text-xs font-bold uppercase tracking-widest text-white/80">✦ Secret · {got.length}/{NOTES.length} notes · {PROTO_COUNT} games inside</span><span className="block font-display text-2xl font-black">Play PROTO-0</span>
            <span className="block text-[11px] text-white/80">Best stage: {stage || '—'}</span></span>
        </button>
        <button onClick={onBack} className="flex items-center gap-1.5 rounded-full bg-black/60 px-4 py-2 text-sm font-bold" data-testid="backroom-back"><ArrowLeft className="h-4 w-4" /> Back to the arcade</button>
      </div>
    </div>
  );
}

// ---- the B-Side's record sleeve ----------------------------------------------------------------------------------
const DIFFS: BSideDiff[] = ['easy', 'hard', 'expert'];
export function BSideMenu({ s, onPick, onClose }: { s: Extract<SecretGames, { found: true }>; onPick(song: string, diff: BSideDiff): void; onClose(): void }) {
  const songs = [...(s.songs ?? ['chill', 'neon', 'funk', 'pixel', 'boss']), SONGS_AFTER];
  const cleared = (s.data?.cleared ?? {}) as Record<string, string[]>, fc = (s.data?.fc ?? {}) as Record<string, string[]>;
  const open = (i: number) => {
    const id = songs[i];
    if (id === SONGS_AFTER) return songs.slice(0, -1).every((x) => (cleared[x] ?? []).some((d) => d === 'hard' || d === 'expert'));
    return i === 0 || (cleared[songs[i - 1]] ?? []).length > 0;
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title="💿 The B-Side" description="Every song on the jukebox has a B-side: a rhythm chart played on this arcade’s cabinets. Clear one to open the next.">
      <div className="grid gap-2" data-testid="bside-menu">
        {songs.map((id, i) => {
          const t = songInfo(id), ok = open(i);
          return (
            <div key={id} className={cn('rounded-2xl p-2.5', ok ? 'bg-[var(--bg-3)]' : 'bg-[var(--bg-3)]/50 opacity-70')} data-testid={`bside-song-${id}`}>
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{id === SONGS_AFTER ? '💿' : t?.emoji}</span>
                <div className="min-w-0 flex-1"><b className="block truncate">{id === SONGS_AFTER ? 'Track 00 · Ink After Dark' : t?.name}</b><span className="text-[11px] opacity-70">{t?.bpm} BPM{!ok ? (id === SONGS_AFTER ? ' · clear every song on Hard' : ' · clear the song above to open') : ''}</span></div>
                {!ok && <Lock className="h-4 w-4 opacity-60" />}
              </div>
              {ok && (
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {DIFFS.map((d) => {
                    const best = s.best[`bside.${id}.${d}:classic`], isFc = (fc[id] ?? []).includes(d), isCl = (cleared[id] ?? []).includes(d);
                    return (
                      <button key={d} onClick={() => onPick(id, d)} data-testid={`bside-${id}-${d}`}
                        className={cn('rounded-xl px-2 py-1.5 text-left text-xs font-black capitalize', d === 'easy' ? 'bg-[#3DDC97]/20' : d === 'hard' ? 'bg-[#FF9F1C]/20' : 'bg-[#FF3D6E]/20')}>
                        {d} {isFc ? '★' : isCl ? '✓' : ''}
                        <span className="block text-[10px] font-bold opacity-70">{chartFor(id, d).length} notes{best ? ` · ${best}` : ''}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {s.data?.gold && <p className="rounded-xl bg-[#FFE14D]/15 p-2 text-center text-xs font-black text-[#FFE14D]">★ Golden jukebox — every song full-combo’d on Expert</p>}
      </div>
    </Dialog>
  );
}

/** the arcade's 16 cabinets as pads, in the spots they stand in the hall (row 0 at the back) */
export function hallPads(games: [string, { name: string; emoji: string; color: string }][]): Pad[] {
  const pads: Pad[] = Array.from({ length: 16 }, () => ({ emoji: '🕹️', color: '#B57BFF' }));
  games.slice(0, 16).forEach(([, g], i) => { const col = i % 4, row = [1, 2, 0, 3][Math.floor(i / 4)]; pads[row * 4 + col] = { emoji: g.emoji, color: g.color, name: g.name }; });
  return pads;
}
export const BSIDE_GAME = (song: string, diff: BSideDiff, pads: Pad[]) => ({
  title: `${songInfo(song)?.name ?? song} · B-side`, emoji: '💿', color: '#B57BFF', Arena: BSide, extra: { song, diff, pads }, modes: false,
  how: `${diff.toUpperCase()} — ${chartFor(song, diff).length} notes. The cabinets light up to the music: tap each one as its ring lands. Don’t let the health bar run dry.`,
  bonus: '★ Full combo (no misses) for a star · the combo multiplies every 25 hits (up to ×4)',
});

// ---- the moments each secret opens with ----------------------------------------------------------------------------
export function SecretReveal({ id, bounty, onClose, children }: { id: 'founder' | 'backroom' | 'bside'; bounty: number; onClose(): void; children?: React.ReactNode }) {
  const look = SECRET_LOOK[id];
  useEffect(() => { confettiCannons(); sfx.jackpot(); }, []);
  const copy = {
    founder: { title: 'THE FOUNDER’S CODE', line: 'You traced the L. The arcade remembered how it began — and something rose out of the floor by the front door.', what: 'LAND GRAB is yours now, in every arcade: claim land with ink.' },
    backroom: { title: 'ADMIT ONE', line: 'The ticket machine swallowed the rusty token and printed a single ticket. Somewhere by the jukebox, a panel clicked open.', what: 'The back room is open for you in every arcade. Something’s still plugged in back there.' },
    bside: { title: 'TRACK 00', line: 'The jukebox flipped its record. Ink After Dark. The cabinets are listening.', what: 'Every song now has a B-side: a rhythm chart played on the arcade’s own cabinets.' },
  }[id];
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={`${look.emoji} ${copy.title}`} description={look.name}>
      <div className="grid gap-2.5 text-sm" data-testid={`reveal-${id}`}>
        <div className="h-2 rounded-full" style={{ background: look.bg }} />
        <p>{copy.line}</p>
        {bounty > 0 && <div className="flex items-center gap-2 rounded-2xl bg-white/10 p-3 font-bold"><ResourceIcon r="ink" className="h-5 w-5" /> +{bounty} Ink for finding it</div>}
        <p className="font-bold">{copy.what}</p>
        <p className="text-[var(--fg-2)]">Everything inside pays extra Ink with no cap, and nobody else is told it exists.</p>
        {children}
        <button onClick={onClose} className="mt-1 rounded-2xl py-2.5 font-black text-[#06121E]" style={{ background: look.color }} data-testid="reveal-ok">Let’s go</button>
      </div>
    </Dialog>
  );
}

/** the ticket the machine prints for the rusty token */
export function AdmitOne() {
  return (
    <motion.div initial={{ y: 60, opacity: 0, rotate: -4 }} animate={{ y: 0, opacity: 1, rotate: -2 }} transition={{ type: 'spring', stiffness: 120 }}
      className="mx-auto flex w-60 items-center justify-between rounded-md border-2 border-dashed border-[#7A3A1A] bg-[#FFCB78] px-4 py-3 text-[#4A1E00]" data-testid="admit-one">
      <div><div className="font-display text-2xl font-black tracking-wider">ADMIT ONE</div><div className="font-mono text-[10px]">BACK ROOM · NO. 000{Math.floor(Math.random() * 900 + 100)}</div></div>
      <span className="text-3xl">🎟️</span>
    </motion.div>
  );
}

/** the rusty token, while you're holding it */
export function TokenChip({ until }: { until: string }) {
  const [left, setLeft] = useState(() => new Date(until).getTime() - Date.now());
  useEffect(() => { const t = setInterval(() => setLeft(new Date(until).getTime() - Date.now()), 1000); return () => clearInterval(t); }, [until]);
  if (left <= 0) return null;
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  return <div className="rounded-full bg-[#7A5A30] px-2 py-0.5 text-[11px] font-black text-[#FFE6A8]" title="A rusty token. It looks like it fits a slot somewhere." data-testid="token-chip">🪙 {m}:{String(s).padStart(2, '0')}</div>;
}
