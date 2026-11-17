// Where you are, as a traveller wants to know it on arriving: the town or city (and the part of it you're in), its
// country and flag, the local time there, and when the sun rises and sets. All of it worked out here, with nothing new
// to download: the place names are the map's own labels (the street tiles' `place` layer), the country is the one the
// nearest airport is in, and the time zone is that country's zone whose city is nearest (the IANA zone table).
import { api } from '../backend/api';
import { sunPosition } from './astro';
import { decodeTile, maybeGunzip, type MvtLayer } from './mvt';
import { streetsSource } from './world';
import { allZones } from './zones';

export type Whereabouts = {
  /** the town or city (or village) you're in or nearest to */ city: string | null;
  /** 'city' | 'town' | 'village' | 'hamlet' … */ kind: string | null;
  /** the part of it (a suburb, a quarter, a neighbourhood), when it has its own name */ area: string | null;
  /** a capital (of its country, or of its state) */ capital: number;
  country: string | null; cc: string | null; flag: string | null;
  /** the IANA time zone (e.g. "Europe/Paris") */ zone: string | null;
};

const RAD = Math.PI / 180;
/** km between two points */
export const kmBetween = (lng1: number, lat1: number, lng2: number, lat2: number) => {
  const dLat = (lat2 - lat1) * RAD, dLng = (lng2 - lng1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
};

// ---- the place names, from the map's labels -------------------------------------------------------------------------
const placeTiles = new Map<string, Promise<MvtLayer | null>>();
async function placeLayer(z: number, x: number, y: number): Promise<MvtLayer | null> {
  const key = `${z}/${x}/${y}`;
  let p = placeTiles.get(key);
  if (!p) {
    p = (async () => {
      const src = await streetsSource();
      if (!src || z > src.maxzoom) return null;
      const r = await fetch(src.template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))).catch(() => null);
      if (!r?.ok) return null;
      return decodeTile(await maybeGunzip(await r.arrayBuffer()), new Set(['place'])).place ?? null;
    })().catch(() => null);
    placeTiles.set(key, p);
    if (placeTiles.size > 24) placeTiles.delete(placeTiles.keys().next().value!);
  }
  return p;
}

type Label = { name: string; cls: string; capital: number; lng: number; lat: number; km: number };
const SETTLEMENT = new Set(['city', 'town', 'village', 'hamlet']);
const AREA = new Set(['suburb', 'quarter', 'neighbourhood', 'borough']);
const nameOf = (p: Record<string, unknown>) => String(p['name:en'] ?? p.name_en ?? p['name:latin'] ?? p.name ?? '').trim();

/** the labels round a spot at a zoom: its tile and the three neighbours on the side it's nearest */
async function labelsAt(lng: number, lat: number, z: number): Promise<Label[]> {
  const n = 2 ** z;
  const X = ((lng + 180) / 360) * n, r = lat * RAD;
  const Y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const tx = Math.floor(X), ty = Math.floor(Y);
  const dx = X - tx < 0.5 ? -1 : 1, dy = Y - ty < 0.5 ? -1 : 1;
  const tiles = [[tx, ty], [tx + dx, ty], [tx, ty + dy], [tx + dx, ty + dy]].filter(([, y]) => y >= 0 && y < n);
  const out: Label[] = [];
  await Promise.all(tiles.map(async ([x, y]) => {
    const wx = ((x % n) + n) % n;
    const L = await placeLayer(z, wx, y);
    if (!L) return;
    for (const f of L.features) {
      if (f.type !== 1 || !f.parts[0]) continue;
      const name = nameOf(f.props), cls = String(f.props.class ?? '');
      if (!name || (!SETTLEMENT.has(cls) && !AREA.has(cls))) continue;
      const fx = (x + f.parts[0][0] / L.extent) / n, fy = (y + f.parts[0][1] / L.extent) / n;
      const flng = fx * 360 - 180, flat = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * fy)));
      out.push({ name, cls, capital: Number(f.props.capital ?? 0), lng: flng, lat: flat, km: kmBetween(lng, lat, flng, flat) });
    }
  }));
  return out;
}

/** the settlement you're in (a city's label counts from further off than a village's), and the part of it */
async function placeNames(lng: number, lat: number) {
  const [wide, close] = await Promise.all([labelsAt(lng, lat, 10), labelsAt(lng, lat, 12)]);
  const all = [...wide, ...close];
  const reach: Record<string, number> = { city: 14, town: 6, village: 2.5, hamlet: 1.2 };
  // the biggest place whose reach you're inside; else simply the nearest settlement
  const rank = (l: Label) => (l.cls === 'city' ? 0 : l.cls === 'town' ? 1 : l.cls === 'village' ? 2 : 3);
  const settlements = all.filter((l) => SETTLEMENT.has(l.cls));
  const inside = settlements.filter((l) => l.km <= (reach[l.cls] ?? 1)).sort((a, b) => rank(a) - rank(b) || a.km - b.km);
  const near = settlements.filter((l) => l.km < 40).sort((a, b) => a.km / (4 - rank(a)) - b.km / (4 - rank(b)));
  const town = inside[0] ?? near[0] ?? null;
  const area = all.filter((l) => AREA.has(l.cls) && l.km < 2.5 && l.name !== town?.name).sort((a, b) => a.km - b.km)[0] ?? null;
  return { town, area };
}

