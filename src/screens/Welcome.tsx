import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Gift, Mail } from 'lucide-react';
import { getBackend, toGameError } from '../backend/backend';
import { config } from '../env';
import { Button, Field, Tabs, Wordmark, inputCls } from '../ui';
import { PLOT_TYPES } from '../map/plotStyle';
import { drawPlotDesign } from '../map/plotStyle';
import type { PlotTypeId } from '../shared/grid';
import { saveStorage } from '../lib/utils';
import { pendingReferral } from '../social/referralStore';

/** A living canvas: plots claim themselves, fill with default designs and fuse into murals. */
function LivingCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cols = 14, rows = 9;
    const types = Object.keys(PLOT_TYPES) as PlotTypeId[];
    const state: { t: PlotTypeId; on: number; seed: number }[] = Array.from({ length: cols * rows }, (_, i) => ({ t: types[(i * 7 + (i >> 3)) % 4], on: 0, seed: i * 13 + 5 }));
    const mural = { x: 4, y: 2, w: 5, h: 4 };
    let frame = 0, raf = 0;
    const tiles = new Map<string, HTMLCanvasElement>();
    const tile = (t: PlotTypeId, seed: number, px: number) => {
      const k = `${t}-${seed}-${px}`;
      if (!tiles.has(k)) {
        const tc = document.createElement('canvas');
        tc.width = tc.height = px;
        drawPlotDesign(tc.getContext('2d')!, t, px, seed);
        tiles.set(k, tc);
      }
      return tiles.get(k)!;
    };
    const draw = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const size = Math.max(w / cols, h / rows);
      const gap = Math.max(2, size * 0.06);
      ctx.clearRect(0, 0, w, h);
      frame++;
      if (frame % 9 === 0 || reduce) {
        const pick = state[(frame * 37) % state.length];
        pick.on = Math.min(1, pick.on + 1);
      }
      state.forEach((s, i) => {
        const x = (i % cols) * size, y = Math.floor(i / cols) * size;
        const inMural = (i % cols) >= mural.x && (i % cols) < mural.x + mural.w && Math.floor(i / cols) >= mural.y && Math.floor(i / cols) < mural.y + mural.h;
        ctx.globalAlpha = reduce ? 0.9 : 0.12 + s.on * 0.75;
        if (!inMural) ctx.drawImage(tile(s.t, s.seed, 64), x + gap / 2, y + gap / 2, size - gap, size - gap);
      });
      // the fused mural: one continuous painting across 20 plots
      const mx = mural.x * size, my = mural.y * size, mw = mural.w * size, mh = mural.h * size;
      const t = reduce ? 0 : frame / 120;
      const g = ctx.createLinearGradient(mx, my, mx + mw, my + mh);
      g.addColorStop(0, '#FF4D6D'); g.addColorStop(0.35, '#FF9F1C'); g.addColorStop(0.6, '#7B5CFF'); g.addColorStop(1, '#22E3FF');
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = g;
      ctx.fillRect(mx + gap / 2, my + gap / 2, mw - gap, mh - gap);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#FFE14D';
      ctx.beginPath();
      ctx.arc(mx + mw * (0.3 + 0.05 * Math.sin(t)), my + mh * 0.38, mh * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0B1230';
      ctx.beginPath();
      ctx.moveTo(mx, my + mh);
      for (let k = 0; k <= 20; k++) ctx.lineTo(mx + (mw * k) / 20, my + mh * (0.68 + 0.12 * Math.sin(k * 0.9 + t)));
      ctx.lineTo(mx + mw, my + mh);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(201,246,255,0.9)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#22E3FF';
      ctx.shadowBlur = 16;
      ctx.strokeRect(mx + gap / 2, my + gap / 2, mw - gap, mh - gap);
      ctx.shadowBlur = 0;
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full opacity-70" aria-hidden />;
}

