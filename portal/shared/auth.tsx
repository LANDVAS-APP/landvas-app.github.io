// Signing in to the portals (the same LANDVAS account as the game), password reset, and two-step sign-in.
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Mail, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { getBackend, toGameError } from '../../src/backend/backend';
import { Button, Switch } from '../../src/ui';
import { cn } from '../../src/lib/utils';
import { isDev, openedFromRecovery } from './boot';
import { portal, type WhoAmI } from './api';
import { Badge, ErrorBox, Loading, Panel } from './ui';

const GAME = 'https://landvas.app';

function Frame({ children, title, sub }: { children: ReactNode; title: string; sub: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-3">
          <PlotMark />
          <span className="font-display text-lg font-semibold tracking-tight">LANDVAS</span>
        </div>
        <h1 className="p-h1">{title}</h1>
        <p className="p-sub mt-2">{sub}</p>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

/** the brand mark here: a 3×3 block of plots, one of them claimed */
export function PlotMark({ size = 26 }: { size?: number }) {
  const c = size / 3;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {[0, 1, 2].flatMap((x) => [0, 1, 2].map((y) => (
        <rect key={`${x}${y}`} x={x * c + 1} y={y * c + 1} width={c - 2} height={c - 2} rx={2}
          fill={x === 1 && y === 1 ? 'var(--accent)' : x === 2 && y === 0 ? 'var(--accent-2)' : 'rgba(160,180,255,0.18)'} />
      )))}
    </svg>
  );
}

export function SignIn({ app }: { app: 'admin' | 'my' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'link' | 'reset'>('password');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const b = getBackend();
  const devUsers = useQuery({ queryKey: ['dev-users'], enabled: isDev(), queryFn: () => (b as any).users() as Promise<{ email: string; username: string | null }[]> });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (mode === 'password') await b.signIn(email.trim(), password);
      else if (mode === 'link') { await b.sendMagicLink?.(email.trim()); setSent('Check your email for a sign-in link. It opens this page signed in.'); }
      else { await b.resetPassword?.(email.trim()); setSent('Check your email for a link to choose a new password.'); }
    } catch (e2) {
      const g = toGameError(e2);
      setErr(/invalid login|invalid_credentials/i.test(g.message) ? 'That email and password don’t match a LANDVAS account.' : g.message);
    } finally { setBusy(false); }
  };
  return (
    <Frame title={app === 'admin' ? 'LANDVAS admin' : 'My LANDVAS'}
      sub={app === 'admin' ? 'Staff only. Sign in with your LANDVAS account.' : 'Your earnings, plots, collection and full history, all in one place. Sign in with the account you play with.'}>
      <form className="grid gap-3" onSubmit={submit}>
        <label className="grid gap-1">
          <span className="p-label">Email</span>
          <input className="p-input h-11" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="signin-email" />
        </label>
        {mode === 'password' && (
          <label className="grid gap-1">
            <span className="p-label">Password</span>
            <input className="p-input h-11" type="password" autoComplete="current-password" required={!isDev()} value={password} onChange={(e) => setPassword(e.target.value)} data-testid="signin-password" />
          </label>
        )}
        {err && <p className="text-sm text-bad" role="alert">{err}</p>}
        {sent ? <p className="rounded-xl border border-ok/40 bg-ok/10 px-3 py-2 text-sm" role="status">{sent}</p> : (
          <Button type="submit" variant="primary" size="lg" loading={busy} data-testid="signin-submit">
            {mode === 'password' ? 'Sign in' : mode === 'link' ? <><Mail className="h-4 w-4" /> Email me a sign-in link</> : 'Email me a reset link'}
          </Button>
        )}
      </form>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {mode !== 'password' && <button className="text-accent-2 hover:underline" onClick={() => { setMode('password'); setSent(null); }}>Sign in with a password</button>}
        {mode !== 'link' && <button className="text-accent-2 hover:underline" onClick={() => { setMode('link'); setSent(null); }}>Email me a sign-in link</button>}
        {mode !== 'reset' && <button className="text-accent-2 hover:underline" onClick={() => { setMode('reset'); setSent(null); }}>Forgot your password?</button>}
      </div>
      {app === 'my' && <p className="mt-6 text-sm text-muted">New to LANDVAS? <a className="text-accent-2 hover:underline" href={`${GAME}/welcome`}>Start playing</a> — this page fills up as you play.</p>}
      {isDev() && devUsers.data && (
        <div className="mt-8 rounded-xl border border-dashed border-line p-3 text-xs text-muted">
          <div className="mb-2 font-semibold">Local accounts (dev)</div>
          <div className="flex flex-wrap gap-1.5">{devUsers.data.slice(0, 30).map((u) => <button key={u.email} className="p-chip" onClick={() => { void b.signIn(u.email, ''); }}>{u.username ?? u.email}</button>)}</div>
        </div>
      )}
    </Frame>
  );
}

