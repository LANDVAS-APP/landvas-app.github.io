// Optional reminders (Settings → Notifications): when your digging energy is full, crops are ready, a farm building
// is full, an expedition is home, an Inkborn finished its job, a free refill is back, a new day starts, rent day…
// The server says when each of those will happen (my_timers); the phone is told to ring then.
//   • The iOS / Android app: local notifications, scheduled ahead (nothing leaves the phone, no push server).
//   • The website: while LANDVAS is open in a tab — a system notification if the tab is in the background (and the
//     browser allows it), a toast if you're looking at it.
// Every kind is its own switch; nothing rings until the player turns notifications on.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { useUi } from '../lib/store';
import { safeStorage, saveStorage } from '../lib/utils';
import { isNative } from './native';

export type TimerKind = 'dig_energy' | 'dig_refill' | 'farm_crops' | 'farm_all' | 'farm_building' | 'expedition' | 'inkborn_job' | 'daily_reset' | 'rent_day';
export type Timer = { kind: TimerKind; key: string; at: string; title: string; body: string; to: string };

/** every kind of reminder, in the order the settings list them */
export const NOTIFY_KINDS: { id: TimerKind; label: string; hint: string; on: boolean }[] = [
  { id: 'dig_energy', label: '⚡ Digging energy is full', hint: 'When your pickaxe has rested back to full energy.', on: true },
  { id: 'dig_refill', label: '☕ Free coffee break is back', hint: 'When the daily free energy refill returns.', on: false },
  { id: 'farm_crops', label: '🌾 Crops are ready', hint: 'When the first of your growing crops is ready to harvest.', on: true },
  { id: 'farm_all', label: '🧺 Every crop is ready', hint: 'When the last bed finishes growing.', on: false },
  { id: 'farm_building', label: '🐔 A farm building is full', hint: 'When a coop, hive or mill stops making more until you collect.', on: true },
  { id: 'expedition', label: '🧭 An expedition is home', hint: 'When your Inkborn come back with their haul.', on: true },
  { id: 'inkborn_job', label: '🎒 An Inkborn finished its job', hint: 'When a creature you sent out is back.', on: true },
  { id: 'rent_day', label: '💵 Landlord rent day', hint: 'The day before and the morning of the 1st, if you own rentals.', on: true },
  { id: 'daily_reset', label: '🌅 A new day', hint: 'Daily rewards, chores, quests and a new Hot Zone are ready.', on: false },
];

const KEY = 'landvas.notify'; // 'on' | 'off'
export const notifyOn = () => safeStorage<string | null>(KEY, null) === 'on';
export const kindOn = (id: TimerKind) => {
  const m = useUi.getState().settings.notify ?? {};
  return id in m ? !!m[id] : !!NOTIFY_KINDS.find((k) => k.id === id)?.on;
};

const plugin = () => import('@capacitor/local-notifications');
const webOk = () => typeof Notification !== 'undefined';
/** where reminders can ring here at all */
export const notifySupported = () => isNative() || webOk();
/** the browser or the phone's own permission, as it stands */
export async function notifyPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (isNative()) { const { LocalNotifications: LN } = await plugin(); const p = await LN.checkPermissions(); return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt'; }
  if (!webOk()) return 'denied';
  return Notification.permission === 'granted' ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'prompt';
}

/** turn reminders on (asks for permission) or off; resolves to whether they're on */
export async function setNotify(on: boolean): Promise<boolean> {
  if (!on) { saveStorage(KEY, 'off'); await clearScheduled(); return false; }
  let ok = false;
  if (isNative()) {
    const { LocalNotifications: LN } = await plugin();
    let p = await LN.checkPermissions();
    if (p.display !== 'granted') p = await LN.requestPermissions();
    ok = p.display === 'granted';
    if (!ok) toast('Notifications are off for LANDVAS', { description: 'You can allow them in your phone’s Settings → LANDVAS → Notifications.' });
  } else {
    // the website: system notifications if the browser allows them, otherwise pop-ups inside LANDVAS while it's open —
    // either way, reminders are on
    const granted = webOk() && (Notification.permission === 'granted' || (await Notification.requestPermission().catch(() => 'denied')) === 'granted');
    if (!granted) toast('Reminders on — as pop-ups while LANDVAS is open', { description: 'For system notifications, allow them for landvas.app in your browser’s site settings.' });
    ok = true;
  }
  saveStorage(KEY, ok ? 'on' : 'off');
  window.dispatchEvent(new Event('landvas:notify'));
  return ok;
}

