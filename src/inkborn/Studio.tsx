// The Inkborn creation studio: draw a creature and bring it to life, roll a random one, or
// build one part by part — then name it and release it into a sanctuary.
// /inkborn/create · /inkborn/edit/:id (customise an existing creature)
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Dices, Info, Paintbrush, Shuffle, SlidersHorizontal, Sparkles, Wand2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { Page, PageHeader } from '../app/Shell';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { cn, safeStorage, saveStorage } from '../lib/utils';
import type { Stroke } from '../shared/strokes';
import { Button, Field, ResourceIcon, Spinner, inputCls } from '../ui';
import { confettiCannons } from '../ui/confetti';
import { SketchPad, StrokeView } from '../creative/SketchPad';
import { CreatureView } from './CreatureView';
import {
  BODIES, EARS, EYES, GAITS, GAIT_INFO, HORNS, MAX_EYES, MAX_LEGS, MOODS, MOOD_INFO, PATTERNS, TAILS, WINGS, cleanGenome, defaultGait, genomeFromDrawing, hsl, randomGenome, randomName, type Genome,
} from './genome';

type Mode = 'draw' | 'random' | 'custom';
const newKey = () => `ink-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export default function Studio() {
  const { id } = useParams();
  const me = useOnboardedMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const sanct = useQuery({ queryKey: ['sanctuaries'], queryFn: api.mySanctuaries, enabled: !!me });
  const eco = useQuery({ queryKey: ['inkborn-economy'], queryFn: api.inkbornEconomy, enabled: !!me });
  const existing = id ? sanct.data?.creatures.find((c) => c.id === id) : null;
  const [mode, setMode] = useState<Mode>(id ? 'custom' : 'draw');
  const [genome, setGenome] = useState<Genome>(() => randomGenome());
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [name, setName] = useState(() => randomName());
  const [strokes, setStrokes] = useState<Stroke[]>(() => { const d = safeStorage<Stroke[] | null>('landvas.inkborn.draft', []); return Array.isArray(d) ? d : []; });
  const [alive, setAlive] = useState<{ notes: string[] } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [source, setSource] = useState<'drawn' | 'random' | 'custom'>('drawn');
  const [home, setHome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Genome[]>([]);
  const key = useRef(newKey());
  const t0 = useRef(performance.now());
  if (existing && loadedFor !== existing.id) { setLoadedFor(existing.id); setGenome(cleanGenome(existing.genome)); setName(existing.name); }

  if (!me || sanct.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  const habitats = sanct.data?.habitats ?? [];
  const homeId = home ?? habitats.find((h) => h.creatures < h.capacity)?.id ?? sanct.data?.starter_id ?? null;

  const bringToLife = () => {
    if (strokes.length < 2) { toast('Draw a little more first — a body, eyes, maybe ears or a tail!'); return; }
    setRevealing(true);
    const r = genomeFromDrawing(strokes, strokes.length * 7919 + strokes[0].p.length);
    setTimeout(() => { setGenome(r.genome); setAlive({ notes: r.notes }); setSource('drawn'); setRevealing(false); confettiCannons(); }, 1700);
  };
  const roll = () => {
    setHistory((h) => [genome, ...h].slice(0, 8));
    setGenome(randomGenome());
    setSource('random');
  };
  const save = async () => {
    setBusy(true);
    try {
      if (existing) {
        await api.inkbornUpdate(existing.id, name.trim(), genome);
        toast.success(`${name.trim()} looks wonderful`);
      } else {
        const c = await api.inkbornCreate({ clientKey: key.current, name: name.trim(), source, genome, drawing: source === 'drawn' ? strokes : null, habitatId: homeId });
        saveStorage('landvas.inkborn.draft', []);
        confettiCannons();
        invalidateGame(qc);
        void qc.invalidateQueries({ queryKey: ['inkborn-economy'] });
        toast.success(`${c.name} is alive!`, { description: c.habitat_id ? 'They’re waiting in their sanctuary.' : 'Every sanctuary is full — make room to give them a home.' });
        key.current = newKey();
        void qc.invalidateQueries({ queryKey: ['sanctuaries'] });
        await qc.invalidateQueries({ queryKey: ['habitat'] });
        nav(c.habitat_id ? `/habitat/${c.habitat_id}?new=${c.id}` : '/inkborn');
        return;
      }
      void qc.invalidateQueries({ queryKey: ['sanctuaries'] });
      void qc.invalidateQueries({ queryKey: ['habitat'] });
      nav('/inkborn');
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  const ready = mode !== 'draw' || !!alive || !!existing;
  const cost = eco.data?.next_cost ?? 0;
  const afford = Number(me.balances.ink) >= cost;

  return (
    <Page>
      <PageHeader eyebrow="Inkborn studio" title={existing ? `Customise ${existing.name}` : 'Create an Inkborn'}>
        {existing ? 'Change any part — your Inkborn keeps its name, bond and memories.' : 'Draw a creature and bring it to life, roll a surprise, or build one part by part.'}
      </PageHeader>
      {!existing && (
        <div className="glass mb-4 inline-flex gap-1 rounded-2xl p-1" role="tablist">
          {([['draw', 'Draw', Paintbrush], ['random', 'Randomize', Dices], ['custom', 'Customize', SlidersHorizontal]] as const).map(([m, label, Icon]) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); if (m !== 'draw') setSource(m === 'random' ? 'random' : 'custom'); else if (alive) setSource('drawn'); }} data-testid={`studio-${m}`}
              className={cn('relative flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold', mode === m ? 'text-fg' : 'text-muted')}>
              {mode === m && <motion.span layoutId="studio-tab" className="absolute inset-0 rounded-xl bg-surface-2" />}
              <Icon className="relative h-4 w-4" /><span className="relative">{label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-4">
          {mode === 'draw' && !existing && (
            <section className="glass relative grid justify-items-center gap-3 rounded-3xl p-4" data-testid="studio-draw">
              {!alive ? (
                <>
                  <p className="text-center text-sm text-muted">Draw your creature: a body, eyes, and maybe ears, horns, a tail or spots. Its shape and colours become a living Inkborn.</p>
                  <SketchPad strokes={strokes} onChange={(s) => { setStrokes(s); saveStorage('landvas.inkborn.draft', s); }} t0={t0.current} size={440} testid="inkborn-pad" />
                  <Button variant="rainbow" size="lg" onClick={bringToLife} disabled={revealing} data-testid="bring-to-life"><Wand2 className="h-5 w-5" /> Bring to Life</Button>
                </>
              ) : (
                <div className="grid w-full gap-3 sm:grid-cols-[160px_1fr] sm:items-center">
                  <div className="grid justify-items-center gap-1"><StrokeView strokes={strokes} size={150} /><span className="text-[11px] text-muted">Your drawing</span></div>
                  <div className="grid gap-2">
                    <div className="font-display text-lg font-semibold">Your drawing came alive!</div>
                    <ul className="flex flex-wrap gap-1.5">{alive.notes.map((n) => <li key={n} className="rounded-full bg-ok/15 px-2 py-0.5 text-xs font-bold text-ok">✓ {n}</li>)}</ul>
                    <WeSaw genome={genome} onChange={setGenome} />
                    <p className="text-xs text-muted">Not quite right? Fix the counts above, switch to Customize to change any part, or draw again.</p>
                    <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => { setAlive(null); }}>Draw again</Button><Button size="sm" variant="ghost" onClick={() => setMode('custom')}>Customize</Button></div>
                  </div>
                </div>
              )}
              <AnimatePresence>
                {revealing && (
                  <motion.div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-bg/85 backdrop-blur" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="life-reveal">
                    <motion.div className="h-40 w-40 rounded-full" style={{ background: 'conic-gradient(#FF4D6D,#FFE14D,#3DDC97,#34C3FF,#7B5CFF,#FF4FD8,#FF4D6D)' }}
                      animate={{ rotate: 360, scale: [0.4, 1.1, 0.2], borderRadius: ['50%', '30%', '50%'] }} transition={{ duration: 1.7, ease: 'easeInOut' }} />
                    <div className="absolute bottom-6 font-display text-lg font-bold">Bringing it to life…</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          )}
          {mode === 'random' && !existing && (
            <section className="glass grid justify-items-center gap-3 rounded-3xl p-5" data-testid="studio-random">
              <p className="text-center text-sm text-muted">Every roll mixes body, colours, eyes, ears, horns, tail, wings, pattern and personality.</p>
              <motion.div whileTap={{ scale: 0.95, rotate: -4 }}><Button variant="rainbow" size="lg" onClick={roll} data-testid="roll"><Shuffle className="h-5 w-5" /> Roll a creature</Button></motion.div>
              {history.length > 0 && (
                <div className="w-full">
                  <div className="mb-1 text-xs font-bold text-muted">Earlier rolls — tap to go back</div>
                  <div className="no-scrollbar flex gap-2 overflow-x-auto">
                    {history.map((h, i) => <button key={i} onClick={() => setGenome(h)} className="shrink-0 rounded-2xl border border-line bg-surface/50 hover:border-line-strong"><CreatureView genome={h} size={72} ground={false} /></button>)}
                  </div>
                </div>
              )}
            </section>
          )}
          {(mode === 'custom' || existing) && <Customizer genome={genome} onChange={(g) => { setGenome(g); if (!existing && source !== 'drawn') setSource('custom'); }} />}
        </div>

        <aside className="grid content-start gap-3 lg:sticky lg:top-16 lg:self-start">
          <section className="glass relative grid justify-items-center gap-2 overflow-hidden rounded-3xl p-4" data-testid="studio-preview">
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#2f7d3a]/40 to-transparent" />
            <motion.div key={JSON.stringify(genome)} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
              <CreatureView genome={genome} size={220} cycle testid="creature-preview" />
            </motion.div>
            <div className="relative text-center text-xs text-muted">{MOOD_INFO[genome.mood].emoji} {MOOD_INFO[genome.mood].label} — {MOOD_INFO[genome.mood].text}</div>
          </section>
          {ready && (
            <section className="glass grid gap-3 rounded-3xl p-4">
              <Field label="Name" htmlFor="ink-name">
                <div className="flex gap-2">
                  <input id="ink-name" className={cn(inputCls, 'min-w-0 flex-1')} maxLength={24} value={name} onChange={(e) => setName(e.target.value)} data-testid="inkborn-name" />
                  <Button type="button" variant="secondary" onClick={() => setName(randomName())} aria-label="Suggest a name"><Sparkles className="h-4 w-4" /></Button>
                </div>
              </Field>
              {!existing && habitats.length > 1 && (
                <Field label="Home" htmlFor="ink-home">
                  <select id="ink-home" className={cn(inputCls, 'h-10')} value={homeId ?? ''} onChange={(e) => setHome(e.target.value)}>
                    {habitats.map((h) => <option key={h.id} value={h.id} disabled={h.creatures >= h.capacity}>{h.name} ({h.creatures}/{h.capacity}){h.creatures >= h.capacity ? ' — full' : ''}</option>)}
                  </select>
                </Field>
              )}
              {!existing && eco.data && (
                <div className="flex items-center justify-between rounded-xl bg-surface-2/60 px-3 py-2 text-xs" data-testid="inkborn-cost">
                  <span className="text-muted">{eco.data.next_cost === 0 ? 'Your first Inkborn is free' : 'Bringing an Inkborn to life costs'}</span>
                  {eco.data.next_cost === 0 ? <b className="text-ok">Free</b> : <span className="flex items-center gap-1 font-bold"><ResourceIcon r="ink" className="h-3.5 w-3.5" />{eco.data.next_cost} Ink</span>}
                </div>
              )}
              {!existing && cost > 0 && !afford ? (
                <Button variant="secondary" size="lg" onClick={() => nav('/play')}>Need {cost - Number(me.balances.ink)} more Ink — play to earn</Button>
              ) : (
                <Button variant="rainbow" size="lg" loading={busy} disabled={!name.trim()} onClick={save} data-testid="save-inkborn">{existing ? 'Save changes' : `Release ${name.trim() || 'your Inkborn'}`}</Button>
              )}
            </section>
          )}
          {!existing && mode === 'draw' && (
            <p className="flex gap-2 rounded-2xl border border-line p-3 text-[11px] text-muted">
              <Info className="h-4 w-4 shrink-0" />
              {sanct.data?.ai_portraits ? 'Your drawing is also sent to be painted as a portrait.' : 'Your Inkborn is built from your drawing’s shape and colours on our animation rig. AI-painted portraits aren’t switched on yet.'}
            </p>
          )}
        </aside>
      </div>
    </Page>
  );
}

/** The counts read from a drawing, with quick fixes: eyes, legs, and how a legless one gets about. */
function WeSaw({ genome, onChange, title = 'Here’s what we saw' }: { genome: Genome; onChange(g: Genome): void; title?: string }) {
  const set = (p: Partial<Genome>) => {
    const g = { ...genome, ...p };
    if (p.legs !== undefined) g.gait = g.legs > 0 ? 'walk' : genome.gait !== 'walk' ? genome.gait : defaultGait(g.body, g.wings);
    if (p.eyecount !== undefined) g.eyes = g.eyecount === 1 ? 'one' : genome.eyes === 'one' ? 'big' : genome.eyes;
    onChange(g);
  };
  const step = (label: string, value: number, max: number, key: 'eyecount' | 'legs', testid: string) => (
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface-2/60 px-3 py-2">
      <span className="text-sm font-bold">{label}</span>
      <div className="flex items-center gap-1.5">
        <button className="h-8 w-8 rounded-xl bg-surface text-lg font-bold disabled:opacity-30" disabled={value <= 0} onClick={() => set({ [key]: value - 1 } as Partial<Genome>)} aria-label={`Fewer ${label.toLowerCase()}`} data-testid={`${testid}-minus`}>−</button>
        <span className="w-6 text-center font-display text-lg font-bold tnum" data-testid={`${testid}-count`}>{value}</span>
        <button className="h-8 w-8 rounded-xl bg-surface text-lg font-bold disabled:opacity-30" disabled={value >= max} onClick={() => set({ [key]: value + 1 } as Partial<Genome>)} aria-label={`More ${label.toLowerCase()}`} data-testid={`${testid}-plus`}>+</button>
      </div>
    </div>
  );
  return (
    <div className="grid gap-2" data-testid="we-saw">
      <div className="text-xs font-bold text-muted">{title}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {step('Eyes', genome.eyecount, MAX_EYES, 'eyecount', 'eyes')}
        {step('Legs', genome.legs, MAX_LEGS, 'legs', 'legs')}
      </div>
      {genome.legs === 0 ? (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="How it moves">
          {GAITS.filter((g) => g !== 'walk').map((g) => (
            <button key={g} role="radio" aria-checked={genome.gait === g} onClick={() => onChange({ ...genome, gait: g })} data-testid={`gait-${g}`}
              className={cn('rounded-full border px-3 py-1.5 text-xs font-bold', genome.gait === g ? 'border-accent bg-accent/15' : 'border-line')}>{GAIT_INFO[g].emoji} {GAIT_INFO[g].label}</button>
          ))}
        </div>
      ) : <div className="text-[11px] text-muted">{GAIT_INFO.walk.emoji} Walks on {genome.legs} leg{genome.legs === 1 ? '' : 's'} — take them all away and it can roll, bounce, slither or hover instead.</div>}
    </div>
  );
}

const SWATCHES = [0, 20, 40, 55, 90, 140, 175, 200, 225, 260, 290, 320].map((h) => hsl(h, 70, 64)).concat(['#F5F0E6', '#C9B8A6', '#6B6F80', '#3A3F55']);

function Customizer({ genome, onChange }: { genome: Genome; onChange(g: Genome): void }) {
  const set = (p: Partial<Genome>) => onChange({ ...genome, ...p });
  const rows: { label: string; key: keyof Genome; options: readonly (string | number)[] }[] = useMemo(() => [
    { label: 'Body', key: 'body', options: BODIES }, { label: 'Eyes', key: 'eyes', options: EYES }, { label: 'Ears', key: 'ears', options: EARS },
    { label: 'Horns', key: 'horns', options: HORNS }, { label: 'Tail', key: 'tail', options: TAILS }, { label: 'Wings', key: 'wings', options: WINGS },
    { label: 'Pattern', key: 'pattern', options: PATTERNS },
  ], []);
  return (
    <section className="glass grid gap-4 rounded-3xl p-4" data-testid="studio-custom">
      <WeSaw genome={genome} onChange={onChange} title="Eyes, legs and how it moves" />
      {rows.map((r) => (
        <div key={r.key} className="grid gap-1.5">
          <div className="text-xs font-bold text-muted">{r.label}</div>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
            {r.options.map((o) => {
              const on = genome[r.key] === o;
              return (
                <button key={String(o)} onClick={() => set({ [r.key]: o } as Partial<Genome>)} aria-pressed={on} className={cn('flex shrink-0 flex-col items-center rounded-2xl border p-1 transition', on ? 'border-accent bg-accent/10' : 'border-line hover:border-line-strong')}>
                  <CreatureView genome={{ ...genome, [r.key]: o } as Genome} size={58} ground={false} />
                  <span className="pb-0.5 text-[10px] font-bold capitalize">{String(o)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {([['Body colour', 'color'], ['Belly', 'belly'], ['Accent', 'accent']] as const).map(([label, k]) => (
        <div key={k} className="grid gap-1.5">
          <div className="text-xs font-bold text-muted">{label}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {SWATCHES.map((c) => <button key={c} onClick={() => set({ [k]: c } as Partial<Genome>)} aria-label={`${label} ${c}`} className={cn('h-7 w-7 rounded-lg border-2', genome[k].toUpperCase() === c.toUpperCase() ? 'scale-110 border-white' : 'border-white/15')} style={{ background: c }} />)}
            <input type="color" value={genome[k]} onChange={(e) => set({ [k]: e.target.value.toUpperCase() } as Partial<Genome>)} className="h-7 w-9 cursor-pointer rounded-lg border border-line bg-transparent" aria-label={`Pick ${label}`} />
          </div>
        </div>
      ))}
      <div className="grid gap-1.5 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-bold text-muted">Size
          <input type="range" min={0.8} max={1.25} step={0.01} value={genome.size} onChange={(e) => set({ size: Number(e.target.value) })} className="accent-[var(--accent)]" />
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-muted"><input type="checkbox" checked={genome.cheeks} onChange={(e) => set({ cheeks: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" /> Rosy cheeks</label>
      </div>
      <div className="grid gap-1.5">
        <div className="text-xs font-bold text-muted">Personality</div>
        <div className="flex flex-wrap gap-1.5">
          {MOODS.map((m) => <button key={m} onClick={() => set({ mood: m })} aria-pressed={genome.mood === m} className={cn('rounded-full border px-3 py-1.5 text-xs font-bold', genome.mood === m ? 'border-accent bg-accent/15' : 'border-line')}>{MOOD_INFO[m].emoji} {MOOD_INFO[m].label}</button>)}
        </div>
      </div>
    </section>
  );
}
