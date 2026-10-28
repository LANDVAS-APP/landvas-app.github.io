// /play — your plots' minigames: the only way to earn Ink (which buys plots).
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../backend/api';
import { Page, PageHeader } from '../app/Shell';
import { qk, useOnboardedMe, useWorld } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { PLOT_TYPES } from '../map/plotStyle';
import { GAME_INFO, type GameId } from '../shared/minigames';
import { rarityInfo } from '../shared/rarity';
import { Button, Empty, ResourceIcon, Spinner } from '../ui';
import { RarityBadge } from '../plot/RarityBadge';
import { GamePreview } from './GamePreview';
import { activeBoost, bonusText, boostLeft, fullClearInk } from './rates';
import { Swords, Zap } from 'lucide-react';

const ORDER: { game: GameId; type: keyof typeof PLOT_TYPES }[] = (
  ['lightlines', 'patternshift', 'colorburst', 'tracecraft', 'memorymural', 'sculptor', 'rollermural', 'mirrorline'] as GameId[]
).map((game) => ({ game, type: GAME_INFO[game].plotType as keyof typeof PLOT_TYPES }));

export default function PlayHub() {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const plots = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots, enabled: !!me });
  const records = useQuery({ queryKey: qk.records, queryFn: api.myMinigameRecords, enabled: !!me });
  const world = useWorld();
  const cfg = world.data?.minigames?.games ?? {};
  if (!me || plots.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  const limit = records.data?.daily_rewarded_wins_per_game ?? 6;
  const unlimitedRuns = world.data?.minigames?.limit_paid_runs === false;
  const resets = records.data?.resets_at ? new Date(records.data.resets_at) : null;
  return (
    <Page>
      <PageHeader eyebrow="Earn Ink" title="Play">
        {`Win your plots' minigames to earn Ink — the only currency that buys new plots. Every round you clear pays, and clearing all of a level's rounds levels the plot up (beaten levels can't be replayed). ${unlimitedRuns ? 'Paid runs are unlimited right now.' : `Each game pays Ink for ${limit} runs a day${resets ? ` (resets ${resets.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})` : ''}.`} Rarer plots pay more.`}
      </PageHeader>
      {world.data && (
        <Link to="/pvp" className="glass mb-4 flex items-center gap-3 rounded-[22px] p-4 transition hover:ring-1 hover:ring-hot/60" data-testid="play-pvp">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-hot/15 text-hot"><Swords className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block font-display font-semibold">PvP minigames</span><span className="block text-xs text-muted">Free head-to-head games in rounds against an anonymous rival. Win more rounds, win Ink.</span></span>
          <span className="text-sm font-bold text-hot">Enter →</span>
        </Link>
      )}
      {!(plots.data ?? []).length ? (
        <Empty icon={<MapPin className="h-6 w-6" />} title="Claim a plot first" action={<Button variant="rainbow" onClick={() => nav('/world')}>Find a plot on the map</Button>}>
          Every plot type has its own minigame, and every plot climbs its own levels. Your free starter plot is waiting on the map.
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {ORDER.filter(({ game }) => cfg[game]?.enabled !== false)
            // boosted games float to the top, biggest boost first
            .sort((a, b) => (activeBoost(world.data, b.game)?.multiplier ?? 1) - (activeBoost(world.data, a.game)?.multiplier ?? 1))
            .map(({ game, type }) => {
            const t = PLOT_TYPES[type];
            const boost = activeBoost(world.data, game);
            const mine = (plots.data ?? []).filter((p: any) => p.plot_type === type);
            const best = [...mine].sort((a: any, b: any) => rarityInfo(b.rarity).ink_reward_multiplier - rarityInfo(a.rarity).ink_reward_multiplier)[0];
            const rec = records.data?.records?.[game];
            const used = records.data?.rewarded_today?.[game] ?? 0;
            return (
              <div key={game} className={cn('glass relative overflow-hidden rounded-[26px] p-5', boost && 'ring-2 ring-gold/70 shadow-[0_0_40px_-12px_rgba(255,201,61,0.7)]')} data-testid={`game-card-${game}`}>
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: boost ? 'linear-gradient(90deg,#FFC93D,#FF8A5B,#FFC93D)' : `linear-gradient(90deg, ${t.a}, ${t.b})` }} />
                {boost && (
                  <div className="mb-3 flex items-center gap-2 rounded-xl bg-gold/15 px-3 py-2 text-sm" data-testid={`boost-${game}`}>
                    <Zap className="h-4 w-4 shrink-0 text-gold" /><span><b className="text-gold">Boosted · {boost.multiplier}× Ink</b> <span className="text-muted">{boostLeft(boost)}</span></span>
                  </div>
                )}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="eyebrow">{t.name} plots</div>
                    <h2 className="font-display text-xl font-semibold">{GAME_INFO[game].name}</h2>
                    <p className="text-sm text-muted">{GAME_INFO[game].tagline}</p>
                  </div>
                  <GamePreview game={game} size={88} className="shrink-0 shadow-lg ring-1 ring-white/10" />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                  <span>{mine.length} plot{mine.length === 1 ? '' : 's'}</span>
                  <span className="flex items-center gap-1 tnum"><ResourceIcon r="ink" /> {fmt(fullClearInk(world.data, game, 1, best))} for level 1</span>
                  {rec && <span className="tnum">Best {fmt(rec.best_score)}</span>}
                  <span className="tnum">Max level {Number(cfg[game]?.max_level ?? world.data?.minigames?.max_level ?? 60)}</span>
                  {!unlimitedRuns && <span className="flex items-center gap-1 tnum"><ResourceIcon r="ink" /> {Math.max(0, limit - used)}/{limit} paid runs left</span>}
                </div>
                {(cfg[game]?.bonuses ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5" data-testid={`bonuses-${game}`}>
                    {(cfg[game].bonuses as Parameters<typeof bonusText>[0][]).map((b, i) => <span key={i} className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-bold text-gold">Bonus · {bonusText(b)}</span>)}
                  </div>
                )}
                {mine.length ? (
                  <div className="mt-4 flex items-center justify-between gap-2">
                    {best && <RarityBadge r={best.rarity} small />}
                    <Button variant={boost ? 'rainbow' : 'primary'} onClick={() => nav(`/play/${game}`)} data-testid={`play-${game}`}>Play</Button>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-faint">You don’t own a <span style={{ color: t.a }}>{t.name}</span> plot yet. Every plot’s type stays hidden until it’s claimed, so keep claiming on the <Link to="/world" className="underline">map</Link> to discover one.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}
