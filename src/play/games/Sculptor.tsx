// Sculptor: a scrambled clay face — grab its features and stretch it back to match the portrait.
import { useEffect, useMemo, useRef, useState } from 'react';
import { closeness, generateSculptor, sculpt, type Look, type Pt, type SculptMove } from '../../shared/minigames/sculptor';
import { sleep } from '../../lib/utils';
import { Button } from '../../ui';
import { Hud, fmtClock, haptic, useBoardSize, useLatest, useTicker, type GameProps } from '../common';

/** Catmull-Rom through a closed loop of points, as a smooth SVG path. */
function loop(p: Pt[], s: number) {
  const n = p.length;
  let d = `M${p[0][0] * s} ${p[0][1] * s}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0] * s} ${c1[1] * s} ${c2[0] * s} ${c2[1] * s} ${p2[0] * s} ${p2[1] * s}`;
  }
  return d + 'Z';
}

/** A cartoon face drawn from its 16 feature points. */
export function Face({ pts, look, size, id }: { pts: Pt[]; look: Look; size: number; id: string }) {
  const s = size;
  const [top, tL, tR, cL, cR, chin, eL, eR, bL, bR, nose, mL, mR, lip, earL, earR] = pts;
  const head = [top, tR, cR, chin, cL, tL];
  const er = s * 0.045;
  const hairTop: Pt = [top[0], top[1] - 0.045];
  const hair = look.hairStyle === 0
    ? `M${tL[0] * s} ${tL[1] * s} Q${(tL[0] - 0.02) * s} ${(hairTop[1] - 0.02) * s} ${hairTop[0] * s} ${hairTop[1] * s} Q${(tR[0] + 0.02) * s} ${(hairTop[1] - 0.02) * s} ${tR[0] * s} ${tR[1] * s} Q${top[0] * s} ${(top[1] + 0.06) * s} ${tL[0] * s} ${tL[1] * s}Z`
    : look.hairStyle === 1
      ? `M${(tL[0] - 0.01) * s} ${(tL[1] + 0.04) * s} Q${tL[0] * s} ${(hairTop[1] - 0.04) * s} ${hairTop[0] * s} ${(hairTop[1] - 0.03) * s} Q${tR[0] * s} ${(hairTop[1] - 0.04) * s} ${(tR[0] + 0.01) * s} ${(tR[1] + 0.04) * s} L${tR[0] * s} ${tR[1] * s} Q${top[0] * s} ${(top[1] + 0.02) * s} ${tL[0] * s} ${tL[1] * s}Z`
      : look.hairStyle === 2
        ? `M${(top[0] - 0.05) * s} ${(top[1] + 0.01) * s} L${top[0] * s} ${(top[1] - 0.09) * s} L${(top[0] + 0.05) * s} ${(top[1] + 0.01) * s}Z`
        : '';
  return (
    <g>
      <defs>
        <radialGradient id={`${id}skin`} cx="45%" cy="38%" r="70%"><stop offset="0" stopColor={look.skin} /><stop offset="1" stopColor={look.shade} /></radialGradient>
      </defs>
      <ellipse cx={earL[0] * s} cy={earL[1] * s} rx={s * 0.04} ry={s * 0.065} fill={look.shade} />
      <ellipse cx={earR[0] * s} cy={earR[1] * s} rx={s * 0.04} ry={s * 0.065} fill={look.shade} />
      <path d={loop(head, s)} fill={`url(#${id}skin)`} stroke="rgba(60,30,15,0.55)" strokeWidth={s * 0.008} />
      {hair && <path d={hair} fill={look.hair} />}
      {look.hairStyle === 3 && <circle cx={top[0] * s} cy={(top[1] - 0.03) * s} r={s * 0.045} fill={look.hair} />}
      {[eL, eR].map(([x, y], k) => (
        <g key={k}>
          <ellipse cx={x * s} cy={y * s} rx={er * 1.25} ry={er} fill="#fff" stroke="rgba(0,0,0,0.25)" strokeWidth={s * 0.004} />
          <circle cx={x * s} cy={y * s} r={er * 0.62} fill={look.eyes} />
          <circle cx={(x + 0.008) * s} cy={(y - 0.01) * s} r={er * 0.2} fill="#fff" />
        </g>
      ))}
      {[bL, bR].map(([x, y], k) => <path key={k} d={`M${(x - 0.045) * s} ${(y + (k ? 0.008 : -0.008)) * s} Q${x * s} ${(y - 0.025) * s} ${(x + 0.045) * s} ${(y + (k ? -0.008 : 0.008)) * s}`} stroke={look.hair} strokeWidth={s * 0.018} fill="none" strokeLinecap="round" />)}
      <path d={`M${nose[0] * s} ${(nose[1] - 0.06) * s} Q${(nose[0] - 0.035) * s} ${(nose[1] + 0.005) * s} ${nose[0] * s} ${(nose[1] + 0.012) * s} Q${(nose[0] + 0.03) * s} ${(nose[1] + 0.01) * s} ${(nose[0] + 0.02) * s} ${(nose[1] - 0.005) * s}`} fill={look.shade} stroke="rgba(60,30,15,0.45)" strokeWidth={s * 0.006} />
      <path d={`M${mL[0] * s} ${mL[1] * s} Q${(mL[0] + mR[0]) / 2 * s} ${(lip[1] + (lip[1] - (mL[1] + mR[1]) / 2)) * s} ${mR[0] * s} ${mR[1] * s} Q${(mL[0] + mR[0]) / 2 * s} ${((mL[1] + mR[1]) / 2 + 0.01) * s} ${mL[0] * s} ${mL[1] * s}Z`} fill="#8E2A3A" stroke="#5a1a24" strokeWidth={s * 0.006} />
      <ellipse cx={cL[0] * s + s * 0.03} cy={cL[1] * s - s * 0.02} rx={s * 0.03} ry={s * 0.018} fill="#FF6B8B" opacity={0.35} />
      <ellipse cx={cR[0] * s - s * 0.03} cy={cR[1] * s - s * 0.02} rx={s * 0.03} ry={s * 0.018} fill="#FF6B8B" opacity={0.35} />
    </g>
  );
}

