// "Create" helpers for people who don't (yet) think of themselves as artists:
// an idea generator with a matching palette, a shade ramp for any colour, a trace
// guide (paint over a reference picture), and pixel art in four easy steps.
import { useQuery } from '@tanstack/react-query';
import { Dice5, Eye, EyeOff, FlipHorizontal2, ImageUp, Lightbulb, Palette, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../backend/api';
import type { Editor } from '../engine/Editor';
import { cn } from '../../lib/utils';
import { Button } from '../../ui';

// ---- ideas ---------------------------------------------------------------------------
const SUBJECTS = ['a fox', 'a lighthouse', 'a tiny dragon', 'a cat astronaut', 'a cozy cabin', 'a koi fish', 'a robot gardener', 'a hot air balloon', 'a mushroom house',
  'a whale in the sky', 'a lantern', 'an owl', 'a cactus with a hat', 'a volcano', 'a sailboat', 'a jellyfish', 'a treehouse', 'a frog knight', 'a ramen bowl',
  'a crystal', 'a phoenix', 'a snowman', 'a castle', 'a bee', 'a cup of coffee', 'a sunflower', 'a ghost', 'a penguin', 'a rocket', 'a waterfall'];
const PLACES = ['at sunset', 'under the sea', 'on the moon', 'in a rainy city', 'in a candy forest', 'on a floating island', 'in the desert at night', 'in a snow globe',
  'among giant flowers', 'in neon city lights', 'on a cloud', 'in an autumn forest', 'by a campfire', 'in a crystal cave', 'on a beach'];
const TWISTS = ['made of fruit', 'that glows', 'in only 4 colours', 'drawn with one line', 'from above', 'that is tiny', 'that is enormous', 'in your favourite colour',
  'with a hidden smile', 'mirrored perfectly', 'with a rainbow trail', 'at three times of day', 'wearing sunglasses', 'as a stained-glass window', 'with stars everywhere'];

export const IDEA_PALETTES: { name: string; colors: string[] }[] = [
  { name: 'Sunset', colors: ['#2B1B3D', '#6B2D5C', '#B83B5E', '#F08A5D', '#F9D56E', '#FFF4D6'] },
  { name: 'Ocean', colors: ['#0B1D3A', '#124E78', '#1B8AA6', '#56C3C9', '#B5EAD7', '#F1FAEE'] },
  { name: 'Forest', colors: ['#1B2A1E', '#2F4F2F', '#4E7A3F', '#8DB355', '#D9E58F', '#F4EFD3'] },
  { name: 'Neon night', colors: ['#0D0221', '#261447', '#6A0DAD', '#FF2E88', '#2DE2E6', '#F6F930'] },
  { name: 'Candy', colors: ['#5B2A86', '#D16BA5', '#FF9AA2', '#FFD3B6', '#A8E6CF', '#FFFFFF'] },
  { name: 'Autumn', colors: ['#3B1F0E', '#7A3B12', '#C0601C', '#E89B2E', '#F4CE68', '#FBF1D3'] },
  { name: 'Ice', colors: ['#1A2238', '#2E4A7D', '#5A8DD6', '#9CC8F2', '#DCEFFF', '#FFFFFF'] },
  { name: 'Desert', colors: ['#3D2B1F', '#7F5539', '#B08968', '#DDB892', '#EDE0D4', '#FFF8F0'] },
];

const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const newIdea = () => ({ text: `${rnd(SUBJECTS)} ${rnd(PLACES)}, ${rnd(TWISTS)}`, palette: rnd(IDEA_PALETTES) });

// ---- colour ramps --------------------------------------------------------------------
function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToHex(h: number, s: number, l: number) {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (k: number) => { const n = (k + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(n - 3, 9 - n, 1)))); };
  return `#${[f(0), f(8), f(4)].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
const toward = (h: number, target: number, k: number) => { let d = ((target - h + 540) % 360) - 180; return h + d * k; };
/** Shadows lean cool (toward blue/purple), highlights lean warm (toward yellow): the classic pixel-art ramp. */
export function shadeRamp(hex: string): string[] {
  const [h, s, l] = hexToHsl(hex);
  return [-3, -2, -1, 0, 1, 2, 3].map((k) => {
    if (k === 0) return hex.toUpperCase();
    const hue = k < 0 ? toward(h, 250, -k * 0.08) : toward(h, 55, k * 0.07);
    const light = Math.max(0.06, Math.min(0.95, l + k * (k < 0 ? 0.11 : 0.1)));
    const sat = Math.max(0, Math.min(1, s * (k < 0 ? 1 + -k * 0.05 : 1 - k * 0.08)));
    return hslToHex(hue, sat, light);
  });
}

// ---- the panel ---------------------------------------------------------------------------
const STEPS = [
  { title: 'Silhouette', tip: 'Block in the big shape with one dark colour. If you can tell what it is from the outline, you’re winning.' },
  { title: 'Base colours', tip: 'Fill each part with a flat mid-tone from your palette. 3–5 colours is plenty.' },
  { title: 'Shade', tip: 'Pick one light direction. Paint the far side with the darker shade of each colour.' },
  { title: 'Highlight', tip: 'Add a few bright pixels where the light hits. Then a background — it makes the picture pop.' },
];

export function CreatePanel({ ed }: { ed: Editor }) {
  const [idea, setIdea] = useState(newIdea);
  const [, force] = useState(0);
  const ch = useQuery({ queryKey: ['challenges'], queryFn: api.challenges, staleTime: 60_000 });
  const theme = ch.data?.active?.[0];
  useEffect(() => ed.subscribe(() => force((x) => x + 1)), [ed]);
  const pick = (c: string) => ed.set({ color: c });
  const pickGuide = async (f: File | undefined) => {
    if (!f) return;
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
      ed.guide = { src: bmp, opacity: 0.35, visible: true };
      ed.requestRender();
      ed.emit();
    } catch { /* not an image */ }
  };
  const g = ed.guide;
  return (
    <div className="grid gap-5" data-testid="create-panel">
      <section className="grid gap-2 rounded-2xl border border-gold/40 bg-gold/5 p-3">
        <div className="flex items-center gap-2 text-sm font-bold"><Lightbulb className="h-4 w-4 text-gold" /> Need an idea?</div>
        {theme && <p className="text-xs text-muted">This week’s challenge: <b className="text-fg">{theme.title}</b>{theme.theme ? ` — ${theme.theme}` : ''}</p>}
        <p className="font-display text-base font-semibold leading-snug" data-testid="idea-text">Paint {idea.text}.</p>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted">{idea.palette.name}</span>
          {idea.palette.colors.map((c) => <button key={c} className={cn('h-6 w-6 rounded-md border', ed.s.color === c ? 'border-fg ring-2 ring-accent-2' : 'border-line')} style={{ background: c }} onClick={() => pick(c)} aria-label={`Colour ${c}`} />)}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setIdea(newIdea())} data-testid="new-idea"><Dice5 className="h-4 w-4" /> New idea</Button>
          <Button size="sm" variant="ghost" onClick={() => ed.set({ color: idea.palette.colors[2], color2: idea.palette.colors[0] })}><Palette className="h-4 w-4" /> Use these colours</Button>
        </div>
      </section>

      <section>
        <div className="eyebrow mb-1.5">Shades of your colour</div>
        <div className="grid grid-cols-7 gap-1.5" data-testid="shade-ramp">
          {shadeRamp(ed.s.color).map((c, i) => (
            <button key={c + i} title={i < 3 ? 'Shadow' : i > 3 ? 'Highlight' : 'Your colour'} className={cn('aspect-square rounded-md border', i === 3 ? 'border-fg' : 'border-line')} style={{ background: c }} onClick={() => pick(c)} aria-label={`Shade ${c}`} />
          ))}
        </div>
        <p className="mt-1 text-[11px] text-faint">Darker shades lean cool, lighter ones warm — paint the shadow side darker and add a few highlights for instant depth.</p>
      </section>

      <section className="grid gap-2">
        <div className="eyebrow">Trace a picture</div>
        {!g ? (
          <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-line-strong p-3 text-sm hover:bg-surface-2" data-testid="trace-pick">
            <ImageUp className="h-5 w-5 text-accent-2" />
            <span><b>Pick a reference</b><span className="block text-xs text-muted">It shows faintly on top so you can paint over it. It’s only a guide — never saved or published.</span></span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => void pickGuide(e.target.files?.[0])} />
          </label>
        ) : (
          <div className="grid gap-2 rounded-2xl border border-line p-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-muted">Guide strength
              <input type="range" min={5} max={80} value={Math.round(g.opacity * 100)} className="flex-1" onChange={(e) => { g.opacity = Number(e.target.value) / 100; ed.requestRender(); ed.emit(); }} />
            </label>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => { g.visible = !g.visible; ed.requestRender(); ed.emit(); }}>{g.visible ? <><EyeOff className="h-4 w-4" /> Hide</> : <><Eye className="h-4 w-4" /> Show</>}</Button>
              <Button size="sm" variant="ghost" onClick={() => { ed.guide = null; ed.requestRender(); ed.emit(); }}><Trash2 className="h-4 w-4" /> Remove</Button>
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-2">
        <div className="eyebrow">Pixel art in 4 steps</div>
        <ol className="grid gap-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-2 text-xs"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 font-bold text-accent">{i + 1}</span><span><b className="text-fg">{s.title}.</b> <span className="text-muted">{s.tip}</span></span></li>
          ))}
        </ol>
        <Button size="sm" variant={ed.s.symmetry === 'vertical' ? 'primary' : 'secondary'} className="justify-self-start" onClick={() => ed.set({ tool: 'brush', symmetry: ed.s.symmetry === 'vertical' ? 'off' : 'vertical' })} data-testid="mirror-toggle">
          <FlipHorizontal2 className="h-4 w-4" /> {ed.s.symmetry === 'vertical' ? 'Mirror on' : 'Paint with a mirror'}
        </Button>
        <p className="text-[11px] text-faint">The mirror copies every stroke to the other side — faces, creatures, buildings and logos come out balanced.</p>
      </section>

      <p className="rounded-2xl bg-accent/10 p-3 text-xs text-muted">New ideas earn the full craft bonus. Pieces that repeat your earlier art (even moved, flipped or recoloured) earn only a little, and imported images earn none — so paint something you haven’t painted before.</p>
    </div>
  );
}
