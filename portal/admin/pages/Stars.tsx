// Admin → Stars (Skywright): star art waiting for review (a star's painting shows to everyone, from Earth through the
// telescope, so it's looked at first), the live settings (prices, rent, the Discoverer's cut, warps, the art rules),
// and how it's going (stars claimed, plots, painted stars, the latest discoveries).
// Server: supabase/migrations/20261120000021_skywright_core.sql (admin_star_art_queue/review, admin_stars, admin_set_star_settings).
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link, useOutletContext } from 'react-router-dom';
import type { WhoAmI } from '../../shared/api';
import { api } from '../../../src/backend/api';
import { toGameError } from '../../../src/backend/backend';
import { CLASS_BY_ID, TIERS, type StarClassId } from '../../../src/stars/galaxy';
import { cn } from '../../../src/lib/utils';
import type { AdminStarArt } from '../../../src/stars/types';
import { ago, int } from '../../shared/format';
import { Badge, Empty, PageHeader, Panel, Q, Stat } from '../../shared/ui';

type Num = { key: string; label: string; help: string; step?: number; min?: number; max?: number; group?: 'warp' | 'art' | 'sky' | 'reach' };
const NUMS: Num[] = [
  { key: 'rent_mult', label: 'Rent × (vs Earth)', help: 'A star plot pays the same rarity’s Earth rent times this. 1.1 = a tiny bit more.', step: 0.01, min: 0.5, max: 3 },
  { key: 'price_k', label: 'Price climb', help: 'Each plot on a star costs Earth × (1 + this × √plots already claimed there). 0.05: the 100th plot costs 1.5×.', step: 0.005, min: 0 },
  { key: 'keystone_mult', label: 'Keystone price ×', help: 'The 12 Keystones (Epic or better) cost this many times a plot.', step: 1, min: 1 },
  { key: 'discoverer_pct', label: 'Discoverer’s cut %', help: 'Of what others pay above the Earth price on a star, as Ink (paced like other Ink; never less than 1 while there’s a premium).', step: 1, min: 0, max: 50 },
  { key: 'max_star_plots', label: 'Most star plots a player', help: 'A cap per player, across every star.', step: 100, min: 0 },
  { key: 'plots_full', label: 'Plots loaded at once', help: 'A star with up to this many claimed plots loads them all at once (on the shell, in the painter, in the sky). Past it, players load the plots round them (and all their own).', step: 500, min: 100, max: 50000 },
  { key: 'base_ink', group: 'warp', label: 'Warp: base fuel (Ink)', help: 'Every warp costs at least this.', min: 0 },
  { key: 'per_doubling', group: 'warp', label: 'Warp: fuel per doubling', help: 'More for each doubling of the distance (from 4 light-years).', min: 0 },
  { key: 'max_ink', group: 'warp', label: 'Warp: most fuel', help: 'The cap, however far.', min: 0 },
  { key: 'secs_base', group: 'warp', label: 'Warp: base seconds', help: 'How long a warp takes at least.', min: 0 },
  { key: 'secs_per_doubling', group: 'warp', label: 'Warp: seconds per doubling', help: 'More for each doubling of the distance.', min: 0 },
  { key: 'max_secs', group: 'warp', label: 'Warp: most seconds', help: 'The cap, however far.', min: 0 },
  { key: 'rush_ink', group: 'warp', label: 'Arrive now (Ink)', help: 'To skip the rest of a warp.', min: 0 },
  { key: 'gate_pct', group: 'warp', label: 'Stargate discount %', help: 'Off the fuel to a star with a Stargate on it.', min: 0, max: 100 },
  { key: 'max_kb', group: 'art', label: 'Painting: largest (KB)', help: 'The largest painting a player can save.', min: 50 },
  { key: 'max_w', group: 'art', label: 'Painting: widest (px)', help: 'The flat map’s widest (it’s twice as wide as tall), and the most a painted part of a big star can be either way.', min: 256, max: 4096 },
  { key: 'region_px', group: 'art', label: 'Painting: px a plot (big stars)', help: 'On a white star or bigger, players paint the part round their plots at about this many pixels a plot (more: sharper, but fewer plots fit in one painting).', min: 8, max: 80 },
  { key: 'size_k', group: 'sky', label: 'Sky: star size', help: 'How big stars look: degrees across × class size ÷ light-years. 10: Sirius is ~1.3° (a ball to the naked eye), a star 1,000 ly away 0.01°. Bigger: every star bigger at every zoom.', step: 0.5, min: 0.1, max: 200 },
  { key: 'shell_x', group: 'sky', label: 'Sky: claimed shell ×', help: 'A claimed star shows its shell of plots: this many times the bare star. Bigger: paintings show at less zoom.', step: 0.1, min: 1, max: 20 },
  { key: 'point_k', group: 'sky', label: 'Sky: unclaimed ball ×', help: 'Unclaimed stars grow into balls at this share of their size (1: full size; less: they stay points longer).', step: 0.05, min: 0, max: 3 },
  { key: 'disc_px', group: 'sky', label: 'Sky: disc from (px)', help: 'A claimed star turns into its painted disc once it’s this many pixels across.', step: 1, min: 1, max: 60 },
  { key: 'max_deg', group: 'sky', label: 'Sky: biggest star (°)', help: 'However near, no star looks bigger than this many degrees across (its shell 1.5° more).', step: 0.5, min: 0.1, max: 30 },
  { key: 'base', group: 'reach', label: 'Telescope: everyone’s reach', help: 'The deepest tier anyone sees (1 binoculars, 2 telescope, 3 deep field, 4 ultra deep, 5 the far galaxy).', min: 1, max: 5 },
  { key: 'one', group: 'reach', label: 'Telescope: with one Observatory', help: 'The tier one Observatory among the stars takes you to.', min: 1, max: 5 },
  { key: 'two', group: 'reach', label: 'Telescope: with two Observatories', help: 'With two (or one at the level below).', min: 1, max: 5 },
  { key: 'level', group: 'reach', label: 'Telescope: Observatory level for the top', help: 'One Observatory at this level counts as two.', min: 1, max: 5 },
];

