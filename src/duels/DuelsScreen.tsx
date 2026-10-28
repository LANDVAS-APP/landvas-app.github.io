// /duels — stake Ink on a head-to-head skill game. Both players get the same
// challenge; the server checks both runs and pays the winner the pot.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, Handshake, Swords, Timer, Trophy, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Duel, DuelFinish, DuelStart } from '../backend/types';
import { Page, PageHeader } from '../app/Shell';
import { config } from '../env';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { cn, fmt, timeAgo } from '../lib/utils';
import { DUEL_GAMES, DUEL_INFO, type DuelGame } from '../shared/pvp';
import { Button, Empty, Field, PlayerAvatar, ResourceIcon, Spinner, Tabs, inputCls } from '../ui';
import { DUEL_COMPONENTS } from './games';

type Phase = { k: 'lobby' } | { k: 'playing'; s: DuelStart; t0: number } | { k: 'checking' } | { k: 'result'; r: DuelFinish };

export default function DuelsScreen() {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const lobby = useQuery({ queryKey: ['duels'], queryFn: api.duelsLobby, enabled: !!me, refetchInterval: 15_000 });
  const [tab, setTab] = useState<'open' | 'new' | 'mine'>('open');
  const [phase, setPhase] = useState<Phase>({ k: 'lobby' });
  const solver = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    if (!(config.e2e || import.meta.env.DEV)) return;
    (window as any).__landvasGame = phase.k === 'playing' ? { autoSolve: () => solver.current?.() } : undefined;
  }, [phase.k]);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['duels'] }); invalidateGame(qc); };
  const play = (s: DuelStart) => setPhase({ k: 'playing', s, t0: performance.now() });
  const submit = async (s: DuelStart, log: unknown) => {
    setPhase({ k: 'checking' });
    try {
      const r = await api.duelFinish(s.duel_id, log);
      setPhase({ k: 'result', r });
    } catch (e) {
      toast.error(toGameError(e).message);
      setPhase({ k: 'lobby' });
    } finally { refresh(); }
  };

  if (!me || lobby.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  const cfg = lobby.data?.config;
  if (phase.k === 'playing') {
    const G = DUEL_COMPONENTS[phase.s.game];
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <header className="gutter flex items-center gap-3 pb-2 pt-[max(12px,env(safe-area-inset-top,0px))]">
          <div className="min-w-0 flex-1">
            <div className="eyebrow" style={{ color: DUEL_INFO[phase.s.game].color }}>Duel · {fmt(phase.s.stake)} Ink each</div>
            <h1 className="font-display text-lg font-semibold">{DUEL_INFO[phase.s.game].name}</h1>
          </div>
          <span className="glass flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-bold"><Swords className="h-4 w-4" /> {phase.s.role === 'challenger' ? 'You set the score' : 'Beat their score'}</span>
        </header>
        <main className="gutter flex flex-1 flex-col items-center justify-center pb-8">
          <G seed={Number(phase.s.seed)} now={() => performance.now() - phase.t0} onDone={(log) => void submit(phase.s, log)} registerSolver={(fn) => { solver.current = fn; }} />
        </main>
      </div>
    );
  }
  return (
    <Page>
      <PageHeader eyebrow="Player vs player" title={<span className="flex items-center gap-2"><Swords className="h-7 w-7 text-hot" /> Duels</span>}>
        Stake Ink on a head-to-head skill game. You both get the exact same challenge, the server checks both runs, and the higher score takes the pot. Nobody sees the score to beat until both have played.
      </PageHeader>
      {phase.k === 'checking' && <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line p-4 text-sm text-muted"><Spinner /> Checking your run…</div>}
      {phase.k === 'result' && <Result r={phase.r} onClose={() => setPhase({ k: 'lobby' })} />}
      {!cfg?.enabled ? (
        <Empty icon={<Swords className="h-6 w-6" />} title="Duels are coming soon">The arena isn’t open yet. Check the bell for updates.</Empty>
      ) : (
        <>
          {lobby.data?.record && (
            <div className="mb-4 flex flex-wrap gap-2 text-sm">
              <span className="glass rounded-full px-3 py-1.5 tnum"><Trophy className="mr-1 inline h-4 w-4 text-gold" />{lobby.data.record.won} won</span>
              <span className="glass rounded-full px-3 py-1.5 tnum">{lobby.data.record.lost} lost</span>
              <span className="glass rounded-full px-3 py-1.5 tnum">{lobby.data.record.draws} draws</span>
              <span className={cn('glass rounded-full px-3 py-1.5 font-bold tnum', lobby.data.record.net_ink >= 0 ? 'text-ok' : 'text-bad')}>{lobby.data.record.net_ink >= 0 ? '+' : ''}{fmt(lobby.data.record.net_ink)} Ink overall</span>
            </div>
          )}
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mb-4" items={[
            { value: 'open', label: `Open challenges (${lobby.data?.open.length ?? 0})` },
            { value: 'new', label: 'Start a duel' },
            { value: 'mine', label: 'My duels' },
          ]} />
          {tab === 'open' && <OpenList duels={lobby.data?.open ?? []} balance={Number(me.balances.ink)} onPlay={play} />}
          {tab === 'new' && <NewDuel cfg={cfg} balance={Number(me.balances.ink)} onPlay={play} />}
          {tab === 'mine' && <MyDuels duels={lobby.data?.mine ?? []} meId={me.profile.id} onChange={refresh} />}
          <p className="mt-6 text-xs text-faint">Only in-game Ink is ever at stake. {cfg.fee_pct ? `The arena keeps ${cfg.fee_pct}% of each pot.` : 'The winner takes the whole pot.'} A tie on score goes to the faster run; an exact tie refunds both players. Up to {cfg.daily_limit} duels a day.</p>
        </>
      )}
    </Page>
  );
}

