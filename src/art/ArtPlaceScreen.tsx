// Art's places: the Studio (any Art canvas) and the Gallery (an Art Estate), one walk-round 3D world on the place
// engine. Same feel as the house and the arcade: drag to walk, tap to go, your explorer, the room's people, chat and
// party invites. Step up to something and its action appears; the sheets below do the rest.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import type { ArtPlace, ExplorerStyle, GalleryHang, GalleryPiece, MuseumLoan, Realm } from '../backend/types';
import { CrispArt } from '../gallery/CrispArt';
import { useAssetUrl } from '../gallery/GalleryScreen';
import { GuestBook } from '../home/GuestBook';
import { useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';
import { config } from '../env';
import { usePartyUi } from '../party/party';
import { createPlace, type PlaceScene } from '../places/engine';
import { PlaceChatDock } from '../places/PlaceChat';
import { explorerUrl, usePlaceLive } from '../places/usePlaceLive';
import { gameIds, useRealmCore } from '../realms/core';
import { ESTATE_GAMES } from '../realms/estates/games';
import { Button, Dialog, inputCls, PlayerAvatar, Slider, Spinner, Tabs, useConfirm } from '../ui';
import { buildArt, LIGHTS, WALLS, type ArtWorld } from './artWorld';
import { buildDiorama, type Diorama } from './diorama';

export const artKey = (group: string) => ['art-place', group] as const;
type Sheet = { kind: 'piece' | 'hang'; slot: string } | { kind: 'desk' | 'potw' | 'window' | 'doors' | 'book' | 'supplies' | 'exhibit' | 'loandesk' } | { kind: 'room'; room: number };
const GOLD = '#D9B24A';

export default function ArtPlaceScreen() {
  const { groupId } = useParams();
  const q = useQuery({ queryKey: artKey(groupId!), queryFn: () => api.artPlace(groupId!), staleTime: 15_000, refetchOnWindowFocus: false });
  if (q.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#120E0A]"><Spinner /></div>;
  if (q.error || !q.data) return (
    <div className="fixed inset-0 grid place-content-center gap-3 bg-[#120E0A] p-6 text-center text-white">
      <div className="text-5xl">🎨</div><p>This studio couldn’t be found.</p>
      <Link to="/world"><Button variant="secondary">Back to the map</Button></Link>
    </div>
  );
  // a new room count (or the land growing into a Gallery) builds the world afresh
  return <ArtPlaceView key={`${q.data.group_id}:${q.data.tier}:${q.data.hall?.rooms ?? 0}`} initial={q.data} />;
}

function ArtPlaceView({ initial }: { initial: ArtPlace }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = useOnboardedMe();
  const confirm = useConfirm();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const [params] = useSearchParams();
  const [p, setPState] = useState(initial);
  const setP = (next: ArtPlace) => { setPState(next); qc.setQueryData(artKey(next.group_id), next); };
  useEffect(() => setPState(initial), [initial]);
  const cv = useRef<HTMLCanvasElement>(null);
  const scene = useRef<PlaceScene | null>(null);
  const world = useRef<ArtWorld | null>(null);
  const [near, setNear] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [hue, setHue] = useState(0);
  const [inside, setInside] = useState<GalleryHang | null>(null);
  const gallery = p.tier !== 'studio', museum = p.tier === 'museum';
  const place = `${gallery ? 'gallery' : 'studio'}:${p.group_id}`;
  const hangs = useMemo(() => new Map((p.hall?.hangs ?? []).map((h) => [h.slot, h])), [p.hall?.hangs]);
  const ownerName = p.owner.username;
  const title = museum ? (p.mine ? 'Your Museum' : `@${ownerName}’s Museum`) : gallery ? `@${ownerName}’s Gallery` : p.mine ? 'Your Studio' : `@${ownerName}’s Studio`;
  const ex = p.museum?.exhibition ?? null;

  // ---- the world ------------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!cv.current || !me) return;
    const backend = getBackend();
    const s = createPlace({
      canvas: cv.current, seed: hash(p.group_id), reduceMotion: reduce, sky: museum ? '#060818' : gallery ? '#0E0C12' : '#1A120C', fog: [26, museum ? 90 : 70],
      explorerUrl: explorerUrl(me.profile.explorer_style as ExplorerStyle | undefined, me.profile.accent_color),
      build: (k) => (world.current = buildArt(k, initial, { get: (path) => backend.publicAssetUrl(path) }, {
        solids: (r) => scene.current?.setSolids(r), npcs: (l) => scene.current?.setNpcs(l),
      })),
      onNear: (id) => setNear(id),
    });
    scene.current = s;
    world.current?.setHall(initial);
    // test builds only: walk about from a browser test
    if (config.e2e) (window as unknown as { __landvasPlace: unknown }).__landvasPlace = { scene: s, world: world.current };
    if ((params.get('room') === 'gallery' || params.get('room') === 'museum') && gallery) s.place(0.6, 2.6, 1);
    return () => { s.dispose(); scene.current = null; world.current = null; };
  }, [me?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { world.current?.setHall(p); }, [p]);
  useEffect(() => {
    world.current?.highlight(near?.startsWith('slot:') ? near.slice(5) : null);
    if (near) buzz('light');
  }, [near]);
  // the scene holds still behind a sheet (except while you're arranging a wall: you watch it change) and while you're
  // inside a painting
  const [settled, setSettled] = useState(false);
  useEffect(() => { scene.current?.setPaused((!!sheet && sheet.kind !== 'hang' && sheet.kind !== 'piece') || (sheet?.kind === 'piece' && settled) || !!inside); }, [sheet, inside, settled]);
  const live = usePlaceLive({ place, myId: me?.user_id, scene, act: inside ? `inside:${inside.piece.id}` : near });
  const showParty = usePartyUi((s) => s.show);

  // ---- actions --------------------------------------------------------------------------------------------------
  const run = async <T,>(key: string, f: () => Promise<T>, after?: (r: T) => void) => {
    setBusy(key);
    try { const r = await f(); after?.(r); return r; }
    catch (e) { toast.error(toGameError(e).message); buzz('warning'); return null; }
    finally { setBusy(null); }
  };
  const celebrate = (slot: string | null, text: string, colors?: string[]) => {
    const at = slot ? world.current?.pieceAt(slot) : null; const pose = scene.current?.pose();
    const x = at?.x ?? pose?.x ?? 0, y = at?.y ?? 1.6, z = at?.z ?? pose?.z ?? 0;
    scene.current?.burst(x, y, z, colors); scene.current?.pop(text, x, y + 0.9, z, colors?.[0] ?? '#FFE14D'); buzz('success');
  };
  const open = (id: string) => {
    if (id.startsWith('slot:')) { const slot = id.slice(5); setSheet(hangs.has(slot) ? { kind: 'piece', slot } : p.mine ? { kind: 'hang', slot } : null); return; }
    if (id.startsWith('room:')) { setSheet({ kind: 'room', room: Number(id.slice(5)) }); return; }
    if (id === 'easel') { if (p.mine) nav(`/create/${p.group_id}`); else setSheet({ kind: 'window' }); return; }
    if (id === 'mix') { if (gallery && !museum && p.realm_id) setHue((n) => n + 1); else setSheet({ kind: 'supplies' }); return; }
    if (id === 'rail') { if (p.realm_id) setHue((n) => n + 1); return; }
    if (id === 'exhibit' || id === 'loandesk') { setSheet({ kind: id }); return; }
    if (id === 'desk') { setSheet(gallery ? { kind: 'desk' } : { kind: 'supplies' }); return; }
    setSheet({ kind: id as 'potw' | 'window' | 'doors' | 'book' });
  };
  const nearLabel = (id: string): string => {
    if (id.startsWith('slot:')) { const h = hangs.get(id.slice(5)); return h ? `🖼️ ${h.plaque_title || h.piece.title}` : id[5] === 'w' ? '➕ Hang a borrowed piece' : '➕ Hang a piece here'; }
    if (id === 'exhibit') return ex ? (p.mine ? `✨ ${ex.piece.title} · on show` : ex.stamped ? '✨ The exhibition · stamped' : '🎟️ Take the exhibition stamp') : p.mine ? '✨ Open Exhibition Night' : '✨ Exhibition Night';
    if (id === 'rail') return '✴️ Play Constellation';
    if (id === 'loandesk') return p.mine ? '📜 Loan desk: borrow a piece' : '📜 About the Loan Wing';
    if (id.startsWith('room:')) return p.mine ? `🔓 Open room ${id.slice(5)}` : `🚧 Room ${id.slice(5)} isn’t open yet`;
    return ({ easel: p.mine ? '🎨 Paint your mural' : '🎨 See the mural', window: '🪟 Look out at the mural', mix: gallery && !museum && p.realm_id ? '🎯 Play Hue Hunter' : '🧪 Paint supplies',
      desk: gallery ? (p.mine ? '📋 Show desk & Renown shop' : '📋 About this show') : '🧪 Paint supplies', book: '📖 Sign the guest book', doors: '🚪 The Gallery', potw: '★ Piece of the week' } as Record<string, string>)[id] ?? id;
  };
  useEffect(() => {
    // walking up to a wall you're arranging keeps the camera on it; looking at a piece, the camera glides up to it
    setSettled(false);
    if (sheet?.kind === 'hang') void scene.current?.focus(`slot:${sheet.slot}`);
    else if (sheet?.kind === 'piece' && world.current) void scene.current?.focus(world.current.viewOf(sheet.slot))?.then(() => setSettled(true));
    else scene.current?.unfocus();
  }, [sheet?.kind, sheet && 'slot' in sheet ? sheet.slot : null]); // eslint-disable-line react-hooks/exhaustive-deps

  const renown = p.me?.renown ?? 0;
  return (
    <div className="fixed inset-0 z-40 select-none overflow-hidden bg-black text-white" data-testid="art-place" data-tier={p.tier}>
      <canvas ref={cv} className="absolute inset-0 h-full w-full" style={{ touchAction: 'none' }} data-testid="art-canvas" />
      {/* top: where you are, who's here, your Renown */}
      <div className="pointer-events-none absolute inset-x-0 top-0 grid gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <div className="flex items-start gap-2">
          <button onClick={() => (history.length > 1 ? nav(-1) : nav('/world'))} className="pointer-events-auto grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-black/60 backdrop-blur" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1 rounded-2xl bg-black/60 px-3 py-1.5 backdrop-blur">
            <div className="truncate font-display text-base font-black">{museum ? '🏛️' : gallery ? '🖼️' : '🎨'} {title}</div>
            <div className="flex items-center gap-2 text-[11px] text-white/75">
              {!p.mine && <span className="flex min-w-0 items-center gap-1"><PlayerAvatar p={p.owner} size={14} /><span className="truncate">@{ownerName}</span></span>}
              {gallery && p.hall?.show && <span className="truncate font-bold" style={{ color: GOLD }}>Show {p.hall.show.no}{p.hall.show.title ? ` · ${p.hall.show.title}` : ''}</span>}
              {gallery && !p.hall?.show && <span className="truncate">{ex ? <span style={{ color: '#7FE3FF' }} className="font-bold">✨ Exhibition Night · {ex.piece.title}</span> : p.hall?.hangs.length ? 'Between shows' : p.mine ? 'Hang your first pieces' : 'Nothing on the walls yet'}</span>}
              {!gallery && <span className="truncate">{p.plots} plot{p.plots === 1 ? '' : 's'} · your easel and your mural</span>}
            </div>
            {live && <div className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-[#3DDC97]" data-testid="place-here"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3DDC97]" /> {live.members.length + 1}/{live.room_size} in this room{live.in_place > live.members.length + 1 ? ` · ${live.in_place} here` : ''}</div>}
          </div>
          <div className="pointer-events-auto grid shrink-0 justify-items-end gap-1.5">
            {gallery && p.me && <button onClick={() => p.mine && setSheet({ kind: 'desk' })} className="rounded-xl bg-black/60 px-2.5 py-1.5 text-xs font-black backdrop-blur" style={{ color: GOLD }} data-testid="renown"><motion.span key={renown} initial={{ scale: 1.35 }} animate={{ scale: 1 }} className="inline-block">✦ {renown.toLocaleString()}</motion.span> <span className="font-semibold text-white/70">Renown</span></button>}
            <button onClick={() => showParty('invite')} className="flex items-center gap-1 rounded-xl bg-black/60 px-2.5 py-1.5 text-xs font-bold backdrop-blur" data-testid="place-invite"><UserPlus className="h-3.5 w-3.5" /> Invite</button>
          </div>
        </div>
      </div>

      {/* what you're standing at */}
      <AnimatePresence>
        {near && !sheet && (
          <motion.div key={near} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
            className="absolute inset-x-0 bottom-0 z-20 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
            <Button variant="rainbow" size="lg" onClick={() => open(near)} data-testid="art-action" data-near={near}>{nearLabel(near)}</Button>
          </motion.div>
        )}
      </AnimatePresence>
      {!near && !sheet && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]"><div className="rounded-full bg-black/60 px-4 py-2 text-xs text-white/80">Drag to walk · tap something to go to it{museum ? ' · the doors lead to the Rotunda' : gallery ? ' · the doors lead to the Gallery' : ''}</div></div>}

      {me && !inside && <PlaceChatDock place={place} label={museum ? 'Museum' : gallery ? 'Gallery' : 'Studio'} emoji={museum ? '🏛️' : '🖼️'} inRoom={!!live} myId={me.user_id} scene={scene} raised={!!near && !sheet} />}

      {/* ---- sheets ---- */}
      {sheet?.kind === 'piece' && hangs.get(sheet.slot) && (
        <ArtViewer p={p} h={hangs.get(sheet.slot)!} busy={busy} onClose={() => setSheet(null)}
          onInside={museum ? (h) => { setSheet(null); setInside(h); buzz('medium'); } : undefined}
          onEdit={() => setSheet({ kind: 'hang', slot: sheet.slot })}
          onAdmire={(h) => void run('admire', () => api.galleryAdmire(p.group_id, h.piece.id), (r) => {
            setP({ ...p, me: p.me ? { ...p.me, renown: r.me ?? p.me.renown } : p.me, hall: { ...p.hall!, hangs: p.hall!.hangs.map((x) => (x.slot === h.slot ? { ...x, admired: true, admires: r.admires } : x)) } });
            celebrate(h.slot, r.renown > 0 ? `+${r.renown} ✦` : '✨', ['#FFE14D', '#FFD3A0', '#FFFFFF', '#FF9F1C']);
            if (r.owner_renown > 0) toast.success(`You admired “${h.plaque_title || h.piece.title}”`, { description: `@${ownerName} got ${r.owner_renown} Renown${r.renown ? `, you got ${r.renown}` : ''}.` });
          })}
          onDown={(h) => void (async () => {
            if (!(await confirm({ title: 'Take it down?', body: `“${h.plaque_title || h.piece.title}” comes off the wall. You can hang it again any time.`, confirm: 'Take it down' }))) return;
            await run('down', () => api.galleryUnhang(p.group_id, h.slot), (r) => { setP(r); setSheet(null); buzz('medium'); });
          })()}
          onPotw={(h, on) => void run('potw', () => api.galleryPotw(p.group_id, on ? h.piece.id : null), (r) => { setP(r); if (on) celebrate(null, '★', ['#FFE14D', '#FFFFFF']); })} />
      )}
      {sheet?.kind === 'hang' && (
        <HangSheet p={p} slot={sheet.slot} current={hangs.get(sheet.slot) ?? null} busy={busy}
          works={sheet.slot[0] === 'w' ? (p.museum?.loans ?? []).map((l) => l.piece) : undefined}
          onPreview={(h) => world.current?.preview(sheet.slot, h)}
          onClose={() => { world.current?.preview(sheet.slot, null); setSheet(null); }}
          onBuy={(item) => run('buy', () => api.galleryBuy(p.group_id, item), (r) => { setP(r); celebrate(null, `−${priceOf(p, item)} ✦`, [GOLD, '#FFFFFF']); })}
          onSave={(h) => void run('hang', () => api.galleryHang(p.group_id, sheet.slot, h.piece.id, { frame: h.frame, light: h.light, power: h.power, aim: h.aim, title: h.plaque_title, story: h.plaque_story }), (r) => {
            setP(r); setSheet(null); celebrate(sheet.slot, 'Hung!', undefined);
          })} />
      )}
      {sheet?.kind === 'desk' && gallery && (
        <DeskSheet p={p} busy={busy} onClose={() => setSheet(null)}
          onOpen={(t) => void run('open', () => api.galleryOpenShow(p.group_id, t), (r) => { setP(r); setSheet(null); celebrate(null, 'Show’s open!', undefined); toast.success('Your show is open 🎉', { description: `${r.cfg.show_days} days. Visitors who admire your pieces earn you Renown.` }); })}
          onCloseShow={() => void (async () => {
            if (!(await confirm({ title: 'Close the show early?', body: 'It pays its Renown now, on the score the walls have today.', confirm: 'Close the show' }))) return;
            await run('close', () => api.galleryCloseShow(p.group_id), (r) => { setP(r); if (r.closed) toast.success(`Show closed: ${r.closed.score.total}/100`, { description: `${r.closed.admires} admires · +${r.closed.renown} Renown` }); celebrate(null, `+${r.closed?.renown ?? 0} ✦`, [GOLD, '#FFFFFF']); });
          })()}
          onBuy={(item) => void run('buy', () => api.galleryBuy(p.group_id, item), (r) => { setP(r); celebrate(null, `−${priceOf(p, item)} ✦`, [GOLD, '#FFFFFF']); })}
          onWall={(room, wall) => void run('wall', () => api.galleryWall(p.group_id, room, wall), (r) => { setP(r); buzz('medium'); })}
          onRoom={() => void run('room', () => api.galleryAddRoom(p.group_id), (r) => { setP(r); toast.success(`Room ${r.hall?.rooms} is open ✨`); })} />
      )}
      {sheet?.kind === 'room' && (
        <Dialog open onOpenChange={(o) => !o && setSheet(null)} title={`Room ${sheet.room}`}
          description={p.mine ? 'Four more walls for your shows.' : `@${ownerName} hasn’t opened this room yet.`}
          footer={p.mine ? <Button variant="rainbow" loading={busy === 'room'} disabled={renown < roomPrice(p)} onClick={() => void run('room', () => api.galleryAddRoom(p.group_id), (r) => { setP(r); setSheet(null); toast.success(`Room ${r.hall?.rooms} is open ✨`); })} data-testid="buy-room">Open it for ✦ {roomPrice(p).toLocaleString()}</Button> : undefined}>
          {p.mine && <p className="text-sm text-muted">You have ✦ {renown.toLocaleString()} Renown. Open shows and let visitors admire your work to earn more.</p>}
        </Dialog>
      )}
      {sheet?.kind === 'potw' && p.hall?.piece_of_week && (
        <Dialog open onOpenChange={(o) => !o && setSheet(null)} title="★ Piece of the week" description={`Chosen by @${ownerName}`}
          footer={<Link to={`/art/${p.hall.piece_of_week.id}`}><Button variant="secondary">Open the artwork</Button></Link>}>
          <BigArt piece={p.hall.piece_of_week} />
          <div className="mt-2 font-display text-lg font-black">{p.hall.piece_of_week.title}</div>
          <div className="text-xs text-muted">@{p.hall.piece_of_week.artist} · {p.hall.piece_of_week.appreciations} appreciations</div>
        </Dialog>
      )}
      {sheet?.kind === 'window' && (
        <Dialog open onOpenChange={(o) => !o && setSheet(null)} title={p.mural ? p.mural.title : 'Nothing painted yet'}
          description={p.mural ? `What’s painted on ${p.mine ? 'your' : `@${ownerName}’s`} land, as everyone sees it on the map.` : p.mine ? 'Paint at the easel and publish: your art becomes this land on the map.' : 'This land hasn’t been painted yet.'}
          footer={p.mural ? <Link to={`/art/${p.mural.id}`}><Button variant="secondary">Open the artwork</Button></Link> : p.mine ? <Button variant="rainbow" onClick={() => nav(`/create/${p.group_id}`)}>Paint it</Button> : undefined}>
          {p.mural && <BigArt piece={{ preview_path: p.mural.preview_path, title: p.mural.title }} />}
        </Dialog>
      )}
      {sheet?.kind === 'doors' && (
        <Dialog open onOpenChange={(o) => !o && setSheet(null)} title="🔒 Your Gallery" description="Behind these doors: rooms of your own art, in frames and light you choose, with shows that visitors come to see."
          footer={<Button variant="secondary" onClick={() => nav('/world')}>Back to the map</Button>}>
          <ul className="grid gap-1.5 text-sm text-muted">
            <li>🟩 Merge <b className="text-fg">four Art plots in a 2×2 square</b> and turn them into your Gallery from the plot panel.</li>
            <li>🖼️ Hang your published art, frame it, light it, write its plaque.</li>
            <li>✦ Open a week-long show: visitors admire your pieces and you earn Renown for frames, lights and more rooms.</li>
          </ul>
        </Dialog>
      )}
      {sheet?.kind === 'supplies' && (
        <Dialog open onOpenChange={(o) => !o && setSheet(null)} title="🧪 Paint supplies" description="Brushes, palettes and shade ramps for your easel live in the Studio shop."
          footer={<Button variant="rainbow" onClick={() => nav('/inventory')}>Open the Studio shop</Button>} />
      )}
      {sheet?.kind === 'book' && <GuestBook username={ownerName} hostName={ownerName} own={p.mine} onClose={() => setSheet(null)} />}
      {gallery && p.realm_id && hue > 0 && <HueTable realmId={p.realm_id} tick={hue} />}
      {sheet?.kind === 'exhibit' && museum && p.museum && (
        <ExhibitSheet p={p} busy={busy} onClose={() => setSheet(null)}
          onOpen={(piece) => void run('exhibit', () => api.museumExhibitionOpen(p.group_id, piece), (r) => {
            setP(r); setSheet(null); celebrate(null, 'Exhibition Night!', ['#7FE3FF', '#FFFFFF', '#FFE14D']);
            toast.success('Exhibition Night is on ✨', { description: `${r.museum?.cfg.exhibition_hours ?? 24} hours.${r.told ? ` ${r.told} recent visitor${r.told === 1 ? '' : 's'} heard about it.` : ''}` });
          })}
          onStamp={() => void run('stamp', () => api.museumStamp(p.group_id), (r) => {
            setP({ ...p, me: p.me ? { ...p.me, renown: r.me ?? p.me.renown } : p.me, museum: { ...p.museum!, my_stamps: r.my_stamps, exhibition: p.museum!.exhibition ? { ...p.museum!.exhibition, stamped: true, stamps: r.stamps } : null } });
            celebrate(null, r.renown ? `+${r.renown} ✦` : '🎟️', ['#7FE3FF', '#FFE14D', '#FFFFFF']);
            toast.success(`Stamp #${r.no} collected 🎟️`, { description: `You have ${r.my_stamps} exhibition stamp${r.my_stamps === 1 ? '' : 's'}.` });
          })} />
      )}
      {sheet?.kind === 'loandesk' && museum && p.museum && (
        <LoanDesk p={p} busy={busy} onClose={() => setSheet(null)}
          onAsk={(piece, note) => run('ask', () => api.museumLoanRequest(p.group_id, piece, note), (r) => { setP(r); toast.success('Asked 📜', { description: 'They’ll get an alert. A yes puts the piece on loan to you for 14 days.' }); })}
          onEnd={(loan) => void (async () => {
            if (!(await confirm({ title: 'Give it back?', body: 'The piece comes down and goes home to its artist.', confirm: 'Give it back' }))) return;
            await run('end', () => api.museumLoanEnd(loan.id), async () => setP(await api.artPlace(p.group_id)));
          })()} />
      )}
      {inside && me && (
        <DioramaView piece={inside} sparks={p.museum?.cfg.secrets_per_piece ?? 3} found={p.museum?.found[inside.piece.id] ?? []} reduce={reduce}
          explorer={explorerUrl(me.profile.explorer_style as ExplorerStyle | undefined, me.profile.accent_color)}
          onSpark={async (n) => {
            // (just stepped in: the museum counts you inside a moment later, so that one is tried again quietly)
            const r = await api.museumSecret(p.group_id, inside.piece.id, n).catch((e) => { const g = toGameError(e); if (g.code !== 'not_inside') toast.error(g.message); return g.code === 'not_inside' ? 'retry' as const : null; });
            if (!r || r === 'retry') return r;
            setP({ ...p, me: p.me ? { ...p.me, renown: r.me ?? p.me.renown } : p.me, museum: { ...p.museum!, found: { ...p.museum!.found, [inside.piece.id]: r.found } } });
            return r;
          }}
          onExit={() => setInside(null)} />
      )}
    </div>
  );
}

// ---- the old Atelier's game, at the mixing table (its scores and pay carry on as before) ------------------------------
function HueTable({ realmId, tick }: { realmId: string; tick: number }) {
  const q = useQuery({ queryKey: ['realm', realmId], queryFn: () => api.realmGet(realmId), staleTime: 30_000 });
  return q.data ? <HueCore initial={q.data} tick={tick} /> : null;
}
function HueCore({ initial, tick }: { initial: Realm; tick: number }) {
  const [r, setR] = useState(initial);
  const core = useRealmCore({ r, setR, extraGames: ESTATE_GAMES });
  useEffect(() => { core.openGame(gameIds(r.cfg)[0]); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return core.dialogs;
}

// ---- sheets ------------------------------------------------------------------------------------------------------
function BigArt({ piece, className }: { piece: Pick<GalleryPiece, 'preview_path' | 'title'>; className?: string }) {
  const url = useAssetUrl(piece.preview_path);
  return <div className={cn('art-paper relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-surface-2', className)}><CrispArt src={url} alt={piece.title} fit="contain" /></div>;
}

/** looking at a piece: the camera has glided up to it; here it is on the whole screen, sharp, to zoom into (pinch,
    scroll or double-tap) and look over (drag), with its plaque and what you can do with it */
function ArtViewer({ p, h, busy, onClose, onEdit, onAdmire, onDown, onPotw, onInside }: {
  p: ArtPlace; h: GalleryHang; busy: string | null; onClose(): void; onEdit(): void; onAdmire(h: GalleryHang): void; onDown(h: GalleryHang): void; onPotw(h: GalleryHang, on: boolean): void;
  /** the Museum: walk into the painting */ onInside?(h: GalleryHang): void;
}) {
  const isPotw = p.hall?.piece_of_week?.id === h.piece.id;
  const loaned = h.slot[0] === 'w';
  const found = p.museum?.found[h.piece.id]?.length ?? 0, sparks = p.museum?.cfg.secrets_per_piece ?? 3;
  const url = useAssetUrl(h.piece.preview_path);
  const [story, setStory] = useState(true);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45, duration: 0.35 }}
      className="absolute inset-0 z-30 flex flex-col bg-[#05060D] text-white" role="dialog" aria-label={h.plaque_title || h.piece.title} data-testid="art-viewer">
      <div className="flex items-start gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg font-black leading-tight">{h.plaque_title || h.piece.title}</div>
          <div className="truncate text-xs text-white/70">@{h.piece.artist}{loaned ? ' · on loan' : ''} · {frameName(p, h.frame)} frame · {lightName(p, h.light)}</div>
        </div>
        <button onClick={onClose} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-xl" data-testid="viewer-close">×</button>
      </div>
      <ZoomArt src={url} title={h.piece.title} frame={FRAME_LOOK[h.frame] ?? FRAME_LOOK.oak} light={LIGHTS[h.light] ?? LIGHTS.warm} />
      <div className="grid gap-2 px-3 pb-[max(14px,env(safe-area-inset-bottom,0px))] pt-2">
        {h.plaque_story && story && <button onClick={() => setStory(false)} className="text-left text-sm italic leading-relaxed text-white/90">“{h.plaque_story}”</button>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/65">
          <span>✨ {h.admires} admire{h.admires === 1 ? '' : 's'} here</span>
          <span>♥ {h.piece.appreciations} on the map</span>
          {h.piece.craft != null && <span>Craft {h.piece.craft}</span>}
          <Link to={`/art/${h.piece.id}`} className="font-bold text-accent">Open the artwork →</Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {onInside && <Button variant={p.mine ? 'rainbow' : 'secondary'} onClick={() => onInside(h)} data-testid="step-inside">🚪 Step inside{found < sparks ? ` · ✦ ${found}/${sparks}` : ' · ✦ all found'}</Button>}
          {p.mine ? (<>
            <Button variant="primary" onClick={onEdit} data-testid="hang-edit">Re-hang</Button>
            {!loaned && <Button variant="secondary" loading={busy === 'potw'} onClick={() => onPotw(h, !isPotw)} data-testid="potw-toggle">{isPotw ? 'Not piece of the week' : '★ Piece of the week'}</Button>}
            <Button variant="ghost" loading={busy === 'down'} onClick={() => onDown(h)} data-testid="hang-down">Take down</Button>
          </>) : (
            <Button variant="rainbow" className="flex-1" loading={busy === 'admire'} disabled={h.admired} onClick={() => onAdmire(h)} data-testid="admire">
              {h.admired ? '✨ Admired today' : `✨ Admire${p.cfg.admire_visitor_renown ? ` (+${p.cfg.admire_visitor_renown} ✦)` : ''}`}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/** a picture to look over: fits the screen; pinch, scroll or double-tap to zoom (up to 8×), drag to move about.
    Pixel art stays crisp at every size. */
function ZoomArt({ src, title, frame, light }: { src: string | null | undefined; title: string; frame: string; light: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [v, setV] = useState({ s: 1, x: 0, y: 0 });
  const vRef = useRef(v); vRef.current = v;
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; s: number; mx: number; my: number; x: number; y: number } | null>(null);
  const lastTap = useRef(0);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // the picture's size at 1× (fitted inside the box, with room for the frame)
  const pad = 14, fitW = Math.max(1, size.w - pad * 2 - 16), fitH = Math.max(1, size.h - pad * 2 - 16);
  const k = nat ? Math.min(fitW / nat.w, fitH / nat.h) : 1, iw = nat ? nat.w * k : 0, ih = nat ? nat.h * k : 0;
  /** keep the picture covering the view when zoomed (and centred when it's smaller than the view) */
  const clamp = (s: number, x: number, y: number) => {
    const w = iw * s, hh = ih * s;
    const cx = (size.w - w) / 2, cy = (size.h - hh) / 2;
    const nx = w <= size.w ? cx : Math.min(0, Math.max(size.w - w, x));
    const ny = hh <= size.h ? cy : Math.min(0, Math.max(size.h - hh, y));
    return { s, x: nx, y: ny };
  };
  // start fitted and centred
  useEffect(() => { if (nat && size.w) setV(clamp(1, 0, 0)); }, [nat, size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps
  const zoomAt = (ns: number, px: number, py: number) => {
    const c = vRef.current; const s2 = Math.max(1, Math.min(8, ns));
    // the point under (px, py) stays under it
    const ix = (px - c.x) / c.s, iy = (py - c.y) / c.s;
    setV(clamp(s2, px - ix * s2, py - iy * s2));
  };
  const rel = (e: { clientX: number; clientY: number }) => { const r = box.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    ptrs.current.set(e.pointerId, rel(e));
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: vRef.current.s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, x: vRef.current.x, y: vRef.current.y };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId); if (!prev) return;
    const now = rel(e); ptrs.current.set(e.pointerId, now);
    if (ptrs.current.size >= 2 && pinch.current) {
      const [a, b] = [...ptrs.current.values()], pc = pinch.current;
      const s2 = Math.max(1, Math.min(8, pc.s * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pc.d))));
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, ix = (pc.mx - pc.x) / pc.s, iy = (pc.my - pc.y) / pc.s;
      setV(clamp(s2, mx - ix * s2, my - iy * s2));
    } else if (ptrs.current.size === 1 && vRef.current.s > 1) {
      const c = vRef.current; setV(clamp(c.s, c.x + now.x - prev.x, c.y + now.y - prev.y));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const at = ptrs.current.get(e.pointerId); ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) pinch.current = null;
    if (!at || ptrs.current.size) return;
    const t = performance.now();
    if (t - lastTap.current < 300) { lastTap.current = 0; zoomAt(vRef.current.s > 1.2 ? 1 : 3, at.x, at.y); buzz('light'); }
    else lastTap.current = t;
  };
  const onWheel = (e: React.WheelEvent) => { const at = rel(e); zoomAt(vRef.current.s * Math.exp(-e.deltaY * 0.0022), at.x, at.y); };
  const zoomed = v.s > 1.02;
  return (
    <div ref={box} className="relative min-h-0 flex-1 touch-none overflow-hidden" style={{ touchAction: 'none' }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel} data-testid="zoom-art" data-zoom={v.s.toFixed(2)}>
      {/* the light the piece hangs in */}
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 45%, ${light}33, transparent 62%)` }} />
      {src && (
        <div className="absolute left-0 top-0 origin-top-left will-change-transform" style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.s})`, width: iw, height: ih }}>
          {/* its frame (it stays put as you zoom in, like walking up to the wall) */}
          <div className="absolute rounded-[3px] shadow-[0_18px_60px_rgba(0,0,0,0.6)]" style={{ inset: -pad / v.s, background: frame, opacity: zoomed ? 0 : 1, transition: 'opacity 160ms' }} />
          <img src={src} alt={title} draggable={false} onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 })}
            className="relative block h-full w-full select-none" style={{ imageRendering: 'pixelated' }} data-testid="zoom-img" />
        </div>
      )}
      {!nat && <div className="absolute inset-0 grid place-items-center"><Spinner /></div>}
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
        <span className="rounded-full bg-black/55 px-3 py-1 text-[11px] text-white/80">{zoomed ? `${v.s.toFixed(1)}× · drag to look round · double-tap to see it whole` : 'Pinch or double-tap to look closer'}</span>
      </div>
    </div>
  );
}

