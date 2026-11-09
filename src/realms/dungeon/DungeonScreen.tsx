// 🗡️ The Dungeon: lead your party down, floor by floor. At camp, pick your heroes and where to start (any floor just
// after a boss you've beaten). Inside, walk room to room (arrows, the pad or tap a room next door): chests, traps,
// shrines, monsters, and the stairs down. Fights are turn by turn — attack, a hero's skill, a potion or a bomb.
// Head back to camp any time (not mid-fight) to keep everything you found; if the party falls you keep half.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Menu } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../../backend/api';
import { toGameError } from '../../backend/backend';
import type { Realm } from '../../backend/types';
import { invalidateGame } from '../../lib/queries';
import { useUi } from '../../lib/store';
import { cn } from '../../lib/utils';
import { Button, Dialog, PlayerAvatar, Spinner } from '../../ui';
import { confettiCannons } from '../../ui/confetti';
import { sfx } from '../../arcade/sfx';
import { fmt, useRealmCore } from '../core';
import { Lockpick } from './Lockpick';
import { createDungeon3D, type DungeonScene } from './dungeon3d';
import { heroStats, nb, trainCost, type DungeonCore, type RunSummary } from './dungeonCore';
import { config } from '../../env';

export default function DungeonScreen({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['dungeon', id], queryFn: () => api.dungeonGet(id), staleTime: 30_000, refetchOnWindowFocus: false });
  if (q.isLoading) return <div className="fixed inset-0 grid place-items-center bg-[#0B0910]"><Spinner /></div>;
  if (q.error || !q.data) return <div className="fixed inset-0 grid place-content-center gap-3 bg-[#0B0910] p-6 text-center text-white"><div className="text-5xl">🗡️</div><p>This dungeon couldn’t be found.</p><Link to="/world"><Button variant="secondary">Back to the map</Button></Link></div>;
  return <Dungeon key={q.data.id} data={q.data} />;
}

