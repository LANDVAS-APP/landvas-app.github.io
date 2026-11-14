// Playing together (v1.0.0): with your travel group, wherever you've travelled to.
//  * emotes (wave, high five, dance…) that pop up over your explorer on everyone's map, and "meet me here" pings
//  * Balloon Rush: balloons fill the streets around you — pop the most in 2 minutes
//  * Flag Race: a flag goes up half a kilometre away — first one there wins
//  * group photos: everyone together at a stop, kept in everyone's photos
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type * as maplibregl from 'maplibre-gl';
import { newMarker } from '../map/maplib';
import { toast } from 'sonner';
import { Users } from 'lucide-react';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { GroupGame, GroupGameKind, GroupPhoto } from '../backend/types';
import { mapHandle } from '../map/mapHandle';
import { explorerNow, useExplorer } from '../explorer/explorer';
import { useInvalidate } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';
import { Button, Dialog, PlayerAvatar, Spinner } from '../ui';
import { balloonArt, flagArt } from '../explore/art';
import { EMOTES, sendGroup, shareable, showMyEmote, useGroupLive, type Emote } from './live';
import { memberAt, useTravelGroup } from './Group';
const fmtDur = (s: number) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export const useGroupPlayUi = create<{ open: boolean; set(o: boolean): void }>((set) => ({ open: false, set: (open) => set({ open }) }));
const GAMES: Record<GroupGameKind, { emoji: string; name: string; blurb: string }> = {
  balloons: { emoji: '🎈', name: 'Balloon Rush', blurb: 'Balloons fill the streets around you. Pop the most in 2 minutes.' },
  race: { emoji: '🏁', name: 'Flag Race', blurb: 'A flag goes up half a kilometre away. First one there wins.' },
};
const REACH: Record<GroupGameKind, number> = { balloons: 45, race: 30 };
const AUTO_M = 14;

function metres(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}
const myPos = () => { const s = useExplorer.getState(); return explorerNow(s.state, s.offset); };

export function useGroupGame() {
  const g = useTravelGroup().data?.group;
  return useQuery({
    queryKey: ['group-game'], queryFn: api.groupGameStatus, enabled: !!g, staleTime: 1000,
    refetchInterval: (q) => (q.state.data && !q.state.data.over ? 1500 : g?.game ? 1500 : 20_000),
  });
}

/** the rail button: your group (how many are here with you) */
export function GroupButton() {
  const g = useTravelGroup().data?.group;
  const live = useGroupLive((s) => s.pos);
  const set = useGroupPlayUi((s) => s.set);
  if (!g) return null;
  const here = g.members.filter((m) => !m.me && (m.away || live[m.id])).length;
  return (
    <button className={cn('lv-gbtn round', here > 0 && 'on')} onClick={() => set(true)} title="Your travel group: emotes, games and photos" data-testid="group-button">
      <Users className="h-5 w-5" /><span className="lbl tnum">{here > 0 ? `${here} here` : 'Group'}</span>
    </button>
  );
}

