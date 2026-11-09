// The six carnival booth games run headless: every one of them scores when you tap (or hold) at the booth.
import { it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCarnival } from '../../src/arcade/carnival3d';
it('every carnival booth game scores from taps in the 3D booth', () => {
  const noop: any = new Proxy(function () {}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : noop), apply: () => noop, set: () => true });
  (globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };
  const scene = new THREE.Scene();
  const k = { scene, T: (x: any) => x, phone: false, std: (c: string, p: any = {}) => new THREE.MeshStandardMaterial({ color: c, ...p }), glow: (c: string) => new THREE.MeshStandardMaterial({ color: c }), emojiSprite: () => new THREE.Sprite(), labelTex: () => new THREE.Texture() } as any;
  const c = buildCarnival(k);
  let ended = -1;
  void ended;
  for (const id of ['crabs', 'ducks', 'striker', 'watergun', 'bottles', 'darts']) {
    c.startGame(id, 7, () => {}, (s) => (ended = s));
    const f = c.focusOf(id)!;
    const cam = new THREE.PerspectiveCamera(52, 0.5, 0.05, 120); cam.position.copy(f.focus).addScaledVector(f.focusN, f.focusDist * 1.6); cam.lookAt(f.focus); cam.updateMatrixWorld();
    let t = 0;
    for (let i = 0; i < 400; i++) {
      t += 0.05; c.update(t, 0.05, 30, 30); scene.updateMatrixWorld(true);
      const r = new THREE.Raycaster(); r.setFromCamera(new THREE.Vector2(((i * 37) % 160) / 100 - 0.8, ((i * 53) % 120) / 100 - 0.6), cam);
      c.input('down', r); if (id === 'watergun') continue; c.input('up', r);
    }
    expect(c.gameState()?.score, id).toBeGreaterThan(0);
    c.stopGame();
  }
});
