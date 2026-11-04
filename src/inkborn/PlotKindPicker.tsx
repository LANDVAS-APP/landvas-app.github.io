// Choosing what a plot becomes: an Art Canvas or an Inkborn Habitat. Switching keeps the
// other side safe — artwork and every version stay saved, and a habitat keeps its layout and
// remembers who lived there — so switching back brings it all back.
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowRight, Brush, PawPrint, ShieldCheck, TreePine, Wheat } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { PlotKind } from '../backend/types';
import { invalidateGame, qk } from '../lib/queries';
import { cn } from '../lib/utils';
import { Button, Dialog } from '../ui';
import { drawHabitatPlot } from '../map/plotTiles';
import { CreatureView } from './CreatureView';
import { randomGenome } from './genome';

type G = { id: string; kind?: PlotKind; plot_count: number; habitat_id?: string | null; farm_id?: string | null; name: string };

export function PlotKindBadge({ kind }: { kind?: PlotKind }) {
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
      void qc.invalidateQueries({ queryKey: qk.groups });
      void qc.invalidateQueries({ queryKey: ['sanctuaries'] });
      void qc.invalidateQueries({ queryKey: ['plot'] });
      onOpenChange(false);
      if (choice === 'habitat') {
        toast.success(`${g.name} is now an Inkborn Habitat`, { description: 'A little woodland has grown on your plot.' });
        if (r.habitat_id) nav(`/habitat/${r.habitat_id}`);
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
      perks: [`${Math.min(48, 6 + 4 * (g.plot_count - 1))} soil beds in a 3D farmyard`, '8 crops, from 3-minute carrots to golden melons', 'Sell your harvest at the market for Ink', '4 farm games (2D and 3D)'] },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title={step === 'pick' ? 'What should this land become?' : 'Before you switch'} description={step === 'pick' ? `${g.name} · ${g.plot_count} plot${g.plot_count === 1 ? '' : 's'}` : undefined}>
      {step === 'pick' ? (
        <div className="grid gap-4" data-testid="plot-kind-dialog">
          <div className="grid gap-3 sm:grid-cols-3">
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
                : cur === 'farm' && g.farm_id ? <Button variant="primary" onClick={() => { onOpenChange(false); nav(`/farm/${g.farm_id}`); }}>Enter farm <ArrowRight className="h-4 w-4" /></Button>
                : <Button variant="primary" onClick={() => { onOpenChange(false); nav(`/create/${g.id}`); }}>Keep painting <ArrowRight className="h-4 w-4" /></Button>
            ) : <Button variant="rainbow" onClick={() => setStep('confirm')} data-testid="kind-next">Make it {choice === 'habitat' ? 'a Habitat' : choice === 'farm' ? 'a Farm' : 'an Art Canvas'} <ArrowRight className="h-4 w-4" /></Button>}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 text-sm" data-testid="plot-kind-confirm">
          {choice === 'farm' ? (
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
          <p className="flex items-center gap-2 rounded-2xl bg-ok/10 p-3 text-xs text-ok"><ShieldCheck className="h-4 w-4 shrink-0" /> Switching is free and doesn’t change your Ink, rent or plot ownership.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStep('pick')}>Back</Button>
            <Button variant="rainbow" loading={busy} onClick={go} data-testid="kind-confirm">Switch to {choice === 'habitat' ? 'Inkborn Habitat' : choice === 'farm' ? 'Farm' : 'Art Canvas'}</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
