import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Brush, DoorOpen, Lock, Pencil } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { Page } from '../app/Shell';
import { useOnboardedMe } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { GAME_INFO, type GameId } from '../shared/minigames';
import { Button, Dialog, Empty, Spinner, PlayerAvatar } from '../ui';
import { ArtGrid, ArtThumb } from '../gallery/GalleryScreen';
import { RarityBadge } from '../plot/RarityBadge';
import { BasePlotArt } from '../plot/BasePlotArt';
import { RARITY_ORDER, rarityInfo, ULTRA, type RarityId } from '../shared/rarity';
import { formatRate } from '../shared/rent';
import { LandMosaic } from '../land/LandMosaic';
import { FriendButton } from '../social/FriendButton';
import { ExplorerFigure } from '../explorer/ExplorerFigure';
import { ultraOfRarity } from '../explorer/ultra';
import { BadgeIcon, tierOf } from '../screens/BadgeIcon';
import type { PlayerLand } from '../backend/types';
import { ProfilePlaces } from './Places';
import { poll } from '../lib/poll';

type Badge = { key: string; name: string; icon: string; category: string; threshold: number; description?: string; unlocked_at: string };
type Crown = { tier: RarityId; kingdom: string; country: string; since: string; shiny: boolean };
type Showcase = { badge: string | null; rarest: { rarity: RarityId; count: number; shiny: number; since: string } | null; crowns: Crown[]; ultra_sets: RarityId[] };
const CROWN_TITLE: Record<string, string> = { crown: 'City Crown', crown_state: 'State Crown', crown_country: 'Country Crown' };
const TABS = [{ id: 'overview', label: 'Overview' }, { id: 'art', label: 'Art' }, { id: 'badges', label: 'Badges' }, { id: 'games', label: 'Games' }] as const;
type Tab = (typeof TABS)[number]['id'];

/** the badge on show: the one they chose, or their best (highest metal, then most recent) */
function pickBadge(list: Badge[], chosen: string | null) {
  return list.find((b) => b.key === chosen) ?? [...list].sort((a, b) => tierOf(b) - tierOf(a) || +new Date(b.unlocked_at) - +new Date(a.unlocked_at))[0];
}

