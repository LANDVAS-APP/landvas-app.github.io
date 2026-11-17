import { useEffect, useMemo, useState } from 'react';
import { Slider } from '../../ui';
import type { Chapter } from '../types';
import { fmtN, type Ctx } from '../live';
import { B, Bullets, Combo, Facts, Figure, GoRow, H, Note, P, Pro, Steps, Table, Tip, Warn } from '../ui';
import { Bars, Timeline } from '../visuals';
import { gamesOn, levelInk, maxLevel, paidPerGame } from './ink';

// ---- the daily checklist (kept on this device for today only) ------------------------------------------------------

const CHECKS: { id: string; label: string; why: string }[] = [
  { id: 'streak', label: 'Claim the daily streak', why: 'Ink + tickets' },
  { id: 'wheel', label: 'Spin the free wheel', why: 'Ink, boost, XP' },
  { id: 'boost', label: 'Use all your free rent boosts', why: '×20 rent' },
  { id: 'games', label: 'Use every minigame’s paid wins on your best plots', why: 'the big one' },
  { id: 'enchant', label: 'Tend everything that’s ready in the Grimoire', why: 'eggs, wishes, feeds' },
  { id: 'inkborn', label: 'Collect the Ink Spring and send everyone on jobs', why: 'up to the cap' },
  { id: 'pvp', label: 'Play your paid PvP matches', why: '10 a day' },
  { id: 'rooms', label: 'Check in at 5 rooms', why: 'Ink for you and them' },
  { id: 'places', label: 'Visit your farm, business, arcade and realms', why: 'collect what they made' },
  { id: 'hot', label: 'Look at today’s Hot Zone', why: 'claim there with Luck' },
  { id: 'sketch', label: 'Sketch of the Day and a Draw & Guess', why: 'creative Ink' },
  { id: 'space', label: 'Space: samples, meteors and quests', why: 'its own caps' },
];
function todayKey() {
  try { return `landvas.handbook.today.${new Date().toISOString().slice(0, 10)}`; } catch { return 'landvas.handbook.today'; }
}
function DailyChecklist() {
  const key = useMemo(todayKey, []);
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { const v = localStorage.getItem(key); if (v) setDone(JSON.parse(v)); } catch { /* storage off: in-memory only */ }
  }, [key]);
  const toggle = (id: string) => setDone((d) => {
    const n = { ...d, [id]: !d[id] };
    try { localStorage.setItem(key, JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });
  const count = CHECKS.filter((x) => done[x.id]).length;
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-[12.5px] font-bold text-muted"><span>Today on this device</span><span className="tnum">{count} / {CHECKS.length}</span></div>
      <div className="hb-check" data-testid="hb-checklist">
        {CHECKS.map((x) => (
          <label key={x.id} className={done[x.id] ? 'done' : ''}>
            <input type="checkbox" checked={!!done[x.id]} onChange={() => toggle(x.id)} />
            <span>{x.label}</span><em>{x.why}</em>
          </label>
        ))}
      </div>
    </div>
  );
}

// ---- what a day of minigames can pay -------------------------------------------------------------------------------

function MinigameDay({ c }: { c: Ctx }) {
  const rarities = c.everyday.filter((r) => r.ink >= 1);
  const [lvl, setLvl] = useState(20);
  const [ri, setRi] = useState(Math.max(0, rarities.findIndex((r) => r.id === 'rare')));
  const [styles, setStyles] = useState(gamesOn(c));
  const per = paidPerGame(c);
  const r = rarities[ri] ?? { name: 'Common', ink: 1, color: '#3DDC97' };
  const perWin = levelInk(c, lvl) * r.ink;
  const wins = Number.isFinite(per) ? per * styles : 0;
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Slider id="hb-mg-level" label="Your plots’ level" value={lvl} min={1} max={maxLevel(c)} step={1} onChange={setLvl} format={(v) => `Lv ${v}`} />
        <Slider id="hb-mg-styles" label="Styles you own" value={styles} min={1} max={gamesOn(c)} step={1} onChange={setStyles} format={(v) => `${v} of ${gamesOn(c)}`} />
        <Slider id="hb-mg-rarity" label="Their rarity" value={ri} min={0} max={Math.max(0, rarities.length - 1)} step={1} onChange={setRi} format={(v) => rarities[v]?.name ?? '—'} />
      </div>
      <Facts cols={3} items={[
        { k: 'A paid win pays', v: `${fmtN(perWin, 1)} Ink`, c: r.color },
        { k: 'Paid wins a day', v: Number.isFinite(per) ? fmtN(wins) : 'no limit' },
        { k: 'Minigame Ink a day', v: Number.isFinite(per) ? fmtN(perWin * wins) : '—', c: '#34C3FF' },
      ]} />
    </div>
  );
}

