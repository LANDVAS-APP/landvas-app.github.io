// 🤜 Bump (the apps): knock your phone against a friend's. Both phones feel the knock; the server pairs the two by the
// moment and the place (both out on real GPS, right next to each other) — friends and party mates only. Then hand them
// a gift of your Ink on the spot. Four or more of one party bumping together: the whole party gets a Golden Hour.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { askMotion } from '../enchant/living';
import { enableGps, useExplorer } from '../explorer/explorer';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { cn } from '../lib/utils';
import { hit, play } from '../native/feel';
import { Button, PlayerAvatar } from '../ui';
import type { BumpResult } from './types';

/** a knock: a sharp jolt of the whole phone that isn't a spin (a flick or a turn) — strength 0.3..1, or null */
export function detectKnock(e: { acc: number; rr: number }, last: number, now: number, gap = 900): number | null {
  if (now - last < gap) return null;
  if (e.acc < 13 || e.rr > 260) return null;
  return Math.max(0.3, Math.min(1, e.acc / 40));
}

export function useKnock(on: ((strength: number) => void) | null) {
  const cb = useRef(on); cb.current = on;
  useEffect(() => {
    if (!on) return;
    let last = 0;
    const f = (ev: DeviceMotionEvent) => {
      const a = ev.acceleration, g = ev.accelerationIncludingGravity, r = ev.rotationRate;
      const acc = a && a.x != null ? Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0) : g ? Math.abs(Math.hypot(g.x ?? 0, g.y ?? 0, g.z ?? 0) - 9.81) : 0;
      const rr = Math.hypot(r?.alpha ?? 0, r?.beta ?? 0, r?.gamma ?? 0);
      const now = performance.now();
      const s = detectKnock({ acc, rr }, last, now);
      if (s != null) { last = now; cb.current?.(s); }
    };
    addEventListener('devicemotion', f);
    return () => removeEventListener('devicemotion', f);
  }, [!!on]); // eslint-disable-line react-hooks/exhaustive-deps
}

type Phase = 'idle' | 'armed' | 'sending' | 'matched' | 'missed';

