// When an app takes a new live build of the game (src/native/liveBundle.ts → planBundle).
import { describe, it, expect, beforeAll } from 'vitest';
import type { AppConfig } from '../../src/backend/types';

let planBundle: typeof import('../../src/native/liveBundle').planBundle;
beforeAll(async () => {
  Object.assign(globalThis, { __LANDVAS_BUILD__: 'test', __LANDVAS_BUILT_AT__: '2026-11-13T00:00:00Z', __LANDVAS_NATIVE_COMPAT__: '' });
  ({ planBundle } = await import('../../src/native/liveBundle'));
});

const app = { nativeVersion: '1.0.1', compat: 'abc123abc123abcd', build: 'app-1111111', builtAt: '2026-11-13T10:00:00.000Z', onStoreBuild: true };
const cfg = (over: Partial<AppConfig> = {}, build = 'app-2222222', builtAt = '2026-11-13T12:00:00.000+00:00'): AppConfig => ({
  ota: { on: true, paused_for: ['1.0.0'], back_to_store_build: false },
  ota_builds: { [app.compat]: { build, built_at: builtAt, published_at: builtAt, files: 600, bytes: 9e6 } },
  ...over,
});

describe('live builds in the apps', () => {
  it('takes a newer build published for this kind of app', () => {
    expect(planBundle(cfg(), app)).toEqual({ kind: 'take', build: 'app-2222222' });
  });
  it('stays put when it already runs it, or when the published one is older', () => {
    expect(planBundle(cfg({}, 'app-1111111'), app).kind).toBe('none');
    expect(planBundle(cfg({}, 'app-0000000', '2026-11-12T09:00:00Z'), app)).toEqual({ kind: 'none', why: 'older than this build' });
  });
  it('holds app versions under store review on the build inside them', () => {
    expect(planBundle(cfg(), { ...app, nativeVersion: '1.0.0' })).toEqual({ kind: 'none', why: 'held for review' });
  });
  it('takes nothing when switched off, or when nothing is published for this kind of app', () => {
    expect(planBundle(cfg({ ota: { on: false } }), app).kind).toBe('none');
    expect(planBundle(cfg(), { ...app, compat: 'ffffffffffffffff' })).toEqual({ kind: 'none', why: 'nothing published for this app' });
    expect(planBundle(cfg(), { ...app, compat: '' }).kind).toBe('none');
    expect(planBundle(undefined, app).kind).toBe('none');
  });
  it('goes back to the store build when staff ask, unless it is already on it', () => {
    const back = cfg({ ota: { on: true, back_to_store_build: true } });
    expect(planBundle(back, { ...app, onStoreBuild: false })).toEqual({ kind: 'back_to_store' });
    expect(planBundle(back, app).kind).toBe('none');
  });
});
