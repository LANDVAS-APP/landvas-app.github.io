// Referral tiers, on the Invite page. Every friend pays the base invite reward; friends who really play (who've
// earned Ink on a few different days) climb the inviter's tiers. At each tier before the last the player picks one
// of four bonuses; the final tier is the Grand Package (everything) plus one area they boost. The picks stack:
// every real friend pays all unlocked tiers' picks added together. Picks can be planned ahead and changed once a
// month each.
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Check, Crown, Gift, Lock } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { ReferralBundle, ReferralPerks, Referrals } from '../backend/types';
import { invalidateGame } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { useConfirm } from '../ui';
import { confetti } from '../ui/confetti';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const RARITY_NAME = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
const GRAND = '#FFC94D';
type Line = { text: string; off?: boolean };

/** a tier's name ("Tier II", "Grand Package") */
export const tierName = (k: Pick<ReferralPerks, 'tiers'>, t: number) => k.tiers[t - 1]?.name || `Tier ${ROMAN[t - 1] ?? t}`;

/** what a bundle pays per friend, line by line (a paused share is struck through) */
export function bundleLines(b: ReferralBundle | null | undefined, shareOn = true, plus = false): Line[] {
  if (!b) return [];
  const out: Line[] = [];
  const p = plus ? '+' : '';
  if (b.ink) out.push({ text: `+${fmt(b.ink)} Ink` });
  if (b.share_pct) out.push({ text: `${p}${b.share_pct}% of their Ink${b.share_days ? ` · ${b.share_days} days` : ''}${b.share_cap ? ` · up to ${fmt(b.share_cap)}` : ''}`, off: !shareOn });
  else if (plus && b.share_cap) out.push({ text: `+${fmt(b.share_cap)} share cap`, off: !shareOn });
  if (b.luck_refill) out.push({ text: 'Luck refilled' });
  if (b.enchanted_luck) out.push({ text: `+${b.enchanted_luck} Enchanted Luck` });
  for (const t of b.tickets ?? []) if (t.n > 0) out.push({ text: `${t.n > 1 ? `${t.n} ` : /^[aeiou]/i.test(t.min) ? 'An ' : 'A '}${RARITY_NAME(t.min)}+ plot roll${t.n > 1 ? 's' : ''}` });
  return out;
}

/** the most Ink a real friend can be worth on top of the invite reward, with this stack */
export const stackInk = (k: ReferralPerks | null | undefined, shareOn = true) =>
  k?.stack ? k.stack.ink + (shareOn && k.stack.share_pct > 0 ? k.stack.share_cap ?? 0 : 0) : 0;

