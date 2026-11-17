// A plot's power (/powers/:gx_gy): what its rarity does, what it has done, and everything you can do with it — or, on
// someone else's plot, what's open to you (a Void Gate to step through, a Throne's rule, a star shower to catch).
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type RxAction, type RxPower } from '../backend/api';
import { toGameError } from '../backend/backend';
import { Page } from '../app/Shell';
import { qk } from '../lib/queries';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';
import { BasePlotArt } from '../plot/BasePlotArt';
import { RARITY_ORDER, isPrimordial, rarityInfo, type RarityId } from '../shared/rarity';
import { useMapPick, MapPickButton } from '../enchant/pickers';
import { useMyPlotsLite } from '../enchant/myPlots';
import { RULES, WHY, WISHES, cellKey, dur, logLine, parseCell, usePower } from './powers';
import './rarity.css';
import { readable } from '../lib/readable';

const LADDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const TIER_NAME = { ultra: 'Ultra', fusion: 'Fusion', primordial: 'Primordial' } as const;

export default function PowersScreen() {
  const { cell } = useParams();
  const c = parseCell(cell);
  const q = usePower(c?.[0] ?? null, c?.[1] ?? null);
  const v = q.data;
  if (!c) return <Page><p className="p-6 text-muted">That isn’t a plot.</p></Page>;
  if (q.isLoading) return <Page><div className="lv-skel mx-auto mt-10 h-64 max-w-md rounded-3xl" /></Page>;
  if (!v) return <Page><div className="mx-auto mt-10 grid max-w-md gap-3 text-center"><p className="text-muted" data-testid="powers-none">This plot has no power to show.</p><Link to="/primordials" className="lv-gbtn justify-self-center px-4 py-2 text-sm">See the Primordials</Link></div></Page>;
  return <Page><Power v={v} /></Page>;
}

