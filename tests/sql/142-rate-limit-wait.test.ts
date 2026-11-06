// v0.6.4 Going too fast says how long to wait.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb } from '../helpers/db';
import { toGameError, tooFast } from '../../src/backend/backend';

const db = new TestDb();
let u: string;
beforeAll(async () => { await db.init({ ungated: true }); u = await db.newPlayer('fast_one'); });
afterAll(() => db.close());

describe('rate limit wait', () => {
  it('the error carries the seconds until you can go again', async () => {
    await db.rpc(u, 'send_chat_message', { p_body: 'hello there' });
    const e = await db.rpc(u, 'send_chat_message', { p_body: 'and again' }).then(() => null, (x) => x);
    expect(e.message).toBe('rate_limited');
    const s = Number(e.detail);
    expect(s).toBeGreaterThanOrEqual(1); expect(s).toBeLessThanOrEqual(2);
    expect(toGameError(e).message).toMatch(/too fast.*about \d+ seconds?/);
  });
  it('reads well for minutes and hours', () => {
    expect(tooFast('45')).toContain('about 45 seconds');
    expect(tooFast('61')).toContain('about 2 minutes');
    expect(tooFast('3000')).toContain('about 50 minutes');
    expect(tooFast('7200')).toContain('about 2 hours');
    expect(tooFast(undefined)).toContain('going too fast');
  });
});
