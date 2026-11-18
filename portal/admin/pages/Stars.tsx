// Admin → Stars (Skywright): star art waiting for review (a star's painting shows to everyone, from Earth through the
// telescope, so it's looked at first), the live settings (prices, rent, the Discoverer's cut, warps, the art rules),
// and how it's going (stars claimed, plots, painted stars, the latest discoveries).
// Server: supabase/migrations/20261120000021_skywright_core.sql (admin_star_art_queue/review, admin_stars, admin_set_star_settings).
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link, useOutletContext } from 'react-router-dom';
import type { WhoAmI } from '../../shared/api';
import { api } from '../../../src/backend/api';
import { toGameError } from '../../../src/backend/backend';
import { CLASS_BY_ID, TIERS, type StarClassId } from '../../../src/stars/galaxy';
import { cn } from '../../../src/lib/utils';
import { ago, int } from '../../shared/format';
import { Badge, Empty, PageHeader, Panel, Q, Stat } from '../../shared/ui';

type Num = { key: string; label: string; help: string; step?: number; min?: number; max?: number; group?: 'warp' | 'art' };
const NUMS: Num[] = [
  { key: 'rent_mult', label: 'Rent × (vs Earth)', help: 'A star plot pays the same rarity’s Earth rent times this. 1.1 = a tiny bit more.', step: 0.01, min: 0.5, max: 3 },
  { key: 'price_k', label: 'Price climb', help: 'Each plot on a star costs Earth × (1 + this × √plots already claimed there). 0.05: the 100th plot costs 1.5×.', step: 0.005, min: 0 },
  { key: 'keystone_mult', label: 'Keystone price ×', help: 'The 12 Keystones (Epic or better) cost this many times a plot.', step: 1, min: 1 },
  { key: 'discoverer_pct', label: 'Discoverer’s cut %', help: 'Of what others pay above the Earth price on a star, as Ink (paced like other Ink; never less than 1 while there’s a premium).', step: 1, min: 0, max: 50 },
  { key: 'max_star_plots', label: 'Most star plots a player', help: 'A cap per player, across every star.', step: 100, min: 0 },
  { key: 'base_ink', group: 'warp', label: 'Warp: base fuel (Ink)', help: 'Every warp costs at least this.', min: 0 },
  { key: 'per_doubling', group: 'warp', label: 'Warp: fuel per doubling', help: 'More for each doubling of the distance (from 4 light-years).', min: 0 },
  { key: 'max_ink', group: 'warp', label: 'Warp: most fuel', help: 'The cap, however far.', min: 0 },
  { key: 'secs_base', group: 'warp', label: 'Warp: base seconds', help: 'How long a warp takes at least.', min: 0 },
  { key: 'secs_per_doubling', group: 'warp', label: 'Warp: seconds per doubling', help: 'More for each doubling of the distance.', min: 0 },
  { key: 'max_secs', group: 'warp', label: 'Warp: most seconds', help: 'The cap, however far.', min: 0 },
  { key: 'rush_ink', group: 'warp', label: 'Arrive now (Ink)', help: 'To skip the rest of a warp.', min: 0 },
  { key: 'gate_pct', group: 'warp', label: 'Stargate discount %', help: 'Off the fuel to a star with a Stargate on it.', min: 0, max: 100 },
  { key: 'max_kb', group: 'art', label: 'Painting: largest (KB)', help: 'The largest painting a player can save.', min: 50 },
  { key: 'max_w', group: 'art', label: 'Painting: widest (px)', help: 'The flat map’s widest (it’s twice as wide as tall).', min: 256, max: 4096 },
];