const frameName = (p: ArtPlace, id: string) => p.cfg.frames[id]?.name ?? id;
const lightName = (p: ArtPlace, id: string) => p.cfg.lights[id]?.name ?? id;
const has = (p: ArtPlace, cat: 'frames' | 'lights' | 'walls', id: string) => (p.cfg[cat][id]?.price ?? 1) === 0 || !!p.me?.unlocks.includes(`${cat}:${id}`);
const priceOf = (p: ArtPlace, item: string) => { const [cat, id] = item.split(':') as ['frames' | 'lights' | 'walls', string]; return p.cfg[cat]?.[id]?.price ?? 0; };
const roomsMax = (p: ArtPlace) => p.museum?.cfg.rooms_max ?? p.cfg.rooms_max;
const roomPrice = (p: ArtPlace) => (p.museum ? p.museum.cfg.room_prices[(p.hall?.rooms ?? 5) - p.museum.cfg.rooms_start] : p.cfg.room_prices[(p.hall?.rooms ?? 3) - 3]) ?? 0;
const sorted = (shop: ArtPlace['cfg']['frames']) => Object.entries(shop).sort((a, b) => a[1].order - b[1].order);
const FRAME_LOOK: Record<string, string> = { oak: 'linear-gradient(135deg,#B07A45,#7A4E2D)', gilt: 'linear-gradient(135deg,#F5D77A,#B8902E)', ebony: 'linear-gradient(135deg,#2A2730,#0C0A0F)', neon: 'linear-gradient(135deg,#FF3D9A,#22E3FF)', float: 'linear-gradient(135deg,#E8F4FF,#9AB0C8)', baroque: 'linear-gradient(135deg,#FFE08A,#C9952E 60%,#7A1428)' };

