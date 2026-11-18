// Real pushes for the iOS / Android app: a fox at your egg, the Leviathan heading for you, a friend request, a party
// invite, something on your land — even with LANDVAS closed (the database queues them, the push Edge Function sends
// them: supabase/migrations/20261120000100_phone_push.sql).
//
//   • It rides on Settings → Notifications: once the player has turned notifications on (which asks the phone's
//     permission), this phone registers its push address with the switches they have on — nothing is ever asked or
//     sent before that. Turning notifications off, or signing out, takes the address back off the server.
//   • The push plugin is optional (scripts/native-compat.mjs): apps built before it, and Android builds without
//     Firebase, don't have it. Everything here checks pushSupported() first and simply does nothing without it.
//   • A push that arrives while LANDVAS is open shows as a pop-up in the game; tapping one opens where it belongs.
import { Capacitor } from '@capacitor/core';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { beforeSignOut } from '../backend/signOutHooks';
import { useUi } from '../lib/store';
import { safeStorage, saveStorage } from '../lib/utils';
import { PUSH_KINDS, safePushPath } from '../shared/pushText';
import { isNative, platform } from './native';
import { notifyOn } from './notify';

// (resolve to the module, never to the plugin itself: a Capacitor plugin proxy looks "thenable" to promises)
const plugin = () => import('@capacitor/push-notifications');
const TOKEN = 'landvas.push.token';

export type PushState = { status: 'off' | 'unsupported' | 'waiting' | 'on' | 'error'; error?: string };
let state: PushState = { status: 'off' };
const setState = (s: PushState) => { state = s; window.dispatchEvent(new Event('landvas:push')); };
export const pushState = () => state;

/** this app can get pushes (it has the plugin: apps from before it don't, nor Android builds without Firebase) */
export const pushSupported = () => isNative() && Capacitor.isPluginAvailable('PushNotifications');
export const pushKindOn = (id: string) => {
  const m = useUi.getState().settings.push ?? {};
  return id in m ? !!m[id] : !!PUSH_KINDS.find((k) => k.id === id)?.on;
};
const kindsOn = () => PUSH_KINDS.filter((k) => pushKindOn(k.id)).map((k) => k.id);

let appInfo: Promise<string | null> | null = null;
const appVersion = () => (appInfo ??= import('@capacitor/app').then(({ App }) => App.getInfo()).then((i) => `${i.version} (${i.build})`).catch(() => null));

/** send this phone's address (and the switches) to the server */
async function tellServer(token: string) {
  try {
    await api.pushRegister(token, platform() === 'ios' ? 'ios' : 'android', kindsOn(), await appVersion());
    saveStorage(TOKEN, token);
    setState({ status: 'on' });
  } catch (e) {
    setState({ status: 'error', error: (e as Error).message });
  }
}

let listening: Promise<void> | null = null;
let go: (to: string) => void = () => {};
function listen() {
  return (listening ??= plugin().then(async ({ PushNotifications: P }) => {
    await P.addListener('registration', (t) => void tellServer(t.value));
    await P.addListener('registrationError', (e) => setState({ status: 'error', error: e.error }));
    // open in the game: a pop-up instead of a banner (capacitor.config.ts sets no system presentation)
    await P.addListener('pushNotificationReceived', (n) => {
      const to = safePushPath((n.data as { to?: string } | undefined)?.to);
      toast(n.title ?? 'LANDVAS', { description: n.body, duration: 8000, action: { label: 'Go', onClick: () => go(to) } });
    });
    // tapped on the lock screen or in the notification shade (also the one that opened the app)
    await P.addListener('pushNotificationActionPerformed', (a) => go(safePushPath((a.notification.data as { to?: string } | undefined)?.to)));
  }));
}

/** ask the phone for its push address — only when notifications are on and the phone allows them */
async function register() {
  if (!pushSupported()) { setState({ status: 'unsupported' }); return; }
  if (!notifyOn()) { setState({ status: 'off' }); return; }
  const { PushNotifications: P } = await plugin();
  const p = await P.checkPermissions().catch(() => ({ receive: 'denied' as const }));
  if (p.receive !== 'granted') { setState({ status: 'off' }); return; }
  await listen();
  if (platform() === 'android') {
    await P.createChannel({ id: 'landvas_alerts', name: 'Game alerts', description: 'A fox at your egg, the Leviathan, friends and parties, your land', importance: 4, visibility: 1, vibration: true }).catch(() => {});
  }
  setState({ status: 'waiting' });
  await P.register();
}

/** this phone stops getting pushes for whoever is signed in */
async function unregister() {
  const token = safeStorage<string | null>(TOKEN, null);
  if (!token) return;
  saveStorage(TOKEN, null);
  await api.pushUnregister(token).catch(() => {});
}
beforeSignOut(async () => { if (pushSupported()) await unregister(); });

/** a test push to this player's phones (Settings) */
export async function sendTestPush(): Promise<boolean> {
  const r = await api.pushTest();
  if (!r.devices) toast('This phone isn’t set up for pushes yet', { description: 'Turn notifications on above, and allow them when your phone asks.' });
  else toast('Test push on its way', { description: 'Lock your phone or switch apps — it arrives in a few seconds.' });
  return !!r.devices;
}

/** keeps this phone's push address in step with the player (mounted once, in the app's shell) */
export function usePush(signedIn: boolean) {
  const nav = useNavigate();
  const kinds = useUi((s) => s.settings.push);
  const first = useRef(true);
  go = (to) => nav(to);
  // signed in (or notifications switched on or off): register, or take the address back
  useEffect(() => {
    if (!signedIn || !pushSupported()) return;
    const sync = () => { if (notifyOn()) void register().catch((e) => setState({ status: 'error', error: String(e?.message ?? e) })); else { void unregister(); setState({ status: 'off' }); } };
    sync();
    window.addEventListener('landvas:notify', sync);
    return () => window.removeEventListener('landvas:notify', sync);
  }, [signedIn]);
  // switches changed: tell the server (the address stays the same)
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const token = safeStorage<string | null>(TOKEN, null);
    if (!signedIn || !token || !pushSupported() || !notifyOn()) return;
    const t = setTimeout(() => void tellServer(token), 600);
    return () => clearTimeout(t);
  }, [kinds, signedIn]);
}
