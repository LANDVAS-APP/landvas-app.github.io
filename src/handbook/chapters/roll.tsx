import { BasePlotArt } from '../../plot/BasePlotArt';
import { CROWNS, isFusion, isPrimordial, type RarityId } from '../../shared/rarity';
import type { Chapter } from '../types';
import { fmtN, oddsText, perSec, usd, type Ctx } from '../live';
import { B, Bullets, CardGrid, Facts, Figure, GoRow, Note, P, Pro, Steps, Table, Tip } from '../ui';
import { Bars, CrownShare, RollStrip } from '../visuals';
import { Sigil } from '../../enchant/Sigil';

/** a day of rent on average with the free boost used every day */
export const boostAvg = (c: Ctx) => {
  const hours = Math.min(24, (c.n('rent.boost.free_per_day', 6) * c.n('rent.boost.minutes_per_boost', 30)) / 60);
  const mult = c.n('rent.boost.multiplier', 20);
  return { hours, mult, avg: (hours * mult + (24 - hours)) / 24 };
};
/** the ultras with their own roll (not Crowns, fusions or Primordials) */
export const ultrasOf = (c: Ctx) => c.all.filter((r) => (r.ppm ?? 0) > 0 && !CROWNS.includes(r.id) && !isFusion(r.id) && !isPrimordial(r.id) && r.id !== 'enchanted');

