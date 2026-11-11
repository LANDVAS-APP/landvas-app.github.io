// Royalty: every Crown held right now — Country monarchs, State rulers, City crowns — with the kingdom, the reign, how
// strong each Crown is, and the royal court of players with the most Crowns. Kingdom names only, never where a plot is.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Page, PageHeader } from '../app/Shell';
import { api } from '../backend/api';
import { BasePlotArt } from '../plot/BasePlotArt';
import { Empty, PlayerAvatar, Spinner } from '../ui';
import { cn, fmt } from '../lib/utils';

type Crown = {
  tier: 'crown' | 'crown_state' | 'crown_country'; city: string | null; state: string | null; country: string; country_name: string; kingdom: string;
  claimed_at: string; reign_days: number; shiny: boolean; rivals: number; need: number; strength: number; pct: number; boost: number; full_boost: number;
  is_me: boolean; holder: { id: string; username: string; display_name?: string | null } | null;
};
const TIERS = {
  crown_country: { title: 'Country Monarchs', one: 'Country Crown', emoji: '👑', color: '#FFD84D', glow: 'rgba(255,216,77,0.35)', blurb: 'One per country. The highest throne in LANDVAS.' },
  crown_state: { title: 'State Rulers', one: 'State Crown', emoji: '🏰', color: '#B69CFF', glow: 'rgba(182,156,255,0.3)', blurb: 'One per state or province.' },
  crown: { title: 'City Crowns', one: 'City Crown', emoji: '🏙️', color: '#7FE3FF', glow: 'rgba(127,227,255,0.25)', blurb: 'One for every city in the world.' },
} as const;
const flag = (cc: string) => (/^[A-Za-z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 0x1f1a5 + ch.charCodeAt(0))) : '🏳️');
const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const reign = (d: number) => (d < 1 ? 'crowned today' : d === 1 ? 'reigning 1 day' : `reigning ${fmt(d)} days`);

