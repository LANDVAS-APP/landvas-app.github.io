// How your explorer moves, seen from inside: the walk's step rhythm (the head bobs and sways, the hands swing, a
// footstep sounds at the bottom of each bob), a pedalling rhythm on the bike, the hum of the car, the hover of the
// jetpack. The hands, the held cosmetic and the seat are drawn in the explorer's own 2D art over the view
// (selfView.ts / FirstPersonSelf.tsx), reading this module's pose each frame; what's in the world is your shadow:
// your explorer's own silhouette on the ground, long when the sun's low.
import * as THREE from 'three';

export type BodyVehicle = 'walk' | 'bike' | 'car' | 'jet';
export type BodyFrame = {
  dt: number; t: number;
  /** how fast you're going over the ground (m/s) and turning (rad/s) */ speed: number; turn: number;
  yaw: number; pitch: number; vehicle: BodyVehicle;
  /** your eyes, in the world */ eye: THREE.Vector3; eyeHeight: number;
  /** 1 day … 0 night */ day: number; sun: THREE.Vector3;
};
/** what the first-person drawing of your explorer needs each frame */
export type SelfPose = {
  vehicle: BodyVehicle; x: number; y: number; roll: number;
  /** the step cycle (radians) and how much you're moving (0…1) */ phase: number; moving: number;
  turn: number; speed: number; lookDown: number; pitch: number;
  /** a throw (right hand) and a reach (left hand) in progress: 0…1…0 */ throwK: number; reachK: number;
  day: number;
};

