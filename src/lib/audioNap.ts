// A Web Audio context that's been woken for one beep keeps running forever unless it's told otherwise: the phone's
// audio output stays open and its audio thread ticks hundreds of times a second, in silence, for the rest of the
// session — a steady drain on the battery and a little more heat. The game's sound makers go to sleep a few seconds
// after they fall quiet, and wake again (instantly, from the player's next tap) when there's something to play.
export function audioNap(get: () => AudioContext | null, quietMs = 4000) {
  let t: ReturnType<typeof setTimeout> | null = null;
  const clear = () => { if (t) { clearTimeout(t); t = null; } };
  return {
    /** a sound was just scheduled, lasting about `forSec` seconds: sleep once it (and a quiet spell) is over */
    poke(forSec = 0) {
      clear();
      t = setTimeout(() => {
        t = null;
        const c = get();
        // (a sound that arrived while it was dozing off wakes it straight back up)
        if (c && c.state === 'running') void c.suspend().then(() => { if (t) void c.resume(); }).catch(() => {});
      }, quietMs + forSec * 1000);
    },
    /** something long is playing (music): stay awake until poked again */
    hold: clear,
  };
}
