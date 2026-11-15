// The pipeline's move_art job: an Origami Pocket unfolded a plot somewhere new, and its drawing's tile follows it.
import { describe, it, expect } from 'vitest';
import { GRID_LEVEL } from '../../src/shared/grid';
import { BUCKETS, moveArt, tilePath, type PipelineDeps } from '../../src/server/pipeline';

function fakes(withTile = true) {
  const blobs = new Map<string, Uint8Array>();
  const calls: { fn: string; args: any }[] = [];
  if (withTile) blobs.set(`${BUCKETS.public}/${tilePath(GRID_LEVEL, 10, 20, 7)}`, new Uint8Array([1, 2, 3]));
  const deps: PipelineDeps = {
    db: { call: async (fn: string, args: any = {}) => { calls.push({ fn, args }); return fn === 'svc_reserve_revs' ? [99] : fn === 'svc_get_art_tiles' ? [] : null; } } as any,
    store: { get: async (b, p) => blobs.get(`${b}/${p}`) ?? null, put: async (b, p, bytes) => { blobs.set(`${b}/${p}`, bytes); } },
    codec: { decode: async () => ({ width: 1, height: 1, data: new Uint8Array(4) }) as any, encodePng: async () => new Uint8Array([9]) },
  };
  return { deps, blobs, calls };
}

describe('move_art', () => {
  it('copies the tile under the new cell with a fresh revision, sets it, and tells the database', async () => {
    const { deps, blobs, calls } = fakes();
    await moveArt(deps, { from: [10, 20], to: [30, 40], rev: 7, publication_id: 'pub' });
    expect(blobs.get(`${BUCKETS.public}/${tilePath(GRID_LEVEL, 30, 40, 99)}`)).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls.find((c) => c.fn === 'svc_set_art_tiles')?.args).toEqual({ p_tiles: [[GRID_LEVEL, 30, 40, 99, 3]] });
    expect(calls.at(-1)).toEqual({ fn: 'svc_art_moved', args: { p_to: [30, 40], p_rev: 99, p_publication_id: 'pub' } });
  });
  it('with no tile to move, it only tells the database', async () => {
    const { deps, calls } = fakes(false);
    await moveArt(deps, { from: [10, 20], to: [30, 40], rev: 7, publication_id: 'pub' });
    expect(calls.map((c) => c.fn)).toEqual(['svc_art_moved']);
    expect(calls[0].args.p_rev).toBeNull();
  });
});
