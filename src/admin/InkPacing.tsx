// Ink Flow (owner): uncap Ink for everyone and set the daily Ink target the hidden rate is built around. Players only
// ever see what they're paid — no caps, no messages. A live simulation shows what kinds of players would earn.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { cn, fmt } from '../lib/utils';
import { Button, Switch, inputCls, useConfirm } from '../ui';
import { SIM_PLAYERS, simulateDay } from './inkFlowSim';

const ADVANCED: [key: string, label: string, hint: string][] = [
  ['heat_half_min', 'Break restores (minutes)', 'How fast a burst cools: half the heat is gone after this long.'],
  ['load_half_h', 'Long grind memory (hours)', 'How long a long session keeps weighing on the rate.'],
  ['heat_share', 'Burst size (× target)', 'How much Ink a burst can earn before it slows.'],
  ['load_share', 'Session size (× target)', 'How much over many hours before it settles to a trickle.'],
  ['source_share', 'Same-activity size (× target)', 'Repeating one activity cools faster than mixing.'],
  ['day_share', 'Day bend (× target)', 'Past this much in a day the rate falls steeply.'],
  ['day_max_share', 'Day ceiling (× target)', 'Past this, even the 1-Ink floor only comes now and then.'],
  ['ramp_start', 'Session start rate', '0.8 = a session starts at 80% and warms up.'],
  ['ramp_peak', 'Warmed-up rate', '1.15 = a warm session pays up to 115%.'],
  ['floor_ink', 'Floor Ink per activity', 'However slow, an activity pays at least this…'],
  ['floor_min_raw', '…if it’s worth at least', 'Tiny payouts (under this) don’t get the floor.'],
  ['jitter', 'Jitter', '0.04 = ±4% random wobble, so there are no visible steps.'],
  ['bot_hours', 'Bot: active hours a day', 'Earning in this many different hours of one day looks automated.'],
  ['bot_factor', 'Bot pays (share)', '0.6 = automated-looking play earns 60%.'],
];