export function Welcome() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const b = getBackend();
  const invite = pendingReferral();
  const [tab, setTab] = useState<'signup' | 'signin'>(b.mode === 'local' || invite ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<{ email: string }[]>([]);

  useEffect(() => {
    void b.localAccounts?.().then(setAccounts);
    if (b.session()) nav(next, { replace: true });
  }, [b, nav, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (tab === 'signup') {
        const r = await b.signUp(email, password);
        if (r.needsConfirmation) {
          setNotice('Check your inbox to confirm your email, then sign in.');
          setTab('signin');
          return;
        }
      } else await b.signIn(email, password);
      saveStorage('landvas.welcomed', true);
      nav(next === '/welcome' ? '/' : next, { replace: true });
    } catch (err) {
      setError(toGameError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-full overflow-y-auto bg-bg">
      <LivingCanvas />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,transparent_0%,var(--bg)_72%)]" />
      <div className="gutter relative mx-auto grid min-h-full max-w-6xl items-center gap-10 py-10 md:grid-cols-[1.15fr_1fr]">
        <section className="max-w-xl">
          <Wordmark />
          <h1 className="mt-8 font-display text-[clamp(2.2rem,6vw,4.2rem)] font-bold leading-[1.02]">
            Own a piece.
            <br />
            <span className="rainbow-text">Paint the world.</span>
          </h1>
          <p className="mt-5 max-w-md text-[17px] text-muted">
            The planet is divided into 4.3 billion square plots. Claim one for free, paint it, then buy the plots next door and fuse them into one continuous mural the whole world can see on the map.
          </p>
          <ul className="mt-6 grid gap-2 text-sm text-muted">
            <li>· Every plot is a canvas, a home for one of four minigames, and a source of Ink.</li>
            <li>· Connect neighbouring plots to draw across their borders in one stroke.</li>
            <li>· Plots are virtual — owning one never means owning real land.</li>
          </ul>
        </section>
        <section className="glass rounded-[28px] p-6">
          {invite && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-3 text-sm" data-testid="welcome-invite">
              <Gift className="h-5 w-5 shrink-0 text-gold" />
              <span>You were invited with code <b className="font-mono">{invite}</b>. Create your account and it’s applied automatically.</span>
            </div>
          )}
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} items={[{ value: 'signup', label: 'Create account' }, { value: 'signin', label: 'Sign in' }]} className="mb-5" />
          <form className="grid gap-4" onSubmit={submit}>
            <Field label="Email" htmlFor="email">
              <input id="email" className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.art" />
            </Field>
            <Field label="Password" htmlFor="password" hint={tab === 'signup' ? 'At least 8 characters.' : undefined} error={error}>
              <input id="password" className={inputCls} type="password" autoComplete={tab === 'signup' ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {notice && <p className="rounded-xl border border-line bg-surface/70 p-3 text-sm">{notice}</p>}
            <Button variant="primary" size="lg" loading={busy} type="submit">
              {tab === 'signup' ? 'Create my artist account' : 'Sign in'} <ArrowRight className="h-4 w-4" />
            </Button>
            {b.sendMagicLink && tab === 'signin' && (
              <Button type="button" variant="ghost" onClick={async () => {
                try { await b.sendMagicLink!(email); setNotice('Magic link sent — check your inbox.'); } catch (err) { setError(toGameError(err).message); }
              }}>
                <Mail className="h-4 w-4" /> Email me a sign-in link
              </Button>
            )}
          </form>
          {b.mode === 'local' && (
            <div className="mt-5 grid gap-2 rounded-2xl border border-line bg-surface/50 p-4 text-[13px] text-muted">
              <p><b className="text-fg">Local mode.</b> Your world, accounts and art are saved in this browser only{b.ephemeral ? ' — and this browser will not keep them after you close it' : ''}. Deploy with Supabase for the shared multiplayer world.</p>
              {accounts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {accounts.slice(0, 4).map((a) => (
                    <button key={a.email} type="button" className="rounded-full border border-line px-2.5 py-1 text-xs hover:border-line-strong" onClick={() => { setTab('signin'); setEmail(a.email); }}>
                      {a.email}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button className="mt-5 w-full text-center text-sm font-semibold text-muted hover:text-fg" onClick={() => { saveStorage('landvas.welcomed', true); nav('/'); }}>
            Explore the map first →
          </button>
        </section>
      </div>
      {config.isArtifact && <span className="sr-only">Playable build</span>}
    </div>
  );
}
