// Social: the live feed of what everyone is doing, the global chat, and friends.
import { isNative } from '../native/native';
import { rarityInfo } from '../shared/rarity';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Award, Ban, Brush, DoorOpen, Flag, Gift, Hand, Loader2, MessageCircle, MoreHorizontal, Radio, Send, ShieldAlert, Sparkles, Trash2, UserPlus, Users, VolumeX, Gamepad2, Swords, Trophy, Star } from 'lucide-react';
import { dedupe, reconcile } from './feedList';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { ChatMessage, FeedEvent } from '../backend/types';
import { useSession } from '../app/App';
import { Page, PageHeader } from '../app/Shell';
import { useOnboardedMe } from '../lib/queries';
import { cn, fmt, timeAgo } from '../lib/utils';
import { ArtThumb } from '../gallery/GalleryScreen';
import { GAME_INFO, type GameId } from '../shared/minigames';
import { PVP_INFO, type PvpGame } from '../shared/pvp';
import { RarityBadge } from '../plot/RarityBadge';
import { PLOT_TYPES } from '../map/plotStyle';
import { Button, Dialog, Empty, PlayerAvatar, Spinner, Tabs, inputCls, useConfirm } from '../ui';
import { FriendButton } from './FriendButton';
import { Rocket } from 'lucide-react';
import { canWarpTo, describeWhereabouts, registerGameNames, useWarpTo } from './activity';
import { PlanetBall } from '../space/PlanetBall';
import { exoWorld, worldOf } from '../space/worlds';
import { PLANET_GAMES } from '../space/planetGames';
import { SPACE_GAMES } from '../space/games';
import { GAMES as INK_GAMES } from '../inkborn/games/engines';
import { poll, live } from '../lib/poll';
import { useNudge } from '../lib/nudge';
import { KINDS as ENCH } from '../enchant/kinds';
import { NATIVE_APP } from '../app/buildFlags';

registerGameNames(Object.fromEntries([
  ...Object.entries(PLANET_GAMES).map(([k, v]) => [k, v.name]), ...Object.entries(SPACE_GAMES).map(([k, v]) => [k, v.name]),
  ...Object.entries(INK_GAMES).map(([k, v]) => [k, v.name]), ...Object.entries(GAME_INFO).map(([k, v]) => [k, (v as { name: string }).name]),
]));

const TABS = [
  { value: 'feed', label: 'Live feed' },
  { value: 'chat', label: 'Chat' },
  { value: 'friends', label: 'Friends' },
  { value: 'banned', label: 'Banned' },
];

export default function SocialScreen() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'feed';
  const me = useOnboardedMe();
  const friends = useQuery({ queryKey: ['friends'], queryFn: api.myFriends, enabled: !!me, refetchInterval: poll(120_000) });
  const incoming = friends.data?.incoming.length ?? 0;
  return (
    <Page wide>
      <PageHeader eyebrow="Together" title="Social" actions={isNative() ? undefined : <>
        <Link to="/players" className="glass flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-muted hover:text-fg"><Users className="h-4 w-4" /> Players</Link>
        {me && <Link to="/invite" className="glass flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-gold hover:text-fg" data-testid="social-invite"><Gift className="h-4 w-4" /> Invite</Link>}
      </>}>
        See what everyone is claiming and painting right now, talk with the whole world, and keep your friends close.
      </PageHeader>
      <Tabs value={tab} onValueChange={(v) => setParams((p) => { p.set('tab', v); return p; }, { replace: true })} className="mb-4"
        items={TABS.map((t) => ({ value: t.value, label: t.value === 'friends' && incoming ? <span className="flex items-center gap-1.5">Friends <span className="rounded-full bg-hot px-1.5 text-[11px] font-bold text-white tnum">{incoming}</span></span> : t.label }))} />
      {tab === 'feed' && <FeedTab />}
      {tab === 'chat' && <ChatTab />}
      {tab === 'friends' && <FriendsTab />}
      {tab === 'banned' && <BannedTab />}
    </Page>
  );
}

// ---- live feed ---------------------------------------------------------------------------

