// Inkborn eggs: what a great playdate lays (one for each owner, never the same kind). They wobble
// while they get ready, then hatch into a brand-new Inkborn mixed from both parents.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Egg as EggIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { InkEgg, Inkborn } from '../backend/types';
import { invalidateGame } from '../lib/queries';
import { Button, Dialog, inputCls } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { CreatureView } from './CreatureView';
import { cleanGenome } from './genome';
import { poll } from '../lib/poll';

export const EGG_KINDS: Record<InkEgg['kind'], { name: string; blurb: string }> = {
  speckled: { name: 'Speckled egg', blurb: 'Freckled all over, like a quail’s.' },
  swirl: { name: 'Swirl egg', blurb: 'Colours spiral round it like ink in water.' },
  starry: { name: 'Starry egg', blurb: 'Tiny stars twinkle on the shell.' },
  striped: { name: 'Striped egg', blurb: 'Bold bands, like a little planet.' },
  glimmer: { name: 'Glimmer egg', blurb: 'It shimmers when the light catches it.' },
  cosmic: { name: 'Cosmic egg', blurb: 'Deep and dark, full of galaxies.' },
};

/** An egg, drawn from its kind and shell colours. */
export function EggArt({ kind, shell, size = 80, wobble = false }: { kind: InkEgg['kind']; shell: { a: string; b: string; c: string }; size?: number; wobble?: boolean }) {
  const id = `egg-${kind}-${shell.a.replace('#', '')}-${size}`;
  const dark = kind === 'cosmic';
  return (
    <motion.svg width={size} height={size * 1.2} viewBox="0 0 100 120" animate={wobble ? { rotate: [0, -7, 7, -4, 0] } : undefined} transition={wobble ? { duration: 1.1, repeat: Infinity, repeatDelay: 1.4 } : undefined} style={{ transformOrigin: '50% 90%' }} aria-hidden>
      <defs>
        <radialGradient id={`${id}-g`} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={dark ? 0.25 : 0.9} />
          <stop offset="35%" stopColor={dark ? '#2A1E5E' : shell.a} />
          <stop offset="100%" stopColor={dark ? '#05060F' : shell.b} />
        </radialGradient>
        <clipPath id={`${id}-c`}><path d="M50 4 C78 4 94 50 94 74 C94 100 74 116 50 116 C26 116 6 100 6 74 C6 50 22 4 50 4Z" /></clipPath>
      </defs>
      <path d="M50 4 C78 4 94 50 94 74 C94 100 74 116 50 116 C26 116 6 100 6 74 C6 50 22 4 50 4Z" fill={`url(#${id}-g)`} />
      <g clipPath={`url(#${id}-c)`} opacity="0.85">
        {kind === 'speckled' && Array.from({ length: 22 }, (_, i) => <circle key={i} cx={(i * 37) % 90 + 5} cy={(i * 53) % 110 + 6} r={2 + (i % 3)} fill={shell.c} opacity="0.7" />)}
        {kind === 'swirl' && <path d="M10 60 C30 30 70 90 90 50 M8 85 C35 60 65 110 92 80 M14 35 C40 15 60 55 86 25" stroke={shell.c} strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.7" />}
        {kind === 'starry' && Array.from({ length: 9 }, (_, i) => <text key={i} x={(i * 29) % 80 + 10} y={(i * 41) % 95 + 18} fontSize="12" fill="#FFF6B0">★</text>)}
        {kind === 'striped' && [30, 55, 80].map((y) => <rect key={y} x="0" y={y} width="100" height="9" fill={shell.c} opacity="0.75" />)}
        {kind === 'glimmer' && <rect x="-20" y="0" width="30" height="140" fill="#ffffff" opacity="0.45" transform="rotate(25 50 60)"><animate attributeName="x" values="-40;120" dur="2.4s" repeatCount="indefinite" /></rect>}
        {kind === 'cosmic' && <>{Array.from({ length: 30 }, (_, i) => <circle key={i} cx={(i * 31) % 92 + 4} cy={(i * 47) % 112 + 4} r={i % 5 === 0 ? 1.6 : 0.8} fill="#fff" />)}<ellipse cx="55" cy="70" rx="30" ry="10" fill={shell.a} opacity="0.35" transform="rotate(-25 55 70)" /></>}
      </g>
      <ellipse cx="34" cy="30" rx="9" ry="14" fill="#fff" opacity="0.35" transform="rotate(-20 34 30)" />
    </motion.svg>
  );
}

const left = (iso: string, now: number) => {
  const s = Math.max(0, (new Date(iso).getTime() - now) / 1000);
  return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

/** Your eggs, on the Inkborn page. */
export function EggsPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['ink-eggs'], queryFn: api.inkEggs, refetchInterval: poll(30_000) });
  const [now, setNow] = useState(Date.now());
  const [hatching, setHatching] = useState<InkEgg | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [born, setBorn] = useState<Inkborn | null>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const eggs = (q.data ?? []).filter((e) => !e.hatched);
  const fresh = eggs.filter((e) => !e.seen).length;
  useEffect(() => { if (fresh) { toast(`🥚 ${fresh === 1 ? 'A new egg' : `${fresh} new eggs`} from a playdate!`); void api.inkEggsSeen().catch(() => {}); } }, [fresh]);
  if (!eggs.length) return null;
  const hatch = async () => {
    if (!hatching) return;
    setBusy(true);
    try {
      const r = await api.inkEggHatch(hatching.id, name.trim());
      setHatching(null); setBorn(r.inkborn); confettiCannons();
      void qc.invalidateQueries({ queryKey: ['ink-eggs'] }); void qc.invalidateQueries({ queryKey: ['sanctuaries'] }); invalidateGame(qc);
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return (
    <section className="mb-8" data-testid="eggs">
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold"><EggIcon className="h-5 w-5" /> Eggs <span className="text-sm font-normal text-muted">from playdates</span></h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {eggs.map((e) => {
          const ready = e.ready || new Date(e.hatch_at).getTime() <= now;
          return (
            <div key={e.id} className="glass grid justify-items-center gap-1 rounded-3xl p-3 text-center" data-testid="egg">
              <EggArt kind={e.kind} shell={e.shell} size={70} wobble={ready} />
              <div className="font-display text-sm font-semibold">{EGG_KINDS[e.kind].name}</div>
              <div className="text-[11px] text-muted">{e.parents.map((p) => p.name).join(' × ')}</div>
              {e.mutated && <div className="text-[10px] font-bold text-[#B69CFF]">✨ something unusual inside</div>}
              {ready ? <Button size="sm" variant="rainbow" onClick={() => { setName(''); setHatching(e); }} data-testid="hatch">Hatch!</Button>
                : <div className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold tnum">hatches in {left(e.hatch_at, now)}</div>}
            </div>
          );
        })}
      </div>
      <Dialog open={!!hatching} onOpenChange={(o) => !o && setHatching(null)} title="It’s hatching! 🥚" description={hatching ? `A baby of ${hatching.parents.map((p) => p.name).join(' and ')}. What will you call it?` : undefined}>
        <div className="grid gap-3">
          <input className={inputCls} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Name your Inkborn" data-testid="hatch-name" />
          <Button variant="rainbow" loading={busy} disabled={!name.trim()} onClick={hatch} data-testid="hatch-go">Hatch</Button>
        </div>
      </Dialog>
      <AnimatePresence>
        {born && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-6" onClick={() => setBorn(null)} data-testid="hatched">
            <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="grid justify-items-center gap-2 text-center text-white">
              <CreatureView genome={cleanGenome(born.genome)} size={200} state="happy" />
              <div className="font-display text-3xl font-black">Welcome, {born.name}!</div>
              <div className="text-sm text-white/75">{born.habitat_id ? 'They’ve moved into your starter sanctuary.' : 'Your sanctuaries are full — make room and they’ll move in.'}</div>
              <Button variant="rainbow" onClick={() => setBorn(null)}>Hello!</Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
