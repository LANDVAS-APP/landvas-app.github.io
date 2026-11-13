// A player's front page: their rent ticking up live over a map of their own plots, then everything at a glance.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { rarityInfo } from '../../../src/shared/rarity';
import { portal } from '../../shared/api';
import { HBars, Split, TimeChart, SERIES } from '../../shared/charts';
import { PlotMap, type MapPlot } from '../../shared/PlotMap';
import { compact, date, int, perDay, perMonth, plotLabel, reasonName, tzName, usd, words } from '../../shared/format';
import { Badge, Panel, Q, Seg, Stat, useIsPhone, useTicker } from '../../shared/ui';

export default function Overview() {
  const me = useOutletContext<any>();
  const nav = useNavigate();
  const phone = useIsPhone();
  const plots = useQuery({ queryKey: ['me', 'plots'], queryFn: portal.mePlots });
  const mapPlots: MapPlot[] = useMemo(() => (plots.data?.plots ?? []).map((p) => ({ gx: p.gx, gy: p.gy, rarity: p.rarity, shiny: p.shiny, title: p.name || `Plot ${plotLabel(p.gx, p.gy)}`, sub: `${rarityInfo(p.rarity).name} · ${usd(perDay(p.rate))}/day${p.city ? ` · ${p.city}` : ''}` })), [plots.data]);
  const rent = me.rent ?? {};
  const boosted = rent.boost?.active;
  const rate = Number(rent.rate_usd_per_second ?? 0) * (boosted ? Number(rent.boost?.multiplier ?? 1) : 1);
  const at = useMemo(() => Date.now(), [me]);
  const live = useTicker(Number(rent.live_usd ?? 0), rate, at);
  const b = me.balances ?? {};
  return (
    <>
      <section className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <div className="p-panel flex flex-col p-5">
          <div className="flex items-center gap-2"><span className="p-label">Your USD rent</span>{boosted && <Badge tone="gold">Boost ×{rent.boost.multiplier} · {Math.ceil(rent.boost.remaining_seconds / 60)} min left</Badge>}</div>
          <div className="p-figure mt-2 break-all text-[clamp(28px,3.1vw,44px)] text-gold" data-testid="my-usd">{usd(live, { min: 8, max: 8 })}</div>
          <p className="mt-1 text-sm text-muted">Every plot you own earns a little every second, even while you’re away (up to {rent.max_offline_days ?? 30} days).</p>
          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
            <div><div className="p-label">Per day</div><div className="mt-0.5 font-semibold tnum">{usd(perDay(rate))}</div></div>
            <div><div className="p-label">Per month</div><div className="mt-0.5 font-semibold tnum">{usd(perMonth(rate))}</div></div>
            <div><div className="p-label">Earned ever</div><div className="mt-0.5 font-semibold tnum">{usd(rent.lifetime_usd)}</div></div>
          </div>
          <div className="mt-auto pt-5 text-sm text-muted">
            {me.counts.plots ? <>From <b className="text-fg">{int(me.counts.plots)}</b> plots in <b className="text-fg">{int(me.counts.cities)}</b> {me.counts.cities === 1 ? 'city' : 'cities'} and <b className="text-fg">{int(me.counts.countries)}</b> {me.counts.countries === 1 ? 'country' : 'countries'}.</> : 'Claim your first plot in the game to start earning.'}
            {' '}<Link to="/earnings" className="text-accent-2 hover:underline">See every earning</Link>
          </div>
        </div>
        <PlotMap plots={mapPlots} height={phone ? 280 : 360} onPick={(p) => nav(`/plots/${p.gx}/${p.gy}`)} />
      </section>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
        <Stat label="Ink" value={compact(b.ink)} sub={`${compact(me.lifetime?.ink?.in ?? 0)} earned ever`} />
        <Stat label="Pigments" value={compact(b.pigments)} />
        <Stat label="XP" value={compact(b.brush_points)} />
        <Stat label="Gallery tokens" value={compact(b.gallery_tokens)} />
        <Stat label="Plots" value={int(me.counts.plots)} sub={`${int(me.counts.shiny)} shiny`} />
        <Stat label="Daily streak" value={int(me.streak?.streak ?? 0)} sub={`best ${int(me.streak?.best ?? 0)}`} />
        <Stat label="Rank by plots" value={`#${int(me.rank.plots)}`} sub={`of ${int(me.rank.players)} players`} />
        <Stat label="Rank by rent" value={`#${int(me.rank.usd)}`} sub="lifetime USD" />
      </div>
      <Recent />
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Panel title="Your plots by rarity" actions={<Link to="/collection" className="text-sm text-accent-2 hover:underline">Collection</Link>}>
          {Object.keys(me.rarities ?? {}).length ? (
            <Split parts={Object.entries(me.rarities).map(([k, v]) => ({ label: rarityInfo(k).name || words(k), value: Number(v), color: rarityInfo(k).color, s: rarityInfo(k).sort })).sort((a, c) => a.s - c.s)} />
          ) : <p className="text-sm text-muted">No plots yet.</p>}
        </Panel>
        <InkSources />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Panel title="You so far">
          <ul className="grid gap-1.5 text-sm">
            <li>Playing since <b>{date(me.player?.created_at)}</b></li>
            {me.first_plot_at && <li>First plot on <b>{date(me.first_plot_at)}</b></li>}
            <li><b>{int(me.counts.plots_ever)}</b> plots owned at some point</li>
            <li><b>{int(me.counts.wins)}</b> minigames won of <b>{int(me.counts.sessions)}</b> played</li>
            <li><b>{int(me.counts.achievements)}</b> of {int(me.counts.achievements_total)} achievements</li>
            <li><b>{int(me.streak?.total_days ?? 0)}</b> days played</li>
          </ul>
        </Panel>
        <Panel title="What you’ve built">
          <ul className="grid gap-1.5 text-sm">
            <li><b>{int(me.counts.groups)}</b> plot groups</li>
            <li><b>{int(me.counts.enchantments)}</b> enchantments</li>
            <li><b>{int(me.counts.inkborn)}</b> Inkborn</li>
            <li><b>{int(me.counts.publications)}</b> published artworks</li>
            <li><b>{int(me.counts.named)}</b> named plots</li>
          </ul>
        </Panel>
        <Panel title="People">
          <ul className="grid gap-1.5 text-sm">
            <li><b>{int(me.counts.friends)}</b> friends</li>
            <li>{me.clan ? <>In <b>{me.clan.name}</b> [{me.clan.tag}] as {me.clan.role}, with {int(me.clan.members)} members</> : 'Not in a clan'}</li>
            <li><b>{int(me.counts.invited)}</b> players joined with your invite</li>
          </ul>
        </Panel>
      </div>
    </>
  );
}

