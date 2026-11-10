// Choosing what a plot becomes: an Art Canvas or an Inkborn Habitat. Switching keeps the
// other side safe — artwork and every version stay saved, and a habitat keeps its layout and
// remembers who lived there — so switching back brings it all back.
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowRight, Brush, Citrus, Gamepad2, PawPrint, ShieldCheck, TreePine, Wheat } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { PlotKind } from '../backend/types';
import { invalidateGame, qk } from '../lib/queries';
import { isRealm, REALM_META, realmRoute } from '../realms/kinds';
import { RealmPreview } from '../realms/RealmPreview';
import { cn } from '../lib/utils';
import { Button, Dialog } from '../ui';
import { drawHabitatPlot } from '../map/plotTiles';
import { CreatureView } from './CreatureView';
import { randomGenome } from './genome';

type G = { id: string; kind?: PlotKind; plot_count: number; habitat_id?: string | null; farm_id?: string | null; business_id?: string | null; arcade_id?: string | null; realm_id?: string | null; name: string };
const KIND_NAME = (k: PlotKind) => (k === 'home' ? 'Residential · Home' : k === 'landlord' ? 'Residential · Landlord' : isRealm(k) ? REALM_META[k].name : k === 'habitat' ? 'Inkborn Habitat' : k === 'farm' ? 'Farm' : k === 'business' ? 'Business' : k === 'arcade' ? 'Arcade' : 'Art Canvas');
const KIND_A = (k: PlotKind) => (k === 'home' ? 'a Residential Home' : k === 'landlord' ? 'a Residential Landlord plot' : isRealm(k) ? `a${/^[aeiou]/i.test(REALM_META[k].name) ? 'n' : ''} ${REALM_META[k].name}` : k === 'habitat' ? 'a Habitat' : k === 'farm' ? 'a Farm' : k === 'business' ? 'a Business' : k === 'arcade' ? 'an Arcade' : 'an Art Canvas');

