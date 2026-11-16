import type { Chapter } from '../types';
import { fmtN } from '../live';
import { B, Bullets, CardGrid, Combo, Facts, Figure, GoRow, Note, P, Pro, Steps, Table, Tip, Warn } from '../ui';
import { Egg, Meter } from '../visuals';

const GAMES: { id: string; name: string; emoji: string; how: string }[] = [
  { id: 'berrydash', name: 'Berry Dash', emoji: '🫐', how: 'Lead your Inkborn round the meadow gobbling berries (red 1, purple 2, golden 5). Bump a bee and you drop 3.' },
  { id: 'fireflies', name: 'Firefly Catch', emoji: '✨', how: 'Tap a firefly and your Inkborn leaps for it. Every 3 in a row adds a bonus; leaping at empty air breaks the streak.' },
  { id: 'leafleap', name: 'Leaf Leap', emoji: '🍃', how: 'Bounce up the giant beanstalk, steering left and right. Mushrooms launch you high, twigs snap after one bounce.' },
  { id: 'lilyhop', name: 'Lily Hop', emoji: '🪷', how: 'Hop across drifting lily pads to the far bank (+10). Miss a pad and you swim back to the start.' },
  { id: 'stardust', name: 'Stardust Glide', emoji: '🌠', how: 'Hold to float up, let go to glide down, catching stardust. Storm clouds and sleepy owls knock points off.' },
  { id: 'crystals', name: 'Crystal Caves', emoji: '💎', how: 'Tap groups of matching crystals to break them. Bigger groups score far more; keep breaking for a combo.' },
  { id: 'songbloom', name: 'Song Bloom', emoji: '🌸', how: 'Your Inkborn sings a little tune on the flowers. Sing it back!' },
];

