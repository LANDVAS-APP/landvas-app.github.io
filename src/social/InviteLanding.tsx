// landvas.app/i/CODE — the page a friend lands on from an invite link (and from landvas.app/?ref=CODE): who invited
// them, in the inviter's own card (theme, headline, message, what they show off), what they get, and one button to
// join. Works signed out; the code is kept on this device and applied when they sign up.
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowRight, Gift, Map as MapIcon, Pencil, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../backend/api';
import { getBackend } from '../backend/backend';
import type { InviteLandingData } from '../backend/types';
import { cn, fmt } from '../lib/utils';
import { Button, LogoMark, PlayerAvatar, Spinner } from '../ui';
import { DEFAULT_HEADLINE, DEFAULT_MESSAGE, drawBackdrop, themeOf } from './inviteCard';
import { normalizeCode, rememberReferral } from './referralStore';

export default function InviteLanding() {
  const { code: raw = '' } = useParams();
  const code = normalizeCode(raw);
  const nav = useNavigate();
  const signedIn = !!getBackend().session();
  const q = useQuery({ queryKey: ['invite-landing', code], queryFn: () => api.inviteCard(code), staleTime: 60_000, retry: 1 });
  const d = q.data;
  // a new player's sign-up applies this code
  useEffect(() => { if (d && !d.is_me && !signedIn) rememberReferral(d.code); }, [d, signedIn]);
  useEffect(() => { if (d) document.title = `${d.card.headline || `@${d.player.username} invited you`} — LANDVAS`; }, [d]);
  if (q.isLoading) return <div className="grid min-h-dvh place-items-center bg-bg"><Spinner /></div>;
  if (!d) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg p-6 text-center" data-testid="invite-landing-missing">
        <div className="grid max-w-sm justify-items-center gap-3">
          <LogoMark size={56} />
          <h1 className="font-display text-2xl font-bold">This invite link doesn’t work</h1>
          <p className="text-sm text-muted">The code <b className="font-mono text-fg">{code || '—'}</b> isn’t anyone’s invite (any more). You can still join LANDVAS — it’s free.</p>
          <Button variant="rainbow" onClick={() => nav(signedIn ? '/world' : '/welcome')}>{signedIn ? 'Open LANDVAS' : 'Play LANDVAS'}</Button>
        </div>
      </div>
    );
  }
  return <InviteLandingView d={d} signedIn={signedIn} onJoin={() => nav(signedIn ? '/world' : '/welcome')} />;
}

