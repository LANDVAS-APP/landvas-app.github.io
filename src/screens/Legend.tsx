// The rarity guide: every rarity in plain words — what it earns, what makes it special, and how to get one.
// Odds and rates come from the live rarity table, so the page never drifts from the game.
import { Link, useNavigate } from 'react-router-dom';
import { Page, PageHeader } from '../app/Shell';
import { BasePlotArt } from '../plot/BasePlotArt';
import { RARITY_ORDER, ULTRA, rarityInfo, rarityOdds, type RarityId } from '../shared/rarity';
import { formatRate } from '../shared/rent';

/** what each special rarity does, in more words than fit on a badge */
const DETAIL: Partial<Record<RarityId, { what: string; get: string; tip: string }>> = {
  solar: {
    what: 'Earns ×3 rent whenever the sun is up at the plot’s real spot on Earth — sunrise to sunset, by the real sun there. At night it earns its normal rate.',
    get: 'Claim any plot anywhere. Every claim has its own Solar chance.',
    tip: 'A Solar plot on the other side of the world is in daylight while you sleep.',
  },
  lunar: {
    what: 'The night twin of Solar: ×3 rent while it’s dark at the plot’s real spot, normal rent in the day.',
    get: 'Claim any plot anywhere. Every claim has its own Lunar chance.',
    tip: 'Pair a Solar and a Lunar in the same city and one of them is always boosted.',
  },
  comet: {
    what: 'Once a day its comet passes over: for one whole hour it earns ×30 rent. Each Comet plot has its own comet hour, the same hour every day — your plot shows when it is.',
    get: 'Claim any plot anywhere.',
    tip: 'One comet hour is worth more than a whole extra day of normal rent.',
  },
  chaos: {
    what: 'Its rent multiplier re-rolls once a day: ×0, ×½, ×1, ×2, ×3, ×5, ×10 or even ×20. Some days it earns nothing, some days it earns twenty times over — it averages about ×4.5.',
    get: 'Claim any plot anywhere.',
    tip: 'Check your plot each day to see what today rolled.',
  },
  phoenix: {
    what: 'Lives on your daily check-in streak: +10% rent for every day in a row you check in — a 30-day streak is ×4, 100 days ×11, all the way to ×37.5 at a full year (365 days). Miss a day and it falls to ashes (×1) until a new streak lights it again.',
    get: 'Claim any plot anywhere. Keep it burning with the daily check-in.',
    tip: 'The longer the streak, the bigger the bird. Never miss a day.',
  },
  ancient: {
    what: 'Grows with age: +3% rent for every day you own it, up to ×6. It never fades, so the longer you hold it the better it gets.',
    get: 'Claim any plot anywhere.',
    tip: 'Never sell an Ancient — its age starts over with a new owner.',
  },
  prismatic: {
    what: 'Boosts everything you own: every plot you own earns +5% more rent. Each Prismatic adds another +5%, up to +50%.',
    get: 'Claim any plot anywhere. One claim in 100,000.',
    tip: 'The more land you own, the more a Prismatic is worth.',
  },
  kraken: {
    what: 'Lurks under the map and drags in the rent around it: +75% for every plot owned by another player within about 200 m, up to ×20. Your own plots don’t feed it — it needs a crowd.',
    get: 'Claim any plot anywhere — it’s at its best downtown, in the Hot Zone, or anywhere busy.',
    tip: 'Every new neighbour makes it stronger: a Kraken in a busy city can hit ×20.',
  },
  gemini: {
    what: 'Comes alive in pairs. One Gemini plot is an ordinary ultra — but own two and each of them earns ×12.',
    get: 'Claim any plot anywhere, and keep hunting for its twin.',
    tip: 'The second Gemini is the jackpot: it lights up the first one too.',
  },
  mirror: {
    what: 'Copies the rent of your best other plot. On its own it earns like a decent ultra; next to a Genesis, a Crown or a Singularity it earns like one of those.',
    get: 'Claim any plot anywhere.',
    tip: 'The better your best plot, the better your Mirror.',
  },
  crown: {
    what: 'Every city in the world (2,900+) has exactly one City Crown. Its holder earns ×1.5 on all their rent.',
    get: 'Only rolls when you claim a plot inside a city whose Crown hasn’t been claimed — 5× likelier in the Hot Zone. Once it’s taken, nobody else can roll it there.',
    tip: 'A Crown is only as strong as its kingdom: it reaches full strength once 5 other players own land in the city.',
  },
  crown_state: {
    what: 'One per state or province, worldwide. Its holder earns ×5 on all their rent.',
    get: 'Rolls (about 1 in 20,000) when you claim a plot in any city of a state that has no State Crown yet.',
    tip: 'Full strength once 25 other players own land in the state.',
  },
  crown_country: {
    what: 'One per country. Its holder earns ×10 on all their rent — the biggest boost in LANDVAS.',
    get: 'Rolls (about 1 in 200,000) when you claim a plot in any city of a country that has no Country Crown yet.',
    tip: 'Full strength once 100 other players own land in the country.',
  },
  singularity: {
    what: 'One claim in a million. It bends everything around it: every plot you own earns double, and it earns a fortune on its own.',
    get: 'Claim any plot anywhere. Good luck.',
    tip: 'There may only ever be a handful of these.',
  },
  genesis: {
    what: 'The rarest plot in LANDVAS: every plot you own earns +25% more rent, on top of its own huge rate.',
    get: 'Claim any plot anywhere. One claim in 500,000.',
    tip: 'If you roll one, screenshot it. Seriously.',
  },
};