function ArtQueue() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'star-art'], queryFn: api.adminStarArtQueue, refetchInterval: 60_000 });
  const [why, setWhy] = useState<Record<string, string>>({});
  const review = useMutation({
    mutationFn: ({ star, owner, ok }: { star: number; owner: string; ok: boolean }) => api.adminStarArtReview(star, owner, ok, ok ? undefined : why[`${star}:${owner}`] || undefined),
    onSuccess: (_d, v) => { toast.success(v.ok ? 'Approved — it’s on the star for everyone' : 'Rejected — they’ve been told'); void qc.invalidateQueries({ queryKey: ['admin', 'star-art'] }); void qc.invalidateQueries({ queryKey: ['admin', 'stars'] }); },
    onError: (e) => toast.error(toGameError(e).message),
  });
  return (
    <Panel title="Star art waiting for review" id="star-art">
      <Q q={q} label="Loading paintings…">{(rows) => rows.length ? (
        <div className="grid gap-3 md:grid-cols-2" data-testid="star-art-queue">
          {rows.map((r) => {
            const k = `${r.star}:${r.owner}`;
            return (
              <div key={k} className="grid gap-2 rounded-2xl border border-line p-3" data-testid="star-art-item">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <b className="text-sm">{r.star_name}</b>
                  <span className="text-muted">by</span>
                  <Link to={`/players/${r.owner}`} className="font-bold hover:underline">@{r.username ?? 'someone'}</Link>
                  <Badge tone="muted">{r.plots} plot{r.plots === 1 ? '' : 's'}</Badge>
                  <span className="text-faint">rev {r.rev} · {ago(r.updated_at)}</span>
                </div>
                {/* the painting as the player made it: a flat map of the whole star (only their plots are painted) */}
                <div className="overflow-hidden rounded-xl border border-line bg-[repeating-conic-gradient(#1b1f2e_0%_25%,#11141f_0%_50%)] [background-size:16px_16px]">
                  <img src={r.img} alt={`Painting on ${r.star_name}`} className="aspect-[2/1] w-full object-contain [image-rendering:pixelated]" />
                </div>
                <input className="h-9 rounded-lg border border-line bg-surface/80 px-2 text-xs" placeholder="Why not (shown to the player, if you reject it)" value={why[k] ?? ''} onChange={(e) => setWhy((w) => ({ ...w, [k]: e.target.value }))} />
                <div className="flex gap-2">
                  <button className="flex-1 rounded-lg bg-ok/20 px-3 py-1.5 text-xs font-bold text-ok disabled:opacity-40" disabled={review.isPending} onClick={() => review.mutate({ star: r.star, owner: r.owner, ok: true })} data-testid="star-art-approve">Approve</button>
                  <button className="flex-1 rounded-lg bg-bad/15 px-3 py-1.5 text-xs font-bold text-bad disabled:opacity-40" disabled={review.isPending} onClick={() => review.mutate({ star: r.star, owner: r.owner, ok: false })} data-testid="star-art-reject">Reject</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : <Empty title="Nothing waiting">Paintings on stars show here before anyone else sees them (when review is on).</Empty>}</Q>
    </Panel>
  );
}

function Settings({ cfg }: { cfg: Record<string, any> }) {
  const qc = useQueryClient();
  const flat = useMemo(() => {
    const o: Record<string, any> = {};
    for (const n of NUMS) o[n.group ? `${n.group}.${n.key}` : n.key] = n.group ? cfg[n.group]?.[n.key] : cfg[n.key];
    o.enabled = cfg.enabled !== false; o['art.review'] = cfg.art?.review !== false;
    return o;
  }, [cfg]);
  const [draft, setDraft] = useState(flat);
  useEffect(() => setDraft(flat), [flat]);
  const changed = Object.keys(draft).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(flat[k]));
  const save = useMutation({
    mutationFn: () => {
      const v: Record<string, any> = {};
      for (const k of changed) {
        const [a, b] = k.split('.');
        if (b) { v[a] = { ...(v[a] ?? {}), [b]: draft[k] }; } else v[a] = draft[k];
      }
      return api.adminSetStarSettings(v);
    },
    onSuccess: (d) => { qc.setQueryData(['admin', 'stars'], d); toast.success('Star settings saved', { description: 'Live now. Recorded in the audit log.' }); },
    onError: (e) => toast.error(toGameError(e).message),
  });
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));
  // what the price ladder looks like on one star at today's base Earth price of 100
  const k = Number(draft.price_k ?? 0.05);
  return (
    <Panel title="Settings" actions={<button disabled={!changed.length || save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40" data-testid="stars-save">
      {save.isPending ? 'Saving…' : changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Saved'}</button>}>
      <div className="mb-3 flex flex-wrap gap-2">
        {([['enabled', 'Stars are open (warps and claims)'], ['art.review', 'Paintings wait for review']] as const).map(([key, l]) => (
          <button key={key} onClick={() => set(key, !draft[key])} aria-pressed={!!draft[key]} className={cn('rounded-full border px-3 py-1.5 text-xs font-bold', draft[key] ? 'border-ok/60 bg-ok/15 text-ok' : 'border-line text-muted')} data-testid={`stars-bool-${key}`}>
            {draft[key] ? '✓' : '○'} {l}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {NUMS.map((n) => {
          const key = n.group ? `${n.group}.${n.key}` : n.key;
          return (
            <label key={key} className="grid gap-0.5 rounded-xl border border-line px-3 py-2">
              <span className="text-xs font-semibold">{n.label}</span>
              <input type="number" className="h-9 rounded-lg border border-line bg-surface/80 px-2 font-mono text-sm" step={n.step ?? 1} min={n.min} max={n.max}
                value={draft[key] ?? ''} onChange={(e) => set(key, e.target.value === '' ? undefined : Number(e.target.value))} data-testid={`stars-num-${key}`} />
              <span className="text-[11px] text-faint">{n.help}</span>
            </label>
          );
        })}
      </div>
      <div className="mt-3 overflow-x-auto text-xs">
        <div className="mb-1 font-semibold">A plot’s price on one star (Earth price 100 Ink)</div>
        <table className="font-mono text-[11px]"><tbody><tr>
          {[0, 1, 10, 50, 100, 500, 1000, 5000].map((n) => <td key={n} className="pr-3"><div className="text-faint">plot {n + 1}</div>{int(Math.round(100 * (1 + k * Math.sqrt(n))))}</td>)}
        </tr></tbody></table>
      </div>
    </Panel>
  );
}

export default function StarsPage() {
  const who = useOutletContext<WhoAmI>();
  const has = (...roles: string[]) => who.roles.some((r) => r === 'owner' || r === 'admin' || roles.includes(r));
  const q = useQuery({ queryKey: ['admin', 'stars'], queryFn: api.adminStars, refetchInterval: 120_000 });
  return (
    <>
      <PageHeader title="Stars" sub="Skywright: ~86 billion stars as land. Paintings waiting for review, the live settings, and how it’s going." />
      <div className="grid gap-3" data-testid="stars-page">
        <Q q={q} label="Loading the stars…">{(d) => {
          const s = d.stats ?? {};
          return (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Stat label="Stars claimed" value={int(s.systems ?? 0)} sub={`${int(s.painted ?? 0)} Painted Stars`} tone="gold" />
                <Stat label="Star plots" value={int(s.plots ?? 0)} sub={`${int(s.owners ?? 0)} owners`} />
                <Stat label="Plots this week" value={int(s.plots_7d ?? 0)} sub={`${int(s.ink_7d ?? 0)} Ink paid`} tone="accent" />
                <Stat label="Art waiting" value={int(s.pending_art ?? 0)} sub="paintings to review" tone={s.pending_art ? 'gold' : undefined} />
              </div>
              {has('moderator') && <ArtQueue />}
              {has('economy') ? <Settings cfg={d.settings ?? {}} /> : null}
              <Panel title="Latest discoveries">
                {d.recent.length ? (
                  <div className="grid gap-1.5" data-testid="stars-recent">
                    {d.recent.map((r) => (
                      <div key={r.star} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs">
                        <span>{CLASS_BY_ID[r.cls as StarClassId]?.emoji ?? '✨'}</span>
                        <b>{r.name}</b>
                        <Badge tone="muted">{TIERS[r.tier]?.name ?? `tier ${r.tier}`}</Badge>
                        <span className="text-muted">{int(r.claimed)}/{int(r.cells)} plots{r.painted ? ' · 🖼️ painted' : ''}</span>
                        {r.discoverer?.id && <Link to={`/players/${r.discoverer.id}`} className="font-bold hover:underline">🔭 @{r.discoverer.username}</Link>}
                        <span className="text-faint">{ago(r.at)}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted">No stars claimed yet.</p>}
              </Panel>
            </>
          );
        }}</Q>
      </div>
    </>
  );
}
