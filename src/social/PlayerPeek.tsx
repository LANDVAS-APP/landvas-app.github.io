// A peek at a player, popped out of their name in a chat: their face in a ring of their name's colour, their rarest plot
// (or the one they show off) standing in a lit banner, a few stats, their clan and badge — and what you can do from
// here: answer the line you tapped, open their profile, add them, invite them to your party, report or block. Your own
// peek lets you pick the rarity your name wears. It opens at once with what the chat line knows and fills in as the
// rest arrives. Its little show (the spring, one sweep of light, a burst of sparks) plays once and then holds still.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as RDialog from '@radix-ui/react-dialog';
import { Ban, CornerUpLeft, Flag, Lock, User, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { InviteToPartyButton } from '../party/PartyButtons';
import { BasePlotArt } from '../plot/BasePlotArt';
import { readableOn } from '../lib/readable';
import { cn } from '../lib/utils';
import { BadgeIcon, tierOf } from '../screens/BadgeIcon';
import { rarityInfo, rarityOdds, type RarityId } from '../shared/rarity';
import { PlayerAvatar } from '../ui';
import { FriendButton } from './FriendButton';
import { NameColorPicker } from './NameColorPicker';
import { nameStyle, nameTitle } from './nameColor';
import { usePeek } from './peek';

const W = 320;
const fmt = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString());

