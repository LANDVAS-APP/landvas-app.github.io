// Admin: the extra ways to earn Ink (daily wheel, room check-ins, Inspire, craft bonus,
// Featured picks, challenge voting) and the weekly challenge manager.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { WheelSlice } from '../backend/types';
import { cn, fmt, timeAgo } from '../lib/utils';
import { Button, Empty, Spinner, Switch } from '../ui';

const num = 'h-9 w-20 rounded-lg border border-line bg-surface px-2 text-sm text-fg tnum';
const txt = 'h-9 rounded-lg border border-line bg-surface px-2 text-sm text-fg';

function Box({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-display text-base font-semibold">{title}</h3>{actions}</div>
      {children}
    </section>
  );
}
function Num({ label, value, onChange, min = 0, max = 100000, step = 1, suffix }: { label: string; value: number; onChange(n: number): void; min?: number; max?: number; step?: number; suffix?: string }) {
  return (
    <label className="grid gap-0.5 text-[11px] font-semibold text-muted">{label}
      <span className="flex items-center gap-1.5"><input type="number" className={num} min={min} max={max} step={step} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(Number(e.target.value))} />{suffix && <span className="text-[11px] font-normal text-faint">{suffix}</span>}</span>
    </label>
  );
}
const KINDS: { id: WheelSlice['kind']; label: string; unit: string }[] = [
  { id: 'ink', label: 'Ink', unit: 'Ink' }, { id: 'pigments', label: 'Pigments', unit: 'pigments' }, { id: 'brush_points', label: 'XP', unit: 'XP' },
  { id: 'gallery_tokens', label: 'Gallery tokens', unit: 'tokens' }, { id: 'boost', label: 'Rent boost', unit: 'minutes' }, { id: 'joystick', label: 'Joystick refill', unit: '' },
];

