// Walked in from Explorer's Eyes (a place's door, knocked and opened): you step through the doorway into the place's
// own screen still in first person — the door frame slides past, the light of the room comes up — and a pill says you're
// inside. Leave first person and you're simply there, in the place's own 2D/2.5D view; or step back out onto the street.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function FpInside() {
  const loc = useLocation();
  const nav = useNavigate();
  const on = new URLSearchParams(loc.search).get('fp') === '1';
  const [door, setDoor] = useState(false);
  useEffect(() => { if (!on) return; setDoor(true); const t = setTimeout(() => setDoor(false), 1400); return () => clearTimeout(t); }, [on, loc.pathname]);
  const leave = () => {
    const q = new URLSearchParams(loc.search); q.delete('fp');
    nav({ pathname: loc.pathname, search: q.toString() ? `?${q}` : '' }, { replace: true });
  };
  return (
    <>
      {/* the doorway, sliding past as you step in */}
      <AnimatePresence>
        {on && door && (
          <motion.div key="door" className="pointer-events-none fixed inset-0 z-[120]" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.4 } }} data-testid="fp-doorway">
            <motion.div className="absolute inset-y-0 left-0 w-1/2 bg-[linear-gradient(90deg,#1a0f08,#5a3a22_70%,#8a5a2e)]" initial={{ x: 0 }} animate={{ x: '-100%' }} transition={{ duration: 1.1, ease: [0.5, 0, 0.2, 1] }} />
            <motion.div className="absolute inset-y-0 right-0 w-1/2 bg-[linear-gradient(270deg,#1a0f08,#5a3a22_70%,#8a5a2e)]" initial={{ x: 0 }} animate={{ x: '100%' }} transition={{ duration: 1.1, ease: [0.5, 0, 0.2, 1] }} />
            <motion.div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_50%,rgba(255,230,180,0.5),rgba(0,0,0,0.85))]" initial={{ opacity: 1, scale: 1 }} animate={{ opacity: 0, scale: 1.4 }} transition={{ duration: 1.3 }} />
          </motion.div>
        )}
      </AnimatePresence>
      {/* you're inside, in first person */}
      <AnimatePresence>
        {on && (
          <motion.div key="pill" className="fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+10px)] z-[110] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/70 p-1 pl-3 text-[12px] font-black text-white shadow-xl"
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.8 } }} exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }} data-testid="fp-inside">
            <span>👁️ You’re inside</span>
            <button className="rounded-full bg-white/15 px-2.5 py-1" onClick={() => nav('/eyes')} data-testid="fp-back-out">↩ Back out</button>
            <button className="rounded-full bg-[linear-gradient(135deg,#22E3FF,#8B5CFF)] px-2.5 py-1" onClick={leave} data-testid="fp-leave">Leave first person</button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
