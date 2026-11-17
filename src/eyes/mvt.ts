// A small reader for Mapbox Vector Tiles (the OpenMapTiles .pbf tiles the map's streets come from), so the
// first-person view can build the real streets, water, parks and buildings around you without loading the map
// library. Protocol buffers by hand: only what MVT needs (varints, zigzag, lengths, 32/64-bit floats).

export type MvtValue = string | number | boolean;
/** geometry in tile units (0…extent, y down): for points and lines, each part is [x0, y0, x1, y1, …] */
export type MvtFeature = { type: 1 | 2 | 3; props: Record<string, MvtValue>; parts: number[][] };
export type MvtLayer = { name: string; extent: number; features: MvtFeature[] };

class Reader {
  pos = 0;
  constructor(readonly buf: Uint8Array) {}
  get done() { return this.pos >= this.buf.length; }
  varint(): number {
    let r = 0, shift = 0, b: number;
    do {
      if (this.pos >= this.buf.length) throw new Error('mvt: truncated varint');
      b = this.buf[this.pos++];
      // past 28 bits, multiply instead of shifting (JS bit ops are 32-bit)
      r += shift < 28 ? (b & 0x7f) << shift : (b & 0x7f) * 2 ** shift;
      shift += 7;
    } while (b & 0x80);
    return r;
  }
  svarint() { const n = this.varint(); return n % 2 === 1 ? -(n + 1) / 2 : n / 2; }
  bytes(): Uint8Array { const n = this.varint(); const s = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return s; }
  string() { return new TextDecoder().decode(this.bytes()); }
  double() { const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 8).getFloat64(0, true); this.pos += 8; return v; }
  float() { const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4).getFloat32(0, true); this.pos += 4; return v; }
  packed(): number[] { const end = this.varint() + this.pos; const out: number[] = []; while (this.pos < end) out.push(this.varint()); return out; }
  skip(wire: number) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) this.pos += this.varint();
    else if (wire === 5) this.pos += 4;
    else throw new Error(`mvt: unknown wire type ${wire}`);
  }
}

function readValue(r: Reader): MvtValue | null {
  const end = r.varint() + r.pos;
  let v: MvtValue | null = null;
  while (r.pos < end) {
    const tag = r.varint(), field = tag >> 3, wire = tag & 7;
    if (field === 1) v = r.string();
    else if (field === 2) v = r.float();
    else if (field === 3) v = r.double();
    else if (field === 4 || field === 5) v = r.varint();
    else if (field === 6) v = r.svarint();
    else if (field === 7) v = !!r.varint();
    else r.skip(wire);
  }
  return v;
}

function decodeGeometry(cmds: number[]): number[][] {
  const parts: number[][] = [];
  let x = 0, y = 0, cur: number[] | null = null;
  for (let i = 0; i < cmds.length; ) {
    const c = cmds[i++], id = c & 7, count = c >> 3;
    if (id === 1 || id === 2) {
      for (let k = 0; k < count && i + 1 < cmds.length; k++) {
        const dx = cmds[i++], dy = cmds[i++];
        x += dx % 2 === 1 ? -(dx + 1) / 2 : dx / 2;
        y += dy % 2 === 1 ? -(dy + 1) / 2 : dy / 2;
        if (id === 1) { cur = [x, y]; parts.push(cur); } else cur?.push(x, y);
      }
    } else if (id === 7) {
      if (cur && cur.length >= 2) cur.push(cur[0], cur[1]);
    } else break;
  }
  return parts;
}

/** Decode a tile. `want`: only these layers (the rest are skipped without being read). */
export function decodeTile(bytes: Uint8Array, want?: Set<string>): Record<string, MvtLayer> {
  const r = new Reader(bytes);
  const out: Record<string, MvtLayer> = {};
  while (!r.done) {
    const tag = r.varint();
    if (tag >> 3 !== 3 || (tag & 7) !== 2) { r.skip(tag & 7); continue; }
    const end = r.varint() + r.pos;
    const lr = new Reader(bytes.subarray(r.pos, end));
    r.pos = end;
    // first pass: the name (to skip unwanted layers cheaply), keys, values, extent; features kept as slices
    let name = '', extent = 4096;
    const keys: string[] = [], values: (MvtValue | null)[] = [], raw: Uint8Array[] = [];
    while (!lr.done) {
      const t = lr.varint(), f = t >> 3, w = t & 7;
      if (f === 1) name = lr.string();
      else if (f === 2) raw.push(lr.bytes());
      else if (f === 3) keys.push(lr.string());
      else if (f === 4) values.push(readValue(lr));
      else if (f === 5) extent = lr.varint();
      else lr.skip(w);
    }
    if (want && !want.has(name)) continue;
    const features: MvtFeature[] = [];
    for (const fb of raw) {
      const fr = new Reader(fb);
      let type = 0, tags: number[] = [], geom: number[] = [];
      while (!fr.done) {
        const t = fr.varint(), f = t >> 3, w = t & 7;
        if (f === 2) tags = fr.packed();
        else if (f === 3) type = fr.varint();
        else if (f === 4) geom = fr.packed();
        else fr.skip(w);
      }
      if (type < 1 || type > 3) continue;
      const props: Record<string, MvtValue> = {};
      for (let i = 0; i + 1 < tags.length; i += 2) {
        const k = keys[tags[i]], v = values[tags[i + 1]];
        if (k !== undefined && v !== null && v !== undefined) props[k] = v;
      }
      features.push({ type: type as 1 | 2 | 3, props, parts: decodeGeometry(geom) });
    }
    out[name] = { name, extent, features };
  }
  return out;
}

/** signed area of a ring (tile units, y down): positive is an outer ring, negative a hole (MVT 2.1) */
export function ringArea(ring: number[]) {
  let a = 0;
  for (let i = 0; i + 3 < ring.length; i += 2) a += ring[i] * ring[i + 3] - ring[i + 2] * ring[i + 1];
  return a / 2;
}

/** a polygon feature's rings grouped as [outer, ...holes] */
export function polygons(f: MvtFeature): number[][][] {
  const out: number[][][] = [];
  for (const ring of f.parts) {
    if (ring.length < 8) continue;
    const a = ringArea(ring);
    if (a > 0 || !out.length) out.push([ring]);
    else if (a < 0) out[out.length - 1].push(ring);
  }
  return out;
}

/** gzip-compressed bytes (some servers send tiles that way without saying so) */
export async function maybeGunzip(buf: ArrayBuffer): Promise<Uint8Array> {
  const u = new Uint8Array(buf);
  if (u.length > 2 && u[0] === 0x1f && u[1] === 0x8b && typeof DecompressionStream !== 'undefined') {
    const s = new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  return u;
}
