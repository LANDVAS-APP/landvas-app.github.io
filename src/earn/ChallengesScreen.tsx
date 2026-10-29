// /challenges — weekly themed art challenges. Paint something for the theme, enter
// it, vote for your favourites; when the week ends the most-voted entries win Ink.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Crown, Medal, Paintbrush, ThumbsUp, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Challenge } from '../backend/types';
import { Page, PageHeader } from '../app/Shell';
import { ArtThumb } from '../gallery/GalleryScreen';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { cn, fmt } from '../lib/utils';
import { Button, Empty, ResourceIcon, Spinner } from '../ui';

const left = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'ended';
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  return d > 0 ? `${d}d ${h}h left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`;
};
const PLACE = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

export default function ChallengesScreen() {
  const me = useOnboardedMe();
  const q = useQuery({ queryKey: ['challenges'], queryFn: api.challenges, refetchInterval: 30_000 });
  if (q.isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  const d = q.data;
  return (
    <Page wide>
      <PageHeader eyebrow="Weekly challenges" title={<span className="flex items-center gap-2"><Trophy className="h-7 w-7 text-gold" /> Paint the theme</span>}>
        A new theme every week. Paint something for it, enter it, and vote for the pieces you love — when the week ends, the most-voted entries win Ink.
      </PageHeader>
      {!d?.enabled || (!d.active.length && !d.upcoming.length && !d.past.length) ? (
        <Empty icon={<Trophy className="h-6 w-6" />} title="No challenge this week">The next theme is on its way — check the bell for updates.</Empty>
      ) : (
        <div className="grid gap-6">
          {d.active.map((c) => <ActiveChallenge key={c.id} c={c} me={!!me} votesPer={d.votes_per_player} />)}
          {d.upcoming.length > 0 && (
            <section>
              <h2 className="mb-2 font-display text-lg font-semibold">Coming up</h2>
              <div className="grid gap-2 sm:grid-cols-2">{d.upcoming.map((u) => (
                <div key={u.id} className="glass rounded-2xl p-4"><div className="font-display font-semibold">{u.title}</div><p className="text-sm text-muted">{u.theme}</p><p className="mt-1 text-xs text-faint">Starts {new Date(u.starts_at).toLocaleString()} · prizes {u.prizes.map(fmt).join(' / ')} Ink</p></div>
              ))}</div>
            </section>
          )}
          {d.past.length > 0 && (
            <section>
              <h2 className="mb-2 font-display text-lg font-semibold">Past winners</h2>
              <div className="grid gap-3">{d.past.map((c) => (
                <div key={c.id} className="glass rounded-2xl p-4">
                  <div className="mb-2 font-semibold">{c.title}</div>
                  <div className="grid grid-cols-3 gap-3">
                    {c.entries.filter((e) => e.place).slice(0, 3).map((e) => (
                      <Link key={e.card.id} to={`/art/${e.card.id}`} className="grid gap-1 text-xs">
                        <ArtThumb card={e.card} />
                        <span className="flex items-center gap-1 font-bold">{e.place === 1 ? <Crown className="h-3.5 w-3.5 text-gold" /> : <Medal className="h-3.5 w-3.5 text-muted" />}{PLACE[(e.place ?? 1) - 1]} · @{e.card.artist.username}</span>
                        <span className="text-faint tnum">{e.votes} votes · +{fmt(e.prize)} Ink</span>
                      </Link>
                    ))}
                    {!c.entries.some((e) => e.place) && <p className="col-span-3 text-sm text-muted">No votes were cast.</p>}
                  </div>
                </div>
              ))}</div>
            </section>
          )}
        </div>
      )}
    </Page>
  );
}

function ActiveChallenge({ c, me, votesPer }: { c: Challenge; me: boolean; votesPer: number }) {
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['challenges'] }); invalidateGame(qc); };
  const vote = async (pub: string, on: boolean) => {
    try { await api.challengeVote(c.id, pub, on); refresh(); } catch (e) { toast.error(toGameError(e).message); }
  };
  return (
    <section className="glass grid gap-4 rounded-[26px] p-5" data-testid="challenge">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="eyebrow text-gold">This week’s theme</div>
          <h2 className="font-display text-2xl font-bold">{c.title}</h2>
          {c.theme && <p className="mt-1 max-w-2xl text-sm text-muted">{c.theme}</p>}
        </div>
        <div className="grid justify-items-end gap-1 text-sm">
          <span className="flex items-center gap-1 font-bold tnum"><Clock className="h-4 w-4 text-accent-2" /> {left(c.ends_at)}</span>
          <span className="flex items-center gap-1 tnum text-muted"><ResourceIcon r="ink" /> {c.prizes.map(fmt).join(' / ')} for the top {c.prizes.length}</span>
          {c.entry_ink > 0 && <span className="text-xs text-ok">+{c.entry_ink} Ink just for entering</span>}
        </div>
      </div>
      {me && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button variant={c.my_entry ? 'secondary' : 'rainbow'} onClick={() => setPicking((p) => !p)} data-testid="challenge-enter"><Paintbrush className="h-4 w-4" /> {c.my_entry ? 'Change my entry' : 'Enter a piece'}</Button>
          <span className="text-muted tnum">{c.my_votes_left} of {votesPer} votes left</span>
        </div>
      )}
      {picking && <EntryPicker c={c} onDone={() => { setPicking(false); refresh(); }} />}
      {!c.entries.length ? <p className="text-sm text-muted">No entries yet — be the first.</p> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {c.entries.map((e, i) => (
            <div key={e.card.id} className={cn('glass grid gap-2 rounded-3xl p-2', e.mine && 'ring-2 ring-accent-2/70')} data-testid="challenge-entry">
              <Link to={`/art/${e.card.id}`} className="relative">
                <ArtThumb card={e.card} />
                {i < 3 && e.votes > 0 && <span className="absolute left-2 top-2 rounded-full bg-bg/80 px-2 py-0.5 text-[11px] font-extrabold text-gold">#{i + 1}</span>}
              </Link>
              <div className="flex items-center justify-between gap-1 px-1">
                <div className="min-w-0"><div className="truncate text-sm font-semibold">{e.card.title}</div><div className="truncate text-[11px] text-muted">@{e.card.artist.username}</div></div>
                {me && !e.mine ? (
                  <button onClick={() => void vote(e.card.id, !e.voted)} disabled={!e.voted && c.my_votes_left <= 0} data-testid="challenge-vote"
                    className={cn('flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tnum transition', e.voted ? 'bg-gold text-bg' : 'bg-surface-2 text-fg hover:bg-gold/20 disabled:opacity-40')}>
                    <ThumbsUp className="h-3.5 w-3.5" /> {e.votes}
                  </button>
                ) : <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-muted tnum"><ThumbsUp className="h-3.5 w-3.5" /> {e.votes}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EntryPicker({ c, onDone }: { c: Challenge; onDone(): void }) {
  const pubs = useQuery({ queryKey: ['publications'], queryFn: api.myPublications });
  const [busy, setBusy] = useState<string | null>(null);
  const ok = (pubs.data ?? []).filter((p) => p.status === 'published' && new Date(p.published_at ?? p.created_at).getTime() >= new Date(c.starts_at).getTime());
  return (
    <div className="rounded-2xl border border-line p-3">
      {pubs.isLoading ? <Spinner /> : !ok.length ? (
        <p className="text-sm text-muted">Entries must be published after the challenge started — paint something for “{c.title}” in <Link to="/canvases" className="font-semibold text-accent-2 underline">your canvases</Link>, publish it, then enter it here.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {ok.map((p) => (
            <button key={p.id} className={cn('grid gap-1 rounded-2xl p-1 text-left text-xs hover:bg-surface-2', c.my_entry === p.id && 'ring-2 ring-accent-2')} disabled={!!busy} data-testid="challenge-pick"
              onClick={async () => {
                setBusy(p.id);
                try { const r = await api.challengeEnter(c.id, p.id); toast.success(r.earned ? `Entered · +${r.earned} Ink` : 'Entered — good luck!'); onDone(); } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
              }}>
              <ArtThumb card={p} />
              <span className="truncate font-semibold">{p.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
