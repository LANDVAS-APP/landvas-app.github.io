// Floating buttons step aside for words. A button that floats over the page (the Worlds button, the Puppeteer's little
// stage) checks what's under it whenever the page settles (a scroll stops, the screen turns, you change screens, and
// every few seconds while it's open): if there are words under where it floats, it tucks into the edge until the words
// have scrolled on. Cheap: a few elementsFromPoint calls, only after things settle, never while the app is hidden.
import { useEffect, useState } from 'react';

type Box = { left: number; top: number; right: number; bottom: number };

/** Is there a run of text at this point (inside this element, not its children)? */
function textAt(el: Element, x: number, y: number) {
  for (const n of el.childNodes) {
    if (n.nodeType !== 3 || !/[\p{L}\p{N}]/u.test(n.textContent ?? '')) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    for (const q of r.getClientRects()) if (x >= q.left - 3 && x <= q.right + 3 && y >= q.top - 2 && y <= q.bottom + 2) return true;
  }
  return false;
}

/** Are there words under this box (anything but `self`'s own, or another floating thing's — marked data-dodge)? Looks at a
 *  grid of points across it. */
export function wordsUnder(b: Box, self?: Element | null, grid = 4): boolean {
  if (typeof document === 'undefined' || !document.elementsFromPoint) return false;
  const w = b.right - b.left, h = b.bottom - b.top;
  if (w <= 0 || h <= 0) return false;
  for (let i = 0; i < grid; i++) for (let j = 0; j < grid; j++) {
    const x = b.left + (w * (i + 0.5)) / grid, y = b.top + (h * (j + 0.5)) / grid;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
    for (const el of document.elementsFromPoint(x, y)) {
      if ((self && (el === self || self.contains(el))) || el.closest('[data-dodge]')) continue; // (the floating things themselves)
      if (el === document.body || el === document.documentElement) break;
      if (textAt(el, x, y)) return true;
    }
  }
  return false;
}

/** true while there are words under the box `where()` gives (re-checked whenever the page settles) */
export function useDodgeWords(where: () => (Box & { self?: Element | null }) | null, on: boolean, key: unknown): boolean {
  const [under, setUnder] = useState(false);
  useEffect(() => {
    if (!on) { setUnder(false); return; }
    let t: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (document.hidden) return;
      const b = where();
      setUnder(b ? wordsUnder(b, b.self) : false);
    };
    const settle = () => { clearTimeout(t); t = setTimeout(check, 260); };
    settle();
    // (a screen's words can arrive after it opens: look again a little later, and now and then)
    const later = setTimeout(check, 1200);
    const every = setInterval(check, 3500);
    addEventListener('scroll', settle, { capture: true, passive: true });
    addEventListener('resize', settle);
    document.addEventListener('visibilitychange', settle);
    return () => {
      clearTimeout(t); clearTimeout(later); clearInterval(every);
      removeEventListener('scroll', settle, { capture: true });
      removeEventListener('resize', settle);
      document.removeEventListener('visibilitychange', settle);
    };
  }, [on, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return under;
}
