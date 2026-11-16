import { useState } from 'react';
import { LuckLiquid } from '../../ui/OrbGlyph';
import type { Chapter } from '../types';
import { fmtN, oddsText, type Ctx } from '../live';
import { B, Bullets, Combo, Facts, Figure, GoRow, Note, P, Pro, Steps, Table, Tip, Warn } from '../ui';
import { HotZone, Meter, RerollFan } from '../visuals';
import { ultrasOf } from './roll';

/** the chance that at least one ultra turns up on a claim with n rerolls armed */
function ultraChance(c: Ctx, n: number) {
  const p = ultrasOf(c).reduce((s, r) => s + (r.ppm ?? 0), 0) / 1e6;
  const per = c.n('luck.points_per_roll', 20), step = c.n('luck.points_per_ultra_x', 10);
  const x = 1 + (n * per) / step;
  const miss = (1 - p) * Math.pow(1 - Math.min(1, p * x), n);
  return { p, x, any: 1 - miss };
}

function UltraOdds({ c }: { c: Ctx }) {
  const max = c.n('luck.max_rolls', 6) - 1;
  const [n, setN] = useState(max);
  const u = ultraChance(c, n);
  const base = ultraChance(c, 0);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: max + 1 }, (_, i) => (
          <button key={i} onClick={() => setN(i)} className={`rounded-full px-3 py-1.5 text-xs font-black ${i === n ? 'bg-[#3DDC97] text-[#06281A]' : 'bg-white/10 text-white'}`} data-testid={`hb-luck-${i}`}>
            {i === 0 ? 'No Luck' : `${i} reroll${i > 1 ? 's' : ''} · −${i * c.n('luck.points_per_roll', 20)}`}
          </button>
        ))}
      </div>
      <Facts cols={3} items={[
        { k: 'Rolls you see', v: String(n + 1), hint: 'you keep the one you like', c: '#fff' },
        { k: 'Ultra odds on each reroll', v: n ? `×${fmtN(u.x, 1)}` : '×1', c: '#FFE14D' },
        { k: 'Chance of an ultra', v: oddsText(u.any), hint: n ? `vs ${oddsText(base.any)} with no Luck` : 'a normal claim', c: '#3DDC97' },
      ]} />
    </div>
  );
}

