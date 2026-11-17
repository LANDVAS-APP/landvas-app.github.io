// Hot Zones: one real city a day where rarities roll better (the better of two rolls), ultras are 5× likelier and
// shiny 2×. Shown on simple mode's home, as a chip on the map, and as a glowing circle over the city.
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { explorerCell, useExplorer } from '../explorer/explorer';
import { api } from '../backend/api';
import { useOnboardedMe } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { GRID_SIZE } from '../shared/grid';

export function useHotZone() {
  const me = useOnboardedMe();
  return useQuery({ queryKey: ['hot-zone'], queryFn: api.hotZone, enabled: !!me, staleTime: 10 * 60_000 });
}
/** is this plot inside today's Hot Zone? (the same circle the server uses) */
export const inHotZone = (z: { gx: number; gy: number; radius: number } | null | undefined, gx: number, gy: number) =>
  !!z && (gx - z.gx) ** 2 + (gy - z.gy) ** 2 <= z.radius ** 2;
/** one line in the claim preview when the plot is inside today's zone: what the zone does for this claim */
export function HotZoneFact({ gx, gy }: { gx: number; gy: number }) {
  const q = useHotZone();
  const z = q.data?.today;
  if (!z || !inHotZone(z, gx, gy)) return null;
  return (
    <span className="lv-cpv-fact" style={{ background: 'linear-gradient(135deg, rgba(255,106,31,.3), rgba(255,45,111,.3))', color: '#FFD0B0' }} data-testid="hot-zone-buy">
      🔥 Hot Zone · {z.name}: better roll, {q.data!.ultra_mult}× ultras, {q.data!.shiny_mult}× shiny
    </span>
  );
}
/** is your explorer standing inside today's Hot Zone right now? (re-checked as you walk or fly) */
export function useInHotZone() {
  const q = useHotZone();
  const z = q.data?.today ?? null;
  // (re-checked when you've moved a little or set off somewhere: not every frame of steering)
  const st = useExplorer((s) => (s.state ? `${s.state.mode}:${s.state.dest ? 'go' : ''}:${Math.round(s.state.lng * 2000)}:${Math.round(s.state.lat * 2000)}` : ''));
  const [inside, setInside] = useState(false);
  useEffect(() => {
    if (!z) { setInside(false); return; }
    const check = () => { const c = explorerCell(); setInside(!!c && inHotZone(z, c.gx, c.gy)); };
    check();
    const t = setInterval(check, 4000);
    return () => clearInterval(t);
  }, [z?.gx, z?.gy, z?.radius, st]); // eslint-disable-line react-hooks/exhaustive-deps
  return inside;
}

