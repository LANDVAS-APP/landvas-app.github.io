// /play — your plots' minigames: the only way to earn Ink (which buys plots).
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../backend/api';
import { Page, PageHeader } from '../app/Shell';
import { qk, useOnboardedMe, useWorld } from '../lib/queries';
import { plotLabel } from '../lib/utils';
import { fmt } from '../lib/utils';
import { PLOT_TYPES } from '../map/plotStyle';
import { GAME_INFO, type GameId } from '../shared/minigames';
import { rarityInfo } from '../shared/rarity';
import { Button, Empty, ResourceIcon, Spinner } from '../ui';
import { RarityBadge } from '../plot/RarityBadge';
import { GamePreview } from './GamePreview';

const ORDER: { game: GameId; type: keyof typeof PLOT_TYPES }[] = (
  ['lightlines', 'patternshift', 'colorburst', 'tracecraft', 'memorymural', 'sculptor', 'hueflow', 'mirrorline'] as GameId[]
).map((game) => ({ game, type: GAME_INFO[game].plotType as keyof typeof PLOT_TYPES }));

export default function PlayHub() {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const plots = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots, enabled: !!me });
  const records = useQuery({ queryKey: qk.records, queryFn: api.myMinigameRecords, enabled: !!me });
  const progress = useQuery({ queryKey: qk.plotProgress, queryFn: api.myPlotProgress, enabled: !!me });
  const world = useWorld();
  const cfg = world.data?.minigames?.games ?? {};
  if (!me || plots.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  const limit = records.data?.daily_rewarded_wins_per_game ?? 6;
  const resets = records.data?.resets_at ? new Date(records.data.resets_at) : null;
  return (
    <Page>
      <PageHeader eyebrow="Earn Ink" title="Play">
        {`Win your plots' minigames to earn Ink — the only currency that buys new plots. Each game pays Ink for ${limit} runs a day — every round you clear pays, and clear all 5 rounds to level the plot up${resets ? ` (resets ${resets.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})` : ''}. Rarer plots pay more.`}
      </PageHeader>
      {!(plots.data ?? []).length ? (
        <Empty icon={<MapPin className="h-6 w-6" />} title="Claim a plot first" action={<Button variant="rainbow" onClick={() => nav('/world')}>Find a plot on the map</Button>}>
          Every plot type has its own minigame, and every plot climbs its own levels. Your free starter plot is waiting on the map.
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {ORDER.filter(({ game }) => cfg[game]?.enabled !== false).map(({ game, type }) => {
            const t = PLOT_TYPES[type];
            const mine = (plots.data ?? []).filter((p: any) => p.plot_type === type);
            const best = [...mine].sort((a: any, b: any) => rarityInfo(b.rarity).ink_reward_multiplier - rarityInfo(a.rarity).ink_reward_multiplier)[0];
            const rec = records.data?.records?.[game];
            const used = records.data?.rewarded_today?.[game] ?? 0;
            return (
              <div key={game} className="glass relative overflow-hidden rounded-[26px] p-5">
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${t.a}, ${t.b})` }} />
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
                  {rec && <span className="tnum">Best {fmt(rec.best_score)}</span>}
                  <span className="tnum">Max level {Number(cfg[game]?.max_level ?? world.data?.minigames?.max_level ?? 60)}</span>
                  <span className="flex items-center gap-1 tnum"><ResourceIcon r="ink" /> {Math.max(0, limit - used)}/{limit} paying wins left</span>
                </div>
                {mine.length > 1 && (
                  <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Your plots and their levels">
                    {mine.slice(0, 12).map((p: any) => {
                      const lv = progress.data?.[`${p.gx}_${p.gy}`]?.highest_level ?? 0;
                      return (
                        <Link key={`${p.gx}_${p.gy}`} to={`/play/${game}?gx=${p.gx}&gy=${p.gy}`} className="rounded-full border border-line px-2.5 py-1 text-[11px] font-bold tnum text-muted hover:border-accent-2 hover:text-fg">
                          {plotLabel(p.gx, p.gy)} · Lv {lv + 1}
                        </Link>
                      );
                    })}
                  </div>
                )}
                {mine.length ? (
                  <div className="mt-4 flex items-center justify-between gap-2">
                    {best && <RarityBadge r={best.rarity} small />}
                    <Button variant="primary" onClick={() => nav(`/play/${game}?gx=${best.gx}&gy=${best.gy}`)}>Play</Button>
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
