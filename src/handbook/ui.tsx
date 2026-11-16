// The Handbook's building blocks: a topic card, a framed figure, numbered steps, fact tiles, tables and callouts.
// Every topic in every chapter is written with these, so the whole book reads (and looks) the same.
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

export function P({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('hb-p', className)}>{children}</p>;
}
/** a bold, coloured number or name inside a sentence */
export function B({ children, c }: { children: ReactNode; c?: string }) {
  return <b className="hb-b" style={c ? { color: c } : undefined}>{children}</b>;
}
export function H({ children }: { children: ReactNode }) {
  return <h4 className="hb-h">{children}</h4>;
}

/** a framed illustration with a caption underneath */
export function Figure({ children, caption, className, tone = 'night' }: { children: ReactNode; caption?: ReactNode; className?: string; tone?: 'night' | 'plain' }) {
  return (
    <figure className={cn('hb-fig', tone === 'plain' && 'plain', className)}>
      <div className="hb-fig-in">{children}</div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="hb-steps">
      {items.map((x, i) => <li key={i}><span className="n">{i + 1}</span><div>{x}</div></li>)}
    </ol>
  );
}

export function Bullets({ items, className }: { items: ReactNode[]; className?: string }) {
  return <ul className={cn('hb-list', className)}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

export type Fact = { k: string; v: ReactNode; hint?: ReactNode; c?: string };
export function Facts({ items, cols = 3 }: { items: (Fact | false | null | undefined)[]; cols?: 2 | 3 | 4 }) {
  return (
    <div className={cn('hb-facts', cols === 2 ? 'c2' : cols === 4 ? 'c4' : 'c3')}>
      {items.filter(Boolean).map((f) => {
        const x = f as Fact;
        return (
          <div key={x.k} className="hb-fact">
            <div className="k">{x.k}</div>
            <div className="v" style={x.c ? { color: x.c } : undefined}>{x.v}</div>
            {x.hint && <div className="h">{x.hint}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function Table({ head, rows, note, dense }: { head: ReactNode[]; rows: ReactNode[][]; note?: ReactNode; dense?: boolean }) {
  return (
    <div className="hb-table-wrap">
      <table className={cn('hb-table', dense && 'dense')}>
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
      {note && <p className="hb-note">{note}</p>}
    </div>
  );
}

type CalloutKind = 'tip' | 'pro' | 'warn' | 'combo' | 'note';
const CALLOUT: Record<CalloutKind, { icon: string; label: string }> = {
  tip: { icon: '💡', label: 'Tip' },
  pro: { icon: '🧠', label: 'Pro move' },
  warn: { icon: '⚠️', label: 'Watch out' },
  combo: { icon: '🔗', label: 'Combo' },
  note: { icon: '📌', label: 'Good to know' },
};
export function Callout({ kind = 'tip', title, children }: { kind?: CalloutKind; title?: ReactNode; children: ReactNode }) {
  const c = CALLOUT[kind];
  return (
    <aside className={cn('hb-callout', kind)}>
      <span className="i" aria-hidden>{c.icon}</span>
      <div><b className="hb-callout-l">{title ?? c.label}</b><div className="t">{children}</div></div>
    </aside>
  );
}
export const Tip = (p: { title?: ReactNode; children: ReactNode }) => <Callout kind="tip" {...p} />;
export const Pro = (p: { title?: ReactNode; children: ReactNode }) => <Callout kind="pro" {...p} />;
export const Warn = (p: { title?: ReactNode; children: ReactNode }) => <Callout kind="warn" {...p} />;
export const Combo = (p: { title?: ReactNode; children: ReactNode }) => <Callout kind="combo" {...p} />;
export const Note = (p: { title?: ReactNode; children: ReactNode }) => <Callout kind="note" {...p} />;

/** a link into the game: "Open the map →" */
export function Go({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="hb-go" data-testid={`hb-go-${to}`}>{children}<ChevronRight className="h-3.5 w-3.5" /></Link>;
}
export function GoRow({ links }: { links: [string, ReactNode][] }) {
  return <div className="hb-gorow">{links.map(([to, t]) => <Go key={to} to={to}>{t}</Go>)}</div>;
}

/** a row of little labelled chips (e.g. what a thing unlocks) */
export function Chips({ items, c }: { items: ReactNode[]; c?: string }) {
  return <div className="hb-chips">{items.map((x, i) => <span key={i} style={c ? { borderColor: `${c}66`, background: `${c}1a` } : undefined}>{x}</span>)}</div>;
}

/** cards in a responsive grid: a picture, a name, a line */
export function CardGrid({ items, cols = 2 }: { items: { key: string; art?: ReactNode; title: ReactNode; sub?: ReactNode; body?: ReactNode; c?: string }[]; cols?: 2 | 3 }) {
  return (
    <div className={cn('hb-cards', cols === 3 && 'c3')}>
      {items.map((x) => (
        <div key={x.key} className="hb-card" style={x.c ? { ['--c' as string]: x.c } : undefined}>
          {x.art && <div className="art">{x.art}</div>}
          <div className="min-w-0">
            <div className="t">{x.title}</div>
            {x.sub && <div className="s">{x.sub}</div>}
            {x.body && <div className="b">{x.body}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** a formula, written out: Ink = level Ink × rarity bonus */
export function Formula({ children }: { children: ReactNode }) {
  return <div className="hb-formula">{children}</div>;
}
