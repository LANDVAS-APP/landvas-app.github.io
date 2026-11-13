// The app's opening: a game title screen over a living canvas of plots, then your account in a sheet that slides
// up — and, when your email needs confirming, a "check your inbox" screen that lets you in by itself the moment you
// come back from your email.
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, ChevronLeft, Eye, EyeOff, Gift, Mail, PartyPopper, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import { TAGLINE_TEXT } from '../brand';
import { fmt, saveStorage } from '../lib/utils';
import { poll } from '../lib/poll';
import { buzz } from '../native/native';
import { pendingReferral } from '../social/referralStore';
import { confetti, confettiCannons } from '../ui/confetti';
import { cn } from '../lib/utils';
import { LivingCanvas, STRENGTH, strength } from './Welcome';

type Stage = 'title' | 'account' | 'inbox';
const LETTERS = 'LANDVAS'.split('');
const RISE = { h: { opacity: 0, y: 14 }, v: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 420, damping: 30 } } };
const PLOT_COLORS = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF', '#8B6BFF'];
// little plots drifting up behind the title (fixed, so they don't jump between renders)
const MOTES = Array.from({ length: 16 }, (_, i) => ({ x: (i * 37 + 11) % 100, c: PLOT_COLORS[i % PLOT_COLORS.length], d: -((i * 1.7) % 9), t: 9 + ((i * 5) % 7), s: 5 + ((i * 3) % 6) }));