export function EarnSettings({ value, onSave }: { value: any; onSave(v: any): Promise<void> }) {
  const [v, setV] = useState<any>(() => structuredClone(value));
  useEffect(() => setV(structuredClone(value)), [value]);
  const dirty = JSON.stringify(v) !== JSON.stringify(value);
  const part = (k: string, patch: Record<string, unknown>) => setV({ ...v, [k]: { ...(v[k] ?? {}), ...patch } });
  const slices: (WheelSlice & { weight: number })[] = v.wheel?.slices ?? [];
  const total = slices.reduce((s, x) => s + Math.max(0, Number(x.weight) || 0), 0);
  const setSlice = (i: number, patch: Partial<WheelSlice & { weight: number }>) => part('wheel', { slices: slices.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const tiers: { min: number; ink: number }[] = v.craft?.tiers ?? [];
  const effort: { full_minutes?: number; per_plot_pct?: number; floor?: number } = v.craft?.effort ?? {};
  const setEffort = (patch: Record<string, number>) => part('craft', { effort: { ...effort, ...patch } });
  const bands: { sim: number; factor: number }[] = v.craft?.originality ?? [];
  const setBands = (b: { sim: number; factor: number }[]) => part('craft', { originality: b });
  return (
    <Box title="More ways to earn Ink" actions={<div className="flex gap-2">
      {dirty && <Button size="sm" variant="ghost" onClick={() => setV(structuredClone(value))}>Undo</Button>}
      <Button size="sm" variant="primary" disabled={!dirty} onClick={() => void onSave(v)} data-testid="save-earn">Save</Button>
    </div>}>
      <div className="grid gap-4">
        <details open className="rounded-2xl border border-line p-3">
          <summary className="cursor-pointer font-semibold">Daily wheel</summary>
          <div className="mt-3 grid gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <Switch id="wheel-on" checked={!!v.wheel?.enabled} label="Wheel is on" onCheckedChange={(on) => part('wheel', { enabled: on })} />
              <Num label="Free spins per day" value={Number(v.wheel?.spins_per_day ?? 1)} max={50} onChange={(n) => part('wheel', { spins_per_day: Math.round(n) })} />
            </div>
            <div className="grid gap-1.5">
              {slices.map((s, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-2" data-testid="wheel-slice">
                  <label className="grid gap-0.5 text-[11px] font-semibold text-muted">Label<input className={cn(txt, 'w-36')} maxLength={40} value={s.label} onChange={(e) => setSlice(i, { label: e.target.value })} /></label>
                  <label className="grid gap-0.5 text-[11px] font-semibold text-muted">Prize<select className={txt} value={s.kind} onChange={(e) => setSlice(i, { kind: e.target.value as WheelSlice['kind'] })}>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
                  {s.kind !== 'joystick' && <Num label="Amount" value={Number(s.amount)} onChange={(n) => setSlice(i, { amount: Math.max(0, Math.round(n)) })} suffix={KINDS.find((k) => k.id === s.kind)?.unit} />}
                  <Num label="Weight" value={Number(s.weight)} onChange={(n) => setSlice(i, { weight: Math.max(0, n) })} suffix={total ? `${((100 * Math.max(0, Number(s.weight) || 0)) / total).toFixed(1)}%` : ''} />
                  <label className="grid gap-0.5 text-[11px] font-semibold text-muted">Colour<input type="color" className="h-9 w-12 rounded-lg border border-line bg-surface" value={s.color || '#7B5CFF'} onChange={(e) => setSlice(i, { color: e.target.value })} /></label>
                  <button className="mb-1.5 ml-auto rounded-lg p-1.5 text-bad hover:bg-bad/10 disabled:opacity-30" disabled={slices.length <= 2} onClick={() => part('wheel', { slices: slices.filter((_, k) => k !== i) })} aria-label="Remove slice"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <Button size="sm" variant="secondary" className="justify-self-start" disabled={slices.length >= 16} onClick={() => part('wheel', { slices: [...slices, { label: '5 Ink', kind: 'ink', amount: 5, weight: 10, color: '#34C3FF' }] })}><Plus className="h-4 w-4" /> Add a slice</Button>
              <p className="text-[11px] text-faint">Weight sets how often a slice lands (players see the odds). 2–16 slices.</p>
            </div>
          </div>
        </details>
        <details className="rounded-2xl border border-line p-3">
          <summary className="cursor-pointer font-semibold">Room check-ins</summary>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Switch id="rooms-on" checked={!!v.rooms?.enabled} label="Check-ins pay" onCheckedChange={(on) => part('rooms', { enabled: on })} />
            <Num label="Visitor earns" value={Number(v.rooms?.visitor_ink ?? 2)} onChange={(n) => part('rooms', { visitor_ink: Math.max(0, Math.round(n)) })} suffix="Ink / room" />
            <Num label="Paid rooms per day" value={Number(v.rooms?.visitor_daily ?? 5)} max={1000} onChange={(n) => part('rooms', { visitor_daily: Math.round(n) })} />
            <Num label="Host earns" value={Number(v.rooms?.host_ink ?? 2)} onChange={(n) => part('rooms', { host_ink: Math.max(0, Math.round(n)) })} suffix="Ink / visitor" />
            <Num label="Paid visitors per day" value={Number(v.rooms?.host_daily ?? 10)} max={1000} onChange={(n) => part('rooms', { host_daily: Math.round(n) })} />
            <Num label="Look around first" value={Number(v.rooms?.stay_seconds ?? 10)} max={600} onChange={(n) => part('rooms', { stay_seconds: Math.round(n) })} suffix="sec" />
            <Num label="Account age to earn" value={Number(v.rooms?.min_account_hours ?? 24)} max={8760} onChange={(n) => part('rooms', { min_account_hours: n })} suffix="hours" />
          </div>
        </details>
        <details className="rounded-2xl border border-line p-3">
          <summary className="cursor-pointer font-semibold">Inspire (appreciating art)</summary>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Switch id="inspire-on" checked={!!v.inspire?.enabled} label="Inspire pays" onCheckedChange={(on) => part('inspire', { enabled: on })} />
            <Num label="Artist earns" value={Number(v.inspire?.artist_ink ?? 2)} onChange={(n) => part('inspire', { artist_ink: Math.max(0, Math.round(n)) })} suffix="Ink / inspirer" />
            <Num label="Artist daily cap" value={Number(v.inspire?.artist_daily_cap ?? 40)} max={1000000} onChange={(n) => part('inspire', { artist_daily_cap: Math.max(0, Math.round(n)) })} suffix="Ink" />
            <Num label="Inspirer earns" value={Number(v.inspire?.giver_ink ?? 1)} onChange={(n) => part('inspire', { giver_ink: Math.max(0, Math.round(n)) })} suffix="Ink" />
            <Num label="…for the first" value={Number(v.inspire?.giver_daily ?? 5)} max={1000} onChange={(n) => part('inspire', { giver_daily: Math.round(n) })} suffix="a day" />
            <Num label="Account age to count" value={Number(v.inspire?.min_account_hours ?? 24)} max={8760} onChange={(n) => part('inspire', { min_account_hours: n })} suffix="hours" />
          </div>
          <p className="mt-2 text-[11px] text-faint">Each account pays an artwork once, ever — un-inspiring and re-inspiring doesn’t pay again.</p>
        </details>
        <details className="rounded-2xl border border-line p-3">
          <summary className="cursor-pointer font-semibold">Craft bonus</summary>
          <div className="mt-3 grid gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <Switch id="craft-on" checked={!!v.craft?.enabled} label="Craft bonus pays" onCheckedChange={(on) => part('craft', { enabled: on })} />
              <Num label="Bigger murals: + per extra plot" value={Number(v.craft?.plot_bonus_pct ?? 20)} max={1000} onChange={(n) => part('craft', { plot_bonus_pct: n })} suffix="%" />
              <Num label="…up to" value={Number(v.craft?.max_bonus_plots ?? 8)} max={1024} onChange={(n) => part('craft', { max_bonus_plots: Math.round(n) })} suffix="extra plots" />
              <Num label="Daily cap" value={Number(v.craft?.daily_cap ?? 100)} max={1000000} onChange={(n) => part('craft', { daily_cap: Math.max(0, Math.round(n)) })} suffix="Ink" />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              {tiers.map((t, i) => (
                <div key={i} className="flex items-end gap-1.5 rounded-xl border border-line p-2">
                  <Num label="Craft score" value={Number(t.min)} max={100} onChange={(n) => part('craft', { tiers: tiers.map((x, k) => (k === i ? { ...x, min: Math.max(0, Math.min(100, n)) } : x)) })} suffix="+" />
                  <Num label="Pays" value={Number(t.ink)} onChange={(n) => part('craft', { tiers: tiers.map((x, k) => (k === i ? { ...x, ink: Math.max(0, Math.round(n)) } : x)) })} suffix="Ink" />
                  <button className="mb-1.5 rounded-lg p-1.5 text-bad hover:bg-bad/10" onClick={() => part('craft', { tiers: tiers.filter((_, k) => k !== i) })} aria-label="Remove tier"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <Button size="sm" variant="secondary" disabled={tiers.length >= 10} onClick={() => part('craft', { tiers: [...tiers, { min: 90, ink: 40 }] })}><Plus className="h-4 w-4" /> Tier</Button>
            </div>
            <p className="text-[11px] text-faint">The craft score (0–100) is the picture’s quality (palette, shading, shapes, filled areas — squiggles, lines and noise score low) multiplied by how long it took to paint. Each canvas earns its best tier once; republishing only pays the difference when it reaches a higher tier.</p>
            <div className="grid gap-2 rounded-xl border border-line p-2">
              <div className="text-xs font-bold">Painting time <span className="font-normal text-faint">(the biggest factor — players never see it)</span></div>
              <div className="flex flex-wrap items-end gap-3">
                <Num label="Full score after" value={Number(effort.full_minutes ?? 40)} min={1} max={1440} onChange={(n) => setEffort({ full_minutes: Math.max(1, Math.round(n)) })} suffix="minutes (one plot)" />
                <Num label="+ per extra plot" value={Number(effort.per_plot_pct ?? 35)} max={500} onChange={(n) => setEffort({ per_plot_pct: Math.max(0, n) })} suffix="% more time" />
                <Num label="A rushed piece keeps" value={Math.round(Number(effort.floor ?? 0.15) * 100)} max={100} onChange={(n) => setEffort({ floor: Math.max(0, Math.min(100, n)) / 100 })} suffix="% of its picture score" />
              </div>
              <p className="text-[11px] text-faint">Only time spent actually painting counts (short pauses included), verified against real time between saves — at most 5 minutes per autosave. The score grows with the square root of the time, so the first minutes matter most.</p>
            </div>
            <div className="grid gap-2 rounded-xl border border-line p-2">
              <div className="text-xs font-bold">Originality — repeats earn less</div>
              <div className="flex flex-wrap items-end gap-2">
                {bands.map((b, i) => (
                  <div key={i} className="flex items-end gap-1.5 rounded-xl border border-line p-2" data-testid="originality-band">
                    <Num label="Similarity" value={Math.round(Number(b.sim) * 100)} max={100} onChange={(n) => setBands(bands.map((x, k) => (k === i ? { ...x, sim: Math.max(0, Math.min(100, n)) / 100 } : x)))} suffix="%+" />
                    <Num label="Earns" value={Math.round(Number(b.factor) * 100)} max={100} onChange={(n) => setBands(bands.map((x, k) => (k === i ? { ...x, factor: Math.max(0, Math.min(100, n)) / 100 } : x)))} suffix="% of bonus" />
                    <button className="mb-1.5 rounded-lg p-1.5 text-bad hover:bg-bad/10" onClick={() => setBands(bands.filter((_, k) => k !== i))} aria-label="Remove band"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <Button size="sm" variant="secondary" disabled={bands.length >= 8} onClick={() => setBands([...bands, { sim: 0.7, factor: 0.8 }])}><Plus className="h-4 w-4" /> Band</Button>
              </div>
              <Num label="Art with an uploaded image earns" value={Math.round(Number(v.craft?.imported_factor ?? 0) * 100)} max={100} onChange={(n) => part('craft', { imported_factor: Math.max(0, Math.min(100, n)) / 100 })} suffix="% of the bonus" />
              <p className="text-[11px] text-faint">Every piece is compared with the artist’s other canvases and recent art by others (moved, resized, mirrored and recoloured copies all count as repeats). The highest band reached sets the share paid. Challenge entries at 85%+ similarity are refused.</p>
            </div>
          </div>
        </details>
        <details className="rounded-2xl border border-line p-3">
          <summary className="cursor-pointer font-semibold">Merging plots</summary>
          <div className="mt-3 grid gap-2">
            <Num label="Merging costs" value={Number(v.merge?.ink_per_plot ?? 15)} max={100000} onChange={(n) => part('merge', { ink_per_plot: Math.max(0, Math.round(n)) })} suffix="Ink per plot that joins (0 = free)" />
            <p className="text-[11px] text-faint">Bigger murals earn bigger craft bonuses, so growing a canvas costs Ink for every plot that joins the largest canvas being merged.</p>
          </div>
        </details>
        <details className="rounded-2xl border border-line p-3">
          <summary className="cursor-pointer font-semibold">Featured picks & challenge votes</summary>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Num label="A Featured pick pays" value={Number(v.featured?.ink ?? 25)} max={1000000} onChange={(n) => part('featured', { ink: Math.max(0, Math.round(n)) })} suffix="Ink (once per piece)" />
            <Switch id="challenges-on" checked={!!v.challenges?.enabled} label="Challenges are on" onCheckedChange={(on) => part('challenges', { enabled: on })} />
            <Num label="Votes per player" value={Number(v.challenges?.votes_per_player ?? 3)} min={1} max={50} onChange={(n) => part('challenges', { votes_per_player: Math.round(n) })} />
            <Num label="Account age to vote / earn" value={Number(v.challenges?.min_account_hours ?? 24)} max={8760} onChange={(n) => part('challenges', { min_account_hours: n })} suffix="hours" />
          </div>
        </details>
      </div>
    </Box>
  );
}

type Draft = { id: string | null; title: string; theme: string; starts_at: string; ends_at: string; prizes: string; entry_ink: number };
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const blank = (): Draft => {
  const s = new Date(); s.setMinutes(0, 0, 0);
  return { id: null, title: '', theme: '', starts_at: localInput(s), ends_at: localInput(new Date(s.getTime() + 7 * 864e5)), prizes: '100, 50, 25', entry_ink: 5 };
};

export function ChallengesAdmin() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['admin', 'challenges'], queryFn: api.admin.challenges });
  const [d, setD] = useState<Draft>(blank);
  const save = async () => {
    try {
      const prizes = d.prizes.split(/[\s,]+/).filter(Boolean).map(Number);
      if (prizes.some((x) => !Number.isFinite(x) || x < 0)) throw new Error('Prizes must be Ink amounts, like 100, 50, 25');
      await api.admin.saveChallenge({ id: d.id, title: d.title.trim(), theme: d.theme.trim(), starts_at: new Date(d.starts_at).toISOString(), ends_at: new Date(d.ends_at).toISOString(), prizes, entry_ink: d.entry_ink });
      toast.success(d.id ? 'Challenge updated' : 'Challenge scheduled');
      setD(blank());
      void qc.invalidateQueries({ queryKey: ['admin', 'challenges'] });
      void qc.invalidateQueries({ queryKey: ['challenges'] });
    } catch (e) { toast.error(toGameError(e).message); }
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <Box title={d.id ? 'Edit challenge' : 'New weekly challenge'}>
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs font-semibold text-muted">Theme title<input className={txt} maxLength={60} placeholder="Neon city" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} data-testid="challenge-title" /></label>
          <label className="grid gap-1 text-xs font-semibold text-muted">What to paint<textarea className={cn(txt, 'h-20 py-2')} maxLength={400} placeholder="Glowing streets, signs and skylines at night." value={d.theme} onChange={(e) => setD({ ...d, theme: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs font-semibold text-muted">Starts<input type="datetime-local" className={txt} value={d.starts_at} onChange={(e) => setD({ ...d, starts_at: e.target.value })} /></label>
            <label className="grid gap-1 text-xs font-semibold text-muted">Ends<input type="datetime-local" className={txt} value={d.ends_at} onChange={(e) => setD({ ...d, ends_at: e.target.value })} /></label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs font-semibold text-muted">Prizes (1st, 2nd, 3rd…)<input className={cn(txt, 'w-40')} value={d.prizes} onChange={(e) => setD({ ...d, prizes: e.target.value })} /></label>
            <Num label="Ink for entering" value={d.entry_ink} max={10000} onChange={(n) => setD({ ...d, entry_ink: Math.max(0, Math.round(n)) })} />
          </div>
          <p className="text-[11px] text-faint">Entries must be published after the start. Each player gets a few votes; new accounts can’t vote. The most-voted entries win when it ends, automatically.</p>
          <div className="flex gap-2">
            <Button variant="primary" disabled={d.title.trim().length < 2 || new Date(d.ends_at) <= new Date(d.starts_at)} onClick={() => void save()} data-testid="challenge-save"><Trophy className="h-4 w-4" /> {d.id ? 'Save changes' : 'Schedule challenge'}</Button>
            {d.id && <Button variant="ghost" onClick={() => setD(blank())}>New instead</Button>}
          </div>
        </div>
      </Box>
      <Box title="Challenges">
        {list.isLoading ? <Spinner /> : !(list.data ?? []).length ? <Empty title="No challenges yet">Schedule the first theme on the left.</Empty> : (
          <div className="grid gap-2">
            {(list.data ?? []).map((c: any) => {
              const live = c.status === 'open' && new Date(c.starts_at) <= new Date() && new Date(c.ends_at) > new Date();
              return (
                <div key={c.id} className={cn('rounded-2xl border p-3', live ? 'border-gold/60 bg-gold/5' : 'border-line')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{c.title}</span>
                    <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-bold uppercase">{live ? 'live' : c.status === 'open' ? (new Date(c.starts_at) > new Date() ? 'scheduled' : 'closing') : c.status}</span>
                    <span className="text-xs text-faint tnum">{new Date(c.starts_at).toLocaleDateString()} → {new Date(c.ends_at).toLocaleDateString()} · prizes {(c.prizes as number[]).map(fmt).join('/')} · {c.entries} entries · {c.votes} votes</span>
                    <div className="ml-auto flex gap-1">
                      {c.status === 'open' && <Button size="sm" variant="ghost" onClick={() => setD({ id: c.id, title: c.title, theme: c.theme, starts_at: localInput(new Date(c.starts_at)), ends_at: localInput(new Date(c.ends_at)), prizes: (c.prizes as number[]).join(', '), entry_ink: c.entry_ink })}>Edit</Button>}
                      {c.status === 'open' && <Button size="sm" variant="ghost" onClick={async () => { try { await api.admin.cancelChallenge(c.id); void qc.invalidateQueries({ queryKey: ['admin', 'challenges'] }); } catch (e) { toast.error(toGameError(e).message); } }}>Cancel</Button>}
                    </div>
                  </div>
                  {(c.leaders ?? []).length > 0 && <div className="mt-1 text-xs text-muted">{(c.leaders as any[]).slice(0, 5).map((l, i) => `${l.place ? `#${l.place}` : `${i + 1}.`} “${l.title}” @${l.artist?.username} (${l.votes})`).join(' · ')}</div>}
                  {c.theme && <p className="mt-1 text-xs text-faint">{c.theme}</p>}
                  <p className="text-[10px] text-faint">{timeAgo(c.starts_at)}</p>
                </div>
              );
            })}
          </div>
        )}
      </Box>
    </div>
  );
}

// ---- creative games: Sketch of the Day, painting streaks, Draw & Guess, Duets, Stamps ----
type Field = [key: string, label: string, suffix?: string, max?: number];
const CREATIVE: { part: string; title: string; note: string; fields: Field[] }[] = [
  { part: 'sketch', title: 'Sketch of the Day', note: 'One word a day for everyone; players get a few minutes to sketch it once a day. Votes are anonymous; the top sketches are paid when the day resets (prizes in order, 1st first).',
    fields: [['minutes', 'Time to sketch', 'minutes', 120], ['votes_per_player', 'Votes per player', 'a day', 200], ['min_account_hours', 'Voters’ account age', 'hours', 8760]] },
  { part: 'streak', title: 'Painting streaks', note: 'Each day a player paints at least the minimum (verified painting time) extends their streak. Every day after the first adds to their craft bonus, up to the cap.',
    fields: [['min_minutes', 'Painting needed per day', 'minutes', 600], ['step_pct', 'Bonus per streak day', '%', 100], ['max_pct', 'Bonus cap', '%', 1000]] },
  { part: 'doodle', title: 'Draw & Guess', note: 'Guessers earn more the faster they guess (at least a quarter); drawers earn for each of the first paid guessers. Anonymous both ways.',
    fields: [['draw_seconds', 'Time to draw', 'seconds', 300], ['guess_seconds', 'Time to guess', 'seconds', 300], ['guesser_ink', 'Guesser earns up to', 'Ink', 10000], ['drawer_ink', 'Drawer earns per guesser', 'Ink', 10000], ['max_paid_guessers', 'Paid guessers per drawing', '', 100], ['daily_paid_guesses', 'Paid guesses per player', 'a day', 1000], ['daily_paid_drawings', 'Paid drawings per player', 'a day', 1000], ['min_account_hours', 'Account age to earn', 'hours', 8760]] },
  { part: 'duet', title: 'Duets', note: 'Both painters earn when a duet is finished.',
    fields: [['complete_ink', 'Each painter earns', 'Ink', 10000], ['daily_paid', 'Paid duets per player', 'a day', 1000], ['open_hours', 'A half waits up to', 'hours', 720], ['min_account_hours', 'Account age to earn', 'hours', 8760]] },
  { part: 'stamps', title: 'Stamps', note: 'Collectors pay Ink for a numbered stamp; the artist receives their share (the rest is removed from the game).',
    fields: [['price_ink', 'Price', 'Ink', 100000], ['artist_pct', 'Artist’s share', '%', 100], ['supply', 'Stamps per artwork', '', 100000], ['daily_collects', 'Collects per player', 'a day', 1000], ['artist_daily_cap', 'Artist earns at most', 'Ink a day', 1000000], ['min_account_hours', 'Collectors’ account age', 'hours', 8760]] },
];

export function CreativeSettings({ value, onSave }: { value: any; onSave(v: any): Promise<void> }) {
  const [v, setV] = useState<any>(() => structuredClone(value));
  useEffect(() => setV(structuredClone(value)), [value]);
  const dirty = JSON.stringify(v) !== JSON.stringify(value);
  const part = (k: string, patch: Record<string, unknown>) => setV({ ...v, [k]: { ...(v[k] ?? {}), ...patch } });
  const prizes: number[] = v.sketch?.prizes ?? [];
  return (
    <Box title="Creative games" actions={<div className="flex gap-2">
      {dirty && <Button size="sm" variant="ghost" onClick={() => setV(structuredClone(value))}>Undo</Button>}
      <Button size="sm" variant="primary" disabled={!dirty} onClick={() => void onSave(v)} data-testid="save-creative">Save</Button>
    </div>}>
      <div className="grid gap-4">
        {CREATIVE.map((c) => (
          <details key={c.part} className="rounded-2xl border border-line p-3">
            <summary className="cursor-pointer font-semibold">{c.title}</summary>
            <div className="mt-3 grid gap-3">
              <Switch id={`cr-${c.part}`} checked={!!v[c.part]?.enabled} label={v[c.part]?.enabled ? 'On' : 'Off'} onCheckedChange={(on) => part(c.part, { enabled: on })} />
              <div className="flex flex-wrap items-end gap-3">
                {c.fields.map(([k, label, suffix, max]) => <Num key={k} label={label} value={Number(v[c.part]?.[k] ?? 0)} max={max} onChange={(n) => part(c.part, { [k]: Math.max(0, n) })} suffix={suffix} />)}
              </div>
              {c.part === 'sketch' && (
                <div className="flex flex-wrap items-end gap-2">
                  {prizes.map((p, i) => (
                    <div key={i} className="flex items-end gap-1 rounded-xl border border-line p-1.5">
                      <Num label={`#${i + 1}`} value={Number(p)} max={1000000} onChange={(n) => part('sketch', { prizes: prizes.map((x, k) => (k === i ? Math.max(0, Math.round(n)) : x)) })} suffix="Ink" />
                      <button className="mb-1.5 rounded-lg p-1 text-bad hover:bg-bad/10" onClick={() => part('sketch', { prizes: prizes.filter((_, k) => k !== i) })} aria-label="Remove prize"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <Button size="sm" variant="secondary" disabled={prizes.length >= 25} onClick={() => part('sketch', { prizes: [...prizes, 5] })}><Plus className="h-4 w-4" /> Prize</Button>
                </div>
              )}
              <p className="text-[11px] text-faint">{c.note}</p>
            </div>
          </details>
        ))}
      </div>
    </Box>
  );
}
