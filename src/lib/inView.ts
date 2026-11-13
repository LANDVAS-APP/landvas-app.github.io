// Looping SVG previews (SMIL <animate>) run only while they're on screen. An SVG animation restyles and repaints its
// picture every frame wherever it is — a long list of minigame cards kept the phone redrawing all of them, the ones
// scrolled out of sight included. One shared observer pauses each picture when it leaves the screen and resumes it
// when it comes back.
let io: IntersectionObserver | null | undefined;

function observer() {
  if (io !== undefined) return io;
  io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
    for (const e of entries) {
      const svg = e.target as SVGSVGElement;
      if (e.isIntersecting) svg.unpauseAnimations?.();
      else svg.pauseAnimations?.();
    }
  }, { rootMargin: '64px' });
  return io;
}

/** `ref` for an animated <svg>: its animations play only while it's (nearly) on screen. */
export function animateWhenVisible(el: SVGSVGElement | null) {
  const o = el && observer();
  if (!el || !o) return;
  o.observe(el);
  return () => o.unobserve(el);
}
