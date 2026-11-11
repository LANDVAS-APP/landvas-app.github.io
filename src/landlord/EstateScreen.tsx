// Your Landlord estate, in 3D, with this month's checklist. Rent day (50× USD rent on the 1st) only pays estates
// whose checklist is done: inspect on 3 days, fix 6 broken things, answer 3 tenants, water the garden on 2 days.
// Walking in counts as today's inspection.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type EstateState } from '../backend/api';
import { toGameError } from '../backend/backend';
import { invalidateGame } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { useTicker } from '../play/common';
import { buzz } from '../native/native';
import { createEstate3D, type Estate3D, type EstateAction } from './estate3d';

const REQUESTS = [
  { who: 'Mrs. Patel, No. 4', ask: 'My kitchen tap won’t stop dripping!', help: '🔧 Send a plumber', ignore: 'It’s just a drip' },
  { who: 'The Okafors, No. 7', ask: 'Can we paint the nursery yellow?', help: '🎨 Of course!', ignore: 'Rules are rules' },
  { who: 'Old Mr. Lindqvist', ask: 'Someone keeps parking in my space.', help: '🚧 Put up a sign', ignore: 'Not my problem' },
  { who: 'Jess & Sam, No. 2', ask: 'Our heating makes a scary noise at night…', help: '🔥 Book a repair', ignore: 'Wear a jumper' },
  { who: 'Mr. Ito, No. 9', ask: 'May I keep a very small, very polite cat?', help: '🐈 Welcome, cat', ignore: 'No pets' },
  { who: 'The Garcias, No. 5', ask: 'The front step is cracked — Grandma nearly tripped.', help: '🧱 Fix the step', ignore: 'Watch your step' },
  { who: 'Priya, No. 3', ask: 'The Wi-Fi in the hallway is so slow.', help: '📶 New router', ignore: 'Use your data' },
  { who: 'Mr. & Mrs. Brown', ask: 'A family of birds moved into our gutter!', help: '🐦 Gently rehome them', ignore: 'Free rent for birds' },
];
const TASKS: { key: keyof EstateState['tasks']; emoji: string; name: string; how: string }[] = [
  { key: 'inspect', emoji: '🔍', name: 'Inspect', how: 'Visit your estate on different days' },
  { key: 'repairs', emoji: '🔧', name: 'Repairs', how: 'Tap the broken things over the houses — new ones break every day' },
  { key: 'requests', emoji: '📬', name: 'Tenants', how: 'Open the mailbox and help your tenants (2 requests a day)' },
  { key: 'garden', emoji: '🌷', name: 'Garden', how: 'Water the community garden (once a day)' },
];

