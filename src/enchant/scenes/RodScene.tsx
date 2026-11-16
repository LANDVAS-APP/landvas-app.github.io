// 🪄 Dowsing Rod: a forked hazel rod held over a cut-away of the earth — strata, roots and, far down, the vein it's
// tuned to, glowing in the target's colour. Every roll that misses pushes the rod deeper: its tip dips, ink beads and
// drips into the well, and the water rises toward the vein. At full depth the next roll IS the target. Tune it on a
// dial of rarities, Ultras and kinds (each with its natural odds, the harder tuned odds and the depth it needs).
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toMap } from '../../lib/toMap';
import { useUi } from '../../lib/store';
import { cellCenter } from '../../shared/grid';
import { rarityInfo } from '../../shared/rarity';
import { Button } from '../../ui';
import { efx, type SceneProps } from '../core';
import { sleep, useCraftClip } from '../craft';
import { kindInfo } from '../kinds';
import { feel } from '../living';
import './sunrod.css';

type Cat = { t: string; id: string; name: string; p: number; stars?: number };
type Slot = Cat & { depth: number; need: number; h: number; q: number; pct: number; hits?: number; slips?: number };
const GROUPS: { key: string; label: string; ts: string[] }[] = [
  { key: 'r', label: 'Rarities', ts: ['rarity', 'shiny'] },
  { key: 'u', label: 'Ultras', ts: ['ultra', 'ultra_id', 'primordial'] },
  { key: 'e', label: 'Enchanted', ts: ['enchanted', 'kind'] },
];
const colorOf = (c: { t: string; id: string }) =>
  c.t === 'rarity' || c.t === 'ultra_id' ? rarityInfo(c.id).color : c.t === 'shiny' ? '#FF7AE0' : c.t === 'ultra' ? '#FFD23F' : c.t === 'primordial' ? '#B388FF'
    : c.t === 'kind' ? kindInfo(c.id).a : '#B79CFF';
const iconOf = (c: { t: string; id: string }) => (c.t === 'kind' ? kindInfo(c.id).emoji : c.t === 'shiny' ? '✨' : c.t === 'enchanted' ? '🔮' : c.t === 'primordial' ? '🌌' : c.t === 'ultra' ? '🌈' : '◆');
const odds = (p: number) => (p >= 0.01 ? `${(p * 100).toFixed(p >= 0.1 ? 0 : 1)}%` : `1 in ${Math.round(1 / Math.max(p, 1e-9)).toLocaleString()}`);