export const inkborn: Chapter = {
  id: 'inkborn',
  emoji: '🐾',
  title: 'Inkborn',
  blurb: 'Draw a creature and watch it come alive: care, games, jobs, the Ink Spring, playdates, eggs and keeper levels.',
  color: '#3DDC97',
  topics: [
    {
      id: 'create', emoji: '🎨', title: 'Create an Inkborn',
      summary: 'Draw any creature you can imagine. It comes alive, walks, plays and earns.',
      keys: 'create inkborn draw creature studio cost free first',
      body: (c) => (
        <>
          <Steps items={[
            'Open Inkborn → Create an Inkborn.',
            'Draw your creature: body, eyes, legs, whatever you like. The studio rigs your drawing so it can move.',
            'Name it and bring it to life. It moves into your starter sanctuary (or any habitat with room).',
          ]} />
          <Facts items={[
            { k: 'Your first', v: 'free', c: '#3DDC97' },
            { k: 'Each one after', v: `${fmtN(c.n('inkborn.create_ink', 100))} Ink` },
            { k: 'Most you can keep', v: fmtN(c.n('inkborn.max_creatures', 60)) },
          ]} />
          <GoRow links={[['/inkborn', 'My creatures'], ['/inkborn/create', 'Create one']]} />
        </>
      ),
    },
    {
      id: 'care', emoji: '💚', title: 'Care: happiness, bond and energy',
      summary: 'Pet, feed and play with your creatures. Happy creatures fill your Ink Spring; energy powers games and jobs.',
      keys: 'care pet feed play happiness bond energy treats',
      body: () => (
        <>
          <div className="grid gap-3">
            <Meter value={72} max={100} color="#FF7AB8" label="💗 Happiness: drifts down slowly (never below 35); care raises it" marks={[50]} />
            <Meter value={45} max={100} color="#FFE14D" label="⚡ Energy: used by games and jobs; refills by itself (+12 an hour)" />
          </div>
          <Bullets items={[
            <><B>Pet, feed and play</B> with them in their sanctuary. Bond grows with care (up to 40 a day per creature).</>,
            <><B>Happiness of 50+</B> keeps their Ink Spring flowing.</>,
            <><B>Energy</B> is spent on games (15 each) and jobs, and comes back on its own, so creatures can’t be farmed endlessly.</>,
            'Treats from the bakery make them happier, rested and wiser.',
            'Each creature has a daily wish (a bath, a game, a quest, a treat…). Grant it for keeper XP.',
          ]} />
        </>
      ),
    },
    {
      id: 'games', emoji: '🎮', title: 'Inkborn games',
      summary: 'Seven minigames where you play as your own creature. Each pays up to 25 Ink.',
      keys: 'inkborn games berry dash firefly catch leaf leap lily hop stardust glide crystal caves song bloom',
      body: (c) => (
        <>
          <CardGrid items={GAMES.map((g) => ({ key: g.id, art: <span>{g.emoji}</span>, title: g.name, sub: `up to ${fmtN(Number(c.v(`inkborn.games.${g.id}.max_ink`, 25)))} Ink · ${fmtN(Number(c.v(`inkborn.games.${g.id}.seconds`, 45)))} s`, c: '#3DDC97', body: g.how }))} />
          <Tip>Games also bring home materials (berries, crystals, stardust…) for the treat bakery.</Tip>
        </>
      ),
    },
    {
      id: 'jobs', emoji: '🧺', title: 'Jobs',
      summary: 'Send a creature out foraging, exploring or questing. It comes back with Ink and materials.',
      keys: 'jobs forage explore quest send away',
      body: (c) => {
        const jobs = c.v<Record<string, any>>('inkborn.jobs', { forage: { label: 'Forage for berries', ink: 6, minutes: 30, energy: 15 }, explore: { label: 'Explore the woods', ink: 18, minutes: 120, energy: 30 }, quest: { label: 'Go on a quest', ink: 45, minutes: 480, energy: 50 } });
        const list = Object.values(jobs).sort((a: any, b: any) => Number(a.minutes) - Number(b.minutes));
        return (
          <>
            <Table head={['Job', 'Takes', 'Energy', 'Ink']} rows={list.map((j: any) => [j.label, Number(j.minutes) >= 60 ? `${fmtN(Number(j.minutes) / 60, 1)} h` : `${fmtN(Number(j.minutes))} min`, fmtN(Number(j.energy)), fmtN(Number(j.ink))])} />
            <Pro>Match jobs to your day: short forages while you play, a quest before you sleep. Send every creature out; idle creatures earn nothing.</Pro>
            <P>Later, <B>expeditions</B> send a team of up to three to places like Sunny Meadow or Starfall Valley. Stronger, happier teams with the right personalities bring back treasures for your collection.</P>
          </>
        );
      },
    },
    {
      id: 'spring', emoji: '⛲', title: 'The Ink Spring',
      summary: 'Happy creatures fill a spring with Ink while you’re away. Collect it before it overflows.',
      keys: 'ink spring passive collect fill hours',
      body: (c) => (
        <>
          <Facts items={[
            { k: 'Each happy creature', v: `${fmtN(c.n('inkborn.spring.per_creature_hour', 2))} Ink / hour`, c: '#34C3FF' },
            { k: 'Each spring decoration', v: `+${fmtN(c.n('inkborn.spring.per_spring_hour', 1))} / hour`, hint: `up to ${fmtN(c.n('inkborn.spring.max_springs', 3))}` },
            { k: 'Fills for', v: `${fmtN(c.n('inkborn.spring.max_hours', 12))} hours`, hint: 'then it stops' },
          ]} />
          <Warn>A creature only fills the spring while its happiness is {fmtN(c.n('inkborn.spring.min_happiness', 50))} or more, and a full spring stops filling. Collect it at least every {fmtN(c.n('inkborn.spring.max_hours', 12))} hours.</Warn>
          <Note>Everything Inkborn pays (spring, jobs and games together) counts toward a daily limit of {fmtN(c.n('inkborn.daily_cap', 150))} Ink.</Note>
        </>
      ),
    },
    {
      id: 'playdates', emoji: '💞', title: 'Playdates & eggs',
      summary: 'Play with a friend’s Inkborn. A good playdate lays an egg that hatches into a brand-new creature.',
      keys: 'playdate eggs hatch breed friend mutation baby',
      body: (c) => (
        <>
          <div className="flex items-end justify-center gap-4 py-1" aria-hidden><Egg /><Egg a="#B8F5D0" b="#22C7B5" size={60} /><Egg a="#FFE7A8" b="#FF9F1C" size={54} /></div>
          <Steps items={[
            'Visit a friend’s sanctuary (or open one of yours) and start a playdate between two creatures.',
            `Play the playdate game together. Score ${fmtN(c.n('inkborn.playdates.egg_score', 45))}+ and an egg is laid.`,
            `The egg hatches in ${fmtN(c.n('inkborn.playdates.hatch_minutes', 60))} minutes into a new Inkborn that mixes its parents (with a ${fmtN(c.n('inkborn.playdates.mutation', 0.18) * 100)}% chance of a mutation). When two players’ creatures play, each player gets a different kind of egg.`,
          ]} />
          <Facts cols={4} items={[
            { k: 'Eggs a day', v: fmtN(c.n('inkborn.playdates.eggs_per_day', 3)) },
            { k: 'Host tip', v: `${fmtN(c.n('inkborn.playdates.host_tip', 4))} Ink` },
            { k: 'Same pair again', v: `${fmtN(c.n('inkborn.playdates.pair_cooldown_hours', 20))} h` },
            { k: 'Game Ink', v: `up to ${fmtN(c.n('inkborn.playdates.max_ink', 20))}` },
          ]} />
          <Combo>Eggs are useful well beyond hatching: crack one for a spare Splice charge (Enchantments), or offer it at the Altar for Luck.</Combo>
        </>
      ),
    },
    {
      id: 'keeper', emoji: '🏅', title: 'Keeper levels, Glimmer & upgrades',
      summary: 'Everything you do with your creatures levels you up as a keeper, and levels them up too.',
      keys: 'keeper level glimmer creature level xp upgrades bakery expeditions wishes',
      body: () => (
        <>
          <Bullets items={[
            <><B>Keeper level:</B> XP from caring, jobs, games, springs, hatching, wishes and expeditions. Each level-up pays <B>Glimmer ✨</B>, the sanctuary’s own currency (no daily cap).</>,
            <><B>Creature levels:</B> each Inkborn gets stronger as it works, plays and is cared for.</>,
            <><B>Materials</B> (berries, mushrooms, feathers, shells, crystals, stardust) come home from jobs, games and expeditions; the treat bakery turns them into treats.</>,
            <><B>Upgrades</B> bought with Glimmer: bigger satchels, lantern paths, training grounds, a deeper spring (fills faster), a wishing well and treasure maps.</>,
          ]} />
          <GoRow links={[['/inkborn/keeper', 'Keeper'], ['/inkborn/visit', 'Visit other sanctuaries'], ['/habitat', 'My sanctuary']]} />
        </>
      ),
    },
    {
      id: 'routine', emoji: '🗓️', title: 'An Inkborn routine',
      summary: 'Ten minutes a day keeps every creature earning.',
      keys: 'inkborn routine daily best way grind inkborn',
      body: (c) => (
        <>
          <Figure tone="plain" caption={`Everything Inkborn pays shares one ${fmtN(c.n('inkborn.daily_cap', 150))}-Ink daily limit, so the aim is to hit it with the least effort.`}>
            <Steps items={[
              'Collect the Ink Spring.',
              'Pet and feed anyone under 50 happiness, and grant today’s wishes.',
              'Play a couple of Inkborn games with your most-rested creature.',
              'Send everyone else on jobs (long quests last thing at night).',
              'One playdate a day with a friend for an egg.',
            ]} />
          </Figure>
        </>
      ),
    },
  ],
};
