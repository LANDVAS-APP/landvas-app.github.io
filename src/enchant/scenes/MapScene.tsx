// 🗺️ The Treasure Map: old parchment torn in four. Each missing piece is a clue — whose plot it's on, how far, which
// way — with a compass needle and your explorer's distance. Walk there and pick it up; the pieces snap into place; an X
// burns through; stand on it and dig (five swings) until the chest bursts open.
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toMap } from '../../lib/toMap';
import { cn, fmt } from '../../lib/utils';
import { cellCenter } from '../../shared/grid';
import { rarityInfo } from '../../shared/rarity';
import { Button } from '../../ui';
import { centerOf, efx, useLeft, type SceneProps } from '../core';
import { dur } from '../kinds';

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const dir = (b: number) => DIRS[Math.round(((b % 360) + 360) % 360 / 45) % 8];
const km = (m: number | null | undefined) => (m == null ? '?' : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

export function MapScene({ view, act, busy, at }: SceneProps) {
  const nav = useNavigate();
  const chest = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState<any>(null);
  const nextIn = useLeft(view.next_in, at);
  const pieces: any[] = view.pieces ?? [];
  const fly = (gx: number, gy: number) => { const [lng, lat] = cellCenter(gx, gy); toMap(nav, { lng, lat, zoom: 18.5 }); };
  const collect = async (i: number, el: Element | null) => {
    const r = await act('collect', { i });
    if (r) efx.burst({ ...centerOf(el), colors: ['#E9C46A', '#8B5E34', '#fff'], count: 50, speed: 9, kind: 'glitter' });
    if (r?.result?.x) efx.burst({ ...centerOf(chest.current), colors: ['#FF2E2E', '#FFD23F', '#fff'], count: 120, speed: 12, kind: 'spark' });
  };
  const dig = async () => {
    efx.burst({ ...centerOf(chest.current), colors: ['#6B4423', '#8B5E34', '#3D2614'], count: 26, speed: 8, kind: 'drop', gravity: 0.4 });
    const r = await act('dig', {}, { at: centerOf(chest.current) });
    if (r?.result?.chest) { setOpened(r.result); efx.burst({ ...centerOf(chest.current), colors: ['#FFD23F', '#fff'], count: 30, speed: 11, kind: 'emoji', emojis: ['💰', '💎', '🪙'] }); }
  };
  return (
    <div className="grid gap-3">
      <div className="lv-scene aspect-[4/3] w-full p-3" style={{ background: 'radial-gradient(circle at 50% 40%,#3A2614,#1C1108)' }} data-testid="map-scene">
        {/* the parchment */}
        <div ref={chest} className="relative mx-auto grid aspect-[4/3] h-full grid-cols-2 grid-rows-2 gap-[3px] p-[3px]" style={{ filter: 'drop-shadow(0 12px 18px rgba(0,0,0,0.6))' }}>
          {[0, 1, 2, 3].map((i) => {
            const p = pieces[i]; const found = !!p?.found_at;
            return (
              <motion.div key={i} className={cn('relative overflow-hidden', ['rounded-tl-xl', 'rounded-tr-xl', 'rounded-bl-xl', 'rounded-br-xl'][i])}
                style={{ background: found ? 'linear-gradient(135deg,#F4E2B8,#E2C48C)' : 'repeating-linear-gradient(45deg,rgba(244,226,184,0.08) 0 6px,transparent 6px 12px)', border: found ? 'none' : '2px dashed rgba(244,226,184,0.35)' }}
                animate={found ? { scale: [1.15, 1], rotate: [i % 2 ? 6 : -6, 0] } : {}} transition={{ type: 'spring', stiffness: 300, damping: 14 }}>
                {found && <svg viewBox="0 0 100 75" className="absolute inset-0 h-full w-full opacity-70" aria-hidden>
                  <path d={['M10 60 Q30 40 50 50 T95 30', 'M5 30 Q40 10 60 35 T98 50', 'M2 10 Q35 30 55 20 T90 60', 'M8 45 Q40 70 70 40 T98 20'][i]} stroke="#8B5E34" strokeWidth="1.5" strokeDasharray="4 3" fill="none" />
                  <text x={20 + i * 10} y={30 + (i % 2) * 20} fontSize="12">{['🌲', '⛰️', '🌊', '🏝️'][i]}</text></svg>}
                {!found && p && <div className="absolute inset-0 grid place-items-center text-center text-[10px] font-black text-[#F4E2B8]/70">piece {i + 1}<br />missing</div>}
              </motion.div>
            );
          })}
          {view.x && (
            <motion.div className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center" initial={{ scale: 3, opacity: 0, rotate: -40 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 10 }}>
              <span className="font-display text-[72px] font-black leading-none text-[#C0261F] drop-shadow-[0_0_14px_#FF5A3D]">✕</span>
              <span className="rounded-full bg-[#2B1A08]/80 px-2 py-0.5 text-[11px] font-black text-[#F4E2B8]">{km(view.x.m)} {dir(view.x.bearing)} · you’re {km(view.x.dist)} away</span>
            </motion.div>
          )}
          {!pieces.length && (
            <div className="absolute inset-0 grid place-items-center text-center">
              <div className="grid gap-2">
                <span className="text-5xl">🗺️</span>
                <span className="font-display text-lg font-black text-[#F4E2B8]">{view.can_draw ? 'A blank map, waiting for ink' : `The next map appears in ${dur(nextIn)}`}</span>
              </div>
            </div>
          )}
        </div>
        <AnimatePresence>
          {opened && (
            <motion.button key="c" onClick={() => setOpened(null)} className="absolute inset-0 grid place-items-center bg-black/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="map-chest">
              <motion.div className="grid justify-items-center gap-2" initial={{ y: 60, scale: 0.4 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 12 }}>
                <span className="text-7xl">🧰</span>
                <span className="font-display text-2xl font-black text-[#FFD23F]">Treasure!</span>
                <span className="text-sm font-bold text-white/85">+{fmt(opened.pay?.paid ?? 0)} Ink{opened.ticket ? ` · a ${rarityInfo(opened.ticket).name}+ roll ticket!` : ''}</span>
              </motion.div>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {view.can_draw && <Button variant="rainbow" onClick={() => void act('draw')} loading={busy === 'draw'} data-testid="map-draw">🖋️ Draw a treasure map</Button>}
      {view.x && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => fly(view.x.gx, view.x.gy)}>📍 Go to the X</Button>
          <Button variant="rainbow" onClick={() => void dig()} disabled={!!busy || view.x.dist == null || view.x.dist > view.dig_m} data-testid="map-dig">
            ⛏️ Dig {view.dug}/5{view.x.dist != null && view.x.dist > view.dig_m ? ` · ${km(view.x.dist)} away` : ''}
          </Button>
        </div>
      )}
      {pieces.length > 0 && !view.x && (
        <div className="grid gap-1.5" data-testid="map-pieces">
          {pieces.map((p, i) => {
            const near = p.dist != null && p.dist <= view.reach_m;
            return (
              <div key={i} className={cn('flex items-center gap-2.5 rounded-2xl border p-2.5', p.found_at ? 'border-[#E9C46A]/30 bg-[#E9C46A]/10' : near ? 'border-[#3DDC97]/60 bg-[#3DDC97]/10' : 'border-white/10 bg-white/[0.04]')}>
                <motion.span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#2B1A08] text-lg" animate={{ rotate: p.bearing }} transition={{ type: 'spring', stiffness: 80 }}>{p.found_at ? '✅' : '🧭'}</motion.span>
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate text-[13px] font-black">{p.found_at ? `Piece ${i + 1} found` : p.wild ? `Piece ${i + 1} · buried in the wild` : <>Piece {i + 1} · on <b>@{p.owner_name}</b>’s <span style={{ color: rarityInfo(p.rarity).color }}>{rarityInfo(p.rarity).name}</span> plot</>}</span>
                  <span className="text-[11px] text-white/55">{km(p.m)} {dir(p.bearing)} of your plot{!p.found_at ? ` · you’re ${km(p.dist)} away` : ''}</span>
                </span>
                {!p.found_at && (near
                  ? <Button size="sm" variant="rainbow" disabled={!!busy} onClick={(e) => void collect(i, e.currentTarget)} data-testid={`map-collect-${i}`}>Pick up</Button>
                  : <Button size="sm" variant="secondary" onClick={() => fly(p.gx, p.gy)}>Show</Button>)}
              </div>
            );
          })}
          {view.found === 0 && !view.redrawn && <button className="text-[11px] font-bold text-white/50 underline" onClick={() => void act('redraw')}>Pieces too far? Redraw the map once</button>}
        </div>
      )}
      <p className="text-center text-[11px] text-white/55">Walk your explorer within {view.reach_m} m of a piece to pick it up. {view.maps} chest{view.maps === 1 ? '' : 's'} dug up.</p>
    </div>
  );
}
