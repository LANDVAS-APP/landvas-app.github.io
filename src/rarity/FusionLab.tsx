// The Fusion Lab (/fusion): two of your ultras become one (the recipe book says which). Primordials can only be rolled
// (three ultras used to fuse into one; those Primordials gave back the very three ultras that went in).
// The first plot you pick keeps everything — its drawing, name and level; the other goes back to the world.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { Page, PageHeader } from '../app/Shell';
import { qk } from '../lib/queries';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';
import { BasePlotArt } from '../plot/BasePlotArt';
import { hasPower, rarityInfo, type RarityId } from '../shared/rarity';
import { cellKey, powerPath } from './powers';
import './rarity.css';

const WHY: Record<string, string> = { starter_plot: 'your starter plot', merged: 'part of a bigger canvas', plot_folded: 'folded away', plot_locked: 'locked' };

export default function FusionLab() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const q = useQuery({ queryKey: ['fusion-book'], queryFn: api.fusionBook, staleTime: 15_000 });
  const [sel, setSel] = useState<string[]>(() => (params.get('first') ? [params.get('first')!] : []));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ rarity: string; gx: number; gy: number; triple: boolean } | null>(null);
  const book = q.data;
  const byKey = useMemo(() => new Map((book?.ultras ?? []).map((u) => [cellKey(u.gx, u.gy), u])), [book]);
  const picked = sel.map((k) => byKey.get(k)).filter(Boolean) as NonNullable<ReturnType<typeof byKey.get>>[];
  const recipe = picked.length === 2 ? (book?.recipes ?? []).find((r) => r.to && [r.a, r.b].sort().join('+') === [picked[0].rarity, picked[1].rarity].sort().join('+')) : null;
  const outcome = recipe?.to ?? null;
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : s.length < 2 ? [...s, k] : s));

  const fuse = async () => {
    setBusy(true);
    try {
      const r = await api.ultraFuse(picked.map((p) => [p.gx, p.gy]));
      buzz('success');
      setMade(r); setSel([]); setConfirm(false);
      void qc.invalidateQueries({ queryKey: ['fusion-book'] });
      void qc.invalidateQueries({ queryKey: qk.myPlots });
      void qc.invalidateQueries({ queryKey: ['my-powers'] });
    } catch (e) {
      toast.error(toGameError(e).message);
    } finally { setBusy(false); }
  };

  return (
    <Page>
      <PageHeader eyebrow="Ultra Fusions" title="🧬 The Fusion Lab">Two of your ultras become one stronger plot. The first you pick keeps its drawing, name and level; the other goes back to the world. <Link to="/primordials" className="underline">Primordials</Link> are only ever rolled.</PageHeader>

      <section className="mb-6 grid gap-2" data-testid="fusion-book">
        <h2 className="eyebrow">The recipe book</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {(book?.recipes ?? []).map((r, i) => r.to ? (
            <div key={r.to} className="glass flex items-center gap-3 rounded-2xl p-3" style={{ boxShadow: `inset 0 0 0 1.5px ${r.color}44` }} data-testid={`recipe-${r.to}`}>
              <span className="text-lg">{rarityInfo(r.a!).emoji}</span><span className="text-muted">+</span><span className="text-lg">{rarityInfo(r.b!).emoji}</span><span className="text-muted">→</span>
              <BasePlotArt rarity={r.to as RarityId} size={34} />
              <div className="min-w-0 flex-1"><b style={{ color: r.color }}>{r.name}</b>{(r.made ?? 0) > 0 && <span className="ml-1 text-[10px] font-black text-ok">made ×{r.made}</span>}<div className="truncate text-[11px] text-muted">{r.ability}</div></div>
            </div>
          ) : (
            <div key={`s${i}`} className="glass flex items-center gap-3 rounded-2xl p-3 text-muted" data-testid="recipe-secret">❔ + ❔ → <b>a secret fusion</b></div>
          ))}
          <div className="glass flex items-center gap-3 rounded-2xl p-3 text-muted" data-testid="recipe-primordial">🌌 <span><b className="text-[#FDE68A]">Primordials</b> can’t be fused — they’re only ever rolled</span></div>
        </div>
      </section>

      <section className="mb-6 grid gap-2" data-testid="fusion-ultras">
        <h2 className="eyebrow">Your ultras</h2>
        {q.isLoading ? <div className="lv-skel h-24 rounded-2xl" /> : (book?.ultras ?? []).length === 0 ? (
          <p className="glass rounded-2xl p-4 text-sm text-muted" data-testid="fusion-none">You don’t have an ultra to fuse yet. Every claim has its own tiny chance of one.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {book!.ultras.map((u) => {
              const k = cellKey(u.gx, u.gy), i = sel.indexOf(k), info = rarityInfo(u.rarity);
              return (
                <motion.button key={k} whileTap={{ scale: 0.96 }} disabled={!!u.why} onClick={() => toggle(k)}
                  className={cn('lvrx-choice relative grid justify-items-center gap-1 rounded-2xl p-3 text-center disabled:opacity-40', i >= 0 && 'lvrx-choice-on')}
                  style={{ ['--c' as string]: info.color }} data-testid="fusion-ultra" data-rarity={u.rarity}>
                  {i >= 0 && <span className="absolute left-2 top-2 rounded-full bg-white px-1.5 text-[10px] font-black text-black">{i === 0 ? 'keeps' : `#${i + 1}`}</span>}
                  <BasePlotArt rarity={u.rarity as RarityId} shiny={u.shiny} size={52} />
                  <b className="text-sm" style={{ color: info.color }}>{info.emoji} {info.name}</b>
                  <span className="truncate text-[11px] text-muted">{u.why ? `Can’t: ${WHY[u.why] ?? u.why}` : u.name || `Plot ${u.gx}, ${u.gy}`}</span>
                </motion.button>
              );
            })}
          </div>
        )}
      </section>

      {picked.length >= 2 && (
        <section className="lvrx-preview mb-6 grid justify-items-center gap-2 rounded-3xl p-5 text-center" data-testid="fusion-preview">
 {outcome ? <><BasePlotArt rarity={outcome as RarityId} size={72} /><b className="font-display text-xl" style={{ color: rarityInfo(outcome).color }}>{rarityInfo(outcome).name}</b><p className="text-sm text-white/70">{rarityInfo(outcome).ability}</p></>
              : <p className="text-sm text-white/70" data-testid="fusion-no-recipe">Those two don’t fuse (as far as the book knows). Try another pair.</p>}
          {outcome && <button className="lv-gbtn px-5 py-2.5" onClick={() => setConfirm(true)} data-testid="fusion-go">Fuse them</button>}
          {outcome == null && picked.length === 2 && <button className="text-xs font-bold text-white/60 underline" onClick={() => setConfirm(true)} data-testid="fusion-try">Try anyway</button>}
        </section>
      )}

      <AnimatePresence>
        {confirm && (
          <motion.div className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirm(false)}>
            <motion.div className="glass grid max-w-sm gap-3 rounded-3xl p-5" initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} data-testid="fusion-confirm">
              <b className="font-display text-lg">Fuse {picked.length} ultras?</b>
              <p className="text-sm text-muted">Your <b>{rarityInfo(picked[0].rarity).name}</b> plot becomes the fusion and keeps everything. {picked.slice(1).map((p) => rarityInfo(p.rarity).name).join(' and ')} goes back to the world. This can’t be undone.</p>
              <div className="flex gap-2"><button className="lv-gbtn flex-1 py-2.5" disabled={busy} onClick={fuse} data-testid="fusion-confirm-go">{busy ? 'Fusing…' : 'Fuse'}</button><button className="flex-1 rounded-2xl bg-white/10 py-2.5 font-bold" onClick={() => setConfirm(false)}>Not yet</button></div>
            </motion.div>
          </motion.div>
        )}
        {made && (
          <motion.div className="fixed inset-0 z-[130] grid place-items-center bg-black/85 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMade(null)} data-testid="fusion-made">
            <motion.div className="lvrx-made grid justify-items-center gap-3 text-center" initial={{ scale: 0.4, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 160, damping: 13 }}
              style={{ ['--c' as string]: rarityInfo(made.rarity).color, ['--g' as string]: rarityInfo(made.rarity).glow }} onClick={(e) => e.stopPropagation()}>
              <div className="text-[11px] font-black uppercase tracking-[0.25em] text-white/70">Fused</div>
              <BasePlotArt rarity={made.rarity as RarityId} size={132} />
              <b className="font-display text-3xl" style={{ color: rarityInfo(made.rarity).glow }} data-testid="fusion-made-name">{rarityInfo(made.rarity).emoji} {rarityInfo(made.rarity).name}</b>
              <p className="max-w-xs text-sm text-white/80">{rarityInfo(made.rarity).ability}</p>
              <div className="flex gap-2">
                {hasPower(made.rarity) && <Link to={powerPath(made.gx, made.gy)} className="lv-gbtn px-4 py-2 text-sm" data-testid="fusion-made-power">Use its power</Link>}
                <button className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-bold" onClick={() => setMade(null)}>Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
  );
}
