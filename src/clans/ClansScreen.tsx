// Clans: /clans is your clan (or, without one, finding, founding and the leaderboard); /clans/:id is any clan's page.
// Members get weekly goals, clan chat, battles against other clans and a shared 3D castle, the Keep (/clan/hall).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, LogOut, Search, Send, Shield, Swords, UserMinus, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../backend/api';
import { toGameError } from '../backend/backend';
import type { Clan, ClanBattle, ClanBoard, ClanCard, ClanGoal, ClanHome, ClanPrivacy, PlanetChatMsg } from '../backend/types';
import { Page, PageHeader } from '../app/Shell';
import { invalidateGame, useOnboardedMe } from '../lib/queries';
import { cn, fmt, timeAgo } from '../lib/utils';
import { Button, Empty, PlayerAvatar, Spinner, Tabs, inputCls, useConfirm } from '../ui';
import { Bar, ClanBadge, PRIVACY_LABEL, ROLE_LABEL, until } from './ui';
import { poll, live } from '../lib/poll';
import { useNudge } from '../lib/nudge';

export const clanKeys = { home: ['clan-home'] as const, mine: ['clan', 'mine'] as const, one: (id: string) => ['clan', id] as const };
const err = (e: unknown) => toast.error(toGameError(e).message);

export default function ClansScreen() {
  const { id } = useParams();
  const home = useQuery({ queryKey: clanKeys.home, queryFn: api.clanHome, staleTime: 10_000 });
  if (home.isLoading || !home.data) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>;
  if (id && id === home.data.clan?.id) return <Navigate to="/clans" replace />;
  if (id) return <Page><Heraldry><ClanPage id={id} home={home.data} /></Heraldry></Page>;
  return <Page><Heraldry color={home.data.clan?.color}>{home.data.clan ? <MyClan home={home.data} /> : <NoClan home={home.data} />}</Heraldry></Page>;
}

/** clans have a look of their own: night-time castle, stone and gold, lit in the clan's colour */
function Heraldry({ color, children }: { color?: string; children: React.ReactNode }) {
  return (
    <div className="clan-theme relative">
      <div className="clan-bg" style={{ ['--clan' as string]: color ?? '#7B5CFF' }} />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
/** the clan's banner: hangs from a gold rod, swallowtailed, in its colours */
function Banner({ c, children }: { c: ClanCard; children?: React.ReactNode }) {
  return (
    <div className="relative mb-5 pt-3" data-testid="clan-header">
      <div className="absolute inset-x-2 top-0 h-3 rounded-full bg-gradient-to-b from-[#FFE39A] to-[#B8862B] shadow-lg" />
      <div className="absolute -left-0.5 top-[-3px] h-[18px] w-[18px] rounded-full bg-[#E8B83E] shadow" /><div className="absolute -right-0.5 top-[-3px] h-[18px] w-[18px] rounded-full bg-[#E8B83E] shadow" />
      <div className="relative mx-3 overflow-hidden px-4 pb-14 pt-5 text-white shadow-2xl"
        style={{ background: `linear-gradient(180deg, ${c.color} 0%, color-mix(in srgb, ${c.color} 55%, #1B1226) 55%, #1B1226 100%)`, clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% calc(100% - 38px), 0 100%)', boxShadow: 'inset 0 0 0 3px #E8B83E' }}>
        <div className="pointer-events-none absolute inset-[6px] border-2 border-[#E8B83E]/60" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% calc(100% - 34px), 0 100%)' }} />
        <div className="pointer-events-none absolute -right-6 -top-6 text-[150px] leading-none opacity-15">{c.emblem}</div>
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}

function useRefreshClans() {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: clanKeys.home }); void qc.invalidateQueries({ queryKey: ['clan'] }); };
}

// ---- no clan yet ---------------------------------------------------------------------------------------------------
function NoClan({ home }: { home: ClanHome }) {
  const [tab, setTab] = useState<'find' | 'found' | 'board'>('find');
  const refresh = useRefreshClans();
  return (
    <>
      <PageHeader eyebrow="Community" title={<span className="font-display">🏰 Clans</span>}>Raise a banner with your friends: your own castle Keep with a Clan Spirit to raise, monuments to build together, weekly goals, clan chat and battles against other clans.</PageHeader>
      {home.rejoin_at && <p className="mb-3 rounded-2xl bg-surface-2 p-3 text-sm text-muted">You left a clan recently — you can join or found another in {until(home.rejoin_at)}.</p>}
      {home.invites.length > 0 && (
        <div className="mb-4 grid gap-2" data-testid="clan-invites">
          {home.invites.map((i) => (
            <div key={i.id} className="glass flex items-center gap-3 rounded-3xl p-3">
              <ClanBadge c={i.clan} />
              <div className="min-w-0 flex-1"><b className="block truncate">{i.clan.name} <span className="text-muted">[{i.clan.tag}]</span></b><span className="text-xs text-muted">{i.by ? `@${i.by.username} invited you` : 'You’re invited'} · level {i.clan.level} · {i.clan.members} members</span></div>
              <Button size="sm" variant="rainbow" onClick={async () => { try { await api.clanAnswer(i.id, true); toast.success(`Welcome to ${i.clan.name}!`); refresh(); } catch (e) { err(e); } }} data-testid="clan-invite-accept">Join</Button>
              <Button size="sm" variant="ghost" onClick={async () => { try { await api.clanAnswer(i.id, false); refresh(); } catch (e) { err(e); } }}>No thanks</Button>
            </div>
          ))}
        </div>
      )}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4" items={[{ value: 'find', label: 'Find a clan' }, { value: 'found', label: 'Found a clan' }, { value: 'board', label: 'Leaderboard' }]} />
      {tab === 'find' && <FindClans home={home} />}
      {tab === 'found' && <FoundClan home={home} />}
      {tab === 'board' && <Board />}
    </>
  );
}

