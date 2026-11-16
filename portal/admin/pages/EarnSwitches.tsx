// Admin → Earning switches. Stop any way of earning, live, without breaking anything: the game keeps playing exactly
// as before and that part just pays 0 (Ink, pigments and brush points; tickets for arcade switches; the rent extra or
// multiplier for rent switches). For a bug or exploit found after an update: switch it off here, fix it, switch it on.
// Server side: supabase/migrations/20261119000220_earn_switches.sql (private.earn_switches, private.grant).
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Power, Search } from 'lucide-react';
import { toast } from 'sonner';
import { toGameError } from '../../../src/backend/backend';
import { cn } from '../../../src/lib/utils';
import { portal, type EarnSwitches } from '../../shared/api';
import { ago, int } from '../../shared/format';
import { Badge, PageHeader, Panel, Q, useDebounced } from '../../shared/ui';
import { Link } from 'react-router-dom';
import { api } from '../../../src/backend/api';

type Row = { key: string; label: string; emoji?: string; sub?: string; ink?: number };
type Group = { id: string; title: string; sub: string; rows: Row[] };

const REASONS: [string, string, string][] = [
  ['minigame', '🎮', 'Plot minigames'], ['arcade', '🕹️', 'Arcades (cabinets, carnival, mirror, secrets)'], ['enchantment', '✨', 'Enchantments & rarity powers'],
  ['farm', '🌾', 'Farms'], ['business', '🍋', 'Businesses'], ['realm', '🏰', 'Realms (mine, sky, workshop, diner, dungeon, arena)'], ['space', '🚀', 'Space & planets'],
  ['inkborn', '🐾', 'Inkborn (jobs, games, springs, keepers)'], ['travel', '🧳', 'Travel stops'], ['finds', '🔎', 'Map finds'], ['group_game', '👥', 'Group games'],
  ['leviathan', '🐋', 'The Leviathan'], ['clan', '🛡️', 'Clans'], ['pvp', '⚔️', 'PvP'], ['duel_win', '🥊', 'Duel winnings'], ['wheel', '🎡', 'Prize wheel'],
  ['daily_streak', '📅', 'Daily streak'], ['ad_reward', '📺', 'Rewarded ads'], ['referral', '🤝', 'Invite bonuses (inviter)'], ['referral_welcome', '👋', 'Invite bonuses (new player)'],
  ['referral_share', '💸', 'Invite share (10% of what invited players earn)'], ['room_visit', '🚪', 'Room visits'], ['room_host', '🏠', 'Room hosting'],
  ['inspire', '💡', 'Inspires (received)'], ['inspire_given', '💡', 'Inspires (given)'], ['stamp_sale', '🏷️', 'Stamp sales'], ['sketch', '✏️', 'Sketch of the Day'],
  ['doodle', '🖍️', 'Draw & Guess'], ['duet', '🎨', 'Duets'], ['challenge', '🏆', 'Challenges'], ['craft', '🧵', 'Crafts'], ['featured', '⭐', 'Featured art'],
  ['crown', '👑', 'Crown Ink share'], ['usd_conversion', '💱', 'Rent → Ink conversion'],
];
const MULTS: Row[] = [
  { key: 'mult:rarity', emoji: '🌈', label: 'Every rarity’s Ink multiplier (plots pay ×1)' },
  { key: 'mult:plot_level', emoji: '⬆️', label: 'Plot level bonus' },
  { key: 'mult:boost', emoji: '🚀', label: 'Live minigame boosts' },
  { key: 'mult:enchant', emoji: '✨', label: 'Enchantment & ultra minigame multipliers (World Tree, Hive, …)' },
  { key: 'mult:arcade_hot', emoji: '🔥', label: 'Hot cabinet bonus' },
];
const RENT: Row[] = [
  { key: 'rent.extra:landlord', emoji: '🏘️', label: 'Landlord rent day (50× on the 1st)' },
  { key: 'rent.extra:crown', emoji: '👑', label: 'Crown rent share (1% of the kingdom’s rent)' },
  { key: 'rent.extra:abilities', emoji: '🌟', label: 'Rarity ability rent extras' },
  { key: 'rent.extra:daily', emoji: '📅', label: 'Daily rent extras' },
  { key: 'rent.mult:abilities', emoji: '✖️', label: 'Rent multipliers (collections, Prismatic, Singularity, Genesis)' },
];
const ARCADE_KINDS: Row[] = [
  { key: 'plotkind:arcade', emoji: '🕹️', label: 'Arcade plots (every cabinet in them)' },
  { key: 'plotkind:boardwalk', emoji: '🎡', label: 'Arcade Carnival estates' },
  { key: 'plotkind:galaxypark', emoji: '🌌', label: 'Neon Galaxy Park domains' },
  { key: 'arcade.tickets', emoji: '🎟️', label: 'Every arcade ticket and arcade Ink' },
  { key: 'arcade.match', emoji: '⚔️', label: 'Versus & Team match bonuses' },
  { key: 'arcade.daily', emoji: '📅', label: 'Arcade daily bonus' },
  { key: 'arcade.mirror', emoji: '🪞', label: 'The Mirror Arcade' },
];

