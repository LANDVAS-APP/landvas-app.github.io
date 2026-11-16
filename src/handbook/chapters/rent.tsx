import { useState } from 'react';
import { Slider } from '../../ui';
import type { Chapter } from '../types';
import { fmtN, perSec, usd, type Ctx } from '../live';
import { B, Combo, Facts, Figure, Formula, GoRow, Note, P, Pro, Steps, Table, Tip, Warn } from '../ui';
import { BoostDay } from '../visuals';
import { boostAvg } from './roll';

/** what an average claim earns per second (each everyday rarity's chance × its rent, plus Shiny) */
export function avgRate(c: Ctx) {
  const base = c.everyday.reduce((s, r) => s + r.chance * r.usd, 0) / Math.max(1e-9, c.everyday.reduce((s, r) => s + r.chance, 0));
  const one = c.n('shiny.one_in', 1000), mult = c.n('shiny.rent_mult', 5);
  return base * (1 + (one > 0 ? (mult - 1) / one : 0));
}

function RentCalc({ c }: { c: Ctx }) {
  const [plots, setPlots] = useState(50);
  const [boostDays, setBoostDays] = useState(1);
  const b = boostAvg(c);
  const rate = avgRate(c);
  const day = rate * 86400 * (boostDays ? b.avg : 1) * plots;
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Slider id="hb-rent-plots" label="Plots you own" value={plots} min={1} max={2000} step={1} onChange={setPlots} format={(v) => fmtN(v)} />
        <Slider id="hb-rent-boost" label="Use your free boosts" value={boostDays} min={0} max={1} step={1} onChange={setBoostDays} format={(v) => (v ? 'every day' : 'never')} />
      </div>
      <Facts cols={4} items={[
        { k: 'Per second', v: perSec(rate * plots * (boostDays ? b.avg : 1)), c: '#3DDC97' },
        { k: 'Per day', v: usd(day), c: '#3DDC97' },
        { k: 'Per month', v: usd(day * 30), c: '#3DDC97' },
        { k: 'Per year', v: usd(day * 365), c: '#3DDC97' },
      ]} />
      <p className="text-[11.5px] text-muted">An average mix of everyday rarities (by their real odds, Shiny included). Ultras, Crowns and the rent boosters below can multiply this many times over.</p>
    </div>
  );
}

