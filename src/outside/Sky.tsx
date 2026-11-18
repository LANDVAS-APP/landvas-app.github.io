// 🌠 The real sky calendar (the apps): tonight's real sky where your explorer is — a meteor shower (Explorer's Eyes drops
// twice the sky treasures), the Moon (a full moon makes Genie wishes moon wishes), and the ISS's passes overhead. While
// the station is up over you, it drops a supply capsule: catch it before it's gone.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { hit, play } from '../native/feel';
import { useTicker } from '../play/common';
import type { SkyNow } from './types';

export const SKY_KEY = ['sky-now'];
const MOONS = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
/** the Moon's phase as people say it */
export function moonName(p: number) {
  if (p < 0.03 || p > 0.97) return 'New moon';
  if (p < 0.22) return 'Waxing crescent';
  if (p < 0.28) return 'First quarter';
  if (p < 0.47) return 'Waxing gibbous';
  if (p < 0.53) return 'Full moon';
  if (p < 0.72) return 'Waning gibbous';
  if (p < 0.78) return 'Last quarter';
  return 'Waning crescent';
}
const BY_NAME: Record<string, number> = { 'New moon': 0, 'Waxing crescent': 1, 'First quarter': 2, 'Waxing gibbous': 3, 'Full moon': 4, 'Waning gibbous': 5, 'Last quarter': 6, 'Waning crescent': 7 };
/** its picture (the same phase as its name) */
export const moonEmoji = (p: number) => MOONS[BY_NAME[moonName(p)]];
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayOf = (iso: string) => {
  const d = new Date(iso), t = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, t)) return 'Today';
  if (same(d, new Date(t.getTime() + 86_400_000))) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

export function useSky() {
  const me = useOnboardedMe();
  return useQuery<SkyNow>({
    queryKey: SKY_KEY, queryFn: api.skyNow, enabled: !!me, staleTime: 60_000,
    // (look again every minute while a pass is near or on, every ten otherwise)
    refetchInterval: (q) => {
      const p = q.state.data?.passes?.[0];
      return p && Date.parse(p.rise) - Date.now() < 15 * 60_000 ? 30_000 : 10 * 60_000;
    },
  });
}

export function SkyCard() {
  const q = useSky();
  const s = q.data;
  useTicker(1000);
  if (!s || !s.enabled) return null;
  const nextShowers = s.showers.filter((x) => !s.shower || x.id !== s.shower.id).slice(0, 3);
  const passes = s.passes.filter((p) => Date.parse(p.set) > Date.now()).slice(0, 4);
  return (
    <div className="lvo-card" data-testid="sky-card">
      <div className="flex items-start gap-3">
        <span className="lvo-emoji" aria-hidden>🌠</span>
        <div className="min-w-0 flex-1"><h3>Tonight’s real sky</h3><p>Real showers, the real Moon and the real space station over where your explorer is.</p></div>
      </div>
      {s.capsule && <Capsule until={s.capsule.until} caught={s.capsule.caught} />}
      <div className="mt-3 grid gap-2">
        {s.shower ? (
          <div className="lvo-row hot" data-testid="sky-shower">
            <span className="text-2xl">☄️</span>
            <span className="min-w-0 flex-1"><b>The {s.shower.name} are on!</b><i>Up to {s.shower.zhr} meteors an hour from {s.shower.radiant} at their peak — Explorer’s Eyes drops twice the sky treasures</i></span>
            <Link className="lvo-go" to="/eyes">Look up</Link>
          </div>
        ) : null}
        <div className={`lvo-row${s.moon.full ? ' hot' : ''}`} data-testid="sky-moon">
          <span className="text-2xl">{moonEmoji(s.moon.phase)}</span>
          <span className="min-w-0 flex-1"><b>{moonName(s.moon.phase)}</b>
            <i>{s.moon.full ? `Genie wishes are moon wishes tonight — ×${s.moon.wish_mult}` : `Next full moon: ${dayOf(s.moon.next_full)} — Genie wishes become moon wishes (×${s.moon.wish_mult})`}</i></span>
        </div>
        <div className="lvo-row" data-testid="sky-iss">
          <span className="text-2xl">🛰️</span>
          <span className="min-w-0 flex-1"><b>The ISS over you</b>
            <i>{!s.where ? 'Turn on your location (or place your explorer) to see its passes.' : !s.iss_data ? 'Its pass times are on their way.' : passes.length ? 'While it’s up, it drops a supply capsule to catch.' : 'No passes over you in the next day and a half.'}</i></span>
        </div>
        {passes.length > 0 && (
          <div className="grid gap-1 pl-10" data-testid="sky-passes">
            {passes.map((p) => {
              const now = Date.parse(p.rise) <= Date.now();
              return <div key={p.rise} className={`flex justify-between rounded-lg px-2 py-1 text-[12px] ${now ? 'bg-[#22E3FF]/15 font-black text-[#9FF3FF]' : 'bg-white/[0.04] text-white/75'}`}>
                <span>{now ? 'Up now' : `${dayOf(p.rise)} ${clock(p.rise)}`}</span><span>{Math.round((Date.parse(p.set) - Date.parse(p.rise)) / 60_000)} min · up to {Math.round(p.max_elev)}°</span>
              </div>;
            })}
          </div>
        )}
        {nextShowers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-10 text-[11px] text-white/60" data-testid="sky-next">
            {nextShowers.map((x) => <span key={x.id} className="lvo-chip soft">☄️ {x.name} · {x.peak ? dayOf(x.peak) : ''}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

/** the ISS's supply capsule, falling: tap it before the station sets */
function Capsule({ until, caught }: { until: string; caught: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<string | null>(null);
  const left = Math.max(0, Math.round((Date.parse(until) - Date.now()) / 1000));
  const grab = async () => {
    if (busy || got) return;
    setBusy(true); hit('heavy');
    try {
      const r = await api.skyCapsuleCatch();
      const what = r.ticket ? 'a Rare+ roll ticket!' : r.luck ? `+${r.luck} Luck` : `+${r.ink ?? 0} Ink`;
      setGot(what);
      play([[0, 'heavy'], [110, 'heavy'], [260, 'success']]);
      toast.success(`🛰️ Caught the ISS’s capsule — ${what}`);
      invalidateGame(qc); void qc.invalidateQueries({ queryKey: SKY_KEY });
    } catch (e) { toast.error(toGameError(e).message); void qc.invalidateQueries({ queryKey: SKY_KEY }); }
    finally { setBusy(false); }
  };
  return (
    <div className="lvo-capsule mt-3" data-testid="sky-capsule">
      <div className="text-center"><b>🛰️ The ISS is right over you</b><i>It dropped a supply capsule — catch it! {left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left` : ''}</i></div>
      <AnimatePresence>
        {!got && !caught && (
          <motion.button key="cap" className="lvo-capsule-pod" onClick={() => void grab()} disabled={busy} aria-label="Catch the capsule" data-testid="sky-capsule-catch"
            initial={{ y: -60, rotate: -20 }} animate={{ y: [-60, 40, 36], rotate: [-20, 8, 0] }} exit={{ scale: 0, opacity: 0 }} transition={{ duration: 2.2, ease: 'easeOut' }}>
            📦<span>🪂</span>
          </motion.button>
        )}
      </AnimatePresence>
      {(got || caught) && <div className="text-center font-black text-[#7CFFB2]" data-testid="sky-capsule-got">{got ? `You got ${got}` : '✅ You caught this pass’s capsule'}</div>}
    </div>
  );
}
