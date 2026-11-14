// Arcade secrets: the hidden things in every arcade. Each one has its own look here, so it's easy to find, and its
// own visual editor for how it's found (the recipe the server keeps — players never see it), what it pays, its
// games' tuning and who's found it. Saved settings reach every player straight away.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Dice5, RotateCcw, Save, UserMinus, UserPlus } from 'lucide-react';
import { toGameError } from '../../../src/backend/backend';
import { TRACKS } from '../../../src/arcade/music';
import { Button, PlayerAvatar, Switch } from '../../../src/ui';
import { cn } from '../../../src/lib/utils';
import { portal, type HallCabinet, type SecretRow, type SecretsAdmin } from '../../shared/api';
import { ago } from '../../shared/format';
import { Badge, PageHeader, Panel, Q, useDebounced } from '../../shared/ui';

const LOGO = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF'];
/** each secret's identity: colours, emblem, the words for it */
const LOOK: Record<string, { name: string; tag: string; color: string; ink: string; bg: string; unlocks: string; emblem: () => ReactNode }> = {
  mirror: {
    name: 'The Mirror Arcade', tag: 'Through the glass', color: '#9FD8FF', ink: '#06121E', bg: 'linear-gradient(135deg, #DDE8FF 0%, #7FB8FF 45%, #1C3A66 100%)',
    unlocks: 'A mirrored second arcade: every cabinet flipped with a twist, plus Twin Drops, Glass Breaker, Flipside and Symmetry.',
    emblem: () => (
      <svg viewBox="0 0 64 64" className="h-full w-full"><rect x="14" y="6" width="36" height="52" rx="18" fill="#E8F2FF" stroke="#1C3A66" strokeWidth="3" />
        <path d="M22 18 L30 12 M20 30 L36 16 M24 44 L44 24" stroke="#7FB8FF" strokeWidth="3" strokeLinecap="round" /><path d="M32 30 L40 38 L34 50" stroke="#1C3A66" strokeWidth="1.6" fill="none" /></svg>
    ),
  },
  founder: {
    name: 'The Founder’s Code', tag: 'Trace the L', color: '#3DDC97', ink: '#04140C', bg: `linear-gradient(135deg, ${LOGO.join(', ')})`,
    unlocks: 'LAND GRAB rises out of the floor by the front door: claim land with ink, map after map.',
    emblem: () => (
      <svg viewBox="0 0 64 64" className="h-full w-full"><rect x="2" y="2" width="60" height="60" rx="14" fill="#0B1230" />
        {[[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]].map(([c, r], i) => <rect key={i} x={9 + c * 16} y={9 + r * 16} width="14" height="14" rx="4" fill={LOGO[i]} />)}</svg>
    ),
  },
  backroom: {
    name: 'The Back Room', tag: 'Admit one', color: '#FFB13D', ink: '#1A1208', bg: 'radial-gradient(130% 120% at 30% 0%, #FFCB78 0%, #A0661C 40%, #2A1A08 100%)',
    unlocks: 'A hidden door by the jukebox opens onto the back room and PROTO-0: a broken prototype full of microgames.',
    emblem: () => (
      <svg viewBox="0 0 64 64" className="h-full w-full"><rect x="16" y="10" width="32" height="48" rx="2" fill="#2A1A08" stroke="#FFCB78" strokeWidth="2" />
        <rect x="20" y="14" width="24" height="40" fill="#FFB13D" opacity="0.85" /><circle cx="40" cy="36" r="2" fill="#2A1A08" /><line x1="32" y1="0" x2="32" y2="8" stroke="#FFCB78" strokeWidth="1.5" /><circle cx="32" cy="9" r="3" fill="#FFF3C4" /></svg>
    ),
  },
  bside: {
    name: 'The B-Side', tag: 'Flip the record', color: '#B57BFF', ink: '#0B0620', bg: 'radial-gradient(130% 120% at 70% 0%, #D9B8FF 0%, #7A4BD6 40%, #120A2E 100%)',
    unlocks: 'Every jukebox song gets a rhythm chart played on the arcade’s own cabinets, plus Track 00.',
    emblem: () => (
      <svg viewBox="0 0 64 64" className="h-full w-full"><circle cx="32" cy="32" r="28" fill="#120A2E" stroke="#D9B8FF" strokeWidth="2" />
        {[22, 16, 10].map((r) => <circle key={r} cx="32" cy="32" r={r} fill="none" stroke="#3A2A6E" strokeWidth="1.2" />)}<circle cx="32" cy="32" r="7" fill="#B57BFF" /><circle cx="32" cy="32" r="1.6" fill="#120A2E" /></svg>
    ),
  },
};
const ZONES: { id: string; label: string; x: number; y: number; w: number; h: number }[] = [
  { id: 'back-left', label: 'Back left', x: 0, y: 0, w: 20, h: 20 }, { id: 'back-right', label: 'Back right', x: 80, y: 0, w: 20, h: 20 },
  { id: 'center', label: 'Middle', x: 35, y: 35, w: 30, h: 30 }, { id: 'chute', label: 'The prize chute', x: 0, y: 80, w: 20, h: 20 }, { id: 'front-right', label: 'Front right', x: 80, y: 80, w: 20, h: 20 },
];
const JUKEBOX = TRACKS.filter((t) => !t.home && !t.game);
const num = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString());

