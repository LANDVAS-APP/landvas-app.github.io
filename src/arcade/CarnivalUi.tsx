// The carnival outside an Arcade Estate: what the page shows when you step up to a booth, a ride, the treat cart,
// the fortune teller, the photo booth or the fireworks — and the HUD while you play a booth game in the 3D scene.
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Download, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Arcade, ArcadeCarnival, ArcadeFinish, ArcadeMe, CarnivalFortune, CarnivalMe } from '../backend/types';
import { invalidateGame } from '../lib/queries';
import { Button, Dialog } from '../ui';
import { confettiCannons } from '../ui/confetti';
import type { HallScene } from './hall3d';
import { sfx } from './sfx';

const tix = (n: number) => Math.round(n).toLocaleString();
type Hall = React.MutableRefObject<HallScene | null>;
export type CarnivalBusy = { k: 'booth'; id: string } | { k: 'done'; id: string; score: number; r: ArcadeFinish | null } | { k: 'ride'; id: string } | null;


/** put a ticket in at a booth: the camera glides up to the counter and the game starts in the scene */
export async function startBooth(a: Arcade, id: string, hall: Hall, qc: ReturnType<typeof useQueryClient>, onMe: (m: ArcadeMe) => void, onBusy: (b: CarnivalBusy) => void) {
  let s: Awaited<ReturnType<typeof api.carnivalStart>>;
  try { s = await api.carnivalStart(a.id, id); } catch (e) { toast.error(toGameError(e).message); return; }
  sfx.coin(); onBusy({ k: 'booth', id });
  const h = hall.current?.carnival; if (!h) return;
  await h.zoomBooth(id);
  const t0 = performance.now();
  h.start(id, s.seed, () => {}, async (score) => {
    // a round stopped in its first few seconds isn't a round: nothing to bank
    if (performance.now() - t0 < 12_000) { onBusy({ k: 'done', id, score, r: null }); return; }
    try { const r = await api.arcadeFinish(s.session, score); onMe(r.me); invalidateGame(qc); onBusy({ k: 'done', id, score: r.score, r }); if (r.tickets) sfx.tickets(r.tickets); if (r.new_record || r.level_up) confettiCannons(); }
    catch (e) { toast.error(toGameError(e).message); onBusy({ k: 'done', id, score, r: null }); }
  });
}

const left = (until: string) => Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 60000));

