import type { Chapter } from '../types';
import { fmtN } from '../live';
import { B, Bullets, Facts, GoRow, Note, P, Pro, Steps, Table, Tip } from '../ui';
import { CLASSES, GALAXY_SIZE, TIERS } from '../../stars/galaxy';

/** ✨ the stars as land (Skywright): finding a star, warping there, its plots, painting it, its plot types and its nature */
export const stars: Chapter = {
  id: 'stars',
  emoji: '✨',
  title: 'The stars',
  blurb: 'Find a star through the telescope, warp there, claim plots on its shell, paint it for everyone to see — and build forges, groves, comet ranches and stargates among the stars.',
  color: '#FFE7A0',
  topics: [
    {
      id: 'telescope', emoji: '🔭', title: 'The telescope',
      summary: 'Look up in Explorer’s Eyes and zoom: every zoom shows stars nobody’s seen. Tap one to see it up close.',
      keys: 'telescope stars sky zoom binoculars deep field ultra deep far galaxy discover preview night',
      body: () => (
        <>
          <P>There are about <B>{Math.round(GALAXY_SIZE / 1e9)} billion</B> stars: the ~5,000 you can see with your eyes at their real places, and the rest further and fainter, there to find. Open first person, look up, and tap the 🔭 telescope.</P>
          <Table head={['Zoom', 'What comes in']} rows={TIERS.map((t) => [<b key="t">{t.name}</b>, t.t === 0 ? 'the real stars, by name' : `stars ${fmtN(t.ly[0])}–${fmtN(t.ly[1])} light-years away`])}
            note="Ultra deep and the far galaxy need an Observatory among the stars (one takes you to ultra deep; two, or a level-3 one, to the far galaxy)." />
          <Tip>Tap a star for its preview: the star turning in its shell of plots, what kind it is, how far, who found it, what the next plot costs — and Go there.</Tip>
          <GoRow links={[['/eyes', 'First person (tap 🔭)'], ['/stars', 'The star chart']]} />
        </>
      ),
    },
    {
      id: 'claim', emoji: '⬡', title: 'Warping and claiming',
      summary: 'Warp to a star (fuel and time by its distance), stand on the inside of its shell, and claim plots. The first to claim is its Discoverer.',
      keys: 'warp fuel discoverer claim star plots keystone price rent shell dyson',
      body: (c) => (
        <>
          <Steps items={[
            <>Tap <B>Go there</B>: the warp costs Ink by distance and takes up to a minute and a half (or arrive now for a little more).</>,
            <>You stand on the inside of the star’s <B>shell of plots</B>, the star burning overhead. Walk with the stick, look around, tap a plot.</>,
            <>Pick what to make it, and claim. It rolls <B>Common to Mythic</B> (no ultras among the stars), and pays rent like Earth’s, <B>×{c.n('stars.rent_mult', 1.1)}</B>.</>,
          ]} />
          <Facts items={[
            { k: 'Each plot on a star', v: `+${Math.round(c.n('stars.price_k', 0.05) * 100)}% × √n`, hint: 'a little more than the last (n = plots already claimed there)' },
            { k: 'Keystones', v: `×${c.n('stars.keystone_mult', 10)}`, hint: 'the 12 pentagons: Epic or better' },
            { k: 'Discoverer’s cut', v: `${c.n('stars.discoverer_pct', 10)}%`, hint: 'of what others pay above the Earth price, as Ink' },
          ]} />
          <Table head={['Star', 'Plots']} rows={CLASSES.map((k) => [<span key="k">{k.emoji} {k.name}</span>, fmtN(10 * k.m * k.m + 2)])} dense />
          <Pro>Busy stars get dear; new ones start at the Earth price. Discover stars and the next player’s claims pay you.</Pro>
        </>
      ),
    },
    {
      id: 'paint', emoji: '🎨', title: 'Painting a star',
      summary: 'Paint your plots of a star; once approved, the painting is on the star for everyone — through the telescope from Earth too.',
      keys: 'paint star art painted star telescope disc review approved',
      body: () => (
        <>
          <Bullets items={[
            'On the star, tap 🖌️ Paint: the whole star laid out flat, zoomed in on your plots. Strokes stay inside your own plots.',
            'Staff look at a star’s paintings before everyone sees them (the star is in everyone’s sky).',
            <>Zoom right in on a claimed star through the telescope and it’s a disc, turning, wearing its plots and paintings. The naked-eye star takes on the paintings’ colour.</>,
            <>Every plot claimed and every painting approved: a <B>Painted Star</B> — on the feed, a badge, and on the star chart.</>,
          ]} />
        </>
      ),
    },
    {
      id: 'types', emoji: '🔥', title: 'Star-only plot types',
      summary: 'Fusion Forges, Lumen Groves, Comet Ranches, Starsong, Sail Yards, Observatories, Plasma Hatcheries — and on Keystones, Stargates and Starbeam Lenses.',
      keys: 'forge fusion hydrogen helium iron starsteel grove codex comet ranch starsong sail observatory exoplanet hatchery plasma egg stargate toll highway lens starbeam',
      body: (c) => (
        <>
          <Table head={['Type', 'What it does']} dense rows={[
            ['🔥 Fusion Forge', <>Gathers hydrogen ({fmtN(c.n('stars.kinds.forge.h_per_hour', 6))} an hour) and fuses {fmtN(c.n('stars.kinds.forge.fuse_ratio', 4))} of an element into 1 of the next: H → He → C → O → Si → Fe, as far as the star’s size allows (a red dwarf stops at helium, a supergiant reaches iron). Iron tempers into <B>Starsteel</B> for your Crucible.</>],
            ['🌱 Lumen Grove', <>Grows the plant of the star’s light in {fmtN(c.n('stars.kinds.grove.grow_hours', 6))} h — ember moss, amber ferns, sunglass vines, pearl blooms, frost-lilies, pulse orchids, void lotuses. Harvest for Ink and a page in your codex (all seven: a badge).</>],
            ['☄️ Comet Ranch', 'Every few hours a comet passes: catch it. It comes back on its own orbit with ice (hydrogen) and Ink, its tail longer each time.'],
            ['🎵 Starsong', 'A loop from the star’s own notes — big stars ring low, small ones high. Anyone looking at the star hears it.'],
            ['⛵ Sail Yard', 'Sends your elements to another player’s star on a solar sail, as long as the distance takes. Brighter stars launch faster.'],
            ['🔭 Observatory', 'Surveys the sky: exoplanets (worlds of yours to land on and claim, in your rocket’s warps), hidden black holes, stray comets. And takes your telescope deeper.'],
            ['🐣 Plasma Hatchery', 'Lays an egg of light and plasma in the star’s colours: an Inkborn born of a star.'],
            ['🌀 Stargate ⬟', <>Others warp to the star for less fuel and its keepers share a toll ({fmtN(c.n('stars.kinds.gate.toll_pct', 25))}% of what they pay). Link two of your gates: a space highway between them.</>],
            ['🔦 Starbeam Lens ⬟', <>Once a day, focus the star’s light on Earth for {fmtN(c.n('stars.kinds.lens.hours', 1))} h: claims under it roll a tier higher, and first person there sees the beam.</>],
          ]} />
          <Note>⬟ Keystone-only. Base and Art stay on stars too.</Note>
        </>
      ),
    },
    {
      id: 'nature', emoji: '☀️', title: 'Each kind of star',
      summary: 'Red dwarfs flare, binaries eclipse, pulsars keep a beat, black holes bend time — and you can light a star, or watch one go supernova.',
      keys: 'flare red dwarf eclipse binary pulsar beat neutron black hole time dilation enchantment clock supernova betelgeuse light lit gold',
      body: (c) => (
        <>
          <Bullets items={[
            <>☀️ <B>Red dwarfs flare</B> now and then: groves bloom at once, forges run double.</>,
            <>🌑 <B>Binary stars eclipse</B>: witness one (any plot of yours there) for {fmtN(c.n('stars.nature.eclipse.luck', 2))} Luck.</>,
            <>💫 <B>Pulsars</B> beat a few times a second: tap along a few times a day for Ink — the closer to the beat, the more.</>,
            <>🕳️ <B>Black holes</B> bend time: once a day, push one of your enchantments’ clocks ahead an hour for each plot you have there.</>,
            <>🕯️ <B>Light a star</B> with your helium and carbon: it shines brighter in everyone’s sky (up to 5 times).</>,
            <>💥 A <B>supernova</B> pays gold and Ink to everyone with a plot on that star. Betelgeuse is the one everyone’s waiting for.</>,
          ]} />
        </>
      ),
    },
  ],
};
