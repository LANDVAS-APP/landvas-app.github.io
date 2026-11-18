// The app's Together hub: everything social in one place — your party, open lobbies and games looking for players,
// people to team up with, who's live to watch, friends online, the global chat, invites and clans.
import { useQuery } from '@tanstack/react-query';
import { Gift, Images, MessagesSquare, PartyPopper, Shield, UserPlus, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '../../backend/api';
import { useOnboardedMe } from '../../lib/queries';
import { fmt } from '../../lib/utils';
import { poll } from '../../lib/poll';
import { buzz, isNative } from '../../native/native';
import { PartyHubCard, useLfg } from '../../party/PartyButtons';
import { LOBBIES_KEY, activityOf, useParty, usePartyUi } from '../../party/party';
import { PlayerAvatar } from '../../ui';
import { LiveNow } from '../../watch/LiveNow';
import { describeWhereabouts } from '../../social/activity';
import { HeroButton, HubCard, HubH2, HubHero, HubJump, HubLearn, HubPage, HubRow, rise } from './HubKit';
import { Link } from 'react-router-dom';

export default function TogetherHub() {
  const me = useOnboardedMe();
  const party = useParty();
  const show = usePartyUi((s) => s.show);
  const g = party.data?.group;
  const lobbies = useQuery({ queryKey: [...LOBBIES_KEY, null], queryFn: () => api.partyLobbies(null), staleTime: 30_000, refetchInterval: poll(60_000), enabled: !!me });
  const lfg = useLfg();
  const friends = useQuery({ queryKey: ['friends'], queryFn: api.myFriends, enabled: !!me, staleTime: 60_000 });
  const refs = useQuery({ queryKey: ['referrals'], queryFn: api.myReferrals, enabled: !!me, staleTime: 5 * 60_000 });
  const games = lfg.data?.items ?? [];
  const open = (lobbies.data?.lobbies ?? []).filter((l) => !l.mine && !l.full);
  const solo = (lobbies.data?.players ?? []).slice(0, 12);
  const online = (friends.data?.friends ?? []).filter((f) => f.now?.online);
  const incoming = friends.data?.incoming.length ?? 0;
  const real = refs.data?.stats.real ?? refs.data?.stats.rewarded ?? 0;

  return (
    <HubPage tone="together" id="together-hub">
      <HubHero kicker="Together" icon={<Users className="h-3.5 w-3.5" />} art="🎉" title="Play with people"
        sub="Parties, open play, live watching and chat — meet someone new every time you play."
        stats={[
          { label: 'Online', value: fmt(lobbies.data?.online_count ?? 0), testid: 'together-online' },
          { label: 'Friends', value: fmt(online.length), testid: 'together-friends' },
          { label: 'Lobbies', value: fmt(lobbies.data?.lobbies.length ?? 0) },
          { label: 'Need you', value: fmt(games.length), hot: games.length > 0, testid: 'together-lfg' },
        ]}
        actions={<>
          <HeroButton onClick={() => show(g ? 'party' : 'lobbies')} testid="together-party"><PartyPopper className="h-4 w-4" /> {g ? 'Your party' : 'Find a party'}</HeroButton>
          <HeroButton onClick={() => show('invite')} ghost testid="together-invite"><UserPlus className="h-4 w-4" /> Invite</HeroButton>
        </>} />

      <HubJump tone="emerald" items={[
        { to: '/social', label: 'Feed & chat', icon: MessagesSquare },
        { to: '/party', label: 'Parties', icon: PartyPopper },
        { to: '/clans', label: 'Clans', icon: Shield },
        { to: '/players', label: 'Players', icon: Users },
        { to: '/gallery', label: 'Gallery', icon: Images },
        { to: '/invite', label: 'Invite', icon: Gift },
      ]} />

      <motion.div {...rise(2)} className="mt-5"><PartyHubCard /></motion.div>
      {/* 📱 the apps: knock phones with a friend */}
      {isNative() && (
        <motion.div {...rise(2)} className="mt-3 lvh-list">
          <HubRow tone="teal" to="/outside" testid="together-bump" lead={<span className="lvh-emo !h-11 !w-11 !rounded-[14px] !text-[21px]">🤜</span>}
            title="Bump a friend" sub="Knock phones together to hand them a gift — a party pile-up gives everyone a Golden Hour" wrap action={<span className="lvh-go">Bump</span>} />
        </motion.div>
      )}

      {/* games waiting for players, then open lobbies */}
      <HubH2 note="Anyone online can be joined" i={3}>Jump in</HubH2>
      <motion.div {...rise(3)} className="lvh-list" data-testid="together-jump-in">
        {games.slice(0, 4).map((it) => (
          <HubRow key={`${it.kind}-${it.id}`} tone="emerald" testid="together-lfg-row" onClick={() => show('lobbies')}
            lead={<span className="lvh-emo !h-11 !w-11 !rounded-[14px] !text-[21px]">{it.emoji ?? '🎮'}</span>}
            title={it.title} sub={`@${it.host.username} · ${it.players}/${it.max} players · ${it.where}`} action={<span className="lvh-go">JOIN</span>} />
        ))}
        {open.slice(0, Math.max(0, 4 - games.length)).map((l) => {
          const a = activityOf(l.activity);
          return (
            <HubRow key={l.id} tone="teal" testid="together-lobby-row" onClick={() => show('lobbies')}
              lead={<span className="lvh-emo !h-11 !w-11 !rounded-[14px] !text-[21px]">{a.emoji}</span>}
              title={l.name} sub={`${a.label} · 🟢 ${l.online} online · ${l.size}/${l.max}${l.friends ? ` · ${l.friends} friend${l.friends === 1 ? '' : 's'}` : ''}`} action={<span className="lvh-go soft">Join</span>} />
          );
        })}
        {!games.length && !open.length && (
          <HubRow tone="emerald" testid="together-start" onClick={() => show('lobbies')} lead={<span className="lvh-emo !h-11 !w-11 !rounded-[14px] !text-[21px]">🎈</span>}
            title="Start the first party" sub="Public parties are listed for everyone online — busiest first" wrap action={<span className="lvh-go">Start</span>} />
        )}
      </motion.div>

      {/* people on their own, open to being joined */}
      {solo.length > 0 && (
        <>
          <HubH2 note="Tap to team up" i={4}>Up for company</HubH2>
          <div className="lvh-rail" data-testid="together-solo">
            {solo.map((p) => (
              <button key={p.id} type="button" className="lvh-orb" style={{ ['--c' as string]: p.friend ? '#3DDC97' : '#34C3FF' }} onClick={() => { buzz('light'); show('lobbies'); }}>
                <span className="o !text-[0]"><PlayerAvatar p={p} size={60} className="!rounded-full" /></span>
                <span className="lb">@{p.username}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* who's live to watch */}
      <motion.div {...rise(5)} className="mt-5"><LiveNow /></motion.div>

      {online.length > 0 && (
        <>
          <HubH2 note={`${online.length} online`} i={6}>Friends online</HubH2>
          <motion.div {...rise(6)} className="lvh-list" data-testid="together-friends-online">
            {online.slice(0, 6).map((f) => (
              <HubRow key={f.player.id} tone="emerald" to={`/u/${encodeURIComponent(f.player.username)}`} lead={<PlayerAvatar p={f.player} size={42} />}
                title={f.player.display_name || `@${f.player.username}`} sub={f.now ? describeWhereabouts(f.now) || 'Online' : 'Online'} />
            ))}
          </motion.div>
        </>
      )}

      <HubH2 i={7}>Everyone, everywhere</HubH2>
      <div className="lvh-grid" data-testid="together-cards">
        <HubCard tone="teal" emoji="💬" title="Global chat" isNew sub="One chat for everyone playing — on the map, in arcades and in houses" to="/social?tab=chat" testid="together-chat" />
        <HubCard tone="azure" emoji="👀" title="Watch live" isNew sub="See someone’s screen as they play, react, then join them" to="/handbook/social#watch" testid="together-watch" />
        <HubCard tone="rose" emoji="💌" title="Invite friends" isNew sub="Referral tiers, bonuses you pick and your own invite card" value={real ? `${fmt(real)} joined` : undefined} to="/invite" testid="together-invites" />
        <HubCard tone="gold" emoji="🤝" title="Friends" sub={incoming ? `${incoming} friend request${incoming === 1 ? '' : 's'} waiting` : 'Requests, friends and who’s online'} value={incoming ? fmt(incoming) : undefined} hot={incoming > 0} to="/social?tab=friends" testid="together-friends-card" />
        <HubCard tone="emerald" emoji="🌱" title="Helping hands" sub="Water other players’ crops: +1 Ink each, up to 8 a day per farm" to="/handbook/places#farm" testid="together-help" />
        <HubCard tone="violet" emoji="🛡️" title="Clans" sub="Team up for good, build your Clan Keep" to="/clans" testid="together-clans" />
      </div>
      <motion.p {...rise(8)} className="lvh-note mt-3">
        Rather not be joined, watched or shown on the map? <Link to="/settings" className="font-bold text-white underline">Settings → Privacy</Link> switches any of it off.
      </motion.p>

      <HubLearn links={[
        { to: '/handbook/social#party', label: '🎉 Parties & open play' }, { to: '/handbook/social#explorers', label: '🧭 Players on the map' },
        { to: '/handbook/social#watch', label: '👀 Watching' }, { to: '/handbook/social#invites', label: '💌 Inviting friends' },
        { to: '/handbook/social#clans', label: '🛡️ Clans' }, { to: '/handbook/social#safety', label: '🔒 Privacy & safety' },
      ]} />
    </HubPage>
  );
}
