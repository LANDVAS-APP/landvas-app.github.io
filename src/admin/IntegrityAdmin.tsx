// Admin → Integrity: the cheat and abuse scanner. Everyone ranked by risk with the patterns behind it; a deep-dive per
// player (linked accounts, invites with their emails and play, who helped them earn, devices, networks); and actions:
// warn, suspend or ban with a preset or custom reason and proof, taking back the Ink gained by abuse and the plots bought
// with it — for one player or a whole linked group. Every action can be undone.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { cn, fmt, timeAgo } from '../lib/utils';
import { Button, Dialog, Empty, PlayerAvatar, Spinner, Switch, inputCls, useConfirm } from '../ui';

const LEVEL: Record<string, { label: string; color: string }> = {
  severe: { label: 'Severe', color: '#FF3D6E' }, high: { label: 'High', color: '#FF8A3D' }, watch: { label: 'Watch', color: '#FFD84D' }, low: { label: 'Low', color: '#3DDC97' },
};
const SEV: Record<string, string> = { severe: '#FF3D6E', high: '#FF8A3D', watch: '#FFD84D' };
const err = (e: unknown) => toast.error(toGameError(e).message);
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }) : '—');

function Score({ score, level }: { score: number; level: string }) {
  const c = LEVEL[level]?.color ?? '#999';
  return (
    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-2xl text-center leading-none" style={{ background: `${c}22`, boxShadow: `inset 0 0 0 1.5px ${c}88` }}>
      <b className="tnum text-base" style={{ color: c }}>{score}</b><span className="text-[8.5px] font-bold uppercase" style={{ color: c }}>{LEVEL[level]?.label ?? level}</span>
    </span>
  );
}
function Status({ s }: { s: string }) {
  if (s === 'active') return null;
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black uppercase', s === 'banned' ? 'bg-hot text-white' : 'bg-[#FF8A3D]/20 text-[#FF8A3D]')}>{s}</span>;
}

export function IntegrityAdmin() {
  const qc = useQueryClient();
  const [level, setLevel] = useState<string | null>('flagged');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [scan, setScan] = useState<{ done: number; total: number } | null>(null);
  const [settings, setSettings] = useState(false);
  const list = useQuery({ queryKey: ['admin', 'integrity', level, q], queryFn: () => api.admin.integrityList(level, q) });
  const counts = list.data?.counts ?? {};
  const scanAll = async () => {
    let next: number | null = 0; let done = 0;
    try {
      while (next !== null) {
        const r: { scanned: number; total: number; next: number | null } = await api.admin.integrityScan(next);
        done += r.scanned; setScan({ done, total: r.total }); next = r.next;
      }
      toast.success(`Scanned ${fmt(done)} players`);
    } catch (e) { err(e); }
    setScan(null); void qc.invalidateQueries({ queryKey: ['admin', 'integrity'] });
  };
  return (
    <div className="grid gap-4" data-testid="integrity-admin">
      <div className="glass grid gap-3 rounded-3xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-display text-lg font-black">🛡️ Integrity scanner</h2>
          <Button size="sm" variant="secondary" onClick={() => setSettings(true)} data-testid="integrity-settings">Reasons & appeal email</Button>
          <Button size="sm" loading={!!scan} onClick={() => void scanAll()} data-testid="integrity-scan">{scan ? `Scanning ${fmt(scan.done)}/${fmt(scan.total)}…` : 'Scan everyone'}</Button>
        </div>
        <p className="text-xs text-muted">Players are rescanned as they play (hourly at most). Scores add up the patterns found; nothing is ever done automatically. Open a player to see the evidence and act.</p>
        <div className="flex flex-wrap gap-1.5">
          {[['flagged', 'Flagged', (counts.watch ?? 0) + (counts.high ?? 0) + (counts.severe ?? 0)], ['severe', 'Severe', counts.severe], ['high', 'High', counts.high], ['watch', 'Watch', counts.watch], ['low', 'Low', counts.low], [null, 'Everyone', null]].map(([k, l, n]) => (
            <button key={String(k)} onClick={() => setLevel(k as string | null)} className={cn('rounded-full px-3 py-1.5 text-xs font-bold', level === k ? 'bg-accent text-white' : 'bg-surface-2')} data-testid={`integrity-filter-${k ?? 'all'}`}>
              {l as string}{n != null ? ` · ${fmt(Number(n))}` : ''}
            </button>
          ))}
          <input className={cn(inputCls, 'h-8 max-w-[14rem] text-xs')} placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {list.isLoading ? <div className="flex justify-center py-10"><Spinner /></div> : !(list.data?.rows ?? []).length ? (
        <Empty title="Nothing here">{level === 'flagged' ? 'No one is flagged. Run “Scan everyone” to check all recent players.' : 'No players at this level.'}</Empty>
      ) : (
        <div className="glass divide-y divide-line overflow-hidden rounded-3xl" data-testid="integrity-rows">
          {list.data.rows.map((r: any) => (
            <button key={r.player.id} onClick={() => setOpen(r.player.id)} className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-surface-2/40" data-testid={`integrity-row-${r.player.username}`}>
              <Score score={r.score} level={r.level} />
              <PlayerAvatar p={r.player} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5"><b className="truncate">@{r.player.username}</b><Status s={r.status} />{r.linked > 0 && <span className="text-[11px] text-muted">· {r.linked} linked</span>}</div>
                <div className="truncate text-[11px] text-faint">{r.email} · joined {day(r.joined)} · active {timeAgo(r.last_active)}</div>
                <div className="mt-1 flex flex-wrap gap-1">{r.top.map((s: any) => <span key={s.key} className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: `${SEV[s.severity] ?? '#888'}22`, color: SEV[s.severity] ?? '#bbb' }}>{s.label}</span>)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && <PlayerIntegrity id={open} onClose={() => setOpen(null)} onOpen={setOpen} />}
      {settings && <IntegritySettings onClose={() => setSettings(false)} />}
    </div>
  );
}

// ---- evidence ---------------------------------------------------------------------------------------------------------
function Evidence({ e }: { e: any }) {
  if (!e || (Array.isArray(e) && !e.length)) return null;
  const items: any[] = Array.isArray(e) ? e : [e];
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {items.slice(0, 12).map((x, i) => (
        <span key={i} className="max-w-full break-all rounded-lg bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-muted">
          {typeof x === 'string' ? x : x.username ? `@${x.username}${x.email ? ` · ${x.email}` : ''}${x.times ? ` · ${x.times}×` : ''}${x.ink ? ` · ${fmt(x.ink)} Ink` : ''}${x.kinds ? ` · ${x.kinds.join(', ')}` : ''}${x.plays != null ? ` · ${x.plays} plays` : ''}`
            : x.game ? `${x.game} lv ${x.level}${x.seconds != null ? ` · ${x.seconds}s (typical ${x.typical_seconds}s)` : ''}${x.flags?.length ? ` · ${x.flags.join(',')}` : ''}`
            : x.country ? `${x.country}: ${x.plots} plots` : JSON.stringify(x)}
        </span>
      ))}
    </div>
  );
}

function Section({ title, children, n }: { title: string; children: React.ReactNode; n?: number }) {
  return (
    <details className="rounded-2xl border border-line p-3" open={n === undefined || n > 0}>
      <summary className="cursor-pointer text-sm font-black">{title}{n !== undefined ? <span className="ml-1 font-normal text-muted">· {n}</span> : null}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

// ---- one player ---------------------------------------------------------------------------------------------------------
function PlayerIntegrity({ id, onClose, onOpen }: { id: string; onClose(): void; onOpen(id: string): void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['admin', 'integrity-player', id], queryFn: () => api.admin.integrityPlayer(id) });
  const cfg = useQuery({ queryKey: ['admin', 'config'], queryFn: api.admin.configGet });
  const d = q.data;
  const presets: { id: string; label: string; text: string }[] = cfg.data?.config?.integrity?.value?.presets ?? [];
  const [proofKeys, setProofKeys] = useState<Set<string>>(new Set());
  const [group, setGroup] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<'warn' | 'suspend' | 'ban'>('suspend');
  const [days, setDays] = useState(7);
  const [preset, setPreset] = useState('');
  const [reason, setReason] = useState('');
  const [proofText, setProofText] = useState('');
  const [scope, setScope] = useState({ referrals: false, linked_help: false, earned_since: false, all: false, plots: true, all_plots_since: false, since: '', extra: '' });
  const [preview, setPreview] = useState<any[] | null>(null);
  const [announce, setAnnounce] = useState(true);
  const [summary, setSummary] = useState('');
  const [summaryEdited, setSummaryEdited] = useState(false);
  // a ready-made chat summary from the action and reason; edit it freely ({name} becomes each player's @name)
  useEffect(() => {
    if (summaryEdited) return;
    const label = presets.find((p) => p.id === preset)?.label?.toLowerCase();
    setSummary(`{name} was ${kind === 'ban' ? 'banned' : `suspended for ${days} day${days === 1 ? '' : 's'}`}${label ? ` for ${label}` : ' for cheating'}.`);
  }, [kind, days, preset, presets, summaryEdited]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPreview(null); }, [scope, group, id]);
  // proof follows the signals you tick (players see it), and you can edit it
  useEffect(() => {
    if (!d) return;
    setProofText(d.signals.filter((s: any) => proofKeys.has(s.key)).map((s: any) => s.label).join('\n'));
  }, [proofKeys, d]);
  const targets = useMemo(() => [id, ...group], [id, group]);
  const takes = scope.referrals || scope.linked_help || scope.earned_since || scope.all || !!Number(scope.extra);
  const scopeArg = takes ? { ...scope, since: scope.since ? new Date(scope.since).toISOString() : null, extra: Number(scope.extra) || null } : {};
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin', 'integrity'] }); void q.refetch(); };
  const doPreview = async () => { try { setPreview(await api.admin.integrityPreview(targets, scopeArg)); } catch (e) { err(e); } };
  const act = async () => {
    const proof = proofText.split('\n').map((s) => s.trim()).filter(Boolean);
    const until = kind === 'suspend' ? new Date(Date.now() + days * 864e5).toISOString() : null;
    const ok = await confirm({ title: `${kind === 'ban' ? 'Ban' : kind === 'suspend' ? `Suspend for ${days} days` : 'Warn'} ${targets.length} player${targets.length === 1 ? '' : 's'}?`,
      body: <>They’ll see: <b>{reason}</b>{takes ? <> — and lose the Ink and plots in the preview.</> : null}{kind !== 'warn' && announce ? <> Everyone on the live feed sees: <b>{summary.replace('{name}', `@${d.player.username}`)}</b></> : null} You can undo this later.</>, confirm: 'Do it', danger: kind !== 'warn' });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.admin.integrityAct(targets, kind, until, preset || null, reason, proof, scopeArg, kind !== 'warn' && announce ? summary : null);
      toast.success(`Done: ${r.results.length} player(s)${takes ? `, ${fmt(r.results.reduce((s: number, x: any) => s + Number(x.ink_removed), 0))} Ink and ${r.results.reduce((s: number, x: any) => s + Number(x.plots_removed), 0)} plots taken` : ''}`);
      setPreview(null); refresh();
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  const undo = async (a: any) => {
    if (!(await confirm({ title: 'Undo this action?', body: `Lifts it${a.ink_removed + a.plots_ink > 0 ? ` and gives back ${fmt(a.ink_removed + a.plots_ink)} Ink (incl. what removed plots cost — the plots themselves stay released)` : ''}.`, confirm: 'Undo' }))) return;
    try { const r = await api.admin.integrityUndo(a.id); toast.success(`Undone · ${fmt(r.ink_returned)} Ink returned`); refresh(); } catch (e) { err(e); }
  };
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, k: string) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); setter(n); };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} wide title={d ? <span className="flex items-center gap-2"><Score score={d.score} level={d.level} /> @{d.player.username}</span> : 'Loading…'}
      description={d ? `${d.email} · ${d.account.status}${d.account.until ? ` until ${day(d.account.until)}` : ''} · joined ${day(d.account.joined)} · ${fmt(d.balances.ink)} Ink · ${fmt(d.plots)} plots · ${d.account.strikes} strikes` : undefined}>
      {!d ? <div className="flex justify-center py-10"><Spinner /></div> : (
        <div className="grid min-w-0 gap-3 overflow-x-hidden text-sm" data-testid="integrity-player">
          <Section title="Patterns found" n={d.signals.length}>
            {!d.signals.length ? <p className="text-muted">Nothing suspicious.</p> : (
              <div className="grid gap-2">
                {d.signals.map((s: any) => (
                  <label key={s.key} className="flex cursor-pointer gap-2 rounded-xl p-2 hover:bg-surface-2/40" style={{ boxShadow: `inset 3px 0 0 ${SEV[s.severity] ?? '#888'}` }} data-testid={`signal-${s.key}`}>
                    <input type="checkbox" checked={proofKeys.has(s.key)} onChange={() => toggle(proofKeys, setProofKeys, s.key)} className="mt-1" aria-label="Use as proof" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2"><b className="min-w-0 break-words">{s.label}</b><span className="shrink-0 text-xs font-bold tnum" style={{ color: SEV[s.severity] }}>+{s.points} · {s.severity}</span></div>
                      <Evidence e={s.evidence} />
                    </div>
                  </label>
                ))}
                <p className="text-[11px] text-faint">Tick a pattern to add it to the proof the player will see.</p>
              </div>
            )}
          </Section>

          <Section title="Linked accounts (same device, fingerprint, address or network)" n={d.linked.length}>
            <div className="grid gap-1">
              {d.linked.map((l: any) => (
                <div key={l.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <input type="checkbox" checked={group.has(l.id)} onChange={() => toggle(group, setGroup, l.id)} aria-label="Include in action" data-testid={`group-${l.username}`} />
                  <button className="font-bold text-accent-2 hover:underline" onClick={() => onOpen(l.id)}>@{l.username}</button>
                  <span className="min-w-0 break-all text-muted">{l.email}</span>
                  <span className="flex gap-1">{(l.via ?? []).map((v: string) => <span key={v} className="rounded bg-surface-2 px-1 text-[10px]">{v}</span>)}</span>
                  <Status s={l.status} />
                  {l.score != null && <span className="ml-auto font-bold tnum" style={{ color: LEVEL[l.level]?.color }}>{l.score}</span>}
                </div>
              ))}
              {d.linked.length > 0 && <p className="mt-1 text-[11px] text-faint">Tick accounts to give them the same action below.</p>}
            </div>
          </Section>

          <Section title="Their invites — every invited account, most suspicious first" n={(d.referrals ?? []).length}>
            <div className="grid gap-2 text-xs" data-testid="integrity-referrals">
              {(d.referrals ?? []).map((r: any) => {
                const c = r.suspicion >= 70 ? '#FF3D6E' : r.suspicion >= 50 ? '#FF8A3D' : r.suspicion >= 25 ? '#FFD84D' : '#3DDC97';
                const help = Object.entries(r.help ?? {});
                return (
                  <div key={r.id ?? r.username} className="rounded-xl bg-surface-2/50 p-2.5" style={{ boxShadow: `inset 3px 0 0 ${c}` }} data-testid={`referee-${r.username}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <button className="font-bold text-accent-2 hover:underline" onClick={() => r.id && onOpen(r.id)}>@{r.username}</button>
                      <span className="min-w-0 break-all text-muted">{r.email}</span><Status s={r.account} />
                      <span className="ml-auto shrink-0 font-black tnum" style={{ color: c }}>{r.suspicion}% alt</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${r.suspicion}%`, background: c }} /></div>
                    <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-faint sm:grid-cols-4">
                      <span>joined {day(r.joined)}{r.minutes_after_previous != null && r.minutes_after_previous < 120 ? ` (${r.minutes_after_previous} min after the last)` : ''}</span>
                      <span>{r.plays} plays · {r.wins} wins</span><span>{fmt(r.ink_earned)} Ink earned · {fmt(r.ink_spent)} spent</span>
                      <span>{r.plots} plots · {r.active_days} active days</span>
                      <span>active {timeAgo(r.last_active)}</span><span>invite: {r.status}{r.reward_ink ? ` (${r.reward_ink} Ink)` : ''}</span>
                      {r.linked_via && <b className="text-hot">same {r.linked_via.replace(/\+/g, ', ')}</b>}{r.dormant && <b className="text-[#FF8A3D]">stopped after the bonus</b>}
                    </div>
                    {r.email_flags?.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{r.email_flags.map((f: string) => <span key={f} className="rounded bg-[#FF8A3D]/15 px-1.5 text-[10.5px] font-bold text-[#FF8A3D]">✉️ {f}</span>)}</div>}
                    {help.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{help.map(([k, n]) => <span key={k} className="rounded bg-hot/15 px-1.5 text-[10.5px] font-bold text-hot">→ inviter: {String(n)} {k}</span>)}</div>}
                    {r.reasons?.length > 0 && <div className="mt-1 text-[10.5px] text-muted">{r.reasons.join(' · ')}</div>}
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Who helped them earn (90 days)" n={d.inflows.length}>
            <div className="grid gap-1 text-xs">
              {d.inflows.map((f: any) => (
                <div key={f.id} className="flex flex-wrap items-center gap-2">
                  <button className={cn('font-bold hover:underline', f.linked ? 'text-hot' : 'text-accent-2')} onClick={() => onOpen(f.id)}>@{f.username}</button>
                  <span className="text-muted">{f.kinds.join(', ')}</span><span className="ml-auto tnum">{f.times}× · {fmt(f.ink)} Ink</span>{f.linked && <b className="text-hot">linked</b>}
                </div>
              ))}
            </div>
          </Section>

          <Section title="Devices" n={d.devices.length}>
            <div className="grid gap-1.5 text-xs">
              {d.devices.map((v: any, i: number) => (
                <div key={i} className="rounded-xl bg-surface-2/50 p-2">
                  <div className="flex flex-wrap items-center gap-2"><b>{v.platform ?? '?'}</b><span className="text-muted">device {v.device} · print {v.fingerprint}</span>
                    {v.shared_with > 0 && <b className="text-hot">shared with {v.shared_with}</b>}{v.emulator && <b className="text-[#FF8A3D]">emulator</b>}{v.automation && <b className="text-hot">automation</b>}
                    <span className="ml-auto text-faint">{day(v.first)}–{day(v.last)} · {v.hits}×</span></div>
                  <div className="break-all text-faint">{v.ua}</div>
                  {(v.gpu || v.tz) && <div className="break-all text-faint">{v.gpu} {v.tz ? `· ${v.tz}` : ''}</div>}
                  {v.reasons?.length > 0 && <div className="break-all text-[#FF8A3D]">{v.reasons.join(' · ')}</div>}
                </div>
              ))}
            </div>
          </Section>

          <Section title="Networks (addresses are stored only as hashes)" n={d.networks.length}>
            <div className="grid gap-1 text-xs">
              {d.networks.map((n: any) => (
                <div key={n.ip} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-muted">#{n.ip}</span><b>{n.country ?? '??'}</b><span className="truncate text-muted">{n.provider ?? 'unknown provider'}</span>
                  {n.vpn && <b className="text-[#FF8A3D]">VPN</b>}{n.proxy && <b className="text-[#FF8A3D]">proxy</b>}{n.tor && <b className="text-hot">Tor</b>}{n.datacenter && <b className="text-[#FF8A3D]">datacenter</b>}{n.mobile && <span className="text-faint">mobile</span>}
                  {n.shared_with > 0 && <b className="text-[#FFD84D]">shared with {n.shared_with}</b>}
                  <span className="ml-auto text-faint">{day(n.first)}–{day(n.last)} · {n.hits}×</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Plots by country · Ink sources (30 days)">
            <div className="flex flex-wrap gap-1 text-xs">{d.plot_countries.map((c: any) => <span key={c.country} className="rounded bg-surface-2 px-1.5">{c.country}: {c.plots}</span>)}</div>
            <div className="mt-2 flex flex-wrap gap-1 text-xs">{Object.entries(d.ink_sources ?? {}).map(([k, v]) => <span key={k} className="rounded bg-surface-2 px-1.5">{k}: {fmt(Number(v))}</span>)}</div>
          </Section>

          {d.actions.length > 0 && (
            <Section title="History" n={d.actions.length}>
              <div className="grid gap-1.5 text-xs">
                {d.actions.map((a: any) => (
                  <div key={a.id} className={cn('flex flex-wrap items-center gap-2', a.undone_at && 'opacity-50')}>
                    <b className="uppercase">{a.kind}</b><span>{a.reason}</span>
                    <span className="text-faint">{day(a.at)} by @{a.by}{a.ink_removed ? ` · −${fmt(a.ink_removed)} Ink` : ''}{a.plots_removed ? ` · −${a.plots_removed} plots` : ''}</span>
                    {a.undone_at ? <span className="ml-auto text-faint">undone</span> : <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void undo(a)} data-testid={`undo-${a.id}`}>Undo</Button>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          <div className="grid gap-3 rounded-2xl border border-hot/40 p-3" data-testid="integrity-action">
            <div className="font-black">Take action{group.size ? ` · ${group.size + 1} accounts` : ''}</div>
            <div className="flex flex-wrap gap-1.5">
              {(['warn', 'suspend', 'ban'] as const).map((k) => <button key={k} onClick={() => setKind(k)} className={cn('rounded-full px-3 py-1.5 text-xs font-bold capitalize', kind === k ? (k === 'ban' ? 'bg-hot text-white' : 'bg-accent text-white') : 'bg-surface-2')} data-testid={`kind-${k}`}>{k}</button>)}
              {kind === 'suspend' && <label className="flex items-center gap-1 text-xs">for <input type="number" min={1} max={3650} className={cn(inputCls, 'h-8 w-20 text-xs')} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))} /> days</label>}
            </div>
            <div className="grid gap-1.5">
              <select className={cn(inputCls, 'h-9 text-sm')} value={preset} onChange={(e) => { setPreset(e.target.value); const p = presets.find((x) => x.id === e.target.value); if (p?.text) setReason(p.text); }} data-testid="preset">
                <option value="">Choose a reason…</option>
                {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <textarea className={cn(inputCls, 'h-20 py-2 text-sm')} placeholder="The reason they’ll see" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="reason" />
              <textarea className={cn(inputCls, 'h-20 py-2 text-xs')} placeholder="Proof they’ll see, one point per line (tick patterns above to fill this)" value={proofText} onChange={(e) => setProofText(e.target.value)} data-testid="proof" />
            </div>
            <div className="grid gap-1 rounded-xl bg-surface-2/40 p-2.5">
              <div className="text-xs font-bold">Take back Ink (and the plots bought with it)</div>
              <Switch id="sc-ref" label="All invite Ink (bonuses and shares)" checked={scope.referrals} onCheckedChange={(v) => setScope({ ...scope, referrals: v })} />
              <Switch id="sc-linked" label="Ink linked accounts helped them earn" checked={scope.linked_help} onCheckedChange={(v) => setScope({ ...scope, linked_help: v })} />
              <div className="flex flex-wrap items-center gap-2">
                <Switch id="sc-since" label="Everything else earned since" checked={scope.earned_since} onCheckedChange={(v) => setScope({ ...scope, earned_since: v })} />
                <input type="date" className={cn(inputCls, 'h-8 w-40 text-xs')} value={scope.since} onChange={(e) => setScope({ ...scope, since: e.target.value })} aria-label="Since" />
              </div>
              <Switch id="sc-all" label="All of it (their whole balance and every plot bought)" checked={scope.all} onCheckedChange={(v) => setScope({ ...scope, all: v })} />
              <label className="flex items-center gap-2 text-xs">Plus a set amount <input type="number" min={0} className={cn(inputCls, 'h-8 w-28 text-xs')} value={scope.extra} onChange={(e) => setScope({ ...scope, extra: e.target.value })} /> Ink</label>
              <Switch id="sc-plots" label="Also take plots bought with Ink they’ve already spent" checked={scope.plots} onCheckedChange={(v) => setScope({ ...scope, plots: v })} />
              <Switch id="sc-allplots" label="Take every plot bought since the date above" checked={scope.all_plots_since} onCheckedChange={(v) => setScope({ ...scope, all_plots_since: v })} />
            </div>
            {kind !== 'warn' && (
              <div className="grid gap-1.5 rounded-xl border-2 border-[#FF3D6E]/60 bg-[#FF3D6E]/5 p-2.5" data-testid="announce-box">
                <Switch id="announce" label="Announce it on the live feed" hint="A red notice everyone sees, also listed under Social → Banned. Undoing the action takes it down." checked={announce} onCheckedChange={setAnnounce} />
                {announce && <>
                  <textarea className={cn(inputCls, 'h-16 py-2 text-sm')} maxLength={300} value={summary} onChange={(e) => { setSummary(e.target.value); setSummaryEdited(true); }} data-testid="announce-text" />
                  <div className="text-[11px] text-faint">Shown as: <b className="text-fg">{summary.replace('{name}', `@${d.player.username}`)}</b>{group.size ? ' (each linked account gets its own, with its name)' : ''}{summaryEdited && <button className="ml-2 font-bold text-accent-2" onClick={() => setSummaryEdited(false)}>reset</button>}</div>
                </>}
              </div>
            )}
            {takes && <Button size="sm" variant="secondary" onClick={() => void doPreview()} data-testid="preview">Preview what gets taken</Button>}
            {preview && (
              <div className="grid gap-1 rounded-xl bg-surface-2/50 p-2.5 text-xs" data-testid="preview-result">
                {preview.map((p: any) => (
                  <div key={p.player.id}><b>@{p.player.username}</b>: {fmt(p.plan.target)} Ink to take — {fmt(p.plan.take)} from their balance of {fmt(p.plan.balance)}, and {p.plan.plots.length} plot{p.plan.plots.length === 1 ? '' : 's'} ({fmt(p.plan.plots_ink)} Ink){p.plan.uncovered > 0 ? `; ${fmt(p.plan.uncovered)} Ink already spent elsewhere` : ''}.</div>
                ))}
              </div>
            )}
            <Button variant={kind === 'warn' ? 'primary' : 'danger'} disabled={busy || reason.trim().length < 4 || (takes && !preview)} loading={busy} onClick={() => void act()} data-testid="act">
              {kind === 'ban' ? 'Ban' : kind === 'suspend' ? `Suspend ${days} days` : 'Warn'}{group.size ? ` ${group.size + 1} accounts` : ''}{takes ? ' and take it back' : ''}
            </Button>
            {takes && !preview && <p className="-mt-2 text-[11px] text-faint">Preview first, so you know exactly what gets taken.</p>}
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ---- settings: appeal email, presets, network lookups -----------------------------------------------------------------
function IntegritySettings({ onClose }: { onClose(): void }) {
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ['admin', 'config'], queryFn: api.admin.configGet });
  const v = cfg.data?.config?.integrity?.value;
  const [email, setEmail] = useState(''); const [presets, setPresets] = useState<{ id: string; label: string; text: string }[]>([]); const [lookup, setLookup] = useState(true);
  useEffect(() => { if (v) { setEmail(v.appeal_email ?? ''); setPresets(v.presets ?? []); setLookup(v.ip_lookup !== false); } }, [v]);
  const save = async () => {
    try { await api.admin.configSet('integrity', { ...v, appeal_email: email.trim(), presets: presets.filter((p) => p.label.trim()), ip_lookup: lookup }); toast.success('Saved'); void qc.invalidateQueries({ queryKey: ['admin', 'config'] }); onClose(); } catch (e) { err(e); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Reasons & appeal email" wide>
      {!v ? <Spinner /> : (
        <div className="grid gap-3 text-sm" data-testid="integrity-settings-form">
          <label className="grid gap-1"><span className="text-xs font-bold">Appeal email (shown to banned and suspended players)</span>
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="appeal-email" /></label>
          <Switch id="ip-lookup" label="Look up new addresses for VPN / proxy / Tor / datacenter" hint="Uses ipapi.is (free tier; set IPAPI_KEY on the integrity function for more)" checked={lookup} onCheckedChange={setLookup} />
          <div className="grid gap-2">
            <div className="text-xs font-bold">Reason presets</div>
            {presets.map((p, i) => (
              <div key={i} className="grid gap-1 rounded-xl border border-line p-2">
                <div className="flex gap-2"><input className={cn(inputCls, 'h-8 text-xs')} value={p.label} placeholder="Label" onChange={(e) => setPresets(presets.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <Button size="sm" variant="ghost" onClick={() => setPresets(presets.filter((_, j) => j !== i))}>Remove</Button></div>
                <textarea className={cn(inputCls, 'h-16 py-1.5 text-xs')} value={p.text} placeholder="Text the player sees" onChange={(e) => setPresets(presets.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              </div>
            ))}
            <Button size="sm" variant="secondary" onClick={() => setPresets([...presets, { id: `custom_${Date.now().toString(36)}`, label: '', text: '' }])}>Add a preset</Button>
          </div>
          <Button onClick={() => void save()} data-testid="integrity-settings-save">Save</Button>
        </div>
      )}
    </Dialog>
  );
}