/** shown after a password-reset link: choose a new password */
export function ResetPassword({ onDone }: { onDone(): void }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Frame title="Choose a new password" sub="Use at least 8 characters. You’ll use it in the game and here.">
      <form className="grid gap-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        try { await getBackend().updatePassword?.(pw); toast.success('Password changed'); history.replaceState(null, '', '/'); onDone(); }
        catch (e2) { toast.error(toGameError(e2).message); } finally { setBusy(false); }
      }}>
        <input className="p-input h-11" type="password" autoComplete="new-password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} aria-label="New password" />
        <Button type="submit" variant="primary" size="lg" loading={busy}>Save new password</Button>
      </form>
    </Frame>
  );
}

export function useRecovery() {
  const [on, setOn] = useState(openedFromRecovery);
  useEffect(() => getBackend().onPasswordRecovery?.(() => setOn(true)), []);
  return [on, () => setOn(false)] as const;
}

// ---- two-step sign-in ---------------------------------------------------------------------------------------------

type Factor = { id: string; friendly_name?: string | null; factor_type: string; status: string; created_at: string };
const auth = () => getBackend().authClient?.();

export function useFactors() {
  return useQuery({
    queryKey: ['mfa-factors'],
    queryFn: async (): Promise<Factor[]> => {
      const a = auth();
      if (!a) return [];
      const { data, error } = await a.mfa.listFactors();
      if (error) throw error;
      return (data?.all ?? []) as Factor[];
    },
  });
}

async function verify(factorId: string, code: string) {
  const a = auth();
  if (!a) { (getBackend() as any).devVerify?.(); return; }
  const { error } = await a.mfa.challengeAndVerify({ factorId, code });
  if (error) throw new Error(/invalid/i.test(error.message) ? 'That code didn’t match. Codes change every 30 seconds — try the current one.' : error.message);
}

/** staff must verify with an authenticator app when the owner has switched it on */
export function MfaChallenge({ who, onVerified }: { who: WhoAmI; onVerified(): void }) {
  const factors = useFactors();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const verified = (factors.data ?? []).filter((f) => f.status === 'verified' && f.factor_type === 'totp');
  if (factors.isLoading) return <Loading />;
  return (
    <Frame title="Two-step sign-in" sub={verified.length ? 'Enter the 6-digit code from your authenticator app.' : 'Staff accounts need an authenticator app. Set one up to continue.'}>
      {verified.length ? (
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr(null);
          try { await verify(verified[0].id, code.replace(/\s/g, '')); onVerified(); } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
        }}>
          <input className="p-input h-12 text-center text-xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus value={code} onChange={(e) => setCode(e.target.value)} aria-label="Authenticator code" data-testid="mfa-code" />
          {err && <p className="text-sm text-bad" role="alert">{err}</p>}
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={code.replace(/\s/g, '').length < 6 && !isDev()}>Verify</Button>
        </form>
      ) : <EnrollTotp onDone={onVerified} />}
      <p className="mt-6 text-xs text-muted">Signed in as @{who.username}. <button className="text-accent-2 hover:underline" onClick={() => void getBackend().signOut()}>Use another account</button></p>
    </Frame>
  );
}

function EnrollTotp({ onDone }: { onDone(): void }) {
  const qc = useQueryClient();
  const [enr, setEnr] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const start = async () => {
    setBusy(true); setErr(null);
    try {
      const a = auth();
      if (!a) { (getBackend() as any).devVerify?.(); onDone(); return; }
      // a half-finished set-up from before would block a new one
      const old = await a.mfa.listFactors();
      for (const f of (old.data?.all ?? []) as Factor[]) if (f.status !== 'verified') await a.mfa.unenroll({ factorId: f.id });
      const { data, error } = await a.mfa.enroll({ factorType: 'totp', friendlyName: `LANDVAS admin ${new Date().toLocaleDateString()}` });
      if (error) throw error;
      setEnr({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (e) { setErr(toGameError(e).message); } finally { setBusy(false); }
  };
  if (!enr) return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">Use any authenticator app — Google Authenticator, 1Password, Authy or your phone’s built-in passwords app.</p>
      {err && <p className="text-sm text-bad">{err}</p>}
      <Button variant="primary" size="lg" loading={busy} onClick={start}><Smartphone className="h-4 w-4" /> Set up an authenticator app</Button>
    </div>
  );
  return (
    <form className="grid gap-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      try { await verify(enr.id, code.replace(/\s/g, '')); void qc.invalidateQueries({ queryKey: ['mfa-factors'] }); toast.success('Authenticator app added'); onDone(); }
      catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
    }}>
      <ol className="grid list-decimal gap-1 pl-5 text-sm text-muted">
        <li>Scan this code with your authenticator app.</li>
        <li>Type the 6-digit code it shows.</li>
      </ol>
      <div className="mx-auto rounded-2xl bg-white p-3"><img src={enr.qr} alt="QR code for your authenticator app" width={180} height={180} /></div>
      <details className="text-xs text-muted"><summary className="cursor-pointer">Can’t scan? Enter this key instead</summary><code className="p-mono mt-1 block break-all text-fg">{enr.secret}</code></details>
      <input className="p-input h-12 text-center text-xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Authenticator code" />
      {err && <p className="text-sm text-bad" role="alert">{err}</p>}
      <Button type="submit" variant="primary" size="lg" loading={busy} disabled={code.replace(/\s/g, '').length < 6}>Verify and finish</Button>
    </form>
  );
}