export const luck: Chapter = {
  id: 'luck',
  emoji: '🍀',
  title: 'Luck, Hot Zones & tickets',
  blurb: 'Charge Luck at the Altar for rerolls and likelier ultras, roll in the daily Hot Zone, and use guaranteed roll tickets.',
  color: '#3DDC97',
  topics: [
    {
      id: 'altar', emoji: '🍀', title: 'The Altar of Luck',
      summary: 'Sacrifice plots, Inkborn, eggs or Ink to charge your Luck. Luck turns into rerolls on your next claim.',
      keys: 'luck altar sacrifice charge luck points clover reroll',
      body: (c) => {
        const pl = c.v<Record<string, number>>('luck.plot', { common: 3, uncommon: 5, rare: 8, epic: 15, legendary: 30, mythic: 60, ultra: 100 });
        return (
          <>
            <div className="grid items-center gap-4 sm:grid-cols-[120px_1fr]">
              <div className="relative mx-auto h-[110px] w-[110px] overflow-hidden rounded-full bg-[#0B1230] ring-2 ring-[#3DDC97]/50"><LuckLiquid fill={0.6} /><span className="absolute inset-0 grid place-items-center text-[40px]">🍀</span></div>
              <div className="grid gap-2">
                <P>Luck goes from 0 to <B>{fmtN(c.n('luck.max', 100))}</B>. Tap 🍀 on the map to open the Altar and feed it. Every <B>{fmtN(c.n('luck.points_per_roll', 20))} Luck</B> is one reroll you can arm for your next claim, up to {fmtN(c.n('luck.max_rolls', 6) - 1)}.</P>
                <Meter value={60} max={c.n('luck.max', 100)} color="#3DDC97" label="Example: 60 Luck = 3 rerolls ready" marks={[20, 40, 60, 80]} />
              </div>
            </div>
            <Table head={['Offer', 'Luck']} rows={[
              ...(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const).map((r) => [`${/^[aeiou]/.test(r) ? 'An' : 'A'} ${r[0].toUpperCase()}${r.slice(1)} Base plot`, `+${fmtN(Number(pl[r] ?? 0))}`]),
              ['An ultra Base plot', `+${fmtN(Number(pl.ultra ?? 100))} (fills it)`],
              ['An Inkborn', `+${fmtN(c.n('luck.inkborn', 12))} (+${fmtN(c.n('luck.inkborn_bonded', 20))} if bonded)`],
              ['An Inkborn egg', `+${fmtN(c.n('luck.egg', 8))} (+${fmtN(c.n('luck.egg_rare', 18))} for a rare one)`],
              ['Ink', `1 Luck per ${fmtN(c.n('luck.ink_per_point', 50))} Ink (a reroll = ${fmtN(c.n('luck.ink_per_point', 50) * c.n('luck.points_per_roll', 20))} Ink)`],
            ]} note="Offer as much as you like: only what fits under the maximum is taken." />
            <Warn>Only <B>Base plots that stand alone</B> can be sacrificed: not merged, not your last plot. A sacrificed plot goes back to the world for good.</Warn>
          </>
        );
      },
    },
    {
      id: 'rerolls', emoji: '🎲', title: 'Rerolls: see every roll, keep one',
      summary: 'Arm rerolls before you claim. You see the plot’s own roll plus every reroll, then keep the one you like.',
      keys: 'reroll arm keep pick choose best roll luck how rerolls work',
      body: (c) => (
        <>
          <Figure caption="With 3 rerolls armed, the claim rolls 4 times. Each roll comes with its own minigame and shine. Keep any one.">
            <RerollFan rolls={[{ name: 'Rare', color: '#2FB8FF' }, { name: 'Common', color: '#3DDC97' }, { name: 'Legendary', color: '#FFB31F' }, { name: 'Epic', color: '#A45CFF' }]} keep={2} />
          </Figure>
          <Steps items={[
            <>Open the Altar (🍀) and <B>arm</B> how many rerolls to spend: 1 to {fmtN(c.n('luck.max_rolls', 6) - 1)}. Or hold the 🍀 chip to arm all you have.</>,
            <>Claim a plot. The first roll is the <B>plot’s own roll</B>; every reroll is a fresh one, with its own rarity, style and shine.</>,
            <>The tray shows them all. <B>Pick the one you keep</B>: the rarest is picked for you, but you choose (another minigame might suit you better).</>,
          ]} />
          <Bullets items={[
            <>Every reroll also makes <B>ultras likelier</B>: ×(1 + Luck spent ÷ {fmtN(c.n('luck.points_per_ultra_x', 10))}) on each reroll. All {fmtN(c.n('luck.max_rolls', 6) - 1)} rerolls = ultras ×{fmtN(1 + ((c.n('luck.max_rolls', 6) - 1) * c.n('luck.points_per_roll', 20)) / c.n('luck.points_per_ultra_x', 10))}.</>,
            'Luck that isn’t armed is saved. Disarm any time and nothing is spent.',
            'Quick rerolls in the Altar make the drum spin faster.',
            'Crowns ignore Luck (they’re never rerolled away).',
          ]} />
          <Figure caption="Try it: how arming rerolls changes your chance of an ultra on one claim (live odds).">
            <UltraOdds c={c} />
          </Figure>
          <Pro title="All in, once">Ultra odds per reroll grow with the Luck you spend. Arming all your rerolls on one claim beats spending them one at a time.</Pro>
        </>
      ),
    },
    {
      id: 'eluck', emoji: '✨', title: 'Enchanted Luck',
      summary: 'Buy charges with Ink to raise the chance your next roll comes out Enchanted.',
      keys: 'enchanted luck charges enchantment chance buy',
      body: () => (
        <>
          <Facts items={[
            { k: 'A charge costs', v: '150 Ink' },
            { k: 'Each charge', v: '+2 points', hint: 'on top of the usual 2%' },
            { k: 'Most at once', v: '9 charges', hint: 'up to 20% on that roll' },
          ]} />
          <Bullets items={[
            'Charges are used up by your very next plot roll, Enchanted or not.',
            'Bought at the Altar of Luck, in its ✨ Enchanted Luck panel.',
            'Some enchantments, the Leviathan and Pandora’s Box also hand out Enchanted Luck.',
          ]} />
          <Combo>Stack Enchanted Luck and armed Luck on the same claim: you get all the rerolls <i>and</i> a better shot at an enchantment.</Combo>
        </>
      ),
    },
    {
      id: 'hot', emoji: '🔥', title: 'The Hot Zone',
      summary: 'One real city a day where every claim rolls twice and keeps the better, ultras are ×5 and Shiny ×2.',
      keys: 'hot zone city today boosted rarity better roll fly hot zone roll',
      body: (c) => {
        const city = c.hz?.today?.name ?? 'Today’s city';
        const ultra = c.hz?.ultra_mult ?? c.n('hot_zones.ultra_mult', 5);
        const shiny = c.hz?.shiny_mult ?? c.n('hot_zones.shiny_mult', 2);
        return (
          <>
            <Figure caption={c.hz?.today ? `Today it’s ${c.hz.today.name}${c.hz.tomorrow ? `; tomorrow it’s ${c.hz.tomorrow.name}` : ''}. It changes at ${c.resetLocal}.` : `A new city every day, at ${c.resetLocal} your time.`}>
              <HotZone city={city} ultra={ultra} shiny={shiny} />
            </Figure>
            <Bullets items={[
              <>Inside the zone (the whole city), every claim <B>rolls twice and keeps the better rarity</B>, ultras are <B>×{fmtN(ultra)}</B> as likely and Shiny <B>×{fmtN(shiny)}</B>.</>,
              <><B>Roll there from anywhere</B> for {fmtN(c.n('hot_zones.roll_ink', 150))} Ink a roll: the game picks a free plot somewhere in the zone for you.</>,
              <><B>Or fly there</B> (open the 🔥 Hot Zone card → ✈️ Fly there) and claim the plots you choose, at the normal price. It uses one of your trips.</>,
              'Arcade cabinets in the Hot Zone pay ×1.5 Ink and ×2 tickets.',
            ]} />
            <Combo title="The best claims in the game">Fly to the Hot Zone, arm all your Luck, then claim. Your plot’s own roll gets the Hot Zone’s best-of-two and ×{fmtN(ultra)} ultras, and every reroll gets your Luck’s ultra boost.</Combo>
          </>
        );
      },
    },
    {
      id: 'tickets', emoji: '🎫', title: 'Roll tickets',
      summary: 'A free plot roll guaranteed a minimum rarity. Here is where they come from.',
      keys: 'ticket tickets guaranteed roll rare+ epic+ legendary+ mythic+ free plot',
      body: () => (
        <>
          <P>A <B>roll ticket</B> rolls a free plot for you (the game picks a free spot, as in Simple mode) and guarantees at least the rarity on the ticket. It can still roll higher, ultras included.</P>
          <Table head={['Ticket', 'Where it comes from']} rows={[
            ['Rare+', 'every 7th day of your streak · a Golden Goose ★3 every 5th egg · the Void Gate'],
            ['Epic+', 'Treasure Map digs · the Leviathan (top 10% of fighters) · Eleven-Eleven wishes · the Fated Deck (complete all 22 cards) · the Genie ★3 weekly boon · the Void Gate (10%)'],
            ['Legendary+', 'every 30th day of your streak · Hope from Pandora’s Box · the Leviathan’s top fighter · Treasure Map digs (rarely)'],
            ['Mythic+', 'the Genie, when it goes free after a Forbidden Wish · Pandora ★3’s Greater Hope'],
          ]} dense />
          <Tip>Tickets wait until you use them (the streak card holds yours). Use them while your Luck is armed and they get the rerolls too.</Tip>
          <GoRow links={[['/hub', 'Your rewards on the Play tab']]} />
        </>
      ),
    },
    {
      id: 'math', emoji: '🧮', title: 'Luck maths: what’s worth it',
      summary: 'Where Luck is cheapest, and when to spend it.',
      keys: 'luck strategy cheapest luck worth it sacrifice commons math',
      body: (c) => {
        const ink = c.n('luck.ink_per_point', 50), per = c.n('luck.points_per_roll', 20);
        const price = c.n('economy.acquire.base_ink', 100);
        const common = Number(c.v<Record<string, number>>('luck.plot', { common: 3 }).common ?? 3);
        return (
          <>
            <Table head={['Way to get one reroll', 'Costs you']} rows={[
              ['Ink', `${fmtN(ink * per)} Ink (${fmtN((ink * per) / price)} plots’ worth)`],
              ['Common Base plots', `${fmtN(Math.ceil(per / common))} of them`],
              ['A Mythic Base plot', `one plot gives ${fmtN(Number(c.v<Record<string, number>>('luck.plot', { mythic: 60 }).mythic ?? 60) / per, 1)} rerolls`],
              ['Inkborn eggs', `${fmtN(Math.ceil(per / c.n('luck.egg', 8)))} eggs`],
            ]} />
            <Pro title="Sacrifice spent plots">A Common plot still has its whole minigame inside it (about a thousand Ink over its levels). Play a plot’s game to the end before you give it to the Altar, then it has paid you twice.</Pro>
            <Note>Rerolls matter most where the stakes are highest: Hot Zone claims, roll tickets, and claims where you’re hunting an ultra for a combo (a second Gemini, a Mirror for your best plot).</Note>
          </>
        );
      },
    },
  ],
};