function Rod({ dip, twitch, color }: { dip: number; twitch: boolean; color: string }) {
  return (
    <motion.svg viewBox="0 0 160 120" className="h-full w-full overflow-visible" aria-hidden
      animate={twitch ? { rotate: [0, -7, 9, -5, 3, 0] } : { rotate: dip * 12 }} transition={twitch ? { duration: 0.7 } : { type: 'spring', stiffness: 60, damping: 12 }} style={{ originX: '80px', originY: '18px' }}>
      <defs><linearGradient id="rod-wood" x1="0" x2="1"><stop offset="0" stopColor="#8A5A2B" /><stop offset="0.5" stopColor="#C68A4C" /><stop offset="1" stopColor="#6B4020" /></linearGradient></defs>
      {/* the hands' fork */}
      <path d="M30 6 Q55 20 80 52 M130 6 Q105 20 80 52" stroke="url(#rod-wood)" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M80 50 L80 104" stroke="url(#rod-wood)" strokeWidth="6" strokeLinecap="round" />
      <path d="M77 70 Q70 74 66 82 M83 86 Q90 88 94 96" stroke="#5E8C3A" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="80" cy="108" r={3 + dip * 4} fill={color} opacity={0.4 + dip * 0.6} className="lv-rod-bead" />
    </motion.svg>
  );
}

export function RodScene({ v, view, act, busy, mirror }: SceneProps) {
  const nav = useNavigate();
  const clip = useCraftClip(v);
  const [group, setGroup] = useState('r');
  const [sel, setSel] = useState<Cat | null>(null);
  const [slot, setSlot] = useState(0);
  const [twitch, setTwitch] = useState(false);
  const [walk, setWalk] = useState<any>(null);
  const [walking, setWalking] = useState(false);
  const targets: Slot[] = view.targets ?? [];
  const cur = targets[slot] ?? targets[0] ?? null;
  const catalog: Cat[] = view.catalog ?? [];
  const dip = cur ? Math.min(1, cur.depth / Math.max(1, cur.need)) : 0;
  const col = cur ? colorOf(cur) : '#7FE0C3';
  const drops = useMemo(() => Array.from({ length: Math.round(dip * 8) }, (_, i) => i), [dip]);

  const tune = async () => {
    if (!sel) return;
    feel('medium');
    const r = await act('tune', { t: sel.t, id: sel.id, slot }, { silent: true });
    if (!r?.result?.tuned) return;
    setTwitch(true); setTimeout(() => setTwitch(false), 750);
    efx.burst({ x: innerWidth / 2, y: innerHeight * 0.35, colors: [colorOf(sel), '#fff'], count: 90, speed: 9, kind: 'spark' });
    setSel(null);
  };
  const doWalk = async () => {
    setWalking(true); feel('medium');
    await sleep(1200);
    const r = await act('walk', {}, { silent: true });
    setWalking(false);
    if (!r?.result) return;
    setWalk(r.result);
    if (r.result.found) {
      setTwitch(true); setTimeout(() => setTwitch(false), 750); feel('heavy');
      const s = r.result.sighting;
      efx.burst({ x: innerWidth / 2, y: innerHeight * 0.4, colors: [rarityInfo(s.rarity === 'enchanted' ? 'epic' : s.rarity).color, '#fff'], count: 160, speed: 12, kind: 'spark' });
      clip({ title: 'The rod twitched', sub: v.nickname || 'Dowsing Rod', emoji: '🪄', payoff: '💧', color: '#7FE0C3', kicker: 'Walking the map…',
        head: 'IT TWITCHED!', lines: ['A spot that reads as its target', 'Claim it within a day'], text: '🪄 My Dowsing Rod twitched over a spot — clip it?' });
    }
  };
  const goClaim = (s: any) => { const [lng, lat] = cellCenter(s.gx, s.gy); useUi.getState().select({ gx: s.gx, gy: s.gy }); toMap(nav, { lng, lat, zoom: 18.6 }); };
  const shown = catalog.filter((c) => GROUPS.find((g) => g.key === group)!.ts.includes(c.t));

  return (
    <div className="grid gap-3">
      <div className="lvx-stage lv-scene lv-rod-stage aspect-[4/3] w-full" data-testid="rod-scene" style={{ ['--vein' as any]: col }}>
        <div className="lv-rod-sky" />
        {/* the earth, cut away: strata, roots, the vein */}
        <div className="lv-rod-earth">
          <i className="s1" /><i className="s2" /><i className="s3" /><i className="s4" />
          <div className="lv-rod-vein" style={{ opacity: cur ? 0.35 + dip * 0.65 : 0.15 }}><span className="lv-rod-veinglow" /></div>
          <div className="lv-rod-well"><span className="lv-rod-water" style={{ transform: `scaleY(${0.08 + dip * 0.92})` }} /></div>
          {drops.map((i) => <span key={i} className="lv-rod-drop" style={{ animationDelay: `${i * 0.35}s` }} />)}
        </div>
        <div className="absolute left-1/2 top-[4%] h-[52%] w-[46%] -translate-x-1/2"><Rod dip={dip} twitch={twitch} color={col} /></div>
        {cur ? (
          <div className="absolute left-3 top-3 z-10 grid gap-0.5 rounded-2xl bg-black/55 px-3 py-2" data-testid="rod-target">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/60">Tuned to</span>
            <span className="font-display text-[17px] font-black leading-none" style={{ color: col, textShadow: `0 0 12px ${col}` }}>{iconOf(cur)} {cur.name}</span>
            <span className="text-[11px] font-bold text-white/70">depth {cur.depth.toLocaleString()} / {cur.need.toLocaleString()}</span>
          </div>
        ) : <div className="absolute inset-x-0 top-[38%] z-10 text-center text-[13px] font-black text-white/80">Untuned — choose what it should find</div>}
        {view.resting && <div className="absolute right-3 top-3 z-10 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-black text-white">💤 Resting — another rod is dowsing</div>}
        <AnimatePresence>
          {walking && <motion.div className="absolute inset-0 z-20 grid place-items-center bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="font-display text-[18px] font-black text-white">🚶 Walking the map…</span></motion.div>}
        </AnimatePresence>
        <div className="lvx-grain" />
      </div>

      {cur && (
        <div className="grid gap-1.5 rounded-2xl bg-white/[0.04] p-3" data-testid="rod-depth">
          <div className="flex items-center justify-between text-[12px] font-black"><span style={{ color: col }}>{Math.round(cur.pct)}% deep</span><span className="text-white/60">{Math.max(0, cur.need - cur.depth).toLocaleString()} rolls to full depth</span></div>
          <div className="lv-rod-bar"><span style={{ transform: `scaleX(${Math.min(1, cur.depth / Math.max(1, cur.need))})`, background: col }} /></div>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-white/70">
            <div><div className="text-[13px] font-black text-white">{odds(cur.p)}</div>naturally</div>
            <div><div className="text-[13px] font-black text-[#FFB3B3]">{odds(cur.q)}</div>tuned (harder)</div>
            <div><div className="text-[13px] font-black text-[#9BF6C8]">100%</div>at full depth</div>
          </div>
          {(cur.hits || cur.slips) ? <div className="text-center text-[11px] font-bold text-white/55">{cur.hits ?? 0} brought up · {cur.slips ?? 0} slipped</div> : null}
          <button className="justify-self-center text-[11px] font-bold text-white/45 underline" disabled={!!busy || !!mirror} onClick={() => void act('untune', { slot })} data-testid="rod-untune">Untune</button>
        </div>
      )}
      {view.slots > 1 && (
        <div className="flex justify-center gap-2" data-testid="rod-slots">{Array.from({ length: view.slots }, (_, i) => (
          <button key={i} className={`rounded-full px-3 py-1 text-[12px] font-black ${slot === i ? 'bg-[#7FE0C3] text-[#04201A]' : 'bg-white/10 text-white'}`} onClick={() => setSlot(i)}>Fork {i + 1}{targets[i] ? ` · ${targets[i].name}` : ''}</button>
        ))}</div>
      )}

      <div className="grid gap-2 rounded-2xl bg-white/[0.04] p-3" data-testid="rod-dial">
        <div className="lvx-label">{cur ? 'Tune it to something else' : 'Tune the rod'}</div>
        <div className="flex gap-1.5">{GROUPS.map((g) => (
          <button key={g.key} className={`flex-1 rounded-full py-1.5 text-[12px] font-black ${group === g.key ? 'bg-white text-[#04201A]' : 'bg-white/10 text-white/80'}`} onClick={() => setGroup(g.key)} data-testid={`rod-group-${g.key}`}>{g.label}</button>
        ))}</div>
        <div className="grid max-h-[260px] grid-cols-2 gap-1.5 overflow-y-auto pr-1">
          {shown.map((c) => {
            const locked = (c.stars ?? 0) > (v.stars ?? 0), on = sel?.t === c.t && sel?.id === c.id, tuned = targets.some((x) => x.t === c.t && x.id === c.id);
            return (
              <button key={`${c.t}:${c.id}`} disabled={locked || Number(c.p) <= 0} onClick={() => setSel(c)} data-testid="rod-pick" data-t={c.t} data-id={c.id}
                className={`lv-rod-pick ${on ? 'on' : ''} ${tuned ? 'tuned' : ''}`} style={{ ['--c' as any]: colorOf(c) }}>
                <span className="text-[15px]" style={{ color: colorOf(c), textShadow: `0 0 10px ${colorOf(c)}` }}>{iconOf(c)}</span>
                <span className="grid min-w-0 text-left leading-tight"><b className="truncate text-[12px]">{c.name}</b><span className="text-[10px] text-white/55">{locked ? `★${c.stars} only` : odds(Number(c.p))}</span></span>
              </button>
            );
          })}
        </div>
        <Button variant="rainbow" onClick={() => void tune()} disabled={!sel || !!busy || !!mirror} data-testid="rod-tune">
          {sel ? `🪄 Tune to ${sel.name}` : 'Pick a target'}
        </Button>
        <p className="text-[11px] text-white/55">Tuned, your chance of rolling it is {sel && ['ultra_id', 'kind', 'primordial'].includes(sel.t) ? 'a third' : 'half'} of the natural one — but every roll that misses pushes the rod deeper, and at full depth it’s certain. Retuning drains the depth{(v.stars ?? 0) >= 2 ? ' (★2 keeps half)' : ''}.</p>
      </div>

      {(v.stars ?? 0) >= 3 && (
        <div className="grid gap-2">
          <Button variant="secondary" onClick={() => void doWalk()} disabled={!view.walk_ready || !!busy || !!mirror || walking} data-testid="rod-walk">
            {view.walk_ready ? '🚶 Divining Walk — let it find a spot' : '🚶 It walked today'}</Button>
          {walk && (walk.found ? (
            <div className="flex items-center gap-2 rounded-2xl bg-[#7FE0C3]/15 p-2.5" data-testid="rod-walk-found">
              <span className="text-[22px]">💧</span><span className="flex-1 text-[12.5px] font-black">It twitched over a spot that reads <b style={{ color: rarityInfo(walk.sighting.rarity === 'enchanted' ? 'epic' : walk.sighting.rarity).color }}>{walk.sighting.rarity === 'enchanted' ? 'Enchanted' : rarityInfo(walk.sighting.rarity).name}</b>.</span>
              <Button size="sm" onClick={() => goClaim(walk.sighting)}>Claim →</Button>
            </div>
          ) : <div className="text-center text-[12px] font-bold text-white/60">It walked {walk.walked} spots and found nothing today.</div>)}
        </div>
      )}
      {view.last && (
        <div className="rounded-2xl bg-white/[0.04] px-3 py-2 text-center text-[12px] font-bold text-white/75" data-testid="rod-last">
          {view.last.result === 'slip' ? `🫗 It held back a ${view.last.name} — ${Math.round(100 * view.last.depth / Math.max(1, view.last.need))}% deep now` : `💧 Dowsed: ${view.last.name}${view.last.result === 'forced' ? ' (full depth)' : ''}`}
        </div>
      )}
    </div>
  );
}

