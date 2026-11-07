// 🎨 The Paintbrawl Arena (a plot type): the 3D arena with your deck's lanes and creatures warming up, your rank,
// and the way into battle — ranked (matched live against a player near your trophies) or a practice bot — plus your
// cards, decks, packs and the rankings. A live match takes over the same 3D board.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Realm } from '../backend/types';
import { useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn, fmt } from '../lib/utils';
import { Button, PlayerAvatar, Spinner } from '../ui';
import { sfx } from '../arcade/sfx';
import { CARD, type Terrain } from '../shared/brawl/cards';
import type { View } from '../shared/brawl/engine';
import { createBoard3D, type Board3D } from './board3d';
import { portrait } from './creature3d';
import { genomeOf } from './cardArt';
import { CollectionDialog, DecksDialog, PackOpening, RanksDialog } from './Collection';
import { Match, boardPick } from './Match';
import type { BrawlMe, PackCard } from './types';

// the offline preview's instant demo asks for a practice match the moment the arena opens
let demoAuto = false;
export const setDemoAutoPractice = () => { demoAuto = true; };

export default function BrawlScreen({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['brawl', id], queryFn: () => api.brawlGet(id), staleTime: 15_000, refetchOnWindowFocus: false });
  if (q.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#120A22]"><Spinner /></div>;
  if (q.error || !q.data) return <div className="fixed inset-0 grid place-content-center gap-3 bg-[#120A22] p-6 text-center text-white"><div className="text-5xl">🎨</div><p>This arena couldn’t be found.</p><Link to="/world"><Button variant="secondary">Back to the map</Button></Link></div>;
  return <Arena key={q.data.id} data={q.data} />;
}

/** A pretend board for the lobby: your deck's lanes on both sides and a few of your creatures warming up. */
function showcaseView(me: BrawlMe): View {
  const d = me.decks[me.deck_slot] ?? me.decks.find(Boolean);
  const terrains = (d?.terrains ?? ['meadow', 'ember', 'frost', 'sugar']) as Terrain[];
  const creatures = [...new Set((d?.cards ?? []).filter((c) => CARD[c]?.kind === 'creature'))].sort((a, b) => CARD[b].cost - CARD[a].cost).slice(0, 4);
  const unit = (id: string, uid: number) => ({ uid, id, atk: CARD[id].atk!, hp: CARD[id].hp!, max: CARD[id].hp!, shield: false, frozen: 0, poison: 0, temp: 0, acted: false });
  const side = (k: number) => ({ name: '', hero: 25, heroMax: 25, paint: 0, deck: 0, hand: [], grave: [], fatigue: 0, timeouts: 0,
    lanes: terrains.map((t, i) => ({ terrain: k ? terrains[(i + 2) % 4] : t, unit: k === 0 && creatures[i] && i % 2 === 0 ? unit(creatures[i], 9000 + i) : k === 1 && creatures[i] && i % 2 === 1 ? unit(creatures[i], 9100 + i) : null, totem: null })) });
  return { v: 0, round: 0, turn: 0, first: 0, ev: 'none', over: false, winner: null, reason: '', uid: 0, me: 0, p: [side(0), side(1)], log: [] } as unknown as View;
}

