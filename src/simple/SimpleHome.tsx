// Simple mode: LANDVAS on one screen. No map (it isn't even downloaded), no plot types to learn — buy a plot, watch its
// rarity roll, and watch your rent tick up. Earn Ink in the minigames to buy more. The full game is one tap away.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ChevronRight, Gamepad2, Map as MapIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { CanvasGroup } from '../backend/types';
import { DailyWheel } from '../earn/DailyWheel';
import { celebrate, invalidateGame, qk, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, fmt } from '../lib/utils';
import { buzz } from '../native/native';
import { RarityBadge } from '../plot/RarityBadge';
import { KIND_LABEL } from '../plot/mergeKind';
import { BasePlotArt } from '../plot/BasePlotArt';
import { BoostButton, LiveUsd, WalletDialog, useRaritySync, useRent } from '../rent/RentHud';
import { RARITY_ORDER, isUltra, rarityInfo, rarityOdds, type RarityId } from '../shared/rarity';
import { useQuickRoll } from './useQuickRoll';
import { StreakChip, StreakDialog, useDaily, useStreakPrompt } from '../daily/Streak';
import { HotZoneCard } from '../daily/HotZone';
import { CollectionCard, CollectionDialog } from '../daily/Collection';
import { currentRate, formatRate } from '../shared/rent';
import type { PlotTypeId } from '../shared/grid';
import { PlayerAvatar, ResourcePill, Spinner } from '../ui';
import { NotificationBell } from '../updates/Notifications';

type MyPlot = { gx: number; gy: number; plot_type: string; rarity: RarityId; level: number; group_id: string | null; name: string | null; usd_per_second: number; claimed_at: string; shiny?: boolean; today_mult?: number | null };

