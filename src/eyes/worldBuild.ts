// Building the real place round a spot, step by step, as plain data: the ground's paintings, the buildings, what the
// ground is metre by metre, the street's lamps and parked cars, the trees, and the land out to the horizon. The same
// steps run in a worker (world.worker.ts: nothing of it on the main thread, so the view never stutters while the next
// stretch of town is made) or, where a worker can't paint, on the main thread a step at a time.
import type { Frame } from './geo';
import { terrainMesh, type LandColours } from './terrainGeo';
import {
  buildBuildings, canvasFor, fetchTile, loadTerrain, occFn, occupancyGrid, paintGround, streetThings, streetsSource, tilesFor, treePoints,
  type AnyCanvas, type BuildingMesh, type OccGrid, type Palette, type StreetThings, type Terrain, type Tile, type TreePt,
} from './world';

export type WorldOpts = {
  pal: Palette; real: boolean; phone: boolean;
  /** the sharp ground at your feet, this far each way (m); the town's softer ground, this far */
  nearHalf: number; farHalf: number;
  /** also the land out to the horizon (elevation), and its colours */
  terrain?: { extent: number; n: number; z: number; flatten: [number, number] } | null;
  land?: LandColours;
};
type Img = ImageBitmap | AnyCanvas;
/** what comes back, in the order it's ready */
export type WorldStage =
  | { t: 'none' }
  | { t: 'near'; ground: Img; region: Region; occ: OccGrid; bld: BuildingMesh; street: StreetThings; trees: TreePt[]; tiles: number }
  | { t: 'far'; ground: Img | null; region: Region; bld: BuildingMesh | null }
  | { t: 'terrain'; terrain: Terrain | null }
  | { t: 'done' };
type Region = { x0: number; z0: number; size: number };

/** the bounds of a mesh's points, so the main thread needn't walk them (a sphere: centre and radius) */
export function sphereOf(pos: Float32Array): [number, number, number, number] {
  if (!pos.length) return [0, 0, 0, 0];
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  let r = 0;
  for (let i = 0; i < pos.length; i += 3) { const d = (pos[i] - cx) ** 2 + (pos[i + 1] - cy) ** 2 + (pos[i + 2] - cz) ** 2; if (d > r) r = d; }
  return [cx, cy, cz, Math.sqrt(r)];
}

/**
 * Make the place round `frame` (its origin), handing each part to `send` as it's ready. `keep` gets the streets' tiles
 * (for painting the sharpest ground, a square at a time, later). `yieldNow` lets the main thread breathe between steps.
 */
export async function buildWorld(frame: Frame, o: WorldOpts, send: (s: WorldStage) => void, keep: (near: Tile[]) => void, yieldNow: () => Promise<void> = async () => {}, image?: (c: AnyCanvas) => Img) {
  // (handed over as a picture for the graphics chip: painted upside down, as the chip wants it; else a canvas as it is)
  const flip = !!image;
  const img = image ?? ((c: AnyCanvas) => c);
  // (the land's mesh is made here too, so the main thread only hands it over)
  const terrain = o.terrain ? loadTerrain(frame, o.terrain).then((t) => { if (t && o.land) t.mesh = terrainMesh(t, o.land, frame.lat0); return t; }).catch(() => null) : null;
  const src = await streetsSource();
  const nearR = { x0: -o.nearHalf, z0: -o.nearHalf, size: o.nearHalf * 2 };
  const farR = { x0: -o.farHalf, z0: -o.farHalf, size: o.farHalf * 2 };
  if (!src) {
    send({ t: 'none' });
    if (terrain) send({ t: 'terrain', terrain: await terrain });
    send({ t: 'done' });
    return;
  }
  const get = (z: number, r: Region) => Promise.all(tilesFor(frame, z, r).map((t) => fetchTile(src, z, t.x, t.y))).then((l) => l.filter((x): x is Tile => !!x));
  const near = await get(Math.min(14, src.maxzoom), nearR);
  keep(near);
  const big = o.phone ? 1536 : 2048;
  const c = canvasFor(big, big);
  paintGround(c.getContext('2d') as CanvasRenderingContext2D, frame, near, nearR, big, o.pal, { detail: true, real: o.real, flip });
  const ground = img(c);
  await yieldNow();
  // what the ground is, metre by metre (trees and lamps go on open ground, grass grows on lawns)
  const occ = occupancyGrid(frame, near, nearR, o.phone ? 0.9 : 0.75);
  const at = occFn(occ);
  await yieldNow();
  const bld = buildBuildings(frame, near, o.pal, { near: o.nearHalf * 1.1, far: o.nearHalf * 1.1, skylineMin: 999, budget: o.phone ? 70_000 : 160_000, real: o.real });
  await yieldNow();
  const street = streetThings(frame, near, { radius: o.phone ? 300 : 420, ground: at, max: o.phone ? 260 : 520 });
  const trees = treePoints(frame, near, { radius: o.nearHalf, max: o.phone ? 700 : 1800, free: (x, z) => { const g = at(x, z); return g === 0 || g === 1; } });
  bld.sphere = sphereOf(bld.position);
  send({ t: 'near', ground, region: nearR, occ, bld, street, trees: [...street.trees, ...trees], tiles: near.length });
  await yieldNow();
  // further out: the town's ground on the land, and its tall buildings on the skyline
  const mid = await get(Math.min(13, src.maxzoom), farR);
  let far: Img | null = null, all: BuildingMesh | null = null;
  if (mid.length) {
    const fpx = o.phone ? 1024 : 2048;
    const fc = canvasFor(fpx, fpx);
    paintGround(fc.getContext('2d') as CanvasRenderingContext2D, frame, mid, farR, fpx, o.pal, { real: o.real, flip });
    far = img(fc);
    await yieldNow();
    all = buildBuildings(frame, [...near, ...mid], o.pal, { near: o.nearHalf * 1.05, far: 1700, skylineMin: 24, budget: o.phone ? 90_000 : 220_000, real: o.real });
    all.sphere = sphereOf(all.position);
  }
  send({ t: 'far', ground: far, region: farR, bld: all });
  if (terrain) send({ t: 'terrain', terrain: await terrain });
  send({ t: 'done' });
}
