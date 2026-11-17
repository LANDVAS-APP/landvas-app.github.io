// The LANDVAS Handbook: every feature in the game, how it works, with pictures, live numbers and strategy. One page per
// chapter (/handbook/:chapter, a topic at #topic), an index with search and a start-here path (/handbook). Public, so
// new players (and search engines) can read it before signing up. The numbers come live from the server (live.ts).
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { Page } from '../app/Shell';
import { CHAPTERS } from './chapters';
import { useHandbook, type Ctx } from './live';
import type { Chapter, Topic } from './types';
import './handbook.css';

/** back to the top of the page (the app scrolls its main area, not the window) */
function toTop(el: HTMLElement | null) {
  const main = el?.closest('main');
  if (main) main.scrollTop = 0; else window.scrollTo({ top: 0 });
}

const visibleTopics = (ch: Chapter, c: Ctx) => ch.topics.filter((t) => !(t.webOnly && c.native));

/** every topic with where it lives, for search */
function index(c: Ctx) {
  return CHAPTERS.flatMap((ch) => visibleTopics(ch, c).map((t) => ({ ch, t, hay: `${t.title} ${t.summary} ${t.keys ?? ''} ${ch.title}`.toLowerCase() })));
}
function search(c: Ctx, q: string) {
  const words = q.toLowerCase().split(/[^a-z0-9+×★]+/i).filter((w) => w.length > 1);
  if (!words.length) return [];
  return index(c)
    .map((x) => {
      let score = 0;
      for (const w of words) {
        if (!x.hay.includes(w)) return { ...x, score: -1 };
        score += x.t.title.toLowerCase().includes(w) ? 5 : x.t.summary.toLowerCase().includes(w) ? 2 : 1;
      }
      return { ...x, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 24);
}

// numbered in the logo's colours, in its order: red, orange, yellow, green, blue
const START: { to: string; t: string; s: string; c: string }[] = [
  { to: '/handbook/start#what', t: 'What LANDVAS is', s: 'The whole game in one minute', c: '#FF4D6D' },
  { to: '/handbook/start#first', t: 'Your first ten minutes', s: 'Free plots, your first Ink, the boost', c: '#FF9F1C' },
  { to: '/handbook/world#claim', t: 'Claiming a plot', s: 'Reach, price, and what a plot becomes', c: '#FFE14D' },
  { to: '/handbook/ink#pay', t: 'Exactly what a win pays', s: 'Levels, rarity bonuses and paid wins', c: '#3DDC97' },
  { to: '/handbook/strategy#daily', t: 'The daily checklist', s: 'Everything worth doing, every day', c: '#34C3FF' },
];
const POPULAR: [string, string][] = [
  ['/handbook/roll#rarities', '💎 Rarity odds'], ['/handbook/luck#rerolls', '🍀 How Luck works'], ['/handbook/luck#hot', '🔥 Hot Zone'], ['/handbook/rent#boost', '⚡ The ×20 boost'],
  ['/handbook/strategy#perday', '📊 Best Ink sources'], ['/handbook/roll#ultras', '🌌 Every ultra'], ['/handbook/enchant#kinds', '🔮 The 20 enchantments'], ['/handbook/places#travel', '✈️ Flying anywhere'],
  ['/handbook/strategy#combos', '🔗 Best combos'], ['/handbook/strategy#mistakes', '🚫 Mistakes to avoid'],
];

export default function HandbookScreen() {
  const { chapter } = useParams();
  const c = useHandbook();
  if (!chapter) return <HandbookIndex c={c} />;
  const ch = CHAPTERS.find((x) => x.id === chapter);
  if (!ch) return <Navigate to="/handbook" replace />;
  return <ChapterView key={ch.id} ch={ch} c={c} />;
}

function HandbookIndex({ c }: { c: Ctx }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => search(c, q), [c, q]);
  const topics = CHAPTERS.reduce((s, ch) => s + visibleTopics(ch, c).length, 0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { toTop(root.current); }, []);
  return (
    <Page>
      <div ref={root} className="mx-auto max-w-3xl" data-testid="handbook">
        <section className="hb-hero hb-rise">
          <div className="flex items-center gap-3"><img src="/brand/landvas-mark.svg" width={44} height={44} alt="" className="h-11 w-11" /><span className="kick">📖 The handbook</span></div>
          <h1 className="mt-4">Everything in LANDVAS, explained.</h1>
          <p className="sub">Every feature, exactly how it works, what it pays, and the best ways to play it, with pictures for all of it. The numbers on these pages are live from the game, so they’re always right.</p>
          <div className="stats">
            <span><b>{CHAPTERS.length}</b>chapters</span><span><b>{topics}</b>topics</span><span><b>{c.live ? 'Live' : '…'}</b>{c.live ? 'numbers' : 'loading numbers'}</span>
          </div>
          <label className="hb-search">
            <Search className="h-5 w-5" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: luck, hot zone, rent, splice, farm…" aria-label="Search the handbook" data-testid="hb-search" enterKeyHint="search" />
          </label>
        </section>

        {q.trim().length > 1 && (
          <div className="hb-results" data-testid="hb-results">
            {results.length ? results.map(({ ch, t }) => (
              <Link key={`${ch.id}-${t.id}`} to={`/handbook/${ch.id}#${t.id}`} className="hb-result">
                <span className="e">{t.emoji}</span>
                <span className="min-w-0"><span className="ch">{ch.emoji} {ch.title}</span><span className="t block">{t.title}</span><span className="s block">{t.summary}</span></span>
                <ChevronRight className="h-4 w-4 text-faint" />
              </Link>
            )) : <p className="px-2 py-4 text-sm text-muted">Nothing matches “{q}”. Try a simpler word, like “boost”, “egg” or “crown”.</p>}
          </div>
        )}

        <h2 className="hb-sectiontitle">New here? Start with these<small>Five pages and you’ll understand the whole game.</small></h2>
        <div className="hb-path">
          {START.map((s, i) => (
            <Link key={s.to} to={s.to} data-testid={`hb-start-${i + 1}`}>
              <span className="n" style={{ background: s.c }}>{i + 1}</span>
              <span className="min-w-0"><span className="t block">{s.t}</span><span className="s block">{s.s}</span></span>
              <ChevronRight className="h-4 w-4 text-faint" />
            </Link>
          ))}
        </div>

        <h2 className="hb-sectiontitle">Popular</h2>
        <div className="hb-quick">{POPULAR.map(([to, t]) => <Link key={to} to={to}>{t}</Link>)}</div>

        <h2 className="hb-sectiontitle">Every chapter</h2>
        <div className="hb-chapters" data-testid="hb-chapters">
          {CHAPTERS.map((ch, i) => (
            <Link key={ch.id} to={`/handbook/${ch.id}`} className="hb-chapter" style={{ ['--c' as string]: ch.color }} data-testid={`hb-chapter-${ch.id}`}>
              <span className="n">{String(i + 1).padStart(2, '0')} · {visibleTopics(ch, c).length} topics</span>
              <span className="e">{ch.emoji}</span>
              <span className="t">{ch.title}</span>
              <span className="s">{ch.blurb}</span>
            </Link>
          ))}
        </div>

        <p className="mb-6 mt-8 text-center text-[11.5px] leading-relaxed text-faint">
          Rates, limits and features can change, and these pages change with them. Rent is a game reward, not an investment or a wage.
          {' '}<Link to="/guide" className="font-bold text-accent-2 hover:underline">Live rates & what players earn →</Link>
        </p>
      </div>
    </Page>
  );
}

function ChapterView({ ch, c }: { ch: Chapter; c: Ctx }) {
  const loc = useLocation();
  const topics = visibleTopics(ch, c);
  const at = CHAPTERS.indexOf(ch);
  const prev = CHAPTERS[at - 1], next = CHAPTERS[at + 1];
  const [on, setOn] = useState(topics[0]?.id);
  const tocRef = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  // open at the topic in the address (#topic), or at the top for a new chapter
  useEffect(() => {
    const id = decodeURIComponent(loc.hash.replace(/^#/, ''));
    if (!id) { toTop(root.current); return; }
    // (a jump, not a glide: the topic can be far down a long chapter)
    const t = setTimeout(() => document.getElementById(`hb-${id}`)?.scrollIntoView({ block: 'start' }), 60);
    return () => clearTimeout(t);
  }, [loc.hash, ch.id]);

  // light up the topic being read in the chip row
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setOn(vis.target.id.replace(/^hb-/, ''));
    }, { rootMargin: '-20% 0px -65% 0px' });
    for (const t of topics) { const el = document.getElementById(`hb-${t.id}`); if (el) io.observe(el); }
    return () => io.disconnect();
  }, [ch.id, topics]);
  // keep the lit chip in view by scrolling the chip row sideways only (scrollIntoView would also move the page)
  useEffect(() => {
    const row = tocRef.current, chip = row?.querySelector<HTMLElement>(`[data-t="${on}"]`);
    if (row && chip) row.scrollTo({ left: Math.max(0, chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2), behavior: 'smooth' });
  }, [on]);

  return (
    <Page>
      <div ref={root} className="mx-auto max-w-3xl" data-testid={`hb-chapter-page-${ch.id}`}>
        <header className="hb-chead hb-rise" style={{ ['--c' as string]: ch.color }}>
          <div className="crumb"><Link to="/handbook">📖 Handbook</Link><ChevronRight className="h-3.5 w-3.5" /><span>Chapter {at + 1} of {CHAPTERS.length}</span></div>
          <h1>{ch.emoji} {ch.title}</h1>
          <p>{ch.blurb}</p>
        </header>
        <nav ref={tocRef} className="hb-toc no-scrollbar" aria-label="Topics in this chapter">
          {topics.map((t) => <a key={t.id} href={`#${t.id}`} data-t={t.id} className={on === t.id ? 'on' : ''} onClick={(e) => { e.preventDefault(); history.replaceState(history.state, '', `#${t.id}`); document.getElementById(`hb-${t.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setOn(t.id); }}>{t.emoji} {t.title}</a>)}
        </nav>
        {topics.map((t) => <TopicCard key={t.id} t={t} c={c} color={ch.color} />)}
        <nav className="hb-pager" aria-label="Chapters">
          {prev ? <Link to={`/handbook/${prev.id}`}><small><ChevronLeft className="inline h-3 w-3" /> Previous</small><b>{prev.emoji} {prev.title}</b></Link> : <Link to="/handbook"><small><ChevronLeft className="inline h-3 w-3" /> Back</small><b>📖 All chapters</b></Link>}
          {next ? <Link to={`/handbook/${next.id}`} className="next"><small>Next <ChevronRight className="inline h-3 w-3" /></small><b>{next.emoji} {next.title}</b></Link> : <Link to="/handbook" className="next"><small>Done</small><b>📖 All chapters</b></Link>}
        </nav>
      </div>
    </Page>
  );
}

function TopicCard({ t, c, color }: { t: Topic; c: Ctx; color: string }) {
  return (
    <section id={`hb-${t.id}`} className="hb-topic" style={{ ['--c' as string]: color }} data-testid={`hb-topic-${t.id}`}>
      <header>
        <span className="e" aria-hidden>{t.emoji}</span>
        <div className="min-w-0"><h2>{t.title}</h2><p>{t.summary}</p></div>
      </header>
      <div className="body">{t.body(c)}</div>
    </section>
  );
}
