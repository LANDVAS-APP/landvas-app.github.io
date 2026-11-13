// Every player: search, filter by status or role, sort by anything, page through, export.
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button, PlayerAvatar } from '../../../src/ui';
import { portal } from '../../shared/api';
import { DataTable, type Col } from '../../shared/table';
import { ago, compact, date, downloadFile, int, toCsv, usd } from '../../shared/format';
import { Badge, ErrorBox, Loading, PageHeader, Pager, Panel, Seg, statusTone, useDebounced } from '../../shared/ui';

const STATUSES = ['all', 'active', 'suspended', 'banned'] as const;

export default function Players() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const status = sp.get('status') ?? 'all';
  const role = sp.get('role');
  const sort = sp.get('sort') ?? 'last_active_at';
  const desc = sp.get('dir') !== 'asc';
  const offset = Number(sp.get('o') ?? 0);
  const limit = Number(sp.get('n') ?? 50);
  const dq = useDebounced(q.trim(), 250);
  const set = (k: Record<string, string | null>) => {
    const n = new URLSearchParams(sp);
    for (const [a, b] of Object.entries(k)) if (b === null) n.delete(a); else n.set(a, b);
    if (!('o' in k)) n.delete('o');
    setSp(n, { replace: true });
  };
  const list = useQuery({
    queryKey: ['portal', 'players', dq, status, role, sort, desc, offset, limit],
    queryFn: () => portal.players({ q: dq, status: status === 'all' ? null : status, role, sort, desc, offset, limit }),
    placeholderData: keepPreviousData,
  });
  const cols: Col<any>[] = [
    { key: 'username', label: 'Player', sort: true, render: (r) => (
      <span className="flex min-w-[180px] items-center gap-2.5">
        <PlayerAvatar p={r} size={28} />
        <span className="min-w-0 leading-tight"><b className="block truncate">@{r.username}</b>{r.display_name && <span className="block truncate text-xs text-muted">{r.display_name}</span>}</span>
      </span>
    ) },
    { key: 'email', label: 'Email', render: (r) => <span className="text-muted">{r.email ?? '—'}</span> },
    { key: 'status', label: 'Status', sort: true, render: (r) => <span className="flex flex-wrap gap-1"><Badge tone={statusTone(r.status)}>{r.status}</Badge>{r.roles?.map((x: string) => <Badge key={x} tone="accent">{x}</Badge>)}{r.is_hidden && <Badge>hidden</Badge>}</span> },
    { key: 'plots', label: 'Plots', num: true, sort: true, render: (r) => int(r.plots) },
    { key: 'ink', label: 'Ink', num: true, sort: true, render: (r) => compact(r.ink) },
    { key: 'xp', label: 'XP', num: true, sort: true, render: (r) => compact(r.xp) },
    { key: 'usd', label: 'USD owed', num: true, sort: true, render: (r) => usd(r.usd) },
    { key: 'lifetime_usd', label: 'Lifetime USD', num: true, sort: true, render: (r) => usd(r.lifetime_usd) },
    { key: 'streak', label: 'Streak', num: true, sort: true, render: (r) => int(r.streak) },
    { key: 'strikes', label: 'Strikes', num: true, sort: true, render: (r) => (r.strikes ? <b className="text-bad">{r.strikes}</b> : '0') },
    { key: 'created_at', label: 'Joined', sort: true, render: (r) => date(r.created_at) },
    { key: 'last_active_at', label: 'Last seen', sort: true, render: (r) => ago(r.last_active_at) },
  ];
  const counts = list.data?.statuses ?? {};
  const all = Object.values(counts).reduce((a, b) => a + Number(b), 0);
  return (
    <>
      <PageHeader title="Players" sub="Everyone who has made a LANDVAS account. Click a player to see and change everything about them."
        actions={<Button size="sm" disabled={!list.data?.rows.length} onClick={() => downloadFile(`landvas-players-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(list.data!.rows.map(({ avatar_seed, avatar_style, accent_color, avatar_path, ...r }) => r)), 'text/csv')}><Download className="h-4 w-4" /> Export this page</Button>} />
      <Panel pad={false}>
        <div className="flex flex-wrap items-center gap-3 px-4 pt-4">
          <input className="p-input w-full max-w-sm" placeholder="Search name, email or id" value={q} onChange={(e) => { setQ(e.target.value); set({ q: e.target.value || null }); }} aria-label="Search players" data-testid="players-search" />
          <Seg label="Status" value={status} onChange={(v) => set({ status: v === 'all' ? null : v })}
            options={STATUSES.map((s) => ({ value: s, label: <>{s === 'all' ? 'Everyone' : s[0].toUpperCase() + s.slice(1)} <span className="tnum text-faint">{s === 'all' ? all : counts[s] ?? 0}</span></> }))} />
          <Seg label="Role" value={role ?? 'any'} onChange={(v) => set({ role: v === 'any' ? null : v })}
            options={[{ value: 'any', label: 'Any role' }, { value: 'staff', label: 'Staff' }, { value: 'owner', label: 'Owner' }, { value: 'moderator', label: 'Moderators' }]} />
          <select className="p-input ml-auto" value={limit} onChange={(e) => set({ n: e.target.value })} aria-label="Rows per page">
            {[25, 50, 100, 250, 500].map((n) => <option key={n} value={n}>{n} per page</option>)}
          </select>
        </div>
        <div className="mt-3">
          {list.error ? <div className="p-4"><ErrorBox error={list.error} retry={() => void list.refetch()} /></div> : !list.data ? <Loading /> : (
            <DataTable cols={cols} rows={list.data.rows} rowKey={(r) => r.id} onRow={(r) => nav(`/players/${r.id}`)} sort={sort} desc={desc}
              onSort={(k, d) => set({ sort: k, dir: d ? null : 'asc' })} maxHeight="calc(100vh - 290px)" />
          )}
        </div>
        {list.data && <div className="px-4 pb-3"><Pager offset={offset} limit={limit} total={list.data.total} onChange={(o) => set({ o: String(o) })} /></div>}
      </Panel>
    </>
  );
}
