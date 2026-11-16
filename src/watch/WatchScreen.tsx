// Watching someone play: their screen, live (a couple of pictures a second), what they're up to, how many are
// watching, reactions everyone sees — and the ways to join in: go where they are, team up, or see their profile.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Eye, Users } from 'lucide-react';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import { Button, PlayerAvatar, Spinner } from '../ui';
import { useOnboardedMe } from '../lib/queries';
import { describeWhereabouts } from '../social/activity';
import { goTarget, goTo, usePartyJoin } from '../party/party';
import { REACTIONS, type WatchMsg } from './stream';
import { cleanCss, paint, sanitize, stageDoc } from './render';
import { Floats, useFloats } from './WatchHost';
import { config } from '../env';

if (config.e2e) Object.assign(window as object, { __landvasWatch: { sanitize, cleanCss, paint, stageDoc } });

type Frame = Extract<WatchMsg, { t: 'f' }>;
type Status = Extract<WatchMsg, { t: 's' }>;

/** their screen, scaled to fit: a sandboxed frame that shows pictures and can't run anything */
function Stage({ frame, onPainted }: { frame: Frame | null; onPainted(): void }) {
  const box = useRef<HTMLDivElement>(null);
  const ifr = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [fit, setFit] = useState({ w: 0, h: 0 });
  const doc = useRef<string | null>(null);
  doc.current ??= stageDoc();
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setFit({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setFit({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  // one picture at a time, the newest
  const queue = useRef<{ busy: boolean; next: Frame | null }>({ busy: false, next: null });
  useEffect(() => {
    const d = ifr.current?.contentDocument;
    if (!frame || !ready || !d?.body) return;
    const q = queue.current; q.next = frame;
    if (q.busy) return;
    const run = async () => {
      q.busy = true;
      while (q.next) { const f = q.next; q.next = null; try { await paint(d, f); onPainted(); } catch { /* a bad picture: skip it */ } }
      q.busy = false;
    };
    void run();
  }, [frame, ready, onPainted]);
  const w = frame?.w ?? 390, h = frame?.h ?? 844;
  const k = fit.w && fit.h ? Math.min(fit.w / w, fit.h / h) : 0;
  return (
    <div ref={box} className="relative min-h-0 flex-1 overflow-hidden" data-testid="watch-stage">
      <div className="absolute left-1/2 top-1/2 overflow-hidden rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,.45)] ring-1 ring-white/10"
        style={{ width: w * k, height: h * k, transform: 'translate(-50%, -50%)', visibility: frame ? 'visible' : 'hidden' }}>
        <iframe ref={ifr} title="Their screen" srcDoc={doc.current} sandbox="allow-same-origin" referrerPolicy="no-referrer" tabIndex={-1}
          onLoad={() => setReady(true)} data-testid="watch-frame"
          style={{ width: w, height: h, border: 0, transform: `scale(${k})`, transformOrigin: '0 0', pointerEvents: 'none', background: 'var(--bg)' }} />
      </div>
    </div>
  );
}

export default function WatchScreen() {
  const { username = '' } = useParams();
  const me = useOnboardedMe();
  const nav = useNavigate();
  const join = usePartyJoin();
  const q = useQuery({ queryKey: ['watch', username.toLowerCase()], queryFn: () => api.watchStart(username), enabled: !!me, refetchInterval: 15_000, retry: false });
  const t = q.data;
  const [frame, setFrame] = useState<Frame | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [lastAt, setLastAt] = useState(0);
  const [, tick] = useState(0);
  const [floats, addFloat] = useFloats();
  const chRef = useRef<{ send(m: unknown): void } | null>(null);
  const lastReact = useRef(0);
  const [busy, setBusy] = useState(false);
  const myId = me?.profile.id, myName = me?.profile.username;

  useEffect(() => { const i = setInterval(() => { if (!document.hidden) tick((n) => n + 1); }, 1000); return () => clearInterval(i); }, []);
  useEffect(() => {
    if (!t?.channel || !myId || !myName) return;
    const ch = getBackend().liveChannel?.(t.channel, (raw) => {
      const m = raw as WatchMsg;
      if (!m || typeof m !== 'object') return;
      if (m.t === 'f' && typeof m.html === 'string') { setFrame(m); setLastAt(Date.now()); }
      else if (m.t === 's') { setStatus(m); if (!m.on) setFrame(null); }
      else if (m.t === 'r' && typeof m.e === 'string') addFloat(m.e, String(m.u ?? ''));
    }) ?? null;
    if (!ch) return;
    chRef.current = ch;
    const hi = () => { if (!document.hidden) ch.send({ t: 'hi', id: myId, u: myName } satisfies WatchMsg); };
    hi();
    const i = setInterval(hi, 4000);
    return () => { clearInterval(i); ch.send({ t: 'bye', id: myId } satisfies WatchMsg); chRef.current = null; setTimeout(() => ch.close(), 300); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.channel, myId, myName]);

  const react = (e: string) => {
    if (!myId || !myName || Date.now() - lastReact.current < 600) return;
    lastReact.current = Date.now();
    chRef.current?.send({ t: 'r', id: myId, u: myName, e } satisfies WatchMsg);
    addFloat(e, myName);
  };
  const teamUp = async () => {
    if (!t) return;
    setBusy(true);
    try { if (await join({ kind: 'player', id: t.id }, `@${t.username}`)) toast.success(`You teamed up with @${t.username} 🎉`); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };

  const err = q.error ? toGameError(q.error) : null;
  const live = !!frame && Date.now() - lastAt < 8000;
  const what = status?.label ?? describeWhereabouts(t?.now ?? undefined);
  const place = goTarget(t?.now);
  const n = status?.n ?? 0;
  const away = !!t && (!t.channel || t.now?.watch === false || status?.on === false);
  const onPainted = useRef(() => {}).current;

  return (
    <div className="fixed inset-0 z-10 flex flex-col bg-[var(--bg)] pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),8px)]" data-testid="watch-screen">
      <header className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => (history.length > 1 ? nav(-1) : nav('/world'))} className="grid h-9 w-9 place-items-center rounded-full bg-surface-2" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
        {t && <Link to={`/u/${t.username}`} className="shrink-0"><PlayerAvatar p={t} size={36} /></Link>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{t ? `@${t.username}` : `@${username}`}</div>
          <div className="truncate text-[11px] text-muted" data-testid="watch-what">{what ?? (q.isLoading ? 'Looking for them…' : '—')}</div>
        </div>
        {live ? <span className="lv-watch-badge" data-testid="watch-live"><i className="lv-watch-dot" /> LIVE{n > 0 && <> · <Eye className="h-3 w-3" /> {n}</>}</span>
          : <span className="lv-watch-badge off">{away ? 'AWAY' : 'WAITING'}</span>}
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col px-3">
        <Stage frame={frame} onPainted={onPainted} />
        {!live && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center" data-testid="watch-empty">
            {err ? (
              <div className="max-w-xs"><div className="text-4xl">🙈</div><p className="mt-2 text-sm font-semibold">{err.code === 'not_watchable' ? `@${username} isn’t letting people watch right now.` : 'Nobody to watch here.'}</p></div>
            ) : !t ? <Spinner />
              : away ? (
                <div className="max-w-xs"><div className="text-4xl">{t.now?.online ? '🚶' : '💤'}</div>
                  <p className="mt-2 text-sm font-semibold">{t.now?.online ? `@${t.username} stepped away from the game` : `@${t.username} isn’t playing right now`}</p>
                  <p className="mt-1 text-xs text-muted">{t.now?.online ? 'Their screen comes back here as soon as they start playing something.' : 'Stay here: you’ll see their screen the moment they’re back.'}</p></div>
              ) : (
                <div className="max-w-xs"><Spinner /><p className="mt-3 text-sm text-muted">Tuning in to @{t.username}…</p></div>
              )}
          </div>
        )}
        <Floats items={floats} className="absolute bottom-2 right-2 h-72 w-28" />
      </div>

      {t && (
        <footer className="grid gap-2 px-3 pt-2">
          <div className="flex justify-center gap-1.5" data-testid="watch-reactions">
            {REACTIONS.map((e) => (
              <button key={e} type="button" onClick={() => react(e)} disabled={!t.channel} className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-xl transition active:scale-90 disabled:opacity-40" aria-label={`React ${e}`} data-testid="watch-react">{e}</button>
            ))}
          </div>
          <div className="flex gap-2">
            {place && <Button className="flex-1" onClick={() => void goTo(t.id, place.route, nav)} data-testid="watch-join">{place.label}</Button>}
            {!t.in_party && <Button className="flex-1" variant={place ? 'secondary' : 'primary'} loading={busy} onClick={() => void teamUp()} data-testid="watch-teamup"><Users className="h-4 w-4" /> Team up</Button>}
            <Button variant="secondary" onClick={() => nav(`/u/${t.username}`)}>Profile</Button>
          </div>
        </footer>
      )}
    </div>
  );
}