function HangSheet({ p, slot, current, busy, works: given, onPreview, onClose, onBuy, onSave }: {
  p: ArtPlace; slot: string; current: GalleryHang | null; busy: string | null; /** what may hang here (the Loan Wing: borrowed pieces) */ works?: GalleryPiece[];
  onPreview(h: GalleryHang | null): void; onClose(): void; onBuy(item: string): Promise<unknown>; onSave(h: GalleryHang): void;
}) {
  const loanWall = slot[0] === 'w';
  const works = given ?? p.works ?? [];
  const elsewhere = new Map((p.hall?.hangs ?? []).filter((h) => h.slot !== slot).map((h) => [h.piece.id, h.slot]));
  const [piece, setPiece] = useState<GalleryPiece | null>(current?.piece ?? works.find((w) => !elsewhere.has(w.id)) ?? works[0] ?? null);
  // (the plaque starts with the piece's own title, written in: players read an empty box as a title they had to retype)
  const [frame, setFrame] = useState(current?.frame ?? 'oak');
  const [light, setLight] = useState(current?.light ?? 'warm');
  const [power, setPower] = useState(current?.power ?? 65);
  const [aim, setAim] = useState(current?.aim ?? 0);
  const [ttl, setTtl] = useState(current?.plaque_title || (current?.piece ?? piece)?.title || '');
  const [story, setStory] = useState(current?.plaque_story ?? '');
  const draft: GalleryHang | null = piece ? { slot, frame, light, power, aim, plaque_title: ttl.trim() || null, plaque_story: story.trim() || null, piece, admires: current?.admires ?? 0, admired: false } : null;
  // the wall changes as you choose (a moment after the last change, so dragging a slider stays smooth)
  useEffect(() => { const t = setTimeout(() => onPreview(draft), 120); return () => clearTimeout(t); }, [piece?.id, frame, light, power, aim, ttl]); // eslint-disable-line react-hooks/exhaustive-deps
  const room = Number(slot[1]), wallName = `${slot[3] === '1' ? 'display wall' : 'far wall'}, ${slot[2] === 'l' ? 'left' : 'right'}`;
  const lit = power >= 45 && power <= 85;
  return (
    <Panel title={current ? 'Re-hang this wall' : loanWall ? 'Hang a borrowed piece' : 'Hang a piece'} sub={`${loanWall ? `Loan Wing · wall ${slot.slice(1)}` : `Room ${room} · ${wallName}`} · watch the wall above`} onClose={onClose}
      footer={<Button variant="rainbow" size="lg" className="w-full" disabled={!draft} loading={busy === 'hang'} onClick={() => draft && onSave(draft)} data-testid="hang-save">{current ? 'Save the wall' : 'Hang it'}</Button>}>
      {!works.length ? (
        <div className="grid gap-2 text-sm text-muted"><p>{loanWall ? 'Nothing is on loan to you yet. Ask another artist at the loan desk: once they say yes, their piece can hang here.' : 'You haven’t published any art yet. Paint at your easel and publish it: every piece you publish can hang here.'}</p></div>
      ) : (
        <div className="grid gap-3.5">
          <section className="grid gap-1.5">
            <b className="text-xs uppercase tracking-wide text-muted">{loanWall ? 'On loan to you' : 'Your work'}</b>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" data-testid="hang-works">
              {works.map((w) => (
                <button key={w.id} onClick={() => { setPiece(w); setTtl(current?.piece.id === w.id ? current.plaque_title || w.title : w.title); buzz('light'); }}
                  className={cn('relative w-[76px] shrink-0 overflow-hidden rounded-xl border-2 bg-surface-2 text-left transition', piece?.id === w.id ? 'border-accent' : 'border-transparent')}>
                  <WorkThumb w={w} />
                  <div className="truncate px-1.5 py-1 text-[10px] font-bold">{w.title}</div>
                  {elsewhere.has(w.id) && <span className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[9px]">on {elsewhere.get(w.id)!.slice(0, 2).toUpperCase()}</span>}
                </button>
              ))}
            </div>
          </section>
          <section className="grid gap-1.5">
            <b className="text-xs uppercase tracking-wide text-muted">Frame</b>
            <div className="flex flex-wrap gap-1.5">{sorted(p.cfg.frames).map(([id, f]) => <Chip key={id} on={frame === id} owned={has(p, 'frames', id)} price={f.price} label={f.name} swatch={FRAME_LOOK[id]}
              onPick={() => setFrame(id)} onBuy={() => void onBuy(`frames:${id}`).then((r) => { if (r) setFrame(id); })} afford={(p.me?.renown ?? 0) >= f.price} busy={busy === 'buy'} />)}</div>
          </section>
          <section className="grid gap-1.5">
            <b className="text-xs uppercase tracking-wide text-muted">Light</b>
            <div className="flex flex-wrap gap-1.5">{sorted(p.cfg.lights).map(([id, f]) => <Chip key={id} on={light === id} owned={has(p, 'lights', id)} price={f.price} label={f.name} swatch={`radial-gradient(circle,${LIGHTS[id] ?? '#fff'},#2a2a30)`}
              onPick={() => setLight(id)} onBuy={() => void onBuy(`lights:${id}`).then((r) => { if (r) setLight(id); })} afford={(p.me?.renown ?? 0) >= f.price} busy={busy === 'buy'} />)}</div>
            <Slider label="Brightness" value={power} min={0} max={100} onChange={setPower} format={(v) => `${v}%${v >= 45 && v <= 85 ? ' · gallery light' : v < 45 ? ' · too dim' : ' · too bright'}`} />
            <Slider label="Aim" value={aim} min={-30} max={30} onChange={setAim} format={(v) => (v === 0 ? 'centred' : v < 0 ? `${-v}° left` : `${v}° right`)} />
            {!lit && <p className="text-[11px] text-[#FFB13D]">Shows score best with gallery light (45–85%).</p>}
          </section>
          <section className="grid gap-1.5">
            <b className="text-xs uppercase tracking-wide text-muted">Plaque</b>
            <input className={inputCls} maxLength={60} placeholder={piece?.title ?? 'Title'} value={ttl} onChange={(e) => setTtl(e.target.value)} data-testid="hang-title" />
            <textarea className={cn(inputCls, 'h-20 resize-none py-2')} maxLength={160} placeholder="A line about it: where, when, why…" value={story} onChange={(e) => setStory(e.target.value)} data-testid="hang-story" />
            <span className="text-right text-[10px] text-muted">{story.length}/160 · a plaque with a story scores full marks</span>
          </section>
        </div>
      )}
    </Panel>
  );
}
/** a compact panel along the bottom (the world stays in view above it: you watch the wall change as you choose) */
function Panel({ title, sub, onClose, footer, children }: { title: string; sub?: string; onClose(): void; footer?: ReactNode; children: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}
      className="absolute inset-x-0 bottom-0 z-30 mx-auto flex max-h-[56%] max-w-xl flex-col rounded-t-3xl border-t border-white/10 bg-[#0E1230] text-fg shadow-[0_-12px_40px_rgba(0,0,0,0.5)]" role="dialog" aria-label={title} data-testid="hang-panel">
      <div className="flex items-start gap-2 px-4 pt-3">
        <div className="min-w-0 flex-1"><div className="font-display text-lg font-black leading-tight">{title}</div>{sub && <div className="truncate text-xs text-muted">{sub}</div>}</div>
        <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-lg">×</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 pt-2">{children}</div>
      {footer && <div className="border-t border-white/10 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom,0px))]">{footer}</div>}
    </motion.div>
  );
}
export function WorkThumb({ w }: { w: GalleryPiece }) {
  const url = useAssetUrl(w.thumb_path ?? w.preview_path);
  return <div className="art-paper relative aspect-square"><CrispArt src={url} alt={w.title} fit="cover" /></div>;
}
function Chip({ on, owned, price, label, swatch, onPick, onBuy, afford, busy }: { on: boolean; owned: boolean; price: number; label: string; swatch?: string; onPick(): void; onBuy(): void; afford: boolean; busy: boolean }) {
  return (
    <button disabled={!owned && (!afford || busy)} onClick={() => { if (owned) { onPick(); buzz('light'); } else onBuy(); }}
      className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-bold transition disabled:opacity-45', on ? 'border-accent bg-accent/15' : 'border-line bg-surface-2')}>
      {swatch && <span className="h-3.5 w-3.5 rounded-full border border-white/30" style={{ background: swatch }} />}
      {label}{!owned && <span className="font-black" style={{ color: GOLD }}>✦ {price}</span>}
    </button>
  );
}

