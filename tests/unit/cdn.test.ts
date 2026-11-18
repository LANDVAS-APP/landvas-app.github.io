// The CDN (cdn/worker.js): snapshots come from the database at most once per freshness window, an old copy is served
// while a new one is fetched, a database that's down never empties the cache; pictures are cached and nothing outside
// the public buckets passes. And the app's side (src/lib/cdn.ts): off until switched on, stale snapshots refused,
// three failures and it steps aside for a while.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error (plain JS module)
import { handle } from '../../cdn/worker.js';

const env = { SUPABASE_URL: 'https://db.example', SUPABASE_KEY: 'pub' };
function rig() {
  const store = new Map<string, Response>();
  let now = 1_000_000;
  const calls: string[] = [];
  let down = false;
  const waits: Promise<unknown>[] = [];
  const deps = {
    cache: { match: async (r: Request) => store.get(r.url)?.clone(), put: async (r: Request, res: Response) => { store.set(r.url, res.clone()); } },
    fetch: async (u: string) => {
      calls.push(u);
      if (down) return new Response('nope', { status: 503 });
      if (u.includes('/storage/')) return new Response('PNG', { headers: { 'content-type': 'image/png' } });
      return new Response(JSON.stringify({ hello: calls.length, built_at: new Date(now).toISOString() }), { headers: { 'content-type': 'application/json' } });
    },
    now: () => now,
  };
  const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); } };
  const get = (path: string) => handle(new Request(`https://cdn.landvas.app${path}`), env, ctx, deps) as Promise<Response>;
  return { get, calls, advance: (ms: number) => { now += ms; }, setDown: (d: boolean) => { down = d; }, settle: () => Promise.all(waits) };
}

describe('the CDN worker', () => {
  it('asks the database once per freshness window, then serves its copy', async () => {
    const r = rig();
    const a = await r.get('/w/leviathan.json');
    expect(a.status).toBe(200);
    expect(a.headers.get('x-cdn')).toBe('miss');
    expect(a.headers.get('access-control-allow-origin')).toBe('*');
    expect(Number(a.headers.get('x-now'))).toBeGreaterThan(0);
    expect(r.calls[0]).toBe('https://db.example/rest/v1/rpc/world_snapshot?p_key=leviathan');
    for (let i = 0; i < 20; i++) expect((await r.get('/w/leviathan.json')).headers.get('x-cdn')).toBe('hit');
    expect(r.calls).toHaveLength(1);
  });

  it('an old copy is served at once while a fresh one is fetched behind it', async () => {
    const r = rig();
    await r.get('/w/leviathan.json');
    r.advance(10_000);
    const s = await r.get('/w/leviathan.json');
    expect(s.headers.get('x-cdn')).toBe('stale');
    expect((await s.json()).hello).toBe(1);
    await r.settle();
    expect(r.calls).toHaveLength(2);
    expect((await (await r.get('/w/leviathan.json')).json()).hello).toBe(2);
  });

  it('with the database down it keeps serving what it has; with nothing, it says so', async () => {
    const r = rig();
    await r.get('/w/hot_zone.json');
    r.setDown(true);
    r.advance(700_000); // past even the stale window
    const s = await r.get('/w/hot_zone.json');
    expect(s.status).toBe(200);
    expect(s.headers.get('x-cdn')).toBe('stale-error');
    expect((await r.get('/w/travel.json')).status).toBe(502);
  });

  it('only known snapshots, only public buckets, no climbing out of them', async () => {
    const r = rig();
    expect((await r.get('/w/players.json')).status).toBe(404);
    expect((await r.get('/i/drafts/a.png')).status).toBe(404);
    expect((await r.get('/i/avatars/..%2F..%2Fsecret')).status).toBe(404);
    expect((await r.get('/health')).status).toBe(200);
    expect(r.calls).toHaveLength(0);
  });

  it('pictures leave Storage once and are kept (a year for named-by-content ones)', async () => {
    const r = rig();
    const a = await r.get('/i/avatars/u1/abc.webp');
    expect(a.headers.get('cache-control')).toContain('max-age=31536000');
    await r.settle();
    const b = await r.get('/i/avatars/u1/abc.webp');
    expect(b.headers.get('x-cdn')).toBe('hit');
    expect(await b.text()).toBe('PNG');
    expect(r.calls).toEqual(['https://db.example/storage/v1/object/public/avatars/u1/abc.webp']);
    expect((await r.get('/i/public-art/thumbs/x.png')).headers.get('cache-control')).toContain('max-age=86400');
    expect((await r.get('/i/public-art/tiles/22/1/2/3.png')).headers.get('cache-control')).toContain('max-age=31536000');
  });
});

