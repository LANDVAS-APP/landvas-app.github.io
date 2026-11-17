// Your explorer in first person, in its own 2D/2.5D art: the hands holding your explorer's held cosmetic, the sleeves
// in its outfit, its body when you look down, and the seat of whatever you ride (see selfView.ts for the drawings).
// It moves with the walk (bob, sway, swinging hands), throws and catches, turns the bike's bars and the car's wheel,
// spins the front wheel and flickers the jetpack's flames. Each piece is its own layer and only its transform changes
// from frame to frame, so the phone just moves pictures about.
import { useEffect, useMemo, useRef } from 'react';
import type { Eyes } from './scene';
import { CAR_ARMS, bikeLayers, carArm, carFrame, carLayers, jetLayers, lookDownLayers, walkLayers, type SelfLook } from './selfView';

/** a layer's transform origin (as a share of the 400×300 picture) */
const at = (x: number, y: number) => `${(x / 4).toFixed(2)}% ${(y / 3).toFixed(2)}%`;
const armT = (side: 'armR' | 'armL', deg: number) => { const a = carArm(side, deg); return `rotate(${a.angle.toFixed(2)}deg) scale(1, ${a.stretch.toFixed(4)})`; };
const ORIGIN: Record<string, string> = {
  bars: '50% 100%', hands: '50% 100%', wheel: '50% 100%', flames: '50% 100%', left: '22% 85%',
  armR: at(CAR_ARMS.armR.e[0], CAR_ARMS.armR.e[1]), armL: at(CAR_ARMS.armL.e[0], CAR_ARMS.armL.e[1]),
};

type Vehicle = 'walk' | 'bike' | 'car' | 'jet';