export function createBody(near: THREE.Scene, onStep?: (kind: 'step' | 'pedal', strong: number) => void) {
  const own: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { own.push(x); return x; };

  // ---- your shadow: your explorer's own silhouette ------------------------------------------------------------------
  const blobTex = (() => {
    const c = Object.assign(document.createElement('canvas'), { width: 64, height: 256 });
    const g = c.getContext('2d')!;
    const blob = (x: number, y: number, rx: number, ry: number) => { const r = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry)); r.addColorStop(0, 'rgba(0,0,0,0.9)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.translate(x, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-x, -y); g.fillStyle = r; g.beginPath(); g.arc(x, y, Math.max(rx, ry), 0, Math.PI * 2); g.fill(); g.restore(); };
    blob(32, 238, 20, 14); blob(32, 150, 16, 80); blob(32, 56, 14, 14);
    return T(new THREE.CanvasTexture(c));
  })();
  const shadowM = T(new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: '#000000', opacity: 0.4 }));
  // (a plane whose far end is the shadow's head: it lies away from the sun from your feet)
  const shadow = new THREE.Mesh(T(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5)), shadowM);
  shadow.renderOrder = 2;
  near.add(shadow);
  let silTex: THREE.Texture | null = null;
  /** the silhouette of your explorer (feet at the bottom of the picture) */
  const setShadowImage = (c: HTMLCanvasElement | null) => {
    silTex?.dispose(); silTex = null;
    if (c) silTex = new THREE.CanvasTexture(c);
    shadowM.map = silTex ?? blobTex;
    shadowM.needsUpdate = true;
  };

  // ---- the rhythm ---------------------------------------------------------------------------------------------------
  let vehicle: BodyVehicle = 'walk';
  let phase = 0, moving = 0, lastStep = 0, turnS = 0, throwT = -1, reachT = -1, engine = 0, pitch = 0, lookDown = 0, speed = 0, day = 1;
  const bob = { y: 0, x: 0, roll: 0 };

  const update = (f: BodyFrame) => {
    vehicle = f.vehicle;
    const dt = f.dt, t = f.t;
    speed = f.speed; pitch = f.pitch; day = f.day;
    moving += ((f.speed > 0.25 ? 1 : 0) - moving) * Math.min(1, dt * 6);
    turnS += (Math.max(-2, Math.min(2, f.turn)) - turnS) * Math.min(1, dt * 5);
    // the step rhythm: faster when you go faster (a walk is ~2 steps a second)
    const hz = vehicle === 'walk' ? Math.max(1.5, Math.min(2.8, 1.2 + f.speed * 0.5)) : vehicle === 'bike' ? Math.max(0.8, Math.min(1.8, f.speed * 0.25)) : 0;
    phase += dt * hz * Math.PI * moving;
    // a footstep (or a pedal) at the bottom of each bob
    const step = Math.floor(phase / Math.PI);
    if (step !== lastStep && moving > 0.5 && (vehicle === 'walk' || vehicle === 'bike')) { lastStep = step; onStep?.(vehicle === 'walk' ? 'step' : 'pedal', Math.min(1, f.speed / 4)); }
    else if (step !== lastStep) lastStep = step;
    // how the head moves
    if (vehicle === 'walk') {
      bob.y = -Math.abs(Math.sin(phase)) * 0.045 * moving + 0.022 * moving;
      bob.x = Math.sin(phase) * 0.022 * moving;
      bob.roll = Math.sin(phase) * 0.006 * moving + Math.sin(t * 0.9) * 0.0015;
    } else if (vehicle === 'bike') {
      bob.y = Math.sin(phase * 2) * 0.008 * moving;
      bob.x = Math.sin(phase) * 0.01 * moving;
      bob.roll = -turnS * 0.05 + Math.sin(phase) * 0.004 * moving;
    } else if (vehicle === 'car') {
      engine = 0.002 + Math.min(1, f.speed / 15) * 0.004;
      bob.y = (Math.random() - 0.5) * engine * moving + Math.sin(t * 1.7) * 0.002;
      bob.x = 0;
      bob.roll = -turnS * 0.02;
    } else {
      bob.y = Math.sin(t * 2.3) * 0.06 + Math.sin(t * 5.1) * 0.01;
      bob.x = Math.sin(t * 1.3) * 0.04;
      bob.roll = Math.sin(t * 1.1) * 0.01 - turnS * 0.08;
    }
    lookDown = Math.max(0, Math.min(1, (-f.pitch - 0.55) / 0.5));
    if (throwT >= 0) { throwT += dt / 0.45; if (throwT >= 1) throwT = -1; }
    if (reachT >= 0) { reachT += dt / 0.5; if (reachT >= 1) reachT = -1; }
    // the shadow: away from the sun, long when it's low; up on the jetpack it shrinks and fades below you
    const sunAlt = Math.asin(Math.max(-1, Math.min(1, f.sun.y)));
    const ground = f.eye.y - f.eyeHeight;
    const up = Math.max(0, f.eyeHeight - 1.7);
    const len = Math.min(6, 1.75 / Math.tan(Math.max(0.18, sunAlt)));
    shadow.position.set(f.eye.x, ground + 0.03 - up, f.eye.z);
    // (the silhouette keeps its proportions: as wide as it is long, over its height)
    shadow.scale.set(vehicle === 'car' ? 2 : silTex ? len * (46 / 68) : 0.7, 1, vehicle === 'car' ? 4.2 : len);
    shadow.rotation.y = Math.atan2(f.sun.x, f.sun.z);
    shadowM.opacity = (vehicle === 'jet' ? 0.25 / (1 + up / 10) : 0.42) * Math.max(0, Math.min(1, (f.day - 0.15) * 2)) * (sunAlt > 0 ? 1 : 0);
    shadow.visible = shadowM.opacity > 0.01;
  };

  return {
    shadow,
    update,
    setShadowImage,
    /** how the head moves this frame (apply to the camera) */ bob: () => bob,
    pose: (): SelfPose => ({
      vehicle, x: bob.x, y: bob.y, roll: bob.roll, phase, moving, turn: turnS, speed, lookDown, pitch,
      throwK: throwT >= 0 ? Math.sin(Math.min(1, throwT) * Math.PI) : 0, reachK: reachT >= 0 ? Math.sin(Math.min(1, reachT) * Math.PI) : 0, day,
    }),
    throw: () => { throwT = 0; },
    reach: () => { reachT = 0; },
    dispose: () => { near.remove(shadow); silTex?.dispose(); for (const d of own) d.dispose(); },
  };
}
export type Body = ReturnType<typeof createBody>;
