// The rarity guide: every rarity in plain words — what it earns, what makes it special, and how to get one.
// Odds and rates come from the live rarity table, so the page never drifts from the game.
import { useNavigate } from 'react-router-dom';
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
    what: 'Lives on your daily check-in. ×2 rent on every day you check in. Each day you miss, it fades 25% (down to nothing after four missed days). The day you come back and check in, it’s reborn at ×10 for that whole day.',
    get: 'Claim any plot anywhere. Keep it burning with the daily streak check-in.',
    tip: 'Missed a few days? Checking in brings it back bigger than ever.',
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
  crown: {
    what: 'Every city in the world has exactly one Crown. Whoever holds a city’s Crown is its ruler: 2× rent on everything they own (one Crown’s boost per player).',
    get: 'Only rolls when you claim a plot inside a city whose Crown hasn’t been claimed yet — and once it’s taken, nobody else can roll it there. It’s 5× likelier in the Hot Zone. The Collection shows every Crown that’s been claimed.',
    tip: 'Smaller cities count too. Thousands of Crowns are waiting.',
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
          <article className="glass grid gap-1.5 rounded-3xl p-4 text-sm leading-relaxed">
            <b>📖 The collection</b>
            <p>Own plots of 4 different types for +5% rent on everything; all 8 types for +25%. Prismatic, Genesis and a Crown stack on top.</p>
          </article>
        </div>
      </section>

      <div className="mb-10 flex justify-center">
        <button className="lv-gbtn px-5 py-2.5 text-sm" onClick={() => nav(-1)} data-testid="legend-back">Back to the game</button>
      </div>
    </Page>
  );
}
