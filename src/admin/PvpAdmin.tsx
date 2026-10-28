// Admin: bonus rules (minigames and PvP), PvP minigame settings, and a player's
// minigame stats — exactly how they play and how every Ink was earned.
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../backend/api';
import type { BonusRule } from '../backend/types';
import { cn, fmt, plotLabel, timeAgo } from '../lib/utils';
import { bonusText } from '../play/rates';
import { GAME_INFO, type GameId } from '../shared/minigames';
import { PVP_GAMES, PVP_INFO } from '../shared/pvp';
import { Button, Spinner, Switch } from '../ui';

const num = 'h-9 w-20 rounded-lg border border-line bg-surface px-2 text-sm text-fg tnum';
const gameName = (g: string) => GAME_INFO[g as GameId]?.name ?? PVP_INFO[g as keyof typeof PVP_INFO]?.name ?? g;
const secs = (ms: number | null | undefined) => (ms == null ? '—' : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`);
const pctTone = (q: number) => (q >= 90 ? 'bg-ok/20 text-ok' : q >= 70 ? 'bg-accent-2/15 text-accent-2' : q >= 50 ? 'bg-warn/15 text-warn' : 'bg-bad/15 text-bad');

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

// ---- bonus rules -------------------------------------------------------------------------

const TYPES: { id: BonusRule['type']; label: string; hint: string }[] = [
  { id: 'round', label: 'Each round at or above', hint: 'Every cleared round that scores this % or more pays. Add several for tiers — the best matching tier pays per round.' },
  { id: 'all', label: 'Every round at or above', hint: 'Paid once when the player clears the level with every round at this % or more.' },
  { id: 'count', label: 'At least N rounds at or above', hint: 'Paid once when this many cleared rounds reach the %.' },
  { id: 'average', label: 'Average at or above', hint: 'Paid once when the level is cleared and the rounds average this % or more.' },
];

/** Edit a list of bonus rules (performance Ink on top of the normal rewards). */
export function BonusRulesEditor({ rules, onChange, rounds, testid }: { rules: BonusRule[] | undefined; onChange(r: BonusRule[]): void; rounds: number; testid?: string }) {
  const list = Array.isArray(rules) ? rules : [];
  const set = (i: number, patch: Partial<BonusRule>) => onChange(list.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div className="grid gap-2" data-testid={testid}>
      <div className="eyebrow">Performance bonuses</div>
      <p className="text-[11px] text-faint">Extra Ink for playing well. Each round is scored 0–100% by how close to perfect it was (accuracy, match, moves vs par…). Different kinds add up; bonuses get the same multipliers as other Ink.</p>
      {list.map((r, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-2">
          <label className="grid gap-0.5 text-[11px] font-semibold text-muted">Kind
            <select className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-fg" value={r.type} onChange={(e) => set(i, { type: e.target.value as BonusRule['type'], ...(e.target.value === 'count' ? { count: r.count ?? Math.min(2, rounds) } : {}) })}>
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          {r.type === 'count' && <Num label="Rounds" value={Number(r.count ?? 1)} min={1} max={10} onChange={(n) => set(i, { count: Math.max(1, Math.min(10, Math.round(n))) })} />}
          <Num label="Quality" value={Number(r.min_pct)} min={0} max={100} onChange={(n) => set(i, { min_pct: Math.max(0, Math.min(100, n)) })} suffix="%" />
          <Num label="Bonus" value={Number(r.ink)} min={0} onChange={(n) => set(i, { ink: Math.max(0, Math.round(n)) })} suffix="Ink" />
          <span className="pb-2 text-[11px] text-faint">{TYPES.find((t) => t.id === r.type)?.hint}</span>
          <button className="mb-1.5 ml-auto rounded-lg p-1.5 text-bad hover:bg-bad/10" onClick={() => onChange(list.filter((_, k) => k !== i))} aria-label="Remove bonus"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => onChange([...list, { type: 'round', min_pct: 90, ink: 1 }])}><Plus className="h-4 w-4" /> Round bonus</Button>
        <Button size="sm" variant="secondary" onClick={() => onChange([...list, { type: 'all', min_pct: 90, ink: 5 }])}><Plus className="h-4 w-4" /> All rounds bonus</Button>
        <Button size="sm" variant="ghost" onClick={() => onChange([...list, { type: 'count', count: Math.min(2, rounds), min_pct: 90, ink: 3 }])}><Plus className="h-4 w-4" /> N rounds</Button>
        <Button size="sm" variant="ghost" onClick={() => onChange([...list, { type: 'average', min_pct: 85, ink: 3 }])}><Plus className="h-4 w-4" /> Average</Button>
      </div>
    </div>
  );
}

// ---- PvP settings -----------------------------------------------------------------------

export function PvpSettings({ value, onSave }: { value: any; onSave(v: any): Promise<void> }) {
  const [v, setV] = useState<any>(() => structuredClone(value));
  useEffect(() => setV(structuredClone(value)), [value]);
  const stats = useQuery({ queryKey: ['admin', 'pvp'], queryFn: api.admin.pvp, refetchInterval: 30_000 });
  const dirty = JSON.stringify(v) !== JSON.stringify(value);
  const setGame = (g: string, patch: Record<string, unknown>) => setV({ ...v, games: { ...v.games, [g]: { ...(v.games?.[g] ?? {}), ...patch } } });
  return (
    <Box title="PvP minigames" actions={<div className="flex gap-2">
      {dirty && <Button size="sm" variant="ghost" onClick={() => setV(structuredClone(value))}>Undo</Button>}
      <Button size="sm" variant="primary" disabled={!dirty} onClick={() => void onSave(v)} data-testid="save-pvp">Save</Button>
    </div>}>
      <Switch id="pvp-on" checked={!!v.enabled} label="PvP is open" hint="Free head-to-head games in rounds. Rivals are anonymous and paired at random; nobody stakes Ink." onCheckedChange={(on) => setV({ ...v, enabled: on })} />
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Num label="Paid matches per player per day" value={Number(v.daily_rewarded_matches ?? 10)} max={1000} onChange={(n) => setV({ ...v, daily_rewarded_matches: Math.round(n) })} />
        <Num label="Quality needed to earn" value={Number(v.min_quality_pct ?? 50)} max={100} onChange={(n) => setV({ ...v, min_quality_pct: n })} suffix="% avg" />
        <Num label="Account age to earn" value={Number(v.min_account_hours ?? 24)} max={8760} onChange={(n) => setV({ ...v, min_account_hours: n })} suffix="hours" />
        <Num label="Same rival again after" value={Number(v.rematch_cooldown_hours ?? 24)} max={720} onChange={(n) => setV({ ...v, rematch_cooldown_hours: n })} suffix="hours" />
        <Num label="Time per round" value={Number(v.round_seconds ?? 90)} min={20} max={600} onChange={(n) => setV({ ...v, round_seconds: Math.round(n) })} suffix="sec" />
        <Num label="A match waits for a rival" value={Number(v.open_hours ?? 48)} min={1} max={720} onChange={(n) => setV({ ...v, open_hours: n })} suffix="hours" />
      </div>
      <p className="mt-2 text-[11px] text-faint">These keep extra accounts from farming Ink: a second account can’t pick its rival, meets the same player at most once per cooldown, must be old enough, and must actually play well — so it earns no more than playing solo would.</p>
      <div className="mt-4 grid gap-2">
        {PVP_GAMES.map((g) => {
          const c = v.games?.[g] ?? {};
          const rounds = Math.max(1, Math.min(7, Number(c.rounds ?? 3)));
          return (
            <details key={g} className="group rounded-2xl border border-line p-3" data-testid={`pvp-cfg-${g}`}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                <span className="font-semibold" style={{ color: PVP_INFO[g].color }}>{PVP_INFO[g].name}</span>
                <span className="text-xs text-faint tnum">{rounds} rounds · win {fmt(Number(c.win_ink ?? 0))} · draw {fmt(Number(c.draw_ink ?? 0))}{(c.bonuses ?? []).length ? ` · ${(c.bonuses as BonusRule[]).map(bonusText).join(', ')}` : ''}</span>
                {c.enabled === false && <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-bold text-faint">OFF</span>}
              </summary>
              <div className="mt-3 grid gap-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex items-center gap-2 pb-2 text-xs font-semibold"><input type="checkbox" checked={c.enabled !== false} onChange={(e) => setGame(g, { enabled: e.target.checked })} /> Playable</label>
                  <Num label="Rounds" value={rounds} min={1} max={7} onChange={(n) => { const r = Math.max(1, Math.min(7, Math.round(n))); setGame(g, { rounds: r, round_win_ink: Array.from({ length: r }, (_, k) => Number(c.round_win_ink?.[k] ?? 0)) }); }} />
                  <Num label="Win pays" value={Number(c.win_ink ?? 0)} onChange={(n) => setGame(g, { win_ink: Math.max(0, Math.round(n)) })} suffix="Ink" />
                  <Num label="Draw pays (each)" value={Number(c.draw_ink ?? 0)} onChange={(n) => setGame(g, { draw_ink: Math.max(0, Math.round(n)) })} suffix="Ink" />
                </div>
                <div>
                  <div className="eyebrow mb-1">Ink for taking each round</div>
                  <p className="mb-2 text-[11px] text-faint">Paid to whoever wins that round, even if they lose the match. 0 = nothing.</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: rounds }, (_, r) => (
                      <Num key={r} label={`Round ${r + 1}`} value={Number(c.round_win_ink?.[r] ?? 0)} onChange={(n) => { const next = Array.from({ length: rounds }, (_, k) => Number(c.round_win_ink?.[k] ?? 0)); next[r] = Math.max(0, Math.round(n)); setGame(g, { round_win_ink: next }); }} />
                    ))}
                  </div>
                </div>
                <BonusRulesEditor rules={c.bonuses} rounds={rounds} onChange={(b) => setGame(g, { bonuses: b })} testid={`pvp-bonus-${g}`} />
              </div>
            </details>
          );
        })}
      </div>
      {stats.data && (
        <div className="mt-4 grid gap-2 text-xs">
          <p className="text-muted tnum">Today: {stats.data.today.matches} matches · {stats.data.today.done} decided · {stats.data.today.waiting} waiting for a rival · {fmt(stats.data.today.ink_paid)} Ink paid</p>
          {(stats.data.frequent_pairs ?? []).length > 0 && (
            <div className="rounded-xl border border-warn/50 bg-warn/5 p-2">
              <div className="mb-1 flex items-center gap-1 font-bold text-warn"><AlertTriangle className="h-4 w-4" /> Players who keep meeting (last 7 days)</div>
              {stats.data.frequent_pairs.map((p: any, i: number) => <div key={i} className="tnum">@{p.a?.username} & @{p.b?.username} · {p.matches} matches · {fmt(p.ink)} Ink</div>)}
            </div>
          )}
          <details>
            <summary className="cursor-pointer font-semibold text-muted">Recent matches (names shown to staff only)</summary>
            <div className="mt-2 grid max-h-64 gap-1 overflow-y-auto scroll-thin">
              {(stats.data.recent ?? []).map((m: any) => (
                <div key={m.id} className="tnum">{timeAgo(m.created_at)} · {gameName(m.game)} · {m.status} · {(m.players ?? []).map((p: any) => `@${p.player?.username} ${p.result ?? ''} ${p.total_score ?? '–'} (${p.avg_quality ?? 0}%) +${p.ink}${p.withheld ? ` [${p.withheld}]` : ''}`).join(' vs ')}</div>
              ))}
            </div>
          </details>
        </div>
      )}
    </Box>
  );
}

// ---- a player's minigame stats -------------------------------------------------------------

export function PlayerMinigameStats({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['admin', 'player-minigames', id], queryFn: () => api.admin.playerMinigames(id) });
  const [open, setOpen] = useState<string | null>(null);
  if (!q.data) return <div className="flex justify-center py-6"><Spinner /></div>;
  const d = q.data;
  const totalIn = (d.ink_sources ?? []).reduce((s: number, x: any) => s + Number(x.total), 0);
  return (
    <div className="grid gap-4" data-testid="admin-player-minigames">
      <Box title="Where their Ink comes from">
        {!(d.ink_sources ?? []).length ? <p className="text-sm text-muted">No Ink earned yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tnum">
              <thead className="text-faint"><tr><th className="py-1">Source</th><th>Today</th><th>7 days</th><th>All time</th><th>Share</th><th>Credits</th></tr></thead>
              <tbody>{d.ink_sources.map((s: any) => (
                <tr key={s.reason} className="border-t border-line"><td className="py-1 font-semibold">{String(s.reason).replace(/_/g, ' ')}</td><td>{fmt(Number(s.today ?? 0))}</td><td>{fmt(Number(s.d7 ?? 0))}</td><td className="font-bold">{fmt(Number(s.total))}</td><td>{totalIn ? Math.round((100 * Number(s.total)) / totalIn) : 0}%</td><td>{s.credits}</td></tr>
              ))}</tbody>
            </table>
            {(d.ink_spent ?? []).length > 0 && <p className="mt-2 text-[11px] text-muted">Spent: {d.ink_spent.map((s: any) => `${String(s.reason).replace(/_/g, ' ')} ${fmt(Number(s.total))}`).join(' · ')}</p>}
          </div>
        )}
      </Box>
      <Box title="Minigames, game by game">
        {!(d.games ?? []).length ? <p className="text-sm text-muted">Hasn’t played yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs tnum">
              <thead className="text-faint"><tr><th className="py-1">Game</th><th>Runs</th><th>Cleared</th><th>Top level</th><th>Avg clear</th><th>Fastest</th><th>Avg quality</th><th>Ink (level / rounds / bonus)</th><th>7 days</th><th>Issues</th></tr></thead>
              <tbody>{d.games.map((g: any) => (
                <tr key={g.game} className="border-t border-line">
                  <td className="py-1.5 font-semibold">{gameName(g.game)}</td>
                  <td>{g.plays}</td>
                  <td>{g.levels_cleared} <span className="text-faint">({g.clear_rate ?? 0}%)</span></td>
                  <td>{g.highest_level}</td>
                  <td>{secs(g.avg_clear_ms)}</td>
                  <td>{secs(g.best_clear_ms)}</td>
                  <td>{g.avg_quality != null ? <span className={cn('rounded px-1.5 py-0.5 font-bold', pctTone(Number(g.avg_quality)))}>{g.avg_quality}%</span> : '—'}</td>
                  <td><b>{fmt(Number(g.ink))}</b> <span className="text-faint">({fmt(Number(g.level_ink))} / {fmt(Number(g.round_ink))} / {fmt(Number(g.bonus_ink))})</span>{Number(g.ink_held) > 0 && <span className="text-warn"> +{fmt(Number(g.ink_held))} held</span>}</td>
                  <td>{fmt(Number(g.ink_7d))}</td>
                  <td className={cn((g.flagged || g.rejected) && 'font-bold text-warn')}>{g.flagged ? `${g.flagged} flagged ` : ''}{g.rejected ? `${g.rejected} rejected ` : ''}{g.capped_runs ? `${g.capped_runs} over limit` : ''}{!g.flagged && !g.rejected && !g.capped_runs ? '—' : ''}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Box>
      <Box title={`Recent runs (${(d.sessions ?? []).length})`}>
        <div className="grid max-h-[28rem] gap-1 overflow-y-auto text-xs scroll-thin">
          {(d.sessions ?? []).map((s: any) => {
            const b = s.breakdown ?? {};
            return (
              <div key={s.id} className="rounded-xl border border-line">
                <button className="flex w-full flex-wrap items-center gap-2 px-2 py-1.5 text-left hover:bg-surface-2" onClick={() => setOpen(open === s.id ? null : s.id)}>
                  <span className="w-16 shrink-0 text-faint">{timeAgo(s.started_at)}</span>
                  <span className="font-semibold">{gameName(s.game)} L{s.level}</span>
                  <span className={cn('font-bold', s.passed ? 'text-ok' : s.status === 'rejected' ? 'text-bad' : 'text-muted')}>{s.passed ? 'cleared' : s.status === 'validated' ? 'failed' : s.status}</span>
                  <span className="text-muted">{secs(s.play_ms ?? s.server_ms)}</span>
                  <span className="flex gap-0.5">{(Array.isArray(s.quality) ? s.quality : []).map((x: number, i: number) => <span key={i} className={cn('rounded px-1 font-bold', pctTone(x))}>{x}</span>)}</span>
                  <span className="ml-auto font-bold tnum">{s.ink != null ? `+${fmt(s.ink)} Ink` : '—'}{s.held ? <span className="text-warn"> held</span> : null}</span>
                  {s.review_status === 'flagged' && <span className="rounded bg-warn/20 px-1 font-bold text-warn">FLAGGED</span>}
                </button>
                {open === s.id && (
                  <div className="grid gap-1 border-t border-line px-2 py-2 text-muted">
                    <div>Plot {s.gx != null ? plotLabel(s.gx, s.gy) : '—'} · score {fmt(s.score ?? 0)} · {s.stars ?? 0}★ · {s.rounds ?? '?'} rounds · played {secs(s.play_ms)} (server clock {secs(s.server_ms)}){s.flags?.length ? ` · flags: ${s.flags.join(', ')}` : ''}</div>
                    {s.breakdown && <div className="text-fg">Ink: level {fmt(b.level_ink ?? 0)} + rounds {fmt(b.round_ink ?? 0)} + bonuses {fmt(b.bonus_ink ?? 0)} = <b>{fmt(s.ink ?? 0)}</b> · ×{Number(b.multiplier ?? 1).toFixed(3)} (rarity ×{Number(b.rarity ?? 1).toFixed(2)}, plot level {b.plot_level ?? 1}{Number(b.boost ?? 1) > 1 ? `, boost ×${b.boost}` : ''}){b.capped ? ' · over the daily paid-run limit' : ''}</div>}
                    {(b.bonuses ?? []).length > 0 && <div className="text-gold">Bonuses: {(b.bonuses as any[]).map((h) => h.type === 'round' ? `round ${h.round} at ${h.quality}% +${h.ink}` : h.type === 'average' ? `average ${h.average}% +${h.ink}` : `${h.type} ${h.min_pct}%+ +${h.ink}`).join(' · ')}</div>}
                    {Array.isArray(s.rounds_detail) && <div className="grid gap-0.5">{s.rounds_detail.map((r: any, i: number) => <div key={i} className="tnum">Round {r.round ?? i + 1}: {r.passed ? 'cleared' : 'missed'} · score {fmt(Number(r.score ?? 0))}{r.quality != null ? ` · ${r.quality}%` : ''}{r.accuracy != null ? ` · accuracy ${r.accuracy}%` : ''}{r.match != null ? ` · match ${r.match}%` : ''}{r.moves != null ? ` · ${r.moves} moves (par ${r.par})` : ''}{r.strokes != null ? ` · ${r.strokes} strokes (par ${r.par})` : ''}{r.dE != null ? ` · ΔE ${r.dE}` : ''}{r.ms != null ? ` · ${secs(r.ms)}` : ''}</div>)}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Box>
      <div className="grid gap-4 xl:grid-cols-2">
        <Box title="Plot levels">
          {!(d.plots ?? []).length ? <p className="text-sm text-muted">No plot progress.</p> : (
            <div className="grid max-h-64 gap-1 overflow-y-auto text-xs scroll-thin">
              {d.plots.map((p: any) => <div key={`${p.gx}_${p.gy}`} className="flex justify-between gap-2 tnum"><span className="truncate">{p.name || `Plot ${plotLabel(p.gx, p.gy)}`} · {gameName(p.game)}</span><span className="shrink-0">level {p.highest_level} · {p.wins}/{p.plays} won · best {fmt(p.best_score)}</span></div>)}
            </div>
          )}
        </Box>
        <Box title="PvP">
          {!d.pvp?.record?.matches ? <p className="text-sm text-muted">No PvP matches.</p> : (
            <div className="grid gap-2 text-xs">
              <div className="tnum">{d.pvp.record.matches} matches · {d.pvp.record.won} won · {d.pvp.record.lost} lost · {d.pvp.record.draws} draws · avg quality {d.pvp.record.avg_quality ?? 0}% · <b>{fmt(Number(d.pvp.record.ink))} Ink</b></div>
              {(d.pvp.rivals ?? []).some((r: any) => r.matches >= 3) && <div className="flex items-center gap-1 font-bold text-warn"><AlertTriangle className="h-4 w-4" /> Meets the same rival often — check for a second account.</div>}
              <div className="text-muted">Rivals: {(d.pvp.rivals ?? []).map((r: any) => `@${r.player?.username} ×${r.matches} (won ${r.won})`).join(' · ')}</div>
              <div className="grid max-h-48 gap-0.5 overflow-y-auto scroll-thin">
                {(d.pvp.recent ?? []).map((m: any) => <div key={m.match_id} className="tnum">{timeAgo(m.started_at)} · {gameName(m.game)} · {m.result ?? m.status} vs @{m.rival?.username ?? '—'} · {m.total_score ?? 0}–{m.rival_score ?? '?'} · {m.avg_quality ?? 0}% · +{m.ink}{m.withheld ? ` [${m.withheld}]` : ''}</div>)}
              </div>
            </div>
          )}
        </Box>
      </div>
    </div>
  );
}