export function BumpCard() {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const mine = useQuery({ queryKey: ['bump-mine'], queryFn: api.bumpMine, enabled: !!me, staleTime: 30_000 });
  const gps = useExplorer((s) => s.gps);
  const [phase, setPhase] = useState<Phase>('idle');
  const [res, setRes] = useState<BumpResult | null>(null);
  const [gave, setGave] = useState<number | null>(null);
  const busy = useRef(false);
  const m = mine.data;
  const onGps = gps === 'on' || !!m?.gps;

  const knock = async (strength: number | null) => {
    if (busy.current) return;
    busy.current = true;
    hit('heavy');
    setPhase('sending'); setGave(null);
    try {
      let r = await api.bumpKnock(strength);
      // (the friend's knock may land a moment after yours: ask twice more)
      for (const wait of [700, 1100]) {
        if (r.matched || r.gone) break;
        await new Promise((ok) => setTimeout(ok, wait));
        r = await api.bumpCheck(r.id);
      }
      setRes(r);
      if (r.golden) { play([[0, 'heavy'], [120, 'heavy'], [260, 'heavy'], [480, 'success']]); toast.success('🎉 A party pile-up! Everyone in your party has a Golden Hour'); }
      if (r.matched) { play([[0, 'heavy'], [140, 'success']]); setPhase('matched'); void mine.refetch(); }
      else { setPhase('missed'); setTimeout(() => setPhase((p) => (p === 'missed' ? 'armed' : p)), 2600); }
    } catch (e) {
      toast.error(toGameError(e).message);
      setPhase('armed');
    } finally { busy.current = false; }
  };
  useKnock(phase === 'armed' ? (s) => void knock(s) : null);

  const gift = async (n: number) => {
    if (!res?.pair) return;
    try {
      const r = await api.bumpGift(res.pair, n);
      setGave(r.ink);
      play([[0, 'medium'], [90, 'success']]);
      toast.success(`🎁 You gave @${r.to.username} ${r.ink} Ink`);
      invalidateGame(qc); void mine.refetch();
    } catch (e) { toast.error(toGameError(e).message); }
  };
  const amounts = [25, 50, 100, 200].filter((n) => n >= (m?.gift_min ?? 10) && n <= (m?.gift_max ?? 200));

  return (
    <div className="lvo-card" data-testid="bump-card">
      <div className="flex items-start gap-3">
        <span className="lvo-emoji" aria-hidden>🤜</span>
        <div className="min-w-0 flex-1">
          <h3>Bump</h3>
          <p>Knock phones with a friend or party mate — out on your real location, right next to each other. Then hand them a gift of Ink on the spot.
            {' '}{m?.crowd ?? 4}+ of one party bumping together gives the whole party a Golden Hour.</p>
        </div>
      </div>
      {!onGps ? (
        <Button className="mt-3 w-full" variant="primary" onClick={() => enableGps()} data-testid="bump-gps">📍 Turn on my location to bump</Button>
      ) : phase === 'idle' ? (
        <Button className="mt-3 w-full" variant="rainbow" onClick={() => { void askMotion(); setPhase('armed'); }} data-testid="bump-ready">🤜 Get ready to bump</Button>
      ) : (
        <div className="mt-3 grid gap-2">
          <AnimatePresence mode="wait">
            <motion.div key={phase} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className={cn('lvo-bump-stage', phase)} data-testid="bump-stage" data-phase={phase}>
              {phase === 'armed' && <><span className="lvo-bump-fists" aria-hidden>🤜🤛</span><b>Knock your phones together</b><i>Hold it firmly and bump the backs or the edges</i></>}
              {phase === 'sending' && <><span className="lvo-bump-fists" aria-hidden>💥</span><b>Bump!</b><i>Finding who you bumped…</i></>}
              {phase === 'missed' && <><span className="lvo-bump-fists" aria-hidden>🤷</span><b>No one bumped back</b><i>Knock at the same moment — friends and party mates, both on location</i></>}
              {phase === 'matched' && res?.with && (
                <>
                  <PlayerAvatar p={{ ...res.with, accent_color: res.with.accent_color ?? undefined }} size={52} />
                  <b data-testid="bump-with">You bumped @{res.with.username}!</b>
                  {gave ? <i>🎁 You gave them {gave} Ink</i> : res.can_gift === false ? <i>You already gave them a gift for this bump</i>
                    : (m?.gifts_today ?? 0) >= (m?.gifts_per_day ?? 3) ? <i>You’ve given all your gifts for today</i>
                      : (
                        <div className="mt-1 flex flex-wrap justify-center gap-1.5" data-testid="bump-gifts">
                          {amounts.map((n) => <button key={n} className="lvo-chip" onClick={() => void gift(n)} data-testid={`bump-gift-${n}`}>🎁 {n} Ink</button>)}
                        </div>
                      )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" disabled={phase === 'sending'} onClick={() => void knock(null)} data-testid="bump-tap">👆 Tap to bump instead</Button>
            {phase === 'matched' ? <Button variant="ghost" onClick={() => setPhase('armed')} data-testid="bump-again">Again</Button>
              : <Button variant="ghost" onClick={() => setPhase('idle')}>Stop</Button>}
          </div>
          <p className="text-center text-[11px] text-white/45">“Tap to bump” works too: both of you tap at the same moment.</p>
        </div>
      )}
      {!!m?.recent.length && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-white/60" data-testid="bump-recent">
          <span className="font-bold">{m.bumps} bump{m.bumps === 1 ? '' : 's'} · lately:</span>
          {m.recent.slice(0, 6).map((r) => <span key={r.id} className="lvo-chip soft">@{r.username}</span>)}
        </div>
      )}
    </div>
  );
}
