// Watching someone play — the sending side. While anyone's watching, the game takes a picture of the screen a couple
// of times a second: the page itself (its HTML: the watchers' app already has the same styles, so it looks the same
// there) with every canvas on it (a game board, a 3D scene, a drawing) swapped for a small JPEG of what it shows.
// Never the map, chats or anything the player types: only game and play screens are sent (see WatchHost), dialogs
// and toasts live outside the page root, and typed text isn't part of a page's HTML.

/** messages on a watch channel */
export type WatchMsg =
  /** a watcher, every few seconds while they watch */
  | { t: 'hi'; id: string; u: string }
  | { t: 'bye'; id: string }
  /** a reaction (from a watcher, shown to everyone) */
  | { t: 'r'; id: string; u: string; e: string }
  /** what they're up to (and whether there's anything to see) */
  | { t: 's'; on: boolean; label: string; n: number; names: string[] }
  /** a picture of the screen */
  | { t: 'f'; seq: number; w: number; h: number; html: string; gz: boolean; cv: (string | null)[]; hc: string; hs: string; bc: string };

export const REACTIONS = ['👏', '🔥', '😂', '😮', '❤️', '💯'] as const;

/** never sent: things that live on top of the game but aren't it */
export const NO_WATCH = '[data-no-watch],[data-sonner-toaster],script,noscript,template,iframe,object,embed';

const MAX_CANVASES = 4;
/** the frame after the scenes have drawn: a WebGL canvas can only be read then (before the screen shows it) */
const inFrame = <T,>(fn: () => T) => new Promise<T>((res) => setTimeout(() => requestAnimationFrame(() => res(fn())), 0));

/** a nearly blank picture: a 3D scene that didn't draw this frame (or an empty canvas) */
function blank(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const d = ctx.getImageData(0, 0, w, h).data;
  const step = Math.max(4, Math.floor(d.length / 4 / 97)) * 4;
  for (let i = 0; i < d.length; i += step) if (d[i + 3] !== 0 && (d[i] | d[i + 1] | d[i + 2]) !== 0) return false;
  return true;
}

/** a canvas, smaller, as it looks right now (null: nothing to show this frame) */
function grab(c: HTMLCanvasElement, maxW: number): HTMLCanvasElement | null {
  const cw = c.clientWidth || c.width, ch = c.clientHeight || c.height;
  if (!cw || !ch || !c.width || !c.height) return null;
  const k = Math.min(1, maxW / cw), w = Math.max(1, Math.round(cw * k)), h = Math.max(1, Math.round(ch * k));
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try { ctx.drawImage(c, 0, 0, w, h); } catch { return null; } // (a canvas that drew someone else's picture can't be read)
  return blank(ctx, w, h) ? null : out;
}

const encode = (c: HTMLCanvasElement, q: number) => new Promise<string | null>((res) => {
  try {
    c.toBlob((b) => {
      if (!b) return res(null);
      const r = new FileReader(); r.onload = () => res(typeof r.result === 'string' ? r.result : null); r.onerror = () => res(null); r.readAsDataURL(b);
    }, 'image/jpeg', q);
  } catch { res(null); }
});

/** the canvases worth a picture: on screen, big enough, biggest first */
function shownCanvases(root: HTMLElement) {
  const vw = innerWidth, vh = innerHeight;
  return [...root.querySelectorAll('canvas')].map((c, i) => ({ c, i, r: c.getBoundingClientRect() }))
    .filter(({ c, r }) => r.width * r.height >= 2500 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh && !c.closest(NO_WATCH)
      && getComputedStyle(c).visibility !== 'hidden')
    .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height).slice(0, MAX_CANVASES);
}

const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
async function pack(text: string): Promise<{ html: string; gz: boolean }> {
  if (typeof CompressionStream === 'undefined') return { html: text, gz: false };
  try {
    const buf = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    return { html: b64(new Uint8Array(buf)), gz: true };
  } catch { return { html: text, gz: false }; }
}

/** a picture of the screen, as a message (null: too big to send, or nothing there) */
export async function snapshot(seq: number, maxKb: number): Promise<Extract<WatchMsg, { t: 'f' }> | null> {
  const root = document.getElementById('root');
  if (!root) return null;
  const shown = shownCanvases(root);
  // the canvases, in the frame after they've drawn (a 3D scene that skipped a frame gets a couple more tries)
  let pics: (HTMLCanvasElement | null)[] = shown.map(() => null);
  for (let tries = 0; tries < 4 && pics.some((p) => !p); tries++) {
    pics = await inFrame(() => shown.map((s, k) => pics[k] ?? grab(s.c, k === 0 ? 360 : 200)));
  }
  const cv = await Promise.all(pics.map((p, k) => (p ? encode(p, k === 0 ? 0.55 : 0.45) : null)));
  // the page, each canvas swapped for its picture
  const all = [...root.querySelectorAll('canvas')];
  const clone = root.cloneNode(true) as HTMLElement;
  const copies = [...clone.querySelectorAll('canvas')];
  copies.forEach((cc, i) => {
    const orig = all[i], k = shown.findIndex((s) => s.c === orig);
    const w = orig?.clientWidth ?? 0, h = orig?.clientHeight ?? 0;
    const el = document.createElement(k >= 0 ? 'img' : 'div');
    if (cc.className) el.setAttribute('class', cc.getAttribute('class') ?? '');
    el.setAttribute('style', `${cc.getAttribute('style') ?? ''};width:${w}px;height:${h}px;object-fit:fill;display:${getComputedStyle(orig ?? cc).display === 'none' ? 'none' : 'block'}`);
    if (k >= 0) el.setAttribute('data-lvcv', String(k));
    cc.replaceWith(el);
  });
  clone.querySelectorAll(NO_WATCH).forEach((e) => e.remove());
  clone.querySelectorAll('input, textarea').forEach((e) => { e.removeAttribute('value'); if (e.tagName === 'TEXTAREA') e.textContent = ''; });
  const { html, gz } = await pack(clone.innerHTML);
  const de = document.documentElement;
  const msg = { t: 'f' as const, seq, w: innerWidth, h: innerHeight, html, gz, cv: cv as (string | null)[], hc: de.className, hs: de.getAttribute('style') ?? '', bc: document.body.className };
  // keep it small enough to send: drop the smaller pictures first, then the big one
  const size = () => msg.html.length + msg.cv.reduce((n, c) => n + (c?.length ?? 0), 0);
  for (let k = msg.cv.length - 1; k >= 0 && size() > maxKb * 1024; k--) msg.cv[k] = null;
  return size() > maxKb * 1024 ? null : msg;
}
