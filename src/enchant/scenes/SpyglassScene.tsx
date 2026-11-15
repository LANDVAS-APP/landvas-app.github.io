// 🔭 Spyglass: a brass telescope on a night hill. Take a look and it hands over to the map — the reach glows in rings —
// you tap an unclaimed spot, and back here the telescope racks out, the lens fogs, clears, and the reading floods in in
// its rarity's light. Each reading is a roll made for you alone (kept on the server): claim the plot within a day and
// that's your roll. Legendary-or-better readings ring out with rays and a clip.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toMap } from '../../lib/toMap';
import { useUi } from '../../lib/store';
import { cellCenter } from '../../shared/grid';
import { rarityInfo } from '../../shared/rarity';
import { Button } from '../../ui';
import { centerOf, efx, useLeft, type SceneProps } from '../core';
import { RarityChip, grand, sleep, useCraftClip, useSpotPick } from '../craft';
import { dur, kindInfo } from '../kinds';
import { feel } from '../living';

const STARS = Array.from({ length: 46 }, (_, i) => ({ x: (i * 37.7) % 100, y: (i * 61.3) % 62, d: (i % 7) * 0.4, s: i % 5 === 0 ? 3 : 2 }));

function readingColor(r: string) { return r === 'enchanted' ? '#B79CFF' : rarityInfo(r).color; }
/** an Enchanted reading only stirs (what it is waits for the claim); a Crown reading is the rarest sight there is */
function readingName(r: string, kind?: string | null) {
  if (r === 'enchanted') return kind ? `Enchanted · ${kindInfo(kind).name}` : '✨ Something stirs';
  if (r.startsWith('crown')) return `👑 ${rarityInfo(r).name}`;
  return rarityInfo(r).name;
}

function Telescope({ out, aim }: { out: number; aim: number }) {
  // three brass tubes that rack out as it looks
  return (
    <svg viewBox="0 0 220 140" className="h-full w-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="spy-brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE39A" /><stop offset="0.45" stopColor="#C8962E" /><stop offset="1" stopColor="#6B4A12" /></linearGradient>
        <linearGradient id="spy-leather" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6B3B20" /><stop offset="1" stopColor="#2E170A" /></linearGradient>
      </defs>
      {/* the tripod */}
      <path d="M58 92 L30 138 M58 92 L60 138 M58 92 L88 138" stroke="#3A2410" strokeWidth="5" strokeLinecap="round" />
      <circle cx="58" cy="90" r="7" fill="url(#spy-brass)" />
      <motion.g style={{ originX: '58px', originY: '90px' }} animate={{ rotate: -18 - aim * 6 }} transition={{ type: 'spring', stiffness: 60, damping: 14 }}>
        <rect x="18" y="80" width="62" height="20" rx="5" fill="url(#spy-leather)" stroke="#1A0C04" strokeWidth="1.5" />
        <rect x="14" y="78" width="8" height="24" rx="2" fill="url(#spy-brass)" />
        <motion.g animate={{ x: out * 34 }} transition={{ type: 'spring', stiffness: 90, damping: 13 }}>
          <rect x="74" y="82.5" width="48" height="15" rx="3" fill="url(#spy-brass)" stroke="#5C3E0C" strokeWidth="1" />
          <rect x="76" y="84" width="44" height="3" rx="1.5" fill="#FFF2C4" opacity="0.6" />
        </motion.g>
        <motion.g animate={{ x: out * 66 }} transition={{ type: 'spring', stiffness: 80, damping: 12, delay: 0.08 }}>
          <rect x="112" y="84.5" width="40" height="11" rx="2.5" fill="url(#spy-brass)" stroke="#5C3E0C" strokeWidth="1" />
          <rect x="150" y="82" width="10" height="16" rx="3" fill="url(#spy-brass)" stroke="#5C3E0C" strokeWidth="1" />
          <ellipse cx="160" cy="90" rx="2.5" ry="7" fill="#8EC5FF" opacity="0.9" />
        </motion.g>
      </motion.g>
    </svg>
  );
}

