// Admin → Rolls. The two roll features with live settings:
// ⚡ Godrolls — extremely rare claims where every roll (2–7 of them) is an ultra: Echo (the same ultra on every roll,
//    each with a different minigame) and Pantheon (a different ultra on every roll).
// ⬆️ Ascend — pay Ink to reroll a fresh plot's rarity: it only goes up, the price climbs fast, and every try nudges the
//    odds of a higher tier (pity).
// Server side: supabase/migrations/20261119000231_tickets_enchant_rolls_godrolls.sql and 20261119000232_ascend_roll_settings.sql.
// Gifts for one player (tickets, enchantments, a Godroll lined up, Ink earnings) are on the player's Gifts tab.
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { api } from '../../../src/backend/api';
import { toGameError } from '../../../src/backend/backend';
import { cn } from '../../../src/lib/utils';
import { rarityInfo } from '../../../src/shared/rarity';
import { PLOT_TYPES } from '../../../src/map/plotStyle';
import { ago, int } from '../../shared/format';
import { Badge, PageHeader, Panel, Q, Rarity, Stat } from '../../shared/ui';

type Num = { key: string; label: string; help: string; step?: number; min?: number; max?: number };
const GOD_NUMS: Num[] = [
  { key: 'echo_one_in', label: 'Echo: 1 claim in', help: 'How rare a random Echo Godroll is, per claim (400,000 = 1 in 400k).', min: 1 },
  { key: 'pantheon_one_in', label: 'Pantheon: 1 claim in', help: 'How rare a random Pantheon Godroll is, per claim.', min: 1 },
  { key: 'luck_boost', label: 'Luck boost', help: 'Extra chance when they spent Luck on the claim: 0.5 = 1.5× likelier.', step: 0.1, min: 0 },
  { key: 'hot_zone_mult', label: 'Hot Zone ×', help: 'Odds multiplier inside today’s Hot Zone.', step: 0.1, min: 0 },
  { key: 'rolls_min', label: 'Fewest rolls', help: '2–7 (2 = one reroll).', min: 2, max: 7 },
  { key: 'rolls_max', label: 'Most rolls', help: '2–7 (7 = six rerolls).', min: 2, max: 7 },
  { key: 'shiny_pct', label: 'Shiny % per roll', help: 'Chance each Godroll roll is shiny.', step: 1, min: 0, max: 100 },
];
const GOD_BOOLS: [string, string][] = [['enabled', 'Random Godrolls happen'], ['needs_luck', 'Only on claims that spent Luck'], ['weighted', 'Rarer ultras show up less (by their odds)'], ['announce', 'Post them on the live feed']];
const ASC_NUMS: Num[] = [
  { key: 'base_ink', label: 'First try (Ink)', help: 'The price of the first Ascend try, before the rarity multiplier.', min: 0 },
  { key: 'growth', label: 'Price growth per try', help: 'Each try costs this much more than the last (1.6 = +60%).', step: 0.05, min: 1 },
  { key: 'tier_mult', label: 'Price × per rarity tier', help: 'Higher starting rarities cost more to push (1.35 = +35% per tier).', step: 0.05, min: 1 },
  { key: 'pity', label: 'Pity per try', help: 'Each failed try makes going up likelier: 0.12 = +12% of the base odds per try.', step: 0.01, min: 0 },
  { key: 'window_hours', label: 'Window (hours)', help: 'How long after a claim the plot can still Ascend.', min: 0 },
  { key: 'max_tries', label: 'Most tries per plot', help: 'Tries before it locks for good.', min: 1 },
  { key: 'ultra_mult', label: 'Ultra odds ×', help: 'Only with ultras allowed: multiplies the chance of jumping to an ultra.', step: 0.1, min: 0 },
];
const ASC_BOOLS: [string, string][] = [['enabled', 'Ascend is on for everyone'], ['allow_ultras', 'Can jump into an ultra']];

/** what a price ladder looks like: tries 1–10 at the base tier */
function ladder(base: number, growth: number, tierMult: number, tier: number) {
  return Array.from({ length: 10 }, (_, i) => Math.ceil(Math.max(base, 1) * Math.pow(tierMult, tier) * Math.pow(growth, i)));
}

