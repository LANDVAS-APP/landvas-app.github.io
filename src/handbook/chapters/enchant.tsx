import { LeviathanArt } from '../../leviathan/LeviathanArt';
import { Sigil } from '../../enchant/Sigil';
import { EVILS, EVIL_ORDER, HATCHABLE, HYBRID_COUNT, HYBRIDS, KINDS, KIND_ORDER, PERFECT_COUNT, SPLICE_MODES, TRAITS } from '../../enchant/kinds';
import type { Chapter } from '../types';
import { fmtN, resetTime } from '../live';
import { B, Bullets, CardGrid, Chips, Combo, Facts, Figure, GoRow, H, Note, P, Pro, Steps, Table, Tip, Warn } from '../ui';
import { Recipe, StarLadder } from '../visuals';

/** each kind's five Star powers (as the server grants them: private.ench_star_powers) and its move against the Leviathan */
const STARS: Record<string, string[]> = {
  goose: ['Gilded Nest: Platinum eggs come twice as often (6%)', 'Fox Hunter: Chasing off a fox pays 15 Ink and 3 Luck', 'Gosling: Every 5th egg hatches a gosling: a Rare-or-better roll ticket', 'Watch Goose: Half the foxes that slip past you, the goose scares off itself', 'Golden Age: Eggs grow 50% bigger, and every Platinum egg brings an Enchanted Luck'],
  genie: ['Fourth Wish: Holds 4 wishes', 'Gift of Wishes: Once a day, spend a wish on a friend: they get 30 Ink and you get 10', 'Master’s Boon: Once a week, a free Epic-or-better roll ticket', 'Fifth Wish: Holds 5 wishes, and they come back in 6 hours, not 8', 'Djinn Unbound: The Forbidden Wish can’t twist: a twist is granted instead'],
  map: ['Long Arm: Pick up pieces from 400 m away and dig from 250 m', 'Quick Ink: A new map is ready in 5 hours, not 10', 'Mother Lode: Every chest holds an Epic+ ticket, and Legendary odds triple', 'Hoard: Chests pay double Ink and always hold a glyph page', 'El Dorado: Every 5th chest is El Dorado: a Mythic ticket, and the next map is ready at once'],
  parasite: ['Quick Jaws: Feeds in 14 hours, not 20', 'Fast Evolver: Evolves after 2 and 6 meals, not 3 and 10', 'Queen: Every meal is 50% bigger', 'Leech Lord: Feeds in 10 hours, and never rests between meals', 'Apex: Meals pay double again — and a Symbiote’s host gets twice its share'],
  pandora: ['Lighter Lid: Hope comes after 6 evils, not 7', 'Gilded Gifts: Ink gifts from the box are doubled', 'Greater Hope: Hope pays double and brings a Mythic ticket', 'Hope Springs: Hope comes after 5 evils', 'Blessings: A third of the evils that escape turn into their blessings: no curse, and 15 Luck'],
  clockwork: ['Mainspring: 20 turns a day, and it holds 6 hours of charge', 'Fine Gears: Fast-forward gives 1.5× the time, and freezing costs half', 'Toll of Hours: Once a day, ring it: every other enchantment you own jumps 30 minutes ahead', 'Deep Time: Rewind reaches 48 hours back at half the cost, 3 times a day', 'Paradox: A rewound roll keeps the better of the two timelines — and a roll can be rewound twice a week'],
  sizeray: ['Fourth Cell: Holds 4 shots', 'Long Burn: Sizes on your own plots last twice as long', 'Titan Beam: A PERFECT or GREAT grow on your plot makes it ×3', 'Megaray: A PERFECT grow on your own plot is a MEGA: 1,000× on the map, and ×4', 'Overcharge: Shots come back in 4 hours, and a PERFECT shot gives its charge back'],
  shard: ['Long Gaze: Reflections last 36 hours, not 24', 'Quicksilver: Gaze again after 12 hours, not 20', 'Perfect Mirror: Its reflections shine with ★1 of the kind they show', 'Hall of Mirrors: Five reflections to choose from, and they carry ★2', 'Looking-Glass Soul: Reflections carry ★3 and last 48 hours'],
  wormhole: ['Quick Spiral: Opens again after 16 hours, not 24', 'Steady Throat: Every wormhole stays open 6 hours longer', 'Third Mouth: Three-mouthed wormholes at any level, and chests come out double', 'Gravity Well: What comes through lingers 10 minutes, not 5, and stars bring 15 Luck', 'Singularity: Every wormhole is perfectly stable and stays open 48 hours'],
  oracle: ['Longer Sight: One more card in every prophecy', 'Fate-Bender: One more rewrite per prophecy', 'Third Eye: Holds one more gaze', 'Clear Sight: Gazes come back in 16 hours, and a burned roll draws twice and keeps the better', 'Weaver of Fates: Once a week, weave a roll card into an Enchanted roll'],
  splice: ['Spare Coil: Holds one more charge', 'Long Graft: Every splice lasts 50% longer', 'Quaternion: Splice four at once: a Quad (3 charges)', 'Quick Coil: Charges come back twice as fast', 'Eternal Bond: Splices never wear off — until you make the next one'],
  sun: ['Corona: Its zone is 50% wider', 'Long Day: A sun burns 12 hours, not 6', 'Binary Star: Two suns at once — and two a day', 'Solar Wind: White-hot never burns fuel faster, and your party claims at your full boost', 'Supernova: A sun that burns out white-hot goes supernova: 15 minutes at ×6 over twice the ground'],
  rod: ['Supple Fork: Full depth comes 15% sooner', 'Deep Well: Retuning keeps half of how deep it was', 'Divining Walk: Once a day it walks the map near you and twitches over a spot that would read as its target', 'Forked Rod: Two targets at once', 'Lodestar: Tuning stops making rolls harder, depth grows twice as fast, and it can seek any Primordial'],
  stormcoil: ['Twin Storms: One more storm a day', 'Ball Lightning: Every bolt you catch pays double', 'Eye of the Storm: Missed bolts never scorch, and Aberrations strike twice as often', 'Superstorm: Storms bring 30 bolts and last 4 minutes', 'Thunder God: Every bolt you catch over your own plot charges it ×1.25 for an hour'],
  spyglass: ['Wide Lens: Holds 4 looks, and they come back faster', 'Long Glass: Looks reach 3 km instead of 1 km', 'Second Sight: Once a day, take a second reading of a sighted plot and keep the better one', 'Panorama: A look reads the plot and every free plot around it', 'Eagle Eye: Looks reach 10 km, and Second Sight works twice a day'],
  origami: ['Deep Pocket: Holds 3 folded plots', 'Paper Crane: Unfold up to 50 km from your explorer', 'Living Fold: Fold an enchanted plot, creature and all', 'Thousand Cranes: Unfold anywhere on Earth, and folds come back twice as fast', 'Grand Fold: Unfolding pays triple, and a carried plot’s powers reach twice as far'],
  crucible: ['Great Bellows: +25% Heat from every melt', 'Master Smith: A free rune on every strike', 'Masterwork: Once a week, a forged plot jumps two tiers', 'Tempered: A failed strike keeps all its Heat (a Fury strike keeps half)', 'Starforge: The first strike each day can’t fail'],
  puppeteer: ['Second String: Strings come back twice as fast (2 an hour)', 'Long Strings: Pull strings on plots anywhere on Earth', 'Grand Show: Once a day, a puppet run pays ×3', 'Troupe: Two more strings, and two puppets perform at once', 'Opening Night: The Grand Show pays ×5, and puppet wins pay in full'],
  deck: ['Fourth Card: A fourth face-down card to choose from', 'Hold: Keep a turned card in your hand and play it later', 'Fate’s Favourite: Once a day, turn a reversed card upright', 'Lucky Draw: Foils come three times as often, and cards come up reversed half as often', 'Major Arcana: One more card a day, and a spread’s chain climbs to ×2'],
  glyph: ['Deeper Well: +2 mana', 'Chain Cast: Cast two glyphs at once, 50% stronger', 'Archmage: Once a day, a glyph casts at full strength however you draw it', 'Steady Hand: No more fizzles, and mana comes back in 2 hours, not 3', 'Triple Cast: Cast three glyphs at once, at double strength'],
};
const MOVE: Record<string, string> = {
  goose: 'Egg Bomb', genie: 'Wish of Ruin', map: 'Buried Cannon', parasite: 'Leech', pandora: 'Unleash an Evil', splice: 'Chimera Strike', clockwork: 'Freeze Time',
  sizeray: 'Shrink Ray', shard: 'Reflect the Roar', wormhole: 'Pull Through', oracle: 'Foretell the Weak Spot',
  stormcoil: 'Lightning Strike', spyglass: 'Weak Spot', origami: 'Paper Shield', crucible: 'Molten Pour', puppeteer: 'Tangle', deck: 'The Tower', glyph: 'Thunder Glyph',
  sun: 'Sunburst', rod: 'Divine',
};