export function InkPacing() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['admin', 'ink-pacing'], queryFn: api.admin.inkPacing });
  const [f, setF] = useState<Record<string, any>>({});
  const [adv, setAdv] = useState(false);
  useEffect(() => { if (q.data?.config) setF(q.data.config); }, [q.data]);
  const sim = useMemo(() => SIM_PLAYERS.map((p) => ({ p, r: simulateDay(f, p) })), [f]);
  const done = (r: any, msg: string) => { qc.setQueryData(['admin', 'ink-pacing'], r); void qc.invalidateQueries({ queryKey: ['world'] }); toast.success(msg); };
  const save = async () => {
    try {
      const body: Record<string, unknown> = { enabled: !!f.enabled, daily_target: Number(f.daily_target) };
      for (const [k] of ADVANCED) if (f[k] !== undefined && f[k] !== '') body[k] = Number(f[k]);
      done(await api.admin.setInkPacing(body), 'Ink Flow saved');
    } catch (e) { toast.error(toGameError(e).message); }
  };
  const toggleCap = async () => {
    const on = !q.data?.config?.uncapped;
    if (on && !(await confirm({ title: 'Uncap Ink for everyone?', body: <>Every game’s daily Ink cap is lifted (minigame paid runs, arcade, realms, business, farm, space, planets, Inkborn, arena, group and home games, map finds). Ink Flow — built around <b>{fmt(Number(f.daily_target) || 1500)} Ink a day</b> — is switched on and keeps it sustainable.</>, confirm: 'Uncap Ink' }))) return;
    try { done(await api.admin.setInkPacing({ uncapped: on }), on ? 'Ink is uncapped for everyone' : 'Daily caps are back'); } catch (e) { toast.error(toGameError(e).message); }
  };
  const uncapped = !!q.data?.config?.uncapped;
  const rows: any[] = q.data?.today ?? [];
  const tot = q.data?.totals;
  return (
    <div className="glass grid gap-3 rounded-3xl p-4" data-testid="ink-pacing">
      <div className="flex items-center justify-between gap-2">
        <div className="font-display text-lg font-black">🌊 Ink Flow</div>
        <Switch id="ink-flow-on" label="On" checked={!!f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: uncapped ? true : v })} />
      </div>
      <button onClick={() => void toggleCap()} data-testid="ink-uncap"
        className={cn('rounded-2xl p-3 text-left transition', uncapped ? 'bg-ok/15 ring-2 ring-ok/60' : 'bg-surface-2 hover:bg-surface-2/80')}>
        <div className="font-display text-base font-black">{uncapped ? '🔓 Ink is uncapped for everyone' : '🔒 Uncap Ink for everyone'}</div>
        <div className="text-xs text-muted">{uncapped ? 'No game has a daily Ink cap; Ink Flow alone keeps the economy sustainable. Tap to bring the caps back.' : 'Lift every game’s daily Ink cap and let Ink Flow balance it — players grind however they like.'}</div>
      </button>
      <label className="grid gap-1 text-xs">
        <span className="font-bold">Daily Ink target</span>
        <input className={cn(inputCls, 'h-10 text-base font-bold')} inputMode="numeric" value={f.daily_target ?? ''} onChange={(e) => setF({ ...f, daily_target: e.target.value })} data-testid="flow-target" />
        <span className="text-[11px] text-faint">What a dedicated player should earn in a day. Everything scales from it: bursts, breaks, long grinds and the day’s ceiling.</span>
      </label>
      <div className="grid gap-1 rounded-2xl bg-surface-2/50 p-3 text-xs" data-testid="flow-sim">
        <div className="font-bold">What a day earns (simulated, 10-Ink activities)</div>
        {sim.map(({ p, r }) => (
          <div key={p.id} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2">
            <span><b>{p.name}</b><br /><span className="text-[10px] text-faint">{p.note}</span></span>
            <div className="h-2 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-accent-2" style={{ width: `${Math.min(100, (r.ofTarget / 2) * 100)}%` }} /></div>
            <span className="tnum text-right"><b>{fmt(r.paid)}</b> <span className="text-faint">({Math.round(r.ofTarget * 100)}%) of {fmt(r.raw)}</span></span>
          </div>
        ))}
        <p className="text-[10px] text-faint">Breaks restore the rate; more play always earns a little more; a 24-hour bot stays under about twice the target.</p>
      </div>
      <button className="text-left text-xs font-bold text-accent" onClick={() => setAdv(!adv)}>{adv ? 'Hide' : 'Show'} advanced shape</button>
      {adv && (
        <div className="grid gap-2 sm:grid-cols-2">
          {ADVANCED.map(([k, label, hint]) => (
            <label key={k} className="grid gap-0.5 text-xs">
              <span className="font-bold">{label}</span>
              <input className={cn(inputCls, 'h-9')} inputMode="decimal" value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`flow-${k}`} />
              <span className="text-[11px] text-faint">{hint}</span>
            </label>
          ))}
        </div>
      )}
      <Button size="sm" onClick={() => void save()} data-testid="pacing-save">Save</Button>
      <div className="grid gap-1 text-xs" data-testid="pacing-today">
        <div className="font-bold">Today{tot ? ` · ${fmt(tot.players)} players earned ${fmt(tot.paid)} Ink (${fmt(tot.earned)} before Flow) · ${fmt(tot.over_target)} past the target` : ''}</div>
        {!rows.length ? <p className="text-muted">Nobody has earned paced Ink yet today.</p> : rows.slice(0, 15).map((r) => (
          <div key={r.player.id} className="flex flex-wrap items-center gap-2">
            <b>@{r.player.username}</b>
            <span className="tnum text-muted">paid {fmt(r.paid)} of {fmt(r.earned)} · rate now ×{Number(r.rate).toFixed(2)} · {r.hours} h active</span>
          </div>
        ))}
      </div>
    </div>
  );
}
