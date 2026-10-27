// Offline place search (countries and ~3,000 major cities) — no GPS, no geocoding API needed.
import placesUrl from '../data/places.json?url';

export type Place = { kind: 'country' | 'city'; name: string; sub: string; lng: number; lat: number; zoom: number; bbox?: [number, number, number, number]; pop?: number };

let data: Promise<{ countries: [string, number, number, number, number][]; cities: [string, string, number, number, number][] }> | null = null;
const load = () => (data ??= fetch(placesUrl).then((r) => r.json()));

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let regionNames: Intl.DisplayNames | null = null;
const countryName = (cc: string) => {
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(cc) ?? cc;
  } catch {
    return cc;
  }
};

export async function searchPlaces(q: string, limit = 8): Promise<Place[]> {
  const query = norm(q.trim());
  if (query.length < 2) return [];
  const d = await load();
  const scored: { p: Place; s: number }[] = [];
  for (const [name, w, s, e, n] of d.countries) {
    const nn = norm(name);
    const idx = nn.indexOf(query);
    if (idx < 0) continue;
    const span = Math.max(e - w, n - s);
    const zoom = Math.max(2, Math.min(8, Math.log2(360 / Math.max(span, 0.5)) + 0.6));
    scored.push({ p: { kind: 'country', name, sub: 'Country', lng: (w + e) / 2, lat: (s + n) / 2, zoom, bbox: [w, s, e, n] }, s: (idx === 0 ? 0 : 50) + (nn === query ? -40 : 0) });
  }
  for (const [name, cc, lng, lat, pop] of d.cities) {
    const nn = norm(name);
    const idx = nn.indexOf(query);
    if (idx < 0) continue;
    scored.push({ p: { kind: 'city', name, sub: countryName(cc), lng, lat, zoom: 12.5, pop }, s: (idx === 0 ? 10 : 60) + (nn === query ? -30 : 0) - Math.log10(pop) * 4 });
  }
  return scored.sort((a, b) => a.s - b.s).slice(0, limit).map((x) => x.p);
}

/** Major cities inside a bbox for offline map labels, thinned by zoom. */
export async function citiesInView(w: number, s: number, e: number, n: number, zoom: number, max = 36) {
  const d = await load();
  const minPop = zoom < 3 ? 8e6 : zoom < 4 ? 4e6 : zoom < 5 ? 2e6 : zoom < 6 ? 1e6 : zoom < 7.5 ? 5e5 : 1.5e5;
  const out: { name: string; lng: number; lat: number }[] = [];
  for (const [name, , lng, lat, pop] of d.cities) {
    if (pop < minPop) break; // sorted by population
    const inLng = w <= e ? lng >= w && lng <= e : lng >= w || lng <= e;
    if (inLng && lat >= s && lat <= n) out.push({ name, lng, lat });
    if (out.length >= max) break;
  }
  return out;
}
