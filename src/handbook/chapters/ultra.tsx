import { BasePlotArt } from '../../plot/BasePlotArt';
import { NEW_ULTRAS, PRIMORDIALS, rarityInfo, type RarityId } from '../../shared/rarity';
import type { Chapter } from '../types';
import { fmtN, oddsText, usd } from '../live';
import { B, CardGrid, Combo, Facts, GoRow, Note, P, Steps, Table, Tip, Warn } from '../ui';
import { Recipe } from '../visuals';
import { readable } from '../../lib/readable';

/** what each of the newest ultras does each day (the plots' daily deeds) */
const DEEDS: Record<string, string> = {
  volcano: 'Erupts once a day at a random time: 4 obsidian spots 3–14 plots away for an hour. Only you can claim them, and each claim there rolls a tier higher (up to Mythic).',
  world_tree: 'Grows a root a day to your nearest unrooted plot within 2 km (up to 6). The tree and every rooted plot pay ×1.1 in minigames.',
  phantom: 'Everyone else sees a Common: the map, the plot panel and the feed are all masked. Each day it whispers a private reading of an empty spot: claim it within 24 h and you get exactly that.',
  wanderer: 'Gallops once a day to a free spot 4–15 plots away (drawing and all), leaving a 5-spot rainbow trail for an hour: claims on it roll a tier higher, for you only.',
  lodestone: 'Gathers 20 Ink a day (holds up to 3 days) for you to collect. Your Seeking chests bury beside it, and it pulls in +25% Leviathan loot.',
  leyline: 'Casts a beam to your farthest plot within 500 km. Empty spots within 1 plot of the beam roll a tier higher for you.',
  glacier: 'Everything within 8 plots, anyone’s land, counts as anchored: no trampling, no Parasites, no pranks or scorches.',
  mycelium: 'Grows one more mushroom a day on empty spots around it (up to 12). A mushroom spot rolls a tier higher for you.',
  hive: 'Pollinates up to 5 other players’ plots within 30 plots each day (their minigames ×1.1 for 24 h) and brings you 5 Ink of honey per flower.',
};
const POWERS: Record<string, string> = {
  heart_world: 'Weekly: a Golden Hour (next 3 minigame wins ×2) for every player with land within 5 km (up to 1,000 players).',
  throne_ink: 'Each week its holder decrees a rule for the land within 5 km: minigames ×1.15, Shiny ×3, ultras ×2, or peace (everything anchored).',
  serpent_egg: 'Its holder is never trampled, gets +50% Leviathan loot, and once a week can call the live Leviathan toward it.',
  world_eye: 'Sees through every Phantom within 5 km. A daily gaze marks empty spots within 12 plots that would roll Epic or better, for 24 h.',
  void_gate: 'Opens 8 pm–midnight by the sun at its place. Anyone with land nearby steps through once a night for a Rare+ ticket (10% Epic+); its holder gets +5 Ink a traveller.',
  first_light: 'Its holder’s drawing greets every player with land within 5 km on their home screen.',
  fallen_star: 'A weekly shower of 30 shooting stars within 2 km for 20 minutes. Anyone can catch them (Ink, Luck or a Golden Hour); its holder gets +2 Ink a catch.',
  genesis_well: 'Monthly: 25 spots of brand-new land for 48 h where anyone’s claims roll ultras ×3.',
  chrysalis: 'After 30 days it hatches into a random Primordial.',
  hourglass: 'Your enchantments within 5 km run at double speed.',
  sunspot: 'Your own personal Hot Zone, 1 km across, placed anywhere once a day: best of two rolls, ultras ×5, Shiny ×2, for you only.',
  eleven: 'A wish at 11:11 and 23:11 in your time zone: 111 Ink (+11 a wish in a row), 11 Luck, a Golden Hour or an Epic+ ticket. Every 11th wish in a row adds a Legendary+ ticket.',
  loom: 'Every claim you make is rolled twice; you keep the better.',
  upside_down: 'For an hour a week your claims roll from the flipped table (Mythic most common) with ultras ×10, and you keep the better of that and the normal roll.',
  midas: '1 in 25 wins on your own plots turns that plot a tier higher (up to Mythic).',
  chain: 'Each claim has a 30% chance to also claim a free spot beside it, chaining up to 5.',
  transmuter: 'Daily: 5 plots of one rarity (Common–Legendary) become one plot a tier higher (the other 4 are released).',
  doubling_cube: 'Daily: double or nothing. A Common–Legendary plot of yours goes a tier up or down, 50/50.',
  rift: 'Daily: open a rift anywhere on Earth for 24 h. Claims within 150 m of it count as if you were there.',
};

