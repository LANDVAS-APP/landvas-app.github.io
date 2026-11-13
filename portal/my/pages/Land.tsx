// A player's land: every plot on a map and in a table, each plot's full story, their collection and enchantments.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink } from 'lucide-react';
import { api } from '../../../src/backend/api';
import { Button } from '../../../src/ui';
import { RARITY_ORDER, rarities, rarityInfo, isUltra } from '../../../src/shared/rarity';
import { portal, type MyPlot } from '../../shared/api';
import { HBars, SERIES } from '../../shared/charts';
import { PlotMap, type MapPlot } from '../../shared/PlotMap';
import { DataTable, type Col } from '../../shared/table';
import { compact, date, dateTime, downloadFile, duration, int, perDay, perMonth, plotLabel, toCsv, usd, words } from '../../shared/format';
import { Badge, Empty, Json, KV, PageHeader, Panel, Q, Rarity, Stat, statusTone } from '../../shared/ui';

export function Plots() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['me', 'plots'], queryFn: portal.mePlots });
  const [rar, setRar] = useState<string>('all');
  const [find, setFind] = useState('');
  const [focus, setFocus] = useState<{ gx: number; gy: number } | null>(null);
  return (
    <>
      <PageHeader title="My plots" sub="Every plot you own: where it is, what it earns, and how you got it. Click one for its full history." />
      <Q q={q}>{(d) => {
        const list = d.plots.filter((p) => (rar === 'all' || p.rarity === rar) && (!find || `${p.name ?? ''} ${p.city ?? ''} ${p.country_name ?? ''} ${p.plot_type}`.toLowerCase().includes(find.toLowerCase())));
        const mp: MapPlot[] = list.map((p) => ({ gx: p.gx, gy: p.gy, rarity: p.rarity, shiny: p.shiny, title: p.name || `Plot ${plotLabel(p.gx, p.gy)}`, sub: `${rarityInfo(p.rarity).name} · ${usd(perDay(p.rate))}/day` }));
        const total = d.plots.reduce((a, p) => a + p.rate, 0);
        const owned = new Set(d.plots.map((p) => p.rarity));
        const cols: Col<MyPlot>[] = [
          { key: 'name', label: 'Plot', render: (p) => <span className="block min-w-[140px]"><b>{p.name ?? `Plot ${plotLabel(p.gx, p.gy)}`}</b>{p.name && <span className="block text-xs text-faint tnum">{plotLabel(p.gx, p.gy)}</span>}</span> },
          { key: 'rarity', label: 'Rarity', sort: (p) => rarityInfo(p.rarity).sort, render: (p) => <Rarity id={p.rarity} shiny={p.shiny} /> },
          { key: 'plot_type', label: 'Type', sort: true, render: (p) => words(p.plot_type) },
          { key: 'level', label: 'Level', num: true, sort: true },
          { key: 'rate', label: 'Earns / day', num: true, sort: true, render: (p) => usd(perDay(p.rate)) },
          { key: 'city', label: 'Where', sort: (p) => `${p.country_name ?? ''} ${p.city ?? ''}`, render: (p) => (p.city ? <span>{p.city}<span className="text-faint">, {p.country_name ?? p.country}</span></span> : '—') },
          { key: 'group', label: 'Used as', render: (p) => (p.group ? <span>{words(p.group.kind)}{p.group.plots > 1 && <span className="text-faint"> · {p.group.plots} merged</span>}</span> : '—') },
          { key: 'enchantment', label: 'Enchantment', render: (p) => (p.enchantment ? `${words(p.enchantment.kind)} lvl ${p.enchantment.level}` : '—') },
          { key: 'progress', label: 'Games', num: true, sort: (p) => p.progress?.plays ?? 0, render: (p) => (p.progress ? `${p.progress.wins}/${p.progress.plays} · lvl ${p.progress.level}` : '—') },
          { key: 'acquired', label: 'Got it by', render: (p) => (p.acquired ? <span>{words(p.acquired.method)}{p.acquired.cost?.ink ? <span className="text-faint"> · {int(p.acquired.cost.ink)} Ink</span> : ''}</span> : '—') },
          { key: 'claimed_at', label: 'Since', sort: true, render: (p) => date(p.claimed_at) },
        ];
        return (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Plots" value={int(d.plots.length)} sub={`${int(d.plots.filter((p) => p.shiny).length)} shiny`} />
              <Stat label="They earn" value={`${usd(perDay(total))}/day`} tone="gold" sub={`${usd(perMonth(total))} a month`} />
              <Stat label="Rarities owned" value={int(owned.size)} sub={`of ${rarities().filter((r) => r.id !== 'enchanted').length}`} />
              <Stat label="Best earner" value={d.plots.length ? usd(perDay(Math.max(...d.plots.map((p) => p.rate)))) : '—'} sub="per day, one plot" />
            </div>
            <PlotMap plots={mp} focus={focus} height={440} onPick={(p) => nav(`/plots/${p.gx}/${p.gy}`)} />
            <Panel pad={false}>
              <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
                <input className="p-input w-60" placeholder="Search name, city, country or type" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Search plots" />
                <select className="p-input" value={rar} onChange={(e) => setRar(e.target.value)} aria-label="Rarity">
                  <option value="all">Every rarity</option>
                  {RARITY_ORDER.filter((r) => owned.has(r)).map((r) => <option key={r} value={r}>{rarityInfo(r).name}</option>)}
                </select>
                <span className="text-sm text-muted">{int(list.length)} shown</span>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => downloadFile('my-landvas-plots.csv', toCsv(list.map((p) => ({ ...p, rate_per_day: perDay(p.rate) }))), 'text/csv')}><Download className="h-4 w-4" /> Download</Button>
              </div>
              <div className="mt-3">
                <DataTable rows={list} cols={cols} rowKey={(p) => `${p.gx}_${p.gy}`} onRow={(p) => { setFocus({ gx: p.gx, gy: p.gy }); nav(`/plots/${p.gx}/${p.gy}`); }} maxHeight={620}
                  empty={<Empty title="No plots yet">Claim your free starter plot in the game.</Empty>} />
              </div>
            </Panel>
          </div>
        );
      }}</Q>
    </>
  );
}

