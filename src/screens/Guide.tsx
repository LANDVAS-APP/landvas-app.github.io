// The Guide: what everything in LANDVAS does, every live rate, how much Ink each thing gives, what players really earn,
// a grind calculator, and LANDVAS next to Atlas Earth and TerraMine. All LANDVAS numbers come live from the server
// (game_guide), so changing a rate or the config changes this page by itself.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Page, PageHeader } from '../app/Shell';
import { api } from '../backend/api';
import { Slider, Spinner, Empty } from '../ui';
import { cn } from '../lib/utils';
import {
  COMPETITORS, SECONDS_PER_MONTH, boostPerDay, expectedRate, minigameInk, otherCappedInk, plotPrice, project, pvpInk, streakInkPerDay,
  type Guide as GuideData, type Projection,
} from '../guide/model';

const num = (x: unknown, d = 0) => { const v = Number(x); return Number.isFinite(v) ? v : d; };
const fmt = (x: number, d = 0) => x.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });
const usd = (x: number) => (x === 0 ? '$0' : x >= 1 ? `$${x.toFixed(2)}` : x >= 0.01 ? `$${x.toFixed(3)}` : x >= 0.0001 ? `$${x.toFixed(5)}` : `$${x.toPrecision(2)}`);
const perSec = (x: number) => `$${x.toFixed(Math.min(14, Math.max(2, Math.ceil(-Math.log10(x || 1)) + 1)))}`;
const odds = (p: number) => (p <= 0 ? 'only where it can roll' : p >= 0.01 ? `${(p * 100).toFixed(p >= 0.1 ? 0 : 1)}%` : `1 in ${fmt(Math.round(1 / p))}`);
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

/** friendly names for where Ink came from */
const SOURCE: Record<string, string> = {
  minigame: '🎮 Plot minigames', pvp: '⚔️ PvP', pvp_match: '⚔️ PvP', space: '🚀 Space & planets', planet: '🪐 Planets', planet_game: '🪐 Planet games', planet_core: '🪐 Planet cores',
  dig_layer: '⛏️ Digging', farm: '🌾 Farms', inkborn: '🐾 Inkborn', inkborn_game: '🐾 Inkborn games', arcade: '🕹️ Arcade', business: '🍋 Business', realm: '🏰 Realms',
  doodle: '✏️ Draw & Guess', sketch: '🖍️ Sketch of the Day', duet: '🎨 Duets', stamp_sale: '🎫 Stamp sales', inspire: '💡 Inspired', inspire_given: '💡 Inspiring others',
  room_host: '🚪 Room visitors', room_visit: '🚪 Visiting rooms', wheel: '🎡 Daily wheel', wheel_spin: '🎡 Daily wheel', daily_streak: '📅 Daily streak', day: '📅 Daily streak',
  craft: '🖌️ Craft bonus', featured: '⭐ Featured', challenge: '🏆 Challenges', clan: '🛡️ Clans', group_game: '👥 Group games', home_game: '🏠 Home games', travel: '✈️ Travel', travel_stop: '✈️ Travel',
  achievement: '🏅 Badges', finds: '🔎 Finds', find: '🔎 Finds', chore: '🧹 Chores', winner_ink: '🏆 Prizes', bonus_ink: '🎁 Bonuses', ad_reward: '📺 Rewarded ads', fusion: '🧬 Fusion',
};
const label = (k: string) => SOURCE[k] ?? k.replace(/_/g, ' ');

export default function Guide() {
  const q = useQuery({ queryKey: ['game-guide'], queryFn: api.gameGuide, refetchInterval: 5 * 60_000, staleTime: 60_000 });
  if (q.isLoading) return <Page><div className="flex justify-center py-24"><Spinner /></div></Page>;
  if (!q.data) return <Page><Empty title="The guide couldn’t load">Check your connection and try again.</Empty></Page>;
  return <GuideBody g={q.data} />;
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-9 grid scroll-mt-20 gap-3" data-testid={`guide-${id}`}>
      <h2 className="font-display text-xl font-black">{title}</h2>
      {intro && <p className="-mt-1 text-sm leading-relaxed text-muted">{intro}</p>}
      {children}
    </section>
  );
}
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={cn('glass rounded-3xl p-4', className)}>{children}</div>;
function Tile({ k, v, hint }: { k: string; v: React.ReactNode; hint?: string }) {
  return (
    <div className="glass rounded-2xl p-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted">{k}</div>
      <div className="mt-0.5 font-display text-lg font-black tnum">{v}</div>
      {hint && <div className="text-[11px] leading-snug text-faint">{hint}</div>}
    </div>
  );
}

const TOC: [string, string][] = [
  ['rates', 'Live rates'], ['ink', 'Ways to earn Ink'], ['real', 'What players really earn'], ['calc', 'Grind calculator'],
  ['compare', 'vs Atlas Earth & TerraMine'], ['how', 'How everything works'],
];