/** the card at the bottom of the screen when you're standing at something at the carnival */
export function CarnivalNear({ a, c, cme, me, spot, hall, onMe, onCme, onBusy, onTreats }: {
  a: Arcade; c: ArcadeCarnival; cme: CarnivalMe; me: ArcadeMe; spot: string; hall: Hall;
  onMe(m: ArcadeMe): void; onCme(m: CarnivalMe): void; onBusy(b: CarnivalBusy): void; onTreats(): void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [fortune, setFortune] = useState<CarnivalFortune | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const run = async <T,>(f: () => Promise<T>) => { setBusy(true); try { return await f(); } catch (e) { toast.error(toGameError(e).message); return null; } finally { setBusy(false); } };
  const btn = 'lv-arc-play flex items-center gap-3 rounded-3xl px-5 py-3 text-left shadow-2xl';

  if (spot.startsWith('booth:')) {
    const id = spot.slice(6), g = c.games[id]; if (!g) return null;
    const lucky = cme.fortune?.lucky === id, treat = cme.treat ? c.treats[cme.treat.id] : null;
    const play = async () => { setBusy(true); try { await startBooth(a, id, hall, qc, onMe, onBusy); } finally { setBusy(false); } };
    return (
      <button onClick={() => void play()} disabled={busy} className={btn} style={{ background: 'linear-gradient(135deg,#FF3D9A,#FFB13D)', boxShadow: '0 0 40px #FF3D9A' }} data-testid="carnival-play">
        <span className="text-4xl">{g.emoji}</span>
        <span><span className="block text-xs font-bold uppercase tracking-widest text-white/85">Step right up!</span>
          <span className="block font-display text-2xl font-black">Play {g.name}</span>
          <span className="block max-w-[260px] text-[11px] text-white/85">{g.blurb}</span>
          <span className="block text-[11px] text-white/80">Your best: {me.best[id] ?? '—'} · Record: {c.boards[id]?.[0]?.score ?? '—'}</span>
          {(lucky || treat) && <span className="mt-0.5 block text-[11px] font-black text-[#FFF3A0]">{lucky ? `🔮 Your lucky booth today — ×${c.fortune.lucky_mult} tickets` : ''}{lucky && treat ? ' · ' : ''}{treat ? `${treat.emoji} +${Math.round(treat.bonus * 100)}% tickets` : ''}</span>}
        </span>
      </button>
    );
  }
  if (spot.startsWith('ride:')) {
    const id = spot.slice(5), rd = c.rides[id]; if (!rd) return null;
    const first = !cme.rides_today.includes(id);
    const ride = async () => {
      const r = await run(() => api.carnivalRide(a.id, id)); if (!r) return;
      onMe(r.me); onCme(r.carnival); sfx.blip(14);
      if (r.tickets) toast.success(`${rd.emoji} +${r.tickets} tickets for your first ride today`);
      hall.current?.carnival?.ride(id as 'wheel' | 'carousel', r.seconds); onBusy({ k: 'ride', id });
    };
    return (
      <button onClick={() => void ride()} disabled={busy} className={btn} style={{ background: 'linear-gradient(135deg,#22B8FF,#8B5CFF)', boxShadow: '0 0 40px #22B8FF' }} data-testid="carnival-ride">
        <span className="text-4xl">{rd.emoji}</span>
        <span><span className="block font-display text-2xl font-black">Ride the {rd.name.toLowerCase()}</span>
          <span className="block text-xs text-white/85">{first ? `Free · first ride today pays 🎟️ ${rd.daily_tickets}` : 'Free · go round again'}</span></span>
      </button>
    );
  }
  if (spot === 'treats') {
    return (
      <button onClick={onTreats} className={btn} style={{ background: 'linear-gradient(135deg,#FF8AD8,#FF5A5F)' }} data-testid="carnival-treats">
        <span className="text-4xl">🍭</span>
        <span><span className="block font-display text-2xl font-black">Treat cart</span>
          <span className="block text-xs text-white/85">{cme.treat ? `${c.treats[cme.treat.id]?.emoji} ${c.treats[cme.treat.id]?.name}: ${left(cme.treat.until)} min of bonus tickets left` : 'A sweet treat = more tickets at the booths'}</span></span>
      </button>
    );
  }
  if (spot === 'fortune') {
    const read = async () => {
      const r = await run(() => api.carnivalFortune(a.id)); if (!r) return;
      onMe(r.me); onCme(r.carnival); setFortune(r.fortune); sfx.jackpot();
    };
    const today = cme.fortune;
    return (
      <>
        <button onClick={() => (cme.fortune_ready ? void read() : today && setFortune(today))} disabled={busy} className={btn} style={{ background: 'linear-gradient(135deg,#6A2A8A,#C8A8FF)', boxShadow: '0 0 40px #8B5CFF' }} data-testid="carnival-fortune">
          <span className="text-4xl">🔮</span>
          <span><span className="block font-display text-2xl font-black">{cme.fortune_ready ? 'Have your fortune read' : 'Today’s fortune'}</span>
            <span className="block text-xs text-white/85">{cme.fortune_ready ? 'Once a day · tickets, and maybe a lucky booth' : today?.lucky ? `Lucky booth: ${c.games[today.lucky]?.emoji} ${c.games[today.lucky]?.name}` : 'Come back tomorrow for another reading'}</span></span>
        </button>
        {fortune && (
          <Dialog open onOpenChange={(o) => { if (!o) setFortune(null); }} title="🔮 Madame Zelda turns a card…">
            <div className="grid justify-items-center gap-3 py-2 text-center" data-testid="carnival-fortune-card">
              <motion.div initial={{ rotateY: 180, scale: 0.6 }} animate={{ rotateY: 0, scale: 1 }} transition={{ duration: 0.8 }} className="grid h-40 w-28 place-items-center rounded-2xl border-2 border-[#FFE14D] bg-gradient-to-b from-[#3A1A5A] to-[#1A0A2A] p-2 font-display text-lg font-black text-[#FFE14D] shadow-[0_0_30px_#8B5CFF]">{fortune.card}</motion.div>
              <div className="lv-arc-ticket text-xl">🎟️ +{fortune.tickets}</div>
              <p className="text-sm">{fortune.lucky ? <>The cards favour <b>{c.games[fortune.lucky]?.emoji} {c.games[fortune.lucky]?.name}</b> — it pays ×{c.fortune.lucky_mult} tickets for you today.</> : 'The cards keep their secrets today… but the tickets are yours.'}</p>
              <Button onClick={() => setFortune(null)}>Thank you, Madame Zelda</Button>
            </div>
          </Dialog>
        )}
      </>
    );
  }
  if (spot === 'photo') {
    return (
      <>
        <button onClick={() => { const p = hall.current?.carnival?.photo(); if (p) { setPhoto(p); sfx.blip(12); } }} className={btn} style={{ background: 'linear-gradient(135deg,#22B8FF,#C8352C)' }} data-testid="carnival-photo">
          <span className="text-4xl">📸</span>
          <span><span className="block font-display text-2xl font-black">Photo booth</span><span className="block text-xs text-white/85">Snap a souvenir of the carnival</span></span>
        </button>
        {photo && (
          <Dialog open onOpenChange={(o) => { if (!o) setPhoto(null); }} title="📸 Say cheese!">
            <div className="grid gap-3" data-testid="carnival-photo-card">
              <div className="rounded-xl bg-white p-2 pb-6 shadow-xl"><img src={photo} alt="Your carnival photo" className="w-full rounded" /><div className="pt-2 text-center font-display text-sm font-black text-[#2A1F3A]">{a.name.slice(0, 40)} · Carnival</div></div>
              <a href={photo} download="carnival-photo.jpg" className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 font-bold text-white"><Download className="h-4 w-4" /> Save photo</a>
            </div>
          </Dialog>
        )}
      </>
    );
  }
  if (spot === 'fireworks') {
    const fire = async () => {
      const r = await run(() => api.carnivalFireworks(a.id)); if (!r) return;
      onMe(r.me); hall.current?.carnival?.fireworks(14); sfx.jackpot(); toast.success(`🎆 Fireworks! +${c.fireworks.xp} XP for the arcade`);
    };
    return (
      <button onClick={() => void fire()} disabled={busy || me.tickets < c.fireworks.cost} className={btn} style={{ background: 'linear-gradient(135deg,#FFE14D,#FF3D9A)', color: '#2A0A1A' }} data-testid="carnival-fireworks">
        <span className="text-4xl">🎆</span>
        <span><span className="block font-display text-2xl font-black">Light the fireworks</span><span className="block text-xs font-bold">🎟️ {c.fireworks.cost} · a show over the whole carnival, +{c.fireworks.xp} arcade XP</span></span>
      </button>
    );
  }
  return null;
}

/** the treat cart's menu */
export function TreatCart({ a, c, cme, me, onMe, onCme, onClose }: { a: Arcade; c: ArcadeCarnival; cme: CarnivalMe; me: ArcadeMe; onMe(m: ArcadeMe): void; onCme(m: CarnivalMe): void; onClose(): void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const buy = async (id: string) => {
    setBusy(id);
    try { const r = await api.carnivalTreat(a.id, id); onMe(r.me); onCme(r.carnival); sfx.coin(); toast.success(`${c.treats[id].emoji} Yum! +${Math.round(c.treats[id].bonus * 100)}% tickets at the booths for ${c.treats[id].minutes} minutes`); onClose(); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title="🍭 Treat cart" description="A treat gives you extra tickets at every booth while it lasts. A new treat replaces the one you have.">
      <div className="grid gap-2" data-testid="carnival-treat-list">
        {Object.entries(c.treats).sort((x, y) => x[1].cost - y[1].cost).map(([id, t]) => (
          <div key={id} className={`flex items-center gap-3 rounded-2xl border p-3 ${cme.treat?.id === id ? 'border-[#FF8AD8] bg-[#FF8AD8]/10' : 'border-white/10'}`}>
            <span className="text-3xl">{t.emoji}</span>
            <div className="min-w-0 flex-1"><div className="font-bold">{t.name}</div><div className="text-xs text-muted">+{Math.round(t.bonus * 100)}% tickets for {t.minutes} min{cme.treat?.id === id ? ` · ${left(cme.treat.until)} min left` : ''}</div></div>
            <Button size="sm" variant="primary" disabled={!!busy || me.tickets < t.cost} onClick={() => void buy(id)} data-testid={`carnival-buy-${id}`}>🎟️ {t.cost}</Button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

/** the HUD while you play a booth game in the scene (and its result card afterwards) */
export function BoothHud({ c, me, busy, hall, onClose }: { c: ArcadeCarnival; me: ArcadeMe; busy: CarnivalBusy; hall: Hall; onClose(again?: string): void }) {
  const [st, setSt] = useState<{ score: number; time: number; extra: string } | null>(null);
  const raf = useRef(0);
  useEffect(() => {
    if (busy?.k !== 'booth') return;
    const tick = () => { const s = hall.current?.carnival?.state(); if (s) setSt({ score: s.score, time: s.time, extra: s.extra }); raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [busy, hall]);
  if (!busy || busy.k === 'ride') return null;
  const g = c.games[busy.id];
  if (busy.k === 'booth') {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-2 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]" data-testid="carnival-hud">
        <button onClick={() => hall.current?.carnival?.stop()} className="pointer-events-auto rounded-xl bg-black/60 p-2" aria-label="Stop playing" data-testid="carnival-stop"><X className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1 rounded-2xl bg-black/60 px-3 py-1.5 text-center">
          <div className="lv-arc-marquee truncate text-base">{g?.emoji} {g?.name}</div>
          <div className="text-[11px] text-white/70">{st?.extra}</div>
        </div>
        <div className="grid justify-items-end gap-1">
          <div className="rounded-xl bg-black/60 px-3 py-1 font-mono text-2xl font-black text-[#FFE14D]" data-testid="carnival-score">{st?.score ?? 0}</div>
          <div className={`rounded-xl bg-black/60 px-2 py-0.5 font-mono text-sm font-bold ${st && st.time < 6 ? 'text-[#FF5A5F]' : 'text-white'}`}>⏱ {Math.ceil(st?.time ?? 0)}</div>
        </div>
      </div>
    );
  }
  const r = busy.r;
  return (
    <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} className="absolute inset-x-0 bottom-0 z-30 flex justify-center p-4 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
      <div className="grid w-full max-w-sm justify-items-center gap-2 rounded-3xl bg-black/80 p-5 text-center shadow-2xl" data-testid="carnival-done">
        <div className="text-4xl">{g?.emoji}</div>
        {r?.new_record ? <div className="lv-arc-marquee text-xl" style={{ ['--glow' as string]: '#FFE14D' }}>★ NEW HIGH SCORE ★</div> : r?.new_best ? <div className="lv-arc-marquee text-lg" style={{ ['--glow' as string]: '#22E3FF' }}>PERSONAL BEST!</div> : <div className="font-mono text-sm text-white/70">{g?.name}</div>}
        <div className="font-mono text-5xl font-black text-[#FFE14D]">{busy.score}</div>
        {r ? <div className="lv-arc-ticket text-xl" data-testid="carnival-won">🎟️ +{tix(r.tickets)}{r.paid ? ` · +${r.paid} Ink` : ''}</div> : <div className="text-xs text-white/60">Play a full round to win tickets.</div>}
        <div className="text-[11px] text-white/60">🎟️ {tix(me.tickets)} tickets</div>
        <div className="mt-1 flex gap-2">
          <Button variant="rainbow" onClick={() => onClose(busy.id)} data-testid="carnival-again">Play again</Button>
          <Button variant="secondary" onClick={() => onClose()} data-testid="carnival-back">Back to the midway</Button>
        </div>
      </div>
    </motion.div>
  );
}
