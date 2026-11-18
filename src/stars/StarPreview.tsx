// A star, up close: tap one in the sky (through the telescope, or further) and it comes up here — turning, its
// shell of plots wrapped round its burning core, the claimed ones in their owners' colours and paintings, the light
// pouring through the rest. What it is, who found it, how full it is, what the next plot costs — and the way there.
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Rocket, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { api } from '../backend/api';
import { framePacer, isPhone, sceneDpr } from '../lib/gfx';
import { releaseOnDispose } from '../lib/threeRelease';
import { cn } from '../lib/utils';
import { useOnboardedMe } from '../lib/queries';
import { rarityInfo } from '../shared/rarity';
import { CLASS_BY_ID, TIERS, starById, type StarClassId } from './galaxy';
import { makeCore, makeShell } from './star3d';
import { starSkin } from './skin';
import type { StarCard, StarPlotRow, ArtLayer } from './types';
import { useStarSkin } from './useStars';

export const fmtLy = (ly: number) => (ly >= 10000 ? `${Math.round(ly / 1000).toLocaleString()}k` : ly.toLocaleString());
export const fmtInk = (n: number) => n.toLocaleString();

/** the turning star (a canvas): its core, its shell, its skin */
export function StarGlobe({ card, plots, skin, className, interactive = true }: { card: StarCard; plots: StarPlotRow[] | null; skin: HTMLCanvasElement | null; className?: string; interactive?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const skinTex = useRef<THREE.CanvasTexture | null>(null);
  const shellRef = useRef<ReturnType<typeof makeShell> | null>(null);
  const spin = useRef({ y: 0, v: 0.0035, drag: false, x: 0, tilt: 0.35 });
  const big = card.cells > 10242;
  // the shell's claimed plots (by cell)
  const claimed = useMemo(() => {
    const m = new Map<number, { color: string; mine: boolean; keystone: boolean; kind: string }>();
    for (const p of plots ?? []) m.set(p[0], { color: p[6] || rarityInfo(p[1]).color, mine: p[4], keystone: p[8], kind: p[3] });
    return m;
  }, [plots]);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const r = releaseOnDispose(new THREE.WebGLRenderer({ canvas: cv, antialias: !isPhone(), alpha: true }));
    r.setPixelRatio(sceneDpr());
    r.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    cam.position.set(0, 0, 4.6);
    const root = new THREE.Group();
    scene.add(root);
    const core = makeCore(card.cls as StarClassId, big ? 0.97 : 0.5, { binary: !!starById(card.id)?.binary, glow: big ? 3 : 4.2, exposure: 0.92 });
    root.add(core.group);
    let shell: ReturnType<typeof makeShell> | null = null;
    if (!big) { shell = makeShell(card.m, 1, { claimed, skin: skinTex.current }); root.add(shell.group); shellRef.current = shell; }
    else {
      // the biggest stars: a smooth ball wearing the skin (their plots are too many to draw one by one from out here)
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshBasicMaterial({ map: skinTex.current, transparent: true, opacity: skinTex.current ? 1 : 0 }));
      root.add(m);
      root.userData.ball = m;
    }
    scene.add(new THREE.AmbientLight('#ffffff', 0.6));
    const resize = () => { const w = cv.clientWidth || 300, h = cv.clientHeight || 300; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cv);
    const pace = framePacer({ ambient: true });
    let raf = 0; const t0 = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || !pace.ready(now)) return;
      const t = (now - t0) / 1000;
      const s = spin.current;
      if (!s.drag) { s.y += s.v; s.v += (0.0035 - s.v) * 0.02; }
      root.rotation.set(s.tilt, s.y, 0);
      core.update(t);
      shell?.update(t);
      r.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      core.dispose(); shell?.dispose(); shellRef.current = null;
      const ball = root.userData.ball as THREE.Mesh | undefined; if (ball) { ball.geometry.dispose(); (ball.material as THREE.Material).dispose(); }
      r.dispose();
    };
  }, [card.id, card.m, card.cls, big, claimed]); // eslint-disable-line react-hooks/exhaustive-deps
  // the skin (paintings) can come in after the star's up
  useEffect(() => {
    skinTex.current?.dispose();
    const t = skin ? new THREE.CanvasTexture(skin) : null;
    if (t) { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; }
    skinTex.current = t;
    shellRef.current?.setSkin(t);
  }, [skin]);
  // drag to turn it
  const onDown = (e: React.PointerEvent) => { if (!interactive) return; spin.current.drag = true; spin.current.x = e.clientX; (e.target as Element).setPointerCapture?.(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { const s = spin.current; if (!s.drag) return; const dx = e.clientX - s.x; s.x = e.clientX; s.y += dx * 0.012; s.v = dx * 0.0012; };
  const onUp = () => { spin.current.drag = false; };
  return <canvas ref={ref} className={cn('touch-none', className)} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} data-testid="star-globe" />;
}

