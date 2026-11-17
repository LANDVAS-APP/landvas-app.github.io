// On the Invite page: make your invite link yours — the preview chats show for it, and the page your friend lands on.
// A theme, an emoji, a headline and a message, and what to show off (your plots, one of your artworks, or nothing),
// with a live preview of both. Saving draws the preview picture and uploads it.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, Image as ImageIcon, MessageSquare, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { getBackend, toGameError } from '../backend/backend';
import type { InviteLandingData, MyInviteCard, Profile, Referrals } from '../backend/types';
import { cn } from '../lib/utils';
import { Button, Field, inputCls } from '../ui';
import { confetti } from '../ui/confetti';
import { InviteLandingView } from './InviteLanding';
import { CARD_H, CARD_W, DEFAULT_HEADLINE, DEFAULT_MESSAGE, INVITE_THEMES, drawInviteCard, loadImage, previewText, renderInviteCard, type CardArt } from './inviteCard';

type Draft = { theme: string; emoji: string | null; headline: string; message: string; showcase: 'plots' | 'art' | 'none'; art_id: string | null };
const draftOf = (c: MyInviteCard): Draft => ({ theme: c.theme, emoji: c.emoji, headline: c.headline ?? '', message: c.message ?? '', showcase: c.showcase, art_id: c.art?.id ?? null });

