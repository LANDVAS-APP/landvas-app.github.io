// A player's account and every row of their data, with a download of all of it.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, ExternalLink } from 'lucide-react';
import { getBackend, toGameError } from '../../../src/backend/backend';
import { Button, PlayerAvatar } from '../../../src/ui';
import { cn } from '../../../src/lib/utils';
import { portal } from '../../shared/api';
import { DataTable } from '../../shared/table';
import { date, dateTime, downloadFile, int, words } from '../../shared/format';
import { Badge, Cell, Empty, KV, PageHeader, Panel, Q, statusTone } from '../../shared/ui';

export function MyData() {
  const me = useOutletContext<any>();
  const tables = useQuery({ queryKey: ['me', 'tables'], queryFn: portal.meTables });
  const [sel, setSel] = useState<{ table: string; column: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const exportAll = async () => {
    if (!tables.data) return;
    const out: Record<string, unknown[]> = {};
    try {
      for (const t of tables.data) {
        setBusy(`${t.table}…`);
        const rows: unknown[] = [];
        for (let o = 0; o <= 250000; o += 1000) {
          const page = await portal.meRows(t.table, t.column, 1000, o, true);
          rows.push(...page.rows);
          if (page.rows.length < 1000) break;
        }
        out[['player_id', 'owner_id', 'id'].includes(t.column) ? t.table : `${t.table} (${t.column})`] = rows;
      }
      downloadFile(`my-landvas-data-${me.profile.username}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exported_at: new Date().toISOString(), player: me.profile.username, summary: me, tables: out }, null, 2));
      toast.success('Your data is downloading');
    } catch (e) { toast.error(toGameError(e).message); } finally { setBusy(null); }
  };
  return (
    <>
      <PageHeader title="All my data" sub="Every table in LANDVAS that holds something about you, row by row. Very long text, like drawings, is shortened here but kept in full in the download."
        actions={<Button size="sm" variant="primary" loading={!!busy} disabled={!tables.data} onClick={exportAll}><Download className="h-4 w-4" /> {busy ? `Collecting ${busy}` : 'Download everything'}</Button>} />
      <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Panel pad={false} className="xl:self-start">
          <Q q={tables}>{(list) => (
            <div className="p-scroll max-h-[70vh] p-2">
              {list.sort((a, b) => b.rows - a.rows).map((t) => {
                const on = sel?.table === t.table && sel?.column === t.column;
                return (
                  <button key={`${t.table}.${t.column}`} onClick={() => setSel({ table: t.table, column: t.column })} className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-2/60', on && 'bg-accent/15')}>
                    <span className="min-w-0 flex-1 truncate">{words(t.table)}{!['player_id', 'owner_id', 'id'].includes(t.column) && <span className="text-faint"> · as {words(t.column)}</span>}</span>
                    <span className="text-[11px] text-faint tnum">{t.rows >= 10000 ? '10K+' : int(t.rows)}</span>
                  </button>
                );
              })}
            </div>
          )}</Q>
        </Panel>
        {sel ? <Rows key={`${sel.table}.${sel.column}`} table={sel.table} column={sel.column} /> : <Empty title="Pick a table">Each one is a part of the game: your plots, ledgers, minigames, creatures and more.</Empty>}
      </div>
    </>
  );
}

function Rows({ table, column }: { table: string; column: string }) {
  const [offset, setOffset] = useState(0);
  const q = useQuery({ queryKey: ['me', 'rows', table, column, offset], queryFn: () => portal.meRows(table, column, 100, offset) });
  return (
    <Panel title={<span>{words(table)} <span className="p-mono text-xs font-normal text-faint">{table}</span></span>} pad={false}>
      <Q q={q}>{(d) => (
        <>
          <DataTable rows={d.rows} rowKey={(_, i) => String(offset + i)} maxHeight="calc(100vh - 280px)" dense
            cols={Object.keys(d.rows[0] ?? {}).map((k) => ({ key: k, label: k, sort: true, render: (r: any) => <Cell v={r[k]} /> }))} />
          <div className="flex items-center justify-between px-4 py-3 text-xs text-muted">
            <span className="tnum">{d.total ? `${offset + 1}–${offset + d.rows.length} of ${int(d.total)}` : 'No rows'}</span>
            <span className="flex gap-1.5"><Button size="sm" variant="ghost" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 100))}>Previous</Button><Button size="sm" variant="ghost" disabled={offset + d.rows.length >= d.total} onClick={() => setOffset(offset + 100)}>Next</Button></span>
          </div>
        </>
      )}</Q>
    </Panel>
  );
}

export function Account() {
  const me = useOutletContext<any>();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const pr = me.profile, pl = me.player;
  return (
    <>
      <PageHeader title="Account" />
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel>
          <div className="mb-4 flex items-center gap-3">
            <PlayerAvatar p={pr} size={56} />
            <div><div className="text-lg font-semibold">@{pr.username}</div>{pr.display_name && <div className="text-sm text-muted">{pr.display_name}</div>}</div>
            <Badge tone={statusTone(pl.status)} className="ml-auto">{pl.status}</Badge>
          </div>
          <KV cols={1} items={[
            ['Email', me.email], ['Player since', date(pl.created_at)], ['Last active', dateTime(pl.last_active_at)], ['Terms accepted', pl.terms_version ? `${pl.terms_version}, ${date(pl.terms_accepted_at)}` : '—'],
            ['Profile', pr.is_hidden ? 'hidden' : 'public'], ['Strikes', int(pl.strikes)], ...(me.roles?.length ? [['Staff roles', me.roles.join(', ')] as [string, string]] : []),
            ...(pl.suspended_until ? [['Suspended until', dateTime(pl.suspended_until)] as [string, string]] : []),
          ]} />
          {pr.bio && <p className="mt-3 text-sm text-muted">“{pr.bio}”</p>}
        </Panel>
        <div className="grid content-start gap-3">
          <Panel title="Change your password">
            <form className="flex flex-wrap gap-2" onSubmit={async (e) => {
              e.preventDefault(); setBusy(true);
              try { await getBackend().updatePassword?.(pw); setPw(''); toast.success('Password changed'); } catch (e2) { toast.error(toGameError(e2).message); } finally { setBusy(false); }
            }}>
              <input className="p-input min-w-56 flex-1" type="password" autoComplete="new-password" minLength={8} placeholder="New password (8+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="New password" />
              <Button type="submit" loading={busy} disabled={pw.length < 8}>Change password</Button>
            </form>
          </Panel>
          <Panel title="In the game">
            <div className="grid gap-2 text-sm">
              <a className="inline-flex items-center gap-1.5 text-accent-2 hover:underline" href="https://landvas.app/settings" target="_blank" rel="noopener">Profile, privacy and notification settings <ExternalLink className="h-3.5 w-3.5" /></a>
              <a className="inline-flex items-center gap-1.5 text-accent-2 hover:underline" href="https://landvas.app/support" target="_blank" rel="noopener">Contact support <ExternalLink className="h-3.5 w-3.5" /></a>
              <a className="inline-flex items-center gap-1.5 text-accent-2 hover:underline" href="https://landvas.app/legal/privacy" target="_blank" rel="noopener">Privacy policy <ExternalLink className="h-3.5 w-3.5" /></a>
              <a className="inline-flex items-center gap-1.5 text-muted hover:text-bad" href="https://landvas.app/legal/delete-account" target="_blank" rel="noopener">Delete your account <ExternalLink className="h-3.5 w-3.5" /></a>
            </div>
          </Panel>
          <Panel title="Sign out"><Button size="sm" variant="ghost" onClick={() => void getBackend().signOut()}>Sign out of this page</Button></Panel>
        </div>
      </div>
    </>
  );
}

