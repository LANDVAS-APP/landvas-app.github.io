// Each star-only plot type's own panel (yours to run, in the plot's sheet): the Forge, the Grove, the Ranch, Starsong,
// the Sail Yard, the Observatory, the Hatchery, the Stargate and the Starbeam Lens. And the star's own rules, for any of
// your plots on it (StarNaturePanel): flares, eclipses, a pulsar's beat, a black hole's pull on time, lighting the star.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../../backend/api';
import { toGameError } from '../../backend/backend';
import { celebrate, invalidateGame } from '../../lib/queries';
import { cn } from '../../lib/utils';
import { lngLatToCell } from '../../shared/grid';
import { useExplorer } from '../../explorer/explorer';
import { buzz } from '../../native/native';
import { CODEX_ORDER, EL, ELEMENTS, LADDER, SPECIES, until } from './meta';
import { playLoops, pluck, tick } from '../starsong';
import type { Els, StarActResult, StarCard, StarNature, StarPlotView } from '../types';

type Act = (action: string, args?: Record<string, unknown>) => Promise<StarActResult | null>;

/** the plot's page, and a way to act on it (the answer updates the page) */
function usePlot(card: StarCard, cell: number) {
  const qc = useQueryClient();
  const key = ['star-plot', card.id, cell];
  const q = useQuery({ queryKey: key, queryFn: () => api.starPlot(card.id, cell), refetchInterval: 30_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const act: Act = async (action, args = {}) => {
    setBusy(action);
    try {
      const r = await api.starAct(card.id, cell, action, args);
      qc.setQueryData<StarPlotView>(key, (old) => (old ? { ...old, view: r.view, nature: r.nature } : old));
      celebrate(r.achievements);
      invalidateGame(qc);
      void qc.invalidateQueries({ queryKey: ['my-star-things'] });
      buzz('light');
      return r;
    } catch (e) { toast.error(toGameError(e).message); return null; }
    finally { setBusy(null); }
  };
  return { q, act, busy, view: q.data?.view ?? null, nature: q.data?.nature ?? card.nature ?? {} };
}
/** a clock that ticks once a second while it's on screen (for countdowns) */
function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) setN(Date.now()); }, ms); return () => clearInterval(t); }, [ms]);
  return n;
}

const Box = ({ children, className, testid }: { children: React.ReactNode; className?: string; testid?: string }) =>
  <div className={cn('grid gap-2 rounded-2xl bg-white/6 p-3 text-[12.5px]', className)} data-testid={testid}>{children}</div>;
const Btn = ({ children, onClick, disabled, on, testid, className }: { children: React.ReactNode; onClick(): void; disabled?: boolean; on?: boolean; testid?: string; className?: string }) =>
  <button className={cn('lv-btn h-10 px-3 text-[13px]', on && 'on', className)} disabled={disabled} onClick={onClick} data-testid={testid}>{children}</button>;
const Chip = ({ el, n, dim }: { el: string; n: number; dim?: boolean }) => (
  <span className={cn('inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-[11.5px] font-bold tabular-nums', dim && 'opacity-35')}>
    <span className="grid h-4 min-w-4 place-items-center rounded-full px-0.5 text-[9px] font-black text-[#0b0b1e]" style={{ background: EL[el]?.color }}>{EL[el]?.sym}</span>{n.toLocaleString()}
  </span>
);
function ElsRow({ els, top }: { els?: Els | null; top?: string }) {
  if (!els) return null;
  const ti = top ? LADDER.indexOf(top as (typeof LADDER)[number]) : 99;
  return <div className="flex flex-wrap gap-1">{ELEMENTS.map((e, i) => (e.id === 'au' && !els.au ? null : <Chip key={e.id} el={e.id} n={Number(els[e.id] ?? 0)} dim={e.id !== 'au' && i > ti} />))}</div>;
}

export default function KindPanel({ card, cell, kind }: { card: StarCard; cell: number; kind: string; meId: string | null }) {
  const P = usePlot(card, cell);
  if (!P.view) return <Box>Looking…</Box>;
  const props = { card, cell, view: P.view, act: P.act, busy: P.busy, nature: P.nature };
  switch (kind) {
    case 'forge': return <Forge {...props} />;
    case 'grove': return <Grove {...props} />;
    case 'ranch': return <Ranch {...props} />;
    case 'song': return <Song {...props} />;
    case 'sails': return <Sails {...props} />;
    case 'observatory': return <Observatory {...props} />;
    case 'hatchery': return <Hatchery {...props} />;
    case 'gate': return <Gate {...props} />;
    case 'lens': return <Lens {...props} />;
    default: return null;
  }
}
type PP = { card: StarCard; cell: number; view: Record<string, any>; act: Act; busy: string | null; nature: StarNature };

