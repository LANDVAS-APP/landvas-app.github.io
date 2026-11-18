// The launch splash waits for whatever is still loading on the game's first screen (see "the launch splash" in
// native.ts). Both do nothing on the website.
import { useEffect } from 'react';
import { holdSplash, splashWhenSettled } from './native';

/** Put inside a loader: while it's on screen, the splash stays up. */
export function SplashHold() {
  useEffect(() => holdSplash(), []);
  return null;
}

/** Put in the app's root: its screens are mounted, so the splash can go once nothing holds it. */
export function SplashReady() {
  useEffect(() => { splashWhenSettled(); }, []);
  return null;
}
