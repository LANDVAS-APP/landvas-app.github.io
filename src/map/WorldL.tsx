// The app's World button, held: the LANDVAS mark opens over the map. Its five plots — the L, in the mark's colours and
// order (rose, amber, sun, mint, sky) — are the map's five groups of actions; tap one and its actions fill the mark's
// four empty plots (the top-right square). Tap it again (or another) to close or switch. Laid out with the mark's own
// proportions (scripts/landvas-mark.mjs): 11.5% inset, a gap of 7.5% of the grid, plot corners 26%.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useWorldButton } from '../app/radial';
import { cn, safeStorage, saveStorage } from '../lib/utils';
import { useUi } from '../lib/store';
import { buzz } from '../native/native';

const tap = () => { if (useUi.getState().settings.haptics) buzz('light'); };

export type LOption = {
  key: string; label: string; icon: ReactNode; go(): void;
  /** a switch that's on (3D, GPS, following you…): the plot fills with its group's colour */ on?: boolean;
  /** a little tag in the corner: time left, a count */ note?: string;
  testid?: string;
};
export type LGroup = {
  key: string; label: string; icon: ReactNode; testid: string;
  /** up to four: they take the mark's empty plots */ options?: LOption[];
  /** no options: one tap does this */ go?(): void;
  /** something under way in it (a trip, a flight): a dot on the plot */ live?: boolean;
  badge?: number;
};

const PLOT = ['rose', 'amber', 'sun', 'mint', 'sky'] as const;
/** [column, row] of the L's plots, in the mark's order */
const L_AT = [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] as const;
/** the mark's four empty plots, the row nearest your thumb first */
const EMPTY_AT = [[1, 1], [2, 1], [1, 0], [2, 0]] as const;
// the mark's grid: inset 11.5% of the tile, gap 7.5% of the grid, three plots across
const INSET = 11.5, INNER = 100 - INSET * 2, GAP = INNER * 0.075, CELL = (INNER - GAP * 2) / 3;
const at = (i: number, j: number): CSSProperties => ({ left: `${INSET + i * (CELL + GAP)}%`, top: `${INSET + j * (CELL + GAP)}%` });

export function WorldL({ groups, locate, nudge }: { groups: LGroup[]; locate: (() => void) | null; nudge: boolean }) {
  const open = useWorldButton((s) => s.open);
  const setOpen = useWorldButton((s) => s.setOpen);
  const recenter = useWorldButton((s) => s.recenter);
  const [sel, setSel] = useState<string | null>(null);
  // a tap on World (already on the map) centres on your explorer
  const first = useRef(recenter);
  useEffect(() => { if (recenter !== first.current) locate?.(); }, [recenter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setOpen(false), [setOpen]); // leaving the map closes it
  useEffect(() => { if (!open) setSel(null); }, [open]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [open, setOpen]);
  // the first few visits: a little "hold me" bubble over the World button
  const [hint, setHint] = useState(false);
  useEffect(() => {
    const n = safeStorage('landvas.worldHint', 0);
    if (n >= 3) return;
    saveStorage('landvas.worldHint', n + 1);
    const a = setTimeout(() => setHint(true), 1800), b = setTimeout(() => setHint(false), 7000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  const close = () => setOpen(false);
  const g = groups.slice(0, 5);
  const cur = g.find((x) => x.key === sel) ?? null;
  const curTone = cur ? PLOT[g.indexOf(cur)] : null;
  const pick = (x: LGroup) => {
    tap();
    if (!x.options?.length) { close(); x.go?.(); return; }
    setSel((s) => (s === x.key ? null : x.key));
  };
  // the mark's own size: as big as the phone allows, never bigger than ~a thumb's reach
  const vw = typeof innerWidth === 'number' ? innerWidth : 390;
  const size = Math.round(Math.max(260, Math.min(336, vw - 28)));
  return (
    <>
      {nudge && !open && <span className="lv-world-nudge" aria-hidden />}
      <div className="lv-world-hint-wrap"><AnimatePresence>{hint && !open && <motion.div className="lv-world-hint" initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }} data-testid="world-hint">Hold 🌍 for map actions</motion.div>}</AnimatePresence></div>
      {createPortal(
        <>
          <AnimatePresence>
            {open && <motion.button key="scrim" className="lv-radial-scrim" aria-label="Close" onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} data-testid="world-radial-close" />}
          </AnimatePresence>
          <AnimatePresence>
            {open && (
              <motion.div key="mark" className="lv-lmark" role="menu" aria-label="Map actions" data-testid="world-radial"
                style={{ width: size, height: size, marginLeft: -size / 2, ['--S' as string]: `${size}px` }}
                initial={{ opacity: 0, scale: 0.55, y: 70 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6, y: 60, transition: { duration: 0.16, ease: 'easeIn' } }}
                transition={{ type: 'spring', stiffness: 520, damping: 34 }}>
                {/* the four empty plots, as on the mark */}
                {EMPTY_AT.map(([i, j]) => <span key={`e${i}${j}`} className="lv-lplot empty" style={at(i, j)} aria-hidden />)}
                {/* the chosen group's actions, in the empty plots */}
                <AnimatePresence mode="popLayout">
                  {cur?.options?.slice(0, 4).map((o, n) => (
                    <motion.button key={`${cur.key}:${o.key}`} role="menuitem" className={cn('lv-lplot opt', `lv-p-${curTone}`, o.on && 'on')} style={at(EMPTY_AT[n][0], EMPTY_AT[n][1])}
                      aria-label={o.label} aria-pressed={o.on === undefined ? undefined : o.on} data-testid={o.testid}
                      initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.1 } }}
                      transition={{ type: 'spring', stiffness: 640, damping: 30, delay: n * 0.03 }}
                      onClick={() => { tap(); close(); o.go(); }}>
                      <span className="face"><span className="ic">{o.icon}</span><span className="lb">{o.label}</span></span>
                      {o.note && <span className="note tnum">{o.note}</span>}
                    </motion.button>
                  ))}
                </AnimatePresence>
                {/* the L: five plots in the mark's colours, in order */}
                {g.map((x, n) => (
                  <motion.button key={x.key} role="menuitem" className={cn('lv-lplot claimed', `lv-p-${PLOT[n]}`, sel === x.key && 'sel')} style={at(L_AT[n][0], L_AT[n][1])}
                    aria-label={x.options?.length ? `${x.label} — show its actions` : x.label} aria-expanded={x.options?.length ? sel === x.key : undefined} aria-haspopup={x.options?.length ? 'menu' : undefined}
                    data-testid={x.testid}
                    initial={{ opacity: 0, scale: 0.35, y: 18 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 28, delay: 0.04 + n * 0.035 }}
                    onClick={() => pick(x)}>
                    <span className="face"><span className="ic">{x.icon}</span><span className="lb">{x.label}</span></span>
                    {!!x.badge && <span className="note tnum">{x.badge > 9 ? '9+' : x.badge}</span>}
                    {x.live && !x.badge && <span className="live" aria-hidden />}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </>,
        document.body,
      )}
    </>
  );
}