export function AppWelcome() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/world';
  const b = getBackend();
  const invite = pendingReferral();
  const [stage, setStage] = useState<Stage>(params.get('mode') || invite ? 'account' : 'title');
  const [tab, setTab] = useState<'signup' | 'signin'>(params.get('mode') === 'signin' ? 'signin' : 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [joined, setJoined] = useState(false);
  const stats = useQuery({ queryKey: ['public-stats'], queryFn: api.publicStats, refetchInterval: poll(300_000), staleTime: 120_000 });
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  const st = strength(password);
  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);
  useEffect(() => { if (b.session() && !joined) nav(next, { replace: true }); }, [b, nav, next, joined]);
  const go = () => nav(next === '/welcome' || next === '/' ? '/world' : next, { replace: true });
  const welcome = () => { saveStorage('landvas.welcomed', true); setJoined(true); buzz('success'); confettiCannons(); setTimeout(go, 1700); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      if (tab === 'signup') {
        const r = await b.signUp(email, password);
        if (r.needsConfirmation) { setStage('inbox'); setCooldown(30); buzz('success'); confetti({ count: 40, power: 0.6 }); return; }
        welcome();
        return;
      }
      await b.signIn(email, password);
      saveStorage('landvas.welcomed', true);
      go();
    } catch (err) {
      const ge = toGameError(err);
      if (ge.code === 'email_not_confirmed') { setStage('inbox'); return; }
      buzz('warning');
      setError(ge.message);
    } finally { setBusy(false); }
  };
  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!b.resetPassword) return;
    setBusy(true); setError(null);
    try { await b.resetPassword(email); setCooldown(60); setNotice(`If ${email} has an account, a reset link is on its way.`); }
    catch (err) { setError(toGameError(err).message); } finally { setBusy(false); }
  };

  return (
    <div className="lv-open relative h-full overflow-hidden" data-testid="welcome">
      <LivingCanvas />
      <div className="lv-open-shade" aria-hidden />
      <div className="lv-motes" aria-hidden>{MOTES.map((m, i) => <i key={i} style={{ left: `${m.x}%`, background: m.c, animationDelay: `${m.d}s`, animationDuration: `${m.t}s`, width: m.s, height: m.s }} />)}</div>
      <AnimatePresence mode="wait">
        {stage === 'title' && <Title key="title" stats={stats.data} onPlay={() => { buzz('medium'); setTab('signup'); setStage('account'); }} onSignIn={() => { buzz('light'); setTab('signin'); setStage('account'); }} />}
        {stage === 'account' && (
          <motion.div key="account" className="absolute inset-0 flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex flex-1 flex-col items-center justify-center px-6 pt-[max(16px,env(safe-area-inset-top,0px))]">
              <motion.img src="/brand/landvas-mark-512.png" alt="" className="lv-open-mark h-20 w-20" initial={{ scale: 0.6, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} />
              <div className="mt-3 font-display text-[26px] font-black tracking-[0.18em]">LANDVAS</div>
            </div>
            <motion.section className="lv-authsheet" data-testid="auth-sheet"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 34 }}>
              <span className="grip" aria-hidden />
              <button className="lv-authback" onClick={() => { setStage('title'); setForgot(false); setError(null); }} aria-label="Back"><ChevronLeft className="h-5 w-5" /></button>
              {invite && (
                <div className="mb-3 flex items-center gap-2.5 rounded-2xl border border-[#e9b23f]/40 bg-[#e9b23f]/10 p-3 text-[13px]" data-testid="welcome-invite">
                  <Gift className="h-5 w-5 shrink-0 text-[#ffd86b]" /><span>Invited with code <b className="font-mono">{invite}</b> — it’s applied when you join.</span>
                </div>
              )}
              {forgot ? (
                <motion.form initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="grid gap-3.5" onSubmit={sendReset} data-testid="forgot-form">
                  <div><div className="font-display text-[22px] font-black">Reset your password</div><p className="mt-1 text-[13px] text-white/60">We’ll email you a link to choose a new one.</p></div>
                  <input id="reset-email" className="lv-input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" />
                  {error && <p className="lv-autherr">{error}</p>}
                  {notice && <p className="lv-authok">{notice}</p>}
                  <button className="lv-btn lv-rainbow h-14 w-full text-[16px]" disabled={busy || cooldown > 0 || !emailOk} type="submit" data-testid="send-reset">{cooldown > 0 ? `Sent · again in ${cooldown}s` : 'Email me a reset link'}</button>
                  <button type="button" className="text-[13px] font-bold text-white/60" onClick={() => { setForgot(false); setNotice(null); setError(null); }}>← Back to sign in</button>
                </motion.form>
              ) : (
                <>
                  <div className="lv-authtabs" role="tablist">
                    {(['signup', 'signin'] as const).map((t) => (
                      <button key={t} role="tab" aria-selected={tab === t} className={cn(tab === t && 'on')} onClick={() => { setTab(t); setError(null); setNotice(null); }}>
                        {tab === t && <motion.span layoutId="authtab" className="pill" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
                        <span className="relative">{t === 'signup' ? 'Create account' : 'Sign in'}</span>
                      </button>
                    ))}
                  </div>
                  <motion.form className="mt-4 grid gap-3" onSubmit={submit} initial="h" animate="v" variants={{ v: { transition: { staggerChildren: 0.06, delayChildren: 0.12 } } }}>
                    <motion.label variants={RISE} className="lv-field">
                      <Mail className="ic" />
                      <input id="email" className="lv-input pl-11 pr-10" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
                      {emailOk && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="ok"><Check className="h-4 w-4" /></motion.span>}
                    </motion.label>
                    <motion.label variants={RISE} className="lv-field">
                      <span className="ic text-[15px]">🔒</span>
                      <input id="password" className="lv-input pl-11 pr-11" type={show ? 'text' : 'password'} autoComplete={tab === 'signup' ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tab === 'signup' ? 'Password (8+ characters)' : 'Password'} />
                      <button type="button" className="eye" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                    </motion.label>
                    {tab === 'signup' && password.length > 0 && (
                      <div className="grid gap-1 px-1" aria-live="polite">
                        <div className="flex gap-1">{[0, 1, 2, 3].map((k) => <motion.span key={k} className="h-1.5 flex-1 rounded-full" animate={{ background: k < st ? STRENGTH[st][1] : 'rgba(255,255,255,0.1)' }} />)}</div>
                        <span className="text-[11px] font-bold" style={{ color: STRENGTH[st][1] }}>{STRENGTH[st][0]}</span>
                      </div>
                    )}
                    {error && <motion.p initial={{ x: -6 }} animate={{ x: [6, -4, 2, 0] }} className="lv-autherr" role="alert">{error}</motion.p>}
                    {notice && <p className="lv-authok">{notice}</p>}
                    <motion.button variants={RISE} whileTap={{ scale: 0.96 }} className="lv-btn lv-rainbow lv-sheen h-14 w-full text-[17px]" disabled={busy} type="submit" data-testid="auth-submit">
                      {busy ? <span className="lv-loader sm"><i /><i /><i /></span> : <>{tab === 'signup' ? 'Create my account' : 'Sign in'} <ArrowRight className="h-5 w-5" /></>}
                    </motion.button>
                    {tab === 'signin' && b.resetPassword && (
                      <button type="button" className="text-[13px] font-bold text-[#9fb3ff]" onClick={() => { setForgot(true); setNotice(null); setError(null); }} data-testid="forgot-password">Forgot your password?</button>
                    )}
                    {tab === 'signup' && <p className="text-center text-[11.5px] font-semibold text-white/45">We’ll email you a link to confirm it’s you. Your first 4 plots are free.</p>}
                  </motion.form>
                </>
              )}
            </motion.section>
          </motion.div>
        )}
        {stage === 'inbox' && (
          <Inbox key="inbox" email={email} password={password} cooldown={cooldown} setCooldown={setCooldown}
            onIn={welcome} onBack={() => { setStage('account'); setTab('signup'); setError(null); }} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {joined && (
          <motion.div className="lv-joined" initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid="welcome-joined">
            <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} className="lv-joined-badge"><PartyPopper className="h-11 w-11" /></motion.div>
            <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="font-display text-[28px] font-black">You’re in!</motion.div>
            <motion.p initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.32 }} className="text-[14px] text-white/65">Next: pick your name and your look.</motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Title({ stats, onPlay, onSignIn }: { stats?: { players?: number; artworks?: number; plots?: number }; onPlay(): void; onSignIn(): void }) {
  return (
    <motion.section key="title" className="absolute inset-0 flex flex-col items-center justify-center px-6 pb-[max(24px,env(safe-area-inset-bottom,0px))] pt-[max(24px,env(safe-area-inset-top,0px))] text-center"
      exit={{ opacity: 0, scale: 1.04, transition: { duration: 0.25 } }} data-testid="title-screen">
      <motion.div className="relative" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.1 }}>
        <img src="/brand/landvas-mark-512.png" alt="" className="lv-open-mark relative h-36 w-36" />
      </motion.div>
      <h1 className="mt-6 flex font-display text-[46px] font-black tracking-[0.14em]" aria-label="LANDVAS">
        {LETTERS.map((l, i) => (
          <motion.span key={i} initial={{ y: 26, opacity: 0, rotateX: 90 }} animate={{ y: 0, opacity: 1, rotateX: 0 }} transition={{ delay: 0.35 + i * 0.06, type: 'spring', stiffness: 320, damping: 20 }}>{l}</motion.span>
        ))}
      </h1>
      <motion.p className="mt-1 font-display text-[17px] font-bold" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}><span className="lv-rainbow-anim">{TAGLINE_TEXT}</span></motion.p>
      <motion.div className="mt-10 grid w-full max-w-xs gap-3" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.05, type: 'spring', stiffness: 260, damping: 24 }}>
        <motion.button whileTap={{ scale: 0.95 }} onClick={onPlay} data-testid="title-play" className="lv-btn lv-rainbow lv-sheen lv-playbtn h-[66px] w-full font-display text-[27px] font-black tracking-[0.22em]">PLAY</motion.button>
        <button onClick={onSignIn} className="lv-btn h-12 w-full text-[15px]" data-testid="title-signin">I have an account</button>
      </motion.div>
      <motion.div className="mt-7 grid w-full max-w-xs grid-cols-3 gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }}>
        {([['Players', stats?.players], ['Artworks', stats?.artworks], ['Plots', stats?.plots]] as const).map(([l, v]) => (
          <div key={l} className="lv-openstat"><b className="tnum">{v == null ? '—' : fmt(v)}</b><i>{l}</i></div>
        ))}
      </motion.div>
    </motion.section>
  );
}