/** the Security page's two-step sign-in panel: your authenticator apps and the staff-wide requirement */
export function MfaSettings({ who, onChange }: { who: WhoAmI; onChange(): void }) {
  const qc = useQueryClient();
  const factors = useFactors();
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const verified = (factors.data ?? []).filter((f) => f.status === 'verified');
  const devMode = !auth();
  return (
    <Panel title={<span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent-2" /> Two-step sign-in</span>}
      actions={<Badge tone={who.aal === 'aal2' ? 'ok' : 'warn'}>{who.aal === 'aal2' ? 'This sign-in is verified' : 'Password only'}</Badge>}>
      <div className="grid gap-4">
        <p className="text-sm text-muted">With two-step sign-in on, every staff action — here and in the game’s admin screen — needs a sign-in verified with an authenticator app. Players are never affected.</p>
        {factors.error ? <ErrorBox error={factors.error} retry={() => void factors.refetch()} /> : (
          <div className="grid gap-2">
            {verified.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm">
                <Smartphone className="h-4 w-4 text-muted" />
                <span className="min-w-0 flex-1 truncate">{f.friendly_name || 'Authenticator app'} <span className="text-faint">added {new Date(f.created_at).toLocaleDateString()}</span></span>
                <Button size="sm" variant="ghost" disabled={verified.length <= 1 && who.require_mfa} title={verified.length <= 1 && who.require_mfa ? 'Turn off the requirement before removing your only app' : undefined}
                  onClick={async () => { await auth()?.mfa.unenroll({ factorId: f.id }); void qc.invalidateQueries({ queryKey: ['mfa-factors'] }); toast.success('Authenticator app removed'); }}>
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              </div>
            ))}
            {!verified.length && !devMode && <p className="text-sm">No authenticator app yet.</p>}
            {adding ? <div className="rounded-xl border border-line p-3"><EnrollTotp onDone={() => { setAdding(false); onChange(); }} /></div>
              : !devMode && <div><Button size="sm" onClick={() => setAdding(true)}><KeyRound className="h-4 w-4" /> Add an authenticator app</Button></div>}
          </div>
        )}
        {who.aal !== 'aal2' && (verified.length > 0 || devMode) && (
          <form className="flex flex-wrap items-center gap-2" onSubmit={async (e) => {
            e.preventDefault(); setBusy(true);
            try { await verify(verified[0]?.id ?? '', code); toast.success('Verified'); onChange(); } catch (e2) { toast.error((e2 as Error).message); } finally { setBusy(false); }
          }}>
            <input className="p-input w-40 text-center tracking-[0.3em]" inputMode="numeric" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Authenticator code" />
            <Button size="sm" type="submit" loading={busy}>Verify this sign-in</Button>
          </form>
        )}
        {who.owner && (
          <div className={cn('rounded-xl border p-3', who.require_mfa ? 'border-ok/40 bg-ok/5' : 'border-line')}>
            <Switch id="require-mfa" checked={who.require_mfa} label="Require two-step sign-in for all staff"
              hint={who.aal !== 'aal2' ? 'Verify this sign-in first, so you can’t lock yourself out.' : 'Staff without an authenticator app are asked to set one up the next time they sign in.'}
              onCheckedChange={async (on) => {
                try { await portal.setMfa(on); toast.success(on ? 'Two-step sign-in is now required for staff' : 'Two-step sign-in is no longer required'); onChange(); }
                catch (e) { toast.error(toGameError(e).code === 'mfa_required' ? 'Verify this sign-in with your authenticator app first.' : toGameError(e).message); }
              }} />
          </div>
        )}
      </div>
    </Panel>
  );
}
