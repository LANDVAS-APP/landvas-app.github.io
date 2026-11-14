import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { framePacer } from '../lib/gfx';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Brush, Check, ChevronDown, CircleDollarSign, Eye, EyeOff, Gamepad2, Gift, Lightbulb, Mail, MapPinned, PartyPopper, PawPrint, Swords, Trophy, Users, Wand2 } from 'lucide-react';
import { api } from '../backend/api';
import { confetti, confettiCannons } from '../ui/confetti';
import { fmt } from '../lib/utils';
import { getBackend, toGameError } from '../backend/backend';
import { config } from '../env';
import { Button, Field, Tabs, Wordmark, inputCls } from '../ui';
import { PLOT_TYPES } from '../map/plotStyle';
import { drawPlotDesign } from '../map/plotStyle';
import type { PlotTypeId } from '../shared/grid';
import { saveStorage } from '../lib/utils';
import { pendingReferral } from '../social/referralStore';
import { isNative } from '../native/native';
import { AppWelcome } from './AppWelcome';
import { NATIVE_APP } from '../app/buildFlags';

// the website's sections under the sign-up (what you can do, art, FAQ…): not in the apps, which open on a title screen
const WelcomeMore = NATIVE_APP ? null : lazy(() => import('./WelcomeMore'));
import { PITCH, PLAYSTYLES, TAGLINE, TAGLINE_TEXT } from '../brand';
import { poll } from '../lib/poll';

/** A living canvas: plots claim themselves, fill with default designs and fuse into murals. */
export function LivingCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cols = 14, rows = 9;
    const types = Object.keys(PLOT_TYPES) as PlotTypeId[];
    const state: { t: PlotTypeId; on: number; seed: number }[] = Array.from({ length: cols * rows }, (_, i) => ({ t: types[(i * 7 + (i >> 3)) % 4], on: 0, seed: i * 13 + 5 }));
    const mural = { x: 4, y: 2, w: 5, h: 4 };
    let raf = 0;
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
    // What's still is drawn once, off screen: the plot tiles (a tile is redrawn only when it lights up) and the
    // mural's glowing frame (a blur, the costliest thing to draw). Each frame then copies those two layers and
    // paints just the moving mural — instead of every tile and the blur, every refresh.
    const bg = document.createElement('canvas'), bgx = bg.getContext('2d')!;
    const rim = document.createElement('canvas'), rimx = rim.getContext('2d')!;
    let w = 0, h = 0, dpr = 1, size = 0, gap = 0;
    const cell = (i: number) => {
      const s = state[i];
      const x = (i % cols) * size, y = Math.floor(i / cols) * size;
      const inMural = (i % cols) >= mural.x && (i % cols) < mural.x + mural.w && Math.floor(i / cols) >= mural.y && Math.floor(i / cols) < mural.y + mural.h;
      if (inMural) return;
      bgx.clearRect(x, y, size, size);
      bgx.globalAlpha = reduce ? 0.9 : 0.12 + s.on * 0.75;
      bgx.drawImage(tile(s.t, s.seed, 64), x + gap / 2, y + gap / 2, size - gap, size - gap);
      bgx.globalAlpha = 1;
    };
    const layout = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      w = c.clientWidth; h = c.clientHeight;
      c.width = bg.width = rim.width = Math.round(w * dpr);
      c.height = bg.height = rim.height = Math.round(h * dpr);
      size = Math.max(w / cols, h / rows);
      gap = Math.max(2, size * 0.06);
      bgx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (let i = 0; i < state.length; i++) cell(i);
      const mx = mural.x * size, my = mural.y * size, mw = mural.w * size, mh = mural.h * size;
      rimx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rimx.clearRect(0, 0, w, h);
      rimx.strokeStyle = 'rgba(201,246,255,0.9)';
      rimx.lineWidth = 2;
      rimx.shadowColor = '#22E3FF';
      rimx.shadowBlur = 16;
      rimx.strokeRect(mx + gap / 2, my + gap / 2, mw - gap, mh - gap);
    };
    const pace = framePacer({ ambient: true });
    const t0 = performance.now();
    let flips = 0, lit = 0;
    const draw = (now: number) => {
      if (!reduce) raf = requestAnimationFrame(draw);
      if (!reduce && !pace.ready(now)) return;
      if (c.clientWidth !== w || c.clientHeight !== h) layout();
      if (!w || !h) return; // not laid out yet
      // a tile lights up every 150 ms (what was every 9th frame at 60 a second), until they all have
      for (let due = Math.floor((now - t0) / 150); flips < due && lit < state.length; flips++) {
        const i = (flips * 37) % state.length;
        if (state[i].on < 1) { state[i].on = 1; lit++; cell(i); }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(bg, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // the fused mural: one continuous painting across 20 plots
      const mx = mural.x * size, my = mural.y * size, mw = mural.w * size, mh = mural.h * size;
      const t = reduce ? 0 : (now - t0) / 2000;
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
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(rim, 0, 0);
    };
    if (reduce) for (const s of state) s.on = 1;
    draw(performance.now());
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full opacity-70" aria-hidden />;
}


export function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}
export const STRENGTH = [['Too short', '#FF4D6D'], ['Sketch', '#FF9F1C'], ['Outline', '#FFE14D'], ['Shaded', '#3DDC97'], ['Masterpiece', '#7B5CFF']] as const;