export default function ProfileScreen() {
  const { username = '' } = useParams();
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['profile', username], queryFn: () => api.profileByUsername(username) });
  const land = useQuery({ queryKey: ['land', username], queryFn: () => api.playerLand(username), enabled: !!q.data });
  const places = useQuery({ queryKey: ['places', username], queryFn: () => api.playerPlaces(username), enabled: !!q.data, refetchInterval: poll(120_000) });
  const house = useQuery({ queryKey: ['home-status', username], queryFn: () => api.homeStatus(username!), enabled: !!q.data && !!me, staleTime: 60_000 });
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [picking, setPicking] = useState(false);
  if (q.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  if (q.error || !q.data) return <Page><Empty title="Profile not found">This artist doesn't exist or isn't visible to you.</Empty></Page>;
  const d = q.data;
  const p = d.profile;
  const sc: Showcase = d.showcase ?? { badge: null, rarest: null, crowns: [], ultra_sets: [] };
  const badges: Badge[] = d.achievements ?? [];
  const badge = badges.length ? pickBadge(badges, sc.badge) : undefined;
  const crown = sc.crowns[0];
  const royal = crown ? ultraOfRarity(crown.tier) : undefined;
  const rarest = sc.rarest ? rarityInfo(sc.rarest.rarity) : undefined;
  const hue = royal?.a ?? (rarest && ULTRA.includes(rarest.id) ? rarest.color : p.accent_color);
  const vars = { '--pa': p.accent_color, '--pb': hue, '--pc': royal?.c ?? rarest?.glow ?? '#fff' } as CSSProperties;

  const choose = async (key: string | null) => {
    try { await api.setShowcaseBadge(key); setPicking(false); await qc.invalidateQueries({ queryKey: ['profile', username] }); toast.success(key ? 'Showcase badge set' : 'Showing your best badge'); }
    catch (e) { toast.error(toGameError(e).message); }
  };

  return (
    <Page>
      {/* ---- hero ---- */}
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }}
        className={cn('lv-profile-hero relative rounded-[30px]', royal && 'lv-royal')} style={vars} data-testid="profile-hero" data-royal={crown?.tier ?? undefined}>
        <div className="lv-profile-inner relative overflow-hidden rounded-[28px]">
          <div className="lv-profile-banner" aria-hidden>
            {Array.from({ length: royal ? 14 : 8 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 90}%`, animationDelay: `${(i * 0.37) % 3}s` }} />)}
          </div>
          {royal && crown && (
            <div className="lv-royal-ribbon relative mx-4 -mt-1 mb-3 flex items-center justify-center gap-2 rounded-b-2xl px-4 py-1.5 text-center text-xs font-black uppercase tracking-[0.14em]" data-testid="profile-royal">
              Reigning {CROWN_TITLE[crown.tier]} · {crown.kingdom}{sc.crowns.length > 1 ? ` +${sc.crowns.length - 1}` : ''}
            </div>
          )}
          <div className="relative px-5 pb-5 pt-3 sm:px-6">
            <div className="flex items-end justify-between gap-4">
              <div className={cn('relative shrink-0', royal ? 'mt-7' : '-mt-14')}>
                {royal && <motion.span className="absolute -top-7 left-1/2 z-10 -translate-x-1/2 text-4xl drop-shadow-[0_0_12px_var(--pb)]" animate={{ y: [0, -5, 0], rotate: [-6, 6, -6] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }} aria-hidden>👑</motion.span>}
                <div className="lv-profile-avatar rounded-full p-[3px]"><PlayerAvatar p={p} size={92} /></div>
              </div>
              <div className="lv-profile-explorer relative -mb-1 shrink-0">
                <ExplorerFigure style={p.explorer_style} accent={p.accent_color} size={64} walking={false} label={`@${p.username}'s explorer`} />
              </div>
            </div>
            <h1 className={cn('mt-2 break-words font-display text-[26px] font-black leading-tight', royal && 'lv-royal-name')} data-testid="profile-name">{p.display_name || p.username}</h1>
            <p className="text-sm text-muted">@{p.username}{d.stats.artist_level != null ? ` · Artist level ${d.stats.artist_level}` : ''} · since {new Date(d.stats.member_since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</p>
            {p.bio && <p className="mt-3 max-w-xl text-sm leading-relaxed text-fg/90">{p.bio}</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              {(house.data?.allowed ?? true) ? (
                <Button variant="rainbow" size="sm" className="rounded-full" data-testid="profile-visit" onClick={() => nav(`/u/${p.username}/home`)}>
                  <DoorOpen className="h-4 w-4" /> {d.is_me ? '🏠 My home' : '🏠 Visit their home'}{house.data?.has_home && house.data.size > 1 ? ` · ${house.data.name}` : ''}
                </Button>
              ) : d.is_me ? (
                <Button variant="secondary" size="sm" className="rounded-full" data-testid="profile-build-home" onClick={() => nav('/home')}>🏠 Build your home</Button>
              ) : (
                <span className="flex h-9 items-center rounded-full border border-dashed border-line-strong px-3 text-xs text-muted" data-testid="profile-no-home">🏠 No home built yet</span>
              )}
              {me && places.data?.arcades[0] && (() => {
                const a = [...places.data.arcades].sort((x, y) => y.playing - x.playing || y.plays - x.plays)[0];
                return <Button variant={a.playing > 0 ? 'rainbow' : 'secondary'} size="sm" className="rounded-full" data-testid="profile-join-arcade" onClick={() => nav(`/arcade/${a.id}`)}>🕹️ {d.is_me ? 'My arcade' : a.playing > 0 ? `Join their arcade · ${a.playing} playing` : 'Their arcade'}</Button>;
              })()}
              <FriendButton playerId={p.id} username={p.username} />
              {d.is_me && <Button variant="ghost" size="sm" className="rounded-full" onClick={() => nav('/explorer')}>✨ Explorer</Button>}
              {me && !d.is_me && (
                <Button variant="ghost" size="sm" className="rounded-full" onClick={async () => {
                  try { await api.blockPlayer(p.id, !d.blocked); toast.success(d.blocked ? 'Unblocked' : 'Blocked — their art and messages are hidden from you'); void q.refetch(); } catch (e) { toast.error(toGameError(e).message); }
                }}><Ban className="h-4 w-4" /> {d.blocked ? 'Unblock' : 'Block'}</Button>
              )}
            </div>

            {d.hidden?.stats ? <div className="mt-4 rounded-2xl border border-line bg-surface/50 p-3 text-center text-xs text-muted" data-testid="profile-stats-hidden">🔒 @{p.username} keeps their stats private</div> : (
              <div className="mt-4 grid grid-cols-4 gap-1.5">
                {[['Plots', d.stats.plots], ['Artworks', d.stats.artworks], ['Murals', d.stats.canvas_area], ['Loves', d.stats.appreciations]].map(([l, v], n) => (
                  <motion.div key={l as string} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + n * 0.05 }} className="rounded-2xl bg-bg-2/60 px-1 py-2.5 text-center ring-1 ring-white/5">
                    <div className="font-display text-lg font-black leading-none tnum">{fmt(v as number)}</div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted">{l}</div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.section>

      {/* ---- showcase: rarest rarity + badge ---- */}
      <div className="mt-4 grid grid-cols-2 gap-3" data-testid="profile-showcase">
        <Showpiece label="Rarest plot" color={rarest?.color} glow={rarest?.glow} delay={0.1} testid="showcase-rarest">
          {sc.rarest && rarest ? (
            <Link to={`/rankings/rarities?r=${rarest.id}`} className="flex flex-col items-center gap-2 text-center">
              <motion.div className="lv-showpiece-art rounded-2xl" whileHover={{ scale: 1.06, rotate: -2 }}><BasePlotArt rarity={rarest.id} shiny={sc.rarest.shiny > 0} size={72} /></motion.div>
              <div className="font-display text-lg font-black leading-tight" style={{ color: rarest.color, textShadow: `0 0 18px ${rarest.color}88` }}>{rarest.emoji ? `${rarest.emoji} ` : ''}{rarest.name}</div>
              <div className="text-[11px] text-muted">{sc.rarest.count > 1 ? `${sc.rarest.count} plots` : '1 plot'}{sc.rarest.shiny ? ` · ${sc.rarest.shiny} ✨` : ''} · {rarest.ppm ? `1 in ${Math.round(1_000_000 / rarest.ppm).toLocaleString()}` : rarest.id.startsWith('crown') ? 'one per kingdom' : 'rare'}</div>
            </Link>
          ) : <p className="py-6 text-center text-xs text-muted">No plots yet</p>}
        </Showpiece>
        <Showpiece label={sc.badge && badge?.key === sc.badge ? 'Showcase badge' : 'Best badge'} color={badge ? ['#C77B3B', '#C9D2DE', '#FFD23F', '#9EE7E0', '#8FD3FF', '#FF7AE0'][tierOf(badge)] : undefined} delay={0.18} testid="showcase-badge"
          action={d.is_me && badges.length > 0 ? <button onClick={() => setPicking(true)} className="rounded-full bg-surface-2 p-1.5 text-muted transition hover:text-fg" aria-label="Choose showcase badge" data-testid="showcase-badge-edit"><Pencil className="h-3.5 w-3.5" /></button> : null}>
          {d.hidden?.badges ? <p className="flex items-center justify-center gap-1 py-6 text-xs text-muted"><Lock className="h-3 w-3" /> Badges are private</p>
            : badge ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <motion.div whileHover={{ scale: 1.08, rotate: 3 }} className="drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)]"><BadgeIcon icon={badge.icon} category={badge.category} tier={tierOf(badge)} size={72} /></motion.div>
                <div className="font-display text-base font-black leading-tight" data-testid="showcase-badge-name">{badge.name}</div>
                {badge.description && <div className="line-clamp-2 text-[11px] text-muted">{badge.description}</div>}
              </div>
            ) : <p className="py-6 text-center text-xs text-muted">No badges yet</p>}
        </Showpiece>
      </div>

      {/* ---- Crowns ---- */}
      {sc.crowns.length > 0 && (
        <section className="mt-3 grid gap-2" data-testid="profile-crowns">
          {sc.crowns.map((c, i) => { const t = ultraOfRarity(c.tier)!; return (
            <motion.div key={`${c.tier}-${c.kingdom}-${i}`} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.06 }}
              className="lv-crown-card relative flex items-center gap-3 overflow-hidden rounded-2xl p-3" style={{ '--ca': t.a, '--cb': t.b, '--cc': t.c } as CSSProperties}>
              <span className="text-3xl drop-shadow-[0_0_10px_var(--ca)]">👑</span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: t.c }}>{CROWN_TITLE[c.tier]}{c.shiny ? ' · ✨ Shiny' : ''}</div>
                <div className="truncate font-display text-lg font-black text-white">{c.kingdom}</div>
              </div>
              <div className="text-right text-[11px] text-white/75">reigning<br /><b className="text-white">{Math.max(1, Math.round((Date.now() - +new Date(c.since)) / 86_400_000))} days</b></div>
            </motion.div>
          ); })}
          <Link to="/royalty" className="text-center text-xs font-bold text-accent-2">See all of Royalty →</Link>
        </section>
      )}

      {/* ---- ultra sets ---- */}
      <section className="glass mt-3 rounded-3xl p-4" data-testid="profile-ultras">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-base font-black">Ultra sets</h2>
          <span className="text-xs text-muted tnum"><b className="text-fg">{sc.ultra_sets.length}</b> / {ULTRA.length}</span>
        </div>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
          {ULTRA.map((r, i) => { const t = ultraOfRarity(r)!; const has = sc.ultra_sets.includes(r); return (
            <motion.div key={r} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 + i * 0.025 }}
              title={has ? `${t.name} set` : `${t.name}: not rolled yet`} data-testid={`ultra-${r}`} data-has={has || undefined}
              className={cn('relative grid aspect-square place-items-center rounded-2xl text-xl', has ? 'lv-ultra-lit' : 'bg-bg-2/60 opacity-45 grayscale')}
              style={has ? ({ '--ua': t.a, '--uc': t.c } as CSSProperties) : undefined}>
              <span>{has ? t.emoji : '❔'}</span>
            </motion.div>
          ); })}
        </div>
        <p className="mt-2 text-[11px] text-faint">Get an ultra-rarity plot and its whole set unlocks: explorer hat, outfit, relic, aura and trail, and wear for your Inkborn.</p>
      </section>

      {/* ---- tabs ---- */}
      <div className="sticky top-[calc(58px+env(safe-area-inset-top,0px))] z-20 mt-5 flex gap-1 rounded-full border border-line bg-surface/85 p-1 backdrop-blur" role="tablist" data-testid="profile-tabs">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`profile-tab-${t.id}`}
            className={cn('relative flex-1 rounded-full px-2 py-2 text-[13px] font-bold transition', tab === t.id ? 'text-white' : 'text-muted hover:text-fg')}>
            {tab === t.id && <motion.span layoutId="profile-tab" className="absolute inset-0 rounded-full" style={{ background: `linear-gradient(120deg, ${p.accent_color}, ${hue})` }} transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
            <span className="relative">{t.label}{t.id === 'badges' && badges.length ? ` · ${badges.length}` : ''}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {tab === 'overview' && (
            <>
              <ProfilePlaces username={p.username} isMe={!!d.is_me} />
              {land.data && land.data.total_plots > 0 && <LandSection land={land.data} username={p.username} home={house.data?.allowed ?? true} />}
              {!(land.data?.total_plots) && !places.data && <div className="mt-5"><Empty title="Nothing here yet" /></div>}
            </>
          )}
          {tab === 'art' && (
            <>
              <section className="mt-5">
                <h2 className="mb-3 font-display text-lg font-semibold">Artworks</h2>
                {d.gallery?.length ? <ArtGrid cards={d.gallery} /> : <Empty icon={<Brush className="h-6 w-6" />} title="No published artworks yet" />}
              </section>
              <StampBook username={p.username} />
            </>
          )}
          {tab === 'badges' && (
            <section className="mt-5" data-testid="profile-badges">
              {d.hidden?.badges ? <Empty title="Badges are private" /> : badges.length ? (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                  {[...badges].sort((a, b) => tierOf(b) - tierOf(a)).map((b) => (
                    <div key={b.key} className={cn('glass flex flex-col items-center gap-1.5 rounded-2xl p-3 text-center', b.key === badge?.key && 'ring-2 ring-[var(--pb)]')} style={vars}>
                      <BadgeIcon icon={b.icon} category={b.category} tier={tierOf(b)} size={50} />
                      <div className="text-[11px] font-bold leading-tight">{b.name}</div>
                    </div>
                  ))}
                </div>
              ) : <Empty title="No badges yet" />}
            </section>
          )}
          {tab === 'games' && (
            <section className="mt-5">
              {d.hidden?.games ? <Empty title="Game records are private" /> : Object.keys(d.minigames ?? {}).length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Object.entries(d.minigames).sort(([, a]: any, [, b]: any) => b.wins - a.wins).map(([g, r]: [string, any]) => (
                    <div key={g} className="glass rounded-2xl p-3">
                      <div className="font-bold">{GAME_INFO[g as GameId]?.name ?? g}</div>
                      <div className="mt-1 font-display text-xl font-black tnum">{fmt(r.wins)} <span className="text-xs font-bold text-muted">wins</span></div>
                      <div className="text-[11px] text-muted tnum">Level {r.highest_level} · best {fmt(r.best_score)}</div>
                    </div>
                  ))}
                </div>
              ) : <Empty title="No games played yet" />}
            </section>
          )}
        </motion.div>
      </AnimatePresence>

      <Dialog open={picking} onOpenChange={setPicking} title="Showcase a badge" description="Pick the badge everyone sees on your profile.">
        <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto scroll-thin sm:grid-cols-4" data-testid="badge-picker">
          <button onClick={() => void choose(null)} className={cn('flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line-strong p-2 text-center text-[11px] font-bold', !sc.badge && 'ring-2 ring-accent')}>⭐<span>My best</span></button>
          {[...badges].sort((a, b) => tierOf(b) - tierOf(a)).map((b) => (
            <button key={b.key} onClick={() => void choose(b.key)} data-testid="badge-pick" data-key={b.key}
              className={cn('flex flex-col items-center gap-1 rounded-2xl bg-surface-2/60 p-2 text-center transition hover:bg-surface-2', sc.badge === b.key && 'ring-2 ring-accent')}>
              <BadgeIcon icon={b.icon} category={b.category} tier={tierOf(b)} size={44} />
              <span className="text-[10px] font-bold leading-tight">{b.name}</span>
            </button>
          ))}
        </div>
      </Dialog>
    </Page>
  );
}

