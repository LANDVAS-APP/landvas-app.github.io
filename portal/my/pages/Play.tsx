// How a player plays: a year of activity, every minigame, records, their Inkborn, friends, clan and invites.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../../src/backend/api';
import { Button, PlayerAvatar } from '../../../src/ui';
import { portal, type Day } from '../../shared/api';
import { DataTable } from '../../shared/table';
import { ago, date, dateShort, dateTime, duration, int, plotLabel, tzName, words, gameName } from '../../shared/format';
import { Badge, Empty, KV, PageHeader, Panel, Q, Stat, statusTone } from '../../shared/ui';

export function ActivityPage() {
  const me = useOutletContext<any>();
  const tz = tzName();
  const year = useQuery({ queryKey: ['me', 'series', 365, tz], queryFn: () => portal.meSeries(365, tz) });
  const records = useQuery({ queryKey: ['me', 'records'], queryFn: api.myMinigameRecords });
  const [offset, setOffset] = useState(0);
  const sessions = useQuery({ queryKey: ['me', 'rows', 'minigame_sessions', offset], queryFn: () => portal.meRows('minigame_sessions', 'player_id', 100, offset) });
  return (
    <>
      <PageHeader title="Activity" sub="Every day you played this year, and every minigame you started." />
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Daily streak" value={int(me.streak?.streak ?? 0)} sub={me.streak?.last_day ? `last counted ${dateShort(me.streak.last_day)}` : undefined} />
          <Stat label="Best streak" value={int(me.streak?.best ?? 0)} />
          <Stat label="Days played" value={int(me.streak?.total_days ?? 0)} />
          <Stat label="Minigames won" value={int(me.counts.wins)} sub={`of ${int(me.counts.sessions)} · ${me.counts.sessions ? Math.round((me.counts.wins / me.counts.sessions) * 100) : 0}%`} />
        </div>
        <Panel title="Your year"><Q q={year}>{(d) => <Calendar days={d} />}</Q></Panel>
        <Panel title="Your best score on every level" pad={false}>
          <Q q={records}>{(r: any) => {
            const rows = Object.entries(r?.level_bests ?? {}).map(([k, v]) => { const [game, level] = k.split(':'); return { game, level: Number(level), best: Number(v) }; })
              .sort((a, b) => a.game.localeCompare(b.game) || a.level - b.level);
            const today = Object.entries(r?.rewarded_today ?? {});
            return (
              <>
                <DataTable rows={rows} rowKey={(x) => `${x.game}:${x.level}`} empty={<Empty title="No scores yet">Win a plot minigame to set your first best score.</Empty>} cols={[
                  { key: 'game', label: 'Game', sort: true, render: (x) => gameName(x.game) },
                  { key: 'level', label: 'Level', num: true, sort: true },
                  { key: 'best', label: 'Best score', num: true, sort: true, render: (x) => int(x.best) },
                ]} />
                <p className="px-4 py-3 text-xs text-muted">Rewarded wins today: {today.length ? today.map(([g, n]) => `${gameName(g)} ${n}`).join(', ') : 'none yet'} (up to {int(r?.daily_rewarded_wins_per_game ?? 0)} per game a day, resets {dateTime(r?.resets_at)}).</p>
              </>
            );
          }}</Q>
        </Panel>
        <Panel title="Every minigame you started" pad={false}>
          <Q q={sessions}>{(d) => (
            <>
              <DataTable rows={d.rows} rowKey={(s: any) => s.id} maxHeight={560} empty={<Empty title="No minigames yet" />} cols={[
                { key: 'started_at', label: 'When', render: (s: any) => dateTime(s.started_at) }, { key: 'game', label: 'Game', render: (s: any) => gameName(s.game) }, { key: 'level', label: 'Level', num: true },
                { key: 'plot', label: 'Plot', render: (s: any) => (s.gx != null ? <a className="tnum text-accent-2" href={`/plots/${s.gx}/${s.gy}`}>{plotLabel(s.gx, s.gy)}</a> : '—') },
                { key: 'passed', label: 'Result', render: (s: any) => (s.passed ? <span className="text-ok">won</span> : s.finished_at ? 'lost' : words(s.status)) },
                { key: 'score', label: 'Score', num: true, render: (s: any) => int(s.score) }, { key: 'stars', label: 'Stars', num: true, render: (s: any) => s.stars ?? '—' },
                { key: 'play_ms', label: 'Time', num: true, render: (s: any) => (s.play_ms ? duration(s.play_ms) : '—') },
              ]} />
              <div className="flex items-center justify-between px-4 py-3 text-xs text-muted">
                <span className="tnum">{d.total ? `${offset + 1}–${offset + d.rows.length} of ${int(d.total)}` : ''}</span>
                <span className="flex gap-1.5"><Button size="sm" variant="ghost" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 100))}>Newer</Button><Button size="sm" variant="ghost" disabled={offset + d.rows.length >= d.total} onClick={() => setOffset(offset + 100)}>Older</Button></span>
              </div>
            </>
          )}</Q>
        </Panel>
      </div>
    </>
  );
}

