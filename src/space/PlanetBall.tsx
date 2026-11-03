// A small drawn planet (for cards, lists and the feed).
import type { World } from './worlds';

export function PlanetBall({ w, size = 48 }: { w: World | null; size?: number }) {
  if (!w) return <div className="grid shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_35%,#8B5CFF,#1B1340)] text-2xl" style={{ width: size, height: size }}>✨</div>;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {w.ring && <div className="absolute left-1/2 top-1/2 h-[30%] w-[150%] -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-[50%] border-[3px]" style={{ borderColor: w.ring }} />}
      <div className="absolute inset-0 rounded-full shadow-[inset_-6px_-6px_14px_rgba(0,0,0,0.45)]" style={{ background: `radial-gradient(circle at 35% 35%, ${w.color}, ${w.color2})` }} />
    </div>
  );
}
