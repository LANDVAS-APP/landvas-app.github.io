// Walk into a painting (the Museum): the piece is pulled apart into paper-cut layers by colour (the band nearest the
// top of the picture stands furthest back, the one nearest the bottom right at the front), stood up on a little stage
// like a pop-up book, and you walk in among them. Layers between you and the camera fade away as you go deeper, which
// is where the sparks hide: one tucked behind each of the front layers. Walk onto a spark to take it.
import * as THREE from 'three';
import type { PlaceKit, PlaceSpot, PlaceWorld } from '../places/engine';

export const STAGE = { w: 12, z0: -9, z1: 4 };
export type Diorama = PlaceWorld & {
  /** a spark was taken (it flies off; already-found sparks show as faint outlines) */ take(n: number): void;
  /** the layers are ready (the picture loaded and was cut) */ ready: Promise<boolean>;
};

type Layer = { canvas: HTMLCanvasElement; meanY: number; color: [number, number, number]; share: number };

/** k-means on the picture's colours: up to `k` layers, ordered back (top of the picture) to front (bottom) */
export function cutLayers(img: CanvasImageSource, w: number, h: number, k = 4): Layer[] {
  const scale = Math.min(1, 112 / Math.max(w, h)), W = Math.max(8, Math.round(w * scale)), H = Math.max(8, Math.round(h * scale));
  const src = document.createElement('canvas'); src.width = W; src.height = H;
  const g = src.getContext('2d', { willReadFrequently: true })!; g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const n = W * H, px = new Float32Array(n * 3), alive = new Uint8Array(n);
  let count = 0;
  for (let i = 0; i < n; i++) { px[i * 3] = d[i * 4]; px[i * 3 + 1] = d[i * 4 + 1]; px[i * 3 + 2] = d[i * 4 + 2]; if (d[i * 4 + 3] > 40) { alive[i] = 1; count++; } }
  if (!count) return [];
  // start from colours spread down the picture (so the layers follow its bands), then settle
  const cents: number[][] = [];
  for (let c = 0; c < k; c++) { const row = Math.min(H - 1, Math.floor(((c + 0.5) / k) * H)), i = row * W + Math.floor(W / 2); cents.push([px[i * 3], px[i * 3 + 1], px[i * 3 + 2]]); }
  const lab = new Uint8Array(n);
  for (let it = 0; it < 8; it++) {
    const sum = cents.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { const dr = px[i * 3] - cents[c][0], dg = px[i * 3 + 1] - cents[c][1], db = px[i * 3 + 2] - cents[c][2], dd = dr * dr + dg * dg * 1.2 + db * db; if (dd < bd) { bd = dd; best = c; } }
      lab[i] = best; const s = sum[best]; s[0] += px[i * 3]; s[1] += px[i * 3 + 1]; s[2] += px[i * 3 + 2]; s[3]++;
    }
    for (let c = 0; c < k; c++) if (sum[c][3]) cents[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
  }
  // smooth the labels twice (each pixel takes its neighbourhood's most common layer): no speckle, cleaner cut lines
  for (let pass = 0; pass < 2; pass++) {
    const next = lab.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!alive[i]) continue;
      const votes = new Uint8Array(k);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (alive[j]) votes[lab[j]]++; }
      let best = lab[i]; for (let c = 0; c < k; c++) if (votes[c] > votes[best]) best = c;
      next[i] = best;
    }
    lab.set(next);
  }
  const out: Layer[] = [];
  const S = 3; // the cut-outs are drawn at 3x so their paper edge stays thin
  for (let c = 0; c < k; c++) {
    let ys = 0, m = 0;
    for (let i = 0; i < n; i++) if (alive[i] && lab[i] === c) { ys += Math.floor(i / W); m++; }
    if (m < n * 0.02) continue; // specks don't make a layer of their own
    const CW = W * S + 2, CH = H * S + 2;
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const cg = cv.getContext('2d')!;
    const mask = cg.createImageData(CW, CH), md = mask.data;
    const inLayer = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && alive[y * W + x] && lab[y * W + x] === c;
    // the colours, each picture pixel as an S×S block; then a thin paper edge round the outside of the cut-out
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!inLayer(x, y)) continue; const i = y * W + x;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) { const o = ((y * S + sy + 1) * CW + x * S + sx + 1) * 4; md[o] = d[i * 4]; md[o + 1] = d[i * 4 + 1]; md[o + 2] = d[i * 4 + 2]; md[o + 3] = 255; }
    }
    const edge = new Uint8Array(CW * CH);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const o = (y * CW + x) * 4; if (md[o + 3]) continue;
      for (let dy = -1; dy <= 1 && !edge[y * CW + x]; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < CW && yy < CH && md[(yy * CW + xx) * 4 + 3] === 255) { edge[y * CW + x] = 1; break; } }
    }
    for (let i = 0; i < CW * CH; i++) if (edge[i]) { md[i * 4] = 250; md[i * 4 + 1] = 246; md[i * 4 + 2] = 236; md[i * 4 + 3] = 254; }
    cg.putImageData(mask, 0, 0);
    out.push({ canvas: cv, meanY: ys / m / H, color: cents[c].map((v) => Math.round(v)) as [number, number, number], share: m / count });
  }
  return out.sort((a, b) => a.meanY - b.meanY);
}

