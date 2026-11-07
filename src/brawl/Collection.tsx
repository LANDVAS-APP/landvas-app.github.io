// The arena's menus: your card collection (craft and dust), the deck builder (three decks, four lane terrains each),
// and the rankings. (Opening packs lives in PackOpening.tsx.)
import { useQuery } from '@tanstack/react-query';
import { Check, Minus, Plus, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { cn, fmt } from '../lib/utils';
import { Button, Dialog } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { sfx } from '../arcade/sfx';
import { CARD, CARDS, DECK_SIZE, RARITY_INFO, TERRAINS, TERRAIN_INFO, checkDeck, type Card, type Terrain } from '../shared/brawl/cards';
import { CardView } from './CardView';
import type { BrawlMe, PackCard } from './types';

const ORDER = [...TERRAINS, 'neutral'] as const;
const sortCards = (a: Card, b: Card) => ORDER.indexOf(a.terrain as (typeof ORDER)[number]) - ORDER.indexOf(b.terrain as (typeof ORDER)[number]) || a.cost - b.cost || a.name.localeCompare(b.name);
const errText = (code: string) => ({ deck_size: `A deck needs exactly ${DECK_SIZE} cards`, deck_copies: 'Too many copies of a card', deck_not_owned: 'You don’t own enough of a card', deck_terrains: 'Pick 4 lane terrains', brawl_card_in_deck: 'One of your decks needs that copy', maxed: 'You already have the most you can use', not_enough: 'Not enough for that yet' } as Record<string, string>)[code];

function Filters({ value, onChange }: { value: string; onChange(v: string): void }) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
      {['all', ...ORDER].map((t) => (
        <button key={t} onClick={() => onChange(t)} className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-bold', value === t ? 'bg-white text-black' : 'bg-surface-2')} data-testid={`brawl-filter-${t}`}>
          {t === 'all' ? 'All' : t === 'neutral' ? '✦ Wanderers' : `${TERRAIN_INFO[t as Terrain].emoji} ${TERRAIN_INFO[t as Terrain].name}`}
        </button>
      ))}
    </div>
  );
}

export function CollectionDialog({ open, onOpenChange, me, onMe }: { open: boolean; onOpenChange(o: boolean): void; me: BrawlMe; onMe(m: BrawlMe): void }) {
  const [filter, setFilter] = useState('all');
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = CARDS.filter((c) => filter === 'all' || c.terrain === filter).sort(sortCards);
  const owned = Object.values(me.cards).reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
  const act = async (dust: boolean) => {
    if (!pick) return; setBusy(true);
    try { const m = await api.brawlCraft(pick, dust); onMe(m); dust ? sfx.coin() : sfx.perfect(3); toast.success(dust ? `+${me.cfg.dust[CARD[pick].rarity]} dust` : `Crafted ${CARD[pick].name}!`); }
    catch (e) { const er = toGameError(e); toast.error(errText(er.code) ?? er.message); } finally { setBusy(false); }
  };
  const c = pick ? CARD[pick] : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title="🃏 Your cards" description={<>{owned} of {CARDS.length} discovered · ✨ {fmt(me.dust)} dust</>}>
      <div className="grid gap-2" data-testid="brawl-collection">
        <Filters value={filter} onChange={setFilter} />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {list.map((x) => {
            const n = me.cards[x.id] ?? 0, f = me.foils[x.id] ?? 0;
            return (
              <div key={x.id} className="relative grid justify-items-center">
                <CardView id={x.id} width={104} foil={f > 0} dim={n === 0} animate={false} onClick={() => setPick(x.id)} testid={`brawl-coll-${x.id}`} />
                <span className={cn('absolute -top-1.5 right-1 rounded-full px-1.5 text-[11px] font-black', n ? 'bg-[#3DDC97] text-black' : 'bg-black/70 text-white/70')}>×{n}</span>
              </div>
            );
          })}
        </div>
      </div>
      <Dialog open={!!c} onOpenChange={(o) => !o && setPick(null)} title={c?.name ?? ''} description={c ? `${RARITY_INFO[c.rarity].name} · you have ${me.cards[c.id] ?? 0}${me.foils[c.id] ? ` (${me.foils[c.id]} gold)` : ''}` : ''}>
        {c && (
          <div className="grid justify-items-center gap-3" data-testid="brawl-card-detail">
            <CardView id={c.id} width={230} foil={(me.foils[c.id] ?? 0) > 0} />
            <div className="flex gap-2">
              <Button variant="primary" loading={busy} disabled={(me.cards[c.id] ?? 0) >= me.cfg.max_copies[c.rarity] || me.dust < me.cfg.craft[c.rarity]} onClick={() => void act(false)} data-testid="brawl-craft"><Sparkles className="h-4 w-4" />Craft · ✨{me.cfg.craft[c.rarity]}</Button>
              <Button variant="secondary" loading={busy} disabled={(me.cards[c.id] ?? 0) === 0} onClick={() => void act(true)} data-testid="brawl-dust">Dust · +✨{me.cfg.dust[c.rarity]}</Button>
            </div>
          </div>
        )}
      </Dialog>
    </Dialog>
  );
}

