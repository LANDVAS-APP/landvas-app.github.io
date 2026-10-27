import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { Page, PageHeader } from '../app/Shell';
import { useOnboardedMe } from '../lib/queries';
import { fmt } from '../lib/utils';
import { Avatar, Button, Cost, Empty, Spinner } from '../ui';

export default function Events() {
  const me = useOnboardedMe();
  const q = useQuery({ queryKey: ['events'], queryFn: api.events });
  return (
    <Page>
      <PageHeader eyebrow="World events" title="Events">Limited-time challenges for the whole map. Rewards are Pigments, XP and Gallery Tokens — never cash.</PageHeader>
      {q.isLoading ? <div className="flex justify-center py-16"><Spinner /></div> : !(q.data ?? []).length ? (
        <Empty icon={<CalendarDays className="h-6 w-6" />} title="No events right now">The first world event is coming soon. Keep painting!</Empty>
      ) : (
        <div className="grid gap-4">
          {(q.data ?? []).map((e: any) => (
            <section key={e.id} className="glass rounded-3xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="eyebrow">{e.status === 'active' ? 'Live now' : e.status === 'scheduled' ? `Starts ${new Date(e.starts_at).toLocaleString()}` : 'Ended'}</div>
                  <h2 className="font-display text-xl font-semibold">{e.name}</h2>
                  <p className="mt-1 max-w-xl text-sm text-muted">{e.description}</p>
                </div>
                {me && e.status === 'active' && !e.my_progress && (
                  <Button variant="rainbow" onClick={async () => { try { await api.joinEvent(e.id); toast.success('You joined the event'); void q.refetch(); } catch (err) { toast.error(toGameError(err).message); } }}>Join</Button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted">
                <span>{fmt(e.participants)} taking part</span>
                {e.ends_at && <span>Ends {new Date(e.ends_at).toLocaleString()}</span>}
                {e.config?.rewards?.participation && <span className="flex items-center gap-1">Reward: <Cost cost={e.config.rewards.participation} /></span>}
              </div>
              {e.my_progress && <p className="mt-2 text-sm">Your score: <b className="tnum">{fmt(e.my_progress.score)}</b></p>}
              {e.top?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {e.top.slice(0, 5).map((t: any, i: number) => (
                    <span key={t.player.id} className="flex items-center gap-1.5 rounded-xl border border-line px-2 py-1 text-xs"><b>{i + 1}</b><Avatar seed={t.player.avatar_seed} style={t.player.avatar_style} accent={t.player.accent_color} size={16} />@{t.player.username} · {fmt(t.score)}</span>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