export default function SimpleHome() {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const update = useUi((s) => s.updateSettings);
  const haptics = useUi((s) => s.settings.haptics);
  useRaritySync();
  const { rent, offset } = useRent();
  const [wallet, setWallet] = useState(false);
  const [wheel, setWheel] = useState(false);
  const [streak, setStreak] = useState(false);
  const [album, setAlbum] = useState(false);
  const quick = useQuickRoll();
  const quote = quick.quote;
  useStreakPrompt(() => setStreak(true));
  const plots = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots, enabled: !!me });
  const groups = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: !!me });
  const spins = useQuery({ queryKey: ['wheel'], queryFn: api.wheelStatus, enabled: !!me, staleTime: 5 * 60_000 });
  if (!me) return <div className="grid h-full place-items-center"><Spinner /></div>;

  const ink = Number(me.balances.ink ?? 0);
  const cost = Number(quote.data?.ink ?? 0);
  const free = !!quote.data && (quote.data.starter || cost === 0);
  const canBuy = !!quote.data && (free || ink >= cost);
  const list = ((plots.data ?? []) as MyPlot[]).slice().sort((a, b) => +new Date(b.claimed_at) - +new Date(a.claimed_at));
  const kindOf = (id: string | null) => ((groups.data ?? []) as CanvasGroup[]).find((g) => g.id === id)?.kind ?? 'base';
  const spinsLeft = spins.data?.enabled ? spins.data.spins_left : 0;
  const rate = rent ? currentRate(rent, Date.now() + offset) : 0;

  const busy = false;
  const buy = () => { if (!canBuy) { toast(`You need ${fmt(cost)} Ink`, { description: 'Win minigames to earn Ink — then come back and roll.', action: { label: 'Play', onClick: () => nav('/play') } }); return; } void quick.roll(); };

  return (
    <div className="lv-game relative mx-auto grid w-full min-w-0 max-w-md gap-4 overflow-x-clip px-4 pb-[calc(104px+env(safe-area-inset-bottom,0px))] text-white md:pb-10" data-testid="simple-home">
      {/* top bar: always on screen, with the switch to the full game */}
      <div className="sticky top-0 z-20 -mx-4 flex items-center gap-2 bg-[#0B0E24]/85 px-4 pb-2 pt-[max(10px,env(safe-area-inset-top,0px))] backdrop-blur-md">
        <Link to="/me" className="flex min-w-0 items-center gap-2">
          <PlayerAvatar p={me.profile} size={36} />
          <span className="truncate text-sm font-extrabold">{me.profile.display_name || me.profile.username}</span>
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <ResourcePill r="ink" value={me.balances.ink} />
          <NotificationBell size="sm" />
          <button onClick={() => { update({ simpleMode: false }); buzz('light'); }} className="flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 text-[12px] font-extrabold" data-testid="simple-mode-off" aria-label="Switch to the full game">
            <MapIcon className="h-4 w-4" /> Full game
          </button>
        </div>
      </div>

      {/* the money */}
      {rent && (
        <div role="button" tabIndex={0} onClick={() => setWallet(true)} onKeyDown={(e) => { if (e.key === 'Enter') setWallet(true); }} className="relative cursor-pointer overflow-hidden rounded-[28px] border-[1.5px] border-white/12 bg-[linear-gradient(160deg,#16204f,#0b0f2e)] p-5 text-left shadow-[0_20px_50px_-24px_rgba(61,220,151,0.6)]" data-testid="simple-money">
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[#3DDC97]/15 blur-2xl" />
          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#3DDC97]">Your rent</div>
          <LiveUsd rent={rent} offset={offset} dim className="mt-1 block font-display text-[30px] font-semibold leading-none text-white" />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-white/60 tnum">{formatRate(rate)} · {list.length} plot{list.length === 1 ? '' : 's'}</span>
            <span onClick={(e) => e.stopPropagation()}><BoostButton compact /></span>
          </div>
        </div>
      )}

      {/* today: the streak */}
      <StreakStrip onOpen={() => setStreak(true)} />

      {/* the one big button */}
      <motion.button whileTap={{ scale: 0.96 }} onClick={buy} disabled={busy || !quote.data} data-testid="simple-buy"
        className={cn('relative overflow-hidden rounded-[28px] px-5 py-5 text-left shadow-[0_6px_0_#2c1a8a,0_22px_40px_-16px_rgba(123,92,255,0.9)] transition disabled:opacity-70',
          canBuy ? 'bg-[linear-gradient(135deg,#9a7bff,#5b3df5_55%,#ff3d9a)]' : 'bg-[linear-gradient(135deg,#3a3f6e,#262a52)]')}>
        <motion.span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg] bg-white/20" animate={canBuy ? { x: ['0%', '450%'] } : undefined} transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.2 }} />
        <div className="relative flex items-center gap-4">
          <span className="text-[44px] leading-none">{busy ? '🎰' : '🎲'}</span>
          <span className="grid min-w-0 flex-1">
            <span className="font-display text-[22px] font-black leading-tight">{busy ? 'Rolling…' : list.length ? 'Buy a plot' : 'Get your first plot'}</span>
            <span className="text-[13px] font-bold text-white/80">{!quote.data ? '…' : free ? 'Free · roll its rarity' : canBuy ? `${fmt(cost)} Ink · roll its rarity` : `${fmt(cost)} Ink · you have ${fmt(ink)}`}</span>
          </span>
        </div>
      </motion.button>

      {/* today's Hot Zone: boosted rarities in one real city */}
      <HotZoneCard onRoll={() => void quick.roll({ hot: true })} cost={cost} free={free} canBuy={canBuy} />

      {/* what you can roll */}
      <div className="grid grid-cols-3 gap-1.5" aria-label="Rarities you can roll" data-testid="simple-odds">
        {RARITY_ORDER.map((id) => {
          const r = rarityInfo(id);
          const ultra = isUltra(id);
          return (
            <div key={id} className={cn('rounded-2xl border px-2 py-1.5 text-center', ultra ? 'border-white/15 bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]' : 'border-white/10 bg-white/[0.04]')}>
              <div className="truncate text-[11px] font-black uppercase" style={{ color: r.color }}>{r.emoji ? `${r.emoji} ` : ''}{r.name}</div>
              <div className="text-[10px] font-semibold text-white/50 tnum">{rarityOdds(id)}</div>
            </div>
          );
        })}
      </div>
      <p className="-mt-2 px-1 text-[10px] text-white/40">Any plot can roll ✨ shiny (1 in 1,000) for ×5 rent. Ultra rarities each earn in their own special way.</p>

      <CollectionCard onOpen={() => setAlbum(true)} />

      {/* ways to get more */}
      <div className="grid grid-cols-2 gap-2.5">
        <button onClick={() => nav('/play')} className="lv-gbtn flex-col !items-start gap-1 px-4 py-3.5 text-left" data-testid="simple-earn">
          <Gamepad2 className="h-6 w-6 text-[#22E3FF]" />
          <span className="text-[15px]">Earn Ink</span>
          <span className="text-[11px] font-semibold text-white/55">Play minigames</span>
        </button>
        <button onClick={() => setWheel(true)} className={cn('lv-gbtn flex-col !items-start gap-1 px-4 py-3.5 text-left', spinsLeft > 0 && 'hot')} data-testid="simple-spin">
          <span className="text-2xl leading-none">🎡</span>
          <span className="text-[15px]">Daily spin</span>
          <span className="text-[11px] font-semibold text-white/70">{spinsLeft > 0 ? `${spinsLeft} free spin${spinsLeft === 1 ? '' : 's'}!` : 'Back tomorrow'}</span>
        </button>
      </div>

      {/* your plots */}
      <div className="grid gap-2" data-testid="simple-plots">
        <div className="flex items-baseline justify-between px-1">
          <span className="text-[12px] font-black uppercase tracking-[0.12em] text-white/60">Your plots</span>
          <span className="text-[12px] font-bold text-white/45 tnum">{list.length}</span>
        </div>
        {plots.isLoading ? <Spinner /> : list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-5 text-center text-sm text-white/55">No plots yet — your first one is free. Tap <b className="text-white">Get your first plot</b>.</div>
        ) : list.map((p, i) => {
          const k = kindOf(p.group_id);
          const r = rarityInfo(p.rarity);
          return (
            <motion.div key={`${p.gx}_${p.gy}`} initial={i < 8 ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5" data-testid="simple-plot">
              {k === 'base' ? <BasePlotArt rarity={p.rarity} shiny={p.shiny} size={40} className="shrink-0" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg" style={{ background: `linear-gradient(135deg, ${r.color}55, ${r.color}18)`, boxShadow: `inset 0 0 0 1.5px ${r.color}88` }}>{KIND_LABEL[k]?.emoji ?? '🎨'}</span>}
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-sm font-bold">{p.shiny ? '✨ ' : ''}{p.name || `Plot ${list.length - i}`}</span>
                <span className="text-[11px] font-semibold text-white/50">{p.today_mult != null ? <TodayMult rarity={p.rarity} m={Number(p.today_mult)} /> : k === 'base' ? 'Base plot' : KIND_LABEL[k]?.one ?? k}</span>
              </span>
              <span className="grid justify-items-end gap-0.5">
                <RarityBadge r={p.rarity} small />
                <span className="text-[11px] font-bold text-[#3DDC97] tnum">{formatRate(Number(p.usd_per_second))}</span>
              </span>
            </motion.div>
          );
        })}
      </div>

      <WalletDialog open={wallet} onOpenChange={setWallet} />
      <DailyWheel open={wheel} onOpenChange={setWheel} />
      {quick.element}
      <StreakDialog open={streak} onOpenChange={setStreak} onRoll={(o) => void quick.roll(o)} />
      <CollectionDialog open={album} onOpenChange={setAlbum} />
    </div>
  );
}