function Arena({ data }: { data: Realm & { brawl: BrawlMe } }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const meP = useOnboardedMe();
  const [me, setMe] = useState<BrawlMe>(data.brawl);
  const [match, setMatch] = useState<string | null>(data.brawl.live);
  const [searching, setSearching] = useState<number | null>(null);
  const [panel, setPanel] = useState<'cards' | 'decks' | 'ranks' | null>(null);
  const [pack, setPack] = useState<PackCard[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const board = useRef<Board3D | null>(null);
  const [side, setSide] = useState<0 | 1>(0);

  // the board (rebuilt when we know which side of a match we're on)
  useEffect(() => {
    if (!cv.current) return;
    const b = createBoard3D({ canvas: cv.current, me: side, reduceMotion: reduce, onPick: (p) => boardPick?.(p) });
    board.current = b;
    if (location.search.includes('e2e=1') || import.meta.env.DEV) Object.assign(window, { __brawlBoard: b, __brawlPortrait: (id: string) => portrait(id, genomeOf)?.toDataURL() });
    return () => { b.dispose(); board.current = null; };
  }, [side]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const b = board.current; if (!b) return;
    if (!match) { b.setShowcase(true); b.setView(showcaseView(me)); b.highlight([]); b.setHeroes([{ name: '', color: meP?.profile.accent_color ?? '#7B5CFF', badge: me.rank.emoji }, { name: '', color: '#FF4FD8', badge: '❔' }]); }
    else b.setShowcase(false);
  }, [match, me, side]); // eslint-disable-line react-hooks/exhaustive-deps
  // which side am I in this match? and whose faces go on the heroes
  useEffect(() => {
    if (!match) return;
    void api.brawlView(match).then((v) => {
      if (v.side !== side) setSide(v.side);
      setTimeout(() => board.current?.setHeroes(v.players.map((p, i) => ({ name: p.username, color: p.accent_color ?? (i === v.side ? '#22E3FF' : '#FF4FD8'), badge: p.bot ? '🤖' : p.rank?.emoji ?? '🎨' })) as [never, never]), 50);
    }).catch(() => {});
  }, [match]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = async () => { const d = await api.brawlGet(data.id); setMe(d.brawl); return d.brawl; };

  // matchmaking: knock on the queue every couple of seconds until someone's found
  useEffect(() => {
    if (searching === null) return;
    let stop = false;
    const go = async () => {
      try {
        const r = await api.brawlOp({ op: 'queue' });
        if (stop) return;
        if (r.match) { sfx.jackpot(); setSearching(null); setMatch(r.match); return; }
      } catch (e) { if (!stop) { toast.error(errText(toGameError(e).code) ?? toGameError(e).message); setSearching(null); } return; }
      if (!stop) setTimeout(() => void go(), 2000);
    };
    void go();
    const t = setInterval(() => setSearching((s) => (s === null ? null : s + 1)), 1000);
    return () => { stop = true; clearInterval(t); };
  }, [searching === null]); // eslint-disable-line react-hooks/exhaustive-deps
  const cancelSearch = async () => { setSearching(null); try { setMe(await api.brawlQueueLeave()); } catch { /* fine */ } };
  const practice = async () => {
    setBusy('bot'); if (searching !== null) await cancelSearch();
    try { const r = await api.brawlOp({ op: 'bot' }); sfx.win(2); setMatch(r.match); }
    catch (e) { toast.error(errText(toGameError(e).code) ?? toGameError(e).message); } finally { setBusy(null); }
  };
  const openPack = async (free: boolean) => {
    setBusy('pack');
    try { const r = await api.brawlPackOpen(free); setMe(r.me); setPack(r.cards); sfx.swish(); }
    catch (e) { toast.error(toGameError(e).code === 'not_enough' ? `A pack costs 💠 ${me.cfg.pack_cost} shards` : toGameError(e).message); } finally { setBusy(null); }
  };

  useEffect(() => { if (demoAuto && !match) { demoAuto = false; void practice(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const deck = me.decks[me.deck_slot];
  const nextRank = me.cfg.ranks.find((r) => r[1] > me.trophies);
  return (
    <div className="fixed inset-0 z-40 select-none overflow-hidden bg-[#120A22] text-white" data-testid="realm" data-kind="brawl">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" style={{ touchAction: 'none' }} data-testid="brawl-canvas" />
      {match ? (
        <Match key={match} id={match} board={board} me0={meP?.user_id ?? ''} onLeave={() => { setMatch(null); void reload(); }} onPack={() => { setMatch(null); void reload().then((m) => { if (m.free_pack_ready) void openPack(true); }); }} />
      ) : (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 grid gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
            <div className="flex items-start gap-2">
              <button onClick={() => (history.length > 1 ? nav(-1) : nav('/world'))} className="pointer-events-auto grid h-10 w-10 place-items-center rounded-xl bg-black/60 backdrop-blur" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
              <div className="min-w-0 flex-1 rounded-2xl bg-black/60 px-3 py-1.5 backdrop-blur">
                <div className="flex items-center gap-2"><span className="truncate font-display text-base font-black">🎨 {data.name}</span>{!data.mine && <span className="flex items-center gap-1 text-[11px] text-white/70"><PlayerAvatar p={data.owner} size={14} />@{data.owner.username}’s</span>}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs"><span className="font-black text-[#FFE14D]" data-testid="brawl-rank">{me.rank.emoji} {me.rank.name}</span><span>🏆 {me.trophies}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gradient-to-r from-[#FF4FD8] to-[#FFE14D]" style={{ width: `${nextRank ? Math.max(4, ((me.trophies - me.rank.min) / (nextRank[1] - me.rank.min)) * 100) : 100}%` }} /></div></div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs font-black">
              <span className="rounded-full bg-black/60 px-2.5 py-1" data-testid="brawl-shards">💠 {fmt(me.shards)}</span>
              <span className="rounded-full bg-black/60 px-2.5 py-1">✨ {fmt(me.dust)} dust</span>
              {me.first_win_ready && <span className="rounded-full bg-[#FFE14D]/25 px-2.5 py-1 text-[#FFE14D]">🎁 First win today = free pack</span>}
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 grid gap-2 p-3 pb-[max(12px,env(safe-area-inset-bottom,0px))]">
            <div className="mx-auto w-full max-w-md rounded-2xl bg-black/55 px-3 py-2 text-center text-xs backdrop-blur" data-testid="brawl-deck-chip">
              Deck: <b>{deck?.name ?? '—'}</b> {deck && <span className="ml-1">{deck.terrains.map((t) => ({ meadow: '🌿', ember: '🔥', frost: '❄️', bog: '🍄', sugar: '🍭', neon: '⚡' } as Record<string, string>)[t]).join('')}</span>}
            </div>
            <div className="mx-auto grid w-full max-w-md grid-cols-[1fr_auto] gap-2">
              <button onClick={() => { sfx.swish(); setSearching(0); }} disabled={searching !== null || !!busy} className="rounded-2xl bg-gradient-to-r from-[#FF4FD8] to-[#7B5CFF] py-3.5 font-display text-xl font-black shadow-[0_6px_0_#5A2A8A] active:translate-y-1 active:shadow-[0_2px_0_#5A2A8A] disabled:opacity-60" data-testid="brawl-battle">⚔️ Battle</button>
              <button onClick={() => void practice()} disabled={!!busy} className="rounded-2xl bg-black/65 px-4 font-display text-sm font-black backdrop-blur" data-testid="brawl-practice">{busy === 'bot' ? <Loader2 className="h-5 w-5 animate-spin" /> : '🤖 Practice'}</button>
            </div>
            <div className="mx-auto grid w-full max-w-md grid-cols-4 gap-1.5">
              {([['cards', '🃏', 'Cards'], ['decks', '📚', 'Decks'], ['pack', '🎁', me.free_pack_ready ? 'Free pack!' : `Pack 💠${me.cfg.pack_cost}`], ['ranks', '🏆', 'Ranks']] as const).map(([k, e, n]) => (
                <button key={k} onClick={() => (k === 'pack' ? void openPack(me.free_pack_ready) : setPanel(k))} disabled={k === 'pack' && busy === 'pack'}
                  className={cn('grid h-16 place-items-center rounded-2xl bg-black/60 py-1 text-[10px] font-bold backdrop-blur', k === 'pack' && me.free_pack_ready && 'animate-pulse bg-[#FFE14D]/30 ring-2 ring-[#FFE14D]')} data-testid={`brawl-${k}`}>
                  <span className="text-2xl leading-none">{e}</span>{n}
                </button>
              ))}
            </div>
          </div>
          {searching !== null && (
            <div className="absolute inset-0 z-30 grid place-items-center bg-black/70 backdrop-blur-sm" data-testid="brawl-searching">
              <div className="grid justify-items-center gap-3 text-center">
                <div className="relative grid h-28 w-28 place-items-center"><div className="absolute inset-0 animate-spin rounded-full border-4 border-[#FF4FD8] border-t-transparent" /><span className="text-5xl">⚔️</span></div>
                <div className="font-display text-2xl font-black">Finding an opponent…</div>
                <div className="text-sm text-white/70">Looking near 🏆 {me.trophies} · {searching}s</div>
                {searching >= 12 && <Button variant="primary" onClick={() => void practice()} data-testid="brawl-search-bot">🤖 Play the practice bot instead</Button>}
                <Button variant="secondary" onClick={() => void cancelSearch()} data-testid="brawl-search-cancel">Cancel</Button>
              </div>
            </div>
          )}
        </>
      )}
      <CollectionDialog open={panel === 'cards'} onOpenChange={(o) => setPanel(o ? 'cards' : null)} me={me} onMe={setMe} />
      <DecksDialog open={panel === 'decks'} onOpenChange={(o) => setPanel(o ? 'decks' : null)} me={me} onMe={setMe} />
      <RanksDialog open={panel === 'ranks'} onOpenChange={(o) => setPanel(o ? 'ranks' : null)} me={me} />
      {pack && <PackOpening cards={pack} onDone={() => { setPack(null); void qc.invalidateQueries({ queryKey: ['brawl'] }); }} />}
    </div>
  );
}

function errText(code: string) {
  return ({ brawl_no_arena: 'You need a Paintbrawl Arena of your own to battle — turn one of your plots into an arena.', deck_size: 'Your deck isn’t complete (20 cards)', deck_not_owned: 'Your deck has cards you don’t own any more — fix it in Decks', deck_copies: 'Your deck has too many copies of a card', deck_terrains: 'Pick your deck’s 4 lane terrains' } as Record<string, string>)[code];
}
