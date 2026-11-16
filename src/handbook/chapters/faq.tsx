import type { ReactNode } from 'react';
import type { Chapter } from '../types';
import { fmtN, type Ctx } from '../live';
import { GoRow } from '../ui';

type QA = { q: string; a: (c: Ctx) => ReactNode; web?: boolean };
const FAQ: QA[] = [
  { q: 'Is LANDVAS free?', a: () => 'Yes. Everything in the game is earned by playing. Ink can’t be bought with money.' },
  { q: 'Do I have to go outside to play?', a: () => 'No. Claims happen near your explorer, but you can use the joystick and vehicles to roam near you, fly or ride a train anywhere, or play Simple mode, which needs no location at all.' },
  { q: 'Can someone take my plot?', a: () => 'No. Plots are yours until you trade them in yourself (the Altar, the Crucible, the Fusion Lab). The Leviathan can trample a plot (its minigames pay less until you scrub it), but it stays yours.' },
  { q: 'Why did my minigame say “Practice”?', a: (c) => `Each minigame pays for ${fmtN(c.n('minigames.daily_rewarded_wins_per_game', 6))} wins a day across all your plots of that style. After that, wins pay nothing until the reset at ${c.resetLocal}. Practice wins still move the plot up a level.` },
  { q: 'Can I replay a level I already beat?', a: () => 'No. Each plot always plays its next level. A plot that has beaten every level has paid out its whole game.' },
  { q: 'Why is my rent so small per second?', a: () => 'Rent is paid in tiny amounts every second, around the clock. It adds up over days and weeks, more with the ×20 boost, rarer plots, ultras, Crowns and rent day.' },
  { q: 'When do daily things reset?', a: (c) => `At ${c.resetLocal} your time (6:00 PM Mountain Time): boosts, the streak, the wheel, paid wins, PvP, trips and the Hot Zone.` },
  { q: 'Does closing the app during a roll change it?', a: () => 'No. The server decides the roll the moment you claim. The animation just shows you.' },
  { q: 'What happens to my enchantment if I lose the plot?', a: () => 'It sleeps on that land and wakes for whoever claims it next. If the plot’s rarity is changed, it ends.' },
  { q: 'Can I see what a plot will roll before claiming it?', a: () => 'Not normally: a spot’s rarity is a secret until it’s claimed. A Spyglass enchantment, a Phantom’s whispers and a World’s Eye can show you, privately.' },
  { q: 'What’s the difference between a plot’s style and its type?', a: () => 'The style (Graphite, Pigment…) belongs to the spot and decides its minigame. The type (Art, Farm, Arcade…) is what you choose to build there, and you can change it.' },
  { q: 'Do I keep progress if I switch a plot’s type?', a: () => 'Yes. Switch back and everything is still there, including Estates and Domains.' },
  { q: 'Is cash-out open?', a: (c) => `Not yet. When it opens in your country, rent can be paid out from a minimum of $${fmtN(c.n('rent.cashout.minimum_usd', 5))}. Until then you can turn rent into Ink any time.`, web: true },
  { q: 'I found a bug. What should I do?', a: () => 'Report it from the Help page. Using a bug for rewards gets them taken back; reporting it helps everyone.' },
];

const GLOSSARY: [string, string][] = [
  ['Aberration', 'A secret hybrid at triple strength, made by a lucky splice.'],
  ['Altar of Luck', 'Where you sacrifice plots, Inkborn, eggs or Ink for Luck.'],
  ['Base plot', 'A plot with no type: it just earns rent. The default.'],
  ['Boost', '×20 rent for 30 minutes; free boosts come back daily.'],
  ['Crown', 'One per city, state and country; its holder takes a 1% share of the kingdom’s Ink or rent.'],
  ['Domain', 'The 3×3 tier of a plot type: its grandest form.'],
  ['Enchanted', 'A roll that brings an enchantment instead of a rarity.'],
  ['Essence', 'What a different-kind enchantment becomes when poured in; 3 make a Star copy.'],
  ['Estate', 'The 2×2 tier of a plot type.'],
  ['Explorer', 'You on the map. You claim plots around it.'],
  ['Fusion', 'A rarity made in the Fusion Lab from two ultras.'],
  ['Golden Hour', 'Your next 3 minigame wins pay ×2.'],
  ['Grimoire', 'Your enchantment spellbook.'],
  ['Hot Zone', 'The day’s boosted city: best-of-two rolls, ultras ×5, Shiny ×2.'],
  ['Ink', 'The game’s currency, earned by playing.'],
  ['Inkborn', 'A creature you draw that comes alive.'],
  ['Leviathan', 'The weekly world boss.'],
  ['Luck', '0–100; every 20 is a reroll on your next claim.'],
  ['Perfect Match', 'A hybrid of two kinds made for each other: Traits at double strength.'],
  ['Practice', 'A minigame run after today’s paid wins: no Ink.'],
  ['Primordial', 'The rarest tier, rarer than any ultra, each with a world-changing power. Only ever rolled.'],
  ['Rent', 'USD your plots earn every second.'],
  ['Shiny', 'A 1-in-1,000 version of any roll with ×5 rent.'],
  ['Splice', 'An enchantment that fuses others into hybrids.'],
  ['Star', 'A level-up for an enchantment from a copy of itself.'],
  ['Style', 'A spot’s art material; it decides its minigame.'],
  ['Ticket (roll)', 'A free roll with a guaranteed minimum rarity.'],
  ['Trait', 'What an enchantment lends its partner when spliced.'],
  ['Ultra', 'A super-rare rarity with its own ability.'],
];

export const faq: Chapter = {
  id: 'faq',
  emoji: '❓',
  title: 'FAQ & glossary',
  blurb: 'Quick answers to the questions players ask most, and every LANDVAS word explained.',
  color: '#A1ABD6',
  topics: [
    {
      id: 'faq', emoji: '❓', title: 'Frequently asked questions',
      summary: 'The questions players ask most, answered.',
      keys: 'faq questions answers help',
      body: (c) => (
        <div className="hb-faq">
          {FAQ.filter((x) => !(x.web && c.native)).map((x) => (
            <details key={x.q}><summary>{x.q}</summary><div>{x.a(c)}</div></details>
          ))}
        </div>
      ),
    },
    {
      id: 'glossary', emoji: '📖', title: 'Glossary',
      summary: 'Every LANDVAS word in one line.',
      keys: 'glossary words terms definitions meaning',
      body: () => (
        <>
          <div className="hb-glossary">{GLOSSARY.map(([t, d]) => <div key={t}><b>{t}</b>{d}</div>)}</div>
          <GoRow links={[['/support', 'Still stuck? Help']]} />
        </>
      ),
    },
  ],
};
