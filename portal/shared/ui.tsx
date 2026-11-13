// Small building blocks for both portals (the game's own Button, Dialog, Switch etc. come from src/ui).
import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Copy, RefreshCw } from 'lucide-react';
import { cn } from '../../src/lib/utils';
import { toGameError } from '../../src/backend/backend';
import { rarityInfo } from '../../src/shared/rarity';
import { Button, Spinner } from '../../src/ui';
import { words } from './format';

export function PageHeader({ title, sub, actions, children }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="p-h1">{title}</h1>
        {sub && <p className="p-sub mt-1.5">{sub}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, actions, children, className, pad = true, id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean; id?: string }) {
  return (
    <section className={cn('p-panel min-w-0', className)} id={id}>
      {(title || actions) && (
        <div className="p-panel-head">
          {title && <h2 className="min-w-0 flex-1">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={pad ? 'p-panel-body' : 'pt-3'}>{children}</div>
    </section>
  );
}

/** a figure: label, value, optional context line */
export function Stat({ label, value, sub, className, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string; tone?: 'gold' | 'ok' | 'bad' | 'accent' }) {
  return (
    <div className={cn('p-panel px-4 py-3.5', className)}>
      <div className="p-label">{label}</div>
      <div className={cn('p-figure mt-1 break-words text-[22px]', tone === 'gold' && 'text-gold', tone === 'ok' && 'text-ok', tone === 'bad' && 'text-bad', tone === 'accent' && 'text-accent-2')}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'muted', className }: { children: ReactNode; tone?: 'muted' | 'ok' | 'warn' | 'bad' | 'accent' | 'gold'; className?: string }) {
  const t = {
    muted: 'border-line text-muted', ok: 'border-ok/40 text-ok bg-ok/10', warn: 'border-warn/40 text-warn bg-warn/10', bad: 'border-bad/40 text-bad bg-bad/10',
    accent: 'border-accent/50 text-fg bg-accent/15', gold: 'border-gold/40 text-gold bg-gold/10',
  }[tone];
  return <span className={cn('inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11.5px] font-semibold', t, className)}>{children}</span>;
}

export function statusTone(s: string | null | undefined): 'ok' | 'warn' | 'bad' | 'muted' {
  if (s === 'active' || s === 'paid' || s === 'published' || s === 'validated' || s === 'accepted' || s === 'approved') return 'ok';
  if (s === 'suspended' || s === 'requested' || s === 'pending' || s === 'held' || s === 'open' || s === 'flagged') return 'warn';
  if (s === 'banned' || s === 'rejected' || s === 'removed' || s === 'void' || s === 'failed' || s === 'declined') return 'bad';
  return 'muted';
}

export function KV({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-2 text-sm', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-2 xl:grid-cols-3')}>
      {items.map(([k, v], i) => (
        <div key={i} className="flex min-w-0 items-baseline justify-between gap-3 border-b border-line/60 pb-1.5">
          <dt className="shrink-0 text-muted">{k}</dt>
          <dd className="min-w-0 truncate text-right font-medium tnum" title={typeof v === 'string' ? v : undefined}>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Loading({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return <div className={cn('flex items-center justify-center gap-3 py-12 text-sm text-muted', className)}><Spinner /> {label}</div>;
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const e = toGameError(error);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-bad" />
      <span className="min-w-0 flex-1">{e.message}{e.code === 'forbidden' ? ' Your account doesn’t have the role this needs.' : ''}</span>
      {retry && <Button size="sm" variant="ghost" onClick={retry}><RefreshCw className="h-4 w-4" /> Try again</Button>}
    </div>
  );
}

/** a query's three states in one place */
export function Q<T>({ q, children, label }: { q: { data?: T; error: unknown; isLoading: boolean; refetch(): unknown }; children: (d: T) => ReactNode; label?: string }) {
  if (q.error && !q.data) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  if (q.data === undefined) return <Loading label={label} />;
  return <>{children(q.data)}</>;
}

/** shown instead of a page that crashed, so the rest of the portal keeps working */
export function RouteError() {
  return (
    <div className="mx-auto max-w-lg p-10">
      <h1 className="p-h1">This page hit a problem</h1>
      <p className="p-sub mt-2">Something on this page didn’t load the way it should. Your data is safe. Reload to try again, or go back to the start.</p>
      <div className="mt-4 flex gap-3"><Button size="sm" variant="primary" onClick={() => location.reload()}>Reload</Button><a className="text-sm text-accent-2 hover:underline" href="/">Back to the start</a></div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-5 py-8 text-center">
      <div className="font-semibold">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

/** a row of choices (time range, resource …) */
export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange(v: NoInfer<T>): void; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={cn('p-chip', o.value === value && 'on')} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Pager({ offset, limit, total, onChange, exact = true }: { offset: number; limit: number; total: number; onChange(o: number): void; exact?: boolean }) {
  const end = Math.min(offset + limit, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-3 text-xs text-muted">
      <span className="tnum">{total ? `${(offset + 1).toLocaleString()}–${end.toLocaleString()} of ${exact ? '' : 'about '}${total.toLocaleString()}` : 'No rows'}</span>
      <div className="flex gap-1.5">
        <Button size="sm" variant="ghost" disabled={offset <= 0} onClick={() => onChange(Math.max(0, offset - limit))}>Previous</Button>
        <Button size="sm" variant="ghost" disabled={end >= total} onClick={() => onChange(offset + limit)}>Next</Button>
      </div>
    </div>
  );
}

export function CopyText({ text, label, className }: { text: string; label?: ReactNode; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" title={`Copy ${text}`} className={cn('inline-flex min-w-0 items-center gap-1.5 text-left hover:text-fg', className)}
      onClick={() => { void navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); }}>
      <span className="min-w-0 truncate">{label ?? text}</span>
      {done ? <Check className="h-3.5 w-3.5 shrink-0 text-ok" /> : <Copy className="h-3.5 w-3.5 shrink-0 opacity-50" />}
    </button>
  );
}

/** a rarity: its square in the rarity's colour, and its name */
export function Rarity({ id, shiny, className }: { id: string; shiny?: boolean; className?: string }) {
  const r = rarityInfo(id);
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span className="p-plot" style={{ background: r.color }} />
      <span>{r.name || words(id)}{shiny ? ' ✦' : ''}</span>
    </span>
  );
}

/** pretty JSON with values coloured by type */
export function Json({ value, className, max = 400 }: { value: unknown; className?: string; max?: number }) {
  const text = JSON.stringify(value, null, 2) ?? 'null';
  const html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi, (m, s, colon, lit, n) =>
      s ? (colon ? `<span style="color:var(--muted)">${s}</span>${colon}` : `<span style="color:#9be7c4">${s}</span>`)
        : lit ? `<span style="color:#ffb3c7">${lit}</span>` : n ? `<span style="color:#9cc8ff">${n}</span>` : m);
  return <pre className={cn('p-mono p-scroll overflow-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-bg/60 p-3', className)} style={{ maxHeight: max }} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** a value from a table cell, shown compactly */
export function Cell({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <span className="text-faint">null</span>;
  if (typeof v === 'boolean') return <span className={v ? 'text-ok' : 'text-muted'}>{String(v)}</span>;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('__clip' in o) return <span className="text-muted" title={`${o.__clip} characters`}>{String(o.preview).slice(0, 80)}… <span className="text-faint">({Number(o.__clip).toLocaleString()} chars)</span></span>;
    const s = JSON.stringify(v);
    return <span className="p-mono text-muted">{s.length > 80 ? `${s.slice(0, 80)}…` : s}</span>;
  }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return <span title={s}>{new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: '2-digit', hour: 'numeric', minute: '2-digit' })}</span>;
  return <span title={s.length > 60 ? s : undefined}>{s.length > 80 ? `${s.slice(0, 80)}…` : s}</span>;
}

export function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/** a live number that ticks up between server reads (USD rent accrues every second) */
export function useTicker(base: number, perSecond: number, since: string | number | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const t0 = since ? new Date(since).getTime() : now;
  return base + Math.max(0, (now - t0) / 1000) * perSecond;
}
