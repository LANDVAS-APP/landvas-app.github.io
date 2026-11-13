// 🧪 Splice: a lab with glass vials and a fusion chamber. Choose how to splice — Swap, Graft, Chimera, Trinity, with a
// friend, or with one of your plots — pour enchantments in, and the card says in plain words what each will get. Pull the
// lever: the vials drain into the test tube, the helix spins, a flash — and the hybrid steps out wearing both its parents.
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { api } from '../../backend/api';
import { qk } from '../../lib/queries';
import { cn } from '../../lib/utils';
import { rarityInfo } from '../../shared/rarity';
import { Button, PlayerAvatar } from '../../ui';
import { Sigil } from '../Sigil';
import { centerOf, efx, useLeft, useMyEnchantments, type SceneProps } from '../core';
import { HybridCard, PlotHybridCard } from '../HybridCard';
import { ABERRATIONS, HYBRID_COUNT, SPLICE_MODES, dur, enchantName, kindInfo, plotHybridName, traitText, trinityName, type EnchantKind, type SpliceMode } from '../kinds';
import { HybridSigil, feel } from '../living';
import { Radar, plotLabel } from '../sizeray';

function Vial({ e, label, onClear, draining, tone }: { e: any | null; label: string; onClear(): void; draining?: boolean; tone?: string }) {
  const k = e ? kindInfo(e.kind) : null;
  return (
    <button onClick={onClear} className="relative grid aspect-[1/2] w-full place-items-center overflow-hidden rounded-b-[40px] rounded-t-xl border-4 border-white/25 bg-white/[0.04]" aria-label={label} data-testid="splice-vial">
      <motion.div className="absolute inset-x-0 bottom-0" style={{ background: k ? `linear-gradient(180deg, ${k.a}, ${k.b})` : tone ?? 'transparent' }} animate={{ height: draining ? '0%' : e ? '72%' : '0%' }} transition={{ type: 'spring', stiffness: draining ? 40 : 90, damping: 14 }} />
      {e && Array.from({ length: 6 }, (_, i) => <span key={i} className="lv-smoke absolute bottom-[10%] h-2 w-2 rounded-full bg-white/60" style={{ left: `${20 + i * 12}%`, animationDelay: `${i * 0.3}s` }} />)}
      <motion.div className="relative" animate={draining ? { y: 60, scale: 0.3, opacity: 0 } : { y: 0, scale: 1, opacity: 1 }} transition={{ duration: 1 }}>
        {e ? (e.plot ? <span className="text-3xl">🏞️</span> : <Sigil kind={e.kind} seed={e.sigil} size={46} level={e.level} />) : <span className="text-[11px] font-black text-white/40">{label}</span>}
      </motion.div>
      <div className="lv-glass pointer-events-none absolute inset-0 opacity-30" />
    </button>
  );
}

