// The handbook's "What's new", right at the top: the game's latest updates (the same ones the bell announces), the
// newest one opened up, the rest a tap away. Public like the rest of the handbook.
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../backend/api';
import type { Announcement } from '../backend/types';
import { AnnouncementCard, KIND } from '../updates/Notifications';
import { richOf } from '../updates/Rich';
import { timeAgo } from '../lib/utils';

export function HandbookUpdates() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['handbook-updates'], queryFn: api.announcements, staleTime: 60_000, refetchOnWindowFocus: true });
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const items = q.data?.items ?? [];
  if (!items.length) return null;
  const [first, ...rest] = items;
  const more = all ? rest : rest.slice(0, 3);
  return (
    <section className="hb-updates hb-rise" id="updates" data-testid="hb-updates" aria-label="What’s new">
      <div className="hb-updates-head">
        <span className="kick"><Sparkles className="h-3.5 w-3.5" /> What’s new</span>
        {(q.data?.unread ?? 0) > 0 && <span className="hb-updates-new" data-testid="hb-updates-unread">{q.data!.unread} new</span>}
        <span className="flex-1" />
        <span className="text-[11px] font-semibold text-faint">The latest changes to the game</span>
      </div>
      <AnnouncementCard a={first} onLink={(to) => nav(to)} />
      {more.length > 0 && (
        <div className="grid gap-1.5" data-testid="hb-updates-more">
          {more.map((a) => open === a.id
            ? <AnnouncementCard key={a.id} a={a} onLink={(to) => nav(to)} />
            : <UpdateRow key={a.id} a={a} onOpen={() => setOpen(a.id)} />)}
        </div>
      )}
      {rest.length > 3 && (
        <button type="button" className="hb-updates-all" onClick={() => setAll((x) => !x)} data-testid="hb-updates-all">
          {all ? 'Show fewer' : `Every update (${items.length})`} <ChevronDown className={all ? 'h-4 w-4 rotate-180' : 'h-4 w-4'} />
        </button>
      )}
    </section>
  );
}

function UpdateRow({ a, onOpen }: { a: Announcement; onOpen(): void }) {
  const rich = richOf(a), k = KIND[a.kind] ?? KIND.update;
  return (
    <button type="button" className="hb-update-row" onClick={onOpen} data-testid="hb-update-row">
      <span className="e" style={{ background: `${k.color}22` }}>{rich.emoji}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13.5px] font-bold">{a.title}</span>
        <span className="block text-[11px] text-faint">{k.label} · {timeAgo(a.published_at)}{a.unread && <b className="ml-1.5 text-hot">NEW</b>}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
    </button>
  );
}
