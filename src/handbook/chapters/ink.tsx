import { GamePreview } from '../../play/GamePreview';
import { PvpPreview } from '../../pvp/PvpPreview';
import { GAME_INFO, type GameId } from '../../shared/minigames';
import { PVP_GAMES, PVP_INFO } from '../../shared/pvp';
import type { Chapter } from '../types';
import { fmtN, type Ctx } from '../live';
import { B, Bullets, Combo, Facts, Figure, Formula, GoRow, H, Note, P, Pro, Steps, Table, Tip, Warn } from '../ui';
import { LevelTrack, StreakWeek, WheelPie } from '../visuals';

const GAME_ORDER: GameId[] = ['tracecraft', 'colorburst', 'paintpop', 'lightlines', 'memorymural', 'sculptor', 'rollermural', 'mirrorline'];
const STYLE: Record<GameId, string> = { tracecraft: 'Graphite', colorburst: 'Pigment', paintpop: 'Mosaic', lightlines: 'Lumina', memorymural: 'Fresco', sculptor: 'Clay', rollermural: 'Prism', mirrorline: 'Glass' };

/** the level-complete Ink of a level, averaged over the games */
export function levelInk(c: Ctx, level: number) {
  const games = Object.values(c.v<Record<string, any>>('minigames.games', {})).filter((g: any) => g?.enabled !== false) as any[];
  const fallback = [6, 6, 7, 7, 8, 8, 8, 9, 9, 10, 10, 10, 11, 11, 12, 12, 12, 13, 13, 14, 14, 14, 15, 15, 16, 16, 16, 17, 17, 18, 18, 18, 19, 19, 20, 20, 20, 21, 21, 22, 22, 22, 23, 23, 24, 24, 24, 25, 25, 26, 26, 26, 27, 27, 28, 28, 28, 29, 29, 30];
  const tables = games.length ? games.map((g) => ({ t: ((g.level_ink ?? []) as unknown[]).map(Number), m: Number(g.ink_multiplier ?? 1) })) : [{ t: fallback, m: 1 }];
  const per = tables.map(({ t, m }) => (t.length ? (t[Math.min(level, t.length) - 1] ?? 0) * m : 0));
  return (per.reduce((s, x) => s + x, 0) / Math.max(1, per.length)) * c.n('minigames.ink_multiplier', 1);
}
export const gamesOn = (c: Ctx) => {
  const g = c.v<Record<string, any>>('minigames.games', {});
  const n = Object.values(g).filter((x: any) => x?.enabled !== false).length;
  return n || 8;
};
export const paidPerGame = (c: Ctx) => (c.v<boolean>('minigames.limit_paid_runs', true) === false ? Infinity : c.n('minigames.daily_rewarded_wins_per_game', 6));
export const maxLevel = (c: Ctx) => c.n('minigames.max_level', 60);