// ---- 🔥 Fusion Forge -----------------------------------------------------------------------------------------------
function Forge({ view, act, busy }: PP) {
  const top: string = view.top;
  const ti = LADDER.indexOf(top as (typeof LADDER)[number]);
  const els: Els | undefined = view.els;
  const ratio = Number(view.ratio ?? 4);
  return (
    <Box testid="kind-forge">
      <div className="flex items-center justify-between">
        <div><div className="font-black">🔥 Fusion Forge</div><div className="text-[11px] text-white/55">{Number(view.rate).toFixed(1)} hydrogen an hour · this star fuses up to <b>{EL[top]?.name}</b>{view.flare ? ' · ☀️ flaring: double!' : ''}</div></div>
        <Btn on disabled={!view.ready || !!busy} onClick={() => void act('collect').then((r) => r && toast.success(`+${r.result.h} hydrogen`))} testid="forge-collect">Collect {Number(view.ready).toLocaleString()} H</Btn>
      </div>
      <ElsRow els={els} top={top} />
      <div className="grid gap-1">
        {LADDER.slice(0, ti).map((e, i) => {
          const have = Number(els?.[e] ?? 0), next = LADDER[i + 1];
          return (
            <div key={e} className="flex items-center justify-between gap-2 rounded-xl bg-black/25 px-2.5 py-1.5">
              <span className="text-[12px]">{ratio} {EL[e].name} → 1 {EL[next].name}</span>
              <span className="flex gap-1">
                <button className="rounded-full bg-white/10 px-2.5 py-1 text-[11.5px] font-bold disabled:opacity-35" disabled={have < ratio || !!busy} onClick={() => void act('fuse', { from: e, times: 1 })} data-testid={`forge-fuse-${e}`}>Fuse</button>
                <button className="rounded-full bg-white/10 px-2.5 py-1 text-[11.5px] font-bold disabled:opacity-35" disabled={have < ratio * 10 || !!busy} onClick={() => void act('fuse', { from: e, times: 10 })}>×10</button>
              </span>
            </div>
          );
        })}
        {ti < LADDER.length - 1 && <div className="text-[11px] text-white/45">Heavier than {EL[top].name} takes a bigger star (a supergiant reaches iron).</div>}
      </div>
      {top === 'fe' && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-[#9C7BFF]/15 px-2.5 py-1.5">
          <span className="text-[12px]">{view.temper_iron} Iron → 1 <b>Starsteel</b> for your Crucible</span>
          <button className="rounded-full bg-[#9C7BFF]/40 px-2.5 py-1 text-[11.5px] font-bold disabled:opacity-35" disabled={!view.crucible || Number(els?.fe ?? 0) < Number(view.temper_iron) || !!busy}
            onClick={() => void act('temper').then((r) => r && toast.success('Starsteel is in your Crucible ✨'))} data-testid="forge-temper">{view.crucible ? 'Temper' : 'No Crucible'}</button>
        </div>
      )}
    </Box>
  );
}

