// Shared 3D settings for phones. An iPhone draws at 3x its screen size, which triples the pixels every 3D
// scene has to fill (and drains the battery); 1.5x looks just as sharp in motion. Scenes also step their
// resolution down by themselves if frames start running slow, and back up when there's room.
const mobileUA = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android|Mobi/i.test(navigator.userAgent);
export const isPhone = () => mobileUA || (typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 600 && matchMedia('(pointer: coarse)').matches);
/** The pixel ratio a 3D scene should start at. */
export const sceneDpr = (max = 2) => Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, isPhone() ? 1.5 : max);
/** Antialiasing costs a lot on phones (and barely shows at 1.5x). */
export const sceneAntialias = () => !isPhone();

/** Watches frame times and nudges a renderer's pixel ratio down (or back up) to keep things smooth. */
export function adaptiveDpr(setDpr: (d: number) => void, start = sceneDpr()) {
  let dpr = start, acc = 0, n = 0;
  return (rawDt: number) => {
    acc += rawDt; n++;
    if (acc < 2) return;
    const avg = acc / n; acc = 0; n = 0;
    const next = avg > 0.024 ? Math.max(0.75, dpr - 0.25) : avg < 0.0145 ? Math.min(start, dpr + 0.1) : dpr;
    if (Math.abs(next - dpr) > 0.01) { dpr = next; setDpr(dpr); }
  };
}
