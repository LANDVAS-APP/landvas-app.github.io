import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, Flag, Heart, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { Page } from '../app/Shell';
import { celebrate, useOnboardedMe } from '../lib/queries';
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
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="glass rounded-2xl p-3"><div className="font-display font-semibold tnum">{a.plot_count}</div><div className="eyebrow !text-[10px]">Plots</div></div>
            <div className="glass rounded-2xl p-3"><div className="font-display font-semibold tnum">{fmt(a.appreciation_count)}</div><div className="eyebrow !text-[10px]">Loves</div></div>
            <div className="glass rounded-2xl p-3"><div className="font-display font-semibold">{timeAgo(a.published_at)}</div><div className="eyebrow !text-[10px]">Published</div></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!a.is_owner && <Button variant="secondary" onClick={() => nav(`/u/${a.artist.username}/room`)}><DoorOpen className="h-4 w-4" /> Visit @{a.artist.username}’s room</Button>}
            {me && !a.is_owner && (
              <Button variant={a.appreciated ? 'secondary' : 'primary'} onClick={async () => {
                try { const r = await api.appreciate(a.id, !a.appreciated); celebrate(r.achievements); void qc.invalidateQueries({ queryKey: ['artwork', id] }); } catch (e) { toast.error(toGameError(e).message); }
              }}><Heart className={a.appreciated ? 'h-4 w-4 fill-hot text-hot' : 'h-4 w-4'} /> {a.appreciated ? 'Loved' : 'Love it'}</Button>
            )}
            <Button variant="ghost" onClick={async () => {
              const url = location.href;
              try { if (navigator.share) await navigator.share({ title: a.title, text: `“${a.title}” on LANDVAS`, url }); else { await navigator.clipboard.writeText(url); toast.success('Link copied'); } } catch { /* cancelled */ }
            }}><Share2 className="h-4 w-4" /> Share</Button>
            {me && !a.is_owner && <Button variant="ghost" onClick={() => setReport(true)}><Flag className="h-4 w-4" /> Report</Button>}
          </div>
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
