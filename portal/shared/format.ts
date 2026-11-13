// Number, money, time and label formatting shared by both portals.

const nf = new Intl.NumberFormat('en-US');
export const int = (n: unknown) => nf.format(Math.round(Number(n ?? 0)));
export const num = (n: unknown, digits = 2) => new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(Number(n ?? 0));
export const compact = (n: unknown) => {
  const v = Number(n ?? 0);
  return Math.abs(v) < 10000 ? int(v) : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
};
export const signed = (n: unknown) => { const v = Number(n ?? 0); return `${v > 0 ? '+' : v < 0 ? '−' : ''}${int(Math.abs(v))}`; };
export const pct = (n: unknown, digits = 1) => `${num(Number(n ?? 0) * 100, digits)}%`;

/** USD with enough decimals to show tiny rent amounts (players earn fractions of a cent) */
export function usd(n: unknown, opts: { min?: number; max?: number } = {}) {
  const v = Number(n ?? 0);
  const a = Math.abs(v);
  const max = opts.max ?? (a === 0 ? 2 : a >= 1 ? 2 : a >= 0.01 ? 4 : a >= 0.0001 ? 6 : 9);
  return `${v < 0 ? '−' : ''}$${a.toLocaleString('en-US', { minimumFractionDigits: Math.min(opts.min ?? 2, max), maximumFractionDigits: max })}`;
}
/** a USD-per-second rate in the units people think in */
export const perDay = (perSecond: unknown) => Number(perSecond ?? 0) * 86400;
export const perMonth = (perSecond: unknown) => Number(perSecond ?? 0) * 86400 * 30;

export const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
export const dateShort = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—');
export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
export const time = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—');
export function ago(iso: string | null | undefined) {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 0) return 'just now';
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return date(iso);
}
export function duration(ms: unknown) {
  const s = Math.round(Number(ms ?? 0) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
export const tzName = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };

export const RESOURCES: Record<string, string> = { ink: 'Ink', pigments: 'Pigments', brush_points: 'XP', gallery_tokens: 'Tokens', usd: 'USD' };
export const resourceName = (r: string) => RESOURCES[r] ?? words(r);

const REASONS: Record<string, string> = {
  minigame_reward: 'Plot minigames', minigame: 'Plot minigames', acquire_plot: 'Buying plots', starter_bonus: 'Welcome bonus', publish_reward: 'Publishing art',
  daily_wheel: 'Daily wheel', daily_streak: 'Daily streak', admin_adjustment: 'Adjustment by LANDVAS', referral_share: 'Invite share', referral_reward: 'Invite reward',
  fresh_start_event: 'Fresh Start credit', integrity_penalty: 'Fair-play correction', integrity_refund: 'Fair-play refund', achievement: 'Achievements',
  upgrade_plot: 'Plot upgrades', boost: 'Rent boosts', convert: 'USD → Ink conversion', luck: 'Luck', inkborn: 'Inkborn', farm: 'Farm', arcade: 'Arcade',
  business: 'Business', space: 'Space', realm: 'Realms', travel: 'Travel', pvp: 'PvP', challenge: 'Challenges', craft: 'Crafting', inspire: 'Inspire',
  inspire_given: 'Inspiring others', room_visit: 'Room visits', room_host: 'Hosting visitors', enchantment: 'Enchantments', group_game: 'Group games',
  finds: 'Finds', sketch: 'Sketch', doodle: 'Doodle', duet: 'Duet', ad_reward: 'Rewarded ads', shop: 'Shop', clan: 'Clans', rent: 'Plot rent',
  cashout_hold: 'Cash-out on hold', cashout_release: 'Cash-out returned', cashout_paid: 'Cashed out', adjustment: 'Adjustment by LANDVAS',
};
export const words = (s: string | null | undefined) => {
  const t = String(s ?? '').replace(/[_.-]+/g, ' ').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : '—';
};
export const reasonName = (r: string | null | undefined) => (r && REASONS[r]) || words(r);

/** plot coordinates as players see them in the game */
export const plotLabel = (gx: number, gy: number) => `${gx.toLocaleString('en-US').replace(/,/g, ' ')} · ${gy.toLocaleString('en-US').replace(/,/g, ' ')}`;

export function downloadFile(name: string, text: string, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}
