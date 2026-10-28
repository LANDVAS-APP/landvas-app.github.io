// /pvp — PvP minigames: free head-to-head games in rounds against an anonymous rival.
// Nobody puts Ink up. Both players get the same boards; the server replays both runs,
// each round goes to the higher score and the match to whoever takes more rounds.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, EyeOff, Shuffle, Sparkles, Swords, Timer, Trophy, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { PvpFinish, PvpGameConfig, PvpMatch, PvpStart } from '../backend/types';
import { Page, PageHeader } from '../app/Shell';
import { config } from '../env';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { cn, fmt, sleep, timeAgo } from '../lib/utils';
import { PVP_GAMES, PVP_INFO, pvpRoundSeed, type PvpGame } from '../shared/pvp';
import { Button, Empty, ResourceIcon, Spinner } from '../ui';
import { PVP_COMPONENTS } from './games';
import { bonusText } from '../play/rates';

type Phase = { k: 'lobby' } | { k: 'playing'; s: PvpStart } | { k: 'checking' } | { k: 'result'; r: PvpFinish };

const WITHHELD: Record<string, string> = {
  account_too_new: 'new accounts earn from PvP after their first day',
  below_quality_bar: 'your rounds were below the quality needed to earn',
  daily_limit: 'you’ve reached today’s paid matches',
  run_not_verified: 'your run couldn’t be verified',
  rival_did_not_play: 'your rival didn’t finish, so the win can’t pay',
};


