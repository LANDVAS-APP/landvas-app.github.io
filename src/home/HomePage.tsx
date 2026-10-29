// The public homepage (landvas.app for anyone not signed in): newest art from the
// live map, live counters, how the game and its earnings work, and the community.
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Brush, ChevronDown, DoorOpen, Gamepad2, Gift, Globe2, MapPinned, MessagesSquare, Shirt, Sparkles, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import type { ArtworkCard } from '../backend/types';
import { useWorld } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { NotificationBell } from '../updates/Notifications';
import { GamePreview } from '../play/GamePreview';
import { GAME_INFO, type GameId } from '../shared/minigames';
import { RARITY_ORDER, rarityInfo } from '../shared/rarity';
import { useAssetUrl } from '../gallery/GalleryScreen';
import { RarityBadge } from '../plot/RarityBadge';
import { ExplorerFigure } from '../explorer/ExplorerFigure';
import { LogoMark } from '../ui';
import { FAQ } from './faq';

const signedIn = () => !!getBackend().session();
const playHref = () => (signedIn() ? '/world' : '/welcome');

export const DISCORD = 'https://discord.gg/EsEQB9Zw3';
export const REDDIT = 'https://www.reddit.com/r/LANDVAS/';
const GAMES: GameId[] = ['tracecraft', 'colorburst', 'paintpop', 'lightlines', 'memorymural', 'sculptor', 'rollermural', 'mirrorline'];
const FALLBACK = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF', '#7B5CFF', '#FF4FD8', '#22C7B5'];