function FeedTab() {
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  const [older, setOlder] = useState<'idle' | 'loading' | 'done'>('idle');
  const newest = useRef<number | null>(null);
  const loaded = useRef(0);
  useEffect(() => { loaded.current = events?.length ?? 0; }, [events]);
  const poll = useCallback(async () => {
    try {
      // re-read the whole top of the feed (not just what's new), so anything a player has since hidden in their
      // privacy settings — past posts too — drops off screens right away
      const want = Math.min(100, Math.max(40, loaded.current));
      const fresh = await api.feed(null, null, want);
      if (fresh.length) newest.current = Math.max(newest.current ?? 0, fresh[0].id);
      setEvents((e) => reconcile(e ?? [], fresh, want));
    } catch {
      setEvents((e) => e ?? []);
    }
  }, []);
  // the server nudges the feed (at most every 5 s) when something new is posted; look once more just after, so the
  // last thing in a burst still shows
  useNudge('feed', poll, { safetyMs: 120_000, fallbackMs: 8000, gapMs: 2000, trailMs: 6000 });
  const loadOlder = async () => {
    if (!events?.length) return;
    setOlder('loading');
    try {
      const more = await api.feed(null, events[events.length - 1].id, 40);
      setEvents((e) => dedupe([...(e ?? []), ...more]));
      setOlder(more.length < 40 ? 'done' : 'idle');
    } catch { setOlder('idle'); }
  };
  if (!events) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!events.length) return <Empty icon={<Radio className="h-6 w-6" />} title="Quiet right now">Claims, new art and badges from everyone show up here live.</Empty>;
  return (
    <div className="mx-auto grid max-w-2xl gap-2" data-testid="feed">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted"><span className="lv-live"><i /> Live</span> Updates every few seconds · no locations, ever</div>
      <AnimatePresence initial={false}>
        {events.map((e) => (
          <motion.div key={e.id} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <FeedRow e={e} />
          </motion.div>
        ))}
      </AnimatePresence>
      {older !== 'done' && events.length >= 20 && (
        <Button variant="ghost" className="mt-2 justify-self-center" loading={older === 'loading'} onClick={loadOlder}>Show older</Button>
      )}
    </div>
  );
}



