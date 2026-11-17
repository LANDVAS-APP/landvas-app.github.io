// The Grimoire in first person: your explorer pulls out its book of enchantments and holds it open in front of you —
// leather and gold, parchment pages, your thumbs on them. The left page lists your enchantments (page through them),
// the right shows the one you've picked: summon it and it stands in the world before you (a summoning circle, its sigil,
// the creature itself — see `manifest` in scene.ts); use its powers from its page, and it flares as you do.
import { AnimatePresence, motion } from 'motion/react';
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { EnchantView } from '../backend/api';
import { useMyEnchantments } from '../enchant/core';
import { enchantName, kindInfo } from '../enchant/kinds';
import { Sigil } from '../enchant/Sigil';
import { cn } from '../lib/utils';
import type { Eyes } from './scene';
import { bookHand, type SelfLook } from './selfView';

const EnchantSheet = lazy(() => import('../enchant/GrimoireScreen').then((m) => ({ default: m.EnchantDetailSheet })));
const PER_PAGE = 5;

/** an enchantment's sigil as a picture (for the one standing in the world) */
async function sigilPicture(kind: string, seed: number, level: number): Promise<HTMLCanvasElement | null> {
  try {
    const [{ renderToStaticMarkup }, { createElement }] = await Promise.all([import('react-dom/server'), import('react')]);
    let svg = renderToStaticMarkup(createElement(Sigil, { kind, seed, size: 256, level, still: true }));
    if (!svg.includes('xmlns=')) svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
    c.getContext('2d')!.drawImage(img, 0, 0, 256, 256);
    return c;
  } catch { return null; }
}

export type Summoned = { id: string; name: string; emoji: string; kind: string };