/** "check your inbox": the app tries your sign-in again whenever you come back to it, so confirming is all it takes */
function Inbox({ email, password, cooldown, setCooldown, onIn, onBack }: { email: string; password: string; cooldown: number; setCooldown(n: number): void; onIn(): void; onBack(): void }) {
  const b = getBackend();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const done = useRef(false);
  const tryIn = async (manual: boolean) => {
    if (done.current || !password) return;
    if (manual) setBusy(true);
    try { await b.signIn(email, password); done.current = true; onIn(); }
    catch (err) { if (manual) { const ge = toGameError(err); buzz('warning'); setMsg(ge.code === 'email_not_confirmed' ? 'Not confirmed yet — tap the link in the email first.' : ge.message); } }
    finally { if (manual) setBusy(false); }
  };
  useEffect(() => {
    const back = () => { if (document.visibilityState === 'visible') void tryIn(false); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    const t = setInterval(() => { if (document.visibilityState === 'visible') void tryIn(false); }, 15_000);
    return () => { document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); clearInterval(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const resend = async () => {
    if (!b.resendConfirmation) return;
    try { await b.resendConfirmation(email); setCooldown(60); setMsg(`Sent again to ${email}. Check spam and promotions too.`); buzz('light'); }
    catch (err) { setMsg(toGameError(err).message); }
  };
  return (
    <motion.section className="absolute inset-0 flex flex-col items-center justify-center px-7 text-center" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} data-testid="welcome-inbox">
      <div className="lv-envelope" aria-hidden>
        <span className="letter"><i /><i /><i /></span>
        <span className="body" />
        <span className="flap" />
        <span className="spark s1">✦</span><span className="spark s2">✦</span><span className="spark s3">✦</span>
      </div>
      <h1 className="mt-8 font-display text-[30px] font-black leading-tight">Check your inbox</h1>
      <p className="mt-2 max-w-xs text-[14.5px] leading-snug text-white/70">We sent a confirmation link to<br /><b className="text-white">{email}</b></p>
      <p className="mt-3 max-w-xs text-[12.5px] font-semibold text-white/45">Tap it, then come back — you’ll be let in automatically.</p>
      {msg && <p className="lv-authok mt-4 max-w-xs" role="status">{msg}</p>}
      <div className="mt-7 grid w-full max-w-xs gap-2.5">
        <button className="lv-btn lv-rainbow lv-sheen h-14 w-full text-[16px]" disabled={busy} onClick={() => void tryIn(true)} data-testid="inbox-continue">
          {busy ? <span className="lv-loader sm"><i /><i /><i /></span> : <>I’ve confirmed — let me in <ArrowRight className="h-5 w-5" /></>}
        </button>
        {b.resendConfirmation && (
          <button className="lv-btn h-12 w-full text-[14px]" disabled={cooldown > 0} onClick={() => void resend()} data-testid="resend-confirmation">
            <RefreshCw className="h-4 w-4" /> {cooldown > 0 ? `Send again in ${cooldown}s` : 'Send the email again'}
          </button>
        )}
        <button className="mt-1 text-[13px] font-bold text-white/55" onClick={onBack}>Use a different email</button>
      </div>
    </motion.section>
  );
}
