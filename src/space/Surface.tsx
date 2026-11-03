// /space/surface — the world your rocket landed on. Walk (and bounce — every world has its own
// gravity) across the surface with your Inkborn in a bubble helmet, gather the day's glowing
// samples, plant your flag, and — on a far-off world — settle it as your home.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronUp, Home, Rocket as RocketIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { SpaceState } from '../backend/types';
import { explorerSvg } from '../explorer/character';
import { cleanGenome } from '../inkborn/genome';
import { drawCreature, type CreatureState } from '../inkborn/rig';
import { rng } from '../inkborn/world';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { cn } from '../lib/utils';
import { Button, Dialog, ResourceIcon, Spinner, inputCls } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { SPACE_KEY, useFlight, useSpace } from './useSpace';
import { type World, worldKey, worldOf } from './worlds';

export default function Surface() {
  const q = useSpace();
  const nav = useNavigate();
  const flight = useFlight(q.data);
  if (q.isLoading || !q.data) return <div className="fixed inset-0 grid place-items-center bg-[#05060F]"><Spinner /></div>;
  const s = q.data;
  const w = worldOf(s.location, s.home_seed, s.home_name);
  if (!w || flight.flying) {
    return (
      <div className="fixed inset-0 grid place-content-center gap-3 bg-[#05060F] p-6 text-center text-white">
        <div className="text-5xl">🚀</div>
        <p>{flight.flying ? 'Your rocket is still flying.' : 'You’re on Earth — launch to a world first.'}</p>
        <Button variant="secondary" onClick={() => nav('/space')}>Mission control</Button>
      </div>
    );
  }
  return <Ground key={s.location} s={s} w={w} />;
}

const SAMPLES = 5;

