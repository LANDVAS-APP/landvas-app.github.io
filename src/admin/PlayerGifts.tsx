// Gifts for one player, from the admin portal: roll tickets of any kind, an enchantment on their next roll(s), a
// Godroll lined up, and how their Ink earnings work (off, dynamic, or left as they are). Owner only (Ink earnings:
// economy). Nobody else's odds change, and every grant is in the audit log.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { PlayerInkMode } from '../backend/types';
import { KIND_ORDER, kindInfo } from '../enchant/kinds';
import { PLOT_TYPES } from '../map/plotStyle';
import { RarityBadge } from '../plot/RarityBadge';
import { RARITY_ORDER, ULTRA, rarityInfo } from '../shared/rarity';
import { cn, fmt, timeAgo } from '../lib/utils';
import { Button, Switch, inputCls } from '../ui';

const TICKET_RARITIES = [...RARITY_ORDER.filter((r) => !r.startsWith('crown')), 'enchanted'];
const GOD_RARITIES = ULTRA.filter((r) => !r.startsWith('crown'));
const sel = cn(inputCls, 'h-9 w-auto');
const err = (e: unknown) => toast.error(toGameError(e).message);

export type EnchantSpec = { kind: string; stars: number | null; level: number | null; nickname: string; state: string };
const EMPTY_SPEC: EnchantSpec = { kind: '', stars: null, level: null, nickname: '', state: '' };
/** the recipe the server takes: only what was set (anything left out rolls as usual) */
export function specJson(s: EnchantSpec): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (s.kind) o.kind = s.kind;
  if (s.stars != null) o.stars = s.stars;
  if (s.level != null) o.level = s.level;
  if (s.nickname.trim()) o.nickname = s.nickname.trim();
  if (s.state.trim()) o.state = JSON.parse(s.state); // throws on bad JSON: caught by the caller
  return o;
}
export const specText = (e: { kind?: string | null; stars?: number | null; level?: number | null } | null | undefined) => {
  if (!e) return '';
  const k = e.kind ? kindInfo(e.kind) : null;
  return [k ? `${k.emoji} ${k.name}` : '🔮 random enchantment', e.stars != null ? `${'★'.repeat(e.stars) || '0★'}` : null, e.level != null ? `Lv ${e.level}` : null].filter(Boolean).join(' · ');
};