export default function HomePage() {
  const stats = useQuery({ queryKey: ['public-stats'], queryFn: api.publicStats, refetchInterval: 30_000 });
  const art = useQuery({ queryKey: ['home-art'], queryFn: () => api.galleryList('new', 36), refetchInterval: 60_000 });
  const cards = art.data ?? [];
  useEffect(() => {
    document.title = 'LANDVAS — Own a piece. Paint the world. | Pixel art map game that pays rent';
  }, []);
  return (
    <div className="lv-home min-h-full overflow-x-hidden bg-bg text-fg" data-testid="homepage">
      <TopBar />
      <Hero stats={stats.data} cards={cards} />
      <ArtMarquee cards={cards} loading={art.isLoading} />
      <HowItWorks />
      <Earnings />
      <Minigames />
      <Social />
      <Community />
      <section className="gutter mx-auto max-w-4xl py-20" id="faq">
        <h2 className="text-center font-display text-3xl font-bold md:text-4xl">Questions, answered</h2>
        <div className="mt-8 grid gap-3">
          {FAQ.map((f) => (
            <details key={f.q} className="lv-faq group glass rounded-2xl px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">{f.q}<ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" /></summary>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
      <FinalCta />
      <Footer />
    </div>
  );
}

// ---- top bar --------------------------------------------------------------------------

function TopBar() {
  return (
    <header className="gutter sticky top-0 z-40 border-b border-white/5 bg-bg/70 py-3 backdrop-blur-xl" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <Link to="/" className="flex items-center gap-2.5" aria-label="LANDVAS home">
          <LogoMark size={34} />
          <span className="font-display text-[17px] font-bold tracking-[0.12em]">LANDVAS</span>
        </Link>
        <nav className="ml-6 hidden items-center gap-1 text-sm font-semibold text-muted md:flex" aria-label="Site">
          <Link to="/world" className="rounded-xl px-3 py-2 hover:bg-surface-2 hover:text-fg">Live map</Link>
          <Link to="/gallery" className="rounded-xl px-3 py-2 hover:bg-surface-2 hover:text-fg">Gallery</Link>
          <Link to="/players" className="rounded-xl px-3 py-2 hover:bg-surface-2 hover:text-fg">Players</Link>
          <a href="#earn" className="rounded-xl px-3 py-2 hover:bg-surface-2 hover:text-fg">Earnings</a>
          <a href="#faq" className="rounded-xl px-3 py-2 hover:bg-surface-2 hover:text-fg">FAQ</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a href={DISCORD} target="_blank" rel="noopener" className="hidden h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg sm:flex" aria-label="LANDVAS on Discord"><DiscordIcon className="h-5 w-5" /></a>
          <a href={REDDIT} target="_blank" rel="noopener" className="hidden h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg sm:flex" aria-label="LANDVAS on Reddit"><RedditIcon className="h-5 w-5" /></a>
          <NotificationBell size="sm" className="!bg-transparent !shadow-none hover:!bg-surface-2" />
          {!signedIn() && <Link to="/welcome?mode=signin" className="hidden rounded-xl px-3 py-2 text-sm font-bold text-muted hover:text-fg sm:block">Sign in</Link>}
          <Link to={playHref()} className="lv-cta rounded-xl px-4 py-2.5 text-sm font-extrabold text-white" data-testid="home-play">{signedIn() ? 'Play' : 'Play free'}</Link>
        </div>
      </div>
    </header>
  );
}

// ---- hero -----------------------------------------------------------------------------

function Hero({ stats, cards }: { stats?: { players: number; artworks: number; plots: number }; cards: ArtworkCard[] }) {
  return (
    <section className="relative isolate overflow-hidden">
      <ArtWall cards={cards} />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(80%_70%_at_30%_40%,transparent_0%,var(--bg)_78%)]" />
      <div className="gutter mx-auto grid max-w-7xl gap-10 pb-16 pt-14 md:pb-24 md:pt-24 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <div>
          <div className="lv-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold">
            <span className="lv-dot" /> The world map is live — {stats && stats.players > 1 ? `${fmt(stats.players)} artists playing` : 'be one of the first artists'}
          </div>
          <h1 className="mt-6 font-display text-[clamp(2.6rem,6.2vw,5rem)] font-bold leading-[0.98] tracking-tight">
            Own a piece.<br /><span className="lv-rainbow-anim">Paint the world.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted md:text-lg">
            LANDVAS splits the real world into house-sized plots. Claim the ones around you, paint them into murals everyone sees on the live map, win minigames for Ink — and watch your land earn <b className="text-fg">USD rent every second</b>.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={playHref()} className="lv-cta group inline-flex h-14 items-center gap-2 rounded-2xl px-7 text-base font-extrabold text-white">
              {signedIn() ? 'Back to my land' : 'Claim your free plot'} <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
            </Link>
            <Link to="/world" className="glass inline-flex h-14 items-center gap-2 rounded-2xl px-6 text-base font-bold hover:border-line-strong">
              <Globe2 className="h-5 w-5 text-accent-2" /> Explore the live map
            </Link>
          </div>
          <div className="mt-10 grid max-w-xl grid-cols-3 gap-3" data-testid="home-stats">
            <Counter label="Players" value={stats?.players} />
            <Counter label="Artworks" value={stats?.artworks} />
            <Counter label="Plots claimed" value={stats?.plots} />
          </div>
        </div>
        <HeroCard cards={cards} />
      </div>
    </section>
  );
}

function Counter({ label, value }: { label: string; value?: number }) {
  const shown = useCountUp(value ?? 0);
  return (
    <div className="lv-stat rounded-2xl px-4 py-3.5">
      <div className="font-display text-2xl font-bold tnum md:text-3xl">{value === undefined ? '—' : fmt(shown)}</div>
      <div className="eyebrow mt-0.5 !text-[10px]">{label}</div>
    </div>
  );
}

function useCountUp(target: number) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now(), a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 1400);
      const e = 1 - Math.pow(1 - k, 3);
      setV(Math.round(a + (target - a) * e));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

/** A slowly drifting, tilted wall of the newest art behind the hero. */
function ArtWall({ cards }: { cards: ArtworkCard[] }) {
  const tiles = useMemo(() => Array.from({ length: 36 }, (_, i) => cards.length ? cards[i % cards.length] : null), [cards]);
  return (
    <div className="lv-wall pointer-events-none absolute inset-0 -z-20" aria-hidden>
      <div className="lv-wall-inner">
        {tiles.map((c, i) => <WallTile key={i} card={c} i={i} />)}
      </div>
    </div>
  );
}

function WallTile({ card, i }: { card: ArtworkCard | null; i: number }) {
  const url = useAssetUrl(card?.thumb_path);
  return url
    ? <img src={url} alt="" loading="lazy" className="lv-wall-tile art-paper object-cover" style={{ animationDelay: `${(i % 7) * -1.3}s` }} />
    : <div className="lv-wall-tile" style={{ background: `linear-gradient(135deg, ${FALLBACK[i % 8]}, ${FALLBACK[(i + 3) % 8]})`, animationDelay: `${(i % 7) * -1.3}s` }} />;
}

/** Floating glass card: the newest artwork, a live rent ticker and an explorer. */
function HeroCard({ cards }: { cards: ArtworkCard[] }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (cards.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % Math.min(cards.length, 8)), 3500);
    return () => clearInterval(t);
  }, [cards.length]);
  const c = cards[idx];
  const url = useAssetUrl(c?.preview_path ?? c?.thumb_path);
  return (
    <div className="relative mx-auto w-full max-w-md lg:mr-0">
      <div className="lv-orb" />
      <div className="lv-float glass relative rounded-[32px] p-4 shadow-[0_40px_120px_-30px_rgba(123,92,255,0.6)]">
        <div className="flex items-center justify-between px-1 pb-3">
          <span className="eyebrow">Newest on the map</span>
          <span className="lv-live"><i /> Live</span>
        </div>
        <Link to={c ? `/art/${c.id}` : '/gallery'} className="block overflow-hidden rounded-3xl">
          <div className="art-paper relative aspect-square w-full">
            {url ? <img key={url} src={url} alt={c?.title ?? 'Artwork'} className="lv-fade h-full w-full object-contain" /> : <PlaceholderArt />}
          </div>
        </Link>
        <div className="flex items-center justify-between gap-3 px-1 pt-3">
          <div className="min-w-0">
            <div className="truncate font-display text-base font-semibold">{c?.title ?? 'Your mural here'}</div>
            <div className="truncate text-xs text-muted">{c ? `by @${c.artist.username} · ${c.plot_count} plot${c.plot_count === 1 ? '' : 's'}` : 'Claim a plot and paint it'}</div>
          </div>
          <ExplorerFigure accent={c?.artist.accent_color ?? '#7B5CFF'} style={c?.artist.explorer_style} size={44} walking />
        </div>
        <RentTicker />
      </div>
    </div>
  );
}

