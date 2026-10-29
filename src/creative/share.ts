// Share a drawing: as an image where the phone supports sharing files, otherwise the link
// (or a downloaded PNG when there's no link).
import { toast } from 'sonner';
import { drawStrokes, type Stroke } from '../shared/strokes';

export function drawingPng(parts: { strokes: Stroke[] | null; clip?: { y0: number; y1: number } }[], label?: string, size = 900) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size + (label ? 80 : 0);
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  for (const p of parts) {
    g.save();
    if (p.clip) { g.beginPath(); g.rect(0, (p.clip.y0 / 1000) * size, size, ((p.clip.y1 - p.clip.y0) / 1000) * size); g.clip(); }
    drawStrokes(g, p.strokes ?? [], size);
    g.restore();
  }
  if (label) {
    g.fillStyle = '#0B1230';
    g.fillRect(0, size, size, 80);
    g.fillStyle = '#ffffff';
    g.font = 'bold 30px system-ui, sans-serif';
    g.fillText(label, 28, size + 50);
    g.textAlign = 'right';
    g.fillStyle = '#FFE14D';
    g.fillText('LANDVAS', size - 28, size + 50);
  }
  return new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
}

export async function shareDrawing(opts: { parts: { strokes: Stroke[] | null; clip?: { y0: number; y1: number } }[]; title: string; url?: string; text?: string }) {
  try {
    const blob = await drawingPng(opts.parts, opts.title);
    const file = new File([blob], `${opts.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'landvas'}.png`, { type: 'image/png' });
    const data: ShareData = { title: opts.title, text: opts.text ?? `${opts.title} — made on LANDVAS`, ...(opts.url ? { url: opts.url } : {}) };
    if (navigator.canShare?.({ ...data, files: [file] })) { await navigator.share({ ...data, files: [file] }); return; }
    if (navigator.share && opts.url) { await navigator.share(data); return; }
    if (opts.url) { await navigator.clipboard.writeText(opts.url); toast.success('Link copied'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch { /* cancelled */ }
}