type ArtStatus = 'pending' | 'approved' | 'rejected';
/** a painting, cropped to where it's painted (a whole-star map is mostly empty: only the player's plots are painted) */
function Cropped({ img, alt }: { img: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const im = new Image();
    im.onload = () => {
      // (the painted part's box, found on a small copy, then cut from the full one)
      const s = Math.min(1, 512 / Math.max(im.width, im.height));
      const w = Math.max(1, Math.round(im.width * s)), h = Math.max(1, Math.round(im.height * s));
      const t = Object.assign(document.createElement('canvas'), { width: w, height: h });
      const g = t.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(im, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) { if (live) setSrc(img); return; }
      const pad = 3;
      x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
      const sx = x0 / s, sy = y0 / s, sw = (x1 - x0 + 1) / s, sh = (y1 - y0 + 1) / s;
      const k = Math.min(4, 640 / Math.max(sw, sh));
      const o = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(sw * k)), height: Math.max(1, Math.round(sh * k)) });
      const og = o.getContext('2d')!;
      og.imageSmoothingEnabled = false;
      og.drawImage(im, sx, sy, sw, sh, 0, 0, o.width, o.height);
      if (live) setSrc(o.toDataURL('image/png'));
    };
    im.onerror = () => { if (live) setSrc(img); };
    im.src = img;
    return () => { live = false; };
  }, [img]);
  return (
    <div className="grid h-48 place-items-center overflow-hidden rounded-xl border border-line bg-[repeating-conic-gradient(#1b1f2e_0%_25%,#11141f_0%_50%)] [background-size:16px_16px]">
      {src ? <img src={src} alt={alt} className="max-h-full max-w-full object-contain [image-rendering:pixelated]" data-testid="star-art-crop" /> : <span className="text-xs text-faint">Loading…</span>}
    </div>
  );
}
const ArtGlobe = lazy(() => import('./StarsArtGlobe'));