// ---- 🌱 Lumen Grove ------------------------------------------------------------------------------------------------
function Grove({ view, act, busy }: PP) {
  const now = useNow();
  const sp = SPECIES[view.species] ?? SPECIES.sunglass_vine;
  const planted = !!view.planted_at;
  const pct = planted ? Math.min(1, (now - Date.parse(view.planted_at)) / (Number(view.grow_hours) * 3600_000)) : 0;
  const codex: Record<string, number> | undefined = view.codex;
  return (
    <Box testid="kind-grove">
      <div className="flex items-center justify-between gap-2">
        <div><div className="font-black">🌱 Lumen Grove · {sp.emoji} {sp.name}</div><div className="text-[11px] text-white/55">It grows in {sp.light} light{view.flare?.now ? ' — ☀️ the star is flaring: it blooms now!' : ''}</div></div>
        {!planted ? <Btn on disabled={!!busy} onClick={() => void act('plant')} testid="grove-plant">Plant</Btn>
          : view.ready ? <Btn on disabled={!!busy} onClick={() => void act('harvest').then((r) => r && toast.success(`${sp.emoji} ${sp.name} harvested`, { description: `+${r.result.ink} Ink · codex ${r.result.codex}/7` }))} testid="grove-harvest">Harvest</Btn>
          : <span className="text-[11px] font-bold text-white/60">ripe in {until(view.ripe_at, now)}</span>}
      </div>
      {planted && <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full transition-[width]" style={{ width: `${pct * 100}%`, background: sp.color }} /></div>}
      {codex && <div className="flex flex-wrap gap-1">{CODEX_ORDER.map((k) => <span key={k} title={SPECIES[k].name} className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', codex[k] ? 'bg-white/12' : 'bg-white/4 opacity-40')}>{SPECIES[k].emoji} {codex[k] ?? 0}</span>)}</div>}
      <div className="text-[10.5px] text-white/45">The codex wants every kind of light: claim a Grove under a red dwarf, a blue giant, a pulsar, a black hole…</div>
    </Box>
  );
}

// ---- ☄️ Comet Ranch ------------------------------------------------------------------------------------------------
function Ranch({ view, act, busy }: PP) {
  const now = useNow();
  const pass = view.pass as { now: boolean; next_at: string; until: string | null };
  const comets = (view.comets ?? []) as { id: number; name: string; period_h: number; back_at: string; returns: number }[];
  const back = comets.filter((c) => Date.parse(c.back_at) <= now).length;
  return (
    <Box testid="kind-ranch">
      <div className="flex items-center justify-between gap-2">
        <div><div className="font-black">☄️ Comet Ranch</div>
          <div className="text-[11px] text-white/55">{pass.now ? <b className="text-[#9DE4FF]">A comet is passing now — {until(pass.until, now)} left!</b> : `The next comet passes in ${until(pass.next_at, now)}`}</div></div>
        {pass.now && !view.caught_this_pass && comets.length < Number(view.max) && <Btn on disabled={!!busy} onClick={() => void act('catch').then((r) => r && toast.success(`You caught ${r.result.comet.name} ☄️`))} testid="ranch-catch">Catch it</Btn>}
      </div>
      {comets.length ? (
        <div className="grid gap-1">
          {comets.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl bg-black/25 px-2.5 py-1.5 text-[12px]">
              <span><b>{c.name}</b> <span className="text-white/50">· every {c.period_h} h · tail ×{1 + c.returns}</span></span>
              <span className={cn('text-[11px] font-bold', Date.parse(c.back_at) <= now ? 'text-[#3DDC97]' : 'text-white/55')}>{Date.parse(c.back_at) <= now ? 'back!' : `back in ${until(c.back_at, now)}`}</span>
            </div>
          ))}
        </div>
      ) : <div className="text-[11.5px] text-white/50">No comets yet. Catch one as it passes — it comes back on its own orbit.</div>}
      {back > 0 && <Btn on disabled={!!busy} onClick={() => void act('harvest').then((r) => r && toast.success(`${r.result.h} hydrogen from the ice`, { description: `+${r.result.ink} Ink` }))} testid="ranch-harvest">Gather the ice ({back})</Btn>}
    </Box>
  );
}

// ---- 🎵 Starsong ---------------------------------------------------------------------------------------------------
const STEPS = 16;
function Song({ view, act, busy, card }: PP) {
  const [loop, setLoop] = useState<string>(() => (String(view.loop || '').padEnd(STEPS, '.')).slice(0, STEPS));
  const [tempo, setTempo] = useState<number>(Number(view.tempo ?? 110));
  const [at, setAt] = useState(-1);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  const set = (i: number, n: number) => { const a = loop.split(''); a[i] = a[i] === String(n) ? '.' : String(n); setLoop(a.join('')); if (a[i] !== '.') pluck(card.m, n); };
  return (
    <Box testid="kind-song">
      <div className="flex items-center justify-between gap-2">
        <div><div className="font-black">🎵 Starsong</div><div className="text-[11px] text-white/55">This star’s own notes ({card.m >= 32 ? 'deep — a big star' : card.m <= 2 ? 'high — a small, dense star' : 'in the middle'}). Anyone looking at it hears your loop.</div></div>
        <Btn onClick={() => { stop.current?.(); stop.current = playLoops(card.m, [{ loop, tempo }], 2, setAt); }} testid="song-play">▶︎ Play</Btn>
      </div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${STEPS}, minmax(0, 1fr))` }}>
        {Array.from({ length: 8 }, (_, r) => 7 - r).map((n) => Array.from({ length: STEPS }, (_, i) => (
          <button key={`${n}-${i}`} aria-label={`step ${i + 1} note ${n + 1}`} onClick={() => set(i, n)}
            className={cn('aspect-square rounded-[4px]', loop[i] === String(n) ? 'bg-[#FFE14D]' : i === at ? 'bg-white/25' : i % 4 === 0 ? 'bg-white/12' : 'bg-white/6')} />
        )))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-white/50">Tempo</span>
        <input type="range" min={60} max={180} value={tempo} onChange={(e) => setTempo(Number(e.target.value))} className="min-w-0 flex-1" aria-label="Tempo" />
        <Btn on disabled={!!busy || !/[0-7]/.test(loop)} onClick={() => void act('compose', { loop: loop.replace(/\.+$/, '').padEnd(4, '.'), tempo }).then((r) => r && toast.success('Your star sings it now 🎵'))} testid="song-save">Save</Btn>
      </div>
    </Box>
  );
}

// ---- ⛵ Sail Yard --------------------------------------------------------------------------------------------------
function Sails({ view, act, busy }: PP) {
  const now = useNow();
  const [to, setTo] = useState('');
  const [el, setEl] = useState('he');
  const [n, setN] = useState(10);
  const els: Els | undefined = view.els;
  const flying = (view.flying ?? []) as { id: number; to: string; cargo: Record<string, number>; arrive_at: string }[];
  return (
    <Box testid="kind-sails">
      <div><div className="font-black">⛵ Sail Yard</div><div className="text-[11px] text-white/55">Starlight carries a sail of your elements to another player’s star (theirs to collect). This star launches at {Math.round(Number(view.speed)).toLocaleString()} light-years an hour.</div></div>
      <ElsRow els={els} />
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5">
        <input className="h-9 min-w-0 rounded-xl bg-black/40 px-3 text-[13px] outline-none" placeholder="@player" value={to} onChange={(e) => setTo(e.target.value.replace(/^@/, ''))} data-testid="sails-to" />
        <select className="h-9 rounded-xl bg-black/40 px-2 text-[13px]" value={el} onChange={(e) => setEl(e.target.value)} aria-label="Element">
          {ELEMENTS.map((e) => <option key={e.id} value={e.id}>{e.sym}</option>)}
        </select>
        <input type="number" min={1} max={Number(view.max_cargo ?? 1000)} className="h-9 w-20 rounded-xl bg-black/40 px-2 text-[13px] tabular-nums" value={n} onChange={(e) => setN(Math.max(1, Number(e.target.value) || 1))} aria-label="Amount" />
      </div>
      <Btn on disabled={!to || !!busy || Number(els?.[el as keyof Els] ?? 0) < n} onClick={() => void act('launch', { to, element: el, amount: n }).then((r) => r && toast.success(`The sail’s away ⛵`, { description: `It reaches @${to}’s star in ${until(r.result.arrive_at)}.` }))} testid="sails-launch">Launch the sail</Btn>
      {flying.length > 0 && <div className="grid gap-1">{flying.map((f) => <div key={f.id} className="flex justify-between rounded-xl bg-black/25 px-2.5 py-1.5 text-[12px]"><span>⛵ to @{f.to} · {Object.entries(f.cargo).map(([k, v]) => `${v} ${EL[k]?.sym}`).join(', ')}</span><span className="text-white/55">{until(f.arrive_at, now)}</span></div>)}</div>}
    </Box>
  );
}

// ---- 🔭 Observatory ------------------------------------------------------------------------------------------------
function Observatory({ view, act, busy }: PP) {
  const now = useNow();
  const nav = useNavigate();
  const ready = Date.parse(view.next_at) <= now;
  const tierName = ['', '', '', 'deep field', 'ultra deep', 'the far galaxy'][Number(view.reach)] ?? '';
  const finds = (view.finds ?? []) as { kind: string; data: Record<string, any>; at: string }[];
  const say = (f: { kind: string; data: Record<string, any> }) => f.kind === 'exoplanet' ? `🪐 An exoplanet: ${f.data.name} — yours to land on and claim` : f.kind === 'black_hole' ? `🕳️ A hidden black hole: ${f.data.code}` : f.kind === 'comet' ? (f.data.name ? `☄️ A stray comet, ${f.data.name}, herded to your ranch` : `☄️ A stray comet’s ice: +${f.data.h} H`) : `✨ A cluster’s light: +${f.data.h} H`;
  return (
    <Box testid="kind-observatory">
      <div className="flex items-center justify-between gap-2">
        <div><div className="font-black">🔭 Observatory</div><div className="text-[11px] text-white/55">Your telescope from Earth reaches <b>{tierName}</b>. {ready ? 'The sky’s ready for a survey.' : `Next survey in ${until(view.next_at, now)}.`}</div></div>
        <Btn on disabled={!ready || !!busy} onClick={() => void act('survey').then((r) => r && toast.success(say(r.result as never)))} testid="obs-survey">Survey</Btn>
      </div>
      {finds.length > 0 && <div className="grid gap-1">{finds.map((f, i) => (
        <div key={i} className="flex items-center justify-between gap-2 rounded-xl bg-black/25 px-2.5 py-1.5 text-[12px]">
          <span className="min-w-0">{say(f)}</span>
          {f.kind === 'exoplanet' && <button className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold" onClick={() => nav('/space')}>Fly there</button>}
          {f.kind === 'black_hole' && <button className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold" onClick={() => nav(`/star/${f.data.star}`)}>Go there</button>}
        </div>
      ))}</div>}
    </Box>
  );
}

// ---- 🐣 Plasma Hatchery --------------------------------------------------------------------------------------------
function Hatchery({ view, act, busy }: PP) {
  const now = useNow();
  const ready = Date.parse(view.next_at) <= now;
  return (
    <Box testid="kind-hatchery">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="grid h-11 w-9 place-items-center rounded-[50%_50%_45%_45%/60%_60%_40%_40%] shadow-[0_0_18px_var(--g)]" style={{ background: `radial-gradient(circle at 40% 35%, #fff, ${view.color} 45%, ${view.glow})`, ['--g' as string]: view.glow }} />
          <div><div className="font-black">🐣 Plasma Hatchery</div><div className="text-[11px] text-white/55">{ready ? 'An egg of light is ready.' : `The next egg in ${until(view.next_at, now)}.`} {Number(view.laid) ? `${view.laid} laid so far.` : ''}</div></div>
        </div>
        <Btn on disabled={!ready || !!busy} onClick={() => void act('collect').then((r) => r && toast.success('A plasma egg 🥚✨', { description: 'It’s with your Inkborn eggs — it hatches in a few hours.', action: { label: 'Eggs', onClick: () => location.assign('/inkborn') } }))} testid="hatch-collect">Collect</Btn>
      </div>
      <Link to="/inkborn" className="text-[11px] font-bold text-[#9DE4FF]">Your eggs and creatures →</Link>
    </Box>
  );
}

// ---- 🌀 Stargate ---------------------------------------------------------------------------------------------------
function Gate({ view, act, busy }: PP) {
  const others = (view.mine_elsewhere ?? []) as { star: number; cell: number; name: string }[];
  const link = view.link as { star: number; cell: number } | null;
  return (
    <Box testid="kind-gate">
      <div><div className="font-black">🌀 Stargate</div><div className="text-[11px] text-white/55">Others warp here for less fuel; you take {view.toll_pct}% of what they pay. Tolls so far: <b className="text-[#FFE28A]">{Number(view.tolls ?? 0).toLocaleString()} Ink</b>.</div></div>
      {link ? (
        <div className="flex items-center justify-between rounded-xl bg-[#22E3FF]/12 px-2.5 py-1.5 text-[12px]">
          <span>🛣️ A space highway to <b>{others.find((o) => o.star === link.star)?.name ?? `star ${link.star}`}</b>: a few seconds, a quarter of the fuel</span>
          <button className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold" disabled={!!busy} onClick={() => void act('unlink')}>Unlink</button>
        </div>
      ) : others.length ? (
        <div className="grid gap-1">
          <div className="text-[11px] text-white/50">Link it to another of your gates (a space highway between them):</div>
          {others.map((o) => <button key={`${o.star}:${o.cell}`} className="rounded-xl bg-black/25 px-2.5 py-1.5 text-left text-[12px] font-bold" disabled={!!busy} onClick={() => void act('link', { star: o.star, cell: o.cell })} data-testid="gate-link">🌀 {o.name}</button>)}
        </div>
      ) : <div className="text-[11px] text-white/50">Build a Stargate on a Keystone of another star to link the two.</div>}
    </Box>
  );
}

// ---- 🔦 Starbeam Lens ----------------------------------------------------------------------------------------------
function Lens({ view, act, busy }: PP) {
  const now = useNow();
  const here = useExplorer((s) => s.state);
  const ready = Date.parse(view.next_at) <= now;
  const beam = view.beam as { gx: number; gy: number; ends_at: string } | null;
  const focus = () => {
    if (!here) { toast('Your explorer has to be somewhere on Earth first'); return; }
    const c = lngLatToCell(here.lng, here.lat);
    void act('focus', { gx: c.gx, gy: c.gy }).then((r) => r && toast.success('The beam comes down where your explorer stands 🔦', { description: `For ${view.hours} h, claims under it roll a tier higher.` }));
  };
  return (
    <Box testid="kind-lens">
      <div><div className="font-black">🔦 Starbeam Lens</div><div className="text-[11px] text-white/55">Once a day, focus this star’s light on Earth for {view.hours} h: claims within ~{Math.round(Number(view.radius_plots) * 6.7)} m of it roll a tier higher, and anyone there in first person sees the beam come down out of the sky.</div></div>
      {beam && Date.parse(beam.ends_at) > now ? <div className="rounded-xl bg-[#FFE14D]/15 px-2.5 py-1.5 text-[12px] font-bold text-[#FFE28A]">🔦 Shining now — {until(beam.ends_at, now)} left</div>
        : <Btn on disabled={!ready || !!busy} onClick={focus} testid="lens-focus">{ready ? 'Focus it where my explorer is' : `Ready in ${until(view.next_at, now)}`}</Btn>}
    </Box>
  );
}

// ---- the star's own rules (any plot of yours on it) ----------------------------------------------------------------
export function StarNaturePanel({ card, cell }: { card: StarCard; cell: number }) {
  const P = usePlot(card, cell);
  const now = useNow();
  const n = P.nature ?? {};
  const [pulse, setPulse] = useState(false);
  const [dilate, setDilate] = useState(false);
  const lit = card.lit ?? 0;
  const rows: React.ReactNode[] = [];
  if (n.flare) rows.push(<Row key="flare" icon="☀️" text={n.flare.now ? <>Flaring now — groves bloom at once, forges run double ({until(n.flare.until, now)} left)</> : <>A red dwarf flares: the next in {until(n.flare.next_at, now)}</>} />);
  if (n.eclipse) rows.push(<Row key="ecl" icon="🌑" text={n.eclipse.now ? <>The twin star is passing in front — an eclipse!</> : <>A binary: the next eclipse in {until(n.eclipse.next_at, now)}</>}
    action={n.eclipse.now ? <Btn on disabled={!!P.busy} onClick={() => void P.act('witness').then((r) => r && toast.success(`You witnessed the eclipse 🌑 +${r.result.luck} Luck`))} testid="nature-witness">Witness</Btn> : null} />);
  if (n.pulse) rows.push(<Row key="pulse" icon="💫" text={<>A pulsar, beating every {n.pulse.period_ms} ms. Keep time with it for Ink (a few times a day).</>} action={<Btn on onClick={() => setPulse(true)} testid="nature-pulse">Keep the beat</Btn>} />);
  if (n.dilation) rows.push(<Row key="dil" icon="🕳️" text={<>Time bends here: once a day, push one of your enchantments’ clocks ahead ({n.dilation.hours_per_plot} h for each plot you have here, up to {n.dilation.max_hours} h).</>} action={<Btn onClick={() => setDilate(true)} testid="nature-dilate">Bend time</Btn>} />);
  if (n.supernova) rows.push(<Row key="nova" icon="💥" text={<>This star went supernova {new Date(n.supernova.at).toLocaleDateString()}{n.supernova.glowing ? ' — it’s blazing in everyone’s sky' : ''}.</>} />);
  rows.push(<Row key="light" icon="🕯️" text={<>Lit {lit}/5. Light it with your elements ({20 * (lit + 1)} He + {10 * (lit + 1)} C) and it shines brighter in everyone’s sky.</>}
    action={lit < 5 ? <Btn disabled={!!P.busy} onClick={() => void P.act('light').then((r) => r && toast.success(`You lit ${card.name} ✨`, { description: `It’s lit ${r.result.lit}/5 now.` }))} testid="nature-light">Light it</Btn> : null} />);
  return (
    <>
      <Box testid="star-nature"><div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/45">This star</div>{rows}</Box>
      <AnimatePresence>{pulse && n.pulse && <PulseGame key="p" period={n.pulse.period_ms} onDone={(taps) => { setPulse(false); if (taps) void P.act('pulse', { taps }).then((r) => r && toast.success(`${Math.round(r.result.score * 100)}% on the beat 💫`, { description: r.result.ink ? `+${r.result.ink} Ink` : 'Keep at it' })); }} />}</AnimatePresence>
      <AnimatePresence>{dilate && <DilatePicker key="d" onClose={() => setDilate(false)} onPick={(id) => { setDilate(false); void P.act('dilate', { enchantment: id }).then((r) => r && toast.success(`Its clock jumped ${r.result.hours} h ahead 🕳️`)); }} />}</AnimatePresence>
    </>
  );
}
function Row({ icon, text, action }: { icon: string; text: React.ReactNode; action?: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-start gap-2 text-[12px]"><span>{icon}</span><span className="min-w-0 text-white/75">{text}</span></div>{action}</div>;
}

/** 💫 tap along with the pulsar: 16 taps, scored by how close each gap is to its beat */
function PulseGame({ period, onDone }: { period: number; onDone(taps: number[] | null): void }) {
  const [taps, setTaps] = useState<number[]>([]);
  const [beat, setBeat] = useState(0);
  const t0 = useRef(performance.now());
  useEffect(() => {
    let raf = 0, last = -1;
    const loop = () => {
      const k = Math.floor((performance.now() - t0.current) / period);
      if (k !== last) { last = k; setBeat(k); if (k < 4) tick(1800); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [period]);
  const tap = () => {
    const t = Math.round(performance.now() - t0.current);
    tick(1200);
    setTaps((x) => { const n = [...x, t]; if (n.length >= 16) setTimeout(() => onDone(n), 250); return n; });
  };
  return (
    <motion.div className="fixed inset-0 z-[80] grid place-items-center bg-black/85 p-6 text-white" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="pulse-game">
      <div className="grid justify-items-center gap-5 text-center">
        <div className="font-display text-xl font-black">Keep the pulsar’s beat</div>
        <div className="text-[12.5px] text-white/65">It ticks four times — then tap along, 16 times. Skipping a beat is fine; being off it isn’t.</div>
        <button className="relative grid h-52 w-52 place-items-center rounded-full border-2 border-[#BFEFFF]/50 active:scale-95" onPointerDown={tap} data-testid="pulse-tap">
          <span key={beat} className="absolute inset-0 rounded-full bg-[#BFEFFF]/25 lv-pulse-ring" style={{ animationDuration: `${Math.min(900, period)}ms` }} />
          <span className="font-display text-4xl font-black tabular-nums">{Math.max(0, 16 - taps.length)}</span>
        </button>
        <button className="text-[12px] font-bold text-white/55" onClick={() => onDone(null)}>Stop</button>
      </div>
    </motion.div>
  );
}

/** pick one of your enchantments (for a black hole's time bend) */
function DilatePicker({ onPick, onClose }: { onPick(id: string): void; onClose(): void }) {
  const q = useQuery({ queryKey: ['enchantments'], queryFn: api.myEnchantments, staleTime: 60_000 });
  const list = (q.data ?? []).filter((e) => e.status === 'active');
  return (
    <motion.div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <div className="grid max-h-[70vh] w-full max-w-md gap-1.5 overflow-y-auto rounded-3xl bg-[#070B1C] p-4 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="font-black">Which enchantment’s clock?</div>
        {q.isLoading && <div className="text-sm text-white/50">…</div>}
        {!q.isLoading && !list.length && <div className="text-sm text-white/60">You don’t have an enchantment yet.</div>}
        {list.map((e) => <button key={e.id} className="rounded-xl bg-white/8 px-3 py-2 text-left text-[13px] font-bold" onClick={() => onPick(e.id)}>{e.nickname || e.name || e.kind} <span className="text-white/45">#{e.serial}</span></button>)}
      </div>
    </motion.div>
  );
}
