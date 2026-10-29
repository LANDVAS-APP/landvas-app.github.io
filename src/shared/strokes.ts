// Drawings for the creative games, stored as strokes: colour index, width and a flat list of
// x, y, t (0-1000 board units; t in ms from the start of the drawing). Small to store, and
// they replay stroke by stroke as a time-lapse.
export type Stroke = { c: number; w: number; p: number[] };

/** Index 0 is paper (the eraser). */
export const SKETCH_COLORS = ['#FFFFFF', '#23232A', '#6B7280', '#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#1E9E5A', '#34C3FF', '#2E5BFF', '#7B5CFF', '#FF4FD8', '#8B5A2B', '#F6C9A8', '#C7F0FF', '#FFD6E8'];

/** When the drawing ends (ms). */
export const strokesEnd = (s: Stroke[]) => s.reduce((m, k) => Math.max(m, k.p.length >= 3 ? k.p[k.p.length - 1] : 0), 0);

/** Draw strokes onto a 2D context sized `size` px (square). `until` replays up to that moment. */
export function drawStrokes(g: CanvasRenderingContext2D, strokes: Stroke[], size: number, until = Infinity) {
  const k = size / 1000;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const s of strokes) {
    const p = s.p;
    if (p.length < 3 || p[2] > until) continue;
    g.strokeStyle = g.fillStyle = SKETCH_COLORS[s.c] ?? '#000';
    g.lineWidth = Math.max(1, s.w * k);
    if (p.length === 3) {
      g.beginPath();
      g.arc(p[0] * k, p[1] * k, Math.max(0.5, (s.w * k) / 2), 0, Math.PI * 2);
      g.fill();
      continue;
    }
    g.beginPath();
    g.moveTo(p[0] * k, p[1] * k);
    for (let i = 3; i < p.length; i += 3) {
      if (p[i + 2] > until) break;
      g.lineTo(p[i] * k, p[i + 1] * k);
    }
    g.stroke();
  }
}