export function SpyglassScene({ v, view, act, busy, at, mirror }: SceneProps) {
  const nav = useNavigate();
  const lens = useRef<HTMLDivElement>(null);
  const clip = useCraftClip(v);
  const spot = useSpotPick(v, 'look');
  const [phase, setPhase] = useState<'idle' | 'racking' | 'clearing' | 'shown'>('idle');
  const [shown, setShown] = useState<any>(null);
  const nextIn = useLeft(view.next_in, at);
  const sightings: any[] = view.sightings ?? [];
  const looks = Number(view.looks ?? 0), max = Number(view.max ?? 3);
  const anchors = useMemo(() => {
    const a: [number, number][] = [];
    if (view.explorer) a.push([view.explorer[0], view.explorer[1]]);
    a.push([v.gx, v.gy]);
    for (const s of sightings) a.push([s.gx, s.gy]);
    return a.slice(0, 2);
  }, [view.explorer, v.gx, v.gy]); // eslint-disable-line react-hooks/exhaustive-deps

  const look = async (gx: number, gy: number) => {
    setPhase('racking'); setShown(null); feel('medium');
    await sleep(650);
    const r = await act('look', { gx, gy }, { silent: true });
    if (!r?.result?.sighting) { setPhase('idle'); return; }
    setPhase('clearing');
    await sleep(900);
    const s = r.result.sighting;
    setShown(s); setPhase('shown');
    const c = readingColor(s.rarity), at2 = centerOf(lens.current);
    feel(grand(s.rarity) ? 'heavy' : 'success');
    efx.burst({ ...at2, colors: [c, '#fff', '#FFE8A3'], count: grand(s.rarity) ? 260 : 90, speed: grand(s.rarity) ? 16 : 9, kind: 'spark' });
    if (grand(s.rarity) || s.rarity === 'enchanted') {
      efx.burst({ ...at2, colors: [c], count: 24, speed: 9, kind: 'emoji', emojis: ['🔭', '✨', '⭐'] });
      clip({ title: `A ${readingName(s.rarity, s.kind)} sighting`, sub: v.nickname || 'Spyglass', emoji: '🔭', payoff: s.rarity === 'enchanted' ? '🔮' : '🌟', color: c,
        kicker: 'Looking through the glass…', head: `${readingName(s.rarity).toUpperCase()}!`, lines: ['Seen through the Spyglass — a reading for one', 'Claim it within a day and it’s yours'],
        text: `🔭 A ${readingName(s.rarity, s.kind)} — claim it before the reading fades!` });
    }
  };
  // back from the map with a spot
  useEffect(() => {
    if (!spot.done) return;
    const { gx, gy } = spot.done.plot;
    spot.clear();
    void look(gx, gy);
  }, [spot.done]); // eslint-disable-line react-hooks/exhaustive-deps

  const startLook = () => {
    if (mirror) return;
    spot.start({ title: 'Look through the Spyglass', emoji: '🔭', color: '#F4C95D', anchors, radiusM: Number(view.range_m ?? 1000), use: 'Look here',
      hint: `Tap an unclaimed spot within ${Math.round(Number(view.range_m ?? 1000) / 100) / 10} km of your explorer or any of your plots` });
  };
  const claim = (s: any) => { const [lng, lat] = cellCenter(s.gx, s.gy); useUi.getState().select({ gx: s.gx, gy: s.gy }); toMap(nav, { lng, lat, zoom: 18.6 }); };
  const second = async (s: any) => {
    setPhase('clearing'); feel('medium');
    const r = await act('second', { id: s.id }, { silent: true });
    await sleep(800);
    setPhase('shown');
    if (r?.result) { setShown(r.result.sighting); efx.burst({ ...centerOf(lens.current), colors: [readingColor(r.result.sighting.rarity), '#fff'], count: r.result.better ? 200 : 60, speed: 11, kind: 'spark' }); }
  };

  const c = shown ? readingColor(shown.rarity) : '#8EC5FF';
  return (
    <div className="grid gap-3">
      <div className="lvx-stage lv-scene aspect-[4/3] w-full" data-testid="spyglass-scene">
        <div className="lvx-scope-sky" />
        {STARS.map((s, i) => <span key={i} className="lvx-star" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animationDelay: `${s.d}s` }} />)}
        {/* the hill and the telescope */}
        <svg className="absolute inset-x-0 bottom-0 h-[32%] w-full" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden><path d="M0 18 Q25 6 52 14 T100 10 L100 30 L0 30 Z" fill="#0A1124" /><path d="M0 24 Q30 15 60 22 T100 20 L100 30 L0 30 Z" fill="#060B18" /></svg>
        <div className="absolute bottom-[8%] left-[2%] h-[62%] w-[62%]"><Telescope out={phase === 'idle' ? 0.15 : 1} aim={phase === 'idle' ? 0 : 1} /></div>
        {/* the lens: what it sees */}
        <div ref={lens} className="lvx-lens right-[6%] top-[10%] aspect-square w-[42%]" style={{ background: phase === 'shown' ? `radial-gradient(circle, ${c}, #0B0820 78%)` : 'radial-gradient(circle,#2A3F6B,#070B18 80%)' }} data-testid="spyglass-lens">
          <AnimatePresence>{phase !== 'shown' && <motion.div className="lvx-lens-fog" initial={{ opacity: 0.9 }} animate={{ opacity: phase === 'clearing' ? 0.2 : 0.9 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }} />}</AnimatePresence>
          {phase === 'idle' && <div className="lvx-sweep" />}
          <div className="lvx-reticle" />
          <AnimatePresence>
            {phase === 'shown' && shown && (
              <motion.div key={shown.id} className="absolute inset-0 grid place-items-center text-center" initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }}>
                {grand(shown.rarity) && <motion.div className="absolute inset-[-30%]" style={{ background: `repeating-conic-gradient(from 0deg, ${c}55 0 8deg, transparent 8deg 20deg)` }} initial={{ rotate: 0 }} animate={{ rotate: 40 }} transition={{ duration: 6, ease: 'linear' }} />}
                <div className="relative grid gap-0.5">
                  <span className="text-[34px] leading-none">{shown.rarity === 'enchanted' ? kindInfo(shown.kind).emoji : '✦'}</span>
                  <span className="font-display text-[19px] font-black leading-none text-white" style={{ textShadow: `0 0 18px ${c}, 0 2px 0 #000` }} data-testid="spyglass-reading">{readingName(shown.rarity, shown.kind)}</span>
                  {shown.hot && <span className="text-[10px] font-black text-[#FFB347]">🔥 hot zone</span>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="lvx-lens-glare" />
        </div>
        <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1" data-testid="spyglass-looks">
          {Array.from({ length: max }, (_, i) => <motion.span key={i} className="text-[14px]" animate={{ opacity: i < looks ? 1 : 0.25, scale: i < looks ? 1 : 0.8 }}>🔭</motion.span>)}
          {looks < max && nextIn != null && <span className="ml-1 text-[10px] font-bold text-white/70">+1 in {dur(nextIn)}</span>}
        </div>
        <div className="lvx-grain" />
      </div>

      <Button variant="rainbow" size="lg" onClick={startLook} disabled={!!busy || looks < 1 || phase === 'racking' || !!mirror} data-testid="spyglass-look">
        {looks < 1 ? `The glass rests · ${dur(nextIn)}` : `🔭 Take a look (${looks} left)`}
      </Button>

      {sightings.length > 0 && (
        <div className="grid gap-2" data-testid="spyglass-sightings">
          <div className="lvx-label">Your readings · only you can see them</div>
          {sightings.map((s) => {
            const col = readingColor(s.rarity);
            return (
              <motion.div key={s.id} className="lvx-sighting flex items-center gap-3 p-2.5" style={{ ['--c' as any]: col }} initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} layout>
                <div className="shine" />
                <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl" style={{ background: `radial-gradient(circle, ${col}, ${col}22)`, boxShadow: `0 0 14px ${col}` }}>{s.rarity === 'enchanted' ? kindInfo(s.kind).emoji : '🔭'}</span>
                <span className="relative grid min-w-0 flex-1 leading-tight">
                  <span className="text-[14px] font-black" style={{ color: col }}>{readingName(s.rarity, s.kind)}{s.second ? ' · second sight' : ''}</span>
                  <span className="text-[11px] text-white/60">fades in {dur(s.expires_in)}{s.hot ? ' · hot zone' : ''}</span>
                </span>
                {view.second_ready && !s.second && <Button size="sm" variant="ghost" onClick={() => void second(s)} disabled={!!busy} data-testid="spyglass-second">👁️ Again</Button>}
                <Button size="sm" onClick={() => claim(s)} data-testid="spyglass-claim">Claim →</Button>
              </motion.div>
            );
          })}
        </div>
      )}
      {(view.history ?? []).length > 0 && (
        <div className="grid gap-1">
          <div className="lvx-label">Earlier readings</div>
          <div className="flex flex-wrap gap-1.5">{(view.history as any[]).map((h) => (
            <span key={h.id} className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-[11px] font-bold text-white/70"><RarityChip r={h.rarity} />{h.used ? '✓ claimed' : h.refunded ? '↩ taken — look returned' : 'faded'}</span>
          ))}</div>
        </div>
      )}
      <p className="text-center text-[11px] text-white/55">Each look is a roll made just for you. Telling a friend where it was won’t help them — they’d get their own roll. Crowns never show in the glass.</p>
    </div>
  );
}
