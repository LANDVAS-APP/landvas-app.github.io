// Charts for the portal, drawn as SVG. Follows the dataviz method: categorical colours in a fixed order
// (validated against the portal surface), 2px lines, bars ≤ 24px with a 4px rounded end, a 2px surface gap
// between stacked segments, hairline grid, a legend for 2+ series, a crosshair tooltip, and a table view.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../src/lib/utils';
import { dateShort } from './format';

export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)'];

export type Series = { name: string; values: number[]; color?: string };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setW(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** round tick values from 0 to a little above the max */
export function niceTicks(max: number, count = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.999; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}
const tickFmt = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${+(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${+(v / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${+(v / 1e3).toFixed(0)}K`;
  if (a >= 1) return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (a === 0) return '0';
  return v.toPrecision(2);
};

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {series.map((s, i) => (
        <span key={s.name} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color ?? SERIES[i % 8] }} />{s.name}</span>
      ))}
    </div>
  );
}

function TableView({ x, series, format, xFormat }: { x: string[]; series: Series[]; format(v: number): string; xFormat(v: string): string }) {
  return (
    <div className="p-scroll max-h-72 rounded-xl border border-line">
      <table className="p-table">
        <thead><tr><th>Date</th>{series.map((s) => <th key={s.name} className="num">{s.name}</th>)}</tr></thead>
        <tbody>{x.map((d, i) => <tr key={d}><td>{xFormat(d)}</td>{series.map((s) => <td key={s.name} className="num">{format(s.values[i] ?? 0)}</td>)}</tr>).reverse()}</tbody>
      </table>
    </div>
  );
}

/** values over days: lines, areas, columns or stacked columns, with a crosshair tooltip */
export function TimeChart({ x, series, type = 'line', height = 220, format = (v) => v.toLocaleString('en-US'), xFormat = dateShort, className, footer, title }: {
  x: string[]; series: Series[]; type?: 'line' | 'area' | 'bar' | 'stack'; height?: number; format?: (v: number) => string; xFormat?: (v: string) => string; className?: string; footer?: ReactNode; title?: string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const n = x.length;
  const stacked = type === 'stack';
  const max = useMemo(() => {
    if (stacked) return Math.max(0, ...x.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0)));
    return Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  }, [x, series, stacked]);
  const ticks = niceTicks(max);
  const M = { l: Math.max(30, 12 + 6.6 * Math.max(...ticks.map((t) => tickFmt(t).length))), r: 10, t: 8, b: 24 };
  const iw = Math.max(10, w - M.l - M.r), ih = height - M.t - M.b;
  const top = ticks[ticks.length - 1] || 1;
  const y = (v: number) => M.t + ih - (Math.max(0, v) / top) * ih;
  const bars = type === 'bar' || type === 'stack';
  const band = iw / Math.max(1, n);
  const xc = (i: number) => (bars ? M.l + band * (i + 0.5) : M.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw));
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
  const color = (i: number) => series[i].color ?? SERIES[i % 8];
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = bars ? Math.floor(px / band) : Math.round((px / Math.max(1, iw)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const bw = Math.max(2, Math.min(24, band * (stacked ? 0.66 : 0.66 / (type === 'bar' ? series.length : 1))));
  return (
    <div className={cn('viz relative', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">{title && <div className="mb-1 text-sm font-semibold">{title}</div>}<Legend series={series} /></div>
        <button type="button" className={cn('p-chip !h-6 !px-2 !text-[11px]', table && 'on')} onClick={() => setTable(!table)} aria-pressed={table}>Table</button>
      </div>
      {table ? <TableView x={x} series={series} format={format} xFormat={xFormat} /> : (
        <div ref={ref} className="relative" style={{ height }}>
          {w > 0 && (
            <svg width={w} height={height} role="img" aria-label={`${title ?? 'Chart'}: ${series.map((s) => s.name).join(', ')} by day`}>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={M.l} x2={M.l + iw} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth={1} />
                  <text x={M.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--viz-axis)">{tickFmt(t)}</text>
                </g>
              ))}
              {x.map((d, i) => (i % every === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= every * 0.6) ? (
                <text key={d} x={xc(i)} y={height - 6} textAnchor={i === 0 && !bars ? 'start' : i === n - 1 && !bars ? 'end' : 'middle'} fontSize={11} fill="var(--viz-axis)">{xFormat(d)}</text>
              ) : null)}
              {bars && x.map((_, i) => {
                let base = 0;
                return series.map((s, k) => {
                  const v = Math.max(0, s.values[i] ?? 0);
                  if (!v) return null;
                  if (stacked) {
                    const y0 = y(base), y1 = y(base + v);
                    base += v;
                    const isTop = series.slice(k + 1).every((t) => !(t.values[i] > 0));
                    const h = Math.max(1, y0 - y1 - (base - v > 0 ? 2 : 0));
                    return <BarRect key={k} x={xc(i) - bw / 2} y={y1} w={bw} h={h} r={isTop ? 4 : 0} fill={color(k)} dim={hover !== null && hover !== i} />;
                  }
                  const off = (k - (series.length - 1) / 2) * (bw + 2);
                  return <BarRect key={k} x={xc(i) + off - bw / 2} y={y(v)} w={bw} h={Math.max(1, y(0) - y(v))} r={4} fill={color(k)} dim={hover !== null && hover !== i} />;
                });
              })}
              {!bars && series.map((s, k) => {
                const pts = s.values.map((v, i) => `${xc(i)},${y(v ?? 0)}`).join(' ');
                return (
                  <g key={s.name}>
                    {type === 'area' && <polygon points={`${xc(0)},${y(0)} ${pts} ${xc(n - 1)},${y(0)}`} fill={color(k)} opacity={0.1} />}
                    <polyline points={pts} fill="none" stroke={color(k)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    {n > 0 && <circle cx={xc(n - 1)} cy={y(s.values[n - 1] ?? 0)} r={4} fill={color(k)} stroke="var(--viz-surface)" strokeWidth={2} />}
                  </g>
                );
              })}
              {hover !== null && !bars && (
                <g>
                  <line x1={xc(hover)} x2={xc(hover)} y1={M.t} y2={M.t + ih} stroke="var(--line-strong)" strokeWidth={1} />
                  {series.map((s, k) => <circle key={s.name} cx={xc(hover)} cy={y(s.values[hover] ?? 0)} r={4.5} fill={color(k)} stroke="var(--viz-surface)" strokeWidth={2} />)}
                </g>
              )}
              <rect x={M.l} y={M.t} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
            </svg>
          )}
          {hover !== null && w > 0 && (
            <div className="viz-tip" style={{ left: Math.min(Math.max(0, xc(hover) + 12), w - 170), top: 4 }}>
              <div className="mb-1 font-semibold">{xFormat(x[hover])}</div>
              {series.map((s, k) => (
                <div key={s.name} className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-[2px]" style={{ background: color(k) }} />{s.name}</span>
                  <span className="font-semibold">{format(s.values[hover] ?? 0)}</span>
                </div>
              ))}
              {stacked && series.length > 1 && <div className="mt-1 flex justify-between border-t border-line pt-1 text-muted"><span>Total</span><span className="font-semibold text-fg">{format(series.reduce((a, s) => a + (s.values[hover] ?? 0), 0))}</span></div>}
            </div>
          )}
        </div>
      )}
      {footer}
    </div>
  );
}

function BarRect({ x, y, w, h, r, fill, dim }: { x: number; y: number; w: number; h: number; r: number; fill: string; dim?: boolean }) {
  const rr = Math.min(r, w / 2, h);
  const d = rr > 0
    ? `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
    : `M${x},${y} h${w} v${h} h${-w} Z`;
  return <path d={d} fill={fill} opacity={dim ? 0.45 : 1} />;
}

/** a ranked list as horizontal bars: label, bar, value */
export function HBars({ items, format = (v) => v.toLocaleString('en-US'), max: maxIn, onPick, className }: {
  items: { key?: string; label: ReactNode; value: number; color?: string; note?: ReactNode }[]; format?: (v: number) => string; max?: number; onPick?: (key: string) => void; className?: string;
}) {
  const max = maxIn ?? Math.max(1e-12, ...items.map((i) => Math.abs(i.value)));
  return (
    <div className={cn('viz grid gap-1.5', className)}>
      {items.map((it, i) => {
        const pctW = Math.max(0.5, (Math.abs(it.value) / max) * 100);
        const Row = onPick && it.key ? 'button' : 'div';
        return (
          <Row key={it.key ?? i} type={Row === 'button' ? 'button' : undefined} onClick={onPick && it.key ? () => onPick(it.key!) : undefined}
            className={cn('grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-1 py-0.5 text-left text-[13px]', Row === 'button' && 'hover:bg-surface-2/60')}>
            <span className="truncate text-muted" title={typeof it.label === 'string' ? it.label : undefined}>{it.label}</span>
            <span className="h-2.5 rounded-r-[4px]" style={{ width: `${pctW}%`, background: it.color ?? SERIES[0] }} />
            <span className="text-right font-semibold tnum">{format(it.value)}{it.note && <span className="ml-1.5 font-normal text-faint">{it.note}</span>}</span>
          </Row>
        );
      })}
    </div>
  );
}

/** one whole split into parts (a single thin bar with a legend) */
export function Split({ parts, format = (v) => v.toLocaleString('en-US') }: { parts: { label: string; value: number; color?: string }[]; format?: (v: number) => string }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  return (
    <div className="viz">
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[4px]">
        {parts.filter((p) => p.value > 0).map((p, i) => <div key={p.label} title={`${p.label}: ${format(p.value)}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color ?? SERIES[i % 8] }} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {parts.map((p, i) => (
          <span key={p.label} className="inline-flex items-center gap-1.5 text-muted"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: p.color ?? SERIES[i % 8] }} />{p.label} <b className="text-fg tnum">{format(p.value)}</b></span>
        ))}
      </div>
    </div>
  );
}

export function Spark({ values, color = SERIES[0], width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  const max = Math.max(1e-12, ...values), n = values.length;
  const pts = values.map((v, i) => `${n <= 1 ? width / 2 : (i / (n - 1)) * (width - 4) + 2},${height - 3 - (Math.max(0, v) / max) * (height - 6)}`).join(' ');
  return <svg width={width} height={height} aria-hidden className="viz"><polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /></svg>;
}
