// What you're up to, for your friends: the screen you're on (and, out in space, the world and
// whether you're digging). Sent when it changes and refreshed every minute and a half.
import { poll } from '../lib/poll';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { ActivityKind, Profile, SpaceState, Whereabouts } from '../backend/types';
import { invalidateGame } from '../lib/queries';
import { SPACE_KEY } from '../space/useSpace';
import { savePose } from '../space/live';
import { worldOf } from '../space/worlds';

let override: { kind: ActivityKind; detail: Record<string, string> } | null = null;
let lastKey = '', lastAt = 0, timer: ReturnType<typeof setTimeout> | null = null;
const send = (kind: ActivityKind, detail: Record<string, string>) => {
  const key = kind + JSON.stringify(detail);
  if (key === lastKey && Date.now() - lastAt < poll(90_000)) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { lastKey = key; lastAt = Date.now(); void api.setActivity(kind, detail).catch(() => {}); }, 4000); // once you settle on a screen, not on every hop
};
/** A screen can say more than its route does (digging, a planet). Pass null to stop. */
export function reportActivity(kind: ActivityKind | null, detail: Record<string, string> = {}) {
  override = kind ? { kind, detail } : null;
  if (override) send(override.kind, override.detail);
}

function fromPath(path: string, space: SpaceState | undefined): { kind: ActivityKind; detail: Record<string, string> } {
  const seg = path.split('/').filter(Boolean);
  const onWorld = space && space.location !== 'earth' && !space.dest ? space.location : null;
  if (!seg.length || seg[0] === 'world') return onWorld ? { kind: 'planet', detail: { world: onWorld } } : { kind: 'map', detail: {} };
  if (seg[0] === 'space') {
    if (seg[1] === 'surface') return { kind: 'planet', detail: onWorld ? { world: onWorld } : {} };
    if (seg[1] === 'play') return { kind: 'game', detail: { game: seg[2] ?? '' } };
    if (seg[1] === 'planet') return { kind: 'game', detail: { game: seg[5] ?? '', world: decodeURIComponent(seg[2] ?? '') } };
    return { kind: 'space', detail: {} };
  }
  if (seg[0] === 'inkborn' && seg[1] === 'play') return { kind: 'game', detail: { game: seg[2] ?? '' } };
  if (seg[0] === 'inkborn' && seg[1] === 'playdate') return { kind: 'playdate', detail: {} };
  if (seg[0] === 'inkborn') return { kind: 'inkborn', detail: {} };
  if (seg[0] === 'habitat') return { kind: 'sanctuary', detail: {} };
  if (seg[0] === 'play' || seg[0] === 'game') return { kind: 'game', detail: { game: seg[1] ?? '' } };
  if (['create', 'editor', 'canvases', 'sketch', 'duet', 'doodle'].includes(seg[0])) return { kind: 'create', detail: {} };
  if (['gallery', 'art'].includes(seg[0])) return { kind: 'gallery', detail: {} };
  if (seg[0] === 'social') return { kind: 'social', detail: {} };
  return { kind: 'other', detail: {} };
}

/** Mounted once, inside the router. */
export function useActivityReporter(enabled: boolean) {
  const loc = useLocation();
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.hidden) return;
      const a = override ?? fromPath(loc.pathname, qc.getQueryData<SpaceState>(SPACE_KEY));
      send(a.kind, a.detail);
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [enabled, loc.pathname, qc]);
}

const GAME_NAMES: Record<string, string> = {};
export const registerGameNames = (names: Record<string, string>) => Object.assign(GAME_NAMES, names);
const placeOf = (w: Whereabouts) => (w.space && w.space.location !== 'earth' ? worldOf(w.space.location, w.space.home_seed, w.space.home_name)?.name ?? 'deep space' : null);

/** "Digging on Mars", "Exploring the Moon · 3/10", "Playing Rock Run", "Online" … */
export function describeWhereabouts(w: Whereabouts | undefined) {
  if (!w) return null;
  const place = placeOf(w);
  const a = w.activity;
  if (w.space?.dest) return `🚀 flying to ${worldOf(w.space.dest, w.space.home_seed, w.space.home_name)?.name ?? 'deep space'}`;
  if (a?.kind === 'dig') return `⛏️ digging${place ? ` on ${place}` : ''}`;
  if (a?.kind === 'game') return `🎮 playing ${GAME_NAMES[a.detail.game] ?? a.detail.game ?? 'a game'}${place ? ` on ${place}` : ''}`;
  if (place && w.space?.at_home) return `🏡 at home on ${place}`;
  if (place && w.room?.live) return `🪐 exploring ${place} · ${w.room.in_room}/${w.room.room_size}`;
  if (place) return `🪐 on ${place}`;
  if (!w.online) return null;
  const map: Partial<Record<string, string>> = { map: '🗺️ on the map', inkborn: '🐾 with their Inkborn', sanctuary: '🌳 in a sanctuary', playdate: '🧺 on a playdate',
    create: '🎨 creating', gallery: '🖼️ in the gallery', social: '💬 chatting', space: '🛰️ at mission control' };
  return map[a?.kind ?? ''] ?? '🟢 online';
}
/** Can I warp to them? (out on a world, not mid-flight; their live group has room, or they're a friend) */
export const canWarpTo = (w: Whereabouts | undefined, friend: boolean) =>
  !!w?.space && w.space.location !== 'earth' && !w.space.dest && (friend || (!!w.room?.live && (w.room.in_room ?? 0) < (w.room.room_size ?? 10)));

/** Warp next to someone and drop onto the World tab there. */
export function useWarpTo() {
  const qc = useQueryClient();
  const nav = useNavigate();
  return async (p: Profile) => {
    try {
      const r = await api.warpToPlayer(p.id);
      if (r.spawn?.d) savePose(r.location, { d: r.spawn.d, face: [0, 1, 0], hop: 0 });
      qc.setQueryData(SPACE_KEY, r); invalidateGame(qc);
      toast.success(`⚡ Warped to @${p.username} on ${worldOf(r.location, r.home_seed, r.home_name)?.name ?? 'their world'}`);
      nav('/world');
    } catch (e) { toast.error(toGameError(e).message); }
  };
}
