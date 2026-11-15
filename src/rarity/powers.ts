// The Ultra Expansion on the client: what a plot's power is called and does, the rules a Throne can set, the wishes
// at 11:11, and the queries every screen shares.
import { useQuery } from '@tanstack/react-query';
import { api, type RxPower } from '../backend/api';
import { getBackend } from '../backend/backend';
import { rarityInfo } from '../shared/rarity';

export const cellKey = (gx: number, gy: number) => `${gx}_${gy}`;
export const parseCell = (k: string | undefined): [number, number] | null => {
  const m = /^(\d+)_(\d+)$/.exec(k ?? '');
  return m ? [Number(m[1]), Number(m[2])] : null;
};
export const powerPath = (gx: number, gy: number) => `/powers/${cellKey(gx, gy)}`;

/** the rules a Throne of Ink can set for the week */
export const RULES: Record<string, { name: string; emoji: string; text: string }> = {
  minigames: { name: 'A golden week', emoji: '🎮', text: 'Minigames on the land around it pay 15% more' },
  shiny: { name: 'Shining week', emoji: '✨', text: 'Shinies come 3× as often on the land around it' },
  ultras: { name: 'Week of wonders', emoji: '🌌', text: 'Ultras (and Primordials) roll twice as often on the land around it' },
  peace: { name: 'Peace', emoji: '🕊️', text: 'Nothing can be trampled, pranked or scorched on the land around it' },
};

/** the wishes at 11:11 */
export const WISHES = (ink: number, luck: number) => [
  { id: 'ink', emoji: '💧', name: `${ink} Ink`, text: 'More every wish in a row' },
  { id: 'luck', emoji: '🍀', name: `${luck} Luck`, text: 'Toward your next rolls' },
  { id: 'golden', emoji: '🌟', name: 'A Golden Hour', text: 'Your next 3 minigame wins pay double' },
  { id: 'ticket', emoji: '🎟️', name: 'A roll ticket', text: 'Epic or better — 11% are Legendary' },
] as const;

/** why an action can't be used right now, in words */
export const WHY: Record<string, string> = {
  next_week: 'Comes back next week', next_month: 'Comes back next month', tomorrow: 'Comes back tomorrow', gathering: 'Still gathering',
  no_leviathan: 'Only while the Leviathan is out', closed: 'Opens in the evening there', too_far: 'You need land within 5 km',
  no_tz: 'Set your time zone first', not_1111: 'Only at 11:11', already_wished: 'Wished this 11:11',
};

/** what each power's log lines say */
export function logLine(l: { k: string; [k: string]: any }): string {
  const R = (r: string) => `${rarityInfo(r).emoji ?? ''} ${rarityInfo(r).name}`.trim();
  switch (l.k) {
    case 'erupted': return `Erupted: ${l.n} obsidian spots`;
    case 'rooted': return `A root reached another of your plots (${l.n})`;
    case 'whispered': return `Whispered: a ${R(l.rarity)} nearby`;
    case 'galloped': return `Galloped${l.km != null ? ` ${l.km} km` : ''} to a new spot`;
    case 'beamed': return `Beamed to ${l.n} plot${l.n === 1 ? '' : 's'}`;
    case 'sprouted': return `A mushroom sprouted (${l.n})`;
    case 'pollinated': return `Pollinated ${l.n} neighbour${l.n === 1 ? '' : 's'} · +${l.ink} Ink honey`;
    case 'collected': return `Collected ${l.ink} Ink`;
    case 'gifted': return `Gave ${l.n} players a Golden Hour`;
    case 'decreed': return `Decreed: ${RULES[l.rule]?.name ?? l.rule}`;
    case 'called': return 'Called the Leviathan';
    case 'gazed': return `Gazed: ${l.n} spots worth claiming`;
    case 'showered': return `Called down ${l.n} shooting stars`;
    case 'rose': return `Raised ${l.n} spots of new land`;
    case 'placed': return 'Placed the Sunspot';
    case 'tore': return 'Tore a rift';
    case 'flipped': return 'Flipped the table';
    case 'transmuted': return `Transmuted five ${R(l.from)} into a ${R(l.to)}`;
    case 'rolled': return `Rolled a ${R(l.from)} → ${R(l.to)}`;
    case 'wished': return `Wished for ${l.pick} (${l.streak} in a row)`;
    default: return l.k;
  }
}

export const dur = (s: number | null | undefined) => {
  if (s == null) return '';
  const v = Math.max(0, Math.round(s));
  if (v >= 86400) return `${Math.floor(v / 86400)}d ${Math.floor((v % 86400) / 3600)}h`;
  if (v >= 3600) return `${Math.floor(v / 3600)}h ${Math.floor((v % 3600) / 60)}m`;
  if (v >= 60) return `${Math.floor(v / 60)}m`;
  return `${v}s`;
};

/** your powers (badges, the 11:11 banner) */
export function useMyPowers(enabled = true) {
  return useQuery({ queryKey: ['my-powers'], queryFn: api.myPowers, enabled: enabled && !!getBackend().session(), staleTime: 30_000, refetchInterval: 90_000 });
}
/** one plot's power */
export function usePower(gx: number | null, gy: number | null) {
  return useQuery({ queryKey: ['rarity-power', gx, gy], queryFn: () => api.rarityPower(gx!, gy!), enabled: gx != null && gy != null, staleTime: 10_000, refetchInterval: 30_000 });
}
export const readyCount = (list: RxPower[] | undefined) => (list ?? []).filter((p) => p.actions?.some((a) => a.ready && !a.visitor)).length;