export const rent: Chapter = {
  id: 'rent',
  emoji: '💵',
  title: 'Rent',
  blurb: 'How your land earns every second, the ×20 boost, rent day, turning rent into Ink, and every rent booster.',
  color: '#3DDC97',
  topics: [
    {
      id: 'how', emoji: '💵', title: 'How rent works',
      summary: 'Every plot you own earns USD rent every second, around the clock, online or not.',
      keys: 'rent usd dollars per second earn passive income offline how much does a plot earn',
      body: (c) => (
        <>
          <P>Each plot earns its rarity’s rate, every second, for as long as you own it. Your HUD shows the total ticking up live. The game banks it for you whenever you play, and keeps counting while you’re away for up to <B>{fmtN(c.n('rent.max_offline_days', 30))} days</B> at a time.</P>
          <Formula>your rent / second = <em>Σ</em> (each plot’s rarity rate × Shiny × its ultra ability) × your rent boosters × the boost while it runs</Formula>
          <Facts items={[
            { k: 'An average claim', v: `${usd(avgRate(c) * 86400)} a day`, hint: `${perSec(avgRate(c))} a second, by the real odds` },
            { k: 'Offline cap', v: `${fmtN(c.n('rent.max_offline_days', 30))} days`, hint: 'open the game once a month and it never matters' },
            { k: 'Rent → Ink', v: `$1 = ${fmtN(c.n('rent.convert.ink_per_usd', 100))}`, hint: 'from $0.01', c: '#34C3FF' },
          ]} />
          <Warn>If you don’t open the game for more than {fmtN(c.n('rent.max_offline_days', 30))} days, rent stops counting at that point until you come back. Any visit banks it and starts the clock again.</Warn>
        </>
      ),
    },
    {
      id: 'boost', emoji: '⚡', title: 'The rent boost',
      summary: 'Tap Boost and all your rent earns ×20 while it runs. Free boosts come back every day.',
      keys: 'boost x20 20x multiplier free boosts stack hours rent boost',
      body: (c) => {
        const b = boostAvg(c);
        return (
          <>
            <Figure caption={`With all ${fmtN(c.n('rent.boost.free_per_day', 6))} free boosts used, a day of rent is worth about ×${b.avg.toFixed(2)} an unboosted day.`}>
              <BoostDay hours={b.hours} mult={b.mult} />
            </Figure>
            <Facts cols={4} items={[
              { k: 'Multiplier', v: `×${fmtN(b.mult)}`, c: '#FFC93D' },
              { k: 'Free boosts a day', v: fmtN(c.n('rent.boost.free_per_day', 6)), hint: `${fmtN(c.n('rent.boost.minutes_per_boost', 30))} min each` },
              { k: 'Stacks up to', v: `${fmtN(c.n('rent.boost.max_stack_hours', 8))} h`, hint: 'tap several in a row' },
              { k: 'Come back at', v: c.resetLocal, hint: 'every day' },
            ]} />
            <Steps items={[
              'Tap ⚡ Boost (beside your Ink at the top of the map; on the website, beside your rent).',
              'Each tap adds one free boost to the timer, up to the stack limit.',
              'Everything your land earns while the timer runs is multiplied, including ultra abilities and rent boosters.',
            ]} />
            <Pro title="Stack them">Use every free boost every day; an unused one is gone at the reset. The 🎡 daily wheel can also land a 30-minute boost. Stack boosts before a big rent moment, such as a Comet’s hour or your Landlord rent day, and the multipliers multiply each other.</Pro>
          </>
        );
      },
    },
    {
      id: 'calc', emoji: '🧮', title: 'Rent calculator',
      summary: 'Slide to see what a number of average plots earns a day, a month and a year.',
      keys: 'calculator rent per day month year how much will i earn',
      body: (c) => (
        <>
          <RentCalc c={c} />
          <GoRow links={[['/plots', 'My plots: your real rent, per plot']]} />
        </>
      ),
    },
    {
      id: 'boosters', emoji: '🚀', title: 'Everything that multiplies rent',
      summary: 'Shiny, ultra abilities, pairs, streaks, Crowns, rent day: here is every way to earn more per plot.',
      keys: 'rent boosters multiplier increase rent more money prismatic genesis singularity crown kraken gemini mirror phoenix ancient solar lunar comet chaos shiny eclipse constellation landlord',
      body: (c) => {
        const ab = (k: string, f: string, d: number) => c.n(`rarity_abilities.${k}.${f}`, d);
        return (
          <>
            <Table head={['Booster', 'What it does', 'Applies to']} rows={[
              ['✨ Shiny', `×${fmtN(c.n('shiny.rent_mult', 5))} rent`, 'that plot'],
              ['☀️ Solar / 🌙 Lunar', `×${fmtN(ab('solar', 'mult', 3))} while it’s day / night at the plot’s real place`, 'that plot'],
              ['☄️ Comet', `×${fmtN(ab('comet', 'mult', 30))} for ${fmtN(ab('comet', 'hours', 1))} hour a day (its comet hour)`, 'that plot'],
              ['🎲 Chaos', 'a new multiplier every day, ×0 to ×20', 'that plot'],
              ['🏛️ Ancient', `+${fmtN(ab('ancient', 'per_day', 0.03) * 100)}% for every day you own it, up to ×${fmtN(ab('ancient', 'max', 6))}`, 'that plot'],
              ['🔥 Phoenix', `+${fmtN(ab('phoenix', 'per_day', 0.1) * 100)}% for every day of your check-in streak (up to ${fmtN(ab('phoenix', 'max_days', 365))} days)`, 'that plot'],
              ['🐙 Kraken', `+${fmtN(ab('kraken', 'per_neighbour', 0.75) * 100)}% for every other player’s plot within about 200 m, up to ×${fmtN(ab('kraken', 'max', 20))}`, 'that plot'],
              ['♊ Gemini', `×${fmtN(ab('gemini', 'pair_mult', 12))} each once you own two`, 'each Gemini'],
              ['🪞 Mirror', 'copies the rent of your best other plot', 'that plot'],
              ['🌈 Prismatic', `+${fmtN(ab('prismatic', 'pct', 5))}% on everything (stacks to +${fmtN(ab('prismatic', 'max_pct', 50))}%)`, 'all your plots'],
              ['🌌 Genesis', `+${fmtN(ab('genesis', 'pct', 25))}% on everything`, 'all your plots'],
              ['🕳️ Singularity', 'everything earns double', 'all your plots'],
              ['👑 Crowns', '1% of the rent of everyone else’s land in the kingdom (if you pick the Rent share)', 'added to your rent'],
              ['🏘️ Landlord rent day', `×${fmtN(c.n('residential.landlord_mult', 50))} all day on the 1st of the month (checklist done)`, 'Landlord plots'],
              ['🌗 Eclipse · ✨ Constellation', '×4.5 always · ×26 always (fusions)', 'that plot'],
            ]} dense />
            <Combo title="Combos that stack">
              Boosters multiply each other. A <B>Mirror</B> next to your best ultra earns like a second one. A <B>Phoenix</B> with a long streak climbs toward ×37.5. A <B>Kraken</B> in a busy city is worth far more than one in the countryside. Two <B>Geminis</B> are each worth ×12. And the rent boost multiplies all of it.
            </Combo>
            <Tip>The Ultra tracker on the Play tab shows each of your ultras’ live multiplier and when its window opens (Solar, Lunar, Comet), so you can time your boosts.</Tip>
          </>
        );
      },
    },
    {
      id: 'rentday', emoji: '🏘️', title: 'Rent day (Landlord plots)',
      summary: 'On the 1st of every month, Landlord plots with their checklist done earn ×50 rent all day.',
      keys: 'landlord rent day 1st month 50x tenants checklist estate',
      body: (c) => (
        <>
          <P>Landlord is a Residential subplot: homes you rent to virtual tenants. Through the month, tick off the estate’s checklist. On the <B>1st of the month (UTC)</B>, every Landlord plot whose checklist is done earns <B>×{fmtN(c.n('residential.landlord_mult', 50))} rent all day</B>. The rest of the month it earns normal rent.</P>
          <Table head={['Checklist', 'How']} rows={[
            ['🔍 Inspect', `Visit your estate on ${fmtN(c.n('residential.landlord_tasks.inspect_days', 3))} different days (walking in counts)`],
            ['🔧 Repairs', `Fix ${fmtN(c.n('residential.landlord_tasks.repairs', 6))} broken things: tap them over the houses (new ones break every day)`],
            ['📬 Tenants', `Answer ${fmtN(c.n('residential.landlord_tasks.requests', 3))} tenant requests from the mailbox (2 a day)`],
            ['🌷 Garden', `Water the community garden on ${fmtN(c.n('residential.landlord_tasks.garden', 2))} days`],
          ]} note="You can still finish it on the 1st itself." />
          <Note title="One estate, one task at a time">Each estate’s checklist is done <B>in that estate</B>: repairs, tenant letters and watering only count in the estate you’re standing in, and today’s inspection counts once you’ve spent a moment there (just flicking through estates doesn’t tick it). Tasks go about {fmtN(c.n('residential.landlord_pace.gap_seconds', 1))} second apart; tap as fast as you like and your taps queue up and go one by one.</Note>
          <Combo>Stack your free boosts on the 1st: ×{fmtN(c.n('residential.landlord_mult', 50))} rent day × ×{fmtN(c.n('rent.boost.multiplier', 20))} boost is the biggest rent hour in the game for ordinary plots.</Combo>
        </>
      ),
    },
    {
      id: 'convert', emoji: '🔄', title: 'Turning rent into Ink',
      summary: `Swap any amount of your USD rent for Ink, any time.`,
      keys: 'convert rent to ink exchange swap usd ink',
      body: (c) => {
        const per = c.n('rent.convert.ink_per_usd', 100), price = c.n('economy.acquire.base_ink', 100);
        return (
          <>
            <Facts items={[
              { k: 'Rate', v: `$1 = ${fmtN(per)} Ink`, c: '#34C3FF' },
              { k: 'Smallest swap', v: '$0.01' },
              { k: '$1 of rent buys', v: `${fmtN(per / price, 1)} plot${per / price === 1 ? '' : 's'}` },
            ]} />
            <P>Rent compounds when you turn it into land: more plots → more rent → more plots. Whether that beats keeping it is your call.</P>
          </>
        );
      },
    },
    {
      id: 'cashout', emoji: '🏦', title: 'Cash-out', webOnly: true,
      summary: 'Cash-out isn’t open yet. When it opens in your country, rent can be paid out from a minimum.',
      keys: 'cash out cashout withdraw paypal gift card money real payout',
      body: (c) => (
        <>
          <P>Cash-out is <B>not open yet</B>. When it opens in your country, rent can be paid out once you reach the minimum of <B>${fmtN(c.n('rent.cashout.minimum_usd', 5))}</B>. Until then your rent keeps adding up, and you can turn any of it into Ink.</P>
          <Note>Rent is a game reward, not an investment or a wage. Rates, boosts and limits can change.</Note>
        </>
      ),
    },
  ],
};
