// ✨ At a star, in first person: you stand on the inside of its shell — a Dyson shell of plots — with the star
// burning overhead, filling the sky, and the rest of the shell curving up and round you beyond it. Claimed plots are
// solid panels in their owners' colours and paintings (the star's light leaks round their seams); the open ones are
// a lattice of light you can walk across. Walk with the stick (or WASD), drag to look, tap a plot to claim it, or to
// see whose it is and what it's been made into.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, Footprints, Home, MapPin, Paintbrush } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import * as THREE from 'three';
import { api, idemKey } from '../backend/api';
import { toGameError } from '../backend/backend';
import { adaptiveDpr, framePacer, isPhone, sceneDpr } from '../lib/gfx';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { releaseOnDispose } from '../lib/threeRelease';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';
import { rarityInfo } from '../shared/rarity';
import { CLASS_BY_ID, starById, type StarClassId } from './galaxy';
import { cellAngle, cellAt, cellCenter, isKeystone, shellRadius, type V3 } from './goldberg';
import { makeCore, makeShell, type Shell } from './star3d';
import { StarWarp } from './StarWarp';
import { StarRoll } from './StarRoll';
import { StarPlotSheet } from './StarPlotSheet';
import { fmtInk } from './StarPreview';
import { useStarSkin } from './useStars';
import type { StarCard, StarClaim, StarPlotRow } from './types';

const EYE = 1.7;
const v3 = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);

