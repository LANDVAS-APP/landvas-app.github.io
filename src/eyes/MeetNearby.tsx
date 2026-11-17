// 📡 Meet nearby, in first person: while you're out on GPS for real, other LANDVAS players out walking near you (who
// turned it on too) pop up — "out on GPS, a short walk away" — so you can know the person across the street plays too,
// and wave. Players exploring the game near you (not on GPS) show as that. Never a spot, never a direction: only a rough
// distance band. Off unless you turn it on, and turning it on means saying you're 18 or over (see the migration).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { MeetBand, MeetPlayer } from '../backend/types';
import { explorerSvg } from '../explorer/character';
import { useUi } from '../lib/store';
import { buzz } from '../native/native';

export const BAND: Record<MeetBand, string> = { here: 'right by you', walk: 'a short walk away', near: 'nearby', area: 'in your area' };
const VEH: Record<string, string> = { bike: '🚲', car: '🚗', jet: '🚀' };

function Face({ p, size = 40 }: { p: MeetPlayer; size?: number }) {
  const svg = useMemo(() => explorerSvg(p.explorer_style ?? null, p.accent_color || '#8B6BFF', size), [p.explorer_style, p.accent_color, size]);
  return <span className="grid shrink-0 place-items-center rounded-full bg-white/10" style={{ width: size + 6, height: size + 6 }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** the switch (also in Settings → Privacy): on means saying you're 18 or over, the first time */
export function MeetSwitch({ compact }: { compact?: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['meet-settings'], queryFn: api.meetSettings, staleTime: 30_000 });
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const s = q.data;
  if (!s || !s.available) return null;
  const set = async (on: boolean) => {
    setBusy(true);
    try { qc.setQueryData(['meet-settings'], await api.meetSet(on, adult)); void qc.invalidateQueries({ queryKey: ['meet-nearby'] }); }
    catch (e) { const g = toGameError(e); toast.error(g.code === 'adult_required' ? 'Tick the box to say you’re 18 or over first' : g.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid gap-2" data-testid="meet-switch">
      {!compact && <div className="text-[13px] font-bold">📡 Meet players nearby (on GPS)</div>}
      <p className="text-[12px] leading-snug opacity-75">
        While you’re out on GPS for real, players near you who turned this on too can see that you’re around — your name and
        roughly how far (right by you, a short walk, nearby), <b>never where you are</b> or which way. You see them the same way, and you can wave.
      </p>
      {s.enabled ? (
        <button className="w-fit rounded-xl border border-current/30 px-3 py-1.5 text-[12px] font-black" disabled={busy} onClick={() => void set(false)} data-testid="meet-off">Turn it off</button>
      ) : (
        <>
          {!s.adult && (
            <label className="flex items-start gap-2 text-[12px] font-semibold opacity-90">
              <input type="checkbox" className="mt-0.5" checked={adult} onChange={(e) => setAdult(e.target.checked)} data-testid="meet-adult" />
              I’m 18 or over. I’ll only meet people in busy public places, and tell someone where I’m going.
            </label>
          )}
          <button className="w-fit rounded-xl bg-[linear-gradient(135deg,#22E3FF,#8B5CFF)] px-3 py-1.5 text-[12px] font-black text-white disabled:opacity-50" disabled={busy || (!s.adult && !adult)} onClick={() => void set(true)} data-testid="meet-on">Turn it on</button>
        </>
      )}
    </div>
  );
}

export function MeetNearby({ onGps }: { onGps: boolean }) {
  const qc = useQueryClient();
  const haptics = useUi((s) => s.settings.haptics);
  const settings = useQuery({ queryKey: ['meet-settings'], queryFn: api.meetSettings, staleTime: 30_000, enabled: onGps });
  const on = !!settings.data?.enabled;
  const list = useQuery({ queryKey: ['meet-nearby'], queryFn: api.meetNearby, enabled: onGps && on, refetchInterval: 30_000, staleTime: 10_000 });
  const items = list.data?.items ?? [];
  const gps = items.filter((p) => p.how === 'gps'), game = items.filter((p) => p.how === 'game');
  const [panel, setPanel] = useState(false);
  const [pop, setPop] = useState<MeetPlayer | null>(null);
  const seen = useRef(new Set<string>());
  const [waved, setWaved] = useState<Set<string>>(new Set());
  // someone new out on GPS near you: they pop up
  useEffect(() => {
    const fresh = gps.find((p) => !seen.current.has(p.id));
    for (const p of gps) seen.current.add(p.id);
    if (fresh) { setPop(fresh); if (haptics) buzz('success'); }
  }, [list.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!pop) return; const t = setTimeout(() => setPop(null), 10_000); return () => clearTimeout(t); }, [pop]);
  const wave = async (p: MeetPlayer) => {
    try {
      const r = await api.meetWave(p.id);
      setWaved((s) => new Set(s).add(p.id));
      toast.success(r.again ? `You already waved at ${p.display_name || p.username} 👋` : `You waved at ${p.display_name || p.username} 👋`, { description: 'They’ll see it in their notifications.' });
      if (haptics) buzz('light');
    } catch (e) { const g = toGameError(e); toast(g.code === 'not_nearby' ? 'They’re not nearby any more' : g.message); void qc.invalidateQueries({ queryKey: ['meet-nearby'] }); }
  };
  if (!onGps || !settings.data?.available) return null;
  const name = (p: MeetPlayer) => p.display_name || p.username;
  return (
    <>
      <button className="pointer-events-auto mb-2 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[12px] font-black shadow-lg" onClick={() => setPanel(true)} data-testid="meet-chip">
        📡 {on ? (gps.length ? `${gps.length} player${gps.length === 1 ? '' : 's'} near you on GPS` : 'No one on GPS near you yet') : 'Meet players nearby'}
      </button>

      {/* someone out on GPS near you, just now */}
      <AnimatePresence>
        {pop && !panel && (
          <motion.div key={pop.id} className="pointer-events-auto fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+112px)] z-30 flex w-[min(92vw,380px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-[#22E3FF]/50 bg-[#071526]/90 px-3 py-2.5 shadow-2xl"
            initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} data-testid="meet-pop">
            <Face p={pop} />
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-[14px] font-black">{name(pop)} <span className="text-white/50">@{pop.username}</span></span>
              <span className="text-[12px] font-bold text-[#8FF3FF]">📡 Out on GPS {BAND[pop.band]} — a LANDVAS player!</span>
            </div>
            <button className="rounded-xl bg-[#22E3FF] px-2.5 py-1.5 text-[12px] font-black text-[#071526]" onClick={() => void wave(pop)} data-testid="meet-pop-wave">👋 Wave</button>
            <button className="grid h-7 w-7 place-items-center rounded-full text-white/60" onClick={() => setPop(null)} aria-label="Close"><X className="h-4 w-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* everyone near you */}
      <AnimatePresence>
        {panel && (
          <motion.div key="meet" className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[76dvh] w-[min(520px,100%)] overflow-y-auto rounded-t-[26px] border-t border-[#22E3FF]/40 bg-[#071526] px-4 pb-[max(16px,env(safe-area-inset-bottom,0px))] pt-3 shadow-2xl"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} data-testid="meet-panel">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-display text-lg font-black">📡 Players near you</div>
              <button className="grid h-9 w-9 place-items-center rounded-full bg-white/10" onClick={() => setPanel(false)} aria-label="Close" data-testid="meet-close"><X className="h-4 w-4" /></button>
            </div>
            {on ? (
              <div className="grid gap-3">
                <section className="grid gap-1.5">
                  <div className="text-[11px] font-black uppercase tracking-wider text-[#8FF3FF]">Out on GPS for real</div>
                  {gps.map((p) => (
                    <div key={p.id} className="flex items-center gap-2.5 rounded-2xl bg-white/[0.06] px-2.5 py-2" data-testid="meet-gps">
                      <Face p={p} size={34} />
                      <div className="grid min-w-0 flex-1 leading-tight">
                        <span className="truncate text-[13px] font-black">{name(p)}</span>
                        <span className="text-[11.5px] font-bold text-white/65">📡 on GPS · {BAND[p.band]}{p.waved_me ? ' · 👋 waved at you' : ''}</span>
                      </div>
                      <button className="rounded-xl bg-[#22E3FF] px-2.5 py-1.5 text-[12px] font-black text-[#071526] disabled:opacity-50" disabled={waved.has(p.id)} onClick={() => void wave(p)} data-testid="meet-wave">{waved.has(p.id) ? 'Waved' : '👋 Wave'}</button>
                    </div>
                  ))}
                  {!gps.length && <p className="text-[12px] text-white/60">No one who has this on is out on GPS near you right now.</p>}
                </section>
                {game.length > 0 && (
                  <section className="grid gap-1.5">
                    <div className="text-[11px] font-black uppercase tracking-wider text-white/60">Exploring here in the game (not on GPS)</div>
                    {game.map((p) => (
                      <div key={p.id} className="flex items-center gap-2.5 rounded-2xl bg-white/[0.04] px-2.5 py-2" data-testid="meet-game">
                        <Face p={p} size={34} />
                        <div className="grid min-w-0 flex-1 leading-tight">
                          <span className="truncate text-[13px] font-black">{name(p)}</span>
                          <span className="text-[11.5px] font-bold text-white/55">🕹️ exploring {p.vehicle && VEH[p.vehicle] ? `${VEH[p.vehicle]} ` : ''}· their explorer is {BAND[p.band]}</span>
                        </div>
                      </div>
                    ))}
                  </section>
                )}
                <p className="rounded-2xl bg-[#FFD23F]/10 px-3 py-2 text-[11.5px] font-semibold leading-snug text-[#FFE89A]">
                  Only a rough distance is ever shown — never where anyone is. If you meet, meet in a busy public place and tell someone where you’re going.
                </p>
                <MeetSwitch compact />
              </div>
            ) : <MeetSwitch />}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
