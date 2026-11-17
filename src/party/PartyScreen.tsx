// /party: the Party area — your party, the lobbies, inviting. /party/CODE: an invite link — the party it leads to
// (anyone can see it, signed in or not) and one tap to join, or to sign up free and land in it.
import { useParams, useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Page, PageHeader } from '../app/Shell';
import { useOnboardedMe } from '../lib/queries';
import { Button } from '../ui';
import PartyPanels, { PartyLinkCard } from './PartyPanels';
import { PARTY_CODE, type PartyTab } from './party';

const TABS: PartyTab[] = ['party', 'lobbies', 'invite'];

export default function PartyScreen() {
  const { code } = useParams();
  const me = useOnboardedMe();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as PartyTab) : 'party';
  const setTab = (t: PartyTab) => setParams((p) => { p.set('tab', t); return p; }, { replace: true });
  // an invite link: /party/join?c=CODE (or the older /party/CODE)
  const raw = code === 'join' ? params.get('c') : code;
  const link = raw && PARTY_CODE.test(raw) ? raw.toUpperCase() : null;
  return (
    <Page>
      <PageHeader eyebrow="Together" title="Parties">
        Team up with anyone. Make your party public and it shows up in the lobbies; keep it private and only people you invite (or send the link) can join.
        Your party chat goes with you on the map and in arcades, and when the leader boards a train or plane, everyone rides along.
      </PageHeader>
      <div className="mx-auto max-w-2xl" data-testid="party-screen">
        {link && <PartyLinkCard code={link} />}
        {me ? <PartyPanels tab={tab} setTab={setTab} /> : !link && (
          <div className="rounded-3xl bg-surface-2 p-6 text-center">
            <div className="mb-2 text-4xl">🎉</div>
            <p className="mb-4 text-sm text-muted">Sign in to start a party, join a lobby and invite your friends.</p>
            <Link to="/welcome?next=%2Fparty"><Button variant="primary">Play free</Button></Link>
          </div>
        )}
      </div>
    </Page>
  );
}