/** a short sentence for how a secret is found, from its recipe */
function recipeLine(id: string, cfg: Record<string, any>, cabs: HallCabinet[]): string {
  const name = (g: string) => cabs.find((c) => c.id === g)?.name ?? g;
  if (id === 'mirror') return (cfg.recipe ?? []).map((step: string[]) => step.map(name).join(' / ')).join('  →  ');
  if (id === 'founder') {
    const cells = (cfg.shape ?? []) as [number, number][];
    const at = (c: number, r: number) => cabs.find((x) => x.cell?.[0] === c && x.cell?.[1] === r);
    return `${cells.length} cabinets in this shape${cfg.any_position ? ' (anywhere on the floor)' : ''}: ${cells.map(([c, r]) => at(c, r)?.emoji ?? '·').join(' → ')}`;
  }
  if (id === 'backroom') return `Claw Crane: drop at ${ZONES.find((z) => z.id === cfg.zone)?.label.toLowerCase() ?? cfg.zone} on all ${cfg.goes} goes → a token for ${cfg.token_minutes} min → feed it to the ticket machine`;
  if (id === 'bside') return `${(cfg.songs ?? []).map((s: string) => TRACKS.find((t) => t.id === s)?.emoji ?? s).join(' → ')} (${cfg.min_seconds}s each), then three quick thumps on the jukebox`;
  return '';
}

export default function Secrets() {
  const q = useQuery({ queryKey: ['admin', 'secrets'], queryFn: portal.secrets });
  const [sp, setSp] = useSearchParams();
  const sel = sp.get('s') ?? 'mirror';
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Arcade secrets" sub="The hidden things in every arcade. Players are never told they exist; only finders see them. Each recipe lives on the server only — change it any time, and finders keep what they found." />
      <Q q={q}>{(d) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="secret-cards">
            {d.secrets.map((s) => <SecretCard key={s.id} s={s} cabs={d.cabinets} on={sel === s.id} onPick={() => { setScrollTo(s.id); setSp({ s: s.id }); }} />)}
          </div>
          {d.secrets.filter((s) => s.id === sel).map((s) => <Editor key={s.id + s.updated_at} s={s} cabs={d.cabinets} scroll={scrollTo === s.id} onScrolled={() => setScrollTo(null)} />)}
        </>
      )}</Q>
    </>
  );
}

