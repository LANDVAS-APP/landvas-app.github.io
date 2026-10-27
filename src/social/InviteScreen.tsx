// Invite friends: every player has a code (their username) and can create one
// custom code, once. The inviter earns Ink when the new player hits the
// configured milestone (by default: winning their first minigame).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Gift, Lock, Share2, Sparkles, Ticket } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Referrals } from '../backend/types';
import { Page, PageHeader } from '../app/Shell';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { cn, fmt, timeAgo } from '../lib/utils';
import { Button, Empty, Field, PlayerAvatar, Spinner, inputCls, useConfirm } from '../ui';
import { clearPendingReferral } from './referralStore';

const QUALIFY: Record<Referrals['qualify'], string> = {
  signup: 'as soon as they finish signing up',
  starter_plot: 'when they claim their first plot',
  first_win: 'when they win their first minigame',
};

export function inviteLink(code: string) {
  const base = location.origin + (import.meta.env.BASE_URL || '/');
  return `${base.replace(/\/$/, '')}/?ref=${encodeURIComponent(code)}`;
}

export default function InviteScreen() {
  const me = useOnboardedMe();
  const q = useQuery({ queryKey: ['referrals'], queryFn: api.myReferrals, enabled: !!me });
  if (!me || q.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  if (!q.data) return <Page><Empty title="Invites are unavailable">{q.error ? toGameError(q.error).message : 'Try again in a moment.'}</Empty></Page>;
  const r = q.data;
  const code = r.custom_code ?? r.default_code;
  return (
    <Page>
      <PageHeader eyebrow="Invite friends" title={<span className="flex items-center gap-2"><Gift className="h-7 w-7 text-gold" /> Earn {fmt(r.reward_ink)} Ink per friend</span>}>
        Share your link or code. When a friend joins with it, you get <b className="text-fg">{fmt(r.reward_ink)} Ink</b> {QUALIFY[r.qualify]}.
        {r.referee_reward_ink > 0 ? <> They get <b className="text-fg">{fmt(r.referee_reward_ink)} Ink</b> too.</> : null}
      </PageHeader>
      {!r.enabled && <p className="mb-4 rounded-2xl border border-warn/40 bg-warn/10 p-3 text-sm">Invite rewards are paused right now. Your codes still work and will count when they’re back on.</p>}
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <ShareCard code={code} r={r} />
        <section className="glass grid content-start gap-3 rounded-3xl p-5">
          <div className="grid grid-cols-2 gap-2 text-center">
            <Stat label="Invited" value={fmt(r.stats.total)} />
            <Stat label="Waiting" value={fmt(r.stats.pending)} />
            <Stat label="Rewarded" value={fmt(r.stats.rewarded)} />
            <Stat label="Ink earned" value={fmt(r.stats.earned_ink)} accent />
          </div>
          <p className="text-xs text-muted">Up to {fmt(r.daily_cap)} rewarded invites a day. Invites from fake or duplicate accounts don’t count.</p>
        </section>
      </div>
      <CustomCode r={r} />
      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg font-semibold">Your invites</h2>
        {!r.recent.length ? <Empty icon={<Ticket className="h-6 w-6" />} title="No one yet">Friends who join with your link show up here.</Empty> : (
          <div className="glass divide-y divide-line overflow-hidden rounded-3xl" data-testid="referral-list">
            {r.recent.map((x) => (
              <div key={x.player.id} className="flex items-center gap-3 px-4 py-3">
                <PlayerAvatar p={x.player} size={36} />
                <div className="min-w-0 flex-1">
                  <Link to={`/u/${x.player.username}`} className="block truncate font-semibold hover:underline">@{x.player.username}</Link>
                  <div className="text-xs text-muted">joined {timeAgo(x.created_at)}</div>
                </div>
                <StatusChip status={x.status} ink={x.reward_ink} qualify={r.qualify} />
              </div>
            ))}
          </div>
        )}
      </section>
      <Redeem r={r} />
    </Page>
  );
}

function ShareCard({ code, r }: { code: string; r: Referrals }) {
  const link = inviteLink(code);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (what: string, label: string) => {
    try { await navigator.clipboard.writeText(what); setCopied(label); setTimeout(() => setCopied(null), 1600); } catch { toast.error('Couldn’t copy — select the text and copy it instead.'); }
  };
  return (
    <section className="rainbow-edge relative overflow-hidden rounded-3xl bg-surface-2 p-5" data-testid="invite-share">
      <div className="eyebrow">Your invite code</div>
      <div className="mt-1 flex items-center gap-3">
        <span className="select-all font-display text-3xl font-bold tracking-wide" data-testid="invite-code">{code}</span>
        <button onClick={() => copy(code, 'code')} className="rounded-xl p-2 text-muted hover:bg-surface hover:text-fg" aria-label="Copy code">{copied === 'code' ? <Check className="h-5 w-5 text-ok" /> : <Copy className="h-5 w-5" />}</button>
      </div>
      {r.custom_code && <div className="text-xs text-muted">Your username code <b className="text-fg">{r.default_code}</b> works too.</div>}
      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-line bg-bg/40 p-2 pl-3">
        <span className="min-w-0 flex-1 select-all truncate font-mono text-[13px] text-muted" data-testid="invite-link">{link}</span>
        <Button size="sm" variant="secondary" onClick={() => copy(link, 'link')}>{copied === 'link' ? <><Check className="h-4 w-4 text-ok" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}</Button>
      </div>
      <Button variant="primary" className="mt-3 w-full sm:w-auto" onClick={async () => {
        const text = `Claim a piece of the real world and paint it on LANDVAS. Use my code ${code} when you join!`;
        try {
          if (navigator.share) await navigator.share({ title: 'Join me on LANDVAS', text, url: link });
          else await copy(`${text} ${link}`, 'link');
        } catch { /* share cancelled */ }
      }}><Share2 className="h-4 w-4" /> Share invite</Button>
    </section>
  );
}

function CustomCode({ r }: { r: Referrals }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const clean = code.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 16);
  if (r.custom_code) {
    return (
      <section className="glass mt-4 flex flex-wrap items-center gap-3 rounded-3xl p-4 text-sm">
        <Lock className="h-4 w-4 text-gold" /> Your custom code is <b className="font-mono text-base" data-testid="custom-code">{r.custom_code}</b> <span className="text-muted">— it’s yours for good.</span>
      </section>
    );
  }
  return (
    <section className="glass mt-4 rounded-3xl p-5" data-testid="custom-code-form">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold"><Sparkles className="h-4 w-4 text-accent-2" /> Make your custom code</h2>
      <p className="mt-1 text-sm text-muted">Pick something memorable, like <span className="font-mono">PAINTWITHME</span>. Each account can make <b className="text-fg">one</b> custom code, and it can’t be changed later.</p>
      <form className="mt-3 flex flex-wrap items-start gap-2" onSubmit={async (e) => {
        e.preventDefault();
        if (clean.length < 4) return setErr('Use 4–16 letters, numbers or underscores.');
        if (!(await confirm({ title: `Make ${clean} your custom code?`, body: 'You can only make one custom code, and it can never be changed.', confirm: 'Create code' }))) return;
        setBusy(true);
        setErr(null);
        try {
          const next = await api.createReferralCode(clean);
          qc.setQueryData(['referrals'], next);
          toast.success(`${clean} is your code now`);
        } catch (e2) { setErr(toGameError(e2).message); } finally { setBusy(false); }
      }}>
        <div className="min-w-0 flex-1">
          <Field label="Custom code" htmlFor="custom-code" error={err}>
            <input id="custom-code" className={cn(inputCls, 'font-mono uppercase tracking-wider')} placeholder="YOURCODE" value={clean} onChange={(e) => { setCode(e.target.value); setErr(null); }} maxLength={16} autoComplete="off" spellCheck={false} data-testid="custom-code-input" />
          </Field>
        </div>
        <Button type="submit" variant="rainbow" className="mt-[26px]" loading={busy} disabled={clean.length < 4} data-testid="custom-code-create">Create</Button>
      </form>
    </section>
  );
}

