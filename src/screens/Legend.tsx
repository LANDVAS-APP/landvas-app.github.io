// The rarity guide: every rarity in plain words — what it earns, what makes it special, and how to get one.
// Every rate, odd and ability number comes live from the game (game_guide), so the page never drifts from the game.
import { NATIVE_APP } from '../app/buildFlags';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../backend/api';
import { Page, PageHeader } from '../app/Shell';
import { BasePlotArt } from '../plot/BasePlotArt';
import { RARITY_ORDER, ULTRA, rarityInfo, rarityOdds, type RarityId } from '../shared/rarity';
import { formatRate } from '../shared/rent';

type Detail = { what: string; get: string; tip: string };
const n = (x: unknown, d = 0) => { const v = Number(x); return Number.isFinite(v) ? v : d; };
const x = (v: number) => `×${Number.isInteger(v) ? v : +v.toFixed(2)}`;
const pc = (v: number) => `${+(v * 100).toFixed(1)}%`;
const oneIn = (p: number) => (p > 0 ? `One claim in ${Math.round(1 / p).toLocaleString()}` : 'Very rare');
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

/** what each special rarity does, in more words than fit on a badge — every number comes from the live game config */
function details(c: Record<string, any>, chance: (id: string) => number, hotUltra: number): Partial<Record<RarityId, Detail>> {
  const a = c.rarity_abilities ?? {};
  const solar = n(a.solar?.mult, 3), lunar = n(a.lunar?.mult, 3);
  const comet = a.comet ?? {};
  const chaos = ((a.chaos?.values ?? []) as unknown[]).map((v) => n(v));
  const ph = a.phoenix ?? {};
  const phx = (d: number) => x(1 + n(ph.per_day, 0.1) * d);
  const an = a.ancient ?? {};
  const pr = a.prismatic ?? {};
  const kr = a.kraken ?? {};
  const cr = (k: string) => a[k] ?? {};
  const crownMult = (k: string) => x(1 + n(cr(k).pct) / 100);
  return {
    solar: { what: `Earns ${x(solar)} rent whenever the sun is up at the plot’s real spot on Earth — sunrise to sunset, by the real sun there. At night it earns its normal rate.`, get: 'Claim any plot anywhere. Every claim has its own Solar chance.', tip: 'A Solar plot on the other side of the world is in daylight while you sleep.' },
    lunar: { what: `The night twin of Solar: ${x(lunar)} rent while it’s dark at the plot’s real spot, normal rent in the day.`, get: 'Claim any plot anywhere. Every claim has its own Lunar chance.', tip: 'Pair a Solar and a Lunar in the same city and one of them is always boosted.' },
    comet: { what: `Once a day its comet passes over: for ${n(comet.hours, 1) === 1 ? 'one whole hour' : `${n(comet.hours, 1)} hours`} it earns ${x(n(comet.mult, 30))} rent. Each Comet plot has its own comet hour, the same hour every day — your plot shows when it is.`, get: 'Claim any plot anywhere.', tip: n(comet.mult, 30) * n(comet.hours, 1) > 24 ? 'One comet hour is worth more than a whole extra day of normal rent.' : 'Check when your comet hour is and boost your rent then.' },
    chaos: { what: `Its rent multiplier re-rolls once a day: ${[...new Set(chaos)].map(x).join(', ')}. Some days it earns${chaos.includes(0) ? ' nothing' : ' little'}, some days ${x(Math.max(...chaos, 1))} — it averages about ${x(+avg(chaos).toFixed(1))}.`, get: 'Claim any plot anywhere.', tip: 'Check your plot each day to see what today rolled.' },
    phoenix: { what: `Lives on your daily check-in streak: +${pc(n(ph.per_day, 0.1))} rent for every day in a row you check in — a 30-day streak is ${phx(30)}, 100 days ${phx(100)}, all the way to ${phx(n(ph.max_days, 365))} at ${n(ph.max_days, 365)} days. Miss a day and it falls to ashes (×1) until a new streak lights it again.`, get: 'Claim any plot anywhere. Keep it burning with the daily check-in.', tip: 'The longer the streak, the bigger the bird. Never miss a day.' },
    ancient: { what: `Grows with age: +${pc(n(an.per_day, 0.03))} rent for every day you own it, up to ${x(n(an.max, 6))}. It never fades, so the longer you hold it the better it gets.`, get: 'Claim any plot anywhere.', tip: 'Never sell an Ancient — its age starts over with a new owner.' },
    prismatic: { what: `Boosts everything you own: every plot you own earns +${n(pr.pct, 5)}% more rent. Each Prismatic adds another +${n(pr.pct, 5)}%, up to +${n(pr.max_pct, 50)}%.`, get: `Claim any plot anywhere. ${oneIn(chance('prismatic'))}.`, tip: 'The more land you own, the more a Prismatic is worth.' },
    kraken: { what: `Lurks under the map and drags in the rent around it: +${pc(n(kr.per_neighbour, 0.75))} for every plot owned by another player nearby, up to ${x(n(kr.max, 20))}. Your own plots don’t feed it — it needs a crowd.`, get: 'Claim any plot anywhere — it’s at its best downtown, in the Hot Zone, or anywhere busy.', tip: `Every new neighbour makes it stronger: a Kraken in a busy city can hit ${x(n(kr.max, 20))}.` },
    gemini: { what: `Comes alive in pairs. One Gemini plot is an ordinary ultra — but own two and each of them earns ${x(n(a.gemini?.pair_mult, 12))}.`, get: 'Claim any plot anywhere, and keep hunting for its twin.', tip: 'The second Gemini is the jackpot: it lights up the first one too.' },
    mirror: { what: 'Copies the rent of your best other plot. On its own it earns like a decent ultra; next to a Genesis, a Crown or a Singularity it earns like one of those.', get: 'Claim any plot anywhere.', tip: 'The better your best plot, the better your Mirror.' },
    crown: { what: `Every city in the world has exactly one City Crown. Its holder earns ${crownMult('crown')} on all their rent.`, get: `Only rolls when you claim a plot inside a city whose Crown hasn’t been claimed (about 1 in ${Math.round(1e6 / Math.max(1, n(cr('crown').ppm, 1000))).toLocaleString()}) — ${x(hotUltra)} likelier in the Hot Zone. Once it’s taken, nobody else can roll it there.`, tip: `A Crown is only as strong as its kingdom: it reaches full strength once ${n(cr('crown').need, 5)} other players own land in the city.` },
    crown_state: { what: `One per state or province, worldwide. Its holder earns ${crownMult('crown_state')} on all their rent.`, get: `Rolls (about 1 in ${Math.round(1e6 / Math.max(1, n(cr('crown_state').ppm, 50))).toLocaleString()}) when you claim a plot in any city of a state that has no State Crown yet.`, tip: `Full strength once ${n(cr('crown_state').need, 25)} other players own land in the state.` },
    crown_country: { what: `One per country. Its holder earns ${crownMult('crown_country')} on all their rent — the biggest boost in LANDVAS.`, get: `Rolls (about 1 in ${Math.round(1e6 / Math.max(1, n(cr('crown_country').ppm, 5))).toLocaleString()}) when you claim a plot in any city of a country that has no Country Crown yet.`, tip: `Full strength once ${n(cr('crown_country').need, 100)} other players own land in the country.` },
    singularity: { what: `${oneIn(chance('singularity'))}. It bends everything around it: every plot you own earns +${n(a.singularity?.pct, 100)}%, and it earns a fortune on its own.`, get: 'Claim any plot anywhere. Good luck.', tip: 'There may only ever be a handful of these.' },
    genesis: { what: `One of the rarest plots in LANDVAS: every plot you own earns +${n(a.genesis?.pct, 25)}% more rent, on top of its own huge rate.`, get: `Claim any plot anywhere. ${oneIn(chance('genesis'))}.`, tip: 'If you roll one, screenshot it. Seriously.' },
  };
}

