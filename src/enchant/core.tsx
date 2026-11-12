// The Grimoire's plumbing: data hooks, a ticking clock for countdowns, and a full-screen effects layer (particles,
// and a "+N Ink" burst that shows why it paid: level, genes, echoes, size-rayed rewards).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { create } from 'zustand';
import { api, type EnchantView } from '../backend/api';
import { toGameError } from '../backend/backend';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { useUi } from '../lib/store';
import { buzz } from '../native/native';
import { Fx, type BurstOpts } from '../roll/fx';
import { kindInfo } from './kinds';
import './enchant.css';

export function useMyEnchantments() {
  const me = useOnboardedMe();
  return useQuery({ queryKey: ['enchantments'], queryFn: api.myEnchantments, enabled: !!me, staleTime: 20_000, refetchInterval: 60_000 });
}
export function useEnchant(id: string | undefined) {
  return useQuery({ queryKey: ['enchant', id], queryFn: () => api.enchantGet(id!), enabled: !!id, staleTime: 5_000, refetchInterval: 30_000 });
}
export function useVisitors() {
  const me = useOnboardedMe();
  return useQuery({ queryKey: ['enchant-visitors'], queryFn: api.enchantVisitors, enabled: !!me, staleTime: 20_000, refetchInterval: 60_000 });
}

/** act on an enchantment: the new view lands in the cache; a payout bursts on screen */
export function useAct(id: string) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (action: string, args: Record<string, unknown> = {}, opts: { silent?: boolean; at?: { x: number; y: number } } = {}) => {
    if (busy) return null;
    setBusy(action);
    try {
      const r = await api.enchantAct(id, action, args);
      qc.setQueryData(['enchant', id], r);
      void qc.invalidateQueries({ queryKey: ['enchantments'] });
      void qc.invalidateQueries({ queryKey: ['enchant-chronicle', id] });
      void qc.invalidateQueries({ queryKey: ['enchant-map'] });
      invalidateGame(qc);
      const pay = r.result?.pay;
      if (pay && pay.paid > 0 && !opts.silent) efx.pay(pay, r.reflect_kind ?? r.kind, opts.at);
      return r;
    } catch (e) {
      const g = toGameError(e);
      toast.error(g.message);
      if (useUi.getState().settings.haptics) buzz('heavy');
      return null;
    } finally { setBusy(null); }
  };
  return { act, busy };
}

/** re-render every `ms` (countdowns) */
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(t); }, [ms]);
}
/** seconds left of a server countdown, counting down since the data arrived */
export function useLeft(sec: number | null | undefined, at: number) {
  useTick(1000);
  if (sec == null) return null;
  return Math.max(0, sec - (Date.now() - at) / 1000);
}

// ---- the effects layer ---------------------------------------------------------------------------------------------
type Pay = { paid: number; base: number; mods: { label: string; emoji: string }[] };
type Toast = { id: number; pay: Pay; kind: string; x: number; y: number };
const useFxStore = create<{ pays: Toast[]; push(t: Toast): void; drop(id: number): void }>((set, get) => ({
  pays: [], push: (t) => set({ pays: [...get().pays, t] }), drop: (id) => set({ pays: get().pays.filter((p) => p.id !== id) }),
}));
let engine: Fx | null = null;
export const efx = {
  burst(o: BurstOpts) { if (!useUi.getState().settings.reduceMotion) engine?.burst(o); },
  pay(pay: Pay, kind: string, at?: { x: number; y: number }) {
    const k = kindInfo(kind);
    const x = at?.x ?? innerWidth / 2, y = at?.y ?? innerHeight * 0.42;
    useFxStore.getState().push({ id: Date.now() + Math.random(), pay, kind, x, y });
    if (useUi.getState().settings.haptics) buzz('success');
    this.burst({ x, y, colors: [k.a, k.b, '#FFE8A3', '#fff'], count: 70 + Math.min(120, pay.paid), speed: 10, kind: 'spark' });
    this.burst({ x, y, colors: ['#B79CFF', '#6B4BEF', '#fff'], count: 18, speed: 7, kind: 'emoji', emojis: ['💧', '✨', k.emoji], life: 1.2 });
  },
};

export function EnchantFxLayer() {
  const cv = useRef<HTMLCanvasElement>(null);
  const pays = useFxStore((s) => s.pays);
  useEffect(() => {
    engine = new Fx(cv.current!);
    const r = () => engine?.resize();
    addEventListener('resize', r);
    return () => { removeEventListener('resize', r); engine?.destroy(); engine = null; };
  }, []);
  useEffect(() => {
    if (!pays.length) return;
    const last = pays[pays.length - 1];
    const t = setTimeout(() => useFxStore.getState().drop(last.id), 2600);
    return () => clearTimeout(t);
  }, [pays]);
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[150]">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" />
      <AnimatePresence>
        {pays.map((p) => {
          const k = kindInfo(p.kind);
          return (
            <motion.div key={p.id} className="absolute grid -translate-x-1/2 -translate-y-1/2 justify-items-center gap-1.5" style={{ left: p.x, top: p.y }}
              initial={{ scale: 0.3, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: -40 }} exit={{ opacity: 0, y: -90 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }} data-testid="ench-payout">
              <div className="font-display text-[44px] font-black leading-none tnum" style={{ color: '#fff', textShadow: `0 0 24px ${k.a}, 0 3px 0 ${k.ink}` }}>+{p.pay.paid} <span className="text-[26px]">Ink</span></div>
              {p.pay.mods.length > 0 && (
                <div className="flex max-w-[320px] flex-wrap justify-center gap-1">
                  {p.pay.mods.map((m, i) => (
                    <motion.span key={i} className="rounded-full px-2.5 py-0.5 text-[11px] font-black text-[#1a0b2e]" style={{ background: `linear-gradient(90deg, ${k.a}, #FFE8A3)` }}
                      initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15 + i * 0.12, type: 'spring', stiffness: 600, damping: 16 }}>{m.emoji} {m.label}</motion.span>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>, document.body);
}

/** where an element is on screen (for bursts) */
export const centerOf = (el: Element | null | undefined) => {
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
};

export type SceneProps = { v: EnchantView; view: any; act: ReturnType<typeof useAct>['act']; busy: string | null; at: number; mirror?: boolean };
