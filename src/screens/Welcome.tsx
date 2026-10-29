import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Brush, Check, ChevronDown, CircleDollarSign, Eye, EyeOff, Gamepad2, Gift, Lightbulb, Mail, MapPinned, PartyPopper, Swords, Trophy, Users, Wand2 } from 'lucide-react';
import { api } from '../backend/api';
import { ArtMarquee, Earnings, HowItWorks, Minigames, Social, Footer } from '../home/HomePage';
import { FAQ } from '../home/faq';
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

const FEATURES = [
  { icon: MapPinned, color: '#34C3FF', title: 'Claim real places', text: 'Your first 4 plots are free. Every plot is a square of the real world map — house-sized, rare or legendary.' },
  { icon: Brush, color: '#FF4D6D', title: 'Paint with helpers', text: 'Brushes, layers and mirror mode, plus idea prompts, ready-made palettes, shade ramps and trace guides.' },
  { icon: Gamepad2, color: '#3DDC97', title: 'Eight minigames', text: 'Each plot hides a game. Clear rounds to earn Ink — the currency that buys the plots next door.' },
  { icon: Swords, color: '#FF9F1C', title: 'PvP minigames', text: 'Free head-to-head rounds against anonymous rivals for bonus Ink.' },
  { icon: Wand2, color: '#7B5CFF', title: 'Murals across plots', text: 'Merge neighbouring plots and paint one continuous mural — up to thousands of plots wide.' },
  { icon: CircleDollarSign, color: '#22C7B5', title: 'Rent every second', text: 'Your land earns USD rent around the clock. Boost it 20× once a day.' },
  { icon: Trophy, color: '#FFE14D', title: 'Daily wheel & challenges', text: 'Spin daily, enter weekly themed challenges, get featured, and earn for original craft.' },
  { icon: Users, color: '#FF4FD8', title: 'Friends pay off', text: 'Invite friends for an Ink bonus — and a share of what they earn while they play.' },
];

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}
const STRENGTH = [['Too short', '#FF4D6D'], ['Sketch', '#FF9F1C'], ['Outline', '#FFE14D'], ['Shaded', '#3DDC97'], ['Masterpiece', '#7B5CFF']] as const;

export function Welcome() {
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
  const [accounts, setAccounts] = useState<{ email: string }[]>([]);
  const formRef = useRef<HTMLElement>(null);
  const stats = useQuery({ queryKey: ['public-stats'], queryFn: api.publicStats, refetchInterval: 60_000 });
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
        setTimeout(go, 1700);
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
          <motion.section className="max-w-xl" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Link to="/" aria-label="LANDVAS home"><Wordmark /></Link>
            <h1 className="mt-8 font-display text-[clamp(2.2rem,6vw,4.2rem)] font-bold leading-[1.02]">
              Own a piece.
              <br />
              <span className="lv-rainbow-anim">Paint the world.</span>
            </h1>
            <p className="mt-5 max-w-md text-[17px] text-muted">
              The planet is split into house-sized plots. Claim one for free, paint it, play its minigame for Ink, then grow it into a mural the whole world sees on the live map.
            </p>
            <div className="mt-6 grid max-w-md grid-cols-3 gap-2" data-testid="welcome-stats">
              {([['Artists', stats.data?.players], ['Artworks', stats.data?.artworks], ['Plots claimed', stats.data?.plots]] as const).map(([l, v]) => (
                <div key={l} className="lv-stat rounded-2xl px-3 py-2.5"><div className="font-display text-xl font-bold tnum">{v == null ? '—' : fmt(v)}</div><div className="eyebrow !text-[10px]">{l}</div></div>
              ))}
            </div>
            <ul className="mt-6 grid gap-2 text-sm text-muted">
              {['Free to play on any phone or computer — no download', 'Your first 4 plots are on us', 'Plots are virtual — owning one never means owning real land'].map((t, i) => (
                <motion.li key={t} className="flex items-center gap-2" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.12 }}><Check className="h-4 w-4 text-ok" /> {t}</motion.li>
              ))}
            </ul>
            <button onClick={() => document.getElementById('what')?.scrollIntoView({ behavior: 'smooth' })} className="mt-8 hidden items-center gap-1.5 text-sm font-bold text-muted hover:text-fg md:inline-flex">See everything you can do <ChevronDown className="h-4 w-4 animate-bounce" /></button>
          </motion.section>
          <motion.section ref={formRef} className="glass relative rounded-[28px] p-6" initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, delay: 0.15 }}>
            <AnimatePresence>
              {joined && (
                <motion.div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[28px] bg-bg/95 p-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid="welcome-joined">
                  <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-white shadow-[0_0_60px_-10px_var(--accent)]"><PartyPopper className="h-10 w-10" /></motion.div>
                  <div className="font-display text-2xl font-bold">Welcome to LANDVAS!</div>
                  <p className="text-sm text-muted">Your artist account is ready. Next: pick a name and your look.</p>
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
                  {tab === 'signup' ? 'Create my artist account' : 'Sign in'} <ArrowRight className="h-4 w-4" />
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
          </motion.section>
        </div>
      </div>

      <section id="what" className="gutter mx-auto max-w-7xl py-16">
        <div className="mx-auto max-w-2xl text-center">
          <div className="eyebrow">What you can do</div>
          <h2 className="mt-2 font-display text-3xl font-bold md:text-5xl">One map. Endless ways to play.</h2>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <motion.article key={f.title} className="glass rounded-3xl p-5" initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ delay: (i % 4) * 0.08 }}>
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: `${f.color}22`, color: f.color, boxShadow: `0 0 30px -8px ${f.color}` }}><f.icon className="h-5 w-5" /></div>
              <h3 className="font-display text-base font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
            </motion.article>
          ))}
        </div>
      </section>
      <ArtMarquee cards={art.data ?? []} loading={art.isLoading} />
      <HowItWorks />
      <Earnings />
      <Minigames />
      <Social />
      <section className="gutter mx-auto max-w-4xl py-16">
        <h2 className="text-center font-display text-3xl font-bold md:text-4xl">Questions, answered</h2>
        <div className="mt-8 grid gap-3">
          {FAQ.slice(0, 8).map((f) => (
            <details key={f.q} className="lv-faq group glass rounded-2xl px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">{f.q}<ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" /></summary>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="gutter py-10">
        <div className="lv-final relative mx-auto max-w-6xl overflow-hidden rounded-[40px] px-6 py-14 text-center">
          <Lightbulb className="relative mx-auto h-10 w-10 text-white/90" />
          <h2 className="relative mt-3 font-display text-[clamp(1.8rem,5vw,3.2rem)] font-bold leading-tight text-white">Your first 4 plots are waiting.</h2>
          <p className="relative mx-auto mt-3 max-w-lg text-white/80">It takes a few seconds to join — then the tutorial shows you around.</p>
          <button onClick={toForm} className="relative mt-7 inline-flex h-14 items-center gap-2 rounded-2xl bg-white px-8 text-base font-extrabold text-[#1d1550] transition hover:scale-[1.03]">Create my free account <ArrowRight className="h-5 w-5" /></button>
        </div>
      </section>
      <Footer />
      {config.isArtifact && <span className="sr-only">Playable build</span>}
    </div>
  );
}