/** the page itself (also the editor's phone preview, `compact`) */
export function InviteLandingView({ d, signedIn, onJoin, compact }: { d: InviteLandingData; signedIn: boolean; onJoin(): void; compact?: boolean }) {
  const t = themeOf(d.card.theme);
  const c = d.card;
  const name = d.player.display_name || `@${d.player.username}`;
  const back = useRef<HTMLCanvasElement>(null);
  const [artUrl, setArtUrl] = useState<string | null>(null);
  useEffect(() => {   // the theme's backdrop, drawn once (it doesn't move)
    const cv = back.current; if (!cv) return;
    const w = cv.clientWidth || 400, h = cv.clientHeight || 800, k = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.scale(k, k); drawBackdrop(ctx, w, h, t);
  }, [t]);
  useEffect(() => {
    let live = true;
    const p = c.showcase === 'art' ? c.art?.preview_path || c.art?.thumb_path : null;
    if (!p) { setArtUrl(null); return; }
    void getBackend().publicAssetUrl(p).then((u) => { if (live) setArtUrl(u); });
    return () => { live = false; };
  }, [c.showcase, c.art?.preview_path, c.art?.thumb_path]);
  const perks = [
    ...(d.referee_reward_ink > 0 && d.enabled ? [{ icon: Gift, text: `+${fmt(d.referee_reward_ink)} Ink when you join with ${d.player.username}’s code` }] : []),
    { icon: MapIcon, text: 'A free plot on the live map of the real world' },
    { icon: Users, text: `Play with ${name} and their crew` },
  ];
  return (
    <div className={cn('relative isolate overflow-hidden', compact ? 'h-full' : 'min-h-dvh')} style={{ color: t.ink }} data-testid="invite-landing" data-theme={t.id}>
      <canvas ref={back} className="absolute inset-0 -z-10 h-full w-full" aria-hidden />
      <div className={cn('mx-auto grid max-w-md content-start gap-4', compact ? 'p-4 pt-6' : 'p-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10')}>
        <div className="flex items-center gap-2 text-[13px] font-bold tracking-[0.12em]" style={{ color: t.ink }}>
          <LogoMark size={compact ? 20 : 26} /> LANDVAS
        </div>
        {d.is_me && !compact && (
          <div className="flex items-center gap-2 rounded-2xl px-3 py-2 text-[13px] font-semibold" style={{ background: t.tile }} data-testid="invite-landing-mine">
            <span className="min-w-0 flex-1">This is your invite page — it’s what your friends see.</span>
            <Link to="/invite#card" className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-black" style={{ background: t.accent, color: t.onAccent }}><Pencil className="h-3 w-3" /> Edit</Link>
          </div>
        )}
        <motion.div initial={compact ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex items-center gap-3">
          <PlayerAvatar p={d.player} size={compact ? 44 : 60} className="ring-4 ring-white/70" />
          <div className="min-w-0 leading-tight">
            <div className={cn('truncate font-extrabold', compact ? 'text-[15px]' : 'text-lg')}>{name}</div>
            <div className="text-[13px] font-semibold" style={{ color: t.sub }}>{d.player.display_name ? `@${d.player.username} ` : ''}invited you</div>
          </div>
        </motion.div>
        <motion.h1 initial={compact ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }}
          className={cn('font-display font-extrabold leading-[1.08]', compact ? 'text-[24px]' : 'text-[34px]')} data-testid="invite-landing-headline">
          {c.emoji ? <span className="mr-2">{c.emoji}</span> : null}{c.headline || DEFAULT_HEADLINE}
        </motion.h1>
        <p className={cn('font-medium', compact ? 'text-[13px]' : 'text-[16px]')} style={{ color: t.sub }} data-testid="invite-landing-message">{c.message || DEFAULT_MESSAGE}</p>
        {c.showcase === 'art' && c.art && (
          <figure className="grid gap-1.5" data-testid="invite-landing-art">
            <div className="overflow-hidden rounded-2xl bg-white p-1.5 shadow-[0_14px_40px_rgba(0,0,0,0.35)]">
              {artUrl ? <img src={artUrl} alt={c.art.title} className="aspect-[4/3] w-full rounded-xl object-cover [image-rendering:pixelated]" /> : <div className="aspect-[4/3] w-full rounded-xl bg-black/10" />}
            </div>
            <figcaption className="text-center text-[12px] font-bold" style={{ color: t.sub }}>“{c.art.title}”{c.art.plot_count > 1 ? ` · a ${c.art.plot_count}-plot mural` : ''}</figcaption>
          </figure>
        )}
        {(c.showcase === 'plots' || (c.showcase === 'art' && !c.art)) && (
          <div className="grid grid-cols-2 gap-2" data-testid="invite-landing-stats">
            {([[fmt(c.stats.plots), c.stats.plots === 1 ? 'plot' : 'plots'], [c.stats.best?.name ?? '—', 'rarest plot', c.stats.best?.color], [fmt(c.stats.art), c.stats.art === 1 ? 'artwork' : 'artworks'], [fmt(c.stats.crew), 'in their crew']] as [string, string, string?][]).map(([v, l, col]) => (
              <div key={l} className="grid justify-items-center rounded-2xl px-2 py-3 text-center" style={{ background: t.tile }}>
                <b className={cn('font-display leading-none', compact ? 'text-lg' : 'text-2xl')} style={{ color: col ?? t.ink }}>{v}</b>
                <span className="mt-1 text-[11.5px] font-bold" style={{ color: t.sub }}>{l}</span>
              </div>
            ))}
          </div>
        )}
        <ul className="grid gap-1.5">
          {perks.map((p) => (
            <li key={p.text} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-semibold" style={{ background: t.tile }}>
              <p.icon className="h-4 w-4 shrink-0" style={{ color: t.light ? t.accent : t.ink }} /> {p.text}
            </li>
          ))}
        </ul>
        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={onJoin} data-testid="invite-landing-join"
          className={cn('flex w-full items-center justify-center gap-2 rounded-2xl font-extrabold shadow-[0_10px_30px_rgba(0,0,0,0.25)]', compact ? 'h-11 text-[14px]' : 'h-14 text-[17px]')}
          style={{ background: t.accent, color: t.onAccent }}>
          {d.is_me ? 'Open LANDVAS' : signedIn ? 'Open LANDVAS' : `Join ${d.player.display_name || d.player.username} — it’s free`} <ArrowRight className="h-5 w-5" />
        </motion.button>
        {!d.is_me && (
          <p className="text-center text-[12px] font-semibold" style={{ color: t.sub }}>
            {signedIn ? <>Already playing? Invite codes can be entered on the Invite page in your first days.</> : <>Code <b className="font-mono">{d.code}</b> is applied when you sign up.</>}
          </p>
        )}
      </div>
    </div>
  );
}