/** pick an enchantment, its stars, level and name (and, for the brave, raw state) */
export function EnchantRecipe({ v, onChange, testid = 'ench' }: { v: EnchantSpec; onChange(v: EnchantSpec): void; testid?: string }) {
  const [adv, setAdv] = useState(false);
  return (
    <div className="grid gap-2 rounded-xl bg-surface-2/40 p-2 text-xs" data-testid={`${testid}-recipe`}>
      <div className="flex flex-wrap items-center gap-2">
        <select className={sel} value={v.kind} onChange={(e) => onChange({ ...v, kind: e.target.value })} aria-label="Enchantment" data-testid={`${testid}-kind`}>
          <option value="">🔮 Random enchantment</option>
          {KIND_ORDER.map((k) => <option key={k} value={k}>{kindInfo(k).emoji} {kindInfo(k).name}</option>)}
        </select>
        <select className={sel} value={v.stars ?? ''} onChange={(e) => onChange({ ...v, stars: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Stars" data-testid={`${testid}-stars`}>
          <option value="">stars: as rolled</option>
          {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n ? '★'.repeat(n) : 'no stars'}</option>)}
        </select>
        <select className={sel} value={v.level ?? ''} onChange={(e) => onChange({ ...v, level: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Level" data-testid={`${testid}-level`}>
          <option value="">level: 1</option>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Level {n}</option>)}
        </select>
        <input className={cn(inputCls, 'h-9 w-40')} maxLength={24} placeholder="Name it (optional)" value={v.nickname} onChange={(e) => onChange({ ...v, nickname: e.target.value })} />
        <button className="text-[11px] font-bold text-muted underline" onClick={() => setAdv(!adv)}>{adv ? 'hide' : 'advanced'}</button>
      </div>
      {adv && <textarea className={cn(inputCls, 'min-h-16 font-mono text-[11px]')} placeholder='Extra state as JSON, merged in at birth — e.g. {"gene": "golden"}' value={v.state} onChange={(e) => onChange({ ...v, state: e.target.value })} />}
    </div>
  );
}

function Section({ title, children, testid }: { title: string; children: React.ReactNode; testid: string }) {
  return <div className="grid gap-2 rounded-2xl border border-line p-3" data-testid={testid}><div className="text-sm font-bold">{title}</div>{children}</div>;
}
function Live({ used, cancelled, children }: { used?: string | null; cancelled?: string | null; children: React.ReactNode }) {
  return <div className={cn('flex flex-wrap items-center gap-2 text-xs', (used || cancelled) && 'opacity-50')}>{children}</div>;
}

// ---- 🎟️ tickets ------------------------------------------------------------------------------------------------
function Tickets({ playerId }: { playerId: string }) {
  const qc = useQueryClient();
  const key = ['admin', 'roll-tickets', playerId];
  const q = useQuery({ queryKey: key, queryFn: () => api.admin.rollTickets(playerId), retry: false });
  const [f, setF] = useState({ rarity: 'legendary', exact: false, type: '', shiny: false, rerolls: 0, godroll: '' as '' | 'echo' | 'pantheon', label: '', note: '', count: 1 });
  const [spec, setSpec] = useState<EnchantSpec>(EMPTY_SPEC);
  if (q.isError) return null; // not an owner
  const grant = async () => {
    try {
      const body: Record<string, unknown> = { rarity: f.rarity, exact: f.exact, shiny: f.shiny, rerolls: f.rerolls, label: f.label || null, note: f.note || null };
      if (f.type) body.plot_type = f.type;
      if (f.godroll) body.godroll = f.godroll;
      if (f.rarity === 'enchanted') body.enchant = specJson(spec);
      qc.setQueryData(key, await api.admin.grantTicket(playerId, body, f.count));
      toast.success(`${f.count} ticket${f.count === 1 ? '' : 's'} sent`);
    } catch (e) { err(e); }
  };
  const cancel = async (id: string) => { try { qc.setQueryData(key, await api.admin.cancelTicket(id)); } catch (e) { err(e); } };
  const rows = (q.data ?? []) as any[];
  return (
    <Section title="🎟️ Roll tickets" testid="gift-tickets">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select className={sel} value={f.rarity} onChange={(e) => setF({ ...f, rarity: e.target.value })} aria-label="Ticket rarity" data-testid="ticket-rarity">
          {TICKET_RARITIES.map((r) => <option key={r} value={r}>{rarityInfo(r).name}</option>)}
        </select>
        {f.rarity !== 'enchanted' && !f.godroll && <div className="flex gap-1 rounded-full bg-surface-2/60 p-0.5 font-bold">
          {([[false, 'or better'], [true, 'exactly']] as const).map(([x, l]) => <button key={l} onClick={() => setF({ ...f, exact: x })} className={cn('rounded-full px-2.5 py-1', f.exact === x ? 'bg-accent text-white' : 'text-muted')} data-testid={`ticket-exact-${x}`}>{l}</button>)}
        </div>}
        <select className={sel} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label="Minigame">
          <option value="">the plot’s own minigame</option>
          {Object.entries(PLOT_TYPES).map(([id, t]) => <option key={id} value={id}>{t.name} · {t.game}</option>)}
        </select>
        <label className="flex items-center gap-1">free rerolls
          <select className={sel} value={f.rerolls} onChange={(e) => setF({ ...f, rerolls: Number(e.target.value) })} data-testid="ticket-rerolls">{[0, 1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <select className={sel} value={f.godroll} onChange={(e) => setF({ ...f, godroll: e.target.value as typeof f.godroll })} aria-label="Godroll" data-testid="ticket-godroll">
          <option value="">no Godroll</option><option value="echo">⚡ Echo Godroll</option><option value="pantheon">⚡ Pantheon Godroll</option>
        </select>
      </div>
      {f.rarity === 'enchanted' && <EnchantRecipe v={spec} onChange={setSpec} testid="ticket-ench" />}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Switch id={`ticket-shiny-${playerId}`} label="Shiny" checked={f.shiny} onCheckedChange={(v) => setF({ ...f, shiny: v })} />
        <input className={cn(inputCls, 'h-9 w-44')} maxLength={60} placeholder="Name they see (optional)" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} data-testid="ticket-label" />
        <input className={cn(inputCls, 'h-9 min-w-32 flex-1')} placeholder="Note (staff only)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <label className="flex items-center gap-1">× <input type="number" min={1} max={100} className={cn(inputCls, 'h-9 w-16')} value={f.count} onChange={(e) => setF({ ...f, count: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })} /></label>
        <Button size="sm" onClick={() => void grant()} data-testid="ticket-go">Send ticket</Button>
      </div>
      {!rows.length ? <p className="text-xs text-muted">No tickets.</p> : (
        <div className="grid max-h-56 gap-1 overflow-y-auto scroll-thin" data-testid="ticket-list">
          {rows.map((t) => (
            <Live key={t.id} used={t.used_at} cancelled={t.cancelled_at}>
              <RarityBadge r={t.min_rarity} small /><span className="font-bold">{t.exact ? 'exactly' : 'or better'}</span>
              {t.shiny && <span>✨</span>}{t.rerolls > 0 && <span>🎲 +{t.rerolls}</span>}{t.godroll && <span>⚡ {t.godroll}</span>}
              {t.plot_type && <span className="text-muted">· {PLOT_TYPES[t.plot_type as keyof typeof PLOT_TYPES]?.name ?? t.plot_type}</span>}
              {t.enchant && <span className="text-muted">· {specText(t.enchant)}</span>}
              {t.label && <span>“{t.label}”</span>}
              <span className="text-faint">· {t.source}{t.by ? ` by @${t.by}` : ''} · {t.used_at ? `used ${timeAgo(t.used_at)}` : t.cancelled_at ? 'cancelled' : timeAgo(t.created_at)}</span>
              {!t.used_at && !t.cancelled_at && <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => void cancel(t.id)}>Cancel</Button>}
            </Live>
          ))}
        </div>
      )}
      <p className="text-[11px] text-faint">They use it from the roll screen like any ticket. “Or better” rolls the plot normally but never lands below this rarity; “exactly” lands this one. Free rerolls show as extra Luck rolls on that claim (they keep the best). A Godroll ticket turns that claim into one.</p>
    </Section>
  );
}

// ---- 🔮 an enchantment on their next roll(s) ---------------------------------------------------------------------
function EnchantRolls({ playerId }: { playerId: string }) {
  const qc = useQueryClient();
  const [spec, setSpec] = useState<EnchantSpec>(EMPTY_SPEC);
  const [f, setF] = useState({ mode: 'claim' as 'claim' | 'luck', after: 1, slot: 0, count: 1, type: '', shiny: false, note: '' });
  const go = async () => {
    try {
      const r = await api.admin.grantEnchantRoll(playerId, specJson(spec), f.mode, f.mode === 'luck' ? 1 : f.after, f.mode === 'luck' && f.slot ? f.slot : null, f.count, f.type || null, f.shiny, f.note || null);
      qc.setQueryData(['admin', 'roll-grants', playerId], r);
      void qc.invalidateQueries({ queryKey: ['admin', 'roll-grants', null] });
      toast.success('Enchantment lined up');
    } catch (e) { err(e); }
  };
  return (
    <Section title="🔮 An enchantment on their next roll(s)" testid="gift-enchant">
      <EnchantRecipe v={spec} onChange={setSpec} />
      <div className="flex gap-1 rounded-full bg-surface-2/60 p-1 text-xs font-bold">
        {([['claim', 'On a claim'], ['luck', 'In their next Luck rerolls']] as const).map(([m, l]) => (
          <button key={m} onClick={() => setF({ ...f, mode: m })} className={cn('flex-1 rounded-full py-1.5', f.mode === m ? 'bg-accent text-white' : 'text-muted')} data-testid={`ench-mode-${m}`}>{l}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {f.mode === 'claim'
          ? <label className="flex items-center gap-1">on claim <input type="number" min={1} max={100000} className={cn(inputCls, 'h-9 w-20')} value={f.after} onChange={(e) => setF({ ...f, after: Math.max(1, Number(e.target.value) || 1) })} /> from now</label>
          : <label className="flex items-center gap-1">on <select className={sel} value={f.slot} onChange={(e) => setF({ ...f, slot: Number(e.target.value) })}>
              <option value={0}>every roll</option>{[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>roll {n}{n === 1 ? ' (their own)' : ` (reroll ${n - 1})`}</option>)}
            </select></label>}
        <label className="flex items-center gap-1">× <input type="number" min={1} max={100} className={cn(inputCls, 'h-9 w-16')} value={f.count} onChange={(e) => setF({ ...f, count: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })} /> {f.mode === 'claim' ? 'claims in a row' : 'Luck claims'}</label>
        <select className={sel} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label="Minigame">
          <option value="">the plot’s own minigame</option>
          {Object.entries(PLOT_TYPES).map(([id, t]) => <option key={id} value={id}>{t.name} · {t.game}</option>)}
        </select>
        <Switch id={`ench-shiny-${playerId}`} label="Shiny" checked={f.shiny} onCheckedChange={(v) => setF({ ...f, shiny: v })} />
      </div>
      <div className="flex gap-2">
        <input className={cn(inputCls, 'h-9 min-w-40 flex-1 text-xs')} placeholder="Note (which event)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <Button size="sm" onClick={() => void go()} data-testid="ench-go">Line it up</Button>
      </div>
      <p className="text-[11px] text-faint">The plot is born Enchanted with exactly this enchantment (anything left as “as rolled” rolls normally). It shows in the event rolls list above and lands like any other event roll.</p>
    </Section>
  );
}

// ---- ⚡ a Godroll lined up -----------------------------------------------------------------------------------------
function Godrolls({ playerId }: { playerId: string }) {
  const qc = useQueryClient();
  const key = ['admin', 'godrolls', playerId];
  const q = useQuery({ queryKey: key, queryFn: () => api.admin.godrollQueue(playerId), retry: false });
  const [f, setF] = useState({ kind: 'echo' as 'echo' | 'pantheon', rolls: 0, rarity: '', shiny: false, note: '' });
  if (q.isError) return null;
  const go = async () => { try { qc.setQueryData(key, await api.admin.grantGodroll(playerId, f.kind, f.rolls || null, f.rarity || null, f.shiny, f.note || null)); toast.success('Godroll lined up for their next claim'); } catch (e) { err(e); } };
  const cancel = async (id: number) => { try { qc.setQueryData(key, await api.admin.cancelGodroll(id)); } catch (e) { err(e); } };
  const rows = (q.data ?? []) as any[];
  return (
    <Section title="⚡ Godroll on their next claim" testid="gift-godroll">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select className={sel} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'echo' | 'pantheon' })} data-testid="god-kind">
          <option value="echo">Echo — one ultra on every roll, each a different minigame</option>
          <option value="pantheon">Pantheon — a different ultra on every roll</option>
        </select>
        <select className={sel} value={f.rolls} onChange={(e) => setF({ ...f, rolls: Number(e.target.value) })} data-testid="god-rolls">
          <option value={0}>rolls: as configured</option>{[2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} rolls ({n - 1} reroll{n === 2 ? '' : 's'})</option>)}
        </select>
        <select className={sel} value={f.rarity} onChange={(e) => setF({ ...f, rarity: e.target.value })} data-testid="god-rarity">
          <option value="">{f.kind === 'echo' ? 'the ultra: random' : 'first roll: random'}</option>
          {GOD_RARITIES.map((r) => <option key={r} value={r}>{rarityInfo(r).name}</option>)}
        </select>
        <Switch id={`god-shiny-${playerId}`} label="All shiny" checked={f.shiny} onCheckedChange={(v) => setF({ ...f, shiny: v })} />
      </div>
      <div className="flex gap-2">
        <input className={cn(inputCls, 'h-9 min-w-40 flex-1 text-xs')} placeholder="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <Button size="sm" onClick={() => void go()} data-testid="god-go">Line it up</Button>
      </div>
      {rows.length > 0 && (
        <div className="grid gap-1">{rows.map((g) => (
          <Live key={g.id} used={g.used_at} cancelled={g.cancelled_at}>
            <b>⚡ {g.kind === 'echo' ? 'Echo' : 'Pantheon'}</b><span>{g.rolls ? `${g.rolls} rolls` : 'rolls as configured'}</span>{g.rarity && <RarityBadge r={g.rarity} small />}{g.shiny && <span>✨</span>}
            <span className="text-faint">· {g.used_at ? `landed ${timeAgo(g.used_at)}` : g.cancelled_at ? 'cancelled' : `waiting · ${timeAgo(g.created_at)}`}{g.note ? ` · ${g.note}` : ''}</span>
            {!g.used_at && !g.cancelled_at && <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => void cancel(g.id)}>Cancel</Button>}
          </Live>
        ))}</div>
      )}
      <p className="text-[11px] text-faint">Lands on their next claim of any kind. They see every roll and keep the one they like. Godroll odds for everyone are on the Rolls page.</p>
    </Section>
  );
}