function PlaceholderArt() {
  return (
    <div className="grid h-full w-full grid-cols-4 gap-1.5 bg-[#0d1333] p-3">
      {Array.from({ length: 16 }, (_, i) => <div key={i} className="lv-pulse rounded-lg" style={{ background: FALLBACK[(i * 5) % 8], animationDelay: `${i * 0.12}s` }} />)}
    </div>
  );
}

function RentTicker() {
  const world = useWorld();
  const mythic = Number(world.data?.rarities?.find((r) => r.id === 'mythic')?.usd_per_second ?? rarityInfo('mythic').usd_per_second);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const loop = (t: number) => {
      if (ref.current) ref.current.textContent = `$${(0.0000412 + ((t - t0) / 1000) * mythic * 20 * 60).toFixed(10)}`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mythic]);
  return (
    <div className="mt-3 flex items-center justify-between rounded-2xl border border-[#3DDC97]/30 bg-[#3DDC97]/10 px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-xs font-bold text-muted"><Zap className="h-3.5 w-3.5 text-gold" /> Rent, 20× boosted</span>
      <span ref={ref} className="font-display text-sm font-semibold text-[#3DDC97] tnum">$0.0000412000</span>
    </div>
  );
}

// ---- newest art marquee ---------------------------------------------------------------

