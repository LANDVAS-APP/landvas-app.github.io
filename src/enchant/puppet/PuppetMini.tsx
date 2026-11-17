// 🎭 The little stage that follows you round the app while a Puppeteer's show is on: the act playing (game, level, the
// rounds ticking by on the server's clock), a cheer when a level is cleared ("+1 level complete · +N Ink"), and a tap
// back to the theatre to watch it live. It looks in once when the app opens and whenever a show starts; while a show
// runs it keeps an eye on it (and nudges the server along when an act is due).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type PuppetLive } from '../../backend/api';
import { useOnboardedMe } from '../../lib/queries';
import { useUi } from '../../lib/store';
import { feel } from '../living';
import { PUPPET_EVENT, gameName } from './names';
import './puppet.css';
import { useDodgeWords } from '../../lib/dodgeWords';

/** the phone's bottom safe area (the home bar), in px */
let sabProbe: HTMLDivElement | null = null;
const safeBottom = () => {
  if (!sabProbe) {
    sabProbe = document.createElement('div');
    sabProbe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
    document.body.appendChild(sabProbe);
  }
  return sabProbe.offsetHeight;
};

export default function PuppetMini() {
  const me = useOnboardedMe();
  if (!me) return null;
  return <PuppetMiniInner />;
}

function PuppetMiniInner() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const loc = useLocation();
  const [nudge, setNudge] = useState(0);
  const live = useQuery({
    queryKey: ['puppet-live', nudge],
    queryFn: () => api.puppetLive(),
    staleTime: 4000,
    refetchInterval: (q) => {
      const d = q.state.data as PuppetLive | undefined;
      return d && d.shows.some((s) => s.on || s.runs.length) ? 6000 : false;
    },
    refetchIntervalInBackground: false,
  });
  useEffect(() => { const on = () => setNudge((n) => n + 1); window.addEventListener(PUPPET_EVENT, on); return () => window.removeEventListener(PUPPET_EVENT, on); }, []);
  const at = live.dataUpdatedAt;
  const d = live.data;
  // a cheer for every curtain call (not when you're watching it in the theatre)
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!d) return;
    const calls = d.shows.flatMap((s) => s.calls.map((c) => ({ ...c, eid: s.id })));
    if (!seen.current) { seen.current = new Set(calls.map((c) => c.id)); return; }
    for (const c of calls) {
      if (seen.current.has(c.id)) continue;
      seen.current.add(c.id);
      if (loc.pathname === `/grimoire/${c.eid}`) continue;
      if (c.result?.passed) { feel('success'); toast.success(`🎭 +1 level complete · +${Math.round(Number(c.result.ink))} Ink`, { description: `${gameName(c.game)} level ${c.level} · ${c.own ? 'your plot' : `@${c.owner_name}’s plot`}` }); }
      else toast(`🪢 The puppet tangled on ${gameName(c.game)} level ${c.level}`);
      void qc.invalidateQueries({ queryKey: ['enchant', c.eid] });
    }
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const [, setT] = useState(0);
  const playing = d?.shows.find((s) => s.runs.length) ?? null;
  useEffect(() => { if (!playing) return; const t = setInterval(() => { if (!document.hidden) setT((x) => x + 1); }, 500); return () => clearInterval(t); }, [!!playing]);
  const hidden = !playing || loc.pathname === `/grimoire/${playing.id}` || loc.pathname.startsWith('/play/') || useUi.getState().settings.simpleMode;
  const run = playing?.runs[0];
  // words under it (the page settled with text there): it shrinks to a little round 🎭 in the corner until they scroll on
  const small = useDodgeWords(() => {
    const desk = innerWidth >= 768;
    const b = innerHeight - (desk ? 16 : 88) - safeBottom(); const l = desk ? 100 : 12;
    return { left: l, right: l + 200, top: b - 76, bottom: b };
  }, !hidden && !!run, loc.pathname);
  const now = Date.now() / 1000 + ((d?.server_now ?? 0) - at / 1000);
  const p = run ? Math.max(0, Math.min(1, (now - run.started_at) / Math.max(1, run.due_at - run.started_at))) : 0;
  // which round the act is on, by the server's clock
  let acc = 0, round = 0;
  if (run) for (let i = 0; i < run.secs.length; i++) { acc += Number(run.secs[i]); if (now - run.started_at - 1.5 > acc) round = i + 1; }
  return (
    <AnimatePresence>
      {!hidden && run && playing && (
        small ? (
          <motion.button key="pip" className="lv-pup-mini lv-pup-pip fixed bottom-[calc(env(safe-area-inset-bottom)+88px)] left-1.5 z-[60] grid h-11 w-11 place-items-center rounded-full md:bottom-4 md:left-[96px]"
            initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} onClick={() => nav(`/grimoire/${playing.id}`)}
            aria-label={`The show: ${gameName(run.game)} level ${run.level} — tap to watch`} data-testid="puppet-mini" data-small data-dodge>
            <svg className="pointer-events-none absolute inset-0 -rotate-90" viewBox="0 0 44 44" aria-hidden><circle cx="22" cy="22" r="20" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="3" />
              <circle cx="22" cy="22" r="20" fill="none" stroke="#FFB703" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(p * 125.7).toFixed(1)} 125.7`} /></svg>
            <span className="lv-pup-mini-puppet text-[20px]">🎭</span>
          </motion.button>
        ) :
        <motion.button key="mini" className="lv-pup-mini fixed bottom-[calc(env(safe-area-inset-bottom)+88px)] left-3 z-[60] grid w-[200px] gap-1 rounded-2xl p-2 text-left md:bottom-4 md:left-[100px]"
          initial={{ y: 30, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }} onClick={() => nav(`/grimoire/${playing.id}`)} data-testid="puppet-mini" data-dodge>
          <span className="flex items-center gap-1.5 text-[12px] font-black text-[#FFE8A3]"><span className="lv-pup-mini-puppet">🎭</span>
            <span className="min-w-0 flex-1 truncate">{gameName(run.game)} · level {run.level}</span>{playing.runs.length > 1 && <span className="text-[10px] text-white/60">+{playing.runs.length - 1}</span>}</span>
          <span className="flex gap-0.5">{Array.from({ length: run.rounds }, (_, i) => (
            <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < Math.min(round, run.cleared) ? '#3DDC97' : i === round && !run.passed && round >= run.cleared && p >= 1 ? '#FF4D6D' : i === round ? 'rgba(255,232,163,0.7)' : 'rgba(255,255,255,0.15)' }} />
          ))}</span>
          <span className="lv-pup-bar"><span style={{ transform: `scaleX(${p})` }} /></span>
          <span className="truncate text-[10px] font-bold text-white/60">{run.own ? 'your plot' : `@${run.owner_name}’s plot`} · tap to watch</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
