import { WORLDS, WORLD_ORDER } from '../../space/worlds';
import type { Chapter } from '../types';
import { fmtN } from '../live';
import { B, Bullets, Combo, Facts, Figure, GoRow, Note, P, Pro, Steps, Table, Tip } from '../ui';
import { DigLayers, Planets } from '../visuals';
import { readable } from '../../lib/readable';

export const space: Chapter = {
  id: 'space',
  emoji: '🚀',
  title: 'Space',
  blurb: 'Build a rocket, fly to the Moon and the planets, claim plots there, dig to the core, catch meteors, build bases and settle a world.',
  color: '#8B6BFF',
  topics: [
    {
      id: 'rocket', emoji: '🚀', title: 'Build your rocket',
      summary: 'Four parts bought with Ink, and you’re off. Your first trip, to the Moon, burns no fuel.',
      keys: 'rocket build parts engine fins nose tank fuel launch',
      body: (c) => {
        const parts = c.v<Record<string, any>>('space.parts', { fins: { label: 'Fins', ink: 15 }, nose: { label: 'Nose cone', ink: 15 }, tank: { label: 'Fuel tank', ink: 30 }, engine: { label: 'Engine', ink: 40 } });
        const ups = c.v<number[]>('space.engine_upgrade_ink', [0, 300, 800]).map(Number);
        return (
          <>
            <Table head={['Part', 'Ink']} rows={Object.values(parts).map((p: any) => [p.label, fmtN(Number(p.ink))])} note={`${fmtN(Object.values(parts).reduce((s: number, p: any) => s + Number(p.ink), 0))} Ink for the whole rocket.`} />
            <Bullets items={[
              'Fuel is Ink. Each world costs its own fuel to reach, and flights take real time.',
              <>A bigger engine reaches further: engine level 2 for <B>{fmtN(ups[1] ?? 300)} Ink</B> opens the gas giants, level 3 for <B>{fmtN(ups[2] ?? 800)} Ink</B> the outer worlds.</>,
              `Fast travel: pay Ink to arrive now (${fmtN(c.n('space.fast_travel.base_ink', 3))} + ${fmtN(c.n('space.fast_travel.ink_per_minute', 2))} a minute left).`,
            ]} />
            <GoRow links={[['/space', 'Mission control']]} />
          </>
        );
      },
    },
    {
      id: 'worlds', emoji: '🪐', title: 'The worlds',
      summary: 'Nine worlds, from the Moon to Pluto, plus far-off exoplanets. Each pays a first-visit bonus and daily samples.',
      keys: 'worlds planets moon mercury venus mars jupiter saturn uranus neptune pluto exoplanet tiers fuel samples first visit',
      body: (c) => {
        const cfg = c.v<Record<string, any>>('space.worlds', {});
        const rows = WORLD_ORDER.map((id) => ({ id, w: WORLDS[id], s: cfg[id] ?? {} }));
        return (
          <>
            <Figure caption="Tier 1 worlds are reachable from the start; tiers 2 and 3 need engine upgrades.">
              <Planets worlds={rows.map(({ w, s }) => ({ name: w.name.replace('The ', ''), color: w.color, r: w.r, tier: Number(s.tier ?? 1), note: `${fmtN(Number(s.minutes ?? 1))} min · ${fmtN(Number(s.fuel ?? 0))} fuel` }))} />
            </Figure>
            <Table head={['World', 'Tier', 'Trip', 'Ink it pays']} rows={rows.map(({ w, s }) => [
              <b key="w">{w.name.replace('The ', '')}</b>, fmtN(Number(s.tier ?? 1)),
              <span key="t">{fmtN(Number(s.minutes ?? 1))} min<span className="block text-[11px] text-faint">{fmtN(Number(s.fuel ?? 0))} Ink of fuel</span></span>,
              <span key="p">+{fmtN(Number(s.first ?? 10))} first visit<span className="block text-[11px] text-faint">+{fmtN(Number(s.sample ?? 3))} samples a day</span></span>,
            ])} dense note="Samples can be collected on each world once a day. Far-off exoplanets (tier 3) sit beyond the solar system." />
            <Pro>Do a “sample run” each day: hop between the worlds you can reach and collect each one’s samples. The first visit to every world pays a bonus once.</Pro>
          </>
        );
      },
    },
    {
      id: 'planetplots', emoji: '🚩', title: 'Planet plots and their games',
      summary: 'Land on a world and walk its globe to claim plots there. Each world’s plots have two games of their own.',
      keys: 'planet plots claim planet rarity stardust comet nebula pulsar supernova singularity planet games',
      body: (c) => {
        const rar = c.v<any[]>('planets.rarities', [{ name: 'Stardust', weight: 52, mult: 1, color: '#C9CCD6' }, { name: 'Comet', weight: 26, mult: 1.15, color: '#7FE3FF' }, { name: 'Nebula', weight: 13, mult: 1.3, color: '#B69CFF' }, { name: 'Pulsar', weight: 6, mult: 1.5, color: '#4FD18B' }, { name: 'Supernova', weight: 2.5, mult: 1.75, color: '#FFB13D' }, { name: 'Singularity', weight: 0.5, mult: 2.25, color: '#FF3D9A' }]);
        const tot = rar.reduce((s, r) => s + Number(r.weight), 0) || 1;
        return (
          <>
            <P>Land on any world and walk its globe to claim plots; everyone exploring there sees your flag. A planet plot costs that world’s price in Ink, plus <B>{fmtN(c.n('planets.price_step', 5))} more</B> for each plot you already own there. Planet plots roll their own space rarities, which multiply their games’ Ink.</P>
            <Table head={['Space rarity', 'Chance', 'Game Ink']} rows={rar.map((r) => [<b key="n" style={{ color: readable(r.color) }}>{r.name}</b>, `${fmtN((Number(r.weight) / tot) * 100, 1)}%`, `×${Number(r.mult).toFixed(2)}`])} />
            <Facts items={[
              { k: 'Paid rounds per plot', v: `${fmtN(c.n('planets.rounds_per_plot', 3))} a day` },
              { k: 'Planet Ink per world', v: `${fmtN(c.n('planets.daily_cap', 100))} a day` },
              { k: 'Planet Ink in all', v: `${fmtN(c.n('planets.daily_cap_total', 300))} a day` },
            ]} />
            <Note>Planet plots are for Ink and exploring. They don’t earn USD rent like Earth plots.</Note>
          </>
        );
      },
    },
    {
      id: 'dig', emoji: '⛏️', title: 'Digging to the core',
      summary: 'Dig down through your planet plot, layer by layer, for materials, and all the way to the core.',
      keys: 'dig mining shaft layers tools pickaxe drill plasma core energy materials',
      body: () => (
        <>
          <Figure caption="Each layer is harder to dig, holds better materials, and pays Ink the first time you get through it.">
            <DigLayers layers={[
              { name: 'Regolith', to: 12, color: '#8E887D', ink: 10 }, { name: 'Bedrock', to: 60, color: '#6A6359', ink: 25 }, { name: 'Ore veins', to: 240, color: '#7A4E3A', ink: 60 },
              { name: 'Deep rock', to: 1000, color: '#4E3B4F', ink: 150 }, { name: 'The crust', to: 5000, color: '#7A2E2E', ink: 400 }, { name: 'The mantle', to: 12000, color: '#C2410C', ink: 600 }, { name: 'The core', to: 20000, color: '#D98E04', ink: 1000 },
            ]} />
          </Figure>
          <Steps items={[
            'Open one of your planet plots and tap to dig. Each tap uses energy, which refills over time (a free refill a day, more for Ink or rations).',
            'Layers get harder the deeper you go: regolith, bedrock, ore veins and beyond. The first time through each layer pays Ink.',
            'Materials turn up as you dig: stone, ice, dust, iron, copper, crystal, titanium, gems, plasma…',
            'Better tools dig faster: Shovel → Pickaxe → Drill → Plasma drill → Core drill, bought with Ink and materials.',
            <>Reach the <B>core</B> for a big Ink prize and a Core Heart. Digging alongside your party gives a 25% bonus.</>,
          ]} />
        </>
      ),
    },
    {
      id: 'meteors', emoji: '☄️', title: 'Meteors, finds and discoveries',
      summary: 'Meteor showers land near you every few minutes; caves, geodes, probes and ruins wait on every world.',
      keys: 'meteors meteorites golden meteor discoveries points of interest aliens weather',
      body: (c) => (
        <>
          <Facts cols={4} items={[
            { k: 'A shower every', v: `${fmtN(c.n('planets.meteors.every_minutes', 10))} min` },
            { k: 'Meteors', v: fmtN(c.n('planets.meteors.count', 8)), hint: 'near you' },
            { k: 'Each pays', v: `${fmtN(c.n('planets.meteors.ink_min', 3))}–${fmtN(c.n('planets.meteors.ink_max', 8))} Ink` },
            { k: 'Golden ones', v: `${fmtN(c.n('planets.meteors.golden_ink', 20))} Ink`, hint: `${fmtN(c.n('planets.meteors.golden_chance', 0.12) * 100)}% of them` },
          ]} />
          <P>Walk up to them on the planet’s surface to grab them. Each world also hides points of interest (ice caves, crystal geodes, crashed probes, impact craters, alien ruins, fossils) that pay Ink and materials, plus aliens and weather of its own.</P>
        </>
      ),
    },
    {
      id: 'rovers', emoji: '🚙', title: 'Rovers, bases and quests',
      summary: 'Drive across worlds, build a base of working modules, and take on daily and crew quests.',
      keys: 'rover buggy crawler hover base modules research labs quests crew',
      body: () => (
        <>
          <Table head={['Rover', 'Speed', 'Tank']} rows={[['🚙 Moon Buggy', '22 km/h', '120'], ['🚜 Crawler', '32 km/h', '240'], ['🛸 Hover rover', '50 km/h', '360']]} note="Bought with Ink and materials. Rovers run on fuel (from ice or Ink)." />
          <Bullets items={[
            <><B>Bases:</B> build modules on your planet plots: power, habitats, drill rigs, condensers, greenhouses, research labs, trading posts. Working buildings produce while you’re away; labs make research points every hour.</>,
            <><B>Quests:</B> {3} solo quests a day (dig, grab meteors, play the world’s games, drive, build, visit other bases) for Ink and materials, plus <B>crew quests</B> you finish together with your party.</>,
            'Visit other players’ bases, and chat with everyone on the same world.',
          ]} />
        </>
      ),
    },
    {
      id: 'games', emoji: '🎮', title: 'Space games',
      summary: 'Asteroid Run and Moon Lander from mission control, plus two games on every world’s plots.',
      keys: 'space games asteroid run moon lander planet games',
      body: (c) => (
        <>
          <Bullets items={[
            <><B>☄️ Asteroid Run</B> and <B>🌙 Moon Lander</B>: up to {fmtN(c.n('space.games.asteroids.max_ink', 25))} Ink a play.</>,
            <>Every world’s plots have two games of their own (Moon: Moon Lander and Rock Run; Mars: Dust Storm and Olympus; Saturn: Ring Run and Ring Echo…), up to 25 Ink a play × the plot’s space rarity.</>,
            <>Space Ink (samples and space games) is limited to <B>{fmtN(c.n('space.daily_cap', 150))} a day</B>; planet plots have their own limits.</>,
          ]} />
          <GoRow links={[['/space/play/asteroids', 'Asteroid Run'], ['/space/play/lander', 'Moon Lander']]} />
        </>
      ),
    },
    {
      id: 'settle', emoji: '🌌', title: 'Settle your own world',
      summary: 'Jump to an uncharted exoplanet and settle it to lay out plots of your own.',
      keys: 'settle exoplanet own world home planet uncharted',
      body: (c) => (
        <>
          <P>Beyond the solar system lie uncharted worlds. Settle one for <B>{fmtN(c.n('space.settle_ink', 1000))} Ink</B> and it becomes yours to lay out with plots, name and build on.</P>
          <Combo>Space Ink has its own daily limits, separate from minigames and the rest. Once your plot minigames are used up for the day, space is a whole extra layer of Ink.</Combo>
          <Tip>Fly together: party members can warp to each other in space, and crew quests reward playing as a group.</Tip>
        </>
      ),
    },
  ],
};