function Recent() {
  const [days, setDays] = useState(30);
  const tz = tzName();
  const s = useQuery({ queryKey: ['me', 'series', days, tz], queryFn: () => portal.meSeries(days, tz) });
  return (
    <>
      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-body)' }}>Your last {days} days</h2>
        <Seg label="Time range" value={days} onChange={setDays} options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }, { value: 365, label: 'A year' }]} />
      </div>
      <Q q={s}>{(rows) => (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Ink earned and spent"><TimeChart type="bar" x={rows.map((r) => r.day)} series={[{ name: 'Earned', values: rows.map((r) => r.ink_in) }, { name: 'Spent', values: rows.map((r) => r.ink_out) }]} format={(v) => int(v)} height={200} /></Panel>
          <Panel title="USD rent settled"><TimeChart type="area" x={rows.map((r) => r.day)} series={[{ name: 'Rent', values: rows.map((r) => r.usd_rent), color: SERIES[3] }]} format={(v) => usd(v)} height={200} /></Panel>
        </div>
      )}</Q>
    </>
  );
}

function InkSources() {
  const q = useQuery({ queryKey: ['me', 'ledger-reasons'], queryFn: () => portal.meLedger({ limit: 1 }) });
  return (
    <Panel title="Where your Ink comes from" actions={<Link to="/ledger" className="text-sm text-accent-2 hover:underline">Every entry</Link>}>
      <Q q={q}>{(d) => {
        const items = d.reasons.filter((r) => r.resource === 'ink' && r.in > 0).sort((a, c) => c.in - a.in).slice(0, 8);
        return items.length ? <HBars items={items.map((r, i) => ({ key: r.reason, label: reasonName(r.reason), value: Number(r.in), color: SERIES[i % 8], note: `× ${int(r.n)}` }))} format={compact} /> : <p className="text-sm text-muted">Win plot minigames to earn your first Ink.</p>;
      }}</Q>
    </Panel>
  );
}