export default function StarWorld() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = useOnboardedMe();
  const where = useQuery({ queryKey: ['star-where'], queryFn: api.starWhere, refetchInterval: (q) => (q.state.data?.dest_star ? 2000 : false) });
  const card = useQuery({ queryKey: ['star', id], queryFn: () => api.starCard(id), enabled: Number.isFinite(id) });
  const c = card.data ?? null;
  const here = where.data?.at_star === id && !where.data?.dest_star;
  const heading = where.data?.dest_star === id;
  // the claimed plots (all of them for a star small enough; else the ones round where you stand)
  const [nearCells, setNearCells] = useState<number[] | null>(null);
  const plotsQ = useQuery({
    queryKey: ['star-plots-world', id, c?.claimed, c && c.cells > 3242 ? nearCells?.join(',') : 'all'],
    queryFn: async () => (c!.cells <= 3242 ? (await api.starPlotsOf(id)).plots : nearCells?.length ? (await api.starPlotsOf(id, nearCells)).plots : []),
    enabled: !!c && here, staleTime: 10_000,
  });
  const { skin } = useStarSkin(c);
  const plots: StarPlotRow[] = plotsQ.data ?? [];
  const byCell = useMemo(() => new Map(plots.map((p) => [p[0], p])), [plots]);

  // ---- the scene ---------------------------------------------------------------------------------------------------
  const canvas = useRef<HTMLCanvasElement>(null);
  const api3 = useRef<{ setPlots(p: StarPlotRow[]): void; setSkin(s: HTMLCanvasElement | null): void; aim(): number | null; tap(x: number, y: number): number | null; goTo(cell: number): void; flash(cell: number, color: string): void; where(): number; open(cell: number): void; debug(): Record<string, unknown> } | null>(null);
  const stick = useRef({ x: 0, y: 0 });
  const [aimCell, setAimCell] = useState<number | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [roll, setRoll] = useState<StarClaim | null>(null);
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !c || !here) return;
    const phone = isPhone();
    const R = shellRadius(c.m);
    const big = c.cells > 10242;
    const r = releaseOnDispose(new THREE.WebGLRenderer({ canvas: cv, antialias: !phone, powerPreference: 'high-performance' }));
    let dpr = sceneDpr();
    r.setPixelRatio(dpr);
    r.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#02030a');
    const cam = new THREE.PerspectiveCamera(70, 1, 0.3, R * 6);
    // far stars all round (outside the shell, seen through its open plots)
    {
      const n = phone ? 1500 : 2600, p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - z * z); p.set([s * Math.cos(a) * R * 4, z * R * 4, s * Math.sin(a) * R * 4], i * 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#cfd8ff', size: 1.4, sizeAttenuation: false })));
    }
    const C = CLASS_BY_ID[c.cls as StarClassId] ?? CLASS_BY_ID.yellow;
    // (seen from its own shell, up close: a tighter halo and a face you can look at, its sunspots and granules showing)
    const core = makeCore(c.cls as StarClassId, R * (c.cls === 'neutron' ? 0.12 : c.cls === 'black_hole' ? 0.14 : 0.3), { binary: !!starById(c.id)?.binary, glow: c.cls === 'black_hole' ? 3.2 : 2.1, exposure: 0.78 });
    scene.add(core.group);
    scene.add(new THREE.AmbientLight('#ffffff', 0.55));
    // where you stand: a direction from the star's centre (your feet are on the shell there), which way you face along it
    const n = v3(cellCenter(c.m, Math.min(c.cells - 1, 12 + ((c.id * 7) % Math.max(1, c.cells - 12))))).normalize();
    const hd = new THREE.Vector3(0, 1, 0).cross(n); if (hd.lengthSq() < 1e-6) hd.set(1, 0, 0); hd.normalize();
    let pitch = 0.9; // (look up: the star's overhead, its edge in view above the shell)
    let shell: Shell | null = null;
    let shellAt = n.clone();
    let claimedMap = new Map<number, { color: string; mine: boolean; keystone: boolean; kind: string }>();
    let skinTex: THREE.CanvasTexture | null = null;
    const buildShell = () => {
      if (shell) { scene.remove(shell.group); shell.dispose(); }
      shellAt = n.clone();
      shell = makeShell(c.m, R, { inside: true, claimed: claimedMap, skin: skinTex, near: big ? { dir: [n.x, n.y, n.z], reach: Math.min(Math.PI, 420 / R) } : null });
      scene.add(shell.group);
      if (big) setNearCells(shell.cells.map((x) => x.id));
    };
    buildShell();
    // a beam on a plot (a claim landing)
    const flashes: { m: THREE.Mesh; t0: number }[] = [];
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0);
    const flash = (cell: number, color: string) => {
      const p = v3(cellCenter(c.m, cell));
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.position.copy(p.clone().multiplyScalar(R));
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().negate());
      m.scale.set(4, R * 0.7, 4);
      scene.add(m); flashes.push({ m, t0: performance.now() });
    };
    // input: drag to look
    let yawV = 0, dragging: { x: number; y: number; x0: number; y0: number; t0: number } | null = null;
    const onDown = (e: PointerEvent) => { dragging = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: e.timeStamp }; cv.setPointerCapture?.(e.pointerId); };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y; dragging.x = e.clientX; dragging.y = e.clientY;
      const k = (cam.fov * Math.PI / 180) / Math.max(300, cv.clientHeight) * 1.1;
      turn(-dx * k); pitch = Math.max(-1.2, Math.min(1.45, pitch - dy * k));
    };
    const onUp = (e: PointerEvent) => {
      const d = dragging; dragging = null;
      if (d && e.timeStamp - d.t0 < 320 && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 10) { const cell = tapAt(e.clientX, e.clientY); if (cell != null) setSel(cell); }
    };
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp);
    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest?.('input,textarea')) return; keys.add(e.key.toLowerCase()); };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    addEventListener('keydown', kd); addEventListener('keyup', ku);
    const turn = (a: number) => { hd.applyAxisAngle(n, a).normalize(); };
    /** walk along the shell: d metres forward, s metres to the right */
    const walk = (d: number, s: number) => {
      const up = n.clone().negate();
      const right = hd.clone().cross(up).normalize();
      const dir = hd.clone().multiplyScalar(d).addScaledVector(right, s);
      const L = dir.length(); if (L < 1e-6) return;
      dir.divideScalar(L);
      const th = L / R;
      // (rotate your spot and your facing along the great circle you're walking)
      const axis = n.clone().cross(dir).normalize();
      n.applyAxisAngle(axis, th).normalize();
      hd.applyAxisAngle(axis, th);
      hd.sub(n.clone().multiplyScalar(hd.dot(n))).normalize();
    };
    let auto: { to: THREE.Vector3 } | null = null;
    const goTo = (cell: number) => { auto = { to: v3(cellCenter(c.m, cell)) }; };
    const eyePos = () => n.clone().multiplyScalar(R - EYE);
    const rayHit = (ndcX: number, ndcY: number): number | null => {
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam);
      const o = ray.ray.origin, d = ray.ray.direction;
      // inside the shell: the far side of the sphere |o + t d| = R
      const b = o.dot(d), cc = o.lengthSq() - R * R, disc = b * b - cc;
      if (disc < 0) return null;
      const t = -b + Math.sqrt(disc);
      const p = o.clone().addScaledVector(d, t).normalize();
      return cellAt(c.m, [p.x, p.y, p.z]);
    };
    const tapAt = (x: number, y: number) => { const rc = cv.getBoundingClientRect(); return rayHit(((x - rc.left) / rc.width) * 2 - 1, -((y - rc.top) / rc.height) * 2 + 1); };
    const resize = () => { const w = cv.clientWidth || 1, h = cv.clientHeight || 1; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cv);
    const pace = framePacer();
    const tune = adaptiveDpr((d2) => { dpr = d2; r.setPixelRatio(d2); resize(); }, dpr, pace);
    let raf = 0, last = performance.now(); const t0 = last;
    let lastAim = -2, aimAt = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || !pace.ready(now)) return;
      const dt = Math.min(0.1, (now - last) / 1000); tune((now - last) / 1000); last = now;
      const t = (now - t0) / 1000;
      // moving: the stick, the keys, or walking to a plot you picked
      const fwd = -stick.current.y + (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
      const side = stick.current.x + (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
      if (keys.has('arrowleft') || keys.has('q')) turn(dt * 1.6);
      if (keys.has('arrowright') || keys.has('e')) turn(-dt * 1.6);
      const speed = big ? 26 : 7;
      if (Math.abs(fwd) > 0.05 || Math.abs(side) > 0.05) { auto = null; walk(fwd * speed * dt, side * speed * dt); }
      else if (auto) {
        const ang = n.angleTo(auto.to);
        if (ang * R < 1.2) auto = null;
        else {
          const toward = auto.to.clone().sub(n.clone().multiplyScalar(n.dot(auto.to))).normalize();
          const a2 = Math.atan2(hd.clone().cross(toward).dot(n), hd.dot(toward));
          turn(Math.max(-dt * 3, Math.min(dt * 3, a2)));
          walk(Math.min(ang * R, Math.max(10, ang * R * 0.9) * dt * (big ? 3 : 1)), 0);
        }
      }
      // the big stars' plots near you are made again as you go
      if (big && n.angleTo(shellAt) * R > 150) buildShell();
      // the camera: at your eyes, up is toward the star
      const eye = eyePos(), up = n.clone().negate();
      const look = hd.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(up, Math.sin(pitch));
      cam.position.copy(eye); cam.up.copy(up); cam.lookAt(eye.clone().add(look));
      core.update(t);
      shell?.update(t);
      // what's in the middle of the view
      if (now - aimAt > 160) { aimAt = now; const a = rayHit(0, 0); if (a !== lastAim) { lastAim = a ?? -1; shell?.highlight(a); setAimCell(a); } }
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i], k = (now - f.t0) / 1800;
        (f.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - k));
        f.m.scale.x = f.m.scale.z = 4 + k * 6;
        if (k >= 1) { scene.remove(f.m); (f.m.material as THREE.Material).dispose(); flashes.splice(i, 1); }
      }
      r.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);
    api3.current = {
      setPlots(p) {
        claimedMap = new Map(p.map((x) => [x[0], { color: x[6] || rarityInfo(x[1]).color, mine: x[4], keystone: x[8], kind: x[3] }]));
        buildShell();
      },
      setSkin(s) { skinTex?.dispose(); skinTex = s ? new THREE.CanvasTexture(s) : null; if (skinTex) skinTex.colorSpace = THREE.SRGBColorSpace; shell?.setSkin(skinTex); },
      aim: () => (lastAim >= 0 ? lastAim : null),
      tap: tapAt,
      goTo, flash,
      where: () => cellAt(c.m, [n.x, n.y, n.z]),
      open: (cell: number) => setSel(cell),
      debug: () => ({ cells: shell?.cells.length ?? 0, claimed: claimedMap.size, at: cellAt(c.m, [n.x, n.y, n.z]), R, aim: lastAim, dpr, calls: r.info.render.calls, tris: r.info.render.triangles }),
    };
    (window as unknown as { __landvasStar?: unknown }).__landvasStar = api3.current;
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerup', onUp); cv.removeEventListener('pointercancel', onUp);
      removeEventListener('keydown', kd); removeEventListener('keyup', ku);
      shell?.dispose(); core.dispose(); skinTex?.dispose(); beamGeo.dispose();
      r.dispose(); api3.current = null;
      delete (window as unknown as { __landvasStar?: unknown }).__landvasStar;
    };
  }, [c?.id, c?.m, here]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api3.current?.setPlots(plots); }, [plots]);
  useEffect(() => { api3.current?.setSkin(skin); }, [skin]);

  // ---- claiming -----------------------------------------------------------------------------------------------------
  const claim = async (cell: number, kind: string) => {
    if (!c) return;
    try {
      const res = await api.starClaim(c.id, cell, kind, idemKey('star-claim'));
      if (useUiHaptics()) buzz('success');
      setSel(null);
      setRoll(res);
      api3.current?.flash(cell, rarityInfo(res.rarity).color);
      invalidateGame(qc);
      void qc.invalidateQueries({ queryKey: ['star', c.id] });
      void qc.invalidateQueries({ queryKey: ['star-plots-world', c.id] });
      void qc.invalidateQueries({ queryKey: ['my-stars'] });
      if (res.discovered) toast.success('You discovered this star! 🔭', { description: `You’re its Discoverer: ${c.discoverer_pct}% of what others pay above the Earth price here comes to you.` });
    } catch (e) { toast.error(toGameError(e).message); }
  };

  // ---- not there yet ---------------------------------------------------------------------------------------------
  if (!Number.isFinite(id)) return null;
  if (heading && where.data?.arrive_at) {
    return <StarWarp name={c?.name ?? 'the star'} cls={c?.cls ?? 'yellow'} arriveAt={Date.parse(where.data.arrive_at)} departAt={Date.parse(where.data.depart_at ?? new Date().toISOString())}
      onArrive={() => void where.refetch()} rushInk={10} onRush={() => void api.starRush().then(() => where.refetch()).catch((e) => toast.error(toGameError(e).message))} />;
  }
  const mine = plots.filter((p) => p[4]).length;
  const aim = aimCell != null ? byCell.get(aimCell) : undefined;
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#02030a] text-white select-none" data-testid="star-world">
      {here && <canvas ref={canvas} className="absolute inset-0 h-full w-full touch-none" data-testid="star-canvas" />}
      {!here && c && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <div className="grid max-w-xs gap-3">
            <div className="text-5xl">{CLASS_BY_ID[c.cls as StarClassId]?.emoji ?? '✨'}</div>
            <div className="font-display text-xl font-black">{c.name} is {c.ly.toLocaleString()} light-years away</div>
            <p className="text-sm text-white/70">Warp there to walk its shell and place plots on it.</p>
            <button className="lv-btn on h-11" disabled={!c.warp} onClick={() => void api.starWarp(c.id).then(() => where.refetch()).catch((e) => toast.error(toGameError(e).message))} data-testid="star-world-warp">
              🚀 Warp there · {c.warp ? `${fmtInk(c.warp.ink)} Ink` : ''}
            </button>
            <button className="lv-btn h-10" onClick={() => nav('/eyes')}>Back to Earth</button>
          </div>
        </div>
      )}
      {here && c && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-white/20" />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 px-3 pt-[max(10px,env(safe-area-inset-top,0px))]">
            <button className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-black/50" onClick={() => nav('/eyes')} aria-label="Back to Earth" data-testid="star-back"><ChevronLeft className="h-5 w-5" /></button>
            <div className="min-w-0 flex-1 rounded-2xl bg-black/45 px-3 py-1.5">
              <div className="truncate font-display text-[15px] font-black" data-testid="star-world-name">{c.name}</div>
              <div className="text-[11px] font-semibold text-white/65">{CLASS_BY_ID[c.cls as StarClassId]?.emoji} {c.class_name} · {c.claimed.toLocaleString()}/{c.cells.toLocaleString()} plots · {mine} yours</div>
            </div>
          </div>
          {/* what you're looking at */}
          <AnimatePresence>{aimCell != null && (
            <motion.button key={aimCell} className="absolute left-1/2 top-[58%] z-20 -translate-x-1/2 rounded-2xl border bg-black/60 px-3.5 py-2 text-left text-[12.5px] shadow-xl"
              style={{ borderColor: aim ? rarityInfo(aim[1]).color : isKeystone(aimCell) ? '#FFD23F' : 'rgba(255,255,255,0.25)' }}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={() => setSel(aimCell)} data-testid="star-aim">
              <div className="font-black">{aim ? `${aim[4] ? 'Your' : `@${aim[5] ?? 'someone'}’s`} ${rarityInfo(aim[1]).name}${aim[2] ? ' ✨' : ''}${aim[3] !== 'base' ? ` · ${KIND_LABEL[aim[3]] ?? aim[3]}` : ''}` : isKeystone(aimCell) ? '⬟ An open Keystone' : 'An open plot'}</div>
              <div className="text-white/60">{aim ? (aim[7] ?? `Plot ${aimCell}`) : `Plot ${aimCell} · tap to ${c.price ? `claim (${fmtInk(isKeystone(aimCell) ? c.keystone_price!.ink : c.price.ink)} Ink)` : 'claim'}`}</div>
            </motion.button>
          )}</AnimatePresence>
          <div className="absolute right-[max(12px,env(safe-area-inset-right,0px))] top-1/2 z-20 grid -translate-y-1/2 gap-2.5">
            <Rail label="Paint" onClick={() => mine ? nav(`/star/${c.id}/paint`) : toast('Claim a plot here first', { description: 'You paint your own plots of the star.' })} testid="star-paint-btn"><Paintbrush className="h-5 w-5" /></Rail>
            <Rail label="Free plot" onClick={() => { const free = nearestFree(c, plots, api3.current?.where() ?? 12); if (free != null) { api3.current?.goTo(free); toast('Walking to the nearest open plot'); } }} testid="star-free-btn"><Footprints className="h-5 w-5" /></Rail>
            <Rail label="Keystone" onClick={() => { const k = Array.from({ length: 12 }, (_, i) => i).find((i) => !byCell.has(i)); if (k != null) { api3.current?.goTo(k); toast('Walking to an open Keystone'); } else toast('All 12 Keystones are taken'); }} testid="star-key-btn"><MapPin className="h-5 w-5" /></Rail>
            <Rail label="Earth" onClick={() => void api.starHome().then(() => { void qc.invalidateQueries({ queryKey: ['star-where'] }); nav('/eyes'); })} testid="star-home-btn"><Home className="h-5 w-5" /></Rail>
          </div>
          <Stick target={stick} />
          <AnimatePresence>{sel != null && (
            <StarPlotSheet key={sel} card={c} cell={sel} plot={byCell.get(sel) ?? null} meId={me?.profile.id ?? null} onClose={() => setSel(null)} onClaim={(kind) => void claim(sel, kind)}
              onChanged={() => { void plotsQ.refetch(); void card.refetch(); }} />
          )}</AnimatePresence>
          <AnimatePresence>{roll && <StarRoll key={`${roll.star}:${roll.cell}`} res={roll} onClose={() => setRoll(null)} />}</AnimatePresence>
        </>
      )}
    </div>
  );
}

