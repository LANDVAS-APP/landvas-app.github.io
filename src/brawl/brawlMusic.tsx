// Paintbrawl's background music: a bouncy battle march during matches and a calmer camp tune in the arena, made on the
// fly by the arcade's little sequencer. A 🎵 button turns it on and off (remembered).
import { Music, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { music } from '../arcade/music';

const KEY = 'landvas.brawl.music';
const isOn = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
let want: 'brawl' | 'brawlcamp' | null = null;
const start = () => { if (want && isOn()) music.play(want, false); };

/** Keep the right tune playing while the arena is open (`battle` = a match is on). */
export function useBrawlMusic(battle: boolean) {
  useEffect(() => {
    want = battle ? 'brawl' : 'brawlcamp';
    start();
    // browsers only allow sound after a tap: try again on the first one
    const tap = () => start();
    window.addEventListener('pointerdown', tap, { once: true });
    return () => { window.removeEventListener('pointerdown', tap); };
  }, [battle]);
  useEffect(() => () => { want = null; music.stop(false); }, []);
}

export function MusicButton({ className }: { className?: string }) {
  const [on, setOn] = useState(isOn);
  const flip = () => {
    const next = !on; setOn(next);
    try { localStorage.setItem(KEY, next ? 'on' : 'off'); } catch { /* private mode */ }
    if (next) start(); else music.stop(false);
  };
  return (
    <button onClick={flip} title={on ? 'Music off' : 'Music on'} aria-label={on ? 'Turn the music off' : 'Turn the music on'} className={className} data-testid="brawl-music">
      {on ? <Music className="inline h-3.5 w-3.5" /> : <VolumeX className="inline h-3.5 w-3.5" />}
    </button>
  );
}