function ClanRow({ c, right }: { c: ClanCard; right?: React.ReactNode }) {
  return (
    <div className="glass flex items-center gap-3 rounded-3xl p-3" data-testid="clan-row">
      <Link to={`/clans/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <ClanBadge c={c} />
        <span className="min-w-0"><b className="block truncate font-display">{c.name} <span className="font-sans text-sm text-muted">[{c.tag}]</span></b>
          <span className="block truncate text-xs text-muted">Level {c.level} · {c.members}/{c.cap} members · {fmt(c.week_score)} Ink this week{c.motto ? ` · “${c.motto}”` : ''}</span></span>
      </Link>
      {right}
    </div>
  );
}

function JoinButton({ c, home }: { c: ClanCard; home: ClanHome }) {
  const refresh = useRefreshClans();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const asked = home.requests.includes(c.id);
  if (home.clan) return null;
  if (asked) return <span className="text-xs font-bold text-muted">Asked ✓</span>;
  if (c.privacy === 'invite') return <span className="text-xs text-muted">Invite only</span>;
  if (c.members >= c.cap) return <span className="text-xs text-muted">Full</span>;
  return (
    <Button size="sm" variant={c.privacy === 'open' ? 'rainbow' : 'secondary'} loading={busy} data-testid="clan-join"
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api.clanJoin(c.id);
          if (r.joined) { toast.success(`Welcome to ${c.name}!`); refresh(); nav('/clans'); } else { toast.success('Asked to join — an officer will answer soon'); refresh(); }
        } catch (e) { err(e); } finally { setBusy(false); }
      }}>{c.privacy === 'open' ? 'Join' : 'Ask to join'}</Button>
  );
}

function FindClans({ home }: { home: ClanHome }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'week' | 'level' | 'new'>('week');
  const [term, setTerm] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const list = useQuery({ queryKey: ['clan', 'list', term, sort], queryFn: () => api.clanList(term || null, sort), staleTime: 15_000 });
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-5 w-5 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or tag" className={cn(inputCls, 'pl-10')} data-testid="clan-search" /></label>
        <div className="flex gap-1">{(['week', 'level', 'new'] as const).map((s) => <button key={s} onClick={() => setSort(s)} className={cn('rounded-xl px-3 text-sm font-bold', sort === s ? 'bg-accent text-white' : 'bg-surface-2')}>{s === 'week' ? '🔥 Busy' : s === 'level' ? '⭐ Level' : '✨ New'}</button>)}</div>
      </div>
      {list.isLoading ? <div className="flex justify-center py-10"><Spinner /></div>
        : !list.data?.length ? <Empty icon="🛡️" title={term ? 'No clans match that' : 'No clans yet'}>Be the first — found one for {fmt(home.cfg.found_cost)} Ink.</Empty>
        : list.data.map((c) => <ClanRow key={c.id} c={c} right={<JoinButton c={c} home={home} />} />)}
    </div>
  );
}

function FoundClan({ home }: { home: ClanHome }) {
  const me = useOnboardedMe();
  const qc = useQueryClient();
  const refresh = useRefreshClans();
  const [f, setF] = useState({ name: '', tag: '', emblem: home.cfg.emblems[0], color: home.cfg.colors[1] ?? home.cfg.colors[0], motto: '', privacy: 'open' as ClanPrivacy });
  const [busy, setBusy] = useState(false);
  const ink = Number(me?.balances.ink ?? 0), cost = home.cfg.found_cost;
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((o) => ({ ...o, [k]: v }));
  const go = async () => {
    setBusy(true);
    try {
      const c = await api.clanFound({ ...f, tag: f.tag.toUpperCase(), motto: f.motto.trim() || null });
      toast.success(`${c.name} is founded! 🎉`); invalidateGame(qc); refresh();
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  return (
    <div className="glass grid gap-4 rounded-3xl p-4" data-testid="clan-found">
      <div className="flex items-center gap-3">
        <ClanBadge c={f} size={64} />
        <div className="min-w-0"><b className="block truncate font-display text-xl">{f.name || 'Your clan'} <span className="text-muted">[{(f.tag || 'TAG').toUpperCase()}]</span></b><span className="text-sm text-muted">{f.motto || 'A motto, if you like'}</span></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <label className="grid gap-1 text-sm font-bold">Name<input value={f.name} maxLength={24} onChange={(e) => set('name', e.target.value)} className={inputCls} placeholder="The Ink Dragons" data-testid="clan-found-name" /></label>
        <label className="grid gap-1 text-sm font-bold">Tag<input value={f.tag} maxLength={5} onChange={(e) => set('tag', e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())} className={inputCls} placeholder="INK" data-testid="clan-found-tag" /></label>
      </div>
      <label className="grid gap-1 text-sm font-bold">Motto<input value={f.motto} maxLength={80} onChange={(e) => set('motto', e.target.value)} className={inputCls} placeholder="We paint the world together" /></label>
      <div className="grid gap-1 text-sm font-bold">Emblem
        <div className="flex flex-wrap gap-1.5">{home.cfg.emblems.map((e) => <button key={e} onClick={() => set('emblem', e)} className={cn('grid h-10 w-10 place-items-center rounded-xl text-2xl', f.emblem === e ? 'bg-accent ring-2 ring-white' : 'bg-surface-2')} data-testid={`clan-emblem-${e}`}>{e}</button>)}</div></div>
      <div className="grid gap-1 text-sm font-bold">Colour
        <div className="flex flex-wrap gap-1.5">{home.cfg.colors.map((c) => <button key={c} onClick={() => set('color', c)} aria-label={c} className={cn('h-9 w-9 rounded-full border-2', f.color === c ? 'border-white' : 'border-transparent')} style={{ background: c }} />)}</div></div>
      <div className="grid gap-1 text-sm font-bold">Who can join
        <div className="flex flex-wrap gap-1.5">{(['open', 'request', 'invite'] as const).map((p) => <button key={p} onClick={() => set('privacy', p)} className={cn('rounded-xl px-3 py-2 text-sm font-bold', f.privacy === p ? 'bg-accent text-white' : 'bg-surface-2')}>{PRIVACY_LABEL[p]}</button>)}</div></div>
      <div className="grid gap-1 rounded-2xl bg-surface-2 p-3 text-sm">
        <b>What your clan gets</b>
        {home.cfg.perks.map((p) => <span key={p.level} className="text-muted">{p.emoji} <b className="text-fg">Level {p.level}:</b> {p.text}</span>)}
      </div>
      <Button variant="rainbow" size="lg" loading={busy} disabled={ink < cost || f.name.trim().length < 3 || f.tag.length < 2} onClick={go} data-testid="clan-found-go">
        Found {f.name.trim() || 'the clan'} · {fmt(cost)} Ink
      </Button>
      {ink < cost && <p className="-mt-2 text-center text-xs text-muted">You have {fmt(ink)} Ink — play games to earn the rest.</p>}
    </div>
  );
}

// ---- leaderboard ---------------------------------------------------------------------------------------------------
function Board({ myClan }: { myClan?: string }) {
  const [kind, setKind] = useState<ClanBoard['kind']>('week');
  const b = useQuery({ queryKey: ['clan', 'board', kind], queryFn: () => api.clanBoard(kind), staleTime: 15_000 });
  return (
    <div className="grid gap-2" data-testid="clan-board">
      <div className="flex flex-wrap items-center gap-1">
        {(['week', 'last', 'level'] as const).map((k) => <button key={k} onClick={() => setKind(k)} className={cn('rounded-xl px-3 py-1.5 text-sm font-bold', kind === k ? 'bg-accent text-white' : 'bg-surface-2')}>{k === 'week' ? 'This week' : k === 'last' ? 'Last week' : 'All time'}</button>)}
        {kind === 'week' && b.data?.ends_at && <span className="ml-auto text-xs text-muted">Season ends in {until(b.data.ends_at)}</span>}
      </div>
      {kind !== 'level' && <p className="text-xs text-muted">Every Ink your members earn counts. Top clans each week win season rewards for everyone who played: 🥇 300 · top 3: 200 · top 10: 100 · top 25: 50 Ink.</p>}
      {b.isLoading ? <div className="flex justify-center py-10"><Spinner /></div>
        : !b.data?.rows.length ? <Empty icon="🏆" title="Nobody’s scored yet">Earn Ink with your clan to top the board.</Empty>
        : b.data.rows.map((r) => (
          <Link key={r.id} to={`/clans/${r.id}`} className={cn('glass flex items-center gap-3 rounded-2xl p-2.5', r.id === myClan && 'ring-2 ring-accent')}>
            <span className="w-8 text-center font-display text-lg font-black">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
            <ClanBadge c={r} size={36} />
            <span className="min-w-0 flex-1"><b className="block truncate">{r.name} <span className="text-muted">[{r.tag}]</span></b><span className="text-xs text-muted">Level {r.level} · {r.members} members · {r.wins}W {r.losses}L</span></span>
            <span className="text-right text-sm font-black">{kind === 'level' ? `Lv ${r.level}` : `${fmt(r.score ?? 0)} Ink`}{!!r.prize && <span className="block text-[10px] font-bold text-accent-2">+{r.prize} Ink each</span>}</span>
          </Link>
        ))}
      {b.data?.mine != null && <p className="text-center text-xs text-muted">Your clan is #{b.data.mine}</p>}
    </div>
  );
}

// ---- your clan -----------------------------------------------------------------------------------------------------
const TAB_ITEMS = [
  { value: 'goals', label: '🎯 Goals' }, { value: 'chat', label: '💬 Chat' }, { value: 'members', label: '👥 Members' },
  { value: 'battles', label: '⚔️ Battles' }, { value: 'board', label: '🏆 Board' }, { value: 'feed', label: '📜 News' },
];
function MyClan({ home }: { home: ClanHome }) {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'goals';
  const q = useQuery({ queryKey: clanKeys.mine, queryFn: () => api.clanGet(null), refetchInterval: poll(60_000) });
  const c = q.data;
  if (!c) return <div className="flex justify-center py-20"><Spinner /></div>;
  const officer = c.role === 'leader' || c.role === 'officer';
  const lv = c.level_info;
  const live = c.battles?.find((b) => b.status === 'live');
  const incoming = c.battles?.filter((b) => b.status === 'pending' && !b.challenger).length ?? 0;
  const toCollect = (c.goals?.filter((g) => g.claim).length ?? 0) + (c.last_goals?.length ?? 0) + (c.season?.claim ? 1 : 0) + (c.battles?.filter((b) => b.claim).length ?? 0);
  return (
    <>
      <Banner c={c}>
        <div className="flex items-center gap-3">
          <Crest c={c} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-2xl font-black" data-testid="clan-name">{c.name} <span className="text-white/70">[{c.tag}]</span></div>
            <div className="text-sm text-white/80">{c.motto || PRIVACY_LABEL[c.privacy]}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm font-bold"><span className="rounded-lg bg-black/30 px-2 py-0.5" data-testid="clan-level">Level {c.level}</span>
          <Bar v={lv.into} max={lv.need || 1} color="#FFD23F" className="flex-1" /><span className="text-xs text-white/80">{lv.max ? 'Max level' : `${fmt(lv.into)}/${fmt(lv.need)} XP`}</span></div>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
          <Stat2 v={`${c.members}/${c.cap}`} l="members" /><Stat2 v={fmt(c.week_score)} l="Ink this week" /><Stat2 v={c.season_rank ? `#${c.season_rank}` : '—'} l="this season" /><Stat2 v={`${c.wins}–${c.losses}`} l="battles" />
        </div>
        <Link to="/clan/hall" className="mt-3 flex items-center justify-center gap-2 rounded-2xl border-2 border-[#FFE39A] bg-gradient-to-b from-[#F6CF5E] to-[#B8862B] px-4 py-3 font-display text-lg font-black text-[#2A1A08] shadow-lg" data-testid="clan-enter-hall">
          🏰 Enter the {c.name} Keep{c.in_hall ? <span className="rounded-full bg-[#2A1A08] px-2 text-xs text-[#7DFFB2]">{c.in_hall} there</span> : null}
        </Link>
        {live && <button onClick={() => setSp({ tab: 'battles' })} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-black/35 px-3 py-2 text-sm font-bold"><Swords className="h-4 w-4" />Battle vs {live.vs.name}: {fmt(live.us)} – {fmt(live.them)} · {until(live.ends_at)} left</button>}
        {toCollect > 0 && <button onClick={() => setSp({ tab: 'goals' })} className="mt-2 w-full rounded-2xl bg-[#FFD23F] px-3 py-2 text-sm font-black text-[#2A1A08]" data-testid="clan-collect-hint">🎁 {toCollect} reward{toCollect === 1 ? '' : 's'} to collect</button>}
      </Banner>
      <Tabs value={tab} onValueChange={(v) => setSp({ tab: v })} className="mb-4"
        items={[...TAB_ITEMS.map((t) => t.value === 'battles' && incoming ? { ...t, label: `${t.label} (${incoming})` } : t.value === 'members' && officer && c.requests?.length ? { ...t, label: `${t.label} (${c.requests.length})` } : t), ...(officer ? [{ value: 'settings', label: '⚙️ Clan' }] : [])]} />
      {tab === 'goals' && <Goals c={c} home={home} />}
      {tab === 'chat' && <ClanChat />}
      {tab === 'members' && <Members c={c} />}
      {tab === 'battles' && <Battles c={c} home={home} />}
      {tab === 'board' && <Board myClan={c.id} />}
      {tab === 'feed' && <Feed c={c} />}
      {tab === 'settings' && officer && <Settings c={c} home={home} />}
    </>
  );
}
/** a shield-shaped crest with the emblem */
function Crest({ c, size = 72 }: { c: Pick<ClanCard, 'emblem' | 'color'>; size?: number }) {
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size * 1.15 }}>
      <svg viewBox="0 0 100 115" className="absolute inset-0 h-full w-full drop-shadow-lg"><path d="M50 4 L94 16 V54 C94 82 74 101 50 111 C26 101 6 82 6 54 V16 Z" fill={c.color} stroke="#E8B83E" strokeWidth="6" /><path d="M50 14 L84 23 V54 C84 76 69 91 50 99 C31 91 16 76 16 54 V23 Z" fill="none" stroke="#fff6" strokeWidth="2" /></svg>
      <span className="relative" style={{ fontSize: size * 0.48, marginTop: -size * 0.06 }}>{c.emblem}</span>
    </span>
  );
}
const Stat2 = ({ v, l }: { v: string; l: string }) => <div className="rounded-xl bg-black/25 px-1 py-1.5"><b className="block text-base">{v}</b><span className="text-white/70">{l}</span></div>;

