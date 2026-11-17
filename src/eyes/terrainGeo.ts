// The land out to the horizon as a mesh's plain data: its heights, its slopes and its colours (water, woods and fields,
// rock on the steep bits, snow up high). Worked out where the land was loaded (in the worker), so putting it in the
// view is just handing the numbers to the graphics chip.
import { PlaneGeometry } from 'three';
import { curveDrop } from './geo';
import { hex, type Terrain } from './world';

export type LandColours = { land: string; water: string; rock: string; snow: string; wood: string; neon: boolean };
export type TerrainMesh = { position: Float32Array; normal: Float32Array; color: Float32Array; index: Uint32Array | Uint16Array };

export function terrainMesh(t: Terrain | null, cl: LandColours, lat0: number): TerrainMesh {
  const n = t?.n ?? 64, E = t?.extent ?? 90_000;
  const g = new PlaneGeometry(E * 2, E * 2, n - 1, n - 1).rotateX(-Math.PI / 2);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i);
    P.setY(i, t ? t.y[i] : -curveDrop(Math.hypot(x, z)));
  }
  g.computeVertexNormals();
  const N = g.attributes.normal;
  const col = new Float32Array(P.count * 3);
  const land = hex(cl.land), water = hex(cl.water), rock = hex(cl.rock), snow = hex(cl.snow), wood = hex(cl.wood);
  const lat = Math.abs(lat0);
  const snowLine = Math.max(600, 4900 - 58 * lat);
  for (let i = 0; i < P.count; i++) {
    const h = t ? t.abs[i] : 30;
    const ny = N.getY(i);
    let c: number[];
    if (h <= 0.3) c = water;
    else {
      const hi = Math.min(1, Math.max(0, (h - 300) / 2200));
      c = [wood[0] + (land[0] - wood[0]) * hi, wood[1] + (land[1] - wood[1]) * hi, wood[2] + (land[2] - wood[2]) * hi];
      const steep = 1 - Math.min(1, Math.max(0, (ny - 0.72) / 0.2));
      c = c.map((v, k) => v + (rock[k] - v) * steep * 0.85);
      const sn = Math.min(1, Math.max(0, (h - snowLine) / 350)) * (0.4 + 0.6 * Math.min(1, ny * 1.3));
      c = c.map((v, k) => v + (snow[k] - v) * sn);
    }
    if (cl.neon) c = c.map((v, k) => v * (k === 2 ? 1.15 : 0.9));
    col.set(c, i * 3);
  }
  const idx = g.index!.array as Uint32Array | Uint16Array;
  const out = { position: P.array as Float32Array, normal: N.array as Float32Array, color: col, index: idx };
  return out;
}
