// The Leviathan's data and where it is. Its position is a pure function of time along its path (the server's
// private.lev_pos, mirrored here), so every screen moves it smoothly between polls and they all agree.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type LevState, type Leviathan } from '../backend/api';
import { cdnSkew, cdnSnapshot } from '../lib/cdn';
import { useOnboardedMe } from '../lib/queries';
import { levKey, levMerge, mineOf, type LevMine } from './levMerge';

export const LEV_KEY = ['leviathan'];
let skew = 0; // server clock − ours (ms)
/** your own part, kept between looks (it's asked far less often than the world's view) */
let mine: { at: number; key: string; uid: string; data: LevMine } | null = null;

/**
 * Everyone sees the same Leviathan: its state comes from the CDN's snapshot (no database call), and your own part —
 * bombs, damage, rank, loot — from leviathan_me: every look while you fight (`fast`) or while it's hidden, when it
 * changes stage, and once a minute otherwise (every five while none is out). Without the CDN it's the one old call.
 * `cur`: what's on screen now (an action's answer since the last look holds a newer copy of your part).
 */
export async function loadLeviathan(fast: boolean, myId: string | null, cur: LevState | undefined): Promise<LevState> {
  const t0 = Date.now();
  const world = await cdnSnapshot<LevState>('leviathan', fast ? 30_000 : 90_000);
  if (!world) {
    const r = await api.leviathanState();
    skew = Date.parse(r.server_time) - (t0 + Date.now()) / 2;
    return r;
  }
  skew = cdnSkew();
  if (!myId) { mine = null; return levMerge(world, null, null); }
  if (mine && mine.uid !== myId) mine = null;
  const key = levKey(world);
  const hides = !!world.lev?.hidden;
  if (cur && mine && Date.parse(cur.server_time) > Date.parse(mine.data.server_time) && levKey(cur) === mine.key) mine = { ...mine, data: mineOf(cur, hides) };
  const due = !mine || fast || hides || mine.key !== key || Date.now() - mine.at > (world.lev ? 60_000 : 300_000);
  if (due) {
    const t1 = Date.now();
    const m = await api.leviathanMe();
    skew = Date.parse(m.server_time) - (t1 + Date.now()) / 2;
    mine = { at: Date.now(), key, uid: myId, data: m };
  }
  return levMerge(world, mine!.data, myId);
}
/** (for tests) */
export const resetLeviathan = () => { mine = null; skew = 0; };

export function useLeviathan(fast = false) {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  return useQuery<LevState>({
    queryKey: [...LEV_KEY, !!me],
    queryFn: () => loadLeviathan(fast, me?.user_id ?? null, qc.getQueryData<LevState>([...LEV_KEY, true])),
    staleTime: 4_000,
    refetchInterval: (q) => (q.state.data?.lev ? (fast ? 4_000 : 10_000) : 60_000),
  });
}
export const serverNow = () => Date.now() + skew;

const km = (a: [number, number], b: [number, number]) => {
  const R = 6371, dLat = ((b[1] - a[1]) * Math.PI) / 180, dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

/** where it is at a moment (ms, server clock) — while it's hidden from you, only the middle of the hazy area */
export function levPos(l: Leviathan, t = serverNow()) {
  if (!l.path) return { lng: Number(l.pos.lng), lat: Number(l.pos.lat), km: 0, seg: 0, heading: 0, paused: false, done: false, haze: true };
  const resume = Math.max(Date.parse(l.walk_at), l.pause_until ? Date.parse(l.pause_until) : 0);
  const prog = Number(l.walk_s) + Math.max(0, (t - resume) / 1000);
  const want = (prog / 3600) * Number(l.speed_kmh);
  let acc = 0;
  const p = l.path;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i].map(Number) as [number, number], b = p[i + 1].map(Number) as [number, number];
    const seg = km(a, b);
    if (acc + seg >= want) {
      const f = seg > 0 ? (want - acc) / seg : 0;
      return { lng: a[0] + (b[0] - a[0]) * f, lat: a[1] + (b[1] - a[1]) * f, km: want, seg: i, heading: Math.atan2(b[0] - a[0], b[1] - a[1]), paused: t < resume, done: false };
    }
    acc += seg;
  }
  const z = p[p.length - 1];
  return { lng: Number(z[0]), lat: Number(z[1]), km: acc, seg: p.length - 2, heading: 0, paused: false, done: true };
}

/** the path still ahead of it, from where it is now */
export function pathAhead(l: Leviathan, pos = levPos(l)): [number, number][] {
  if (!l.path) return [];
  return [[pos.lng, pos.lat], ...l.path.slice(pos.seg + 1).map((x) => [Number(x[0]), Number(x[1])] as [number, number])];
}

export const levMult = (l: Leviathan) => (l.shrunk_until && Date.parse(l.shrunk_until) > serverNow() ? 1.5 : 1) * (l.foretold_until && Date.parse(l.foretold_until) > serverNow() ? 1.25 : 1) * (l.weakspot_until && Date.parse(l.weakspot_until) > serverNow() ? 2 : 1);
export const fmtDmg = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : Math.round(n).toLocaleString());
const until = (t: string | null | undefined) => !!t && Date.parse(t) > serverNow();
/** its powers right now (and the owner's rampage) */
export const levTiny = (l: Leviathan) => until(l.tiny_until);
export const levHidden = (l: Leviathan) => until(l.hidden_until);
export const levRampage = (l: Leviathan) => until(l.rampage_until);
/** how fast it's going, as a multiple of its normal pace */
export const levPace = (l: Leviathan) => Number(l.speed_kmh) / Math.max(0.001, Number(l.base_kmh || l.speed_kmh));
export const STATUS_TEXT: Record<string, string> = { warning: 'is rising', walking: 'walks the land', enraged: 'is ENRAGED', fleeing: 'is fleeing to the sea' };
