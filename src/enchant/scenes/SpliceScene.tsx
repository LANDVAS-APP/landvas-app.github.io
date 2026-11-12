// 🧪 Splice: a lab with two glass vials and a fusion chamber. Pour one enchantment into each vial — the chamber already
// shows what they'd become and how their genes cross. Pull the lever: the helix spins up, the chamber flashes, and the
// hybrid card turns over. The Codex keeps every hybrid you've made, of 36.
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { useUi } from '../../lib/store';
import { buzz } from '../../native/native';
import { Button } from '../../ui';
import { Sigil } from '../Sigil';
import { centerOf, efx, useLeft, useMyEnchantments, type SceneProps } from '../core';
import { HYBRIDS, KINDS, dur, enchantName, hybridOf, hybridText, kindInfo, type EnchantKind } from '../kinds';

const seedOf = (id: string) => parseInt(String(id).replace(/-/g, '').slice(0, 8), 16) || 1;

function Vial({ e, label, onClear }: { e: any | null; label: string; onClear(): void }) {
  const k = e ? kindInfo(e.kind) : null;
  return (
    <button onClick={onClear} className="relative grid aspect-[1/2] w-full place-items-center overflow-hidden rounded-b-[40px] rounded-t-xl border-4 border-white/25 bg-white/[0.04]" aria-label={label}>
      <motion.div className="absolute inset-x-0 bottom-0" style={{ background: k ? `linear-gradient(180deg, ${k.a}, ${k.b})` : 'transparent' }} animate={{ height: e ? '72%' : '0%' }} transition={{ type: 'spring', stiffness: 90, damping: 14 }} />
      {e && Array.from({ length: 6 }, (_, i) => <span key={i} className="lv-smoke absolute bottom-[10%] h-2 w-2 rounded-full bg-white/60" style={{ left: `${20 + i * 12}%`, animationDelay: `${i * 0.3}s` }} />)}
      <div className="relative">{e ? <Sigil kind={e.kind} seed={e.sigil} size={46} level={e.level} /> : <span className="text-[11px] font-black text-white/40">{label}</span>}</div>
      <div className="lv-glass pointer-events-none absolute inset-0 opacity-30" />
    </button>
  );
}

