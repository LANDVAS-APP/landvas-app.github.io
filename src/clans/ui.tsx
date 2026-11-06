// Small pieces shared by the clan screens and the clan hall.
import type { ClanCard } from '../backend/types';
import { cn } from '../lib/utils';

export function ClanBadge({ c, size = 44, className }: { c: Pick<ClanCard, 'emblem' | 'color'>; size?: number; className?: string }) {
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-2xl shadow-lg', className)}
      style={{ width: size, height: size, fontSize: size * 0.55, background: `linear-gradient(145deg, ${c.color}, ${c.color}99)`, boxShadow: `0 0 0 2px ${c.color}55, 0 6px 18px ${c.color}44` }}>
      {c.emblem}
    </span>
  );
}

export const ROLE_LABEL = { leader: '👑 Leader', officer: '⭐ Officer', member: 'Member' } as const;
export const PRIVACY_LABEL = { open: 'Anyone can join', request: 'Ask to join', invite: 'Invite only' } as const;

/** "2d 4h", "3h 12m", "5m" */
export function until(iso: string | null | undefined) {
  if (!iso) return '';
  const s = Math.max(0, (new Date(iso).getTime() - Date.now()) / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
}

/** the clan's banner as a picture, for the frames in the hall */
export function bannerUrl(c: Pick<ClanCard, 'emblem' | 'color' | 'tag' | 'name'>) {
  const esc = (t: string) => t.replace(/[<&>"]/g, (ch) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' })[ch]!);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400" viewBox="0 0 320 400">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.color}"/><stop offset="1" stop-color="#1B1430"/></linearGradient></defs>
    <rect width="320" height="400" fill="#141020"/>
    <path d="M30 20 H290 V300 L160 380 L30 300 Z" fill="url(#g)" stroke="#FFD23F" stroke-width="8"/>
    <text x="160" y="190" font-size="130" text-anchor="middle" dominant-baseline="middle">${esc(c.emblem)}</text>
    <text x="160" y="300" font-size="44" font-weight="900" font-family="system-ui, sans-serif" fill="#fff" text-anchor="middle">[${esc(c.tag)}]</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function Bar({ v, max, color, className }: { v: number; max: number; color: string; className?: string }) {
  const p = max > 0 ? Math.min(100, (v / max) * 100) : 100;
  return <div className={cn('h-2.5 overflow-hidden rounded-full bg-black/25', className)}><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${p}%`, background: color }} /></div>;
}