export const ink: Chapter = {
  id: 'ink',
  emoji: '🎮',
  title: 'Ink & minigames',
  blurb: 'The eight plot minigames, levels and paid wins, exactly what a win pays, PvP, the streak, the wheel and every Ink source.',
  color: '#3DDC97',
  topics: [
    {
      id: 'what', emoji: '💧', title: 'What Ink is for',
      summary: 'Ink buys your land and nearly everything on it. It can only be earned by playing.',
      keys: 'ink spend what can i buy uses',
      body: (c) => (
        <>
          <P>Ink is LANDVAS’s currency. It can’t be bought with money, so everyone earns it the same way: by playing. You spend it on:</P>
          <Bullets items={[
            <><B>Plots</B>, {fmtN(c.n('economy.acquire.base_ink', 100))} Ink each, and merging them ({fmtN(c.n('earn.merge.ink_per_plot', 15))} a plot).</>,
            <><B>Luck</B> at the Altar ({fmtN(c.n('luck.ink_per_point', 50))} Ink a point) and <B>Enchanted Luck</B>.</>,
            'Vehicles, joystick refills, extra trips, rocket parts and planet plots.',
            'Seeds, farm buildings, arcade cabinets, realm upgrades, Inkborn, splice charges, and much more.',
          ]} />
          <Tip>Rarer plots and bigger places pay more Ink, so Ink spent on land keeps paying you back.</Tip>
        </>
      ),
    },
    {
      id: 'games', emoji: '🎮', title: 'The eight plot minigames',
      summary: 'Each plot style has its own game. Here’s how every one plays.',
      keys: 'minigames tracecraft colorburst paint pop lightlines memory mural sculptor roller mural mirrorline how to play',
      body: () => (
        <>
          {GAME_ORDER.map((g) => (
            <div key={g} className="hb-game">
              <GamePreview game={g} size={104} className="mx-auto" />
              <div>
                <H>{GAME_INFO[g].name} <span className="text-[12px] font-bold text-muted">· {STYLE[g]} plots</span></H>
                <p className="mb-1 text-[13px] font-semibold text-accent-2">{GAME_INFO[g].tagline}</p>
                <Bullets items={GAME_INFO[g].howTo} />
              </div>
            </div>
          ))}
        </>
      ),
    },
    {
      id: 'levels', emoji: '📈', title: 'Levels, rounds and stars',
      summary: 'Every plot climbs its own levels. Clear every round of a level to win its Ink.',
      keys: 'levels rounds stars level up next level how many levels 60 beat clear',
      body: (c) => (
        <>
          <Figure caption="One plot’s levels and what each pays to complete (live, before its rarity bonus). This plot has beaten 11; level 12 is next.">
            <LevelTrack ink={Array.from({ length: maxLevel(c) }, (_, i) => Math.round(levelInk(c, i + 1)))} at={12} />
          </Figure>
          <Bullets items={[
            <>Every plot has its <B>own</B> {fmtN(maxLevel(c))} levels of its game. A new plot starts at level 1, even if your other plots are far ahead.</>,
            <>A level is several <B>rounds</B> (most games 5, Paint Pop 3). Clear <B>every round</B> to complete the level and win its Ink; fail a round and the level isn’t won.</>,
            <>Each plot always plays its <B>next</B> level. A beaten level can’t be replayed.</>,
            'Later levels get harder (tighter tolerances, bigger boards, trickier patterns) and pay more.',
            'Stars (up to 3) show how well you did. Three stars also pay Pigments and extra XP.',
            'Every result is replayed on the server, so only real play counts.',
          ]} />
          <Note>After level {fmtN(maxLevel(c))} a plot’s game is complete. That plot has paid out everything its game can pay.</Note>
        </>
      ),
    },
    {
      id: 'pay', emoji: '💧', title: 'Exactly what a win pays',
      summary: 'The level’s Ink × the plot’s rarity bonus, for a set number of paid wins per game each day.',
      keys: 'ink per win how much ink payout formula rarity bonus daily cap paid wins practice limit',
      body: (c) => {
        const levels = [1, 20, 40, maxLevel(c)].filter((l, i, a) => l <= maxLevel(c) && a.indexOf(l) === i);
        const rows = c.everyday;
        const per = paidPerGame(c), n = gamesOn(c);
        let total = 0;
        for (let l = 1; l <= maxLevel(c); l++) total += levelInk(c, l);
        return (
          <>
            <Formula>Ink for a win = <em>the level’s Ink</em> × <em>the plot’s rarity bonus</em> × any bonuses running (Golden Hour, enchantments, ultras…)</Formula>
            <Table head={['Rarity', ...levels.map((l) => `Lv ${l}`)]} rows={rows.map((r) => [
              <b key="n" style={{ color: r.color }}>{r.name} <span className="text-[10.5px] text-muted">×{r.ink.toFixed(2)}</span></b>,
              ...levels.map((l) => fmtN(Math.floor(levelInk(c, l) * r.ink))),
            ])} note="Ink for completing that level (live, averaged over the eight games)." dense />
            <Facts cols={4} items={[
              { k: 'Paid wins per game', v: Number.isFinite(per) ? `${per} a day` : 'no limit', hint: 'per minigame, not per plot' },
              { k: 'Paid wins a day', v: Number.isFinite(per) ? fmtN(per * n) : '∞', hint: `if you own all ${n} styles` },
              { k: 'Ink in one plot’s game', v: `≈ ${fmtN(total)}`, hint: 'levels 1–60 on a Common, × its rarity bonus' },
              { k: 'Plot price', v: `${fmtN(c.n('economy.acquire.base_ink', 100))}`, hint: `a plot’s game pays it back ≈ ${fmtN(total / c.n('economy.acquire.base_ink', 100))}×` },
            ]} />
            {Number.isFinite(per) && <>
              <P>Each <B>minigame</B> (TraceCraft, ColorBurst…) pays for {per} wins a day across all your plots of that style. After that the game says <B>Practice</B>: you can keep playing, but those wins pay nothing until the reset at {c.resetLocal}.</P>
              <Warn title="Practice still moves you up">A practice win still beats the level, and beaten levels can’t be replayed. That level’s Ink is gone for that plot.</Warn>
              <Pro title="Turn that into an edge">Because paid wins are limited per game, what matters is how much each paid win pays. Put your paid wins on your <B>rarest, highest-level</B> plot of each style. A level-{fmtN(maxLevel(c))} win pays about {fmtN(levelInk(c, maxLevel(c)) / Math.max(1, levelInk(c, 1)), 1)}× a level-1 win, so some players spend practice wins pushing their best plot up the levels and keep their paid wins for the top.</Pro>
            </>}
          </>
        );
      },
    },
    {
      id: 'mult', emoji: '✖️', title: 'Everything that boosts minigame Ink',
      summary: 'Golden Hours, giant plots, roots, bees, creases, inlays and more. They stack.',
      keys: 'golden hour multiplier double ink boost minigame bonus size ray world tree hive crease inlay lantern pocket sun orbit wormhole giant linked charged',
      body: () => (
        <>
          <Table head={['Bonus', 'Effect', 'From']} rows={[
            ['💎 Rarity bonus', '×1.07 (Uncommon) up to ×8 (Singularity)', 'the plot’s rarity'],
            ['⭐ Golden Hour', 'your next 3 wins pay ×2', 'Genie wishes, Fated Deck, Heart of the World, Fallen Star'],
            ['📡 Giant plot', '×1.5–2 while your plot is giant', 'Size Ray (your own plot), the Giant Trait'],
            ['🌀 Wormhole', '+30% at both ends', 'Wormhole'],
            ['🦢 Crease', '×1.25 for 24 h after unfolding', 'Origami Pocket'],
            ['🔩 Inlay', '+3–15%', 'Crucible metal'],
            ['🏮 Lantern', 'more from that plot’s games', 'Crucible artifact'],
            ['🪨 Lodestone (artifact)', '+4% a level on your plots in the 3×3 around it', 'Crucible artifact'],
            ['☀️ Orbit', '×1.25 on the plots under it', 'Pocket Sun parked in orbit'],
            ['⚡ Arcs · 🌀 Linked', '×1.25 for an hour · ×1.2+ on a second plot', 'Charged and Linked Traits'],
            ['🌳 Roots · 🐝 Pollen', '×1.1', 'World Tree · Hive ultras'],
            ['📜 Decree', '×1.15 nearby', 'Throne of Ink (Primordial)'],
          ]} dense />
          <Warn title="Things that lower it">A trampled plot pays −40% until scrubbed (the Leviathan), a scorched one −20% for an hour (Storm Coil), a tiny one ×0.7 (Size Ray), and Pandora’s Strife curse halves your next win.</Warn>
          <Combo>Save a Golden Hour for your Mythic or ultra plots at high levels. ×2 on a ×2.25 plot at level 50 is one of the best single wins in the game.</Combo>
        </>
      ),
    },
    {
      id: 'pvp', emoji: '⚔️', title: 'PvP minigames',
      summary: 'Free head-to-head matches on identical boards against an anonymous rival. The winner gets the Ink.',
      keys: 'pvp versus duel rival match head to head turf wars palette clash forgery copy cat pixel recall',
      body: (c) => {
        const games = c.v<Record<string, any>>('pvp.games', {});
        return (
          <>
            <P>Pick a PvP game and play your board. Your rival plays the <B>very same board</B>, and the better result wins. If someone is already waiting, you get an instant result; otherwise the match stays open for {fmtN(c.n('pvp.open_hours', 48))} hours. Nobody stakes anything: the winner is paid.</P>
            <div className="grid gap-3 sm:grid-cols-2">
              {PVP_GAMES.map((g) => (
                <div key={g} className="grid grid-cols-[84px_1fr] items-start gap-3">
                  <PvpPreview game={g} className="w-[84px]" />
                  <div>
                    <H>{PVP_INFO[g].name}</H>
                    <p className="text-[12.5px] font-semibold" style={{ color: PVP_INFO[g].color }}>{PVP_INFO[g].tagline} · {fmtN(Number(games?.[g]?.win_ink ?? 10))} Ink a win</p>
                    <Bullets items={PVP_INFO[g].howTo} />
                  </div>
                </div>
              ))}
            </div>
            <Facts cols={4} items={[
              { k: 'Rounds', v: `${fmtN(c.n('pvp.games.turfwars.rounds', 3))} × ${fmtN(c.n('pvp.round_seconds', 90))} s` },
              { k: 'A draw pays', v: `${fmtN(c.n('pvp.games.turfwars.draw_ink', 3))} Ink` },
              { k: 'Paid matches', v: `${fmtN(c.n('pvp.daily_rewarded_matches', 10))} a day` },
              { k: 'Same rival again', v: `after ${fmtN(c.n('pvp.rematch_cooldown_hours', 24))} h` },
            ]} />
            <Note>Your account needs to be {fmtN(c.n('pvp.min_account_hours', 24))} hours old for paid PvP, and a match must be played properly (at least {fmtN(c.n('pvp.min_quality_pct', 50))}% effort) to pay.</Note>
            <GoRow links={[['/pvp', 'Play PvP']]} />
          </>
        );
      },
    },
    {
      id: 'streak', emoji: '🔥', title: 'The daily streak',
      summary: 'Check in every day for growing Ink, a guaranteed Rare-or-better roll every 7th day, and a big prize on day 30.',
      keys: 'daily streak check in login reward day 7 day 30 ticket calendar',
      body: (c) => {
        const ink = c.v<number[]>('daily_streak.ink', [20, 30, 40, 50, 60, 80, 120]).map(Number);
        const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
        return (
          <>
            <Figure caption="One week of the streak. It keeps going: every 7th day brings another guaranteed roll, every 30th the big one.">
              <StreakWeek ink={ink} ticket={cap(c.v('daily_streak.week_ticket', 'rare'))} day30Ink={c.n('daily_streak.day30_ink', 500)} day30Ticket={cap(c.v('daily_streak.day30_ticket', 'legendary'))} />
            </Figure>
            <Facts items={[
              { k: 'A week of check-ins', v: `${fmtN(ink.reduce((s, x) => s + x, 0))} Ink`, c: '#34C3FF' },
              { k: 'Every 7th day', v: `${cap(c.v('daily_streak.week_ticket', 'rare'))}+ roll`, hint: 'a free plot, guaranteed at least that' },
              { k: 'Every 30th day', v: `+${fmtN(c.n('daily_streak.day30_ink', 500))} Ink`, hint: `and a ${cap(c.v('daily_streak.day30_ticket', 'legendary'))}+ roll` },
            ]} />
            <Steps items={['Open the Play tab once a day (it pops up by itself).', 'Tap Claim. Ink lands right away, and tickets wait in the streak card until you use them.', 'Use a roll ticket from the card: it rolls a free plot with at least that rarity.']} />
            <Warn>Miss a day and the streak starts over. That also resets a Phoenix plot’s growth to nothing.</Warn>
            <Tip>In the app, turn on <B>Settings → Streak reminders</B> and your phone reminds you once a day when your reward is waiting.</Tip>
          </>
        );
      },
    },
    {
      id: 'wheel', emoji: '🎡', title: 'The daily wheel',
      summary: 'One free spin a day: Ink, Pigments, a rent boost, a joystick refill, XP, or the jackpot.',
      keys: 'wheel spin daily free spin jackpot prize',
      body: (c) => {
        const slices = c.v<any[]>('earn.wheel.slices', [
          { label: '5 Ink', color: '#34C3FF', weight: 30 }, { label: '10 Ink', color: '#7B5CFF', weight: 20 }, { label: '10 Pigments', color: '#FF4FD8', weight: 15 },
          { label: 'Rent boost 30 min', color: '#FFB23F', weight: 12 }, { label: '25 Ink', color: '#3DDC97', weight: 8 }, { label: 'Joystick refill', color: '#22E3FF', weight: 8 },
          { label: '50 XP', color: '#FFE14D', weight: 6 }, { label: 'Jackpot 100 Ink', color: '#FF4D6D', weight: 1 },
        ]).map((s) => ({ label: String(s.label), color: String(s.color), weight: Number(s.weight) }));
        return (
          <>
            <Figure caption={`${fmtN(c.n('earn.wheel.spins_per_day', 1))} free spin a day, from the Play tab (or the map: hold the World button in the app).`}>
              <WheelPie slices={slices} />
            </Figure>
          </>
        );
      },
    },
    {
      id: 'sources', emoji: '🧾', title: 'Every way to earn Ink',
      summary: 'All the Ink sources in one list, with what each pays and its daily limit.',
      keys: 'earn ink sources list all ways farm business arcade inkborn space art referral rooms challenges sketch doodle duet stamps',
      body: (c) => {
        const per = paidPerGame(c);
        const arcadeMax = Math.max(0, ...Object.values(c.v<Record<string, any>>('arcade.games', {})).map((x: any) => Number(x?.max_ink ?? 0)));
        const sk = c.v<number[]>('creative.sketch.prizes', [100, 80, 65, 50, 40, 30, 25, 20, 15, 10]);
        return (
          <>
            <Table head={['Source', 'Pays', 'Limit']} rows={[
              ['🎮 Plot minigames', 'the level’s Ink × rarity', Number.isFinite(per) ? `${per} paid wins per game a day` : 'none'],
              ['⚔️ PvP', `${fmtN(c.n('pvp.games.copycat.win_ink', 12))} or ${fmtN(c.n('pvp.games.turfwars.win_ink', 10))} a win`, `${fmtN(c.n('pvp.daily_rewarded_matches', 10))} matches a day`],
              ['🔥 Daily streak', `${c.v<number[]>('daily_streak.ink', [20]).join(' → ')}`, 'once a day'],
              ['🎡 Daily wheel', 'up to 100 (jackpot)', 'once a day'],
              ['🐾 Inkborn', 'games, jobs, the Ink Spring', `${fmtN(c.n('inkborn.daily_cap', 150))} a day`],
              ['🚀 Space & planets', 'games, meteors, digging, quests', `${fmtN(c.n('space.daily_cap', 150))} from space, ${fmtN(c.n('planets.daily_cap_total', 300))} on planets`],
              ['🕹️ Arcade cabinets', `up to ${fmtN(arcadeMax || 10)} a play, ×${fmtN(c.n('arcade.hot.ink', 1.5), 1)} in the Hot Zone`, c.v('arcade.daily_cap', null) == null ? 'no daily cap' : `${fmtN(c.n('arcade.daily_cap', 0))} a day`],
              ['🌾 Farms', 'selling crops, orders, chores, farm games', `${fmtN(c.n('farm.daily_cap', 120))} a day from games and chores`],
              ['🍋 Businesses', 'games, milestones, IPO, dividends', `${fmtN(c.n('business.daily_cap', 120))} a day`],
              ['⛏️ Realms & Estates', 'games, levels, rare finds', `${fmtN(c.n('realms.daily_cap', 120))} a day`],
              ['🏠 House party games', `${c.v<number[]>('home.games.place_ink', [10, 6, 4]).slice(0, 3).join(' / ')}… for 1st / 2nd / 3rd`, 'per game (half with bots at the table)'],
              ['🖍️ Sketch of the Day', `${sk.slice(0, 3).join(' / ')}… for the top 10`, 'one sketch a day'],
              ['💡 Draw & Guess', `${fmtN(c.n('creative.doodle.guesser_ink', 8))} a right guess, ${fmtN(c.n('creative.doodle.drawer_ink', 4))} per guesser to the artist`, `${fmtN(c.n('creative.doodle.daily_paid_guesses', 15))} guesses a day`],
              ['🎭 Duets', `${fmtN(c.n('creative.duet.complete_ink', 8))} each`, `${fmtN(c.n('creative.duet.daily_paid', 5))} a day`],
              ['🎫 Stamps of your art', `${fmtN(c.n('creative.stamps.artist_pct', 80))}% of every ${fmtN(c.n('creative.stamps.price_ink', 10))}-Ink stamp`, `${fmtN(c.n('creative.stamps.artist_daily_cap', 500))} a day`],
              ['🖌️ Craft bonus', '5–25 Ink a published canvas, more for bigger murals',`${fmtN(c.n('earn.craft.daily_cap', 100))} a day`],
              ['⭐ Featured art', `${fmtN(c.n('earn.featured.ink', 25))}`, 'when your art is picked'],
              ['✨ Inspire', `${fmtN(c.n('earn.inspire.artist_ink', 2))} to the artist, ${fmtN(c.n('earn.inspire.giver_ink', 1))} to you`, `${fmtN(c.n('earn.inspire.giver_daily', 5))} a day`],
              ['🚪 Room check-ins', `${fmtN(c.n('earn.rooms.visitor_ink', 2))} each (host gets ${fmtN(c.n('earn.rooms.host_ink', 2))})`, `${fmtN(c.n('earn.rooms.visitor_daily', 5))} visits / ${fmtN(c.n('earn.rooms.host_daily', 10))} hosted a day`],
              ['💌 Invites', `${fmtN(c.n('referrals.reward_ink', 500))} + ${fmtN(c.n('referrals.share.pct', 10))}% of their Ink`, `up to ${fmtN(c.n('referrals.share.cap_ink', 1000))} share per friend`],
              ['🛡️ Clans', 'weekly goals, battles, the season', 'per goal and battle'],
              ['🔮 Enchantments', 'each one pays its own way', 'see the Enchantments chapter'],
              ['🐉 The Leviathan', 'by your share of the damage', `up to ${fmtN(1500)} each time`],
              ['💵 Rent → Ink', `$1 = ${fmtN(c.n('rent.convert.ink_per_usd', 100))} Ink`, 'any time'],
            ]} dense note="Numbers are the game’s live settings. Each chapter explains its own source in detail." />
            <GoRow links={[['/play', 'Play & Earn: today’s tasks'], ['/guide', 'Live rates & what players really earn']]} />
          </>
        );
      },
    },
  ],
};
