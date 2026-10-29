import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, Flag, Share2, Sparkles, Stamp, Star } from 'lucide-react';
import { confetti } from '../ui/confetti';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { Page } from '../app/Shell';
import { celebrate, invalidateGame, useOnboardedMe } from '../lib/queries';
import type { ArtworkCard } from '../backend/types';
import { fmt, timeAgo } from '../lib/utils';
import { Button, Dialog, Empty, Spinner, inputCls, PlayerAvatar } from '../ui';
import { ArtGrid, useAssetUrl } from './GalleryScreen';

export default function ArtworkScreen() {
  const { id = '' } = useParams();
  const me = useOnboardedMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['artwork', id], queryFn: () => api.artworkDetail(id) });
  const preview = useAssetUrl(q.data?.preview_path ?? q.data?.thumb_path);
  const [report, setReport] = useState(false);
  if (q.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  if (!q.data) return <Page><Empty title="Artwork not found">It may have been removed or replaced by a newer version.</Empty></Page>;
  const a = q.data;
  // privacy: an artwork page never leads to where the art (and so its artist) is
  return (
    <Page wide>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="art-paper overflow-hidden rounded-[28px]">
          {preview ? <img src={preview} alt={a.title} className="h-full w-full object-contain [image-rendering:pixelated]" /> : <div className="aspect-square animate-pulse bg-surface-2" />}
        </div>
        <div className="grid content-start gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold">{a.title}</h1>
            <Link to={`/u/${a.artist.username}`} className="mt-2 flex items-center gap-2 text-sm">
              <PlayerAvatar p={a.artist} size={28} />
              <span className="font-semibold">{a.artist.display_name || a.artist.username}</span><span className="text-muted">@{a.artist.username}</span>
            </Link>
          </div>
          {a.description && <p className="text-sm text-muted">{a.description}</p>}
          {a.featured && <div className="flex items-center gap-2 rounded-2xl border border-gold/50 bg-gold/10 px-3 py-2 text-sm font-bold text-gold"><Star className="h-4 w-4 fill-gold" /> Featured by the LANDVAS team</div>}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="glass rounded-2xl p-3"><div className="font-display font-semibold tnum">{a.plot_count}</div><div className="eyebrow !text-[10px]">Plots</div></div>
            <div className="glass rounded-2xl p-3"><div className="font-display font-semibold tnum">{fmt(a.appreciation_count)}</div><div className="eyebrow !text-[10px]">Inspired</div></div>
            <div className="glass rounded-2xl p-3" title="Craft score: palette, shading, detail and coverage"><div className="font-display font-semibold tnum" data-testid="craft-score">{a.craft_score ?? '—'}</div><div className="eyebrow !text-[10px]">Craft</div></div>
            <div className="glass rounded-2xl p-3"><div className="font-display font-semibold">{timeAgo(a.published_at)}</div><div className="eyebrow !text-[10px]">Published</div></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!a.is_owner && <Button variant="secondary" onClick={() => nav(`/u/${a.artist.username}/room`)}><DoorOpen className="h-4 w-4" /> Visit @{a.artist.username}’s room</Button>}
            {me && !a.is_owner && (
              <Button variant={a.appreciated ? 'secondary' : 'primary'} onClick={async () => {
                try {
                  const r = await api.appreciate(a.id, !a.appreciated);
                  celebrate(r.achievements);
                  if (r.first && (r.artist_ink || r.earned)) toast.success(r.earned ? `Inspired · +${r.earned} Ink for you` : 'Inspired', { description: r.artist_ink ? `@${a.artist.username} earned ${r.artist_ink} Ink from your inspiration.` : undefined });
                  void qc.invalidateQueries({ queryKey: ['artwork', id] });
                  invalidateGame(qc);
                } catch (e) { toast.error(toGameError(e).message); }
              }} data-testid="inspire"><Sparkles className={a.appreciated ? 'h-4 w-4 text-gold' : 'h-4 w-4'} /> {a.appreciated ? 'Inspired' : 'Inspire'}</Button>
            )}
            <Button variant="ghost" onClick={async () => {
              const url = location.href;
              try { if (navigator.share) await navigator.share({ title: a.title, text: `“${a.title}” on LANDVAS`, url }); else { await navigator.clipboard.writeText(url); toast.success('Link copied'); } } catch { /* cancelled */ }
            }}><Share2 className="h-4 w-4" /> Share</Button>
            {me && !a.is_owner && <Button variant="ghost" onClick={() => setReport(true)}><Flag className="h-4 w-4" /> Report</Button>}
            {me?.roles?.some((r: string) => ['owner', 'admin', 'moderator'].includes(r)) && (
              <Button variant="ghost" data-testid="feature-art" onClick={async () => {
                try {
                  const r: any = await api.admin.feature(a.id, 'featured', !a.featured);
                  toast.success(a.featured ? 'No longer featured' : r?.ink ? `Featured · @${a.artist.username} earned ${r.ink} Ink` : 'Featured');
                  void qc.invalidateQueries({ queryKey: ['artwork', id] });
                } catch (e) { toast.error(toGameError(e).message); }
              }}><Star className="h-4 w-4" /> {a.featured ? 'Unfeature' : 'Feature'}</Button>
            )}
          </div>
          <StampCard id={a.id} owner={!!a.is_owner} signedIn={!!me} artist={a.artist.username} />
          {a.is_owner && a.craft && <CraftCard craft={a.craft} />}
          {a.more_by_artist?.length > 0 && (
            <div>
              <h2 className="mb-2 font-display text-base font-semibold">More by @{a.artist.username}</h2>
              <ArtGrid cards={a.more_by_artist.slice(0, 4)} />
            </div>
          )}
        </div>
      </div>
      <ReportDialog open={report} onClose={() => setReport(false)} id={a.id} />
    </Page>
  );
}

