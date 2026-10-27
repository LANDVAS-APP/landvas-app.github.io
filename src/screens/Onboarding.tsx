import { useQueryClient } from '@tanstack/react-query';
import { Shuffle } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { useSession } from '../app/App';
import { qk, useMe } from '../lib/queries';
import { cn, saveStorage } from '../lib/utils';
import { Avatar, Button, Field, Spinner, Wordmark, inputCls } from '../ui';

const STYLES = ['prism', 'orbit', 'mosaic', 'bloom'] as const;
const ACCENTS = ['#7B5CFF', '#FF4D6D', '#FF9F1C', '#22C7B5', '#34C3FF', '#FF4FD8', '#3DDC97', '#0B1230'];

export function Onboarding() {
  const session = useSession();
  const me = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [seed, setSeed] = useState(() => Math.random().toString(36).slice(2, 10));
  const [style, setStyle] = useState<(typeof STYLES)[number]>('prism');
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!session) return <Navigate to="/welcome" replace />;
  if (me.isLoading || !me.data) return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  if (me.data.onboarded) return <Navigate to="/" replace />;
  const terms = me.data.terms_current;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.completeOnboarding({ username, displayName, avatarSeed: seed, avatarStyle: style, accentColor: accent, termsVersion: terms });
      await qc.invalidateQueries({ queryKey: qk.me });
      saveStorage('landvas.guide', 'starter');
      saveStorage('landvas.welcomed', true);
      nav('/', { replace: true });
    } catch (err) {
      setError(toGameError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <form onSubmit={submit} className="gutter mx-auto grid max-w-2xl gap-8 py-10">
        <Wordmark />
        <div>
          <div className="eyebrow">Step 1 of 2 · Your artist identity</div>
          <h1 className="mt-2 font-display text-3xl font-bold">Sign your work</h1>
          <p className="mt-2 text-muted">This name appears beside every plot you own and every mural you publish.</p>
        </div>
        <div className="glass grid gap-6 rounded-[28px] p-6 md:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-3">
            <Avatar seed={seed} style={style} accent={accent} size={112} />
            <Button type="button" size="sm" variant="ghost" onClick={() => setSeed(Math.random().toString(36).slice(2, 10))}>
              <Shuffle className="h-4 w-4" /> Remix
            </Button>
          </div>
          <div className="grid gap-4">
            <Field label="Username" htmlFor="username" hint="3–20 letters, numbers or underscores. Public." error={error}>
              <input id="username" className={inputCls} required pattern="[A-Za-z0-9_]{3,20}" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ultramarine_ana" autoComplete="nickname" />
            </Field>
            <Field label="Display name (optional)" htmlFor="display">
              <input id="display" className={inputCls} maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ana Ribeiro" />
            </Field>
            <div className="grid gap-2">
              <span className="text-[13px] font-semibold text-muted">Avatar style</span>
              <div className="flex flex-wrap gap-2">
                {STYLES.map((s) => (
                  <button type="button" key={s} onClick={() => setStyle(s)} className={cn('rounded-2xl border p-1 transition', style === s ? 'border-accent' : 'border-line hover:border-line-strong')} aria-label={`${s} avatar style`} aria-pressed={style === s}>
                    <Avatar seed={seed} style={s} accent={accent} size={44} />
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {ACCENTS.map((c) => (
                  <button type="button" key={c} onClick={() => setAccent(c)} aria-label={`Accent ${c}`} aria-pressed={accent === c}
                    className={cn('h-7 w-7 rounded-full border-2 transition', accent === c ? 'scale-110 border-fg' : 'border-transparent')} style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div>
          <div className="eyebrow">Step 2 of 2 · The ground rules</div>
          <ul className="mt-3 grid gap-2 text-sm text-muted">
            <li>· Plots are virtual squares on a map. They are not real land, investments or securities, and resources have no cash value.</li>
            <li>· You keep the copyright to your art. Publishing grants LANDVAS a limited licence to display it in the game and its share features.</li>
            <li>· Only publish work you made or have permission to use. No sexual content, hate, harassment, threats or personal information.</li>
            <li>· New murals are reviewed before they appear on the public map. Repeated violations restrict your account.</li>
          </ul>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface/60 p-4 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
            <span>
              I agree to the <Link className="font-semibold text-accent-2 underline" to="/legal/terms">Terms of Service</Link>, the{' '}
              <Link className="font-semibold text-accent-2 underline" to="/legal/content">Content Policy</Link> and the{' '}
              <Link className="font-semibold text-accent-2 underline" to="/legal/privacy">Privacy Policy</Link> <span className="text-faint">(version {terms})</span>.
            </span>
          </label>
        </div>
        <Button variant="primary" size="lg" type="submit" loading={busy} disabled={!agree || username.length < 3}>
          Enter the world
        </Button>
      </form>
    </div>
  );
}