export function ArtMarquee({ cards, loading }: { cards: ArtworkCard[]; loading: boolean }) {
  if (!loading && !cards.length) return null;
  const a = cards.slice(0, 18), b = cards.slice(18, 36).length ? cards.slice(18, 36) : [...a].reverse();
  return (
    <section className="border-y border-white/5 bg-bg-2/40 py-12" aria-labelledby="newest">
      <div className="gutter mx-auto mb-6 flex max-w-7xl flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Fresh off the map</div>
          <h2 id="newest" className="mt-1 font-display text-3xl font-bold md:text-4xl">The newest art in LANDVAS</h2>
        </div>
        <Link to="/gallery" className="inline-flex items-center gap-1.5 text-sm font-bold text-accent-2 hover:underline">See the whole gallery <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <div className="lv-marquee-mask grid gap-4">
        <MarqueeRow cards={a} />
        {cards.length > 6 && <MarqueeRow cards={b} reverse />}
      </div>
    </section>
  );
}

function MarqueeRow({ cards, reverse }: { cards: ArtworkCard[]; reverse?: boolean }) {
  const list = cards.length ? [...cards, ...cards] : Array.from({ length: 12 }, () => null);
  return (
    <div className="overflow-hidden">
      <div className={cn('lv-marquee flex w-max gap-4', reverse && 'lv-marquee-rev')} style={{ animationDuration: `${Math.max(30, cards.length * 5)}s` }}>
        {list.map((c, i) => c ? <MarqueeCard key={`${c.id}-${i}`} c={c} /> : <div key={i} className="h-48 w-48 animate-pulse rounded-3xl bg-surface-2" />)}
      </div>
    </div>
  );
}

