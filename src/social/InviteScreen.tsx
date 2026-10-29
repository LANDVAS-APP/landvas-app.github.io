// Invite friends: every player has a code (their username) and can create one custom code,
// once. The inviter earns Ink when the new player hits the configured milestone (by default:
// winning their first minigame) and — when the operator stacks it on — a share of everything
// that player earns, up to a cap per friend. Built to make the next invite feel close.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Check, Copy, Crown, Flame, Gift, Lock, MessageCircle, Rocket, Share2, Sparkles, Star, Ticket, Trophy, Users, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Referrals } from '../backend/types';
import { Page } from '../app/Shell';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { cn, fmt, safeStorage, saveStorage, timeAgo } from '../lib/utils';
import { Button, Empty, Field, PlayerAvatar, ResourceIcon, Spinner, inputCls, useConfirm } from '../ui';
import { confetti, confettiCannons } from '../ui/confetti';
import { clearPendingReferral } from './referralStore';

const QUALIFY: Record<Referrals['qualify'], string> = {
  signup: 'as soon as they finish signing up',
  starter_plot: 'when they claim their first plot',
  first_win: 'when they win their first minigame',
};

/** Milestones to chase (badges on this page — the Ink comes from the invites themselves). */
const RANKS = [
  { at: 1, name: 'Spark', icon: Sparkles, color: '#34C3FF' },
  { at: 3, name: 'Crew', icon: Users, color: '#3DDC97' },
  { at: 5, name: 'Movement', icon: Flame, color: '#FF9F1C' },
  { at: 10, name: 'Muralist circle', icon: Star, color: '#FFE14D' },
  { at: 25, name: 'Gallery', icon: Trophy, color: '#FF4FD8' },
  { at: 50, name: 'Art district', icon: Rocket, color: '#7B5CFF' },
  { at: 100, name: 'Legend', icon: Crown, color: '#FF4D6D' },
];

export function inviteLink(code: string) {
  const base = location.origin + (import.meta.env.BASE_URL || '/');
  return `${base.replace(/\/$/, '')}/?ref=${encodeURIComponent(code)}`;
}