function Editor({ title, sub, cfg, nums, bools, onSave, saving, extra }: {
  title: string; sub: string; cfg: Record<string, any>; nums: Num[]; bools: [string, string][]; onSave(v: Record<string, unknown>): void; saving: boolean;
  extra?: (draft: Record<string, any>, set: (k: string, v: unknown) => void) => React.ReactNode;
}) {
  const [draft, setDraft] = useState<Record<string, any>>(cfg);
  useEffect(() => setDraft(cfg), [cfg]);
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));
  const changed = useMemo(() => Object.keys(draft).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(cfg[k])), [draft, cfg]);
  return (
    <Panel title={title} actions={<button disabled={!changed.length || saving} onClick={() => onSave(Object.fromEntries(changed.map((k) => [k, draft[k]])))}
      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40" data-testid={`save-${title.split(' ')[1]?.toLowerCase()}`}>{saving ? 'Saving…' : changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Saved'}</button>}>
      <p className="mb-3 text-xs text-muted">{sub}</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {bools.map(([k, l]) => (
          <button key={k} onClick={() => set(k, !draft[k])} aria-pressed={!!draft[k]} className={cn('rounded-full border px-3 py-1.5 text-xs font-bold', draft[k] ? 'border-ok/60 bg-ok/15 text-ok' : 'border-line text-muted')} data-testid={`bool-${k}`}>
            {draft[k] ? '✓' : '○'} {l}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {nums.map((n) => (
          <label key={n.key} className="grid gap-0.5 rounded-xl border border-line px-3 py-2">
            <span className="text-xs font-semibold">{n.label}</span>
            <input type="number" className="h-9 rounded-lg border border-line bg-surface/80 px-2 font-mono text-sm" step={n.step ?? 1} min={n.min} max={n.max}
              value={draft[n.key] ?? ''} onChange={(e) => set(n.key, e.target.value === '' ? undefined : Number(e.target.value))} data-testid={`num-${n.key}`} />
            <span className="text-[11px] text-faint">{n.help}</span>
          </label>
        ))}
      </div>
      {extra?.(draft, set)}
    </Panel>
  );
}

export default function RollsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'roll-settings'], queryFn: api.admin.rollSettings, refetchInterval: 60_000 });
  const save = useMutation({
    mutationFn: ({ key, value }: { key: 'godrolls' | 'ascend'; value: Record<string, unknown> }) => api.admin.setRollSettings(key, value),
    onSuccess: (d, v) => { qc.setQueryData(['admin', 'roll-settings'], d); toast.success(v.key === 'godrolls' ? 'Godroll settings saved' : 'Ascend settings saved', { description: 'Live now. Recorded in the audit log.' }); },
    onError: (e) => toast.error(toGameError(e).message),
  });
  return (
    <>
      <PageHeader title="Rolls" sub="Godrolls and Ascend — live settings and what's been happening. To give one player a ticket, an enchantment, a Godroll or change their Ink earnings, open the player → Gifts." />
      <Q q={q} label="Loading roll settings…">{(d: any) => {
        const g = d.godrolls ?? {}, a = d.ascend ?? {}, gs = d.godroll_stats ?? {}, as = d.ascend_stats ?? {};
        const claims = Number(d.claims_7d ?? 0);
        const expected = (one: number) => (one > 0 ? claims / one : 0);
        const tiers: string[] = (d.rarities ?? []).filter((r: any) => Number(r.weight) > 0).map((r: any) => r.id);
        return (
          <div className="grid gap-3" data-testid="rolls-page">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label="Godrolls ever" value={int(gs.total ?? 0)} sub={`${int(gs.last_30d ?? 0)} in 30 days`} tone="gold" />
              <Stat label="Echo · Pantheon" value={`${int(gs.echo ?? 0)} · ${int(gs.pantheon ?? 0)}`} sub={`random ${int(gs.by_luck ?? 0)} · ticket ${int(gs.by_ticket ?? 0)} · staff ${int(gs.by_staff ?? 0)}`} />
              <Stat label="Ascend tries (7 d)" value={int(as.tries_7d ?? 0)} sub={`${int(as.players_7d ?? 0)} players · ${int(as.ups_7d ?? 0)} went up`} tone="accent" />
              <Stat label="Ink spent on Ascend (7 d)" value={int(as.ink_7d ?? 0)} sub="taken out of the economy" tone="ok" />
            </div>
            <Editor title="⚡ Godrolls" cfg={g} nums={GOD_NUMS} bools={GOD_BOOLS} saving={save.isPending && save.variables?.key === 'godrolls'} onSave={(v) => save.mutate({ key: 'godrolls', value: v })}
              sub={`Every roll of the claim is an ultra. With ${int(claims)} claims in the last 7 days, these odds mean about ${expected(Number(g.echo_one_in)).toFixed(2)} Echo and ${expected(Number(g.pantheon_one_in)).toFixed(2)} Pantheon Godrolls a week (before Luck and Hot Zone boosts).`}
              extra={(dr, set) => (
                <div className="mt-3 grid gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold">Pool:</span>
                    {(['ultras', 'ultras_primordials'] as const).map((p) => <button key={p} onClick={() => set('pool', p)} className={cn('rounded-full px-3 py-1 font-bold', dr.pool === p ? 'bg-accent text-white' : 'bg-surface-2 text-muted')}>{p === 'ultras' ? 'Ultras' : 'Ultras + Primordials'}</button>)}
                  </div>
                  <div className="text-xs text-muted">Can land ({(d.pool ?? []).length}): <span className="inline-flex flex-wrap gap-1 align-middle">{(d.pool ?? []).map((p: any) => <Rarity key={p.id} id={p.id} />)}</span></div>
                  <label className="grid gap-1 text-xs"><span className="font-semibold">Leave out (rarity ids, comma separated)</span>
                    <input className="h-9 rounded-lg border border-line bg-surface/80 px-2 font-mono" value={(dr.exclude ?? []).join(', ')} onChange={(e) => set('exclude', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} data-testid="god-exclude" />
                  </label>
                </div>
              )} />
            <Panel title="Recent Godrolls">
              {(d.godroll_recent ?? []).length ? (
                <div className="grid gap-1.5" data-testid="godroll-recent">
                  {(d.godroll_recent as any[]).map((l) => (
                    <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs">
                      <Badge tone="gold">⚡ {l.kind === 'echo' ? 'Echo' : 'Pantheon'}</Badge>
                      <Link to={`/players/${l.player?.id}`} className="font-bold hover:underline">@{l.player?.username}</Link>
                      <span className="inline-flex flex-wrap gap-1">{(l.rarities ?? []).map((r: string, i: number) => <span key={i} className="inline-flex items-center gap-1"><Rarity id={r} />{l.kind === 'echo' && l.types?.[i] ? <span className="text-faint">{PLOT_TYPES[l.types[i] as keyof typeof PLOT_TYPES]?.game ?? l.types[i]}</span> : null}</span>)}</span>
                      <span className="text-muted">{l.how} · {l.rolls} rolls · {ago(l.at)}</span>{l.kept && <span className="inline-flex items-center gap-1 text-muted">kept <Rarity id={l.kept} /></span>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted">None yet — they're meant to be very rare.</p>}
            </Panel>
            <Editor title="⬆️ Ascend" cfg={a} nums={ASC_NUMS} bools={ASC_BOOLS} saving={save.isPending && save.variables?.key === 'ascend'} onSave={(v) => save.mutate({ key: 'ascend', value: v })}
              sub="Players pay Ink to reroll a plot they just claimed. The rarity can only go up (what they have is the floor), the price climbs fast, and each try makes a higher tier a little likelier."
              extra={(dr, set) => (
                <div className="mt-3 grid gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">Highest it can reach:</span>
                    <select className="h-9 rounded-lg border border-line bg-surface/80 px-2" value={dr.max_rarity ?? 'mythic'} onChange={(e) => set('max_rarity', e.target.value)} data-testid="asc-max">
                      {tiers.map((t) => <option key={t} value={t}>{rarityInfo(t).name}</option>)}
                    </select>
                  </div>
                  <div className="overflow-x-auto"><table className="w-full text-left font-mono text-[11px]">
                    <thead><tr className="text-faint"><th className="pr-2">from</th>{Array.from({ length: 10 }, (_, i) => <th key={i} className="px-1">try {i + 1}</th>)}</tr></thead>
                    <tbody>{tiers.slice(0, Math.max(1, tiers.indexOf(dr.max_rarity ?? 'mythic'))).map((t, ti) => (
                      <tr key={t}><td className="pr-2"><Rarity id={t} /></td>{ladder(Number(dr.base_ink ?? 100), Number(dr.growth ?? 1.6), Number(dr.tier_mult ?? 1.35), ti).map((c, i) => <td key={i} className="px-1">{int(c)}</td>)}</tr>
                    ))}</tbody>
                  </table></div>
                  <p className="text-faint">Ink per try, as a player sees it.</p>
                  {Object.keys(as.reached ?? {}).length > 0 && <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">Reached this week:</span>{Object.entries(as.reached as Record<string, number>).map(([r, n]) => <span key={r} className="inline-flex items-center gap-1"><Rarity id={r} />×{n}</span>)}</div>}
                </div>
              )} />
          </div>
        );
      }}</Q>
    </>
  );
}
