// 🃏 Fated Deck: a green-baize table and a fan of cards, face down. Turn one — it lifts, spins over in 3D and lands
// upright or reversed (a twist: a bigger effect with a catch), gilded once in a while. Let it come true, hold it for later
// (★2), or turn a reversed card upright (★3). Every card joins your deck: all 22 bring an Epic-or-better ticket.
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../../ui';
import { centerOf, efx, type SceneProps } from '../core';
import { PlotRow, sleep, useCraftClip, type PlotLite } from '../craft';
import { feel } from '../living';
import { useMyPlotsLite } from '../myPlots';
import { MapPickButton, usePlotChoice } from '../pickers';

type Card = { id: string; n: number; name: string; up: any[]; rev: any[] };
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
/** each card's picture: an emblem on a field of its colour */
export const CARD_ART: Record<string, { e: string; c: string; c2: string }> = {
  fool: { e: '🎒', c: '#FFD166', c2: '#EF476F' }, magician: { e: '🪄', c: '#B388FF', c2: '#3D1E7A' }, priestess: { e: '🌙', c: '#8EC5FF', c2: '#1B2A5B' },
  empress: { e: '🌹', c: '#FF8FAB', c2: '#5C1A33' }, emperor: { e: '🏛️', c: '#F4A261', c2: '#5A2A0C' }, hierophant: { e: '🔑', c: '#E9C46A', c2: '#3A2A08' },
  lovers: { e: '💞', c: '#FF5D8F', c2: '#4A0D2A' }, chariot: { e: '🏇', c: '#4CC9F0', c2: '#0B2A4A' }, strength: { e: '🦁', c: '#FFB703', c2: '#5A3300' },
  hermit: { e: '🏮', c: '#C9B8FF', c2: '#241A44' }, wheel: { e: '☸️', c: '#06D6A0', c2: '#064A3A' }, justice: { e: '⚖️', c: '#ADE8F4', c2: '#14304A' },
  hanged: { e: '🙃', c: '#90BE6D', c2: '#1F3A12' }, rebirth: { e: '🦋', c: '#CDB4DB', c2: '#2E1A40' }, temperance: { e: '🏺', c: '#80FFDB', c2: '#0E3A34' },
  devil: { e: '😈', c: '#E63946', c2: '#2A0509' }, tower: { e: '⚡', c: '#FFD60A', c2: '#2A2A2A' }, star: { e: '⭐', c: '#9BF6FF', c2: '#13265A' },
  moon: { e: '🌕', c: '#E0E1DD', c2: '#1B263B' }, sun: { e: '☀️', c: '#FFBE0B', c2: '#7A2E00' }, judgement: { e: '📯', c: '#F6BD60', c2: '#3D2A0A' },
  world: { e: '🌍', c: '#52B788', c2: '#081C15' },
};

/** what an effect says, in plain words */
function says(x: any): string {
  switch (x.t) {
    case 'ink': return `+${x.v} Ink`;
    case 'coin': return `a coin flip for ${x.v} Ink`;
    case 'plots': return `${x.v} Ink a plot you own (up to ${x.cap})`;
    case 'luck': return x.v >= 0 ? `+${x.v} Luck` : `${x.v} Luck`;
    case 'coinluck': return `a coin flip: +${x.v} or +${x.lo} Luck`;
    case 'eluck': return `+${x.v} Enchanted Luck`;
    case 'wins': return `your next ${x.u} minigame win${x.u > 1 ? 's' : ''} pay ×${x.m}`;
    case 'glow': return `your enchantments pay ×${x.m} for ${x.h} h`;
    case 'lev': return `your Leviathan hits ×${x.m} for ${x.h} h`;
    case 'ticket': return x.p ? `a ${Math.round(x.p * 100)}% chance at a ${x.r}+ ticket (else ${x.lo})` : `a ${x.r}-or-better roll ticket`;
    case 'cointicket': return `a ${Math.round(x.p * 100)}% chance at a ${x.r}+ ticket`;
    case 'rebirth': return 'Rebirth: turn one of your plots into another kind';
    case 'reroll': return `${x.v} free reroll${x.v > 1 ? 's' : ''} on your next plot roll`;
    default: return '';
  }
}
function result(x: any): string {
  switch (x.t) {
    case 'ink': return `+${x.v} Ink`;
    case 'coin': return x.won ? `The coin came up: +${x.v} Ink` : 'The coin came down tails';
    case 'luck': return `${x.v >= 0 ? '+' : ''}${x.v} Luck${x.won === false ? ' (the low side)' : ''}`;
    case 'eluck': return `+${x.v} Enchanted Luck`;
    case 'wins': return `Next ${x.u} win${x.u > 1 ? 's' : ''} ×${x.m}`;
    case 'glow': return `Enchantments ×${x.m} for ${x.h} h`;
    case 'lev': return `Leviathan hits ×${x.m} for ${x.h} h`;
    case 'ticket': return x.won === false ? 'No ticket this time' : `A ${x.r}+ roll ticket!`;
    case 'rebirth': return 'Rebirth is in your hand';
    case 'reroll': return `${x.v} free reroll${x.v > 1 ? 's' : ''} armed for your next roll`;
    default: return '';
  }
}