function useClaim() {
  const qc = useQueryClient();
  const refresh = useRefreshClans();
  const [busy, setBusy] = useState<string | null>(null);
  return {
    busy,
    claim: async (key: string) => {
      setBusy(key);
      try { const r = await api.clanClaim(key); toast.success(`+${r.ink} Ink 🎉`); invalidateGame(qc); refresh(); } catch (e) { err(e); } finally { setBusy(null); }
    },
  };
}

function GoalCard({ g, onClaim, busy }: { g: ClanGoal; onClaim(k: string): void; busy: string | null }) {
  const show = (n: number) => (g.unit === 'min' ? `${fmt(Math.floor(n / 60))} min` : `${fmt(Math.floor(n))} Ink`);
  return (
    <div className={cn('glass grid gap-2 rounded-3xl p-3', g.done && 'ring-2 ring-[#3DDC97]')} data-testid={`clan-goal-${g.k}`}>
      <div className="flex items-center gap-2"><span className="text-2xl">{g.emoji}</span><b className="min-w-0 flex-1">{g.label}</b>
        <span className="text-xs font-bold text-muted">{g.done ? '✅ Done' : `${show(g.progress)} / ${show(g.target)}`}</span></div>
      <Bar v={g.progress} max={g.target} color={g.done ? '#3DDC97' : '#7B5CFF'} />
      <div className="flex items-center justify-between text-xs text-muted">
        <span>Reward: {g.reward} Ink each for everyone who helped · +400 clan XP</span>
        {g.claim ? <Button size="sm" variant="rainbow" loading={busy === g.claim} onClick={() => onClaim(g.claim!)} data-testid="clan-claim">Collect {g.reward} Ink</Button>
          : g.claimed ? <span className="font-bold text-[#3DDC97]">Collected ✓</span> : null}
      </div>
    </div>
  );
}