function useCountUp(target: number, ms = 1300) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now(), a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      setV(Math.round(a + (target - a) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export default function InviteScreen() {
  const me = useOnboardedMe();
  const q = useQuery({ queryKey: ['referrals'], queryFn: api.myReferrals, enabled: !!me, refetchInterval: 30_000 });
  const r = q.data;
  const total = r ? r.stats.earned_ink + (r.stats.share_ink ?? 0) : 0;
  // celebrate new invite Ink since the last visit
  useEffect(() => {
    if (!r) return;
    const seen = safeStorage<number>('landvas.invite.seen', -1);
    if (seen >= 0 && total > seen) {
      setTimeout(() => confettiCannons(), 300);
      toast.success(`+${fmt(total - seen)} Ink from your friends since you last looked!`);
    }
    saveStorage('landvas.invite.seen', total);
  }, [r, total]);
  if (!me || q.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  if (!r) return <Page><Empty title="Invites are unavailable">{q.error ? toGameError(q.error).message : 'Try again in a moment.'}</Empty></Page>;
  const code = r.custom_code ?? r.default_code;
  const share = r.share?.enabled ? r.share : null;
  const perFriend = r.reward_ink + (share ? share.cap_ink : 0);
  return (
    <Page>
      <Hero r={r} total={total} perFriend={perFriend} share={share} />
      {!r.enabled && <p className="mb-4 rounded-2xl border border-warn/40 bg-warn/10 p-3 text-sm">Invite rewards are paused right now. Your codes still work and will count when they’re back on.</p>}
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <ShareCard code={code} r={r} perFriend={perFriend} />
        <HowYouEarn r={r} share={share} />
      </div>
      <Ladder count={r.stats.total} />
      <section className="mt-6">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Your crew</h2>
          {share && (r.stats.share_today ?? 0) > 0 && <span className="text-xs font-bold text-ok tnum">+{fmt(r.stats.share_today ?? 0)} Ink from friends today</span>}
        </div>
        {!r.recent.length ? (
          <Empty icon={<Ticket className="h-6 w-6" />} title="Your crew starts with one friend">Send your link to one person who loves drawing, games or maps — each friend can be worth up to {fmt(perFriend)} Ink.</Empty>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2" data-testid="referral-list">
            {r.recent.map((x, i) => <FriendCard key={x.player.id} x={x} r={r} share={share} i={i} />)}
          </div>
        )}
      </section>
      <CustomCode r={r} />
      <Redeem r={r} />
    </Page>
  );
}

function Hero({ r, total, perFriend, share }: { r: Referrals; total: number; perFriend: number; share: Referrals['share'] | null }) {
  const shown = useCountUp(total);
  return (
    <section className="relative mb-5 overflow-hidden rounded-[28px] border border-gold/30 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(255,225,77,0.22),transparent_55%),radial-gradient(120%_120%_at_100%_100%,rgba(123,92,255,0.28),transparent_55%)] p-5 md:p-7" data-testid="invite-hero">
      <motion.div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-gold/20 blur-3xl" animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 4, repeat: Infinity }} />
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="eyebrow flex items-center gap-1.5"><Gift className="h-3.5 w-3.5 text-gold" /> Invite friends</div>
          <h1 className="mt-2 font-display text-[clamp(1.8rem,5vw,2.8rem)] font-bold leading-tight">
            Every friend is worth up to <span className="rainbow-text tnum">{fmt(perFriend)} Ink</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            <b className="text-fg">{fmt(r.reward_ink)} Ink</b> {QUALIFY[r.qualify]}
            {share ? <> — <b className="text-fg">plus {share.pct}% of every Ink they earn</b>, up to {fmt(share.cap_ink)} per friend.</> : '.'}
            {r.referee_reward_ink > 0 ? <> They get <b className="text-fg">{fmt(r.referee_reward_ink)} Ink</b> too.</> : null}
          </p>
        </div>
        <div className="rounded-3xl border border-gold/40 bg-bg/50 px-5 py-4 text-right backdrop-blur">
          <div className="eyebrow !text-[10px]">Earned from invites</div>
          <div className="flex items-center justify-end gap-2 font-display text-4xl font-bold text-gold tnum" data-testid="invite-total"><ResourceIcon r="ink" />{fmt(shown)}</div>
          <div className="text-xs text-muted tnum">{fmt(r.stats.total)} invited · {fmt(r.stats.rewarded)} rewarded</div>
        </div>
      </div>
    </section>
  );
}

function ShareCard({ code, r, perFriend }: { code: string; r: Referrals; perFriend: number }) {
  const link = inviteLink(code);
  const [copied, setCopied] = useState<string | null>(null);
  const text = `I'm painting the real world on LANDVAS — claim a free plot next to mine! Use my code ${code}:`;
  const copy = async (what: string, label: string, e?: React.MouseEvent) => {
    try {
      await navigator.clipboard.writeText(what);
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
      if (e) confetti({ x: e.clientX, y: e.clientY, count: 40, power: 0.6 });
    } catch { toast.error('Couldn’t copy — select the text and copy it instead.'); }
  };
  const enc = encodeURIComponent;
  const channels = [
    { label: 'Text', href: `sms:?&body=${enc(`${text} ${link}`)}` },
    { label: 'WhatsApp', href: `https://wa.me/?text=${enc(`${text} ${link}`)}` },
    { label: 'X', href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(link)}` },
    { label: 'Reddit', href: `https://www.reddit.com/submit?url=${enc(link)}&title=${enc('Paint the real world with me on LANDVAS')}` },
  ];
  return (
    <section className="rainbow-edge relative overflow-hidden rounded-3xl bg-surface-2 p-5" data-testid="invite-share">
      <div className="eyebrow">Your invite code</div>
      <div className="mt-1 flex items-center gap-3">
        <motion.span key={code} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="select-all font-display text-3xl font-bold tracking-wide" data-testid="invite-code">{code}</motion.span>
        <button onClick={(e) => copy(code, 'code', e)} className="rounded-xl p-2 text-muted hover:bg-surface hover:text-fg" aria-label="Copy code">{copied === 'code' ? <Check className="h-5 w-5 text-ok" /> : <Copy className="h-5 w-5" />}</button>
      </div>
      {r.custom_code && <div className="text-xs text-muted">Your username code <b className="text-fg">{r.default_code}</b> works too.</div>}
      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-line bg-bg/40 p-2 pl-3">
        <span className="min-w-0 flex-1 select-all truncate font-mono text-[13px] text-muted" data-testid="invite-link">{link}</span>
        <Button size="sm" variant="secondary" onClick={(e) => copy(link, 'link', e)}>{copied === 'link' ? <><Check className="h-4 w-4 text-ok" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}</Button>
      </div>
      <motion.div className="mt-3" whileTap={{ scale: 0.97 }}>
        <Button variant="rainbow" size="lg" className="w-full" onClick={async (e) => {
          const at = { x: e.clientX, y: e.clientY };
          try {
            if (navigator.share) await navigator.share({ title: 'Join me on LANDVAS', text, url: link });
            else await copy(`${text} ${link}`, 'link');
            confetti({ ...at, count: 70, power: 0.8 });
          } catch { /* share cancelled */ }
        }}><Share2 className="h-5 w-5" /> Share — up to {fmt(perFriend)} Ink each</Button>
      </motion.div>
      <div className="mt-3 flex flex-wrap gap-2">
        {channels.map((c) => (
          <a key={c.label} href={c.href} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg/40 px-3 py-1.5 text-xs font-bold hover:border-line-strong">
            <MessageCircle className="h-3.5 w-3.5" /> {c.label}
          </a>
        ))}
      </div>
    </section>
  );
}

function HowYouEarn({ r, share }: { r: Referrals; share: Referrals['share'] | null }) {
  const steps = [
    { icon: Share2, title: 'Send your link', text: 'Anyone who joins with it is in your crew.' },
    { icon: Gift, title: `+${fmt(r.reward_ink)} Ink`, text: `Paid ${QUALIFY[r.qualify]}.` },
    ...(share ? [{ icon: Zap, title: `+${share.pct}% of their Ink`, text: `Every time they earn — up to ${fmt(share.cap_ink)} Ink per friend. It never comes out of their pocket.` }] : []),
  ];
  return (
    <section className="glass grid content-start gap-3 rounded-3xl p-5">
      <h2 className="font-display text-base font-semibold">How you earn</h2>
      {steps.map((s, i) => (
        <motion.div key={s.title} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.12 }} className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gold/15 text-gold"><s.icon className="h-4.5 w-4.5" /></span>
          <div><div className="font-bold">{s.title}</div><div className="text-xs text-muted">{s.text}</div></div>
        </motion.div>
      ))}
      <p className="text-[11px] text-faint">Up to {fmt(r.daily_cap)} rewarded invites a day. Invites from fake or duplicate accounts don’t count.</p>
    </section>
  );
}

function Ladder({ count }: { count: number }) {
  const next = RANKS.find((x) => count < x.at);
  const prev = [...RANKS].reverse().find((x) => count >= x.at);
  const base = prev?.at ?? 0;
  const pct = next ? ((count - base) / (next.at - base)) * 100 : 100;
  return (
    <section className="glass mt-4 rounded-3xl p-5" data-testid="invite-ladder">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="eyebrow">Your crew rank</div>
          <div className="font-display text-xl font-bold">{prev ? prev.name : 'Just getting started'}</div>
        </div>
        <div className="text-sm text-muted">{next ? <><b className="text-fg tnum">{next.at - count}</b> more friend{next.at - count === 1 ? '' : 's'} to <b style={{ color: next.color }}>{next.name}</b></> : 'Top rank — legendary.'}</div>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-surface-2">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-accent via-gold to-accent-2" initial={{ width: 0 }} animate={{ width: `${Math.max(4, pct)}%` }} transition={{ duration: 1.1, ease: 'easeOut' }} />
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
        {RANKS.map((x, i) => {
          const got = count >= x.at;
          return (
            <motion.div key={x.at} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              className={cn('flex flex-col items-center gap-1 rounded-2xl border p-2 text-center', got ? 'border-transparent bg-surface-2' : 'border-dashed border-line opacity-60')}>
              <motion.span animate={got ? { rotate: [0, -8, 8, 0] } : undefined} transition={{ duration: 0.8, delay: i * 0.08 }}
                className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: got ? `${x.color}33` : undefined, color: got ? x.color : undefined }}>
                {got ? <x.icon className="h-5 w-5" /> : <Lock className="h-4 w-4 text-faint" />}
              </motion.span>
              <span className="text-[10px] font-bold leading-tight">{x.name}</span>
              <span className="text-[10px] text-faint tnum">{x.at}</span>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

function FriendCard({ x, r, share, i }: { x: Referrals['recent'][number]; r: Referrals; share: Referrals['share'] | null; i: number }) {
  const got = x.share_ink ?? 0;
  const cap = share?.cap_ink ?? 0;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.04 }} className="glass grid gap-2 rounded-2xl p-3">
      <div className="flex items-center gap-3">
        <PlayerAvatar p={x.player} size={36} />
        <div className="min-w-0 flex-1">
          <Link to={`/u/${x.player.username}`} className="block truncate font-semibold hover:underline">@{x.player.username}</Link>
          <div className="text-xs text-muted">joined {timeAgo(x.created_at)}</div>
        </div>
        <StatusChip status={x.status} ink={x.reward_ink} qualify={r.qualify} />
      </div>
      {share && x.status !== 'void' && (
        <div className="grid gap-1">
          <div className="flex justify-between text-[11px] font-semibold text-muted">
            <span className="flex items-center gap-1">{got < cap && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />}{share.pct}% of their earnings</span>
            <span className="tnum"><b className="text-fg">{fmt(got)}</b> / {fmt(cap)} Ink</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-gradient-to-r from-ok to-gold" style={{ width: `${cap ? Math.min(100, (got / cap) * 100) : 0}%` }} /></div>
        </div>
      )}
    </motion.div>
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
          confetti();
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
          confetti();
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
