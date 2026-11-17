// The app's What's new: the latest features, each one a tap from where it lives in the game, then every update as
// the bell announces it (live from the server, so a new update shows here the moment it's published).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Megaphone } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../backend/api';
import type { Announcement } from '../../backend/types';
import { useOnboardedMe } from '../../lib/queries';
import { useExplorer } from '../../explorer/explorer';
import { timeAgo } from '../../lib/utils';
import { AnnouncementCard, KIND } from '../../updates/Notifications';
import { richOf } from '../../updates/Rich';
import type { DiscTone } from '../../ui';
import { HubH2, HubHero, HubPage, HubRow, rise } from './HubKit';

/** the newest features and where to find them */
export const HIGHLIGHTS: { emoji: string; title: string; sub: string; to: string; tone: DiscTone }[] = [
  { emoji: '👁️', title: 'Explorer’s Eyes', sub: 'Stand where your explorer is, in 3D: the real streets, buildings and sky', to: '/eyes', tone: 'teal' },
  { emoji: '🎭', title: 'The Puppeteer plays itself', sub: 'Every string plays its 10 levels on its own — up to 10 strings', to: '/magic', tone: 'violet' },
  { emoji: '🎉', title: 'Parties & open play', sub: 'Party up anywhere, join anyone online, chat on the map and in arcades', to: '/together', tone: 'emerald' },
  { emoji: '👀', title: 'Watch people play', sub: 'See who’s live now, react, then join or team up', to: '/together', tone: 'azure' },
  { emoji: '💬', title: 'Global chat everywhere', sub: 'A Global tab first in every chat box, popping up over whoever said it', to: '/social?tab=chat', tone: 'teal' },
  { emoji: '🌋', title: 'The Ultra Expansion', sub: '9 land-changing ultras, Ultra Fusions and the Primordials', to: '/ultras', tone: 'gold' },
  { emoji: '⚡', title: 'Godrolls & Ascend', sub: 'Claims where every roll is an ultra, and Ink that pushes a rarity up', to: '/ultras', tone: 'ember' },
  { emoji: '🔮', title: '20 enchantments, Stars to ★5', sub: 'Pocket Sun, Dowsing Rod, Clockwork Rewind and 130+ badges', to: '/magic', tone: 'violet' },
  { emoji: '💌', title: 'Referral tiers & invite cards', sub: 'Real friends climb tiers; pick how your invite link looks', to: '/invite', tone: 'rose' },
  { emoji: '👑', title: 'Crown shares', sub: 'A Crown earns 1% of its kingdom — Ink or rent, your pick', to: '/royalty', tone: 'gold' },
  { emoji: '🌍', title: 'Worlds button', sub: 'From the map: Home, your best place of each kind, Space or the Inkborn', to: '/world', tone: 'azure' },
  { emoji: '🎬', title: 'Clips that fit anywhere', sub: 'Your rolls and moments sized for TikTok, Discord, chats and email', to: '/clips', tone: 'crimson' },
  { emoji: '📖', title: 'The Handbook', sub: 'Every feature explained, with pictures, live numbers and strategy', to: '/handbook', tone: 'steel' },
];

export default function WhatsNew() {
  const me = useOnboardedMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['handbook-updates'], queryFn: api.announcements, staleTime: 60_000 });
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const items = q.data?.items ?? [];
  const unread = q.data?.unread ?? 0;
  // you've seen them: the bell's count clears (this page keeps its NEW tags until you leave)
  useEffect(() => {
    if (!me || !unread) return;
    const t = setTimeout(() => { void api.markAnnouncementsSeen().then(() => qc.invalidateQueries({ queryKey: ['notifications'] })).catch(() => {}); }, 2500);
    return () => clearTimeout(t);
  }, [!!me, unread]); // eslint-disable-line react-hooks/exhaustive-deps
  const [first, ...rest] = items;
  const more = all ? rest : rest.slice(0, 5);

  return (
    <HubPage tone="new" id="whats-new">
      <HubHero kicker="What’s new" icon={<Megaphone className="h-3.5 w-3.5" />} art="✨" title="Fresh in LANDVAS"
        sub="The latest features, one tap from where they live — and every update the moment it lands."
        stats={[
          { label: 'Updates', value: items.length || '–' },
          ...(unread ? [{ label: 'Unread', value: unread, hot: true, testid: 'whats-new-unread' }] : []),
          { label: 'New features', value: HIGHLIGHTS.length },
        ]} />

      <HubH2 note="Tap to try it" i={2}>The latest features</HubH2>
      <motion.div {...rise(3)} className="lvh-list" data-testid="whats-new-highlights">
        {HIGHLIGHTS.map((h) => (
          <HubRow key={h.title} tone={h.tone} to={h.to} testid="whats-new-highlight"
            onClick={h.to === '/eyes' ? () => { if (!useExplorer.getState().state && me?.explorer) useExplorer.getState().set(me.explorer); } : undefined}
            lead={<span className="lvh-emo !h-11 !w-11 !rounded-[14px] !text-[21px]">{h.emoji}</span>}
            title={h.title} sub={h.sub} wrap action={<span className="lvh-go soft">Try</span>} />
        ))}
      </motion.div>

      {first && (
        <>
          <HubH2 note="As the bell announces them" i={4}>Every update</HubH2>
          <motion.div {...rise(5)} className="grid gap-2" data-testid="whats-new-feed">
            <AnnouncementCard a={first} onLink={(to) => nav(to)} />
            {more.map((a) => (open === a.id
              ? <AnnouncementCard key={a.id} a={a} onLink={(to) => nav(to)} />
              : <UpdateRow key={a.id} a={a} onOpen={() => setOpen(a.id)} />))}
            {rest.length > 5 && (
              <button type="button" className="lvh-cta ghost mt-1 w-full" onClick={() => setAll((x) => !x)} data-testid="whats-new-all">
                {all ? 'Show fewer' : `Every update (${items.length})`} <ChevronDown className={all ? 'h-4 w-4 rotate-180' : 'h-4 w-4'} />
              </button>
            )}
          </motion.div>
        </>
      )}
    </HubPage>
  );
}

function UpdateRow({ a, onOpen }: { a: Announcement; onOpen(): void }) {
  const rich = richOf(a), k = KIND[a.kind] ?? KIND.update;
  return (
    <HubRow tone="steel" onClick={onOpen} testid="whats-new-row"
      lead={<span className="lvh-emo !h-10 !w-10 !rounded-xl !text-[19px]" style={{ background: `${k.color}33` }}>{rich.emoji}</span>}
      title={a.title} sub={<>{k.label} · {timeAgo(a.published_at)}{a.unread && <b className="ml-1.5 text-hot">NEW</b>}</>} />
  );
}