function FeedRow({ e }: { e: FeedEvent }) {
  const p = e.player;
  const me = useOnboardedMe();
  const warpTo = useWarpTo();
  const nav = useNavigate();
  const who = <Link to={`/u/${p.username}`} className="font-bold hover:underline">@{p.username}</Link>;
  let icon = <Sparkles className="h-4 w-4 text-accent-2" />;
  let body: React.ReactNode = null;
  let extra: React.ReactNode = null;
  switch (e.kind) {
    case 'join':
      icon = <Hand className="h-4 w-4 text-gold" />;
      body = <>{who} joined LANDVAS — say hi!</>;
      break;
    case 'claim': {
      const t = e.data.plot_type as keyof typeof PLOT_TYPES | undefined;
      icon = <Flag className="h-4 w-4 text-ok" />;
      body = <>{who} {e.data.starter ? 'claimed their first plot' : e.data.shiny ? <b className="bg-[linear-gradient(90deg,#FF7AE0,#FFE14D,#22E3FF)] bg-clip-text text-transparent">claimed a ✨ SHINY plot</b> : 'claimed a plot'}{t && PLOT_TYPES[t] ? <> · <span className="text-muted">{PLOT_TYPES[t].name}</span></> : null}</>;
      if (e.data.rarity) extra = <RarityBadge r={e.data.rarity} small />;
      break;
    }
    case 'publish':
      icon = <Brush className="h-4 w-4 text-hot" />;
      body = <>{who} published <Link to={`/art/${e.data.publication_id}`} className="font-semibold hover:underline">“{e.data.title}”</Link>{e.data.plot_count > 1 ? <span className="text-muted"> · {e.data.plot_count} plots</span> : null}</>;
      extra = e.data.thumb_path ? <Link to={`/art/${e.data.publication_id}`}><ArtThumb card={{ thumb_path: e.data.thumb_path, title: e.data.title }} className="h-14 w-14 rounded-xl" /></Link> : null;
      break;
    case 'achievement':
      icon = <Award className="h-4 w-4 text-gold" />;
      body = <>{who} earned the <b>{e.data.name}</b> badge</>;
      break;
    case 'referral':
      icon = <Gift className="h-4 w-4 text-gold" />;
      body = <>{who} invited a friend{Number(e.data.reward_ink) > 0 ? <> and earned <b className="tnum">{fmt(e.data.reward_ink)} Ink</b></> : null}</>;
      break;
    case 'level':
      icon = <Sparkles className="h-4 w-4 text-accent-2" />;
      body = <>{who} reached artist level <b>{e.data.level}</b></>;
      break;    case 'minigame':
      icon = <Gamepad2 className="h-4 w-4 text-ok" />;
      body = <>{who} cleared <b>{GAME_INFO[e.data.game as GameId]?.name ?? e.data.game}</b> level {e.data.level}{Number(e.data.stars) > 0 ? <span className="text-gold"> {'★'.repeat(Math.min(3, Number(e.data.stars)))}</span> : null}</>;
      break;
    case 'challenge':
      icon = <Trophy className="h-4 w-4 text-gold" />;
      body = <>{who} placed <b>{['1st', '2nd', '3rd'][Number(e.data.place) - 1] ?? `#${e.data.place}`}</b> in the <Link to="/challenges" className="font-semibold hover:underline">“{e.data.title}”</Link> challenge</>;
      break;
    case 'featured':
      icon = <Star className="h-4 w-4 text-gold" />;
      body = <>{who}’s <Link to={`/art/${e.data.publication_id}`} className="font-semibold hover:underline">“{e.data.title}”</Link> was Featured by the LANDVAS team</>;
      break;
    case 'pvp':
      icon = <Swords className="h-4 w-4 text-hot" />;
      body = <>{who} won a <b>{PVP_INFO[e.data.game as PvpGame]?.name ?? e.data.game}</b> PvP match{e.data.rounds ? <span className="text-muted"> · {e.data.rounds_won}/{e.data.rounds} rounds</span> : null}</>;
      break;
    case 'sketch':
      icon = <Trophy className="h-4 w-4 text-accent-2" />;
      body = <>{who} placed <b>{['1st', '2nd', '3rd'][Number(e.data.place) - 1] ?? `#${e.data.place}`}</b> in <Link to="/sketch" className="font-semibold hover:underline">Sketch of the Day</Link> · “{e.data.word}”</>;
      break;
    case 'duet':
      icon = <Star className="h-4 w-4 text-hot" />;
      body = <>{who} finished a <Link to={`/duet/${e.data.duet_id}`} className="font-semibold hover:underline">duet: {e.data.prompt}</Link></>;
      break;
    case 'planet_plot': {
      const w = worldOf(e.data.world as string);
      icon = <Flag className="h-4 w-4 text-[#B69CFF]" />;
      body = <>{who} claimed a plot on <b>{w?.name ?? 'a far-off world'}</b>{e.data.rarity ? <span className="ml-1 rounded-full bg-[#B69CFF]/20 px-1.5 text-[10px] font-black uppercase text-[#B69CFF]">{e.data.rarity}</span> : null}</>;
      extra = w ? <PlanetBall w={w} size={36} /> : null;
      break;
    }
    case 'settle': {
      const w = exoWorld(Number(e.data.seed), e.data.name as string);
      icon = <Rocket className="h-4 w-4 text-gold" />;
      body = <>{who} settled a new world: <b>{e.data.name}</b> 🏡</>;
      extra = <PlanetBall w={w} size={44} />;
      break;
    }
    case 'exploring': {
      const w = worldOf(e.data.world as string);
      const room = e.data.live && Number(e.data.in_room) < Number(e.data.room_size);
      icon = <Rocket className="h-4 w-4 text-[#7FE3FF]" />;
      body = <>{who} is exploring <b>{w?.name ?? 'space'}</b>{e.data.live ? <span className="text-muted"> · {e.data.in_room}/{e.data.room_size} in the group</span> : <span className="text-muted"> · earlier</span>}</>;
      extra = room && me ? <Button size="sm" variant="rainbow" onClick={() => void warpTo(p)} data-testid="feed-join">Join</Button> : w ? <PlanetBall w={w} size={36} /> : null;
      break;
    }
    case 'playdate':
      icon = <Star className="h-4 w-4 text-[#FF8FB1]" />;
      body = <>{who} took <b>{e.data.mine}</b> on a playdate with @{e.data.host}’s <b>{e.data.theirs}</b>{e.data.eggs ? ' — and they both got an egg! 🥚' : ''}</>;
      extra = e.data.habitat ? <Link to={`/habitat/${e.data.habitat}`}><Button size="sm" variant="secondary">Visit</Button></Link> : null;
      break;
    case 'dig':
      icon = <Sparkles className="h-4 w-4 text-[#FFB13D]" />;
      body = <>{who} dug through to <b>{e.data.layer}</b> on {worldOf(e.data.world as string)?.name ?? 'a far-off world'} ⛏️ <span className="text-muted">· {fmt(Number(e.data.depth))} m deep</span></>;
      break;
    case 'core':
      icon = <Sparkles className="h-4 w-4 text-[#FF7A1A]" />;
      body = <>{who} dug all the way to <b className="text-[#FF7A1A]">the core</b> of {worldOf(e.data.world as string)?.name ?? 'a far-off world'} 💖 <span className="text-muted">· a Core rarity plot</span></>;
      break;
    case 'base':
      icon = <Sparkles className="h-4 w-4 text-[#7FE3FF]" />;
      body = <>{who} built a base on {worldOf(e.data.world as string)?.name ?? 'a far-off world'} 🏗️ <span className="text-muted">· {e.data.modules} modules</span></>;
      break;
    case 'harvest':
      icon = <Sparkles className="h-4 w-4 text-[#E0A800]" />;
      body = <>{who} harvested <b className="text-gold">{Number(e.data.golden)} golden crop{Number(e.data.golden) === 1 ? '' : 's'}</b> 🌾</>;
      extra = e.data.farm && me ? <Button size="sm" variant="secondary" onClick={() => nav(`/farm/${e.data.farm}`)}>Visit</Button> : null;
      break;
    case 'ipo':
      icon = <Sparkles className="h-4 w-4 text-[#D4A500]" />;
      body = <>{who} took their business public 📈{Number(e.data.ipos) > 1 ? <span className="text-muted"> · IPO #{Number(e.data.ipos)}</span> : null}</>;
      break;
    case 'arcade': {
      // arcade moments: playing now (join them!), records, big prizes, arcade gear, levels and new machines
      const d = e.data as Record<string, any>;
      const where = d.arcade_id ? <Link to={`/arcade/${d.arcade_id}`} className="font-semibold hover:underline">{d.owner_id === p.id ? 'their arcade' : d.arcade}</Link> : null;
      const fresh = Date.now() - new Date(e.created_at).getTime() < 20 * 60_000;
      icon = <Gamepad2 className="h-4 w-4 text-[#FF3D9A]" />;
      if (d.sub === 'playing') body = <>{who} is playing <b>{d.emoji} {d.game_name}</b>{d.mode === 'endless' ? <span className="text-muted"> (endless)</span> : null} at {where}{fresh ? <span className="ml-1 rounded-full bg-[#FF3D9A]/15 px-1.5 text-[10px] font-black uppercase text-[#FF3D9A]">live</span> : null}</>;
      else if (d.sub === 'record') { icon = <Trophy className="h-4 w-4 text-gold" />; body = <>{who} set {d.world ? <b className="text-gold">the top score anywhere</b> : 'a new high score'} on <b>{d.emoji} {d.game_name}</b> at {where} · <b className="tnum">{fmt(Number(d.score))}</b>{d.mode === 'endless' ? <span className="text-muted"> endless</span> : null}</>; }
      else if (d.sub === 'prize') body = <>{who} won a <b>{d.emoji} {d.prize}</b> at the prize counter <span className="text-muted">· {fmt(Number(d.tickets))} 🎟️</span></>;
      else if (d.sub === 'cosmetic') { icon = <Sparkles className="h-4 w-4 text-[#FF3D9A]" />; body = <>{who} unlocked arcade {d.for === 'inkborn' ? 'Inkborn wear' : 'gear'}: <b>{d.emoji} {d.name}</b></>; }
      else if (d.sub === 'level') { icon = <Star className="h-4 w-4 text-[#8B5CFF]" />; body = <>{where} reached <b>arcade level {d.level}</b> 🕹️</>; }
      else if (d.sub === 'install') body = <>{who} installed <b>{d.emoji} {d.game_name}</b> in {where}</>;
      if (d.arcade_id && ['playing', 'record', 'install', 'level'].includes(d.sub)) {
        const live = d.sub === 'playing' && fresh;
        extra = me ? <Button size="sm" variant={live ? 'rainbow' : 'secondary'} onClick={() => nav(`/arcade/${d.arcade_id}`)} data-testid="feed-join-arcade">{live ? '🕹️ Join' : 'Visit'}</Button> : null;
      }
      break;
    }
    case 'luck': {
      const d = e.data as Record<string, any>;
      icon = <span className="text-[12px] leading-none">🍀</span>;
      if (d.sub === 'pick') {
        body = <>{who} rolled <b>{d.of}</b> times with Luck and kept a <b style={{ color: rarityInfo(d.rarity).color }}>{rarityInfo(d.rarity).emoji ?? ''} {rarityInfo(d.rarity).name}</b></>;
        extra = <RarityBadge r={d.rarity} small />;
      } else {
        const what = d.what === 'ink' ? <><b className="tnum">{fmt(Number(d.ink))} Ink</b></> : d.what === 'inkborn' ? <>their Inkborn <b>{d.name}</b> 🐾</> : d.what === 'egg' ? <>a <b>{d.egg}</b> egg 🥚</> : <>a <b style={{ color: rarityInfo(d.rarity).color }}>{rarityInfo(d.rarity).name}</b>{d.shiny ? ' ✨' : ''} plot</>;
        if (d.sub === 'enchant') { body = <>{who} bought <b className="text-[#C9A0FF]">✨ {d.gained} Enchanted Luck</b> — their next roll is {d.pct}% Enchanted</>; break; }
        body = <>{who} sacrificed {what} at the Altar of Luck <span className="text-[#3DDC97]">· +{d.gained} 🍀</span>{d.luck != null ? <span className="text-muted"> (Luck {d.luck})</span> : null}</>;
      }
      break;
    }
    case 'enchant': {
      const d = e.data as Record<string, any>;
      const k = ENCH[d.kind as keyof typeof ENCH];
      icon = <span className="text-[12px] leading-none">✨</span>;
      body = d.sub === 'born' ? <>{who} rolled an <b className="text-[#C9A0FF]">Enchanted</b> plot: <b style={{ color: k?.a }}>{k?.emoji} {k?.name} #{d.serial}</b>{d.place ? <span className="text-muted"> · {d.place}</span> : null}</>
        : d.sub === 'hybrid' ? <>{who} spliced a resonant hybrid: <b className="text-[#00F5D4]">🧬 {d.hybrid}</b></>
        : d.sub === 'hope' ? <>{who} released all seven evils from <b style={{ color: k?.a }}>🏺 Pandora’s Box</b> — and <b>Hope</b> 🦋 came out</>
        : d.sub === 'symbiote' ? <>{who}’s <b style={{ color: k?.a }}>🦠 Parasite</b> evolved into a <b className="text-[#3DDC97]">💚 Symbiote</b></>
        : d.sub === 'genie_freed' ? <>{who} made the Forbidden Wish — and <b style={{ color: k?.a }}>🧞 the Genie went free</b></>
        : d.sub === 'treasure' ? <>{who} dug up a <b className="text-gold">🧰 treasure chest</b> with a Legendary+ roll ticket</>
        : d.sub === 'shatter' ? <>{who}’s <b style={{ color: k?.a }}>🪞 Mirror Shard</b> shattered after seven reflections</>
        : <>{who} did something enchanted</>;
      break;
    }
    case 'crown': {
      const d = e.data as Record<string, any>;
      const tier = d.tier === 'crown_country' ? 'Country' : d.tier === 'crown_state' ? 'State' : 'City';
      icon = <span className="text-[12px] leading-none">👑</span>;
      body = <>{who} claimed the <b style={{ color: rarityInfo(d.tier).color }}>{tier} Crown of {d.place}</b>{d.tier !== 'crown_country' && d.country ? <span className="text-muted"> · {d.country}</span> : null} 👑</>;
      extra = <RarityBadge r={d.tier} small />;
      break;
    }
    case 'flight':
      icon = <span className="text-[12px] leading-none">✈️</span>;
      body = e.data.hot ? <>{who} flew to the <b className="text-[#FF8A3D]">🔥 {String(e.data.to).replace('Hot Zone · ', 'Hot Zone in ')}</b></> : <>{who} dropped a pin and flew off somewhere ✈️</>;
      break;
    case 'estate':
      icon = <span className="text-[12px] leading-none">🏘️</span>;
      body = <>{who} finished their estate’s checklist — <b className="text-gold">{e.data.mult}× rent</b> on the 1st for {e.data.houses} house{Number(e.data.houses) === 1 ? '' : 's'} 💵</>;
      break;
    case 'moderation':
      return <ModerationFeedRow e={e} />;
    case 'stamp':
      icon = <Star className="h-4 w-4 text-gold" />;
      body = <>{who} collected stamp <b>#{e.data.serial}</b> of <Link to={`/art/${e.data.publication_id}`} className="font-semibold hover:underline">“{e.data.title}”</Link></>;
      break;
  }
  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-3" data-testid="feed-row" data-kind={e.kind}>
      <Link to={`/u/${p.username}`} className="relative shrink-0">
        <PlayerAvatar p={p} size={38} />
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-bg-2 shadow">{icon}</span>
      </Link>
      <div className="min-w-0 flex-1 text-sm">
        <div className="break-words">{body}</div>
        <div className="text-[11.5px] text-faint">{timeAgo(e.created_at)}</div>
      </div>
      {extra && <div className="shrink-0">{extra}</div>}
    </div>
  );
}