const BASIC: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

export default function Legend() {
  const nav = useNavigate();
  // the live rates and settings (the same call the Guide uses), so nothing on this page is ever out of date
  const q = useQuery({ queryKey: ['game-guide'], queryFn: api.gameGuide, staleTime: 60_000, refetchInterval: 5 * 60_000 });
  const c = q.data?.config ?? {};
  const live = new Map((q.data?.rarities ?? []).map((r) => [r.id, r]));
  const chance = (id: string) => n(live.get(id)?.chance);
  const rate = (id: RarityId) => n(live.get(id)?.usd_per_second, rarityInfo(id).usd_per_second);
  const ink = (id: RarityId) => n(live.get(id)?.ink_mult, rarityInfo(id).ink_reward_multiplier);
  const odds = (id: RarityId) => {
    if (!live.has(id)) return rarityOdds(id);
    if (id === 'crown') return '1 per city'; if (id === 'crown_state') return '1 per state'; if (id === 'crown_country') return '1 per country';
    const p = chance(id);
    return p >= 0.01 ? `${p >= 0.1 ? Math.round(p * 100) : (p * 100).toFixed(1)}%` : p > 0 ? `1 in ${Math.round(1 / p).toLocaleString()}` : rarityOdds(id);
  };
  const hz = c.hot_zones ?? {};
  const sh = c.shiny ?? {};
  const lk = c.luck ?? {};
  const ds = c.daily_streak ?? {};
  const DETAIL = details(c, chance, n(hz.ultra_mult, 5));
  const shinyOdds = `1 in ${n(sh.one_in, 1000).toLocaleString()}`;
  const crowns = (['crown', 'crown_state', 'crown_country'] as const).map((k) => 1 + n(c.rarity_abilities?.[k]?.pct, k === 'crown' ? 50 : k === 'crown_state' ? 400 : 900) / 100);
  const base = rate('common');
  const tier = (t: string | undefined, d: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : d);
  return (
    <Page>
      <PageHeader eyebrow="The guide" title="📖 Rarities">Every plot you claim rolls a rarity the moment it’s yours. Here’s what each one does for you, and how to get it.</PageHeader>

      <Link to="/guide" className="glass mb-6 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold" data-testid="legend-to-guide">
        <span>📘 The full guide<span className="block text-xs font-semibold text-muted">{NATIVE_APP ? 'Live rates, Ink per activity and what players earn' : 'Live rates, Ink per activity, what players earn, and LANDVAS vs Atlas Earth & TerraMine'}</span></span><span className="text-muted">›</span>
      </Link>
      <div className="-mt-3 mb-6 grid grid-cols-2 gap-2">
        <Link to="/rankings/rarities" className="glass rounded-2xl px-3 py-2.5 text-sm font-bold" data-testid="legend-to-rankings">🏆 Rarity rankings</Link>
        <Link to="/royalty" className="glass rounded-2xl px-3 py-2.5 text-sm font-bold text-[#FFD84D]">👑 Royalty</Link>
      </div>

      <section className="mb-7 grid gap-3" data-testid="legend-basics">
        <h2 className="eyebrow">How it works</h2>
        <ul className="glass grid gap-2.5 rounded-3xl p-4 text-sm leading-relaxed">
          <li>🎲 <b>Rarity is rolled when you claim a plot</b> — in the full game or with Simple mode’s roll button. It never changes after that.</li>
          <li>💵 <b>Rarer plots earn more rent</b>, every second, for as long as you own them — even while you’re away.</li>
          <li>🎮 <b>Rarer plots pay more Ink</b> from their minigame, too (the Ink bonus below).</li>
          <li>🌌 <b>Ultra rarities</b> are rolled separately, before anything else, and each earns in its own special way.</li>
          <li>✨ <b>Any plot can be Shiny</b> on top of its rarity — {shinyOdds} claims — and a Shiny plot earns ×{n(sh.rent_mult, 5)} rent.</li>
        </ul>
      </section>

      <section className="mb-7 grid gap-3" data-testid="legend-everyday">
        <h2 className="eyebrow">The everyday rarities</h2>
        <div className="grid gap-2">
          {BASIC.map((r) => {
            const i = rarityInfo(r);
            return (
              <div key={r} className="glass flex items-center gap-3 rounded-2xl p-3" data-testid={`legend-${r}`}>
                <BasePlotArt rarity={r} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2"><b style={{ color: i.color }}>{i.name}</b><span className="text-xs font-bold text-muted tnum">{odds(r)} of claims · <Link to={`/rankings/rarities?r=${r}`} className="text-accent-2 hover:underline">🏆</Link></span></div>
                  <div className="text-xs text-muted tnum">{formatRate(rate(r))} rent · ×{(rate(r) / base).toFixed(1)} a Common · ×{ink(r)} Ink</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-7 grid gap-3" data-testid="legend-ultras">
        <h2 className="eyebrow">Ultra rarities</h2>
        <p className="-mt-1 text-sm text-muted">Each has its own tiny roll on every claim, and its own way of earning.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {RARITY_ORDER.filter((r) => ULTRA.includes(r)).map((r) => {
            const i = rarityInfo(r);
            const d = DETAIL[r];
            return (
              <article key={r} className="glass grid gap-2 rounded-3xl p-4" style={{ boxShadow: `inset 0 0 0 1.5px ${i.color}44` }} data-testid={`legend-${r}`}>
                <header className="flex items-center gap-3">
                  <BasePlotArt rarity={r} size={52} />
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-lg font-black" style={{ color: i.color }}>{i.emoji} {i.name}</div>
                    <div className="text-xs font-bold text-muted tnum">{odds(r)} · {formatRate(rate(r))} rent · ×{ink(r)} Ink</div>
                  </div>
                </header>
                <p className="text-sm leading-relaxed"><b>What it does: </b>{d?.what ?? i.ability}</p>
                {d && <p className="text-sm leading-relaxed"><b>How to get it: </b>{d.get}</p>}
                {d && <p className="rounded-xl bg-white/[0.05] px-3 py-2 text-xs text-muted">💡 {d.tip}</p>}
                <Link to={`/rankings/rarities?r=${r}`} className="text-xs font-bold text-accent-2 hover:underline">🏆 Who owns the most {i.name} →</Link>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mb-7 grid gap-3" data-testid="legend-boosts">
        <h2 className="eyebrow">Better odds, more rent</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <article className="glass grid gap-1.5 rounded-3xl p-4 text-sm leading-relaxed">
            <b>✨ Shiny</b>
            <p>Any claim, any rarity: a {shinyOdds} chance to come out Shiny. A Shiny plot earns ×{n(sh.rent_mult, 5)} its rarity’s rent. A Shiny Mythic is a very good day.</p>
          </article>
          <article className="glass grid gap-1.5 rounded-3xl p-4 text-sm leading-relaxed">
            <b>🔥 The Hot Zone</b>
            <p>Every day a different city somewhere in the world is the Hot Zone. Plots claimed there roll twice and keep the better rarity, ultras are {n(hz.ultra_mult, 5)}× likelier, Shiny {n(hz.shiny_mult, 2)}× likelier — and its Crown is {n(hz.ultra_mult, 5)}× likelier too. Tap the 🔥 chip on the map to fly there or roll a plot there.</p>
          </article>
          <article className="glass grid gap-1.5 rounded-3xl p-4 text-sm leading-relaxed">
            <b>📅 The daily streak</b>
            <p>Check in every day for Ink ({(ds.ink ?? [20, 30, 40, 50, 60, 80, 120]).join(', ')} through the week). Every 7th day in a row you get a free roll that’s guaranteed {tier(ds.week_ticket, 'Rare')} or better; every 30th day, guaranteed {tier(ds.day30_ticket, 'Legendary')} or better, plus {n(ds.day30_ink, 500).toLocaleString()} Ink. Checking in also keeps your Phoenix plots lit.</p>
          </article>
          <article className="glass grid gap-1.5 rounded-3xl p-4 text-sm leading-relaxed" data-testid="legend-luck">
            <b>🍀 The Altar of Luck</b>
            <p>Sacrifice Base plots (rarer plots give more), Inkborn ({n(lk.inkborn, 12)} Luck, {n(lk.inkborn_bonded, 20)} if bonded), eggs ({n(lk.egg, 8)}, rare eggs {n(lk.egg_rare, 18)}) or offer Ink ({n(lk.ink_per_point, 50)} Ink a point) to charge your Luck up to {n(lk.max, 100)}. Your next claim spends all of it: one extra roll for every {n(lk.points_per_roll, 20)} Luck (up to {n(lk.max_rolls, 6)}) — it keeps the best — and every ultra gets likelier (×{+(1 + n(lk.max, 100) / Math.max(1, n(lk.points_per_ultra_x, 10))).toFixed(1)} at full Luck). Tap the 🍀 chip to open the altar.</p>
          </article>
          <article className="glass grid gap-1.5 rounded-3xl p-4 text-sm leading-relaxed" data-testid="legend-crowns">
            <b>👑 Crowns: a kingdom of your own <Link to="/royalty" className="ml-1 text-xs font-bold text-[#FFD84D] hover:underline" data-testid="legend-royalty">See who rules →</Link></b>
            <p>City Crown ×{+crowns[0].toFixed(2)}, State Crown ×{+crowns[1].toFixed(2)}, Country Crown ×{+crowns[2].toFixed(2)}. Only your best Crown of each tier counts, and the tiers add up — all three is ×{+(crowns[0] + crowns[1] + crowns[2] - 2).toFixed(2)} on everything you own.</p>
            <p>A Crown is only as strong as its kingdom: it grows to full strength as other players claim land there ({n(c.rarity_abilities?.crown?.need, 5)} in a city, {n(c.rarity_abilities?.crown_state?.need, 25)} in a state, {n(c.rarity_abilities?.crown_country?.need, 100)} in a country). An empty town’s Crown is worth very little — until people show up.</p>
          </article>
        </div>
      </section>

      <div className="mb-10 flex justify-center">
        <button className="lv-gbtn px-5 py-2.5 text-sm" onClick={() => nav(-1)} data-testid="legend-back">Back to the game</button>
      </div>
    </Page>
  );
}