const hashOf = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export function buildDiorama(k: PlaceKit, o: { url: string | null; w: number; h: number; seed: string; sparks: number; found: number[] }): Diorama {
  const { scene, T } = k;
  // ---- the stage: boards, footlights, velvet wings, a starry night beyond -------------------------------------------
  scene.add(new THREE.HemisphereLight('#E9ECFF', '#2A1E2A', 0.95));
  scene.add(new THREE.AmbientLight('#ffffff', 0.25));
  const key = new THREE.DirectionalLight('#FFF1DA', 1.15); key.position.set(-4, 12, 10); scene.add(key);
  const boards = k.canvasTex(256, 256, (g) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = ['#6B4A2E', '#5F4027', '#734F31', '#664629'][i % 4]; g.fillRect(0, i * 32, 256, 32); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, i * 32 + 31, 256, 1); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(30,18,8,0.18)'; g.fillRect(Math.random() * 256, Math.random() * 256, 30 + Math.random() * 60, 1); }
  });
  boards.wrapS = boards.wrapT = THREE.RepeatWrapping; boards.repeat.set(3, 3.5);
  const floor = k.plane(STAGE.w, STAGE.z1 - STAGE.z0, k.std('#ffffff', { map: boards, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (STAGE.z0 + STAGE.z1) / 2); scene.add(floor);
  const night = k.canvasTex(256, 256, (g) => {
    g.fillStyle = '#080A1C'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(220,230,255,${0.2 + Math.random() * 0.7})`; g.fillRect(Math.random() * 256, Math.random() * 256, Math.random() < 0.1 ? 2 : 1, Math.random() < 0.1 ? 2 : 1); }
  });
  night.wrapS = night.wrapT = THREE.RepeatWrapping; night.repeat.set(5, 5);
  const ground = k.plane(80, 80, k.basic('#ffffff', { map: night })); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.03, -6); scene.add(ground);
  const velvet = k.std('#7A1428', { roughness: 0.8 }), brass = k.std('#D9B24A', { metalness: 0.85, roughness: 0.3 });
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const wing = k.box(0.5, 4.2, 1.6, velvet); wing.position.set(sd * (STAGE.w / 2 + 0.1), 2.1, STAGE.z0 + 2 + i * 4.2); scene.add(wing); k.fadeable(wing);
    }
  }
  const lip = k.box(STAGE.w + 0.6, 0.18, 0.3, brass); lip.position.set(0, 0.09, STAGE.z1 + 0.15); scene.add(lip);
  for (let i = 0; i < 9; i++) {
    const bulb = new THREE.Mesh(T(new THREE.SphereGeometry(0.09, 10, 8)), k.glow('#FFE6A8', 2)); bulb.position.set(-STAGE.w / 2 + 0.7 + i * ((STAGE.w - 1.4) / 8), 0.24, STAGE.z1 + 0.18); scene.add(bulb);
  }
  const starTex = k.canvasTex(128, 128, (c) => {
    c.translate(64, 64); c.fillStyle = '#FFE14D'; c.shadowColor = '#FFF4B0'; c.shadowBlur = 14; c.beginPath();
    for (let i = 0; i < 8; i++) { const r = i % 2 ? 16 : 50, a = (i / 8) * Math.PI * 2 - Math.PI / 2; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fill(); c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.fill();
  });
  const pool = k.canvasTex(128, 128, (c) => { const gr = c.createRadialGradient(64, 64, 2, 64, 64, 63); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 128, 128); });
  const wash = k.plane(STAGE.w * 0.9, 5, T(new THREE.MeshBasicMaterial({ map: pool, color: '#FFD9A0', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })));
  wash.rotation.x = -Math.PI / 2; wash.position.set(0, 0.01, STAGE.z1 - 2); scene.add(wash);

  // ---- the picture's layers, stood up back to front ------------------------------------------------------------------
  const flatW = STAGE.w - 1.6, flatH = flatW * (o.h / Math.max(1, o.w));
  const depths: number[] = [];
  const sparks: { n: number; x: number; z: number; g: THREE.Group; taken: boolean }[] = [];
  const spotsList: PlaceSpot[] = [];
  const rnd = (() => { let s = hashOf(o.seed) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const ready = (async () => {
    if (!o.url) return false;
    const img = await new Promise<HTMLImageElement | null>((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = o.url!; });
    if (!img) return false;
    let cut: Layer[] = [];
    try { cut = cutLayers(img, img.naturalWidth || o.w, img.naturalHeight || o.h); } catch { cut = []; }
    // the whole picture is the backdrop; the layers nearer the bottom of it stand out in front as paper cut-outs (the
    // top band is the backdrop's own: the sky stays where it is)
    const c = document.createElement('canvas'); c.width = img.naturalWidth || o.w; c.height = img.naturalHeight || o.h; c.getContext('2d')!.drawImage(img, 0, 0);
    // (the biggest layer is the picture's ground — water, sky, a wall — and stays on the backdrop too)
    const ground = cut.reduce((a, l, i) => (l.share > (cut[a]?.share ?? -1) ? i : a), -1);
    const front = cut.filter((l, i) => i !== ground && !(i === 0 && l.share > 0.25) && l.share < 0.6);
    const layers: Layer[] = [{ canvas: c, meanY: 0, color: [128, 128, 128], share: 1 }, ...front];
    const n = layers.length;
    layers.forEach((l, i) => {
      // back layers stand further away, a little taller (so they show over the ones in front)
      const z = STAGE.z0 + 1.2 + (i / Math.max(1, n - 1)) * (STAGE.z1 - STAGE.z0 - 4.6), lift = (n - 1 - i) * 0.35, s = 1 + (n - 1 - i) * 0.06;
      const tex = new THREE.CanvasTexture(l.canvas); T(tex); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }); T(m);
      const flat = new THREE.Mesh(T(new THREE.PlaneGeometry(flatW * s, flatH * s)), m);
      flat.position.set(0, (flatH * s) / 2 + lift, z); scene.add(flat); k.fadeable(flat, true);
      // its shadow on the boards
      const sh = k.plane(flatW * s * 0.9, 0.9, T(new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false })));
      sh.rotation.x = -Math.PI / 2; sh.position.set(0, 0.012, z - 0.45); scene.add(sh);
      depths.push(z);
    });
    // a spark behind each of the front layers (the furthest back is the backdrop: nothing hides behind it)
    const spots = depths.slice(1).reverse();
    for (let i = 0; i < o.sparks; i++) {
      const behind = spots[i % Math.max(1, spots.length)] ?? STAGE.z0 + 3;
      const x = (rnd() - 0.5) * (STAGE.w - 3.4), z = behind - 0.9 - rnd() * 0.8;
      const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
      const found = o.found.includes(i + 1);
      const star = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: starTex, color: found ? '#9AA3C7' : '#FFFFFF', transparent: true, opacity: found ? 0.4 : 1, depthWrite: false })));
      star.scale.set(0.75, 0.75, 1); star.position.y = 0.7; g.add(star);
      if (!found) {
        const halo = k.plane(1.4, 1.4, T(new THREE.MeshBasicMaterial({ map: pool, color: '#FFE14D', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })));
        halo.position.y = 0.7; g.add(halo); g.userData.halo = halo;
      }
      g.userData.star = star;
      sparks.push({ n: i + 1, x, z, g, taken: found });
      spotsList.push({ id: `spark:${i + 1}`, x, z, r: 0.85, off: found });
    }
    return true;
  })();

  const world: Diorama = {
    bounds: { x0: -STAGE.w / 2 + 0.4, x1: STAGE.w / 2 - 0.4, z0: STAGE.z0 + 0.4, z1: STAGE.z1 + 0.2 },
    start: { x: 0, z: STAGE.z1 - 0.8, face: 1 },
    floors: [floor], solids: [], spots: spotsList,
    camera: { height: 7.0, back: 5.0, look: 2.6, fov: 46, side: 0.6, tall: 0.42, fovTall: 5 },
    ready,
    take(n) {
      const s = sparks.find((x) => x.n === n); if (!s || s.taken) return;
      s.taken = true; const sp = spotsList.find((x) => x.id === `spark:${n}`); if (sp) sp.off = true;
      s.g.userData.fly = 0.001;
    },
    update(t, dt) {
      for (const s of sparks) {
        const star = s.g.userData.star as THREE.Sprite, halo = s.g.userData.halo as THREE.Mesh | undefined;
        if (s.g.userData.fly) {
          // taken: it rises and shrinks away
          s.g.userData.fly += dt; const f = s.g.userData.fly as number;
          star.position.y = 0.7 + f * 4; star.scale.setScalar(Math.max(0.01, 1 - f * 0.9));
          if (halo) (halo.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 - f);
          if (f > 1.2) s.g.visible = false;
          continue;
        }
        if (s.taken || k.reduceMotion) continue;
        star.material.rotation = Math.sin(t * 1.5 + s.n) * 0.4; star.position.y = 0.7 + Math.sin(t * 2.4 + s.n) * 0.08;
        if (halo) { halo.lookAt(k.camera.position); (halo.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 3 + s.n) * 0.15; }
      }
    },
  };
  return world;
}