/** the preview sheet */
export function StarPreview({ id, onClose, onGo }: { id: number; onClose(): void; onGo?(card: StarCard): void }) {
  const card = useQuery({ queryKey: ['star', id], queryFn: () => api.starCard(id), staleTime: 15_000 });
  const me = useOnboardedMe();
  const c = card.data;
  const { plots, skin } = useStarSkin(c ?? null);
  const C = c ? CLASS_BY_ID[c.cls as StarClassId] : null;
  const full = c ? c.claimed >= c.cells : false;
  const [nameOpen, setNameOpen] = useState(false);
  return (
    <motion.div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-2 pb-[max(8px,env(safe-area-inset-bottom,0px))]" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} data-testid="star-preview">
      <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/12 bg-[#070B1C] text-white shadow-2xl">
        <button className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/10" onClick={onClose} aria-label="Close" data-testid="star-preview-close"><X className="h-4 w-4" /></button>
        <div className="relative h-[min(52vh,340px)] w-full bg-[radial-gradient(circle_at_50%_45%,rgba(139,107,255,0.18),transparent_65%)]">
          {c ? <StarGlobe card={c} plots={plots} skin={skin} className="h-full w-full" /> : <div className="grid h-full place-items-center text-4xl">✨</div>}
          {c && <div className="pointer-events-none absolute left-4 top-4 grid gap-1">
            <span className="w-fit rounded-full bg-white/10 px-2.5 py-0.5 text-[10.5px] font-black uppercase tracking-[0.2em] text-[#9DE4FF]">{TIERS[c.tier]?.name ?? ''}</span>
            {c.painted && <span className="w-fit rounded-full bg-[linear-gradient(90deg,#FF4D6D,#FFE14D,#3DDC97,#34C3FF)] px-2.5 py-0.5 text-[10.5px] font-black text-[#0b0b1e]">🖼️ Painted Star</span>}
          </div>}
        </div>
        {c && C ? (
          <div className="grid gap-3 px-5 pb-5 pt-1">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[26px] font-black leading-tight" data-testid="star-preview-name">{c.name}</span>
                {c.name !== c.code && <span className="text-[11px] font-bold text-white/45">{c.code}</span>}
              </div>
              <div className="mt-0.5 text-[13px] font-semibold text-white/75">{C.emoji} {C.name} · {fmtLy(c.ly)} light-years away</div>
              <div className="mt-1 text-[12px] leading-snug text-white/55">{C.blurb}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat k="Plots" v={c.cells.toLocaleString()} sub={`${c.claimed.toLocaleString()} claimed`} />
              <Stat k="Keystones" v={`${12 - c.keystones_claimed}/12`} sub="left" />
              <Stat k="Yours" v={String(c.mine)} sub={c.mine ? 'plots here' : 'none yet'} />
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[linear-gradient(90deg,#22E3FF,#8B6BFF,#FF4D9A)]" style={{ width: `${Math.max(1.5, (c.claimed / c.cells) * 100)}%` }} /></div>
            <div className="text-[12.5px] text-white/70" data-testid="star-preview-disc">
              {c.discoverer ? <>🔭 Discovered by <b className="text-white">@{c.discoverer.username}</b>{c.discovered_at ? ` · ${new Date(c.discovered_at).toLocaleDateString()}` : ''}</> : <>🔭 <b className="text-white">Nobody has claimed a plot here yet</b> — the first to does becomes its Discoverer, and earns {c.discoverer_pct}% of what others pay above the Earth price here.</>}
            </div>
            {c.owners.length > 0 && <div className="flex flex-wrap gap-1.5">{c.owners.slice(0, 6).map((o) => <span key={o.id} className="flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-bold"><span className="h-2 w-2 rounded-full" style={{ background: o.accent ?? '#8B6BFF' }} />@{o.username} · {o.plots}</span>)}</div>}
            {!full && c.price && <div className="flex items-center justify-between rounded-2xl bg-white/6 px-3 py-2 text-[12.5px]">
              <span>Next plot <b className="text-[#FFE28A]">{fmtInk(c.price.ink)} Ink</b> <span className="text-white/45">(Earth {fmtInk(c.price.earth)})</span></span>
              <span className="text-white/60">Keystone {c.keystone_price ? fmtInk(c.keystone_price.ink) : '—'}</span>
            </div>}
            <div className="text-[11px] text-white/45">Star plots pay rent like Earth's, ×{c.rent_mult} — and each plot here costs a little more than the last.</div>
            <div className="flex gap-2">
              {onGo && <button className="lv-btn on h-12 flex-1 text-[15px]" onClick={() => onGo(c)} disabled={!c.warp} data-testid="star-go">
                <Rocket className="mr-1.5 inline h-4 w-4" />{c.here ? 'You’re here — open it' : c.heading ? 'On the way…' : `Go there · ${c.warp ? `${fmtInk(c.warp.ink)} Ink · ${c.warp.secs} s` : ''}`}
              </button>}
              {c.discoverer && me && c.discoverer.id === me.profile.id && <button className="lv-btn h-12 px-3 text-[13px]" onClick={() => setNameOpen(true)} data-testid="star-name-btn">Name it</button>}
            </div>
            <AnimatePresence>{nameOpen && <NameStar key="n" card={c} onClose={() => { setNameOpen(false); void card.refetch(); }} />}</AnimatePresence>
          </div>
        ) : (
          <div className="grid gap-2 px-5 pb-6 pt-2 text-sm text-white/70">{card.isError ? 'That star couldn’t be found.' : 'Focusing…'}</div>
        )}
      </div>
    </motion.div>
  );
}

function Stat({ k, v, sub }: { k: string; v: string; sub: string }) {
  return <div className="rounded-2xl bg-white/6 px-2 py-2"><div className="text-[10px] font-black uppercase tracking-wider text-white/45">{k}</div><div className="font-display text-[17px] font-black">{v}</div><div className="text-[10.5px] text-white/50">{sub}</div></div>;
}

function NameStar({ card, onClose }: { card: StarCard; onClose(): void }) {
  const [v, setV] = useState(card.name === card.catalog_name ? '' : card.name);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    try { await api.starName(card.id, v); onClose(); }
    catch (e) { setErr(String((e as Error).message ?? e)); }
  };
  return (
    <motion.div className="grid gap-2 rounded-2xl bg-white/8 p-3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <div className="text-[12px] font-bold text-white/70">Only its Discoverer can name a star (once a week).</div>
      <input className="h-10 rounded-xl bg-black/40 px-3 text-sm outline-none" maxLength={32} value={v} onChange={(e) => setV(e.target.value)} placeholder={card.catalog_name} data-testid="star-name-input" />
      {err && <div className="text-[11.5px] text-[#FF9DB0]">{err}</div>}
      <div className="flex gap-2"><button className="lv-btn on h-9 flex-1" onClick={() => void save()}>Save</button><button className="lv-btn h-9 px-3" onClick={onClose}>Cancel</button></div>
    </motion.div>
  );
}

export { starSkin };
export type { ArtLayer };