function CrownCard({ c }: { c: Crown }) {
  const t = TIERS[c.tier];
  const where = c.tier === 'crown' ? [c.state, c.country_name].filter(Boolean).join(', ') : c.tier === 'crown_state' ? c.country_name : '';
  return (
    <article className={cn('glass relative grid gap-3 overflow-hidden rounded-3xl p-4', c.tier === 'crown_country' && 'p-5')}
      style={{ boxShadow: `inset 0 0 0 1.5px ${t.color}55, 0 10px 40px -18px ${t.glow}` }} data-testid={`royal-${c.tier}`}>
      <div className="pointer-events-none absolute -right-6 -top-8 text-[96px] opacity-[0.08]">{t.emoji}</div>
      <header className="flex items-center gap-3">
        {c.holder ? (
          <Link to={`/u/${c.holder.username}`} className="relative shrink-0">
            <PlayerAvatar p={c.holder as any} size={c.tier === 'crown_country' ? 64 : 52} frame="gold" />
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xl drop-shadow">👑</span>
          </Link>
        ) : <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-surface-2 text-2xl">🎭</div>}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: t.color }}>{t.one}{c.shiny ? ' · ✨ Shiny' : ''}</div>
          <div className="truncate font-display text-xl font-black">{flag(c.country)} {c.kingdom}</div>
          {where && <div className="truncate text-xs text-muted">{where}</div>}
        </div>
      </header>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        {c.holder ? <Link to={`/u/${c.holder.username}`} className="font-bold hover:underline">{c.is_me ? 'You' : c.holder.display_name || `@${c.holder.username}`}</Link> : <span className="font-bold text-muted">A secret monarch</span>}
        <span className="text-xs text-muted">since {date(c.claimed_at)} · {reign(c.reign_days)}</span>
      </div>
      <div className="grid gap-1">
        <div className="flex justify-between text-[11px] text-muted"><span>Kingdom strength · {fmt(c.rivals)}/{fmt(c.need)} other landholders</span><b className="tnum" style={{ color: t.color }}>×{c.boost.toFixed(2)} rent</b></div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.max(3, c.strength * 100)}%`, background: `linear-gradient(90deg, ${t.color}99, ${t.color})` }} /></div>
        {c.strength < 1 && <div className="text-[11px] text-faint">Full strength (×{c.full_boost.toFixed(2)} on all their rent) once {fmt(c.need - c.rivals)} more {c.need - c.rivals === 1 ? 'player claims' : 'players claim'} land here.</div>}
      </div>
    </article>
  );
}

export default function Royalty() {
  const q = useQuery({ queryKey: ['royalty'], queryFn: api.royalty, staleTime: 60_000 });
  if (q.isLoading) return <Page><div className="flex justify-center py-24"><Spinner /></div></Page>;
  if (!q.data) return <Page><Empty title="Royalty couldn’t load">Check your connection and try again.</Empty></Page>;
  const d = q.data;
  const crowns = (d.crowns ?? []) as Crown[];
  const tot = d.totals ?? {};
  const court = (d.court ?? []) as any[];
  const left = { crown_country: Math.max(0, tot.countries - tot.country), crown_state: Math.max(0, tot.states - tot.state), crown: Math.max(0, tot.cities - tot.city) };
  return (
    <Page>
      <section className="relative mb-8 overflow-hidden rounded-[32px] p-6 text-center" data-testid="royalty-hero"
        style={{ background: 'radial-gradient(120% 90% at 50% 0%, rgba(255,216,77,0.22), transparent 60%), radial-gradient(80% 80% at 100% 100%, rgba(182,156,255,0.18), transparent 60%)', boxShadow: 'inset 0 0 0 1.5px rgba(255,216,77,0.25)' }}>
        <div className="mb-1 text-5xl drop-shadow-[0_6px_18px_rgba(255,216,77,0.5)]">👑</div>
        <h1 className="bg-[linear-gradient(90deg,#FFE9A3,#FFD84D,#FFB13D)] bg-clip-text font-display text-4xl font-black text-transparent">Royalty</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">Every city, state and country in the world has exactly one Crown. These are the players who hold them.</p>
        <div className="mx-auto mt-4 grid max-w-md grid-cols-3 gap-2" data-testid="royalty-totals">
          {(['crown_country', 'crown_state', 'crown'] as const).map((k) => (
            <div key={k} className="rounded-2xl bg-black/20 p-2.5">
              <div className="font-display text-2xl font-black tnum" style={{ color: TIERS[k].color }}>{fmt(k === 'crown' ? tot.city : k === 'crown_state' ? tot.state : tot.country)}</div>
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted">{TIERS[k].one}s</div>
              <div className="text-[10.5px] text-faint">{fmt(left[k])} unclaimed</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
          <Link to="/legend" className="rounded-full bg-white/10 px-3 py-1.5 font-bold hover:bg-white/15">How Crowns work</Link>
          <Link to="/rankings/rarities?r=crown" className="rounded-full bg-white/10 px-3 py-1.5 font-bold hover:bg-white/15">Rarity rankings</Link>
        </div>
      </section>

      {court.length > 0 && (
        <section className="mb-8 grid gap-3" data-testid="royal-court">
          <h2 className="font-display text-xl font-black">🏛️ The royal court</h2>
          <p className="-mt-2 text-sm text-muted">The players holding the most Crowns, highest titles first.</p>
          <ol className="glass divide-y divide-line overflow-hidden rounded-3xl">
            {court.slice(0, 10).map((m, i) => (
              <li key={m.player.id} className="flex items-center gap-3 px-4 py-3">
                <span className={cn('w-7 text-center font-display text-lg font-black', i === 0 ? 'text-gold' : 'text-muted')}>{i === 0 ? '👑' : i + 1}</span>
                <PlayerAvatar p={m.player} size={38} frame={i < 3 ? 'gold' : null} />
                <Link to={`/u/${m.player.username}`} className="min-w-0 flex-1">
                  <div className="truncate font-bold">{m.player.display_name || m.player.username}</div>
                  <div className="truncate text-xs text-muted">{[m.countries && `${m.countries} country`, m.states && `${m.states} state`, m.cities && `${m.cities} city`].filter(Boolean).join(' · ')} · ×{Number(m.rent_boost).toFixed(2)} rent</div>
                </Link>
                <span className="font-display text-lg font-black tnum">{m.crowns}<span className="ml-0.5 text-xs">👑</span></span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {(['crown_country', 'crown_state', 'crown'] as const).map((k) => {
        const list = crowns.filter((c) => c.tier === k);
        const t = TIERS[k];
        return (
          <section key={k} className="mb-8 grid gap-3" data-testid={`royal-section-${k}`}>
            <div className="flex items-center gap-3">
              <BasePlotArt rarity={k} size={40} />
              <div><h2 className="font-display text-xl font-black" style={{ color: t.color }}>{t.emoji} {t.title}</h2><p className="text-xs text-muted">{t.blurb} {fmt(list.length)} held, {fmt(left[k])} still unclaimed.</p></div>
            </div>
            {list.length ? (
              <div className={cn('grid gap-3', k === 'crown_country' ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3')}>{list.map((c, i) => <CrownCard key={`${k}-${c.kingdom}-${i}`} c={c} />)}</div>
            ) : (
              <div className="glass rounded-3xl p-5 text-center text-sm text-muted">No one holds a {t.one} yet. Every one of them is up for grabs. Claim land in a {k === 'crown' ? 'city' : k === 'crown_state' ? 'state' : 'country'} with no {t.one} and you might roll it.</div>
            )}
          </section>
        );
      })}
      <p className="mb-10 text-center text-[11px] text-faint">Places are shown by kingdom name only, never where the plot is. Players can keep themselves off this page in Settings → Privacy.</p>
    </Page>
  );
}