function Ground({ s, w }: { s: SpaceState; w: World }) {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const reduce = useUi((st) => st.settings.reduceMotion);
  const cv = useRef<HTMLCanvasElement>(null);
  const taken = s.samples[s.location] === s.day;
  const [got, setGot] = useState(0);
  const [paid, setPaid] = useState<{ paid: number; first: number } | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const isHome = s.home_seed != null && s.location === `exo:${s.home_seed}`;
  const sanct = useQuery({ queryKey: ['sanctuaries'], queryFn: api.mySanctuaries, enabled: !!me, staleTime: 60_000 });
  const buddy = sanct.data?.creatures.find((c) => !c.job) ?? null;
  const buddyGenome = useMemo(() => (buddy ? cleanGenome(buddy.genome) : null), [buddy?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const controls = useRef({ left: false, right: false, jump: false });
  const collecting = useRef(false);

  const collect = async () => {
    if (collecting.current) return;
    collecting.current = true;
    try {
      const r = await api.spaceCollect();
      qc.setQueryData(SPACE_KEY, r);
      invalidateGame(qc);
      setPaid({ paid: r.paid ?? 0, first: r.first_bonus ?? 0 });
      confettiCannons();
    } catch (e) { toast.error(toGameError(e).message); }
  };

  useEffect(() => {
    const c = cv.current!;
    const g = c.getContext('2d')!;
    let W = 0, H = 0;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const resize = () => { const r = c.getBoundingClientRect(); W = r.width; H = r.height; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(c);
    const seed = s.location.startsWith('exo:') ? Number(s.location.slice(4)) : [...s.location].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7);
    const r = rng(seed);
    const WW = () => Math.max(W * 3, 1800);
    // the land: a few sine hills (a flat deck on the gas giants)
    const waves = Array.from({ length: 4 }, () => ({ a: r() * 0.05, f: 0.6 + r() * 2.4, p: r() * 6 }));
    const groundAt = (x: number) => (w.gas ? H * 0.74 : H * (0.72 + waves.reduce((n, q) => n + Math.sin((x / WW()) * Math.PI * 2 * q.f + q.p) * q.a, 0)));
    const decor = Array.from({ length: 34 }, () => ({ u: r(), k: w.features[Math.floor(r() * w.features.length)], s: 0.6 + r() * 0.9, v: r() }));
    const far = Array.from({ length: 7 }, () => ({ u: r(), s: 0.6 + r() * 0.8, v: r() }));
    const stars = Array.from({ length: 120 }, () => ({ x: r(), y: r() * 0.7, s: r() * 1.4 + 0.3, p: r() * 6 }));
    const samples = taken ? [] : Array.from({ length: SAMPLES }, (_, i) => ({ u: 0.18 + (i / SAMPLES) * 0.75 + r() * 0.06, got: false, high: r() < 0.35 }));
    const gravity = 1500 * Math.max(0.18, Math.min(2.5, w.gravity));
    const P = { x: WW() * 0.1, y: 0, vx: 0, vy: 0, ground: true, dir: 1 as 1 | -1, tx: null as number | null, bob: 0 };
    P.y = groundAt(P.x);
    const buddySim = { x: P.x - 60, y: P.y, dir: 1 as 1 | -1, st: 'idle' as CreatureState, hop: 0 };
    let cam = 0, raf = 0, last = performance.now(), count = 0;
    const parts: { x: number; y: number; vx: number; vy: number; life: number; c: string }[] = [];
    const explorer = new Image();
    explorer.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(explorerSvg(me?.profile.explorer_style, me?.profile.accent_color ?? '#7B5CFF', 46).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
    const accent = me?.profile.accent_color ?? '#8B5CFF';
    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); keys.add(k); if (k.startsWith('arrow') || k === ' ') e.preventDefault(); };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    if (import.meta.env.DEV || location.search.includes('e2e=1')) (window as any).__landvasSurface = { P, samples, groundAt, WW };

    const step = (dt: number) => {
      const ctl = controls.current;
      let mx = (keys.has('d') || keys.has('arrowright') || ctl.right ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') || ctl.left ? 1 : 0);
      if (mx) P.tx = null;
      else if (P.tx !== null) { const d = P.tx - P.x; if (Math.abs(d) < 6) P.tx = null; else mx = Math.sign(d); }
      P.vx = mx * 270;
      if (mx) P.dir = mx > 0 ? 1 : -1;
      if ((keys.has('w') || keys.has('arrowup') || keys.has(' ') || ctl.jump) && P.ground) { P.vy = -620; P.ground = false; ctl.jump = false; }
      P.vy += gravity * dt;
      P.x = Math.max(20, Math.min(WW() - 20, P.x + P.vx * dt));
      P.y += P.vy * dt;
      const gy = groundAt(P.x);
      if (P.y >= gy) { P.y = gy; P.vy = 0; P.ground = true; }
      if (mx && P.ground) P.bob += dt * 10;
      cam += (Math.max(0, Math.min(WW() - W, P.x - W * 0.42)) - cam) * Math.min(1, dt * 5);
      // the buddy bounds after you
      const bx = P.x - P.dir * 70, d = bx - buddySim.x;
      if (Math.abs(d) > 8) { buddySim.x += Math.sign(d) * Math.min(Math.abs(d), 250 * dt); buddySim.dir = d > 0 ? 1 : -1; buddySim.st = 'walk'; } else if (buddySim.st === 'walk') buddySim.st = 'idle';
      buddySim.hop = Math.max(0, buddySim.hop - dt);
      buddySim.y = groundAt(buddySim.x) - (buddySim.hop > 0 ? Math.sin((buddySim.hop / 0.6) * Math.PI) * 40 : 0);
      // samples: walk (or jump) into them
      for (const sm of samples) {
        if (sm.got) continue;
        const sx = sm.u * WW(), sy = groundAt(sx) - (sm.high ? 150 : 26);
        if (Math.abs(P.x - sx) < 34 && Math.abs((P.y - 40) - sy) < 60) {
          sm.got = true; count++; setGot(count); buddySim.st = 'happy'; buddySim.hop = 0.6;
          for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; parts.push({ x: sx, y: sy, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160 - 60, life: 0, c: i % 2 ? w.detail : '#FFFFFF' }); }
          if (count === SAMPLES) void collect();
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; if (p.life > 0.9) parts.splice(i, 1); }
    };

    const draw = (t: number) => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, w.sky[0]); sky.addColorStop(1, w.sky[1]);
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      if (w.dark) for (const st of stars) { g.globalAlpha = 0.4 + 0.4 * Math.sin(t * 1.3 + st.p); g.fillStyle = '#fff'; g.fillRect(((st.x * W * 1.5 - cam * 0.05) % W + W) % W, st.y * H, st.s, st.s); }
      g.globalAlpha = 1;
      // something big in the sky
      if (w.id === 'moon') { const x = W * 0.78 - cam * 0.03; g.fillStyle = '#3EA0DA'; g.beginPath(); g.arc(x, H * 0.18, 40, 0, Math.PI * 2); g.fill(); g.fillStyle = '#4FA552'; g.beginPath(); g.arc(x - 8, H * 0.17, 18, 0, Math.PI * 2); g.arc(x + 14, H * 0.22, 10, 0, Math.PI * 2); g.fill(); }
      else if (w.id === 'saturn') { g.strokeStyle = 'rgba(246,235,200,0.55)'; g.lineWidth = 26; g.beginPath(); g.ellipse(W * 0.5 - cam * 0.02, H * 0.05, W * 0.9, H * 0.2, -0.12, 0.1, Math.PI - 0.1); g.stroke(); }
      else if (w.id === 'jupiter') { const x = W * 0.7 - cam * 0.04; g.fillStyle = 'rgba(210,119,75,0.55)'; g.beginPath(); g.ellipse(x, H * 0.2, 90, 40, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 3; g.beginPath(); g.ellipse(x, H * 0.2, 60 + Math.sin(t) * 4, 24, t * 0.2, 0, Math.PI * 1.4); g.stroke(); }
      else if (!w.dark) { g.fillStyle = 'rgba(255,250,220,0.85)'; g.beginPath(); g.arc(W * 0.8 - cam * 0.03, H * 0.15, 22, 0, Math.PI * 2); g.fill(); }
      else { g.fillStyle = '#FFF6B0'; g.beginPath(); g.arc(W * 0.85 - cam * 0.03, H * 0.12, w.id === 'pluto' ? 3 : 12, 0, Math.PI * 2); g.fill(); }
      // far layer: mountains, mesas or a volcano (clouds on the giants)
      for (const f of far) {
        const x = f.u * WW() * 0.6 - cam * 0.4, base = H * 0.66;
        if (x < -300 || x > W + 300) continue;
        g.fillStyle = w.gas ? 'rgba(255,255,255,0.35)' : w.ground[1];
        g.globalAlpha = w.gas ? 0.6 : 0.55;
        g.beginPath();
        if (w.gas) { g.ellipse(x, base + 30, 140 * f.s, 34 * f.s, 0, 0, Math.PI * 2); }
        else if (w.features.includes('mesas')) { g.moveTo(x - 120 * f.s, base + 40); g.lineTo(x - 70 * f.s, base - 70 * f.s); g.lineTo(x + 70 * f.s, base - 70 * f.s); g.lineTo(x + 120 * f.s, base + 40); }
        else if (w.features.includes('volcano') && f.v < 0.3) { g.moveTo(x - 160, base + 40); g.lineTo(x - 30, base - 120); g.lineTo(x + 30, base - 120); g.lineTo(x + 160, base + 40); }
        else { g.moveTo(x - 150 * f.s, base + 40); g.lineTo(x, base - 90 * f.s); g.lineTo(x + 150 * f.s, base + 40); }
        g.fill();
        if (w.features.includes('volcano') && f.v < 0.3 && !w.gas) { g.globalAlpha = 0.4 + 0.3 * Math.sin(t * 2); g.fillStyle = '#FF6B3D'; g.beginPath(); g.ellipse(x, base - 120, 34, 8, 0, 0, Math.PI * 2); g.fill(); }
        g.globalAlpha = 1;
      }
      // the ground (or the cloud station's deck)
      const gr = g.createLinearGradient(0, H * 0.6, 0, H);
      gr.addColorStop(0, w.ground[0]); gr.addColorStop(1, w.ground[1]);
      if (w.gas) {
        for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + (i % 3) * 0.1})`; const x = ((i * 220 - cam * 0.7 + t * 12) % (W + 300)) - 150; g.beginPath(); g.ellipse(x, H * 0.9 + (i % 2) * 30, 160, 40, 0, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#6E7891'; g.fillRect(0, H * 0.74, W, 18);
        g.fillStyle = '#9AA6C2'; g.fillRect(0, H * 0.74, W, 5);
        g.fillStyle = '#4A5268'; for (let x = -((cam) % 80); x < W; x += 80) g.fillRect(x, H * 0.74 + 18, 8, 60);
      } else {
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, H);
        for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, groundAt(x + cam));
        g.lineTo(W, H); g.closePath(); g.fill();
      }
      // near details
      for (const d of decor) {
        const wx = d.u * WW(), x = wx - cam;
        if (x < -80 || x > W + 80) continue;
        const y = groundAt(wx);
        g.save(); g.translate(x, y);
        switch (d.k) {
          case 'craters': g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(0, 10, 34 * d.s, 8 * d.s, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, 8, 34 * d.s, 8 * d.s, 0, Math.PI, Math.PI * 2); g.stroke(); break;
          case 'rocks': g.fillStyle = w.ground[1]; g.beginPath(); g.moveTo(-16 * d.s, 2); g.lineTo(-8 * d.s, -14 * d.s); g.lineTo(10 * d.s, -12 * d.s); g.lineTo(18 * d.s, 2); g.fill(); break;
          case 'dunes': g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.ellipse(0, 6, 60 * d.s, 10 * d.s, 0, Math.PI, Math.PI * 2); g.fill(); break;
          case 'crystals': case 'ice': {
            const col = d.k === 'ice' ? 'rgba(220,245,255,0.85)' : w.detail;
            for (let i = -1; i <= 1; i++) { g.fillStyle = col; g.globalAlpha = 0.85; g.beginPath(); g.moveTo(i * 9 * d.s - 5, 2); g.lineTo(i * 9 * d.s, -(26 + (i === 0 ? 14 : 0)) * d.s); g.lineTo(i * 9 * d.s + 5, 2); g.fill(); }
            g.globalAlpha = 1; break;
          }
          case 'mesas': case 'volcano': g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(-14 * d.s, -6 * d.s, 28 * d.s, 8 * d.s); break;
          case 'clouds': if (!w.gas) { g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.ellipse(0, -160 - d.v * 120, 50, 14, 0, 0, Math.PI * 2); g.fill(); } break;
        }
        g.restore();
      }
      // your rocket, flag (and a dome on your home world)
      const rx = WW() * 0.06 - cam, ry = groundAt(WW() * 0.06);
      g.save(); g.translate(rx, ry);
      g.fillStyle = '#59647D'; g.fillRect(-14, -16, 28, 16);
      g.fillStyle = '#F2F5FB'; g.beginPath(); g.moveTo(-20, -16); g.lineTo(-20, -110); g.quadraticCurveTo(0, -170, 20, -110); g.lineTo(20, -16); g.fill();
      g.fillStyle = accent; g.beginPath(); g.moveTo(-20, -110); g.quadraticCurveTo(0, -170, 20, -110); g.fill();
      g.beginPath(); g.moveTo(-20, -40); g.lineTo(-40, -6); g.lineTo(-20, -14); g.fill(); g.beginPath(); g.moveTo(20, -40); g.lineTo(40, -6); g.lineTo(20, -14); g.fill();
      g.fillStyle = '#1B2A5E'; g.beginPath(); g.arc(0, -84, 9, 0, Math.PI * 2); g.fill();
      g.restore();
      const fx = WW() * 0.06 + 70 - cam, fy = groundAt(WW() * 0.06 + 70);
      g.fillStyle = '#DDE3EE'; g.fillRect(fx, fy - 70, 3, 70);
      g.fillStyle = accent; g.beginPath(); g.moveTo(fx + 3, fy - 70); g.quadraticCurveTo(fx + 22, fy - 66 + Math.sin(t * 3) * 3, fx + 38, fy - 62); g.lineTo(fx + 38, fy - 44); g.quadraticCurveTo(fx + 22, fy - 48 + Math.sin(t * 3 + 1) * 3, fx + 3, fy - 52); g.fill();
      if (isHome) {
        const dx = WW() * 0.06 + 170 - cam, dy = groundAt(WW() * 0.06 + 170);
        g.fillStyle = 'rgba(180,220,255,0.35)'; g.beginPath(); g.arc(dx, dy, 70, Math.PI, 0); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; g.stroke();
        g.fillStyle = '#4FA552'; g.beginPath(); g.ellipse(dx, dy - 2, 60, 8, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#2F7D3A'; g.beginPath(); g.arc(dx - 20, dy - 24, 16, 0, Math.PI * 2); g.arc(dx + 18, dy - 18, 12, 0, Math.PI * 2); g.fill();
      }
      // samples
      for (const sm of samples) {
        if (sm.got) continue;
        const wx = sm.u * WW(), x = wx - cam, y = groundAt(wx) - (sm.high ? 150 : 26) + Math.sin(t * 2.5 + sm.u * 9) * 5;
        if (x < -40 || x > W + 40) continue;
        const gl = g.createRadialGradient(x, y, 0, x, y, 34); gl.addColorStop(0, 'rgba(255,255,255,0.9)'); gl.addColorStop(0.3, w.detail); gl.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalAlpha = 0.55 + 0.25 * Math.sin(t * 4 + sm.u * 7); g.fillStyle = gl; g.beginPath(); g.arc(x, y, 34, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
        g.fillStyle = '#FFFFFF'; g.beginPath(); g.moveTo(x, y - 14); g.lineTo(x + 8, y); g.lineTo(x, y + 12); g.lineTo(x - 8, y); g.closePath(); g.fill();
        g.fillStyle = w.detail; g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 4, y); g.lineTo(x, y + 7); g.lineTo(x - 4, y); g.fill();
      }
      // your Inkborn, in a bubble helmet
      if (buddyGenome) {
        const bx = buddySim.x - cam, by = buddySim.y, px = 54;
        drawCreature(g, buddyGenome, bx, by, px, { t, state: buddySim.hop > 0 ? 'happy' : buddySim.st, dir: buddySim.dir });
        g.strokeStyle = 'rgba(200,230,255,0.75)'; g.lineWidth = 2; g.fillStyle = 'rgba(180,220,255,0.12)';
        g.beginPath(); g.arc(bx, by - px * 0.55, px * 0.72, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(bx - px * 0.3, by - px * 0.9, px * 0.12, px * 0.06, -0.6, 0, Math.PI * 2); g.fill();
      }
      // you
      if (explorer.complete && explorer.naturalWidth) {
        const hgt = 92, wid = (hgt * 46) / 68;
        const x = P.x - cam, y = P.y - (P.ground && P.vx ? Math.abs(Math.sin(P.bob)) * 5 : 0);
        g.fillStyle = 'rgba(0,0,0,0.25)'; const sh = Math.max(0.3, 1 - (groundAt(P.x) - P.y) / 300); g.beginPath(); g.ellipse(x, groundAt(P.x), wid * 0.4 * sh, wid * 0.13 * sh, 0, 0, Math.PI * 2); g.fill();
        g.save(); g.translate(x, y); if (P.dir < 0) g.scale(-1, 1); g.drawImage(explorer, -wid / 2, -hgt, wid, hgt); g.restore();
        // a space helmet
        g.strokeStyle = 'rgba(200,230,255,0.8)'; g.lineWidth = 2; g.fillStyle = 'rgba(180,220,255,0.12)'; g.beginPath(); g.arc(x, y - hgt * 0.78, 24, 0, Math.PI * 2); g.fill(); g.stroke();
      }
      for (const p of parts) { g.globalAlpha = 1 - p.life / 0.9; g.fillStyle = p.c; g.beginPath(); g.arc(p.x - cam, p.y, 3, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      step(dt);
      draw(reduce ? 0 : now / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // tap the ground to walk there; tap above you to jump
    const onTap = (e: PointerEvent) => {
      const rc = c.getBoundingClientRect();
      const x = e.clientX - rc.left + cam, y = e.clientY - rc.top;
      if (y < P.y - 140 && Math.abs(x - P.x) < 120) controls.current.jump = true;
      else P.tx = x;
    };
    c.addEventListener('pointerdown', onTap);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); c.removeEventListener('pointerdown', onTap); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [buddyGenome]); // eslint-disable-line react-hooks/exhaustive-deps

  const hold = (k: 'left' | 'right') => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); controls.current[k] = true; },
    onPointerUp: () => { controls.current[k] = false; }, onPointerCancel: () => { controls.current[k] = false; }, onPointerLeave: () => { controls.current[k] = false; },
  });
  const settle = async () => {
    setBusy(true);
    try { const r = await api.spaceSettle(name.trim()); qc.setQueryData(SPACE_KEY, r); setSettleOpen(false); confettiCannons(); toast.success(`Welcome home to ${r.home_name}! 🏡`, { description: 'You can fly back here from mission control any time.' }); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  const cfg = s.config.worlds[worldKey(s.location)];
  const pad = 'pointer-events-auto flex h-16 w-16 select-none items-center justify-center rounded-2xl border border-white/20 bg-black/40 text-white active:bg-white/25';

  return (
    <div className="lv-space fixed inset-0 select-none overflow-hidden bg-black text-white" data-testid="surface">
      <canvas ref={cv} className="absolute inset-0 h-full w-full touch-none" aria-label={`The surface of ${w.name}. Walk with A/D or the arrows, jump with W or space.`} data-testid="surface-canvas" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-2xl bg-black/55 p-1.5 pr-3">
          <button onClick={() => nav('/space')} className="rounded-xl p-2 hover:bg-white/10" aria-label="Back to mission control"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-bold">{w.name}{isHome ? ' · home' : ''}</div>
            <div className="truncate text-[11px] text-white/70">Gravity {w.gravity}× · {taken && !paid ? 'samples collected today' : `samples ${got}/${SAMPLES}`}</div>
          </div>
        </div>
        <div className="pointer-events-auto flex gap-1.5">
          {w.kind === 'exo' && !isHome && <Button size="sm" variant="rainbow" onClick={() => { setName(w.name.split(' (')[0]); setSettleOpen(true); }} data-testid="settle"><Home className="h-4 w-4" /> Settle here</Button>}
          <Button size="sm" variant="secondary" className="bg-black/55" onClick={() => nav('/space')}><RocketIcon className="h-4 w-4" /> Rocket</Button>
        </div>
      </div>
      <AnimatePresence>
        {paid && (
          <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-x-0 top-24 mx-auto w-fit max-w-[calc(100%-24px)] rounded-2xl bg-black/70 px-4 py-3 text-center" data-testid="samples-paid">
            <div className="font-display text-lg font-bold">All samples collected! 🪨✨</div>
            <div className="flex items-center justify-center gap-1 text-sm">+{paid.paid} <ResourceIcon r="ink" className="h-4 w-4" />{paid.first > 0 && <> · first-visit bonus +{paid.first} <ResourceIcon r="ink" className="h-4 w-4" /></>}</div>
          </motion.div>
        )}
        {taken && !paid && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-x-0 top-24 mx-auto w-fit max-w-[calc(100%-24px)] rounded-2xl bg-black/60 px-4 py-2 text-center text-xs">
            You’ve gathered today’s samples here (+{cfg?.sample ?? 0} Ink a day). Explore, or fly somewhere new.
          </motion.div>
        )}
      </AnimatePresence>
      {/* touch controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4 pb-[max(16px,env(safe-area-inset-bottom,0px))]">
        <div className="flex gap-2">
          <button className={pad} {...hold('left')} aria-label="Walk left" data-testid="walk-left"><ChevronLeft className="h-8 w-8" /></button>
          <button className={pad} {...hold('right')} aria-label="Walk right" data-testid="walk-right"><ChevronRight className="h-8 w-8" /></button>
        </div>
        <button className={cn(pad, 'h-20 w-20 rounded-full')} onPointerDown={(e) => { e.preventDefault(); controls.current.jump = true; }} aria-label="Jump" data-testid="jump"><ChevronUp className="h-9 w-9" /></button>
      </div>
      <Dialog open={settleOpen} onOpenChange={setSettleOpen} title="Settle this world" description="Make it your home world. Your dome goes up next to the rocket, and you can fly back here from mission control any time.">
        <div className="grid gap-3">
          <input className={inputCls} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Name your world" data-testid="settle-name" />
          <Button variant="rainbow" loading={busy} disabled={!name.trim()} onClick={settle} data-testid="settle-go"><Home className="h-4 w-4" /> Make it home</Button>
        </div>
      </Dialog>
    </div>
  );
}