export function DecksDialog({ open, onOpenChange, me, onMe }: { open: boolean; onOpenChange(o: boolean): void; me: BrawlMe; onMe(m: BrawlMe): void }) {
  const [edit, setEdit] = useState<{ slot: number; name: string; cards: string[]; terrains: string[] } | null>(null);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const start = (slot: number) => { const d = me.decks[slot]; setEdit({ slot, name: d?.name ?? `Deck ${slot + 1}`, cards: d ? [...d.cards] : [], terrains: d ? [...d.terrains] : ['meadow', 'ember', 'meadow', 'ember'] }); };
  const counts = useMemo(() => { const n: Record<string, number> = {}; for (const id of edit?.cards ?? []) n[id] = (n[id] ?? 0) + 1; return n; }, [edit]);
  const problem = edit ? checkDeck(edit.cards, edit.terrains, me.cards) : null;
  const add = (id: string) => {
    if (!edit) return; const c = CARD[id];
    if (edit.cards.length >= DECK_SIZE) { toast(`A deck holds ${DECK_SIZE} cards`); return; }
    if ((counts[id] ?? 0) >= Math.min(RARITY_INFO[c.rarity].max, me.cards[id] ?? 0)) { toast((me.cards[id] ?? 0) <= (counts[id] ?? 0) ? `You only have ${me.cards[id] ?? 0}` : `Only ${RARITY_INFO[c.rarity].max} per deck`); return; }
    sfx.tick(); setEdit({ ...edit, cards: [...edit.cards, id] });
  };
  const remove = (id: string) => { if (!edit) return; const i = edit.cards.lastIndexOf(id); if (i < 0) return; const cards = [...edit.cards]; cards.splice(i, 1); setEdit({ ...edit, cards }); };
  const save = async () => {
    if (!edit) return; setBusy(true);
    try { const m = await api.brawlDeckSave(edit.slot, edit.name, [...edit.cards].sort(), edit.terrains); onMe(m); sfx.perfect(3); toast.success(`${edit.name} saved — and it’s your deck now`); setEdit(null); }
    catch (e) { const er = toGameError(e); toast.error(errText(er.code) ?? er.message); } finally { setBusy(false); }
  };
  const use = async (slot: number) => { try { onMe(await api.brawlDeckUse(slot)); sfx.tick(); } catch (e) { toast.error(toGameError(e).message); } };
  const inDeck = edit ? Object.entries(counts).map(([id, n]) => ({ c: CARD[id], n })).sort((a, b) => sortCards(a.c, b.c)) : [];
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setEdit(null); onOpenChange(o); }} wide title={edit ? `✏️ ${edit.name}` : '📚 Your decks'} description={edit ? `${edit.cards.length}/${DECK_SIZE} cards` : 'Three deck slots. The one with the tick goes into battle.'}>
      {!edit ? (
        <div className="grid gap-2" data-testid="brawl-decks-panel">
          {[0, 1, 2].map((slot) => {
            const d = me.decks[slot];
            return (
              <div key={slot} className={cn('flex items-center gap-3 rounded-2xl border-2 bg-surface-2/60 p-3', me.deck_slot === slot ? 'border-[#3DDC97]' : 'border-line')} data-testid={`brawl-deck-${slot}`}>
                <div className="flex -space-x-6">{(d?.cards ?? []).filter((id, i, a) => a.indexOf(id) === i && CARD[id].kind === 'creature').sort((a, b) => CARD[b].cost - CARD[a].cost).slice(0, 3).map((id) => <CardView key={id} id={id} width={44} animate={false} tilt={false} />)}{!d && <div className="grid h-[62px] w-[44px] place-items-center rounded-lg border-2 border-dashed border-line text-muted">+</div>}</div>
                <div className="min-w-0 flex-1"><div className="font-bold">{d?.name ?? 'Empty slot'}</div><div className="text-xs text-muted">{d ? d.terrains.map((t) => TERRAIN_INFO[t as keyof typeof TERRAIN_INFO]?.emoji).join(' ') : 'Build a new deck'}</div></div>
                {d && me.deck_slot !== slot && <Button size="sm" variant="secondary" onClick={() => void use(slot)}>Use</Button>}
                {d && me.deck_slot === slot && <span className="flex items-center gap-1 text-xs font-bold text-[#3DDC97]"><Check className="h-4 w-4" />In use</span>}
                <Button size="sm" variant="primary" onClick={() => start(slot)} data-testid={`brawl-edit-${slot}`}>{d ? 'Edit' : 'Build'}</Button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3" data-testid="brawl-deck-editor">
          <div className="flex flex-wrap items-center gap-2">
            <input value={edit.name} maxLength={24} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm font-bold" aria-label="Deck name" />
            <div className="flex gap-1" aria-label="Lane terrains">
              {edit.terrains.map((t, i) => (
                <button key={i} title="Tap to change this lane’s terrain" onClick={() => { const ts = [...edit.terrains]; ts[i] = TERRAINS[(TERRAINS.indexOf(t as (typeof TERRAINS)[number]) + 1) % TERRAINS.length]; setEdit({ ...edit, terrains: ts }); sfx.tick(); }}
                  className="grid h-10 w-10 place-items-center rounded-xl text-xl" style={{ background: TERRAIN_INFO[t as keyof typeof TERRAIN_INFO].color }} data-testid={`brawl-lane-${i}`}>{TERRAIN_INFO[t as keyof typeof TERRAIN_INFO].emoji}</button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted">Lanes: tap to change. Creatures fighting on their own terrain get +1 attack.</p>
          <div className="flex min-h-[64px] flex-wrap gap-1 rounded-2xl bg-surface-2/60 p-2" data-testid="brawl-deck-list">
            {inDeck.map(({ c, n }) => (
              <button key={c.id} onClick={() => remove(c.id)} className="flex items-center gap-1 rounded-full py-0.5 pl-1 pr-2 text-xs font-bold" style={{ background: `${c.terrain === 'neutral' ? '#B9B4D6' : TERRAIN_INFO[c.terrain].color}40` }} title="Tap to take one out">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[#3A86FF] text-[10px] text-white">{c.cost}</span>{c.name}{n > 1 && <span className="text-muted">×{n}</span>}<Minus className="h-3 w-3 opacity-60" />
              </button>
            ))}
            {!inDeck.length && <span className="self-center text-xs text-muted">Tap cards below to add them.</span>}
          </div>
          <Filters value={filter} onChange={setFilter} />
          <div className="grid max-h-[40vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
            {CARDS.filter((x) => (filter === 'all' || x.terrain === filter) && (me.cards[x.id] ?? 0) > 0).sort(sortCards).map((x) => {
              const n = counts[x.id] ?? 0, cap = Math.min(RARITY_INFO[x.rarity].max, me.cards[x.id] ?? 0);
              return (
                <div key={x.id} className="relative grid justify-items-center">
                  <CardView id={x.id} width={96} animate={false} dim={n >= cap} onClick={() => add(x.id)} testid={`brawl-add-${x.id}`} />
                  <span className="absolute -top-1.5 right-1 rounded-full bg-black/75 px-1.5 text-[11px] font-black">{n}/{cap}</span>
                  {n < cap && <Plus className="absolute bottom-1 left-1 h-4 w-4 rounded-full bg-[#3DDC97] p-0.5 text-black" />}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={cn('text-xs font-bold', problem ? 'text-[#FF8AA0]' : 'text-[#3DDC97]')}>{problem ?? 'Ready for battle ✓'}</span>
            <div className="flex gap-2"><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" disabled={!!problem} loading={busy} onClick={() => void save()} data-testid="brawl-deck-save">Save deck</Button></div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

export function RanksDialog({ open, onOpenChange, me }: { open: boolean; onOpenChange(o: boolean): void; me: BrawlMe }) {
  const lb = useQuery({ queryKey: ['brawl', 'leaderboard'], queryFn: api.brawlLeaderboard, enabled: open });
  const hist = useQuery({ queryKey: ['brawl', 'history'], queryFn: api.brawlHistory, enabled: open });
  const ranks = me.cfg.ranks, next = ranks.find((r) => r[1] > me.trophies), cur = [...ranks].reverse().find((r) => r[1] <= me.trophies) ?? ranks[0];
  const pct = next ? ((me.trophies - cur[1]) / (next[1] - cur[1])) * 100 : 100;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="🏆 Rankings">
      <div className="grid gap-3" data-testid="brawl-ranks-panel">
        <div className="rounded-2xl bg-surface-2/70 p-3">
          <div className="flex items-center gap-3"><span className="text-4xl">{me.rank.emoji}</span><div className="flex-1"><div className="font-display text-xl font-black">{me.rank.name}</div><div className="text-xs text-muted">🏆 {me.trophies} trophies · best {me.best} · {me.wins}W {me.losses}L{me.streak > 1 ? ` · 🔥 ${me.streak} in a row` : ''}</div></div></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-gradient-to-r from-[#FF4FD8] to-[#FFE14D]" style={{ width: `${pct}%` }} /></div>
          <div className="mt-1 text-right text-[11px] text-muted">{next ? `${next[1] - me.trophies} to ${next[2]} ${next[0]}` : 'The very top!'}</div>
        </div>
        <div className="grid gap-1">
          <div className="text-xs font-black uppercase text-muted">Top players</div>
          {(lb.data?.top ?? []).map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 rounded-xl bg-surface-2/50 px-2 py-1.5 text-sm">
              <b className="w-6 text-center">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</b><span className="flex-1 truncate font-bold">@{p.username}</span><span>{p.rank.emoji}</span><span className="tabular-nums">🏆 {p.trophies}</span>
            </div>
          ))}
          {lb.data && !lb.data.top.length && <p className="text-xs text-muted">No ranked battles yet — be the first!</p>}
          {lb.data && <p className="text-right text-xs text-muted">You’re #{lb.data.place}</p>}
        </div>
        <div className="grid gap-1">
          <div className="text-xs font-black uppercase text-muted">Recent battles</div>
          {(hist.data ?? []).map((h) => (
            <div key={h.id} className="flex items-center gap-2 rounded-xl bg-surface-2/50 px-2 py-1.5 text-sm">
              <span>{h.status === 'live' ? '⏳' : h.draw ? '🤝' : h.won ? '🏆' : '💥'}</span><span className="flex-1 truncate">vs {h.opponent?.bot ? h.opponent.username : `@${h.opponent?.username}`}</span>
              {h.trophies != null && h.trophies !== 0 && <span className={cn('text-xs font-bold', h.trophies > 0 ? 'text-[#3DDC97]' : 'text-[#FF8AA0]')}>{h.trophies > 0 ? '+' : ''}{h.trophies}</span>}
            </div>
          ))}
          {hist.data && !hist.data.length && <p className="text-xs text-muted">No battles yet.</p>}
        </div>
      </div>
    </Dialog>
  );
}