export default function PlayerPeek() {
  const { player, at, opts, close } = usePeek();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['peek', player!.id], queryFn: () => api.playerPeek(player!.id), staleTime: 30_000, retry: false });
  const d = q.data;
  const p = d?.profile ?? player!;
  const rar = p.name_rarity ? rarityInfo(p.name_rarity) : null;
  const hue = rar ? readableOn(rar.color, 'dark') : readableOn(p.accent_color || '#7B5CFF', 'dark');
  const glow = rar?.glow ?? '#FFFFFF';
  const card = useRef<HTMLDivElement | null>(null);
  // (the dialog mounts its content a moment after this: measure once the card is really there)
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const cardRef = useCallback((n: HTMLDivElement | null) => { card.current = n; setEl(n); }, []);
  const [pos, setPos] = useState<{ left: number; top: number; sheet: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const phone = typeof window !== 'undefined' && window.innerWidth < 520;

  // pop out of the name tapped (below it, or above when there's no room); a sheet from the bottom on a phone
  useLayoutEffect(() => {
    if (!el) return;
    const vw = window.innerWidth, vh = window.innerHeight, h = el.offsetHeight, w = el.offsetWidth;
    if (vw < 520 || !at) { setPos({ left: Math.round((vw - w) / 2), top: Math.max(8, vh - h - 10), sheet: true }); return; } // (held up off the home indicator in CSS)
    const left = Math.min(Math.max(8, at.x - 24), vw - w - 8);
    let top = at.y + at.h + 8;
    if (top + h > vh - 8) top = Math.max(8, at.y - h - 8);
    setPos({ left: Math.round(left), top: Math.round(top), sheet: false });
  }, [el, at, d]);

  const reply = opts.onReply && !d?.is_me ? opts.onReply : undefined;
  const isMe = d?.is_me ?? false;
  const report = async () => {
    if (!opts.message) return;
    close();
    try { await api.reportChat(opts.message.id, 'inappropriate'); toast.success('Thanks — a moderator will take a look'); } catch (e) { toast.error(toGameError(e).message); }
  };
  const block = async () => {
    setBusy(true);
    try {
      const on = !d?.blocked;
      await api.blockPlayer(p.id, on);
      if (on) { opts.onBlocked?.(p.id); close(); toast.success(`@${p.username} is blocked — you won’t see them any more`); }
      else { toast.success(`@${p.username} is unblocked`); void q.refetch(); }
      void qc.invalidateQueries({ queryKey: ['profile'] });
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  // (a phone: nearly the screen's width, from the bottom; a big screen: a card by the name)
  const vars = { '--ph': hue, '--pg': glow, width: phone ? 'min(440px, calc(100vw - 16px))' : `min(${W}px, calc(100vw - 16px))`, left: pos?.left ?? -9999,
    ...(pos?.sheet ? { top: 'auto', bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))', maxHeight: 'calc(100dvh - 20px - env(safe-area-inset-bottom, 0px))', overflowY: 'auto' } : { top: pos?.top ?? 0 }) } as Record<string, unknown> as CSSProperties;
  const origin = pos && at && !pos.sheet ? `${Math.round(at.x + Math.min(at.w, 60) / 2 - pos.left)}px ${at.y < pos.top ? '0px' : '100%'}` : '50% 100%';

  return (
    <RDialog.Root open onOpenChange={(o) => { if (!o) close(); }}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-[61] bg-black/30" data-testid="player-peek-scrim" />
        <RDialog.Content asChild aria-describedby={undefined} onOpenAutoFocus={(e) => { e.preventDefault(); card.current?.focus(); }}>
          <motion.div ref={cardRef} tabIndex={-1} data-testid="player-peek" data-player={p.username} data-name-rarity={p.name_rarity ?? undefined}
            className="lv-peek fixed z-[61] overflow-hidden rounded-[26px] border border-line bg-surface text-fg shadow-2xl outline-none"
            style={{ ...vars, transformOrigin: origin, visibility: pos ? 'visible' : 'hidden' }}
            initial={{ opacity: 0, scale: 0.72, y: phone ? 40 : 0 }} animate={pos ? { opacity: 1, scale: 1, y: 0 } : undefined}
            transition={{ type: 'spring', stiffness: 430, damping: 27, mass: 0.8 }}>
            {/* the banner: their colour, lit once by a sweep of light, with their showpiece plot standing in it */}
            <div className="lv-peek-banner relative h-[86px] overflow-hidden" aria-hidden>
              <motion.i className="lv-peek-shine" initial={{ x: '-140%' }} animate={{ x: '260%' }} transition={{ duration: 1.1, delay: 0.2, ease: 'easeOut' }} />
              {d?.rarest && (
                <motion.div className="absolute right-11 top-3 drop-shadow-[0_8px_14px_rgba(0,0,0,0.45)]"
                  initial={{ opacity: 0, scale: 0.4, rotate: -40, y: 10 }} animate={{ opacity: 1, scale: 1, rotate: -8, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 15, delay: 0.12 }}>
                  <BasePlotArt rarity={d.rarest.rarity as RarityId} shiny={d.rarest.shiny > 0} size={62} />
                </motion.div>
              )}
            </div>
            <RDialog.Close className="absolute right-2 top-2 z-10 rounded-full bg-black/35 p-1 text-white/85 hover:bg-black/55 hover:text-white" aria-label="Close" data-testid="player-peek-close">
              <X className="h-3.5 w-3.5" />
            </RDialog.Close>

            <div className="relative -mt-10 px-4 pb-4">
              {/* their face, in a ring of their colour, with a burst of sparks as it opens */}
              <div className="relative w-fit">
                <motion.div className="lv-peek-ring rounded-full p-[3px]" initial={{ scale: 0.5, rotate: -25 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.05 }}>
                  <div className="rounded-full bg-surface p-[2px]"><PlayerAvatar p={p} size={64} /></div>
                </motion.div>
                {Array.from({ length: 8 }, (_, i) => {
                  const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
                  return <motion.span key={i} className="lv-peek-spark pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full" aria-hidden
                    style={{ background: i % 2 ? glow : hue }} initial={{ x: -3, y: -3, opacity: 0.95, scale: 1 }}
                    animate={{ x: Math.cos(a) * 52 - 3, y: Math.sin(a) * 52 - 3, opacity: 0, scale: 0.3 }} transition={{ duration: 0.75, delay: 0.18, ease: 'easeOut' }} />;
                })}
                {d?.online && <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-2 border-[var(--surface)] bg-ok" title="Online now" data-testid="player-peek-online" />}
              </div>

              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <RDialog.Title className="mt-1.5 truncate font-display text-[20px] font-black leading-tight" data-testid="player-peek-name">
                  <span style={nameStyle(p, 'page', true)} title={nameTitle(p, d?.rarest?.picked)}>{p.display_name || p.username}</span>
                </RDialog.Title>
                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-muted">
                  <span className="truncate">@{p.username}</span>
                  {d?.clan && (
                    <button type="button" className="rounded-md px-1.5 py-px text-[10.5px] font-black tracking-wide text-white" style={{ background: d.clan.color ?? '#7B5CFF' }}
                      onClick={() => { close(); nav(`/clans/${d.clan!.id}`); }} data-testid="player-peek-clan">{d.clan.emblem ? `${d.clan.emblem} ` : ''}[{d.clan.tag}]</button>
                  )}
                  {d && <span>· since {new Date(d.member_since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>}
                </div>
              </motion.div>

              {/* their rarest plot (or the one they show off): what their name's colour means */}
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="mt-2.5">
                {d ? d.rarest && rar ? (
                  <div className="flex items-center gap-2 rounded-2xl border px-2.5 py-1.5" style={{ borderColor: `${rar.color}55`, background: `${rar.color}14` }} data-testid="player-peek-rarest">
                    <span className="text-lg leading-none">{rar.emoji ?? '◆'}</span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-muted">{d.rarest.picked ? 'Showing off' : 'Rarest plot'}</span>
                      <span className="block truncate text-[13px] font-black" style={nameStyle(p)}>{rar.name}{d.rarest.count > 1 ? ` ×${d.rarest.count}` : ''}{d.rarest.shiny ? ' ✨' : ''}</span>
                    </span>
                    <span className="shrink-0 text-[10.5px] font-bold text-muted">{rarityOdds(rar.id)}</span>
                  </div>
                ) : <div className="rounded-2xl border border-dashed border-line px-3 py-2 text-center text-[12px] text-muted">No land yet</div>
                  : <div className="lv-skel h-[46px] rounded-2xl" />}
              </motion.div>

              {/* a few numbers */}
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="mt-2">
                {!d ? <div className="lv-skel h-[50px] rounded-2xl" /> : d.stats ? (
                  <div className="grid grid-cols-4 gap-1" data-testid="player-peek-stats">
                    {([['Plots', d.stats.plots], ['Ultras', d.stats.ultras], ['Art', d.stats.artworks], ['Artist', d.stats.artist_level]] as const).map(([l, v]) => (
                      <div key={l} className="rounded-xl bg-bg-2/70 px-1 py-1.5 text-center">
                        <div className="font-display text-[15px] font-black leading-none tnum">{l === 'Artist' ? `Lv ${v}` : fmt(v)}</div>
                        <div className="mt-0.5 text-[9.5px] font-bold uppercase tracking-wider text-muted">{l}</div>
                      </div>
                    ))}
                  </div>
                ) : <div className="flex items-center justify-center gap-1 rounded-2xl bg-bg-2/60 py-2 text-[11.5px] text-muted" data-testid="player-peek-private"><Lock className="h-3 w-3" /> Keeps their stats private</div>}
              </motion.div>

              {d && (d.badge || d.crowns > 0) && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.28 }} className="mt-2 flex items-center gap-2 text-[12px]">
                  {d.badge && <span className="flex min-w-0 items-center gap-1.5"><BadgeIcon icon={d.badge.icon} category={d.badge.category} tier={tierOf(d.badge)} size={26} /><b className="truncate">{d.badge.name}</b>{d.badges && d.badges > 1 ? <span className="shrink-0 text-muted">+{d.badges - 1}</span> : null}</span>}
                  {d.crowns > 0 && <span className="ml-auto shrink-0 font-bold" title="Crowns held">👑 {d.crowns}</span>}
                </motion.div>
              )}

              {/* what you can do */}
              {isMe ? (
                <div className="mt-3 grid gap-2">
                  <NameColorPicker compact />
                  <button type="button" className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-surface-2 text-[13px] font-bold hover:bg-surface-3" onClick={() => { close(); nav(`/u/${p.username}`); }} data-testid="player-peek-profile">
                    <User className="h-4 w-4" /> My profile
                  </button>
                </div>
              ) : (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }} className="mt-3 grid gap-2">
                  <div className="flex gap-1.5">
                    {reply && (
                      <button type="button" className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-black text-white shadow-md" style={{ background: 'linear-gradient(135deg, #7B5CFF, #5B3CF0)' }}
                        onClick={() => { close(); reply(); }} data-testid="player-peek-reply"><CornerUpLeft className="h-4 w-4" /> Reply</button>
                    )}
                    <button type="button" className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-2 text-[13px] font-bold hover:bg-surface-3"
                      onClick={() => { close(); nav(`/u/${p.username}`); }} data-testid="player-peek-profile"><User className="h-4 w-4" /> Profile</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 [&_button]:rounded-full">
                    <FriendButton playerId={p.id} username={p.username} />
                    <InviteToPartyButton playerId={p.id} username={p.username} />
                  </div>
                  <div className="flex items-center gap-3 text-[11.5px] font-bold text-muted">
                    {opts.message && <button type="button" className="flex items-center gap-1 hover:text-fg" onClick={report} data-testid="player-peek-report"><Flag className="h-3.5 w-3.5" /> Report message</button>}
                    <button type="button" className={cn('flex items-center gap-1', d?.blocked ? 'hover:text-fg' : 'text-bad/80 hover:text-bad')} disabled={busy || !d} onClick={block} data-testid="player-peek-block">
                      <Ban className="h-3.5 w-3.5" /> {d?.blocked ? 'Unblock' : 'Block'}
                    </button>
                  </div>
                </motion.div>
              )}
              {q.error && <p className="mt-2 text-center text-[11.5px] text-muted">Couldn’t load more about @{p.username} right now.</p>}
            </div>
          </motion.div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