function Goals({ c, home }: { c: Clan; home: ClanHome }) {
  const { claim, busy } = useClaim();
  return (
    <div className="grid gap-3" data-testid="clan-goals">
      <div className="flex items-center justify-between text-sm"><b>This week’s goals</b><span className="text-xs text-muted">New goals in {until(c.week_ends)}</span></div>
      <p className="-mt-2 text-xs text-muted">Every Ink you earn — realms, arcades, farms, businesses, party games, minigames — counts. So does hanging out in the Keep together. You’ve given {fmt(c.me?.week_ink ?? 0)} Ink and {Math.floor((c.me?.week_secs ?? 0) / 60)} min this week.</p>
      {c.season?.claim && (
        <div className="glass flex items-center gap-3 rounded-3xl p-3 ring-2 ring-[#FFD23F]"><span className="text-3xl">🏆</span>
          <span className="min-w-0 flex-1"><b className="block">Last season: #{c.season.rank}</b><span className="text-xs text-muted">Your clan finished in the top — here’s your share.</span></span>
          <Button size="sm" variant="rainbow" loading={busy === c.season.claim} onClick={() => void claim(c.season!.claim!)} data-testid="clan-claim-season">Collect {c.season.ink} Ink</Button></div>
      )}
      {(c.last_goals ?? []).map((g) => <GoalCard key={`last-${g.n}`} g={{ ...g, label: `Last week: ${g.label}` }} onClaim={claim} busy={busy} />)}
      {(c.goals ?? []).map((g) => <GoalCard key={g.n} g={g} onClaim={claim} busy={busy} />)}
      <div className="glass grid gap-1 rounded-3xl p-3 text-sm">
        <b>Clan levels</b>
        <span className="text-xs text-muted">Every Ink your members earn is 1 clan XP; finished goals and battles give more. Each level adds 2 member places.</span>
        {home.cfg.perks.map((p) => <span key={p.level} className={cn('text-sm', c.level >= p.level ? '' : 'text-muted')}>{c.level >= p.level ? '✅' : '🔒'} {p.emoji} <b>Level {p.level}:</b> {p.text}</span>)}
      </div>
    </div>
  );
}