export default function PvpScreen() {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const lobby = useQuery({ queryKey: ['pvp'], queryFn: api.pvpLobby, enabled: !!me, refetchInterval: 15_000 });
  const [phase, setPhase] = useState<Phase>({ k: 'lobby' });
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['pvp'] }); invalidateGame(qc); };

  const play = async (g: PvpGame) => {
    setBusy(g);
    try { setPhase({ k: 'playing', s: await api.pvpPlay(g) }); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const submit = async (s: PvpStart, log: unknown) => {
    setPhase({ k: 'checking' });
    try {
      setPhase({ k: 'result', r: await api.pvpFinish(s.match_id, log) });
    } catch (e) {
      toast.error(toGameError(e).message);
      setPhase({ k: 'lobby' });
    } finally { refresh(); }
  };

  if (!me || lobby.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  if (phase.k === 'playing') return <Match s={phase.s} onDone={(log) => void submit(phase.s, log)} />;
  const cfg = lobby.data?.config;
  const rec = lobby.data?.record;
  return (
    <Page>
      <PageHeader eyebrow="Free to play · anonymous rivals" title={<span className="flex items-center gap-2"><Swords className="h-7 w-7 text-hot" /> PvP minigames</span>}>
        Head-to-head skill games, played in rounds. You and a random rival get the exact same boards; take more rounds than them to win the match. It’s free — nobody puts up Ink.
      </PageHeader>
      {phase.k === 'checking' && <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line p-4 text-sm text-muted"><Spinner /> Checking your rounds…</div>}
      {phase.k === 'result' && <MatchCard m={phase.r} big onClose={() => setPhase({ k: 'lobby' })} />}
      {!cfg?.enabled ? (
        <Empty icon={<Swords className="h-6 w-6" />} title="PvP is taking a break">Check the bell for when it’s back.</Empty>
      ) : (
        <>
          {rec && (
            <div className="mb-4 flex flex-wrap gap-2 text-sm" data-testid="pvp-record">
              <span className="glass rounded-full px-3 py-1.5 tnum"><Trophy className="mr-1 inline h-4 w-4 text-gold" />{rec.won} won</span>
              <span className="glass rounded-full px-3 py-1.5 tnum">{rec.lost} lost</span>
              <span className="glass rounded-full px-3 py-1.5 tnum">{rec.draws} draws</span>
              <span className="glass flex items-center gap-1 rounded-full px-3 py-1.5 font-bold tnum text-ok"><ResourceIcon r="ink" /> {fmt(rec.ink)} earned</span>
              <span className="glass rounded-full px-3 py-1.5 text-muted tnum">{rec.paid_today}/{cfg.daily_rewarded_matches} paid today</span>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2" data-testid="pvp-games">
            {PVP_GAMES.filter((g) => cfg.games?.[g]?.enabled !== false).map((g) => (
              <GameCard key={g} g={g} c={cfg.games[g]} busy={busy === g} onPlay={() => void play(g)} />
            ))}
          </div>
          <h2 className="mb-2 mt-8 font-display text-lg font-semibold">Your matches</h2>
          {!lobby.data?.matches.length ? <Empty icon={<Swords className="h-6 w-6" />} title="No matches yet">Pick a game above — you’re paired with a rival automatically.</Empty> : (
            <div className="grid gap-2" data-testid="pvp-matches">{lobby.data.matches.map((m) => <MatchCard key={m.match_id} m={m} />)}</div>
          )}
          <div className="mt-6 grid gap-2 rounded-2xl border border-line p-4 text-xs text-muted">
            <p className="flex gap-2"><EyeOff className="h-4 w-4 shrink-0 text-accent-2" /> Rivals are anonymous and matched at random — you can’t choose who you play, and you won’t meet the same player twice in a day.</p>
            <p className="flex gap-2"><Shuffle className="h-4 w-4 shrink-0 text-accent-2" /> Each round goes to the higher score (a tie goes to the faster round). Win more rounds to win the match.</p>
            <p className="flex gap-2"><Sparkles className="h-4 w-4 shrink-0 text-accent-2" /> To earn Ink your rounds need to average at least {cfg.min_quality_pct}%{cfg.min_account_hours ? `, your account must be ${cfg.min_account_hours >= 24 ? `${Math.round(cfg.min_account_hours / 24)} day${cfg.min_account_hours >= 48 ? 's' : ''}` : `${cfg.min_account_hours} hours`} old` : ''}, and up to {cfg.daily_rewarded_matches} matches pay each day. Beating a rival who didn’t finish pays nothing.</p>
          </div>
        </>
      )}
    </Page>
  );
}

function GameCard({ g, c, busy, onPlay }: { g: PvpGame; c: PvpGameConfig; busy: boolean; onPlay(): void }) {
  const info = PVP_INFO[g];
  const perRound = (c.round_win_ink ?? []).slice(0, c.rounds).filter((x) => x > 0);
  return (
    <div className="glass grid gap-3 rounded-[22px] p-4" data-testid={`pvp-game-${g}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-semibold" style={{ color: info.color }}>{info.name}</div>
          <div className="text-xs text-muted">{info.tagline}</div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1 font-display text-lg font-bold tnum"><ResourceIcon r="ink" /> {fmt(c.win_ink)}</div>
          <div className="text-[11px] text-faint">for a win</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
        <span className="rounded-full bg-surface-2 px-2 py-0.5">{c.rounds} rounds</span>
        {perRound.length > 0 && <span className="rounded-full bg-surface-2 px-2 py-0.5">+{perRound.join('/')} per round won</span>}
        {c.draw_ink > 0 && <span className="rounded-full bg-surface-2 px-2 py-0.5">draw +{c.draw_ink}</span>}
        {(c.bonuses ?? []).map((b, i) => <span key={i} className="rounded-full bg-gold/15 px-2 py-0.5 text-gold">{bonusText(b)}</span>)}
        {c.waiting > 0 && <span className="flex items-center gap-1 rounded-full bg-ok/15 px-2 py-0.5 text-ok"><Users className="h-3 w-3" /> rival waiting</span>}
      </div>
      <ol className="grid gap-1 text-xs text-muted">{info.howTo.map((h, i) => <li key={i} className="flex gap-2"><span className="font-bold text-fg">{i + 1}.</span>{h}</li>)}</ol>
      <Button variant="rainbow" loading={busy} onClick={onPlay} data-testid={`pvp-play-${g}`}><Swords className="h-4 w-4" /> Find a rival</Button>
    </div>
  );
}

/** Plays every round of a match in turn, then hands back the whole log. */
function Match({ s, onDone }: { s: PvpStart; onDone(log: unknown): void }) {
  const info = PVP_INFO[s.game];
  const G = PVP_COMPONENTS[s.game];
  const t0 = useRef(performance.now());
  const [round, setRound] = useState(0);
  const [between, setBetween] = useState(false);
  const boards = useRef<{ t0: number; log: unknown }[]>([]);
  const roundStart = useRef(0);
  const boardSolver = useRef<(() => Promise<void>) | null>(null);
  const done = useRef(false);
  const roundRef = useRef(0);
  const betweenRef = useRef(false);
  roundRef.current = round;
  betweenRef.current = between;
  useEffect(() => {
    if (!(config.e2e || import.meta.env.DEV)) return;
    (window as any).__landvasGame = {
      // solve each round once (boards re-register their solver on every render)
      autoSolve: async () => {
        let solved = -1;
        while (!done.current) {
          const r = roundRef.current;
          const fn = boardSolver.current;
          if (fn && r !== solved && !betweenRef.current) { solved = r; await fn(); } else await sleep(200);
        }
      },
    };
    return () => { (window as any).__landvasGame = undefined; };
  }, []);
  const finishRound = (log: unknown) => {
    boardSolver.current = null;
    boards.current.push({ t0: Math.round(roundStart.current), log });
    if (boards.current.length >= s.rounds) { done.current = true; onDone({ boards: boards.current }); return; }
    setBetween(true);
    setTimeout(() => {
      roundStart.current = performance.now() - t0.current;
      setRound((r) => r + 1);
      setBetween(false);
    }, 1200);
  };
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="gutter flex items-center gap-3 pb-2 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <div className="min-w-0 flex-1">
          <div className="eyebrow" style={{ color: info.color }}>PvP · {s.matched ? 'rival found' : 'your rival plays the same boards'}</div>
          <h1 className="font-display text-lg font-semibold">{info.name}</h1>
        </div>
        <span className="glass flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-bold tnum" data-testid="pvp-round">Round {Math.min(round + 1, s.rounds)} of {s.rounds}</span>
      </header>
      <main className="gutter flex flex-1 flex-col items-center justify-center pb-8">
        {between ? (
          <div className="grid justify-items-center gap-2 text-center">
            <Timer className="h-8 w-8 text-accent-2" />
            <div className="font-display text-2xl font-bold">Round {round + 2}</div>
            <p className="text-sm text-muted">Get ready…</p>
          </div>
        ) : (
          <G key={round} seed={pvpRoundSeed(Number(s.seed), round)} now={() => performance.now() - t0.current - roundStart.current}
            onDone={finishRound} registerSolver={(fn) => { boardSolver.current = fn; }} />
        )}
      </main>
    </div>
  );
}

function MatchCard({ m, big, onClose }: { m: PvpMatch; big?: boolean; onClose?(): void }) {
  const info = PVP_INFO[m.game];
  const label = m.status === 'done' ? (m.result === 'won' ? 'You won' : m.result === 'lost' ? 'Your rival won' : 'Draw')
    : m.status === 'waiting' ? 'Waiting for your rival' : m.status === 'expired' ? 'No rival played' : 'In progress';
  const earned = m.you?.ink ?? 0;
  const withheld = m.you?.reward?.withheld ?? m.you?.bonus?.withheld;
  return (
    <div className={cn('glass grid gap-3 rounded-[22px] p-4', big && 'mb-4 p-5', m.result === 'won' && 'ring-2 ring-gold/60')} data-testid={big ? 'pvp-result' : 'pvp-match'}>
      <div className="flex flex-wrap items-center gap-3">
        {m.result === 'won' ? <Crown className="h-6 w-6 text-gold" /> : <Swords className="h-6 w-6 text-muted" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full px-2 py-0.5 text-[11px] font-extrabold" style={{ background: `${info.color}22`, color: info.color }}>{info.name}</span>
            <span className={cn(big ? 'font-display text-xl' : 'text-sm', 'font-semibold', m.result === 'won' ? 'text-ok' : m.result === 'lost' ? 'text-bad' : '')}>{label}</span>
          </div>
          <div className="text-xs text-muted">{m.rounds} rounds · {timeAgo(m.created_at)}{m.you?.avg_quality != null && m.you.valid ? ` · your rounds averaged ${m.you.avg_quality}%` : ''}{m.you?.valid === false ? ' · your run couldn’t be verified' : ''}</div>
        </div>
        <div className="text-right font-display font-bold tnum">{earned > 0 ? `+${fmt(earned)}` : '0'} <span className="text-xs font-normal text-faint">Ink</span></div>
      </div>
      {(m.you?.rounds?.length ?? 0) > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-center text-xs tnum">
            <thead className="text-faint"><tr><th className="py-1 text-left font-semibold">Round</th>{m.you.rounds!.map((_, i) => <th key={i} className="font-semibold">{i + 1}</th>)}</tr></thead>
            <tbody>
              <tr><td className="py-1 text-left font-semibold">You</td>{m.you.rounds!.map((r, i) => <td key={i} className={cn(m.per_round?.[i] === 'you' && 'font-bold text-ok')}>{fmt(r.score)} <span className="text-faint">· {r.quality}%</span></td>)}</tr>
              {m.rival && <tr><td className="py-1 text-left font-semibold">Rival</td>{(m.rival.rounds ?? []).map((r, i) => <td key={i} className={cn(m.per_round?.[i] === 'rival' && 'font-bold text-bad')}>{fmt(Number(r.score))}</td>)}</tr>}
            </tbody>
          </table>
        </div>
      )}
      {(m.you?.bonus?.hits?.length ?? 0) > 0 && m.you.bonus!.paid > 0 && <div className="text-xs text-gold">Bonus +{fmt(m.you.bonus!.paid)} Ink for how well you played.</div>}
      {withheld && earned === 0 && <div className="text-xs text-warn">No Ink this time: {WITHHELD[withheld] ?? withheld.replace(/_/g, ' ')}.</div>}
      {big && m.status === 'waiting' && <p className="text-sm text-muted">Your rounds are locked in. Your rival plays the same boards — the result appears under Your matches as soon as they finish.</p>}
      {onClose && <Button variant="secondary" className="justify-self-start" onClick={onClose}>OK</Button>}
    </div>
  );
}

// Test-only sandbox (?e2e=1 or dev): plays every round locally and scores it with the server's validator.
export function PvpSandbox() {
  const [sp] = useSearchParams();
  const { game: g } = useParams();
  return <PvpSandboxRun key={`${g}?${sp.toString()}`} game={(g ?? 'turfwars') as PvpGame} seed={Number(sp.get('seed') ?? 13579)} rounds={Number(sp.get('rounds') ?? 3)} />;
}
function PvpSandboxRun({ game, seed, rounds }: { game: PvpGame; seed: number; rounds: number }) {
  const [result, setResult] = useState<unknown>(null);
  if (!(config.e2e || import.meta.env.DEV)) return null;
  const s: PvpStart = { match_id: 'sandbox', game, seed, rounds, started_at: '', expires_at: '', round_seconds: 90, matched: true, server_time: '' };
  if (result) return <main className="gutter mx-auto max-w-3xl py-6"><pre data-testid="sandbox-result" data-game={game} className="whitespace-pre-wrap text-xs">{JSON.stringify(result)}</pre></main>;
  return <Match s={s} onDone={(log) => { void import('../shared/pvp').then((m) => setResult(m.validatePvp(game, seed, rounds, log))); }} />;
}
