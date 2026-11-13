// Security: two-step sign-in, who has which staff role, and how the portal is protected.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../../../src/backend/api';
import { toGameError } from '../../../src/backend/backend';
import { PlayerAvatar } from '../../../src/ui';
import { cn } from '../../../src/lib/utils';
import { MfaSettings } from '../../shared/auth';
import { portal, type WhoAmI } from '../../shared/api';
import { ago } from '../../shared/format';
import { PageHeader, Panel, Q, useDebounced } from '../../shared/ui';

const ROLES: [string, string][] = [
  ['owner', 'Everything, including the data explorer and SQL console'], ['admin', 'Every staff tool except the owner’s'], ['moderator', 'Art review, fair play, chat, plots'],
  ['economy', 'Rates, rarities, shop, the economy pages'], ['support', 'Support tickets and player look-ups'], ['payouts', 'Cash-out decisions'],
];

export default function Security() {
  const who = useOutletContext<WhoAmI>();
  const qc = useQueryClient();
  return (
    <>
      <PageHeader title="Security & staff" sub="How staff sign in, and who can do what." />
      <div className="grid gap-3 xl:grid-cols-2">
        <MfaSettings who={who} onChange={() => void qc.invalidateQueries({ queryKey: ['whoami'] })} />
        <Panel title="How this portal is protected">
          <ul className="grid list-disc gap-1.5 pl-5 text-sm text-muted">
            <li>Every page asks the database, which checks your staff role on every single call. The website itself holds no keys or special access.</li>
            <li>The data explorer, SQL console and these settings are the owner’s only.</li>
            <li>The SQL console can only read: the database refuses any change made from it.</li>
            <li>Every change — edits, balance adjustments, bans, settings, even SQL queries — goes into the audit log with who made it and why.</li>
            <li>The audit log itself and the server’s secrets can’t be edited from here.</li>
            <li>With two-step sign-in required, a stolen password alone can’t open any staff tool.</li>
          </ul>
        </Panel>
      </div>
      {(who.owner || who.roles.includes('admin')) && <Staff who={who} />}
    </>
  );
}

function Staff({ who }: { who: WhoAmI }) {
  const qc = useQueryClient();
  const staff = useQuery({ queryKey: ['portal', 'players', 'staff'], queryFn: () => portal.players({ role: 'staff', limit: 200, sort: 'username', desc: false }) });
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const found = useQuery({ queryKey: ['portal', 'players', 'grant', dq], queryFn: () => portal.players({ q: dq, limit: 6 }), enabled: dq.length >= 2 });
  const toggle = async (id: string, role: string, on: boolean) => {
    try { await api.admin.setRole(id, role, on); toast.success(on ? `Gave the ${role} role` : `Took away the ${role} role`); void qc.invalidateQueries({ queryKey: ['portal', 'players'] }); }
    catch (e) { toast.error(toGameError(e).message); }
  };
  return (
    <Panel className="mt-3" title="Staff roles">
      <div className="mb-4 grid gap-1 text-sm text-muted sm:grid-cols-2 xl:grid-cols-3">{ROLES.map(([r, d]) => <div key={r}><b className="text-fg">{r}</b> — {d}</div>)}</div>
      <Q q={staff}>{(d) => (
        <div className="p-scroll">
          <table className="p-table">
            <thead><tr><th>Player</th><th>Last seen</th>{ROLES.map(([r]) => <th key={r} className="text-center">{r}</th>)}</tr></thead>
            <tbody>
              {d.rows.map((p: any) => (
                <tr key={p.id}>
                  <td><Link to={`/players/${p.id}`} className="flex items-center gap-2 hover:text-accent-2"><PlayerAvatar p={p} size={24} /><b>@{p.username}</b></Link></td>
                  <td className="text-muted">{ago(p.last_active_at)}</td>
                  {ROLES.map(([r]) => {
                    const has = p.roles.includes(r);
                    const locked = (r === 'owner' && !who.owner) || (p.id === who.user_id && (r === 'owner' || r === 'admin') && has);
                    return <td key={r} className="text-center"><input type="checkbox" aria-label={`${r} for @${p.username}`} checked={has} disabled={locked} onChange={(e) => void toggle(p.id, r, e.target.checked)} /></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}</Q>
      <div className="mt-4 max-w-md">
        <label className="p-label">Add someone to the staff</label>
        <input className="p-input mt-1 w-full" placeholder="Find a player by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        {found.data?.rows.map((p: any) => (
          <div key={p.id} className="mt-2 flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
            <PlayerAvatar p={p} size={24} /><b className="flex-1">@{p.username}</b>
            {['moderator', 'support', 'economy', 'payouts'].map((r) => <button key={r} disabled={p.roles.includes(r)} className={cn('p-chip', p.roles.includes(r) && 'on')} onClick={() => void toggle(p.id, r, true)}>{r}</button>)}
          </div>
        ))}
      </div>
    </Panel>
  );
}