export function CardFace({ card, up = true, foil }: { card: Card | { id: string; n: number; name: string }; up?: boolean; foil?: boolean }) {
  const a = CARD_ART[card.id] ?? CARD_ART.fool;
  return (
    <div className={cn('lvx-card-face lvx-card-front', !up && 'rev')}>
      <div className="lvx-card-art absolute inset-[6%] grid grid-rows-[auto_1fr_auto] rounded-md" style={{ background: `radial-gradient(circle at 50% 42%, ${a.c}, ${a.c2} 78%)` }}>
        <div className="pt-1 text-center font-display text-[11px] font-black text-white/90">{ROMAN[card.n]}</div>
        <div className="relative grid place-items-center">
          <div className="absolute inset-[8%] rounded-full" style={{ background: `repeating-conic-gradient(from 0deg, ${a.c}66 0 6deg, transparent 6deg 15deg)` }} />
          <span className="relative text-[clamp(26px,9vw,46px)] drop-shadow-[0_3px_4px_rgba(0,0,0,0.5)]">{a.e}</span>
        </div>
        <div className="mx-1 mb-1 rounded bg-[#FFF8E7] px-1 py-0.5 text-center font-display text-[9px] font-black uppercase tracking-wide text-[#2A1620]">{card.name}</div>
      </div>
      {foil && <div className="lvx-foil" />}
    </div>
  );
}