export function FirstPersonSelf({ eyes, look, vehicle, hidden }: { eyes: Eyes | null; look: SelfLook; vehicle: Vehicle; hidden?: boolean }) {
  const styleKey = JSON.stringify(look.style ?? {});
  const layers = useMemo(() => (vehicle === 'walk' ? walkLayers(look) : vehicle === 'bike' ? bikeLayers(look) : vehicle === 'car' ? carLayers(look) : jetLayers(look)),
    [styleKey, look.accent, vehicle]); // eslint-disable-line react-hooks/exhaustive-deps
  const down = useMemo(() => lookDownLayers(look), [styleKey, look.accent]); // eslint-disable-line react-hooks/exhaustive-deps
  const downRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const root = useRef<HTMLDivElement>(null);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const legs = useRef<HTMLDivElement>(null);
  const speedo = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!eyes || hidden) return;
    let raf = 0, wheel = 0, last = performance.now(), dim = -1, lastKmh = -1, steer = 1e9;
    const L = refs.current;
    const set = (k: string, t: string) => { const el = L[k]; if (el) el.style.transform = t; };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const p = eyes.selfPose();
      // the whole of you bobs and sways with the walk (and leans into turns on a bike)
      if (root.current) {
        root.current.style.transform = `translate3d(${(-p.x * 900).toFixed(1)}px, ${(p.y * 700).toFixed(1)}px, 0) rotate(${(p.roll * 1.6).toFixed(4)}rad)`;
        const d = Math.round((0.5 + 0.5 * Math.max(0, Math.min(1, p.day * 1.4))) * 20) / 20;
        if (d !== dim) { dim = d; root.current.style.filter = d < 1 ? `brightness(${d})` : ''; }
      }
      const down = p.lookDown;
      if (p.vehicle === 'walk') {
        const sw = Math.sin(p.phase) * p.moving;
        const k = p.throwK, r = p.reachK;
        set('right', `translate3d(${(sw * 10 - k * 40).toFixed(1)}px, ${(Math.abs(sw) * 9 - k * 130 + down * 160).toFixed(1)}px, 0) rotate(${(-k * 22 + sw * 2).toFixed(2)}deg) scale(${(1 - k * 0.18).toFixed(3)})`);
        // (the left hand only comes up to catch something)
        set('left', `translate3d(${(-60 + r * 120).toFixed(1)}px, ${(420 - r * 530 + down * 170).toFixed(1)}px, 0) rotate(${(r * 18 - 20).toFixed(2)}deg)`);
      } else if (p.vehicle === 'bike') {
        // the tyre's tread runs toward you as you ride; the bars (and your hands) turn as you steer
        wheel = (wheel + p.speed * dt * 60) % 13;
        const tr = L.wheel?.querySelector<SVGGElement>('.lv-fp-tread');
        if (tr && p.speed > 0.2) tr.setAttribute('transform', `translate(0 ${wheel.toFixed(1)})`);
        const turn = `rotate(${(-p.turn * 7).toFixed(2)}deg)`;
        set('bars', turn); set('hands', turn); set('wheel', turn);
      } else if (p.vehicle === 'car') {
        // the wheel turns about its hub, your hands with it, your forearms following them
        const deg = -p.turn * 55;
        if (Math.abs(deg - steer) > 0.05) {
          steer = deg;
          for (const key of ['wheel', 'grip']) {
            const st = L[key]?.firstElementChild as SVGSVGElement | null;
            if (st) { st.style.transformOrigin = '50% 108.7%'; st.style.transform = `rotate(${deg.toFixed(2)}deg)`; }
          }
          set('armR', armT('armR', deg)); set('armL', armT('armL', deg));
        }
        const kmh = Math.round(p.speed * 3.6);
        if (kmh !== lastKmh) {
          lastKmh = kmh;
          const n = L.dash?.querySelector<SVGPathElement>('.lv-fp-needle');
          if (n) n.style.transform = `rotate(${(-120 + Math.min(1, kmh / 160) * 240).toFixed(1)}deg)`;
          if (speedo.current) speedo.current.textContent = String(kmh);
        }
      } else {
        const f = L.flames;
        if (f) f.style.transform = `scale(${(1 + Math.random() * 0.12 + p.moving * 0.25).toFixed(3)}, ${(1 + Math.random() * 0.2 + p.moving * 0.4).toFixed(3)})`;
      }
      // look down: there you are (your round body and your feet, stepping)
      if (legs.current) {
        const show = p.vehicle === 'walk' ? down : 0;
        legs.current.style.transform = `translate3d(0, ${((1 - show) * 100).toFixed(1)}%, 0)`;
        legs.current.style.opacity = show > 0.02 ? '1' : '0';
        if (show > 0.02) {
          const st = Math.sin(p.phase) * p.moving;
          const D = downRefs.current;
          if (D.feetL) D.feetL.style.transform = `translate3d(0, ${(-st * 26).toFixed(1)}px, 0)`;
          if (D.feetR) D.feetR.style.transform = `translate3d(0, ${(st * 26).toFixed(1)}px, 0)`;
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [eyes, hidden, vehicle]);

  if (hidden) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" data-testid="eyes-self" data-vehicle={vehicle}>
      {vehicle === 'car' && (
        <>
          <div className="absolute inset-0" dangerouslySetInnerHTML={{ __html: carFrame() }} style={{ ['--x' as string]: 0 }} />
          {/* the rear-view mirror */}
          <div className="absolute left-1/2 top-[7%] h-[34px] w-[min(34vw,180px)] -translate-x-[30%] rounded-[12px] border-[5px] border-[#1d2035] bg-gradient-to-b from-[#a9bee0] to-[#5d7090] shadow-lg" />
        </>
      )}
      {/* your body, when you look down */}
      <div className="absolute left-1/2 aspect-[4/3] w-[min(100vw,640px)] -translate-x-1/2" style={{ bottom: 'max(0px, calc((100dvh - 133vw) * 0.42))' }}>
        <div ref={legs} className="absolute inset-0 opacity-0" style={{ willChange: 'transform' }}>
          {Object.entries(down).map(([k, svg]) => (
            <div key={k} ref={(el) => { downRefs.current[k] = el; }} className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          ))}
        </div>
      </div>
      <div className="absolute left-1/2 aspect-[4/3] w-[min(100vw,640px)] -translate-x-1/2" style={{ bottom: 'max(0px, calc((100dvh - 133vw) * 0.42))' }}>
        <div ref={root} className="absolute inset-0" style={{ willChange: 'transform' }}>
          {Object.entries(layers).map(([k, svg]) => (
            <div key={`${vehicle}-${k}`} ref={(el) => { refs.current[k] = el; }} className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full"
              style={{ willChange: 'transform', transformOrigin: ORIGIN[k] ?? '75% 85%', transform: k === 'left' ? 'translate3d(-60px, 420px, 0) rotate(-20deg)' : k === 'armR' || k === 'armL' ? armT(k, 0) : undefined }}
              dangerouslySetInnerHTML={{ __html: svg }} />
          ))}
          {vehicle === 'car' && <span ref={speedo} className="absolute font-black tabular-nums text-[#22E3FF]" style={{ left: '24.5%', top: '83.5%', fontSize: 'min(3.2vw, 16px)', transform: 'translate(-50%, 0)' }}>0</span>}
        </div>
      </div>
    </div>
  );
}
