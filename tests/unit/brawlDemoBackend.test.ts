// The Paintbrawl instant demo's database-free backend plays real matches through the shared server code.
import { beforeEach, describe, expect, it } from 'vitest';
import { DemoBackend } from '../../src/backend/demo/DemoBackend';
import { CARDS } from '../../src/shared/brawl/cards';

describe('Paintbrawl demo backend', () => {
  let be: DemoBackend;
  beforeEach(async () => { be = new DemoBackend(); await be.init(); });

  it('starts signed in with every card and plenty of shards', async () => {
    expect(be.session()?.userId).toBeTruthy();
    const st = await be.rpc('my_state');
    expect(st.onboarded).toBe(true);
    const g = await be.rpc('brawl_get', { p_id: 'demo-arena' });
    expect(g.kind).toBe('brawl');
    expect(Object.keys(g.brawl.cards).length).toBe(CARDS.length);
    expect(g.brawl.shards).toBeGreaterThanOrEqual(5000);
  });

  it('opens packs, sets the bank and crafts', async () => {
    const p = await be.rpc('brawl_pack_open', { p_free: false });
    expect(p.cards).toHaveLength(5);
    expect(p.cards.some((c: { rarity: string }) => c.rarity !== 'common')).toBe(true);
    const me = await be.rpc('demo_bank', { shards: 777, dust: 5000 });
    expect(me.shards).toBe(777);
    const after = await be.rpc('brawl_craft', { p_card: p.cards[0].id, p_dust: true });
    expect(after.dust).toBeGreaterThan(5000);
  });

  it('plays a practice match through the real server code, to the end with rewards', async () => {
    const { match } = await be.brawl({ op: 'bot' });
    expect(typeof match).toBe('string');
    expect((await be.brawl({ op: 'bot' })).match).toBe(match); // one live match at a time
    const v0 = await be.rpc('brawl_view', { p_match: match });
    expect(v0.status).toBe('live');
    expect(v0.players[1].bot).toBe(true);
    const res = await be.brawl({ op: 'concede', match });
    const v = await be.rpc('brawl_view', { p_match: match });
    expect(v.status).toBe('over');
    expect(res.rewards).toBeTruthy();
    expect((await be.rpc('brawl_history')).length).toBe(1);
  });
});