export function SpliceScene({ v, view, act, busy, at }: SceneProps) {
  const mine = useMyEnchantments();
  const chamber = useRef<HTMLDivElement>(null);
  const [a, setA] = useState<any>(null);
  const [b, setB] = useState<any>(null);
  const [spin, setSpin] = useState(false);
  const [made, setMade] = useState<any>(null);
  const nextIn = useLeft(view.next_in, at);
  const endsIn = useLeft(view.active ? (Date.parse(view.active.ends_at) - Date.parse(v.server_time)) / 1000 : null, at);
  const pool = (mine.data ?? []).filter((x) => x.kind !== 'splice' && !x.partner && x.id !== v.id);
  const pick = (e: any) => { if (!a) setA(e); else if (!b && e.id !== a.id) setB(e); if (useUi.getState().settings.haptics) buzz('light'); };
  const preview = a && b ? hybridOf(a.kind, b.kind) : null;
  const splice = async () => {
    if (!a || !b) return;
    setSpin(true);
    if (useUi.getState().settings.haptics) buzz('heavy');
    await new Promise((r) => setTimeout(r, 1400));
    const r = await act('splice', { a: a.id, b: b.id }, { silent: true });
    setSpin(false);
    if (r) {
      setMade(r.result); setA(null); setB(null);
      efx.burst({ ...centerOf(chamber.current), colors: [kindInfo(r.result.a).a, kindInfo(r.result.b).a, '#fff', '#00F5D4'], count: r.result.resonant ? 280 : 160, speed: 15, kind: 'spark' });
    }
  };
  const codex: string[] = view.codex ?? [];
  return (
    <div className="grid gap-3">
      <div className="lv-scene aspect-[4/3] w-full p-4" style={{ background: 'radial-gradient(circle at 50% 30%,#0E3B39,#051A19 70%)' }} data-testid="splice-scene">
        {view.active ? (
          <div className="grid h-full place-items-center text-center" data-testid="splice-active">
            <div className="grid justify-items-center gap-2">
              <div className="flex items-center"><Sigil kind={view.active.a_kind} seed={seedOf(view.active.a)} size={70} /><span className="-mx-3 text-3xl">🧬</span><Sigil kind={view.active.b_kind} seed={seedOf(view.active.b)} size={70} /></div>
              <div className="font-display text-3xl font-black" style={{ color: '#00F5D4', textShadow: '0 0 18px #00F5D4' }}>{view.active.hybrid}</div>
              {view.active.resonant && <span className="rounded-full bg-[linear-gradient(90deg,#00F5D4,#9B5DE5)] px-3 py-0.5 text-[11px] font-black text-[#04211D]">✦ RESONANT · genes doubled</span>}
              <div className="text-[12px] text-white/70">{view.active.a_name} + {view.active.b_name}</div>
              {hybridText(view.active.a_kind as EnchantKind, view.active.b_kind as EnchantKind).map((t) => <div key={t} className="text-[11px] font-semibold text-[#9BF6E5]">{t}</div>)}
              <div className="mt-1 rounded-full bg-black/40 px-3 py-1 text-[12px] font-black text-white">Fused for {dur(endsIn)}</div>
            </div>
          </div>
        ) : (
          <div className="grid h-full grid-cols-[1fr_1.4fr_1fr] items-center gap-3">
            <Vial e={a} label="Vial A" onClear={() => setA(null)} />
            <div ref={chamber} className="relative grid aspect-square place-items-center rounded-full border-4 border-[#00F5D4]/40 bg-[radial-gradient(circle,#0F5F57,#06201E)]">
              <motion.svg viewBox="0 0 60 120" className="h-[78%]" animate={{ rotateY: spin ? 1440 : 360 }} transition={{ repeat: spin ? 0 : Infinity, duration: spin ? 1.4 : 6, ease: spin ? 'easeIn' : 'linear' }} aria-hidden>
                {Array.from({ length: 12 }, (_, i) => { const y = 6 + i * 9.5, s = Math.sin(i * 0.8) * 20; return <g key={i}><line x1={30 - s} y1={y} x2={30 + s} y2={y} stroke="#9BF6E5" strokeWidth="2" /><circle cx={30 - s} cy={y} r="3.2" fill={a ? kindInfo(a.kind).a : '#00F5D4'} /><circle cx={30 + s} cy={y} r="3.2" fill={b ? kindInfo(b.kind).a : '#9B5DE5'} /></g>; })}
              </motion.svg>
              {preview && !spin && <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-black text-[#00F5D4]">→ {preview[0]}{preview[1] ? ' ✦' : ''}</div>}
              {spin && <div className="absolute inset-0 rounded-full bg-white/70 lv-sigil-pulse" />}
            </div>
            <Vial e={b} label="Vial B" onClear={() => setB(null)} />
          </div>
        )}
        <AnimatePresence>
          {made && (
            <motion.button key="m" onClick={() => setMade(null)} className="absolute inset-0 grid place-items-center bg-black/80 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="splice-made">
              <motion.div className="grid justify-items-center gap-2 rounded-3xl border-2 border-[#00F5D4] bg-[#04211D] px-6 py-5 shadow-[0_0_40px_#00F5D4]" initial={{ rotateY: 180, scale: 0.6 }} animate={{ rotateY: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 140, damping: 12 }}>
                {made.new && <span className="rounded-full bg-[#FFD23F] px-2.5 py-0.5 text-[10px] font-black text-[#1a0b2e]">NEW IN YOUR CODEX</span>}
                <span className="text-4xl">{kindInfo(made.a).emoji}🧬{kindInfo(made.b).emoji}</span>
                <span className="font-display text-3xl font-black text-[#00F5D4]">{made.hybrid}</span>
                {made.resonant && <span className="text-[12px] font-black text-[#C9A0FF]">✦ A resonant pair — genes doubled</span>}
                <span className="text-[12px] text-white/70">Fused for 24 hours</span>
              </motion.div>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      {!view.active && (
        <>
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-black uppercase tracking-wider text-white/60">Pour in two enchantments</span>
            <span className="font-bold text-[#9BF6E5]">{view.charges}/{view.max} charges{view.charges < view.max ? ` · next ${dur(nextIn)}` : ''}</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1" data-testid="splice-pool">
            {pool.length ? pool.map((e) => (
              <button key={e.id} onClick={() => pick(e)} disabled={a?.id === e.id || b?.id === e.id} data-testid={`splice-pick-${e.kind}`}
                className={cn('grid w-20 shrink-0 justify-items-center gap-0.5 rounded-2xl bg-white/[0.05] p-1.5 text-center disabled:opacity-30')}>
                <Sigil kind={e.kind} seed={e.sigil} size={44} level={e.level} still />
                <span className="w-full truncate text-[10px] font-black">{enchantName(e)}</span>
              </button>
            )) : <p className="text-[12px] text-white/55">You need two other enchantments (not already spliced) to splice.</p>}
          </div>
          {a && b && <div className="grid gap-0.5 rounded-2xl bg-[#00F5D4]/10 p-2.5 text-[12px]">{hybridText(a.kind, b.kind).map((t) => <span key={t} className="font-semibold text-[#9BF6E5]">🧬 {t}</span>)}</div>}
          <Button variant="rainbow" disabled={!a || !b || !!busy || spin || view.charges < 1} onClick={() => void splice()} data-testid="splice-go">
            {view.charges < 1 ? `Recharging · ${dur(nextIn)}` : a && b ? `⚡ Pull the lever: ${preview![0]}` : 'Choose two enchantments'}
          </Button>
        </>
      )}
      {view.active && <Button variant="ghost" onClick={() => void act('unsplice')} disabled={!!busy}>Separate them early</Button>}
      {/* the Codex */}
      <div className="grid gap-2 rounded-3xl border border-white/10 bg-white/[0.03] p-3" data-testid="splice-codex">
        <div className="flex items-center justify-between"><span className="text-[12px] font-black uppercase tracking-wider text-white/60">Splice Codex</span><span className="text-[12px] font-black text-[#00F5D4]">{codex.length}/36</span></div>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {Object.entries(HYBRIDS).map(([key, [name, res]]) => {
            const has = codex.includes(key), [x, y] = key.split('+') as EnchantKind[];
            return (
              <div key={key} className={cn('rounded-xl px-2 py-1.5 text-center text-[10px] font-black', has ? 'bg-[#00F5D4]/15 text-[#9BF6E5]' : 'bg-white/[0.03] text-white/25')} title={has ? hybridText(x, y).join(' · ') : 'Undiscovered'}>
                <div className="text-[14px]">{has ? `${KINDS[x].emoji}${KINDS[y].emoji}` : '❔❔'}</div>{has ? name : '???'}{res && has ? ' ✦' : ''}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-center text-[11px] text-white/55">{view.made} splice{view.made === 1 ? '' : 's'} made. A Clockwork can freeze a hybrid to keep it fused longer.</p>
    </div>
  );
}
