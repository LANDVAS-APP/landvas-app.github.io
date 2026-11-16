// The Primordials (/primordials): the tier above every ultra — each one, its odds, how many the world has, the latest
// to come into it, and yours (with what's ready).
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import { Page, PageHeader } from '../app/Shell';
import { BasePlotArt } from '../plot/BasePlotArt';
import { rarityInfo, type RarityId } from '../shared/rarity';
import { cellKey, dur, powerPath, useMyPowers } from './powers';
import './rarity.css';

const HOW: Record<string, string> = { rolled: 'rolled', fused: 'fused from three ultras', hatched: 'hatched from a Chrysalis' };

export default function PrimordialsScreen() {
  const q = useQuery({ queryKey: ['primordial-tier'], queryFn: api.primordialTier, staleTime: 30_000, refetchInterval: 60_000 });
  const mine = useMyPowers();
  const t = q.data;
  return (
    <Page>
      <PageHeader eyebrow="Above every ultra" title="🌌 The Primordials">Each one is rarer than any ultra{t ? ` — about 1 in ${Math.round(t.list[0]?.one_in ?? 3_000_000).toLocaleString()} claims` : ''}, there’s no limit to how many can be rolled, and each changes the game around it. When anyone rolls one, every map in the world feels the shockwave.</PageHeader>

      {getBackend().session() && (mine.data ?? []).length > 0 && (
        <section className="mb-6 grid gap-2" data-testid="prim-mine">
          <h2 className="eyebrow">Your powers</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {mine.data!.map((p) => {
              const ready = p.actions?.filter((a) => a.ready && !a.visitor).length ?? 0;
              return (
                <Link key={cellKey(p.gx, p.gy)} to={powerPath(p.gx, p.gy)} className="glass flex items-center gap-3 rounded-2xl p-3" style={{ boxShadow: `inset 0 0 0 1.5px ${p.color}55` }} data-testid="prim-mine-row">
                  <BasePlotArt rarity={p.rarity as RarityId} size={40} />
                  <div className="min-w-0 flex-1"><b style={{ color: p.glow }}>{p.emoji} {p.name}</b><div className="truncate text-[11px] text-muted">{p.tier === 'primordial' ? 'Primordial' : p.tier === 'fusion' ? 'Fusion' : 'Ultra'}{p.next_in ? ` · next in ${dur(p.next_in)}` : ''}</div></div>
                  {ready > 0 && <span className="lvrx-ready rounded-full px-2 py-0.5 text-[11px] font-black" data-testid="prim-ready">{ready} ready</span>}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {(t?.recent ?? []).length > 0 && (
        <section className="mb-6 grid gap-2" data-testid="prim-recent">
          <h2 className="eyebrow">The latest to come into the world</h2>
          <div className="glass grid gap-1.5 rounded-3xl p-4">
            {t!.recent.map((m, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <span>{rarityInfo(m.rarity).emoji} <b style={{ color: rarityInfo(m.rarity).glow }}>{rarityInfo(m.rarity).name}</b> {HOW[m.how] ?? m.how} by @{m.owner_name ?? 'someone'}{m.place ? ` in ${m.place}` : ''}</span>
                <span className="shrink-0 text-[11px] text-muted">{dur((Date.now() - +new Date(m.at)) / 1000)} ago</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8 grid gap-3 sm:grid-cols-2" data-testid="prim-list">
        {(t?.list ?? []).map((p) => (
          <article key={p.id} className="lvrx-prim-card grid gap-2 rounded-3xl p-4" style={{ ['--c' as string]: p.color, ['--g' as string]: p.glow }} data-testid={`prim-${p.id}`}>
            <header className="flex items-center gap-3">
              <BasePlotArt rarity={p.id as RarityId} size={56} />
              <div className="min-w-0 flex-1">
                <div className="font-display text-lg font-black" style={{ color: p.glow }}>{p.emoji} {p.name}</div>
                <div className="text-[11px] font-bold text-white/60 tnum">1 in {Math.round(p.one_in).toLocaleString()} · {p.world.toLocaleString()} in the world{p.mine ? ` · ${p.mine} yours` : ''}</div>
              </div>
            </header>
            <p className="text-sm leading-relaxed text-white/85">{p.ability}</p>
          </article>
        ))}
        {q.isLoading && <div className="lv-skel h-40 rounded-3xl" />}
      </section>

      <div className="mb-10 flex flex-wrap justify-center gap-2">
        <Link to="/fusion" className="lv-gbtn px-4 py-2 text-sm" data-testid="prim-to-fusion">🧬 The Fusion Lab (two ultras → one)</Link>
        <Link to="/legend" className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-bold">📖 Every rarity</Link>
      </div>
    </Page>
  );
}