// ---- global chat ---------------------------------------------------------------------------

/** a ban or suspension on the live feed: red, unmissable */
function ModerationFeedRow({ e }: { e: FeedEvent }) {
  const d = e.data as { action?: string; until?: string | null; summary?: string };
  const ban = d.action === 'ban';
  return (
    <div className="rounded-2xl border-2 border-[#FF3D6E] bg-[#FF3D6E]/12 p-3 shadow-[0_0_24px_-6px_rgba(255,61,110,0.6)]" data-testid="feed-moderation" data-kind="moderation" role="status">
      <div className="mb-1 flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 shrink-0 text-[#FF3D6E]" />
        <span className="text-[11px] font-black uppercase tracking-widest text-[#FF3D6E]">{ban ? 'Player banned' : 'Player suspended'}</span>
        <span className="ml-auto text-[11px] text-faint">{timeAgo(e.created_at)}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <PlayerAvatar p={e.player} size={34} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold leading-snug">{d.summary}</p>
          <p className="text-[11px] text-muted">@{e.player.username} · {ban ? 'banned' : 'suspended'} by the LANDVAS team for cheating or abusing the game.</p>
        </div>
      </div>
      <Link to="/social?tab=banned" className="mt-2 inline-block text-[11px] font-bold text-[#FF3D6E] hover:underline">See all banned players →</Link>
    </div>
  );
}