function groups(d: EarnSwitches): Group[] {
  const ink = (r: string) => Number(d.reasons[r] ?? 0);
  const refs = Object.entries(d.refs).sort((a, b) => Number(b[1]) - Number(a[1]));
  return [
    { id: 'sources', title: 'Whole sources', sub: 'Every payout of that kind, everywhere.', rows: REASONS.map(([k, e, l]) => ({ key: `reason:${k}`, emoji: e, label: l, ink: ink(k) })) },
    { id: 'arcade', title: 'Arcade', sub: 'A cabinet or arcade switched off still plays — it wins no tickets and no Ink.', rows: [
      ...ARCADE_KINDS,
      ...d.arcade_games.map((g) => ({ key: `arcade.game:${g.id}`, emoji: g.emoji, label: g.name, sub: g.where })),
      ...d.secrets.filter((s) => s !== 'mirror').map((s) => ({ key: `arcade.secret:${s}`, emoji: '🗝️', label: `Secret: ${s}` })),
    ] },
    { id: 'minigames', title: 'Minigames', sub: 'One plot minigame.', rows: [...d.minigames.map((g) => ({ key: `minigame:${g.id}`, emoji: '🎮', label: g.name })), { key: 'minigame:home', emoji: '🏡', label: 'Home games' }] },
    { id: 'enchant', title: 'Enchantments', sub: 'One enchantment pays nothing (its other effects carry on).', rows: d.enchantments.map((e) => ({ key: `ench:${e.id}`, emoji: e.emoji, label: e.name })) },
    { id: 'splice', title: 'Splices', sub: 'Leave out splice bonuses: all of them, or any splice with one enchantment. For one exact pair use “splice:a+b” below.', rows: [
      { key: 'splice', emoji: '🧬', label: 'Every splice bonus' },
      ...d.enchantments.map((e) => ({ key: `splice.with:${e.id}`, emoji: e.emoji, label: `Any splice with ${e.name}` })),
    ] },
    { id: 'kinds', title: 'Plot types', sub: 'Everything a plot type pays.', rows: d.plot_kinds.filter((k) => !['base', 'canvas', 'arcade', 'boardwalk', 'galaxypark'].includes(k.id)).map((k) => ({ key: `plotkind:${k.id}`, label: k.name })) },
    { id: 'mult', title: 'Multipliers', sub: 'A multiplier switched off counts as ×1.', rows: [...MULTS, ...d.rarities.map((r) => ({ key: `mult:rarity:${r.id}`, emoji: '🎨', label: `${r.name} Ink multiplier (×${Number(r.mult).toFixed(2)})`, sub: r.tier ?? undefined }))] },
    { id: 'rent', title: 'Rent', sub: 'USD rent extras and multipliers (base rent keeps paying).', rows: RENT },
    { id: 'refs', title: 'Every kind of payout', sub: 'Finer than a source: each payout type the ledger has seen in the last day.', rows: refs.map(([k, v]) => ({ key: `ref:${k}`, label: k.replace(/_/g, ' '), ink: Number(v) })) },
  ];
}