vi.mock('../../src/env', () => ({ config: { backend: 'supabase' } }));
const cdn = await import('../../src/lib/cdn');

describe('the app and the CDN', () => {
  const realFetch = globalThis.fetch;
  let answer: () => Response;
  beforeEach(() => { cdn.resetCdn(); answer = () => new Response(JSON.stringify({ built_at: new Date().toISOString(), x: 1 }), { headers: { 'x-now': String(Date.now()) } }); globalThis.fetch = vi.fn(async () => answer()) as typeof fetch; });
  afterEach(() => { globalThis.fetch = realFetch; });

  it('off until the app config switches it on (and only to an https address)', async () => {
    expect(await cdn.cdnSnapshot('leviathan', 60_000)).toBeNull();
    expect(cdn.cdnPicture('avatars', 'a/b.png')).toBeNull();
    cdn.setCdn({ enabled: true, url: 'http://cdn.landvas.app' });
    expect(cdn.cdnOn()).toBe(false);
    cdn.setCdn({ enabled: true, url: 'https://cdn.landvas.app/' });
    expect(cdn.cdnPicture('avatars', 'a/b.png')).toBeNull(); // (pictures only when that's switched on too)
    cdn.setCdn({ enabled: true, url: 'https://cdn.landvas.app/', pictures: true });
    expect(cdn.cdnPicture('avatars', 'a/b c.png')).toBe('https://cdn.landvas.app/i/avatars/a/b%20c.png');
    expect(await cdn.cdnSnapshot('leviathan', 60_000)).toMatchObject({ x: 1 });
    expect(globalThis.fetch).toHaveBeenCalledWith('https://cdn.landvas.app/w/leviathan.json');
  });

  it('a snapshot older than the screen accepts is refused (the screen asks the database)', async () => {
    cdn.setCdn({ enabled: true, url: 'https://cdn.landvas.app' });
    answer = () => new Response(JSON.stringify({ built_at: new Date(Date.now() - 120_000).toISOString() }), { headers: { 'x-now': String(Date.now()) } });
    expect(await cdn.cdnSnapshot('leviathan', 60_000)).toBeNull();
  });

  it('judges age by the CDN’s clock, not a phone whose clock is wrong', async () => {
    cdn.setCdn({ enabled: true, url: 'https://cdn.landvas.app' });
    const server = Date.now() + 3_600_000; // this phone is an hour slow
    answer = () => new Response(JSON.stringify({ built_at: new Date(server - 2000).toISOString(), x: 2 }), { headers: { 'x-now': String(server) } });
    expect(await cdn.cdnSnapshot('leviathan', 60_000)).toMatchObject({ x: 2 });
    expect(cdn.cdnSkew()).toBeGreaterThan(3_500_000);
  });

  it('three failures in a row and it steps aside for a while', async () => {
    cdn.setCdn({ enabled: true, url: 'https://cdn.landvas.app' });
    answer = () => new Response('down', { status: 502 });
    for (let i = 0; i < 3; i++) expect(await cdn.cdnSnapshot('leviathan', 60_000)).toBeNull();
    expect(cdn.cdnOn()).toBe(false);
    const n = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(await cdn.cdnSnapshot('leviathan', 60_000)).toBeNull();
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(n);
  });
});
