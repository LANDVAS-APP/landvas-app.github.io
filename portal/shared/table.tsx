// A data table: sticky header, sortable columns (on the server or here), clickable rows.
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '../../src/lib/utils';
import { Empty } from './ui';

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