function SecretCard({ s, cabs, on, onPick }: { s: SecretRow; cabs: HallCabinet[]; on: boolean; onPick(): void }) {
  const L = LOOK[s.id] ?? LOOK.mirror;
  return (
    <button onClick={onPick} data-testid={`secret-card-${s.id}`}
      className={cn('group relative overflow-hidden rounded-2xl p-4 text-left transition', on ? 'ring-2 ring-offset-2 ring-offset-[var(--bg)]' : 'opacity-90 hover:opacity-100')}
      style={{ background: L.bg, color: L.ink, ['--tw-ring-color' as string]: L.color }}>
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 shrink-0 drop-shadow-lg">{L.emblem()}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-widest opacity-75">{L.tag}</div>
          <div className="font-display text-lg font-black leading-tight">{L.name}</div>
          <span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-black', s.cfg.enabled ? 'bg-black/70 text-white' : 'bg-white/70 text-black')}>{s.cfg.enabled ? '● ON' : '○ OFF'}</span>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-[12px] font-semibold opacity-85">{recipeLine(s.id, s.cfg, cabs)}</p>
      <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-xl bg-black/55 p-2 text-white">
        <Mini label="Finders" v={num(s.stats.finders)} sub={s.stats.finders_7d ? `+${s.stats.finders_7d} this week` : 'none this week'} />
        <Mini label="Plays 24h" v={num(s.stats.plays_24h)} sub={`${num(s.stats.players_24h)} players`} />
        <Mini label="Ink paid" v={num(s.stats.ink)} sub={`${num(s.stats.ink_7d)} this week`} />
      </div>
    </button>
  );
}
const Mini = ({ label, v, sub }: { label: string; v: ReactNode; sub: string }) => (
  <div className="min-w-0"><div className="text-[10px] font-semibold opacity-70">{label}</div><div className="font-display text-base font-black tnum">{v}</div><div className="truncate text-[9.5px] opacity-60">{sub}</div></div>
);