// ---- the country and its clock ----------------------------------------------------------------------------------------
const countryCache = new Map<string, Promise<string | null>>();
/** the country you're in: the one the nearest airport is in */
function countryAt(lng: number, lat: number): Promise<string | null> {
  const key = `${lng.toFixed(1)},${lat.toFixed(1)}`;
  let p = countryCache.get(key);
  if (!p) {
    p = api.travelSearch('plane', null, { lng, lat })
      .then((r) => { const s = (r ?? [])[0]; return s && (s.from_point_km ?? 0) < 400 ? String(s.country || '').toUpperCase() || null : null; })
      .catch(() => null);
    countryCache.set(key, p);
  }
  return p;
}

/** the time zone: the country's own zone whose city is nearest (anywhere, if the country is unknown and a zone city is
 *  near); out at sea, the sun's own hour */
export function zoneAt(lng: number, lat: number, cc: string | null): string {
  const zs = allZones();
  const pool = cc ? zs.filter((z) => z.cc === cc) : zs;
  let best: string | null = null, bd = Infinity;
  for (const z of pool.length ? pool : zs) { const d = kmBetween(lng, lat, z.lng, z.lat); if (d < bd) { bd = d; best = z.zone; } }
  if (best && (cc || bd < 900)) return best;
  const h = Math.round(lng / 15);
  return h === 0 ? 'UTC' : `Etc/GMT${h > 0 ? '-' : '+'}${Math.abs(h)}`; // (Etc zones count the other way)
}

const flagOf = (cc: string) => /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : null;
let names: Intl.DisplayNames | null = null;
const countryName = (cc: string) => { try { return (names ??= new Intl.DisplayNames(['en'], { type: 'region' })).of(cc) ?? cc; } catch { return cc; } };

/** everything about where you are */
export async function whereabouts(lng: number, lat: number): Promise<Whereabouts> {
  const [{ town, area }, cc] = await Promise.all([placeNames(lng, lat).catch(() => ({ town: null, area: null })), countryAt(lng, lat)]);
  return {
    city: town?.name ?? null, kind: town?.cls ?? null, area: area?.name ?? null, capital: town?.capital ?? 0,
    country: cc ? countryName(cc) : null, cc, flag: cc ? flagOf(cc) : null, zone: zoneAt(lng, lat, cc),
  };
}

// ---- the clock there ------------------------------------------------------------------------------------------------
const fmts = new Map<string, Intl.DateTimeFormat>();
const fmt = (zone: string, o: Intl.DateTimeFormatOptions) => {
  const k = `${zone}|${JSON.stringify(o)}`;
  let f = fmts.get(k);
  if (!f) { try { f = new Intl.DateTimeFormat('en-US', { timeZone: zone, ...o }); } catch { f = new Intl.DateTimeFormat('en-US', o); } fmts.set(k, f); }
  return f;
};
/** "3:42 PM" in that zone */
export const localTime = (zone: string, ms = Date.now()) => fmt(zone, { hour: 'numeric', minute: '2-digit' }).format(ms);
/** "Tuesday" in that zone */
export const localDay = (zone: string, ms = Date.now()) => fmt(zone, { weekday: 'long' }).format(ms);
/** "GMT-7" for that zone (now) */
export const utcOffset = (zone: string, ms = Date.now()) => {
  try { return fmt(zone, { timeZoneName: 'shortOffset' }).formatToParts(ms).find((p) => p.type === 'timeZoneName')?.value ?? ''; } catch { return ''; }
};
/** a zone's offset from UTC (minutes) at a moment */
const offsetMin = (zone: string, ms: number) => {
  const p = fmt(zone, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(ms);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - Math.floor(ms / 60_000) * 60_000) / 60_000);
};
/** hours that zone's clock is ahead of yours (negative: behind) */
export const hoursFromHere = (zone: string, ms = Date.now()) => (offsetMin(zone, ms) - offsetMin(Intl.DateTimeFormat().resolvedOptions().timeZone, ms)) / 60;

/** when the sun rises and sets there today (ms), or null where it doesn't (polar day or night) */
export function sunTimes(lng: number, lat: number, ms = Date.now()): { rise: number | null; set: number | null } {
  // walk the day in 10-minute steps from local midnight (by the sun), then refine each crossing
  const noon = ms - (((ms / 3_600_000 + lng / 15) % 24) + 24) % 24 * 3_600_000 + 12 * 3_600_000;
  const start = noon - 12 * 3_600_000;
  const alt = (t: number) => sunPosition(t, lat, lng).alt + 0.0145; // (refraction and the sun's own size)
  let rise: number | null = null, set: number | null = null, prev = alt(start);
  for (let i = 1; i <= 144; i++) {
    const t = start + i * 600_000, a = alt(t);
    if (prev < 0 && a >= 0 && rise == null) rise = t - 600_000 * (a / (a - prev));
    if (prev >= 0 && a < 0 && set == null) set = t - 600_000 * (a / (a - prev));
    prev = a;
  }
  return { rise, set };
}