const seedOf = (k: string) => [...k].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, 7);
const perfect = Object.values(HYBRIDS).filter(([, p]) => p).map(([n]) => n);

export const enchant: Chapter = {
  id: 'enchant',
  emoji: '🔮',
  title: 'Enchantments',
  blurb: `Living creatures that move onto your land and change the rules: the ${KIND_ORDER.length} kinds, the Grimoire, Stars, Splice, Traits, badges and the Leviathan.`,
  color: '#B26BFF',
  topics: [
    {
      id: 'what', emoji: '🔮', title: 'What an enchantment is',
      summary: 'Instead of a rarity, about 1 in 50 rolls gets an enchantment: a living creature with its own powers, serial number and story.',
      keys: 'enchantment enchanted what is how to get one chance 2%',
      body: () => (
        <>
          <div className="flex flex-wrap justify-center gap-3 py-1" aria-hidden>{(['goose', 'genie', 'pandora', 'clockwork', 'spyglass', 'glyph'] as const).map((k) => <Sigil key={k} kind={k} seed={seedOf(k)} size={52} still />)}</div>
          <Bullets items={[
            <><B>About 2% of rolls</B> (claims, starter plots and quick buys) come out Enchanted. Enchanted Luck from the Altar raises that for your next roll.</>,
            'The plot earns Common rent with a ×1.2 Ink bonus. The enchantment pays its own Ink on top, its own way.',
            <>Every enchantment is <B>one of a kind</B>: a serial number for its kind (#1, #2…), a procedural sigil, its birthplace, its first owner, and live counts of how many of its kind are alive.</>,
            <>Levels <B>1–10</B>, each +6% Ink, plus titles it earns (Fox-Bane, Wishmaster, Symbiote, Prankster…). Give it a nickname; its chronicle records everything it does.</>,
            <><B>It belongs to the land.</B> If its plot is released it falls asleep there and wakes for the next owner. If the plot’s rarity is changed, the enchantment ends for good.</>,
          ]} />
        </>
      ),
    },
    {
      id: 'grimoire', emoji: '📖', title: 'The Grimoire',
      summary: 'Your spellbook: every enchantment you own, what’s ready now, the creatures on your land, the Bestiary and the Codex.',
      keys: 'grimoire spellbook enchantment page ready now bestiary codex badges enchantment badges',
      body: () => (
        <>
          <P>Tap <B>📖 Grimoire</B> on the map (or on the Simple-mode home). Its badge tells you when something needs you.</P>
          <Bullets items={[
            <><B>Enchantments:</B> a “Ready now” rail at the top, then your enchantments grouped by kind (copies together, ×N), with filters for All / Ready / Spliced. Buried chests waiting to be dug sit above the tabs.</>,
            <><B>On my land:</B> other players’ Parasites feeding on your plots. Peel them off, or welcome them.</>,
            <><B>Bestiary</B> and <B>Codex</B>: every kind and every hybrid you’ve discovered.</>,
            <><B>Badges:</B> more than 130 enchantment badges (kinds owned, levels, Stars, the Codex, what each kind does…), each paying Luck or Enchanted Luck when you earn it.</>,
            <>Each enchantment has its own page: a status strip (what’s ready, what’s next and when), a jump bar (<B>Play · Traits · Stars · Story · How</B>), its interactive scene, and its chronicle.</>,
          ]} />
          <Tip>Anything an enchantment asks you to pick a plot for (a Wormhole’s far end, a Size Ray target, a fold, a strike…) can be picked right on the map: the plots you can use wear crosshairs.</Tip>
          <GoRow links={[['/grimoire', 'Open the Grimoire']]} />
        </>
      ),
    },
    {
      id: 'kinds', emoji: '📚', title: `The ${KIND_ORDER.length} kinds`,
      summary: 'Every kind, what it does, and the Trait it lends when spliced.',
      keys: 'golden goose genie treasure map parasite symbiote pandora box splice clockwork size ray mirror shard wormhole oracle eye storm coil spyglass origami pocket crucible puppeteer fated deck glyphcaster pocket sun dowsing rod kinds list ouroboros homunculus',
      body: () => (
        <>
          <div className="grid gap-3">
            {KIND_ORDER.map((k) => {
              const ki = KINDS[k];
              return (
                <div key={k} className="hb-card" style={{ ['--c' as string]: ki.a }}>
                  <div className="art"><Sigil kind={k} seed={seedOf(k)} size={56} still /></div>
                  <div className="min-w-0">
                    <div className="t" style={{ color: ki.a }}>{ki.emoji} {ki.name}</div>
                    <div className="b !text-[13px] !text-fg">{ki.tagline}</div>
                    <ul className="hb-list mt-1.5">{ki.how.map((h, i) => <li key={i} className="!text-[13px]">{h}</li>)}</ul>
                    {ki.geneName && <div className="mt-1.5 text-[12px] font-bold text-muted">🧬 Splice Trait: <span style={{ color: ki.a }}>{ki.geneName}</span>: {ki.gene && TRAITS[ki.gene] ? TRAITS[ki.gene].text(1) : ki.geneText}</div>}
                    <div className="mt-1.5 grid gap-0.5 text-[11.5px] leading-snug text-muted">
                      {(STARS[k] ?? []).map((x, i) => <span key={i}><b className="text-[#FFC93D]">{'★'.repeat(i + 1)}</b> {x}</span>)}
                      <span>🐉 Leviathan move: <b className="text-fg">{MOVE[k]}</b></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Note title="⏪ The Clockwork’s Rewind">Every Clockwork keeps a tape of what went wrong in the last 12 hours: a fox bite, a curse, a failed strike, a reversed card, a fizzle, a backfire, a scorch, a trample. <B>Rewind one and it never happened</B> (Luck, Heat or mana it cost comes back). It costs stored time (30 minutes + 10 for every hour back), once a day (twice from level 5). Once a week it can also rewind a plot you claimed in the last 10 minutes: it rolls again and the new roll stands. ★4 Deep Time reaches 48 hours back at half the cost, 3 a day; ★5 Paradox keeps the better of the two rolls.</Note>
          <Note title="Retired kinds">The Cuckoo: any Cuckoo left became a <B>Cuckoo Egg</B>: pick one of the newest kinds ({HATCHABLE.map((k) => KINDS[k].name).join(', ')}) and hold to hatch it. The Ouroboros and the Homunculus: owned ones became a Dowsing Rod and a Pocket Sun. Each keeps its level, Stars, name and story.</Note>
        </>
      ),
    },
    {
      id: 'stars', emoji: '⭐', title: 'Stars',
      summary: 'Pour copies of a kind into it for up to five Stars. Each Star adds +10% Ink and unlocks a power.',
      keys: 'stars star pour copies essence merge duplicate upgrade five stars 4 star 5 star comet-crowned ascendant',
      body: () => (
        <>
          <Figure caption="Twelve copies in all take an enchantment from no stars to ★5. A starred copy brings what it held (★3 = 4, ★4 = 7, ★5 = 12).">
            <StarLadder steps={[{ stars: 1, copies: '1 copy', power: 'first power + 10% Ink' }, { stars: 2, copies: '1 more', power: 'second power + 20% Ink' }, { stars: 3, copies: '2 more', power: 'third power + 30% Ink' }, { stars: 4, copies: '3 more', power: 'fourth power + 40% Ink · Comet-Crowned' }, { stars: 5, copies: '5 more', power: 'fifth power + 50% Ink · Ascendant' }]} />
          </Figure>
          <Steps items={[
            'Open an enchantment’s page → Stars → ✨ Pour in a copy.',
            <>Pick a copy of the <B>same kind</B>: it pours into the sigil and its XP comes along. The copy is used up, but <B>its plot stays yours</B> with a fresh roll of its own.</>,
            <>Pour in <B>any other kind</B> and it becomes 1 <B>Essence</B>. 3 Essence pour in as one copy (or wait in the bank for later).</>,
          ]} />
          <Warn>Busy enchantments can’t be poured: anything spliced, a Splice with a splice running, or a Storm Coil mid-storm.</Warn>
          <Pro>A given kind turns up about once in 750 rolls, so copies are rare. Essence is the catch-up: duplicates of kinds you don’t use become Stars for the ones you do. Pick one or two favourites to take to ★5 rather than spreading copies thin.</Pro>
          <Note>Reaching ★4 brings a comet and ★5 a constellation: a halo on the sigil and on its creature on the map, and a moment on the feed.</Note>
        </>
      ),
    },
    {
      id: 'splice', emoji: '🧪', title: 'Splice: making hybrids',
      summary: 'The Splice enchantment fuses two (or more) enchantments so each wears the other’s Trait. 171 hybrids to discover.',
      keys: 'splice hybrid swap graft chimera trinity quad friend plot perfect match aberration codex charges',
      body: () => (
        <>
          <Figure tone="plain" caption="Two enchantments in, one hybrid out: each wears the other’s Trait while the splice lasts.">
            <div className="flex items-center justify-center gap-3 py-2">
              <Sigil kind="goose" seed={11} size={64} still /><span className="text-2xl font-black text-faint">+</span>
              <Sigil kind="sizeray" seed={23} size={64} still /><span className="text-2xl font-black text-faint">=</span>
              <div className="grid justify-items-center gap-1">
                <span className="relative block h-[64px] w-[72px]" aria-hidden>
                  <span className="absolute left-0 top-0 opacity-90"><Sigil kind="goose" seed={11} size={50} still glow={false} /></span>
                  <span className="absolute bottom-0 right-0 mix-blend-screen"><Sigil kind="sizeray" seed={23} size={44} still glow={false} /></span>
                </span>
                <b className="text-[13px]">Giant Goose ✦</b><span className="text-[11px] text-muted">a Perfect Match</span>
              </div>
            </div>
          </Figure>
          <CardGrid items={Object.entries(SPLICE_MODES).map(([k, m]) => ({ key: k, art: <span>{m.emoji}</span>, title: m.name, sub: `${m.hours} h · ${m.cost} charge${m.cost > 1 ? 's' : ''}`, c: '#B26BFF', body: m.text }))} />
          <Facts items={[
            { k: 'Hybrids', v: fmtN(HYBRID_COUNT), hint: 'each with a plain-English card' },
            { k: 'Perfect Matches ✦', v: fmtN(PERFECT_COUNT), hint: 'Traits at double strength' },
            { k: 'Aberrations', v: '6 secret ones', hint: '5% of splices, triple strength' },
          ]} />
          <Bullets items={[
            'A Perfect Match pairs two kinds that were made for each other: both Traits work at ×2 strength.',
            'An Aberration is a secret hybrid at ×3 strength. 5% of splices become one (15% with a Storm Coil in the splice).',
            'Every hybrid you make goes in the Splice’s Codex. Codex Complete needs all of them.',
            'Splice with a plot: the plot’s minigames wear the enchantment’s Trait, and the enchantment wears the plot’s.',
          ]} />
          <H>Some Perfect Matches</H>
          <Chips items={perfect.slice(0, 18).map((n) => `✦ ${n}`)} c="#B26BFF" />
        </>
      ),
    },
    {
      id: 'charges', emoji: '⚡', title: 'Splice charges',
      summary: 'Natural charges grow with how many plots you own. Spare charges can be bought, cracked from eggs, or found.',
      keys: 'splice charges recharge spare buy egg spark',
      body: () => (
        <>
          <Table head={['Plots you own', 'Charges held', 'One back every']} rows={[['0–24', '2', '36 h'], ['25+', '3', '32 h'], ['75+', '3', '28 h'], ['150+', '4', '24 h'], ['300+', '5', '20 h']]} />
          <Bullets items={[
            <><B>Buy</B> spare charges with Ink: 300, then 600, then 1,200 (3 a day).</>,
            <><B>Crack an Inkborn egg</B> (any unhatched egg; 2 a day).</>,
            <><B>A golden egg’s spark:</B> 20% of Golden Goose eggs (and every Platinum egg) carry a spare charge.</>,
            'Spare charges never expire (a Splice holds up to 6) and are spent after the natural ones.',
          ]} />
          <Combo>Owning more land makes your Splice faster: crossing 150 and 300 plots is worth planning for if you splice a lot.</Combo>
        </>
      ),
    },
    {
      id: 'traits', emoji: '🧬', title: 'Every Trait',
      summary: 'Every Trait does its own thing when it’s spliced onto a partner: here is each one at normal, Perfect Match and Aberration strength.',
      keys: 'traits genes golden eggs giant chaos boxes seeking spreading spores echo wishing tempered farsight folded strings fated inscribed tempo linked foresight charged radiant divining trait tools',
      body: () => {
        const genes = [...new Set(KIND_ORDER.map((k) => KINDS[k].gene).filter((g): g is string => !!g))];
        return (
          <>
            <P>Each Trait works its own way, and the hands-on ones have their own tool on the partner’s page (under <B>Traits</B>): crack a <B>Golden</B> egg, open a <B>Chaos</B> box, pick the second plot for <B>Linked</B>, choose what <B>Divining</B> aims at. The rest work by themselves, with a line saying what they’ve been doing.</P>
            <Table head={['Trait', 'Normal', 'Perfect Match', 'Aberration']} rows={genes.filter((g) => TRAITS[g]).map((g) => [`${TRAITS[g].emoji} ${TRAITS[g].name}`, TRAITS[g].text(1), TRAITS[g].text(2), TRAITS[g].text(3)])} dense />
            <Note>Spliced with a plot, an enchantment wears the plot’s Trait instead: Art plots make it Inspired (+20% Ink), Habitats Wild, Farms Fertile (+25%), Businesses Invested (+10 Ink a reward) and Arcades an Arcade Streak (1 in 5 rewards doubled).</Note>
          </>
        );
      },
    },
    {
      id: 'pandora', emoji: '🏺', title: 'Pandora’s seven evils',
      summary: 'Lift the lid for gifts, but each of the seven evils escapes once as a timed curse. When all seven are out, Hope rises.',
      keys: 'pandora evils curses hope plague greed strife envy despair toil sorrow',
      body: () => (
        <>
          <Table head={['Evil', 'Curse']} rows={EVIL_ORDER.map((e) => [`${EVILS[e].emoji} ${EVILS[e].name}`, EVILS[e].curse])} />
          <Pro>Each evil escapes only once. The more evils already out, the safer the box gets, and Hope (a Legendary+ ticket and a fortune) is waiting at the bottom. Lift wide when only one or two evils are left.</Pro>
        </>
      ),
    },
    {
      id: 'leviathan', emoji: '🐉', title: 'The Leviathan (world boss)',
      summary: 'Every Saturday a sea monster rises and walks inland for two days. Everyone fights it together for Ink, Enchanted Luck and tickets.',
      keys: 'leviathan world boss saturday sea monster fight ink bombs trample loot',
      body: () => (
        <>
          <Figure caption={`It rises every Saturday at ${resetTime(17, 'UTC')} your time (17:00 UTC), after a one-hour warning.`}>
            <div className="mx-auto max-w-[320px]"><LeviathanArt status="warning" /></div>
          </Figure>
          <Steps items={[
            'A warning goes out an hour before it rises. Then it walks inland from the sea for about 48 hours, on a route the whole world shares.',
            <><B>Tap to throw ink bombs</B> (60 banked, one back every minute), and use each enchantment’s own move (every 3 hours).</>,
            'At half health it enrages and heads for the nearest giant plot or the rarest land. At 10% it flees for the sea.',
            'Sometimes it shrinks (bombs miss more) or hides: search the map, “cold… warm… HOT!”. Finding it pays Ink and lets you hit it.',
            'It’s built to last a long fight: its health grows with the enchantments out and the players about.',
            'Sometimes it dives back into the sea. It comes back later as the same Leviathan, only stronger, and the damage you already did still counts.',
            'When it falls, everyone who fought is paid.',
          ]} />
          <Table head={['When it falls', 'You get']} rows={[
            ['Everyone', 'Ink by your share of the damage (up to 1,500)'],
            ['1%+ of the damage', 'Enchanted Luck, and a 35% chance of a glyph page'],
            ['Top 10% of fighters', 'an Epic+ roll ticket'],
            ['The top fighter', 'a Legendary+ roll ticket'],
            ['If it escapes', '10 Ink each, and the next one comes back stronger'],
          ]} />
          <Warn title="Trampling">Plots in its path are trampled: their minigames pay −40% until you scrub them. Folded plots, Tempered plots, anchored plots (an Anchor, a Ward, a Glacier nearby) and plots of a player under a Paper Shield are safe.</Warn>
          <Combo>Moves that make everyone hit harder: the Spyglass’s Weak Spot (×2 for 10 seconds), the Pocket Sun’s Sunburst (×1.5 for 30 seconds), the Dowsing Rod’s Divine (+20% for 20 seconds), the Oracle’s foretelling, the Fated Deck’s Tower and the Glyphcaster’s Thunder Glyph. A real giant plot (Size Ray) in its path stops it for 20 minutes.</Combo>
        </>
      ),
    },
    {
      id: 'tips', emoji: '🧠', title: 'Enchantment strategy',
      summary: 'Which ones to splice, when to star, and how to keep them all working.',
      keys: 'enchantment strategy best splice combos tips',
      body: () => (
        <>
          <Bullets items={[
            <><B>Check the “Ready now” rail every session.</B> Most enchantments run on timers (eggs, wishes, recharges, feeds). Idle ones earn nothing.</>,
            <><B>Clockwork’s Tempo</B> makes its partner’s timers run ×3: splice it with whichever enchantment waits longest (a Goose egg, a Parasite feed). And keep its stored time for <B>Rewind</B>: undoing a fox bite or a failed strike is often worth more than skipping ahead.</>,
            <><B>Golden</B> (a golden egg a day: a free charge of what its partner does) suits partners whose charges are precious, like a Genie’s wishes or a Size Ray’s shots. <B>Giant</B> (its plot stands giant for hours: minigames ×1.5) suits a plot you play a lot.</>,
            <><B>Strings</B> (Puppeteer) does chores for you every day, and <B>Folded</B> (Origami) halves a long wait: great for players who can’t check in often.</>,
            <><B>Tempered</B> (Crucible) protects the partner’s plot from the Leviathan, Parasites, pranks and scorches.</>,
            <>Hunting Aberrations? Put a <B>Storm Coil</B> in the splice (3× as likely), then call its storm: caught bolts can mutate a hybrid on the spot.</>,
          ]} />
          <Recipe a="☀️ Pocket Sun" b="🍀 armed Luck" to="your best claims" note="Throw the sun, stoke it White-hot (ultras ×4, half the size) and claim inside it with Luck armed. Time the Solar Flare for best-of-two on top." />
          <Recipe a="🪄 Dowsing Rod" b="patience" to="the exact roll you want" note="Tune it to what you’re chasing (a Mythic, a Shiny, one ultra). Every miss pushes it deeper; at full depth the next roll is the target. Anything better than the target is still yours." />
          <Tip>Park the Pocket Sun <B>in orbit</B> over the plots you play most on days you won’t claim: their minigames pay ×1.25 and your enchantments there tick 10% faster.</Tip>
        </>
      ),
    },
  ],
};