export function FpGrimoire({ eyes, look, open, onClose, summoned, setSummoned, openPage }: {
  eyes: Eyes | null; look: SelfLook; open: boolean; onClose(): void;
  summoned: Summoned | null; setSummoned(s: Summoned | null): void;
  /** (bumped when you tap the one standing in the world: its page opens) */ openPage: number;
}) {
  const mine = useMyEnchantments();
  const list = useMemo(() => [...(mine.data ?? [])].sort((a, b) => Number(!!b.attention) - Number(!!a.attention) || (b.level ?? 0) - (a.level ?? 0)), [mine.data]);
  const [page, setPage] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  useEffect(() => { if (openPage && summoned) setSheet(summoned.id); }, [openPage]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = list.find((e) => e.id === pick) ?? list[0] ?? null;
  const hands = useMemo(() => bookHand(look), [JSON.stringify(look.style ?? {}), look.accent]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) eyes?.sound().page(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // used from its page: the one in the world flares
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<{ id: string }>).detail; if (summoned && d?.id === summoned.id) { eyes?.manifestFlare(); eyes?.sound().chime(true); } };
    addEventListener('lv-enchant-act', on);
    return () => removeEventListener('lv-enchant-act', on);
  }, [eyes, summoned]);

  const summon = async (e: EnchantView) => {
    if (!eyes) return;
    const k = kindInfo(e.kind);
    onClose();
    eyes.sound().whoosh();
    const sig = await sigilPicture(e.kind, e.sigil, e.level ?? 1);
    eyes.manifest({ emoji: k.emoji, a: k.a, b: k.b, seed: e.sigil, sigil: sig, name: enchantName(e) });
    setTimeout(() => eyes.sound().chime(true), 380);
    setSummoned({ id: e.id, name: enchantName(e), emoji: k.emoji, kind: e.kind });
  };
  const dismiss = () => { eyes?.manifest(null); eyes?.sound().whoosh(); setSummoned(null); setSheet(null); };
  const turn = (d: number) => { const n = Math.max(0, Math.min(pages - 1, page + d)); if (n !== page) { setPage(n); eyes?.sound().page(); } };

  return (
    <>
      {/* the book, held open */}
      <AnimatePresence>
        {open && (
          <motion.div key="book" className="absolute inset-0 z-[25] flex items-end justify-center" data-testid="eyes-grimoire"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25, delay: 0.15 } }}>
            <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_80%,rgba(255,200,90,0.16),rgba(0,0,0,0.45))]" onClick={onClose} />
            <motion.div className="relative mb-[max(8px,env(safe-area-inset-bottom,0px))] w-[min(96vw,580px)]" style={{ transformPerspective: 1100, transformOrigin: '50% 100%' }}
              initial={{ y: '115%', rotateX: 48 }} animate={{ y: 0, rotateX: 10 }} exit={{ y: '120%', rotateX: 50, transition: { duration: 0.35, ease: 'easeIn' } }}
              transition={{ type: 'spring', stiffness: 150, damping: 19 }}>
              {/* the cover, behind the pages */}
              <div className="lv-fpbook-cover absolute -inset-x-3 -bottom-3 -top-3 rounded-[18px]" />
              <div className="relative grid h-[min(62dvh,470px)] grid-cols-2">
                {/* the left page: your enchantments */}
                <div className="lv-fpbook-page lv-fpbook-left relative flex min-h-0 flex-col px-3 pb-8 pt-3 text-[#3A2600]" style={{ transform: 'rotateY(7deg)', transformOrigin: '100% 50%' }}>
                  <div className="font-display text-[15px] font-black leading-tight">📖 Grimoire</div>
                  <div className="mb-2 text-[10.5px] font-bold text-[#3A2600]/60">{list.length ? `${list.length} enchantment${list.length === 1 ? '' : 's'}` : mine.isLoading ? 'Opening…' : 'No enchantments yet'}</div>
                  <AnimatePresence mode="wait">
                    <motion.div key={page} className="grid min-h-0 content-start gap-1.5" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.18 }}>
                      {list.slice(page * PER_PAGE, (page + 1) * PER_PAGE).map((e) => (
                        <button key={e.id} className={cn('flex min-w-0 items-center gap-2 rounded-xl px-1.5 py-1 text-left', e.id === cur?.id ? 'bg-[#3A2600]/12 ring-1 ring-[#3A2600]/25' : 'active:bg-[#3A2600]/8')}
                          onClick={() => { setPick(e.id); eyes?.sound().page(); }} data-testid="eyes-grimoire-item">
                          <span className="relative shrink-0"><Sigil kind={e.kind} seed={e.sigil} size={30} level={e.level} still />{e.attention && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#E0392F] ring-2 ring-[#F3E6C4]" />}</span>
                          <span className="grid min-w-0 leading-tight">
                            <span className="truncate text-[12px] font-black">{enchantName(e)}</span>
                            <span className="text-[10px] font-bold text-[#3A2600]/60">Lv {e.level ?? 1}{(e.stars ?? 0) > 0 ? ` · ${'⭐'.repeat(e.stars ?? 0)}` : ''}</span>
                          </span>
                        </button>
                      ))}
                      {!list.length && !mine.isLoading && <p className="text-[11.5px] font-semibold leading-snug text-[#3A2600]/75">An Enchanted roll brings you one — they live on plots and pay you in their own ways.</p>}
                    </motion.div>
                  </AnimatePresence>
                  {pages > 1 && (
                    <div className="absolute inset-x-2 bottom-2 flex items-center justify-between text-[11px] font-black text-[#3A2600]/70">
                      <button className="rounded-full px-2 py-0.5 disabled:opacity-30" disabled={page === 0} onClick={() => turn(-1)} aria-label="Previous page">‹</button>
                      <span>{page + 1} / {pages}</span>
                      <button className="rounded-full px-2 py-0.5 disabled:opacity-30" disabled={page >= pages - 1} onClick={() => turn(1)} aria-label="Next page" data-testid="eyes-grimoire-next">›</button>
                    </div>
                  )}
                </div>
                {/* the right page: the one you've picked */}
                <div className="lv-fpbook-page lv-fpbook-right relative flex min-h-0 flex-col items-center px-3 pb-3 pt-3 text-center text-[#3A2600]" style={{ transform: 'rotateY(-7deg)', transformOrigin: '0% 50%' }}>
                  <button className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full text-[#3A2600]/60" onClick={onClose} aria-label="Close the book" data-testid="eyes-grimoire-close"><X className="h-4 w-4" /></button>
                  {cur ? (() => {
                    const k = kindInfo(cur.kind);
                    return (
                      <>
                        <div className="mt-1"><Sigil kind={cur.kind} seed={cur.sigil} size={78} level={cur.level} /></div>
                        <div className="mt-1 font-display text-[14px] font-black leading-tight">{k.emoji} {enchantName(cur)}</div>
                        <div className="text-[10.5px] font-bold text-[#3A2600]/60">{k.name} · Lv {cur.level ?? 1}</div>
                        <p className="mt-1.5 line-clamp-4 text-[11px] font-semibold leading-snug text-[#3A2600]/80">{k.tagline}</p>
                        {cur.attention && <div className="mt-1.5 rounded-full bg-[#E0392F]/12 px-2 py-0.5 text-[10.5px] font-black text-[#A3241B]">● It needs you</div>}
                        <div className="mt-auto grid w-full gap-1.5 pt-2">
                          <button className="rounded-xl bg-[linear-gradient(135deg,#B26BFF,#6B2BD9)] px-3 py-2 font-display text-[13px] font-black text-white shadow-[0_3px_0_#3E1580]"
                            onClick={() => void summon(cur)} data-testid="eyes-grimoire-summon">✨ Summon it here</button>
                          <button className="rounded-xl bg-[#3A2600]/10 px-3 py-1.5 text-[12px] font-black" onClick={() => { setSheet(cur.id); onClose(); }} data-testid="eyes-grimoire-page">📜 Its powers</button>
                        </div>
                      </>
                    );
                  })() : <div className="m-auto opacity-60"><Sigil kind="oracle" seed={7} size={96} still /></div>}
                </div>
              </div>
              {/* your hands, thumbs on the pages */}
              {/* (each hand's picture has the book's corner at (60, 60) of its 120×160 — drawn half as big again) */}
              <div className="pointer-events-none absolute -bottom-[150px] -left-[90px] h-[240px] w-[180px] [&>svg]:h-full [&>svg]:w-full" style={{ transform: 'scaleX(-1)' }} dangerouslySetInnerHTML={{ __html: hands }} />
              <div className="pointer-events-none absolute -bottom-[150px] -right-[90px] h-[240px] w-[180px] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: hands }} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* one summoned: it's here, in front of you */}
      <AnimatePresence>
        {summoned && !open && !sheet && (
          <motion.div key={summoned.id} className="absolute left-1/2 top-[calc(env(safe-area-inset-top,0px)+104px)] z-20 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-[#B26BFF]/50 bg-[#12041F]/85 px-3 py-2 shadow-2xl"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} data-testid="eyes-summoned">
            <span className="text-2xl leading-none">{summoned.emoji}</span>
            <span className="grid leading-tight"><span className="text-[10px] font-black uppercase tracking-wider text-[#E2C8FF]/70">Summoned</span><span className="max-w-[40vw] truncate text-[13px] font-black text-white">{summoned.name}</span></span>
            <button className="rounded-xl bg-[linear-gradient(135deg,#B26BFF,#6B2BD9)] px-2.5 py-1.5 text-[12px] font-black text-white" onClick={() => setSheet(summoned.id)} data-testid="eyes-summoned-use">Use its powers</button>
            <button className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/80" onClick={dismiss} aria-label="Send it back" data-testid="eyes-summoned-dismiss"><X className="h-4 w-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* its page, over the view (use its powers right here) */}
      <AnimatePresence>
        {sheet && (
          <motion.div key="sheet" className="fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[82dvh] w-[min(560px,100%)] overflow-y-auto overscroll-contain rounded-t-[26px] border-t border-[#B26BFF]/40 bg-[#12041F] shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.8)]"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} data-testid="eyes-enchant-sheet">
            <div className="sticky top-0 z-10 flex justify-end bg-gradient-to-b from-[#12041F] to-transparent p-2">
              <button className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white" onClick={() => setSheet(null)} aria-label="Close" data-testid="eyes-enchant-sheet-close"><X className="h-4 w-4" /></button>
            </div>
            <Suspense fallback={<div className="py-16 text-center text-white/60">Opening…</div>}><EnchantSheet id={sheet} /></Suspense>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