export function PlotKindBadge({ kind }: { kind?: PlotKind }) {
  if (kind === 'home') return <span className="inline-flex items-center gap-1 rounded-full bg-[#C8553D]/15 px-2 py-0.5 text-[11px] font-bold text-[#E0745C]">🏠 Residential · Home</span>;
  if (kind === 'landlord') return <span className="inline-flex items-center gap-1 rounded-full bg-[#3E6E9C]/20 px-2 py-0.5 text-[11px] font-bold text-[#6FA3D9]">🏘️ Residential · Landlord</span>;
  if (isRealm(kind)) { const m = REALM_META[kind]; return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${m.color}26`, color: m.color }}>{m.emoji} {m.name}</span>; }
  if (kind === 'arcade') return <span className="inline-flex items-center gap-1 rounded-full bg-[#FF3D9A]/15 px-2 py-0.5 text-[11px] font-bold text-[#FF3D9A]"><Gamepad2 className="h-3 w-3" /> Arcade</span>;
  if (kind === 'business') return <span className="inline-flex items-center gap-1 rounded-full bg-[#FFE14D]/20 px-2 py-0.5 text-[11px] font-bold text-[#D4A500]"><Citrus className="h-3 w-3" /> Business</span>;
  if (kind === 'farm') return <span className="inline-flex items-center gap-1 rounded-full bg-[#F5C842]/20 px-2 py-0.5 text-[11px] font-bold text-[#E0A800]"><Wheat className="h-3 w-3" /> Farm</span>;
  return kind === 'habitat'
    ? <span className="inline-flex items-center gap-1 rounded-full bg-[#3DDC97]/15 px-2 py-0.5 text-[11px] font-bold text-[#3DDC97]"><PawPrint className="h-3 w-3" /> Inkborn Habitat</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent"><Brush className="h-3 w-3" /> Art Canvas</span>;
}

/** The plot's current type with a button that opens the selector. */
export function PlotKindControl({ g, className }: { g: G; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={cn('flex items-center gap-2 text-left text-xs text-muted hover:text-fg', className)} data-testid="plot-kind">
        <PlotKindBadge kind={g.kind} /> <span className="underline-offset-2 hover:underline">Change plot type</span>
      </button>
      <PlotKindDialog g={g} open={open} onOpenChange={setOpen} />
    </>
  );
}

/** a house (Home) or a little street of rented houses (Landlord), drawn small */
function HousePreview({ kind }: { kind: 'home' | 'landlord' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current!.getContext('2d')!;
    let raf = 0; const t0 = performance.now();
    const house = (x: number, y: number, w: number, h: number, wall: string, roof: string, lit: boolean) => {
      g.fillStyle = wall; g.fillRect(x, y, w, h);
      g.fillStyle = roof; g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + w / 2, y - h * 0.6); g.lineTo(x + w + 4, y); g.fill();
      g.fillStyle = lit ? '#FFE9A8' : '#9FC6E8'; g.fillRect(x + w * 0.15, y + h * 0.2, w * 0.25, h * 0.25); g.fillRect(x + w * 0.6, y + h * 0.2, w * 0.25, h * 0.25);
      g.fillStyle = '#6B4A3A'; g.fillRect(x + w * 0.4, y + h * 0.55, w * 0.2, h * 0.45);
    };
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      g.fillStyle = '#8FD3FF'; g.fillRect(0, 0, 160, 110); g.fillStyle = '#7CC95A'; g.fillRect(0, 84, 160, 26);
      if (kind === 'home') {
        // the house grows a floor every few seconds, then starts again
        const fl = 1 + (Math.floor(t / 1.6) % 3);
        for (let i = 0; i < fl; i++) { g.fillStyle = '#F2E2C4'; g.fillRect(50, 84 - 22 * (i + 1), 60, 22); g.fillStyle = '#9FC6E8'; g.fillRect(58, 88 - 22 * (i + 1), 12, 10); g.fillRect(90, 88 - 22 * (i + 1), 12, 10); }
        g.fillStyle = '#C8553D'; g.beginPath(); g.moveTo(44, 84 - 22 * fl); g.lineTo(80, 84 - 22 * fl - 22); g.lineTo(116, 84 - 22 * fl); g.fill();
        g.fillStyle = '#6B4A3A'; g.fillRect(74, 70, 12, 14);
      } else {
        house(10, 60, 40, 24, '#E8D9B8', '#3E6E9C', true); house(60, 60, 40, 24, '#F2E2C4', '#C8553D', false); house(110, 60, 40, 24, '#E8D9B8', '#5FA05A', true);
        // rent day: coins float up
        for (let i = 0; i < 5; i++) { const k = (t * 0.6 + i / 5) % 1; g.font = '14px system-ui'; g.globalAlpha = 1 - k; g.fillText('💵', 20 + i * 28, 56 - k * 40); g.globalAlpha = 1; }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [kind]);
  return <canvas ref={ref} width={160} height={110} className="h-[110px] w-[160px] rounded-2xl shadow-lg" />;
}

function ArtPreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    let raf = 0;
    const t0 = performance.now();
    const cols = ['#FF4D6D', '#FFE14D', '#34C3FF', '#7B5CFF', '#3DDC97'];
    const frame = (now: number) => {
      const t = ((now - t0) / 1000) % 6;
      g.clearRect(0, 0, 160, 110);
      g.fillStyle = '#FBF7EF'; g.fillRect(0, 0, 160, 110);
      g.lineCap = 'round'; g.lineWidth = 7;
      cols.forEach((col, i) => {
        const k = Math.max(0, Math.min(1, t - i * 0.8));
        if (!k) return;
        g.strokeStyle = col; g.beginPath();
        for (let s = 0; s <= 30 * k; s++) { const x = 14 + s * 4.4, y = 22 + i * 17 + Math.sin(s * 0.35 + i) * 6; if (s) g.lineTo(x, y); else g.moveTo(x, y); }
        g.stroke();
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={160} height={110} className="h-[110px] w-[160px] rounded-2xl shadow-lg" />;
}

function HabitatPreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [genome] = useState(() => randomGenome(4242));
  useEffect(() => {
    const g = ref.current!.getContext('2d')!;
    for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) drawHabitatPlot(g, 900 + x, 400 + y, x * 54, y * 55, 54, '#7B5CFF');
  }, []);
  return (
    <div className="relative h-[110px] w-[160px] overflow-hidden rounded-2xl shadow-lg">
      <canvas ref={ref} width={162} height={110} className="absolute inset-0" />
      <motion.div className="absolute bottom-1" animate={{ x: [10, 90, 10] }} transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}>
        <CreatureView genome={genome} size={56} state="walk" ground={false} />
      </motion.div>
    </div>
  );
}

function FarmPreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current!.getContext('2d')!;
    let raf = 0; const t0 = performance.now();
    const crops = ['🥕', '🌽', '🍅', '🎃', '🍓', '🌻'];
    const frame = (now: number) => {
      const t = ((now - t0) / 1000) % 8;
      g.fillStyle = '#8FD3FF'; g.fillRect(0, 0, 160, 110); g.fillStyle = '#6CB84A'; g.fillRect(0, 34, 160, 76);
      g.fillStyle = '#C8352C'; g.fillRect(118, 12, 30, 24); g.fillStyle = '#6B2A22'; g.beginPath(); g.moveTo(114, 14); g.lineTo(133, 2); g.lineTo(152, 14); g.fill();
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        const x = 10 + c * 26, y = 46 + r * 21;
        g.fillStyle = '#7A4B2A'; g.fillRect(x, y, 22, 15);
        const k = Math.max(0, Math.min(1, (t - (r * 4 + c) * 0.25) / 2.5));
        if (k > 0) { g.font = `${8 + k * 10}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(k < 0.5 ? '🌱' : crops[(r * 4 + c) % crops.length], x + 11, y + 7 - k * 3); }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={160} height={110} className="h-[110px] w-[160px] rounded-2xl shadow-lg" />;
}

function ArcadePreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current!.getContext('2d')!;
    let raf = 0; const t0 = performance.now();
    const cols = ['#FF3D9A', '#22E3FF', '#FFE14D', '#3DDC97', '#B57BFF'];
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      g.fillStyle = '#0B0820'; g.fillRect(0, 0, 160, 110);
      g.fillStyle = '#1A1240'; g.fillRect(0, 86, 160, 24);
      for (let i = 0; i < 5; i++) {
        const x = 10 + i * 30, c = cols[i];
        g.fillStyle = '#1E1838'; g.fillRect(x, 30, 22, 56);
        g.fillStyle = c; g.globalAlpha = 0.85 + 0.15 * Math.sin(t * 6 + i); g.fillRect(x + 3, 40, 16, 13); g.globalAlpha = 1;
        g.shadowColor = c; g.shadowBlur = 10; g.fillStyle = c; g.fillRect(x, 26, 22, 5); g.shadowBlur = 0;
      }
      // a little stacker tower on one screen and tickets streaming out
      for (let k = 0; k < 5; k++) { const y = 98 - ((t * 40 + k * 14) % 60); g.fillStyle = '#FFE14D'; g.fillRect(140 + Math.sin(t * 3 + k) * 4, y, 10, 5); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={160} height={110} className="h-[110px] w-[160px] rounded-2xl" />;
}

function BusinessPreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current!.getContext('2d')!;
    let raf = 0; const t0 = performance.now();
    const shops = ['🍋', '🍪', '🚚', '☕', '🏨', '🏦', '🚀'];
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      g.fillStyle = '#9AD8FF'; g.fillRect(0, 0, 160, 110); g.fillStyle = '#3C4150'; g.fillRect(0, 84, 160, 26); g.fillStyle = '#D9D2C4'; g.fillRect(0, 76, 160, 8);
      // the street grows: a new business every second
      const n = Math.min(shops.length, 1 + Math.floor((t % 9) / 1.1));
      for (let i = 0; i < n; i++) {
        const x = 8 + i * 21, h = 18 + i * 7;
        g.fillStyle = ['#FFE14D', '#C27C4E', '#FF8A3D', '#F2E6D0', '#E8DCC6', '#ECE6DA', '#F5F5F5'][i]; g.fillRect(x, 76 - h, 18, h);
        g.font = '12px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(shops[i], x + 9, 76 - h - 7);
      }
      // cash floating up
      for (let k = 0; k < 4; k++) { const p = ((t * 0.7 + k * 0.25) % 1); g.globalAlpha = 1 - p; g.font = '11px system-ui'; g.fillText('💵', 20 + k * 36, 60 - p * 50); }
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.roundRect(44, 4, 72, 18, 9); g.fill(); g.fillStyle = '#B8F5A0'; g.font = '900 11px ui-rounded, system-ui';
      g.fillText(`$${Math.floor(12 * 1.9 ** (t % 9)).toLocaleString()}`, 80, 13);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={160} height={110} className="h-[110px] w-[160px] rounded-2xl shadow-lg" />;
}