export function InviteCardEditor({ r, code, profile, link }: { r: Referrals; code: string; profile: Profile; link: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['invite-card'], queryFn: api.myInviteCard });
  const c = q.data;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tab, setTab] = useState<'preview' | 'page'>('preview');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (c && !draft) setDraft(draftOf(c)); }, [c, draft]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [avatar, setAvatar] = useState<HTMLImageElement | null>(null);
  const [art, setArt] = useState<CardArt>(null);
  useEffect(() => {
    let live = true;
    void getBackend().avatarUrl(profile.avatar_path).then(loadImage).then((im) => { if (live) setAvatar(im); });
    return () => { live = false; };
  }, [profile.avatar_path]);
  const pick = c?.arts.find((a) => a.id === draft?.art_id) ?? null;
  useEffect(() => {
    let live = true;
    if (!pick) { setArt(null); return; }
    void getBackend().publicAssetUrl(pick.preview_path || pick.thumb_path).then(loadImage).then((im) => { if (live) setArt({ image: im, title: pick.title }); });
    return () => { live = false; };
  }, [pick]);
  const card = useMemo(() => (c && draft ? { ...c, ...draft, headline: draft.headline.trim() || null, message: draft.message.trim() || null } : null), [c, draft]);
  // the live preview picture (drawn when something changes — nothing animates)
  useEffect(() => {
    const cv = canvas.current; if (!cv || !card) return;
    const raf = requestAnimationFrame(() => {
      const ctx = cv.getContext('2d'); if (!ctx) return;
      ctx.setTransform(cv.width / CARD_W, 0, 0, cv.height / CARD_H, 0, 0);
      drawInviteCard(ctx, { card, player: profile, code, avatar, art: card.showcase === 'art' ? art : null });
    });
    return () => cancelAnimationFrame(raf);
  }, [card, profile, code, avatar, art, tab]);
  if (!c || !draft || !card || c.enabled === false) return null;   // (staff switched invite cards off)
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(c));
  const words = previewText(card, profile);
  const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const landing: InviteLandingData = { code, enabled: r.enabled, referee_reward_ink: r.referee_reward_ink, is_me: false, player: profile,
    card: { ...card, art: card.showcase === 'art' && pick ? { id: pick.id, title: pick.title, preview_path: pick.preview_path, thumb_path: pick.thumb_path, plot_count: 1 } : null } };
  const live = c.page_codes.includes(code);
  const save = async (e: React.MouseEvent) => {
    const at = { x: e.clientX, y: e.clientY };
    if (draft.showcase === 'art' && !draft.art_id) { toast.error('Pick one of your artworks to show off.'); return; }
    setBusy(true);
    try {
      let next = await api.inviteCardSet({ ...draft, headline: draft.headline.trim() || null, message: draft.message.trim() || null, art_id: draft.showcase === 'art' ? draft.art_id : null });
      // the preview picture chats show
      const b = getBackend();
      if (b.uploadInviteCard) {
        try {
          const pic = await renderInviteCard({ card: next, player: profile, code, avatar, art: next.showcase === 'art' ? art : null });
          await b.uploadInviteCard(profile.id, pic.name, pic.blob);
          next = await api.inviteCardImage(`${profile.id}/${pic.name}`);
        } catch (err) { console.warn('invite card picture', err); }
      }
      qc.setQueryData(['invite-card'], next);
      void qc.invalidateQueries({ queryKey: ['invite-landing'] });
      setDraft(draftOf(next));
      confetti({ ...at, count: 60, power: 0.7 });
      toast.success('Your invite card is saved');
    } catch (err) { toast.error(toGameError(err).message); } finally { setBusy(false); }
  };
  return (
    <section id="card" className="mt-4 scroll-mt-20 rounded-3xl border border-line bg-surface-2/40 p-4 md:p-5" data-testid="invite-card-editor">
      <div className="eyebrow flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5 text-accent-2" /> Your invite card</div>
      <h2 className="font-display text-xl font-bold">Make your link yours</h2>
      <p className="mt-1 max-w-2xl text-[13px] text-muted">Pick how your invite looks when you send it — the preview in chats, and the page your friend opens.</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="grid content-start gap-2">
          <div className="flex gap-1.5" role="tablist">
            {([['preview', 'Link preview', MessageSquare], ['page', 'Their page', Smartphone]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} data-testid={`card-tab-${id}`}
                className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-bold', tab === id ? 'border-transparent bg-fg text-bg' : 'border-line text-muted')}>
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
          {tab === 'preview' ? (
            <div className="rounded-2xl bg-bg/50 p-3" data-testid="card-chat-preview">
              <div className="ml-auto max-w-[460px] overflow-hidden rounded-2xl rounded-br-md bg-[#2f6bff] text-white shadow-lg">
                <div className="px-3 py-2 text-[13px] leading-snug">Come play with me! <span className="underline decoration-white/60 break-all">{link}</span></div>
                <div className="bg-[#1f2530]">
                  <canvas ref={canvas} width={CARD_W / 2} height={CARD_H / 2} className="block aspect-[1200/630] w-full" data-testid="card-canvas" />
                  <div className="grid gap-0.5 px-3 py-2">
                    <b className="line-clamp-1 text-[13px]" data-testid="card-og-title">{words.title}</b>
                    <span className="line-clamp-2 text-[11.5px] text-white/70">{words.description}</span>
                    <span className="text-[10.5px] uppercase tracking-wide text-white/50">landvas.app</span>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-faint">
                {live ? 'Your link has its own preview. ' : 'Your link gets its own preview with the next site update (usually within a few hours) — until then it shows the LANDVAS one. '}
                Changes show in chats after the next site update; chat apps also keep a link’s old preview for a while.
              </p>
            </div>
          ) : (
            <div className="mx-auto h-[560px] w-[290px] overflow-hidden rounded-[34px] border-[6px] border-[#0b0e24] shadow-2xl" data-testid="card-page-preview">
              <div className="h-full overflow-y-auto"><InviteLandingView d={landing} signedIn={false} onJoin={() => undefined} compact /></div>
            </div>
          )}
          <a href={`/i/${code}`} onClick={(e) => { e.preventDefault(); window.open(link.includes('/i/') ? link : `${location.origin}/i/${code}`, '_blank', 'noopener'); }}
            className="inline-flex items-center gap-1 justify-self-start text-[12px] font-bold text-accent-2 hover:underline" data-testid="card-open-page">
            <ExternalLink className="h-3.5 w-3.5" /> Open your page
          </a>
        </div>
        <div className="grid content-start gap-3">
          <div>
            <div className="mb-1.5 text-[12px] font-bold text-muted">Theme</div>
            <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Theme">
              {INVITE_THEMES.filter((t) => c.themes.includes(t.id)).map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={draft.theme === t.id} onClick={() => set({ theme: t.id })} data-testid={`card-theme-${t.id}`}
                  className={cn('relative h-12 rounded-xl text-[11px] font-black transition-transform active:scale-95', draft.theme === t.id ? 'ring-2 ring-fg ring-offset-2 ring-offset-bg' : '')}
                  style={{ background: `linear-gradient(135deg, ${t.bg[0]}, ${t.bg[1]} 55%, ${t.bg[2]})`, color: t.ink }}>
                  {t.name}{draft.theme === t.id && <Check className="absolute right-1 top-1 h-3 w-3" />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[12px] font-bold text-muted">Emoji</div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => set({ emoji: null })} aria-pressed={!draft.emoji} className={cn('h-9 rounded-xl border px-2.5 text-[11px] font-bold', !draft.emoji ? 'border-fg' : 'border-line text-muted')}>None</button>
              {c.emojis.map((e) => (
                <button key={e} type="button" onClick={() => set({ emoji: e })} aria-pressed={draft.emoji === e} data-testid={`card-emoji-${e}`}
                  className={cn('grid h-9 w-9 place-items-center rounded-xl border text-lg', draft.emoji === e ? 'border-fg bg-surface' : 'border-line')}>{e}</button>
              ))}
            </div>
          </div>
          <Field label={`Headline (${draft.headline.length}/60)`} htmlFor="card-headline">
            <input id="card-headline" className={inputCls} maxLength={60} placeholder={DEFAULT_HEADLINE} value={draft.headline} onChange={(e) => set({ headline: e.target.value })} data-testid="card-headline" />
          </Field>
          <Field label={`Message (${draft.message.length}/180)`} htmlFor="card-message">
            <textarea id="card-message" className={cn(inputCls, 'min-h-[76px] py-2')} maxLength={180} placeholder={DEFAULT_MESSAGE} value={draft.message} onChange={(e) => set({ message: e.target.value })} data-testid="card-message" />
          </Field>
          <div>
            <div className="mb-1.5 text-[12px] font-bold text-muted">Show off</div>
            <div className="grid grid-cols-3 gap-1.5">
              {([['plots', 'My plots'], ['art', 'An artwork'], ['none', 'Nothing']] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => set({ showcase: id, art_id: id === 'art' ? draft.art_id ?? c.arts[0]?.id ?? null : draft.art_id })}
                  disabled={id === 'art' && !c.arts.length} aria-pressed={draft.showcase === id} data-testid={`card-show-${id}`}
                  className={cn('rounded-xl border px-2 py-2 text-[12px] font-bold disabled:opacity-40', draft.showcase === id ? 'border-fg bg-surface' : 'border-line text-muted')}>{label}</button>
              ))}
            </div>
            {!c.arts.length && <p className="mt-1 text-[11px] text-faint">Publish an artwork to show it off here.</p>}
            {draft.showcase === 'art' && c.arts.length > 0 && <ArtPicker arts={c.arts} value={draft.art_id} onPick={(id) => set({ art_id: id })} />}
          </div>
          <Button variant="primary" loading={busy} disabled={!dirty && c.saved} onClick={(e) => void save(e)} data-testid="card-save">
            {c.saved && !dirty ? <><Check className="h-4 w-4" /> Saved</> : 'Save my card'}
          </Button>
        </div>
      </div>
    </section>
  );
}

function ArtPicker({ arts, value, onPick }: { arts: MyInviteCard['arts']; value: string | null; onPick(id: string): void }) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let live = true;
    void Promise.all(arts.slice(0, 24).map(async (a) => [a.id, await getBackend().publicAssetUrl(a.thumb_path || a.preview_path)] as const))
      .then((xs) => { if (live) setUrls(Object.fromEntries(xs)); });
    return () => { live = false; };
  }, [arts]);
  return (
    <div className="mt-2 flex gap-2 overflow-x-auto pb-1" data-testid="card-art-picker">
      {arts.slice(0, 24).map((a) => (
        <button key={a.id} type="button" onClick={() => onPick(a.id)} title={a.title} aria-pressed={value === a.id}
          className={cn('h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-surface', value === a.id ? 'border-accent' : 'border-transparent')}>
          {urls[a.id] ? <img src={urls[a.id]!} alt={a.title} className="h-full w-full object-cover [image-rendering:pixelated]" /> : null}
        </button>
      ))}
    </div>
  );
}