function Redeem({ r }: { r: Referrals }) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  if (r.referred_by) {
    return (
      <section className="glass mt-6 flex items-center gap-3 rounded-3xl p-4 text-sm">
        <PlayerAvatar p={r.referred_by.player} size={32} />
        <span>You joined with <b>@{r.referred_by.player.username}</b>’s invite{r.referred_by.status === 'pending' ? ` — they’ll get their reward ${QUALIFY[r.qualify]}.` : '.'}</span>
      </section>
    );
  }
  if (!r.can_redeem) return null;
  return (
    <section className="glass mt-6 rounded-3xl p-5" data-testid="redeem-form">
      <h2 className="font-display text-base font-semibold">Got an invite code?</h2>
      <p className="mt-1 text-sm text-muted">Enter the code of the friend who invited you so they get their reward. You can do this in your first days of playing.</p>
      <form className="mt-3 flex gap-2" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const next = await api.redeemReferral(code);
          qc.setQueryData(['referrals'], next);
          clearPendingReferral();
          invalidateGame(qc);
          toast.success('Invite code applied — thanks for joining!');
        } catch (e2) { toast.error(toGameError(e2).message); } finally { setBusy(false); }
      }}>
        <input className={cn(inputCls, 'min-w-0 flex-1 font-mono uppercase')} placeholder="FRIENDSCODE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 20))} aria-label="Invite code" data-testid="redeem-input" />
        <Button type="submit" variant="primary" loading={busy} disabled={code.length < 3} data-testid="redeem-submit">Apply</Button>
      </form>
    </section>
  );
}

function StatusChip({ status, ink, qualify }: { status: string; ink: number; qualify: Referrals['qualify'] }) {
  const map: Record<string, [string, string]> = {
    pending: [qualify === 'first_win' ? 'Waiting for their first win' : qualify === 'starter_plot' ? 'Waiting for their first plot' : 'Waiting', 'text-muted border-line'],
    rewarded: [`+${fmt(ink)} Ink`, 'text-ok border-ok/40 bg-ok/10'],
    capped: ['Daily limit reached', 'text-warn border-warn/40'],
    void: ['Didn’t count', 'text-faint border-line'],
  };
  const [label, cls] = map[status] ?? [status, 'text-muted border-line'];
  return <span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold', cls)}>{label}</span>;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/50 p-3">
      <div className={cn('font-display text-lg font-semibold tnum', accent && 'text-gold')}>{value}</div>
      <div className="eyebrow !text-[10px]">{label}</div>
    </div>
  );
}