function StampCard({ id, owner, signedIn, artist }: { id: string; owner: boolean; signedIn: boolean; artist: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['stamp', id], queryFn: () => api.stampInfo(id) });
  const [busy, setBusy] = useState(false);
  const s = q.data;
  if (!s?.enabled) return null;
  const left = Math.max(0, s.supply - s.collected);
  return (
    <div className="glass relative grid gap-3 overflow-hidden rounded-2xl p-4" data-testid="stamp-card">
      <div className="flex items-center gap-3">
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-gold/70 bg-gold/10 font-display text-lg font-bold text-gold [transform:rotate(-6deg)]">
          {s.mine ? `#${s.mine}` : <Stamp className="h-6 w-6" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display font-semibold">{s.mine ? `You own stamp #${s.mine} of ${fmt(s.supply)}` : 'Collectible stamp'}</div>
          <div className="text-xs text-muted">{left > 0 ? `${fmt(left)} of ${fmt(s.supply)} left` : 'Sold out'} · {owner ? `you earn ${s.artist_pct}% of every stamp` : `@${artist} gets ${s.artist_pct}%`}</div>
        </div>
        {!owner && signedIn && !s.mine && left > 0 && (
          <Button variant="rainbow" size="sm" loading={busy} data-testid="stamp-collect" onClick={async (e) => {
            const at = { x: e.clientX, y: e.clientY };
            setBusy(true);
            try {
              const r = await api.stampCollect(id);
              qc.setQueryData(['stamp', id], r);
              confetti({ ...at, count: 60, power: 0.8, colors: ['#FFE14D', '#FF9F1C', '#FF4FD8'] });
              toast.success(`Stamp #${r.serial} is yours!`, { description: `@${artist} earned Ink from your collect.` });
              invalidateGame(qc);
            } catch (err) { toast.error(toGameError(err).message); } finally { setBusy(false); }
          }}>Collect · {s.price} Ink</Button>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-gradient-to-r from-gold to-hot" style={{ width: `${Math.min(100, (s.collected / s.supply) * 100)}%` }} /></div>
      {s.recent.length > 0 && <div className="flex items-center gap-1">{s.recent.map((p) => <PlayerAvatar key={p.id} p={p} size={22} />)}<span className="ml-1 text-[11px] text-muted">recent collectors</span></div>}
    </div>
  );
}

function ReportDialog({ open, onClose, id }: { open: boolean; onClose(): void; id: string }) {
  const [reason, setReason] = useState('inappropriate');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Report this artwork" description="Moderators review every report. Copyright owners can also file a formal notice from the Copyright page.">
      <div className="grid gap-3">
        <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="inappropriate">Sexual or graphic content</option>
          <option value="hate">Hate or harassment</option>
          <option value="copyright">Copies someone else's work</option>
          <option value="personal_info">Personal information</option>
          <option value="spam">Spam or advertising</option>
          <option value="other">Something else</option>
        </select>
        <textarea className={`${inputCls} h-24 py-2`} placeholder="Anything moderators should know (optional)" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
        <Button variant="danger" loading={busy} onClick={async () => {
          setBusy(true);
          try { await api.reportArtwork(id, reason, details); toast.success('Thanks — our moderators will take a look'); onClose(); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
        }}>Send report</Button>
      </div>
    </Dialog>
  );
}

/** The artist's own view of their craft score, with what would raise it. */
export function CraftCard({ craft }: { craft: NonNullable<ArtworkCard['craft']> }) {
  const bar = (label: string, v: number) => (
    <div className="grid gap-0.5"><div className="flex justify-between text-[11px] font-semibold text-muted"><span>{label}</span><span className="tnum">{v}%</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent-2" style={{ width: `${Math.min(100, v)}%` }} /></div></div>
  );
  return (
    <div className="glass grid gap-3 rounded-2xl p-4" data-testid="craft-card">
      <div className="flex items-center justify-between"><div className="font-display font-semibold">Craft score <span className="tnum">{craft.score}</span></div>{(craft.paid ?? 0) > 0 && <span className="text-sm font-bold text-ok tnum">+{craft.paid} Ink craft bonus</span>}</div>
      <div className="grid gap-2 sm:grid-cols-2">{bar('Coverage', craft.coverage)}{bar('Shading', craft.shading)}{bar('Detail', craft.detail)}{bar(`Palette (${craft.colors} colours)`, Math.min(100, Math.round(((craft.colors - 1) / 9) * 100)))}</div>
      {(craft as any).streak_pct > 0 && <p className="text-xs font-semibold text-hot">🔥 Painting streak: +{(craft as any).streak_pct}% on this bonus</p>}
      {craft.imported && <p className="text-xs text-warn">An uploaded image was placed in this art, so it earns no craft bonus.</p>}
      {!craft.imported && craft.originality != null && craft.originality < 100 && (
        <p className="text-xs text-warn">Very like {craft.similar?.own ? 'your' : 'an earlier'} piece{craft.similar?.title ? ` “${craft.similar.title}”` : ''} — repeats earn {craft.originality}% of the bonus. Paint something new for the full bonus.</p>
      )}
      {craft.tips?.length > 0 && <ul className="grid gap-1 text-xs text-muted">{craft.tips.map((t) => <li key={t}>• {t}</li>)}</ul>}
    </div>
  );
}
