// The Leviathan's data and where it is. Its position is a pure function of time along its path (the server's
// private.lev_pos, mirrored here), so every screen moves it smoothly between polls and they all agree.
import { useQuery } from '@tanstack/react-query';
import { api, type LevState, type Leviathan } from '../backend/api';
import { useOnboardedMe } from '../lib/queries';

export const LEV_KEY = ['leviathan'];
let skew = 0; // server clock − ours (ms)

export function useLeviathan(fast = false) {
  const me = useOnboardedMe();
  return useQuery<LevState>({
    queryKey: [...LEV_KEY, !!me],
    queryFn: async () => {
      const t0 = Date.now();
      const r = await api.leviathanState();
      skew = Date.parse(r.server_time) - (t0 + Date.now()) / 2;
      return r;
    },
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

export const levMult = (l: Leviathan) => (l.shrunk_until && Date.parse(l.shrunk_until) > serverNow() ? 1.5 : 1) * (l.foretold_until && Date.parse(l.foretold_until) > serverNow() ? 1.25 : 1);
export const fmtDmg = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : Math.round(n).toLocaleString());
const until = (t: string | null | undefined) => !!t && Date.parse(t) > serverNow();
/** its powers right now (and the owner's rampage) */
export const levTiny = (l: Leviathan) => until(l.tiny_until);
export const levHidden = (l: Leviathan) => until(l.hidden_until);
export const levRampage = (l: Leviathan) => until(l.rampage_until);
/** how fast it's going, as a multiple of its normal pace */
export const levPace = (l: Leviathan) => Number(l.speed_kmh) / Math.max(0.001, Number(l.base_kmh || l.speed_kmh));
export const STATUS_TEXT: Record<string, string> = { warning: 'is rising', walking: 'walks the land', enraged: 'is ENRAGED', fleeing: 'is fleeing to the sea' };