export const KIND_LABEL: Record<string, string> = {
  base: 'Base', art: 'Art', forge: '🔥 Fusion Forge', grove: '🌱 Lumen Grove', ranch: '☄️ Comet Ranch', song: '🎵 Starsong', sails: '⛵ Sail Yard',
  observatory: '🔭 Observatory', hatchery: '🐣 Plasma Hatchery', gate: '🌀 Stargate', lens: '🔦 Starbeam Lens',
};

const useUiHaptics = () => true;
function nearestFree(c: StarCard, plots: StarPlotRow[], from: number): number | null {
  const taken = new Set(plots.map((p) => p[0]));
  const f = cellCenter(c.m, from);
  let best: number | null = null, bd = -2;
  const N = Math.min(c.cells, 4000);
  for (let i = 0; i < N; i++) {
    const id = c.cells > 4000 ? (from + i * 7919) % c.cells : i;
    if (taken.has(id) || isKeystone(id)) continue;
    const p = cellCenter(c.m, id), d = p[0] * f[0] + p[1] * f[1] + p[2] * f[2];
    if (d > bd) { bd = d; best = id; }
  }
  void cellAngle;
  return best;
}

function Rail({ label, onClick, children, testid }: { label: string; onClick(): void; children: React.ReactNode; testid: string }) {
  return <button className="grid h-12 w-12 place-items-center rounded-full bg-black/50 text-white shadow-lg active:scale-95" onClick={onClick} aria-label={label} data-testid={testid}>{children}</button>;
}
/** a simple stick: drag to walk */
function Stick({ target }: { target: React.MutableRefObject<{ x: number; y: number }> }) {
  const [k, setK] = useState({ x: 0, y: 0, on: false });
  const base = useRef<HTMLDivElement>(null);
  const set = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    target.current = { x, y }; setK({ x, y, on: true });
  };
  const end = () => { target.current = { x: 0, y: 0 }; setK({ x: 0, y: 0, on: false }); };
  return (
    <div ref={base} className={cn('absolute bottom-[max(22px,env(safe-area-inset-bottom,0px))] left-[max(22px,env(safe-area-inset-left,0px))] z-20 h-32 w-32 touch-none rounded-full border border-white/15 bg-black/35')}
      onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); set(e); }} onPointerMove={(e) => { if (k.on) set(e); }} onPointerUp={end} onPointerCancel={end} data-testid="star-stick">
      <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25 shadow-lg" style={{ transform: `translate(calc(-50% + ${k.x * 36}px), calc(-50% + ${k.y * 36}px))` }} />
    </div>
  );
}
