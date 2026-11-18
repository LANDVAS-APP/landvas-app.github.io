// The Play hub's doors to the app's own hubs: a What's new ribbon (the latest update) and big banners for Together,
// Magic and Ultras, each with what's live for you right now.
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { api } from '../../backend/api';
import { useMyEnchantments } from '../../enchant/core';
import { KIND_ORDER } from '../../enchant/kinds';
import { useOnboardedMe } from '../../lib/queries';
import { fmt } from '../../lib/utils';
import { buzz } from '../../native/native';
import { LOBBIES_KEY, useParty } from '../../party/party';
import { useUltras } from '../../ultra/UltraTracker';
import { useExplorer } from '../../explorer/explorer';
import { richOf } from '../../updates/Rich';
import { HUB_RIM, type HubTone } from './HubKit';
import './hubs.css';

/** the newest update, one tap from the full What's new */
export function WhatsNewRibbon() {
  const me = useOnboardedMe();
  const q = useQuery({ queryKey: ['handbook-updates'], queryFn: api.announcements, staleTime: 5 * 60_000, enabled: !!me });
  const first = q.data?.items[0];
  const unread = q.data?.unread ?? 0;
  return (
    <Link to="/new" className="lvh-ribbon" data-sound="tab" onClick={() => buzz('light')} data-testid="hub-whats-new">
      <span className="e" aria-hidden>{first ? richOf(first).emoji : '✨'}</span>
      <span className="min-w-0 flex-1">
        <span className="k">What’s new{unread ? ` · ${unread} new` : ''}</span>
        <span className="t">{first?.title ?? 'Déjà Vu, parties, the Ultra Expansion, 21 enchantments and more'}</span>
      </span>
      {unread > 0 && <span className="lvh-newtag !ml-0">NEW</span>}
      <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
    </Link>
  );
}

export function HubFeatures() {
  const me = useOnboardedMe();
  const ench = useMyEnchantments();
  const ultras = useUltras();
  const party = useParty();
  const lobbies = useQuery({ queryKey: [...LOBBIES_KEY, null], queryFn: () => api.partyLobbies(null), staleTime: 30_000, enabled: !!me });
  const list = ench.data ?? [];
  const ready = list.filter((e) => e.attention).length;
  const kinds = new Set(list.map((e) => e.kind)).size;
  const nUltras = ultras.data?.plots.length ?? 0;
  const g = party.data?.group;
  const online = lobbies.data?.online_count ?? 0;
  const items: { tone: HubTone; to: string; kicker: string; title: string; sub: string; art: string; go: string; testid: string; isNew?: boolean }[] = [
    { tone: 'eyes', to: '/eyes', kicker: 'Explorer’s Eyes', title: 'Step inside', art: '👁️', go: 'Look', testid: 'hub-feature-eyes', isNew: true,
      sub: 'The real place your explorer stands, in 3D' },
    { tone: 'together', to: '/together', kicker: 'Together', title: 'Play with people', art: '🎉', go: g ? 'Party' : 'Join', testid: 'hub-feature-together',
      sub: g ? `In ${g.name} · ${g.online ?? 0} online` : online ? `${fmt(online)} playing now · parties & live` : 'Parties, open play, watch live' },
    { tone: 'magic', to: '/magic', kicker: 'Magic', title: 'Enchantments', art: '🔮', go: ready ? 'Collect' : 'Open', testid: 'hub-feature-magic',
      sub: ready ? `${ready} ready now · ${kinds}/${KIND_ORDER.length} kinds` : list.length ? `${list.length} owned · ${kinds}/${KIND_ORDER.length} kinds` : `${KIND_ORDER.length} kinds · Stars to ★5 · Splice` },
    { tone: 'ultras', to: '/ultras', kicker: 'Ultra Expansion', title: 'Ultras', art: '🌋', go: 'Enter', testid: 'hub-feature-ultras',
      sub: nUltras ? `${nUltras} ultra${nUltras === 1 ? '' : 's'} earning · Fusion Lab` : '9 new ultras · Fusions · Primordials' },
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className="lvh-rail mb-3 !pb-1" data-testid="hub-features">
      {items.map((it) => (
        <Link key={it.to} to={it.to} data-sound="tab" className={`lvh-feature lvh-${it.tone} t-${HUB_RIM[it.tone]}`} data-testid={it.testid} onClick={() => {
          buzz('light');
          // Explorer's Eyes stands where your explorer is: opened from here (not the map), hand it your explorer
          if (it.to === '/eyes' && !useExplorer.getState().state && me?.explorer) useExplorer.getState().set(me.explorer);
        }}>
          <span className="halo" aria-hidden /><span className="art" aria-hidden>{it.art}</span>
          <span className="lvh-kicker">{it.kicker}{it.isNew && <span className="lvh-newtag !ml-1">NEW</span>}</span>
          <span><span className="tt">{it.title}</span><span className="ss">{it.sub}</span></span>
          <span className="go">{it.go} <ChevronRight className="h-3.5 w-3.5" /></span>
        </Link>
      ))}
    </motion.div>
  );
}
