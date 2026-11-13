// The data explorer (owner only): every table in the database. Browse, filter, sort, open a row, edit it,
// add or delete rows. Every write needs a reason and goes into the audit log with the row before and after.
import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, KeyRound, Lock, Plus, Search, Trash2, X } from 'lucide-react';
import { toGameError } from '../../../src/backend/backend';
import { Button, Dialog, useConfirm } from '../../../src/ui';
import { cn } from '../../../src/lib/utils';
import { portal, type Filter, type TableInfo } from '../../shared/api';
import { DataTable, type Col } from '../../shared/table';
import { compact, downloadFile, int, toCsv } from '../../shared/format';
import { Badge, Cell, Empty, ErrorBox, Json, Loading, PageHeader, Pager, Panel, Q, useDebounced } from '../../shared/ui';

const OPS: { value: string; label: string; needs: boolean }[] = [
  { value: 'eq', label: 'is', needs: true }, { value: 'neq', label: 'is not', needs: true }, { value: 'like', label: 'contains', needs: true },
  { value: 'gt', label: '>', needs: true }, { value: 'gte', label: '≥', needs: true }, { value: 'lt', label: '<', needs: true }, { value: 'lte', label: '≤', needs: true },
  { value: 'in', label: 'is one of', needs: true }, { value: 'null', label: 'is empty', needs: false }, { value: 'notnull', label: 'is not empty', needs: false },
];
const bytes = (n: number) => (n > 1 << 30 ? `${(n / (1 << 30)).toFixed(1)} GB` : n > 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : n > 1024 ? `${Math.round(n / 1024)} kB` : `${n} B`);
const readOnly = (t: TableInfo) => t.sensitive || !['r', 'p'].includes(t.kind) || (t.schema === 'public' && t.name === 'audit_logs');

export default function Data() {
  const { schema, table } = useParams();
  const tables = useQuery({ queryKey: ['portal', 'tables'], queryFn: portal.tables, staleTime: 300_000 });
  const info = tables.data?.find((t) => t.schema === schema && t.name === table);
  return (
    <>
      <PageHeader title="Data explorer" sub="Every table in the LANDVAS database. Changes here skip the game’s own rules, so prefer the purpose-built tools (like Adjust balance) when there is one. Every change is recorded in the audit log." />
      <div className="grid gap-3 xl:grid-cols-[280px_minmax(0,1fr)]">
        <TableList tables={tables.data} error={tables.error} />
        {!schema ? <Empty title="Pick a table">Tables with a player’s id link back to that player, and keys that point at other tables are clickable.</Empty>
          : !tables.data ? <Loading /> : !info ? <ErrorBox error={new Error('unknown_table')} /> : <TableView key={`${schema}.${table}`} t={info} all={tables.data} />}
      </div>
    </>
  );
}

function TableList({ tables, error }: { tables?: TableInfo[]; error: unknown }) {
  const { schema, table } = useParams();
  const [q, setQ] = useState('');
  const [sch, setSch] = useState<'public' | 'private' | 'all'>('all');
  const list = (tables ?? []).filter((t) => (sch === 'all' || t.schema === sch) && t.name.includes(q.trim().toLowerCase()));
  return (
    <Panel pad={false} className="xl:sticky xl:top-[76px] xl:max-h-[calc(100vh-96px)] xl:overflow-hidden">
      <div className="grid gap-2 px-3 pt-3">
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><input className="p-input w-full pl-8" placeholder="Find a table" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a table" /></div>
        <div className="flex gap-1.5">{(['all', 'public', 'private'] as const).map((s) => <button key={s} className={cn('p-chip', sch === s && 'on')} onClick={() => setSch(s)}>{s === 'all' ? 'All' : s}</button>)}</div>
      </div>
      {error ? <div className="p-3"><ErrorBox error={error} /></div> : !tables ? <Loading /> : (
        <div className="p-scroll mt-2 max-h-[60vh] px-2 pb-3 xl:max-h-[calc(100vh-200px)]">
          {list.map((t) => {
            const on = t.schema === schema && t.name === table;
            return (
              <Link key={`${t.schema}.${t.name}`} to={`/data/${t.schema}/${t.name}`} className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface-2/60', on && 'bg-accent/15')}>
                <span className="min-w-0 flex-1 truncate">{t.schema === 'private' && <span className="text-faint">private.</span>}{t.name}</span>
                {t.sensitive && <Lock className="h-3 w-3 text-warn" />}
                <span className="shrink-0 text-[11px] text-faint tnum">{compact(t.rows)}</span>
              </Link>
            );
          })}
          {!list.length && <p className="p-2 text-sm text-muted">No tables match.</p>}
        </div>
      )}
    </Panel>
  );
}