// the app has its own opening: a game title screen, then your account in a sheet (see AppWelcome)
const APP_OPENING = isNative();
export function Welcome() {
  if (APP_OPENING) return <AppWelcome />;
  return <WebWelcome />;
}

function WebWelcome() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/world';
  const b = getBackend();
  const invite = pendingReferral();
  const [tab, setTab] = useState<'signup' | 'signin'>(params.get('mode') === 'signin' ? 'signin' : 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [inbox, setInbox] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);
  const resend = async () => {
    if (!inbox || !b.resendConfirmation) return;
    try { await b.resendConfirmation(inbox); setCooldown(60); setNotice(`Sent again to ${inbox}. Check spam or promotions too.`); } catch (err) { setError(toGameError(err).message); }
  };
  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!b.resetPassword) return;
    setBusy(true); setError(null);
    try { await b.resetPassword(email); setCooldown(60); setNotice(`If ${email} has an account, a reset link is on its way. It opens a page where you choose a new password.`); confetti({ count: 30, power: 0.5 }); }
    catch (err) { setError(toGameError(err).message); } finally { setBusy(false); }
  };
  const [joined, setJoined] = useState(false);
  // the "Welcome to LANDVAS!" moment hands over after a beat; if the game has already moved on (to onboarding),
  // the late hand-over must not fire, or it bounces that screen and wipes what the player started typing
  const leave = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (leave.current) clearTimeout(leave.current); }, []);
  const app = isNative();
  // the app opens on a game title screen; the account card slides up when you tap Play
  const [started, setStarted] = useState(!app || !!params.get('mode') || !!invite);
  const [accounts, setAccounts] = useState<{ email: string }[]>([]);
  const formRef = useRef<HTMLElement>(null);
  const stats = useQuery({ queryKey: ['public-stats'], queryFn: api.publicStats, refetchInterval: poll(300_000), staleTime: 120_000 });
  const art = useQuery({ queryKey: ['home-art'], queryFn: () => api.galleryList('new', 36), staleTime: 60_000 });
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  const st = strength(password);

  useEffect(() => {
    void b.localAccounts?.().then(setAccounts);
    if (b.session() && !joined) nav(next, { replace: true });
  }, [b, nav, next, joined]);

  const go = () => nav(next === '/welcome' || next === '/' ? '/world' : next, { replace: true });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (tab === 'signup') {
        const r = await b.signUp(email, password);
        if (r.needsConfirmation) {
          setInbox(email);
          confetti({ count: 60, power: 0.7 });
          setTab('signin');
          return;
        }
        saveStorage('landvas.welcomed', true);
        setJoined(true);
        confettiCannons();
        leave.current = setTimeout(go, 1700);
        return;
      }
      await b.signIn(email, password);
      saveStorage('landvas.welcomed', true);
      go();
    } catch (err) {
      const ge = toGameError(err);
      if (ge.code === 'email_not_confirmed') setInbox(email);
      setError(ge.message);
    } finally {
      setBusy(false);
    }
  };
  const toForm = () => { setTab('signup'); formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

  return (
    <div className="relative h-full overflow-y-auto overflow-x-hidden bg-bg" data-testid="welcome">
      <div className="relative">
        <LivingCanvas />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,transparent_0%,var(--bg)_72%)]" />
        <div className="gutter relative mx-auto grid min-h-[100dvh] max-w-6xl items-center gap-10 py-10 md:grid-cols-[1.15fr_1fr]">
          {app ? (
            <motion.section className="grid justify-items-center pt-[env(safe-area-inset-top,0px)] text-center" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} data-testid="title-screen">
              <div className="relative animate-[lv-float_3.2s_ease-in-out_infinite]">
                <div className="absolute -inset-10 rounded-full bg-accent/35 blur-3xl" />
                <img src="/brand/landvas-mark-512.png" alt="" className={started ? 'relative h-20 w-20' : 'relative h-36 w-36 drop-shadow-[0_12px_50px_rgba(123,92,255,0.7)]'} />
              </div>
              <h1 className={`relative mt-4 font-display font-black tracking-[0.16em] ${started ? 'text-3xl' : 'text-5xl'}`}>LANDVAS</h1>
              <p className="relative mt-2 font-display text-lg"><span className="lv-rainbow-anim font-bold">{TAGLINE_TEXT}</span></p>
              {!started && <PlaystyleChips className="mt-5 justify-center" />}
              {!started && (
                <div className="mt-8 grid w-full max-w-xs gap-3">
                  <motion.button whileTap={{ scale: 0.94 }} animate={{ scale: [1, 1.04, 1] }} transition={{ repeat: Infinity, duration: 1.8 }}
                    onClick={() => { setStarted(true); setTab('signup'); }} data-testid="title-play"
                    className="h-16 rounded-3xl bg-gradient-to-r from-[#FF4D6D] via-[#7B5CFF] to-[#34C3FF] font-display text-2xl font-black tracking-widest text-white shadow-[0_12px_40px_-10px_#7B5CFF]">PLAY</motion.button>
                  <button onClick={() => { setStarted(true); setTab('signin'); }} className="h-12 rounded-2xl bg-white/10 font-bold" data-testid="title-signin">I have an account</button>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {([['Players', stats.data?.players], ['Artworks', stats.data?.artworks], ['Plots', stats.data?.plots]] as const).map(([l, v]) => (
                      <div key={l} className="lv-stat rounded-2xl px-2 py-2"><div className="font-display text-lg font-bold tnum">{v == null ? '—' : fmt(v)}</div><div className="eyebrow !text-[9px]">{l}</div></div>
                    ))}
                  </div>
                </div>
              )}
            </motion.section>
          ) : (
          <motion.section className="max-w-xl" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Link to="/" aria-label="LANDVAS home"><Wordmark /></Link>
            <h1 className="mt-8 font-display text-[clamp(2.2rem,6vw,4.2rem)] font-bold leading-[1.02]">
              {TAGLINE[0]}
              <br />
              <span className="lv-rainbow-anim">{TAGLINE[1]}</span>
            </h1>
            <p className="mt-5 max-w-md text-[17px] text-muted">
              {PITCH}
            </p>
            <div className="mt-6 grid max-w-md grid-cols-3 gap-2" data-testid="welcome-stats">
              {([['Players', stats.data?.players], ['Artworks', stats.data?.artworks], ['Plots claimed', stats.data?.plots]] as const).map(([l, v]) => (
                <div key={l} className="lv-stat rounded-2xl px-3 py-2.5"><div className="font-display text-xl font-bold tnum">{v == null ? '—' : fmt(v)}</div><div className="eyebrow !text-[10px]">{l}</div></div>
              ))}
            </div>
            <ul className="mt-6 grid gap-2 text-sm text-muted">
              {['Free to play on any phone or computer — no download', 'Your first 4 plots are on us', 'Plots are virtual — owning one never means owning real land'].map((t, i) => (
                <motion.li key={t} className="flex items-center gap-2" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.12 }}><Check className="h-4 w-4 text-ok" /> {t}</motion.li>
              ))}
            </ul>
            <PlaystyleChips className="mt-6" />
            <button onClick={() => document.getElementById('what')?.scrollIntoView({ behavior: 'smooth' })} className="mt-8 hidden items-center gap-1.5 text-sm font-bold text-muted hover:text-fg md:inline-flex">See everything you can do <ChevronDown className="h-4 w-4 animate-bounce" /></button>
          </motion.section>
          )}
          {started && <motion.section ref={formRef} className="glass relative rounded-[28px] p-6" initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, delay: 0.15 }}>
            <AnimatePresence>
              {joined && (
                <motion.div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[28px] bg-bg/95 p-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid="welcome-joined">
                  <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-white shadow-[0_0_60px_-10px_var(--accent)]"><PartyPopper className="h-10 w-10" /></motion.div>
                  <div className="font-display text-2xl font-bold">Welcome to LANDVAS!</div>
                  <p className="text-sm text-muted">Your account is ready. Next: pick a name and your look.</p>
                </motion.div>
              )}
            </AnimatePresence>
            {invite && (
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mb-4 flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-3 text-sm" data-testid="welcome-invite">
                <Gift className="h-5 w-5 shrink-0 text-gold" />
                <span>You were invited with code <b className="font-mono">{invite}</b>. Create your account and it’s applied automatically.</span>
              </motion.div>
            )}
            {inbox && (
              <motion.div initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mb-4 flex items-start gap-3 rounded-2xl border border-accent-2/40 bg-accent-2/10 p-3 text-sm" data-testid="welcome-inbox">
                <motion.span animate={{ rotate: [0, -12, 12, 0] }} transition={{ repeat: Infinity, duration: 2, repeatDelay: 1 }}><Mail className="h-6 w-6 shrink-0 text-accent-2" /></motion.span>
                <span className="grid gap-1.5"><span><b>Almost there!</b> We sent a confirmation link to <b>{inbox}</b>. Tap it to verify your email — you’ll come straight back here, signed in.</span>
                  {b.resendConfirmation && <button type="button" disabled={cooldown > 0} onClick={() => void resend()} className="justify-self-start text-xs font-bold text-accent-2 underline disabled:no-underline disabled:opacity-60" data-testid="resend-confirmation">{cooldown > 0 ? `Resend in ${cooldown}s` : 'Didn’t get it? Send it again'}</button>}</span>
              </motion.div>
            )}
            <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setForgot(false); setError(null); setNotice(null); }} items={[{ value: 'signup', label: 'Create account' }, { value: 'signin', label: 'Sign in' }]} className="mb-5" />
            {forgot ? (
              <motion.form initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="grid gap-4" onSubmit={sendReset} data-testid="forgot-form">
                <div><div className="font-display text-lg font-semibold">Reset your password</div><p className="text-sm text-muted">Enter your email and we’ll send you a link to choose a new one.</p></div>
                <Field label="Email" htmlFor="reset-email" error={error}>
                  <input id="reset-email" className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email address" />
                </Field>
                {notice && <p className="rounded-xl border border-ok/40 bg-ok/10 p-3 text-sm">{notice}</p>}
                <Button variant="primary" size="lg" loading={busy} disabled={cooldown > 0 || !emailOk} type="submit" data-testid="send-reset"><Mail className="h-4 w-4" /> {cooldown > 0 ? `Sent · again in ${cooldown}s` : 'Email me a reset link'}</Button>
                <button type="button" className="text-sm font-semibold text-muted hover:text-fg" onClick={() => { setForgot(false); setNotice(null); setError(null); }}>← Back to sign in</button>
              </motion.form>
            ) : (
            <form className="grid gap-4" onSubmit={submit}>
              <Field label="Email" htmlFor="email">
                <div className="relative">
                  <input id="email" className={inputCls + ' pr-9'} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email address" />
                  {emailOk && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-3 top-1/2 -translate-y-1/2 text-ok"><Check className="h-4 w-4" /></motion.span>}
                </div>
              </Field>
              <Field label="Password" htmlFor="password" hint={tab === 'signup' ? 'At least 8 characters.' : undefined} error={error}>
                <div className="relative">
                  <input id="password" className={inputCls + ' pr-10'} type={show ? 'text' : 'password'} autoComplete={tab === 'signup' ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-fg" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                </div>
              </Field>
              {tab === 'signup' && password.length > 0 && (
                <div className="-mt-2 grid gap-1" aria-live="polite">
                  <div className="flex gap-1">{[0, 1, 2, 3].map((k) => <motion.span key={k} className="h-1.5 flex-1 rounded-full" animate={{ background: k < st ? STRENGTH[st][1] : 'var(--surface-2)' }} />)}</div>
                  <span className="text-[11px] font-bold" style={{ color: STRENGTH[st][1] }}>{STRENGTH[st][0]}</span>
                </div>
              )}
              {notice && <p className="rounded-xl border border-line bg-surface/70 p-3 text-sm">{notice}</p>}
              <motion.div whileTap={{ scale: 0.98 }}>
                <Button variant="primary" size="lg" className="w-full" loading={busy} type="submit">
                  {tab === 'signup' ? 'Create my account' : 'Sign in'} <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.div>
              {b.sendMagicLink && tab === 'signin' && (
                <Button type="button" variant="ghost" onClick={async () => {
                  try { await b.sendMagicLink!(email); setNotice('Magic link sent — check your inbox.'); } catch (err) { setError(toGameError(err).message); }
                }}>
                  <Mail className="h-4 w-4" /> Email me a sign-in link
                </Button>
              )}
              {tab === 'signin' && b.resetPassword && (
                <button type="button" className="text-sm font-semibold text-accent-2 hover:underline" onClick={() => { setForgot(true); setNotice(null); setError(null); }} data-testid="forgot-password">Forgot your password?</button>
              )}
            </form>
            )}
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
            <button className="mt-5 w-full text-center text-sm font-semibold text-muted hover:text-fg" onClick={() => { saveStorage('landvas.welcomed', true); nav('/world'); }}>
              Explore the map first →
            </button>
          </motion.section>}
        </div>
      </div>

      {!app && WelcomeMore && <Suspense fallback={null}><WelcomeMore art={art.data ?? []} artLoading={art.isLoading} toForm={toForm} /></Suspense>}
      {config.isArtifact && <span className="sr-only">Playable build</span>}
    </div>
  );
}

/** Every way to play, at a glance. */
export function PlaystyleChips({ className }: { className?: string }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className ?? ''}`} data-testid="playstyles">
      {PLAYSTYLES.map((p, i) => (
        <motion.span key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.07 }}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: `${p.color}22`, color: p.color, boxShadow: `inset 0 0 0 1px ${p.color}55` }}>
          {p.emoji} {p.title}
        </motion.span>
      ))}
    </div>
  );
}
