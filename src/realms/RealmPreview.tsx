// A little animated picture of each realm type, for the plot-type picker.
import { useEffect, useRef } from 'react';
import type { RealmKind } from '../backend/types';

export function RealmPreview({ kind }: { kind: RealmKind }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current!.getContext('2d')!;
    let raf = 0; const t0 = performance.now();
    const em = (e: string, x: number, y: number, s: number) => { g.font = `${s}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, x, y); };
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      g.clearRect(0, 0, 160, 110);
      if (kind === 'mine') {
        g.fillStyle = '#1A1420'; g.fillRect(0, 0, 160, 110);
        for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 3 ? '#3A3340' : '#463F4D'; g.fillRect(x * 20, 30 + y * 16, 19, 15); }
        ['💎', '🔮', '🟠', '⚪'].forEach((e, i) => em(e, 25 + i * 37, 54 + (i % 2) * 22, 13));
        em('👷', 80, 22 + Math.abs(Math.sin(t * 3)) * 4, 22);
        const gr = g.createRadialGradient(80, 30, 10, 80, 50, 90); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.7)'); g.fillStyle = gr; g.fillRect(0, 0, 160, 110);
      } else if (kind === 'sky') {
        const gr = g.createLinearGradient(0, 0, 0, 110); gr.addColorStop(0, '#5AA9F2'); gr.addColorStop(1, '#CBE9FF'); g.fillStyle = gr; g.fillRect(0, 0, 160, 110);
        const y = 58 + Math.sin(t * 1.2) * 4;
        g.fillStyle = '#7ED957'; g.beginPath(); g.ellipse(80, y, 46, 10, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#8A6E55'; g.beginPath(); g.moveTo(36, y); g.lineTo(80, y + 40); g.lineTo(124, y); g.fill();
        em('🌬️', 66, y - 14, 16); em('🌳', 96, y - 12, 18);
        for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(((t * 18 + k * 60) % 200) - 20, 20 + k * 30, 18, 8, 0, 0, Math.PI * 2); g.fill(); }
        em('✨', 30 + Math.sin(t * 2) * 10, 30, 12); em('🐋', 135, 25 + Math.sin(t) * 3, 16);
      } else if (kind === 'workshop') {
        g.fillStyle = '#3A2A20'; g.fillRect(0, 0, 160, 110); g.fillStyle = '#9C4A35'; g.fillRect(0, 0, 160, 40);
        g.save(); g.translate(30, 22); g.rotate(t); em('⚙️', 0, 0, 26); g.restore(); g.save(); g.translate(56, 18); g.rotate(-t * 1.4); em('⚙️', 0, 0, 18); g.restore();
        g.fillStyle = '#4A4A55'; g.fillRect(0, 74, 160, 12);
        ['⚙️', '🌀', '💾', '🔋'].forEach((e, i) => em(e, ((t * 30 + i * 42) % 190) - 15, 68, 14));
        em('🤖', 125, 40 + Math.sin(t * 4) * 2, 24); em('💡', 100, 16, 16);
      } else if (kind === 'diner') {
        for (let y = 0; y < 6; y++) for (let x = 0; x < 9; x++) { g.fillStyle = (x + y) % 2 ? '#F4F1EA' : '#E8323C'; g.fillRect(x * 18, y * 18 + 2, 18, 18); }
        g.fillStyle = 'rgba(40,30,60,0.35)'; g.fillRect(0, 0, 160, 110);
        em('🧑‍🍳', 40, 50, 30); em('🍳', 70, 62, 20);
        ['🥞', '🍕', '🌮', '🥧'].forEach((e, i) => em(e, 100 + (i % 2) * 30, 40 + Math.floor(i / 2) * 30 - Math.abs(Math.sin(t * 2 + i)) * 4, 20));
        for (let k = 0; k < 3; k++) { const p = (t * 0.6 + k / 3) % 1; g.globalAlpha = 1 - p; g.fillStyle = '#fff'; g.beginPath(); g.arc(70 + Math.sin(p * 6) * 4, 52 - p * 30, 4, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
      } else if (kind === 'brawl') {
        // a tabletop of four terrain lanes a side, two creatures squaring up and cards fanning in
        const gr = g.createLinearGradient(0, 0, 0, 110); gr.addColorStop(0, '#2A1240'); gr.addColorStop(1, '#0E0A1C'); g.fillStyle = gr; g.fillRect(0, 0, 160, 110);
        const T = ['#5FCB6A', '#FF7A3D', '#6FD3FF', '#FF6FB5'];
        for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) { g.fillStyle = T[(i + r) % 4]; g.globalAlpha = 0.85; g.beginPath(); g.roundRect(18 + i * 32, 24 + r * 30, 28, 26, 5); g.fill(); g.globalAlpha = 1; }
        const hit = (Math.sin(t * 2.2) + 1) / 2;
        em('🦊', 66, 66 - hit * 10, 22); em('🐲', 98, 34 + hit * 4, 22);
        if (hit > 0.92) em('💥', 82, 50, 20);
        ['🂠', '🂠', '🂠'].forEach((e, i) => { g.save(); g.translate(64 + i * 16, 104); g.rotate((i - 1) * 0.25 + Math.sin(t + i) * 0.03); g.fillStyle = ['#FF4FD8', '#B57BFF', '#22E3FF'][i]; g.beginPath(); g.roundRect(-9, -26, 18, 26, 3); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); g.restore(); });
      } else {
        g.fillStyle = '#1A1420'; g.fillRect(0, 0, 160, 110);
        for (let y = 0; y < 6; y++) for (let x = 0; x < 9; x++) { g.fillStyle = (x + y) % 2 ? '#2E2836' : '#332C3C'; g.fillRect(x * 18, y * 18 + 2, 17, 17); }
        em('🔥', 14, 20 + Math.sin(t * 12), 16); em('🔥', 146, 20 + Math.sin(t * 13), 16);
        em('🧝', 50 + Math.sin(t * 2) * 6, 70, 26); em('👻', 110, 34 + Math.sin(t * 3) * 6, 22); em('💰', 120, 80, 18); em('🗡️', 70, 56, 14);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [kind]);
  return <canvas ref={ref} width={160} height={110} className="h-[110px] w-[160px] rounded-2xl shadow-lg" />;
}