// ---- the phone: local notifications, scheduled ahead (ids 8000–8899; the streak reminder is 7001) -----------------
const idOf = (key: string) => { let h = 0; for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0; return 8000 + (Math.abs(h) % 900); };
async function clearScheduled() {
  if (!isNative()) { for (const t of webTimers.values()) clearTimeout(t); webTimers.clear(); return; }
  const { LocalNotifications: LN } = await plugin();
  const pending = await LN.getPending().catch(() => ({ notifications: [] as { id: number }[] }));
  const ours = pending.notifications.filter((n) => n.id >= 8000 && n.id < 8900);
  if (ours.length) await LN.cancel({ notifications: ours.map((n) => ({ id: n.id })) }).catch(() => {});
}
async function scheduleNative(list: Timer[]) {
  const { LocalNotifications: LN } = await plugin();
  await clearScheduled();
  const now = Date.now();
  const soon = list.filter((t) => new Date(t.at).getTime() > now + 30_000 && new Date(t.at).getTime() < now + 8 * 86_400_000).slice(0, 40);
  if (!soon.length) return;
  await LN.schedule({ notifications: soon.map((t) => ({ id: idOf(t.key), title: t.title, body: t.body, schedule: { at: new Date(t.at), allowWhileIdle: true }, extra: { to: t.to } })) });
}

// ---- the website: timers while the tab is open --------------------------------------------------------------------
const webTimers = new Map<string, ReturnType<typeof setTimeout>>();
const fired = new Set<string>();
function scheduleWeb(list: Timer[], go: (to: string) => void) {
  for (const [k, t] of webTimers) if (!list.some((x) => `${x.key}@${x.at}` === k)) { clearTimeout(t); webTimers.delete(k); }
  const now = Date.now();
  for (const t of list) {
    const id = `${t.key}@${t.at}`, ms = new Date(t.at).getTime() - now;
    if (webTimers.has(id) || fired.has(id) || ms < 0 || ms > 12 * 3_600_000) continue;
    webTimers.set(id, setTimeout(() => {
      webTimers.delete(id); fired.add(id);
      if (!notifyOn() || !kindOn(t.kind)) return;
      if (document.hidden && webOk() && Notification.permission === 'granted') {
        try {
          const n = new Notification(t.title, { body: t.body, icon: '/icons/icon-192.png', tag: t.key });
          n.onclick = () => { window.focus(); go(t.to); n.close(); };
          return;
        } catch { /* some mobile browsers only notify through a service worker: fall back to a toast */ }
      }
      toast(t.title, { description: t.body, duration: 8000, action: { label: 'Go', onClick: () => go(t.to) } });
    }, ms));
  }
}

/** keeps the reminders in step with the game (mounted once, in the app's shell) */
export function useTimerNotifications(signedIn: boolean) {
  const nav = useNavigate();
  const kinds = useUi((s) => s.settings.notify);
  const onRef = useRef(notifyOn());
  useEffect(() => {
    const f = () => { onRef.current = notifyOn(); void q.refetch(); };
    window.addEventListener('landvas:notify', f);
    return () => window.removeEventListener('landvas:notify', f);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const enabled = signedIn && notifySupported() && onRef.current;
  const q = useQuery({ queryKey: ['my-timers'], queryFn: api.myTimers, enabled, staleTime: 5 * 60_000, refetchInterval: 15 * 60_000, refetchOnWindowFocus: true });
  useEffect(() => {
    if (!enabled || !q.data) return;
    const list = (q.data as Timer[]).filter((t) => kindOn(t.kind));
    if (isNative()) void scheduleNative(list).catch((e) => console.warn('reminders', e));
    else scheduleWeb(list, (to) => nav(to));
  }, [enabled, q.data, kinds]); // eslint-disable-line react-hooks/exhaustive-deps
  // the app: tapping one opens the game where it belongs
  useEffect(() => {
    if (!isNative()) return;
    let off: (() => void) | undefined;
    void plugin().then(({ LocalNotifications: LN }) => LN.addListener('localNotificationActionPerformed', (a) => {
      const to = (a.notification.extra as { to?: string } | undefined)?.to;
      if (to && a.notification.id >= 8000 && a.notification.id < 8900) nav(to);
    })).then((h) => { off = () => void h.remove(); });
    return () => off?.();
  }, [nav]);
}