function TableView({ t, all }: { t: TableInfo; all: TableInfo[] }) {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const filters: Filter[] = useMemo(() => { try { return JSON.parse(sp.get('f') || '[]'); } catch { return []; } }, [sp]);
  const sort = sp.get('sort');
  const desc = sp.get('dir') !== 'asc';
  const offset = Number(sp.get('o') ?? 0);
  const limit = Number(sp.get('n') ?? 50);
  const [open, setOpen] = useState<Record<string, unknown> | null>(null);
  const [adding, setAdding] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const set = (k: Record<string, string | null>) => {
    const n = new URLSearchParams(sp);
    for (const [a, b] of Object.entries(k)) if (b === null) n.delete(a); else n.set(a, b);
    if (!('o' in k)) n.delete('o');
    setSp(n, { replace: true });
  };
  const q = useQuery({
    queryKey: ['portal', 'rows', t.schema, t.name, filters, sort, desc, offset, limit],
    queryFn: () => portal.rows({ schema: t.schema, table: t.name, filters, sort, desc, offset, limit }),
    placeholderData: keepPreviousData,
  });
  // usernames next to player ids
  const playerCols = new Set(t.player_cols);
  for (const [c, fk] of Object.entries(t.fks)) if (['players', 'profiles', 'users'].includes(fk.table)) playerCols.add(c);
  const ids = useMemo(() => [...new Set((q.data?.rows ?? []).flatMap((r) => [...playerCols].map((c) => r[c]).filter((v) => typeof v === 'string')))] as string[], [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const names = useQuery({ queryKey: ['portal', 'names', ids], queryFn: () => portal.names(ids), enabled: ids.length > 0, staleTime: 600_000 });
  const cols: Col<any>[] = t.columns.filter((c) => !hidden.has(c.name)).map((c) => ({
    key: c.name,
    label: <span title={`${c.type}${c.comment ? ` — ${c.comment}` : ''}`} className="inline-flex items-center gap-1">{t.pk.includes(c.name) && <KeyRound className="h-3 w-3 text-gold" />}{c.name}</span>,
    sort: true,
    num: /^(integer|bigint|smallint|numeric|real|double)/.test(c.type),
    render: (r: any) => {
      const v = r[c.name];
      if (playerCols.has(c.name) && typeof v === 'string') return <Link onClick={(e) => e.stopPropagation()} to={`/players/${v}`} className="text-accent-2 hover:underline">{names.data?.[v] ? `@${names.data[v]}` : `${v.slice(0, 8)}…`}</Link>;
      const fk = t.fks[c.name];
      if (fk && v !== null && v !== undefined && all.some((x) => x.schema === fk.schema && x.name === fk.table)) {
        return <Link onClick={(e) => e.stopPropagation()} to={`/data/${fk.schema}/${fk.table}?f=${encodeURIComponent(JSON.stringify([{ col: fk.column, op: 'eq', value: v }]))}`} className="text-accent-2 hover:underline"><Cell v={v} /></Link>;
      }
      return <Cell v={v} />;
    },
  }));
  const pkOf = (r: any) => Object.fromEntries((q.data?.pk ?? t.pk).map((k) => [k, r[k]]));
  return (
    <div className="grid min-w-0 content-start gap-3">
      <Panel pad={false}>
        <div className="flex flex-wrap items-start gap-3 px-4 pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold"><span className="text-faint">{t.schema}.</span>{t.name}</h2>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              <span>about {int(t.rows)} rows</span><span>{bytes(t.bytes)}</span><span>{t.columns.length} columns</span>
              <span>key: {t.pk.length ? t.pk.join(', ') : 'none (read only)'}</span>
              {t.rls && <span>row-level security on</span>}
              {t.sensitive && <Badge tone="warn">values hidden</Badge>}
              {readOnly(t) && <Badge>read only</Badge>}
            </div>
            {t.comment && <p className="mt-1 text-sm text-muted">{t.comment}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <ColumnPicker t={t} hidden={hidden} setHidden={setHidden} />
            <Button size="sm" variant="ghost" disabled={!q.data?.rows.length} onClick={() => downloadFile(`${t.schema}.${t.name}.csv`, toCsv(q.data!.rows), 'text/csv')}><Download className="h-4 w-4" /> CSV</Button>
            {!readOnly(t) && <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add row</Button>}
          </div>
        </div>
        <Filters t={t} value={filters} onChange={(f) => set({ f: f.length ? JSON.stringify(f) : null })} />
        <div className="mt-2">
          {q.error ? <div className="p-4"><ErrorBox error={q.error} retry={() => void q.refetch()} /></div> : !q.data ? <Loading /> : (
            <DataTable rows={q.data.rows} cols={cols} rowKey={(r, i) => (t.pk.length ? JSON.stringify(pkOf(r)) : String(i))} onRow={t.pk.length ? (r) => setOpen(pkOf(r)) : undefined}
              sort={sort} desc={desc} onSort={(k, d) => set({ sort: k, dir: d ? null : 'asc' })} maxHeight="calc(100vh - 330px)" dense
              empty={<Empty title={filters.length ? 'No rows match these filters' : 'This table is empty'} />} />
          )}
        </div>
        {q.data && (
          <div className="flex flex-wrap items-center gap-3 px-4 pb-3">
            <div className="flex-1"><Pager offset={offset} limit={limit} total={q.data.total} exact={q.data.exact} onChange={(o) => set({ o: String(o) })} /></div>
            <select className="p-input mt-3" value={limit} onChange={(e) => set({ n: e.target.value })} aria-label="Rows per page">{[25, 50, 100, 200, 500].map((n) => <option key={n} value={n}>{n} per page</option>)}</select>
          </div>
        )}
      </Panel>
      {open && <RowDialog t={t} pk={open} onClose={() => setOpen(null)} onChanged={() => void qc.invalidateQueries({ queryKey: ['portal', 'rows', t.schema, t.name] })} nav={nav} />}
      {adding && <InsertDialog t={t} onClose={() => setAdding(false)} onDone={() => { setAdding(false); void qc.invalidateQueries({ queryKey: ['portal', 'rows', t.schema, t.name] }); }} />}
    </div>
  );
}

function ColumnPicker({ t, hidden, setHidden }: { t: TableInfo; hidden: Set<string>; setHidden(s: Set<string>): void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button size="sm" variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>Columns {hidden.size ? `(${t.columns.length - hidden.size}/${t.columns.length})` : ''}</Button>
      {open && (
        <div className="absolute right-0 top-10 z-20 max-h-80 w-64 overflow-auto rounded-xl border border-line-strong bg-[rgba(10,15,38,0.98)] p-2 shadow-2xl">
          {t.columns.map((c) => (
            <label key={c.name} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-surface-2/60">
              <input type="checkbox" checked={!hidden.has(c.name)} onChange={(e) => { const n = new Set(hidden); if (e.target.checked) n.delete(c.name); else n.add(c.name); setHidden(n); }} />
              <span className="min-w-0 flex-1 truncate">{c.name}</span><span className="text-[11px] text-faint">{c.type.split(' ')[0]}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Filters({ t, value, onChange }: { t: TableInfo; value: Filter[]; onChange(f: Filter[]): void }) {
  const [draft, setDraft] = useState<Filter[]>(value);
  useEffect(() => setDraft(value), [value]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  const upd = (i: number, p: Partial<Filter>) => setDraft(draft.map((f, k) => (k === i ? { ...f, ...p } : f)));
  return (
    <form className="grid gap-2 px-4 pt-3" onSubmit={(e) => { e.preventDefault(); onChange(draft.map((f) => (f.op === 'in' && typeof f.value === 'string' ? { ...f, value: f.value.split(',').map((s) => s.trim()).filter(Boolean) } : f))); }}>
      {draft.map((f, i) => {
        const op = OPS.find((o) => o.value === f.op);
        return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select className="p-input" value={f.col} onChange={(e) => upd(i, { col: e.target.value })} aria-label="Column">{t.columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</select>
            <select className="p-input" value={f.op} onChange={(e) => upd(i, { op: e.target.value })} aria-label="Condition">{OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            {op?.needs && <input className="p-input min-w-48 flex-1" value={Array.isArray(f.value) ? f.value.join(', ') : String(f.value ?? '')} placeholder={f.op === 'in' ? 'a, b, c' : 'value'} onChange={(e) => upd(i, { value: e.target.value })} aria-label="Value" />}
            <button type="button" className="rounded-lg p-1.5 text-muted hover:text-fg" onClick={() => setDraft(draft.filter((_, k) => k !== i))} aria-label="Remove filter"><X className="h-4 w-4" /></button>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" type="button" onClick={() => setDraft([...draft, { col: t.columns[0]?.name ?? '', op: 'eq', value: '' }])}><Plus className="h-4 w-4" /> Filter</Button>
        {(dirty || value.length > 0) && <Button size="sm" type="submit" variant={dirty ? 'primary' : 'secondary'}>Apply filters</Button>}
        {value.length > 0 && <Button size="sm" variant="ghost" type="button" onClick={() => onChange([])}>Clear filters</Button>}
      </div>
    </form>
  );
}

/** what the editor shows for a value, and what it sends back */
const isJsonish = (type: string) => /json|\[\]$/.test(type);
const toText = (v: unknown, type: string) => (v === null || v === undefined ? '' : isJsonish(type) ? JSON.stringify(v, null, 2) : typeof v === 'object' ? JSON.stringify(v) : String(v));
function fromText(s: string, type: string): unknown {
  if (isJsonish(type)) return JSON.parse(s);
  if (type === 'boolean') return s === 'true';
  return s;
}

function Editor({ t, values, onChange, nulls, setNulls, isNew }: { t: TableInfo; values: Record<string, string>; onChange(k: string, v: string): void; nulls: Set<string>; setNulls(s: Set<string>): void; isNew?: boolean }) {
  return (
    <div className="grid gap-3">
      {t.columns.map((c) => {
        const locked = c.generated || (!isNew && t.pk.includes(c.name));
        const big = isJsonish(c.type) || c.type === 'text';
        const isNull = nulls.has(c.name);
        return (
          <label key={c.name} className="grid gap-1">
            <span className="flex flex-wrap items-center gap-2 text-xs">
              <b className="text-fg">{c.name}</b><span className="p-mono text-faint">{c.type}</span>
              {t.pk.includes(c.name) && <Badge tone="gold">key</Badge>}{c.generated && <Badge>automatic</Badge>}
              {isNew && c.default && <span className="text-faint">default {c.default.slice(0, 40)}</span>}
              {c.nullable && !locked && (
                <span className="ml-auto inline-flex items-center gap-1 text-muted"><input type="checkbox" checked={isNull} onChange={(e) => { const n = new Set(nulls); if (e.target.checked) n.add(c.name); else n.delete(c.name); setNulls(n); }} /> null</span>
              )}
            </span>
            {c.type === 'boolean' ? (
              <select className="p-input" disabled={locked || isNull} value={values[c.name] ?? ''} onChange={(e) => onChange(c.name, e.target.value)}><option value="">{isNew ? '(default)' : '—'}</option><option value="true">true</option><option value="false">false</option></select>
            ) : big ? (
              <textarea className="p-input p-mono" rows={isJsonish(c.type) ? Math.min(12, Math.max(2, (values[c.name] ?? '').split('\n').length)) : 2} disabled={locked || isNull} value={isNull ? '' : values[c.name] ?? ''} placeholder={isNew ? '(default)' : ''} onChange={(e) => onChange(c.name, e.target.value)} />
            ) : (
              <input className="p-input p-mono" disabled={locked || isNull} value={isNull ? '' : values[c.name] ?? ''} placeholder={isNew ? '(default)' : ''} onChange={(e) => onChange(c.name, e.target.value)} />
            )}
          </label>
        );
      })}
    </div>
  );
}

function RowDialog({ t, pk, onClose, onChanged, nav }: { t: TableInfo; pk: Record<string, unknown>; onClose(): void; onChanged(): void; nav: ReturnType<typeof useNavigate> }) {
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['portal', 'row', t.schema, t.name, pk], queryFn: () => portal.row(t.schema, t.name, pk) });
  const [edit, setEdit] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [nulls, setNulls] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const start = () => {
    const r = q.data ?? {};
    setValues(Object.fromEntries(t.columns.map((c) => [c.name, toText(r[c.name], c.type)])));
    setNulls(new Set(t.columns.filter((c) => r[c.name] === null).map((c) => c.name)));
    setEdit(true);
  };
  const save = async () => {
    const r = q.data ?? {};
    const patch: Record<string, unknown> = {};
    try {
      for (const c of t.columns) {
        if (c.generated || t.pk.includes(c.name)) continue;
        if (nulls.has(c.name)) { if (r[c.name] !== null) patch[c.name] = null; continue; }
        const before = toText(r[c.name], c.type);
        if (values[c.name] !== before || r[c.name] === null) {
          if (r[c.name] === null && values[c.name] === '') continue;
          patch[c.name] = fromText(values[c.name], c.type);
        }
      }
    } catch { toast.error('One of the JSON values isn’t valid JSON.'); return; }
    if (!Object.keys(patch).length) { toast('Nothing changed'); return; }
    setBusy(true);
    try { await portal.rowUpdate(t.schema, t.name, pk, patch, reason); toast.success('Row saved — recorded in the audit log'); setEdit(false); void q.refetch(); onChanged(); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!(await confirm({ title: 'Delete this row?', body: 'Anything that depends on it through a cascading key is deleted too. The whole row is kept in the audit log.', confirm: 'Delete', danger: true }))) return;
    setBusy(true);
    try { await portal.rowDelete(t.schema, t.name, pk, reason); toast.success('Row deleted — recorded in the audit log'); onChanged(); onClose(); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  const ro = readOnly(t);
  const playerCol = t.player_cols.find((c) => typeof q.data?.[c] === 'string');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} wide title={`${t.name} row`} description={<span className="p-mono">{JSON.stringify(pk)}</span>}
      footer={!ro && q.data ? (edit ? (
        <>
          <input className="p-input min-w-56 flex-1" placeholder="Why (required, kept in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
          <Button variant="ghost" onClick={() => setEdit(false)}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={reason.trim().length < 4} onClick={save}>Save changes</Button>
        </>
      ) : (
        <>
          <input className="p-input min-w-56 flex-1" placeholder="Reason, to delete" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
          <Button variant="danger" loading={busy} disabled={reason.trim().length < 4} onClick={del}><Trash2 className="h-4 w-4" /> Delete</Button>
          <Button variant="primary" onClick={start}>Edit</Button>
        </>
      )) : undefined}>
      <Q q={q}>{(row) => (
        edit ? <Editor t={t} values={values} onChange={(k, v) => setValues({ ...values, [k]: v })} nulls={nulls} setNulls={setNulls} /> : (
          <div className="grid gap-3">
            {playerCol && <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => { onClose(); nav(`/players/${row[playerCol]}`); }}>Open this player</Button>}
            <div className="p-scroll max-h-[55vh] rounded-xl border border-line">
              <table className="p-table">
                <tbody>
                  {t.columns.map((c) => (
                    <tr key={c.name}>
                      <td className="w-44 align-top"><b>{c.name}</b><div className="p-mono text-[11px] text-faint">{c.type}</div></td>
                      <td>{row[c.name] !== null && typeof row[c.name] === 'object' ? <Json value={row[c.name]} max={260} /> : <span className="break-all">{row[c.name] === null ? <span className="text-faint">null</span> : String(row[c.name])}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}</Q>
    </Dialog>
  );
}

function InsertDialog({ t, onClose, onDone }: { t: TableInfo; onClose(): void; onDone(): void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [nulls, setNulls] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const row: Record<string, unknown> = {};
    try {
      for (const c of t.columns) {
        if (c.generated) continue;
        if (nulls.has(c.name)) row[c.name] = null;
        else if ((values[c.name] ?? '') !== '') row[c.name] = fromText(values[c.name], c.type);
      }
    } catch { toast.error('One of the JSON values isn’t valid JSON.'); return; }
    setBusy(true);
    try { await portal.rowInsert(t.schema, t.name, row, reason); toast.success('Row added — recorded in the audit log'); onDone(); }
    catch (e) { toast.error(toGameError(e).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} wide title={`Add a row to ${t.name}`} description="Leave a field empty to use the column’s default."
      footer={<>
        <input className="p-input min-w-56 flex-1" placeholder="Why (required, kept in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} disabled={reason.trim().length < 4} onClick={add}>Add row</Button>
      </>}>
      <Editor t={t} values={values} onChange={(k, v) => setValues({ ...values, [k]: v })} nulls={nulls} setNulls={setNulls} isNew />
    </Dialog>
  );
}
