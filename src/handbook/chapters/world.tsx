import { PLOT_TYPES } from '../../map/plotStyle';
import { GAME_INFO } from '../../shared/minigames';
import type { PlotTypeId } from '../../shared/grid';
import type { Chapter } from '../types';
import { fmtN } from '../live';
import { B, Bullets, CardGrid, Combo, Facts, Figure, GoRow, Note, P, Pro, Steps, Table, Tip, Warn } from '../ui';
import { ClaimMock, MergeLadder, PlotScale, RangeRings, ReachGrid, Swatch } from '../visuals';
import { ExplorerFigure } from '../../explorer/ExplorerFigure';

/** what a plot can become: the picker's order, its look and what each one is for */
export const KINDS: { k: string; icon: string; title: string; c: string; body: string }[] = [
  { k: 'base', icon: '🟩', title: 'Base', c: '#5FB37A', body: 'Just land. Earns rent like any plot and needs nothing. Give it a type any time, free.' },
  { k: 'canvas', icon: '🎨', title: 'Art', c: '#7B5CFF', body: 'Paint art the whole world sees on the live map. Merge neighbours into one mural.' },
  { k: 'habitat', icon: '🌳', title: 'Habitat', c: '#3DDC97', body: 'A woodland home for your Inkborn. Bigger habitats hold more creatures.' },
  { k: 'farm', icon: '🌾', title: 'Farm', c: '#E0A800', body: 'Grow, harvest and sell crops in a 3D farmyard. Buildings, orders and farm games.' },
  { k: 'business', icon: '🍋', title: 'Business', c: '#D4A500', body: 'From a lemonade stand to an empire. Earns while you’re away, plus money-making games.' },
  { k: 'arcade', icon: '🕹️', title: 'Arcade', c: '#FF3D9A', body: 'Neon cabinets anyone can play for tickets and Ink. You get a cut of the tickets won.' },
  { k: 'mine', icon: '⛏️', title: 'Mine', c: '#7C5CFF', body: 'Ore, gems and fossils, six caves deep, with a crew that digs while you’re away.' },
  { k: 'sky', icon: '☁️', title: 'Sky Island', c: '#38BDF8', body: 'A floating island with builds and sky creatures to spot.' },
  { k: 'workshop', icon: '🛠️', title: 'Workshop', c: '#F59E0B', body: 'Machines, parts and gadgets to invent.' },
  { k: 'diner', icon: '🍳', title: 'Restaurant', c: '#EF4444', body: 'Cook, serve, and grow a food cart into a restaurant.' },
  { k: 'dungeon', icon: '⚔️', title: 'Dungeon', c: '#A855F7', body: 'Six floors down: monsters, minions and loot.' },
  { k: 'brawl', icon: '🃏', title: 'Arena', c: '#FF4FD8', body: 'Paintbrawl: collect painted creature cards and battle players live.' },
  { k: 'home', icon: '🏡', title: 'Residential', c: '#E0745C', body: 'Two subplots: Home (your house, which visitors walk into) or Landlord (homes you rent out).' },
  { k: 'train', icon: '🧳', title: 'Travel', c: '#2FA4D9', body: 'Two subplots: Train or Plane. Ride to real stations and airports, and really be there.' },
];

const STYLE_ORDER: PlotTypeId[] = ['graphite', 'pigment', 'mosaic', 'lumina', 'fresco', 'clay', 'prism', 'glass'];
const GAME_OF: Record<PlotTypeId, keyof typeof GAME_INFO> = {
  graphite: 'tracecraft', pigment: 'colorburst', mosaic: 'paintpop', lumina: 'lightlines', fresco: 'memorymural', clay: 'sculptor', prism: 'rollermural', glass: 'mirrorline',
};

