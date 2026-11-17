// 🦢 Origami Pocket: a lamp-lit desk and a stitched pocket. Pick one of your plots and the paper — printed with the plot —
// folds itself into a crane (a boat, a frog, a lotus as it grows) in real 3D, flaps, and dives into the pocket. Take it
// out and unfold it on the map: pick a free spot you could claim and the crane flies out of the pocket, opens back up
// fold by fold and lands flat, its creases still glowing. It keeps its rarity, shine, type, level, game progress and
// name; the spot it left takes the rarity the new one would have had. While it's in the pocket it goes where you go: on
// real GPS its powers work from where you stand (a Kraken counts the neighbours around you, a Glacier freezes round you,
// an enchanted plot's creature works from there). ★5 folds a whole merged canvas.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toMap } from '../../lib/toMap';
import { useUi } from '../../lib/store';
import { PLOT_TYPES } from '../../map/plotStyle';
import { cellCenter } from '../../shared/grid';
import { rarityInfo } from '../../shared/rarity';
import { Button } from '../../ui';
import { centerOf, efx, useLeft, type SceneProps } from '../core';
import { PlotRow, RarityChip, plotName, sleep, useCraftClip, useSpotPick, type PlotLite } from '../craft';
import { dur } from '../kinds';
import { MapPickButton, usePlotChoice } from '../pickers';
import { getBackend } from '../../backend/backend';
import { feel } from '../living';
import type { FoldScene, FoldShape } from '../origami3d';

const SHAPE: Record<FoldShape, { emoji: string; name: string }> = {
  crane: { emoji: '🕊️', name: 'paper crane' }, boat: { emoji: '⛵', name: 'paper boat' }, frog: { emoji: '🐸', name: 'paper frog' }, lotus: { emoji: '🪷', name: 'paper lotus' },
};
const colorsOf = (p: PlotLite) => {
  if (p.rarity === 'enchanted') return ['#B79CFF', '#5B2BFF'];
  const r = rarityInfo(p.rarity), t = (PLOT_TYPES as Record<string, { a: string; b: string }>)[p.plot_type ?? ''];
  return [r.color, t?.b ?? '#2A1420'];
};

