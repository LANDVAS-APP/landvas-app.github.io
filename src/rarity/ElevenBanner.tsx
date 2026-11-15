// 🌠 Eleven-Eleven, anywhere in the game: at 11:11 (morning and night, in your own time zone) a banner says it's time
// to wish; in the app, a reminder rings at 11:10 (when you've said yes to reminders). Only for holders of one.
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../backend/api';
import { useMyPlotsLite } from '../enchant/myPlots';
import { remindersOn, remindersSupported } from '../native/reminders';
import { powerPath } from './powers';
import './rarity.css';

const IDS = [7111, 7112];

export function ElevenBanner() {
  const plots = useMyPlotsLite();
  const has = plots.some((p) => p.rarity === 'eleven');
  const q = useQuery({ queryKey: ['my-powers'], queryFn: api.myPowers, enabled: has, staleTime: 30_000, refetchInterval: 90_000 });
  const e = (q.data ?? []).find((p) => p.rarity === 'eleven' && p.tz);
  const skew = useMemo(() => (e?.server_now ? +new Date(e.server_now) - Date.now() : 0), [e?.server_now]);
  const [now, setNow] = useState(() => Date.now());
  const loc = useLocation();
  const at = e?.next_at ? +new Date(e.next_at) : null;
  // tick once a second only near 11:11
  useEffect(() => {
    if (at == null) return;
    const until = at - (Date.now() + skew);
    if (until > 5 * 60_000) { const t = setTimeout(() => setNow(Date.now()), until - 4 * 60_000); return () => clearTimeout(t); }
    const t = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000);
    return () => clearInterval(t);
  }, [at, skew, now > (at ?? 0) + 65_000]); // eslint-disable-line react-hooks/exhaustive-deps
  // the app's reminder at 11:10, for the next two 11:11s
  useEffect(() => {
    if (!e?.tz || !remindersSupported() || !remindersOn() || at == null) return;
    void import('@capacitor/local-notifications').then(async ({ LocalNotifications: LN }) => {
      await LN.cancel({ notifications: IDS.map((id) => ({ id })) }).catch(() => {});
      const first = at - 60_000 - skew;
      const list = [first, first + 12 * 3600_000].filter((t) => t > Date.now() + 30_000)
        .map((t, i) => ({ id: IDS[i], title: '🌠 It’s almost 11:11', body: 'Your wish is ready in one minute — open LANDVAS to make it.', schedule: { at: new Date(t), allowWhileIdle: true }, extra: { to: powerPath(e.gx, e.gy) } }));
      if (list.length) await LN.schedule({ notifications: list });
    }).catch(() => {});
  }, [e?.tz, at]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = now + skew;
  const open = !!e && !e.wished && at != null && t >= at && t < at + 60_000;
  const here = e && loc.pathname === powerPath(e.gx, e.gy);
  return (
    <AnimatePresence>
      {open && !here && (
        <motion.div initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -80, opacity: 0 }}
          className="fixed left-1/2 top-[max(12px,env(safe-area-inset-top))] z-[200] -translate-x-1/2" data-testid="eleven-banner">
          <Link to={powerPath(e!.gx, e!.gy)} className="lvrx-banner flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black text-white">
            <b className="star">🌠</b> It’s 11:11 — make your wish!
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