function ScoreBars({ s }: { s: NonNullable<ArtPlace['hall']>['score'] }) {
  const rows: [string, number, number][] = [['Walls filled', s.fill, 30], ['Light', s.light, 20], ['Flow through the rooms', s.flow, 20], ['Plaques', s.plaques, 15], ['Frames', s.frames, 15]];
  return (
    <div className="grid gap-1.5" data-testid="show-score">
      <div className="flex items-end justify-between"><b className="text-sm">Show score</b><span className="font-display text-2xl font-black" style={{ color: GOLD }}>{s.total}<span className="text-sm text-muted">/100</span></span></div>
      {rows.map(([l, v, m]) => (
        <div key={l} className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-xs">
          <span className="text-muted">{l}</span><span className="font-bold">{v}/{m}</span>
          <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-white/10"><motion.div initial={{ width: 0 }} animate={{ width: `${(v / m) * 100}%` }} className="h-full rounded-full" style={{ background: v === m ? '#3DDC97' : GOLD }} /></div>
        </div>
      ))}
      {s.tips.length > 0 && <ul className="mt-1 grid gap-1 text-[11px] text-muted">{s.tips.map((t) => <li key={t}>💡 {t}</li>)}</ul>}
    </div>
  );
}

function DeskSheet({ p, busy, onClose, onOpen, onCloseShow, onBuy, onWall, onRoom }: {
  p: ArtPlace; busy: string | null; onClose(): void; onOpen(title: string | null): void; onCloseShow(): void; onBuy(item: string): void; onWall(room: number, wall: string): void; onRoom(): void;
}) {
  const h = p.hall!;
  const [tab, setTab] = useState<'show' | 'shop'>('show');
  const [name, setName] = useState('');
  const [room, setRoom] = useState(1);
  const renown = p.me?.renown ?? 0;
  const left = h.show ? Math.max(0, Date.parse(h.show.closes_at) - Date.now()) : 0;
  const days = Math.floor(left / 86_400_000), hours = Math.floor((left % 86_400_000) / 3_600_000);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={p.mine ? '📋 Show desk' : `📋 @${p.owner.username}’s show`} wide
      description={p.mine ? `✦ ${renown.toLocaleString()} Renown to spend` : h.show ? `On for ${days}d ${hours}h more` : 'Between shows'}>
      {p.mine && <Tabs value={tab} onValueChange={(v) => setTab(v as 'show' | 'shop')} items={[{ value: 'show', label: 'The show' }, { value: 'shop', label: '✦ Renown shop' }]} className="mb-3" />}
      {tab === 'show' && (
        <div className="grid gap-4">
          {h.show ? (
            <div className="rounded-2xl border border-[#D9B24A]/40 bg-[#D9B24A]/10 p-3">
              <div className="text-xs font-bold uppercase tracking-wide" style={{ color: GOLD }}>Show {h.show.no} · on now</div>
              <div className="font-display text-xl font-black">{h.show.title || 'New work'}</div>
              <div className="mt-1 text-xs text-muted">{days}d {hours}h left · ✨ {h.show.admires} admire{h.show.admires === 1 ? '' : 's'} so far · pays up to ✦ {Math.min(200, h.score.total * 2)} when it closes</div>
              {p.mine && <Button className="mt-2" size="sm" variant="ghost" loading={busy === 'close'} onClick={onCloseShow} data-testid="close-show">Close it early</Button>}
            </div>
          ) : p.mine ? (
            <div className="grid gap-2 rounded-2xl border border-line bg-surface-2 p-3">
              <b className="text-sm">Open a new show</b>
              <p className="text-xs text-muted">It runs {p.cfg.show_days} days. Visitors’ admires pay you Renown, and the show pays its score in Renown when it closes. Hang at least {p.cfg.show_min_pieces} pieces first.</p>
              <input className={inputCls} maxLength={48} placeholder="Name your show (optional)" value={name} onChange={(e) => setName(e.target.value)} data-testid="show-title" />
              <Button variant="rainbow" loading={busy === 'open'} disabled={h.score.pieces < p.cfg.show_min_pieces} onClick={() => onOpen(name.trim() || null)} data-testid="open-show">
                {h.score.pieces < p.cfg.show_min_pieces ? `Hang ${p.cfg.show_min_pieces - h.score.pieces} more to open a show` : 'Open the show'}
              </Button>
            </div>
          ) : <p className="text-sm text-muted">No show on right now — the pieces on the walls can still be admired.</p>}
          <ScoreBars s={h.score} />
          {h.last_show && <div className="text-xs text-muted">Last show: <b className="text-fg">{h.last_show.title || `Show ${h.last_show.no}`}</b> · {h.last_show.score.total}/100 · ✨ {h.last_show.admires} · ✦ {h.last_show.renown}</div>}
        </div>
      )}
      {tab === 'shop' && p.mine && (
        <div className="grid gap-4" data-testid="renown-shop">
          {(['frames', 'lights'] as const).map((cat) => (
            <section key={cat} className="grid gap-1.5">
              <b className="text-xs uppercase tracking-wide text-muted">{cat === 'frames' ? 'Frames' : 'Lights'}</b>
              <div className="flex flex-wrap gap-1.5">{sorted(p.cfg[cat]).map(([id, f]) => (
                <Chip key={id} on={false} owned={has(p, cat, id)} price={f.price} label={f.name} swatch={cat === 'frames' ? FRAME_LOOK[id] : `radial-gradient(circle,${LIGHTS[id] ?? '#fff'},#2a2a30)`}
                  onPick={() => {}} onBuy={() => onBuy(`${cat}:${id}`)} afford={renown >= f.price} busy={busy === 'buy'} />
              ))}</div>
            </section>
          ))}
          <section className="grid gap-1.5">
            <b className="text-xs uppercase tracking-wide text-muted">Wall colours</b>
            <div className="flex flex-wrap gap-1.5">{Array.from({ length: h.rooms }, (_, i) => i + 1).map((r) => <button key={r} onClick={() => setRoom(r)} className={cn('rounded-full border px-2.5 py-1 text-xs font-bold', room === r ? 'border-accent bg-accent/15' : 'border-line')}>Room {r}</button>)}</div>
            <div className="flex flex-wrap gap-1.5">{sorted(p.cfg.walls).map(([id, f]) => (
              <Chip key={id} on={(h.room_walls[String(room)] ?? 'white') === id} owned={has(p, 'walls', id)} price={f.price} label={f.name} swatch={WALLS[id]}
                onPick={() => onWall(room, id)} onBuy={() => onBuy(`walls:${id}`)} afford={renown >= f.price} busy={busy === 'buy' || busy === 'wall'} />
            ))}</div>
          </section>
          <section className="grid gap-1.5">
            <b className="text-xs uppercase tracking-wide text-muted">Rooms</b>
            {h.rooms < roomsMax(p) ? (
              <Button variant="primary" loading={busy === 'room'} disabled={renown < roomPrice(p)} onClick={onRoom} data-testid="shop-room">Open room {h.rooms + 1} · ✦ {roomPrice(p).toLocaleString()}</Button>
            ) : <p className="text-xs text-muted">Every room is open ({h.rooms}).</p>}
          </section>
        </div>
      )}
    </Dialog>
  );
}

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---- the Museum ----------------------------------------------------------------------------------------------------
const HOLO = '#7FE3FF';
const until = (iso: string) => { const ms = Math.max(0, Date.parse(iso) - Date.now()), d = Math.floor(ms / 86_400_000), h = Math.floor((ms % 86_400_000) / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };

/** Exhibition Night: open one (the owner, once a week), or take its stamp (a visitor) */
function ExhibitSheet({ p, busy, onClose, onOpen, onStamp }: { p: ArtPlace; busy: string | null; onClose(): void; onOpen(piece: string): void; onStamp(): void }) {
  const m = p.museum!, ex = m.exhibition;
  const hung = (p.hall?.hangs ?? []).map((h) => ({ ...h.piece, loaned: h.slot[0] === 'w' }));
  const [pick, setPick] = useState<string | null>(hung[0]?.id ?? null);
  const waiting = !ex && m.next_exhibition_at && Date.parse(m.next_exhibition_at) > Date.now();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="✨ Exhibition Night" wide
      description={ex ? `${p.mine ? 'Your' : `@${p.owner.username}’s`} exhibition · ${until(ex.closes_at)} left` : p.mine ? `Once a week, for ${m.cfg.exhibition_hours} hours, one piece turns in the light at the heart of your museum.` : 'No exhibition on right now.'}
      footer={ex ? (!p.mine ? (
        <Button variant="rainbow" size="lg" loading={busy === 'stamp'} disabled={ex.stamped} onClick={onStamp} data-testid="exhibit-stamp">{ex.stamped ? '🎟️ Stamped' : `🎟️ Take the stamp${m.cfg.stamp_visitor_renown ? ` (+${m.cfg.stamp_visitor_renown} ✦)` : ''}`}</Button>
      ) : undefined) : p.mine ? (
        <Button variant="rainbow" size="lg" loading={busy === 'exhibit'} disabled={!pick || !!waiting} onClick={() => pick && onOpen(pick)} data-testid="exhibit-open">{waiting ? `Next one in ${until(m.next_exhibition_at!)}` : 'Open Exhibition Night'}</Button>
      ) : undefined}>
      {ex ? (
        <div className="grid gap-3" data-testid="exhibit-on">
          <div className="overflow-hidden rounded-2xl border p-1" style={{ borderColor: `${HOLO}66`, background: `${HOLO}10` }}><BigArt piece={ex.piece} /></div>
          <div><div className="font-display text-xl font-black">{ex.piece.title}</div><div className="text-xs text-muted">@{ex.piece.artist} · exhibition No. {ex.no}</div></div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm"><span>🎟️ <b>{ex.stamps}</b> stamp{ex.stamps === 1 ? '' : 's'} taken</span><span className="text-muted">You have {m.my_stamps} exhibition stamp{m.my_stamps === 1 ? '' : 's'}</span></div>
        </div>
      ) : p.mine ? (
        <div className="grid gap-2">
          <p className="text-sm text-muted">Pick a piece from your walls. Your museum’s recent visitors hear about it, and everyone who comes takes a stamp: Renown for them and for you.</p>
          {!hung.length ? <p className="text-sm">Hang something first.</p> : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="exhibit-pick">
              {hung.map((w) => (
                <button key={w.id} onClick={() => setPick(w.id)} className={cn('relative overflow-hidden rounded-xl border-2 bg-surface-2 text-left', pick === w.id ? 'border-accent' : 'border-transparent')}>
                  <WorkThumb w={w} /><div className="truncate px-1.5 py-1 text-[10px] font-bold">{w.title}</div>
                  {w.loaned && <span className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[9px]">on loan · @{w.artist}</span>}
                </button>
              ))}
            </div>
          )}
          {m.exhibitions > 0 && <p className="text-xs text-muted">{m.exhibitions} exhibition{m.exhibitions === 1 ? '' : 's'} so far.</p>}
        </div>
      ) : <p className="text-sm text-muted">When @{p.owner.username} opens one, a piece turns in the light here for a day, and you can take its stamp.</p>}
    </Dialog>
  );
}

