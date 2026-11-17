// Report a player (App Store 1.2): any player can be reported for their name, picture, creations or behaviour; the report
// lands in the moderation queue once (while open), never for yourself, and only with a known reason.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDb, expectError } from '../helpers/db';

const db = new TestDb();
let ann: string, bob: string;

beforeAll(async () => {
  await db.init({ ungated: true });
  ann = await db.newPlayer('ann_reports');
  bob = await db.newPlayer('bob_reported');
});
afterAll(() => db.close());

describe('report_player', () => {
  it('files a report in the moderation queue with the reason and the player’s name', async () => {
    const r = await db.rpc(ann, 'report_player', { p_player_id: bob, p_reason: 'name', p_details: 'rude name' });
    expect(r.ok).toBe(true);
    const rows = await db.sql(`select kind, status, priority, reason, subject_player_id, details from moderation_cases where reporter_id = $1`, [ann]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'report', status: 'open', priority: 2, reason: 'player_name', subject_player_id: bob });
    expect(rows[0].details).toMatchObject({ details: 'rude name', username: 'bob_reported' });
  });
  it('the same open report twice adds nothing; a different reason is its own report', async () => {
    expect((await db.rpc(ann, 'report_player', { p_player_id: bob, p_reason: 'name' })).duplicate).toBe(true);
    await db.rpc(ann, 'report_player', { p_player_id: bob, p_reason: 'harassment' });
    const rows = await db.sql(`select reason, priority from moderation_cases where reporter_id = $1 order by created_at`, [ann]);
    expect(rows.map((x: any) => x.reason)).toEqual(['player_name', 'player_harassment']);
    expect(rows[1].priority).toBe(1);
  });
  it('refuses yourself and unknown reasons', async () => {
    await expectError(db.rpc(ann, 'report_player', { p_player_id: ann, p_reason: 'spam' }), 'cannot_report_self');
    await expectError(db.rpc(ann, 'report_player', { p_player_id: bob, p_reason: 'ugly' }), 'invalid_reason');
  });
});
