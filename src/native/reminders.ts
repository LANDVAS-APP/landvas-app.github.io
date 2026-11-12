// Streak reminders in the iOS / Android app: one local notification, rescheduled whenever the daily status changes,
// so it rings once a day when there's a reward waiting — never when you've already claimed it. Nothing leaves the
// phone (no push server, no tokens). Off until the player says yes; Settings → Notifications turns it off again.
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import type { DailyStatus } from '../backend/types';
import { safeStorage, saveStorage } from '../lib/utils';
import { isNative } from './native';

const KEY = 'landvas.reminders'; // 'on' | 'off' (unset: never asked)
const STREAK_ID = 7001;
const H = 3_600_000;

export const remindersSupported = () => isNative();
export const remindersOn = () => safeStorage<string | null>(KEY, null) === 'on';
const asked = () => safeStorage<string | null>(KEY, null) !== null;

// (resolve to the module, never to the plugin itself: a Capacitor plugin proxy looks "thenable" to promises)
const plugin = () => import('@capacitor/local-notifications');

/** Turn reminders on (asks the phone for permission) or off. Resolves to whether they're on. */
export async function setReminders(on: boolean): Promise<boolean> {
  if (!remindersSupported()) return false;
  const { LocalNotifications: LN } = await plugin();
  if (!on) {
    saveStorage(KEY, 'off');
    await LN.cancel({ notifications: [{ id: STREAK_ID }] }).catch(() => {});
    return false;
  }
  let p = await LN.checkPermissions();
  if (p.display !== 'granted') p = await LN.requestPermissions();
  const ok = p.display === 'granted';
  saveStorage(KEY, ok ? 'on' : 'off');
  if (!ok) toast('Notifications are off for LANDVAS', { description: 'You can allow them in your phone’s Settings → LANDVAS → Notifications.' });
  return ok;
}

/** When to ring inside a window: 6 pm local if it fits, otherwise a few hours before the window closes. */
export function reminderTime(windowStart: number, windowEnd: number, now = Date.now()): number | null {
  const lo = Math.max(windowStart + 30 * 60_000, now + 60_000), hi = windowEnd - 30 * 60_000;
  if (hi <= lo) return null;
  const d = new Date(lo);
  d.setHours(18, 0, 0, 0);
  if (d.getTime() < lo) d.setDate(d.getDate() + 1);
  if (d.getTime() <= hi) return d.getTime();
  const late = windowEnd - 3 * H;
  return late >= lo ? late : hi;
}

/** The reminder for a daily status: the time and the words, or null for none. */
export function streakReminder(d: Pick<DailyStatus, 'enabled' | 'streak' | 'claimed_today' | 'resets_at'>, now = Date.now()) {
  if (!d.enabled) return null;
  const reset = new Date(d.resets_at).getTime();
  if (!Number.isFinite(reset)) return null;
  // claimed: tomorrow's reward (the next daily window); not yet: today's, before the reset
  const at = d.claimed_today ? reminderTime(reset, reset + 24 * H, now) : reminderTime(now, reset, now);
  if (at == null) return null;
  const next = d.streak + 1;
  const keep = d.streak > 0;
  return {
    at,
    title: keep ? `🔥 Day ${next} of your streak is ready` : '🎁 Your daily reward is waiting',
    body: keep ? `Claim it before the daily reset to keep your ${d.streak}-day streak going.` : 'Open LANDVAS to claim today’s Ink bonus.',
  };
}

async function schedule(d: DailyStatus) {
  const { LocalNotifications: LN } = await plugin();
  await LN.cancel({ notifications: [{ id: STREAK_ID }] }).catch(() => {});
  const r = streakReminder(d);
  if (!r) return;
  await LN.schedule({ notifications: [{ id: STREAK_ID, title: r.title, body: r.body, schedule: { at: new Date(r.at), allowWhileIdle: true }, extra: { to: '/world' } }] });
}

/** Keeps the reminder in step with the daily status, and opens the game where it belongs when one is tapped. */
export function useStreakReminder(signedIn: boolean) {
  const nav = useNavigate();
  const on = remindersSupported() && signedIn && remindersOn();
  const q = useQuery({ queryKey: ['daily'], queryFn: api.dailyStatus, enabled: on, staleTime: 60_000 });
  useEffect(() => {
    if (on && q.data) void schedule(q.data).catch((e) => console.warn('reminder', e));
  }, [on, q.data?.claimed_today, q.data?.streak, q.data?.resets_at, q.data?.enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!remindersSupported()) return;
    let off: (() => void) | undefined;
    void plugin().then(({ LocalNotifications: LN }) => LN.addListener('localNotificationActionPerformed', (a) => {
      const to = (a.notification.extra as { to?: string } | undefined)?.to;
      if (to) nav(to);
    })).then((h) => { off = () => void h.remove(); });
    return () => off?.();
  }, [nav]);
}

/** After a streak claim: offer reminders once (a small toast, not a system prompt out of nowhere). */
export function offerReminders() {
  if (!remindersSupported() || asked()) return;
  saveStorage(KEY, 'off'); // asked once, whatever they choose
  toast('Never lose your streak 🔥', {
    description: 'Get one reminder a day when your next reward is ready.',
    duration: 10_000,
    action: { label: 'Remind me', onClick: () => void setReminders(true) },
  });
}