export const world: Chapter = {
  id: 'world',
  emoji: '🗺️',
  title: 'The World & your land',
  blurb: 'The map, your explorer, claiming plots, plot styles and types, merging, and getting around.',
  color: '#34C3FF',
  topics: [
    {
      id: 'map', emoji: '🗺️', title: 'The living map',
      summary: 'The real Earth, with every claimed plot drawn on it: art, creatures, enchantments, Crowns and ultras.',
      keys: 'map world zoom globe layers view pan',
      body: () => (
        <>
          <P>The World tab is the real map of the planet. Zoom out and you see the whole globe. Zoom in on any street and it turns into a grid of plots: yours, other players’, and the free ones waiting to be claimed.</P>
          <Bullets items={[
            <><B>Art lives on the map.</B> Every mural a player publishes becomes that patch of the world for everyone.</>,
            <><B>The land is alive.</B> Enchanted plots show their creature, Parasites wrap round the plots they feed on, Primordials glow as beacons, and on Saturdays the Leviathan walks across it.</>,
            <><B>Tap any plot</B> for everything about it: owner, rarity, rent, its minigame, its enchantment.</>,
            <><B>The View button</B> changes the map’s look and which layers you see. Settings has map themes, a 3D tilt and the globe.</>,
          ]} />
          <GoRow links={[['/world', 'Open the map'], ['/plots', 'My plots'], ['/legend', 'Map legend & rarities']]} />
        </>
      ),
    },
    {
      id: 'plots', emoji: '🟩', title: 'What a plot is',
      summary: 'A fixed square of the real world, about 7–10 m across. Six to eight fit on a house.',
      keys: 'plot size metres square cell grid tile how big parcel',
      body: () => (
        <>
          <Figure caption="Plots are a fixed grid over the real world. One plot is about 7–10 m across, so six to eight cover a house.">
            <PlotScale />
          </Figure>
          <P>The whole planet is divided into a fixed grid of about <B>17 trillion</B> squares (4,194,304 × 4,194,304). Each square is one plot: about <B>9.5 m</B> wide at the equator and about <B>7 m</B> at 40° north, so six to eight cover a typical house. A plot’s spot never moves, and every device sees the same grid.</P>
          <Facts items={[
            { k: 'Each plot has', v: 'its own fixed rarity', hint: 'hidden until it’s claimed' },
            { k: 'and', v: 'its own style', hint: 'which decides its minigame' },
            { k: 'You keep it', v: 'until you let it go', hint: 'rent never stops' },
          ]} />
          <Note title="Every spot has a secret">A plot’s rarity is decided by the spot itself, in secret: nobody can predict it, and tapping through or reopening the roll never changes it. That’s why Luck, Hot Zones and the Spyglass, which give you extra or better rolls, matter so much.</Note>
        </>
      ),
    },
    {
      id: 'explorer', emoji: '🧭', title: 'Your explorer & location',
      summary: 'A little figure that stands where you really are on Earth. You claim plots around it.',
      keys: 'explorer gps location permission character avatar walking move',
      body: () => (
        <>
          <div className="flex justify-center gap-6 py-1"><ExplorerFigure accent="#8B6BFF" size={70} label="An explorer" /><ExplorerFigure accent="#3DDC97" size={70} walking label="An explorer walking" /></div>
          <P>Your <B>explorer</B> is you on the map. With location on, it stands where your phone is and walks with you. Claims are made <i>near your explorer</i>, so the land you build up is land around the places you really go.</P>
          <Bullets items={[
            'Walk somewhere new and a whole new patch of plots is in reach.',
            'Dress your explorer up in the Explorer page (hats, outfits and arcade prizes). Ultras you own can give it an aura.',
            'Your home and your real position are never shown to other players.',
            'No location? Simple mode, flights and trains still let you claim plots.',
          ]} />
          <GoRow links={[['/explorer', 'Your explorer']]} />
        </>
      ),
    },
    {
      id: 'reach', emoji: '📏', title: 'Claim reach',
      summary: 'You can claim any free plot inside the dashed square around your explorer.',
      keys: 'reach range distance how far can i claim dashed square out of reach',
      body: (c) => {
        const reach = Number(c.w?.explorer?.claim_reach ?? 6);
        return (
          <>
            <Figure caption={`Your reach is ${reach} plots in every direction, a square ${reach * 2 + 1} plots across (${(reach * 2 + 1) ** 2} plots). Every free one inside it can be claimed.`}>
              <ReachGrid reach={reach} />
            </Figure>
            <P>Tap a free plot inside the square and the claim preview opens. Tap one outside and the game tells you it’s out of reach: walk (or ride) closer.</P>
            <Tip>Claim plots <B>next to</B> your own. Touching plots can be merged into bigger places, which open more games (see Merging below).</Tip>
          </>
        );
      },
    },
    {
      id: 'joystick', emoji: '🕹️', title: 'Joystick & vehicles',
      summary: 'Steer your explorer with the joystick to reach plots near you without walking. Faster wheels roam further.',
      keys: 'joystick vehicles bike car jetpack garage tank fuel refill move without walking',
      body: (c) => {
        const j = c.w?.explorer?.joystick;
        const tank = Number(j?.tank_seconds ?? 60);
        const veh = [
          { name: 'Walk', emoji: '🚶', m: 600, cost: 'free', speed: 6, fuel: false },
          { name: 'Bike', emoji: '🚲', m: 2000, cost: '250 Ink', speed: 20, fuel: false },
          { name: 'Car', emoji: '🚗', m: 6000, cost: '1,200 Ink', speed: 60, fuel: true },
          { name: 'Jetpack', emoji: '🚀', m: 15000, cost: '4,000 Ink', speed: 150, fuel: true },
        ];
        return (
          <>
            <P>Open the <B>joystick</B> from the map and steer: drag the wheel, use the D-pad (great with the phone sideways), or the arrow keys. You can only roam so far from where you really are, and how far depends on what you’re riding.</P>
            <Figure caption="How far from your real position each vehicle can take your explorer.">
              <RangeRings items={veh} />
            </Figure>
            <Table head={['Vehicle', 'Speed', 'Roams', 'Costs', 'Fuel']} rows={veh.map((v) => [`${v.emoji} ${v.name}`, `${v.speed} km/h`, v.m >= 1000 ? `${v.m / 1000} km` : `${v.m} m`, v.cost, v.fuel ? 'burns the tank' : 'free'])}
              note="Buy them in the Garage, in order: the Car needs the Bike, the Jetpack needs the Car." />
            <Bullets items={[
              <>The Car and the Jetpack burn your <B>tank</B> ({tank} seconds of driving at full speed; less if you push gently).</>,
              <>The tank <B>refills free every day</B>. You can also refill it for {fmtN(Number((j as any)?.refill_ink ?? 50))} Ink, a few times a day.</>,
              'Walking and biking never use fuel.',
            ]} />
            <Pro>A Bike is the best early buy after a few plots: four times the range for 250 Ink, and it never needs fuel. It turns your whole neighbourhood into claimable land.</Pro>
          </>
        );
      },
    },
    {
      id: 'claim', emoji: '🖐️', title: 'Claiming a plot',
      summary: 'Tap a free plot in reach, choose what it becomes, claim it, and watch it roll.',
      keys: 'claim buy plot price cost free plots how to buy acquire',
      body: (c) => (
        <>
          <Figure caption="The claim preview: pick what the plot becomes, then claim it.">
            <ClaimMock price={c.n('economy.acquire.base_ink', 100)} free={c.n('economy.free_plots', 4)} />
          </Figure>
          <Steps items={[
            <>Tap a free plot inside your dashed square.</>,
            <>The <B>claim preview</B> opens: choose what the plot becomes (Base, Art, Habitat, Farm…). The price and rent are the same whichever you pick. The odds sit on their own sheet if you want them.</>,
            <>Optionally <B>name it</B>. “Next to your land” means it touches a plot you own.</>,
            <>Tap <B>Claim</B>. The Ink is spent, and the roll reveals the rarity and its minigame.</>,
          ]} />
          <Facts items={[
            { k: 'Price', v: `${fmtN(c.n('economy.acquire.base_ink', 100))} Ink`, hint: 'the same for every plot', c: '#34C3FF' },
            { k: 'Your first', v: `${fmtN(c.n('economy.free_plots', 4))} plots`, hint: 'are free', c: '#3DDC97' },
            { k: 'Most plots one player can own', v: fmtN(Number(c.v('limits.max_plots_per_player', 10000))), hint: '' },
          ]} />
          <Tip>Armed Luck, a Hot Zone or a roll ticket all change the roll. Arm them <i>before</i> you tap Claim (see the Luck chapter).</Tip>
        </>
      ),
    },
    {
      id: 'styles', emoji: '🎨', title: 'Plot styles and their minigames',
      summary: 'Every spot has one of eight art styles, and the style decides which minigame lives there.',
      keys: 'plot type style graphite pigment mosaic lumina fresco clay prism glass which minigame',
      body: () => (
        <>
          <P>Besides its rarity, every spot has a fixed <B>style</B>: one of eight art materials, each with its own look on the map and its own minigame. When the roll lands, the minigame’s tag drops onto the card.</P>
          <CardGrid items={STYLE_ORDER.map((t) => ({
            key: t, art: <Swatch type={t} size={52} />, title: PLOT_TYPES[t].name, sub: `🎮 ${PLOT_TYPES[t].game}`, c: PLOT_TYPES[t].a,
            body: <>{PLOT_TYPES[t].blurb}. {GAME_INFO[GAME_OF[t]].tagline}</>,
          }))} />
          <Pro>Own all eight styles early. Each minigame pays a set number of wins a day, so more styles means more paid wins every day (see Ink & minigames).</Pro>
        </>
      ),
    },
    {
      id: 'kinds', emoji: '🏗️', title: 'What a plot becomes (plot types)',
      summary: 'Base, Art, Habitat, Farm, Business, Arcade, five realms, the Arena, Residential and Travel.',
      keys: 'plot kind type base art habitat farm business arcade mine sky workshop restaurant diner dungeon arena residential home landlord travel train plane switch change type',
      body: (c) => (
        <>
          <CardGrid items={KINDS.map((k) => ({ key: k.k, art: <span>{k.icon}</span>, title: k.title, c: k.c, body: k.body }))} />
          <Bullets items={[
            <>Every new plot starts as a <B>Base plot</B>. Giving a Base plot a type is always free.</>,
            <>Choosing a type is free for the first {fmtN(c.n('plot_switch.free_minutes', 15))} minutes after you claim. After that, switching from one type to another costs <B>{fmtN(c.n('plot_switch.fee', 20))} Ink</B>.</>,
            'Switching never throws away progress: switch back and the old place is still there.',
            'Rent and price never depend on the type. Rarity decides rent; the type decides what you can do there.',
          ]} />
          <Note>Each type has its own section in the <B>Plot types in depth</B> chapter.</Note>
        </>
      ),
    },
    {
      id: 'merge', emoji: '🧩', title: 'Merging plots into bigger places',
      summary: 'Touching plots of the same type merge into one place. Bigger places open more games, and squares unlock Estates and Domains.',
      keys: 'merge combine connect neighbours bigger canvas mural estate domain 2x2 3x3 games unlock',
      body: (c) => (
        <>
          <P>Plots that touch and share a type can be <B>merged</B> into one place: one big mural, one big farm, one big arcade. Merging costs <B>{fmtN(c.n('earn.merge.ink_per_plot', 15))} Ink for each plot that joins</B>. Only same-type plots merge (an Estate or Domain merges with its own base type).</P>
          <Figure caption="A place opens more of its games the bigger it is. A full 2×2 square can become its type’s Estate, a full 3×3 its Domain.">
            <MergeLadder />
          </Figure>
          <Table head={['Place', '1 plot', '2–3 plots', '4+ plots']} rows={[
            ['🕹️ Arcade cabinets', '4', '8', 'all 16'],
            ['🌾 Farm games', '2', '3', 'all 6'],
            ['🍋 Business games', '1', '2', 'all 4'],
            ['⛏️ Realm games', '1', '1', 'both'],
          ]} note="Games open in a fixed order (for arcades, the lowest-level cabinets first)." />
          <Bullets items={[
            <><B>Estates (2×2)</B> and <B>Domains (3×3)</B> are grander versions of a place with their own world, economy and signature minigame. Your first one starts with a charter bonus to spend.</>,
            'Merging keeps the highest tier the land still qualifies for. Breaking a 3×3 drops a Domain back to an Estate (or to the base type).',
            'Moving between a type, its Estate and its Domain is free and keeps all progress.',
          ]} />
          <Combo>Claim in squares. Four plots in a 2×2 give a place <i>all</i> its games and an Estate. Plan the square before you claim the first plot.</Combo>
          <Warn>Some things can’t be done to merged plots: they can’t be sacrificed at the Altar, folded by the Origami Pocket, melted in the Crucible or fused in the Fusion Lab.</Warn>
        </>
      ),
    },
    {
      id: 'release', emoji: '🔓', title: 'Letting a plot go',
      summary: 'A plot is yours for good unless you trade it in yourself: at the Altar, in the Crucible or in the Fusion Lab.',
      keys: 'release delete give up sacrifice lose plot remove',
      body: () => (
        <>
          <P>Nobody can take your land, and nothing in the game makes you lose a plot by accident (the Leviathan tramples plots, but they stay yours). A plot only goes back to the world when <i>you</i> trade it in: sacrificed at the Altar of Luck for Luck, melted in the Crucible for Heat and metal, or used up in the Fusion Lab. Its spot can then be claimed again by anyone.</P>
          <Warn>A plot you let go is gone for good, with whatever rarity it had. Only let go of plots on purpose: a Common sacrificed for Luck, never a rare one by accident.</Warn>
          <Note>An enchantment belongs to its land: if its plot is released, it sleeps there and wakes for whoever claims the spot next.</Note>
        </>
      ),
    },
  ],
};