function Power({ v }: { v: RxPower }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const info = rarityInfo(v.rarity);
  const prim = v.tier === 'primordial';
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState<{ title: string; text: string } | null>(null);
  const refresh = (view?: RxPower) => {
    if (view) qc.setQueryData(['rarity-power', v.gx, v.gy], view);
    void qc.invalidateQueries({ queryKey: ['my-powers'] });
    void qc.invalidateQueries({ queryKey: ['rarity-map'] });
  };
  const act = async (a: string, args: Record<string, unknown> = {}) => {
    setBusy(a);
    try {
      const r = await api.rarityAct(v.gx, v.gy, a, args);
      refresh(r.view);
      buzz('success');
      setOpen(null);
      const res = r.result ?? {};
      setShown(resultText(a, res, v));
      if (['transmute', 'roll'].includes(a)) void qc.invalidateQueries({ queryKey: qk.myPlots });
      return r;
    } catch (e) {
      toast.error(toGameError(e).message);
    } finally {
      setBusy(null);
    }
  };
  // a spot on the map (a Sunspot, a Rift)
  const { open: pickOpen, simple } = useMapPick(`rx:${cellKey(v.gx, v.gy)}`, 'spot', (p) => {
    const a = v.actions.find((x) => x.needs === 'spot');
    if (a) void act(a.id, { gx: p.gx, gy: p.gy });
  });
  const pickSpot = (a: RxAction) => pickOpen({
    title: v.rarity === 'sunspot' ? 'Place your Sunspot' : 'Tear a rift', emoji: info.emoji ?? '✦', color: info.color,
    hint: v.rarity === 'sunspot' ? 'Tap anywhere in the world: your own Hot Zone, 1 km across, centred there' : 'Tap anywhere in the world: for 24 hours you can claim around it',
    allowed: [], back: `/powers/${cellKey(v.gx, v.gy)}`, free: { anchors: [], radiusM: null, use: a.label },
  });

  return (
    <div className="mx-auto grid max-w-xl gap-4 pb-10" data-testid="powers" data-rarity={v.rarity}>
      <header className={cn('lvrx-hero relative overflow-hidden rounded-[28px] p-5', prim && 'lvrx-hero-prim')} style={{ ['--c' as string]: info.color, ['--g' as string]: info.glow }} data-testid="powers-hero">
        <div className="relative z-[1] flex items-center gap-4">
          <div className={cn('lvrx-emblem', prim && 'lvrx-emblem-prim')}><BasePlotArt rarity={v.rarity as RarityId} size={84} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: info.glow }} data-testid="powers-tier">{TIER_NAME[v.tier] ?? 'Ultra'}</div>
            <h1 className="font-display text-2xl font-black leading-tight text-white">{info.emoji} {v.name}</h1>
            <div className="text-xs font-semibold text-white/60">{v.mine ? 'Yours' : `@${v.owner_name ?? 'someone'}’s`} · held for {dur((Date.now() - +new Date(v.since)) / 1000)}</div>
          </div>
        </div>
        <p className="relative z-[1] mt-3 text-sm leading-relaxed text-white/85" data-testid="powers-ability">{v.ability}</p>
        <div className="relative z-[1] mt-3 flex flex-wrap gap-2">
          <MapPickButton label="Show on the map" onClick={() => nav(`/world?fly=${v.gx},${v.gy}&z=18`)} testId="powers-fly" />
          {v.mine && v.tier === 'ultra' && <Link to={`/fusion?first=${cellKey(v.gx, v.gy)}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[12px] font-black text-white" data-testid="powers-fuse">🧬 Fuse it</Link>}
        </div>
      </header>

      <FamilyPanel v={v} />

      {v.actions.length > 0 && (
        <section className="grid gap-2" data-testid="powers-actions">
          {v.actions.map((a) => (
            <div key={a.id} className="grid gap-2">
              <motion.button whileTap={{ scale: 0.97 }} disabled={!a.ready || !!busy}
                onClick={() => {
                  if (a.needs === 'spot') { if (simple) toast('Open the map to pick a spot'); else pickSpot(a); return; }
                  if (a.needs) { setOpen(open === a.id ? null : a.id); return; }
                  void act(a.id);
                }}
                className={cn('lvrx-act flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left disabled:opacity-50', a.ready && 'lvrx-act-ready')}
                style={{ ['--c' as string]: info.color }} data-testid={`powers-act-${a.id}`}>
                <span className="font-display text-[15px] font-black text-white">{busy === a.id ? '…' : a.label}</span>
                <span className="text-[11px] font-bold text-white/60">{a.ready ? (a.needs ? 'Choose →' : 'Ready') : WHY[a.why ?? ''] ?? ''}</span>
              </motion.button>
              <AnimatePresence>
                {open === a.id && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass grid gap-2 rounded-2xl p-3" data-testid={`powers-choose-${a.id}`}>
                    <Chooser a={a} v={v} onPick={(args) => void act(a.id, args)} busy={!!busy} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </section>
      )}

      <AnimatePresence>
        {shown && (
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="lvrx-result rounded-3xl p-4 text-center" style={{ ['--c' as string]: info.color }} data-testid="powers-result" onClick={() => setShown(null)}>
            <div className="font-display text-xl font-black text-white">{shown.title}</div>
            <div className="mt-1 text-sm text-white/80">{shown.text}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {v.mine && (v.log?.length ?? 0) > 0 && (
        <section className="glass grid gap-1.5 rounded-3xl p-4" data-testid="powers-log">
          <h2 className="eyebrow">What it has done</h2>
          {v.log!.map((l, i) => <div key={i} className="flex items-baseline justify-between gap-3 text-sm"><span>{logLine(l)}</span><span className="shrink-0 text-[11px] text-muted">{dur((Date.now() - +new Date(l.at)) / 1000)} ago</span></div>)}
        </section>
      )}
      <div className="flex flex-wrap justify-center gap-2 text-sm">
        <Link to="/primordials" className="lv-gbtn px-4 py-2">🌌 Primordials</Link>
        <Link to="/fusion" className="lv-gbtn px-4 py-2">🧬 Fusion Lab</Link>
      </div>
    </div>
  );
}

/** what a power is up to, family by family */
function FamilyPanel({ v }: { v: RxPower }) {
  const info = rarityInfo(v.rarity);
  const rows: [string, React.ReactNode][] = [];
  const next = v.next_in != null && v.next_in > 0 ? dur(v.next_in) : null;
  switch (v.family) {
    case 'volcano':
      rows.push(['Eruptions', v.eruptions ?? 0], ['Obsidian now', `${(v.lava ?? []).length}${v.lava_in ? ` · cools in ${dur(v.lava_in)}` : ''}`]);
      if (next) rows.push(['Next eruption', `in about ${next}`]);
      break;
    case 'world_tree': rows.push(['Roots', `${(v.roots ?? []).length} of ${v.max}`], ['Reach', `${v.km} km`]); if (next) rows.push(['Next root', `in ${next}`]); break;
    case 'phantom':
      if (v.whisper) rows.push(['Last whisper', <span key="w">a <b style={{ color: readable(rarityInfo(v.whisper.rarity).color) }}>{rarityInfo(v.whisper.rarity).name}</b> nearby · <Link className="underline" to={`/world?fly=${v.whisper.gx},${v.whisper.gy}&z=19`}>go claim it</Link></span>]);
      if (v.disguise) rows.push(['The world sees', <b key="d" style={{ color: readable(rarityInfo(v.disguise).color) }}>{rarityInfo(v.disguise).name}</b>]);
      if (next) rows.push(['Next whisper', `in ${next}`]);
      break;
    case 'wanderer':
      rows.push(['Gallops', v.gallops ?? 0], ['Rainbow trail', `${(v.trail ?? []).length} spots`]);
      if (v.tethered) rows.push(['Tethered', 'It can’t wander while it’s part of a bigger canvas or folded']);
      if (next) rows.push(['Next gallop', `in about ${next}`]);
      break;
    case 'lodestone': case 'compass': rows.push(['Gathered', `${v.ink ?? 0} of ${v.ink_cap} Ink`], ['Collected so far', `${v.collected ?? 0} Ink`]); if (v.beams) rows.push(['Beams', (v.beams ?? []).length]); break;
    case 'leyline': rows.push(['Beams', (v.beams ?? []).length ? `to ${(v.beams ?? []).length} plot` : 'no other plot to beam to yet']); break;
    case 'glacier': rows.push(['Frozen land', `${v.cells} plots in every direction`]); break;
    case 'mycelium': rows.push(['Mushrooms', `${(v.mushrooms ?? []).length} of ${v.max}`]); if (next) rows.push(['Next mushroom', `in ${next}`]); break;
    case 'hive': rows.push(['Flowers today', (v.bees ?? []).length], ['All flowers', v.flowers ?? 0], ['Honey', `${v.honey ?? 0} Ink`]); if (next) rows.push(['Bees go out', `in ${next}`]); break;
  }
  switch (v.rarity) {
    case 'throne_ink': rows.push(['This week’s rule', v.rule ? <span key="r">{RULES[v.rule]?.emoji} <b>{RULES[v.rule]?.name}</b> — {RULES[v.rule]?.text}</span> : 'None set']); break;
    case 'heart_world': rows.push(['Gifts given', v.gifts ?? 0]); break;
    case 'serpent_egg': rows.push(['The Leviathan', v.leviathan_out ? 'is out — call it' : 'is resting'], ['Extra loot', `+${v.loot_pct}%`]); break;
    case 'world_eye': rows.push(['Phantoms in sight', v.phantoms ?? 0], ['Spots worth claiming', `${(v.glints ?? []).length} marked on your map`]); break;
    case 'void_gate': rows.push(['The gate', v.open ? <b key="o" className="text-[#C4B5FD]">open now</b> : `opens in ${dur(v.opens_in)}`], ['Travellers tonight', v.travellers ?? 0]); break;
    case 'fallen_star': rows.push(['Falling now', v.shower_until ? `${v.stars} stars — catch them on the map` : 'none'], ['Caught', v.caught ?? 0]); break;
    case 'genesis_well': rows.push(['New land', v.land ? `${v.land} spots until ${new Date(v.land_until).toLocaleString()}` : 'none risen']); break;
    case 'chrysalis': rows.push(['Hatches in', dur(v.hatch_in)]); break;
    case 'hourglass': rows.push(['Enchantments in reach', v.enchantments ?? 0], ['Time gained', dur(v.gained_s)]); break;
    case 'sunspot': rows.push(['Your Hot Zone', v.zone ? <Link key="z" className="underline" to={`/world?fly=${v.zone.gx},${v.zone.gy}&z=15`}>see it on the map</Link> : 'not placed yet']); break;
    case 'rift': rows.push(['Your rift', v.rift ? <span key="r"><Link className="underline" to={`/world?fly=${v.rift.gx},${v.rift.gy}&z=18`}>open</Link> until {new Date(v.rift.until).toLocaleTimeString()}</span> : 'closed']); break;
    case 'upside_down': rows.push(['The table', v.flip_until ? <b key="f" className="text-[#5EEAD4]">upside down until {new Date(v.flip_until).toLocaleTimeString()}</b> : 'the right way up']); break;
    case 'midas': rows.push(['Turned to gold', v.golds ?? 0]); break;
    case 'chain': rows.push(['Links so far', v.links ?? 0]); break;
    case 'transmuter': case 'doubling_cube': if (v.last) rows.push(['Last time', `${rarityInfo(v.last.from).name} → ${rarityInfo(v.last.to).name}`]); break;
    case 'eleven': return <Eleven v={v} />;
  }
  if (!rows.length) return null;
  return (
    <section className="glass grid gap-2 rounded-3xl p-4" style={{ boxShadow: `inset 0 0 0 1.5px ${info.color}44` }} data-testid="powers-panel">
      {rows.map(([k, val]) => <div key={k} className="flex items-baseline justify-between gap-3 text-sm"><span className="text-muted">{k}</span><span className="text-right font-semibold">{val}</span></div>)}
    </section>
  );
}

/** 🌠 the 11:11 clock */
function Eleven({ v }: { v: RxPower }) {
  const [now, setNow] = useState(() => Date.now());
  const skew = useMemo(() => (v.server_now ? +new Date(v.server_now) - Date.now() : 0), [v.server_now]);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000); return () => clearInterval(t); }, []);
  const next = v.next_at ? +new Date(v.next_at) - (now + skew) : null;
  const open = v.open && !v.wished;
  return (
    <section className={cn('lvrx-eleven grid gap-2 rounded-3xl p-5 text-center', open && 'lvrx-eleven-open')} data-testid="powers-eleven" data-open={open ? 'true' : 'false'}>
      <div className="font-display text-5xl font-black tracking-tight text-white">11:11</div>
      {!v.tz ? <p className="text-sm text-white/75">Set your time zone below — your wishes come at 11:11 there, morning and night.</p>
        : open ? <p className="text-sm font-bold text-[#FDE68A]">It’s 11:11 — make your wish now!</p>
          : <p className="text-sm text-white/75">{v.wished ? 'Wished! ' : ''}Next 11:11 in <b className="tnum" data-testid="eleven-next">{next != null ? dur(Math.max(0, next / 1000)) : '…'}</b> ({v.tz})</p>}
      <div className="flex justify-center gap-4 text-xs text-white/60"><span>🔥 {v.streak ?? 0} in a row</span><span>🌠 {v.wishes ?? 0} wish{v.wishes === 1 ? '' : 'es'}</span></div>
    </section>
  );
}

/** the choice an action needs: a rule, a plot, five plots, a rarity, a time zone, a wish */
function Chooser({ a, v, onPick, busy }: { a: RxAction; v: RxPower; onPick(args: Record<string, unknown>): void; busy: boolean }) {
  const plots = useMyPlotsLite();
  const [sel, setSel] = useState<string[]>([]);
  if (a.needs === 'rule') return <div className="grid gap-2 sm:grid-cols-2">{Object.entries(RULES).map(([k, r]) => (
    <button key={k} disabled={busy} onClick={() => onPick({ rule: k })} className="lvrx-choice rounded-2xl p-3 text-left" data-testid={`rule-${k}`}><div className="font-black">{r.emoji} {r.name}</div><div className="text-xs text-muted">{r.text}</div></button>))}</div>;
  if (a.needs === 'wish') return <div className="grid grid-cols-2 gap-2">{WISHES(v.ink ?? 111, v.luck ?? 11).map((w) => (
    <button key={w.id} disabled={busy} onClick={() => onPick({ pick: w.id })} className="lvrx-choice lvrx-wish rounded-2xl p-3 text-left" data-testid={`wish-${w.id}`}><div className="text-2xl">{w.emoji}</div><div className="font-black">{w.name}</div><div className="text-xs text-muted">{w.text}</div></button>))}</div>;
  if (a.needs === 'tz') {
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } })();
    return <div className="grid gap-2 text-sm"><p>Your phone says you’re in <b>{tz}</b>. Your wishes will come at 11:11 there. You can change it once a week.</p>
      <button disabled={busy || v.tz === tz} onClick={() => onPick({ tz })} className="lv-gbtn justify-self-start px-4 py-2" data-testid="tz-set">{v.tz === tz ? 'Already set' : `Use ${tz}`}</button></div>;
  }
  if (a.needs === 'rarity') {
    const opts = RARITY_ORDER.filter((r) => LADDER.includes(r) || r === 'mythic' || rarityInfo(r).ppm);
    return <div className="flex flex-wrap gap-1.5">{opts.map((r) => (
      <button key={r} disabled={busy} onClick={() => onPick({ rarity: r })} className="rounded-full border px-2.5 py-1 text-xs font-bold" style={{ borderColor: rarityInfo(r).color, color: readable(rarityInfo(r).color) }} data-testid={`disguise-${r}`}>{rarityInfo(r).emoji ?? ''} {rarityInfo(r).name}</button>))}</div>;
  }
  if (a.needs === 'plot') {
    const list = plots.filter((p) => LADDER.includes(p.rarity));
    if (!list.length) return <p className="text-sm text-muted">You need a Common to Legendary plot.</p>;
    return <div className="grid max-h-72 gap-1.5 overflow-y-auto">{list.slice(0, 80).map((p) => (
      <button key={cellKey(p.gx, p.gy)} disabled={busy} onClick={() => onPick({ gx: p.gx, gy: p.gy })} className="lvrx-choice flex items-center gap-2 rounded-xl p-2 text-left text-sm" data-testid="pick-plot">
        <BasePlotArt rarity={p.rarity as RarityId} size={28} /><span className="flex-1">{p.name || `Plot ${p.gx}, ${p.gy}`}</span><b style={{ color: readable(rarityInfo(p.rarity).color) }}>{rarityInfo(p.rarity).name}</b></button>))}</div>;
  }
  if (a.needs === 'cells5') {
    const groups = LADDER.map((r) => ({ r, list: plots.filter((p) => p.rarity === r) })).filter((g) => g.list.length >= 5);
    if (!groups.length) return <p className="text-sm text-muted">You need five plots of one rarity (Common to Legendary).</p>;
    const rar = sel.length ? plots.find((p) => cellKey(p.gx, p.gy) === sel[0])?.rarity : null;
    return <div className="grid gap-2">
      <p className="text-xs text-muted">Pick five of one rarity. The first you pick becomes {rar ? <b>{rarityInfo(LADDER[LADDER.indexOf(rar) + 1] ?? 'mythic').name}</b> : 'the next tier'}; the other four go back to the world.</p>
      <div className="grid max-h-72 gap-1.5 overflow-y-auto">{groups.flatMap((g) => g.list.slice(0, 40)).map((p) => {
        const k = cellKey(p.gx, p.gy), on = sel.includes(k), off = !!rar && p.rarity !== rar;
        return <button key={k} disabled={busy || off} onClick={() => setSel(on ? sel.filter((x) => x !== k) : sel.length < 5 ? [...sel, k] : sel)}
          className={cn('lvrx-choice flex items-center gap-2 rounded-xl p-2 text-left text-sm disabled:opacity-30', on && 'lvrx-choice-on')} data-testid="pick-five">
          <BasePlotArt rarity={p.rarity as RarityId} size={26} /><span className="flex-1">{p.name || `Plot ${p.gx}, ${p.gy}`}</span>{on && <b>#{sel.indexOf(k) + 1}</b>}<b style={{ color: readable(rarityInfo(p.rarity).color) }}>{rarityInfo(p.rarity).name}</b></button>;
      })}</div>
      <button disabled={busy || sel.length !== 5} onClick={() => onPick({ cells: sel.map((k) => k.split('_').map(Number)) })} className="lv-gbtn justify-self-start px-4 py-2 text-sm" data-testid="transmute-go">Transmute {sel.length}/5</button>
    </div>;
  }
  return null;
}

function resultText(a: string, r: Record<string, any>, v: RxPower): { title: string; text: string } {
  const R = (x: string) => `${rarityInfo(x).emoji ?? ''} ${rarityInfo(x).name}`.trim();
  switch (a) {
    case 'collect': return { title: `+${r.ink} Ink`, text: 'The Lodestone gave up what it gathered.' };
    case 'disguise': return { title: 'Disguised', text: `Everyone else now sees a ${R(r.disguise)}.` };
    case 'gift': return { title: '🌍 Gifts sent', text: `${r.players} players nearby got a Golden Hour from you.` };
    case 'decree': return { title: `${RULES[r.rule]?.emoji} ${RULES[r.rule]?.name}`, text: `${RULES[r.rule]?.text} — for a week.` };
    case 'call': return { title: '🐉 It heard you', text: 'The Leviathan turns toward your Serpent’s Egg.' };
    case 'gaze': return { title: `👁️ ${r.glints} spots`, text: 'Marked on your map for a day: empty land that would roll Epic or better.' };
    case 'shower': return { title: `⭐ ${r.stars} shooting stars`, text: 'They’re falling now — anyone can catch them on the map.' };
    case 'rise': return { title: `🌀 ${r.spots} spots of new land`, text: 'For two days, claims there roll ultras 3× as often.' };
    case 'place': return { title: '🔆 Sunspot placed', text: 'Your own Hot Zone is live — only your claims in it get its rolls.' };
    case 'open': return { title: '🌐 The rift is open', text: 'For 24 hours you can claim around it as if you were there.' };
    case 'flip': return { title: '🙃 Upside down!', text: 'For an hour your claims roll from the table flipped.' };
    case 'transmute': return { title: `⚗️ ${R(r.rarity)}`, text: `Five ${R(r.from)} plots became one ${R(r.rarity)}.` };
    case 'roll': return r.up ? { title: '🎰 Heads!', text: `${R(r.from)} → ${R(r.rarity)}` } : { title: r.rarity === r.from ? '🎰 Tails — nothing lost' : '🎰 Tails', text: `${R(r.from)} → ${R(r.rarity)}` };
    case 'step': return { title: '🌑 Through the gate', text: `A ${R(r.ticket)}-or-better roll ticket is yours.` };
    case 'tz': return { title: 'Time zone set', text: `Your wishes come at 11:11 in ${r.tz}.` };
    case 'wish': return { title: '🌠 Wish granted', text: `${r.ink ? `+${r.ink} Ink` : r.luck ? `+${r.luck} Luck` : r.golden ? 'A Golden Hour' : r.ticket ? `A ${R(r.ticket)}-or-better ticket` : ''}${r.streak_ticket ? ' — and a Legendary ticket for 11 in a row!' : ''} · ${r.streak} in a row` };
    default: return { title: 'Done', text: v.name };
  }
}

export const isPrimordialPower = (r: string) => isPrimordial(r);
