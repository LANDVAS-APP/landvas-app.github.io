// A hybrid, in plain words: who gets what (with real numbers), how long, what it's best for. Used in the Splice lab, on an
// enchantment's page, in the Codex and on a friend's splice invitation.
import { cn } from '../lib/utils';
import { hybridCard, kindInfo, traitText, type EnchantKind, type SpliceMode, SPLICE_MODES, ABERRATIONS } from './kinds';

export function HybridCard({ a, b, mode = 'swap', levels, aberration, compact, className }: {
  a: EnchantKind; b: EnchantKind; mode?: SpliceMode; levels?: [number, number]; aberration?: string | null; compact?: boolean; className?: string }) {
  const h = hybridCard(a, b, { mode, levels, aberration });
  const ka = kindInfo(a), kb = kindInfo(b);
  return (
    <div className={cn('lv-hcard grid gap-1.5 rounded-2xl p-3', className)} style={{ ['--a' as string]: ka.a, ['--b' as string]: kb.a }} data-testid="hybrid-card">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[18px] leading-none">{ka.emoji} + {kb.emoji} =</span>
        <span className="font-display text-[18px] font-black leading-tight text-white">{h.name}</span>
        {h.perfect && !aberration && <span className="lv-badge-perfect">✦ Perfect Match</span>}
        {aberration && <span className="lv-badge-aberr">{ABERRATIONS[aberration]?.emoji ?? '☣️'} Aberration</span>}
        {mode !== 'swap' && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black text-white/80">{SPLICE_MODES[mode].emoji} {SPLICE_MODES[mode].name}</span>}
      </div>
      {h.lines.map((l) => (
        <div key={l.me} className="text-[12.5px] leading-snug text-white/90">
          <span className="mr-1">{l.emoji}</span><b>Your {l.who} gets</b> <span className="text-white/60">({l.traitEmoji} {l.trait})</span>: {l.gets}
          {!compact && l.live && <div className="ml-6 text-[11px] font-bold text-[#9BF6E5]">{l.live}</div>}
        </div>
      ))}
      {h.sleeps && <div className="text-[12px] text-white/70">💤 Your {h.sleeps} sleeps while its Trait is lent out (nothing grows, nothing comes).</div>}
      {h.perfect && !aberration && <div className="text-[11.5px] font-bold text-[#E5CCFF]">✦ Perfect Match: these two belong together, so both Traits are doubled.{h.extra ? ` ${h.extra}` : ''}</div>}
      {aberration && <div className="text-[11.5px] font-bold text-[#FFB3C7]">☣️ {ABERRATIONS[aberration]?.secret ?? 'Traits tripled.'}</div>}
      {!compact && <div className="text-[11px] font-semibold text-white/55">⏱ {h.hours} hours{h.bestFor ? ` · Best for: ${h.bestFor}` : ''}</div>}
    </div>
  );
}

/** an enchantment spliced into one of your plots */
export function PlotHybridCard({ kind, plotKind, name }: { kind: EnchantKind; plotKind: string; name: string }) {
  const k = kindInfo(kind);
  const trait = plotKind === 'canvas' ? 'inspired' : plotKind === 'habitat' ? 'wild' : plotKind === 'farm' ? 'fertile' : plotKind === 'business' ? 'invested' : plotKind === 'arcade' ? 'streak' : 'homely';
  return (
    <div className="lv-hcard grid gap-1.5 rounded-2xl p-3" style={{ ['--a' as string]: k.a, ['--b' as string]: '#3DDC97' }} data-testid="hybrid-card">
      <div className="flex items-center gap-1.5"><span className="text-[18px]">{k.emoji} + 🏞️ =</span><span className="font-display text-[18px] font-black text-white">{name}</span></div>
      <div className="text-[12.5px] text-white/90">🏞️ <b>The plot gets</b>: {k.gene ? ({ golden: 'its minigames pay 1.5× Ink', grow: 'its minigames pay 2× Ink', chaos: 'its minigame wins become a gamble: 0.5× to 2.5×', seek: '1 in 4 wins pays 1.5×', spread: 'its minigames pay 15% more', echo: '35% of wins pay double', wish: 'its minigames pay 25% more', trick: 'its minigames pay 20% more', tempo: 'its minigames pay 30% more', linked: 'its minigames pay 40% more', foresight: 'its minigames pay 20% more' } as Record<string, string>)[k.gene] : '—'}</div>
      <div className="text-[12.5px] text-white/90">{k.emoji} <b>Your {k.name} gets</b>: {traitText(trait)}</div>
      <div className="text-[11px] font-semibold text-white/55">⏱ 24 hours</div>
    </div>
  );
}
