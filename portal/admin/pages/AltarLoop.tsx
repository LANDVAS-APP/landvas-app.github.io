// Admin → Fair play → Altar loop. Players who laid the same cell on the Altar of Luck again (they bought it back with the
// rarity it had, or it was passed round a clan) before the fix of Nov 18, and the tools to take it back:
//   * Luck they still hold: any amount up to what their repeats gave (undoable)
//   * the plots that Luck rolled: down to a lower tier (undoable) or taken away
//   * a share (1–100%) of what those plots earned: Ink from games and USD rent, then plots bought since, the rest owed
// AltarLoopPlayer also shows on a player's profile (Fair play tab).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { toGameError } from '../../../src/backend/backend';
import { Button, PlayerAvatar, useConfirm } from '../../../src/ui';
import { rarityInfo } from '../../../src/shared/rarity';
import { portal, type AltarLoopPlayer as AltarData, type AltarLoopPlot } from '../../shared/api';
import { TimeChart } from '../../shared/charts';
import { DataTable } from '../../shared/table';
import { date, dateTime, int, plotLabel, usd } from '../../shared/format';
import { Badge, Empty, KV, Panel, Q, Rarity, Seg, Stat, statusTone } from '../../shared/ui';
import { Rolls } from './FairPlay';

const err = (e: unknown) => toast.error(toGameError(e).message);
const key = (p: { gx: number; gy: number }) => `${p.gx}_${p.gy}`;
const REASON = 'Altar loop: Luck from laying the same plot on the altar again';

export function AltarLoopScanner() {
  const [sp, setSp] = useSearchParams();
  const [min, setMin] = useState(1);
  const q = useQuery({ queryKey: ['admin', 'altar-loop', min], queryFn: () => portal.altarLoopScan(min) });
  const open = sp.get('player');
  const pick = (id: string | null) => setSp((prev) => { const n = new URLSearchParams(prev); if (id) n.set('player', id); else n.delete('player'); return n; }, { replace: true });
  return (
    <div className="grid gap-3" data-testid="altar-loop">
      <Panel title="🔁 The altar loop" actions={<Seg value={min} onChange={setMin} label="Repeats" options={[{ value: 1, label: 'Any' }, { value: 2, label: '2+' }, { value: 5, label: '5+' }, { value: 20, label: '20+' }]} />}>
        <p className="text-sm text-muted">
          A plot laid on the Altar of Luck went back to the world with its rarity, so buying the same cell back brought the same ultra back to sacrifice again for full Luck
          {q.data ? ` (closed ${dateTime(q.data.fixed_at)})` : ''}. A <b className="text-fg">repeat</b> is a sacrifice of a cell that had been laid on the altar before: their own (bought back)
          or someone else’s (passed round). Open a player to take back the Luck they still hold, fix the plots that Luck rolled, and take back a share of what those plots earned.
        </p>
      </Panel>
      <Q q={q} label="Scanning the altar…">{(d) => d.rows.length ? (
        <Panel pad={false} title={`${int(d.rows.length)} found`}>
          <DataTable rows={d.rows} rowKey={(r) => r.player.id} onRow={(r) => pick(r.player.id)} selected={open} cols={[
            { key: 'player', label: 'Player', render: (r) => (
              <span className="flex items-center gap-2" data-testid={`altar-row-${r.player.username}`}>
                <PlayerAvatar p={r.player} size={26} /><b>@{r.player.username}</b>{r.status !== 'active' && <Badge tone={statusTone(r.status)}>{r.status}</Badge>}
              </span>) },
            { key: 'repeats', label: 'Repeats', num: true, sort: (r) => r.stats.repeats, render: (r) => <b className="text-bad">{int(r.stats.repeats)}</b> },
            { key: 'whose', label: 'Whose plot', render: (r) => (
              <span className="flex flex-wrap gap-1">
                {r.stats.repeats_self > 0 && <Badge tone="bad">{int(r.stats.repeats_self)} their own</Badge>}
                {r.stats.repeats_other > 0 && <Badge tone="warn">{int(r.stats.repeats_other)} someone else’s</Badge>}
              </span>) },
            { key: 'luck', label: 'Luck from repeats', num: true, sort: (r) => r.stats.luck_from_repeats, render: (r) => int(r.stats.luck_from_repeats) },
            { key: 'cells', label: 'Cells', num: true, sort: (r) => r.stats.cells, render: (r) => int(r.stats.cells) },
            { key: 'when', label: 'When', render: (r) => <span className="text-muted">{dateTime(r.stats.first_at)} → {dateTime(r.stats.last_at)}</span> },
            { key: 'rolls', label: 'Plots Luck upgraded', sort: (r) => r.rolls.open, render: (r) => (
              <span className="flex flex-wrap items-center gap-1.5">
                {int(r.rolls.improved)}{r.rolls.ultras > 0 && <span className="text-gold">· {int(r.rolls.ultras)} ultra</span>}
                {r.rolls.open > 0 ? <Badge tone="warn">{int(r.rolls.open)} to fix</Badge> : r.rolls.fixed > 0 ? <Badge tone="ok">fixed</Badge> : null}
              </span>) },
          ]} />
        </Panel>
      ) : <Empty title="Nobody found">No player laid a cell on the altar that had been sacrificed before.</Empty>}</Q>
      {open && <AltarLoopPlayer key={open} id={open} onClose={() => pick(null)} />}
    </div>
  );
}