/** a year of days as plot squares, darker the more you played (one-hue sequential ramp) */
function Calendar({ days }: { days: Day[] }) {
  const score = (d: Day) => d.sessions + (d.ink_in > 0 ? 1 : 0) + d.plots;
  const max = Math.max(1, ...days.map(score));
  const RAMP = ['rgba(160,180,255,0.08)', '#184f95', '#256abf', '#3987e5', '#6da7ec'];
  const level = (d: Day) => { const s = score(d); return s === 0 ? 0 : Math.min(4, 1 + Math.floor((s / max) * 3.999)); };
  const first = days.length ? new Date(`${days[0].day}T12:00:00`) : new Date();
  const pad = first.getDay();
  const cells: (Day | null)[] = [...Array(pad).fill(null), ...days];
  const weeks: (Day | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const active = days.filter((d) => score(d) > 0).length;
  const [hover, setHover] = useState<Day | null>(null);
  const months = useMemo(() => weeks.map((w, i) => { const d = w.find(Boolean); if (!d) return ''; const m = new Date(`${d.day}T12:00:00`); return m.getDate() <= 7 || i === 0 ? m.toLocaleDateString('en-US', { month: 'short' }) : ''; }), [weeks]);
  // on a narrow screen, open on the latest weeks (the right end) rather than a year ago
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (box.current) box.current.scrollLeft = box.current.scrollWidth; }, [weeks.length]);
  return (
    <div>
      <div ref={box} className="p-scroll pb-2">
        <div className="inline-grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, 13px)` }}>
          {months.map((m, i) => <div key={`m${i}`} className="h-4 text-[10px] text-faint">{m}</div>)}
          {weeks.map((w, i) => (
            <div key={i} className="grid gap-[3px]" style={{ gridRow: 2 }}>
              {Array.from({ length: 7 }, (_, k) => {
                const d = w[k];
                return <div key={k} className="h-[13px] w-[13px] rounded-[3px]" style={{ background: d ? RAMP[level(d)] : 'transparent' }}
                  onMouseEnter={() => d && setHover(d)} onMouseLeave={() => setHover(null)} title={d ? `${date(d.day)}: ${d.sessions} games, ${int(d.ink_in)} Ink, ${d.plots} plots` : undefined} />;
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{hover ? `${date(hover.day)}: ${int(hover.sessions)} games, ${int(hover.ink_in)} Ink earned, ${int(hover.plots)} plots` : `Active on ${int(active)} of the last ${int(days.length)} days`}</span>
        <span className="inline-flex items-center gap-1">Less {RAMP.map((c) => <span key={c} className="h-[11px] w-[11px] rounded-[3px]" style={{ background: c }} />)} More</span>
      </div>
    </div>
  );
}

export function Inkborn() {
  const q = useQuery({ queryKey: ['me', 'rows', 'inkborn'], queryFn: () => portal.meRows('inkborn', 'owner_id', 200) });
  const eggs = useQuery({ queryKey: ['me', 'rows', 'inkborn_eggs'], queryFn: () => portal.meRows('inkborn_eggs', 'owner_id', 100).catch(() => ({ rows: [], total: 0 })) });
  return (
    <>
      <PageHeader title="Inkborn" sub="Your creatures and how they’re doing. Feed, play and send them on jobs in the game." />
      <Q q={q}>{(d) => d.rows.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {d.rows.map((c: any) => (
            <Panel key={c.id} title={c.name ?? 'Unnamed'} actions={c.job && c.job_until && new Date(c.job_until) > new Date() ? <Badge tone="accent">on a job</Badge> : null}>
              <div className="grid gap-2">
                {(['happiness', 'energy', 'bond'] as const).map((k) => (
                  <div key={k} className="grid grid-cols-[80px_minmax(0,1fr)_40px] items-center gap-2 text-sm">
                    <span className="text-muted">{words(k)}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, Number(c[k] ?? 0)))}%`, background: k === 'happiness' ? 'var(--series-3)' : k === 'energy' ? 'var(--series-4)' : 'var(--series-5)' }} /></span>
                    <span className="text-right tnum">{int(c[k])}</span>
                  </div>
                ))}
              </div>
              <div className="viz mt-3"><KV cols={1} items={[['Personality', words(c.personality)], ['Came from', words(c.source)], ['Born', date(c.created_at)], ['Last fed', ago(c.last_fed)], ['Last played with', ago(c.last_played)], ...(c.job ? [['Job', `${words(c.job)}${c.job_until ? ` until ${dateTime(c.job_until)}` : ''}`] as [string, string]] : [])]} /></div>
            </Panel>
          ))}
        </div>
      ) : <Empty title="No Inkborn yet">Draw one in the game’s Inkborn studio.</Empty>}</Q>
      {eggs.data && eggs.data.rows.length > 0 && (
        <Panel className="mt-3" title={`Eggs (${eggs.data.total})`} pad={false}>
          <DataTable rows={eggs.data.rows} rowKey={(r: any, i) => r.id ?? String(i)} cols={Object.keys(eggs.data.rows[0]).filter((k) => !['owner_id', 'id', 'genome', 'drawing'].includes(k)).slice(0, 7).map((k) => ({ key: k, label: words(k), render: (r: any) => (/_at$/.test(k) ? dateTime(r[k]) : typeof r[k] === 'object' ? JSON.stringify(r[k]) : String(r[k] ?? '—')) }))} />
        </Panel>
      )}
    </>
  );
}

export function Social() {
  const me = useOutletContext<any>();
  const friends = useQuery({ queryKey: ['me', 'friends'], queryFn: api.myFriends });
  const refs = useQuery({ queryKey: ['me', 'referrals'], queryFn: api.myReferrals });
  return (
    <>
      <PageHeader title="Friends & clan" sub="The people you play with." />
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title={`Friends (${friends.data?.friends.length ?? '…'})`}>
          <Q q={friends}>{(f) => f.friends.length ? (
            <ul className="grid gap-2">{f.friends.map((x) => (
              <li key={x.player.id} className="flex items-center gap-3 text-sm">
                <PlayerAvatar p={x.player} size={32} />
                <span className="min-w-0 flex-1"><b>@{x.player.username}</b><span className="block text-xs text-muted">friends since {date(x.since)} · {int(x.plots)} plots</span></span>
                <a className="text-xs text-accent-2 hover:underline" href={`https://landvas.app/u/${encodeURIComponent(x.player.username)}`} target="_blank" rel="noopener">Profile</a>
              </li>
            ))}</ul>
          ) : <Empty title="No friends yet">Add friends from their profile in the game.</Empty>}</Q>
          {friends.data && (friends.data.incoming.length > 0 || friends.data.outgoing.length > 0) && (
            <p className="mt-3 text-sm text-muted">{friends.data.incoming.length} request{friends.data.incoming.length === 1 ? '' : 's'} waiting for you · {friends.data.outgoing.length} sent</p>
          )}
        </Panel>
        <div className="grid content-start gap-3">
          <Panel title="Clan">
            {me.clan ? <KV cols={1} items={[['Clan', `${me.clan.name} [${me.clan.tag}]`], ['Your role', words(me.clan.role)], ['Members', int(me.clan.members)], ['Joined', date(me.clan.joined_at)]]} /> : <p className="text-sm text-muted">You’re not in a clan. Find one in the game.</p>}
          </Panel>
          <Panel title="Invites">
            <Q q={refs}>{(r: any) => (
              <div className="grid gap-2 text-sm">
                <KV cols={1} items={[
                  ['Your code', r.custom_code ?? r.default_code], ['Players who joined with it', int(r.invited ?? r.count ?? me.counts.invited)],
                  ['You get per invite', `${int(r.reward_ink)} Ink`], ['They get', `${int(r.referee_reward_ink)} Ink`],
                  ...(r.share?.enabled ? [['Share of their Ink', `${r.share.pct}% up to ${int(r.share.cap_ink)} Ink`] as [string, string]] : []),
                ]} />
                {Array.isArray(r.referred) && r.referred.length > 0 && (
                  <ul className="mt-2 grid gap-1">{r.referred.map((x: any, i: number) => <li key={i} className="flex justify-between"><span>@{x.username ?? x.player?.username}</span><Badge tone={statusTone(x.status)}>{x.status}</Badge></li>)}</ul>
                )}
              </div>
            )}</Q>
          </Panel>
        </div>
      </div>
    </>
  );
}
