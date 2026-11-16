import { ESTATES, ESTATE_KINDS } from '../../realms/estates/meta';
import { DOMAINS } from '../../realms/estates/domains';
import { REALM_META } from '../../realms/kinds';
import type { DomainKind } from '../../backend/types';
import type { Chapter } from '../types';
import { fmtN } from '../live';
import { B, Bullets, CardGrid, Chips, Combo, Facts, Figure, GoRow, H, Note, P, Pro, Steps, Table, Tip, Warn } from '../ui';
import { MergeLadder, TravelRoute } from '../visuals';
import { BasePlotArt } from '../../plot/BasePlotArt';

const DOMAIN_OF: Record<string, DomainKind> = Object.fromEntries(Object.entries(DOMAINS).map(([k, v]) => [v.base, k as DomainKind]));

export const places: Chapter = {
  id: 'places',
  emoji: '🏘️',
  title: 'Plot types in depth',
  blurb: 'Art canvases, farms, businesses, arcades, the five realms, the Arena, homes, Landlord, travel, and every Estate and Domain.',
  color: '#FF4D6D',
  topics: [
    {
      id: 'base', emoji: '🟩', title: 'Base plots',
      summary: 'Just land: it earns rent and needs nothing. The default for every new plot.',
      keys: 'base plot default no type plain land',
      body: () => (
        <>
          <div className="flex flex-wrap justify-center gap-2 py-1" aria-hidden>{(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const).map((r) => <BasePlotArt key={r} rarity={r} size={44} />)}</div>
          <P>A Base plot earns its rarity’s rent and does nothing else, so there’s nothing to look after. Every new plot starts as one, and turning it into any other type is free at any time.</P>
          <Bullets items={[
            'Only Base plots can be sacrificed at the Altar of Luck.',
            'Base plots still hold their style’s minigame, so they still pay Ink.',
            'Keep spare Commons as Base plots: they’re your Luck fuel.',
          ]} />
        </>
      ),
    },
    {
      id: 'art', emoji: '🎨', title: 'Art canvases',
      summary: 'Paint on your plots and publish it to the real map. Careful, original work earns a craft bonus.',
      keys: 'art canvas paint draw editor publish mural craft bonus painting streak layers brushes studio',
      body: (c) => {
        const tiers = c.v<{ ink: number; min: number }[]>('earn.craft.tiers', [{ ink: 5, min: 40 }, { ink: 12, min: 60 }, { ink: 25, min: 80 }]);
        return (
          <>
            <Steps items={[
              <>Make a plot an <B>Art</B> canvas, then open it from Create → My canvases.</>,
              <>Paint with the editor: brushes, fills, layers, palettes and shade ramps, trace guides, a free mirror and idea prompts. Your draft saves itself as you go.</>,
              <>Tap <B>Publish</B>. After a quick check, your art becomes that part of the world map for everyone, at every zoom.</>,
              <>Merge neighbouring Art plots into one big canvas and paint a mural across all of them.</>,
            ]} />
            <H>The craft bonus</H>
            <P>Every published canvas is scored for craft, and good scores pay Ink.</P>
            <Table head={['Craft score', 'Ink']} rows={tiers.map((t) => [`${t.min}+`, `${fmtN(t.ink)}`])} note={`Up to ${fmtN(c.n('earn.craft.daily_cap', 100))} Ink a day. Bigger canvases pay +${fmtN(c.n('earn.craft.plot_bonus_pct', 20))}% for every extra plot (up to ${fmtN(c.n('earn.craft.max_bonus_plots', 8))} plots).`} />
            <Bullets items={[
              <><B>Time matters most.</B> The score weighs how long you really spent painting (full credit at about {fmtN(c.n('earn.craft.effort.full_minutes', 40))} minutes, more for bigger canvases).</>,
              <><B>Originality matters.</B> Art that closely copies another piece earns little or nothing; imported pictures earn nothing.</>,
              <><B>Painting streak:</B> paint at least {fmtN(c.n('creative.streak.min_minutes', 5))} minutes a day for +{fmtN(c.n('creative.streak.step_pct', 5))}% craft bonus per day in a row, up to +{fmtN(c.n('creative.streak.max_pct', 50))}%.</>,
              'Publishing also pays Pigments and XP, and approved art earns Gallery Tokens.',
            ]} />
            <Note>Everything you publish must follow the Content Policy. Art is checked, and players can report anything that breaks it.</Note>
            <GoRow links={[['/canvases', 'My canvases'], ['/inventory', 'Studio & shop'], ['/gallery', 'Gallery']]} />
          </>
        );
      },
    },
    {
      id: 'habitat', emoji: '🌳', title: 'Habitats',
      summary: 'A woodland sanctuary where your Inkborn live. Merge plots to grow it.',
      keys: 'habitat sanctuary inkborn home creatures capacity',
      body: (c) => (
        <>
          <P>A habitat is a walk-around woodland where your creatures live, play and fill an Ink Spring. Every player also gets a free starter sanctuary that needs no land.</P>
          <Facts items={[
            { k: 'A habitat holds', v: `${fmtN(c.n('inkborn.capacity_base', 3))} + ${fmtN(c.n('inkborn.capacity_per_plot', 2))} per plot`, hint: 'creatures' },
            { k: 'Starter sanctuary', v: `${fmtN(c.n('inkborn.starter_capacity', 4))} creatures` },
            { k: 'Decor', v: `${fmtN(c.n('inkborn.decor_base', 30))} + ${fmtN(c.n('inkborn.decor_per_plot', 20))} per plot`, hint: 'trees, nests, lanterns…' },
          ]} />
          <Note>Everything about the creatures themselves is in the Inkborn chapter.</Note>
        </>
      ),
    },
    {
      id: 'farm', emoji: '🌾', title: 'Farms',
      summary: 'Plant, water, harvest and sell in a 3D farmyard. Level up for new crops, buildings, recipes and orders.',
      keys: 'farm crops seeds plant water harvest sell coins golden harvest buildings coop hive mill kitchen dairy orders chores farm games help helping hands visit water friends crops',
      body: (c) => {
        const crops = Object.values(c.v<Record<string, any>>('farm.crops', {}));
        const lv = c.v<Record<string, number>>('farm.progression.crop_levels', {});
        const list = (crops.length ? crops : [
          { id: 'carrot', name: 'Carrot', seed: 0, sell: 2, minutes: 3, yield: [2, 4] }, { id: 'lettuce', name: 'Lettuce', seed: 1, sell: 2, minutes: 6, yield: [2, 3] },
          { id: 'strawberry', name: 'Strawberry', seed: 3, sell: 3, minutes: 15, yield: [3, 5] }, { id: 'tomato', name: 'Tomato', seed: 4, sell: 4, minutes: 30, yield: [3, 6] },
          { id: 'sunflower', name: 'Sunflower', seed: 3, sell: 4, minutes: 20, yield: [2, 4] }, { id: 'corn', name: 'Corn', seed: 5, sell: 4, minutes: 45, yield: [4, 7] },
          { id: 'pumpkin', name: 'Pumpkin', seed: 8, sell: 18, minutes: 90, yield: [1, 2] }, { id: 'melon', name: 'Golden melon', seed: 20, sell: 70, minutes: 180, yield: [1, 1] },
        ]).map((x: any, i) => ({ ...x, key: x.id ?? x.name ?? i }))
          .sort((a: any, b: any) => Number(a.minutes) - Number(b.minutes));
        return (
          <>
            <Steps items={[
              <>Buy seeds and plant them in your soil beds. You start with <B>{fmtN(c.n('farm.beds_base', 6))} beds</B>, +{fmtN(c.n('farm.beds_per_plot', 4))} for every plot merged in (up to {fmtN(c.n('farm.beds_max', 48))}).</>,
              <>Water them: watering speeds a crop up by {fmtN(c.n('farm.water_speedup', 0.4) * 100)}%. Crops keep growing while you’re away.</>,
              <>Harvest and sell. <B>{fmtN(c.n('farm.golden_chance', 0.06) * 100)}%</B> of harvests come up <B>golden</B>, worth ×{fmtN(c.n('farm.golden_mult', 5))}.</>,
              'Level up your farm for new crops, buildings (coop, beehive, windmill, kitchen, dairy barn), recipes and upgrades.',
              'Fill orders on the board and do the daily chores for coins, XP and Ink.',
            ]} />
            <Table head={['Crop', 'Seed', 'Grows', 'Harvest', 'Sells for', 'From farm level']} rows={list.map((x: any) => [
              x.name, fmtN(Number(x.seed ?? 0)), `${fmtN(Number(x.minutes))} min`, Array.isArray(x.yield) ? `${x.yield[0]}–${x.yield[1]}` : '—', `${fmtN(Number(x.sell))} each`, fmtN(Number(lv[x.id] ?? lv[x.key] ?? 1)),
            ])} dense note="Sales pay Farm Coins (no limit) and Ink (limited a day). Coins buy upgrades: sprinklers, fertilizer, green thumb, golden touch, a market stall and a bigger barn." />
            <Chips items={['🚜 Tractor Rush', '🐑 Sheep Round-up', '🥕 Veggie Catch', '🐛 Pest Pop', '🐝 Pollinator', '🍳 Recipe Rush']} c="#E0A800" />
            <Bullets items={[
              <>Farm games, chores and orders share a daily Ink limit of <B>{fmtN(c.n('farm.daily_cap', 120))}</B>.</>,
              'A one-plot farm opens 2 of its 6 games, two or three plots open 3, four or more open all 6.',
              <><B>🤝 Helping hands:</B> visiting someone’s farm, water their growing crops for them (they grow faster): up to {fmtN(c.n('farm.help.per_day', 8))} a day at each farm, +{fmtN(c.n('farm.help.ink', 1))} Ink to you for each. Players at a farm, business, realm, sanctuary or estate show “🤝 Help” in the lobbies, so you can go and join them.</>,
            ]} />
            <Pro>Long crops (pumpkins, golden melons) are worth the most per bed, but only if you come back on time. Plant short crops when you’re about to play for a while, long ones before bed.</Pro>
          </>
        );
      },
    },
    {
      id: 'business', emoji: '🍋', title: 'Businesses',
      summary: 'An idle tycoon: tap the lemonade stand, buy ventures that earn every second, go public, collect dividends in Ink.',
      keys: 'business tycoon idle lemonade ventures ipo go public shares dividends golden customer frenzy',
      body: (c) => (
        <>
          <Steps items={[
            'Tap the lemonade stand to sell cups and earn cash (the business’s own money).',
            'Buy ventures that earn every second, even while you’re away: Lemonade Stand → Cookie Cart → Food Truck → Coffee Shop → Bookstore → Arcade → Hotel → Tech Startup → Bank → Space Corp.',
            'Own 25, 50, 100… of a venture and it makes double. About 80 upgrades unlock as you play.',
            'Tap golden customers when they appear: a windfall, a Frenzy (×7 income) or a Tap Storm.',
            <>Go public (<B>IPO</B>): start over with shares that boost everything forever (+{fmtN(c.n('business.share_bonus', 0.02) * 100)}% each).</>,
          ]} />
          <Facts items={[
            { k: 'Every business plot', v: `+${fmtN(c.n('business.plot_bonus', 0.1) * 100)}%`, hint: 'to your whole business’s income' },
            { k: 'Earns while away', v: `${fmtN(c.n('business.offline_hours', 8))} h` },
            { k: 'Ink a day', v: `up to ${fmtN(c.n('business.daily_cap', 120))}`, hint: 'dividends, milestones, games, tips' },
          ]} />
          <Chips items={['🥤 Lemon Pour', '🛵 Delivery Dash', '🤝 Haggle!', '📈 Stock Trader']} c="#D4A500" />
          <Tip>Your business empire belongs to <i>you</i>, not one plot: every Business plot you own makes the whole empire earn more.</Tip>
        </>
      ),
    },
    {
      id: 'arcade', emoji: '🕹️', title: 'Arcades',
      summary: 'A neon hall of free cabinets anyone can play for tickets and Ink. You get a cut of every ticket won in yours.',
      keys: 'arcade cabinets tickets prizes prize counter carnival arena party games high scores versus co-op coop together multiplayer mirror door mirror arcade',
      body: (c) => {
        const games = Object.values(c.v<Record<string, any>>('arcade.games', {})).sort((a: any, b: any) => Number(a.level ?? 1) - Number(b.level ?? 1));
        return (
          <>
            <P>Walk your explorer round the hall and play any cabinet, free. Every game is won by skill and timing. Scores win <B>tickets</B> 🎟️ and a little Ink.</P>
            {games.length > 0 && <Table head={['Cabinet', 'Opens at level', 'Top Ink a play']} rows={games.map((g: any) => [`${g.emoji ?? '🕹️'} ${g.name}`, fmtN(Number(g.level ?? 1)), fmtN(Number(g.max_ink ?? 10))])} dense />}
            <Bullets items={[
              <>Your arcade <B>levels up</B> from every game played in it, yours and visitors’, which opens more cabinets (up to level {fmtN(Number(c.v('arcade.level.max', 30)))}).</>,
              <>You get <B>{fmtN(c.n('arcade.owner_share', 0.1) * 100)}% of the tickets</B> whenever someone plays in your arcade.</>,
              'Spend tickets at the prize counter (prizes go on your shelves), on new cabinets, cabinet upgrades (more tickets a round) and neon decor, or on explorer gear like the Pixel Crown.',
              <>In the <B>Hot Zone</B> cabinets pay ×{fmtN(c.n('arcade.hot.ink', 1.5), 1)} Ink and ×{fmtN(c.n('arcade.hot.tickets', 2))} tickets. Each cabinet upgrade adds +{fmtN(c.n('arcade.upgrade.bonus', 0.2) * 100)}%.</>,
              'High-score boards for every cabinet, a daily bonus with a streak, Classic and Endless modes, and chat with everyone in the same arcade room.',
              <>Play a cabinet <B>with others</B> in the room (2 to 4 players): <B>⚔️ Versus</B> (same round, same time, top score wins bonus tickets) or <B>🤝 Co-op</B> (your scores add up; hit the target and everyone gets the bonus). Open rounds show in Looking for players.</>,
              'The arena runs live party games for up to 10 players.',
            ]} />
            <Note title="🪞 The Mirror door">Every arcade has a Mirror door. Walking through costs <B>25,000 tickets</B>, once, and it stays open for good. On the other side is the Mirror Arcade: everything backwards, cabinets that only exist there, Ink with no cap, and Versus or Co-op with whoever else is through the glass. Some say there’s another way in.</Note>
            {c.v('arcade.daily_cap', null) == null
              ? <Tip>Arcade cabinets have <B>no daily Ink cap</B>: a strong player keeps earning for as long as they keep scoring.</Tip>
              : <Tip>Arcade cabinets pay up to <B>{fmtN(c.n('arcade.daily_cap', 0))} Ink a day</B>, on top of every other source.</Tip>}
            <Combo>Merge four arcade plots into a 2×2 and it becomes an <B>Arcade Carnival</B>: the same arcade with a whole carnival out of its front doors (six 3D booths, a Ferris wheel and a carousel).</Combo>
          </>
        );
      },
    },
    {
      id: 'realms', emoji: '⛏️', title: 'The five realms',
      summary: 'Mine, Sky Island, Workshop, Restaurant and Dungeon: deep places with their own crews, resources and games.',
      keys: 'realms mine sky island workshop restaurant diner dungeon crew producers offline zones resources',
      body: (c) => (
        <>
          <CardGrid items={(['mine', 'sky', 'workshop', 'diner', 'dungeon'] as const).map((k) => ({ key: k, art: <span>{REALM_META[k].emoji}</span>, title: REALM_META[k].name, sub: REALM_META[k].body, c: REALM_META[k].color, body: REALM_META[k].long }))} />
          <Bullets items={[
            <>Each realm has <B>six zones</B> that open as it levels (up to level {fmtN(Number(c.v('realms.level.max', 40)))}), its own money and resources, a market, a recipe bench and a book of rare finds.</>,
            <>Its crew (miners, machines, suppliers, minions…) keeps producing while you’re away, for up to {fmtN(c.n('realms.offline_hours', 8))} hours.</>,
            <>Ink comes from its games, every level ({fmtN(c.n('realms.level_ink', 3))} Ink a level) and rare finds, up to <B>{fmtN(c.n('realms.daily_cap', 120))} a day</B> across all realms.</>,
            <>Visitors can play your realm’s signature game, and you get {fmtN(c.n('realms.visitor_share', 0.1) * 100)}% of what they make.</>,
          ]} />
        </>
      ),
    },
    {
      id: 'arena', emoji: '🃏', title: 'The Paintbrawl Arena',
      summary: 'A card battler on a 3D board: collect painted creature cards, build a deck, and battle players live.',
      keys: 'arena paintbrawl cards deck battle trophies packs dust craft foil ranked',
      body: (c) => (
        <>
          <P>{REALM_META.brawl.long}</P>
          <Facts cols={4} items={[
            { k: 'Deck', v: `${fmtN(Number(c.v('brawl.deck_size', 20)))} cards` },
            { k: 'A pack', v: `${fmtN(Number(c.v('brawl.pack_size', 5)))} cards`, hint: 'from the pack shop' },
            { k: 'Ranks', v: 'Bronze → Legend', hint: 'by trophies' },
            { k: 'Foil chance', v: `${fmtN(Number(c.v('brawl.foil_chance', 0.05)) * 100)}%` },
          ]} />
          <Bullets items={['Duplicate cards turn into dust; dust crafts the cards you’re missing.', 'Play bots to learn, then real players for trophies. Every match has its own twist.', 'Your first win also opens a pack.']} />
        </>
      ),
    },
    {
      id: 'home', emoji: '🏠', title: 'Residential: your Home',
      summary: 'Your house, which visitors walk into from your profile. Merge more plots for more floors, balconies, a lift and a rooftop pool.',
      keys: 'home house residential visit house check-in book note drawing furniture floors party games ai players bots solo',
      body: (c) => {
        const sizes = c.v<any[]>('residential.sizes', []);
        return (
          <>
            <P>A <B>Home</B> plot is your house in LANDVAS. It switches on <B>Visit home</B> on your profile, and visitors who walk in sign your <B>check-in book</B> with a note or a little drawing. Furnish it, pick walls, floors, moods and the view outside the windows.</P>
            {sizes.length > 0 && <Table head={['Merge', 'Becomes', 'Unlocks']} rows={sizes.map((s: any) => [`${s.size}×${s.size}`, s.name, s.unlock])} dense />}
            <H>House party games</H>
            <P>Invite friends over and play party games right in your house, for up to 8 players: Word Spy, Ink Tag, Hide & Seek, Floor is Lava, Musical Chairs, Snowball Fight, Iceberg Sumo, Checkers, Four in a Row, Doodle Guess and more. The top places win Ink ({c.v<number[]>('home.games.place_ink', [10, 6, 4]).slice(0, 3).join(', ')}…).</P>
            <Bullets items={[
              <>No one around? The host can add <B>🤖 AI players</B> to any table (or fill the empty seats), so all 19 house games work on your own. Anyone who sits down takes a bot’s seat.</>,
              'The bots play fairly, like people: a moment to think, the odd miss, human reaction times.',
              'Bots count for places but never for the party bonus, and a game with bots pays half the Ink.',
            ]} />
            <Note>Switching a Residential plot between Home and Landlord is free.</Note>
          </>
        );
      },
    },
    {
      id: 'landlord', emoji: '🏘️', title: 'Residential: Landlord',
      summary: 'Homes you rent to virtual tenants. Do the monthly checklist and the 1st of the month is a ×50 rent day.',
      keys: 'landlord tenants rent day 50x estate checklist',
      body: (c) => (
        <>
          <P>Landlord plots earn normal rent all month. Keep up each estate (inspect, repair, answer tenants, water the garden, one task at a time inside that estate) and on the <B>1st of every month</B> they earn <B>×{fmtN(c.n('residential.landlord_mult', 50))} rent all day</B>.</P>
          <GoRow links={[['/handbook/rent#rentday', 'The full rent-day checklist']]} />
          <Pro>Landlord pays off most on your rarest plots: ×{fmtN(c.n('residential.landlord_mult', 50))} of a big number. A Mythic Landlord plot’s rent day equals weeks of its normal rent.</Pro>
        </>
      ),
    },
    {
      id: 'travel', emoji: '✈️', title: 'Travel: trains, planes and pin flights',
      summary: 'Ride to real stations and airports, or drop a pin anywhere. When you arrive you’re really there: claim and play.',
      keys: 'travel train plane flight fly pin trip stamps passport station airport abroad another city',
      body: (c) => (
        <>
          <Figure caption="Board near you, pass real stations (each new one is a stamp), arrive, and roam around your stop.">
            <TravelRoute />
          </Figure>
          <Steps items={[
            <>Open <B>✈️ Fly</B> (in the app, hold the World button; on the website it’s in the + tray on a phone and a chip on a computer) and drop a pin anywhere on Earth. Or open the <B>🔥 Hot Zone</B> card and tap <B>Fly there</B>. No plot needed.</>,
            <>Own a <B>Train</B> plot to ride the real rail network (board at the station nearest you, stopping at real stations on the way), or a <B>Plane</B> plot to fly from your nearest airport to 3,000+ real airports.</>,
            'Rides take a few minutes. Pay a little Ink to arrive now (about 1 Ink a minute left).',
            <>Once you land your explorer <B>really is there</B>: claim plots around you at the normal price, play, and roam about 2.5 km with the joystick. Your GPS doesn’t pull you back until you head home.</>,
            'Every new station or airport is a souvenir stamp in your passport (a little Ink; more for a new country).',
          ]} />
          <Facts cols={3} items={[
            { k: 'Trips a day', v: '2', hint: 'flights, pin flights and trains together' },
            { k: 'More trips', v: '+2 for 100 Ink', hint: 'as often as you like' },
            { k: 'Riding with your party', v: 'free', hint: 'the leader’s trip carries you' },
          ]} />
          <Combo title="Travel unlocks the whole planet">Fly to the <B>Hot Zone</B> and claim with its boosted rolls; fly to an empty country to hunt its <B>Crown</B>; fly to a busy city to drop a <B>Kraken</B> among other players’ land. Your party can come too.</Combo>
          <GoRow links={[['/party', 'Start a party']]} />
        </>
      ),
    },
    {
      id: 'estates', emoji: '🏰', title: 'Estates (2×2) and Domains (3×3)',
      summary: 'A full square of one type can become a far grander place, with its own world, economy and signature game.',
      keys: 'estate domain 2x2 3x3 grand atelier wildwood reserve ranch exchange carnival gemheart skyport foundry food hall citadel colosseum museum sanctuary kingdom megacorp galaxy park core observatory automaton banquet abyssal titans',
      body: () => (
        <>
          <Figure caption="Merge a full 2×2 square of one type for its Estate, a full 3×3 for its Domain. Switching between the tiers is free and keeps progress.">
            <MergeLadder />
          </Figure>
          <Table head={['Type', 'Estate (2×2)', 'Domain (3×3)']} rows={ESTATE_KINDS.map((e) => {
            const est = ESTATES[e], dom = DOMAINS[DOMAIN_OF[est.base]];
            return [
              <b key="b">{REALM_META[est.base as keyof typeof REALM_META]?.emoji ?? ({ canvas: '🎨', habitat: '🌳', farm: '🌾', business: '🍋', arcade: '🕹️' } as Record<string, string>)[est.base] ?? '•'} {({ canvas: 'Art', habitat: 'Habitat', farm: 'Farm', business: 'Business', arcade: 'Arcade', mine: 'Mine', sky: 'Sky Island', workshop: 'Workshop', diner: 'Restaurant', dungeon: 'Dungeon', brawl: 'Arena' } as Record<string, string>)[est.base] ?? est.base}</b>,
              <span key="e">{est.emoji} <b>{est.name}</b><br /><span className="text-[11.5px] text-muted">🎮 {est.game}</span></span>,
              dom ? <span key="d">{dom.emoji} <b>{dom.name}</b><br /><span className="text-[11.5px] text-muted">🎮 {dom.game}</span></span> : '—',
            ];
          })} />
          <Bullets items={[
            'Each has six zones, its own resources and recipes, a crew that works while you’re away, and a book of treasures to collect.',
            'Your first Estate or Domain starts with a charter bonus to spend. A Domain’s economy runs about 1.5× an Estate’s.',
            'Estates and Domains also get their own doors in your Home.',
          ]} />
          <Warn>Breaking a square (say, merging a plot away) drops the place back a tier. Your progress is kept, and it comes back when the square does.</Warn>
        </>
      ),
    },
  ],
};
