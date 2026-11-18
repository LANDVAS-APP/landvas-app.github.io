// The Handbook: every topic of every chapter renders (offline defaults, live numbers, and the app build's rules), every
// link in it goes somewhere real (a game page, or a chapter and topic of the Handbook itself), and the helpers read
// numbers and odds right.
import { describe, it, expect } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { CHAPTERS } from '../../src/handbook/chapters';
import { oddsText, resetTime, type Ctx } from '../../src/handbook/live';
import { rarities } from '../../src/shared/rarity';

function dig(o: any, path: string) { return path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o); }
function ctx(config: Record<string, any> = {}, native = false): Ctx {
  const all = rarities();
  const total = all.filter((r) => r.weight > 0).reduce((s, r) => s + r.weight, 0);
  return {
    g: null, w: null, hz: null, live: Object.keys(config).length > 0, native,
    n: (p, d) => { const x = Number(dig(config, p)); return Number.isFinite(x) && dig(config, p) != null ? x : d; },
    v: (p, d) => (dig(config, p) ?? d) as any,
    everyday: all.filter((r) => r.weight > 0).map((r) => ({ id: r.id, name: r.name, color: r.color, chance: r.weight / total, usd: r.usd_per_second, ink: r.ink_reward_multiplier })),
    all, resetLocal: '6:00 PM',
  };
}
const render = (node: ReactNode) => renderToStaticMarkup(createElement(MemoryRouter, null, node));

// every page of the game a Handbook link may open
const ROUTES = [/^\/$/, /^\/world$/, /^\/plots$/, /^\/canvases$/, /^\/play$/, /^\/hub$/, /^\/gallery$/, /^\/social$/, /^\/clans$/, /^\/clan\/hall$/, /^\/party$/, /^\/invite$/,
  /^\/explorer$/, /^\/players$/, /^\/achievements$/, /^\/legend$/, /^\/grimoire$/, /^\/clips$/, /^\/guide$/, /^\/royalty$/, /^\/fusion$/, /^\/primordials$/,
  /^\/rankings\/rarities$/, /^\/leaderboards$/, /^\/inventory$/, /^\/events$/, /^\/settings$/, /^\/support$/, /^\/pvp$/, /^\/challenges$/, /^\/sketch$/, /^\/doodle$/,
  /^\/duet$/, /^\/eyes$/, /^\/stars$/, /^\/space$/, /^\/space\/play\/(asteroids|lander)$/, /^\/inkborn$/, /^\/inkborn\/(create|visit|keeper)$/, /^\/habitat$/];

describe('the Handbook', () => {
  it('has unique chapter and topic ids', () => {
    expect(new Set(CHAPTERS.map((c) => c.id)).size).toBe(CHAPTERS.length);
    for (const ch of CHAPTERS) expect(new Set(ch.topics.map((t) => t.id)).size, ch.id).toBe(ch.topics.length);
  });

  for (const [label, c] of [['offline defaults', ctx()], ['live numbers', ctx({ rent: { boost: { multiplier: 25, free_per_day: 4, minutes_per_boost: 30 } }, economy: { acquire: { base_ink: 150 }, free_plots: 2 } })], ['the app build', ctx({}, true)]] as const) {
    it(`renders every topic (${label}) and every link goes somewhere real`, () => {
      for (const ch of CHAPTERS) {
        for (const t of ch.topics) {
          if (t.webOnly && c.native) continue;
          const html = render(t.body(c));
          expect(html.length, `${ch.id}#${t.id}`).toBeGreaterThan(40);
          for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
            const [path, hash] = href.split('#');
            if (path.startsWith('/handbook')) {
              const target = CHAPTERS.find((x) => x.id === path.split('/')[2]);
              expect(target, `${ch.id}#${t.id} → ${href}`).toBeTruthy();
              if (hash) expect(target!.topics.some((x) => x.id === hash), `${ch.id}#${t.id} → ${href}`).toBe(true);
            } else {
              expect(ROUTES.some((r) => r.test(path)), `${ch.id}#${t.id} → ${href}`).toBe(true);
            }
          }
          if (c.native) expect(/\bcash-out\b/i.test(html), `${ch.id}#${t.id} talks about cash-out in the app`).toBe(false);
        }
      }
    });
  }

  it('live numbers reach the page', () => {
    const boost = CHAPTERS.find((c) => c.id === 'rent')!.topics.find((t) => t.id === 'boost')!;
    expect(render(boost.body(ctx({ rent: { boost: { multiplier: 25, free_per_day: 6, minutes_per_boost: 30, max_stack_hours: 8 } } })))).toContain('×25');
    const claim = CHAPTERS.find((c) => c.id === 'world')!.topics.find((t) => t.id === 'claim')!;
    expect(render(claim.body(ctx({ economy: { acquire: { base_ink: 150 }, free_plots: 2 } })))).toContain('150 Ink');
  });

  it('tells the current rules: Crowns pay a share, Primordials are only rolled', () => {
    const topic = (ch: string, id: string) => render(CHAPTERS.find((c) => c.id === ch)!.topics.find((t) => t.id === id)!.body(ctx()));
    const crowns = topic('roll', 'crowns');
    expect(crowns).toContain('1% of all the Ink');
    expect(crowns).not.toMatch(/on all of it|full strength/);
    expect(topic('ultra', 'fusion')).not.toContain('Or pick');
    expect(topic('ultra', 'primordials')).toContain('only ever rolled');
  });

  it('never mentions the arcade secrets', () => {
    const all = CHAPTERS.flatMap((ch) => ch.topics.map((t) => render(t.body(ctx())))).join(' ');
    // (the Mirror Arcade's door is public now — 25,000 tickets — but its secret way in, and the rest, stay unwritten)
    for (const secret of ['Founder', 'Back Room', 'B-Side', 'PROTO-0', 'LAND GRAB', 'Twin Drops', 'Glass Breaker', 'Flipside', 'Symmetry']) expect(all, secret).not.toContain(secret);
  });

  it('writes odds and the reset time plainly', () => {
    expect(oddsText(0.35)).toBe('35%');
    expect(oddsText(0.05)).toBe('5.0%');
    expect(oddsText(0.0004)).toBe('1 in 2,500');
    expect(oddsText(330 / 1e9)).toBe('1 in 3 million');
    expect(oddsText(0)).toBe('—');
    expect(resetTime(17, 'UTC')).toMatch(/\d/);
  });
});
