// /inkborn/playdate/:theirs — bring one of your Inkborn to play with someone else's. One co-op round
// of Picnic Party; you both earn a little Ink and bond, and a great round lays an egg for each of you
// (never the same kind).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { PlaydateFinish, PlaydateStart } from '../backend/types';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { cn } from '../lib/utils';
import { Button, ResourceIcon, Spinner } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { Arena } from '../space/SpaceGame';
import { CreatureView } from './CreatureView';
import { EGG_KINDS, EggArt } from './Eggs';
import { cleanGenome, type Genome } from './genome';
import { picnicParty } from './games/playdate';

type Phase = { k: 'pick' } | { k: 'count'; n: number; s: PlaydateStart } | { k: 'play'; s: PlaydateStart } | { k: 'done'; s: PlaydateStart; r: PlaydateFinish };
export type PlaydateState = { name: string; genome: Genome; owner: string; back?: string };

export default function PlaydateRoute() {
  const { theirs } = useParams();
  return <Playdate key={theirs} />;
}

function Playdate() {
  const { theirs = '' } = useParams();
  const loc = useLocation();
  const friend = (loc.state ?? null) as PlaydateState | null;
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = useOnboardedMe();
  const sanct = useQuery({ queryKey: ['sanctuaries'], queryFn: api.mySanctuaries, enabled: !!me });
  const [pick, setPick] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ k: 'pick' });
  const [busy, setBusy] = useState(false);
  const mine = sanct.data?.creatures ?? [];
  useEffect(() => { if (!pick && mine.length) setPick([...mine].sort((a, b) => b.bond - a.bond)[0].id); }, [mine.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const back = () => (friend?.back ? nav(friend.back) : nav(-1));

  const start = async () => {
    if (!pick) return;
    setBusy(true);
    try { const s = await api.playdateStart(pick, theirs); setPhase({ k: 'count', n: 3, s }); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (phase.k !== 'count') return;
    const t = setTimeout(() => setPhase(phase.n > 1 ? { ...phase, n: phase.n - 1 } : { k: 'play', s: phase.s }), 700);
    return () => clearTimeout(t);
  }, [phase]);
  const finish = async (s: PlaydateStart, score: number) => {
    try {
      const r = await api.playdateFinish(s.session, score);
      invalidateGame(qc); void qc.invalidateQueries({ queryKey: ['ink-eggs'] }); void qc.invalidateQueries({ queryKey: ['sanctuaries'] });
      if (r.egg) confettiCannons();
      setPhase({ k: 'done', s, r });
    } catch (e) { toast.error(toGameError(e).message); setPhase({ k: 'pick' }); }
  };
  const make = useMemo(() => (phase.k === 'play' ? (seed: number, W: number, H: number, input: Parameters<typeof picnicParty>[3]) =>
    picnicParty(seed, W, H, input, cleanGenome(phase.s.mine.genome), cleanGenome(phase.s.theirs.genome)) : null), [phase]);

  if (!me || sanct.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#0E2A18]"><Spinner /></div>;
  if (phase.k === 'play' && make) return <Arena key={phase.s.session} make={make} seed={phase.s.seed} seconds={phase.s.seconds} onEnd={(sc) => void finish(phase.s, sc)} />;
  const theirName = phase.k !== 'pick' ? phase.s.theirs.name : friend?.name ?? 'their Inkborn';
  const theirGenome = phase.k !== 'pick' ? phase.s.theirs.genome : friend?.genome;
  const owner = phase.k !== 'pick' ? phase.s.theirs.owner.username : friend?.owner;
  return (
    <div className="fixed inset-0 overflow-y-auto bg-[radial-gradient(120%_80%_at_50%_0%,#3E8F4E_0%,#0E2A18_75%)] text-white" data-testid="playdate">
      <div className="mx-auto grid min-h-full max-w-md content-center gap-4 p-5 pb-[max(20px,env(safe-area-inset-bottom,0px))] pt-[max(20px,env(safe-area-inset-top,0px))]">
        <button onClick={back} className="flex w-fit items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold"><ArrowLeft className="h-4 w-4" /> Back</button>
        <AnimatePresence mode="wait">
          {phase.k === 'pick' && (
            <motion.div key="pick" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="grid justify-items-center gap-3 text-center">
              <div className="text-xs font-bold uppercase tracking-[0.3em] text-white/60">Playdate</div>
              <h1 className="font-display text-3xl font-bold">Picnic Party 🧺</h1>
              <div className="flex items-end justify-center gap-2">
                {pick && <div className="grid justify-items-center"><CreatureView genome={cleanGenome(mine.find((c) => c.id === pick)!.genome)} size={110} state="happy" /><span className="text-xs text-white/70">yours</span></div>}
                <span className="pb-10 text-2xl">💞</span>
                {theirGenome && <div className="grid justify-items-center"><CreatureView genome={cleanGenome(theirGenome)} size={110} state="happy" /><span className="text-xs text-white/70">{theirName}{owner ? ` · @${owner}` : ''}</span></div>}
              </div>
              <p className="rounded-2xl bg-white/10 p-3 text-sm text-white/85">Drag (or WASD/arrows) to lead your Inkborn to the snacks — {theirName} plays along. Eat at the same moment for a <b>team combo</b>, meet up for a <b>high-five</b>, dodge the bees. Score well and you <b>both get an egg</b> — a different kind each.</p>
              {mine.length ? (
                <>
                  <div className="text-xs font-bold uppercase tracking-wider text-white/60">Who’s coming along?</div>
                  <div className="no-scrollbar flex w-full gap-2 overflow-x-auto pb-1">
                    {mine.map((c) => (
                      <button key={c.id} onClick={() => setPick(c.id)} className={cn('grid w-20 shrink-0 justify-items-center rounded-2xl p-1.5 text-[11px] font-bold', pick === c.id ? 'bg-white/25 ring-2 ring-white' : 'bg-white/10')} data-testid="playdate-pick">
                        <CreatureView genome={cleanGenome(c.genome)} size={56} />{c.name}
                      </button>
                    ))}
                  </div>
                  <Button variant="rainbow" size="lg" loading={busy} disabled={!pick} onClick={start} data-testid="playdate-start"><Play className="h-5 w-5" /> Start the playdate</Button>
                </>
              ) : (
                <><p className="text-sm text-white/75">You need an Inkborn of your own first.</p><Button variant="rainbow" onClick={() => nav('/inkborn/create')}>Draw one</Button></>
              )}
            </motion.div>
          )}
          {phase.k === 'count' && <motion.div key={`c${phase.n}`} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="py-24 text-center font-display text-8xl font-black">{phase.n}</motion.div>}
          {phase.k === 'done' && (
            <motion.div key="done" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="grid justify-items-center gap-3 text-center" data-testid="playdate-done">
              <div className="text-sm uppercase tracking-widest text-white/60">Team score</div>
              <div className="font-display text-6xl font-black">{phase.r.score}</div>
              <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 font-bold"><ResourceIcon r="ink" className="h-5 w-5" /> +{phase.r.paid} Ink · 💞 +2 bond each</div>
              {phase.r.host_tip > 0 && <div className="text-xs text-white/65">@{phase.s.theirs.owner.username} got a +{phase.r.host_tip} Ink thank-you for hosting.</div>}
              {phase.r.egg ? (
                <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3, type: 'spring' }} className="grid justify-items-center gap-1 rounded-3xl bg-white/10 p-4" data-testid="playdate-egg">
                  <EggArt kind={phase.r.egg.kind} shell={phase.r.egg.shell} size={90} wobble />
                  <div className="font-display text-xl font-bold">You got a {EGG_KINDS[phase.r.egg.kind].name}!</div>
                  <div className="text-xs text-white/70">{EGG_KINDS[phase.r.egg.kind].blurb} It hatches in about an hour — find it on your Inkborn page.</div>
                  {phase.r.their_egg && <div className="text-xs text-white/70">@{phase.s.theirs.owner.username} got a {EGG_KINDS[phase.r.their_egg.kind as keyof typeof EGG_KINDS]?.name ?? 'different egg'}.</div>}
                </motion.div>
              ) : (
                <p className="max-w-xs text-xs text-white/65">{{
                  score: `Score ${phase.s.egg_score}+ together for an egg.`,
                  daily: 'You’ve had all of today’s playdate eggs — more tomorrow.',
                  pair: `${phase.s.mine.name} and ${phase.s.theirs.name} had eggs together recently — try a different pair.`,
                }[phase.r.no_egg_because ?? 'score'] ?? ''}</p>
              )}
              <div className="flex gap-2">
                <Button variant="rainbow" onClick={() => setPhase({ k: 'pick' })}><RotateCcw className="h-4 w-4" /> Again</Button>
                {phase.r.egg ? <Button variant="secondary" onClick={() => nav('/inkborn')}>See my eggs</Button> : <Button variant="secondary" onClick={back}>Back</Button>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