function GameBadge({ g }: { g: DuelGame }) {
  return <span className="rounded-full px-2 py-0.5 text-[11px] font-extrabold" style={{ background: `${DUEL_INFO[g].color}22`, color: DUEL_INFO[g].color }}>{DUEL_INFO[g].name}</span>;
}

function OpenList({ duels, balance, onPlay }: { duels: Duel[]; balance: number; onPlay(s: DuelStart): void }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!duels.length) return <Empty icon={<Handshake className="h-6 w-6" />} title="No open challenges">Start a duel and other players can take you on.</Empty>;
  return (
    <div className="grid gap-2" data-testid="duel-open-list">
      {duels.map((d) => (
        <div key={d.id} className={cn('glass flex flex-wrap items-center gap-3 rounded-2xl p-4', d.invited && 'ring-2 ring-gold/60')}>
          <PlayerAvatar p={d.challenger} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><Link to={`/u/${d.challenger.username}`} className="font-semibold hover:underline">@{d.challenger.username}</Link><GameBadge g={d.game} />{d.invited && <span className="text-xs font-bold text-gold">challenged you</span>}</div>
            <div className="text-xs text-muted">{timeAgo(d.created_at)} · {DUEL_INFO[d.game].tagline}</div>
          </div>
          <div className="text-right"><div className="flex items-center gap-1 font-display text-lg font-bold tnum"><ResourceIcon r="ink" /> {fmt(d.stake)}</div><div className="text-[11px] text-faint">win {fmt(d.stake * 2)}</div></div>
          <Button variant="rainbow" disabled={balance < d.stake} loading={busy === d.id} data-testid="duel-accept" onClick={async () => {
            setBusy(d.id);
            try { onPlay(await api.duelAccept(d.id)); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
          }}><Swords className="h-4 w-4" /> {balance < d.stake ? 'Not enough Ink' : 'Accept'}</Button>
        </div>
      ))}
    </div>
  );
}

