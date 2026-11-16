// Speech bubbles over people in a 3D place (an arcade hall, a party game…): what someone says pops up over their head
// for a few seconds, then fades. Only for scenes that already load three.js.
import * as THREE from 'three';

/** a bubble's picture: white, rounded, up to three lines, with a little tail */
function bubbleTexture(text: string, accent?: string, flip = false) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d')!;
  // (a scene drawn mirror-wise: draw the bubble mirrored, so it reads the right way round — a sprite's scale can't flip it)
  if (flip) { g.translate(512, 0); g.scale(-1, 1); }
  g.font = '600 30px ui-rounded, system-ui, sans-serif';
  const words = text.split(/\s+/).filter(Boolean), lines: string[] = []; let cur = '';
  for (const w of words) {
    let word = w;
    while (g.measureText(word).width > 440) { // a very long word: break it
      let k = word.length - 1; while (k > 1 && g.measureText(word.slice(0, k)).width > 440) k--;
      if (cur) { lines.push(cur); cur = ''; } lines.push(word.slice(0, k)); word = word.slice(k);
    }
    const t = cur ? `${cur} ${word}` : word;
    if (g.measureText(t).width > 440 && cur) { lines.push(cur); cur = word; } else cur = t;
  }
  if (cur) lines.push(cur);
  const ls = lines.slice(0, 3); if (lines.length > 3) ls[2] = `${ls[2].slice(0, -1)}…`;
  const w = Math.min(490, Math.max(60, ...ls.map((l) => g.measureText(l).width)) + 40), h = ls.length * 36 + 26;
  g.fillStyle = '#fff'; g.strokeStyle = accent ?? 'rgba(0,0,0,0.15)'; g.lineWidth = accent ? 5 : 3;
  g.beginPath(); g.roundRect((512 - w) / 2, 4, w, h, 22); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(240, h + 3); g.lineTo(256, h + 22); g.lineTo(272, h + 3); g.fill();
  g.fillStyle = '#1C1512'; g.textAlign = 'center'; g.textBaseline = 'middle';
  ls.forEach((l, i) => g.fillText(l, 256, 4 + 13 + 18 + i * 36));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export type Speech = {
  /** someone says something (id: theirs, or 'me') */ say(id: string, text: string, accent?: string): void;
  /** each frame: where each speaker's head is now (null: they've gone — their bubble goes too) */ tick(at: (id: string) => { x: number; y: number; z: number } | null): void;
  /** anyone talking right now (so a paused scene can keep drawing while a bubble's up) */ busy(): boolean;
  /** who has a bubble up */ ids(): string[];
  dispose(): void;
};

export function speechBubbles(scene: THREE.Scene, opts: { width?: number; flip?: boolean } = {}): Speech {
  const W = opts.width ?? 1.9;
  const bubbles = new Map<string, { s: THREE.Sprite; until: number }>();
  const drop = (id: string) => { const b = bubbles.get(id); if (!b) return; scene.remove(b.s); b.s.material.map?.dispose(); b.s.material.dispose(); bubbles.delete(id); };
  return {
    say(id, text, accent) {
      const body = String(text ?? '').trim().slice(0, 200); if (!body) return;
      drop(id);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture(body, accent, opts.flip), transparent: true, depthWrite: false, depthTest: false }));
      sp.center.set(0.5, 0); sp.scale.set(W, W * (160 / 512), 1); sp.renderOrder = 7; sp.visible = false;
      scene.add(sp); bubbles.set(id, { s: sp, until: performance.now() + 5500 + body.length * 40 });
    },
    tick(at) {
      const now = performance.now();
      for (const [id, b] of bubbles) {
        const p = at(id), left = b.until - now;
        if (!p || left <= 0) { drop(id); continue; }
        b.s.visible = true; b.s.position.set(p.x, p.y, p.z); b.s.material.opacity = Math.min(1, left / 400);
      }
    },
    busy: () => bubbles.size > 0,
    ids: () => [...bubbles.keys()],
    dispose() { for (const id of [...bubbles.keys()]) drop(id); },
  };
}