export function Plot() {
  const { gx = '0', gy = '0' } = useParams();
  const x = Number(gx), y = Number(gy);
  const me = useOutletContext<any>();
  const q = useQuery({ queryKey: ['me', 'plot', x, y], queryFn: () => portal.mePlot(x, y) });
  return (
    <>
      <Link to="/plots" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> All my plots</Link>
      <Q q={q}>{(d) => {
        const p = d.plot, r = d.rarity ?? rarityInfo(p.rarity);
        const levelBonus = Number(me.rent?.level_bonus ?? 0.01);
        return (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="p-h1">{p.name || `Plot ${plotLabel(x, y)}`}</h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                  <Rarity id={p.rarity} shiny={p.shiny} />
                  <span>{d.type?.name ?? words(p.plot_type)}</span>
                  {d.city && <span>{d.city.name}, {d.city.country_name}</span>}
                  {!p.mine && <Badge>no longer yours</Badge>}
                  {p.locked && <Badge tone="warn">locked</Badge>}
                </div>
              </div>
              <a href="https://landvas.app/plots" target="_blank" rel="noopener"><Button size="sm"><ExternalLink className="h-4 w-4" /> Open in the game</Button></a>
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <PlotMap plots={[{ gx: x, gy: y, rarity: p.rarity, shiny: p.shiny }]} focus={{ gx: x, gy: y, zoom: 18.5 }} height={380} />
              <div className="grid content-start gap-3">
                {d.rate !== null && d.rate !== undefined && (
                  <Panel title="What it earns">
                    <div className="p-figure text-3xl text-gold">{usd(perDay(d.rate))}<span className="text-base text-muted"> a day</span></div>
                    <div className="mt-1 text-sm text-muted">{usd(perMonth(d.rate))} a month · {usd(d.rate * 3600)} an hour</div>
                    <div className="mt-3 grid gap-1 text-sm">
                      <div className="flex justify-between"><span className="text-muted">{r.name} base rate</span><span className="tnum">{usd(perDay(r.usd_per_second))}/day</span></div>
                      {p.level > 1 && <div className="flex justify-between"><span className="text-muted">Level {p.level}</span><span className="tnum">+{Math.round(levelBonus * (p.level - 1) * 100)}%</span></div>}
                      {p.shiny && <div className="flex justify-between"><span className="text-muted">Shiny</span><span className="tnum">boosted</span></div>}
                      {Number(me.rent_mult) !== 1 && <div className="flex justify-between"><span className="text-muted">Your rent bonus</span><span className="tnum">×{Number(me.rent_mult).toFixed(2)}</span></div>}
                      {isUltra(p.rarity) && r.ability && <p className="mt-1 text-xs text-muted">{r.ability}</p>}
                    </div>
                  </Panel>
                )}
                <Panel title="Details">
                  <KV cols={1} items={[
                    ['Coordinates', <span className="tnum">{plotLabel(x, y)}</span>], ['Level', p.level], ['Owned since', date(p.claimed_at)],
                    ['Used as', d.group ? `${words(d.group.kind)}${d.group.plots > 1 ? `, merged with ${d.group.plots - 1} more` : ''}` : '—'],
                    ['Region', d.region ? `${d.region.name}${d.region.state ? `, ${d.region.state}` : ''}` : '—'],
                    ['Owned before you by', `${int(d.owners_before)} player${d.owners_before === 1 ? '' : 's'}`],
                  ]} />
                </Panel>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <Panel title="Your history with it">
                {d.history.length ? <ul className="grid gap-1.5 text-sm">{d.history.map((h: any, i: number) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2"><span>{words(h.method)}{h.cost?.ink ? ` for ${int(h.cost.ink)} Ink` : ''}</span><span className="text-muted">{date(h.acquired_at)} – {h.released_at ? `${date(h.released_at)} (${words(h.release_reason)})` : 'now'}</span></li>
                ))}</ul> : <p className="text-sm text-muted">—</p>}
              </Panel>
              <Panel title="Its minigame">
                {d.progress ? <KV cols={2} items={[['Game', words(d.progress.game)], ['Highest level beaten', d.progress.highest_level], ['Best score', int(d.progress.best_score)], ['Played', int(d.progress.plays)], ['Won', int(d.progress.wins)], ['Last played', dateTime(d.progress.updated_at)]]} /> : <p className="text-sm text-muted">You haven’t played this plot’s minigame yet.</p>}
              </Panel>
            </div>
            <Panel title={`Every game you played here (${d.sessions.length})`} pad={false}>
              <DataTable rows={d.sessions} rowKey={(s: any) => s.id} maxHeight={420} empty={<Empty title="No games here yet" />} cols={[
                { key: 'started_at', label: 'When', render: (s: any) => dateTime(s.started_at) }, { key: 'game', label: 'Game', render: (s: any) => words(s.game) },
                { key: 'level', label: 'Level', num: true }, { key: 'passed', label: 'Result', render: (s: any) => (s.passed ? <span className="text-ok">won</span> : s.finished_at ? 'lost' : words(s.status)) },
                { key: 'score', label: 'Score', num: true, render: (s: any) => int(s.score) }, { key: 'stars', label: 'Stars', num: true }, { key: 'play_ms', label: 'Time', num: true, render: (s: any) => (s.play_ms ? duration(s.play_ms) : '—') },
              ]} />
            </Panel>
            {d.art.length > 0 && <Panel title="Its art over time"><ul className="grid gap-1.5 text-sm">{d.art.map((a: any, i: number) => <li key={i} className="flex justify-between gap-2"><span>{a.title ?? 'Untitled'} {a.mine ? '' : <span className="text-faint">(someone else’s)</span>}</span><span className="text-muted">{date(a.set_at)}</span></li>)}</ul></Panel>}
            {d.enchantment && <Panel title={`Enchantment: ${words(d.enchantment.kind)}`}><KV items={[['Nickname', d.enchantment.nickname ?? '—'], ['Level', d.enchantment.level], ['XP', int(d.enchantment.xp)], ['Serial', `#${d.enchantment.serial}`], ['Born', `${date(d.enchantment.born_at)}${d.enchantment.born_place ? ` in ${d.enchantment.born_place}` : ''}`], ['Status', d.enchantment.status]]} /><details className="mt-3"><summary className="cursor-pointer text-sm text-muted">Everything about it</summary><Json value={d.enchantment} className="mt-2" /></details></Panel>}
          </div>
        );
      }}</Q>
    </>
  );
}

