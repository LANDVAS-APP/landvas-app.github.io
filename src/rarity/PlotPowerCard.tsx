// A plot's power in its panel: what it does and what's ready (yours), or what's open to you (someone else's) — a
// Void Gate to step through, stars to catch, a Throne's rule. Your other ultras get a way into the Fusion Lab.
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { buzz } from '../native/native';
import { hasPower, isFusion, isPrimordial, rarityInfo } from '../shared/rarity';
import { RULES, cellKey, dur, powerPath, usePower } from './powers';
import './rarity.css';

export function PlotPowerCard({ gx, gy, rarity, mine }: { gx: number; gy: number; rarity: string; mine: boolean }) {
  if (hasPower(rarity)) return <PowerCard gx={gx} gy={gy} />;
  const i = rarityInfo(rarity);
  // an ultra of yours without a power of its own: it can still be fused
  if (mine && i.tier === 'ultra' && !rarity.startsWith('crown') && !isFusion(rarity) && !isPrimordial(rarity)) {
    return (
      <Link to={`/fusion?first=${cellKey(gx, gy)}`} className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-2xl bg-white/[0.06] px-4 py-3 text-sm" data-testid="plot-fuse">
        <span>🧬 <b>Fuse this {i.name}</b> with another ultra</span><span className="text-xs font-bold text-muted">Fusion Lab →</span>
      </Link>
    );
  }
  return null;
}

function PowerCard({ gx, gy }: { gx: number; gy: number }) {
  const qc = useQueryClient();
  const q = usePower(gx, gy);
  const v = q.data;
  if (!v) return null;
  const i = rarityInfo(v.rarity);
  const ready = v.actions.filter((a) => a.ready && !a.visitor);
  const step = v.actions.find((a) => a.id === 'step');
  const stepIn = async () => {
    try {
      const r = await api.rarityAct(gx, gy, 'step');
      buzz('success');
      toast.success(`🌑 Through the gate — a ${rarityInfo(r.result.ticket).name}-or-better roll ticket is yours`);
      qc.setQueryData(['rarity-power', gx, gy], r.view);
    } catch (e) { toast.error(toGameError(e).message); }
  };
  return (
    <section className="lvrx-prim-card mx-4 mb-3 grid gap-2 rounded-3xl p-4" style={{ ['--c' as string]: i.color, ['--g' as string]: i.glow }} data-testid="plot-power" data-rarity={v.rarity}>
      <div className="flex items-center gap-2">
        <span className="text-2xl">{i.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: i.glow }}>{v.tier === 'primordial' ? 'Primordial' : v.tier === 'fusion' ? 'Fusion' : 'Ultra'} power</div>
          <b className="text-white">{v.name}</b>
        </div>
        {v.mine && ready.length > 0 && <span className="lvrx-ready rounded-full px-2 py-0.5 text-[11px] font-black" data-testid="plot-power-ready">{ready.length} ready</span>}
      </div>
      <p className="text-[13px] leading-relaxed text-white/80">{v.ability}</p>
      {v.rarity === 'throne_ink' && v.rule && <p className="text-[13px]">{RULES[v.rule]?.emoji} This week: <b>{RULES[v.rule]?.name}</b> — {RULES[v.rule]?.text}</p>}
      {v.rarity === 'fallen_star' && v.shower_until && <p className="text-[13px] font-bold text-[#FDE047]">⭐ {v.stars} shooting stars are falling — catch them on the map!</p>}
      {v.rarity === 'void_gate' && <p className="text-[13px]">{v.open ? '🌑 The gate is open.' : `Opens in ${dur(v.opens_in)}.`}</p>}
      <div className="flex flex-wrap gap-2">
        {step && !v.mine && <button disabled={!step.ready} onClick={stepIn} className="lv-gbtn px-3 py-1.5 text-sm disabled:opacity-50" data-testid="plot-power-step">{step.ready ? 'Step through' : v.stepped ? 'Stepped through tonight' : step.why === 'too_far' ? 'Only for land within 5 km' : 'Step through'}</button>}
        <Link to={powerPath(gx, gy)} className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold text-white" data-testid="plot-power-open">{v.mine ? 'Use its power →' : 'More about it →'}</Link>
      </div>
    </section>
  );
}