/** every painting on the stars: waiting for review, on the stars, turned down — and review itself, on or off */
function ArtSection({ review, canSet }: { review: boolean; canSet: boolean }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<ArtStatus>('pending');
  const q = useQuery({ queryKey: ['admin', 'star-art', tab], queryFn: () => api.adminStarArtList(tab, 60), refetchInterval: tab === 'pending' ? 60_000 : false });
  const [why, setWhy] = useState<Record<string, string>>({});
  const [look, setLook] = useState<AdminStarArt | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin', 'star-art'] }); void qc.invalidateQueries({ queryKey: ['admin', 'stars'] }); };
  const act = useMutation({
    mutationFn: ({ star, owner, ok }: { star: number; owner: string; ok: boolean }) => api.adminStarArtReview(star, owner, ok, ok ? undefined : why[`${star}:${owner}`] || undefined),
    onSuccess: (_d, v) => { toast.success(v.ok ? 'Approved: it’s on the star for everyone' : 'Taken off: they’ve been told'); refresh(); },
    onError: (e) => toast.error(toGameError(e).message),
  });
  const all = useMutation({
    mutationFn: () => api.adminStarArtApproveAll(),
    onSuccess: (r) => { toast.success(`Approved ${r.approved} painting${r.approved === 1 ? '' : 's'}`, { description: r.left ? `${r.left} still waiting (they go 500 at a time).` : undefined }); refresh(); },
    onError: (e) => toast.error(toGameError(e).message),
  });
  const setReview = useMutation({
    mutationFn: (on: boolean) => api.adminSetStarSettings({ art: { review: on } }),
    onSuccess: (d, on) => { qc.setQueryData(['admin', 'stars'], d); toast.success(on ? 'Paintings wait for review again' : 'Review is off: new paintings show on the stars straight away'); },
    onError: (e) => toast.error(toGameError(e).message),
  });
  const waiting = tab === 'pending' ? (q.data?.length ?? 0) : undefined;
  return (
    <Panel title="Star art" id="star-art" actions={
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={!canSet || setReview.isPending} onClick={() => {
          const on = !review;
          if (!on && (waiting ?? 0) > 0 && confirm(`Turn review off and approve the ${waiting} painting${waiting === 1 ? '' : 's'} waiting too?`)) all.mutate();
          setReview.mutate(on);
        }} aria-pressed={review} title={canSet ? '' : 'Needs the economy role'}
          className={cn('rounded-full border px-3 py-1.5 text-xs font-bold disabled:opacity-50', review ? 'border-ok/60 bg-ok/15 text-ok' : 'border-warn/60 bg-warn/10 text-warn')} data-testid="star-art-review-toggle">
          {review ? '✓ Review on: paintings wait for approval' : '○ Review off: paintings show straight away'}
        </button>
        {tab === 'pending' && (q.data?.length ?? 0) > 0 && <button className="rounded-lg bg-ok/20 px-3 py-1.5 text-xs font-bold text-ok disabled:opacity-40" disabled={all.isPending}
          onClick={() => { if (confirm(`Approve all ${q.data!.length}${q.data!.length >= 60 ? '+' : ''} waiting paintings?`)) all.mutate(); }} data-testid="star-art-approve-all">Approve all waiting</button>}
      </div>}>
      <div className="mb-3 flex gap-1.5">
        {([['pending', 'Waiting'], ['approved', 'On the stars'], ['rejected', 'Turned down']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('rounded-full px-3 py-1 text-xs font-bold', tab === k ? 'bg-accent text-white' : 'border border-line text-muted')} data-testid={`star-art-tab-${k}`}>{l}{k === tab && q.data ? ` · ${q.data.length}${q.data.length >= 60 ? '+' : ''}` : ''}</button>
        ))}
      </div>
      <Q q={q} label="Loading paintings…">{(rows) => rows.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="star-art-queue">
          {rows.map((r) => {
            const k = `${r.star}:${r.owner}`;
            return (
              <div key={k} className="grid content-start gap-2 rounded-2xl border border-line p-3" data-testid="star-art-item">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <b className="text-sm">{CLASS_BY_ID[r.cls as StarClassId]?.emoji ?? '✨'} {r.star_name}</b>
                  <span className="text-muted">by</span>
                  <Link to={`/players/${r.owner}`} className="font-bold hover:underline">@{r.username ?? 'someone'}</Link>
                  <Badge tone="muted">{r.plots} plot{r.plots === 1 ? '' : 's'}</Badge>
                  {r.rect ? <Badge tone="accent">part of the star</Badge> : null}
                  <span className="text-faint">rev {r.rev} · {ago(r.updated_at)}</span>
                </div>
                <Cropped img={r.img} alt={`Painting on ${r.star_name}`} />
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <button className="rounded-lg border border-line px-2.5 py-1 font-bold hover:bg-surface" onClick={() => setLook(r)} data-testid="star-art-look">See it on the star</button>
                  <a className="rounded-lg border border-line px-2.5 py-1 font-bold hover:bg-surface" href={r.img} target="_blank" rel="noreferrer" download={`star-${r.star}-${r.username ?? r.owner}.png`}>The whole picture</a>
                </div>
                {r.status === 'rejected' && r.reason && <div className="text-[11px] text-bad">Why: {r.reason}</div>}
                {r.status !== 'rejected' && <input className="h-9 rounded-lg border border-line bg-surface/80 px-2 text-xs" placeholder={r.status === 'approved' ? 'Why it’s coming down (shown to the player)' : 'Why not (shown to the player, if you reject it)'} value={why[k] ?? ''} onChange={(e) => setWhy((w) => ({ ...w, [k]: e.target.value }))} />}
                <div className="flex gap-2">
                  {r.status !== 'approved' && <button className="flex-1 rounded-lg bg-ok/20 px-3 py-1.5 text-xs font-bold text-ok disabled:opacity-40" disabled={act.isPending} onClick={() => act.mutate({ star: r.star, owner: r.owner, ok: true })} data-testid="star-art-approve">{r.status === 'rejected' ? 'Approve after all' : 'Approve'}</button>}
                  {r.status !== 'rejected' && <button className="flex-1 rounded-lg bg-bad/15 px-3 py-1.5 text-xs font-bold text-bad disabled:opacity-40" disabled={act.isPending} onClick={() => act.mutate({ star: r.star, owner: r.owner, ok: false })} data-testid="star-art-reject">{r.status === 'approved' ? 'Take it down' : 'Reject'}</button>}
                </div>
              </div>
            );
          })}
        </div>
      ) : <Empty title={tab === 'pending' ? 'Nothing waiting' : tab === 'approved' ? 'No paintings on the stars yet' : 'Nothing turned down'}>{tab === 'pending' ? (review ? 'Paintings on stars show here before anyone else sees them.' : 'Review is off, so new paintings go straight onto the stars (they’re under “On the stars”).') : null}</Empty>}</Q>
      {look && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setLook(null)} data-testid="star-art-globe">
          <div className="grid w-full max-w-lg gap-2 rounded-2xl border border-line bg-bg p-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between text-sm"><b>{look.star_name} · @{look.username}</b><button className="rounded-lg border border-line px-2 py-1 text-xs" onClick={() => setLook(null)}>Close</button></div>
            <div className="aspect-square w-full overflow-hidden rounded-xl bg-[radial-gradient(circle_at_50%_45%,rgba(139,107,255,0.18),#05070f_70%)]">
              <Suspense fallback={<div className="grid h-full place-items-center text-xs text-faint">Loading…</div>}>
                <ArtGlobe star={look.star} m={look.m ?? 3} cls={look.cls ?? 'yellow'} cells={look.cells ?? 92} img={look.img} rect={look.rect} />
              </Suspense>
            </div>
            <p className="text-[11px] text-muted">Drag to turn it. This is the painting alone on its star, as everyone would see it in the star’s preview and through the telescope.</p>
          </div>
        </div>
      )}
    </Panel>
  );
}