export default function EstateScreen() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const haptics = useUi((s) => s.settings.haptics);
  const cv = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Estate3D | null>(null);
  const [st, setSt] = useState<EstateState | null>(null);
  const [req, setReq] = useState<(typeof REQUESTS)[number] | null>(null);
  const [sheet, setSheet] = useState(true);
  const [justDone, setJustDone] = useState(false);
  useTicker(30_000);
  const visit = useQuery({ queryKey: ['estate', id], queryFn: () => api.estateVisit(id), enabled: !!id, staleTime: 0, retry: false });
  useEffect(() => { if (visit.data) setSt(visit.data); }, [visit.data]);
  useEffect(() => { if (visit.error) toast.error(toGameError(visit.error).message); }, [visit.error]);

  const view = (s: EstateState) => ({ houses: s.houses, spots: s.spots, watered: !!s.tasks.garden.today, requests: s.tasks.requests.left_today ?? 0, rentDay: s.rent_day, eligible: s.eligible });
  // the 3D estate (built once we know how many houses)
  useEffect(() => {
    if (!st || !cv.current || scene.current) return;
    scene.current = createEstate3D(cv.current, view(st), (a) => onAction.current(a), reduce);
    if (config_e2e()) (window as any).__landvasEstate = { act: (a: EstateAction) => onAction.current(a) };
    return undefined;
  }, [st?.group_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { scene.current?.dispose(); scene.current = null; }, []);

  const apply = (s: EstateState, a: EstateAction, emojis: string[]) => {
    scene.current?.celebrate(a, emojis);
    scene.current?.update(view(s));
    if (!st?.eligible && s.eligible) { setJustDone(true); if (haptics) buzz('success'); setTimeout(() => setJustDone(false), 3200); }
    setSt(s);
    qc.setQueryData(['estate', id], s);
    void qc.invalidateQueries({ queryKey: ['estates'] });
    invalidateGame(qc);
  };
  const onAction = useRef<(a: EstateAction) => void>(() => {});
  onAction.current = async (a: EstateAction) => {
    if (!st) return;
    if (haptics) buzz('light');
    try {
      if (a.kind === 'repair') apply(await api.estateRepair(id, a.idx), a, ['🔧', '✨', '✅', '🔨']);
      else if (a.kind === 'garden') apply(await api.estateGarden(id), a, ['💧', '🌷', '🌼', '💧', '🌸']);
      else if (a.kind === 'mailbox') {
        if (!st.tasks.requests.left_today) { toast('No more mail today', { description: 'Your tenants will write again tomorrow.' }); return; }
        setReq(REQUESTS[Math.floor(Math.random() * REQUESTS.length)]);
      }
    } catch (e) { toast.error(toGameError(e).message); }
  };
  const answer = async (help: boolean) => {
    setReq(null);
    try { apply(await api.estateRequest(id, help), { kind: 'mailbox' }, help ? ['💌', '😊', '⭐'] : ['😐']); if (!help) toast('Your tenant isn’t impressed', { description: 'Only helping counts towards the checklist.' }); }
    catch (e) { toast.error(toGameError(e).message); }
  };

  const doneCount = st ? TASKS.filter((t) => st.tasks[t.key].done >= st.tasks[t.key].need).length : 0;
  const nextRent = useMemo(() => (st ? new Date(st.next_rent_day).getTime() : 0), [st?.next_rent_day]); // eslint-disable-line react-hooks/exhaustive-deps
  const left = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#BFE3FF] text-white" data-testid="estate">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" data-testid="estate-canvas" />
      {/* top */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <button className="pointer-events-auto grid h-11 w-11 place-items-center rounded-2xl bg-[#14183a]/85 shadow-lg" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label="Leave the estate" data-testid="estate-back"><ArrowLeft className="h-5 w-5" /></button>
        {st && (
          <div className="pointer-events-auto min-w-0 rounded-2xl bg-[#14183a]/85 px-3 py-2 shadow-lg">
            <div className="truncate font-display text-[15px] font-black">🏘️ {!st.name || st.name === 'Untitled canvas' ? 'Your estate' : st.name} · {st.houses} house{st.houses === 1 ? '' : 's'}</div>
            <div className={cn('text-[12px] font-bold', st.eligible ? 'text-[#3DDC97]' : 'text-[#FFD166]')} data-testid="estate-status">
              {st.rent_day ? (st.eligible ? `💵 Rent day! ${st.multiplier}× rent all day` : `Rent day — finish the checklist to get ${st.multiplier}×!`)
                : st.eligible ? `✓ Ready for rent day · ${st.multiplier}× in ${left(nextRent - Date.now())}` : `Rent day in ${left(nextRent - Date.now())} · ${doneCount}/4 done`}
            </div>
          </div>
        )}
      </div>

      {/* the checklist */}
      {st && (
        <div className="absolute inset-x-0 bottom-0 p-3 pb-[max(12px,env(safe-area-inset-bottom,0px))]">
          <motion.div layout className="mx-auto max-w-md overflow-hidden rounded-[26px] border border-white/10 bg-[#14183a]/92 shadow-2xl" data-testid="estate-checklist">
            <button className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => setSheet((x) => !x)}>
              <span className="font-display text-[15px] font-black">📋 This month’s checklist</span>
              <span className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-black', st.eligible ? 'bg-[#3DDC97] text-[#06281A]' : 'bg-white/10')}>{st.eligible ? `${st.multiplier}× unlocked` : `${doneCount}/4`}</span>
            </button>
            <AnimatePresence initial={false}>
              {sheet && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                  <div className="grid gap-2 px-4 pb-4">
                    {TASKS.map((t) => {
                      const k = st.tasks[t.key], done = k.done >= k.need, pct = Math.min(1, k.done / Math.max(1, k.need));
                      return (
                        <div key={t.key} className="grid gap-1" data-testid={`estate-task-${t.key}`}>
                          <div className="flex items-center justify-between text-[13px] font-bold"><span>{done ? '✅' : t.emoji} {t.name}</span><span className="tnum text-white/70">{Math.min(k.done, k.need)}/{k.need}</span></div>
                          <div className="h-2 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full" style={{ background: done ? '#3DDC97' : 'linear-gradient(90deg,#FFB020,#FF6A1F)' }} animate={{ width: `${pct * 100}%` }} /></div>
                          {!done && <div className="text-[11px] text-white/50">{t.how}</div>}
                        </div>
                      );
                    })}
                    <p className="text-[11px] text-white/45">Rent day is the 1st of every month (UTC). Only estates with the checklist done earn {st.multiplier}× that day — you can still finish it on the 1st itself.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}

      {/* a tenant's request */}
      <AnimatePresence>
        {req && (
          <motion.div className="absolute inset-0 grid place-items-center bg-black/40 p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="estate-request">
            <motion.div className="w-full max-w-sm rounded-[26px] bg-[#FFF8EC] p-5 text-[#2a1d10] shadow-2xl" initial={{ scale: 0.8, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 22 }}>
              <div className="text-[12px] font-black uppercase tracking-wider text-[#B8860B]">📬 A letter from {req.who}</div>
              <p className="mt-2 font-display text-[19px] font-bold leading-snug">“{req.ask}”</p>
              <div className="mt-4 grid gap-2">
                <button className="h-12 rounded-2xl bg-[linear-gradient(135deg,#3DDC97,#1FA971)] font-black text-white shadow-[0_4px_0_#147a52]" onClick={() => void answer(true)} data-testid="estate-help">{req.help}</button>
                <button className="h-10 rounded-2xl bg-black/5 text-[13px] font-bold text-[#6b5a45]" onClick={() => void answer(false)} data-testid="estate-ignore">{req.ignore}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* the checklist just got done */}
      <AnimatePresence>
        {justDone && st && (
          <motion.div className="pointer-events-none absolute inset-x-0 top-1/3 grid justify-items-center" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 16 }}>
            <div className="rounded-3xl bg-[#3DDC97] px-6 py-4 text-center font-display text-[24px] font-black text-[#06281A] shadow-2xl">💵 {st.multiplier}× rent day unlocked!</div>
          </motion.div>
        )}
      </AnimatePresence>
      {!st && !visit.error && <div className="absolute inset-0 grid place-items-center text-[#14183a]">Opening the gates…</div>}
    </div>
  );
}

function config_e2e() {
  try { return new URLSearchParams(location.search).has('e2e'); } catch { return false; }
}