export function ReferralPackages({ r }: { r: Referrals }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const k = r.perks;
  if (!k || !k.enabled || k.tiers.length < 2 || !k.options.length) return null;
  const last = k.tiers.length;
  const pickOf = (t: number) => k.picks.find((p) => p.tier === t) ?? null;
  const choose = async (t: number, id: string, label: string, e: React.MouseEvent) => {
    const at = { x: e.clientX, y: e.clientY };
    const cur = pickOf(t);
    if (cur?.pick === id) return;
    if (cur && new Date(cur.can_change_at).getTime() > Date.now()) {
      toast(`${tierName(k, t)}’s pick can change on ${new Date(cur.can_change_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`);
      return;
    }
    const grand = t === last;
    const ok = await confirm({
      title: grand ? `Boost your Grand Package with ${label}?` : `${cur ? 'Switch' : 'Pick'} ${label} for ${tierName(k, t)}?`,
      body: <>Every real friend {t <= k.tier ? '' : `(once you reach ${tierName(k, t)}) `}pays it, added to your other tiers’ picks. You can change this pick again in {k.switch_days} days.</>,
      confirm: cur ? 'Switch' : 'Pick it',
    });
    if (!ok) return;
    setBusy(`${t}:${id}`);
    try {
      const next = await api.referralPick(t, id);
      qc.setQueryData(['referrals'], next);
      invalidateGame(qc);
      confetti({ ...at, count: 70, power: 0.75 });
      toast.success(`${label} — ${tierName(k, t)} is set`);
    } catch (err) { toast.error(toGameError(err).message); } finally { setBusy(null); }
  };
  return (
    <section className="mt-4 rounded-3xl border border-line bg-surface-2/40 p-4 md:p-5" data-testid="referral-tiers">
      <div className="eyebrow flex items-center gap-1.5"><Gift className="h-3.5 w-3.5 text-gold" /> Referral tiers</div>
      <h2 className="font-display text-xl font-bold">Climb tiers — your bonuses stack</h2>
      <p className="mt-1 max-w-2xl text-[13px] text-muted">
        Friends who really play (they’ve earned Ink on {k.bonus_after_days} different days) climb your tiers. Pick a bonus at each tier: every real
        friend pays <b className="text-fg">all of them added together</b>, on top of the {fmt(r.reward_ink)} Ink invite reward.
      </p>
      <Progress k={k} />
      <Stack k={k} r={r} />
      <div className="mt-3 grid gap-3">
        {k.tiers.slice(0, last - 1).map((t, i) => {
          const n = i + 1;
          const open = k.tier >= n;
          const cur = pickOf(n);
          const locked = cur && new Date(cur.can_change_at).getTime() > Date.now();
          return (
            <motion.div key={n} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={cn('rounded-2xl border p-3', open ? 'border-gold/40 bg-gold/[0.05]' : 'border-line bg-bg/30')} data-testid={`tier-${n}`}>
              <TierHead name={tierName(k, n)} need={t.n} have={k.real} open={open} />
              <div className="mt-2.5 grid grid-cols-2 gap-2 lg:grid-cols-4" role="radiogroup" aria-label={`${tierName(k, n)} bonus`}>
                {k.options.map((o) => {
                  const chosen = cur ? cur.pick === o.id : false;
                  const isDefault = !cur && o.id === k.default_pick;
                  return (
                    <PickCard key={o.id} emoji={o.emoji} name={o.name} color={o.color} lines={bundleLines(o.tiers[n - 1], k.share_enabled)}
                      chosen={chosen} isDefault={isDefault} busy={busy === `${n}:${o.id}`} disabled={!!busy}
                      onClick={(e) => void choose(n, o.id, `${o.emoji} ${o.name}`, e)} testid={`tier-${n}-pick-${o.id}`} />
                  );
                })}
              </div>
              {cur && locked && <p className="mt-2 text-[11px] text-faint" data-testid={`tier-${n}-locked`}>Can change on {new Date(cur.can_change_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>}
            </motion.div>
          );
        })}
        <Grand k={k} last={last} busy={busy} pick={pickOf(last)} onPick={(id, label, e) => void choose(last, id, label, e)} />
      </div>
      <p className="mt-2.5 text-[11px] text-faint">Bonuses are paid once per friend, when they’ve earned Ink by playing on {k.bonus_after_days} different days — accounts that only sign up never climb or pay. Shares come from Ink friends earn by playing, never out of their pocket{k.max_share_pct ? `, and add up to ${k.max_share_pct}% at most` : ''}.</p>
    </section>
  );
}

function TierHead({ name, need, have, open, grand }: { name: string; need: number; have: number; open: boolean; grand?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {grand && <Crown className="h-4 w-4 shrink-0 text-gold" />}
        <b className="truncate text-[15px]">{name}</b>
        <span className="shrink-0 text-[11.5px] text-muted tnum">{fmt(need)} real friend{need === 1 ? '' : 's'}</span>
      </div>
      {open
        ? <span className="flex shrink-0 items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[10.5px] font-black uppercase text-[#0b0e24]"><Check className="h-3 w-3" /> Unlocked</span>
        : <span className="flex shrink-0 items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10.5px] font-bold text-muted tnum"><Lock className="h-3 w-3" /> {fmt(need - have)} more</span>}
    </div>
  );
}

function PickCard({ emoji, name, color, lines, chosen, isDefault, busy, disabled, onClick, testid }: {
  emoji: string; name: string; color: string; lines: Line[]; chosen: boolean; isDefault?: boolean; busy: boolean; disabled: boolean;
  onClick: (e: React.MouseEvent) => void; testid: string;
}) {
  return (
    <button type="button" role="radio" aria-checked={chosen} disabled={disabled} onClick={onClick} data-testid={testid}
      className={cn('relative grid content-start gap-1.5 rounded-xl border p-2.5 text-left transition-[transform,opacity] active:scale-[0.98] disabled:opacity-70',
        chosen ? 'border-transparent' : isDefault ? 'border-dashed border-line-strong bg-bg/40' : 'border-line bg-bg/40 hover:border-line-strong',
        busy && 'opacity-60')}
      style={chosen ? { background: `linear-gradient(160deg, ${color}33, ${color}10 65%)`, boxShadow: `inset 0 0 0 1.5px ${color}` } : undefined}>
      <span className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[19px]" style={{ background: `${color}26` }} aria-hidden>{emoji}</span>
        <b className="min-w-0 flex-1 text-[13px] leading-tight">{name}</b>
      </span>
      <ul className="grid gap-0.5 text-[11.5px] leading-snug">
        {lines.map((l) => (
          <li key={l.text} className={cn('flex items-start gap-1.5', l.off && 'text-faint line-through')}>
            <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />{l.text}
          </li>
        ))}
      </ul>
      {chosen && <span className="absolute right-2 top-2 grid h-4.5 w-4.5 place-items-center rounded-full" style={{ background: color, color: '#0b0e24' }}><Check className="h-3 w-3" /></span>}
      {isDefault && <span className="text-[10px] font-bold uppercase tracking-wide text-faint">Default — pick yours</span>}
    </button>
  );
}

function Grand({ k, last, busy, pick, onPick }: {
  k: ReferralPerks; last: number; busy: string | null; pick: ReferralPerks['picks'][number] | null; onPick: (id: string, label: string, e: React.MouseEvent) => void;
}) {
  const t = k.tiers[last - 1];
  const open = k.tier >= last;
  const lines = bundleLines(k.grand, k.share_enabled);
  const locked = pick && new Date(pick.can_change_at).getTime() > Date.now();
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (last - 1) * 0.05 }}
      className="relative overflow-hidden rounded-2xl p-[1.5px]" style={{ background: `linear-gradient(135deg, ${GRAND}, #FF4FD8 45%, #9A7BFF 75%, #3DDC97)` }} data-testid="tier-grand">
      <div className="rounded-[14.5px] bg-bg-2 p-3">
        <TierHead name={tierName(k, last)} need={t.n} have={k.real} open={open} grand />
        <p className="mt-1 text-[12px] text-muted">Everything at once, on top of your other tiers:</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid="grand-lines">
          {lines.map((l) => <span key={l.text} className={cn('rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[11.5px] font-semibold', l.off && 'text-faint line-through')}>{l.text}</span>)}
        </div>
        {!!k.boosts.length && (
          <>
            <p className="mt-3 text-[12px] font-bold">…and boost the area you want most:</p>
            <div className="mt-1.5 grid grid-cols-2 gap-2 lg:grid-cols-4" role="radiogroup" aria-label="Grand Package boost">
              {k.boosts.map((b) => (
                <PickCard key={b.id} emoji={b.emoji} name={b.name} color={GRAND} lines={bundleLines(b.add, k.share_enabled, true)}
                  chosen={pick?.pick === b.id} busy={busy === `${last}:${b.id}`} disabled={!!busy}
                  onClick={(e) => onPick(b.id, `${b.emoji} ${b.name}`, e)} testid={`grand-boost-${b.id}`} />
              ))}
            </div>
            {!pick && <p className="mt-2 text-[11px] text-faint">No boost picked yet — the Grand Package pays without one until you pick.</p>}
            {pick && locked && <p className="mt-2 text-[11px] text-faint">Can change on {new Date(pick.can_change_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>}
          </>
        )}
      </div>
    </motion.div>
  );
}

/** real friends so far, one segment per tier */
function Progress({ k }: { k: ReferralPerks }) {
  const next = k.tiers.find((t) => k.real < t.n);
  return (
    <div className="mt-3" data-testid="tier-progress">
      <div className="flex flex-wrap items-end justify-between gap-2 text-[12.5px]">
        <span><b className="font-display text-lg tnum" data-testid="tier-real">{fmt(k.real)}</b> real friend{k.real === 1 ? '' : 's'}</span>
        <span className="text-muted">{next ? <><b className="text-fg tnum">{fmt(next.n - k.real)}</b> more to <b className="text-gold">{next.name}</b></> : 'Every tier unlocked — legendary.'}</span>
      </div>
      <div className="mt-1.5 grid gap-1" style={{ gridTemplateColumns: `repeat(${k.tiers.length}, minmax(0, 1fr))` }}>
        {k.tiers.map((t, i) => {
          const from = i ? k.tiers[i - 1].n : 0;
          const pct = Math.max(0, Math.min(1, (k.real - from) / (t.n - from))) * 100;
          return (
            <div key={i} className="grid gap-1">
              <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-accent via-gold to-accent-2" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, delay: i * 0.12, ease: 'easeOut' }} />
              </div>
              <span className={cn('truncate text-[10.5px] font-bold', k.tier > i ? 'text-gold' : 'text-faint')}>{t.name} · {fmt(t.n)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** what every real friend pays now */
function Stack({ k, r }: { k: ReferralPerks; r: Referrals }) {
  const s = k.stack;
  const lines = bundleLines(s, k.share_enabled);
  return (
    <div className="mt-3 rounded-2xl border border-line bg-bg/40 p-3" data-testid="tier-stack">
      {s ? (
        <>
          <div className="text-[12.5px] font-bold">Every real friend pays you now <span className="font-normal text-muted">({tierName(k, s.tier)}, all picks added)</span></div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-ok/40 bg-ok/10 px-2 py-0.5 text-[11.5px] font-bold text-ok">+{fmt(r.reward_ink)} Ink invite</span>
            {lines.map((l) => <span key={l.text} className={cn('rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[11.5px] font-semibold', l.off && 'text-faint line-through')}>{l.text}</span>)}
          </div>
          {!k.share_enabled && s.share_pct > 0 && <p className="mt-1.5 text-[11px] text-faint">Shares of friends’ Ink are paused right now.</p>}
        </>
      ) : (
        <div className="text-[12.5px] text-muted">
          Reach <b className="text-fg">{tierName(k, 1)}</b> with {fmt(k.tiers[0].n)} real friend{k.tiers[0].n === 1 ? '' : 's'}, and every real friend pays your picks on top of the {fmt(r.reward_ink)} Ink invite reward —
          the friend who gets you there included. You can pick now.
        </div>
      )}
    </div>
  );
}