function Settings({ cfg }: { cfg: Record<string, any> }) {
  const qc = useQueryClient();
  const flat = useMemo(() => {
    const o: Record<string, any> = {};
    for (const n of NUMS) o[n.group ? `${n.group}.${n.key}` : n.key] = n.group ? cfg[n.group]?.[n.key] : cfg[n.key];
    o.enabled = cfg.enabled !== false; o['art.review'] = cfg.art?.review !== false; o.keystone_floor = cfg.keystone_floor ?? 'epic';
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
      <label className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs">
        <span className="font-semibold">Keystones roll at least</span>
        <select className="h-8 rounded-lg border border-line bg-surface/80 px-2 text-xs" value={draft.keystone_floor ?? 'epic'} onChange={(e) => set('keystone_floor', e.target.value)} data-testid="stars-keystone-floor">
          {['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
        </select>
        <span className="text-[11px] text-faint">The 12 pentagons of every star (no ultras on stars).</span>
      </label>
      {(['', 'warp', 'art', 'sky', 'reach'] as const).map((grp) => (
      <div key={grp || 'main'} className="mb-3">
      {grp && <div className="mb-1.5 mt-1 text-[11px] font-black uppercase tracking-wider text-muted">{({ warp: 'Warps', art: 'Paintings', sky: 'How stars look in the sky', reach: 'The telescope’s reach' } as Record<string, string>)[grp]}</div>}
      <div className="grid gap-2 sm:grid-cols-2">
        {NUMS.filter((n) => (n.group ?? '') === grp).map((n) => {
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
      </div>
      ))}
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
              {has('moderator') && <ArtSection review={d.settings?.art?.review !== false} canSet={has('economy')} />}
              {has('economy') ? <Settings cfg={d.settings ?? {}} /> : null}
              {has('economy') ? <Nested cfg={d.settings ?? {}} /> : null}
              {has('economy') ? <Supernova /> : null}
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

const NESTED_LABEL: Record<string, string> = {
  forge: '🔥 Fusion Forge', grove: '🌱 Lumen Grove', ranch: '☄️ Comet Ranch', sails: '⛵ Sail Yard', observatory: '🔭 Observatory', hatchery: '🐣 Plasma Hatchery',
  gate: '🌀 Stargate', lens: '🔦 Starbeam Lens', flare: '☀️ Red dwarf flares', eclipse: '🌑 Binary eclipses', pulse: '💫 Pulsar beat', dilation: '🕳️ Black hole time bend',
  supernova: '💥 Supernova', light: '🕯️ Lighting a star',
};
/** every plot type's numbers and every kind of star's (game_config 'stars' → kinds, nature) */
function Nested({ cfg }: { cfg: Record<string, any> }) {
  const qc = useQueryClient();
  const base = useMemo(() => ({ kinds: cfg.kinds ?? {}, nature: cfg.nature ?? {} }) as Record<'kinds' | 'nature', Record<string, Record<string, number>>>, [cfg]);
  const [draft, setDraft] = useState(base);
  useEffect(() => setDraft(base), [base]);
  const changed: { g: 'kinds' | 'nature'; k: string; f: string }[] = [];
  for (const g of ['kinds', 'nature'] as const) for (const k of Object.keys(draft[g])) for (const f of Object.keys(draft[g][k])) if (draft[g][k][f] !== base[g][k]?.[f]) changed.push({ g, k, f });
  const save = useMutation({
    mutationFn: () => {
      const v: Record<string, Record<string, Record<string, number>>> = {};
      for (const c of changed) { v[c.g] ??= {}; v[c.g][c.k] ??= {}; v[c.g][c.k][c.f] = draft[c.g][c.k][c.f]; }
      return api.adminSetStarSettings(v);
    },
    onSuccess: (d) => { qc.setQueryData(['admin', 'stars'], d); toast.success('Saved', { description: 'Live now. Recorded in the audit log.' }); },
    onError: (e) => toast.error(toGameError(e).message),
  });
  return (
    <Panel title="Each plot type and each kind of star" actions={<button disabled={!changed.length || save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40" data-testid="stars-nested-save">
      {save.isPending ? 'Saving…' : changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Saved'}</button>}>
      <div className="grid gap-2 md:grid-cols-2">
        {(['kinds', 'nature'] as const).flatMap((g) => Object.entries(draft[g]).map(([k, o]) => (
          <div key={`${g}.${k}`} className="grid gap-1.5 rounded-xl border border-line p-2.5">
            <div className="text-xs font-bold">{NESTED_LABEL[k] ?? k}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(o).map(([f, val]) => (
                <label key={f} className="grid gap-0.5 text-[11px] text-muted">{f.replace(/_/g, ' ')}
                  <input type="number" step="any" min={0} className="h-8 rounded-lg border border-line bg-surface/80 px-2 font-mono text-xs text-fg" value={val}
                    onChange={(e) => setDraft((d) => ({ ...d, [g]: { ...d[g], [k]: { ...d[g][k], [f]: Number(e.target.value) } } }))} data-testid={`stars-${g}-${k}-${f}`} />
                </label>
              ))}
            </div>
          </div>
        )))}
      </div>
    </Panel>
  );
}
/** 💥 set off a supernova (Betelgeuse, or any star by its code): gold and Ink for everyone on it, once */
function Supernova() {
  const qc = useQueryClient();
  const [code, setCode] = useState('HIP 27989');
  const [armed, setArmed] = useState(false);
  const go = useMutation({
    mutationFn: () => {
      const s = code.trim().toUpperCase();
      const m = /^HIP\s*(\d+)$/.exec(s) ?? /^(\d+)$/.exec(s);
      const lv = /^LV-?([0-9A-Z]+)$/.exec(s);
      const id = m ? Number(m[1]) : lv ? parseInt(lv[1], 36) : NaN;
      if (!Number.isFinite(id)) throw new Error('Give a star’s code: HIP 27989 or LV-…');
      return api.adminStarSupernova(id);
    },
    onSettled: () => setArmed(false),
    onSuccess: (r) => { toast.success('💥 Supernova', { description: `${r.owners} owner${r.owners === 1 ? '' : 's'} got gold and Ink.` }); void qc.invalidateQueries({ queryKey: ['admin', 'stars'] }); },
    onError: (e) => toast.error(toGameError(e).message),
  });
  return (
    <Panel title="💥 A supernova">
      <p className="mb-2 text-xs text-muted">Once per star, for good: everyone with a plot on it gets gold (an element) and Ink, it blazes in everyone’s sky for two weeks, and it’s on the feed. Betelgeuse is HIP 27989.</p>
      <div className="flex flex-wrap gap-2">
        <input className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface/80 px-2 font-mono text-sm" value={code} onChange={(e) => setCode(e.target.value)} data-testid="stars-nova-code" />
        <button className="rounded-lg bg-bad/80 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40" disabled={go.isPending}
          onClick={() => { if (armed) go.mutate(); else { setArmed(true); setTimeout(() => setArmed(false), 6000); } }} data-testid="stars-nova-go">{armed ? 'Tap again: it can’t be undone' : 'Set it off'}</button>
      </div>
    </Panel>
  );
}
