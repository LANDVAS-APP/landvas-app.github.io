// The warp: from wherever you are, in first person, into hyperspace — the stars stretch into streaks rushing past,
// the tunnel glows in the colour of the star ahead — and out at the star, its shell wrapped round it.
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { framePacer, isPhone, sceneDpr } from '../lib/gfx';
import { releaseOnDispose } from '../lib/threeRelease';
import { CLASS_BY_ID, type StarClassId } from './galaxy';

export function StarWarp({ name, cls, arriveAt, departAt, onArrive, onRush, rushInk }: {
  name: string; cls: string; arriveAt: number; departAt: number; onArrive(): void; onRush?(): void; rushInk?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [left, setLeft] = useState(Math.max(0, Math.ceil((arriveAt - Date.now()) / 1000)));
  const arrived = useRef(false);
  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.max(0, Math.ceil((arriveAt - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0 && !arrived.current) { arrived.current = true; setTimeout(onArrive, 900); }
    }, 250);
    return () => clearInterval(t);
  }, [arriveAt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const r = releaseOnDispose(new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: false }));
    r.setPixelRatio(Math.min(sceneDpr(), isPhone() ? 1.25 : 1.5));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#03040c');
    const cam = new THREE.PerspectiveCamera(75, 1, 0.1, 4000);
    const C = CLASS_BY_ID[cls as StarClassId] ?? CLASS_BY_ID.yellow;
    // the streaks: each a short line rushing toward you (one draw for all of them)
    const N = isPhone() ? 900 : 1600;
    const pos = new Float32Array(N * 6), col = new Float32Array(N * 6), seed = new Float32Array(N * 3);
    const tint = new THREE.Color(C.glow);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, rr = 6 + Math.random() * 120;
      seed[i * 3] = Math.cos(a) * rr; seed[i * 3 + 1] = Math.sin(a) * rr; seed[i * 3 + 2] = -Math.random() * 2000;
      const c = new THREE.Color().setHSL(Math.random(), 0.3, 0.8).lerp(tint, 0.5);
      col.set([c.r * 0.2, c.g * 0.2, c.b * 0.2, c.r, c.g, c.b], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    lines.frustumCulled = false;
    scene.add(lines);
    // the tunnel's glow, and the star ahead growing as you near it
    const tunnelMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uC: { value: tint }, uK: { value: 0 } }, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `varying vec2 vU; void main() { vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uT, uK; uniform vec3 uC; varying vec2 vU;
        void main() { float w = sin(vU.x * 40.0 + uT * 3.0) * 0.5 + 0.5; float s = sin(vU.y * 60.0 - uT * 40.0) * 0.5 + 0.5;
          float a = (0.08 + 0.14 * w * s) * uK; gl_FragColor = vec4(uC * a, a); }`,
    });
    const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 3000, 48, 1, true).rotateX(Math.PI / 2).translate(0, 0, -1500), tunnelMat);
    scene.add(tunnel);
    const ahead = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: C.glow }));
    ahead.position.set(0, 0, -1800);
    scene.add(ahead);
    const resize = () => { const w = cv.clientWidth || 1, h = cv.clientHeight || 1; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cv);
    const pace = framePacer();
    let raf = 0; const t0 = performance.now();
    const total = Math.max(1, arriveAt - departAt);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || !pace.ready(now)) return;
      const t = (now - t0) / 1000;
      const k = Math.max(0, Math.min(1, (Date.now() - departAt) / total));
      // speed: up into the warp, steady, and down at the end
      const sp = Math.min(1, t / 1.6) * (k > 0.9 ? Math.max(0.05, (1 - k) / 0.1) : 1);
      const len = 6 + sp * 160;
      for (let i = 0; i < N; i++) {
        let z = seed[i * 3 + 2] + t * 900 * sp;
        z = ((z % 2000) + 2000) % 2000 - 2000;
        pos.set([seed[i * 3], seed[i * 3 + 1], z - len, seed[i * 3], seed[i * 3 + 1], z], i * 6);
      }
      g.attributes.position.needsUpdate = true;
      tunnelMat.uniforms.uT.value = t; tunnelMat.uniforms.uK.value = sp;
      ahead.scale.setScalar(4 + k * k * 600);
      cam.rotation.z = Math.sin(t * 0.7) * 0.04;
      r.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); g.dispose(); (lines.material as THREE.Material).dispose(); tunnel.geometry.dispose(); tunnelMat.dispose(); ahead.geometry.dispose(); (ahead.material as THREE.Material).dispose(); r.dispose(); };
  }, [cls, arriveAt, departAt]);
  return (
    <motion.div className="fixed inset-0 z-[70] bg-black text-white" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="star-warp">
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-x-0 top-[max(18px,env(safe-area-inset-top,0px))] flex flex-col items-center gap-1 text-center">
        <span className="text-[11px] font-black uppercase tracking-[0.35em] text-[#9DE4FF]">Warping to</span>
        <span className="font-display text-[28px] font-black leading-none" data-testid="star-warp-name">{name}</span>
        <span className="mt-1 rounded-full bg-black/50 px-3 py-1 text-[13px] font-bold tnum">{left > 0 ? `${left} s to go` : 'Arriving…'}</span>
      </div>
      {onRush && left > 2 && (
        <div className="absolute inset-x-0 bottom-[max(22px,env(safe-area-inset-bottom,0px))] flex justify-center">
          <button className="lv-btn on h-11 px-5" onClick={onRush} data-testid="star-warp-rush">⚡ Arrive now{rushInk ? ` · ${rushInk} Ink` : ''}</button>
        </div>
      )}
    </motion.div>
  );
}