export const ultra: Chapter = {
  id: 'ultra',
  emoji: '🌌',
  title: 'Ultras, Fusions & Primordials',
  blurb: 'The land-changing ultras, the Fusion Lab’s recipes, and the 19 Primordials (only ever rolled) that change the game for everyone around them.',
  color: '#FF7AE0',
  topics: [
    {
      id: 'classic', emoji: '☀️', title: 'Getting the most from each ultra',
      summary: 'Every ultra earns in its own way. Here’s how to play each one.',
      keys: 'ultra strategy solar lunar comet chaos phoenix gemini kraken ancient mirror prismatic genesis singularity tips',
      body: () => (
        <>
          <Table head={['Ultra', 'How to play it']} rows={[
            ['☀️ Solar · 🌙 Lunar', 'Earns ×3 while it’s day (Solar) or night (Lunar) at the plot’s real place. Owning one of each covers the whole day, and they fuse into an Eclipse (×4.5 always).'],
            ['☄️ Comet', 'Its comet hour is ×30. Stack your free boosts on top of that hour: the ×20 boost multiplies it.'],
            ['🎲 Chaos', 'A new multiplier every day from ×0 to ×20. Nothing to do but enjoy the good days.'],
            ['🔥 Phoenix', 'Never miss a check-in: +10% a day all the way to ×37.5 at a 365-day streak, and back to ashes if you miss one.'],
            ['♊ Gemini', 'One alone is an ordinary ultra. Two make each ×12. Hunt the second with Luck.'],
            ['🐙 Kraken', '+75% for every other player’s plot within about 200 m, up to ×20. Busy cities make the best Krakens.'],
            ['🏛️ Ancient', '+3% for every day you own it, up to ×6. Simply keep it.'],
            ['🪞 Mirror', 'Copies the rent of your best other plot. Pair it with your best ultra and it earns like one.'],
            ['🌈 Prismatic · 🌌 Genesis · 🕳️ Singularity', 'Raise everything you own: +5% each (up to +50%), +25%, and ×2. The more land you have, the more they’re worth.'],
          ]} dense />
          <Tip>Your ultras’ live multipliers and windows are on the Ultra tracker in the Play tab, and every ultra or Primordial with a power has its own page (tap the plot → its power).</Tip>
        </>
      ),
    },
    {
      id: 'new', emoji: '🌋', title: 'The land-changing ultras',
      summary: 'Nine ultras whose value is what they do to the land around them. Their marks show on your map only.',
      keys: 'volcano world tree phantom wanderer lodestone leyline glacier mycelium hive obsidian roots trail mushrooms beam honey',
      body: () => (
        <>
          <CardGrid items={NEW_ULTRAS.map((id) => {
            const r = rarityInfo(id);
            return { key: id, art: <BasePlotArt rarity={id as RarityId} size={46} />, c: r.color, title: <span style={{ color: readable(r.color) }}>{r.emoji} {r.name}</span>, sub: oddsText((r.ppm ?? 0) / 1e6), body: DEEDS[id] ?? r.ability };
          })} />
          <Combo title="Tier-higher spots">Volcano obsidian, Wanderer trails, Mycelium mushrooms and Leyline beams all roll a tier higher for you. Arm Luck when you claim them and you’re stacking upgrades on upgrades.</Combo>
        </>
      ),
    },
    {
      id: 'fusion', emoji: '🧬', title: 'The Fusion Lab',
      summary: 'Two of your ultras fuse into one stronger plot by recipe. Primordials can’t be fused.',
      keys: 'fusion lab fuse ultras recipe eclipse eternal flame constellation krakatoa elder tree shooting star compass rose triple fusion three ultras primordial refund',
      body: (c) => (
        <>
          <Steps items={[
            'Open the Fusion Lab and pick two of your ultras that make a recipe. The first one you pick becomes the fusion and keeps its drawing, name and level.',
            'The other plot is released back to the world.',
          ]} />
          <Recipe a="☀️ Solar" b="🌙 Lunar" to="🌗 Eclipse" note="×4.5 rent, day and night." />
          <Recipe a="🔥 Phoenix" b="🏛️ Ancient" to="🕯️ Eternal Flame" note="A streak multiplier that never drops below ×3, plus Ancient’s growth." />
          <Recipe a="♊ Gemini" b="♊ Gemini" to="✨ Constellation" note="×26, forever." />
          <Recipe a="🌋 Volcano" b="🐙 Kraken" to="🏝️ Krakatoa" note="Kraken’s neighbour bonus, and it erupts twice a day, twice as wide." />
          <Recipe a="🌳 World Tree" b="🏛️ Ancient" to="🌲 Elder Tree" note="Ancient’s growth, and 12 roots within 4 km." />
          <Recipe a="🦄 Wanderer" b="☄️ Comet" to="💫 Shooting Star" note="×2.3, and it gallops ten times as far with a trail twice as long." />
          <Recipe a="🧲 Lodestone" b="⚡ Leyline" to="🧭 Compass Rose" note="×2.2, beams to up to 8 of your plots, with Lodestone’s powers." />
          <Note title="Two secret recipes">The recipe book keeps two fusions hidden until you’ve made them. Finding them is up to you.</Note>
          <Facts items={[
            { k: 'Fusions a day', v: fmtN(Number(c.v('rarity_powers.fuse_per_day', 10))) },
            { k: 'A fusion earns', v: 'about both parents', hint: 'plus a little, in one plot' },
            { k: 'Can’t be fused', v: 'Crowns, fusions, Primordials', hint: 'and starter, merged, folded or locked plots' },
          ]} />
          <Note title="No more three-into-one">Three ultras used to fuse into a random Primordial; now Primordials are only ever rolled. Anyone who still held a fused Primordial got back the very three ultras they fused: the plot turned back into the first, and the other two came back onto their own spots (or, if those were taken, onto their next claim). One alert lists all three.</Note>
          <Warn>Fusing releases plots for good. Check the recipe card before you confirm.</Warn>
          <GoRow links={[['/fusion', 'The Fusion Lab']]} />
        </>
      ),
    },
    {
      id: 'primordials', emoji: '🌌', title: 'The Primordials',
      summary: 'Rarer than any ultra, about 1 in 3 million each, with no limit on copies. Each one changes the game around it.',
      keys: 'primordial primordials heart of the world throne of ink serpent egg world eye void gate first light fallen star genesis well chrysalis hourglass sunspot eleven loom upside down midas chain reaction transmuter doubling cube rift',
      body: (c) => {
        const prim = PRIMORDIALS.map((id) => rarityInfo(id));
        const ppb = prim[0]?.ppb ?? 330;
        return (
          <>
            <Facts items={[
              { k: 'Each one', v: oddsText(ppb / 1e9) },
              { k: 'Any Primordial', v: oddsText((ppb * prim.length) / 1e9), hint: 'per claim' },
              { k: 'Rent', v: `${usd((prim[0]?.usd_per_second ?? 1e-7) * 86400 * 30)} a month`, hint: `×${fmtN(Number(prim[0]?.ink_reward_multiplier ?? 6))} Ink, plus its power` },
            ]} />
            <P>Primordials are <B>only ever rolled</B> (the Fusion Lab can’t make them). When anyone rolls or hatches one, a shockwave crosses every open map in the world and it goes on the feed. Primordials show on everyone’s map as living emblems (beacons when zoomed out). Most powers reach <B>5 km</B> around the plot.</P>
            <CardGrid items={prim.map((r) => ({ key: r.id, art: <BasePlotArt rarity={r.id} size={46} />, c: r.color, title: <span style={{ color: readable(r.color) }}>{r.emoji} {r.name}</span>, body: POWERS[r.id] ?? r.ability }))} />
            <Combo>Some Primordials help everyone nearby (Heart of the World, Void Gate, Fallen Star, Genesis Well, Throne of Ink). Owning land near one is worth a trip.</Combo>
            <GoRow links={[['/primordials', 'Every Primordial in the world']]} />
            {!c.live && <Note>Odds are shown from the game’s defaults until the live numbers load.</Note>}
          </>
        );
      },
    },
  ],
};
