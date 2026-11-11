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
import { ClaimCelebration, useCelebration } from '../plot/ClaimCelebration';
import { RarityBadge } from '../plot/RarityBadge';
import { KIND_LABEL } from '../plot/mergeKind';
import { BoostButton, LiveUsd, WalletDialog, useRaritySync, useRent } from '../rent/RentHud';
import { RARITY_ORDER, rarityInfo, type RarityId } from '../shared/rarity';
import { currentRate, formatRate } from '../shared/rent';
import type { PlotTypeId } from '../shared/grid';
import { PlayerAvatar, ResourcePill, Spinner } from '../ui';
import { NotificationBell } from '../updates/Notifications';

type MyPlot = { gx: number; gy: number; plot_type: string; rarity: RarityId; level: number; group_id: string | null; name: string | null; usd_per_second: number; claimed_at: string };

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
  const [busy, setBusy] = useState(false);
  const quote = useQuery({ queryKey: ['quick-buy-quote'], queryFn: api.quickBuyQuote, enabled: !!me });
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

  const buy = async () => {
    if (busy) return;
    if (!canBuy) { toast(`You need ${fmt(cost)} Ink`, { description: 'Win minigames to earn Ink — then come back and roll.', action: { label: 'Play', onClick: () => nav('/play') } }); return; }
    setBusy(true);
    if (haptics) buzz('medium');
    try {
      const r = await api.quickBuyPlot();
      celebrate(r.achievements);
      useCelebration.getState().show({
        gx: r.gx, gy: r.gy, rarity: r.rarity as RarityId, type: r.plot_type as PlotTypeId, name: r.name, usd: Number(r.usd_per_second),
        groupId: r.group_id, first: r.starter, base: true, again: () => void buy(),
      });
      invalidateGame(qc);
      for (const k of [qk.myPlots, qk.groups, ['quick-buy-quote']]) void qc.invalidateQueries({ queryKey: k });
    } catch (e) {
      toast.error(toGameError(e).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="lv-game relative mx-auto grid w-full max-w-md gap-4 px-4 pb-[calc(104px+env(safe-area-inset-bottom,0px))] pt-[max(14px,env(safe-area-inset-top,0px))] text-white md:pb-10" data-testid="simple-home">
      {/* top bar */}
      <div className="flex items-center gap-2">
        <Link to="/me" className="flex min-w-0 items-center gap-2">
          <PlayerAvatar p={me.profile} size={36} />
          <span className="truncate text-sm font-extrabold">{me.profile.display_name || me.profile.username}</span>
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <ResourcePill r="ink" value={me.balances.ink} />
          <NotificationBell size="sm" />
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

      {/* what you can roll */}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6" aria-label="Rarities you can roll">
        {RARITY_ORDER.map((id) => {
          const r = rarityInfo(id);
          return (
            <div key={id} className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-1.5 text-center">
              <div className="truncate text-[11px] font-black uppercase" style={{ color: r.color }}>{r.name}</div>
              <div className="text-[10px] font-semibold text-white/50 tnum">{formatRate(Number(r.usd_per_second))}</div>
            </div>
          );
        })}
      </div>

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
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg" style={{ background: `linear-gradient(135deg, ${r.color}55, ${r.color}18)`, boxShadow: `inset 0 0 0 1.5px ${r.color}88` }}>{KIND_LABEL[k]?.emoji ?? '🟩'}</span>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-sm font-bold">{p.name || `Plot ${list.length - i}`}</span>
                <span className="text-[11px] font-semibold text-white/50">{k === 'base' ? 'Base plot' : KIND_LABEL[k]?.one ?? k}</span>
              </span>
              <span className="grid justify-items-end gap-0.5">
                <RarityBadge r={p.rarity} small />
                <span className="text-[11px] font-bold text-[#3DDC97] tnum">{formatRate(Number(p.usd_per_second))}</span>
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* the rest of the game */}
      <button onClick={() => { update({ simpleMode: false }); buzz('light'); }} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left" data-testid="simple-mode-off">
        <MapIcon className="h-5 w-5 shrink-0 text-white/60" />
        <span className="grid flex-1 leading-tight"><span className="text-sm font-bold">Switch to the full game</span><span className="text-[11px] text-white/50">The world map, plot types, worlds and more</span></span>
        <ChevronRight className="h-4 w-4 text-white/40" />
      </button>

      <WalletDialog open={wallet} onOpenChange={setWallet} />
      <DailyWheel open={wheel} onOpenChange={setWheel} />
      <ClaimCelebration />
    </div>
  );
}
