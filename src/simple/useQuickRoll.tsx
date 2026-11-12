// Roll a plot from anywhere (simple mode's big button, a streak ticket, a Hot Zone roll): the full-screen ink roll
// starts at once, the server picks the plot, and the roll lands on what it rolled.
import { kindInfo } from '../enchant/kinds';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { celebrate, invalidateGame, qk, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { fmt } from '../lib/utils';
import { buzz } from '../native/native';
import type { RarityId } from '../shared/rarity';
import { InkRoll, type RollResult } from './InkRoll';
import { config } from '../env';

export type RollOpts = { ticket?: string; ticketRarity?: string; hot?: boolean };

export function useQuickRoll() {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const [state, setState] = useState<{ open: boolean; result: RollResult | null; opts: RollOpts; at?: { gx: number; gy: number }; luck?: number }>({ open: false, result: null, opts: {} });
  const busy = useRef(false);
  const settle = useRef<(() => void) | null>(null);
  const refresh = () => { invalidateGame(qc); for (const k of [qk.myPlots, qk.groups, ['quick-buy-quote'], ['daily'], ['collection'], ['luck']]) void qc.invalidateQueries({ queryKey: k }); };
  const settleNow = () => { const f = settle.current; settle.current = null; f?.(); };
  const quote = useQuery({ queryKey: ['quick-buy-quote'], queryFn: api.quickBuyQuote, enabled: !!me });
  const ink = Number(me?.balances.ink ?? 0);
  const cost = Number(quote.data?.ink ?? 0);
  const free = !!quote.data && (quote.data.starter || cost === 0);
  const canBuy = !!quote.data && (free || ink >= cost);

  const roll = async (opts: RollOpts = {}) => {
    if (busy.current) return;
    const HOT = 150;
    if (opts.hot && !opts.ticket && !free && ink < HOT) { toast(`A Hot Zone roll is ${HOT} Ink`, { description: 'Win minigames to earn Ink — or fly there and pick your own plots.' }); return; }
    if (!opts.ticket && !opts.hot && !canBuy) { toast(`You need ${fmt(cost)} Ink`, { description: 'Win minigames to earn Ink — then come back and roll.' }); return; }
    busy.current = true;
    if (useUi.getState().settings.haptics) buzz('medium');
    const luckBefore = (qc.getQueryData(['luck']) as { luck?: number } | undefined)?.luck ?? 0;
    setState({ open: true, result: null, opts, luck: luckBefore });
    try {
      const r = await api.quickBuyPlot({ ticket: opts.ticket, hot: opts.hot });
      setState({ open: true, opts, luck: luckBefore, at: { gx: r.gx, gy: r.gy }, result: { rarity: r.rarity as RarityId, usd: Number(r.usd_per_second), type: r.plot_type, first: r.starter, shiny: !!r.shiny, hot: !!r.hot_zone, lucky: !!r.lucky, choices: r.choices ?? null, choiceTypes: r.choice_types ?? null, choiceShiny: r.choice_shiny ?? null, guaranteed: opts.ticketRarity ?? null, enchant: (r as { enchant?: any }).enchant ?? null } });
      // (refresh the game once the roll has landed — refetching underneath it mid-spin costs frames)
      settle.current = () => { celebrate(r.achievements); refresh(); };
    } catch (e) {
      setState({ open: false, result: null, opts: {} });
      toast.error(toGameError(e).message);
    } finally { busy.current = false; }
  };

  // (tests and dev: show the roll for any rarity, without buying anything)
  if (config.e2e || import.meta.env.DEV) (window as any).__landvasRollDemo = (rarity: RarityId, shiny = false, choices: RarityId[] | null = null, choiceTypes: string[] | null = null, choiceShiny: boolean[] | null = null, enchant: string | null = null) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    setState({ open: true, result: null, opts: {} });
    // (an enchant kind turns the demo into an Enchanted roll: the drum changes mid-spin)
    const e = enchant ? { id: 'demo', kind: enchant, serial: 7, sigil: 424242, nickname: null, level: 1, gx: 0, gy: 0, titles: [], born_place: 'Salt Lake City', born_at: new Date().toISOString(), minted: 7, population: 7, name: kindInfo(enchant).name, emoji: kindInfo(enchant).emoji } : undefined;
    setTimeout(() => setState({ open: true, opts: {}, result: { rarity: e ? 'enchanted' : rarity, usd: 0.00000001, type: 'pigment', first: false, shiny: e ? false : shiny, choices, choiceTypes, choiceShiny, enchant: e } }), 300);
  };
  const element = (
    <InkRoll open={state.open} result={state.result} onClose={() => { settleNow(); setState({ open: false, result: null, opts: {} }); }}
      onRevealed={() => setTimeout(settleNow, 1600)}
      luck={state.luck}
      onPick={state.at ? async (i) => { const p = await api.luckPick(state.at!.gx, state.at!.gy, i); celebrate(p.achievements); } : undefined}
      onAgain={() => { const hot = state.opts.hot; settleNow(); setState({ open: false, result: null, opts: {} }); setTimeout(() => void roll({ hot }), 260); }}
      canAgain={state.opts.hot ? free || ink >= 150 : canBuy} againLabel={free ? 'Roll again · free' : `Roll again · ${fmt(state.opts.hot ? 150 : cost)} Ink`} />
  );
  return { roll, element, canBuy, cost, free, quote };
}