/** today's streak, right under the money: claim it, or see what's coming */
function StreakStrip({ onOpen }: { onOpen(): void }) {
  const q = useDaily();
  const d = q.data;
  if (!d?.enabled) return null;
  const toWeek = 7 - (d.streak % 7); // days until the next guaranteed roll
  return (
    <button onClick={onOpen} data-testid="streak-strip"
      className={cn('flex items-center gap-3 rounded-[22px] border-[1.5px] px-3.5 py-2.5 text-left', !d.claimed_today ? 'border-[#FFB31F]/60 bg-[linear-gradient(135deg,#FF6A1F33,#FFB31F1a)] shadow-[0_0_30px_-12px_#FFB31F]' : 'border-white/10 bg-white/[0.04]')}>
      <span className="font-display text-[26px] font-black leading-none tnum">🔥{d.streak}</span>
      <span className="grid min-w-0 flex-1 leading-tight">
        {!d.claimed_today ? <><span className="text-[14px] font-black">Claim day {d.streak + 1}!</span><span className="text-[11px] font-semibold text-white/70">+{fmt(d.next.ink)} Ink{d.next.ticket ? ` + a guaranteed ${rarityInfo(d.next.ticket).name}+ roll` : ''}</span></>
          : <><span className="text-[14px] font-black">{d.streak}-day streak</span><span className="text-[11px] font-semibold text-white/60">{d.tickets.length ? `${d.tickets.length} guaranteed roll${d.tickets.length === 1 ? '' : 's'} waiting!` : toWeek === 1 ? 'Guaranteed Rare+ roll tomorrow!' : `${toWeek} more day${toWeek === 1 ? '' : 's'} to a guaranteed Rare+ roll`}</span></>}
      </span>
      {d.tickets.length > 0 && <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[#14103a]">🎟️ {d.tickets.length}</span>}
    </button>
  );
}

/** Chaos: today's roll · Phoenix: lit, fading, ashes or reborn */
function TodayMult({ rarity, m }: { rarity: string; m: number }) {
  if (rarity === 'chaos') return <span className={cn('font-black', m >= 5 ? 'text-[#FFE14D]' : m >= 1 ? 'text-white/80' : 'text-[#FF6B8B]')} data-testid="chaos-today">🎲 ×{m} today</span>;
  const label = m >= 10 ? 'Reborn!' : m >= 2 ? 'Burning bright' : m > 0 ? 'Fading — check in!' : 'Ashes — check in to revive';
  return <span className={cn('font-black', m >= 2 ? 'text-[#FFD166]' : 'text-[#FF6B8B]')} data-testid="phoenix-today">🔥 ×{m} · {label}</span>;
}