export function OrigamiScene({ v, view, act, busy, at, mirror }: SceneProps) {
  const nav = useNavigate();
  const cv = useRef<HTMLCanvasElement>(null);
  const pocketRef = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const eng = useRef<FoldScene | null>(null);
  const clip = useCraftClip(v);
  const spot = useSpotPick(v, 'unfold');
  const [sel, setSel] = useState<PlotLite | null>(null);
  const [phase, setPhase] = useState<'idle' | 'folding' | 'unfolding' | 'landed'>('idle');
  const [landed, setLanded] = useState<any>(null);
  const reduce = useUi((s) => s.settings.reduceMotion);
  const nextIn = useLeft(view.next_in, at);
  const shape: FoldShape = (view.shape as FoldShape) ?? 'crane';
  const pocket: PlotLite[] = view.pocket_plots ?? [];
  const plots: PlotLite[] = view.plots ?? [];
  const folds = Number(view.folds ?? 0);
  const foldPick = usePlotChoice(v, 'fold', plots, (p) => setSel(p), { title: 'Fold a plot', emoji: '🦢', color: '#FF6F91', hint: 'Tap one of your plots in crosshairs to fold it' });

  // the paper, made for a plot
  const paper = async (p: PlotLite) => {
    eng.current?.destroy(); eng.current = null;
    const { createFold } = await import('../origami3d');
    if (!cv.current) return null;
    const [c1, c2] = colorsOf(p);
    const art = (p as any).art_path ? await getBackend().publicAssetUrl((p as any).art_path).catch(() => null) : null;
    if (!cv.current) return null;
    eng.current = createFold({ canvas: cv.current, color: c1, color2: c2, label: plotName(p), emoji: p.kind ? '🔮' : '▦', shape, shiny: p.shiny, reduceMotion: reduce, image: art });
    return eng.current;
  };
  useEffect(() => () => { eng.current?.destroy(); eng.current = null; }, []);
  useEffect(() => { const r = () => eng.current?.resize(); addEventListener('resize', r); return () => removeEventListener('resize', r); }, []);
  // a plot you pick: its paper lies flat, ready
  useEffect(() => { if (sel && phase === 'idle') void paper(sel).then((e) => e?.set(false)); }, [sel?.gx, sel?.gy]); // eslint-disable-line react-hooks/exhaustive-deps

  const pocketPoint = () => {
    const r = cv.current?.getBoundingClientRect(), pr = pocketRef.current?.getBoundingClientRect();
    if (!r || !pr) return { x: 0, y: 0 };
    return { x: pr.left + pr.width / 2 - r.left, y: pr.top + pr.height * 0.25 - r.top };
  };

  const carry = view.carry as { live: boolean; gps_at: string | null; mode: string | null; plots: { gx: number; gy: number; rarity: string; at: [number, number] | null; power: any }[]; km: number; grace_m: number } | undefined;
  const groups = (view.groups ?? {}) as Record<string, { id: string; n: number; w: number; h: number }>;
  const groupOf = (p: { gx: number; gy: number }) => groups[`${p.gx}:${p.gy}`];
  const powerLine = (c: { rarity: string; power: any }) => {
    const w = c.power?.what;
    if (w === 'kraken') return `🐙 Kraken ×${Number(c.power.x).toFixed(2)} where you stand`;
    if (w === 'chaos') return `🌀 Chaos ×${Number(c.power.x).toFixed(2)} here today`;
    if (w === 'enchanted') return `🔮 its ${c.power.kind ?? 'creature'} works from where you are`;
    if (w === 'glacier') return '🧊 freezing the plots around you';
    if (w === 'throne_ink') return '👑 ruling around you';
    if (w === 'leyline' || w === 'compass_rose') return '⚡ beaming from you';
    if (w === 'lodestone') return '🧲 drawing loot to you';
    if (w === 'volcano' || w === 'krakatoa') return '🌋 its next eruption is around you';
    if (w === 'world_tree' || w === 'elder_tree') return '🌳 rooting around you';
    if (w === 'mycelium') return '🍄 spreading from you';
    if (w === 'hive') return '🐝 pollinating around you';
    if (w) return `✨ its ${String(w).replace(/_/g, ' ')} works from where you are`;
    return 'its rent and everything it does, from here';
  };

  const doFold = async () => {
    if (!sel || mirror) return;
    const r = await act('fold', { gx: sel.gx, gy: sel.gy }, { silent: true });
    if (!r?.result?.folded) return;
    setPhase('folding'); feel('medium');
    const e = eng.current ?? (await paper(sel));
    if (e) {
      await e.fold();
      efx.burst({ ...centerOf(stage.current), colors: ['#FFF3E0', '#FF6F91', '#fff'], count: 50, speed: 7, kind: 'glitter' });
      await sleep(reduce ? 0 : 700);
      const pp = pocketPoint();
      await e.flyTo(pp.x, pp.y);
      efx.burst({ ...centerOf(pocketRef.current), colors: ['#FF6F91', '#FFF3E0'], count: 40, speed: 6, kind: 'spark' });
      feel('success');
    }
    setSel(null); setPhase('idle');
  };

  const pickSpot = (p: PlotLite) => {
    const reachM = view.far_m ? Number(view.far_m) : Math.max(25, Number(view.reach_cells ?? 6) * 6.5);
    const anchors: [number, number][] = view.explorer ? [[view.explorer[0], view.explorer[1]]] : [];
    spot.start({ title: `Unfold ${plotName(p)}`, emoji: '🦢', color: '#FF6F91', anchors, radiusM: view.gated ? reachM : null, use: 'Unfold here',
      hint: view.gated ? (view.far_m ? 'Tap a free spot up to 50 km from your explorer' : 'Tap a free spot right where your explorer is') : 'Tap any free spot', keep: { gx: p.gx, gy: p.gy } });
  };
  // back from the map with a spot: it flies out of the pocket and opens up
  useEffect(() => {
    if (!spot.done) return;
    const to = spot.done.plot, from = spot.done.keep as { gx: number; gy: number } | undefined;
    spot.clear();
    if (!from) return;
    const p = pocket.find((x) => x.gx === from.gx && x.gy === from.gy);
    void (async () => {
      const r = await act('unfold', { gx: from.gx, gy: from.gy, to_gx: to.gx, to_gy: to.gy }, { silent: true });
      if (!r?.result?.to) return;
      setPhase('unfolding'); feel('medium');
      const e = await paper(r.result.plot ?? p ?? { ...from, rarity: r.result.rarity });
      if (e) {
        const pp = pocketPoint();
        await e.flyFrom(pp.x, pp.y);
        await sleep(reduce ? 0 : 300);
        await e.unfold();
      }
      setLanded(r.result); setPhase('landed'); feel('success');
      efx.burst({ ...centerOf(stage.current), colors: ['#FFF3E0', '#FF6F91', '#FFD23F', '#fff'], count: 160, speed: 12, kind: 'spark' });
      if (r.result.pay?.paid) efx.pay(r.result.pay, 'origami', centerOf(stage.current));
      clip({ title: `Unfolded ${r.result.km} km away`, sub: plotName(r.result.plot ?? { gx: to.gx, gy: to.gy, rarity: r.result.rarity }), emoji: '🦢', payoff: '🗺️', color: '#FF6F91',
        kicker: 'Folding the map…', head: 'UNFOLDED!', lines: [`A ${rarityInfo(r.result.rarity).name} plot flew ${r.result.km} km`, 'The Origami Pocket'],
        text: `🦢 Unfolded ${r.result.km} km away — clip the crane?` });
    })();
  }, [spot.done]); // eslint-disable-line react-hooks/exhaustive-deps

  const watch = (gx: number, gy: number) => { const [lng, lat] = cellCenter(gx, gy); useUi.getState().select({ gx, gy }); toMap(nav, { lng, lat, zoom: 18.4 }); };
  const busyAnim = phase === 'folding' || phase === 'unfolding';
  return (
    <div className="grid gap-3">
      <div ref={stage} className="lvx-stage lv-scene aspect-[4/3] w-full" data-testid="origami-scene">
        <div className="lvx-desk" />
        {/* the lamp's pool of light */}
        <div className="absolute left-1/2 top-[-20%] h-[90%] w-[90%] -translate-x-1/2 rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,226,180,0.22), transparent 65%)' }} />
        <canvas ref={cv} className="lvx-fold-canvas" />
        {!sel && phase === 'idle' && (
          <div className="pointer-events-none absolute inset-x-0 top-[18%] grid justify-items-center gap-1 text-center">
            <motion.span className="text-[54px]" animate={reduce ? undefined : { y: [0, -6, 0], rotate: [-4, 4, -4] }} transition={{ repeat: Infinity, duration: 3.4, ease: 'easeInOut' }}>{SHAPE[shape].emoji}</motion.span>
            <span className="text-[12px] font-bold text-white/70">Pick a plot to fold into a {SHAPE[shape].name}</span>
          </div>
        )}
        {/* the pocket, with what's in it peeking out */}
        <motion.div ref={pocketRef} className="lvx-pocket" data-testid="origami-pocket" key={`pocket-${pocket.length}`}
          initial={reduce ? false : { scaleX: 1.14, scaleY: 0.9 }} animate={{ scaleX: 1, scaleY: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 9 }}>
          <div className="lvx-pocket-back" />
          {pocket.map((p, i) => (
            <motion.div key={`${p.gx},${p.gy}`} className="lvx-crane-slot text-[26px]" style={{ left: `${18 + i * 26}%` }} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1, rotate: [-6, 6][i % 2] }}>
              <span style={{ filter: `drop-shadow(0 0 6px ${colorsOf(p)[0]})` }}>{SHAPE[shape].emoji}</span>
            </motion.div>
          ))}
          <div className="lvx-pocket-front grid place-items-center"><span className="mt-[18%] text-[11px] font-black text-[#FFD1DC]">{pocket.length}/{view.pocket_max} folded</span></div>
        </motion.div>
        <div className="absolute left-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[12px] font-black text-[#FFD1DC]" data-testid="origami-folds">
          🦢 {folds}/{view.max} folds{folds < Number(view.max) && nextIn != null ? ` · +1 in ${dur(nextIn)}` : ''}
        </div>
        <AnimatePresence>
          {phase === 'landed' && landed && (
            <motion.div className="absolute inset-x-4 bottom-4 grid gap-1 rounded-2xl bg-[#FFF3E0] p-3 text-[#2A1420] shadow-2xl" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} data-testid="origami-landed">
              <div className="font-display text-[18px] font-black">Unfolded {landed.km} km away ✨</div>
              <div className="text-[12px] font-semibold">Its old spot went back to the world. A fresh crease: +25% minigame Ink there for a day.</div>
              <div className="flex gap-2"><Button size="sm" onClick={() => watch(landed.to[0], landed.to[1])}>See it on the map</Button><Button size="sm" variant="ghost" onClick={() => { setPhase('idle'); setLanded(null); eng.current?.destroy(); eng.current = null; }}>Done</Button></div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="lvx-grain" />
      </div>

      {pocket.length > 0 && carry && (
        <div className={`grid gap-1.5 rounded-2xl p-3 ${carry.live ? 'bg-[#3DDC97]/10 ring-1 ring-[#3DDC97]/40' : 'bg-white/[0.04]'}`} data-testid="origami-carry" data-live={carry.live}>
          <div className="flex items-center gap-2 text-[13px] font-black">
            <span className={carry.live ? 'text-[#3DDC97]' : 'text-white/60'}>{carry.live ? '🎒 Carrying — live on your GPS' : '🎒 Resting where it was folded'}</span>
            {carry.km > 0 && <span className="ml-auto text-[11px] font-bold text-white/55" data-testid="origami-carry-km">{carry.km.toFixed(2)} km carried</span>}
          </div>
          {carry.live ? carry.plots.map((c) => (
            <div key={`${c.gx}:${c.gy}`} className="flex items-center gap-2 text-[12px]" data-testid="origami-carry-plot"><RarityChip r={c.rarity} /><span className="text-white/80">{powerLine(c)}</span></div>
          )) : <p className="text-[11.5px] text-white/60">Folded plots go where you go on real GPS: their powers work from where you stand. {carry.mode && carry.mode !== 'gps' ? 'Your explorer isn’t on GPS right now.' : `No GPS fix in the last ${carry.grace_m} minutes.`}</p>}
        </div>
      )}

      {pocket.length > 0 && (
        <div className="grid gap-2" data-testid="origami-pocket-list">
          <div className="lvx-label">In your pocket — still yours, still earning</div>
          {pocket.map((p) => (
            <div key={`${p.gx},${p.gy}`} className="lvx-paper-card flex items-center gap-3 p-3">
              <span className="text-[28px]">{SHAPE[shape].emoji}</span>
              <span className="grid min-w-0 flex-1 leading-tight"><span className="truncate text-[14px] font-black">{plotName(p)}</span><span className="flex items-center gap-1.5 text-[11px]"><RarityChip r={p.rarity} />{p.shiny && '✨'}{p.level ? ` level ${p.level}` : ''}{groupOf(p) ? ` · 🏯 a ${groupOf(p).n}-plot canvas (${groupOf(p).w}×${groupOf(p).h})` : ''}</span></span>
              <div className="relative z-[1] grid gap-1">
                <Button size="sm" variant="rainbow" onClick={() => pickSpot(p)} disabled={!!busy || busyAnim || !!mirror} data-testid="origami-unfold">Unfold →</Button>
                <button className="text-[11px] font-bold text-[#6A2C4B] underline" onClick={() => void act('smooth', { gx: p.gx, gy: p.gy })} disabled={!!busy} data-testid="origami-smooth">smooth it out here</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-2">
        <div className="flex items-center justify-between"><div className="lvx-label">Fold one of your plots{view.grand ? ' — or a whole merged canvas' : ''}</div>{sel && <button className="text-[11px] font-bold text-white/60" onClick={() => { setSel(null); eng.current?.destroy(); eng.current = null; }}>clear</button>}</div>
        {/* the map first: tap any plot of yours */}
        {foldPick.canMap && !sel && <MapPickButton onClick={foldPick.toMap} testId="origami-fold-map" label="Pick the plot to fold on the map" className="w-full justify-center py-2.5 text-[13px]" />}
        {sel ? (
          <Button variant="rainbow" size="lg" onClick={() => void doFold()} disabled={!!busy || busyAnim || folds < 1 || Number(view.pocket) >= Number(view.pocket_max)} data-testid="origami-fold">
            {Number(view.pocket) >= Number(view.pocket_max) ? 'Your pocket is full' : folds < 1 ? `No folds · +1 in ${dur(nextIn)}` : groupOf(sel) ? `🏯 Fold the whole canvas (${groupOf(sel).n} plots)` : `🦢 Fold ${plotName(sel)}`}
          </Button>
        ) : null}
        <div className="grid max-h-[260px] gap-1.5 overflow-y-auto pr-1" data-testid="origami-plots">
          {plots.length ? plots.slice(0, 40).map((p) => (
            <PlotRow key={`${p.gx},${p.gy}`} p={p} on={sel?.gx === p.gx && sel?.gy === p.gy} onClick={() => setSel(p)} testId="origami-plot" />
          )) : <p className="text-[12px] text-white/60">None of your plots can be folded right now (Crowns never fold; merged canvases fold whole at ★5).</p>}
        </div>
      </div>
      <p className="text-center text-[11px] text-white/55">It keeps its rarity, shine, type, level, game progress, name and drawing. In your pocket it goes where you go — on real GPS its powers work from where you stand. The spot it leaves takes the roll the new spot would have had.</p>
    </div>
  );
}