/** one player's altar loop: the numbers, every sacrifice, the Luck they hold, the plots their Luck rolled, what was done */
export function AltarLoopPlayer({ id, onClose, embedded }: { id: string; onClose?(): void; embedded?: boolean }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['admin', 'altar-loop-player', id], queryFn: () => portal.altarLoopPlayer(id) });
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [to, setTo] = useState('own');
  const [reason, setReason] = useState(REASON);
  const [mode, setMode] = useState<'all' | 'extra'>('all');
  const [share, setShare] = useState(100);
  const [luck, setLuck] = useState<number | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const d = q.data;
  const loaded = !!d;
  useEffect(() => { if (!embedded && loaded) top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [embedded, loaded]);
  // picked to start with: plots Luck upgraded right after a repeat that are still theirs and not dealt with yet
  useEffect(() => { if (d && sel === null) setSel(new Set(d.plots.filter((p) => p.in_window && p.improved && p.from_repeat && p.theirs && !p.fix).map(key))); }, [d, sel]);
  useEffect(() => { if (d && luck === null) setLuck(d.luck.can_take); }, [d, luck]);
  const loopPlots = useMemo(() => (d?.plots ?? []).filter((p) => p.in_window && p.improved), [d]);
  useEffect(() => { setPreview(null); }, [mode, share, id]);
  if (q.isLoading || q.error || !d) return <Q q={q} label="Loading the altar loop…">{() => null}</Q>;
  if (embedded && d.stats.repeats === 0) return null;
  const s = d.stats;
  const chosen = d.plots.filter((p) => sel?.has(key(p)));
  const save = (r: AltarData) => {
    qc.setQueryData(['admin', 'altar-loop-player', id], r);
    for (const k of [['admin', 'altar-loop'], ['admin', 'egg-loop-player', id], ['admin', 'ultras'], ['admin', 'player-ultras', id], ['portal', 'player', id], ['admin', 'integrity-player', id]]) void qc.invalidateQueries({ queryKey: k });
  };
  const toggle = (p: AltarLoopPlot) => setSel((prev) => { const n = new Set(prev ?? []); if (n.has(key(p))) n.delete(key(p)); else n.add(key(p)); return n; });
  const takeLuck = async () => {
    const n = Math.max(0, Math.floor(luck ?? 0));
    if (n < 1) { toast.error('Pick how much Luck to take back.'); return; }
    if (!(await confirm({ title: `Take ${int(Math.min(n, d.luck.can_take))} Luck from @${d.player.username}?`, body: `They hold ${int(d.luck.now)}; their repeats gave ${int(d.luck.from_repeats)}${d.luck.taken ? ` and ${int(d.luck.taken)} was taken back already` : ''}. You can give it back.`, confirm: 'Take it back', danger: true }))) return;
    setBusy('luck');
    try { const r = await portal.altarLoopTakeLuck(id, n, reason); save(r); setLuck(r.luck.can_take); toast.success(`${int(r.taken)} Luck taken back`); } catch (e) { err(e); } finally { setBusy(null); }
  };
  const fix = async (action: 'downgrade' | 'take') => {
    const list = chosen.filter((p) => p.theirs);
    if (!list.length) { toast.error('Pick plots that are still theirs.'); return; }
    const ok = await confirm({
      title: action === 'take' ? `Take ${list.length} plot${list.length === 1 ? '' : 's'} away from @${d.player.username}?` : `Put ${list.length} plot${list.length === 1 ? '' : 's'} back to ${to === 'own' ? 'their own roll' : rarityInfo(to).name}?`,
      body: action === 'take' ? 'They go back to the world at the cell’s own rarity. This can’t be undone.' : 'A shine Luck gave goes too. Rent is settled first. You can undo a downgrade.',
      confirm: action === 'take' ? 'Take them away' : 'Put them back', danger: action === 'take',
    });
    if (!ok) return;
    setBusy(action);
    try {
      const r = await portal.altarLoopFix(id, list.map((p) => ({ gx: p.gx, gy: p.gy, action, rarity: action === 'downgrade' && to !== 'own' ? to : null })), reason);
      save(r); setSel(new Set()); setPreview(null);
      const skipped = r.results.filter((x) => !x.ok);
      toast.success(`${r.done} plot${r.done === 1 ? '' : 's'} ${action === 'take' ? 'taken away' : 'put back'}`, { description: skipped.length ? `${skipped.length} skipped (${[...new Set(skipped.map((x) => x.why === 'not_lower' ? 'already that tier or lower' : 'not theirs any more'))].join(', ')})` : undefined });
    } catch (e) { err(e); } finally { setBusy(null); }
  };
  const plotsFor = () => loopPlots.map((p) => ({ gx: p.gx, gy: p.gy }));
  const runPreview = async () => {
    setBusy('preview');
    try { setPreview(await portal.altarLoopReverse(id, plotsFor(), mode, share, reason, true)); } catch (e) { err(e); } finally { setBusy(null); }
  };
  const reverse = async () => {
    const ok = await confirm({ title: `Take back ${share}% of what @${d.player.username}'s Luck plots earned?`,
      body: <>About {int(preview?.ink_target ?? 0)} Ink in all: {int(preview?.ink_taken ?? 0)} from their balance, {int(preview?.plots?.length ?? 0)} plot{preview?.plots?.length === 1 ? '' : 's'} they bought since, {int(preview?.debt ?? 0)} owed from what they earn next, and {usd(preview?.usd_taken ?? 0)} from their USD balance. You can undo it (plots taken don’t come back, their cost does as Ink).</>,
      confirm: 'Take it back', danger: true });
    if (!ok) return;
    setBusy('reverse');
    try {
      const r = await portal.altarLoopReverse(id, plotsFor(), mode, share, reason, false);
      save(r); setPreview(null);
      toast.success('Taken back', { description: `${int(r.reversal.ink_taken)} Ink, ${int(r.reversal.plots.length)} plot${r.reversal.plots.length === 1 ? '' : 's'}, ${usd(r.reversal.usd_taken)}${r.reversal.debt ? `, ${int(r.reversal.debt)} Ink owed` : ''}` });
    } catch (e) { err(e); } finally { setBusy(null); }
  };
  const undoFix = async (fixId: number) => { try { save(await portal.altarLoopUndo(fixId)); toast.success('Put back as it was'); } catch (e) { err(e); } };
  const undoLuck = async (takeId: number) => { try { const r = await portal.altarLoopLuckUndo(takeId); save(r); setLuck(r.luck.can_take); toast.success('Luck given back'); } catch (e) { err(e); } };
  const undoRev = async (revId: number) => {
    if (!(await confirm({ title: 'Undo this take-back?', body: 'The Ink, the USD and what the plots cost (as Ink) go back to them, and the debt it added is cleared. Plots taken stay in the world.', confirm: 'Undo it' }))) return;
    try { const r = await portal.altarLoopReverseUndo(revId); save(r); toast.success(`${int(r.ink_returned)} Ink and ${usd(r.usd_returned)} returned`); } catch (e) { err(e); }
  };
  const lower = d.tiers.filter((t) => !t.ultra);
  const done = [
    ...d.reversals.map((r) => ({ ...r, kind: 'reverse' as const })),
    ...d.fixes.map((f) => ({ ...f, kind: 'fix' as const })),
    ...d.luck_takes.map((t) => ({ ...t, kind: 'luck' as const })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div ref={top} className="grid scroll-mt-4 gap-3" data-testid="altar-loop-player">
      {!embedded && (
        <div className="flex flex-wrap items-center gap-3">
          <PlayerAvatar p={d.player} size={44} />
          <div className="min-w-0 flex-1">
            <Link to={`/players/${id}`} className="text-lg font-bold hover:underline">@{d.player.username}</Link>
            <div className="truncate text-xs text-muted">{d.email}</div>
          </div>
          {onClose && <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>}
        </div>
      )}
      {embedded && <h3 className="text-base font-bold">🔁 Altar loop</h3>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Repeats" value={int(s.repeats)} tone={s.repeats > 0 ? 'bad' : 'ok'} sub={`${int(s.repeats_self)} their own plot · ${int(s.repeats_other)} someone else’s · ${int(s.cells)} cell${s.cells === 1 ? '' : 's'}`} />
        <Stat label="Luck from repeats" value={int(s.luck_from_repeats)} sub={`of ${int(s.luck_from_plots)} from all ${int(s.sacrificed)} plots sacrificed`} />
        <Stat label="Luck they hold" value={int(d.luck.now)} tone={d.luck.can_take > 0 ? 'gold' : undefined} sub={d.luck.taken ? `${int(d.luck.taken)} taken back already` : `up to ${int(d.luck.can_take)} can be taken back`} />
        <Stat label="Plots Luck upgraded" value={int(loopPlots.length)} tone="gold" sub={s.first_at ? `since ${dateTime(s.first_at)} · ${int(loopPlots.filter((p) => p.ultra).length)} ultra` : 'no repeats'} />
        <Stat label="Ink they owe" value={int(d.owed)} tone={d.owed > 0 ? 'bad' : undefined} sub="taken from what they earn next" />
      </div>
      {d.days.length > 1 && (
        <Panel title="Repeats, day by day">
          <TimeChart type="bar" x={d.days.map((x) => x.day)} series={[{ name: 'Repeats', values: d.days.map((x) => x.repeats) }]} height={150} />
        </Panel>
      )}
      <Panel title={`Every plot they laid on the altar · ${int(d.sacrifices.length)}`} pad={false}>
        <DataTable rows={[...d.sacrifices].reverse()} rowKey={(x) => `${key(x)}-${x.at}`} cols={[
          { key: 'at', label: 'When', render: (x) => dateTime(x.at) },
          { key: 'cell', label: 'Plot', render: (x) => <span className="tnum">{plotLabel(x.gx, x.gy)}</span> },
          { key: 'rarity', label: 'It was', render: (x) => <Rarity id={x.rarity} shiny={x.shiny} /> },
          { key: 'luck', label: 'Luck', num: true, render: (x) => int(x.gained) },
          { key: 'repeat', label: 'Laid there before?', render: (x) => !x.repeat ? <span className="text-faint">first time</span>
            : x.after_self ? <Badge tone="bad">again: theirs, {dateTime(x.after_at)}</Badge>
            : <Badge tone="warn">after @{x.after?.username ?? '?'}, {dateTime(x.after_at)}</Badge> },
        ]} />
      </Panel>
      {d.can_fix && (d.luck.now > 0 || d.luck.taken > 0) && (
        <Panel title="Take back Luck they still hold">
          <p className="text-sm text-muted">
            They hold {int(d.luck.now)} Luck; their repeats gave {int(d.luck.from_repeats)}{d.luck.taken ? `, and ${int(d.luck.taken)} was taken back already` : ''}. Any amount up to {int(d.luck.can_take)} can come
            off now. Luck they already spent went into the plots below.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">Luck
              <input type="number" className="p-input h-9 w-28" min={1} max={d.luck.can_take} value={luck ?? 0} onChange={(e) => setLuck(Number(e.target.value))} data-testid="altar-luck-amount" />
            </label>
            <button className="p-chip" onClick={() => setLuck(d.luck.can_take)}>All of it</button>
            <button className="p-chip" onClick={() => setLuck(Math.floor(d.luck.can_take / 2))}>Half</button>
            <Button size="sm" variant="danger" loading={busy === 'luck'} disabled={!!busy || d.luck.can_take < 1} onClick={() => void takeLuck()} data-testid="altar-luck-take">Take back Luck</Button>
          </div>
        </Panel>
      )}
      <Panel title={`Every plot they claimed with Luck · ${int(d.plots.length)}`} pad={false}
        actions={d.plots.length > 0 && <span className="text-xs text-muted">{int(chosen.length)} picked</span>}>
        <DataTable rows={d.plots} rowKey={key} onRow={toggle} cols={[
          { key: 'plot', label: 'Plot', render: (p) => (
            <span className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={!!sel?.has(key(p))} onChange={() => toggle(p)} onClick={(e) => e.stopPropagation()} data-testid={`altar-pick-${key(p)}`} aria-label={`Pick plot ${plotLabel(p.gx, p.gy)}`} />
              <span className="min-w-0">{p.name ?? <span className="tnum">{plotLabel(p.gx, p.gy)}</span>}</span>
            </span>) },
          { key: 'rolled', label: 'Rolled', sort: (p) => p.rolled_at, render: (p) => (
            <span className="flex flex-wrap items-center gap-1">{dateTime(p.rolled_at)}
              {!p.in_window ? <Badge>before the loop</Badge> : p.from_repeat ? <Badge tone="bad">right after a repeat</Badge> : null}
            </span>) },
          { key: 'rolls', label: 'Luck’s rolls (kept in colour)', render: (p) => <Rolls p={p} /> },
          { key: 'own', label: 'Its own roll', render: (p) => <Rarity id={p.own} shiny={p.own_shiny} /> },
          { key: 'now', label: 'Now', render: (p) => p.theirs && p.rarity ? <Rarity id={p.rarity} shiny={p.shiny} /> : <span className="text-muted">not theirs any more</span> },
          { key: 'fix', label: 'Done', render: (p) => p.fix ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge tone="ok">{p.fix.action === 'take' ? 'taken away' : `${rarityInfo(p.fix.from).name} → ${rarityInfo(p.fix.to ?? '').name}`}</Badge>
              {p.fix.action === 'downgrade' && d.can_fix && <button className="text-xs text-accent-2 hover:underline" onClick={(e) => { e.stopPropagation(); void undoFix(p.fix!.id); }}>Undo</button>}
            </span>) : p.improved && p.in_window ? <Badge tone="warn">to fix</Badge> : <span className="text-faint">—</span> },
        ]} empty={<Empty title="No Luck claims">They never claimed a plot with Luck.</Empty>} />
        {d.can_fix && d.plots.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
            <span className="text-sm text-muted">{int(chosen.length)} picked</span>
            <button className="p-chip" onClick={() => setSel(new Set(loopPlots.filter((p) => p.theirs && p.from_repeat).map(key)))}>Right after a repeat</button>
            <button className="p-chip" onClick={() => setSel(new Set(loopPlots.filter((p) => p.theirs).map(key)))}>All since the first repeat</button>
            <button className="p-chip" onClick={() => setSel(new Set())}>None</button>
            <span className="mx-1 h-5 w-px bg-line" />
            <label className="flex items-center gap-2 text-sm">Down to
              <select className="p-input h-9" value={to} onChange={(e) => setTo(e.target.value)} data-testid="altar-to">
                <option value="own">Their own roll (before Luck)</option>
                {lower.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <Button size="sm" loading={busy === 'downgrade'} disabled={!chosen.length || !!busy} onClick={() => void fix('downgrade')} data-testid="altar-downgrade">Put back to a lower tier</Button>
            {d.can_take && <Button size="sm" variant="danger" loading={busy === 'take'} disabled={!chosen.length || !!busy} onClick={() => void fix('take')} data-testid="altar-take">Take away</Button>}
          </div>
        )}
      </Panel>
      {d.can_fix && loopPlots.length > 0 && (
        <Panel title="Take back what those plots earned" actions={<Seg value={mode} onChange={setMode} label="What to take back" options={[{ value: 'all', label: 'Everything they earned' }, { value: 'extra', label: 'Only what Luck added' }]} />}>
          <p className="text-sm text-muted">
            The {int(loopPlots.length)} plot{loopPlots.length === 1 ? '' : 's'} Luck upgraded since the first repeat: Ink from games played on them and their USD rent (an estimate from their rate and how long
            they had them, boosts included), until each was fixed or left them. Take back all of it or a share. USD comes off their USD balance; USD they’d converted, held or cashed out comes back as Ink.
            Ink comes off their balance, then the plots they bought with Ink since the first repeat (newest first), and the rest is owed from the next Ink they earn.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">Share
              <input type="range" min={1} max={100} value={share} onChange={(e) => setShare(Number(e.target.value))} className="w-36 accent-[var(--accent)]" aria-label="Share to take back" />
              <input type="number" className="p-input h-9 w-20" min={1} max={100} value={share} onChange={(e) => setShare(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} data-testid="altar-share" aria-label="Share in percent" />%
            </label>
            {[25, 50, 100].map((n) => <button key={n} className="p-chip" onClick={() => setShare(n)}>{n}%</button>)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input className="p-input h-9 min-w-[16rem] flex-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (goes in the audit log)" aria-label="Reason" data-testid="altar-reason" />
            <Button size="sm" variant="secondary" loading={busy === 'preview'} disabled={!!busy} onClick={() => void runPreview()} data-testid="altar-preview">Work it out</Button>
          </div>
          {preview && (
            <div className="mt-3 grid gap-3" data-testid="altar-preview-result">
              <KV cols={2} items={[
                ['Ink from games on those plots', `${int(preview.earnings.ink_games)} · ${preview.share}% is ${int(preview.ink_games)}`],
                ['USD rent they earned (estimate)', `${usd(preview.earnings.usd)} · ${preview.share}% is ${usd(preview.usd)}`],
                ['Off their USD balance', usd(preview.usd_taken)],
                ['USD already spent, back as Ink', `${int(preview.usd_as_ink)} Ink (${int(preview.ink_rate)} per $1)`],
                ['Ink to take back', <b key="t">{int(preview.ink_target)}</b>],
                ['Off their Ink balance', `${int(preview.ink_taken)} of ${int(preview.ink_balance)}`],
                ['Plots they bought with it', `${int(preview.plots.length)} · ${int(preview.plots_ink)} Ink`],
                ['Still owed (from what they earn next)', <b key="o" className={preview.debt > 0 ? 'text-bad' : ''}>{int(preview.debt)}</b>],
              ]} />
              {preview.plots.length > 0 && (
                <div className="flex flex-wrap gap-1.5">{preview.plots.map((p: any) => <Badge key={key(p)}><Rarity id={p.rarity} /> {plotLabel(p.gx, p.gy)} · {int(p.ink)} Ink</Badge>)}</div>
              )}
              <div className="flex justify-end">
                <Button variant="danger" loading={busy === 'reverse'} disabled={!!busy || !d.can_take || (preview.ink_target === 0 && Number(preview.usd_taken) === 0)} onClick={() => void reverse()} data-testid="altar-reverse">
                  Take back {preview.share}%
                </Button>
              </div>
              {!d.can_take && <p className="text-xs text-muted">Taking it back needs economy and moderator access (plots bought with it can be taken).</p>}
            </div>
          )}
        </Panel>
      )}
      {done.length > 0 && (
        <Panel title="What’s been done" pad={false}>
          <DataTable rows={done} rowKey={(r: any) => `${r.kind}-${r.id}`} cols={[
            { key: 'at', label: 'When', render: (r: any) => dateTime(r.at) },
            { key: 'what', label: 'What', render: (r: any) => r.kind === 'reverse'
              ? <span>Took back {int(r.ink_taken)} Ink, {int(r.plots_removed.length)} plot{r.plots_removed.length === 1 ? '' : 's'} ({int(r.plots_ink)} Ink), {usd(r.usd_taken)}{r.debt ? `, ${int(r.debt)} Ink owed` : ''} <span className="text-faint">· {r.share}% of {r.mode === 'all' ? 'everything' : 'Luck’s share'} from {int(r.plots)} plots</span></span>
              : r.kind === 'luck' ? <span>Took back {int(r.amount)} Luck</span>
              : <span>{r.action === 'take' ? 'Took away' : 'Put back'} {plotLabel(r.gx, r.gy)}: <Rarity id={r.from} shiny={r.from_shiny} />{r.to && <> → <Rarity id={r.to} shiny={!!r.to_shiny} /></>}</span> },
            { key: 'by', label: 'By', render: (r: any) => (r.by ? `@${r.by}` : '—') },
            { key: 'reason', label: 'Reason', render: (r: any) => <span className="text-muted">{r.reason}</span> },
            { key: 'undo', label: '', render: (r: any) => r.undone_at ? <Badge>undone {date(r.undone_at)}</Badge>
              : !d.can_fix ? null
              : r.kind === 'reverse' ? <Button size="sm" variant="ghost" onClick={() => void undoRev(r.id)}>Undo</Button>
              : r.kind === 'luck' ? <Button size="sm" variant="ghost" onClick={() => void undoLuck(r.id)}>Give back</Button>
              : r.action === 'downgrade' ? <Button size="sm" variant="ghost" onClick={() => void undoFix(r.id)}>Undo</Button> : null },
          ]} />
        </Panel>
      )}
    </div>
  );
}