export function DeckScene({ v, view, act, busy }: SceneProps) {
  const table = useRef<HTMLDivElement>(null);
  const clip = useCraftClip(v);
  const deck: Card[] = view.deck ?? [];
  const byId = useMemo(() => new Map(deck.map((c) => [c.id, c])), [deck]);
  const [lift, setLift] = useState<number | null>(null);
  const [shown, setShown] = useState<any>(null);
  const [tab, setTab] = useState<'table' | 'deck'>('table');
  const [reborn, setReborn] = useState<{ p: PlotLite | null; t: string | null }>({ p: null, t: null });
  const [grandShown, setGrandShown] = useState<any[] | null>(null);
  const spread = !!view.spread;
  const POS = ['Past', 'Present', 'Future'];
  const n = Number(view.cards ?? 3);
  const flipped: any[] = view.flipped ?? [];
  const pending = view.pending, hand = view.hand;
  const left = Number(view.picks ?? 1) - Number(view.picked ?? 0);
  const col: Record<string, number> = view.collection ?? {};

  const flip = async (i: number, grandSpread = false) => {
    setLift(i); feel('medium');
    await sleep(380);
    const r = await act('flip', { i, grand: grandSpread }, { silent: true });
    setLift(null);
    if (!r?.result) return;
    feel(r.result.up ? 'success' : 'heavy');
    const a = CARD_ART[r.result.card.id];
    efx.burst({ ...centerOf(table.current), colors: [a?.c ?? '#FFD166', '#fff', ...(r.result.foil ? ['#FF78DC', '#78E6FF'] : [])], count: r.result.foil ? 220 : 90, speed: 11, kind: r.result.foil ? 'glitter' : 'spark' });
    if (r.result.complete) efx.burst({ ...centerOf(table.current), colors: ['#FFD166'], count: 30, speed: 10, kind: 'emoji', emojis: ['🃏', '🌟', '🎉'] });
  };
  const accept = async (o: { hold?: boolean; upright?: boolean } = {}) => {
    const r = await act('accept', o, { silent: true });
    if (!r?.result) return;
    if (r.result.held) { feel('light'); return; }
    setShown(r.result);
    if (r.result.pay?.paid) efx.pay(r.result.pay, 'deck', centerOf(table.current));
    const big = ['world', 'sun', 'star', 'tower', 'moon'].includes(r.result.card.id) || r.result.foil;
    if (big) {
      const a = CARD_ART[r.result.card.id];
      clip({ title: `${r.result.card.name}${r.result.up ? '' : ' (reversed)'}`, sub: v.nickname || 'Fated Deck', emoji: '🃏', payoff: a.e, color: a.c, kicker: 'Turning a card…', head: r.result.card.name.toUpperCase(),
        lines: (r.result.effects as any[]).map(result).filter(Boolean).slice(0, 2), text: `🃏 ${r.result.card.name} — clip your fate?` });
    }
  };
  // level 8, once a week: the Grand Spread — five cards at once, chained
  const grandSpread = async () => {
    feel('heavy');
    const r = await act('grand', {}, { silent: true });
    if (!r?.result?.grand) return;
    setGrandShown(r.result.grand);
    efx.burst({ ...centerOf(table.current), colors: ['#FFD166', '#B388FF', '#fff'], count: 260, speed: 14, kind: 'spark' });
    const best = (r.result.grand as any[]).find((c) => ['world', 'sun', 'star', 'tower', 'moon'].includes(c.card.id) || c.foil);
    if (best) clip({ title: 'The Grand Spread', sub: v.nickname || 'Fated Deck', emoji: '🃏', payoff: CARD_ART[best.card.id]?.e ?? '🌌', color: '#FFD166', kicker: 'Five cards at once…', head: 'THE GRAND SPREAD',
      lines: (r.result.grand as any[]).slice(0, 3).map((c) => `${c.card.name}${c.up ? '' : ' (reversed)'}`), text: '🌌 The Grand Spread — clip it?' });
  };
  const play = async () => { const r = await act('play', {}, { silent: true }); if (r?.result) { setShown(r.result); if (r.result.pay?.paid) efx.pay(r.result.pay, 'deck', centerOf(table.current)); } };

  const pendCard = pending ? byId.get(pending.card) : null;
  return (
    <div className="grid gap-3">
      <div ref={table} className="lvx-stage lv-scene aspect-[4/3] w-full" data-testid="deck-scene">
        <div className="lvx-table" />
        <div className="absolute inset-x-[5%] top-[12%] flex justify-center gap-[3%]" style={{ perspective: 900 }}>
          {Array.from({ length: n }, (_, i) => {
            const f = flipped.find((x) => Number(x.i) === i);
            const c = f ? byId.get(f.card) : null;
            const fan = (i - (n - 1) / 2) * 5;
            return (
              <motion.div key={i} className={cn('lvx-card w-[22%]', f && 'flipped', !f && 'lvx-card-hover')} style={{ animationDelay: `${i * 0.4}s` }}
                initial={{ y: -120, rotate: 0, opacity: 0 }} animate={{ y: lift === i ? -26 : f && f.i === pending?.i ? -12 : 0, rotate: fan, opacity: 1, scale: lift === i ? 1.08 : 1 }}
                transition={{ type: 'spring', stiffness: 160, damping: 15, delay: i * 0.08 }} onClick={() => !f && !pending && left > 0 && !busy && void flip(i)} data-testid={`deck-card-${i}`}>
                <div className="lvx-card-in">
                  <div className="lvx-card-face lvx-card-back" />
                  {c && <CardFace card={c} up={!!f.up} foil={!!f.foil} />}
                </div>
                {spread && f?.pos && <div className="absolute -bottom-5 inset-x-0 text-center text-[10px] font-black uppercase tracking-wider text-[#FFD166]">{f.pos}</div>}
              </motion.div>
            );
          })}
        </div>
        <div className="absolute left-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[12px] font-black text-[#FFD166]" data-testid="deck-left">🃏 {left > 0 ? (spread ? `${POS[Math.min(2, 3 - left)]} — ${left} to turn` : `${left} to turn today`) : 'All turned today'}</div>
        {spread && Number(view.chain ?? 0) > 0 && <div className="absolute right-3 top-3 rounded-full bg-[#FFD166] px-2.5 py-1 text-[12px] font-black text-[#14062A]" data-testid="deck-chain">⛓️ Chain ×{Number(view.chain_mult ?? 1)}</div>}
        <AnimatePresence>
          {pending && pendCard && (
            <motion.div className="absolute inset-x-3 bottom-3 grid gap-1.5 rounded-2xl bg-[#05140F]/92 p-3" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} data-testid="deck-pending">
              <div className="font-display text-[17px] font-black text-white">{pendCard.name}{pending.up ? '' : ' · reversed'}{pending.foil ? ' · ✨ gilded' : ''}</div>
              <div className="text-[12px] text-white/75">{(pending.up ? pendCard.up : pendCard.rev).map(says).join(' · ')}{pending.foil ? ' — gilded: ×1.5' : ''}</div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="rainbow" onClick={() => void accept()} disabled={!!busy} data-testid="deck-accept">Let it come true</Button>
                {view.hold_ready && !hand && <Button size="sm" onClick={() => void accept({ hold: true })} disabled={!!busy} data-testid="deck-hold">✋ Hold it</Button>}
                {!pending.up && view.right_ready && <Button size="sm" onClick={() => void accept({ upright: true })} disabled={!!busy} data-testid="deck-right">🌟 Turn it upright</Button>}
              </div>
            </motion.div>
          )}
          {!pending && shown && (
            <motion.div className="absolute inset-x-3 bottom-3 grid gap-1 rounded-2xl bg-[#05140F]/92 p-3" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShown(null)} data-testid="deck-result">
              <div className="font-display text-[16px] font-black text-[#FFD166]">{shown.pos ? `${shown.pos}: ` : ''}{shown.card.name}{shown.righted ? ' · turned upright' : ''}{Number(shown.mult ?? 1) > 1 ? ` · chained ×${Number(shown.mult)}` : ''}</div>
              {(shown.effects as any[]).map((x, i) => <motion.div key={i} className="text-[13px] font-bold text-white" initial={{ x: -12, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 + i * 0.15 }}>✦ {result(x)}</motion.div>)}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="lvx-grain" />
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/5 p-1">
        {(['table', 'deck'] as const).map((t) => <button key={t} className={cn('rounded-xl py-2 text-[12px] font-black', tab === t ? 'bg-[#FFD166] text-[#14062A]' : 'text-white/70')} onClick={() => setTab(t)} data-testid={`deck-tab-${t}`}>{t === 'table' ? '🃏 Today' : `📚 Your deck · ${Object.keys(col).length}/22`}</button>)}
      </div>

      {tab === 'table' && (
        <div className="grid gap-2">
          {hand && byId.get(hand.card) && (
            <div className="flex items-center gap-3 rounded-2xl border border-[#FFD166]/40 bg-[#FFD166]/10 p-2.5" data-testid="deck-hand">
              <div className="lvx-card w-14 flipped"><div className="lvx-card-in"><div className="lvx-card-face lvx-card-back" /><CardFace card={byId.get(hand.card)!} up={!!hand.up} foil={!!hand.foil} /></div></div>
              <span className="grid flex-1 leading-tight"><span className="text-[13px] font-black text-white">In your hand: {byId.get(hand.card)!.name}</span><span className="text-[11px] text-white/60">{(hand.up ? byId.get(hand.card)!.up : byId.get(hand.card)!.rev).map(says).join(' · ')}</span></span>
              <Button size="sm" variant="rainbow" onClick={() => void play()} disabled={!!busy} data-testid="deck-play">Play it</Button>
            </div>
          )}
          {view.grand_ready && !pending && <Button variant="rainbow" onClick={() => void grandSpread()} disabled={!!busy} data-testid="deck-grand">🌌 Lay the Grand Spread — five cards at once (once a week)</Button>}
          <AnimatePresence>
            {grandShown && (
              <motion.div className="grid gap-2 rounded-2xl border border-[#FFD166]/50 bg-[#14062A] p-3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} data-testid="deck-grand-result">
                <div className="flex items-center justify-between"><span className="font-display text-[16px] font-black text-[#FFD166]">🌌 The Grand Spread</span><button className="lv-x" onClick={() => setGrandShown(null)} aria-label="Close">×</button></div>
                <div className="grid grid-cols-5 gap-1.5" style={{ perspective: 900 }}>
                  {grandShown.map((g, i) => (
                    <motion.div key={i} className="lvx-card w-full flipped" initial={{ rotateY: 180, y: -40, opacity: 0 }} animate={{ rotateY: 0, y: 0, opacity: 1 }} transition={{ delay: 0.15 + i * 0.22, type: 'spring', stiffness: 140, damping: 14 }}>
                      <div className="lvx-card-in"><div className="lvx-card-face lvx-card-back" /><CardFace card={g.card} up={!!g.up} foil={!!g.foil} /></div>
                    </motion.div>
                  ))}
                </div>
                {grandShown.map((g, i) => <motion.div key={i} className="text-[12px] font-bold text-white/85" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 + i * 0.22 }}>
                  ✦ {g.card.name}{g.up ? '' : ' (reversed)'}{Number(g.mult) > 1 ? ` · ×${Number(g.mult)}` : ''}: {g.text || '—'}</motion.div>)}
              </motion.div>
            )}
          </AnimatePresence>
          {Number(view.rebirth ?? 0) > 0 && (
            <div className="grid gap-1.5 rounded-2xl bg-white/5 p-2.5" data-testid="deck-rebirth">
              <div className="lvx-label">🦋 Rebirth · turn a plot into another kind</div>
              <div className="flex flex-wrap gap-1">{(view.types ?? []).map((t: any) => <button key={t.id} className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold', reborn.t === t.id ? 'bg-white text-black' : 'bg-white/10 text-white/80')} onClick={() => setReborn({ ...reborn, t: t.id })}>{t.name}</button>)}</div>
              <RebirthPlots self={v} onPick={(p) => setReborn({ ...reborn, p })} sel={reborn.p} />
              <Button size="sm" variant="rainbow" disabled={!!busy || !reborn.p || !reborn.t} onClick={() => reborn.p && void act('rebirth', { gx: reborn.p.gx, gy: reborn.p.gy, type: reborn.t }).then((r) => r && setReborn({ p: null, t: null }))}>Reborn</Button>
            </div>
          )}
          {(view.glows ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">{(view.glows as any[]).map((g, i) => <span key={i} className="rounded-full bg-[#B388FF]/15 px-2.5 py-1 text-[11px] font-bold text-[#E0D1FF]">✨ {g.card ? byId.get(g.card)?.name : 'a card'}: {g.kind === 'golden_hour' ? `wins ×${Number(g.mult)} (${g.uses} left)` : g.kind === 'fate_tower' ? `Leviathan ×${Number(g.mult)}` : `×${Number(g.mult)}`}</span>)}</div>
          )}
          <p className="text-center text-[11px] text-white/55">Reversed cards ({Math.round(Number(view.reversed_pct ?? 0.3) * 100)}% of draws) are a twist: a bigger effect with a catch. Gilded cards pay ×1.5.{Number(v.level) < 4 ? ' Level 4: a Past–Present–Future spread — each upright card strengthens the next.' : ' Each upright card that comes true strengthens the next; a reversed one breaks the chain.'}{Number(v.level) < 8 ? ' Level 8: a weekly five-card Grand Spread.' : ''}</p>
        </div>
      )}
      {tab === 'deck' && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" data-testid="deck-collection">
          {deck.map((c) => (
            <div key={c.id} className="grid gap-0.5">
              <div className={cn('lvx-card w-full', col[c.id] && 'flipped')}><div className="lvx-card-in"><div className="lvx-card-face lvx-card-back" style={{ opacity: col[c.id] ? 1 : 0.35 }} />{col[c.id] ? <CardFace card={c} /> : null}</div></div>
              <div className="text-center text-[10px] font-bold leading-tight text-white/70">{col[c.id] ? `${c.name} ×${col[c.id]}` : '?'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RebirthPlots({ onPick, sel, self }: { onPick: (p: PlotLite) => void; sel: PlotLite | null; self: { id: string } }) {
  // your plots, from the cache the map and the Grimoire share — or tap one on the map
  const plots = useMyPlotsLite();
  const map = usePlotChoice(self, 'rebirth', plots, onPick, { title: 'Rebirth: which plot?', emoji: '🌱', color: '#B388FF', hint: 'Tap the plot to be reborn as another kind' });
  return (
    <div className="grid gap-1.5">
      {map.canMap && <MapPickButton className="w-fit" onClick={map.toMap} testId="deck-rebirth-map" label="Pick the plot on the map" />}
      <div className="grid max-h-[160px] gap-1 overflow-y-auto">{plots.slice(0, 40).map((p) => <PlotRow key={`${p.gx},${p.gy}`} p={p} on={sel?.gx === p.gx && sel?.gy === p.gy} onClick={() => onPick(p)} testId="deck-rebirth-plot" />)}</div>
    </div>
  );
}