export default function EarnSwitchesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'earn-switches'], queryFn: portal.earnSwitches, refetchInterval: 30_000 });
  const [sp] = useSearchParams();
  const [find, setFind] = useState(sp.get('find') ?? ''); // (the Fair play radar links here with a switch already found)
  const [note, setNote] = useState('');
  const [custom, setCustom] = useState('');
  const f = useDebounced(find.trim().toLowerCase(), 150);
  const flip = useMutation({
    mutationFn: ({ key, off }: { key: string; off: boolean }) => portal.earnSwitch(key, off, off ? note : null),
    onSuccess: (d, v) => { qc.setQueryData(['admin', 'earn-switches'], d); toast.success(v.off ? `Stopped: ${v.key}` : `Earning again: ${v.key}`, { description: v.off ? 'Players keep playing — that part pays 0 until you switch it back on.' : undefined }); },
    onError: (e) => toast.error(toGameError(e).message),
  });
  return (
    <>
      <PageHeader title="Earning switches" sub="Stop any way of earning, right now, for everyone. Nothing errors or reloads: the game keeps playing and that part just pays 0 until you switch it back on. Every switch is in the audit log." />
      <Q q={q} label="Loading switches…">{(d) => {
        const off = new Set(d.off.map((o) => o.key));
        const all = groups(d);
        const match = (r: Row) => !f || r.key.includes(f) || r.label.toLowerCase().includes(f);
        const busyKey = flip.isPending ? flip.variables?.key : null;
        const rowEl = (r: Row) => {
          const isOff = off.has(r.key), held = d.held[r.key];
          return (
            <div key={r.key} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2', isOff ? 'border-bad/50 bg-bad/10' : 'border-line')} data-testid={`switch-row-${r.key}`}>
              {r.emoji && <span className="text-lg">{r.emoji}</span>}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{r.label}{r.sub ? <span className="ml-1.5 text-xs font-normal text-muted">{r.sub}</span> : null}</div>
                <div className="flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-faint">
                  <span>{r.key}</span>
                  {r.ink != null && r.ink > 0 && <span className="text-muted">· {int(r.ink)} Ink in 24 h</span>}
                  {held && <span className="text-warn">· held back {int(held.n)}× ({int(held.amount)}) this week</span>}
                </div>
              </div>
              <button type="button" role="switch" aria-checked={!isOff} aria-label={`${r.label}: ${isOff ? 'stopped' : 'earning'}`} disabled={busyKey === r.key}
                onClick={() => flip.mutate({ key: r.key, off: !isOff })} data-testid={`switch-${r.key}`}
                className={cn('relative h-7 w-[52px] shrink-0 rounded-full transition disabled:opacity-50', isOff ? 'bg-bad/70' : 'bg-ok')}>
                <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left]', isOff ? 'left-0.5' : 'left-[26px]')} />
              </button>
            </div>
          );
        };
        return (
          <div className="grid gap-3" data-testid="earn-switches">
            <Panel>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => flip.mutate({ key: 'all', off: !off.has('all') })} data-testid="switch-all"
                  className={cn('flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-white', off.has('all') ? 'bg-ok' : 'bg-bad')}>
                  <Power className="h-4 w-4" />{off.has('all') ? 'Turn ALL Ink back on' : 'Stop ALL Ink now'}
                </button>
                <input className="h-10 min-w-[220px] flex-1 rounded-xl border border-line bg-surface/80 px-3 text-sm" placeholder="Why (saved with the switch, optional)" value={note} onChange={(e) => setNote(e.target.value)} data-testid="switch-note" />
              </div>
            </Panel>
            <Panel title={`Switched off now (${d.off.length})`}>
              {d.off.length ? (
                <div className="grid gap-2" data-testid="switched-off">
                  {d.off.map((o) => (
                    <div key={o.key} className="flex flex-wrap items-center gap-3 rounded-xl border border-bad/50 bg-bad/10 px-3 py-2">
                      <Badge tone="bad">OFF</Badge><b className="font-mono text-sm">{o.key}</b>
                      <span className="text-xs text-muted">{ago(o.at)}{o.by ? ` by @${o.by}` : ''}{o.note ? ` — ${o.note}` : ''}</span>
                      {d.held[o.key] && <span className="text-xs text-warn">held back {int(d.held[o.key].n)} payouts ({int(d.held[o.key].amount)})</span>}
                      <button className="ml-auto rounded-lg bg-ok px-3 py-1 text-xs font-bold text-white" onClick={() => flip.mutate({ key: o.key, off: false })} data-testid={`switch-on-${o.key}`}>Switch back on</button>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted">Everything is earning normally.</p>}
            </Panel>
            <PlayerModes />
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                <input className="h-10 w-full rounded-xl border border-line bg-surface/80 pl-9 pr-3 text-sm" placeholder="Find a switch: goose, stacker, crown, rarity…" value={find} onChange={(e) => setFind(e.target.value)} data-testid="switch-find" />
              </div>
              <input className="h-10 w-[220px] rounded-xl border border-line bg-surface/80 px-3 font-mono text-sm" placeholder="custom key, e.g. splice:goose+genie" value={custom} onChange={(e) => setCustom(e.target.value)} data-testid="switch-custom" />
              <button className="h-10 rounded-xl bg-bad px-4 text-sm font-bold text-white disabled:opacity-50" disabled={custom.trim().length < 3} onClick={() => { flip.mutate({ key: custom.trim().toLowerCase(), off: true }); setCustom(''); }} data-testid="switch-custom-off">Switch off</button>
            </div>
            {all.map((g) => {
              const rows = g.rows.filter(match);
              if (!rows.length) return null;
              return (
                <Panel key={g.id} title={<>{g.title} <span className="text-xs font-normal text-muted">· {g.sub}</span></>}>
                  <div className="grid gap-2 lg:grid-cols-2" data-testid={`switch-group-${g.id}`}>{rows.map(rowEl)}</div>
                </Panel>
              );
            })}
          </div>
        );
      }}</Q>
    </>
  );
}

/** players whose Ink earnings the owner set by hand (off, dynamic or classic) — change them on the player → Gifts */
function PlayerModes() {
  const q = useQuery({ queryKey: ['admin', 'ink-modes'], queryFn: api.admin.inkModes, refetchInterval: 60_000 });
  const rows = q.data ?? [];
  if (!rows.length) return null;
  const label = { off: 'Ink off', dynamic: 'Dynamic', classic: 'Classic', default: 'Default' } as const;
  return (
    <Panel title={`Players with their own Ink earnings (${rows.length})`}>
      <div className="grid gap-1.5" data-testid="ink-modes">
        {rows.map((m) => (
          <div key={m.player_id} className={cn('flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs', m.mode === 'off' ? 'border-bad/50 bg-bad/10' : 'border-line')}>
            <Badge tone={m.mode === 'off' ? 'bad' : 'accent'}>{label[m.mode]}</Badge>
            <Link to={`/players/${m.player_id}/gifts`} className="font-bold hover:underline">@{m.player?.username}</Link>
            <span className="text-muted">{m.set_at ? ago(m.set_at) : ''}{m.by ? ` by @${m.by}` : ''}{m.note ? ` — ${m.note}` : ''}</span>
            {m.held > 0 && <span className="text-warn">held back {int(m.held)} Ink ({int(m.held_n)} rewards)</span>}
          </div>
        ))}
      </div>
    </Panel>
  );
}