export const roll: Chapter = {
  id: 'roll',
  emoji: '🎲',
  title: 'The roll & every rarity',
  blurb: 'How a roll works, the real odds, Shiny plots, every ultra, the Crowns, Enchanted rolls and clips.',
  color: '#FF9F1C',
  topics: [
    {
      id: 'roll', emoji: '🎲', title: 'How a roll works',
      summary: 'Ink drops on a card, a drum of rarities spins, the minigame lands, and the plot rises out of the ink.',
      keys: 'roll reveal drum animation spin how roll works tap hurry',
      body: () => (
        <>
          <Figure caption="Every claim plays this roll. A single roll takes about 4–6 seconds; tap to hurry it along (it still lands on the same result).">
            <RollStrip />
          </Figure>
          <Steps items={[
            <><B>The drop.</B> A drop of ink falls onto a blank card and splashes.</>,
            <><B>The drum.</B> A drum of rarity names spins and the ink takes the colour of each name as it passes. Common to Rare overshoot by a row and click back; Legendary and up crawl straight in, and Epic and up make the card tremble.</>,
            <><B>The tag.</B> The plot’s minigame drops onto the foot of the card (“🎨 COLORBURST”, “💡 LIGHTLINES”…).</>,
            <><B>The reveal.</B> The ink floods the card, the rarity’s own celebration plays, and your plot rises out of the ink. Shiny pulls get foil and a SHINY stamp; ultras and Enchanted rolls get their own banners.</>,
          ]} />
          <Note>The result is decided by the server the moment you claim. The animation only shows it to you, so tapping through it, or closing the app mid-roll, never changes what you got.</Note>
        </>
      ),
    },
    {
      id: 'rarities', emoji: '💎', title: 'The everyday rarities',
      summary: 'Six rarities make up almost every roll. Rarer ones earn more rent and pay more Ink from their minigame.',
      keys: 'rarity rarities odds chance common uncommon rare epic legendary mythic rent per second ink multiplier table',
      body: (c) => {
        const b = boostAvg(c);
        const rows = c.everyday;
        return (
          <>
            <Figure caption="How often each everyday rarity comes up on a normal claim (live odds).">
              <Bars rows={rows.map((r) => ({ label: <span className="flex items-center gap-2"><BasePlotArt rarity={r.id as RarityId} size={22} /><span style={{ color: r.color }}>{r.name}</span></span>, v: r.chance, c: r.color }))} unit={(v) => oddsText(v)} />
            </Figure>
            <Table head={['Rarity', 'Chance', 'Rent a day*', 'Ink bonus']} rows={rows.map((r) => [
              <b key="n" style={{ color: r.color }}>{r.name}</b>, oddsText(r.chance),
              <span key="r">{usd(r.usd * 86400 * b.avg)}<span className="block text-[10.5px] text-faint">{perSec(r.usd)}/s</span></span>, `×${r.ink.toFixed(2)}`,
            ])} note={`* using the free daily boost every day (×${fmtN(b.mult)} for ${fmtN(b.hours, 1)} h). The Ink bonus multiplies every minigame win on that plot.`} />
            <Bullets items={[
              <>A rarity <B>never changes</B> once rolled (unless you reforge it in the Crucible, or a Primordial power changes it).</>,
              <>Ultras roll <i>before</i> this table on their own tiny roll, so a little of every claim’s chance goes to them.</>,
            ]} />
            <Tip>A Mythic plot pays <B>×{(rows.find((r) => r.id === 'mythic')?.ink ?? 2.25).toFixed(2)}</B> on every minigame win. Your rarest plots are your best Ink farms, so play their games first.</Tip>
            <GoRow links={[['/legend', 'Every rarity'], ['/rankings/rarities', 'Who owns the most']]} />
          </>
        );
      },
    },
    {
      id: 'shiny', emoji: '✨', title: 'Shiny plots',
      summary: `Any claim can come out Shiny: rare foil and ×5 rent on top of its rarity.`,
      keys: 'shiny foil sparkle 1 in 1000 rent multiplier',
      body: (c) => (
        <>
          <Facts items={[
            { k: 'Chance on any claim', v: `1 in ${fmtN(c.n('shiny.one_in', 1000))}`, c: '#FFE14D' },
            { k: 'Shiny rent', v: `×${fmtN(c.n('shiny.rent_mult', 5))}`, hint: 'its rarity’s rent, multiplied', c: '#3DDC97' },
            { k: 'In the Hot Zone', v: `×${fmtN(c.n('hot_zones.shiny_mult', 2))} as likely`, c: '#FF4D6D' },
          ]} />
          <P>Shiny is separate from rarity: a Shiny Common, a Shiny Mythic, even a Shiny ultra can happen. A shiny plot shimmers on the map and the roll stamps it SHINY.</P>
        </>
      ),
    },
    {
      id: 'ultras', emoji: '🌌', title: 'Ultra rarities',
      summary: 'Rolled before anything else on every claim. Each one earns its own way: by sun and moon, streaks, pairs, neighbours…',
      keys: 'ultra ultras solar lunar comet ancient prismatic genesis chaos phoenix kraken gemini mirror singularity volcano world tree phantom wanderer lodestone leyline glacier mycelium hive abilities',
      body: (c) => {
        const list = ultrasOf(c).sort((a, b) => (b.ppm ?? 0) - (a.ppm ?? 0));
        const total = list.reduce((s, r) => s + (r.ppm ?? 0), 0) / 1e6;
        return (
          <>
            <P>Every claim first rolls for an <B>ultra</B>, each on its own odds in parts per million. Only if none hits does the everyday table roll. All the ultras together come up about <B>{oddsText(total)}</B> claims. Each one has an ability that changes how it earns, and a big Ink bonus on its minigame.</P>
            <CardGrid items={list.map((r) => ({
              key: r.id, art: <BasePlotArt rarity={r.id} size={46} />, c: r.color,
              title: <span style={{ color: r.color }}>{r.emoji} {r.name}</span>,
              sub: `${oddsText((r.ppm ?? 0) / 1e6)} · ×${Number(r.ink_reward_multiplier).toFixed(1)} Ink · ${perSec(r.usd_per_second)}/s`,
              body: r.ability,
            }))} />
            <Note>The newest nine (Volcano, World Tree, Phantom, Wanderer, Lodestone, Leyline, Glacier, Mycelium, Hive) earn ordinary ultra rent. What they’re worth is what they <i>do</i> to the land around them, which is explained in the Ultras chapter.</Note>
            <Tip>Ultras get much likelier with armed Luck (up to ×11), in the Hot Zone (×{fmtN(c.n('hot_zones.ultra_mult', 5))}) and with some Primordials. See the Luck chapter.</Tip>
          </>
        );
      },
    },
    {
      id: 'crowns', emoji: '👑', title: 'Crowns',
      summary: 'One per city, one per state, one per country. Its holder takes a 1% share of the kingdom: its Ink or its rent.',
      keys: 'crown crowns city state country royalty king queen kingdom share ink share rent share pick switch lock month',
      body: (c) => {
        const ab = (k: string, f: string, d: number) => c.n(`rarity_abilities.${k}.${f}`, d);
        const inkPct = c.n('crowns.ink_pct', 1), rentPct = c.n('crowns.rent_pct', 1), lock = c.n('crowns.lock_days', 30), tick = c.n('crowns.tick_minutes', 10);
        const rows: [string, number, string][] = [
          ['🏙️ City Crown', ab('crown', 'ppm', 1000), 'the city'],
          ['🗺️ State Crown', ab('crown_state', 'ppm', 50), 'every city in the state or province'],
          ['🌍 Country Crown', ab('crown_country', 'ppm', 5), 'the whole country'],
        ];
        return (
          <>
            <P>Every city, every state or province and every country has exactly <B>one Crown</B>. A Crown can only roll on a claim in a place whose Crown nobody holds yet, so the first lucky claimer takes it.</P>
            <Table head={['Crown', 'Chance per claim', 'Its kingdom']} rows={rows.map(([n, ppm, k]) => [<b key="n">{n}</b>, oddsText(ppm / 1e6), k])} />
            <Figure caption="Every other player with land in your kingdom feeds your share. You pick which kind.">
              <CrownShare inkPct={inkPct} rentPct={rentPct} lockDays={lock} tick={tick} />
            </Figure>
            <Bullets items={[
              <><B>💧 Ink share:</B> {fmtN(inkPct)}% of all the Ink every other player with land in the kingdom earns by playing, paid to you every {fmtN(tick)} minutes.</>,
              <><B>💵 Rent share:</B> {fmtN(rentPct)}% of the base rent of everyone else’s land in the kingdom, added to your rent.</>,
              <>The share is <B>minted for you</B>: nobody in the kingdom earns any less.</>,
              <>Until you pick, a Crown pays the Rent share. Your <B>first pick is free</B>; after that it’s locked for {fmtN(lock)} days, then you can switch (and it locks again).</>,
              'What doesn’t count: your own Ink, invites, conversions, refunds and other Crowns’ shares. A new holder picks afresh.',
              'The Crown plot also earns its own rent, like any rarity.',
            ]} />
            <Pro title="Ink or rent?">Pick <B>Ink</B> where lots of players are active every day (they play, you earn). Pick <B>rent</B> where lots of land is owned but few people play. The Royalty page shows both shares’ value right now for each of your Crowns, so you can compare before you lock in.</Pro>
            <Tip title="Where to hunt Crowns">Claim in places nobody has crowned yet: small towns, quiet states, countries few players live in. Flying lets you claim anywhere (see Travel), and every claim there has a shot. A quiet kingdom pays little at first, but it grows as players move in.</Tip>
            <GoRow links={[['/royalty', 'Royalty: your Crowns, your pick, and every Crown’s holder']]} />
          </>
        );
      },
    },
    {
      id: 'enchanted', emoji: '🔮', title: 'Enchanted rolls',
      summary: 'Sometimes the drum breaks off mid-spin and becomes a summoning circle: an enchantment moves in.',
      keys: 'enchanted roll summoning 2% enchantment chance',
      body: () => (
        <>
          <div className="flex justify-center gap-3 py-1" aria-hidden><Sigil kind="genie" seed={77} size={58} still /><Sigil kind="goose" seed={21} size={58} still /><Sigil kind="wormhole" seed={5} size={58} still /></div>
          <P>About <B>1 in 50</B> plot rolls (claims, starter plots and quick buys) comes out <B>Enchanted</B> instead of getting a rarity. The room turns violet, a rune circle draws itself, and a creature with its own sigil, serial number and birthplace moves onto your plot.</P>
          <Bullets items={[
            'An Enchanted plot earns Common rent and has a ×1.2 Ink bonus. Its value is the enchantment itself, which earns Ink its own way.',
            'Enchanted Luck, bought at the Altar of Luck, makes your next roll likelier to be Enchanted.',
            'Never on event rolls or Crowns.',
          ]} />
          <GoRow links={[['/grimoire', 'Open the Grimoire']]} />
          <Note>Everything about enchantments is in its own chapter.</Note>
        </>
      ),
    },
    {
      id: 'beyond', emoji: '🧬', title: 'Fusions and Primordials',
      summary: 'Fuse two ultras into one stronger plot. Rarer than every ultra are the Primordials, about 1 in 3 million each, and only ever rolled.',
      keys: 'fusion primordial primordials fuse ultras',
      body: (c) => {
        const prim = c.all.filter((r) => isPrimordial(r.id));
        const ppb = prim[0]?.ppb ?? 330;
        return (
          <>
            <Facts items={[
              { k: 'Fusions', v: String(c.all.filter((r) => isFusion(r.id)).length || 9), hint: 'made in the Fusion Lab, never rolled' },
              { k: 'Primordials', v: String(prim.length || 19), hint: `each about ${oddsText(ppb / 1e9)}` },
              { k: 'Any Primordial', v: oddsText((ppb * (prim.length || 19)) / 1e9), hint: 'per claim' },
            ]} />
            <div className="flex flex-wrap justify-center gap-2 py-1" aria-hidden>{(['eclipse', 'constellation', 'heart_world', 'sunspot', 'loom'] as const).map((r) => <BasePlotArt key={r} rarity={r} size={48} />)}</div>
            <P>Primordials can’t be fused: they’re only ever rolled. When anyone rolls one, a shockwave crosses every open map in the world. Both are covered in full in the Ultras chapter.</P>
            <GoRow links={[['/fusion', 'The Fusion Lab'], ['/primordials', 'The Primordials']]} />
          </>
        );
      },
    },
    {
      id: 'clips', emoji: '🎬', title: 'Clips: share your best rolls',
      summary: 'Epic-or-better, Shiny and Enchanted reveals can be clipped as a vertical video of the roll exactly as it went.',
      keys: 'clip video share record snip screenshot clips page',
      body: () => (
        <>
          <Bullets items={[
            <><B>Clip it</B> appears on Epic+, Shiny and Enchanted reveals. It replays your real roll as a 720×1280 video with your @username, the LANDVAS mark, and your Luck rolls.</>,
            <><B>Snip</B>: pause or scrub to any frame and save a sharp picture.</>,
            <>Big moments can be clipped too: a new hybrid, a Forbidden Wish, Hope rising from Pandora’s Box, an evolved Parasite, a dug-up treasure, a Platinum egg, a new Star…</>,
            <>The <B>Clips</B> page keeps your last 30 rolls and 30 moments on your phone, and can re-create the roll of any plot you own.</>,
          ]} />
          <GoRow links={[['/clips', 'My clips']]} />
        </>
      ),
    },
  ],
};
