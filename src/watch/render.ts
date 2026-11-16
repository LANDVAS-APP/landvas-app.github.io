// Watching someone play — the showing side. A picture of their screen arrives as HTML (plus small JPEGs of its
// canvases); it's shown inside a sandboxed frame that can't run anything (no scripts, no forms, nothing loaded from
// anywhere else), after a clean-up that drops anything that could act (scripts, links, redirects, event handlers).
// Each new picture is patched onto the last one rather than replacing it, so nothing flickers.
import type { WatchMsg } from './stream';

type Frame = Extract<WatchMsg, { t: 'f' }>;

/** elements that never come through (they could load, navigate, submit or run something) */
const DROP = new Set(['script', 'noscript', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'meta', 'base',
  'link', 'form', 'portal', 'audio', 'video', 'source', 'track', 'title', 'head', 'foreignobject', 'animate', 'set', 'animatemotion', 'animatetransform', 'discard', 'handler', 'listener']);
/** attributes that point somewhere: only kept when they point at something harmless */
const URL_ATTRS = new Set(['src', 'href', 'xlink:href', 'srcset', 'action', 'formaction', 'poster', 'background', 'ping', 'srcdoc', 'data', 'codebase', 'cite', 'longdesc', 'lowsrc', 'dynsrc', 'manifest', 'usemap']);
const SAFE_IMG = /^(data:image\/(png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$|\/(?!\/)[\w\-./%]*$)/i;
const BAD_CSS = /expression\s*\(|@import|behavior\s*:|-moz-binding|javascript:|@font-face/i;

/** CSS with nothing that loads from elsewhere (pictures inlined as data are fine), or null if it's up to something */
export function cleanCss(s: string): string | null {
  const out = s.replace(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi, (m, _q, u: string) => (/^data:image\/(png|jpe?g|webp|gif|avif|svg\+xml)[;,]/i.test(u.trim()) ? m : 'none'));
  return BAD_CSS.test(out) ? null : out;
}
const okClass = (s: string) => s.replace(/[^\w\-:./[\]%#!(), ]/g, '').slice(0, 2000);

/** an attribute that's fine to show */
function keepAttr(el: Element, name: string, value: string) {
  const n = name.toLowerCase();
  if (n.startsWith('on') || n === 'http-equiv' || n === 'autofocus' || n === 'contenteditable' || n === 'is' || n === 'tabindex') return false;
  if (n === 'style') { const c = cleanCss(value); if (c !== null && c !== value) el.setAttribute(name, c); return c !== null; }
  if (URL_ATTRS.has(n)) {
    const tag = el.tagName.toLowerCase();
    // a fragment inside the same picture (an SVG gradient, a <use>) or a picture of our own (an avatar, an icon)
    if ((n === 'href' || n === 'xlink:href') && (tag === 'use' || tag === 'lineargradient' || tag === 'radialgradient' || tag === 'pattern' || tag === 'textpath' || tag === 'mpath')) return /^#[\w\-:.]+$/.test(value);
    if ((n === 'src' && tag === 'img') || ((n === 'href' || n === 'xlink:href') && tag === 'image')) return SAFE_IMG.test(value.trim());
    return false;
  }
  return true;
}

/** clean a parsed picture in place: whatever could act is gone */
export function sanitize(root: ParentNode) {
  const walk = (node: ParentNode) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 8) { child.remove(); continue; } // comments
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (DROP.has(tag)) { el.remove(); continue; }
      for (const a of [...el.attributes]) if (!keepAttr(el, a.name, a.value)) el.removeAttribute(a.name);
      if (tag === 'style') { const c = cleanCss(el.textContent ?? ''); if (c === null) { el.remove(); continue; } if (c !== el.textContent) el.textContent = c; }
      if (tag === 'a') el.removeAttribute('target');
      walk(el);
    }
  };
  walk(root);
  return root;
}

/** the frame's empty page: our own styles, and a policy that lets nothing load from anywhere else or run */
export function stageDoc() {
  const styles = [...document.head.querySelectorAll('link[rel=stylesheet], style')].map((n) => n.outerHTML).join('');
  const csp = "default-src 'none'; script-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; form-action 'none'; base-uri 'none'";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">${styles}`
    + `<style>html,body{margin:0;overflow:hidden!important;pointer-events:none!important;user-select:none}*{animation-play-state:running}</style></head><body></body></html>`;
}

async function unpack(f: Frame) {
  if (!f.gz) return f.html;
  const bin = atob(f.html), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

/** patch `cur`'s attributes to match `next` (keeping a canvas picture that's already there) */
function syncAttrs(cur: Element, next: Element) {
  for (const a of [...cur.attributes]) if (!next.hasAttribute(a.name) && !(a.name === 'src' && cur.hasAttribute('data-lvcv'))) cur.removeAttribute(a.name);
  for (const a of [...next.attributes]) if (cur.getAttribute(a.name) !== a.value) { try { cur.setAttribute(a.name, a.value); } catch { /* an odd name */ } }
}
/** make `cur`'s children match `next`'s, reusing what's already there */
function morph(cur: Node, next: Node, doc: Document) {
  const a = cur.childNodes, b = next.childNodes;
  for (let i = 0; i < b.length; i++) {
    const x = a[i], y = b[i];
    if (!x) { cur.appendChild(doc.importNode(y, true)); continue; }
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) { cur.replaceChild(doc.importNode(y, true), x); continue; }
    if (y.nodeType === 3) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
    if (y.nodeType === 1) { syncAttrs(x as Element, y as Element); morph(x, y, doc); }
  }
  while (a.length > b.length) cur.removeChild(cur.lastChild!);
}

/** show a picture of their screen in the frame */
export async function paint(doc: Document, f: Frame) {
  const html = await unpack(f);
  const parsed = new DOMParser().parseFromString(`<!doctype html><html><head></head><body>${html}</body></html>`, 'text/html');
  sanitize(parsed.body);
  morph(doc.body, parsed.body, doc);
  doc.documentElement.className = okClass(f.hc ?? '');
  const hs = cleanCss(f.hs ?? '');
  if (hs) doc.documentElement.setAttribute('style', hs); else doc.documentElement.removeAttribute('style');
  doc.body.className = okClass(f.bc ?? '');
  doc.querySelectorAll('img[data-lvcv]').forEach((img) => {
    const src = f.cv?.[Number(img.getAttribute('data-lvcv'))];
    // (no picture this time — a 3D scene resting between frames: keep the last one)
    if (src && /^data:image\/jpeg;base64,/.test(src) && img.getAttribute('src') !== src) img.setAttribute('src', src);
  });
}