export function Collection() {
  const me = useOutletContext<any>();
  const col = useQuery({ queryKey: ['me', 'collection'], queryFn: api.myCollection });
  const ach = useQuery({ queryKey: ['me', 'achievements'], queryFn: api.achievements });
  const plots = useQuery({ queryKey: ['me', 'plots'], queryFn: portal.mePlots });
  const all = rarities().filter((r) => r.id !== 'enchanted').sort((a, b) => a.sort - b.sort);
  const owned = me.rarities ?? {};
  const countries = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of plots.data?.plots ?? []) if (p.country_name || p.country) m.set(p.country_name ?? p.country!, (m.get(p.country_name ?? p.country!) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [plots.data]);
  const cities = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of plots.data?.plots ?? []) if (p.city) m.set(`${p.city}, ${p.country ?? ''}`, (m.get(`${p.city}, ${p.country ?? ''}`) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [plots.data]);
  return (
    <>
      <PageHeader title="Collection" sub="Which rarities, plot types and places you’ve collected, and every achievement." />
      <div className="grid gap-3">
        <Panel title={`Rarities: ${Object.keys(owned).length} of ${all.length}`}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {all.map((r) => {
              const n = Number(owned[r.id] ?? 0);
              return (
                <div key={r.id} className={`flex items-center gap-3 rounded-xl border p-3 ${n ? 'border-line' : 'border-dashed border-line opacity-55'}`}>
                  <span className="h-8 w-8 shrink-0 rounded-md" style={{ background: n ? r.color : 'transparent', boxShadow: `inset 0 0 0 2px ${r.color}` }} />
                  <div className="min-w-0 flex-1"><div className="font-semibold">{r.name}</div><div className="text-xs text-muted">{n ? `${int(n)} owned` : 'not yet'} · {usd(perDay(r.usd_per_second))}/day each</div></div>
                  {isUltra(r.id) && <Badge tone="gold">ultra</Badge>}
                </div>
              );
            })}
          </div>
        </Panel>
        <div className="grid gap-3 lg:grid-cols-3">
          <Panel title="Plot types"><HBars items={Object.entries(me.plot_types ?? {}).map(([k, v], i) => ({ key: k, label: words(k), value: Number(v), color: SERIES[i % 8] }))} /></Panel>
          <Panel title={`Countries (${countries.length})`}><HBars items={countries.map(([k, v], i) => ({ key: k, label: k, value: v, color: SERIES[i % 8] }))} /></Panel>
          <Panel title="Top cities"><HBars items={cities.map(([k, v], i) => ({ key: k, label: k, value: v, color: SERIES[(i + 2) % 8] }))} /></Panel>
        </div>
        {col.data && <Panel title="Collection bonuses"><Json value={col.data} max={300} /></Panel>}
        <Panel title={`Achievements: ${int(me.counts.achievements)} of ${int(me.counts.achievements_total)}`} pad={false}>
          <Q q={ach}>{(list) => (
            <DataTable rows={[...list].sort((a, b) => Number(!!b.unlocked_at) - Number(!!a.unlocked_at) || b.progress / Math.max(1, b.threshold) - a.progress / Math.max(1, a.threshold))} rowKey={(a) => a.key} maxHeight={560} cols={[
              { key: 'name', label: 'Achievement', render: (a) => <span><b>{a.icon} {a.name}</b><span className="block text-xs text-muted">{a.description}</span></span> },
              { key: 'category', label: 'Kind', render: (a) => words(a.category) },
              { key: 'progress', label: 'Progress', num: true, render: (a) => (
                <span className="inline-flex items-center gap-2"><span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (a.progress / Math.max(1, a.threshold)) * 100)}%` }} /></span>{int(Math.min(a.progress, a.threshold))}/{int(a.threshold)}</span>
              ) },
              { key: 'reward', label: 'Reward', render: (a) => Object.entries(a.reward ?? {}).map(([k, v]) => `${compact(v)} ${words(k)}`).join(', ') || '—' },
              { key: 'unlocked_at', label: 'Unlocked', render: (a) => (a.unlocked_at ? <span className="text-ok">{date(a.unlocked_at)}</span> : '—') },
              { key: 'unlocked_by', label: 'Players with it', num: true, render: (a) => int(a.unlocked_by) },
            ]} />
          )}</Q>
        </Panel>
      </div>
    </>
  );
}

export function Enchantments() {
  const q = useQuery({ queryKey: ['me', 'enchantments'], queryFn: api.myEnchantments });
  return (
    <>
      <PageHeader title="Enchantments" sub="The enchantments living on your plots. Manage them from the Grimoire in the game." />
      <Q q={q}>{(list) => list.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((e) => (
            <Panel key={e.id} title={<span>{e.emoji} {e.nickname || e.name} <span className="text-faint">#{e.serial}</span></span>} actions={<Badge tone={statusTone(e.status)}>{e.status}</Badge>}>
              <KV cols={1} items={[
                ['Kind', words(e.kind)], ['Level', `${e.level} · ${int(e.xp)} XP`], ['On plot', <Link className="text-accent-2" to={`/plots/${e.gx}/${e.gy}`}>{plotLabel(e.gx, e.gy)}</Link>],
                ['Born', `${date(e.born_at)}${e.born_place ? ` in ${e.born_place}` : ''}`], ['One of', `${int(e.population)} of this kind`], ['Ink made', int(e.minted)],
                ...(e.partner ? [['Spliced with', `${words(e.partner.kind)} until ${dateTime(e.partner.ends_at)}`] as [string, string]] : []),
                ...(e.titles?.length ? [['Titles', e.titles.join(', ')] as [string, string]] : []),
              ]} />
              {e.stats && Object.keys(e.stats).length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{Object.entries(e.stats).map(([k, v]) => <Badge key={k}>{words(k)} {int(v)}</Badge>)}</div>}
            </Panel>
          ))}
        </div>
      ) : <Empty title="No enchantments yet">Some plot rolls come out Enchanted. When one does, it shows up here.</Empty>}</Q>
    </>
  );
}