function Editor({ s, cabs, scroll, onScrolled }: { s: SecretRow; cabs: HallCabinet[]; scroll: boolean; onScrolled(): void }) {
  const qc = useQueryClient();
  const ref = useRef<HTMLElement>(null);
  // picking a card brings its editor into view (on a phone it's below all four cards)
  useEffect(() => { if (scroll) { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); onScrolled(); } }, [scroll]); // eslint-disable-line react-hooks/exhaustive-deps
  const L = LOOK[s.id] ?? LOOK.mirror;
  const [cfg, setCfg] = useState<Record<string, any>>(() => structuredClone(s.cfg));
  const dirty = JSON.stringify(cfg) !== JSON.stringify(s.cfg);
  const [busy, setBusy] = useState(false);
  const set = (patch: Record<string, any>) => setCfg((c) => ({ ...c, ...patch }));
  const save = async () => {
    setBusy(true);
    try { const r = await portal.secretSave(s.id, cfg); qc.setQueryData<SecretsAdmin>(['admin', 'secrets'], r); toast.success(`${L.name} saved — live for every player now`); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return (
    <section ref={ref} className="mt-4 scroll-mt-20 overflow-hidden rounded-2xl border border-line" data-testid={`secret-editor-${s.id}`}>
      <div className="flex flex-wrap items-center gap-3 p-4" style={{ background: L.bg, color: L.ink }}>
        <div className="h-12 w-12 drop-shadow-lg">{L.emblem()}</div>
        <div className="min-w-0 flex-1"><div className="font-display text-xl font-black">{L.name}</div><div className="text-[12.5px] font-semibold opacity-85">{L.unlocks}</div></div>
        <div className="flex items-center gap-2 rounded-xl bg-black/55 px-3 py-2 text-white">
          <Switch id={`on-${s.id}`} label="Switched on" checked={!!cfg.enabled} onCheckedChange={(v) => set({ enabled: v })} />
        </div>
      </div>
      <div className="grid gap-3 bg-surface/40 p-3 xl:grid-cols-[1.4fr_1fr]">
        <Panel title={<span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: L.color }} />How it’s found</span>}
          actions={<Button size="sm" onClick={() => set(reroll(s.id, cfg, cabs))} data-testid="secret-reroll"><Dice5 className="h-4 w-4" /> Re-roll</Button>}>
          {s.id === 'mirror' && <MirrorRecipe cfg={cfg} set={set} cabs={cabs} />}
          {s.id === 'founder' && <FounderRecipe cfg={cfg} set={set} cabs={cabs} />}
          {s.id === 'backroom' && <BackroomRecipe cfg={cfg} set={set} />}
          {s.id === 'bside' && <BSideRecipe cfg={cfg} set={set} />}
          {'window_minutes' in cfg && (
            <label className="mt-3 flex items-center gap-2 text-sm">All within <input type="number" min={1} max={1440} className="p-input w-20" value={cfg.window_minutes} onChange={(e) => set({ window_minutes: Number(e.target.value) })} /> minutes, in one arcade, every round scoring.</label>
          )}
          <p className="mt-3 rounded-xl bg-surface-2/60 p-2.5 text-[12.5px] text-muted"><b className="text-fg">Right now:</b> {recipeLine(s.id, cfg, cabs)}</p>
        </Panel>
        <Panel title="What it pays">
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm"><span className="p-label">Finder’s bounty (one time, Ink)</span>
              <input type="number" min={0} max={100000} className="p-input" value={cfg.bounty} onChange={(e) => set({ bounty: Number(e.target.value) })} data-testid="secret-bounty" /></label>
            <label className="grid gap-1 text-sm"><span className="p-label">Ink multiplier on its games (× an ordinary cabinet’s Ink per point)</span>
              <div className="flex items-center gap-2"><input type="range" min={0} max={10} step={0.5} value={cfg.ink_mult} onChange={(e) => set({ ink_mult: Number(e.target.value) })} className="flex-1" style={{ accentColor: L.color }} />
                <input type="number" min={0} max={20} step={0.5} className="p-input w-20" value={cfg.ink_mult} onChange={(e) => set({ ink_mult: Number(e.target.value) })} data-testid="secret-mult" /></div></label>
            <Switch id={`unc-${s.id}`} label="Uncapped" hint="No daily cap and no Ink Flow pacing, whatever the Ink Flow switch says." checked={cfg.uncapped !== false} onCheckedChange={(v) => set({ uncapped: v })} />
            {cfg.uncapped === false && (
              <label className="grid gap-1 text-sm"><span className="p-label">Daily cap per player (Ink from its games; 0 = none, paced like other Ink)</span>
                <input type="number" min={0} className="p-input" value={cfg.daily_cap ?? 0} onChange={(e) => set({ daily_cap: Number(e.target.value) })} /></label>
            )}
            {s.id === 'mirror' && (
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-sm"><span className="p-label">Mirrored cabinets: shortest round (× usual)</span><input type="number" step={0.05} min={0.1} max={1} className="p-input" value={cfg.pace_slack} onChange={(e) => set({ pace_slack: Number(e.target.value) })} /></label>
                <label className="grid gap-1 text-sm"><span className="p-label">…and points a second (× usual)</span><input type="number" step={0.1} min={1} max={5} className="p-input" value={cfg.pace_room} onChange={(e) => set({ pace_room: Number(e.target.value) })} /></label>
              </div>
            )}
          </div>
        </Panel>
        <Panel className="xl:col-span-2" title={s.id === 'mirror' ? 'Its own four cabinets' : 'Its game'} pad={false}>
          <Games cfg={cfg} set={set} stats={s.stats.games} />
        </Panel>
        <Finders s={s} />
        <Panel title="Played most">
          <div className="grid gap-1.5">
            {Object.entries(s.stats.games).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([g, n]) => {
              const max = Math.max(...Object.values(s.stats.games), 1);
              return <div key={g} className="flex items-center gap-2 text-sm"><span className="w-32 truncate">{cabs.find((c) => c.id === g)?.emoji ?? '✦'} {cfg.games?.[g]?.name ?? cabs.find((c) => c.id === g)?.name ?? g}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: L.color }} /></div><span className="w-12 text-right tnum">{num(n)}</span></div>;
            })}
            {!Object.keys(s.stats.games).length && <p className="text-sm text-muted">Nobody’s played in here yet.</p>}
            {s.id === 'backroom' && s.stats.tokens != null && <p className="mt-1 text-xs text-muted">🪙 {s.stats.tokens} rusty token{s.stats.tokens === 1 ? '' : 's'} out right now.</p>}
          </div>
        </Panel>
      </div>
      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-line bg-surface/95 p-3">
        <span className="mr-auto text-xs text-muted">Last saved {ago(s.updated_at)}{s.updated_by ? ` by @${s.updated_by.username}` : ''}</span>
        <Button size="sm" variant="ghost" disabled={!dirty || busy} onClick={() => setCfg(structuredClone(s.cfg))}><RotateCcw className="h-4 w-4" /> Undo changes</Button>
        <Button size="sm" variant="primary" disabled={!dirty} loading={busy} onClick={save} data-testid="secret-save"><Save className="h-4 w-4" /> Save {L.name}</Button>
      </div>
    </section>
  );
}

