// LANDVAS UI primitives (shadcn-style: Radix behaviour + Tailwind tokens).
import * as RDialog from '@radix-ui/react-dialog';
import * as RTabs from '@radix-ui/react-tabs';
import * as RSlider from '@radix-ui/react-slider';
import * as RSwitch from '@radix-ui/react-switch';
import * as RTooltip from '@radix-ui/react-tooltip';
import { Loader2, X } from 'lucide-react';
import { createContext, forwardRef, useCallback, useContext, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/utils';
import type { Resource } from '../backend/types';

// ---- Button -----------------------------------------------------------------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'rainbow';
type Size = 'sm' | 'md' | 'lg' | 'icon';
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }>(
  ({ className, variant = 'secondary', size = 'md', loading, disabled, children, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-[15px]',
        size === 'icon' && 'h-10 w-10',
        variant === 'primary' && 'bg-accent text-white shadow-[0_8px_24px_-10px_var(--accent)] hover:brightness-110',
        variant === 'rainbow' && 'rainbow-edge bg-surface-2 text-fg hover:bg-surface',
        variant === 'secondary' && 'border border-line bg-surface-2/70 text-fg hover:border-line-strong hover:bg-surface-2',
        variant === 'ghost' && 'text-muted hover:bg-surface-2/60 hover:text-fg',
        variant === 'danger' && 'bg-bad/90 text-white hover:bg-bad',
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cn('h-5 w-5 animate-spin text-muted', className)} />;

// ---- Dialog / Sheet ----------------------------------------------------------
export function Dialog({ open, onOpenChange, title, description, children, wide, footer }: {
  open: boolean; onOpenChange(o: boolean): void; title: ReactNode; description?: ReactNode; children?: ReactNode; wide?: boolean; footer?: ReactNode;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-[60] bg-[var(--scrim)] backdrop-blur-[2px]" />
        <RDialog.Content
          className={cn(
            'glass fixed left-1/2 top-1/2 z-[61] max-h-[min(88dvh,820px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl p-5 scroll-thin',
            wide ? 'max-w-3xl' : 'max-w-md',
          )}
          style={{ animation: 'lv-pop .18s ease-out' }}
        >
          <div className="mb-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <RDialog.Title className="font-display text-lg font-semibold">{title}</RDialog.Title>
              {description ? <RDialog.Description className="mt-1 text-sm text-muted">{description}</RDialog.Description> : <RDialog.Description className="sr-only">{String(title)}</RDialog.Description>}
            </div>
            <RDialog.Close className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
              <X className="h-5 w-5" />
            </RDialog.Close>
          </div>
          {children}
          {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

// Promise-based confirmation (window.confirm is unavailable in sandboxed frames).
type ConfirmOpts = { title: string; body?: ReactNode; confirm?: string; danger?: boolean };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve(v: boolean): void }) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Dialog open={!!state} onOpenChange={(o) => !o && close(false)} title={state?.title ?? ''}
        footer={<><Button variant="ghost" onClick={() => close(false)}>Cancel</Button><Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{state?.confirm ?? 'Confirm'}</Button></>}>
        {state?.body && <div className="text-sm text-muted">{state.body}</div>}
      </Dialog>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

// ---- Tabs ----------------------------------------------------------------------
export function Tabs({ value, onValueChange, items, className }: { value: string; onValueChange(v: string): void; items: { value: string; label: ReactNode }[]; className?: string }) {
  return (
    <RTabs.Root value={value} onValueChange={onValueChange}>
      <RTabs.List className={cn('flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface/70 p-1 scroll-thin', className)}>
        {items.map((i) => (
          <RTabs.Trigger key={i.value} value={i.value}
            className="shrink-0 rounded-xl px-3 py-1.5 text-[13px] font-semibold text-muted transition data-[state=active]:bg-surface-2 data-[state=active]:text-fg data-[state=active]:shadow">
            {i.label}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
    </RTabs.Root>
  );
}

// ---- Slider & Switch ----------------------------------------------------------
export function Slider({ value, min, max, step = 1, onChange, label, format, id }: { value: number; min: number; max: number; step?: number; onChange(v: number): void; label?: string; format?(v: number): string; id?: string }) {
  return (
    <div className="grid gap-1.5">
      {label && (
        <div className="flex justify-between text-xs text-muted">
          <label htmlFor={id}>{label}</label>
          <span className="tnum text-fg">{format ? format(value) : value}</span>
        </div>
      )}
      <RSlider.Root id={id} className="relative flex h-5 touch-none select-none items-center" value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])}>
        <RSlider.Track className="relative h-1.5 grow rounded-full bg-surface-2">
          <RSlider.Range className="absolute h-full rounded-full bg-accent" />
        </RSlider.Track>
        <RSlider.Thumb aria-label={label} className="block h-4 w-4 rounded-full border-2 border-white bg-accent shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-2" />
      </RSlider.Root>
    </div>
  );
}

export function Switch({ checked, onCheckedChange, label, id, hint }: { checked: boolean; onCheckedChange(v: boolean): void; label: string; id: string; hint?: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <RSwitch.Root id={id} checked={checked} onCheckedChange={onCheckedChange} className="relative h-6 w-11 shrink-0 rounded-full bg-surface-2 transition data-[state=checked]:bg-accent">
        <RSwitch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition data-[state=checked]:translate-x-[22px]" />
      </RSwitch.Root>
    </label>
  );
}

export function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <RTooltip.Root delayDuration={350}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content side="bottom" sideOffset={6} className="z-[80] rounded-lg bg-fg px-2 py-1 text-xs font-semibold text-bg shadow">
          {label}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}
export const TipProvider = RTooltip.Provider;

// ---- Inputs ---------------------------------------------------------------------
export const inputCls = 'h-11 w-full rounded-xl border border-line bg-surface/80 px-3 text-[15px] text-fg placeholder:text-faint focus:border-accent focus:outline-none';
export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-muted">{label}</label>
      {children}
      {error ? <p className="text-xs font-semibold text-bad">{error}</p> : hint ? <p className="text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

// ---- Resources ---------------------------------------------------------------------
export const RESOURCE_META: Record<Resource, { name: string; color: string; hint: string }> = {
  ink: { name: 'Ink', color: '#34C3FF', hint: 'Primary currency: buy plots and upgrades.' },
  pigments: { name: 'Pigments', color: '#FF4FD8', hint: 'Unlock brushes, palettes and finishes.' },
  brush_points: { name: 'Brush Points', color: '#FFC93D', hint: 'Creative experience — raises your artist level.' },
  gallery_tokens: { name: 'Gallery Tokens', color: '#3DDC97', hint: 'Earned through approved art and achievements.' },
};

export function ResourceIcon({ r, className }: { r: Resource; className?: string }) {
  const c = RESOURCE_META[r].color;
  return (
    <svg viewBox="0 0 20 20" className={cn('h-4 w-4 shrink-0', className)} aria-hidden>
      {r === 'ink' && <path d="M10 2.2c3 4 5.2 6.9 5.2 9.6A5.2 5.2 0 0 1 10 17a5.2 5.2 0 0 1-5.2-5.2C4.8 9.1 7 6.2 10 2.2Z" fill={c} />}
      {r === 'pigments' && (<><circle cx="6.5" cy="7.5" r="3.3" fill="#FF4D6D" /><circle cx="13.5" cy="7.5" r="3.3" fill="#FFE14D" /><circle cx="10" cy="13.2" r="3.3" fill="#34C3FF" /></>)}
      {r === 'brush_points' && <path d="M10 1.8l2.1 5.2 5.6.4-4.3 3.6 1.4 5.4L10 13.5l-4.8 2.9 1.4-5.4L2.3 7.4l5.6-.4L10 1.8Z" fill={c} />}
      {r === 'gallery_tokens' && <path d="M10 1.8 16.9 5.8v8.4L10 18.2 3.1 14.2V5.8L10 1.8Zm0 4.2-3.3 1.9v3.9l3.3 1.9 3.3-1.9V7.9L10 6Z" fill={c} fillRule="evenodd" />}
    </svg>
  );
}

export function ResourcePill({ r, value, className }: { r: Resource; value: number | string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/80 px-2.5 py-1 text-[13px] font-bold tnum', className)} title={`${RESOURCE_META[r].name} — ${RESOURCE_META[r].hint}`}>
      <ResourceIcon r={r} />
      {typeof value === 'number' ? new Intl.NumberFormat().format(Math.floor(value)) : value}
    </span>
  );
}

export function Cost({ cost }: { cost: Partial<Record<Resource, number>> | null | undefined }) {
  const entries = Object.entries(cost ?? {}).filter(([, v]) => Number(v) > 0) as [Resource, number][];
  if (!entries.length) return <span className="font-bold text-ok">Free</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {entries.map(([k, v]) => (
        <span key={k} className="inline-flex items-center gap-1 font-bold tnum"><ResourceIcon r={k} />{new Intl.NumberFormat().format(v)}</span>
      ))}
    </span>
  );
}

// ---- Empty state -----------------------------------------------------------------------
export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line px-6 py-12 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <h3 className="font-display text-base font-semibold">{title}</h3>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}

// ---- Avatar (procedural, no uploads to moderate) ---------------------------------------
function seedRand(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
const AV_COLORS = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF', '#7B5CFF', '#FF4FD8', '#22C7B5'];
export function Avatar({ seed, style = 'prism', accent = '#7B5CFF', size = 40, className, frame }: { seed: string; style?: string; accent?: string; size?: number; className?: string; frame?: 'gold' | 'prism' | null }) {
  const shapes = useMemo(() => {
    const r = seedRand(seed + style);
    const pick = () => AV_COLORS[Math.floor(r() * AV_COLORS.length)];
    const out: ReactNode[] = [];
    if (style === 'mosaic') {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) {
        const c = r() > 0.35 ? pick() : 'transparent';
        out.push(<rect key={`${x}${y}a`} x={x * 10} y={y * 10} width="10" height="10" fill={c} />, <rect key={`${x}${y}b`} x={30 - x * 10} y={y * 10} width="10" height="10" fill={c} />);
      }
    } else if (style === 'orbit') {
      for (let i = 0; i < 3; i++) out.push(<circle key={i} cx={20} cy={20} r={6 + i * 5 + r() * 2} fill="none" stroke={pick()} strokeWidth={3} strokeDasharray={`${8 + r() * 20} ${4 + r() * 8}`} transform={`rotate(${r() * 360} 20 20)`} />);
    } else if (style === 'bloom') {
      const n = 5 + Math.floor(r() * 4);
      const c = pick();
      for (let i = 0; i < n; i++) out.push(<ellipse key={i} cx={20} cy={11} rx={4.5} ry={9} fill={i % 2 ? c : pick()} opacity={0.9} transform={`rotate(${(360 / n) * i} 20 20)`} />);
      out.push(<circle key="c" cx={20} cy={20} r={4} fill="#fff" />);
    } else {
      for (let i = 0; i < 4; i++) {
        const x = r() * 30, y = r() * 30;
        out.push(<polygon key={i} points={`${x},${y} ${x + 18 * r() + 8},${y + 4} ${x + 6},${y + 18 * r() + 8}`} fill={pick()} opacity={0.92} />);
      }
    }
    return out;
  }, [seed, style]);
  return (
    <span className={cn('relative inline-block shrink-0 overflow-hidden rounded-[30%]', className)} style={{ width: size, height: size, background: accent }}>
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden>{shapes}</svg>
      {frame && <span className={cn('pointer-events-none absolute inset-0 rounded-[30%]', frame === 'gold' ? 'ring-2 ring-gold ring-inset' : 'rainbow-edge')} />}
    </span>
  );
}

// ---- Logo -----------------------------------------------------------------------------------
export function LogoMark({ size = 28 }: { size?: number }) {
  const cells = [
    [0, 0, '#FF4D6D'], [0, 1, '#FF9F1C'], [0, 2, '#FFE14D'], [1, 2, '#3DDC97'], [2, 2, '#34C3FF'],
  ] as const;
  return (
    <svg viewBox="0 0 30 30" width={size} height={size} aria-hidden>
      <rect width="30" height="30" rx="8" fill="#0B1230" />
      {[0, 1, 2].flatMap((x) => [0, 1, 2].map((y) => <rect key={`${x}${y}`} x={4 + x * 7.6} y={4 + y * 7.6} width="6.4" height="6.4" rx="1.6" fill="#1D2A63" />))}
      {cells.map(([x, y, c]) => <rect key={`c${x}${y}`} x={4 + x * 7.6} y={4 + y * 7.6} width="6.4" height="6.4" rx="1.6" fill={c} />)}
    </svg>
  );
}
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="font-display text-[15px] font-bold tracking-[0.12em]">LANDVAS</span>
    </span>
  );
}

export function Stat({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-line bg-surface/60 px-4 py-3', className)}>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold tnum">{value}</div>
    </div>
  );
}

export function useOnceRef<T>(make: () => T) {
  const r = useRef<T | null>(null);
  if (r.current === null) r.current = make();
  return r.current;
}