type WikiSummary = { title: string; extract: string; url: string; thumb?: string };
/** a short Wikipedia summary of the city (cached for the day; nothing shows if it can't be found) */
async function wikiSummary(name: string, region: string | null): Promise<WikiSummary | null> {
  const tries = [region ? `${name}, ${region}` : null, name].filter(Boolean) as string[];
  for (const t of tries) {
    try {
      const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, '_'))}`, { headers: { accept: 'application/json' } });
      if (!r.ok) continue;
      const j = await r.json();
      if (j.type !== 'standard' || !j.extract) continue;
      // two sentences is plenty for a game card
      const two = (j.extract as string).match(/[^.!?]+[.!?]+(\s|$)/g)?.slice(0, 2).join('').trim() || j.extract;
      return { title: j.title, extract: two, url: j.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(t)}`, thumb: j.thumbnail?.source };
    } catch { /* offline or blocked — try the next title */ }
  }
  return null;
}
const PAINT_IDEAS = [
  (c: string) => `Paint ${c}’s skyline at sunset`,
  (c: string) => `A postcard: “Greetings from ${c}”`,
  (c: string) => `The local food ${c} is known for`,
  (c: string) => `Your favourite spot in ${c}`,
  (c: string) => `${c} at night, lights on`,
  (c: string) => `A street-art mural for ${c}`,
  (c: string) => `${c}’s weather today, as a painting`,
];
const fmtPop = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} million` : n >= 1e3 ? `${Math.round(n / 1e3)},000` : String(n));
/** "About {city}": quick facts, a Wikipedia blurb and paint ideas — on the Hot Zone sheet and card */
export function HotZoneTrivia({ compact }: { compact?: boolean }) {
  const q = useHotZone();
  const z = q.data?.today;
  const a = q.data?.about ?? null;
  const [open, setOpen] = useState(!compact);
  const region = a ? (a.country === 'US' ? a.state : a.country_name) : null;
  const wiki = useQuery({ queryKey: ['hot-zone-wiki', z?.name, region], queryFn: () => wikiSummary(z!.name, region), enabled: !!z && open, staleTime: Infinity, gcTime: 24 * 3600_000, retry: false });
  if (!z) return null;
  const day = Math.floor(new Date(z.day).getTime() / 86400000) || 0;
  const ideas = [0, 3, 5].map((k) => PAINT_IDEAS[(day + k) % PAINT_IDEAS.length](z.name));
  if (!open) return (
    <button className="mt-2.5 w-full rounded-xl bg-white/[.06] px-3 py-2 text-left text-[12px] font-bold text-white/80" onClick={() => setOpen(true)} data-testid="hot-zone-trivia-open">
      📖 About {z.name} <span className="text-white/45">· trivia &amp; paint ideas</span>
    </button>
  );
  const facts: string[] = [];
  if (a) {
    const where = [a.state, a.country_name ?? a.country].filter(Boolean).join(', ');
    if (where) facts.push(`📍 ${where}`);
    if (a.pop > 0) facts.push(`👥 About ${fmtPop(a.pop)} people${a.pop_rank > 0 && a.pop_rank <= 500 ? ` · ${a.pop_rank === 1 ? 'the biggest city' : `#${a.pop_rank} biggest city`} in ${a.country === 'US' ? 'the US' : a.country_name ?? 'the country'}` : ''}`);
    facts.push(a.plots > 0 ? `🗺️ ${fmt(a.plots)} plot${a.plots === 1 ? '' : 's'} claimed here by players` : '🗺️ No one has claimed a plot here yet — be first!');
    facts.push(a.crown_holder ? `👑 Crown holder: ${a.crown_holder}` : '👑 No one holds the Crown');
  }
  return (
    <div className={cn('grid gap-2 rounded-2xl bg-white/[.05] p-3 text-[12px]', compact && 'mt-2.5')} data-testid="hot-zone-trivia">
      <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#FFB27A]">📖 About {z.name}</div>
      {wiki.data && (
        <div className="flex gap-2.5">
          {wiki.data.thumb && <img src={wiki.data.thumb} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" />}
          <p className="leading-snug text-white/85">{wiki.data.extract} <a href={wiki.data.url} target="_blank" rel="noreferrer" className="whitespace-nowrap text-[11px] font-bold text-[#FFB27A] underline">Wikipedia</a></p>
        </div>
      )}
      {wiki.isLoading && <p className="text-white/40">Looking up {z.name}…</p>}
      {facts.length > 0 && <ul className="grid gap-1 text-white/80">{facts.map((f) => <li key={f}>{f}</li>)}</ul>}
      <div>
        <div className="mb-1 text-[11px] font-bold text-white/55">🎨 Paint ideas for your plot here</div>
        <ul className="grid gap-0.5 text-white/75">{ideas.map((i) => <li key={i}>• {i}</li>)}</ul>
      </div>
    </div>
  );
}
/** the city's centre as [lng, lat] */
export function hotCenter(z: { gx: number; gy: number }): [number, number] {
  const lng = ((z.gx + 0.5) / GRID_SIZE) * 360 - 180;
  const n = Math.PI * (1 - (2 * (z.gy + 0.5)) / GRID_SIZE);
  return [lng, (180 / Math.PI) * Math.atan(Math.sinh(n))];
}
export function endsIn(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${Math.max(m, 1)}m`;
}

/** simple mode's Hot Zone card: roll a plot inside today's city */
export function HotZoneCard({ onRoll, cost, free, canBuy }: { onRoll(): void; cost: number; free: boolean; canBuy: boolean }) {
  const q = useHotZone();
  const z = q.data?.today;
  if (!z) return null;
  return (
    <motion.button whileTap={{ scale: 0.97 }} onClick={onRoll} disabled={!canBuy} data-testid="hot-zone-roll"
      className="relative overflow-hidden rounded-[24px] border-[1.5px] border-[#FF8A3D]/50 bg-[linear-gradient(135deg,#4A1606,#1C0A1F)] p-4 text-left shadow-[0_0_40px_-14px_#FF6A1F] disabled:opacity-70">
      <motion.div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[#FF6A1F]/40 blur-2xl" animate={{ scale: [1, 1.25, 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 2.4, repeat: Infinity }} />
      <div className="relative flex items-center gap-3">
        <motion.span className="text-[38px] leading-none" animate={{ rotate: [-6, 6, -6] }} transition={{ duration: 1.6, repeat: Infinity }}>🔥</motion.span>
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#FFB27A]">Today’s Hot Zone · {endsIn(q.data!.ends_at)} left</span>
          <span className="truncate font-display text-[20px] font-black">{z.name}</span>
          <span className="text-[11px] font-semibold text-white/70">Better rarities · {q.data!.ultra_mult}× ultra odds · {q.data!.shiny_mult}× shiny</span>
        </span>
        <span className={cn('shrink-0 rounded-full px-3 py-1.5 text-[12px] font-black', canBuy ? 'bg-[#FF8A3D] text-[#2a0f00]' : 'bg-white/10 text-white/60')}>{free ? 'Roll · free' : `Roll · ${fmt(cost)}`}</span>
      </div>
      <div className="relative mt-2 flex items-center justify-between gap-2 text-[10px] font-semibold text-white/45">
        {q.data!.crown_free ? <span className="font-black text-[#FFD23F]" data-testid="crown-free">👑 {z.name}’s Crown is up for grabs!</span> : <span>👑 {z.name}’s Crown is taken</span>}
        {q.data!.tomorrow && <span>Tomorrow: {q.data!.tomorrow.name}</span>}
      </div>
    </motion.button>
  );
}
