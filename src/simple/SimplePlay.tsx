// Simple mode's Play tab: just your plots' minigames, as a game would show them. Every plot type has its own game;
// the ones you don't own a plot for yet are locked (roll more plots to collect them all).
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Lock, Play, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../backend/api';
import { qk, useOnboardedMe, useWorld } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, fmt } from '../lib/utils';
import { PLOT_TYPES } from '../map/plotStyle';
import { buzz } from '../native/native';
import { GamePreview } from '../play/GamePreview';
import { ORDER } from '../play/PlayHub';
import { activeBoost, fullClearInk } from '../play/rates';
import { RarityBadge } from '../plot/RarityBadge';
import { GAME_INFO } from '../shared/minigames';
import { rarityInfo, type RarityId } from '../shared/rarity';
import { ResourceIcon, ResourcePill, Spinner } from '../ui';

type MyPlot = { gx: number; gy: number; plot_type: string; rarity: RarityId; level: number };

export default function SimplePlay() {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const haptics = useUi((s) => s.settings.haptics);
  const plots = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots, enabled: !!me });
  const records = useQuery({ queryKey: qk.records, queryFn: api.myMinigameRecords, enabled: !!me });
  const world = useWorld();
  const cfg = world.data?.minigames?.games ?? {};
  if (!me || plots.isLoading) return <div className="grid h-full place-items-center"><Spinner /></div>;
  const mine = (plots.data ?? []) as MyPlot[];
  const limit = records.data?.daily_rewarded_wins_per_game ?? 6;
  const unlimited = world.data?.minigames?.limit_paid_runs === false;
  const games = ORDER.filter(({ game }) => cfg[game]?.enabled !== false).map(({ game, type }) => {
    const own = mine.filter((p) => p.plot_type === type);
    const best = [...own].sort((a, b) => rarityInfo(b.rarity).ink_reward_multiplier - rarityInfo(a.rarity).ink_reward_multiplier)[0];
    return { game, type, own, best, boost: activeBoost(world.data, game), used: records.data?.rewarded_today?.[game] ?? 0 };
  }).sort((a, b) => Number(!!b.best) - Number(!!a.best) || (b.boost?.multiplier ?? 1) - (a.boost?.multiplier ?? 1));
  const unlocked = games.filter((g) => g.best).length;

  return (
    <div className="lv-game relative mx-auto grid w-full max-w-md gap-4 overflow-x-hidden px-4 pb-[calc(104px+env(safe-area-inset-bottom,0px))] pt-[max(14px,env(safe-area-inset-top,0px))] text-white md:pb-10" data-testid="simple-play">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#22E3FF]">Play & earn Ink</div>
          <h1 className="font-display text-[26px] font-black leading-tight">Minigames</h1>
        </div>
        <ResourcePill r="ink" value={me.balances.ink} />
      </div>

      {/* collection progress: one game per plot type */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <div className="mb-1.5 flex items-center justify-between text-[12px] font-bold"><span>Games unlocked</span><span className="tnum text-white/70">{unlocked}/{games.length}</span></div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-[linear-gradient(90deg,#22E3FF,#8B5CFF,#FF3D9A)]" initial={{ width: 0 }} animate={{ width: `${(unlocked / Math.max(1, games.length)) * 100}%` }} transition={{ duration: 0.8 }} /></div>
        <p className="mt-1.5 text-[11px] text-white/50">Every plot type has its own game. Roll new plots to unlock them all.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {games.map(({ game, type, own, best, boost, used }, i) => {
          const t = PLOT_TYPES[type];
          const locked = !best;
          const left = Math.max(0, limit - used);
          return (
            <motion.button key={game} data-testid={`simple-game-${game}`} disabled={locked}
              initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: i * 0.04, type: 'spring', stiffness: 380, damping: 26 }}
              whileTap={locked ? undefined : { scale: 0.94 }}
              onClick={() => { if (haptics) buzz('medium'); nav(`/play/${game}?gx=${best!.gx}&gy=${best!.gy}`); }}
              className={cn('relative grid min-w-0 overflow-hidden rounded-[24px] border-[1.5px] text-left shadow-[0_5px_0_rgba(0,0,0,0.45)]', locked ? 'border-white/8 bg-white/[0.03]' : 'border-white/15')}
              style={locked ? undefined : { background: `linear-gradient(160deg, ${t.a}55, ${t.base} 70%)` }}>
              <div className={cn('relative grid aspect-[4/3] place-items-center overflow-hidden', locked && 'grayscale opacity-40')}>
                <GamePreview game={game} className="h-full w-full !rounded-none" />
                {boost && !locked && <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[10px] font-black text-[#2a1600]"><Zap className="h-3 w-3" />{boost.multiplier}×</span>}
                {best && <span className="absolute right-2 top-2"><RarityBadge r={best.rarity} small /></span>}
              </div>
              {locked && <span className="absolute inset-x-0 top-[28%] grid justify-items-center gap-1 text-white/70"><Lock className="h-6 w-6" /></span>}
              <div className="grid gap-1 p-2.5">
                <div className="truncate font-display text-[15px] font-black leading-tight">{GAME_INFO[game].name}</div>
                {locked ? (
                  <div className="text-[11px] font-semibold text-white/45">Roll a <span style={{ color: t.a }}>{t.name}</span> plot</div>
                ) : (
                  <>
                    <div className="flex items-center gap-1 text-[11px] font-bold text-white/80 tnum"><ResourceIcon r="ink" /> up to {fmt(fullClearInk(world.data, game, 1, best))}</div>
                    <div className="mt-1 flex items-center justify-between gap-1">
                      <span className="text-[10px] font-semibold text-white/55 tnum">{own.length} plot{own.length === 1 ? '' : 's'}{unlimited ? '' : ` · ${left} left`}</span>
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-[#14103a] shadow-[0_3px_0_rgba(0,0,0,0.35)]"><Play className="h-3.5 w-3.5 fill-current" /></span>
                    </div>
                  </>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