/** the group panel: who's here, emotes, games, photos */
export function GroupPlay() {
  const open = useGroupPlayUi((s) => s.open);
  const set = useGroupPlayUi((s) => s.set);
  const q = useTravelGroup();
  const g = q.data?.group;
  const game = useGroupGame().data;
  const qc = useQueryClient();
  const live = useGroupLive((s) => s.pos);
  const [busy, setBusy] = useState<string | null>(null);
  const [photos, setPhotos] = useState(false);
  const [snap, setSnap] = useState<GroupPhoto | null>(null);
  const away = useExplorer((s) => s.state?.mode === 'travel');
  const me = myPos();
  if (!g) return null;
  const emote = (e: Emote) => {
    if (!sendGroup({ t: 'emote', e })) { toast('Emotes reach your group while you’re travelling'); return; }
    showMyEmote(e); buzz('light'); set(false);
  };
  const ping = () => {
    const p = myPos();
    if (!p || !sendGroup({ t: 'ping', lng: p.lng, lat: p.lat })) { toast('Pings reach your group while you’re travelling'); return; }
    toast.success('📍 Sent: “Meet me here!”'); set(false);
  };
  const startGame = async (k: GroupGameKind) => {
    setBusy(k);
    try {
      const r = await api.groupGameStart(k);
      qc.setQueryData(['group-game'], r);
      sendGroup({ t: 'game' });
      void qc.invalidateQueries({ queryKey: ['travel-group'] });
      set(false);
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const photo = async () => {
    setBusy('photo');
    try {
      const r = await api.groupPhoto();
      setSnap(r); buzz('success'); sendGroup({ t: 'emote', e: 'cheese' }); showMyEmote('cheese');
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const live2 = game && !game.over;
  return (
    <>
      <Dialog open={open} onOpenChange={set} title="👥 Your group" description={away ? 'Together where you’ve travelled to — on each other’s maps, live.' : 'Travel somewhere to see each other and play together.'}>
        <div className="space-y-4" data-testid="group-play">
          <div className="grid gap-1">
            {g.members.map((m) => {
              const l = live[m.id];
              const at = m.me ? me && away ? [me.lng, me.lat] : null : l ? [l.lng, l.lat] : memberAt(m, Date.now());
              const d = !m.me && at && me && away ? metres(me, { lng: at[0], lat: at[1] }) : null;
              return (
                <button key={m.id} disabled={!at} onClick={() => { if (at) { useExplorer.getState().setFollowing(false); useUi.getState().requestFly({ lng: at[0], lat: at[1], zoom: 16.5 }); set(false); } }}
                  className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-surface-2/70 disabled:hover:bg-transparent" data-testid="play-member">
                  <PlayerAvatar p={m} size={32} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">@{m.username}{m.me && <span className="font-normal text-muted"> (you)</span>}</span>
                  <span className="text-[11px] text-muted">{m.me ? '' : !at ? '🏠 at home' : d == null ? '📍 away' : d < 1000 ? `${Math.round(d)} m away` : `${(d / 1000).toFixed(d < 10000 ? 1 : 0)} km away`}{l && !m.me ? ' · live' : ''}</span>
                </button>
              );
            })}
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">Say hi</div>
            <div className="grid grid-cols-4 gap-1.5">
              {EMOTES.map((e) => (
                <button key={e.id} onClick={() => emote(e.id)} disabled={!away} className="grid justify-items-center gap-0.5 rounded-xl bg-surface-2/60 py-2 text-[10.5px] font-semibold hover:bg-surface-2 disabled:opacity-40" data-testid={`emote-${e.id}`}>
                  <span className="text-2xl">{e.emoji}</span>{e.label}
                </button>
              ))}
              <button onClick={ping} disabled={!away} className="grid justify-items-center gap-0.5 rounded-xl bg-[#FF4F7B]/15 py-2 text-[10.5px] font-semibold hover:bg-[#FF4F7B]/25 disabled:opacity-40" data-testid="group-ping-send">
                <span className="text-2xl">📍</span>Meet here
              </button>
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">Play together, right here</div>
            <div className="grid gap-2">
              {(Object.keys(GAMES) as GroupGameKind[]).map((k) => (
                <div key={k} className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2/40 p-3">
                  <span className="text-3xl">{GAMES[k].emoji}</span>
                  <div className="min-w-0 flex-1"><div className="text-sm font-bold">{GAMES[k].name}</div><div className="text-[11.5px] text-muted">{GAMES[k].blurb}</div></div>
                  <Button size="sm" variant="primary" disabled={!away || !!live2 || g.members.length < 2} loading={busy === k} onClick={() => startGame(k)} data-testid={`start-${k}`}>Start</Button>
                </div>
              ))}
              <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2/40 p-3">
                <span className="text-3xl">📸</span>
                <div className="min-w-0 flex-1"><div className="text-sm font-bold">Group photo</div><div className="text-[11.5px] text-muted">Everyone here together, kept in everyone’s photos.</div></div>
                <Button size="sm" variant="ghost" disabled={!away} loading={busy === 'photo'} onClick={photo} data-testid="group-photo">Pose</Button>
              </div>
            </div>
            {!away && <div className="mt-2 text-center text-[11px] text-muted">Games and photos happen where you travel to together.</div>}
          </div>
          <button className="text-[12px] font-bold text-accent" onClick={() => setPhotos(true)} data-testid="group-photos-open">🖼️ Your group photos</button>
        </div>
      </Dialog>
      <Dialog open={!!snap} onOpenChange={(o) => !o && setSnap(null)} title="📸 Say cheese!" description={snap?.stop ? `At ${snap.stop.name}` : undefined}>
        {snap && <Polaroid p={snap} big />}
        <Button variant="primary" className="mt-3 w-full" onClick={() => setSnap(null)} data-testid="photo-close">Lovely</Button>
      </Dialog>
      <PhotosDialog open={photos} onOpenChange={setPhotos} />
    </>
  );
}

/** a group photo: everyone's explorer-coloured avatars lined up at the stop, with the date */
function Polaroid({ p, big }: { p: GroupPhoto; big?: boolean }) {
  const hue = [...(p.stop?.id ?? p.id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 11);
  return (
    <div className={cn('mx-auto rotate-[-1.5deg] rounded-md bg-white p-2 pb-3 text-[#222] shadow-xl', big ? 'max-w-[300px]' : '')} data-testid="polaroid">
      <div className="relative flex h-32 items-end justify-center gap-1 overflow-hidden rounded-sm px-2 pb-3" style={{ background: `linear-gradient(180deg, hsl(${hue} 70% 82%), hsl(${(hue + 40) % 360} 60% 70%))` }}>
        <span className="absolute left-2 top-1 text-xl">{p.stop?.kind === 'airport' ? '✈️' : '🚉'}</span>
        <span className="absolute right-2 top-1 text-xl">☀️</span>
        {p.members.slice(0, 10).map((m, i) => <div key={m.id} style={{ transform: `translateY(${(i % 2) * -6}px)` }}><PlayerAvatar p={m} size={p.members.length > 5 ? 30 : 40} /></div>)}
      </div>
      <div className="mt-2 text-center font-display text-[13px] font-bold">{p.stop?.name ?? 'Somewhere fun'}</div>
      <div className="text-center text-[10.5px] text-[#666]">{p.members.map((m) => '@' + m.username).join(' · ')} · {new Date(p.taken_at).toLocaleDateString()}</div>
    </div>
  );
}

function PhotosDialog({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }) {
  const q = useQuery({ queryKey: ['group-photos'], queryFn: api.groupPhotos, enabled: open });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="🖼️ Group photos">
      {q.isLoading ? <div className="flex justify-center py-6"><Spinner /></div>
        : !q.data?.length ? <div className="py-6 text-center text-sm text-muted">No group photos yet — meet up somewhere and pose!</div>
        : <div className="grid gap-4">{q.data.map((p) => <Polaroid key={p.id} p={p} />)}</div>}
    </Dialog>
  );
}

// ---- the game on the map ------------------------------------------------------------------------------------------
export function GroupGameLayer() {
  const q = useGroupGame();
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const game = q.data ?? null;
  const markers = useRef(new Map<string, maplibregl.Marker>());
  const busy = useRef(new Set<number>());
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(t); }, []);
  const [result, setResult] = useState<GroupGame | null>(null);
  const shownOver = useRef<string | null>(null);
  const wasLive = useRef<string | null>(null);
  // the game just ended (one we saw under way): the results
  useEffect(() => {
    if (!game) return;
    if (!game.over) { wasLive.current = game.id; return; }
    if (wasLive.current === game.id && shownOver.current !== game.id) { shownOver.current = game.id; setResult(game); invalidate(); if (game.scores.find((s) => s.me) && game.winner && game.scores.find((s) => s.me)?.id === game.winner.id) buzz('success'); }
  }, [game, invalidate]);

  const hit = async (g: GroupGame, i: number, auto = false) => {
    if (busy.current.has(i)) return;
    const p = myPos(), it = g.items[i];
    const d = p ? metres(p, it) : Infinity;
    if (d > REACH[g.kind]) { if (!auto) toast(`${Math.round(d)} m away`, { description: 'Get closer — walk, bike or drive with the joystick 🕹️' }); return; }
    if (Date.now() < new Date(g.starts_at).getTime()) { if (!auto) toast('Wait for the countdown!'); return; }
    busy.current.add(i);
    const el = markers.current.get(`${g.id}:${i}`)?.getElement();
    el?.classList.add('got');
    try {
      const r = await api.groupGameHit(g.id, i);
      qc.setQueryData(['group-game'], r);
      sendGroup({ t: 'game' });
      if (useUi.getState().settings.haptics) buzz('light');
      if (!r.late && g.kind === 'race') toast.success('🏁 You got there first!');
    } catch (e) {
      el?.classList.remove('got');
      if (!auto) toast.error(toGameError(e).message);
      void q.refetch();
    } finally { busy.current.delete(i); }
  };
  const hitRef = useRef(hit); hitRef.current = hit;

  // the balloons / the flag
  const items = useMemo(() => (game && !game.over ? game.items.filter((it) => !it.by) : []), [game]);
  useEffect(() => {
    const map = mapHandle.current;
    const keep = new Set(items.map((it) => `${game!.id}:${it.i}`));
    for (const [k, mk] of markers.current) if (!keep.has(k)) { const el = mk.getElement(); el.classList.add('got'); setTimeout(() => mk.remove(), 600); markers.current.delete(k); }
    if (!map || !game) return;
    for (const it of items) {
      const k = `${game.id}:${it.i}`;
      if (markers.current.has(k)) continue;
      const el = document.createElement('button');
      el.className = `lv-find game ${game.kind}`;
      el.dataset.testid = 'game-item'; el.dataset.i = String(it.i);
      el.innerHTML = game.kind === 'race' ? flagArt(it.c) : balloonArt(it.c);
      el.addEventListener('click', (e) => { e.stopPropagation(); void hitRef.current(game, it.i); });
      markers.current.set(k, newMarker({ element: el, anchor: 'bottom' }).setLngLat([it.lng, it.lat]).addTo(map));
    }
  }, [items, game]);
  useEffect(() => () => { for (const mk of markers.current.values()) mk.remove(); markers.current.clear(); }, []);
  // ride right past one: it's yours (only while you steer)
  useEffect(() => {
    if (!game || game.over || !items.length) return;
    const iv = setInterval(() => {
      const s = useExplorer.getState();
      if (!s.state || s.state.mode === 'gps') return;
      const p = myPos();
      if (!p) return;
      for (const it of items) if (metres(p, it) <= AUTO_M) void hitRef.current(game, it.i, true);
    }, 400);
    return () => clearInterval(iv);
  }, [game, items]);

  if (!game) return <ResultDialog g={result} onClose={() => setResult(null)} />;
  const now = Date.now() + useExplorer.getState().offset;
  const toStart = (new Date(game.starts_at).getTime() - now) / 1000;
  const left = (new Date(game.ends_at).getTime() - now) / 1000;
  const p = myPos();
  const flagD = game.kind === 'race' && p ? metres(p, game.items[0]) : null;
  return (
    <>
      {!game.over && shareable() && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(132px+env(safe-area-inset-top,0px))] z-20 flex justify-center px-4" data-testid="game-hud">
          <div className="pointer-events-auto rounded-2xl bg-[#0B0E24]/90 px-4 py-2 text-center text-white shadow-xl backdrop-blur">
            {toStart > 0 ? (
              <div className="font-display text-2xl font-black" data-testid="game-countdown">{GAMES[game.kind].emoji} {Math.ceil(toStart)}…</div>
            ) : (
              <>
                <div className="text-sm font-bold">{GAMES[game.kind].emoji} {GAMES[game.kind].name} · <span className="tnum">{fmtDur(left)}</span></div>
                <div className="text-[11px] text-white/75" data-testid="game-scores">
                  {game.kind === 'race' ? (flagD != null ? `${Math.round(flagD)} m to the flag` : 'Find the flag!')
                    : game.scores.length ? game.scores.map((s) => `${s.me ? 'You' : '@' + s.username} ${s.n}`).join(' · ') : `${game.items.length} balloons — go!`}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <ResultDialog g={result} onClose={() => setResult(null)} />
    </>
  );
}

function ResultDialog({ g, onClose }: { g: GroupGame | null; onClose(): void }) {
  if (!g) return null;
  const meWon = !!g.winner && g.scores.some((s) => s.me && s.id === g.winner!.id);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`${GAMES[g.kind].emoji} ${GAMES[g.kind].name}: ${meWon ? 'you won!' : g.winner ? `@${g.winner.username} won` : 'it’s a tie!'}`}>
      <div className="grid gap-1.5" data-testid="game-result">
        {g.winner && <div className="mb-2 flex items-center justify-center gap-2 text-lg font-black"><PlayerAvatar p={g.winner} size={40} /> 🏆 @{g.winner.username}</div>}
        {g.kind === 'balloons' && g.scores.map((s, i) => (
          <div key={s.id} className={cn('flex items-center justify-between rounded-xl px-3 py-1.5 text-sm', s.me ? 'bg-accent/15 font-bold' : 'bg-surface-2/50')}>
            <span>{i + 1}. {s.me ? 'You' : '@' + s.username}</span><span className="tnum">🎈 {s.n}</span>
          </div>
        ))}
        <div className="mt-1 text-center text-[11px] text-muted">{g.kind === 'balloons' ? 'Every balloon you popped is Ink; the winner gets a bonus.' : 'The winner gets 10 Ink.'}</div>
      </div>
      <Button variant="primary" className="mt-3 w-full" onClick={onClose} data-testid="game-result-close">Again!</Button>
    </Dialog>
  );
}