function NewDuel({ cfg, balance, onPlay }: { cfg: NonNullable<Awaited<ReturnType<typeof api.duelsLobby>>['config']>; balance: number; onPlay(s: DuelStart): void }) {
  const games = DUEL_GAMES.filter((g) => cfg.games?.[g] !== false);
  const [game, setGame] = useState<DuelGame>(games[0] ?? 'turfwars');
  const [stake, setStake] = useState(Math.max(Number(cfg.min_stake), Math.min(50, Number(cfg.max_stake))));
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const info = DUEL_INFO[game];
  return (
    <form className="grid gap-4" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      try { onPlay(await api.duelCreate(game, stake, invite.trim() || null)); } catch (err) { toast.error(toGameError(err).message); } finally { setBusy(false); }
    }} data-testid="duel-new">
      <div className="grid gap-2 sm:grid-cols-2">
        {games.map((g) => (
          <button type="button" key={g} onClick={() => setGame(g)} aria-pressed={game === g} data-testid={`duel-game-${g}`}
            className={cn('glass rounded-2xl p-4 text-left transition', game === g ? 'ring-2' : 'opacity-80 hover:opacity-100')} style={game === g ? { boxShadow: `0 0 0 2px ${DUEL_INFO[g].color}` } : undefined}>
            <div className="font-display text-base font-semibold" style={{ color: DUEL_INFO[g].color }}>{DUEL_INFO[g].name}</div>
            <div className="text-xs text-muted">{DUEL_INFO[g].tagline}</div>
          </button>
        ))}
      </div>
      <ol className="grid gap-1.5 text-sm text-muted">{info.howTo.map((h, i) => <li key={i} className="flex gap-2"><span className="font-bold text-fg">{i + 1}.</span>{h}</li>)}</ol>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Your stake (${cfg.min_stake}–${cfg.max_stake} Ink)`} htmlFor="duel-stake">
          <input id="duel-stake" type="number" className={inputCls} min={cfg.min_stake} max={Math.min(Number(cfg.max_stake), balance)} value={stake} onChange={(e) => setStake(Math.round(Number(e.target.value)))} />
        </Field>
        <Field label="Challenge a player (optional)" htmlFor="duel-invite" hint="Leave empty to let anyone accept">
          <input id="duel-invite" className={inputCls} placeholder="username" value={invite} onChange={(e) => setInvite(e.target.value.replace(/^@/, ''))} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface/50 p-3 text-sm">
        <Timer className="h-4 w-4 text-accent-2" /><span className="text-muted">You play first and set the score. It stays secret until your opponent has played.</span>
        <span className="ml-auto flex items-center gap-1 font-bold tnum">Pot <ResourceIcon r="ink" /> {fmt(stake * 2 - Math.floor((stake * 2 * Number(cfg.fee_pct ?? 0)) / 100))}</span>
      </div>
      <Button type="submit" variant="rainbow" size="lg" disabled={stake > balance || stake < Number(cfg.min_stake)} loading={busy} data-testid="duel-create">
        <Swords className="h-4 w-4" /> {stake > balance ? 'Not enough Ink' : `Stake ${fmt(stake)} Ink and play`}
      </Button>
    </form>
  );
}

function MyDuels({ duels, meId, onChange }: { duels: Duel[]; meId: string; onChange(): void }) {
  if (!duels.length) return <Empty icon={<Swords className="h-6 w-6" />} title="No duels yet">Your duels and their results show up here.</Empty>;
  return (
    <div className="grid gap-2" data-testid="duel-mine">
      {duels.map((d) => {
        const myRole = d.challenger?.id === meId ? 'challenger' : 'opponent';
        const rival = myRole === 'challenger' ? d.opponent : d.challenger;
        const mineRun = d.runs?.find((r) => r.role === myRole);
        const them = d.status === 'done' ? d.runs?.find((r) => r.role !== myRole) : null;
        const label = { challenger_playing: 'Playing', open: 'Waiting for an opponent', opponent_playing: 'Opponent playing', done: d.result === 'won' ? 'You won' : d.result === 'lost' ? 'You lost' : 'Draw', cancelled: 'Cancelled — refunded', expired: 'Nobody accepted — refunded' }[d.status];
        return (
          <div key={d.id} className="glass flex flex-wrap items-center gap-3 rounded-2xl p-4">
            {d.result === 'won' ? <Crown className="h-6 w-6 text-gold" /> : <Swords className="h-6 w-6 text-muted" />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><GameBadge g={d.game} /><span className={cn('text-sm font-semibold', d.result === 'won' ? 'text-ok' : d.result === 'lost' ? 'text-bad' : '')}>{label}</span></div>
              <div className="text-xs text-muted tnum">
                {rival ? <>vs @{rival.username} · </> : d.invited ? <>for @{d.invited.username} · </> : null}
                {mineRun?.score != null && <>your score {fmt(mineRun.score)}</>}{them?.score != null && <> · theirs {fmt(them.score)}</>} · {timeAgo(d.created_at)}
              </div>
            </div>
            <div className="text-right font-display font-bold tnum">{d.status === 'done' && d.result === 'won' ? `+${fmt(d.payout)}` : `${fmt(d.stake)}`} <span className="text-xs font-normal text-faint">Ink</span></div>
            {d.status === 'open' && (
              <Button size="sm" variant="ghost" onClick={async () => { try { await api.duelCancel(d.id); toast.success('Duel cancelled — your stake is back'); onChange(); } catch (e) { toast.error(toGameError(e).message); } }}><X className="h-4 w-4" /> Cancel</Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Result({ r, onClose }: { r: DuelFinish; onClose(): void }) {
  const waiting = r.status === 'open';
  return (
    <div className={cn('glass mb-4 grid gap-2 rounded-[26px] p-5 text-center', r.result === 'won' && 'ring-2 ring-gold/70')} data-testid="duel-result">
      <div className="font-display text-2xl font-bold">{waiting ? 'Score locked in' : r.result === 'won' ? `You won ${fmt(r.payout)} Ink!` : r.result === 'lost' ? 'They beat you this time' : r.result === 'draw' ? 'Dead heat — stakes refunded' : 'Run recorded'}</div>
      <p className="text-sm text-muted tnum">Your score {fmt(r.score)}{!r.valid ? ' (this run couldn’t be verified, so it scored 0)' : ''}.{waiting ? ' Your challenge is now open — you’ll see the result under My duels when someone takes it on.' : ''}</p>
      <Button variant="secondary" className="justify-self-center" onClick={onClose}>OK</Button>
    </div>
  );
}

// Test-only sandbox (?e2e=1 or dev): plays a duel game locally and scores it with the server's validator.
export function DuelSandbox() {
  const [sp] = useSearchParams();
  const { game: g } = useParams();
  return <DuelSandboxRun key={`${g}?${sp.toString()}`} game={(g ?? 'turfwars') as DuelGame} seed={Number(sp.get('seed') ?? 13579)} />;
}
function DuelSandboxRun({ game, seed }: { game: DuelGame; seed: number }) {
  const t0 = useRef(performance.now());
  const solver = useRef<(() => Promise<void>) | null>(null);
  const [result, setResult] = useState<unknown>(null);
  useEffect(() => {
    (window as any).__landvasGame = { autoSolve: () => solver.current?.() };
    return () => { (window as any).__landvasGame = undefined; };
  }, []);
  if (!(config.e2e || import.meta.env.DEV)) return null;
  const G = DUEL_COMPONENTS[game];
  return (
    <main className="gutter mx-auto grid max-w-3xl justify-items-center gap-4 py-6">
      {result ? <pre data-testid="sandbox-result" data-game={game} className="text-xs">{JSON.stringify(result)}</pre> : (
        <G seed={seed} now={() => performance.now() - t0.current} onDone={(log) => { void import('../shared/pvp').then((m) => setResult(m.validateDuel(game, seed, log))); }}
          registerSolver={(fn) => { solver.current = fn; }} />
      )}
    </main>
  );
}