function Showpiece({ label, color, glow, delay, testid, action, children }: { label: string; color?: string; glow?: string; delay: number; testid: string; action?: ReactNode; children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.35 }} data-testid={testid}
      className="lv-showpiece relative overflow-hidden rounded-3xl p-3" style={{ '--sa': color ?? 'var(--line-strong)', '--sg': glow ?? color ?? 'transparent' } as CSSProperties}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted">{label}</span>{action}
      </div>
      {children}
    </motion.div>
  );
}

function StampBook({ username }: { username: string }) {
  const q = useQuery({ queryKey: ['stamp-book', username], queryFn: () => api.stampBook(username) });
  if (!q.data?.length) return null;
  return (
    <section className="mt-5" data-testid="stamp-book">
      <h2 className="mb-3 font-display text-lg font-semibold">Stamp book · {q.data.length}</h2>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
        {q.data.map((c, i) => (
          <Link key={c.id} to={`/art/${c.id}`} className="relative block rounded-xl border-2 border-dashed border-gold/50 bg-surface-2 p-1.5" style={{ transform: `rotate(${((i * 37) % 7) - 3}deg)` }}>
            <ArtThumb card={c} className="!rounded-md" />
            <span className="absolute -right-1.5 -top-1.5 rounded-full bg-gold px-1.5 text-[10px] font-extrabold text-bg tnum">#{c.serial}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** A player's land in brief: rarity mix, rent rate and their biggest canvases (shapes only). */
function LandSection({ land, username, home = true }: { land: PlayerLand; username: string; home?: boolean }) {
  const counts = RARITY_ORDER.map((r) => [r, land.rarity_counts[r] ?? 0] as const).filter(([, n]) => n > 0).reverse();
  return (
    <section className="mt-5" data-testid="profile-land">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Land</h2>
        <span className="text-xs text-muted tnum">{fmt(land.total_plots)} plots · earns {formatRate(Number(land.usd_per_second))}</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">{counts.map(([r, n]) => <span key={r} className="flex items-center gap-1.5 rounded-full bg-surface-2/60 py-0.5 pl-0.5 pr-2.5"><RarityBadge r={r} small /><b className="text-sm tnum">{n}</b></span>)}</div>
      <Link to={home ? `/u/${username}/home` : `/u/${username}`} className="glass flex flex-wrap items-center gap-3 rounded-3xl p-3 hover:border-line-strong">
        {land.canvases.slice(0, 5).map((c) => (
          <div key={c.id} className="flex h-20 w-20 items-center justify-center rounded-2xl bg-bg-2/70 p-1.5 shadow-[inset_0_0_0_1px_var(--line)]">
            <LandMosaic canvas={c} size={64} />
          </div>
        ))}
        {home && <span className="flex items-center gap-1.5 px-2 text-sm font-bold text-accent-2"><DoorOpen className="h-4 w-4" /> Step into their home</span>}
      </Link>
    </section>
  );
}
