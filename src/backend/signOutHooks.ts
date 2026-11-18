// Things to do while the player is still signed in, just before they sign out (e.g. this phone stops getting their
// pushes: src/native/push.ts). Each gets a moment and never holds the sign-out up.
const hooks = new Set<() => Promise<unknown>>();
export const beforeSignOut = (fn: () => Promise<unknown>) => { hooks.add(fn); return () => void hooks.delete(fn); };
export async function runSignOutHooks() {
  await Promise.all([...hooks].map((fn) => Promise.race([fn().catch(() => {}), new Promise((r) => setTimeout(r, 1500))])));
}