const DIRS = [['up', 0], ['right', 1], ['down', 2], ['left', 3]] as const;
function Dungeon({ data }: { data: Realm & { dungeon_core: DungeonCore } }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const reduce = useUi((s) => s.settings.reduceMotion);
  const [r, setR] = useState<Realm>(data);
  const [core, setCore] = useState<DungeonCore>(data.dungeon_core);
  const [busy, setBusy] = useState<string | null>(null);
  const [anim, setAnim] = useState(false);
  const [target, setTarget] = useState(0);
  const [dlg, setDlg] = useState<'heroes' | 'more' | null>(null);
  const [start, setStart] = useState(1);
  const [summary, setSummary] = useState<(RunSummary & { lost?: boolean }) | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const scene = useRef<DungeonScene | null>(null);
  const fightKey = useRef('');
  const R = useRealmCore({ r, setR, extraGames: { lockpick: Lockpick }, burst: (_a, e) => scene.current?.burst(e) });
  const c = core.cfg, run = core.run, wallet = r.me.wallet, loot = wallet.loot ?? 0;
  const emo = (k: string) => r.cfg.resources[k]?.emoji ?? '❔';
  const apply = (x: { dungeon: DungeonCore; me: Realm['me']; level: Realm['level']; level_up?: number | null }) => { setCore(x.dungeon); setR((cur) => ({ ...cur, me: x.me, level: x.level })); if (x.level_up) R.levelUp(x.level_up); };
  const act = async <T,>(k: string, f: () => Promise<T>) => { setBusy(k); try { return await f(); } catch (e) { const er = toGameError(e); toast.error(er.code === 'not_enough' ? 'Not enough for that yet' : er.code === 'level_too_low' ? 'Level up your dungeon first' : er.message); return null; } finally { setBusy(null); } };

  useEffect(() => {
    if (!cv.current) return;
    const heroes = Object.fromEntries(Object.entries(data.dungeon_core.cfg.heroes).map(([k, h]) => [k, { color: h.color, emoji: h.emoji }]));
    const s = createDungeon3D({ canvas: cv.current, heroes, reduceMotion: reduce, onTapRoom: (k) => tapRoom.current(k) });
    scene.current = s;
    if (import.meta.env.DEV || config.e2e) Object.assign(window, { __landvasDungeon: s });
    return () => { s.dispose(); scene.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // keep the 3D world in step (not while a round is playing out)
  useEffect(() => {
    const s = scene.current; if (!s || anim) return;
    if (!run) { fightKey.current = ''; s.setCamp(core.party); return; }
    s.setRun(run);
    const fk = run.fight ? `${run.id}:${run.floor}:${run.pos}` : '';
    if (run.fight && fk !== fightKey.current) { s.startFight(run.fight.enemies); setTarget(0); }
    fightKey.current = fk;
  }, [run, core.party, anim]);
  useEffect(() => { scene.current?.setPaused(!!R.game); }, [R.game]);

  // ---- exploring -------------------------------------------------------------------------------------------------------
  const move = async (to: string) => {
    if (!run || run.fight || busy || anim) return;
    if (!run.rooms[to]) { sfx.fail(); return; }
    const x = await act('move', () => api.dungeonMove(r.id, to));
    if (!x) return;
    apply(x);
    const ev = x.event;
    if (ev.chest) { sfx.coin(); scene.current?.burst(Object.keys(ev.chest).map(emo)); toast.success(`🧰 ${Object.entries(ev.chest).map(([k, v]) => `${emo(k)} ${fmt(v)}`).join('  ')}`); }
    else if (ev.trap) { sfx.fail(); toast('⚠️ A spike trap! Everyone’s hurt'); }
    else if (ev.shrine) { sfx.perfect(2); scene.current?.burst(['✨', '💖', '✨']); toast.success('💎 The shrine heals your party'); }
    else if (ev.fight) { sfx.fail(); if (x.dungeon.run?.fight?.boss) toast(`☠️ ${x.dungeon.run.fight.enemies[0].n} blocks the way!`, { duration: 3000 }); }
    else sfx.tick();
  };
  const tapRoom = useRef((k: string) => {});
  tapRoom.current = (k: string) => { if (run && nb(run.pos).includes(k)) void move(k); };
  const step = (d: number) => { if (run) void move(nb(run.pos)[d]); };
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (R.game || !run || run.fight) return;
      const d = ({ ArrowUp: 0, w: 0, ArrowRight: 1, d: 1, ArrowDown: 2, s: 2, ArrowLeft: 3, a: 3 } as Record<string, number>)[e.key];
      if (d !== undefined) { e.preventDefault(); step(d); }
    };
    window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd);
  });
  const descend = async () => {
    const x = await act('descend', () => api.dungeonDescend(r.id));
    if (!x) return;
    apply(x); sfx.win(2);
    toast.success(`⬇️ Floor ${x.dungeon.run?.floor}${x.new_best ? ' — deepest yet!' : ''}`);
  };
  const leave = async () => {
    const x = await act('leave', () => api.dungeonLeave(r.id));
    if (!x) return;
    apply(x); setSummary(x.summary); sfx.coin(); invalidateGame(qc);
  };
  const begin = async () => {
    const x = await act('start', () => api.dungeonStart(r.id, start));
    if (x) { apply(x); sfx.win(1); }
  };

  // ---- fighting --------------------------------------------------------------------------------------------------------
  const fight = async (a: 'attack' | 'skill' | 'potion' | 'bomb', hero = 0) => {
    if (!run?.fight || busy || anim) return;
    if (a === 'potion') { const alive = run.party.map((p, i) => ({ i, f: p.hp / p.max })).sort((p, q) => p.f - q.f); hero = alive[0]?.i ?? 0; }
    setBusy('act');
    try {
      const x = await api.dungeonAct(r.id, a, hero, target);
      setAnim(true);
      sfx.tick();
      await scene.current?.play(x.log, x.enemies ?? x.dungeon.run?.fight?.enemies, x.dungeon.run?.party ?? run.party.map((p) => ({ ...p, hp: 0 })));
      setAnim(false);
      apply(x);
      if (x.won) { sfx.win(run.fight.boss ? 5 : 2); if (run.fight.boss) confettiCannons(); scene.current?.burst(Object.keys(x.drop ?? {}).map(emo)); toast.success(`Victory! ${Object.entries(x.drop ?? {}).map(([k, v]) => `${emo(k)} ${fmt(v)}`).join('  ')}`); }
      if (x.lost && x.summary) { sfx.fail(); setSummary({ ...x.summary, lost: true }); invalidateGame(qc); }
      const en = x.dungeon.run?.fight?.enemies; if (en && (en[target]?.hp ?? 0) <= 0) setTarget(Math.max(0, en.findIndex((e) => e.hp > 0)));
    } catch (e) { setAnim(false); toast.error(toGameError(e).message); } finally { setBusy(null); }
  };

  // ---- heroes ----------------------------------------------------------------------------------------------------------
  const hero = async (a: 'hire' | 'train' | 'party', h?: string, party?: string[]) => { const x = await act(`${a}:${h ?? ''}`, () => api.dungeonHero(r.id, a, h, party)); if (x) { apply(x); if (a !== 'party') { sfx.perfect(2); scene.current?.burst(['⭐', '✨']); } } };
  const togglePartyMember = (h: string) => {
    const p = core.party.includes(h) ? core.party.filter((x) => x !== h) : core.party.length < c.party_size ? [...core.party, h] : null;
    if (!p) { toast(`Your party holds ${c.party_size} heroes — take someone out first`); return; }
    if (!p.length) { toast('Someone has to go!'); return; }
    void hero('party', undefined, p);
  };
  const checkpoints = useMemo(() => Array.from({ length: core.bosses + 1 }, (_, i) => 1 + i * 5), [core.bosses]);
  const here = run?.rooms[run.pos];
  const canDescend = !!run && !run.fight && !!here && (here.t === 'stairs' || here.t === 'boss') && here.done;
  const bagLine = run ? Object.entries(run.bag).filter(([, v]) => v >= 1) : [];
  const potions = (wallet.potion ?? 0) + (run?.bag.potion ?? 0), bombs = (wallet.bomb ?? 0) + (run?.bag.bomb ?? 0);
  const locked = !!busy || anim;

  return (
    <div className="fixed inset-0 z-40 select-none overflow-hidden bg-[#0B0910] text-white" data-testid="realm" data-kind="dungeon">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" style={{ touchAction: 'none' }} data-testid="dungeon-canvas" />
      <div className="pointer-events-none absolute inset-x-0 top-0 grid gap-1.5 p-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <div className="flex items-start gap-2">
          <button onClick={() => (history.length > 1 ? nav(-1) : nav('/world'))} className="pointer-events-auto grid h-10 w-10 place-items-center rounded-xl bg-black/60 backdrop-blur" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1 rounded-2xl bg-black/60 px-3 py-1.5 backdrop-blur">
            <div className="flex items-center gap-2"><span className="truncate font-display text-base font-black">🗡️ {r.name}</span>{!r.mine && <span className="flex items-center gap-1 text-[11px] text-white/70"><PlayerAvatar p={r.owner} size={14} />@{r.owner.username}’s</span>}
              <span className="ml-auto shrink-0 rounded-full bg-[#FFD23F]/20 px-2 text-xs font-black text-[#FFE88A]" data-testid="dungeon-loot">💰 {fmt(loot)}</span></div>
            <div className="mt-0.5 flex items-center gap-2" data-testid="realm-level"><b className="text-xs text-[#FFD23F]">Lv {r.level.level}</b>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#FFD23F]" style={{ width: `${r.level.max ? 100 : (r.level.into / Math.max(1, r.level.need)) * 100}%` }} /></div>
              <span className="text-[10px] text-white/60">{run ? `Floor ${run.floor}` : `Deepest: ${core.best_floor || '—'}`}</span></div>
          </div>
          {r.mine && r.me.bonus_ready && !run && <button onClick={() => void R.daily()} className="pointer-events-auto rounded-xl bg-[#FFE14D] px-2.5 py-2 text-xs font-black text-black shadow-lg" data-testid="realm-daily">🎁</button>}
        </div>
        {run && (
          <div className="grid gap-1.5">
            <div className="flex items-center gap-1.5">
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-full bg-black/60 px-2 py-1 text-xs backdrop-blur [scrollbar-width:none]" data-testid="dungeon-bag">
                <span className="shrink-0 font-black">🎒</span>{bagLine.length ? bagLine.map(([k, v]) => <span key={k} className="shrink-0">{emo(k)}{fmt(v)}</span>) : <span className="text-white/50">empty</span>}
              </div>
              <button onClick={() => void leave()} disabled={!!run.fight || locked} className="pointer-events-auto shrink-0 rounded-full bg-[#3DDC97] px-3 py-1 text-xs font-black text-[#0F2A1E] disabled:opacity-40" data-testid="dungeon-leave">🏕️ Back to camp</button>
            </div>
            <div className="flex gap-1.5" data-testid="dungeon-party">
              {run.party.map((p, i) => {
                const hc = c.heroes[p.h], f = p.hp / p.max;
                return (
                  <div key={i} className={cn('min-w-0 flex-1 rounded-xl bg-black/65 px-2 py-1 backdrop-blur', p.hp <= 0 && 'opacity-50 grayscale')}>
                    <div className="flex items-center gap-1 text-[11px] font-bold"><span>{hc.emoji}</span><span className="truncate">{hc.name}</span><span className="ml-auto tabular-nums text-white/70">{Math.max(0, Math.ceil(p.hp))}</span></div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/15"><div className={cn('h-full rounded-full transition-all', f > 0.5 ? 'bg-[#3DDC97]' : f > 0.25 ? 'bg-[#FFB13D]' : 'bg-[#FF4D6D]')} style={{ width: `${Math.max(0, f) * 100}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 grid gap-2 p-2 pb-[max(10px,env(safe-area-inset-bottom,0px))]">
        {run?.fight ? (
          <>
            <div className="flex justify-center gap-1.5" data-testid="dungeon-foes">
              {run.fight.enemies.map((e, i) => (
                <button key={i} onClick={() => e.hp > 0 && setTarget(i)} className={cn('min-w-0 max-w-[30%] flex-1 rounded-xl bg-black/70 px-2 py-1 text-left backdrop-blur', e.hp <= 0 && 'opacity-30', target === i && e.hp > 0 && 'ring-2 ring-[#FF4D6D]')} data-testid={`dungeon-foe-${i}`}>
                  <div className="flex items-center gap-1 text-[11px] font-bold"><span className="text-base">{e.e}</span><span className="truncate">{e.n}</span>{e.stun > 0 && <span>💫</span>}</div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#FF5A5A]" style={{ width: `${(Math.max(0, e.hp) / e.max) * 100}%` }} /></div>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-black/70 p-1.5 backdrop-blur" data-testid="dungeon-actions">
              <button onClick={() => void fight('attack')} disabled={locked} className="col-span-4 h-12 rounded-xl bg-[#FF5C5C] font-display text-lg font-black shadow-[0_4px_0_#9A2A30] active:translate-y-0.5 disabled:opacity-50" data-testid="dungeon-attack">⚔️ Attack</button>
              {run.party.map((p, i) => {
                const sk = c.heroes[p.h].skill, dead = p.hp <= 0;
                return (
                  <button key={i} onClick={() => void fight('skill', i)} disabled={locked || dead || p.cd > 0} title={sk.blurb} className="relative grid h-14 place-items-center rounded-xl bg-white/10 px-1 text-[10px] font-bold leading-tight disabled:opacity-40" data-testid={`dungeon-skill-${i}`}>
                    <span className="text-xl leading-none">{sk.emoji}</span>{sk.name}{p.cd > 0 && <span className="absolute right-1 top-1 rounded-full bg-black/70 px-1 text-[9px]">{p.cd}</span>}
                  </button>
                );
              })}
              <button onClick={() => void fight('potion')} disabled={locked || potions < 1} className="grid h-14 place-items-center rounded-xl bg-white/10 text-[10px] font-bold disabled:opacity-40" data-testid="dungeon-potion"><span className="text-xl leading-none">🧪</span>Potion ×{potions}</button>
              <button onClick={() => void fight('bomb')} disabled={locked || bombs < 1} className="grid h-14 place-items-center rounded-xl bg-white/10 text-[10px] font-bold disabled:opacity-40" data-testid="dungeon-bomb"><span className="text-xl leading-none">💣</span>Bomb ×{bombs}</button>
            </div>
          </>
        ) : run ? (
          <div className="flex items-end justify-between gap-2">
            <div className="grid grid-cols-3 gap-1" data-testid="dungeon-pad">
              {DIRS.map(([n, d]) => {
                const to = nb(run.pos)[d], ok = !!run.rooms[to];
                const Icon = d === 0 ? ArrowUp : d === 1 ? ArrowRight : d === 2 ? ArrowDown : ArrowLeft;
                return <button key={n} onClick={() => step(d)} disabled={!ok || locked} className={cn('grid h-12 w-12 place-items-center rounded-xl bg-black/65 backdrop-blur disabled:opacity-25', d === 0 && 'col-start-2', d === 1 && 'col-start-3 row-start-2', d === 2 && 'col-start-2 row-start-3', d === 3 && 'col-start-1 row-start-2')} aria-label={n} data-testid={`dungeon-go-${n}`}><Icon className="h-5 w-5" /></button>;
              })}
            </div>
            <div className="grid flex-1 justify-items-end gap-1.5">
              {canDescend && <button onClick={() => void descend()} disabled={locked} className="rounded-2xl bg-[#7B6CF6] px-4 py-3 font-display text-base font-black shadow-[0_4px_0_#4A3AB0]" data-testid="dungeon-descend">⬇️ Down to floor {run.floor + 1}</button>}
              <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white/75">Walk with the arrows or tap a room next door</span>
            </div>
          </div>
        ) : (
          <>
            {r.mine && (
              <div className="mx-auto grid w-full max-w-sm gap-1.5">
                {checkpoints.length > 1 && <div className="flex justify-center gap-1" data-testid="dungeon-checkpoints">{checkpoints.map((f) => <button key={f} onClick={() => setStart(f)} className={cn('rounded-full px-2.5 py-1 text-xs font-black', start === f ? 'bg-[#FFD23F] text-black' : 'bg-black/60')}>Floor {f}</button>)}</div>}
                <button onClick={() => void begin()} disabled={busy === 'start'} className="rounded-2xl bg-[#B03A3A] py-3.5 font-display text-xl font-black shadow-[0_6px_0_#6A1A1A] active:translate-y-1" data-testid="dungeon-enter">⚔️ Enter the dungeon{start > 1 ? ` · floor ${start}` : ''}</button>
              </div>
            )}
            <div className="mx-auto flex flex-wrap justify-center gap-2 text-[11px] text-white/80"><span className="rounded-full bg-black/55 px-2 py-0.5">🏆 Deepest floor {core.best_floor || '—'}</span><span className="rounded-full bg-black/55 px-2 py-0.5">☠️ {core.bosses} bosses</span><span className="rounded-full bg-black/55 px-2 py-0.5">🧪 {wallet.potion ?? 0} · 💣 {wallet.bomb ?? 0}</span></div>
            <div className="grid grid-cols-3 gap-1.5">
              <button onClick={() => setDlg('heroes')} className="grid h-14 place-items-center rounded-2xl bg-black/60 text-[11px] font-bold backdrop-blur" data-testid="dungeon-heroes"><span className="text-xl leading-none">🛡️</span>Heroes</button>
              <button onClick={() => R.setPanel('make')} className="grid h-14 place-items-center rounded-2xl bg-black/60 text-[11px] font-bold backdrop-blur" data-testid="dungeon-supplies"><span className="text-xl leading-none">⚗️</span>Potions & bombs</button>
              <button onClick={() => setDlg('more')} className="grid h-14 place-items-center rounded-2xl bg-black/60 text-[11px] font-bold backdrop-blur" data-testid="dungeon-more"><Menu className="h-5 w-5" />More</button>
            </div>
          </>
        )}
      </div>

      <Dialog open={dlg === 'heroes'} onOpenChange={(o) => setDlg(o ? 'heroes' : null)} title="🛡️ Heroes" description={<>Up to {c.party_size} go down together. Tap a hero’s badge to bring them along or leave them at camp.</>}>
        <div className="grid gap-1.5" data-testid="dungeon-hero-list">
          {Object.entries(c.heroes).sort((a, b) => a[1].level - b[1].level).map(([k, h]) => {
            const have = core.heroes[k], lv = have?.lv ?? 1, st = heroStats(c, k, lv), lockd = r.level.level < h.level, cost = have ? trainCost(c, lv) : { loot: h.cost };
            const canPay = Object.entries(cost).every(([x, v]) => (wallet[x] ?? 0) >= v), inParty = core.party.includes(k);
            return (
              <div key={k} className={cn('grid gap-1 rounded-xl border border-line bg-surface-2/60 p-2', lockd && !have && 'opacity-55')} data-testid={`dungeon-hero-${k}`}>
                <div className="flex items-center gap-2">
                  <button onClick={() => have && togglePartyMember(k)} disabled={!have} className={cn('grid h-11 w-11 place-items-center rounded-xl text-2xl', inParty ? 'ring-2 ring-[#3DDC97]' : 'opacity-70')} style={{ background: `${h.color}33` }} data-testid={`dungeon-party-${k}`}>{h.emoji}</button>
                  <div className="min-w-0 flex-1"><div className="text-sm font-bold">{h.name} {have && <span className="text-xs font-normal text-muted">· Lv {lv}{inParty ? ' · in the party' : ''}</span>}</div>
                    <div className="text-xs text-muted">❤️ {st.hp} · ⚔️ {st.atk} · {h.skill.emoji} {h.skill.name}: {h.skill.blurb}</div></div>
                </div>
                <div className="flex justify-end">
                  {!have ? (lockd ? <span className="text-xs text-muted">🔒 Lv {h.level}</span> : <Button size="sm" variant="primary" disabled={!canPay} loading={busy === `hire:${k}`} onClick={() => void hero('hire', k)}>Hire · 💰 {fmt(h.cost)}</Button>)
                    : lv < c.train.max_lv && <Button size="sm" variant="secondary" disabled={!canPay} loading={busy === `train:${k}`} onClick={() => void hero('train', k)}>Train to Lv {lv + 1} · {Object.entries(cost).map(([x, v]) => `${emo(x)} ${fmt(v)}`).join(' ')}</Button>}
                </div>
              </div>
            );
          })}
        </div>
      </Dialog>
      <Dialog open={dlg === 'more'} onOpenChange={(o) => setDlg(o ? 'more' : null)} title="🗡️ Around the camp">
        <div className="grid grid-cols-2 gap-2">
          {([['play', '🎮', 'Games', 'Dungeon Dash, Lockpick'], ['build', '💀', 'Minions', 'Gather while you’re away'], ['make', '⚗️', 'Alchemy', 'Potions, bombs, gear'], ['market', '⚖️', 'Market', 'Sell for loot'], ['book', '📖', 'Bestiary', 'Rare finds']] as const).map(([p, e, n, d]) => (
            <button key={p} onClick={() => { setDlg(null); R.setPanel(p); }} className="grid gap-0.5 rounded-2xl border border-line bg-surface-2/60 p-3 text-left" data-testid={`dungeon-open-${p}`}><span className="text-3xl">{e}</span><b>{n}</b><span className="text-xs text-muted">{d}</span></button>
          ))}
        </div>
      </Dialog>
      <Dialog open={!!summary} onOpenChange={(o) => !o && setSummary(null)} title={summary?.lost ? '💀 Your party fell' : '🏕️ Back at camp'}>
        {summary && (
          <div className="grid gap-2 text-center" data-testid="dungeon-summary">
            <div className="text-sm">Reached floor <b>{summary.floor}</b> · {summary.kills} monsters beaten</div>
            {summary.lost && <div className="text-xs text-muted">You dragged half the loot back to camp.</div>}
            <div className="flex flex-wrap justify-center gap-2 text-lg font-black">{Object.entries(summary.bag).map(([k, v]) => <span key={k}>{emo(k)} {fmt(v)}</span>)}{!Object.keys(summary.bag).length && <span className="text-sm text-muted">Nothing this time</span>}</div>
            {summary.ink > 0 && <div className="text-sm">💧 +{summary.ink} Ink</div>}
            <Button variant="primary" onClick={() => setSummary(null)}>Rest by the fire</Button>
          </div>
        )}
      </Dialog>
      {R.dialogs}
    </div>
  );
}