export function PlotKindDialog({ g, open, onOpenChange }: { g: G; open: boolean; onOpenChange(v: boolean): void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const cur: PlotKind = g.kind ?? 'canvas';
  const [choice, setChoice] = useState<PlotKind>(cur);
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setChoice(cur); setStep('pick'); } }, [open, cur]);
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.setGroupKind(g.id, choice);
      invalidateGame(qc);
      if ((r as { fee?: number }).fee) toast(`Switched for ${(r as { fee?: number }).fee} Ink`);
      void qc.invalidateQueries({ queryKey: qk.groups });
      void qc.invalidateQueries({ queryKey: ['sanctuaries'] });
      void qc.invalidateQueries({ queryKey: ['plot'] });
      onOpenChange(false);
      if (choice === 'habitat') {
        toast.success(`${g.name} is now an Inkborn Habitat`, { description: 'A little woodland has grown on your plot.' });
        if (r.habitat_id) nav(`/habitat/${r.habitat_id}`);
      } else if (choice === 'business') {
        toast.success(`${g.name} is now a Business 🍋`, { description: 'Your lemonade stand is open!' });
        if (r.business_id) nav(`/business/${r.business_id}`);
      } else if (isRealm(choice)) {
        const m = REALM_META[choice];
        toast.success(`${g.name} is now ${KIND_A(choice)} ${m.emoji}`, { description: m.body });
        if (r.realm_id) nav(realmRoute(r.realm_id));
      } else if (choice === 'arcade') {
        toast.success(`${g.name} is now an Arcade 🕹️`, { description: 'The lights are on and the cabinets are humming.' });
        if (r.arcade_id) nav(`/arcade/${r.arcade_id}`);
      } else if (choice === 'home') {
        toast.success(`${g.name} is now your Home 🏠`, { description: 'Your house is open to visitors from your profile. Merge more Home plots into a bigger square to add floors.' });
        nav('/home');
      } else if (choice === 'landlord') {
        toast.success(`${g.name} is now a Landlord plot 🏘️`, { description: 'Tenants move in. On the 1st of every month, rent day, it earns 50× USD rent all day.' });
      } else if (choice === 'farm') {
        toast.success(`${g.name} is now a Farm 🌾`, { description: 'Fresh soil beds are ready to plant.' });
        if (r.farm_id) nav(`/farm/${r.farm_id}`);
      } else toast.success(`${g.name} is an Art Canvas again`, { description: 'Your artwork is right where you left it.' });
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  const cards: { k: PlotKind; title: string; body: string; perks: string[]; preview: React.ReactNode; color: string; icon: React.ReactNode }[] = [
    { k: 'canvas', title: 'Art Canvas', body: 'Create and showcase artwork.', color: '#7B5CFF', icon: <Brush className="h-4 w-4" />, preview: <ArtPreview />,
      perks: ['Paint with every brush and tool', 'Publish your art onto the map', 'Merge neighbours into one mural', 'Earn the craft bonus'] },
    { k: 'habitat', title: 'Inkborn Habitat', body: 'Build a living biome and raise creatures.', color: '#3DDC97', icon: <TreePine className="h-4 w-4" />, preview: <HabitatPreview />,
      perks: ['A woodland sanctuary you can walk around', `Room for ${3 + 2 * (g.plot_count - 1)} Inkborn here`, 'Decorate with trees, nests and lanterns', 'Merge habitats into a bigger sanctuary'] },
    { k: 'farm', title: 'Farm', body: 'Grow crops, harvest, sell and play farm games.', color: '#E0A800', icon: <Wheat className="h-4 w-4" />, preview: <FarmPreview />,
      perks: [`${Math.min(48, 6 + 4 * (g.plot_count - 1))} soil beds in a 3D farmyard`, 'Farm levels, buildings, a kitchen and orders', 'Daily chores and a tractor to drive', '6 farm games (2D and 3D)'] },
    { k: 'business', title: 'Business', body: 'Start with a lemonade stand and build a corporation.', color: '#D4A500', icon: <Citrus className="h-4 w-4" />, preview: <BusinessPreview />,
      perks: ['Tap to sell lemonade, buy 10 kinds of business', 'Earns while you’re away', 'Upgrades, golden customers and going public', '4 money-making games (2D and 3D)'] },
    { k: 'arcade', title: 'Arcade', body: 'A neon arcade you walk round with your explorer.', color: '#FF3D9A', icon: <Gamepad2 className="h-4 w-4" />, preview: <ArcadePreview />,
      perks: ['6 cabinets: Tower Stacker, Claw Crane, Skee-Ball…', 'Free to play — win tickets and Ink', 'Prize counter, upgrades, neon decor', 'Levels up as visitors play (you get 10%)'] },
    { k: 'home', title: 'Residential · Home', body: 'Your house: the one visitors walk into from your profile.', color: '#E0745C', icon: <span className="text-base leading-none">🏠</span>, preview: <HousePreview kind="home" />,
      perks: ['Opens “Visit home” on your profile', 'Merge Home plots 2x2 … 10x10 for a bigger house', 'More floors, stairs, balconies, a roof terrace, a lift, a pool', 'Visitors check in by signing your book: a note or a drawing'] },
    { k: 'landlord', title: 'Residential · Landlord', body: 'Houses you rent out to virtual tenants.', color: '#6FA3D9', icon: <span className="text-base leading-none">🏘️</span>, preview: <HousePreview kind="landlord" />,
      perks: ['Tenants pay rent on the 1st of every month', 'Rent day: 50× USD rent from these plots, all day', 'Normal rent the rest of the month', 'Switch between Home and Landlord for free'] },
    { k: 'brawl', title: REALM_META.brawl.name, body: REALM_META.brawl.long, color: REALM_META.brawl.color, icon: <span className="text-base leading-none">🎨</span>, preview: <RealmPreview kind="brawl" />,
      perks: ['48 painted creature cards from six terrains', 'Live battles on a 3D board (or a practice bot)', 'Packs, crafting, gold foils, three decks', 'Ranked trophies, a leaderboard, Ink for wins'] },
    ...(['mine', 'sky', 'workshop', 'diner', 'dungeon'] as const).map((k) => {
      const m = REALM_META[k];
      return { k, title: m.name, body: m.long, color: m.color, icon: <span className="text-base leading-none">{m.emoji}</span>, preview: <RealmPreview kind={k} />,
        perks: [`Six zones that open as it levels up`, `${m.crew} that work while you’re away`, `${m.make}, a market and a ${m.book.toLowerCase()}`, 'A signature minigame anyone can play (you get 10%)'] };
    }),
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title={step === 'pick' ? 'What should this land become?' : 'Before you switch'} description={step === 'pick' ? `${g.name} · ${g.plot_count} plot${g.plot_count === 1 ? '' : 's'}` : undefined}>
      {step === 'pick' ? (
        <div className="grid gap-4" data-testid="plot-kind-dialog">
          <div className="grid gap-3 sm:grid-cols-2">
            {cards.map((c) => (
              <motion.button key={c.k} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }} onClick={() => setChoice(c.k)} aria-pressed={choice === c.k} data-testid={`kind-${c.k}`}
                className={cn('relative grid justify-items-center gap-2 overflow-hidden rounded-3xl border-2 p-4 text-center transition', choice === c.k ? 'bg-surface-2' : 'border-line bg-surface/40')}
                style={{ borderColor: choice === c.k ? c.color : undefined, boxShadow: choice === c.k ? `0 0 40px -12px ${c.color}` : undefined }}>
                {cur === c.k && <span className="absolute right-3 top-3 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-bold">Current</span>}
                {c.preview}
                <div className="flex items-center gap-1.5 font-display text-lg font-bold" style={{ color: c.color }}>{c.icon}{c.title}</div>
                <div className="text-sm text-muted">{c.body}</div>
                <ul className="grid gap-1 text-left text-xs">{c.perks.map((p) => <li key={p} className="flex gap-1.5"><span style={{ color: c.color }}>✦</span>{p}</li>)}</ul>
              </motion.button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
            {choice === cur ? (
              cur === 'habitat' && g.habitat_id ? <Button variant="primary" onClick={() => { onOpenChange(false); nav(`/habitat/${g.habitat_id}`); }}>Enter sanctuary <ArrowRight className="h-4 w-4" /></Button>
                : cur === 'business' && g.business_id ? <Button variant="primary" onClick={() => { onOpenChange(false); nav(`/business/${g.business_id}`); }}>Open business <ArrowRight className="h-4 w-4" /></Button>
                : isRealm(cur) && g.realm_id ? <Button variant="primary" onClick={() => { onOpenChange(false); nav(realmRoute(g.realm_id!)); }}>{REALM_META[cur].enter} <ArrowRight className="h-4 w-4" /></Button>
                : cur === 'arcade' && g.arcade_id ? <Button variant="primary" onClick={() => { onOpenChange(false); nav(`/arcade/${g.arcade_id}`); }}>Enter arcade <ArrowRight className="h-4 w-4" /></Button>
                : cur === 'home' ? <Button variant="primary" onClick={() => { onOpenChange(false); nav('/home'); }}>Enter your home <ArrowRight className="h-4 w-4" /></Button>
                : cur === 'farm' && g.farm_id ? <Button variant="primary" onClick={() => { onOpenChange(false); nav(`/farm/${g.farm_id}`); }}>Enter farm <ArrowRight className="h-4 w-4" /></Button>
                : <Button variant="primary" onClick={() => { onOpenChange(false); nav(`/create/${g.id}`); }}>Keep painting <ArrowRight className="h-4 w-4" /></Button>
            ) : <Button variant="rainbow" onClick={() => setStep('confirm')} data-testid="kind-next">Make it {KIND_A(choice)} <ArrowRight className="h-4 w-4" /></Button>}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 text-sm" data-testid="plot-kind-confirm">
          {isRealm(choice) ? (
            <ul className="grid gap-2">
              <li>{REALM_META[choice].emoji} <b>{g.name}</b> becomes {KIND_A(choice)}. {REALM_META[choice].long}</li>
              <li>💧 Its minigame, level-ups, rare finds and a daily bonus pay a little Ink (capped a day).</li>
              <li>🎨 <b>Your artwork is saved, not erased.</b> Switching back to Art Canvas brings it back exactly as it was{cur === 'habitat' ? ', and your creatures wait safely in your starter sanctuary' : ''}. If you switch this plot to another type and back, it keeps its progress too.</li>
              <li>🖌️ While it’s {KIND_A(choice).replace(/^an? /, 'a ')} you can’t paint or publish art here.</li>
            </ul>
          ) : choice === 'home' ? (
            <ul className="grid gap-2">
              <li>🏠 <b>{g.name}</b> becomes your Home: the house visitors walk into from your profile. On the map it shows as a house roof.</li>
              <li>📐 The biggest square of Home plots you own sets your house’s size: 2x2 adds an upstairs and a staircase, and each size up to 10x10 adds more (floors, balconies, a roof terrace, a lift, a rooftop pool).</li>
              <li>📖 Visitors check in by signing your book with a note or a drawing.</li>
              <li>🎨 <b>Your artwork is saved, not erased.</b> Switching back to Art Canvas brings it back exactly as it was.</li>
            </ul>
          ) : choice === 'landlord' ? (
            <ul className="grid gap-2">
              <li>🏘️ <b>{g.name}</b> becomes houses you rent out to virtual tenants. On the map it shows as a little street of houses.</li>
              <li>💵 On the 1st of every month (rent day, UTC) these plots earn <b>50×</b> their USD rent for the whole day, then their normal rent for the rest of the month.</li>
              <li>🔁 Switching between Home and Landlord is free.</li>
              <li>🎨 <b>Your artwork is saved, not erased.</b> Switching back to Art Canvas brings it back exactly as it was.</li>
            </ul>
          ) : choice === 'arcade' ? (
            <ul className="grid gap-2">
              <li>🕹️ <b>{g.name}</b> becomes a neon arcade with Tower Stacker and Cyclone ready to play. On the map it shows as a glowing arcade front instead of your painting.</li>
              <li>🎟️ Every game is free and won by skill. Scores win tickets for prizes and upgrades, and a little Ink.</li>
              <li>🎨 <b>Your artwork is saved, not erased.</b> Switching back to Art Canvas brings it back exactly as it was{cur === 'habitat' ? ', and your creatures wait safely in your starter sanctuary' : ''}.</li>
              <li>🖌️ While it’s an arcade you can’t paint or publish art here.</li>
            </ul>
          ) : choice === 'business' ? (
            <ul className="grid gap-2">
              <li>🍋 <b>{g.name}</b> becomes a business, starting with a lemonade stand. On the map it shows as a little shop front instead of your painting.</li>
              <li>🏢 Your business empire is yours, not the plot’s: every business plot you own adds 10% to all of it.</li>
              <li>🎨 <b>Your artwork is saved, not erased.</b> Switching back to Art Canvas brings it back exactly as it was{cur === 'habitat' ? ', and your creatures wait safely in your starter sanctuary' : ''}.</li>
              <li>🖌️ While it’s a business you can’t paint or publish art here.</li>
            </ul>
          ) : choice === 'farm' ? (
            <ul className="grid gap-2">
              <li>🌾 <b>{g.name}</b> becomes a farm with {Math.min(48, 6 + 4 * (g.plot_count - 1))} soil beds. On the map it shows as rows of crops instead of your painting.</li>
              <li>🎨 <b>Your artwork is saved, not erased.</b> Switching back to Art Canvas brings it back exactly as it was{cur === 'habitat' ? ', and your creatures wait safely in your starter sanctuary' : ''}.</li>
              <li>🖌️ While it’s a farm you can’t paint or publish art here.</li>
            </ul>
          ) : choice === 'habitat' ? (
            <ul className="grid gap-2">
              <li>🌳 <b>{g.name}</b> becomes a woodland sanctuary. On the map it shows as a miniature forest instead of your painting.</li>
              <li>🎨 <b>Your artwork is saved, not erased.</b> The canvas and every version stay in your history, and switching back to Art Canvas brings them back exactly as they were.</li>
              <li>🖌️ While it’s a habitat you can’t paint or publish art here.</li>
            </ul>
          ) : (
            <ul className="grid gap-2">
              <li>🎨 <b>{g.name}</b> becomes an Art Canvas again, with your previous artwork restored.</li>
              <li>🐾 <b>Your creatures are safe.</b> Everyone living here moves to your starter sanctuary, and they’ll come home if you switch back.</li>
              <li>🌲 The sanctuary’s decorations are kept, ready for next time.</li>
            </ul>
          )}
          <p className="flex items-center gap-2 rounded-2xl bg-ok/10 p-3 text-xs text-ok"><ShieldCheck className="h-4 w-4 shrink-0" /> Switching costs 20 Ink (free for a plot you’ve just claimed). It doesn’t change your rent or plot ownership, and nothing is lost.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStep('pick')}>Back</Button>
            <Button variant="rainbow" loading={busy} onClick={go} data-testid="kind-confirm">Switch to {KIND_NAME(choice)}</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