// ---- the recipe editors -----------------------------------------------------------------------------------------
function MirrorRecipe({ cfg, set, cabs }: { cfg: Record<string, any>; set(p: Record<string, any>): void; cabs: HallCabinet[] }) {
  const recipe = (cfg.recipe ?? []) as string[][];
  const put = (r: string[][]) => set({ recipe: r });
  return (
    <div className="grid gap-2" data-testid="mirror-recipe">
      <p className="text-[12.5px] text-muted">Five rounds in a row, in this order. Any cabinet ticked in a step counts for it (the logo’s colours by default).</p>
      {recipe.map((step, i) => (
        <div key={i} className="flex items-start gap-2 rounded-xl border border-line p-2">
          <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black text-black" style={{ background: LOGO[i % 5] }}>{i + 1}</span>
          <div className="flex flex-1 flex-wrap gap-1">
            {cabs.map((c) => {
              const on = step.includes(c.id);
              return <button key={c.id} title={c.name} onClick={() => put(recipe.map((st, j) => (j !== i ? st : on ? st.filter((x) => x !== c.id) : [...st, c.id])))}
                className={cn('rounded-lg border px-1.5 py-0.5 text-[12px]', on ? 'border-transparent font-bold text-black' : 'border-line text-muted')} style={on ? { background: c.color } : undefined}>{c.emoji}{on ? ` ${c.name}` : ''}</button>;
            })}
          </div>
          <button className="p-chip" disabled={recipe.length < 2} onClick={() => put(recipe.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      {recipe.length < 9 && <button className="p-chip w-fit" onClick={() => put([...recipe, []])}>+ Add a step</button>}
    </div>
  );
}

const SHAPES: Record<string, [number, number][]> = {
  'The logo’s L': [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], 'Backwards J': [[2, 0], [2, 1], [2, 2], [1, 2], [0, 2]], 'T': [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]], 'Zig-zag': [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]],
};
function FounderRecipe({ cfg, set, cabs }: { cfg: Record<string, any>; set(p: Record<string, any>): void; cabs: HallCabinet[] }) {
  const shape = (cfg.shape ?? []) as [number, number][];
  const at = (c: number, r: number) => cabs.find((x) => x.cell?.[0] === c && x.cell?.[1] === r);
  const idx = (c: number, r: number) => shape.findIndex(([a, b]) => a === c && b === r);
  return (
    <div className="grid gap-3 md:grid-cols-[auto_1fr]" data-testid="founder-recipe">
      <div>
        <div className="mb-1 text-center text-[10.5px] font-bold uppercase tracking-widest text-muted">↑ back wall</div>
        <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-[#0B1230] p-2">
          {Array.from({ length: 16 }, (_, k) => {
            const c = k % 4, r = Math.floor(k / 4), cab = at(c, r), n = idx(c, r);
            return (
              <button key={k} onClick={() => set({ shape: n >= 0 ? shape.filter((_, j) => j !== n) : shape.length < 9 ? [...shape, [c, r]] : shape })} title={cab?.name}
                className={cn('relative grid h-16 w-16 place-items-center rounded-xl border text-2xl transition', n >= 0 ? 'border-transparent' : 'border-white/10 bg-white/5')}
                style={n >= 0 ? { background: LOGO[n % 5] } : undefined} data-testid={`founder-cell-${c}-${r}`}>
                <span>{cab?.emoji ?? '·'}</span>
                {n >= 0 && <span className="absolute left-1 top-0.5 text-[11px] font-black text-black">{n + 1}</span>}
                <span className="absolute inset-x-0 bottom-0.5 truncate px-0.5 text-[8.5px] font-semibold text-white/70">{cab?.name}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-1 text-center text-[10.5px] font-bold uppercase tracking-widest text-muted">front door ↓</div>
      </div>
      <div className="grid content-start gap-2 text-sm">
        <p className="text-[12.5px] text-muted">The hall’s floor plan as players walk in. Tap cabinets in the order they have to be played (tap again to take one out). The numbers are the order.</p>
        <div className="flex flex-wrap gap-1.5">{Object.entries(SHAPES).map(([n, sh]) => <button key={n} className="p-chip" onClick={() => set({ shape: sh })}>{n}</button>)}<button className="p-chip" onClick={() => set({ shape: [] })}>Clear</button></div>
        <Switch id="any-pos" label="Anywhere on the floor" hint="The shape counts wherever it fits on the 4×4 floor, not just where it’s drawn." checked={cfg.any_position !== false} onCheckedChange={(v) => set({ any_position: v })} />
        {shape.length < 2 && <p className="text-xs font-bold text-bad">Pick at least two cabinets.</p>}
      </div>
    </div>
  );
}

function BackroomRecipe({ cfg, set }: { cfg: Record<string, any>; set(p: Record<string, any>): void }) {
  return (
    <div className="grid gap-3 md:grid-cols-[auto_1fr]" data-testid="backroom-recipe">
      <div>
        <div className="mb-1 text-center text-[10.5px] font-bold uppercase tracking-widest text-muted">Claw Crane, from above · back</div>
        <svg viewBox="-4 -4 108 108" className="h-52 w-52 rounded-2xl bg-[#140F08]">
          <rect x="0" y="0" width="100" height="100" rx="4" fill="#1F1710" stroke="#FFB13D" strokeOpacity="0.4" />
          {['🧸', '🦄', '🐸', '🐙', '🍩', '🐱'].map((e, i) => <text key={i} x={28 + (i % 3) * 22} y={34 + Math.floor(i / 3) * 30} fontSize="12" textAnchor="middle" opacity="0.5">{e}</text>)}
          {ZONES.map((z) => {
            const on = cfg.zone === z.id;
            return (
              <g key={z.id} onClick={() => set({ zone: z.id })} style={{ cursor: 'pointer' }} data-testid={`zone-${z.id}`}>
                <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="3" fill={on ? '#FFB13D' : '#FFB13D'} fillOpacity={on ? 0.85 : 0.12} stroke="#FFB13D" strokeOpacity={on ? 1 : 0.4} />
                {z.id === 'chute' && <text x={z.x + z.w / 2} y={z.y + z.h / 2 + 3} fontSize="7" textAnchor="middle" fill={on ? '#2A1A08' : '#FFCB78'} fontWeight="800">CHUTE</text>}
              </g>
            );
          })}
        </svg>
        <div className="mt-1 text-center text-[10.5px] font-bold uppercase tracking-widest text-muted">front (where you stand)</div>
      </div>
      <div className="grid content-start gap-3 text-sm">
        <p className="text-[12.5px] text-muted">Tap where the claw has to drop. The claw starts over the prize chute, so “the prize chute” means: don’t move it at all.</p>
        <label className="flex items-center gap-2">On the last <input type="number" min={1} max={10} className="p-input w-16" value={cfg.goes} onChange={(e) => set({ goes: Number(e.target.value) })} /> goes of one round (Classic has 5)</label>
        <label className="flex items-center gap-2">The rusty token keeps for <input type="number" min={1} max={240} className="p-input w-16" value={cfg.token_minutes} onChange={(e) => set({ token_minutes: Number(e.target.value) })} /> minutes</label>
        <p className="text-[12.5px] text-muted">Then it has to be fed to the ticket machine (back right). The ticket it prints opens the panel by the jukebox.</p>
      </div>
    </div>
  );
}

function BSideRecipe({ cfg, set }: { cfg: Record<string, any>; set(p: Record<string, any>): void }) {
  const songs = (cfg.songs ?? []) as string[];
  const move = (i: number, d: number) => { const s = [...songs]; const j = i + d; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; set({ songs: s }); };
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_1fr]" data-testid="bside-recipe">
      <div className="grid content-start gap-1.5">
        <p className="text-[12.5px] text-muted">The songs to put on, in this order (each one also becomes a B-side chart, unlocked in this order):</p>
        {songs.map((id, i) => {
          const t = TRACKS.find((x) => x.id === id);
          return (
            <div key={id} className="flex items-center gap-2 rounded-xl border border-line px-2 py-1.5">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-[#B57BFF] text-[11px] font-black text-black">{i + 1}</span>
              <span className="text-xl">{t?.emoji}</span><span className="flex-1 text-sm font-semibold">{t?.name ?? id}<span className="ml-1.5 text-xs text-muted">{t?.bpm} BPM</span></span>
              <button className="p-chip !h-7 !px-1.5" onClick={() => move(i, -1)} aria-label="Earlier"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button className="p-chip !h-7 !px-1.5" onClick={() => move(i, 1)} aria-label="Later"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button className="p-chip !h-7" disabled={songs.length <= 2} onClick={() => set({ songs: songs.filter((x) => x !== id) })}>Remove</button>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-1.5">{JUKEBOX.filter((t) => !songs.includes(t.id)).map((t) => <button key={t.id} className="p-chip" onClick={() => set({ songs: [...songs, t.id] })}>+ {t.emoji} {t.name}</button>)}</div>
      </div>
      <div className="grid content-start gap-3 text-sm">
        <label className="flex items-center gap-2">Each song has to play for at least <input type="number" min={1} max={300} className="p-input w-16" value={cfg.min_seconds} onChange={(e) => set({ min_seconds: Number(e.target.value) })} /> seconds</label>
        <p className="text-[12.5px] text-muted">Then three quick taps on the jukebox itself (a thump). Default: slowest to fastest — “start slow, end on fire”.</p>
        <button className="p-chip w-fit" onClick={() => set({ songs: [...JUKEBOX].sort((a, b) => a.bpm - b.bpm).map((t) => t.id) })}>Slowest to fastest</button>
      </div>
    </div>
  );
}

function reroll(id: string, cfg: Record<string, any>, cabs: HallCabinet[]): Record<string, any> {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  if (id === 'mirror') return { recipe: Array.from({ length: 5 }, () => { const c = pick(cabs); return cabs.filter((x) => x.color === c.color).map((x) => x.id); }) };
  if (id === 'founder') {
    // a random path of five neighbouring cabinets on the floor
    for (let tries = 0; tries < 200; tries++) {
      const path: [number, number][] = [[Math.floor(Math.random() * 4), Math.floor(Math.random() * 4)]];
      while (path.length < 5) {
        const [c, r] = path[path.length - 1];
        const next = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([dx, dy]) => [c + dx, r + dy] as [number, number]).filter(([x, y]) => x >= 0 && y >= 0 && x < 4 && y < 4 && !path.some(([a, b]) => a === x && b === y));
        if (!next.length) break; path.push(pick(next));
      }
      if (path.length === 5) return { shape: path, any_position: false };
    }
    return {};
  }
  if (id === 'backroom') return { zone: pick(ZONES.filter((z) => z.id !== cfg.zone)).id };
  if (id === 'bside') return { songs: [...(cfg.songs ?? [])].sort(() => Math.random() - 0.5) };
  return {};
}

function Games({ cfg, set, stats }: { cfg: Record<string, any>; set(p: Record<string, any>): void; stats: Record<string, number> }) {
  const games = (cfg.games ?? {}) as Record<string, Record<string, any>>;
  const put = (g: string, k: string, v: number) => set({ games: { ...games, [g]: { ...games[g], [k]: v } } });
  const COLS: [string, string, number][] = [['min_seconds', 'Shortest round (s)', 1], ['max_score', 'Top score (Classic)', 100], ['per_second', 'Most points a second', 1], ['tickets_per_point', 'Tickets a point', 0.005], ['points_per_ink', 'Points for 1 Ink (before ×)', 50]];
  return (
    <div className="p-scroll">
      <table className="p-table" data-testid="secret-games">
        <thead><tr><th>Game</th>{COLS.map(([, l]) => <th key={l}>{l}</th>)}<th>≈ Ink per 1,000 points</th><th>Rounds</th></tr></thead>
        <tbody>
          {Object.entries(games).map(([g, x]) => (
            <tr key={g}>
              <td className="whitespace-nowrap font-semibold">{x.emoji} {x.name ?? g}</td>
              {COLS.map(([k, , st]) => <td key={k}><input type="number" step={st} min={0} className="p-input w-24" value={x[k] ?? 0} onChange={(e) => put(g, k, Number(e.target.value))} /></td>)}
              <td className="tnum font-bold">{x.points_per_ink ? ((1000 * (cfg.ink_mult ?? 1)) / x.points_per_ink).toFixed(2) : '—'}</td>
              <td className="tnum text-muted">{num(Object.entries(stats).filter(([k]) => k.split('.')[0] === g).reduce((n, [, v]) => n + v, 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Finders({ s }: { s: SecretRow }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const found = useQuery({ queryKey: ['portal', 'players', 'secret', dq], queryFn: () => portal.players({ q: dq, limit: 6 }), enabled: dq.length >= 2 });
  const finder = async (player: string, on: boolean) => {
    try { await portal.secretFinder(s.id, player, on); toast.success(on ? 'Given — they can use it now (no bounty)' : 'Taken away'); void qc.invalidateQueries({ queryKey: ['admin', 'secrets'] }); }
    catch (e) { toast.error(toGameError(e).message); }
  };
  return (
    <Panel title={`Finders · ${num(s.stats.finders)}`}>
      <div className="mb-2 flex gap-2">
        <input className="p-input flex-1" placeholder="Give it to a player… (username)" value={q} onChange={(e) => setQ(e.target.value)} data-testid="secret-finder-search" />
      </div>
      {dq.length >= 2 && found.data && (
        <div className="mb-3 grid gap-1">
          {found.data.rows.map((p: any) => (
            <div key={p.id} className="flex items-center gap-2 rounded-xl bg-surface-2/60 px-2 py-1.5 text-sm"><span className="flex-1">@{p.username}</span>
              <button className="p-chip" onClick={() => void finder(p.id, true)}><UserPlus className="h-3.5 w-3.5" /> Give</button></div>
          ))}
          {!found.data.rows.length && <p className="text-xs text-muted">Nobody called that.</p>}
        </div>
      )}
      <div className="grid max-h-80 gap-1 overflow-y-auto">
        {s.stats.recent.map((r) => (
          <div key={r.player.id} className="flex items-center gap-2 rounded-xl px-1 py-1 text-sm hover:bg-surface-2/50">
            <PlayerAvatar p={r.player as any} size={24} /><Link to={`/players/${r.player.id}`} className="flex-1 truncate hover:text-accent-2">@{r.player.username}</Link>
            <span className="text-xs text-muted">{ago(r.found_at)}</span>
            <button className="p-chip !h-7" title="Take it away" onClick={() => void finder(r.player.id, false)}><UserMinus className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        {!s.stats.recent.length && <p className="text-sm text-muted">Nobody’s found it yet.</p>}
      </div>
      <p className="mt-2 text-[11.5px] text-muted"><Badge tone="muted">Hidden</Badge> Players are never told who found what — there’s no “first finder” anywhere in the game.</p>
    </Panel>
  );
}

