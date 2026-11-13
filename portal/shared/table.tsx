// A data table: sticky header, sortable columns (on the server or here), clickable rows.
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '../../src/lib/utils';
import { Empty, useIsPhone } from './ui';

export type Col<T> = {
  key: string;
  label: ReactNode;
  render?: (r: T, i: number) => ReactNode;
  /** a number column: right-aligned */
  num?: boolean;
  /** sortable (true = by `key`; a function = by its value) */
  sort?: boolean | ((r: T) => number | string | null | undefined);
  className?: string;
  title?: string;
  /** leave this column out of the phone cards (it repeats something the card already shows) */
  hideOnPhone?: boolean;
};

export function DataTable<T>({ cols, rows, rowKey, onRow, sort, desc, onSort, empty, maxHeight, selected, dense, className }: {
  cols: Col<T>[];
  rows: T[];
  rowKey: (r: T, i: number) => string;
  onRow?: (r: T) => void;
  /** server-side sorting: the current column and direction, and a handler */
  sort?: string | null;
  desc?: boolean;
  onSort?: (key: string, desc: boolean) => void;
  empty?: ReactNode;
  maxHeight?: number | string;
  selected?: string | null;
  dense?: boolean;
  className?: string;
}) {
  const [local, setLocal] = useState<{ key: string; desc: boolean } | null>(null);
  const phone = useIsPhone();
  const sorted = useMemo(() => {
    if (onSort || !local) return rows;
    const col = cols.find((c) => c.key === local.key);
    if (!col) return rows;
    const get = typeof col.sort === 'function' ? col.sort : (r: T) => (r as any)[col.key];
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return local.desc ? -c : c;
    });
  }, [rows, local, cols, onSort]);
  const cur = onSort ? (sort ? { key: sort, desc: !!desc } : null) : local;
  const click = (c: Col<T>) => {
    const next = { key: c.key, desc: cur?.key === c.key ? !cur.desc : !!c.num };
    if (onSort) onSort(next.key, next.desc); else setLocal(next);
  };
  if (!rows.length) return <div className="p-3">{empty ?? <Empty title="Nothing here yet" />}</div>;
  if (phone) {
    // phones: each row is a card — the first column as its title, the rest as label/value pairs
    const [head, ...rest] = cols.filter((c) => !c.hideOnPhone);
    const sortable = cols.filter((c) => c.sort);
    return (
      <div className={cn('grid gap-2 px-3 pb-2', className)}>
        {sortable.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted">
            Sort by
            <select className="p-input h-9 flex-1" value={cur ? `${cur.key}:${cur.desc ? 'd' : 'a'}` : ''} onChange={(e) => {
              const [k, d] = e.target.value.split(':');
              if (!k) return;
              if (onSort) onSort(k, d === 'd'); else setLocal({ key: k, desc: d === 'd' });
            }}>
              {!cur && <option value="">—</option>}
              {sortable.flatMap((c) => [
                <option key={`${c.key}:d`} value={`${c.key}:d`}>{typeof c.label === 'string' ? c.label : c.key} {c.num ? '(high to low)' : '(Z to A)'}</option>,
                <option key={`${c.key}:a`} value={`${c.key}:a`}>{typeof c.label === 'string' ? c.label : c.key} {c.num ? '(low to high)' : '(A to Z)'}</option>,
              ])}
            </select>
          </label>
        )}
        {sorted.map((r, i) => {
          const k = rowKey(r, i);
          return (
            <div key={k} role={onRow ? 'button' : undefined} tabIndex={onRow ? 0 : undefined} onClick={onRow ? () => onRow(r) : undefined}
              onKeyDown={onRow ? (e) => { if (e.key === 'Enter') onRow(r); } : undefined}
              className={cn('block w-full rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-left text-[13px]', onRow && 'active:bg-accent/10', selected === k && 'border-accent/60')}>
              {head && <div className="mb-1.5 min-w-0 text-sm font-semibold">{head.render ? head.render(r, i) : String((r as any)[head.key] ?? '—')}</div>}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                {rest.map((c) => {
                  const v = c.render ? c.render(r, i) : String((r as any)[c.key] ?? '—');
                  if (!c.label) return <div key={c.key} className="col-span-2">{v}</div>;
                  return (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-[11px] text-faint">{c.label}</dt>
                      <dd className="min-w-0 break-words tnum">{v}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className={cn('p-scroll', className)} style={{ maxHeight }}>
      <table className={cn('p-table', dense && 'nowrap')}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={cn(c.num && 'num', c.className)} title={c.title} aria-sort={cur?.key === c.key ? (cur.desc ? 'descending' : 'ascending') : undefined}>
                {c.sort ? (
                  <button type="button" onClick={() => click(c)}>
                    {c.label}
                    {cur?.key === c.key ? (cur.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                  </button>
                ) : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const k = rowKey(r, i);
            return (
              <tr key={k} className={cn(onRow && 'click', selected === k && 'sel')} onClick={onRow ? () => onRow(r) : undefined}
                tabIndex={onRow ? 0 : undefined} onKeyDown={onRow ? (e) => { if (e.key === 'Enter') onRow(r); } : undefined}>
                {cols.map((c) => (
                  <td key={c.key} className={cn(c.num && 'num', dense && '!py-1', c.className)}>{c.render ? c.render(r, i) : String((r as any)[c.key] ?? '—')}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