export const strategy: Chapter = {
  id: 'strategy',
  emoji: '🧠',
  title: 'Strategy & the best ways to grind',
  blurb: 'A first-week plan, a daily checklist, the best Ink per hour, where to spend, how to roll smart, rent tactics, the best combos and the mistakes to avoid.',
  color: '#22E3FF',
  topics: [
    {
      id: 'week', emoji: '🌱', title: 'Your first week',
      summary: 'What to do on days 1 to 7 to build a strong start.',
      keys: 'first week plan beginner strategy start guide early game',
      body: (c) => (
        <>
          <Timeline items={[
            { t: 'Day 1', e: '🗺️', c: '#34C3FF', title: 'Free land, all of it touching', body: <>Claim your {fmtN(c.n('economy.free_plots', 4))} free plots <B>in a 2×2 square</B> so they can merge later. Play each one’s minigame, tap Boost, claim the streak and spin the wheel.</> },
            { t: 'Days 1–3', e: '🎨', c: '#FF4FD8', title: 'Collect the eight styles', body: 'Each style has its own minigame with its own paid wins a day, so owning all eight multiplies your daily Ink. Claim new spots until you have all eight.' },
            { t: 'Day 2', e: '🐾', c: '#3DDC97', title: 'Your free Inkborn', body: 'Draw it, send it on a job, and come back for its Ink Spring.' },
            { t: 'Days 2–4', e: '🚲', c: '#FFC93D', title: 'Get a Bike', body: 'For 250 Ink it quadruples how far your explorer can roam: your whole neighbourhood becomes claimable.' },
            { t: 'Day 5', e: '🤝', c: '#22C7B5', title: 'Join a clan, start a party', body: 'Weekly goals pay you for what you already do. Parties let you travel and play together.' },
            { t: 'Day 7', e: '🎟️', c: '#8B6BFF', title: 'Your first guaranteed roll', body: 'Day 7 of the streak brings a Rare-or-better ticket. Arm some Luck before you use it.' },
          ]} />
        </>
      ),
    },
    {
      id: 'daily', emoji: '✅', title: 'The daily checklist',
      summary: 'Everything worth doing every day, in the order that pays best. Tick it off as you go.',
      keys: 'daily routine checklist what to do every day dailies',
      body: (c) => (
        <>
          <DailyChecklist />
          <Tip>The day resets at {c.resetLocal}. Doing the list just before the reset, and again just after, covers two days in one sitting.</Tip>
        </>
      ),
    },
    {
      id: 'minigames', emoji: '🎮', title: 'Grinding minigames',
      summary: 'How to squeeze the most Ink from your daily paid wins.',
      keys: 'minigame grind best ink per day paid wins strategy level rarity',
      body: (c) => (
        <>
          <Figure tone="plain" caption="Slide to see what a day of paid minigame wins is worth (live rates).">
            <MinigameDay c={c} />
          </Figure>
          <Steps items={[
            <><B>Own all {gamesOn(c)} styles.</B> Paid wins are counted per minigame, so each new style adds {Number.isFinite(paidPerGame(c)) ? paidPerGame(c) : 'more'} paid wins a day.</>,
            <><B>Play each style on its best plot:</B> the highest rarity bonus at the highest level.</>,
            <><B>Stop when a game says Practice</B> and move to the next style, unless you’re deliberately levelling a plot up.</>,
            <><B>Save Golden Hours</B> (×2 for 3 wins) for your best plots at their highest levels.</>,
            'Boost your best minigame plots further with a giant Size Ray, a Wormhole, a crease, an inlay or a Pocket Sun in orbit.',
          ]} />
        </>
      ),
    },
    {
      id: 'perday', emoji: '📊', title: 'Where the Ink is: every source’s daily limit',
      summary: 'How much each source can pay you in a day, side by side.',
      keys: 'best ink per hour most ink sources compare daily cap grind',
      body: (c) => {
        const per = paidPerGame(c);
        const mg = Number.isFinite(per) ? per * gamesOn(c) * levelInk(c, 30) * 1.15 : 0;
        const rows = [
          { label: '🎮 Minigames (Lv 30, Rare plots)', v: mg, c: '#3DDC97' },
          { label: '🪐 Planet plots', v: c.n('planets.daily_cap_total', 300), c: '#8B6BFF' },
          { label: '🐾 Inkborn', v: c.n('inkborn.daily_cap', 150), c: '#3DDC97' },
          { label: '🚀 Space', v: c.n('space.daily_cap', 150), c: '#8B6BFF' },
          { label: '🌾 Farms', v: c.n('farm.daily_cap', 120), c: '#E0A800' },
          { label: '🍋 Businesses', v: c.n('business.daily_cap', 120), c: '#D4A500' },
          { label: '⛏️ Realms', v: c.n('realms.daily_cap', 120), c: '#7C5CFF' },
          { label: '🖌️ Craft bonus', v: c.n('earn.craft.daily_cap', 100), c: '#FF4FD8' },
          { label: '⚔️ PvP', v: c.n('pvp.daily_rewarded_matches', 10) * c.n('pvp.games.turfwars.win_ink', 10), c: '#FF4D6D' },
          { label: '🔥 Streak (average)', v: c.v<number[]>('daily_streak.ink', [20, 30, 40, 50, 60, 80, 120]).reduce((s, x) => s + Number(x), 0) / 7, c: '#FF9F1C' },
        ].sort((a, b) => b.v - a.v);
        return (
          <>
            <Figure caption="The most each capped source pays in a day (live limits). Arcade cabinets have no daily cap, and enchantments, the Leviathan and invites pay on top of all of this.">
              <Bars rows={rows} unit={(v) => `${fmtN(v)} Ink`} />
            </Figure>
            <Pro title="Stack the caps">Every source has its own limit, so the way to earn the most is <i>breadth</i>: hit several limits a day rather than grinding one. Once your minigames say Practice, the next 150 Ink is in your Inkborn, the next 300 on your planet plots, and so on.</Pro>
            <Note>Arcade cabinets are paid by score with no daily cap, so a strong arcade player can keep going after everything else is maxed.</Note>
          </>
        );
      },
    },
    {
      id: 'spend', emoji: '💸', title: 'Where to spend your Ink',
      summary: 'Plots first, then the things that multiply them.',
      keys: 'spend ink priorities what to buy best value',
      body: (c) => (
        <>
          <Table head={['Priority', 'Buy', 'Why']} rows={[
            ['1', `New styles (${fmtN(c.n('economy.acquire.base_ink', 100))} Ink a plot)`, 'Each new style adds a minigame’s worth of paid wins every day'],
            ['2', 'A Bike (250 Ink)', 'Four times the claim range, no fuel'],
            ['3', 'Plots in squares', 'Merged places open all their games; 2×2 Estates, 3×3 Domains'],
            ['4', 'More plots anywhere', 'Rent, more rolls at ultras and Crowns, Luck fuel, Splice charge tiers'],
            ['5', 'Luck for big claims', 'Hot Zone claims, tickets, hunting a combo ultra'],
            ['6', 'Enchanted Luck', 'When you want an enchantment (up to 20% on one roll)'],
          ]} />
          <Note>Once you own all eight styles, extra plots add rent and rolls, not more paid minigame wins (those are per style). That’s when merging, Luck and enchantments become the best uses of Ink.</Note>
        </>
      ),
    },
    {
      id: 'rolling', emoji: '🎯', title: 'Rolling smart',
      summary: 'Every claim is a lottery ticket. Here’s how to load the odds.',
      keys: 'roll strategy best odds ultra hunting crown hunting hot zone luck spyglass',
      body: (c) => (
        <>
          <Bullets items={[
            <><B>Hot Zone + full Luck</B> is the strongest normal claim: best-of-two on the plot’s own roll with ultras ×{fmtN(c.n('hot_zones.ultra_mult', 5))}, plus up to {fmtN(c.n('luck.max_rolls', 6) - 1)} rerolls at ultras ×{fmtN(1 + ((c.n('luck.max_rolls', 6) - 1) * c.n('luck.points_per_roll', 20)) / c.n('luck.points_per_ultra_x', 10))}.</>,
            <><B>Use tickets with Luck armed.</B> A Legendary+ ticket with five rerolls is a serious shot at an ultra.</>,
            <><B>Crown hunting:</B> claim where nobody holds the Crown yet. Fly somewhere quiet and every claim has a chance.</>,
            <><B>See before you claim:</B> a Spyglass shows the rarity a free spot would roll for you. Phantom whispers and World’s Eye gazes do the same.</>,
            <><B>Tier-higher spots:</B> Volcano obsidian, Wanderer trails, Mycelium mushrooms and Leyline beams all roll a tier higher for you.</>,
          ]} />
          <Combo title="The dream claim">Fly to the Hot Zone → arm 5 rerolls → add Enchanted Luck charges → claim a spot your Spyglass read as Legendary. Every system is working for you on that one roll.</Combo>
        </>
      ),
    },
    {
      id: 'rent', emoji: '💵', title: 'Rent tactics',
      summary: 'Small habits that multiply what your land earns.',
      keys: 'rent strategy maximise rent boost timing landlord mirror gemini',
      body: () => (
        <>
          <Bullets items={[
            'Use every free boost every day. A missed boost is gone at the reset.',
            'Stack boosts over the big moments: a Comet’s hour, your Solar or Lunar window, and Landlord rent day on the 1st.',
            'Make your best plots Landlord plots and keep their checklist done: ×50 of your best rent is the biggest day of the month.',
            'Put a Mirror next to your best earner, chase a second Gemini, and drop a Kraken where other players live.',
            'Never break your streak if you own a Phoenix.',
            'Prismatic, Genesis and Singularity multiply everything, so they get better the more land you own.',
          ]} />
        </>
      ),
    },
    {
      id: 'combos', emoji: '🔗', title: 'The best combos in the game',
      summary: 'Systems that multiply each other when you put them together.',
      keys: 'combos synergy best combinations stacking tips',
      body: () => (
        <>
          <Table head={['Combo', 'Why it works']} rows={[
            ['✈️ Pin flight + 🔥 Hot Zone + 🍀 Luck', 'Claim the boosted city at the normal price, with every reroll'],
            ['⭐ Golden Hour + Mythic plot at a high level', '×2 on your biggest wins'],
            ['⚙️ Clockwork + 🪿 Golden Goose', 'Tempo makes its timers run ×3: eggs arrive three times as fast'],
            ['📡 Size Ray (grow) + your best minigame plot', '×1.5–2 on its minigames while it’s giant'],
            ['🔥 Crucible + spare Commons', 'Melt them for Heat, strike your best plot a tier up'],
            ['🪞 Mirror + your best ultra', 'The Mirror earns like it'],
            ['♊ Gemini + ♊ Gemini', '×12 each, or fuse them into a ×26 Constellation'],
            ['🔆 Sunspot (Primordial)', 'A personal Hot Zone wherever you place it'],
            ['⚡ Storm Coil + any splice', 'Three times the Aberration chance, plus a live storm that mutates hybrids'],
            ['🎭 Strings / 🦢 Folded Traits', 'Your enchantments keep working when you can’t check in'],
            ['🌋 Volcano · 🦄 Wanderer · 🍄 Mycelium · ⚡ Leyline + Luck', 'Tier-higher spots with rerolls on top'],
          ]} dense />
        </>
      ),
    },
    {
      id: 'mistakes', emoji: '🚫', title: 'Mistakes to avoid',
      summary: 'The things players most often regret.',
      keys: 'mistakes avoid regret dont common errors',
      body: () => (
        <>
          <Bullets items={[
            <><B>Playing past your paid wins by accident.</B> Practice wins still use up that plot’s levels.</>,
            <><B>Letting free boosts expire</B>, or a full Ink Spring sit there.</>,
            <><B>Breaking the streak</B>, especially with a Phoenix.</>,
            <><B>Claiming scattered plots</B> that can never merge into anything.</>,
            <><B>Sacrificing a plot before playing its game out.</B> It still had about a thousand Ink in it.</>,
            <><B>Leaving enchantments idle.</B> Tap ▶ Start tending in the Grimoire every visit.</>,
            <><B>Changing the rarity of an enchanted plot.</B> The enchantment on it ends for good.</>,
            <><B>Fusing without reading the recipe.</B> Fusions release plots for good.</>,
            <><B>Using a bug.</B> Exploited rewards get taken back. Report it instead.</>,
          ]} />
          <Warn>None of these can be undone by support, so take a second before anything that gives a plot away.</Warn>
          <GoRow links={[['/guide', 'Live rates & what players really earn']]} />
        </>
      ),
    },
    {
      id: 'sessions', emoji: '⏳', title: 'What to do with the time you have',
      summary: 'Plans for 5 minutes, 30 minutes and a long session.',
      keys: 'how long session 5 minutes 30 minutes hour plan short long',
      body: () => (
        <>
          <H>5 minutes</H>
          <P>Streak, wheel, boost, collect the Ink Spring, tend everything that’s ready in the Grimoire.</P>
          <H>30 minutes</H>
          <P>All of that, then every style’s paid wins on its best plot, your paid PvP matches and five room check-ins.</P>
          <H>A long session</H>
          <P>All of that, then your farm, business and realms, space (samples, meteors, quests, planet games), the creative games, a Hot Zone flight with Luck, and the arcade (no cap) for as long as you like.</P>
        </>
      ),
    },
  ],
};
