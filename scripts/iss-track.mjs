// 🛰️ The real sky calendar's ISS: where the station is over the ground, every 30 s for the next two days, from its public
// orbit data (CelesTrak's TLE for NORAD 25544, propagated with SGP4 by satellite.js). Written to public.sky_iss, where
// the database works out passes over each player's explorer itself (private.iss_passes) — no player's location ever
// leaves the game. Run every 6 hours by .github/workflows/sky.yml (and by hand from Actions → Sky).
//   SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… node scripts/iss-track.mjs        (DRY=1: print, don't write)
//   TLE_FILE=path: read the two lines from a file instead of fetching them
import fs from 'node:fs';
import * as sat from 'satellite.js';

const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE';
const STEP_S = 30, HOURS = 48;

export function trackFrom(l1, l2, from = Date.now(), hours = HOURS, step = STEP_S) {
  const rec = sat.twoline2satrec(l1.trim(), l2.trim());
  const out = [];
  const t0 = Math.floor(from / (step * 1000)) * step * 1000 - 10 * 60_000;
  for (let t = t0; t <= from + hours * 3_600_000; t += step * 1000) {
    const d = new Date(t);
    const pv = sat.propagate(rec, d);
    if (!pv.position || typeof pv.position === 'boolean') continue;
    const g = sat.eciToGeodetic(pv.position, sat.gstime(d));
    out.push({ at: d.toISOString(), lat: sat.degreesLat(g.latitude), lng: sat.degreesLong(g.longitude), alt: g.height });
  }
  return out;
}

async function tle() {
  const text = process.env.TLE_FILE ? fs.readFileSync(process.env.TLE_FILE, 'utf8') : await (await fetch(TLE_URL, { headers: { 'user-agent': 'landvas.app sky calendar' } })).text();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const l1 = lines.find((l) => l.startsWith('1 ')), l2 = lines.find((l) => l.startsWith('2 '));
  if (!l1 || !l2) throw new Error(`no TLE in: ${text.slice(0, 200)}`);
  return [l1, l2];
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [l1, l2] = await tle();
  const rows = trackFrom(l1, l2);
  console.log(`ISS: ${rows.length} points from ${rows[0]?.at} to ${rows.at(-1)?.at} (TLE epoch ${l1.slice(18, 32)})`);
  if (process.env.DRY) { console.log(rows.slice(0, 3)); process.exit(0); }
  if (!process.env.SUPABASE_ACCESS_TOKEN || !process.env.SUPABASE_PROJECT_REF) { console.error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF are required'); process.exit(1); }
  await query(`delete from public.sky_iss where at < now() - interval '2 hours'`);
  for (let i = 0; i < rows.length; i += 1500) {
    const vals = rows.slice(i, i + 1500).map((r) => `('${r.at}', ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}, ${r.alt.toFixed(1)})`).join(',');
    await query(`insert into public.sky_iss (at, lat, lng, alt_km) values ${vals} on conflict (at) do update set lat = excluded.lat, lng = excluded.lng, alt_km = excluded.alt_km`);
  }
  console.log('written');
}