export function SpliceScene({ v, view, act, busy, at }: SceneProps) {
  const mine = useMyEnchantments();
  const chamber = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<SpliceMode>('swap');
  const [a, setA] = useState<any>(null);
  const [b, setB] = useState<any>(null);
  const [c, setC] = useState<any>(null);
  const [spin, setSpin] = useState(false);
  const [made, setMade] = useState<any>(null);
  const nextIn = useLeft(view.next_in, at);
  const endsIn = useLeft(view.active ? (Date.parse(view.active.ends_at) - Date.parse(v.server_time)) / 1000 : null, at);
  const roarIn = useLeft(view.active?.roar_in ?? null, at);
  const friends = useQuery({ queryKey: ['splice-friends'], queryFn: api.spliceFriends, enabled: mode === 'friend', staleTime: 30_000 });
  const plots = useQuery({ queryKey: qk.myPlots, queryFn: api.myPlots, enabled: mode === 'plot' });
  const groups = useQuery({ queryKey: qk.groups, queryFn: api.myGroups, enabled: mode === 'plot' });
  const kindAt = (gx: number, gy: number) => (groups.data ?? []).find((g) => g.status === 'active' && g.cells.some((k) => k[0] === gx && k[1] === gy))?.kind ?? 'canvas';
  const pool = (mine.data ?? []).filter((x) => x.kind !== 'splice' && !x.partner && !(x.partners ?? []).length && !x.clock?.frozen_until && x.id !== v.id);
  const slots = mode === 'trinity' ? 3 : 2;
  const cost = SPLICE_MODES[mode].cost;
  const choose = (m: SpliceMode) => { feel('light'); setMode(m); setA(null); setB(null); setC(null); };
  const pick = (e: any) => {
    feel('light');
    if (!a) setA(e); else if (mode !== 'friend' && mode !== 'plot' && !b && e.id !== a.id) setB(e); else if (mode === 'trinity' && !c && e.id !== a.id && e.id !== b?.id) setC(e);
  };
  const ready = !!a && !!b && (mode !== 'trinity' || !!c);
  const splice = async () => {
    if (!ready) return;
    setSpin(true); feel('heavy');
    await new Promise((r) => setTimeout(r, 1500));
    const args: Record<string, unknown> = { mode, a: a.id };
    if (mode === 'plot') { args.gx = b.gx; args.gy = b.gy; } else args.b = b.id;
    if (mode === 'trinity') args.c = c.id;
    const r = await act('splice', args, { silent: true });
    setSpin(false);
    if (r) {
      setMade({ ...r.result, seedA: a.sigil, seedB: b.sigil ?? 7, seedC: c?.sigil });
      efx.burst({ ...centerOf(chamber.current), colors: [kindInfo(r.result.a).a, kindInfo(r.result.b ?? r.result.a).a, '#fff', '#00F5D4'], count: r.result.resonant || r.result.aberration ? 300 : 170, speed: 15, kind: 'spark' });
      feel('success');
      setA(null); setB(null); setC(null);
    }
  };
  const act0 = view.active;
  const members: any[] = act0?.members ?? [];
  const codexN = (view.codex ?? []).length;
  return (
    <div className="grid gap-3">
      {!act0 && !view.invite && (
        <div className="flex gap-1.5 overflow-x-auto pb-1" data-testid="splice-modes">
          {(Object.keys(SPLICE_MODES) as SpliceMode[]).map((m) => (
            <button key={m} onClick={() => choose(m)} className={cn('shrink-0 rounded-2xl px-3 py-2 text-left text-[12px] font-black', mode === m ? 'bg-[linear-gradient(135deg,#00F5D4,#9B5DE5)] text-[#04211D]' : 'bg-white/[0.06] text-white/75')} data-testid={`splice-mode-${m}`}>
              {SPLICE_MODES[m].emoji} {SPLICE_MODES[m].name}{SPLICE_MODES[m].cost > 1 ? ' · 2⚡' : ''}
            </button>
          ))}
        </div>
      )}
      {!act0 && !view.invite && <p className="-mt-1 text-[12px] font-semibold text-white/65">{SPLICE_MODES[mode].text}</p>}
      <div className="lv-scene aspect-[4/3] w-full p-4" style={{ background: 'radial-gradient(circle at 50% 30%,#0E3B39,#051A19 70%)' }} data-testid="splice-scene">
        {act0 ? (
          <div className="grid h-full place-items-center text-center" data-testid="splice-active">
            <div className="grid justify-items-center gap-2">
              <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3 }}>
                {act0.mode === 'plot' ? <div className="flex items-center"><Sigil kind={members[0]?.kind} seed={members[0]?.sigil ?? 1} size={80} /><span className="-ml-4 text-5xl">🏞️</span></div>
                  : <HybridSigil a={members[0]?.kind} b={members[1]?.kind ?? members[0]?.kind} c={members[2]?.kind} seedA={members[0]?.sigil ?? 1} seedB={members[1]?.sigil ?? 2} size={110} />}
              </motion.div>
              <div className="font-display text-3xl font-black" style={{ color: '#00F5D4', textShadow: '0 0 18px #00F5D4' }}>{act0.hybrid}</div>
              <div className="flex flex-wrap justify-center gap-1">
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">{SPLICE_MODES[act0.mode as SpliceMode]?.emoji} {SPLICE_MODES[act0.mode as SpliceMode]?.name}</span>
                {act0.perfect && <span className="lv-badge-perfect">✦ Perfect Match</span>}
                {act0.data?.aberration && <span className="lv-badge-aberr">☣️ Aberration</span>}
                {act0.data?.unstable && <span className="rounded-full bg-[#FF4D6D] px-2 py-0.5 text-[10px] font-black text-white">⚠️ UNSTABLE</span>}
              </div>
              <div className="text-[12px] text-white/70">{members.map((m) => m.name).join(act0.mode === 'graft' ? ' ← ' : ' + ')}{act0.mode === 'plot' ? ' + your plot' : ''}</div>
              <div className="mt-1 rounded-full bg-black/40 px-3 py-1 text-[12px] font-black text-white">{act0.data?.unstable ? 'Rejects in ' : 'Fused for '}{dur(endsIn)}</div>
            </div>
          </div>
        ) : view.invite ? (
          <div className="grid h-full place-items-center text-center" data-testid="splice-invite-out">
            <div className="grid justify-items-center gap-2">
              <span className="text-5xl">🤝</span>
              <div className="font-display text-2xl font-black text-[#00F5D4]">{view.invite.hybrid}</div>
              <div className="text-[13px] text-white/75">Waiting for @{view.invite.to?.username} to say yes…</div>
              <div className="text-[11px] text-white/50">The invitation lasts {dur((Date.parse(view.invite.expires_at) - Date.now()) / 1000)}. If they say no, you get the charge back.</div>
            </div>
          </div>
        ) : (
          <div className={cn('grid h-full items-center gap-3', slots === 3 ? 'grid-cols-[1fr_1fr_1.3fr_1fr]' : 'grid-cols-[1fr_1.4fr_1fr]')}>
            <Vial e={a} label={mode === 'graft' ? 'Host' : 'Vial A'} onClear={() => setA(null)} draining={spin} />
            {slots === 3 && <Vial e={b} label="Vial B" onClear={() => setB(null)} draining={spin} />}
            <div ref={chamber} className="relative grid aspect-square place-items-center rounded-full border-4 border-[#00F5D4]/40 bg-[radial-gradient(circle,#0F5F57,#06201E)]">
              <motion.svg viewBox="0 0 60 120" className="h-[78%]" animate={{ rotateY: spin ? 1800 : 360 }} transition={{ repeat: spin ? 0 : Infinity, duration: spin ? 1.5 : 6, ease: spin ? 'easeIn' : 'linear' }} aria-hidden>
                {Array.from({ length: 12 }, (_, i) => { const y = 6 + i * 9.5, s = Math.sin(i * 0.8) * 20; return <g key={i}><line x1={30 - s} y1={y} x2={30 + s} y2={y} stroke="#9BF6E5" strokeWidth="2" /><circle cx={30 - s} cy={y} r="3.2" fill={a ? kindInfo(a.kind).a : '#00F5D4'} /><circle cx={30 + s} cy={y} r="3.2" fill={b?.kind ? kindInfo(b.kind).a : '#9B5DE5'} /></g>; })}
              </motion.svg>
              {mode === 'graft' && <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-black text-[#9BF6E5]">← donor lends</span>}
              {spin && <div className="absolute inset-0 rounded-full bg-white/70 lv-sigil-pulse" />}
            </div>
            <Vial e={slots === 3 ? c : b} label={slots === 3 ? 'Vial C' : mode === 'graft' ? 'Donor' : mode === 'plot' ? 'Plot' : mode === 'friend' ? 'Friend’s' : 'Vial B'} onClear={() => (slots === 3 ? setC(null) : setB(null))} draining={spin}
              tone={mode === 'plot' && b ? 'linear-gradient(180deg,#3DDC97,#1E6F4C)' : undefined} />
          </div>
        )}
        <AnimatePresence>
          {made && (
            <motion.button key="m" onClick={() => setMade(null)} className="absolute inset-0 grid place-items-center bg-black/85 p-3 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="splice-made">
              <motion.div className="grid justify-items-center gap-2 rounded-3xl border-2 border-[#00F5D4] bg-[#04211D] px-6 py-5 shadow-[0_0_40px_#00F5D4]" initial={{ rotateY: 180, scale: 0.4 }} animate={{ rotateY: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 140, damping: 12 }}>
                {made.invited ? <span className="text-5xl">🤝</span> : made.mode === 'plot' ? <span className="text-5xl">{kindInfo(made.a).emoji}🏞️</span>
                  : <HybridSigil a={made.a} b={made.b ?? made.a} c={made.c} seedA={made.seedA ?? 1} seedB={made.seedB ?? 2} size={96} />}
                {made.new && <span className="rounded-full bg-[#FFD23F] px-2.5 py-0.5 text-[10px] font-black text-[#1a0b2e]">NEW IN YOUR CODEX</span>}
                {made.aberration && <span className="lv-badge-aberr">☣️ IT MUTATED — A SECRET ABERRATION</span>}
                <span className="font-display text-3xl font-black text-[#00F5D4]">{made.hybrid}</span>
                {made.invited ? <span className="text-[12px] text-white/75">Invitation sent — when your friend says yes, you’re both spliced.</span>
                  : <span className="text-[12px] text-white/70">{made.unstable ? `⚠️ Unstable — it will reject in ${made.hours} h` : `Fused for ${made.hours} hours`}{made.resonant && !made.aberration ? ' · ✦ Perfect Match' : ''}</span>}
                {made.aberration && <span className="max-w-[260px] text-[11px] font-bold text-[#FFB3C7]">{ABERRATIONS[made.aberration]?.secret}</span>}
              </motion.div>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      {act0 ? (
        <div className="grid gap-2">
          {act0.mode === 'plot' && members[0] ? <PlotHybridCard kind={members[0].kind} plotKind={act0.data?.plot_kind ?? 'canvas'} name={act0.hybrid} />
            : act0.mode === 'trinity' ? (
              <div className="lv-hcard grid gap-1 rounded-2xl p-3" style={{ ['--a' as string]: '#00F5D4', ['--b' as string]: '#9B5DE5' }}>
                <div className="font-display text-[17px] font-black">🔺 {act0.hybrid}</div>
                {members.map((m) => <div key={m.id} className="text-[12.5px] text-white/90">{kindInfo(m.kind).emoji} <b>Your {kindInfo(m.kind).name} gets</b>: {members.filter((o) => o.id !== m.id).map((o) => traitText(kindInfo(o.kind).gene)).filter(Boolean).join(' · ') || '—'}</div>)}
              </div>
            ) : members.length >= 2 && <HybridCard a={members[0].kind} b={members[1].kind} mode={act0.mode === 'friend' ? 'swap' : act0.mode} levels={[members[0].level, members[1].level]} aberration={act0.data?.aberration} />}
          {act0.mode === 'chimera' && <Button variant="rainbow" disabled={!!busy || (roarIn ?? 0) > 0} onClick={() => void act('roar', {}, { at: centerOf(chamber.current) })} data-testid="splice-roar">{(roarIn ?? 0) > 0 ? `🐉 Roars again in ${dur(roarIn)}` : '🐉 ROAR!'}</Button>}
          <Button variant="ghost" onClick={() => void act('unsplice')} disabled={!!busy}>Separate them early</Button>
        </div>
      ) : view.invite ? (
        <Button variant="ghost" onClick={() => void act('unsplice')} disabled={!!busy} data-testid="splice-cancel-invite">Cancel the invitation</Button>
      ) : (
        <>
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-black uppercase tracking-wider text-white/60">{mode === 'friend' ? (a ? 'Now a friend’s enchantment' : 'First, one of yours') : mode === 'plot' ? (a ? 'Now pick the plot' : 'First, the enchantment') : `Pour in ${slots} enchantments`}</span>
            <span className="font-bold text-[#9BF6E5]">{view.charges}/{view.max} charges{view.charges < view.max ? ` · next ${dur(nextIn)}` : ''}</span>
          </div>
          {(mode !== 'friend' && mode !== 'plot') || !a ? (
            <div className="flex gap-2 overflow-x-auto pb-1" data-testid="splice-pool">
              {pool.length ? pool.map((e) => (
                <button key={e.id} onClick={() => pick(e)} disabled={[a?.id, b?.id, c?.id].includes(e.id)} data-testid={`splice-pick-${e.kind}`}
                  className="grid w-20 shrink-0 justify-items-center gap-0.5 rounded-2xl bg-white/[0.05] p-1.5 text-center disabled:opacity-30">
                  <Sigil kind={e.kind} seed={e.sigil} size={44} level={e.level} still />
                  <span className="w-full truncate text-[10px] font-black">{enchantName(e)}</span>
                </button>
              )) : <p className="text-[12px] text-white/55">You need other enchantments (not already spliced) to splice.</p>}
            </div>
          ) : mode === 'friend' ? (
            <div className="grid max-h-60 gap-2 overflow-y-auto" data-testid="splice-friends">
              {(friends.data ?? []).length ? friends.data!.map((f) => (
                <div key={f.friend.id} className="grid gap-1.5 rounded-2xl bg-white/[0.04] p-2">
                  <div className="flex items-center gap-2 text-[12px] font-black"><PlayerAvatar p={f.friend} size={22} /> @{f.friend.username}</div>
                  <div className="flex gap-1.5 overflow-x-auto">
                    {f.enchantments.map((e) => (
                      <button key={e.id} onClick={() => { feel('light'); setB({ ...e, owner: f.friend }); }} className={cn('grid w-[72px] shrink-0 justify-items-center rounded-xl p-1', b?.id === e.id ? 'bg-[#00F5D4]/20 ring-1 ring-[#00F5D4]' : 'bg-black/20')} data-testid="splice-friend-pick">
                        <Sigil kind={e.kind} seed={e.sigil} size={36} still /><span className="w-full truncate text-[9.5px] font-black">{enchantName(e)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )) : <p className="text-[12px] text-white/55">{friends.isLoading ? 'Looking…' : 'None of your friends has an enchantment free to splice right now.'}</p>}
            </div>
          ) : (
            <div className="grid gap-2">
              <Radar plots={(plots.data ?? []) as any[]} picked={b} onPick={(p) => setB({ plot: true, gx: p.gx, gy: p.gy, rarity: p.rarity, label: plotLabel(p), plot_kind: kindAt(p.gx, p.gy) })} />
              {b && <div className="text-center text-[12px] font-black" style={{ color: rarityInfo(b.rarity).color }}>{b.label}</div>}
            </div>
          )}
          {ready && (mode === 'plot' ? <PlotHybridCard kind={a.kind} plotKind={b.plot_kind ?? 'canvas'} name={plotHybridName(a.kind, b.plot_kind ?? 'canvas')} />
            : mode === 'trinity' ? (
              <div className="lv-hcard grid gap-1 rounded-2xl p-3" style={{ ['--a' as string]: '#00F5D4', ['--b' as string]: '#9B5DE5' }} data-testid="hybrid-card">
                <div className="font-display text-[17px] font-black">🔺 {trinityName(a.kind, b.kind, c.kind)}</div>
                {[a, b, c].map((m) => <div key={m.id} className="text-[12.5px] text-white/90">{kindInfo(m.kind).emoji} <b>Your {kindInfo(m.kind).name} gets</b>: {[a, b, c].filter((o) => o.id !== m.id).map((o) => traitText(kindInfo(o.kind).gene)).filter(Boolean).join(' · ') || '—'}</div>)}
                <div className="text-[11px] font-semibold text-white/55">⏱ 18 hours · costs both charges</div>
              </div>
            ) : <HybridCard a={a.kind as EnchantKind} b={b.kind as EnchantKind} mode={mode === 'friend' ? 'swap' : mode} levels={[a.level, b.level ?? 1]} />)}
          <Button variant="rainbow" disabled={!ready || !!busy || spin || view.charges < cost} onClick={() => void splice()} data-testid="splice-go">
            {view.charges < cost ? `Needs ${cost} charge${cost > 1 ? 's' : ''} · next ${dur(nextIn)}` : ready ? (mode === 'friend' ? `🤝 Ask @${b.owner?.username} to splice` : '⚡ Pull the lever') : 'Choose what to splice'}
          </Button>
        </>
      )}
      <div className="flex items-center justify-between rounded-2xl border border-[#00F5D4]/25 bg-[#00F5D4]/[0.06] px-3 py-2 text-[12px]" data-testid="splice-codex">
        <span className="font-black text-[#9BF6E5]">🧬 Splice Codex</span>
        <span className="font-bold text-white/70">{codexN}/{HYBRID_COUNT} hybrids · {(view.trinities ?? []).length} trinities · {(view.aberrations ?? []).length}/6 aberrations</span>
      </div>
      <p className="text-center text-[11px] text-white/55">{view.made} splice{view.made === 1 ? '' : 's'} made. A Clockwork can freeze a hybrid to keep it fused longer.</p>
    </div>
  );
}
