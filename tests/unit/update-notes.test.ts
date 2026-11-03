import { describe, expect, it } from 'vitest';
import { bullets, parseLog, sqlJson, summarize } from '../../scripts/update-notes.mjs';

const log = [
  ['a1', 'Rovers, activity pop-ups, 3 eggs a day', '- Rovers: three models; drive at the\n  rover\'s speed\n- Notifications pop up live\n\nCo-Authored-By: Claude <x@y>\nClaude-Session: https://x'],
  ['b2', 'Fix deploy workflow', '- bump cache'],
  ['c3', 'Bases: build on your planet plots', ''],
].map((c) => c.join('\x1f')).join('\x1e') + '\x1e';

describe('update notes', () => {
  it('reads bullets, joins wrapped lines and drops trailers', () => {
    const c = parseLog(log);
    expect(c).toHaveLength(3);
    expect(c[0].notes).toEqual(['Rovers: three models; drive at the rover\'s speed', 'Notifications pop up live']);
    expect(bullets('Co-Authored-By: someone\n- one')).toEqual(['one']);
  });
  it('summarises for players, leaving out plumbing commits', () => {
    const s = summarize(parseLog(log))!;
    expect(s.title).toBe('New: Rovers, activity pop-ups, 3 eggs a day · Bases: build on your planet plots');
    expect(s.body).toBe('• Rovers: three models; drive at the rover\'s speed\n• Notifications pop up live\n• Bases: build on your planet plots');
    expect(summarize(parseLog(['z9', 'chore: tidy', ''].join('\x1f')))).toBeNull();
  });
  it('caps long headlines and lists', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ sha: String(i), subject: `Feature number ${i} with a fairly long name`, notes: [] }));
    const s = summarize(many, 5)!;
    expect(s.title.length).toBeLessThanOrEqual(120);
    expect(s.body.split('\n')).toHaveLength(6);
    expect(s.body).toMatch(/and 25 more/);
  });
  it('is safe to put in SQL', () => {
    expect(sqlJson({ a: 'x$lvjson$y' })).toBe('$lvjson${"a":"x\\u0024lvjson\\u0024y"}$lvjson$::jsonb');
    expect(JSON.parse(sqlJson({ a: '$' }).slice(8, -15))).toEqual({ a: '$' });
  });
});