export function useClanChat(myId: string | undefined) {
  const [msgs, setMsgs] = useState<PlanetChatMsg[]>([]);
  const last = useRef(0);
  // the server nudges the clan's chat topic when someone says something; until we know the clan, look now and then
  const [clan, setClan] = useState<string | null>(null);
  const tick = useCallback(async () => {
    try {
      const r = await api.clanChatList(last.current);
      setClan(r.clan ?? null);
      if (!r.items.length) return;
      last.current = Math.max(last.current, ...r.items.map((m) => m.id));
      setMsgs((cur) => { const seen = new Set(cur.map((m) => m.id)); return [...cur, ...r.items.filter((m) => !seen.has(m.id))].sort((a, b) => a.id - b.id).slice(-80); });
    } catch { /* next time */ }
  }, []);
  useNudge(myId && clan ? `cc:${clan}` : null, tick, { enabled: !!myId, immediate: false, safetyMs: live(60_000), fallbackMs: live(6000), gapMs: 1000 });
  useEffect(() => {
    if (!myId || clan) return;
    void tick(); const t = setInterval(() => { if (!document.hidden) void tick(); }, live(15_000));
    return () => clearInterval(t);
  }, [myId, clan, tick]);
  return {
    msgs,
    send: async (body: string) => { const m = await api.clanChatSend(body); last.current = Math.max(last.current, m.id); setMsgs((cur) => cur.some((x) => x.id === m.id) ? cur : [...cur, m]); },
  };
}

