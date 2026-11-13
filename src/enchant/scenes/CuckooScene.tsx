// 🪺 The Cuckoo: a forest canopy. Scout three nests — each on a real player's plot, glowing in its rarity, with eyes for
// how watchful its owner is and the chick it would raise. Choose; the cuckoo flies; the egg sits in a stranger's nest
// and wobbles harder as it nears hatching. Raise the chick when it cracks.
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { cn, fmt } from '../../lib/utils';
import { rarityInfo } from '../../shared/rarity';
import { Button } from '../../ui';
import { centerOf, efx, useLeft, type SceneProps } from '../core';
import { dur } from '../kinds';

function Bird({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 80" className={className} aria-hidden>
      <path d="M20 50 Q22 26 48 24 Q70 22 78 36 L96 30 L84 44 Q82 64 54 66 Q28 68 20 50Z" fill="#4CC9F0" />
      <path d="M30 50 Q50 40 70 52 Q52 60 30 50Z" fill="#2A8FB8" /><path d="M20 50 L4 58 L10 46Z" fill="#2A8FB8" />
      <circle cx="68" cy="34" r="4" fill="#fff" /><circle cx="69" cy="34" r="2" fill="#06222C" />
      <path d="M44 66 L42 76 M56 66 L58 76" stroke="#F72585" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
function Egg({ wobble, cracked, c = '#C9F2FF' }: { wobble: number; cracked: boolean; c?: string }) {
  return (
    <motion.svg viewBox="0 0 40 50" className="w-full" animate={wobble ? { rotate: [0, -wobble, wobble, 0] } : {}} transition={{ repeat: Infinity, duration: 1.2 - wobble / 30, repeatDelay: Math.max(0, 1.5 - wobble / 8) }} aria-hidden>
      <ellipse cx="20" cy="27" rx="15" ry="20" fill={c} /><circle cx="14" cy="20" r="2" fill="#4CC9F0" opacity="0.6" /><circle cx="25" cy="30" r="2.6" fill="#4CC9F0" opacity="0.6" /><circle cx="18" cy="36" r="1.6" fill="#4CC9F0" opacity="0.6" />
      {cracked && <path d="M6 24 L12 28 L16 22 L22 29 L27 23 L34 27" stroke="#06222C" strokeWidth="1.6" fill="none" />}
    </motion.svg>
  );
}

export function CuckooScene({ view, act, busy, at }: SceneProps) {
  const nestRef = useRef<HTMLDivElement>(null);
  const [flying, setFlying] = useState<number | null>(null);
  const [chick, setChick] = useState<any>(null);
  const hatchIn = useLeft(view.hatch_in, at);
  const egg = view.egg;
  const nests: any[] = view.nests ?? [];
  const total = egg ? Number(egg.hatch_at) - Number(egg.laid_at) : 1;
  const wobble = egg ? Math.max(0, 14 * (1 - (hatchIn ?? 0) / total)) : 0;
  const lay = async (i: number) => {
    setFlying(i);
    await new Promise((r) => setTimeout(r, 650));
    const r = await act('lay', { i });
    setFlying(null);
    if (r) efx.burst({ ...centerOf(nestRef.current), colors: ['#4CC9F0', '#F72585', '#fff'], count: 30, speed: 7, kind: 'glitter' });
  };
  const raise = async () => {
    const r = await act('raise', {}, { at: centerOf(nestRef.current) });
    if (r) { setChick(r.result); efx.burst({ ...centerOf(nestRef.current), colors: ['#fff'], count: 20, speed: 8, kind: 'emoji', emojis: ['🐣', '🪶', '✨'] }); }
  };
  return (
    <div className="grid gap-3">
      <div className="lv-scene aspect-[4/3] w-full" style={{ background: 'linear-gradient(180deg,#0E3B43 0%,#145C4F 50%,#0B2E2A 100%)' }} data-testid="cuckoo-scene">
        <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
          {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={i * 50 + 10} cy={20 + (i % 3) * 18} r={50 + (i % 4) * 10} fill={['#1B6E5A', '#228B6E', '#176152'][i % 3]} opacity="0.9" />)}
          <path d="M0 210 Q200 180 400 215" stroke="#5C3A21" strokeWidth="14" fill="none" strokeLinecap="round" />
          <path d="M250 200 Q300 170 360 172" stroke="#5C3A21" strokeWidth="8" fill="none" strokeLinecap="round" />
        </svg>
        {/* the cuckoo on its branch */}
        <AnimatePresence>
          {flying == null && (
            <motion.div key="b" className="absolute bottom-[29%] left-[8%] w-[24%] lv-ench-float" exit={{ x: 300, y: -60, rotate: 15, transition: { duration: 0.6 } }}>
              <Bird className="w-full drop-shadow-[0_6px_6px_rgba(0,0,0,0.4)]" />
              <span className="absolute -top-5 right-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-[#06222C]">cuckoo!</span>
            </motion.div>
          )}
        </AnimatePresence>
        {/* the egg in someone's nest */}
        <div ref={nestRef} className="absolute bottom-[26%] right-[8%] w-[34%]">
          {egg ? (
            <div className="relative grid justify-items-center">
              <div className="mb-[-12%] w-[38%]"><Egg wobble={view.hatched ? 18 : wobble} cracked={!!view.hatched} /></div>
              <svg viewBox="0 0 120 40" className="w-full" aria-hidden><ellipse cx="60" cy="22" rx="56" ry="16" fill="#7A5230" />{Array.from({ length: 14 }, (_, i) => <path key={i} d={`M${6 + i * 8} ${18 + (i % 3) * 3} q16 -6 30 0`} stroke="#A9773F" strokeWidth="2" fill="none" />)}</svg>
              <span className="mt-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-black" style={{ color: rarityInfo(egg.rarity).color }}>@{egg.owner_name}’s {rarityInfo(egg.rarity).name} nest{egg.spotted ? ' · 👁 spotted!' : ''}</span>
            </div>
          ) : !nests.length && <div className="text-center text-[12px] font-bold text-white/60">No egg out.<br />Scout for a nest.</div>}
        </div>
        <div className="absolute left-3 top-3 rounded-full bg-black/40 px-3 py-1 text-[12px] font-black text-white backdrop-blur" data-testid="cuckoo-status">
          {egg ? (view.hatched ? '🐣 It hatched!' : `🥚 Hatching in ${dur(hatchIn)}`) : `🐦 ${view.chicks} chick${view.chicks === 1 ? '' : 's'} raised`}
        </div>
        <AnimatePresence>
          {chick && (
            <motion.button key="ch" onClick={() => setChick(null)} className="absolute inset-0 grid place-items-center bg-black/70 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div initial={{ scale: 0.3, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }} className="grid gap-1">
                <span className="text-7xl">🐣</span><span className="font-display text-2xl font-black text-[#4CC9F0]">A cuckoo chick!</span>
                <span className="text-sm font-bold text-white/85">+{fmt(chick.pay?.paid ?? 0)} Ink{chick.feather ? ' · and a lucky feather: +20 Luck 🪶' : ''}</span>
              </motion.div>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      {egg ? (
        <Button variant="rainbow" onClick={() => void raise()} disabled={!!busy || !view.hatched} data-testid="cuckoo-raise">{view.hatched ? `🐣 Raise the chick · ≈${egg.reward} Ink` : `It hatches in ${dur(hatchIn)} — if no one throws it out`}</Button>
      ) : nests.length ? (
        <div className="grid gap-2" data-testid="cuckoo-nests">
          <div className="text-[12px] font-black uppercase tracking-wider text-white/60">Choose a nest</div>
          <div className="grid grid-cols-3 gap-2">
            {nests.map((n, i) => {
              const r = rarityInfo(n.rarity), eyes = Math.round(Number(n.watch) * 4);
              return (
                <motion.button key={i} onClick={() => void lay(i)} disabled={!!busy || flying != null} data-testid={`cuckoo-nest-${i}`}
                  className={cn('grid justify-items-center gap-1 rounded-2xl border-2 bg-white/[0.05] p-2 text-center', flying === i && 'ring-2 ring-[#4CC9F0]')} style={{ borderColor: `${r.color}99`, boxShadow: `0 0 18px ${r.color}33` }}
                  initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.08 }} whileTap={{ scale: 0.95 }}>
                  <span className="text-3xl">🪺</span>
                  <span className="text-[11px] font-black" style={{ color: r.color }}>{r.emoji ?? ''} {r.name}</span>
                  <span className="max-w-full truncate text-[10px] text-white/60">@{n.owner_name}</span>
                  <span className="text-[11px]" title="How watchful the owner is">{'👁'.repeat(Math.max(1, eyes))}<span className="opacity-25">{'👁'.repeat(Math.max(0, 3 - eyes))}</span></span>
                  <span className="rounded-full bg-[#4CC9F0]/15 px-1.5 text-[10px] font-black text-[#9BE7FF]">≈{n.reward} Ink</span>
                </motion.button>
              );
            })}
          </div>
          {!view.rescouted && <button className="text-[11px] font-bold text-white/50 underline" onClick={() => void act('scout')} disabled={!!busy}>Scout again (once)</button>}
        </div>
      ) : (
        <Button variant="rainbow" onClick={() => void act('scout')} loading={busy === 'scout'} data-testid="cuckoo-scout">🔭 Scout for nests</Button>
      )}
      <p className="text-center text-[11px] text-white/55">Rarer nests raise richer chicks; watchful owners (👁) are likelier to spot the egg and throw it out. {view.lost ? `${view.lost} egg${view.lost === 1 ? '' : 's'} lost.` : ''}</p>
    </div>
  );
}