// ---- 💧 Ink earnings ------------------------------------------------------------------------------------------------
const MODES: { id: PlayerInkMode['mode']; label: string; text: string }[] = [
  { id: 'default', label: 'Leave as they are', text: 'Same as everyone: the game’s own Ink Flow setting.' },
  { id: 'off', label: 'Off', text: 'They earn no Ink from play (held back and counted). Purchases, refunds and staff grants still arrive.' },
  { id: 'dynamic', label: 'Dynamic', text: 'Ink Flow on for them only: their rewards follow the dynamic rate even when it’s off for everyone.' },
  { id: 'classic', label: 'Classic (fixed)', text: 'Ink Flow off for them only: fixed rewards even when it’s on for everyone.' },
];
function InkMode({ playerId }: { playerId: string }) {
  const qc = useQueryClient();
  const key = ['admin', 'ink-mode', playerId];
  const q = useQuery({ queryKey: key, queryFn: () => api.admin.playerInkMode(playerId), retry: false });
  const [note, setNote] = useState('');
  if (q.isError || !q.data) return null;
  const m = q.data;
  const set = async (mode: PlayerInkMode['mode']) => {
    try { qc.setQueryData(key, await api.admin.setPlayerInkMode(playerId, mode, note.trim() || null)); void qc.invalidateQueries({ queryKey: ['admin', 'ink-modes'] }); toast.success(`Ink earnings: ${MODES.find((x) => x.id === mode)!.label}`); } catch (e) { err(e); }
  };
  return (
    <Section title="💧 Ink earnings" testid="gift-ink-mode">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {MODES.map((x) => (
          <button key={x.id} onClick={() => void set(x.id)} aria-pressed={m.mode === x.id} data-testid={`ink-mode-${x.id}`}
            className={cn('rounded-xl px-2 py-2 text-xs font-bold', m.mode === x.id ? (x.id === 'off' ? 'bg-bad text-white' : 'bg-accent text-white') : 'bg-surface-2/70 text-muted')}>{x.label}</button>
        ))}
      </div>
      <p className="text-[11px] text-muted">{MODES.find((x) => x.id === m.mode)?.text} {m.mode === 'off' ? <> Ink Flow for everyone is {m.game_flow_on ? 'on' : 'off'}.</> : <> So their game rewards use <b>{(m.mode === 'dynamic' || (m.mode === 'default' && m.game_flow_on)) ? 'the dynamic rate' : 'fixed rates'}</b> (Ink Flow for everyone is {m.game_flow_on ? 'on' : 'off'}).</>}</p>
      <div className="flex flex-wrap gap-x-3 text-[11px] text-faint">
        <span>Earned today: {fmt(m.today ?? 0)} Ink</span>
        {m.held > 0 && <span className="font-bold text-warn">Held back: {fmt(m.held)} Ink over {fmt(m.held_n)} rewards{m.held_at ? ` (last ${timeAgo(m.held_at)})` : ''}</span>}
        {m.set_at && <span>Set {timeAgo(m.set_at)}{m.by ? ` by @${m.by}` : ''}{m.note ? ` — ${m.note}` : ''}</span>}
      </div>
      <input className={cn(inputCls, 'h-9 text-xs')} placeholder="Reason (audited, staff only) — then pick a mode" value={note} onChange={(e) => setNote(e.target.value)} />
    </Section>
  );
}

/** every gift for one player (in the player page of the admin portal) */
export function PlayerGifts({ playerId }: { playerId: string }) {
  return (
    <div className="grid gap-2" data-testid="player-gifts">
      <Tickets playerId={playerId} />
      <EnchantRolls playerId={playerId} />
      <Godrolls playerId={playerId} />
      <InkMode playerId={playerId} />
    </div>
  );
}
