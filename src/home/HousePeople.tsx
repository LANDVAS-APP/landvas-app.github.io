// Who's in the house, and your party: invite anyone here to your party with a tap (or anyone at all), see where the
// rest of your party is, and ask them over.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Megaphone, UserPlus, Users } from 'lucide-react';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { HomeLive, Profile } from '../backend/types';
import { buzz } from '../native/native';
import { cn } from '../lib/utils';
import { Button, Dialog, PlayerAvatar } from '../ui';
import { describeWhereabouts } from '../social/activity';
import { memberStatus, PARTY_KEY, useParty, usePartyUi } from '../party/party';
import type { RoomChat } from '../party/chat';

/** the "who's here" button: how many are in, and how many of them are your party */
export function HousePeopleButton({ live, onOpen }: { live: HomeLive | null; onOpen(): void }) {
  const party = useParty().data?.group ?? null;
  const mates = new Set((party?.members ?? []).filter((m) => !m.me).map((m) => m.id));
  const here = (live?.members.length ?? 0) + 1;
  const matesHere = (live?.members ?? []).filter((m) => mates.has(m.id)).length;
  return (
    <button onClick={onOpen} className="grid h-12 w-12 place-items-center rounded-2xl bg-black/45 text-[9px] font-bold backdrop-blur" data-testid="home-people" aria-label="Who’s here · invite">
      <span className="relative"><Users className="h-5 w-5 text-[#7DFFB2]" />{here > 1 && <span className="absolute -right-2.5 -top-2 min-w-[16px] rounded-full bg-[#7DFFB2] px-1 text-center text-[9px] leading-4 text-[#0B2A18]">{here}</span>}</span>
      {matesHere > 0 ? `🎉 ${matesHere}` : 'Invite'}
    </button>
  );
}

export function HousePeople({ open, onClose, live, host, myId, partyChat }: {
  open: boolean; onClose(): void; live: HomeLive | null; host: Profile; myId: string; partyChat: RoomChat;
}) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const showParty = usePartyUi((s) => s.show);
  const party = useParty().data?.group ?? null;
  const mates = new Map((party?.members ?? []).filter((m) => !m.me).map((m) => [m.id, m]));
  const inHouse = live?.members ?? [];
  const hereIds = new Set(inHouse.map((m) => m.id));
  const away = [...mates.values()].filter((m) => !hereIds.has(m.id));
  const [busy, setBusy] = useState<string | null>(null);
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const invited = new Set((party?.invited ?? []).map((p) => p.id));
  const where = host.id === myId ? 'my home' : `@${host.username}’s home`;

  const invite = async (p: Profile) => {
    setBusy(p.id);
    try { qc.setQueryData(PARTY_KEY, await api.partyInvite(p.id)); buzz('light'); toast.success(`Invited @${p.username} to your party 🎉`); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  const askOver = async (id: string) => {
    setBusy(`ask:${id}`);
    try { await partyChat.send(`🏠 Come over to ${where}!`); setAsked((s) => new Set(s).add('all')); toast.success('Asked your party over 🏠'); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }} title="Who’s here" description={`${inHouse.length + 1} in ${where}${party ? ` · your party: ${(party.members.length)}` : ''}`}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4" data-testid="home-people-sheet">
        <section className="grid gap-1.5" data-testid="home-people-here">
          <div className="eyebrow">In the house · {inHouse.length + 1}</div>
          <div className="flex items-center gap-3 rounded-2xl px-2 py-1.5"><Users className="h-4 w-4 text-muted" /><span className="text-[13px] text-muted">You{host.id === myId ? ' (it’s your home)' : ''}</span></div>
          {!inHouse.length && <p className="px-2 text-[12.5px] text-muted">Nobody else is here yet — invite someone over.</p>}
          {inHouse.map((m) => {
            const mate = mates.has(m.id);
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-surface-2/60 px-2 py-1.5" data-testid="home-person" data-user={m.username}>
                <Link to={`/u/${m.username}`} onClick={onClose}><PlayerAvatar p={m} size={34} /></Link>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">@{m.username}{m.id === host.id && <span className="ml-1 text-[11px] font-normal text-muted">· lives here</span>}</span>
                {mate ? <span className="flex items-center gap-1 rounded-full bg-ok/15 px-2 py-0.5 text-[11px] font-bold text-ok" data-testid="home-person-mate"><Check className="h-3 w-3" /> Your party</span>
                  : invited.has(m.id) ? <span className="text-[11px] text-muted">Invited</span>
                  : <Button size="sm" variant="primary" loading={busy === m.id} onClick={() => void invite(m)} data-testid="home-person-invite"><UserPlus className="h-4 w-4" /> Invite</Button>}
              </div>
            );
          })}
        </section>

        {party ? (
          <section className="grid gap-1.5" data-testid="home-party">
            <div className="flex items-center justify-between"><div className="eyebrow">Your party · {party.members.length}</div>
              {away.length > 0 && <Button size="sm" variant="secondary" loading={busy?.startsWith('ask:')} disabled={asked.has('all')} onClick={() => void askOver('all')} data-testid="home-party-ask">
                <Megaphone className="h-4 w-4" /> {asked.has('all') ? 'Asked' : 'Ask them over'}</Button>}</div>
            {[...mates.values()].map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-2xl px-2 py-1.5" data-testid="home-party-member" data-user={m.username}>
                <PlayerAvatar p={m} size={30} />
                <span className="min-w-0 flex-1 truncate text-[13px]"><b>@{m.username}</b>{m.leader && ' 👑'} <span className="text-muted">· {hereIds.has(m.id) ? '🏠 here with you' : memberStatus(m, describeWhereabouts(m.now ?? undefined))}</span></span>
              </div>
            ))}
            {!mates.size && <p className="px-2 text-[12.5px] text-muted">Just you so far — invite someone from the house, or anyone online.</p>}
          </section>
        ) : (
          <p className="rounded-2xl bg-surface-2/60 p-3 text-[12.5px] text-muted" data-testid="home-no-party">Not in a party yet: invite anyone here (or anyone online) and you’re a party — chat together wherever you go, and follow each other in.</p>
        )}

        <div className={cn('flex flex-wrap gap-2')}>
          <Button variant="rainbow" onClick={() => { onClose(); showParty('invite'); }} data-testid="home-invite-anyone"><UserPlus className="h-4 w-4" /> Invite anyone</Button>
          <Button variant="secondary" onClick={() => { onClose(); nav('/party'); }} data-testid="home-party-page">🎉 Party page</Button>
        </div>
      </div>
    </Dialog>
  );
}
