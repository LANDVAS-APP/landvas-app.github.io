// Your side of being watched: on a game or play screen your game listens for watchers, and while anyone's there it
// sends a picture of the screen a couple of times a second, shows "👀 N watching" (tap it to see who, or to stop
// letting people watch) and their reactions. On the map, settings, chats… nothing is listened for or sent.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import type { SpaceState } from '../backend/types';
import { useOnboardedMe } from '../lib/queries';
import { activityFor, describeWhereabouts } from '../social/activity';
import { SPACE_KEY } from '../space/useSpace';
import { REACTIONS, snapshot, type WatchMsg } from './stream';
import { config } from '../env';

if (config.e2e) Object.assign(window as object, { __landvasWatchSnap: snapshot });

/** what someone can be watched doing (the server says the same: private.watch_kinds) */
export const WATCH_KINDS = ['game', 'arcade', 'place', 'home', 'create', 'sanctuary', 'inkborn', 'playdate', 'dig'];
const NEVER = /^\/(world|welcome|settings|onboarding|support|legal|admin|watch|party|social|me|inventory|explorer)?(\/|$)/;
export const WATCH_ME_KEY = ['watch-me'] as const;

export type Float = { id: number; e: string; u: string };
let floatId = 0;
/** reactions drifting up the screen */
export function Floats({ items, className = '' }: { items: Float[]; className?: string }) {
  return (
    <div className={`pointer-events-none ${className}`} aria-hidden>
      {items.map((f) => (
        <div key={f.id} className="lv-watch-float" style={{ left: `${(f.id * 37) % 70}%` }}>
          <span className="text-3xl leading-none">{f.e}</span>
          <span className="mt-0.5 max-w-[6rem] truncate rounded-full bg-black/55 px-1.5 text-[10px] font-semibold text-white">@{f.u}</span>
        </div>
      ))}
    </div>
  );
}
export function useFloats() {
  const [items, setItems] = useState<Float[]>([]);
  const add = (e: string, u: string) => {
    if (!(REACTIONS as readonly string[]).includes(e)) return;
    const id = ++floatId;
    setItems((xs) => [...xs.slice(-7), { id, e, u: /^\w{3,20}$/.test(u) ? u : 'someone' }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 2400);
  };
  return [items, add] as const;
}

export function WatchHost() {
  const me = useOnboardedMe();
  const loc = useLocation();
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: WATCH_ME_KEY, queryFn: api.watchMe, enabled: !!me, staleTime: 60_000, refetchInterval: 5 * 60_000, retry: false });
  const a = activityFor(loc.pathname, qc.getQueryData<SpaceState>(SPACE_KEY));
  const watchable = !!me && WATCH_KINDS.includes(a.kind) && !NEVER.test(loc.pathname) && loc.pathname !== '/';
  const label = describeWhereabouts({ online: true, activity: { kind: a.kind, detail: a.detail, at: '' }, space: null, room: null }) ?? '🟢 online';
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const [watchers, setWatchers] = useState<{ id: string; u: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [floats, addFloat] = useFloats();
  const labelRef = useRef(label); labelRef.current = label;
  const channel = cfg.data?.on && watchable && !hidden ? cfg.data.channel : null;

  useEffect(() => {
    const vis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, []);

  useEffect(() => {
    if (!channel || !cfg.data) { setWatchers([]); return; }
    const backend = getBackend();
    const seen = new Map<string, { u: string; at: number }>();
    const fps = cfg.data.fps, maxKb = cfg.data.max_kb;
    const good: (string | null)[] = [];
    let seq = 0, busy = false, lastHtml = '', lastCv = '', lastSent = 0, lastStatus = 0, loop: ReturnType<typeof setInterval> | null = null, gone = false;
    const names = () => [...seen.values()].map((w) => w.u);
    const status = () => { lastStatus = Date.now(); ch.send({ t: 's', on: true, label: labelRef.current, n: seen.size, names: names().slice(0, 12) } satisfies WatchMsg); };
    const publish = () => setWatchers([...seen].map(([id, w]) => ({ id, u: w.u })));
    const tick = async () => {
      const now = Date.now();
      let changed = false;
      for (const [id, w] of seen) if (now - w.at > 12_000) { seen.delete(id); changed = true; }
      if (changed) { publish(); status(); }
      if (!seen.size) { if (loop) { clearInterval(loop); loop = null; } return; }
      if (now - lastStatus > 3000) status();
      if (busy || document.hidden) return;
      busy = true;
      try {
        const f = await snapshot(++seq, maxKb);
        if (gone || !f) return;
        // a 3D scene that's resting between frames: its last picture
        f.cv = f.cv.map((c, k) => c ?? good[k] ?? null); f.cv.forEach((c, k) => { if (c) good[k] = c; });
        const cvKey = f.cv.map((c) => c?.length ?? 0).join(',') + (f.cv[0]?.slice(-64) ?? '');
        // the same picture as last time: only now and then, so a watcher who just came in gets one
        if (f.html === lastHtml && cvKey === lastCv && now - lastSent < 4000) return;
        lastHtml = f.html; lastCv = cvKey; lastSent = now;
        ch.send(f);
      } catch { /* try again next time */ } finally { busy = false; }
    };
    const start = () => { if (!loop) { loop = setInterval(() => void tick(), Math.round(1000 / fps)); void tick(); } };
    const onMsg = (raw: unknown) => {
      const m = raw as WatchMsg;
      if (!m || typeof m !== 'object' || typeof (m as { id?: unknown }).id !== 'string') return;
      if (m.t === 'hi') {
        const fresh = !seen.has(m.id);
        seen.set(m.id, { u: String(m.u ?? '').slice(0, 20), at: Date.now() });
        if (fresh) { publish(); status(); lastHtml = ''; start(); }
      } else if (m.t === 'bye') { if (seen.delete(m.id)) { publish(); status(); } }
      else if (m.t === 'r' && seen.has(m.id)) addFloat(String(m.e), String(m.u ?? ''));
    };
    const ch = backend.liveChannel?.(channel, onMsg) ?? { send() {}, close() {} };
    return () => {
      gone = true;
      if (loop) clearInterval(loop);
      if (seen.size) ch.send({ t: 's', on: false, label: labelRef.current, n: 0, names: [] } satisfies WatchMsg);
      setTimeout(() => ch.close(), 300);
      setWatchers([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, cfg.data?.fps, cfg.data?.max_kb]);

  const stop = async () => {
    setOpen(false);
    try {
      qc.setQueryData(['privacy'], await api.setPrivacy({ spectate: false }));
      await qc.invalidateQueries({ queryKey: WATCH_ME_KEY });
      toast.success('Nobody can watch you play now', { description: 'Switch it back on any time in Settings → Privacy.' });
    } catch (e) { toast.error(toGameError(e).message); }
  };

  if (!channel || (!watchers.length && !floats.length)) return null;
  return createPortal(
    <div data-no-watch className="lv-watch-host">
      {watchers.length > 0 && (
        <button type="button" className="lv-watch-chip" onClick={() => setOpen((o) => !o)} data-testid="watch-chip" aria-expanded={open}
          aria-label={`${watchers.length} watching you play`}>
          <i className="lv-watch-dot" /><Eye className="h-3.5 w-3.5" /> {watchers.length} watching
        </button>
      )}
      {open && watchers.length > 0 && (
        <div className="lv-watch-pop" data-testid="watch-pop">
          <div className="text-[11px] font-semibold text-muted">Watching you play</div>
          <ul className="my-1.5 grid max-h-40 gap-0.5 overflow-auto text-sm">
            {watchers.map((w) => <li key={w.id} className="truncate">👀 @{w.u}</li>)}
          </ul>
          <button type="button" className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-surface-2 px-2 py-1.5 text-xs font-semibold" onClick={() => void stop()} data-testid="watch-stop">
            <EyeOff className="h-3.5 w-3.5" /> Stop letting people watch
          </button>
        </div>
      )}
      <Floats items={floats} className="fixed bottom-24 right-3 z-[70] h-64 w-28" />
    </div>,
    document.body,
  );
}