function GuideBody({ g }: { g: GuideData }) {
  const c = g.config;
  const price = plotPrice(g);
  const rate = expectedRate(g);
  const boost = boostPerDay(g);
  const mg = minigameInk(g);
  const mgLate = minigameInk(g, 35, 60);
  const pv = pvpInk(g);
  const streak = streakInkPerDay(g);
  const oc = otherCappedInk(g);
  const inkPerUsd = num(c.rent?.convert?.ink_per_usd, 100);
  const free = num(c.economy?.free_plots, 1);
  const s = g.stats;
  const enoughData = num(s.players) >= 5;

  return (
    <Page>
      <PageHeader eyebrow="The guide" title="📘 How LANDVAS works">
        Every feature, every rate, and how much Ink everything gives. It all comes straight from the game, so when a rate changes this page changes with it.
      </PageHeader>
      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-2 text-xs text-muted" data-testid="guide-live">
        <span className="lv-live"><i /> Live</span> Rates checked {ago(g.updated_at)} · player averages from the last {s.days} days, refreshed {ago(g.stats_at)}
        <Link to="/legend" className="ml-auto font-semibold text-accent-2 hover:underline">Every rarity in detail →</Link>
      </div>
      <nav className="mb-7 flex flex-wrap gap-1.5">
        {TOC.map(([id, t]) => <a key={id} href={`#${id}`} className="rounded-full bg-surface-2/70 px-3 py-1.5 text-xs font-bold hover:bg-surface-2">{t}</a>)}
      </nav>

      <div className="mb-9 grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="guide-facts">
        <Tile k="A plot costs" v={`${fmt(price)} Ink`} hint={free > 0 ? `Your first ${free === 1 ? 'plot is' : `${free} plots are`} free` : undefined} />
        <Tile k="Avg rent per plot" v={`${usd(rate * 86400 * boost.avg)}/day`} hint={`${perSec(rate)}/s on average, with the free daily boost`} />
        <Tile k="Rent boost" v={`×${boost.mult}`} hint={`${fmt(boost.hours, 1)} free hours a day`} />
        <Tile k="Ink per minigame win" v={`${fmt(mg.perWin, 1)}`} hint={`levels 1–34 · ${fmt(mgLate.perWin, 1)} at levels 35–60`} />
        <Tile k="Rent → Ink" v={`$1 = ${fmt(inkPerUsd)} Ink`} hint={`$1 of rent buys ${fmt(inkPerUsd / price, 1)} plot${inkPerUsd / price === 1 ? '' : 's'}`} />
        <Tile k="Cash-out" v={`$${num(c.rent?.cashout?.minimum_usd, 5)} min`} hint="When cash-out is open in your country" />
      </div>

      <Rates g={g} />
      <InkSources g={g} mg={mg} mgLate={mgLate} pv={pv} streak={streak} oc={oc} />
      <RealStats g={g} enough={enoughData} />
      <Calculator g={g} />
      <Compare g={g} />
      <HowItWorks g={g} />

      <p className="mb-10 text-center text-[11px] leading-relaxed text-faint">
        Rent is a game reward, not an investment or a wage. Rates, boosts and caps can change, and what you earn depends on how you play. Averages are averages: some players earn more, many earn less.
      </p>
    </Page>
  );
}

// ---- live rates -----------------------------------------------------------------------------------------------------

