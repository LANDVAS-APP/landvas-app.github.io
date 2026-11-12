// Ink pacing (owner): the hidden, smooth slow-down on grindable Ink. Players see only what they're paid — no caps, no
// messages. Here the owner tunes it and sees who it's slowing today.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { fmt } from '../lib/utils';
import { Button, Switch, inputCls } from '../ui';
import { cn } from '../lib/utils';

const FIELDS: [key: string, label: string, hint: string][] = [
  ['day_soft', 'Full-rate Ink per day', 'A player earns this much each day at the full rate.'],
  ['day_half', '…then halves after', 'This much more Ink and their rate is half — smoothly, never a step.'],
  ['hour_soft', 'Full-rate Ink per hour', 'Rolling hour.'],
  ['hour_half', '…then halves after', 'This much more within the hour and the rate is half.'],
  ['floor', 'Never below (share)', '0.2 = never less than 20% of the normal rate.'],
  ['bot_hours', 'Bot-like: active hours a day', 'Earning in this many different hours of one day counts as automated.'],
  ['bot_factor', 'Bot-like pays (share)', '0.6 = automated-looking play earns 60%.'],
];

export function InkPacing() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'ink-pacing'], queryFn: api.admin.inkPacing });
  const [f, setF] = useState<Record<string, any>>({});
  useEffect(() => { if (q.data?.config) setF(q.data.config); }, [q.data]);
  const save = async () => {
    try {
      const r = await api.admin.setInkPacing(Object.fromEntries(Object.entries(f).filter(([k]) => k === 'enabled' || FIELDS.some(([x]) => x === k)).map(([k, v]) => [k, k === 'enabled' ? !!v : Number(v)])));
      qc.setQueryData(['admin', 'ink-pacing'], r); toast.success('Ink pacing saved');
    } catch (e) { toast.error(toGameError(e).message); }
  };
  const rows: any[] = q.data?.today ?? [];
  return (
    <div className="glass grid gap-3 rounded-3xl p-4" data-testid="ink-pacing">
      <div className="flex items-center justify-between gap-2">
        <div className="font-display text-lg font-black">🫧 Ink pacing</div>
        <Switch id="ink-pacing-on" label="On" checked={!!f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} />
      </div>
      <p className="text-xs text-muted">A hidden, smooth slow-down on grindable Ink (minigames, arcade, realms, farm, business, space, Inkborn, finds, group games, travel, creative). Normal play is never touched; heavy grinding, very fast earning and bot-like play quietly earn less. Players only ever see what they were paid — no caps or messages. Daily streak, wheel, referrals, ads, clans, duels and conversions are never paced.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {FIELDS.map(([k, label, hint]) => (
          <label key={k} className="grid gap-0.5 text-xs">
            <span className="font-bold">{label}</span>
            <input className={cn(inputCls, 'h-9')} inputMode="decimal" value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`pacing-${k}`} />
            <span className="text-[11px] text-faint">{hint}</span>
          </label>
        ))}
      </div>
      <Button size="sm" onClick={() => void save()} data-testid="pacing-save">Save</Button>
      <div className="grid gap-1 text-xs" data-testid="pacing-today">
        <div className="font-bold">Slowed most today</div>
        {!rows.length ? <p className="text-muted">Nobody has earned paced Ink yet today.</p> : rows.slice(0, 15).map((r) => (
          <div key={r.player.id} className="flex flex-wrap items-center gap-2">
            <b>@{r.player.username}</b>
            <span className="tnum text-muted">earned {fmt(r.earned)} · paid {fmt(r.paid)} · now ×{Number(r.factor).toFixed(2)} · {r.hours} h active</span>
          </div>
        ))}
      </div>
    </div>
  );
}