/** the loan desk: borrow a piece from another artist (the owner), or see what's on loan (a visitor) */
function LoanDesk({ p, busy, onClose, onAsk, onEnd }: { p: ArtPlace; busy: string | null; onClose(): void; onAsk(piece: string, note: string | null): Promise<unknown>; onEnd(l: MuseumLoan): void }) {
  const m = p.museum!;
  const [tab, setTab] = useState<'borrow' | 'loans'>(p.mine ? 'borrow' : 'loans');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [found, setFound] = useState<Awaited<ReturnType<typeof api.museumFindPieces>> | null>(null);
  const [looking, setLooking] = useState(false);
  const look = async () => {
    if (!name.trim()) return;
    setLooking(true);
    try { setFound(await api.museumFindPieces(p.group_id, name.trim().replace(/^@/, ''))); } catch (e) { toast.error(toGameError(e).message); setFound(null); } finally { setLooking(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="📜 The Loan Wing" wide
      description={`Pieces lent by other artists for ${m.cfg.loan_days} days. Admires on a borrowed piece pay its artist Renown too.`}>
      {p.mine && <Tabs value={tab} onValueChange={(v) => setTab(v as 'borrow' | 'loans')} items={[{ value: 'borrow', label: 'Borrow a piece' }, { value: 'loans', label: `On loan (${m.loans.length})` }]} className="mb-3" />}
      {tab === 'borrow' && p.mine && (
        <div className="grid gap-3" data-testid="loan-borrow">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void look(); }}>
            <input className={cn(inputCls, 'flex-1')} placeholder="An artist’s @username" value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="off" autoCorrect="off" data-testid="loan-name" />
            <Button type="submit" variant="primary" loading={looking} data-testid="loan-look">Look</Button>
          </form>
          {found && (
            <div className="grid gap-2">
              <div className="flex items-center gap-2 text-sm"><PlayerAvatar p={found.artist} size={22} /><b>@{found.artist.username}</b><span className="text-muted">· {found.pieces.length} published</span></div>
              {!found.pieces.length ? <p className="text-sm text-muted">Nothing published yet.</p> : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="loan-pieces">
                  {found.pieces.map((w) => (
                    <div key={w.id} className="overflow-hidden rounded-xl bg-surface-2">
                      <WorkThumb w={w} />
                      <div className="truncate px-1.5 pt-1 text-[10px] font-bold">{w.title}</div>
                      <div className="p-1.5">
                        {w.loan ? <span className="block text-center text-[10px] text-muted">{w.loan === 'active' ? 'On loan to you' : 'Asked'}</span> : (
                          <Button size="sm" variant="secondary" className="w-full" loading={busy === 'ask'} onClick={() => void onAsk(w.id, note.trim() || null).then((r) => { if (r) setFound({ ...found, pieces: found.pieces.map((x) => (x.id === w.id ? { ...x, loan: 'requested' } : x)) }); })} data-testid="loan-ask">Ask</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <input className={inputCls} maxLength={120} placeholder="A note for them (optional): why this piece?" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}
          {!!m.requests?.length && (
            <section className="grid gap-1.5">
              <b className="text-xs uppercase tracking-wide text-muted">Waiting for an answer</b>
              {m.requests.map((l) => <LoanRow key={l.id} l={l} who={l.artist} right={<span className="text-[11px] text-muted">asked</span>} />)}
            </section>
          )}
        </div>
      )}
      {tab === 'loans' && (
        <div className="grid gap-1.5" data-testid="loan-list">
          {!m.loans.length ? <p className="text-sm text-muted">Nothing on loan right now.</p> : m.loans.map((l) => (
            <LoanRow key={l.id} l={l} who={l.artist} right={p.mine ? <Button size="sm" variant="ghost" loading={busy === 'end'} onClick={() => onEnd(l)}>Give back</Button> : <span className="text-[11px] text-muted">{l.ends_at ? `${until(l.ends_at)} left` : ''}</span>} />
          ))}
        </div>
      )}
    </Dialog>
  );
}
export function LoanRow({ l, who, right }: { l: MuseumLoan; who: MuseumLoan['artist']; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-1.5">
      <div className="w-12 shrink-0 overflow-hidden rounded-lg"><WorkThumb w={l.piece} /></div>
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{l.piece.title}</div><div className="flex items-center gap-1 truncate text-[11px] text-muted"><PlayerAvatar p={who} size={12} />@{who.username}{l.note ? ` · “${l.note}”` : ''}</div></div>
      {right}
    </div>
  );
}

/** inside a painting: the pop-up stage, and the sparks hidden in it */
function DioramaView({ piece, sparks, found, reduce, explorer, onSpark, onExit }: {
  piece: GalleryHang; sparks: number; found: number[]; reduce: boolean; explorer: string;
  onSpark(n: number): Promise<{ renown: number; artist_renown: number; found: number[] } | 'retry' | null>; onExit(): void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const sc = useRef<PlaceScene | null>(null), wd = useRef<Diorama | null>(null);
  const url = useAssetUrl(piece.piece.preview_path);
  const [got, setGot] = useState<number[]>(found);
  const [ready, setReady] = useState<boolean | null>(null);
  const entered = useRef(Date.now()), taking = useRef(new Set<number>());
  useEffect(() => {
    if (!cv.current || !url) return;
    const s = createPlace({
      canvas: cv.current, seed: hash(piece.piece.id), reduceMotion: reduce, sky: '#080A1C', fog: [30, 70], explorerUrl: explorer,
      build: (k) => (wd.current = buildDiorama(k, { url, w: piece.piece.w, h: piece.piece.h, seed: piece.piece.id, sparks, found })),
      onNear: (id) => {
        if (!id?.startsWith('spark:')) return;
        const n = Number(id.slice(6));
        if (taking.current.has(n)) return;
        taking.current.add(n);
        // (the museum counts you inside after a few seconds)
        const wait = Math.max(0, 4600 - (Date.now() - entered.current));
        const tryTake = (left: number) => void onSpark(n).then((r) => {
          if (r === 'retry' && left > 0 && s.debug().near === id) { setTimeout(() => tryTake(left - 1), 2000); return; }
          if (!r || r === 'retry') { taking.current.delete(n); return; }
          wd.current?.take(n); setGot(r.found);
          const ps = s.pose(); s.burst(ps.x, 1.1, ps.z, ['#FFE14D', '#FFFFFF', '#7FE3FF']); s.pop(r.renown ? `+${r.renown} ✦` : '✦', ps.x, 2, ps.z); buzz('success');
          if (r.found.length >= sparks) toast.success('Every spark found ✨', { description: r.artist_renown ? `@${piece.piece.artist} got Renown too.` : undefined });
        });
        setTimeout(() => tryTake(4), wait);
      },
    });
    sc.current = s;
    void wd.current?.ready.then((ok) => setReady(ok));
    if (config.e2e) (window as unknown as { __landvasDiorama: unknown }).__landvasDiorama = { scene: s, world: wd.current };
    return () => { s.dispose(); sc.current = null; wd.current = null; };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <motion.div initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 z-[45] bg-[#080A1C]" data-testid="diorama">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" style={{ touchAction: 'none' }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <button onClick={onExit} className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-xl bg-black/60 px-3 py-2 text-sm font-bold" data-testid="step-out"><ArrowLeft className="h-4 w-4" /> Step out</button>
        <div className="min-w-0 flex-1 rounded-2xl bg-black/60 px-3 py-1.5">
          <div className="truncate font-display text-base font-black">🚪 Inside “{piece.plaque_title || piece.piece.title}”</div>
          <div className="text-[11px] text-white/75">@{piece.piece.artist} · <span className="font-bold" style={{ color: '#FFE14D' }} data-testid="sparks-found">✦ {got.length}/{sparks} sparks</span></div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
        <div className="rounded-full bg-black/60 px-4 py-2 text-xs text-white/85">{ready === false ? 'This painting wouldn’t open up — step out and try another' : got.length >= sparks ? 'You found every spark in this one ✨' : 'Walk in among the layers · sparks hide behind them'}</div>
      </div>
    </motion.div>
  );
}
