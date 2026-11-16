import type { Chapter } from '../types';
import { fmtN } from '../live';
import { B, Bullets, Chips, Combo, Facts, Figure, GoRow, H, Note, P, Pro, Steps, Tip, Warn } from '../ui';
import { PartyMock } from '../visuals';

export const social: Chapter = {
  id: 'social',
  emoji: '👥',
  title: 'Friends, parties & clans',
  blurb: 'The live feed and chat, friends, open play and parties that go everywhere with you, players on the map, watching people play, clans and the Clan Keep, visits, invites and staying safe.',
  color: '#22C7B5',
  topics: [
    {
      id: 'feed', emoji: '💬', title: 'The feed, chat and friends',
      summary: 'See what the world is rolling and painting live, chat with everyone, and add friends.',
      keys: 'feed chat global chat friends add friend social community live feed',
      body: () => (
        <>
          <Bullets items={[
            <><B>Live feed:</B> big rolls, new art, Primordials, hybrids, Leviathan moments and more, as they happen.</>,
            <><B>Chat:</B> one world chat, plus party, clan, planet and arcade chats. Links aren’t allowed and a word filter keeps it friendly.</>,
            <><B>Friends:</B> add anyone from their profile. Friends show what they’re up to, and you can join them, invite them, or visit their land.</>,
            <><B>Players & Gallery:</B> browse every player and the newest art on the map.</>,
          ]} />
          <GoRow links={[['/social', 'Feed & chat'], ['/players', 'Players'], ['/gallery', 'Gallery']]} />
        </>
      ),
    },
    {
      id: 'party', emoji: '🎉', title: 'Parties and open play',
      summary: 'Anyone playing is someone you can play with: public parties of up to 10, Team up with anyone online, and games looking for players.',
      keys: 'party parties group lobby lobbies invite link public private travel together party chat team up join anyone online looking for players lfg open to join joinable find on map',
      body: (c) => (
        <>
          <Figure caption="A party: what it’s up to, what each member is doing (with Join and Show buttons), and its chat.">
            <PartyMock />
          </Figure>
          <Steps items={[
            'Tap 🎉 (in the app’s HUD, the map bar or the web menu) and start a party. Give it a name and say what you’re up to. Parties are Public unless you make yours Private.',
            <>Invite people: <B>Online now</B> (everyone who’s on), your <B>Friends</B>, anyone <B>by name</B>, or send a <B>link</B>. The link works for people who haven’t signed up yet; they join LANDVAS and land straight in your party, and count as your invite.</>,
            'Party chat follows you: the Party page, a chat dock on the map, and inside arcades.',
          ]} />
          <H>Open play: join anyone</H>
          <Bullets items={[
            <><B>Team up</B> with anyone online, even if they’re on their own: a party forms around them (they lead it) and they’re told you joined.</>,
            <><B>Looking for players:</B> every game waiting for more people right now (a table at someone’s house, an arcade match, a Live Arena lobby) shows as a pill on the map and at the top of Lobbies. Tap Join and you go straight to the seat.</>,
            'Join someone at their home or arcade and you land in the same room as them. Friends and your party can see when you’re at home and come straight in.',
            <><B>Lobbies</B> list public parties with someone online, busiest first. Joining is one tap.</>,
          ]} />
          <Bullets items={[
            'Each member row shows what they’re doing, with buttons to Join them in their arcade, Warp to them in space, or Show them on the map while travelling.',
            'When the leader boards a train or plane, the whole party rides along (it doesn’t use your own trips).',
            `Up to ${fmtN(Number(c.v('party.max', 10)))} players. Invites expire after a day.`,
          ]} />
          <Tip>Rather play privately? Settings → Privacy → switch off <B>Anyone online can join me</B> (then it’s invites only), or make your party Private. Going private hides you and your party from the lists.</Tip>
          <GoRow links={[['/party', 'Parties']]} />
        </>
      ),
    },
    {
      id: 'explorers', emoji: '🧭', title: 'Other players on the map',
      summary: 'Explorers out travelling in the game show on everyone’s map. Anyone on GPS never does.',
      keys: 'players on the map other explorers see players find on map team up gps privacy show my explorer',
      body: () => (
        <>
          <P>When someone is <B>out in the game</B> (on a trip, or steering the joystick far from home) their explorer shows on everyone’s map. Tap one to see who it is and what they’re up to, and <B>Team up</B>.</P>
          <Bullets items={[
            <>Anyone on <B>GPS is never shown</B> and can’t be found.</>,
            'Never within 3 km of a player’s real spot or where their trip set off, never on the way home, and only while they’re online. Nothing that points back home is ever sent.',
            '“Find” in the Lobbies and “Find on map” on a profile fly your map to them.',
          ]} />
          <Tip>Settings → Privacy → <B>Show my explorer on the map</B> turns it off for you.</Tip>
        </>
      ),
    },
    {
      id: 'watch', emoji: '👀', title: 'Watch people play',
      summary: 'Watch anyone’s game live, react, and jump in. Switch it off if you’d rather not be watched.',
      keys: 'watch spectate live now stream watch live reactions viewers who is watching',
      body: () => (
        <>
          <P>Anyone playing a game or at a place (minigames, arcades, party games, farms, realms, drawing…) can be <B>watched live</B>. Never the map, settings or chats.</P>
          <Bullets items={[
            <>Find people to watch under <B>Live now</B> in the Lobbies, the 👀 on lobby, party and friend rows, or <B>Watch live</B> on a profile.</>,
            'You see their screen as it happens with a LIVE badge and the number watching, and can send reactions, Join, Team up or open their profile.',
            <>When someone watches you, you see <B>👀 N watching</B>; tap it to see who, or to stop letting people watch. Their reactions float up on your screen.</>,
          ]} />
          <Tip>Settings → Privacy → <B>Let people watch me play</B> turns it off.</Tip>
        </>
      ),
    },
    {
      id: 'clans', emoji: '🛡️', title: 'Clans',
      summary: 'A team with its own hall, weekly goals, battles against other clans, seasons and a Keep to build.',
      keys: 'clan clans team guild weekly goals battles season clan level perks found create join',
      body: () => (
        <>
          <Facts cols={4} items={[
            { k: 'Found a clan', v: '1,000 Ink' },
            { k: 'Members', v: '20 + 2 a level', hint: 'up to 60' },
            { k: 'Clan levels', v: 'up to 30' },
            { k: 'Weekly goals', v: '3 → 5', hint: 'more at levels 4 and 8' },
          ]} />
          <Bullets items={[
            <><B>Weekly goals</B> are things you do anyway (earn Ink together, win minigames, play arcades, farm, realms, space, Inkborn, hang out in the Keep). Each one finished pays every helper Ink and gives the clan XP.</>,
            <><B>Clan battles</B> last 24 hours against another clan: the winners get 120 Ink each, the losers still 40.</>,
            <><B>Seasons</B> pay the top clans extra Ink (the top 1, 3, 10 and 25).</>,
            'Clan levels unlock perks: a clan hall and chat from level 1, more hall furniture, more weekly goals, and eventually everything for the hall.',
            'Leave a clan and you wait 12 hours before joining another.',
          ]} />
          <GoRow links={[['/clans', 'Clans'], ['/clan/hall', 'Clan hall']]} />
        </>
      ),
    },
    {
      id: 'keep', emoji: '🏰', title: 'The Clan Keep',
      summary: 'Your clan’s shared castle: a daily chest, stone from quarry and training, buildings, and a clan spirit to raise.',
      keys: 'clan keep castle stone quarry training builds spirit chest',
      body: (c) => {
        const builds = c.v<any[]>('clan_keep.builds', []);
        return (
          <>
            <Bullets items={[
              <>Open the <B>daily chest</B> for {fmtN(c.n('clan_keep.chest.ink', 30))} Ink and stone.</>,
              'Play the quarry and training games for more stone.',
              'Spend stone on buildings for the whole clan to see.',
              'Feed stone to your clan spirit, which grows from an Egg through Hatchling, Sprout, Young and Grown to Legendary.',
            ]} />
            {builds.length > 0 && <Chips items={builds.map((b: any) => `${b.emoji} ${b.name}`)} c="#22C7B5" />}
          </>
        );
      },
    },
    {
      id: 'visits', emoji: '🚪', title: 'Rooms, homes and visits',
      summary: 'Check in at other players’ rooms and homes. You both get Ink.',
      keys: 'visit room home check in visitor host profile',
      body: (c) => (
        <>
          <Facts cols={4} items={[
            { k: 'You get', v: `${fmtN(c.n('earn.rooms.visitor_ink', 2))} Ink`, hint: 'a check-in' },
            { k: 'Paid check-ins', v: `${fmtN(c.n('earn.rooms.visitor_daily', 5))} a day` },
            { k: 'The host gets', v: `${fmtN(c.n('earn.rooms.host_ink', 2))} Ink`, hint: 'a visitor' },
            { k: 'Paid visitors', v: `${fmtN(c.n('earn.rooms.host_daily', 10))} a day` },
          ]} />
          <P>Open anyone’s profile and visit their room (or their Home, if they have one). Stay {fmtN(c.n('earn.rooms.stay_seconds', 10))} seconds to check in. Visitors to a Home leave a note or a drawing in its check-in book.</P>
          <Pro>Five check-ins take a minute. Visit five friends a day and ask them to visit you: everyone earns.</Pro>
        </>
      ),
    },
    {
      id: 'invites', emoji: '💌', title: 'Inviting friends',
      summary: 'Share your invite link. When a friend confirms their email and wins their first minigame, you’re paid, plus a share of what they earn.',
      keys: 'invite referral refer friend code link reward share',
      body: (c) => (
        <>
          <Facts items={[
            { k: 'When they start playing', v: `${fmtN(c.n('referrals.reward_ink', 500))} Ink`, c: '#34C3FF' },
            { k: 'Then', v: `${fmtN(c.n('referrals.share.pct', 10))}% of their Ink`, hint: `up to ${fmtN(c.n('referrals.share.cap_ink', 1000))} per friend` },
            { k: 'Most a day', v: `${fmtN(c.n('referrals.daily_cap', 25))} invites` },
          ]} />
          <Steps items={[
            'Open Invite friends and share your link (or code).',
            'Your friend signs up with it and confirms their email.',
            'When they win their first minigame, you’re paid, and their share starts counting.',
          ]} />
          <Note>The Invite page shows “Waiting for their email” for friends who haven’t confirmed yet. Their share comes from the game; it never comes out of their Ink.</Note>
          <Combo>A party invite link is also an invite link: friends who join through it count as yours.</Combo>
          <GoRow links={[['/invite', 'Invite friends']]} />
        </>
      ),
    },
    {
      id: 'safety', emoji: '🔒', title: 'Privacy and safety',
      summary: 'Your real location is never shown. Hide any activity from the feed, block anyone, report anything.',
      keys: 'privacy safety block report hide location settings moderation',
      body: () => (
        <>
          <Bullets items={[
            'Your GPS position and your home are never shown to other players. While you’re on GPS your explorer isn’t on anyone’s map at all; out travelling, it never shows within 3 km of home or where the trip set off.',
            'Settings → Privacy lets you hide any kind of activity from the live feed, hide yourself from Online now, hide your explorer from the map, stop people watching you play, and choose who can join or invite you.',
            'Block someone from their profile or a chat. Blocks work both ways, everywhere (chat, parties, pranks, visits).',
            'Report art, chat or players. Moderators review every report.',
          ]} />
          <Warn>Never share your password or sign-in links. LANDVAS staff will never ask for them.</Warn>
        </>
      ),
    },
  ],
};
