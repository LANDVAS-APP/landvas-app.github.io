// Phone gestures for the app's screens: swipe in from the left edge to go back (like iOS), and pull down at
// the top of a screen to refresh it. Both follow your finger and only fire past a threshold.
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { useRef, useState, type RefObject } from 'react';
import { buzz } from '../native/native';
import { Spinner } from '../ui';

const EDGE = 24, BACK_AT = 80, PULL_AT = 64, PULL_MAX = 96;

/** Is this touch inside something that scrolls on its own (a chat, a carousel) and isn't at its top? */
function innerScrolled(t: EventTarget | null, root: HTMLElement) {
  for (let el = t as HTMLElement | null; el && el !== root; el = el.parentElement) {
    if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight) return true;
  }
  return false;
}

export function useScreenGestures(main: RefObject<HTMLElement | null>, opts: { enabled: boolean; canGoBack: boolean; onBack(): void }) {
  const qc = useQueryClient();
  const start = useRef<{ x: number; y: number; mode: 'back' | 'pull' | null; decided: boolean } | null>(null);
  const [back, setBack] = useState(0);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // (the finger's latest distance, read when it lifts: on a busy phone React may not have re-rendered since the last
  // move, and the rendered value would drop a quick swipe that went far enough)
  const backAt = useRef(0), pullAt = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    if (!opts.enabled || e.touches.length !== 1 || refreshing) return;
    const t = e.touches[0], el = main.current;
    if (!el) return;
    const mode = opts.canGoBack && t.clientX < EDGE ? 'back' : el.scrollTop <= 0 && !innerScrolled(e.target, el) ? 'pull' : null;
    start.current = mode ? { x: t.clientX, y: t.clientY, mode, decided: false } : null;
    backAt.current = 0; pullAt.current = 0;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = start.current; if (!s) return;
    const t = e.touches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (!s.decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.decided = true;
      // a back swipe must go sideways, a pull must go down — anything else is a normal scroll or tap
      if (s.mode === 'back' && !(dx > 0 && Math.abs(dx) > Math.abs(dy))) { start.current = null; return; }
      if (s.mode === 'pull' && !(dy > 0 && Math.abs(dy) > Math.abs(dx) && (main.current?.scrollTop ?? 1) <= 0)) { start.current = null; return; }
    }
    if (s.mode === 'back') { const v = Math.min(dx, 160); if ((v >= BACK_AT) !== (backAt.current >= BACK_AT)) buzz('light'); backAt.current = v; setBack(v); }
    else { const v = Math.min(PULL_MAX, dy * 0.5); if ((v >= PULL_AT) !== (pullAt.current >= PULL_AT)) buzz('light'); pullAt.current = v; setPull(v); }
  };
  const onTouchEnd = () => {
    const s = start.current; start.current = null;
    if (!s) return;
    const b = backAt.current, p = pullAt.current;
    backAt.current = 0; pullAt.current = 0;
    if (s.mode === 'back') { if (b >= BACK_AT) { buzz('medium'); opts.onBack(); } setBack(0); return; }
    if (p >= PULL_AT) {
      setRefreshing(true); setPull(PULL_AT); buzz('medium');
      const min = new Promise((r) => setTimeout(r, 650));
      void Promise.all([qc.refetchQueries({ type: 'active' }).catch(() => {}), min]).finally(() => { setRefreshing(false); setPull(0); });
    } else setPull(0);
  };

  const overlay = (
    <>
      {back > 0 && (
        <div className="pointer-events-none fixed left-0 top-1/2 z-[65] -translate-y-1/2" style={{ transform: `translate(${Math.min(back, 110) - 44}px, -50%)` }} aria-hidden>
          <span className={`grid h-11 w-11 place-items-center rounded-full text-white shadow-lg transition-colors ${back >= BACK_AT ? 'bg-[#5b3df5]' : 'bg-black/60'}`}><ChevronLeft className="h-6 w-6" /></span>
        </div>
      )}
      {(pull > 0 || refreshing) && (
        <div className="pointer-events-none absolute inset-x-0 z-[35] flex justify-center" style={{ top: `calc(var(--hud-h, 0px) + ${Math.max(0, pull - 40)}px)` }} aria-hidden={!refreshing} role={refreshing ? 'status' : undefined}>
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[linear-gradient(180deg,#2a3480,#141a52)] shadow-[0_3px_0_rgba(4,6,22,0.8)]" style={{ transform: `rotate(${pull * 3}deg) scale(${Math.min(1, 0.5 + pull / PULL_AT / 2)})`, opacity: Math.min(1, pull / 40) }}>
            {refreshing ? <Spinner /> : <span className="text-lg">{pull >= PULL_AT ? '🎨' : '⬇️'}</span>}
          </span>
        </div>
      )}
    </>
  );
  return { handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd }, overlay, offset: refreshing ? PULL_AT * 0.6 : pull * 0.6 };
}