const BASIC: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

export default function Legend() {
  const nav = useNavigate();
  const base = rarityInfo('common').usd_per_second;
  return (
    <Page>
      <PageHeader eyebrow="The guide" title="📖 Rarities">Every plot you claim rolls a rarity the moment it’s yours. Here’s what each one does for you, and how to get it.</PageHeader>

      <Link to="/guide" className="glass mb-6 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold" data-testid="legend-to-guide">
        <span>📘 The full guide<span className="block text-xs font-semibold text-muted">Live rates, Ink per activity, what players earn, and LANDVAS vs Atlas Earth & TerraMine</span></span><span className="text-muted">›</span>
      </Link>

      <section className="mb-7 grid gap-3" data-testid="legend-basics">
        <h2 className="eyebrow">How it works</h2>
        <ul className="glass grid gap-2.5 rounded-3xl p-4 text-sm leading-relaxed">
          <li>🎲 <b>Rarity is rolled when you claim a plot</b> — in the full game or with Simple mode’s roll button. It never changes after that.</li>
          <li>💵 <b>Rarer plots earn more rent</b>, every second, for as long as you own them — even while you’re away.</li>
          <li>🎮 <b>Rarer plots pay more Ink</b> from their minigame, too (the Ink bonus below).</li>
          <li>🌌 <b>Ultra rarities</b> are rolled separately, before anything else, and each earns in its own special way.</li>
          <li>✨ <b>Any plot can be Shiny</b> on top of its rarity — 1 in 1,000 claims — and a Shiny plot earns ×5 rent.</li>
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
                  <div className="flex items-baseline justify-between gap-2"><b style={{ color: i.color }}>{i.name}</b><span className="text-xs font-bold text-muted tnum">{rarityOdds(r)} of claims</span></div>
                  <div className="text-xs text-muted tnum">{formatRate(i.usd_per_second)} rent · ×{(i.usd_per_second / base).toFixed(1)} a Common · ×{i.ink_reward_multiplier} Ink</div>
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
                    <div className="text-xs font-bold text-muted tnum">{rarityOdds(r)} · {formatRate(i.usd_per_second)} rent · ×{i.ink_reward_multiplier} Ink</div>
                  </div>
                </header>
                <p className="text-sm leading-relaxed"><b>What it does: </b>{d?.what ?? i.ability}</p>
                {d && <p className="text-sm leading-relaxed"><b>How to get it: </b>{d.get}</p>}
                {d && <p className="rounded-xl bg-white/[0.05] px-3 py-2 text-xs text-muted">💡 {d.tip}</p>}
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
            <p>Any claim, any rarity: a 1 in 1,000 chance to come out Shiny. A Shiny plot earns ×5 its rarity’s rent. A Shiny Mythic is a very good day.</p>
          </article>
          <article className="glass grid gap-1.5 rounded-3xl p-4 text-sm leading-relaxed">
            <b>🔥 The Hot Zone</b>
            <p>Every day a different city somewhere in the world is the Hot Zone. Plots claimed there roll twice and keep the better rarity, ultras are 5× likelier, Shiny 2× likelier — and its Crown is 5× likelier too. Tap the 🔥 chip on the map to fly there or roll a plot there.</p>
          </article>
          <article className="glass grid gap-1.5 rounded-3xl p-4 text-sm leading-relaxed">
            <b>📅 The daily streak</b>
            <p>Check in every day for Ink. Every 7th day in a row you get a free roll that’s guaranteed Rare or better; every 30th day, guaranteed Legendary or better, plus 500 Ink. Checking in also keeps your Phoenix plots lit.</p>
          </article>
          <article className="glass grid gap-1.5 rounded-3xl p-4 text-sm leading-relaxed" data-testid="legend-luck">
            <b>🍀 The Altar of Luck</b>
            <p>Sacrifice Base plots (rarer plots give more) or offer Ink (50 a point, 30 points a day) to charge your Luck up to 100. Your next claim spends all of it: one extra roll for every 20 Luck — it keeps the best — and every ultra gets likelier (×11 at full Luck). Tap the 🍀 chip to open the altar.</p>
          </article>
          <article className="glass grid gap-1.5 rounded-3xl p-4 text-sm leading-relaxed" data-testid="legend-crowns">
            <b>👑 Crowns: a kingdom of your own</b>
            <p>City Crown ×1.5, State Crown ×5, Country Crown ×10. Only your best Crown of each tier counts, and the tiers add up — all three is ×14.5 on everything you own.</p>
            <p>A Crown is only as strong as its kingdom: it grows to full strength as other players claim land there (5 in a city, 25 in a state, 100 in a country). An empty town’s Crown is worth very little — until people show up.</p>
          </article>
        </div>
      </section>

      <div className="mb-10 flex justify-center">
        <button className="lv-gbtn px-5 py-2.5 text-sm" onClick={() => nav(-1)} data-testid="legend-back">Back to the game</button>
      </div>
    </Page>
  );
}