/** everyone currently banned or suspended, newest first, with why — and a search */
function BannedTab() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const r = useQuery({ queryKey: ['banned', query], queryFn: () => api.bannedPlayers(query), staleTime: 30_000 });
  const rows = (r.data?.rows ?? []) as { player: FeedEvent['player']; action: 'ban' | 'suspend'; until: string | null; summary: string; at: string }[];
  return (
    <div className="mx-auto grid max-w-2xl gap-3" data-testid="banned-tab">
      <div className="glass flex items-start gap-3 rounded-2xl border border-[#FF3D6E]/40 p-3.5">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#FF3D6E]" />
        <p className="text-sm text-muted">Players banned or suspended for cheating or abusing LANDVAS — self-referring, alt accounts, bots, farming Ink between accounts. {r.data ? <b className="text-fg">{fmt(r.data.total)} right now.</b> : null}</p>
      </div>
      <input className={cn(inputCls, 'h-11')} placeholder="Search a player" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search banned players" data-testid="banned-search" />
      {r.isLoading ? <div className="flex justify-center py-10"><Spinner /></div> : !rows.length ? (
        <Empty icon={<ShieldAlert className="h-6 w-6" />} title={query ? `No banned player matches “${query}”` : 'No one is banned right now'}>Play fair and it stays that way.</Empty>
      ) : (
        <div className="grid gap-2" data-testid="banned-list">
          {rows.map((b) => (
            <div key={b.player.id} className="glass flex items-center gap-3 rounded-2xl p-3 pl-4" style={{ boxShadow: "inset 4px 0 0 #FF3D6E, inset 0 0 0 1px rgba(255,61,110,0.35)" }} data-testid="banned-row">
              <Link to={`/u/${b.player.username}`} className="shrink-0"><PlayerAvatar p={b.player} size={40} /></Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link to={`/u/${b.player.username}`} className="font-bold hover:underline">@{b.player.username}</Link>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black uppercase', b.action === 'ban' ? 'bg-[#FF3D6E] text-white' : 'bg-[#FF8A3D]/20 text-[#FF8A3D]')}>
                    {b.action === 'ban' ? 'Banned' : `Suspended${b.until ? ` until ${new Date(b.until).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}`}
                  </span>
                  <span className="ml-auto text-[11px] text-faint">{timeAgo(b.at)}</span>
                </div>
                <p className="mt-0.5 break-words text-sm">{b.summary}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const REPORT_REASONS = [
  { id: 'harassment', label: 'Rude, hateful or bullying' },
  { id: 'spam', label: 'Spam or a scam' },
  { id: 'personal_info', label: 'Shares someone’s personal info' },
  { id: 'inappropriate', label: 'Sexual or inappropriate' },
  { id: 'other', label: 'Something else' },
];

function ChatTab() {
  const session = useSession();
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [info, setInfo] = useState<{ enabled: boolean; muted_until: string | null }>({ enabled: true, muted_until: null });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState<ChatMessage | null>(null);
  const lastId = useRef<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // moderating the chat is for the website and the admin portal, never the apps
  const mod = !NATIVE_APP && !!me?.roles?.some((r) => ['owner', 'admin', 'moderator'].includes(r));

  const load = useCallback(async (reset: boolean) => {
    try {
      const r = await api.chatRecent(reset ? null : lastId.current);
      setInfo({ enabled: r.enabled, muted_until: r.muted_until });
      const newest = r.messages[r.messages.length - 1]?.id;
      if (newest) lastId.current = Math.max(reset ? 0 : lastId.current ?? 0, newest);
      setMsgs((m) => (reset ? r.messages : dedupe([...(m ?? []), ...r.messages]).slice(-200)));
    } catch {
      setMsgs((m) => m ?? []);
    }
  }, []);
  useEffect(() => {
    if (!me) return;
    void load(true);
    let n = 0;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      // a full refresh now and then also drops messages moderators removed
      void load(++n % 24 === 0);
    }, live(4000));
    return () => clearInterval(t);
  }, [me, load]);
  useLayoutEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  if (!session || !me) {
    return <Empty icon={<MessageCircle className="h-6 w-6" />} title="Join the conversation" action={<Link to="/welcome?next=/social?tab=chat" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white">Sign in to chat</Link>}>Talk with players all over the world.</Empty>;
  }
  const muted = info.muted_until && new Date(info.muted_until) > new Date();
  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const m = await api.sendChat(body);
      setText('');
      stick.current = true;
      lastId.current = Math.max(lastId.current ?? 0, m.id);
      setMsgs((x) => dedupe([...(x ?? []), m]).slice(-200));
    } catch (e) {
      toast.error(toGameError(e).message);
    } finally {
      setSending(false);
    }
  };
  const block = async (m: ChatMessage) => {
    if (!(await confirm({ title: `Block @${m.player.username}?`, body: 'You won’t see their messages or art any more. You can unblock them from their profile or Settings.', confirm: 'Block' }))) return;
    try { await api.blockPlayer(m.player.id, true); toast.success(`@${m.player.username} is blocked`); void load(true); void qc.invalidateQueries({ queryKey: ['profile'] }); } catch (e) { toast.error(toGameError(e).message); }
  };
  const remove = async (m: ChatMessage) => {
    if (NATIVE_APP) return;
    try { await api.admin.deleteChat(m.id, 'Removed by a moderator'); setMsgs((x) => (x ?? []).filter((y) => y.id !== m.id)); toast.success('Message removed'); } catch (e) { toast.error(toGameError(e).message); }
  };
  const mute = async (m: ChatMessage) => {
    if (NATIVE_APP) return;
    try { await api.admin.mutePlayer(m.player.id, 60, 'Muted from the chat'); toast.success(`@${m.player.username} is muted for an hour`); } catch (e) { toast.error(toGameError(e).message); }
  };
  return (
    <div className="mx-auto grid max-w-3xl gap-3">
      <div className="glass flex h-[min(64dvh,640px)] flex-col overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <span className="flex items-center gap-2 text-sm font-bold"><MessageCircle className="h-4 w-4 text-accent-2" /> Global chat</span>
          <span className="lv-live"><i /> Live</span>
        </div>
        <div ref={list} className="min-h-0 flex-1 overflow-y-auto px-2 py-2 scroll-thin" data-testid="chat-list"
          onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
          {!msgs ? <div className="flex justify-center py-10"><Spinner /></div> : !msgs.length ? (
            <p className="px-3 py-10 text-center text-sm text-muted">No messages yet — say hello to the world 👋</p>
          ) : msgs.map((m, i) => {
            const prev = msgs[i - 1];
            const grouped = prev && prev.player.id === m.player.id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 3 * 60_000;
            const mine = m.player.id === me.profile.id;
            return (
              <div key={m.id} className={cn('group flex gap-2.5 rounded-xl px-2 hover:bg-surface-2/50', grouped ? 'py-0.5' : 'mt-1.5 py-1', m.deleted && 'opacity-50')} data-testid="chat-message">
                <div className="w-8 shrink-0">{!grouped && <Link to={`/u/${m.player.username}`}><PlayerAvatar p={m.player} size={32} /></Link>}</div>
                <div className="min-w-0 flex-1">
                  {!grouped && (
                    <div className="flex items-baseline gap-2">
                      <Link to={`/u/${m.player.username}`} className="truncate text-[13px] font-bold hover:underline" style={{ color: m.player.accent_color }}>{m.player.display_name || m.player.username}</Link>
                      <span className="truncate text-[11px] text-faint">@{m.player.username} · {timeAgo(m.created_at)}</span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words text-[14px] leading-snug">{m.body}{m.deleted ? <span className="ml-1 text-[11px] text-bad">(removed)</span> : null}</p>
                </div>
                {!mine && (
                  <MessageMenu mod={mod} onReport={() => setReport(m)} onBlock={() => block(m)} onDelete={() => remove(m)} onMute={() => mute(m)} />
                )}
              </div>
            );
          })}
        </div>
        <form className="flex items-center gap-2 border-t border-line p-2.5" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          {!info.enabled ? <p className="flex-1 px-2 text-sm text-muted">The chat is switched off right now.</p> : muted ? (
            <p className="flex flex-1 items-center gap-2 px-2 text-sm text-warn"><VolumeX className="h-4 w-4" /> You’re muted until {new Date(info.muted_until!).toLocaleString()}.</p>
          ) : (
            <>
              <input className={cn(inputCls, 'h-11 flex-1')} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Message everyone…" aria-label="Chat message" data-testid="chat-input" enterKeyHint="send" />
              <Button type="submit" variant="primary" size="icon" className="h-11 w-11" disabled={!text.trim() || sending} aria-label="Send" data-testid="chat-send">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </>
          )}
        </form>
      </div>
      <p className="flex items-start gap-2 px-1 text-xs text-muted"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Be kind. Links aren’t allowed, rude words are masked, and moderators review every report. Never share where you live, your phone number or other personal details.</p>
      <Dialog open={!!report} onOpenChange={(o) => !o && setReport(null)} title="Report this message" description={report ? `“${report.body.slice(0, 120)}” — @${report.player.username}` : undefined}>
        <div className="grid gap-1.5">
          {REPORT_REASONS.map((r) => (
            <Button key={r.id} variant="ghost" className="justify-start" onClick={async () => {
              const m = report!;
              setReport(null);
              try { await api.reportChat(m.id, r.id); toast.success('Thanks — a moderator will take a look'); } catch (e) { toast.error(toGameError(e).message); }
            }}>{r.label}</Button>
          ))}
        </div>
      </Dialog>
    </div>
  );
}

function MessageMenu({ mod, onReport, onBlock, onDelete, onMute }: { mod: boolean; onReport(): void; onBlock(): void; onDelete(): void; onMute(): void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0 self-start">
      <button className="rounded-lg p-1 text-faint opacity-60 hover:bg-surface-2 hover:text-fg group-hover:opacity-100" onClick={() => setOpen((o) => !o)} aria-label="Message options" aria-expanded={open}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="glass absolute right-0 top-7 z-20 grid w-44 gap-0.5 rounded-2xl p-1.5 text-sm shadow-xl">
            <MenuItem icon={<Flag className="h-4 w-4" />} label="Report" onClick={() => { setOpen(false); onReport(); }} />
            <MenuItem icon={<Ban className="h-4 w-4" />} label="Block player" onClick={() => { setOpen(false); onBlock(); }} />
            {mod && <MenuItem icon={<Trash2 className="h-4 w-4" />} label="Delete message" danger onClick={() => { setOpen(false); onDelete(); }} />}
            {mod && <MenuItem icon={<VolumeX className="h-4 w-4" />} label="Mute for 1 hour" danger onClick={() => { setOpen(false); onMute(); }} />}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick(): void; danger?: boolean }) {
  return <button className={cn('flex items-center gap-2 rounded-xl px-2.5 py-2 text-left font-semibold hover:bg-surface-2', danger && 'text-bad')} onClick={onClick}>{icon}{label}</button>;
}

// ---- friends ------------------------------------------------------------------------------

function FriendsTab() {
  const warpTo = useWarpTo();
  const me = useOnboardedMe();
  const session = useSession();
  const q = useQuery({ queryKey: ['friends'], queryFn: api.myFriends, enabled: !!me, refetchInterval: poll(120_000) });
  if (!session || !me) return <Empty icon={<UserPlus className="h-6 w-6" />} title="Make friends" action={<Link to="/welcome?next=/social?tab=friends" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white">Sign in</Link>}>Add players as friends to keep up with their art.</Empty>;
  if (!q.data) return <div className="flex justify-center py-16"><Spinner /></div>;
  const { friends, incoming, outgoing } = q.data;
  return (
    <div className="mx-auto grid max-w-3xl gap-5" data-testid="friends">
      {incoming.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-base font-semibold">Friend requests</h2>
          <div className="grid gap-2">
            {incoming.map((r) => (
              <div key={r.player.id} className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3" data-testid="friend-request">
                <Link to={`/u/${r.player.username}`}><PlayerAvatar p={r.player} size={40} /></Link>
                <div className="min-w-0 flex-1"><div className="truncate font-bold">{r.player.display_name || r.player.username}</div><div className="text-xs text-muted">@{r.player.username} · {timeAgo(r.at)}</div></div>
                <FriendButton playerId={r.player.id} username={r.player.username} />
              </div>
            ))}
          </div>
        </section>
      )}
      <section>
        <div className="mb-2 flex items-end justify-between gap-2">
          <h2 className="font-display text-base font-semibold">Friends{friends.length ? ` (${friends.length})` : ''}</h2>
          <Link to="/players" className="text-xs font-bold text-accent-2 hover:underline">Find players</Link>
        </div>
        {!friends.length ? (
          <Empty icon={<Users className="h-6 w-6" />} title="No friends yet" action={<Link to="/invite" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white">Invite a friend</Link>}>Add players from their profile or the Players page — or invite someone you know.</Empty>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {[...friends].sort((a, b) => Number(!!b.now?.online) - Number(!!a.now?.online)).map((f) => (
              <div key={f.player.id} className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3" data-testid="friend-row">
                <Link to={`/u/${f.player.username}`} className="relative"><PlayerAvatar p={f.player} size={44} />
                  {f.now?.online && <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-bg-2 bg-[#4FD18B]" aria-label="online" />}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/u/${f.player.username}`} className="block truncate font-bold hover:underline">{f.player.display_name || f.player.username}</Link>
                  <div className="truncate text-xs text-muted" data-testid="friend-now">{describeWhereabouts(f.now) ?? `@${f.player.username} · ${fmt(f.plots)} plot${f.plots === 1 ? '' : 's'}`}</div>
                  {f.now?.space?.home_name && !f.now.space.at_home && <div className="truncate text-[11px] text-faint">🏡 home world: {f.now.space.home_name}</div>}
                </div>
                {canWarpTo(f.now, true) && <Button size="sm" variant="rainbow" onClick={() => void warpTo(f.player)} data-testid="warp-to-friend">⚡ Warp</Button>}
                <Link to={`/u/${f.player.username}/home`} className="flex h-8 items-center gap-1 rounded-xl border border-line px-2.5 text-xs font-bold hover:border-line-strong" aria-label={`Visit @${f.player.username}'s home`}><DoorOpen className="h-3.5 w-3.5" /> Home</Link>
              </div>
            ))}
          </div>
        )}
      </section>
      {outgoing.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-base font-semibold">Sent requests</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {outgoing.map((r) => (
              <div key={r.player.id} className="glass flex items-center gap-3 rounded-2xl p-3">
                <PlayerAvatar p={r.player} size={36} />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">@{r.player.username}</div><div className="text-xs text-muted">sent {timeAgo(r.at)}</div></div>
                <FriendButton playerId={r.player.id} username={r.player.username} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
