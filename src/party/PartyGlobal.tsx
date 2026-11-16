// Mounted once inside the router: the Party sheet (open it from anywhere with usePartyUi().show()), invites popping
// up wherever you are (with Join right on them), and the party link a new player arrived with, joined as soon as
// they can play.
import { lazy, Suspense, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import { useEmailStatus } from '../app/EmailGate';
import { useOnboardedMe } from '../lib/queries';
import { buzz } from '../native/native';
import { Dialog, PlayerAvatar, Spinner } from '../ui';
import { PARTY_KEY, activityOf, clearPendingParty, pendingParty, useParty, usePartyJoin, usePartyUi } from './party';

const PartyPanels = lazy(() => import('./PartyPanels'));

export function PartyGlobal() {
  const me = useOnboardedMe();
  if (!me) return null;
  return <><PartySheet /><PartyInviteWatcher /><PartyLinkJoiner /></>;
}

function PartySheet() {
  const open = usePartyUi((s) => s.open);
  const tab = usePartyUi((s) => s.tab);
  const setTab = usePartyUi((s) => s.setTab);
  const close = usePartyUi((s) => s.close);
  const name = useParty().data?.group?.name;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()} title={<span data-testid="party-sheet-title">🎉 {name ?? 'Party'}</span>} wide>
      {open && <Suspense fallback={<div className="flex justify-center py-10"><Spinner /></div>}><PartyPanels tab={tab} setTab={setTab} onDone={close} /></Suspense>}
    </Dialog>
  );
}

// ---- invites pop up wherever you are --------------------------------------------------------------------------------
const SEEN = 'landvas.party.seen';
const seenKeys = (): string[] => { try { return JSON.parse(localStorage.getItem(SEEN) ?? '[]'); } catch { return []; } };
const markSeen = (k: string) => { try { localStorage.setItem(SEEN, JSON.stringify([k, ...seenKeys().filter((x) => x !== k)].slice(0, 40))); } catch { /* storage blocked */ } };

function PartyInviteWatcher() {
  const invites = useParty().data?.invites;
  const join = usePartyJoin();
  const qc = useQueryClient();
  const show = usePartyUi((s) => s.show);
  const nav = useNavigate();
  const ref = useRef({ join, show, nav }); ref.current = { join, show, nav };
  useEffect(() => {
    if (!invites?.length) return;
    const seen = new Set(seenKeys());
    for (const i of invites) {
      const key = `${i.group_id}:${i.at ?? ''}`;
      if (seen.has(key)) continue;
      markSeen(key);
      buzz('light');
      const act = activityOf(i.activity);
      toast.custom((id) => (
        <div className="glass flex w-[min(92vw,400px)] items-center gap-3 rounded-2xl border border-line p-3 text-sm text-fg shadow-xl" data-testid="party-invite-toast">
          <PlayerAvatar p={i.by} size={40} />
          <button className="min-w-0 flex-1 text-left" onClick={() => { toast.dismiss(id); ref.current.show('party'); }}>
            <b>@{i.by.username}</b> invited you to <b>“{i.name ?? 'their party'}”</b>
            <span className="block text-[12px] text-muted">{act.emoji} {act.label} · {i.size} in the party</span>
          </button>
          <button className="rounded-xl bg-accent px-3 py-1.5 text-[13px] font-bold text-white" data-testid="party-invite-toast-join" onClick={async () => {
            toast.dismiss(id);
            try { if (await ref.current.join({ kind: 'invite', id: i.group_id }, i.name)) { buzz('success'); toast.success(`You’re in “${i.name ?? 'the party'}” 🎉`, { action: { label: 'Open', onClick: () => ref.current.show('party') } }); } }
            catch (e) { toast.error(toGameError(e).message); }
          }}>Join</button>
          <button className="text-[12px] font-bold text-muted hover:text-fg" onClick={async () => {
            toast.dismiss(id);
            try { qc.setQueryData(PARTY_KEY, await api.travelGroupDecline(i.group_id)); } catch { /* it runs out by itself */ }
          }}>No thanks</button>
        </div>
      ), { id: `party-invite-${i.group_id}`, duration: 15_000 });
    }
  }, [invites, qc]);
  return null;
}

// ---- a party link opened before signing up (or confirming): join once you can play ---------------------------------
function PartyLinkJoiner() {
  const me = useOnboardedMe();
  const email = useEmailStatus(!!me);
  const party = useParty();
  const join = usePartyJoin();
  const nav = useNavigate();
  const busy = useRef(false);
  const waiting = !email.data || (email.data.required && !email.data.verified) || !party.data;
  useEffect(() => {
    if (!me || waiting || busy.current) return;
    const code = pendingParty();
    if (!code) return;
    if (party.data?.group?.code === code) { clearPendingParty(); return; }
    busy.current = true;
    void (async () => {
      try {
        const r = await join({ kind: 'code', code });
        clearPendingParty();
        if (r?.group) { buzz('success'); toast.success(`You’re in “${r.group.name ?? 'the party'}” 🎉`, { description: 'Say hi in the party chat!' }); nav('/party'); }
      } catch (e) {
        const err = toGameError(e);
        // try again later (a busy server, an email the server hasn't seen confirmed yet)
        if (err.code === 'rate_limited' || err.code === 'unknown_error' || err.code === 'email_not_verified') { busy.current = false; return; }
        clearPendingParty();
        toast.error(err.code === 'group_full' ? 'That party filled up — find another in the lobbies' : 'That party link didn’t work', { description: err.code === 'group_not_found' ? 'The party has ended. Find a lobby to join instead.' : undefined });
      }
    })();
  }, [me, waiting, party.data, join, nav]);
  return null;
}