export function SculptorBoard({ seed, level, now, onDone, registerSolver }: GameProps) {
  const L = useMemo(() => generateSculptor(seed, level), [seed, level]);
  const size = useBoardSize(420, 330);
  const [pts, setPts] = useState<Pt[]>(L.start);
  const ref = useLatest(pts);
  const moves = useRef<SculptMove[]>([]);
  const done = useRef(false);
  const drag = useRef<{ v: number; ox: number; oy: number } | null>(null);
  const lastT = useRef(0);
  useTicker(250);
  const left = L.timeLimitMs - now();
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone({ moves: moves.current, done_t: Math.round(now()) });
  };
  useEffect(() => { if (left <= 0) finish(); }); // eslint-disable-line react-hooks/exhaustive-deps

  const pull = (v: number, x: number, y: number) => {
    if (done.current) return;
    const t = Math.round(now());
    if (t - lastT.current < 14 && moves.current.length) return;
    lastT.current = t;
    const xx = Math.round(x * 1000) / 1000, yy = Math.round(y * 1000) / 1000;
    const cur = ref.current[v];
    if (Math.abs(xx - cur[0]) < 0.002 && Math.abs(yy - cur[1]) < 0.002) return;
    moves.current.push({ t, v, x: xx, y: yy });
    const next = sculpt(ref.current, L.weights, v, xx, yy);
    ref.current = next;
    setPts(next);
  };
  const local = (e: React.PointerEvent) => {
    const b = (e.currentTarget as SVGElement).getBoundingClientRect();
    return [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height] as Pt;
  };
  registerSolver(async () => {
    for (let pass = 0; pass < 8 && closeness(ref.current, L.target) < Math.min(0.97, L.threshold + 0.07); pass++) {
      for (let v = 0; v < L.v; v++) {
        await sleep(30 + Math.random() * 20);
        lastT.current = 0;
        pull(v, L.target[v][0], L.target[v][1]);
      }
    }
    await sleep(300);
    finish();
  });

  const match = closeness(pts, L.target);
  const pct = Math.round(match * 100);
  const ref8 = Math.round(size * 0.34);
  return (
    <div className="grid justify-items-center gap-3">
      <Hud items={[{ label: 'Face', value: L.name }, { label: 'Match', value: `${pct}%`, tone: match >= L.threshold ? 'ok' : undefined }, { label: 'Time', value: fmtClock(left), tone: left < 6000 ? 'warn' : undefined }]} />
      <div className="relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="no-touch-scroll touch-none rounded-[28px] bg-[radial-gradient(circle_at_50%_40%,#3a2a20,#160f0b)] shadow-[0_0_0_1px_rgba(255,200,150,0.15)]"
          data-testid="sculpt-board"
          onPointerDown={(e) => {
            const [x, y] = local(e);
            let best = -1, bd = 0.14;
            ref.current.forEach(([px, py], i) => { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } });
            if (best < 0) return;
            (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
            drag.current = { v: best, ox: ref.current[best][0] - x, oy: ref.current[best][1] - y };
            haptic(5);
          }}
          onPointerMove={(e) => { if (!drag.current) return; const [x, y] = local(e); pull(drag.current.v, x + drag.current.ox, y + drag.current.oy); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          {L.ghost && L.target.map(([x, y], i) => <circle key={`g${i}`} cx={x * size} cy={y * size} r={size / 90} fill="none" stroke="#22E3FF" strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="2 2" />)}
          <Face pts={pts} look={L.look} size={size} id="clay" />
          {pts.map(([x, y], i) => <circle key={i} cx={x * size} cy={y * size} r={Math.max(4, size / 85)} fill="#fff" fillOpacity={0.55} stroke="#5a2f19" strokeWidth={1} />)}
        </svg>
        <div className="absolute right-2 top-2 overflow-hidden rounded-2xl border-2 border-gold/70 bg-[#f4e8d8] shadow-lg" data-testid="sculpt-portrait">
          <svg width={ref8} height={ref8} viewBox={`0 0 ${size} ${size}`} aria-label={`Portrait of ${L.name}`}><Face pts={L.target} look={L.look} size={size} id="portrait" /></svg>
        </div>
      </div>
      <p className="max-w-sm text-center text-xs text-muted">Grab an eye, the nose, the chin or an ear and pull it back to match {L.name}’s portrait. {Math.round(L.threshold * 100)}% clears the round.</p>
      <Button variant="primary" onClick={finish} data-testid="board-done">Done · {pct}%</Button>
    </div>
  );
}