function ClanChat() {
  const me = useOnboardedMe();
  const chat = useClanChat(me?.user_id);
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [chat.msgs.length]);
  const send = async () => { const b = text.trim(); if (!b) return; setBusy(true); try { await chat.send(b); setText(''); } catch (e) { err(e); } finally { setBusy(false); } };
  return (
    <div className="glass grid gap-2 rounded-3xl p-3" data-testid="clan-chat">
      <div ref={list} className="grid max-h-[50vh] min-h-[200px] content-start gap-2 overflow-y-auto pr-1">
        {!chat.msgs.length && <p className="py-10 text-center text-sm text-muted">Say hi to your clan 👋</p>}
        {chat.msgs.map((m) => (
          <div key={m.id} className={cn('flex items-start gap-2', m.player.id === me?.user_id && 'flex-row-reverse')}>
            <PlayerAvatar p={m.player} size={30} />
            <div className={cn('max-w-[75%] rounded-2xl px-3 py-1.5 text-sm', m.player.id === me?.user_id ? 'bg-accent text-white' : 'bg-surface-2')}>
              <span className="block text-[10px] font-bold opacity-70">@{m.player.username} · {timeAgo(m.at)}</span>{m.body}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Message your clan…" className={inputCls} data-testid="clan-chat-input" />
        <Button type="submit" loading={busy} aria-label="Send" data-testid="clan-chat-send"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}

function Members({ c }: { c: Clan }) {
  const me = useOnboardedMe();
  const confirm = useConfirm();
  const refresh = useRefreshClans();
  const nav = useNavigate();
  const [who, setWho] = useState('');
  const officer = c.role === 'leader' || c.role === 'officer', leader = c.role === 'leader';
  const act = async (f: () => Promise<unknown>, ok?: string) => { try { await f(); if (ok) toast.success(ok); refresh(); } catch (e) { err(e); } };
  return (
    <div className="grid gap-3" data-testid="clan-members">
      {officer && (
        <form onSubmit={(e) => { e.preventDefault(); const u = who.trim(); if (u) void act(() => api.clanInvite(u), `Invited @${u.replace(/^@/, '')}`).then(() => setWho('')); }} className="flex gap-2">
          <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Invite a player by username" className={inputCls} data-testid="clan-invite-name" />
          <Button type="submit" variant="secondary" data-testid="clan-invite-send"><UserPlus className="h-4 w-4" /> Invite</Button>
        </form>
      )}
      {officer && !!c.requests?.length && (
        <div className="grid gap-2"><b className="text-sm">Asking to join</b>
          {c.requests.map((r) => (
            <div key={r.id} className="glass flex items-center gap-3 rounded-2xl p-2.5" data-testid="clan-request">
              <PlayerAvatar p={r.player} size={36} /><Link to={`/u/${r.player.username}`} className="min-w-0 flex-1 truncate font-bold">@{r.player.username}</Link>
              <Button size="sm" variant="rainbow" onClick={() => void act(() => api.clanAnswer(r.id, true), `@${r.player.username} joined`)} data-testid="clan-request-yes">Let in</Button>
              <Button size="sm" variant="ghost" onClick={() => void act(() => api.clanAnswer(r.id, false))}>No</Button>
            </div>
          ))}
        </div>
      )}
      {officer && !!c.invites_out?.length && (
        <div className="flex flex-wrap gap-1.5 text-xs text-muted">Invited: {c.invites_out.map((r) => <button key={r.id} onClick={() => void act(() => api.clanUninvite(r.id))} className="rounded-full bg-surface-2 px-2 py-0.5" title="Take back">@{r.player.username} ✕</button>)}</div>
      )}
      <b className="text-sm">{c.members} of {c.cap} members</b>
      {c.members_list.map((m) => (
        <div key={m.id} className="glass flex items-center gap-3 rounded-2xl p-2.5" data-testid="clan-member">
          <div className="relative"><PlayerAvatar p={m} size={40} />{m.in_hall && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg bg-[#3DDC97]" title="In the hall" />}</div>
          <span className="min-w-0 flex-1"><Link to={`/u/${m.username}`} className="block truncate font-bold">{m.display_name || m.username} <span className="text-xs font-normal text-muted">@{m.username}</span></Link>
            <span className="text-xs text-muted">{ROLE_LABEL[m.role]} · {fmt(m.week_ink)} Ink · {Math.floor(m.week_secs / 60)} min this week{m.in_hall ? ' · in the hall' : ''}</span></span>
          {m.id !== me?.user_id && leader && (
            <div className="flex gap-1">
              {m.role === 'member' && <button onClick={() => void act(() => api.clanSetRole(m.id, 'officer'), `@${m.username} is an officer`)} className="rounded-lg bg-surface-2 p-2" title="Make officer" data-testid="clan-promote"><Shield className="h-4 w-4" /></button>}
              {m.role === 'officer' && <button onClick={() => void act(() => api.clanSetRole(m.id, 'member'))} className="rounded-lg bg-surface-2 p-2 text-xs font-bold" title="Make member">⬇</button>}
              <button onClick={async () => { if (await confirm({ title: `Make @${m.username} the leader?`, body: 'You’ll become an officer.', confirm: 'Hand over' })) void act(() => api.clanSetRole(m.id, 'leader'), `@${m.username} leads the clan now`); }} className="rounded-lg bg-surface-2 p-2" title="Make leader"><Crown className="h-4 w-4" /></button>
            </div>
          )}
          {m.id !== me?.user_id && officer && m.role !== 'leader' && (leader || m.role === 'member') && (
            <button onClick={async () => { if (await confirm({ title: `Remove @${m.username}?`, body: 'They can’t join another clan for 12 hours.', confirm: 'Remove', danger: true })) void act(() => api.clanKick(m.id)); }} className="rounded-lg bg-surface-2 p-2 text-[#FF3D6E]" title="Remove" data-testid="clan-kick"><UserMinus className="h-4 w-4" /></button>
          )}
        </div>
      ))}
      <Button variant="ghost" className="justify-self-start text-[#FF3D6E]" data-testid="clan-leave" onClick={async () => {
        const last = c.members === 1;
        if (!(await confirm({ title: last ? `Close ${c.name}?` : `Leave ${c.name}?`, body: last ? 'You’re the last one here, so the clan closes for good.' : c.role === 'leader' ? 'Leadership passes to your longest-serving officer. You can’t join another clan for 12 hours.' : 'You can’t join another clan for 12 hours.', confirm: last ? 'Close it' : 'Leave', danger: true }))) return;
        await act(() => api.clanLeave()); nav('/clans');
      }}><LogOut className="h-4 w-4" /> {c.members === 1 ? 'Close the clan' : 'Leave the clan'}</Button>
    </div>
  );
}

function BattleCard({ b, c, onClaim, busy }: { b: ClanBattle; c: Clan; onClaim(k: string): void; busy: string | null }) {
  const refresh = useRefreshClans();
  const officer = c.role === 'leader' || c.role === 'officer';
  const act = async (yes: boolean) => { try { await api.clanBattleAnswer(b.id, yes); toast.success(yes ? 'Battle on! ⚔️' : 'Challenge dropped'); refresh(); } catch (e) { err(e); } };
  const total = Math.max(1, b.us + b.them);
  return (
    <div className={cn('glass grid gap-2 rounded-3xl p-3', b.status === 'live' && 'ring-2 ring-[#FF3D6E]')} data-testid={`clan-battle-${b.status}`}>
      <div className="flex items-center gap-2">
        <ClanBadge c={c} size={34} /><b className="text-lg">{fmt(b.us)}</b><span className="flex-1 text-center text-xs font-black text-muted">{b.status === 'live' ? `LIVE · ${until(b.ends_at)} left` : b.status === 'pending' ? (b.challenger ? 'Waiting for them…' : 'They challenged you!') : b.status === 'done' ? (b.tie ? 'A tie' : b.won ? '🏆 You won!' : 'They won') : b.status}</span>
        <b className="text-lg">{fmt(b.them)}</b><Link to={`/clans/${b.vs.id}`}><ClanBadge c={b.vs} size={34} /></Link>
      </div>
      {b.status !== 'pending' && <div className="flex h-2.5 overflow-hidden rounded-full bg-black/25"><div style={{ width: `${(b.us / total) * 100}%`, background: c.color }} /><div style={{ width: `${(b.them / total) * 100}%`, background: b.vs.color }} /></div>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>vs <b className="text-fg">{b.vs.name}</b> [{b.vs.tag}]{b.mine ? ` · you scored ${fmt(b.mine)}` : ''}</span>
        {b.status === 'pending' && !b.challenger && officer && <span className="flex gap-1"><Button size="sm" variant="rainbow" onClick={() => void act(true)} data-testid="clan-battle-accept">Accept</Button><Button size="sm" variant="ghost" onClick={() => void act(false)}>Decline</Button></span>}
        {b.status === 'pending' && b.challenger && officer && <Button size="sm" variant="ghost" onClick={() => void act(false)}>Call off</Button>}
        {b.claim && <Button size="sm" variant="rainbow" loading={busy === b.claim} onClick={() => onClaim(b.claim!)} data-testid="clan-claim-battle">Collect {b.claim_ink} Ink</Button>}
      </div>
    </div>
  );
}

function Battles({ c, home }: { c: Clan; home: ClanHome }) {
  const { claim, busy } = useClaim();
  const refresh = useRefreshClans();
  const officer = c.role === 'leader' || c.role === 'officer';
  const [q, setQ] = useState('');
  const list = useQuery({ queryKey: ['clan', 'list', q.trim(), 'week'], queryFn: () => api.clanList(q.trim() || null, 'week'), enabled: officer, staleTime: 15_000 });
  const battles = c.battles ?? [];
  const busyBattle = battles.some((b) => b.status === 'live');
  return (
    <div className="grid gap-3" data-testid="clan-battles">
      <p className="text-sm text-muted">Challenge another clan to a {home.cfg.battle.hours}-hour battle: whoever’s members earn more Ink wins. Everyone who scored collects {home.cfg.battle.win_ink} Ink for a win ({home.cfg.battle.lose_ink} if you lose), and the clan gets XP either way.</p>
      {!battles.length && <Empty icon="⚔️" title="No battles yet">{officer ? 'Pick a clan below to challenge.' : 'Your officers can challenge other clans.'}</Empty>}
      {battles.map((b) => <BattleCard key={b.id} b={b} c={c} onClaim={claim} busy={busy} />)}
      {officer && !busyBattle && (
        <div className="grid gap-2">
          <b className="text-sm">Challenge a clan</b>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clans" className={inputCls} data-testid="clan-challenge-search" />
          {(list.data ?? []).filter((x) => x.id !== c.id).slice(0, 8).map((x) => (
            <ClanRow key={x.id} c={x} right={<Button size="sm" variant="secondary" data-testid="clan-challenge" disabled={battles.some((b) => b.status === 'pending' && b.vs.id === x.id)}
              onClick={async () => { try { await api.clanChallenge(x.id); toast.success(`Challenge sent to ${x.name} ⚔️`); refresh(); } catch (e) { err(e); } }}><Swords className="h-4 w-4" /> Challenge</Button>} />
          ))}
        </div>
      )}
    </div>
  );
}

const FEED_TEXT: Record<string, (f: NonNullable<Clan['feed']>[number]) => string> = {
  founded: (f) => `🎉 @${f.who?.username} founded the clan`, join: (f) => `👋 @${f.who?.username} joined`, left: (f) => `🚪 @${f.who?.username} left`,
  kicked: (f) => `🚪 @${f.who?.username} was removed`, leader: (f) => `👑 @${f.who?.username} leads the clan now`, officer: (f) => `⭐ @${f.who?.username} is an officer`,
  goal: (f) => `${f.data.emoji ?? '🎯'} Goal done: ${f.data.label}${f.who ? ` (finished by @${f.who.username})` : ''}`, level: (f) => `⬆️ The clan reached level ${f.data.level}!`,
  challenged: (f) => `⚔️ ${f.vs?.name ?? 'A clan'} challenged you to a battle`, battle_start: (f) => `⚔️ Battle on against ${f.vs?.name ?? 'a clan'}`,
  renamed: (f) => `✒️ @${f.who?.username} renamed the clan “${String(f.data.to)}” (was “${String(f.data.from)}”)`,
  spirit: (f) => `🐉 The Clan Spirit grew into a ${String(f.data.name)}!${f.who ? ` (fed by @${f.who.username})` : ''}`,
  built: (f) => `${f.data.emoji ?? '🏗️'} The ${String(f.data.name)} is built!${f.who ? ` (finished by @${f.who.username})` : ''}`,
  battle_end: (f) => (f.data.tie ? `🤝 The battle with ${f.vs?.name} was a tie` : f.data.won ? `🏆 You beat ${f.vs?.name}!` : `😤 ${f.vs?.name} won the battle`),
};
function Feed({ c }: { c: Clan }) {
  if (!c.feed?.length) return <Empty icon="📜" title="Nothing yet">Clan news shows up here.</Empty>;
  return (
    <div className="grid gap-1.5" data-testid="clan-feed">
      {c.feed.map((f) => <div key={f.id} className="glass flex items-center gap-2 rounded-2xl px-3 py-2 text-sm"><span className="min-w-0 flex-1">{(FEED_TEXT[f.kind] ?? (() => f.kind))(f)}</span><span className="shrink-0 text-xs text-muted">{timeAgo(f.created_at)}</span></div>)}
    </div>
  );
}

function Settings({ c, home }: { c: Clan; home: ClanHome }) {
  const refresh = useRefreshClans();
  const [motto, setMotto] = useState(c.motto ?? '');
  const edit = async (p: Record<string, string | null>) => { try { await api.clanEdit(p); toast.success('Saved'); refresh(); } catch (e) { err(e); } };
  return (
    <div className="glass grid gap-4 rounded-3xl p-4" data-testid="clan-settings">
      <div className="grid gap-1 text-sm font-bold">Emblem
        <div className="flex flex-wrap gap-1.5">{home.cfg.emblems.map((e) => <button key={e} onClick={() => void edit({ emblem: e })} className={cn('grid h-10 w-10 place-items-center rounded-xl text-2xl', c.emblem === e ? 'bg-accent ring-2 ring-white' : 'bg-surface-2')}>{e}</button>)}</div></div>
      <div className="grid gap-1 text-sm font-bold">Colour
        <div className="flex flex-wrap gap-1.5">{home.cfg.colors.map((x) => <button key={x} onClick={() => void edit({ color: x })} aria-label={x} className={cn('h-9 w-9 rounded-full border-2', c.color === x ? 'border-white' : 'border-transparent')} style={{ background: x }} />)}</div></div>
      <form onSubmit={(e) => { e.preventDefault(); void edit({ motto: motto.trim() || null }); }} className="grid gap-1 text-sm font-bold">Motto
        <div className="flex gap-2"><input value={motto} maxLength={80} onChange={(e) => setMotto(e.target.value)} className={inputCls} /><Button type="submit" variant="secondary">Save</Button></div></form>
      {c.role === 'leader' && <Rename c={c} />}
      {c.role === 'leader' && (
        <div className="grid gap-1 text-sm font-bold">Who can join
          <div className="flex flex-wrap gap-1.5">{(['open', 'request', 'invite'] as const).map((p) => <button key={p} onClick={() => void edit({ privacy: p })} className={cn('rounded-xl px-3 py-2 text-sm font-bold', c.privacy === p ? 'bg-accent text-white' : 'bg-surface-2')} data-testid={`clan-privacy-${p}`}>{PRIVACY_LABEL[p]}</button>)}</div></div>
      )}
      <p className="text-xs text-muted">Raise monuments, feed the spirit and open the chest in the Keep: <Link to="/clan/hall" className="font-bold text-accent-2">Enter the Keep →</Link></p>
    </div>
  );
}

function Rename({ c }: { c: Clan }) {
  const refresh = useRefreshClans();
  const [name, setName] = useState(c.name);
  const [busy, setBusy] = useState(false);
  const next = c.renamed_at ? new Date(new Date(c.renamed_at).getTime() + 30 * 86400_000) : null;
  const wait = next && next.getTime() > Date.now();
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await api.clanRename(name.trim()); toast.success('Renamed ✒️'); refresh(); } catch (er) { err(er); } finally { setBusy(false); } }} className="grid gap-1 text-sm font-bold" data-testid="clan-rename">
      Clan name <span className="text-xs font-normal text-muted">Only the leader can rename the clan, once every 30 days.</span>
      <div className="flex gap-2"><input value={name} maxLength={24} disabled={!!wait} onChange={(e) => setName(e.target.value)} className={inputCls} data-testid="clan-rename-input" />
        <Button type="submit" variant="secondary" loading={busy} disabled={!!wait || name.trim().length < 3 || name.trim() === c.name} data-testid="clan-rename-go">Rename</Button></div>
      {wait && <span className="text-xs font-normal text-muted">You can rename again in {until(next!.toISOString())}.</span>}
    </form>
  );
}

// ---- someone else's clan -------------------------------------------------------------------------------------------
function ClanPage({ id, home }: { id: string; home: ClanHome }) {
  const q = useQuery({ queryKey: clanKeys.one(id), queryFn: () => api.clanGet(id), retry: false });
  const refresh = useRefreshClans();
  const officerElsewhere = home.clan && home.clan.id !== id && (home.clan.role === 'leader' || home.clan.role === 'officer');
  if (q.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  const c = q.data;
  if (!c) return <Empty icon="🛡️" title="That clan couldn’t be found" action={<Link to="/clans"><Button variant="secondary">All clans</Button></Link>} />;
  return (
    <div className="grid gap-4" data-testid="clan-page">
      <Banner c={c}>
        <div className="flex items-center gap-3"><Crest c={c} />
          <div className="min-w-0 flex-1"><div className="truncate font-display text-2xl font-black">{c.name} <span className="text-white/70">[{c.tag}]</span></div>
            <div className="text-sm text-white/80">{c.motto || ''}</div><div className="text-xs text-white/70">{PRIVACY_LABEL[c.privacy]}</div></div></div>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs"><Stat2 v={`Lv ${c.level}`} l="level" /><Stat2 v={`${c.members}/${c.cap}`} l="members" /><Stat2 v={fmt(c.week_score)} l="Ink this week" /><Stat2 v={`${c.wins}–${c.losses}`} l="battles" /></div>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {c.invited ? <Button variant="rainbow" onClick={async () => { try { await api.clanAnswer(c.invited!, true); toast.success(`Welcome to ${c.name}!`); refresh(); } catch (e) { err(e); } }}>Accept the invite</Button>
            : c.asked ? <span className="rounded-xl bg-black/30 px-3 py-2 text-sm font-bold">Asked to join ✓</span> : <JoinButton c={c} home={home} />}
          {officerElsewhere && <Button variant="secondary" onClick={async () => { try { await api.clanChallenge(c.id); toast.success(`Challenge sent to ${c.name} ⚔️`); refresh(); } catch (e) { err(e); } }} data-testid="clan-page-challenge"><Swords className="h-4 w-4" /> Challenge</Button>}
        </div>
      </Banner>
      {!!c.recent_battles.length && <div className="grid gap-2"><b className="text-sm">Recent battles</b>{c.recent_battles.map((b) => (
        <div key={b.id} className="glass flex items-center gap-2 rounded-2xl p-2.5 text-sm"><ClanBadge c={b.vs} size={28} /><span className="min-w-0 flex-1 truncate">vs {b.vs.name}</span><b>{fmt(b.us)} – {fmt(b.them)}</b><span className="w-16 text-right text-xs">{b.status === 'live' ? 'LIVE' : b.tie ? 'Tie' : b.won ? 'Won' : 'Lost'}</span></div>
      ))}</div>}
      <div className="grid gap-2"><b className="text-sm">Members</b>
        {c.members_list.map((m) => (
          <Link key={m.id} to={`/u/${m.username}`} className="glass flex items-center gap-3 rounded-2xl p-2.5"><PlayerAvatar p={m} size={36} />
            <span className="min-w-0 flex-1 truncate font-bold">{m.display_name || m.username} <span className="text-xs font-normal text-muted">@{m.username}</span></span><span className="text-xs text-muted">{ROLE_LABEL[m.role]}</span></Link>
        ))}
      </div>
    </div>
  );
}
