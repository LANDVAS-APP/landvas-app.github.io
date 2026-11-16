import type { Chapter } from '../types';
import { fmtN } from '../live';
import { B, Bullets, GoRow, Note, P, Pro, Steps, Tip } from '../ui';

export const progress: Chapter = {
  id: 'progress',
  emoji: '🏅',
  title: 'Progress, events & your profile',
  blurb: 'Your level, badges, ultra sets, rankings, Royalty, events, weekly challenges, the daily creative games, and the settings worth knowing.',
  color: '#FFC93D',
  topics: [
    {
      id: 'level', emoji: '⬆️', title: 'Your level and XP',
      summary: 'XP (Brush Points) from playing and creating raises your player level, shown next to your avatar.',
      keys: 'level xp brush points artist level experience',
      body: () => (
        <>
          <P>XP comes from minigame stars, publishing art, the wheel, events and creative games. Your level shows on your avatar everywhere: the HUD, chat, your profile and the rankings.</P>
          <Note>Each place has its own levels too: your farm, arcade, realms, keeper level, clan and enchantments all level up on their own.</Note>
        </>
      ),
    },
    {
      id: 'badges', emoji: '🏅', title: 'Badges',
      summary: 'A medal for every rarity, every kind of plot, streaks, trips, estates and much more. The metal shows how hard it was.',
      keys: 'badges achievements medals collection unlock',
      body: () => (
        <>
          <Bullets items={[
            'Every rarity (each ultra and Primordial has its own badge), every plot type, Estates and Domains, streaks, trips, art, creatures, enchantments, clans…',
            'The Badges page has a collection ring and an “Almost there” row showing the ones you’re closest to.',
            'Some badges pay Ink or Gallery Tokens when you unlock them.',
            'More than 130 of them are enchantment badges (kinds owned, levels, Stars, the Codex, what each kind does…), paying Luck or Enchanted Luck. The Grimoire’s Badges tab groups them.',
          ]} />
          <GoRow links={[['/achievements', 'My badges']]} />
        </>
      ),
    },
    {
      id: 'sets', emoji: '🎩', title: 'Ultra sets for your explorer',
      summary: 'Every ultra rarity has its own explorer look (hat, outfit, relic, aura, trail) and Inkborn wear, unlocked by owning one.',
      keys: 'explorer sets ultra sets outfit hat aura trail cosmetics wear',
      body: () => (
        <>
          <P>Get a plot of an ultra rarity and its <B>set</B> unlocks: a hat, outfit, held relic, aura and trail for your explorer, plus matching wear for your Inkborn. All the Primordials share one set. Your profile shows which sets you’ve collected.</P>
          <Tip>Arcade prizes (like the Pixel Crown or the Propeller Cap) are explorer gear too, bought with tickets.</Tip>
          <GoRow links={[['/explorer', 'Dress your explorer']]} />
        </>
      ),
    },
    {
      id: 'ranks', emoji: '🏆', title: 'Rankings, Royalty and rarity rankings',
      summary: 'The top 50 in every category, every Crown and its holder, and who owns the most of each rarity.',
      keys: 'rankings leaderboard top players royalty crowns rarity rankings',
      body: () => (
        <>
          <Bullets items={[
            <><B>Rankings:</B> the top 50 in each category. Everyone listed is a real account.</>,
            <><B>Royalty:</B> every City, State and Country Crown and who holds it, and your own Crowns with their shares.</>,
            <><B>Rarity rankings:</B> who owns the most of every rarity.</>,
          ]} />
          <GoRow links={[['/leaderboards', 'Rankings'], ['/royalty', 'Royalty'], ['/rankings/rarities', 'Rarity rankings']]} />
        </>
      ),
    },
    {
      id: 'events', emoji: '📅', title: 'Events',
      summary: 'Limited-time challenges for the whole map. Rewards are Pigments, XP and Gallery Tokens.',
      keys: 'events limited time world events',
      body: () => (
        <>
          <P>Events run for a limited time across the whole map, with goals for everyone. Check the Events page often: new ones appear without an update.</P>
          <GoRow links={[['/events', 'Events']]} />
        </>
      ),
    },
    {
      id: 'creative', emoji: '🖍️', title: 'Challenges and the daily creative games',
      summary: 'Weekly themes to paint, Sketch of the Day, Draw & Guess and Duets.',
      keys: 'weekly challenge sketch of the day draw and guess doodle duet creative games vote',
      body: (c) => {
        const sk = c.v<number[]>('creative.sketch.prizes', [100, 80, 65, 50, 40, 30, 25, 20, 15, 10]);
        return (
          <>
            <Bullets items={[
              <><B>🏆 Weekly challenges:</B> paint the theme on your plot, enter it, and vote ({fmtN(c.n('earn.challenges.votes_per_player', 3))} votes each). The top entries win prizes.</>,
              <><B>🖍️ Sketch of the Day:</B> everyone gets the same word and {fmtN(c.n('creative.sketch.minutes', 10))} minutes to sketch it. Everyone votes ({fmtN(c.n('creative.sketch.votes_per_player', 20))} votes each); the top ten win {sk.join(', ')} Ink.</>,
              <><B>💡 Draw & Guess:</B> draw a word in {fmtN(c.n('creative.doodle.draw_seconds', 60))} seconds for others to guess. A right guess pays {fmtN(c.n('creative.doodle.guesser_ink', 8))} Ink; the artist gets {fmtN(c.n('creative.doodle.drawer_ink', 4))} for each guesser.</>,
              <><B>🎭 Duets:</B> paint half a picture blind while a partner paints the other half, then the big reveal. {fmtN(c.n('creative.duet.complete_ink', 8))} Ink each.</>,
              <><B>🎫 Stamps:</B> other players collect numbered stamps of your art; you get {fmtN(c.n('creative.stamps.artist_pct', 80))}% of each.</>,
              <><B>✨ Inspire</B> art you love (it pays the artist), and standout pieces get <B>Featured</B> as Painting of the Day.</>,
            ]} />
            <Note>Creative games need an account at least a day old to pay.</Note>
            <GoRow links={[['/challenges', 'Challenges'], ['/sketch', 'Sketch of the Day'], ['/doodle', 'Draw & Guess'], ['/duet', 'Duets']]} />
          </>
        );
      },
    },
    {
      id: 'settings', emoji: '⚙️', title: 'Settings worth knowing',
      summary: 'Simple mode, phone tabs, sounds, reminders, privacy, motion and map looks.',
      keys: 'settings options simple mode tabs sound effects reduce motion theme map theme privacy reminders replay tour',
      body: () => (
        <>
          <Bullets items={[
            <><B>Simple mode:</B> one screen, no map.</>,
            <><B>Phone navigation:</B> choose the five tabs in your tab bar.</>,
            <><B>Sound effects, haptics and reduce motion</B> (for calmer animations).</>,
            <><B>Map:</B> themes, the plot grid, crisp pixels, 3D tilt and the globe.</>,
            <><B>Privacy:</B> what the feed shows about you, Online now, party invites.</>,
            <><B>Streak reminders</B> (in the app) and <B>replay the tour</B>.</>,
          ]} />
          <GoRow links={[['/settings', 'Settings']]} />
        </>
      ),
    },
    {
      id: 'portal', emoji: '📊', title: 'Your player portal', webOnly: true,
      summary: 'my.landvas.app: every number about your account, your earnings by day, every plot on a map, and a full data download.',
      keys: 'portal my.landvas.app data export earnings ledger',
      body: () => (
        <>
          <P>Sign in at <B>my.landvas.app</B> for a read-only view of your whole account: live rent over a map of your plots, earnings by day and by source, your full Ink and USD history, every plot with its rate, your enchantments and Inkborn, and a download of all your data.</P>
          <Pro>Use it to see which of your sources and plots really earn the most, then double down on them.</Pro>
        </>
      ),
    },
    {
      id: 'help', emoji: '🛟', title: 'Getting help',
      summary: 'The Help page, the Discord and Reddit communities, and support by email.',
      keys: 'help support contact discord reddit bug report email',
      body: () => (
        <>
          <Steps items={['Open Help (from the Play tab or your profile).', 'Search the answers, or contact support from there.', 'Join the community on Discord and Reddit (links on the Help page) for tips, events and news.']} />
          <GoRow links={[['/support', 'Help']]} />
        </>
      ),
    },
  ],
};
