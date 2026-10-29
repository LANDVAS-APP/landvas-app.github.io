// /reset-password — where a password-reset email lands: choose a new password.
import { motion } from 'motion/react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getBackend, toGameError } from '../backend/backend';
import { useSession } from '../app/App';
import { Button, Field, Wordmark, inputCls } from '../ui';
import { confettiCannons } from '../ui/confetti';

export function ResetPassword() {
  const b = getBackend();
  const session = useSession();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(true);
  // the link signs the player in a moment after the page opens
  useEffect(() => { const t = setTimeout(() => setWaiting(false), 2500); return () => clearTimeout(t); }, []);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setError('Use at least 8 characters.');
    if (pw !== pw2) return setError('The two passwords don’t match.');
    setBusy(true); setError(null);
    try {
      await b.updatePassword!(pw);
      confettiCannons();
      toast.success('Password updated — welcome back!');
      setTimeout(() => nav('/world', { replace: true }), 900);
    } catch (err) { setError(toGameError(err).message); } finally { setBusy(false); }
  };
  return (
    <div className="flex min-h-full items-center justify-center bg-bg p-4">
      <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="glass grid w-full max-w-md gap-5 rounded-[28px] p-6" data-testid="reset-password">
        <Wordmark />
        <div className="flex items-center gap-3">
          <motion.span initial={{ rotate: -30, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/20 text-accent-2"><KeyRound className="h-6 w-6" /></motion.span>
          <div><h1 className="font-display text-xl font-bold">Choose a new password</h1><p className="text-sm text-muted">Then you’re straight back in.</p></div>
        </div>
        {!session ? (
          <p className="text-sm text-muted">{waiting ? 'Checking your reset link…' : <>This reset link has expired or was already used. <Link to="/welcome?mode=signin" className="font-semibold text-accent-2 underline">Request a new one</Link>.</>}</p>
        ) : (
          <form className="grid gap-4" onSubmit={save}>
            <Field label="New password" htmlFor="new-pw" hint="At least 8 characters.">
              <div className="relative">
                <input id="new-pw" className={inputCls + ' pr-10'} type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
            </Field>
            <Field label="Repeat it" htmlFor="new-pw2" error={error}>
              <input id="new-pw2" className={inputCls} type={show ? 'text' : 'password'} autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </Field>
            <Button variant="rainbow" size="lg" loading={busy} type="submit" data-testid="save-password">Save my new password</Button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
