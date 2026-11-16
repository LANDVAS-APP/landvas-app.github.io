import { CurrencyIcon, ResourceIcon } from '../../ui';
import type { Chapter } from '../types';
import { fmtN } from '../live';
import { B, Bullets, Callout, CardGrid, Facts, Figure, GoRow, Note, P, Pro, Steps, Tip, Warn } from '../ui';
import { CoreLoop, PhoneTour, ResetClock } from '../visuals';

export const start: Chapter = {
  id: 'start',
  emoji: '🚀',
  title: 'Start here',
  blurb: 'What LANDVAS is, your first ten minutes, your currencies and how to find your way around.',
  color: '#8B6BFF',
  topics: [
    {
      id: 'what', emoji: '🌍', title: 'What LANDVAS is',
      summary: 'The real world, split into plots you can own. Every plot rolls a rarity, earns rent every second and hides a minigame.',
      keys: 'about intro overview game what is landvas real world map plots rent ink',
      body: (c) => (
        <>
          <P>LANDVAS turns the real map of Earth into millions of small square <B>plots</B>, each about the size of a big room (six to eight cover a house). You claim plots where you really are. Each one is yours until you let it go, and three things happen the moment it’s yours:</P>
          <Bullets items={[
            <><B>It rolls a rarity.</B> Common, Rare, Epic, Legendary, Mythic, or something much rarer. Rarer plots earn more rent, pay more Ink from their minigame, and some have powers of their own.</>,
            <><B>It earns USD rent every second</B>, day and night, even while you’re offline.</>,
            <><B>It holds a minigame.</B> Clear its levels to win <B c="#34C3FF">Ink</B>, the currency that buys your next plot.</>,
          ]} />
          <Figure caption="The loop: play to earn Ink → claim plots → each one rolls a rarity → your land earns rent and opens more games → play again. Every part of the game feeds this loop.">
            <CoreLoop />
          </Figure>
          <P>Then you play it <B>your way</B>. Turn a plot into an art canvas, a habitat for creatures you draw, a farm, a business, a neon arcade, a mine, a dungeon, a home, or a travel hub. You can also fly a rocket to the planets, raise enchantments that change the rules, team up in parties and clans, and hunt the rarest land on Earth.</P>
          <Facts items={[
            { k: 'Free plots to start', v: fmtN(c.n('economy.free_plots', 4)), c: '#3DDC97' },
            { k: 'A plot costs', v: `${fmtN(c.n('economy.acquire.base_ink', 100))} Ink`, c: '#34C3FF' },
            { k: 'Rent boost', v: `×${fmtN(c.n('rent.boost.multiplier', 20))}`, hint: `${fmtN(c.n('rent.boost.free_per_day', 6) * c.n('rent.boost.minutes_per_boost', 30) / 60, 1)} free hours a day`, c: '#FFC93D' },
            { k: 'Plot minigames', v: '8', hint: 'one lives on every plot' },
            { k: 'Everyday rarities', v: String(c.everyday.length || 6), hint: '+ dozens of ultras' },
            { k: 'Ink can be bought?', v: 'Never', hint: 'it’s only earned by playing' },
          ]} />
        </>
      ),
    },
    {
      id: 'first', emoji: '⏱️', title: 'Your first ten minutes',
      summary: 'Do these in order and you’ll have land, Ink, rent and your first rare roll before you know it.',
      keys: 'new player beginner tutorial first steps how to start day one onboarding',
      body: (c) => (
        <>
          <Steps items={[
            <><B>Make your account and confirm your email.</B> The game emails you a link; tap it and you’re in. Every player has to confirm, and invites only count once you do.</>,
            <><B>Allow location</B> so your explorer stands where you really are. Don’t want to? Pick <B>Play without location (Simple mode)</B> and buy plots straight from the home screen instead.</>,
            <><B>Claim your {fmtN(c.n('economy.free_plots', 4))} free plots.</B> On the map, tap any free square inside the dashed box around your explorer, then tap Claim. Watch the roll: each one is a surprise.</>,
            <><B>Tap a plot you own and play its minigame.</B> Clear every round of a level to win the Ink. Your first levels are quick.</>,
            <><B>Tap ⚡ Boost.</B> All your rent earns ×{fmtN(c.n('rent.boost.multiplier', 20))} while it runs. You get {fmtN(c.n('rent.boost.free_per_day', 6))} free boosts a day, so don’t waste them.</>,
            <><B>Open the Play tab</B> to claim today’s 🔥 streak reward and your 🎡 free spin.</>,
            <><B>Buy your next plot</B> for {fmtN(c.n('economy.acquire.base_ink', 100))} Ink once you have it, and keep the loop going.</>,
          ]} />
          <Tip title="Fastest start">Your first few plots’ minigames are your Ink engine. Play each plot’s game up to its daily paid wins before anything else. Every win pays more on rarer plots, and a new plot is only {fmtN(c.n('economy.acquire.base_ink', 100))} Ink away.</Tip>
          <GoRow links={[['/world', 'Open the map'], ['/play', 'Play & Earn'], ['/hub', 'The Play tab']]} />
        </>
      ),
    },
    {
      id: 'currencies', emoji: '💰', title: 'Your currencies',
      summary: 'Ink is what you spend. Rent is what your land earns. Everything else is a resource for one part of the game.',
      keys: 'ink usd dollars rent pigments brush points xp gallery tokens tickets luck currency resources money',
      body: (c) => (
        <>
          <CardGrid items={[
            { key: 'ink', art: <CurrencyIcon kind="ink" size={34} />, title: 'Ink', sub: 'The main currency', c: '#34C3FF', body: <>Buys plots and almost everything else. You earn it from minigames, PvP, the daily streak and wheel, creatures, farms, arcades, space and dozens of other places. It can’t be bought with money.</> },
            { key: 'usd', art: <CurrencyIcon kind="usd" size={34} />, title: 'USD rent', sub: 'What your land earns', c: '#3DDC97', body: <>Ticks up every second for every plot you own. Turn any amount into Ink (from $0.01) at <B>$1 = {fmtN(c.n('rent.convert.ink_per_usd', 100))} Ink</B>{c.native ? '.' : <>, or keep it for cash-out once that opens in your country (minimum ${fmtN(c.n('rent.cashout.minimum_usd', 5))}).</>}</> },
            { key: 'pig', art: <ResourceIcon r="pigments" className="h-8 w-8" />, title: 'Pigments', sub: 'For artists', c: '#FF4FD8', body: 'Unlock brushes, palettes and finishes in the Studio. Earned by publishing art, the wheel and events.' },
            { key: 'bp', art: <ResourceIcon r="brush_points" className="h-8 w-8" />, title: 'XP (Brush Points)', sub: 'Your level', c: '#FFC93D', body: 'Creative experience. It raises your player level, shown next to your avatar.' },
            { key: 'gt', art: <ResourceIcon r="gallery_tokens" className="h-8 w-8" />, title: 'Gallery Tokens', sub: 'Proof of good art', c: '#3DDC97', body: 'Earned through approved art and achievements.' },
            { key: 'tix', art: <span>🎟️</span>, title: 'Tickets', sub: 'Arcade prizes', c: '#FF3D9A', body: 'Won on arcade cabinets. Spend them at the prize counter on prizes and explorer gear.' },
            { key: 'luck', art: <span>🍀</span>, title: 'Luck', sub: '0 – 100', c: '#3DDC97', body: `Charged at the Altar of Luck. Every ${fmtN(c.n('luck.points_per_roll', 20))} Luck is a reroll on your next claim, and it makes ultras likelier.` },
            { key: 'eluck', art: <span>✨</span>, title: 'Enchanted Luck', sub: 'Enchantment odds', c: '#B26BFF', body: 'Bought with Ink at the Altar. Each charge raises the chance your next roll comes out Enchanted.' },
            { key: 'tickets', art: <span>🎫</span>, title: 'Roll tickets', sub: 'Guaranteed rolls', c: '#FFE14D', body: 'A free plot roll that’s guaranteed a minimum rarity (Rare+, Epic+, Legendary+, Mythic+). From streaks, enchantments, the Leviathan and more.' },
          ]} />
          <Note>Many places also have their own resources (crops, ore, space materials, a realm’s currency, Heat and metal in the Crucible…). They’re explained in their own chapters, and they always end up paying Ink.</Note>
        </>
      ),
    },
    {
      id: 'screen', emoji: '📱', title: 'Finding your way around',
      summary: 'The HUD up top, a row of buttons under it, the World button, the Worlds button and the tabs. Here is every part, numbered.',
      keys: 'hud screen tabs tab bar menu navigation where buttons interface layout hub play tab worlds button go anywhere tuck',
      body: () => (
        <>
          <div className="grid items-start gap-4 sm:grid-cols-[300px_1fr]">
            <Figure caption="The map screen in the app. The website has the same things: on a phone, a row of round buttons under the HUD (Hot Zone, Luck, Grimoire, streak, daily spin, View) and a + button that holds the rest, ✈️ Fly included; on a computer, chips for the Hot Zone, ✈️ Fly and Luck.">
              <PhoneTour />
            </Figure>
            <ol className="hb-legend">
              {[
                <><B>You.</B> Your avatar and level. Tap for your profile.</>,
                <><B>Live rent.</B> Your USD rent, ticking up every second.</>,
                <><B>Ink</B> (your balance) and <B>⚡ Boost</B> right beside it.</>,
                <><B>Alerts.</B> Who visited, who peeled your Parasite off, invites and more.</>,
                <><B>The row:</B> 🔥 today’s Hot Zone, 🍀 the Altar of Luck, 📖 your Grimoire, 🐉 the Leviathan (when it’s out) and 👁️ View (map looks and layers, and this Handbook at the top).</>,
                <><B>Your explorer</B> and the dashed square: every free plot inside it can be claimed. Tap one to claim it.</>,
                <><B>The World button.</B> Tap it to find yourself on the map. <B>Hold it</B> and the map’s actions fan out: ✈️ Fly, 🕹️ joystick, 🎡 your free spin, 📍 find me, 🚀 your rocket, plus your plots, trains & planes, your party, merging, GPS and 3D.</>,
                <><B>Tabs.</B> <B>Play</B> is the game’s main menu (the hub): today’s rewards and every part of the game. Pick your own tabs in Settings → Phone navigation.</>,
                <><B>🌍 Worlds</B> floats on the edge of every screen: one tap to the Earth map, Home, every place your plots have become (arcades, farms, sanctuaries, businesses, realms, estates), your rocket and the Inkborn. Drag it up, down or to the other side; drag it into the edge to tuck it into a little tab. In games it tucks itself away.</>,
              ].map((x, i) => <li key={i}><span className="n">{i + 1}</span><span>{x}</span></li>)}
            </ol>
          </div>
          <Tip>Lost? The Play tab’s <B>Everything</B> grid lists every page in the game, so nothing is more than two taps away.</Tip>
        </>
      ),
    },
    {
      id: 'simple', emoji: '🧸', title: 'Simple mode',
      summary: 'All of LANDVAS on one screen: buy a plot, watch it roll, play minigames. No map needed.',
      keys: 'simple mode easy no map no location lite light without gps',
      body: () => (
        <>
          <P>Some players just want the core: roll plots and watch rent climb. <B>Simple mode</B> is exactly that. Big Buy button, the roll, your rent, and the minigames. The map isn’t even downloaded, so it’s light on older phones.</P>
          <Bullets items={[
            <>When you buy, the game picks a free plot for you: near your explorer if you have one, otherwise next to your own land, otherwise in one of the world’s big cities. Its rarity is wherever it lands.</>,
            <>New plots are <B>Base plots</B>: they earn rent and need nothing. You can give any of them a type later, free.</>,
            <>Your Luck, your Grimoire and your daily rewards all work the same.</>,
            <>Turn it on or off any time in <B>Settings</B>. Nothing is lost either way.</>,
          ]} />
          <Pro>Simple mode is great for rolling fast, but you can’t pick <i>which</i> spot you claim. The full map lets you choose spots, claim next to your land to merge it, and fly to the Hot Zone. Play both.</Pro>
          <GoRow links={[['/settings', 'Settings']]} />
        </>
      ),
    },
    {
      id: 'day', emoji: '🕕', title: 'The game day (when things reset)',
      summary: 'Daily limits, the streak, the wheel, your free boosts and the Hot Zone all roll over once a day, in the evening.',
      keys: 'reset daily reset time when does it reset midnight day evening 6pm mountain',
      body: (c) => (
        <>
          <div className="grid items-center gap-3 sm:grid-cols-[150px_1fr]">
            <ResetClock label={c.resetLocal} />
            <P>LANDVAS’s day ends at <B c="#FFC93D">{c.resetLocal}</B> your time (that’s 6:00 PM Mountain Time). At that moment:</P>
          </div>
          <Bullets items={[
            'your free rent boosts come back',
            'the daily streak and the free wheel spin are ready again',
            'every minigame’s paid wins start over, and so do PvP’s paid matches and every other daily limit',
            'your trips (flights and trains) refill',
            'a new city becomes the Hot Zone',
          ]} />
          <Pro title="Use the reset">Play right before the reset to use up today’s limits, then again right after it to start tomorrow’s. One evening session covers two days of caps.</Pro>
        </>
      ),
    },
    {
      id: 'fair', emoji: '🛡️', title: 'Fair play',
      summary: 'Every result is checked on the server. Skill and smart play are the only ways up.',
      keys: 'cheat bots exploit fair play ban rules multiple accounts hack',
      body: () => (
        <>
          <P>Every minigame is replayed and checked on the server, and so is every claim and every payout. That’s what keeps your rare plots and your rent meaningful.</P>
          <Bullets items={[
            'One account per person. Extra accounts, bots and automation get caught and removed.',
            'If a bug ever pays out more than it should, it gets fixed, and what it paid can be taken back. Report bugs instead of using them.',
            'You can block and report any player from their profile or a chat.',
          ]} />
          <Warn>Anything you earn by exploiting a bug isn’t yours to keep. The players who grind honestly are the ones LANDVAS protects.</Warn>
          <Callout kind="note" title="Rent is a game reward">It isn’t an investment or a wage. Rates, boosts and limits can change, and what you earn depends on how you play.</Callout>
        </>
      ),
    },
  ],
};