function Rates({ g }: { g: GuideData }) {
  const boost = boostPerDay(g);
  const everyday = g.rarities.filter((r) => !r.ultra && num(r.chance) > 0);
  const ultras = g.rarities.filter((r) => r.ultra);
  const crowns = g.rarities.filter((r) => !r.ultra && num(r.chance) === 0);
  const sh = g.config.shiny;
  return (
    <Section id="rates" title="💵 Live rates" intro={<>What each plot earns, every second, for as long as you own it, even while you’re away. The free boost multiplies all of it by ×{boost.mult} for {fmt(boost.hours, 1)} hours a day, so a day averages ×{boost.avg.toFixed(2)}.</>}>
      <Card className="p-0">
        <table className="w-full text-[13px]" data-testid="guide-rates-table">
          <thead className="text-left text-[10.5px] uppercase tracking-wide text-muted">
            <tr><th className="p-2.5 pl-3">Rarity</th><th className="p-2.5">Chance</th><th className="p-2.5">Rent / sec</th><th className="p-2.5 pr-3 text-right">Day* · Year*</th></tr>
          </thead>
          <tbody>
            {everyday.map((r) => {
              const u = num(r.usd_per_second);
              return (
                <tr key={r.id} className="border-t border-line/60" data-testid={`guide-rate-${r.id}`}>
                  <td className="p-2.5 pl-3"><b style={{ color: r.color }}>{r.emoji ? `${r.emoji} ` : ''}{r.name}</b><span className="block text-[10.5px] text-faint">×{num(r.ink_mult, 1)} Ink</span></td>
                  <td className="p-2.5 tnum">{odds(num(r.chance))}</td>
                  <td className="break-all p-2.5 tnum text-[12px]">{perSec(u)}</td>
                  <td className="p-2.5 pr-3 text-right tnum">{usd(u * 86400 * boost.avg)}<span className="block text-[11px] text-muted">{usd(u * 86400 * 365 * boost.avg)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-3 pb-3 text-[11px] text-faint">* with the free daily boost used every day. Without it, divide by {boost.avg.toFixed(2)}.</p>
      </Card>
      <Card>
        <div className="mb-2 text-sm font-bold">🌌 Ultra rarities, rolled before anything else on every claim</div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ultras.map((r) => (
            <div key={r.id} className="flex items-baseline justify-between gap-2 text-sm" data-testid={`guide-rate-${r.id}`}>
              <span className="font-bold" style={{ color: r.color }}>{r.emoji} {r.name}</span>
              <span className="text-xs text-muted tnum">{odds(num(r.chance))} · {perSec(num(r.usd_per_second))}/s · ×{num(r.ink_mult, 1)} Ink</span>
            </div>
          ))}
        </div>
        {crowns.length > 0 && <p className="mt-2 text-xs text-muted">👑 Crowns ({crowns.map((r) => r.name).join(', ')}) only roll in a city, state or country nobody holds yet, and boost all your rent.</p>}
        {sh?.enabled !== false && <p className="mt-1 text-xs text-muted">✨ Any claim can also come out Shiny: 1 in {fmt(num(sh?.one_in, 1000))}, earning ×{num(sh?.rent_mult, 5)} its rarity’s rent.</p>}
        <p className="mt-1 text-xs text-muted">Each ultra earns in its own way (day and night, daily rolls, streaks, pairs…). <Link to="/legend" className="font-semibold text-accent-2 hover:underline">See what each one does →</Link></p>
      </Card>
    </Section>
  );
}

// ---- Ink sources ----------------------------------------------------------------------------------------------------

type Mg = ReturnType<typeof minigameInk>;
function InkSources({ g, mg, mgLate, pv, streak, oc }: { g: GuideData; mg: Mg; mgLate: Mg; pv: ReturnType<typeof pvpInk>; streak: number; oc: ReturnType<typeof otherCappedInk> }) {
  const c = g.config;
  const by = g.stats.by_source ?? {};
  const seen = (...keys: string[]) => {
    const hits = keys.map((k) => by[k]).filter(Boolean);
    if (!hits.length) return null;
    const ink = hits.reduce((s, h) => s + num(h.ink), 0), times = hits.reduce((s, h) => s + num(h.times), 0);
    return `Players got ${fmt(ink / Math.max(1, times), 1)} Ink a time on average (${fmt(times)} times in ${g.stats.days} days)`;
  };
  const wheel = (c.earn?.wheel?.slices ?? []) as any[];
  const wheelInk = wheel.length ? wheel.reduce((s, x) => s + (x.kind === 'ink' ? num(x.amount) * num(x.weight) : 0), 0) / wheel.reduce((s, x) => s + num(x.weight), 0) : 0;
  const ib = c.inkborn ?? {};
  const ibGames = Object.values(ib.games ?? {}) as any[];
  const jobs = Object.values(ib.jobs ?? {}) as any[];
  const pl = c.planets ?? {};
  const plGames = Object.values(pl.games ?? {}) as any[];
  const crops = Object.values(c.farm?.crops ?? {}) as any[];
  const bestCrop = crops.map((x) => ({ ...x, profit: (num(x.sell) * (num(x.yield?.[0]) + num(x.yield?.[1])) / 2 - num(x.seed)) / Math.max(1, num(x.minutes)) * 60 })).sort((a, b) => b.profit - a.profit)[0];
  const cr = c.creative ?? {};
  const ref = c.referrals ?? {};
  const rows: { name: string; what: React.ReactNode; ink: React.ReactNode; cap?: React.ReactNode; real?: string | null }[] = [
    { name: '🎮 Plot minigames', what: `Every plot hosts a minigame. Clear a level to win Ink; each plot climbs its own ${num(c.minigames?.max_level, 60)} levels. Rarer plots pay more (the Ink bonus).`,
      ink: <>{fmt(mg.perWin, 1)} a win at levels 1–34, {fmt(mgLate.perWin, 1)} at 35–60</>, cap: <>{mg.winsPerGamePerDay} paid wins per game a day ({mg.games} games, so {mg.games * mg.winsPerGamePerDay} a day)</>, real: seen('minigame') },
    { name: '⚔️ PvP', what: 'Head-to-head against a rival on the same board. Nobody stakes Ink; the winner gets paid.', ink: <>{fmt(pv.perWin, 1)} a win</>, cap: <>{pv.perDay} paid matches a day</>, real: seen('pvp', 'pvp_match') },
    { name: '📅 Daily streak', what: 'Check in every day. Every 7th day in a row: a free roll guaranteed Rare or better; every 30th: Legendary or better.', ink: <>{(c.daily_streak?.ink ?? []).join(' → ')} Ink over a week, +{fmt(num(c.daily_streak?.day30_ink))} on day 30</>, cap: <>≈ {fmt(streak)} Ink a day on average</>, real: seen('daily_streak', 'day') },
    { name: '🎡 Daily wheel', what: 'One free spin a day: Ink, Pigments, a rent boost, a joystick refill, XP — or the 100 Ink jackpot.', ink: <>≈ {fmt(wheelInk, 1)} Ink a spin on average</>, cap: <>{num(c.earn?.wheel?.spins_per_day, 1)} spin a day</>, real: seen('wheel', 'wheel_spin') },
    { name: '🐾 Inkborn', what: 'Creatures you design. Play their games, send them on jobs, and their Ink Spring fills while you’re away.', ink: <>games up to {ibGames.length ? Math.max(...ibGames.map((x) => num(x.max_ink))) : 25} Ink each · jobs {jobs.map((j) => `${j.ink}`).join(' / ')} Ink · spring {num(ib.spring?.per_creature_hour)} Ink per creature an hour</>, cap: <>{fmt(num(ib.daily_cap))} Ink a day</>, real: seen('inkborn', 'inkborn_game') },
    { name: '🚀 Space & planets', what: 'Build a rocket, fly to the planets, claim plots there, dig, catch meteors and play each world’s games.', ink: <>planet games up to {plGames.length ? Math.max(...plGames.map((x) => num(x.max_ink))) : 25} Ink · meteors {num(pl.meteors?.ink_min)}–{num(pl.meteors?.ink_max)} (golden {num(pl.meteors?.golden_ink)})</>, cap: <>{fmt(num(pl.daily_cap_total))} a day on planets, {fmt(num(c.space?.daily_cap))} from space</>, real: seen('space', 'planet', 'planet_game', 'planet_core', 'dig_layer') },
    { name: '🌾 Farms', what: 'Plant seeds (bought with Ink), water, harvest and sell. Longer crops are worth more; golden harvests pay extra.', ink: bestCrop ? <>best crop now: {bestCrop.emoji} {bestCrop.name}, ≈ {fmt(bestCrop.profit, 1)} Ink profit an hour per bed</> : '—', cap: 'more beds with more connected plots', real: seen('farm') },
    { name: '🕹️ Arcade', what: 'Arcade plots hold cabinets anyone can play for tickets; the arena has live party games.', ink: <>arena: {num(c.arcade?.arena?.rewards?.win_ink)} Ink a win, {num(c.arcade?.arena?.rewards?.play_ink)} a game</>, cap: <>{num(c.arcade?.arena?.daily_ink_cap)} Ink a day from the arena</>, real: seen('arcade') },
    { name: '🍋 Business & 🏰 Realms', what: 'Idle plots that build up while you’re away: a lemonade-stand empire, a mine, a sky island, a workshop, a diner or a dungeon.', ink: 'grows as you upgrade', real: seen('business', 'realm') },
    { name: '🎨 Art & creative', what: 'Sketch of the Day, Draw & Guess, duets, selling stamps of your art, getting Inspired or Featured, and the craft bonus.', ink: <>Sketch prizes {(cr.sketch?.prizes ?? []).slice(0, 3).join(' / ')}… · guess {num(cr.doodle?.guesser_ink)} · duet {num(cr.duet?.complete_ink)} · Featured {num(c.earn?.featured?.ink)}</>, real: seen('sketch', 'doodle', 'duet', 'stamp_sale', 'inspire', 'craft', 'featured') },
    { name: '🚪 Visiting rooms', what: 'Check in at other players’ rooms; they get Ink when you do.', ink: <>{num(c.earn?.rooms?.visitor_ink)} each visit, {num(c.earn?.rooms?.host_ink)} for the host</>, cap: <>{num(c.earn?.rooms?.visitor_daily)} visits / {num(c.earn?.rooms?.host_daily)} hosted a day</>, real: seen('room_visit', 'room_host') },
    { name: '💌 Invites', what: 'When a friend joins with your code and wins their first minigame you get a bonus, plus a share of what they earn.', ink: <>{fmt(num(ref.reward_ink))} Ink, then {num(ref.share?.pct)}% of their Ink up to {fmt(num(ref.share?.cap_ink))}</>, cap: <>{num(ref.daily_cap)} invites a day</> },
    { name: '💵 Rent → Ink', what: 'Turn any amount of your USD rent into Ink, from $0.01.', ink: <>$1 = {fmt(num(c.rent?.convert?.ink_per_usd, 100))} Ink</> },
  ];
  return (
    <Section id="ink" title="🖌️ Ways to earn Ink" intro={<>Ink buys plots ({fmt(plotPrice(g))} Ink each) and almost everything else. It can’t be bought with money: it’s earned by playing. The numbers below are the game’s current settings; the green lines are what players actually got.</>}>
      <div className="grid gap-2" data-testid="guide-ink-sources">
        {rows.map((r) => (
          <Card key={r.name} className="grid gap-1 p-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3"><b>{r.name}</b><span className="text-sm font-bold text-accent-2 tnum">{r.ink}</span></div>
            <p className="text-sm text-muted">{r.what}</p>
            {r.cap && <p className="text-xs text-faint">Limit: {r.cap}</p>}
            {r.real && <p className="text-xs font-semibold text-[#3DDC97]">📊 {r.real}</p>}
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted">Daily limits from games with a cap (Inkborn, planets, space, arena) add up to about {fmt(oc.cap)} Ink a day on top of minigames and PvP.</p>
    </Section>
  );
}

// ---- what players really earn ---------------------------------------------------------------------------------------

function RealStats({ g, enough }: { g: GuideData; enough: boolean }) {
  const s = g.stats;
  const price = plotPrice(g);
  const top = Object.entries(s.by_source ?? {}).sort((a, b) => num(b[1].ink) - num(a[1].ink)).slice(0, 8);
  const max = Math.max(1, ...top.map(([, v]) => num(v.ink)));
  return (
    <Section id="real" title="📊 What players really earn" intro={<>Measured from every Ink reward players actually got in the last {s.days} days ({fmt(num(s.players))} players, {fmt(num(s.active_hours))} hours with play). Invites, rent conversions and refunds aren’t counted. An “hour with play” is any hour in which a player earned something, so these are on the low side for focused play.</>}>
      {!enough ? <Card><p className="text-sm text-muted">Not enough recent play to show fair averages yet. Check back soon.</p></Card> : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="guide-real-tiles">
            <Tile k="Typical Ink / hour" v={fmt(num(s.ink_per_active_hour_median))} hint={`≈ ${fmt(num(s.ink_per_active_hour_median) / price, 2)} plots an hour (median player)`} />
            <Tile k="Top 10% / hour" v={fmt(num(s.ink_per_active_hour_p90))} hint={`≈ ${fmt(num(s.ink_per_active_hour_p90) / price, 1)} plots an hour`} />
            <Tile k="Typical day of play" v={`${fmt(num(s.ink_per_active_day_median))} Ink`} hint={`top 10%: ${fmt(num(s.ink_per_active_day_p90))} Ink`} />
            <Tile k="Plots per player" v={fmt(num(s.plots?.avg), 1)} hint={`median ${fmt(num(s.plots?.median))} · ${fmt(num(s.plots?.total))} owned in all`} />
          </div>
          {num(s.minigames?.plays) > 0 && <p className="text-xs text-muted">A minigame takes about {fmt(num(s.minigames.median_seconds))} seconds (median) and players win {fmt(num(s.minigames.win_rate) * 100)}% of them.</p>}
          {top.length > 0 && (
            <Card>
              <div className="mb-2 text-sm font-bold">Where players’ Ink came from</div>
              <div className="grid gap-1.5" data-testid="guide-real-sources">
                {top.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[9.5rem_1fr_auto] items-center gap-2 text-xs">
                    <span className="truncate">{label(k)}</span>
                    <span className="h-2.5 rounded-full bg-surface-2"><span className="block h-full rounded-full bg-[linear-gradient(90deg,#8B5CFF,#22E3FF)]" style={{ width: `${(num(v.ink) / max) * 100}%` }} /></span>
                    <span className="tnum text-muted">{fmt(num(v.ink))}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </Section>
  );
}

// ---- grind calculator -----------------------------------------------------------------------------------------------

const hoursFmt = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${fmt(h, 2)} h`);
function useControls() {
  const [hours, setHours] = useState(1);
  const [days, setDays] = useState(30);
  const [wph, setWph] = useState(30);
  return { hours, setHours, days, setDays, wph, setWph };
}
function Controls({ k, showPace }: { k: ReturnType<typeof useControls>; showPace?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Slider id="g-hours" label="Play a day" value={k.hours} min={0.25} max={8} step={0.25} onChange={k.setHours} format={hoursFmt} />
      <Slider id="g-days" label="For" value={k.days} min={7} max={365} step={1} onChange={k.setDays} format={(d) => `${d} days`} />
      {showPace && <Slider id="g-pace" label="Minigame wins an hour" value={k.wph} min={10} max={90} step={5} onChange={k.setWph} format={(w) => `${w}`} />}
    </div>
  );
}

function Calculator({ g }: { g: GuideData }) {
  const k = useControls();
  const real = num(g.stats.ink_per_active_hour_median);
  const enough = num(g.stats.players) >= 5 && real > 0;
  const [basis, setBasis] = useState<'real' | 'pace'>(enough ? 'real' : 'pace');
  const price = plotPrice(g);
  const b = boostPerDay(g);
  const rate = expectedRate(g);
  const free = num(g.config.economy?.free_plots, 1);
  const lv = project(g, k.hours, k.days, k.wph)[0];
  const inkPerDay = basis === 'real' && enough ? real * k.hours + streakInkPerDay(g) : lv.plotsPerDay * price;
  const plots = free + Math.floor((inkPerDay * k.days) / price);
  const perPlotMonth = rate * b.avg * SECONDS_PER_MONTH;
  const earned = Array.from({ length: k.days }, (_, d) => (free + Math.floor((inkPerDay * (d + 1)) / price)) * perPlotMonth / 30).reduce((s, x) => s + x, 0);
  return (
    <Section id="calc" title="🧮 Grind calculator" intro="How many plots you’d have and what they’d earn, if you play this much every day, buy plots with all your Ink and use your free boost every day.">
      <Card className="grid gap-4">
        <Controls k={k} showPace={basis === 'pace'} />
        <div className="flex flex-wrap gap-1.5 text-xs">
          <button className={cn('rounded-full px-3 py-1.5 font-bold', basis === 'real' ? 'bg-accent text-white' : 'bg-surface-2', !enough && 'opacity-40')} disabled={!enough} onClick={() => setBasis('real')} data-testid="calc-real">What players really earn ({fmt(real)} Ink/h)</button>
          <button className={cn('rounded-full px-3 py-1.5 font-bold', basis === 'pace' ? 'bg-accent text-white' : 'bg-surface-2')} onClick={() => setBasis('pace')} data-testid="calc-pace">Focused grinding (game rates)</button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="calc-results">
          <Tile k="Ink a day" v={fmt(inkPerDay)} hint={`${fmt(inkPerDay / price, 1)} plots a day`} />
          <Tile k={`Plots after ${k.days} days`} v={fmt(plots)} />
          <Tile k="Rent then" v={`${usd(plots * perPlotMonth)}/mo`} hint={`${usd(plots * perPlotMonth / 30)} a day`} />
          <Tile k={`Earned in ${k.days} days`} v={usd(earned)} hint="rent only, not counting Ink" />
        </div>
        <p className="text-[11px] text-faint">Uses the average claim (each rarity’s real chance, plus Shiny). One lucky ultra or Crown can change this a lot. “Focused grinding” counts minigames, PvP and the capped games at your pace, with their daily limits.</p>
      </Card>
    </Section>
  );
}

// ---- vs Atlas Earth and TerraMine -----------------------------------------------------------------------------------

function LineChart({ series, days, pick, unit }: { series: Projection[]; days: number; pick(p: Projection): number[]; unit(v: number): string }) {
  const W = 640, H = 240, L = 46, R = 12, T = 12, B = 26;
  const max = Math.max(1e-9, ...series.flatMap((p) => pick(p)));
  const x = (d: number) => L + (d / days) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Comparison over time">
      {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-line" strokeWidth={1} /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" className="fill-current text-faint">{unit(t)}</text></g>)}
      {[0, Math.round(days / 2), days].map((d) => <text key={d} x={x(d)} y={H - 6} textAnchor="middle" fontSize="11" className="fill-current text-faint">day {d}</text>)}
      {series.map((p) => {
        const v = pick(p);
        const step = Math.max(1, Math.floor(v.length / 120));
        const pts = v.map((val, d) => (d % step === 0 || d === v.length - 1 ? `${x(d).toFixed(1)},${y(val).toFixed(1)}` : null)).filter(Boolean).join(' ');
        return <polyline key={p.id} points={pts} fill="none" stroke={p.color} strokeWidth={p.id === 'landvas' ? 3.5 : 2.5} strokeLinejoin="round" strokeLinecap="round" />;
      })}
    </svg>
  );
}
function Bars({ rows, unit }: { rows: { name: string; color: string; v: number }[]; unit(v: number): string }) {
  const max = Math.max(1e-12, ...rows.map((r) => r.v));
  return (
    <div className="grid gap-2">
      {rows.map((r) => (
        <div key={r.name} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 text-sm">
          <span className="font-bold" style={{ color: r.color }}>{r.name}</span>
          <span className="h-4 rounded-full bg-surface-2"><span className="block h-full rounded-full" style={{ width: `${Math.max(1.5, (r.v / max) * 100)}%`, background: r.color }} /></span>
          <span className="tnum text-xs font-bold">{unit(r.v)}</span>
        </div>
      ))}
    </div>
  );
}

function Compare({ g }: { g: GuideData }) {
  const k = useControls();
  const series = useMemo(() => project(g, k.hours, k.days, k.wph), [g, k.hours, k.days, k.wph]);
  const [lv, tm, ae] = series;
  const A = COMPETITORS.atlas, T = COMPETITORS.terramine;
  const b = boostPerDay(g);
  const mg = minigameInk(g);
  const price = plotPrice(g);
  const end = (p: Projection) => p.plots[p.plots.length - 1];
  const lead = (v: (p: Projection) => number) => { const [x, ...rest] = series; const best = Math.max(...rest.map(v)); return best > 0 ? v(x) / best : Infinity; };
  const plotLead = lead(end), rentLead = lead((p) => p.monthly[p.monthly.length - 1]);
  const row = (k: string, a: React.ReactNode, t: React.ReactNode, l: React.ReactNode) => (
    <div className="border-t border-line/60 px-3 py-2.5 first:border-t-0">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">{k}</div>
      <div className="grid grid-cols-3 gap-2 text-[13px] leading-snug"><span className="font-bold text-[#B69CFF]">{l}</span><span>{t}</span><span>{a}</span></div>
    </div>
  );
  return (
    <Section id="compare" title="🏁 LANDVAS vs Atlas Earth vs TerraMine" intro="Three map games where plots earn real-dollar rent. Here’s how fast each one lets a free player grow, using each game’s own published numbers. LANDVAS’s numbers are live; the others were checked in November 2026.">
      <Card className="p-0" >
        <div data-testid="compare-table">
          <div className="sticky top-0 z-10 grid grid-cols-3 gap-2 rounded-t-3xl bg-bg-2/95 px-3 py-2.5 text-xs font-black backdrop-blur"><span className="text-[#B69CFF]">LANDVAS</span><span style={{ color: T.color }}>{T.emoji} TerraMine</span><span style={{ color: A.color }}>{A.emoji} Atlas Earth</span></div>
            {row('Free to start', `${A.startPlots} parcel`, `${T.startPlots} mines (1,000 TB)`, `${fmt(num(g.config.economy?.free_plots, 1))} plot${num(g.config.economy?.free_plots, 1) === 1 ? '' : 's'}`)}
            {row('A plot costs', `${A.plotCost} Atlas Bucks`, `${T.plotCost} TerraBucks`, `${fmt(price)} Ink`)}
            {row('Earned per minigame win', 'no minigame currency (2 Atlas Bucks per ad)', `${fmt(T.earn.perWin, 1)} TB (levels 1–34)`, `${fmt(mg.perWin, 1)} Ink (levels 1–34)`)}
            {row('Minigame wins per plot', '50 ads per parcel', fmt(T.plotCost / T.earn.perWin), fmt(price / mg.perWin, 1))}
            {row('Average rent / plot / day, no boost', `${usd(A.ratePerPlot * 86400)} (Common)`, usd(T.ratePerPlot * 86400), usd(expectedRate(g) * 86400))}
            {row('Rent boost', `×${A.boost.mult}, up to ${A.boost.hours} h a day`, `×${T.boost.mult}, up to ${T.boost.hours} h stacked`, `×${b.mult}, ${fmt(b.hours, 1)} free h a day`)}
            {row('Rent / plot / month, boosted', usd(ae.perPlotMonthly), usd(tm.perPlotMonthly), usd(lv.perPlotMonthly))}
            {row('$1 of rent buys', `${A.rentToCurrency / A.plotCost} parcel`, `${T.rentToCurrency / T.plotCost} mines`, `${fmt(num(g.config.rent?.convert?.ink_per_usd, 100) / price, 1)} plot`)}
            {row('New rarities', '4 rarities', '4 mine types', `${g.rarities.filter((r) => !r.ultra && num(r.chance) > 0).length} rarities + ${g.rarities.filter((r) => r.ultra).length} ultras + ${g.rarities.filter((r) => !r.ultra && num(r.chance) === 0).length} Crowns, and Shiny`)}
        </div>
      </Card>

      <Card className="grid gap-4">
        <Controls k={k} showPace />
        <div className="grid grid-cols-3 gap-2" data-testid="compare-results">
          {series.map((p) => (
            <div key={p.id} className="rounded-2xl p-3" style={{ background: `${p.color}1f`, boxShadow: `inset 0 0 0 1.5px ${p.color}55` }} data-testid={`compare-${p.id}`}>
              <div className="text-xs font-black" style={{ color: p.color }}>{p.name}</div>
              <div className="font-display text-xl font-black tnum">{fmt(end(p))}</div>
              <div className="text-[11px] text-muted">plots · {fmt(p.plotsPerDay, 2)} a day</div>
              <div className="mt-1 text-sm font-bold tnum">{usd(p.monthly[p.monthly.length - 1])}<span className="text-[11px] font-normal text-muted">/mo</span></div>
            </div>
          ))}
        </div>
        {Number.isFinite(plotLead) && plotLead > 1 && (
          <p className="text-sm font-bold" data-testid="compare-lead">LANDVAS: {plotLead.toFixed(1)}× the plots{rentLead > 1 ? ` and ${rentLead.toFixed(1)}× the monthly rent` : ''} of the next game after {k.days} days.</p>
        )}
        <div>
          <div className="mb-1 text-xs font-bold text-muted">Plots owned</div>
          <LineChart series={series} days={k.days} pick={(p) => p.plots} unit={(v) => fmt(v)} />
        </div>
        <div>
          <div className="mb-2 text-xs font-bold text-muted">Rent a month on day {k.days}</div>
          <Bars rows={series.map((p) => ({ name: p.name, color: p.color, v: p.monthly[p.monthly.length - 1] }))} unit={usd} />
        </div>
        <div className="flex flex-wrap gap-3 text-xs">{series.map((p) => <span key={p.id} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />{p.name}</span>)}</div>
        <details className="text-xs text-muted">
          <summary className="cursor-pointer font-bold">How this is worked out</summary>
          <ul className="mt-2 grid list-disc gap-1 pl-4">
            <li>Everyone spends all their currency on plots, uses their boost every day, and plays the same hours at the same pace (minigame wins an hour).</li>
            <li>LANDVAS counts only minigames, PvP, the capped games (Inkborn, planets, space, arena) and the daily streak, each with its daily limit. Farms, businesses, realms, arcades, art and invites are left out, so LANDVAS’s line is a floor.</li>
            <li>TerraMine: {T.earn.note}, weighted by how often each mine type comes up; its minigames’ daily limits aren’t published, so none are applied. Rent is Rock’s community-measured {usd(0.002851)} a month × the published 1/1.5/2/4 mine multipliers and 60/30/9/1 odds, boosted {T.boost.hours} hours a day.</li>
            <li>Atlas Earth has no minigame currency: {A.earn.note} ({A.earn.perDayCap} a day at most). Rent uses the Common rate because Atlas doesn’t publish its rarity odds; rarer parcels earn up to 4×. Boost: {A.boost.note}.</li>
            <li>Per plot, LANDVAS rent is lower once boosts are counted (fewer free boost hours a day), but LANDVAS players get plots several times faster, so they come out ahead in total.</li>
            <li>Starting bonuses from invite codes and real-money purchases are left out for all three.</li>
          </ul>
          <div className="mt-2 grid gap-1">
            <b>Sources</b>
            {[...T.sources, ...A.sources].map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="text-accent-2 hover:underline">{s.label}</a>)}
          </div>
        </details>
      </Card>
    </Section>
  );
}

// ---- how everything works -------------------------------------------------------------------------------------------

function HowItWorks({ g }: { g: GuideData }) {
  const c = g.config;
  const price = plotPrice(g);
  const b = boostPerDay(g);
  const luck = c.luck ?? {};
  const hz = c.hot_zones ?? {};
  const free = num(c.economy?.free_plots, 1);
  const items: { t: string; body: React.ReactNode; to?: string }[] = [
    { t: '🗺️ Claiming plots', to: '/world', body: <>The real world is split into house-sized plots. You claim plots near where you really are (by GPS) for {fmt(price)} Ink each{free > 0 ? `, and your first ${free === 1 ? 'one is' : free + ' are'} free` : ''}. Prefer something lighter? Simple mode lets you buy and roll plots straight from the home screen, no map needed. Every claim rolls its rarity and its plot type the moment it’s yours.</> },
    { t: '💎 Rarities', to: '/legend', body: <>{g.rarities.filter((r) => !r.ultra && num(r.chance) > 0).map((r) => r.name).join(', ')}, plus {g.rarities.filter((r) => r.ultra).length} ultra rarities with their own abilities. Rarer plots earn more rent and pay more Ink from their minigame. A rarity never changes once rolled.</> },
    { t: '💵 Rent & the boost', body: <>Every plot earns USD rent every second, even offline (up to {num(c.rent?.max_offline_days, 30)} days at a time). Tap Boost for ×{b.mult} on all your rent: {num(c.rent?.boost?.free_per_day)} free boosts a day of {num(c.rent?.boost?.minutes_per_boost)} minutes each, stacking up to {num(c.rent?.boost?.max_stack_hours)} hours. Each plot level adds +{num(c.rent?.level_bonus) * 100}% rent. Convert rent to Ink any time at $1 = {fmt(num(c.rent?.convert?.ink_per_usd, 100))} Ink.</> },
    { t: '🎮 Minigames', body: <>Each plot hosts a minigame and climbs its own {num(c.minigames?.max_level, 60)} levels. A level is several rounds; clear them all to win Ink. Higher levels and rarer plots pay more. Every result is checked on the server, so the only way up is to play well.</> },
    { t: '⚔️ PvP', to: '/pvp', body: <>Free head-to-head matches on identical boards against an anonymous rival. Winners earn Ink ({fmt(pvpInk(g).perWin, 1)} a win, {pvpInk(g).perDay} paid matches a day).</> },
    { t: '🐾 Inkborn', to: '/inkborn', body: <>Design your own creatures. They live in habitat plots, play their own games with you, go on jobs ({(Object.values(c.inkborn?.jobs ?? {}) as any[]).map((j) => `${j.label?.toLowerCase()} for ${j.ink} Ink`).join(', ')}), and fill an Ink Spring while you’re away. Take them on playdates with friends’ Inkborn for eggs. Up to {fmt(num(c.inkborn?.daily_cap))} Ink a day.</> },
    { t: '🌾 Farms', body: <>Turn a plot into a farm: buy seeds with Ink, water, harvest and sell. Bigger farms (more connected plots) have more beds. Golden harvests pay extra and show on the live feed.</> },
    { t: '🍋 Businesses', body: <>An idle empire on your plot: open ventures, upgrade them, hire, and take your business public. It keeps earning while you’re away.</> },
    { t: '🕹️ Arcades', body: <>Fill an arcade plot with cabinets anyone can play. Players win tickets for prizes and gear; your arcade levels up as people play. The arena runs live party games for up to 10 players.</> },
    { t: '🏰 Realms', body: <>Five deep plot types: the Crystal Mine, Sky Island, Inventor’s Workshop, the Diner and the Dungeon, each with its own resources, upgrades and games.</> },
    { t: '🏠 Residential & ✈️ Travel', body: <>Residential plots hold your Home (visitors sign your check-in book) and Landlord estates, which pay ×{num((c as any).residential?.landlord_mult, 50)} rent on the 1st of the month once their checklist is done. Travel plots let you fly or take the train to other places on the map.</> },
    { t: '🚀 Space', to: '/space', body: <>Build a rocket with Ink, fly to the Moon, Mars and beyond, claim planet plots, dig to the core, catch meteors, play each world’s games, and settle a world of your own.</> },
    { t: '🍀 The Altar of Luck', body: <>Sacrifice plots, Inkborn, eggs or Ink to charge Luck up to {num(luck.max, 100)}. Your next claim spends it: an extra roll for every {num(luck.points_per_roll, 20)} Luck (keep the best of up to {num(luck.max_rolls, 6)}), and ultras get likelier. Ink gives 1 Luck per {num(luck.ink_per_point, 50)} Ink.</> },
    { t: '🔥 Hot Zones', body: <>Each day one city is the Hot Zone: claims there roll twice and keep the better rarity, ultras are {num(hz.ultra_mult, 5)}× likelier and Shiny {num(hz.shiny_mult, 2)}× likelier. A roll there costs {fmt(num(hz.roll_ink))} Ink.</> },
    { t: '👑 Crowns', body: <>Every city, state and country has one Crown. Its holder earns a boost on all their rent, growing to full strength as other players claim land there.</> },
    { t: '📅 Streak & 🎡 wheel', body: <>Check in daily for Ink ({(c.daily_streak?.ink ?? []).join(', ')} through the week), a guaranteed {c.daily_streak?.week_ticket ?? 'Rare'}+ roll every 7th day and a {c.daily_streak?.day30_ticket ?? 'Legendary'}+ roll plus {fmt(num(c.daily_streak?.day30_ink))} Ink every 30th. Spin the wheel once a day too.</> },
    { t: '🎨 Art', to: '/gallery', body: <>Paint murals on your plots that everyone sees on the live map; merge plots into bigger canvases. Win Sketch of the Day, play Draw & Guess and duets, sell stamps of your art, and earn a craft bonus for careful, original work.</> },
    { t: '🛡️ Clans & 💬 social', to: '/social', body: <>Join a clan for weekly goals, battles and the Clan Keep. Chat with everyone, add friends, and follow the live feed. In Settings → Privacy you can hide any activity from the feed.</> },
  ];
  return (
    <Section id="how" title="🧭 How everything works" intro="A tour of everything you can do. Tap any one to open it.">
      <div className="grid gap-2" data-testid="guide-how-list">
        {items.map((x) => (
          <details key={x.t} className="glass group rounded-2xl p-3.5">
            <summary className="cursor-pointer list-none font-bold">{x.t}<span className="float-right text-muted transition group-open:rotate-90">›</span></summary>
            <p className="mt-2 text-sm leading-relaxed text-muted">{x.body}</p>
            {x.to && <Link to={x.to} className="mt-1 inline-block text-xs font-bold text-accent-2 hover:underline">Open it →</Link>}
          </details>
        ))}
      </div>
    </Section>
  );
}

