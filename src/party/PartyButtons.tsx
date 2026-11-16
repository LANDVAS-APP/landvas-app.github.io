// The ways into the party, everywhere: a disc in the game HUD, a button in the web's nav, "Invite to party" on
// friends and profiles, a card in the Play hub, and the party chat on the map.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, PartyPopper, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { useOnboardedMe } from '../lib/queries';
import { cn } from '../lib/utils';
import { buzz } from '../native/native';
import { Button, Emblem, GameDisc } from '../ui';
import { ChatDock } from './ChatDock';
import { LOBBIES_KEY, PARTY_KEY, activityOf, useParty, usePartyUi } from './party';
import { usePartyChat } from './usePartyChat';

/** the HUD (map and Play hub, in the app): your party, invites waiting */
export function PartyDisc() {
  const q = useParty();
  const show = usePartyUi((s) => s.show);
  const g = q.data?.group;
  const invites = q.data?.invites.length ?? 0;
  const online = g ? Math.max(0, (g.online ?? 0) - 1) : 0;
  return (
    <GameDisc tone="teal" size={34} on={!!g} badge={invites ? invites : g && online ? online : undefined}
      onClick={() => { buzz('light'); show(g ? 'party' : invites ? 'party' : 'lobbies'); }}
      aria-label={g ? `Your party, ${g.members.length} in it` : invites ? `Party invites, ${invites}` : 'Parties'} data-testid="party-disc">
      <PartyPopper className="h-[17px] w-[17px]" />
    </GameDisc>
  );
}

/** the web: a button beside the bell (the nav rail, the page header on phones, the map) */
export function PartyNavButton({ className, compact }: { className?: string; compact?: boolean }) {
  const me = useOnboardedMe();
  const q = useParty();
  const show = usePartyUi((s) => s.show);
  if (!me) return null;
  const g = q.data?.group;
  const invites = q.data?.invites.length ?? 0;
  return (
    <button className={cn('relative grid place-items-center rounded-2xl text-muted hover:bg-surface-2 hover:text-fg', compact ? 'h-9 w-9' : 'h-11 w-11', g && 'text-ok', className)}
      onClick={() => show(g || invites ? 'party' : 'lobbies')} aria-label={g ? 'Your party' : 'Parties'} title={g ? `${g.name} · ${g.members.length}/${g.max}` : 'Parties — lobbies & invites'} data-testid="party-nav">
      <PartyPopper className={compact ? 'h-[18px] w-[18px]' : 'h-5 w-5'} />
      {(invites > 0 || g) && <span className={cn('absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full px-1 text-center text-[10px] font-bold leading-4 text-white tnum', invites ? 'bg-hot' : 'bg-ok')}>{invites || g!.members.length}</span>}
    </button>
  );
}

/** "Invite to party" for a friend or a profile (starts a party for you if you're not in one) */
export function InviteToPartyButton({ playerId, username, size = 'sm', className }: { playerId: string; username: string; size?: 'sm' | 'md'; className?: string }) {
  const me = useOnboardedMe();
  const q = useParty();
  const qc = useQueryClient();
  const show = usePartyUi((s) => s.show);
  const [busy, setBusy] = useState(false);
  if (!me || me.user_id === playerId) return null;
  const g = q.data?.group;
  if (g?.members.some((m) => m.id === playerId)) return <span className={cn('flex h-8 items-center px-2 text-[12px] font-bold text-ok', className)} data-testid="invite-party-in">In your party</span>;
  const invited = g?.invited.some((p) => p.id === playerId);
  return (
    <Button size={size} variant="secondary" className={cn('rounded-full', className)} loading={busy} disabled={invited} data-testid="invite-party"
      onClick={async () => {
        setBusy(true);
        try {
          qc.setQueryData(PARTY_KEY, await api.partyInvite(playerId));
          buzz('light');
          toast.success(`Invited @${username} to your party 🎉`, { action: { label: 'Open', onClick: () => show('party') } });
        } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
      }}>
      <UserPlus className="h-4 w-4" /> {invited ? 'Invited' : 'Invite to party'}
    </Button>
  );
}

/** the Play hub: your party at a glance, or the lobbies waiting */
export function PartyHubCard() {
  const q = useParty();
  const show = usePartyUi((s) => s.show);
  const g = q.data?.group;
  const invites = q.data?.invites.length ?? 0;
  const lobbies = useQuery({ queryKey: [...LOBBIES_KEY, null], queryFn: () => api.partyLobbies(null), staleTime: 30_000, refetchInterval: 60_000, enabled: !g });
  const live = lobbies.data?.lobbies.length ?? 0;
  const sub = g ? `${activityOf(g.activity).emoji} ${g.name} · 🟢 ${g.online ?? 0} online · ${g.members.length}/${g.max}`
    : invites ? `${invites} party invite${invites === 1 ? '' : 's'} waiting`
    : live ? `${live} live ${live === 1 ? 'lobby' : 'lobbies'} · ${lobbies.data?.online_count ?? 0} playing now` : 'Start a party, invite anyone, meet new people';
  return (
    <div className={cn('lv-pdaily t-emerald mb-3 w-full', (invites > 0 || live > 0) && !g && 'ready')} data-testid="hub-party">
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => { buzz('light'); show(g || invites ? 'party' : 'lobbies'); }}>
        <Emblem tone="emerald" size={42}><span className="text-[20px] leading-none">🎉</span></Emblem>
        <span className="min-w-0 flex-1">
          <span className="t">{g ? 'Your party' : invites ? 'You’re invited!' : 'Party up'}</span>
          <span className="s block truncate">{sub}</span>
        </span>
      </button>
      <button className="flex shrink-0 items-center gap-1 rounded-xl bg-white/10 px-2.5 py-1.5 text-[12px] font-bold" onClick={() => { buzz('light'); show('invite'); }} data-testid="hub-party-invite">
        <UserPlus className="h-4 w-4" /> Invite <ChevronRight className="h-3.5 w-3.5 opacity-60" />
      </button>
    </div>
  );
}

/** the map: your party's chat (when you're in one) */
export function MapPartyChat({ className }: { className?: string }) {
  const me = useOnboardedMe();
  const g = useParty().data?.group;
  const show = usePartyUi((s) => s.show);
  const chat = usePartyChat();
  if (!g) return null;
  return (
    <ChatDock className={className} myId={me?.user_id} onInvite={() => show('invite')} testid="map-party-chat"
      channels={[{ id: 'party', label: 'Party', chat, placeholder: 'Message your party…', empty: 'Say hi to your party 👋 — it goes with you on the map and in arcades.', notHere: 'You’re not in a party right now.' }]} />
  );
}