function MarqueeCard({ c }: { c: ArtworkCard }) {
  const url = useAssetUrl(c.thumb_path);
  return (
    <Link to={`/art/${c.id}`} className="group relative block h-48 w-48 shrink-0 overflow-hidden rounded-3xl shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)] md:h-56 md:w-56">
      <div className="art-paper h-full w-full">{url && <img src={url} alt={c.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />}</div>
      <div className="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
        <div className="truncate text-sm font-bold text-white">{c.title}</div>
        <div className="truncate text-xs text-white/70">@{c.artist.username}</div>
      </div>
    </Link>
  );
}

// ---- how it works ---------------------------------------------------------------------

const STEPS = [
  { icon: MapPinned, title: 'Claim real-world plots', body: 'The planet is a grid of 4.3 billion house-sized plots. Your first one is free. Every plot is a mystery until you claim it — Common to Mythic.', color: '#3DDC97' },
  { icon: Brush, title: 'Paint what everyone sees', body: 'Draw or upload art on a real editor with brushes, layers and symmetry. Publish it and it appears on the live world map for every player.', color: '#FF4D6D' },
  { icon: Gamepad2, title: 'Win Ink in minigames', body: 'Each plot hosts one of eight skill games. Wins pay Ink — the currency that buys more land, brushes, colours and explorer looks.', color: '#34C3FF' },
  { icon: Sparkles, title: 'Grow murals & earn rent', body: 'Connect neighbouring plots into one continuous canvas. Every plot you own earns USD rent each second, by its rarity.', color: '#FFB31F' },
];

export function HowItWorks() {
  return (
    <section className="gutter mx-auto max-w-7xl py-20" aria-labelledby="how">
      <div className="mx-auto max-w-2xl text-center">
        <div className="eyebrow">How it works</div>
        <h2 id="how" className="mt-2 font-display text-3xl font-bold md:text-5xl">A map you can own, paint and play</h2>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <article key={s.title} className="lv-step glass relative overflow-hidden rounded-3xl p-6" style={{ ['--c' as string]: s.color }}>
            <div className="font-display text-6xl font-bold text-white/[0.06]">0{i + 1}</div>
            <div className="-mt-6 mb-4 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: `${s.color}22`, color: s.color, boxShadow: `0 0 30px -6px ${s.color}` }}><s.icon className="h-6 w-6" /></div>
            <h3 className="font-display text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---- earnings -------------------------------------------------------------------------

export function Earnings() {
  const world = useWorld();
  const rents = world.data?.rarities;
  const boost = Number(world.data?.rent?.boost?.multiplier ?? 20);
  const rate = Number(world.data?.rent?.convert?.ink_per_usd ?? 100);
  return (
    <section id="earn" className="relative overflow-hidden py-20" aria-labelledby="earn-h">
      <div className="lv-aurora" aria-hidden />
      <div className="gutter relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <div className="eyebrow">Earnings</div>
          <h2 id="earn-h" className="mt-2 font-display text-3xl font-bold md:text-5xl">Your land pays rent.<br /><span className="lv-rainbow-anim">Every second.</span></h2>
          <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-muted">Every plot you own earns USD rent around the clock — rarer plots earn more. Press the free daily boost to multiply all of it by {boost}×, convert rent into Ink at <b className="text-fg">$1 = {fmt(rate)} Ink</b> from just one cent, and invite friends for <b className="text-fg">500 Ink</b> each.</p>
          <ul className="mt-6 grid gap-2.5 text-[15px]">
            <li className="flex gap-2.5"><Zap className="mt-0.5 h-5 w-5 shrink-0 text-gold" /> {boost}× rent boost, free every day</li>
            <li className="flex gap-2.5"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent-2" /> Upgrade plots for +1% rent per level</li>
            <li className="flex gap-2.5"><Gift className="mt-0.5 h-5 w-5 shrink-0 text-hot" /> 500 Ink for every friend who joins and wins</li>
          </ul>
          <p className="mt-6 max-w-lg text-xs leading-relaxed text-faint">Rates are set by LANDVAS and can change. Rent is a game reward, not an investment, and plots are virtual — they never mean owning real land. Cash-out isn’t available yet; until it is, rent can be converted to Ink.</p>
        </div>
        <div className="glass rounded-[32px] p-5 md:p-7">
          <div className="mb-4 flex items-center justify-between"><span className="font-display text-lg font-semibold">Rent per plot</span><span className="text-xs text-muted">per day · boosted</span></div>
          <div className="grid gap-2">
            {RARITY_ORDER.map((id) => {
              const r = rents?.find((x) => x.id === id) ?? rarityInfo(id);
              const day = Number(r.usd_per_second) * 86400;
              return (
                <div key={id} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/40 px-4 py-3">
                  <RarityBadge r={id} />
                  <span className="text-right text-sm tnum"><b>${day.toFixed(6)}</b><span className="text-muted"> · </span><b className="text-[#3DDC97]">${(day * boost).toFixed(5)}</b></span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-faint">Rarity is revealed the moment you claim — any plot could be Mythic.</p>
        </div>
      </div>
    </section>
  );
}

// ---- minigames ------------------------------------------------------------------------

export function Minigames() {
  return (
    <section className="gutter mx-auto max-w-7xl py-20" aria-labelledby="games">
      <div className="mx-auto max-w-2xl text-center">
        <div className="eyebrow">Eight minigames</div>
        <h2 id="games" className="mt-2 font-display text-3xl font-bold md:text-5xl">Skill pays. Literally.</h2>
        <p className="mt-4 text-muted">Every plot hosts one game with five rounds per level — clear all five to level up, and every round you clear pays Ink. Every plot climbs its own levels — harder levels and rarer plots pay more. Scores are checked on the server, so the leaderboards stay fair.</p>
      </div>
      <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {GAMES.map((g) => (
          <article key={g} className="lv-game glass group rounded-3xl p-3">
            <GamePreview game={g} className="transition duration-500 group-hover:scale-[1.03]" />
            <div className="px-1.5 pb-1 pt-3">
              <h3 className="font-display text-base font-semibold">{GAME_INFO[g].name}</h3>
              <p className="text-sm text-muted">{GAME_INFO[g].tagline}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---- social ---------------------------------------------------------------------------

export function Social() {
  const items = [
    { icon: DoorOpen, title: 'Visit rooms', body: 'Step into any artist’s room to see their art and land — locations stay private.' },
    { icon: MessagesSquare, title: 'Global chat & friends', body: 'Talk with players everywhere, add friends and follow the live feed.' },
    { icon: Shirt, title: 'Dress your explorer', body: 'Hats, outfits, trails and auras — your character walks the map with you.' },
    { icon: Brush, title: 'Unlock real art tools', body: 'Start with the basics, then earn brushes, palettes, shapes and symmetry.' },
  ];
  return (
    <section className="border-y border-white/5 bg-bg-2/40 py-20">
      <div className="gutter mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
        <div className="relative mx-auto flex h-72 w-full max-w-sm items-end justify-center">
          <div className="lv-orb" />
          <div className="relative flex items-end gap-4">
            <ExplorerFigure accent="#FF3D9A" style={{ hat: 'crown', hold: 'wand', outfit: 'galaxy', trail: 'stars', aura: 'rainbow' }} size={92} walking />
            <ExplorerFigure accent="#22C7B5" style={{ hat: 'headphones', hold: 'spray', outfit: 'camo', trail: 'paint', aura: 'ice' }} size={74} />
            <ExplorerFigure accent="#FFB31F" style={{ hat: 'wizard', hold: 'palette', outfit: 'gold', trail: 'sparkle', aura: 'gold' }} size={64} walking />
          </div>
        </div>
        <div>
          <div className="eyebrow">Better together</div>
          <h2 className="mt-2 font-display text-3xl font-bold md:text-5xl">An art world with neighbours</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {items.map((it) => (
              <div key={it.title} className="flex gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent-2"><it.icon className="h-5 w-5" /></div>
                <div><h3 className="font-semibold">{it.title}</h3><p className="text-sm text-muted">{it.body}</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---- community ------------------------------------------------------------------------

export function Community() {
  return (
    <section className="gutter mx-auto max-w-7xl py-20" aria-labelledby="community">
      <div className="mx-auto max-w-2xl text-center">
        <div className="eyebrow">Community</div>
        <h2 id="community" className="mt-2 font-display text-3xl font-bold md:text-5xl">Join the crew</h2>
        <p className="mt-4 text-muted">Show off your murals, find neighbours to build with and hear about events first.</p>
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <a href={DISCORD} target="_blank" rel="noopener" className="lv-social group relative overflow-hidden rounded-[32px] p-7" style={{ ['--c' as string]: '#5865F2' }} data-testid="home-discord">
          <DiscordIcon className="h-12 w-12 text-white" />
          <h3 className="mt-6 font-display text-2xl font-bold text-white">Discord</h3>
          <p className="mt-1 text-white/80">Chat live, trade tips, join art jams and events.</p>
          <span className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-extrabold text-[#3b45c4]">Join the server <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
        </a>
        <a href={REDDIT} target="_blank" rel="noopener" className="lv-social group relative overflow-hidden rounded-[32px] p-7" style={{ ['--c' as string]: '#FF4500' }} data-testid="home-reddit">
          <RedditIcon className="h-12 w-12 text-white" />
          <h3 className="mt-6 font-display text-2xl font-bold text-white">r/LANDVAS</h3>
          <p className="mt-1 text-white/80">Post your murals, share strategies and vote on what’s next.</p>
          <span className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-extrabold text-[#d93a00]">Visit the subreddit <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
        </a>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="gutter py-10">
      <div className="lv-final relative mx-auto max-w-6xl overflow-hidden rounded-[40px] px-6 py-16 text-center md:py-20">
        <h2 className="relative font-display text-[clamp(2rem,5vw,3.6rem)] font-bold leading-tight text-white">Your corner of the world<br />is waiting.</h2>
        <p className="relative mx-auto mt-4 max-w-lg text-white/80">Free to play on any phone or computer. No download needed.</p>
        <Link to={playHref()} className="relative mt-8 inline-flex h-14 items-center gap-2 rounded-2xl bg-white px-8 text-base font-extrabold text-[#1d1550] shadow-[0_20px_60px_-15px_rgba(255,255,255,0.6)] transition hover:scale-[1.03]">Claim your free plot <ArrowRight className="h-5 w-5" /></Link>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="gutter mx-auto max-w-7xl pb-[calc(32px+env(safe-area-inset-bottom,0px))] pt-10">
      <div className="flex flex-wrap items-center justify-between gap-6 border-t border-line pt-8">
        <div className="flex items-center gap-2.5"><LogoMark size={28} /><span className="font-display font-bold tracking-[0.12em]">LANDVAS</span><span className="text-xs text-faint">© {new Date().getFullYear()}</span></div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted" aria-label="Footer">
          <Link to="/world" className="hover:text-fg">Live map</Link>
          <Link to="/gallery" className="hover:text-fg">Gallery</Link>
          <Link to="/players" className="hover:text-fg">Players</Link>
          <a href={DISCORD} target="_blank" rel="noopener" className="hover:text-fg">Discord</a>
          <a href={REDDIT} target="_blank" rel="noopener" className="hover:text-fg">Reddit</a>
          <Link to="/legal/terms" className="hover:text-fg">Terms</Link>
          <Link to="/legal/privacy" className="hover:text-fg">Privacy</Link>
          <Link to="/legal/rent" className="hover:text-fg">Rent rules</Link>
        </nav>
      </div>
      <p className="mt-6 max-w-3xl text-xs leading-relaxed text-faint">LANDVAS plots are virtual squares on a map — owning one never means owning real land. Ink can’t be bought with money; it’s earned by playing.</p>
    </footer>
  );
}

export function DiscordIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden><path d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18.2 18.2 0 0 0-5.6 0L8.6 3a19.5 19.5 0 0 0-4.9 1.4C.6 9 0 13.5.3 18a19.8 19.8 0 0 0 6 3l1.3-2a12.7 12.7 0 0 1-2-1l.5-.4a14 14 0 0 0 11.8 0l.5.4a12.7 12.7 0 0 1-2 1l1.3 2a19.7 19.7 0 0 0 6-3c.4-5.2-.7-9.7-3.4-13.6ZM8.5 15.3c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Zm7 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z" /></svg>;
}
export function RedditIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden><path d="M22 12.1a2.2 2.2 0 0 0-3.7-1.6 10.7 10.7 0 0 0-5.8-1.8l1-4.6 3.2.7a1.6 1.6 0 1 0 .2-1l-3.6-.8a.5.5 0 0 0-.6.4l-1.1 5.3a10.8 10.8 0 0 0-5.9 1.8 2.2 2.2 0 1 0-2.4 3.6 4.3 4.3 0 0 0 0 .7c0 3.4 4 6.2 8.8 6.2s8.8-2.8 8.8-6.2a4.3 4.3 0 0 0 0-.7 2.2 2.2 0 0 0 1.1-2Zm-15 1.6a1.6 1.6 0 1 1 1.6 1.6A1.6 1.6 0 0 1 7 13.7Zm8.9 4.2a5.8 5.8 0 0 1-3.9 1.2 5.8 5.8 0 0 1-3.9-1.2.4.4 0 0 1 .6-.6 4.9 4.9 0 0 0 3.3 1 4.9 4.9 0 0 0 3.3-1 .4.4 0 1 1 .6.6Zm-.3-2.6a1.6 1.6 0 1 1 1.6-1.6 1.6 1.6 0 0 1-1.6 1.6Z" /></svg>;
}
