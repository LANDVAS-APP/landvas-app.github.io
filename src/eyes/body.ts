// Your explorer, seen from inside: so the first-person view is plainly *your explorer's* eyes.
//  * hands at the bottom of the view, in your skin tone, sleeves in your outfit's colour, the right one holding
//    your explorer's own tool (brush, pencil, roller, spray can, palette, wand…);
//  * look down and there's your body: your outfit, your legs walking, your shoes;
//  * your shadow on the ground, long when the sun's low;
//  * on a bike you hold the handlebars (the front wheel turning below), in the car you hold the wheel behind the
//    dashboard and windscreen (the bonnet in your colour, a speedometer), on the jetpack you grip the thrusters
//    and their flames roar under you;
//  * the walk: a step rhythm that bobs the head, swings the hands and the legs, and calls `onStep` (footsteps).
// The hands and the seat are drawn last, in their own little scene with their own camera, so they never sink into
// a wall; the body and the shadow are in the world.
import * as THREE from 'three';
import { glowTexture } from './leviathan3d';

export type BodyLook = { skin: string; outfit: string; pants: string; shoes: string; accent: string; hold: string; aura: string };
export type BodyVehicle = 'walk' | 'bike' | 'car' | 'jet';
export type BodyFrame = {
  dt: number; t: number;
  /** how fast you're going over the ground (m/s) and turning (rad/s) */ speed: number; turn: number;
  yaw: number; pitch: number; vehicle: BodyVehicle;
  /** your eyes, in the world */ eye: THREE.Vector3; eyeHeight: number;
  /** the main camera's turn (to light the hands from the right side) */ camQ: THREE.Quaternion;
  /** 1 day … 0 night */ day: number; sun: THREE.Vector3;
  light: { dir: THREE.Color; dirI: number; sky: THREE.Color; ground: THREE.Color; hemiI: number };
};

const mat = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...o });

export function createBody(near: THREE.Scene, onStep?: (kind: 'step' | 'pedal', strong: number) => void) {
  const own: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { own.push(x); return x; };
  // ---- the hands' own little world (drawn on top) -----------------------------------------------------------------
  const overlay = new THREE.Scene();
  const ocam = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
  const hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1.5);
  const dir = new THREE.DirectionalLight('#ffffff', 1.5);
  overlay.add(hemi, dir, dir.target, ocam);
  const rig = new THREE.Group(); // follows the head's bob and sway
  ocam.add(rig);

  const skinM = T(mat('#FFE2C4', { roughness: 0.6 }));
  const sleeveM = T(mat('#8B5CFF', { roughness: 0.8 }));
  const cuffM = T(mat('#ffffff', { roughness: 0.8 }));
  const accentM = T(mat('#FF3D9A', { roughness: 0.45 }));
  const darkM = T(mat('#1B1E33', { roughness: 0.55 }));
  const metalM = T(mat('#C9CFDA', { roughness: 0.3, metalness: 0.8 }));
  const woodM = T(mat('#8B5A2B', { roughness: 0.65 }));
  const glowM = T(new THREE.MeshBasicMaterial({ color: '#FFE9A8' }));
  const sph = T(new THREE.SphereGeometry(1, 18, 12));
  const cap = T(new THREE.CapsuleGeometry(1, 1, 6, 12));
  const cyl = T(new THREE.CylinderGeometry(1, 1, 1, 14));
  const box = T(new THREE.BoxGeometry(1, 1, 1));
  const cone = T(new THREE.ConeGeometry(1, 1, 14));

  /** a hand: palm, curled fingers, thumb, and a forearm running off the bottom of the view in the sleeve */
  const makeHand = (side: 1 | -1) => {
    const g = new THREE.Group();
    const palm = new THREE.Mesh(sph, skinM); palm.scale.set(0.034, 0.03, 0.042); g.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(cap, skinM);
      f.scale.set(0.0105, 0.016, 0.0105);
      f.position.set(side * (-0.018 + i * 0.012), 0.004, -0.04);
      f.rotation.x = -1.2;
      g.add(f);
    }
    const thumb = new THREE.Mesh(cap, skinM); thumb.scale.set(0.012, 0.018, 0.012); thumb.position.set(side * -0.032, 0.012, -0.012); thumb.rotation.set(-0.6, 0, side * 0.9); g.add(thumb);
    const wrist = new THREE.Mesh(sph, skinM); wrist.scale.set(0.026, 0.024, 0.03); wrist.position.set(0, -0.006, 0.036); g.add(wrist);
    return g;
  };
  const left = makeHand(-1), right = makeHand(1);
  rig.add(left, right);
  // the forearms: a sleeve from each wrist down and back past the bottom of the view, a white cuff at the wrist
  const sleeveGeo = T(new THREE.CylinderGeometry(0.034, 0.05, 1, 14, 1, true).translate(0, 0.5, 0));
  const makeArm = () => {
    const g = new THREE.Group();
    const sleeve = new THREE.Mesh(sleeveGeo, sleeveM); sleeve.scale.y = 0.6; g.add(sleeve);
    const cuff = new THREE.Mesh(cyl, cuffM); cuff.scale.set(0.037, 0.022, 0.037); cuff.position.y = 0.012; g.add(cuff);
    rig.add(g);
    return g;
  };
  const arms = [makeArm(), makeArm()];
  const wristAt = new THREE.Vector3(0, -0.006, 0.05);
  const yUp = new THREE.Vector3(0, 1, 0);
  const tmpV = new THREE.Vector3(), tmpW = new THREE.Vector3();
  /** point a forearm from the hand's wrist toward an elbow well below and behind the view */
  const aimArm = (arm: THREE.Group, hand: THREE.Group, side: number, out = 0.3) => {
    hand.updateMatrix();
    tmpW.copy(wristAt).applyMatrix4(hand.matrix);
    tmpV.set(side * out, -0.8, 0.55).normalize();
    arm.position.copy(tmpW);
    arm.quaternion.setFromUnitVectors(yUp, tmpV);
  };

  // the tool in your right hand
  const tool = new THREE.Group();
  right.add(tool);
  let toolGlow: THREE.Sprite | null = null;
  const buildTool = (hold: string, accent: string, aura: string) => {
    for (const c of [...tool.children]) tool.remove(c);
    toolGlow = null;
    tool.position.set(0, 0.012, -0.018);
    tool.rotation.set(-0.95, 0, 0.12);
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, s: [number, number, number], p: [number, number, number], r: [number, number, number] = [0, 0, 0]) => {
      const x = new THREE.Mesh(geo, m); x.scale.set(...s); x.position.set(...p); x.rotation.set(...r); tool.add(x); return x;
    };
    const paint = T(mat(accent, { roughness: 0.35 }));
    switch (hold) {
      case 'pencil':
        add(T(new THREE.CylinderGeometry(1, 1, 1, 6)), T(mat('#FFC93D')), [0.009, 0.15, 0.009], [0, 0.06, 0]);
        add(cone, woodM, [0.009, 0.026, 0.009], [0, 0.148, 0]);
        add(cone, darkM, [0.003, 0.009, 0.003], [0, 0.163, 0]);
        add(cyl, T(mat('#FF7AB8')), [0.0095, 0.016, 0.0095], [0, -0.022, 0]);
        break;
      case 'roller':
        add(cyl, woodM, [0.008, 0.11, 0.008], [0, 0.02, 0]);
        add(cyl, metalM, [0.003, 0.09, 0.003], [0, 0.11, 0], [0, 0, 0.4]);
        add(cyl, paint, [0.02, 0.09, 0.02], [0.03, 0.16, 0], [0, 0, Math.PI / 2]);
        break;
      case 'spray':
        add(cyl, paint, [0.02, 0.09, 0.02], [0, 0.04, 0]);
        add(sph, paint, [0.02, 0.012, 0.02], [0, 0.085, 0]);
        add(cyl, darkM, [0.006, 0.014, 0.006], [0, 0.1, 0]);
        add(box, T(mat('#ffffff')), [0.024, 0.04, 0.0015], [0, 0.04, -0.0205]);
        break;
      case 'palette': {
        const p = add(cyl, T(mat('#E8C9A0', { roughness: 0.5 })), [0.07, 0.006, 0.05], [0.01, 0.06, -0.01], [1.25, 0, 0]);
        void p;
        const dots = ['#FF4D6D', '#FFE14D', '#3DDC97', '#34C3FF', accent];
        dots.forEach((c, i) => add(sph, T(mat(c, { roughness: 0.3 })), [0.009, 0.004, 0.009], [-0.04 + i * 0.018, 0.075 - (i % 2) * 0.01, -0.005 - (i % 2) * 0.012], [1.25, 0, 0]));
        break;
      }
      case 'wand':
        add(cyl, darkM, [0.005, 0.17, 0.005], [0, 0.07, 0]);
        add(sph, glowM, [0.01, 0.01, 0.01], [0, 0.158, 0]);
        toolGlow = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: glowTexture(), color: aura || accent, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
        toolGlow.scale.setScalar(0.07); toolGlow.position.set(0, 0.158, 0); tool.add(toolGlow);
        break;
      case 'joystick':
        tool.rotation.set(-0.2, 0, 0);
        add(box, darkM, [0.09, 0.022, 0.05], [0, 0.01, -0.02]);
        add(cyl, metalM, [0.003, 0.03, 0.003], [-0.02, 0.034, -0.02]);
        add(sph, T(mat('#FF3D3D', { roughness: 0.3 })), [0.009, 0.009, 0.009], [-0.02, 0.05, -0.02]);
        add(cyl, T(mat('#22E3FF')), [0.007, 0.006, 0.007], [0.02, 0.024, -0.025]);
        add(cyl, T(mat('#FFC93D')), [0.007, 0.006, 0.007], [0.032, 0.024, -0.012]);
        break;
      case 'plush':
        tool.rotation.set(-0.3, 0, 0);
        add(sph, T(mat('#C98A4E', { roughness: 0.95 })), [0.035, 0.038, 0.03], [0, 0.03, -0.02]);
        add(sph, T(mat('#C98A4E', { roughness: 0.95 })), [0.027, 0.026, 0.024], [0, 0.085, -0.02]);
        for (const x of [-0.02, 0.02]) add(sph, T(mat('#A8703C', { roughness: 0.95 })), [0.01, 0.01, 0.008], [x, 0.108, -0.02]);
        add(sph, darkM, [0.004, 0.004, 0.003], [-0.009, 0.09, -0.043]);
        add(sph, darkM, [0.004, 0.004, 0.003], [0.009, 0.09, -0.043]);
        break;
      case 'tickets':
        tool.rotation.set(-0.5, 0, 0.3);
        for (let i = 0; i < 6; i++) add(box, T(mat(i % 2 ? '#FFC93D' : '#FFB020')), [0.032, 0.02, 0.002], [0, 0.02 + i * 0.021, -i * 0.004], [0.15 * (i % 2 ? 1 : -1), 0, 0]);
        break;
      default: {
        if (!['brush', ''].includes(hold) && hold) {
          // an ultra tool: a wand that glows its theme
          add(cyl, darkM, [0.005, 0.17, 0.005], [0, 0.07, 0]);
          add(sph, glowM, [0.011, 0.011, 0.011], [0, 0.16, 0]);
          toolGlow = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: glowTexture(), color: aura || accent, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
          toolGlow.scale.setScalar(0.09); toolGlow.position.set(0, 0.16, 0); tool.add(toolGlow);
          break;
        }
        // a paintbrush, wet with your colour
        add(cyl, woodM, [0.0075, 0.13, 0.0075], [0, 0.03, 0]);
        add(cyl, metalM, [0.009, 0.03, 0.009], [0, 0.108, 0]);
        add(cone, T(mat('#E8D3A8', { roughness: 0.9 })), [0.011, 0.04, 0.011], [0, 0.142, 0], [Math.PI, 0, 0]);
        add(cone, paint, [0.0075, 0.02, 0.0075], [0, 0.155, 0], [Math.PI, 0, 0]);
      }
    }
  };

  // ---- the seat: handlebars, dashboard, thrusters -------------------------------------------------------------------
  const bike = new THREE.Group();
  {
    const frameM = T(mat('#FF3D9A', { roughness: 0.4, metalness: 0.3 }));
    bike.userData.frameM = frameM;
    const bar = new THREE.Mesh(cyl, metalM); bar.scale.set(0.012, 0.62, 0.012); bar.rotation.z = Math.PI / 2; bike.add(bar);
    for (const x of [-0.3, 0.3]) { const g = new THREE.Mesh(cyl, darkM); g.scale.set(0.02, 0.1, 0.02); g.rotation.z = Math.PI / 2; g.position.x = x; bike.add(g); }
    const stem = new THREE.Mesh(cyl, frameM); stem.scale.set(0.016, 0.3, 0.016); stem.position.set(0, -0.15, -0.08); stem.rotation.x = 0.3; bike.add(stem);
    const bell = new THREE.Mesh(sph, T(mat('#FFC93D', { metalness: 0.7, roughness: 0.25 }))); bell.scale.set(0.018, 0.012, 0.018); bell.position.set(-0.18, 0.018, 0); bike.add(bell);
    const lamp = new THREE.Mesh(cyl, darkM); lamp.scale.set(0.03, 0.05, 0.03); lamp.rotation.x = Math.PI / 2; lamp.position.set(0, -0.06, -0.06); bike.add(lamp);
    const lens = new THREE.Mesh(T(new THREE.CircleGeometry(0.026, 16)), T(new THREE.MeshBasicMaterial({ color: '#FFF6D0' }))); lens.position.set(0, -0.06, -0.086); lens.rotation.y = Math.PI; bike.add(lens);
    bike.userData.lens = lens;
    const wheel = new THREE.Group();
    const tyre = new THREE.Mesh(T(new THREE.TorusGeometry(0.34, 0.03, 10, 40)), darkM); wheel.add(tyre);
    for (let i = 0; i < 12; i++) { const s = new THREE.Mesh(cyl, metalM); s.scale.set(0.0025, 0.66, 0.0025); s.rotation.z = (i / 12) * Math.PI; wheel.add(s); }
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(0, -0.52, -0.3);
    bike.add(wheel);
    bike.userData.wheel = wheel;
  }
  // the car, built around the steering wheel's centre (placed on screen each frame)
  const car = new THREE.Group();
  const carTop = new THREE.Group(); // the windscreen's frame, the roof and the mirror: pinned to the screen's edges
  const speedCanvas = Object.assign(document.createElement('canvas'), { width: 128, height: 64 });
  const speedTex = T(new THREE.CanvasTexture(speedCanvas));
  speedTex.colorSpace = THREE.SRGBColorSpace;
  const pillars: THREE.Mesh[] = [];
  let roof: THREE.Mesh, mirror: THREE.Group;
  {
    const dashM = T(mat('#1D2035', { roughness: 0.9 }));
    const trimM = T(mat('#2C3150', { roughness: 0.6, metalness: 0.2 }));
    const dash = new THREE.Mesh(box, dashM); dash.scale.set(2.4, 0.16, 0.55); dash.position.set(0, -0.13, -0.2); car.add(dash);
    const lip = new THREE.Mesh(cyl, trimM); lip.scale.set(0.05, 2.4, 0.05); lip.rotation.z = Math.PI / 2; lip.position.set(0, -0.05, 0.06); car.add(lip);
    const hood = new THREE.Mesh(box, dashM); hood.scale.set(0.42, 0.07, 0.2); hood.position.set(0, -0.03, -0.12); car.add(hood);
    const bonnetM = T(mat('#FF3D9A', { roughness: 0.25, metalness: 0.45 }));
    car.userData.bonnetM = bonnetM;
    const bonnet = new THREE.Mesh(box, bonnetM); bonnet.scale.set(2.2, 0.05, 1.5); bonnet.position.set(0, -0.2, -1.2); bonnet.rotation.x = -0.1; car.add(bonnet);
    const bulge = new THREE.Mesh(box, bonnetM); bulge.scale.set(0.5, 0.04, 1.3); bulge.position.set(0, -0.165, -1.2); bulge.rotation.x = -0.1; car.add(bulge);
    const gauge = new THREE.Mesh(T(new THREE.PlaneGeometry(0.2, 0.1)), T(new THREE.MeshBasicMaterial({ map: speedTex, transparent: true })));
    gauge.position.set(0, 0.012, -0.2); gauge.rotation.x = -0.35; car.add(gauge);
    // air vents and a little phone mount with the map on it
    for (const x of [-0.55, 0.55]) { const v = new THREE.Mesh(box, trimM); v.scale.set(0.16, 0.05, 0.02); v.position.set(x, -0.06, 0.07); car.add(v); }
    // the steering wheel (hands go on it)
    const wheel = new THREE.Group();
    wheel.add(new THREE.Mesh(T(new THREE.TorusGeometry(0.16, 0.019, 10, 40)), darkM));
    for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(box, trimM); const a = (i / 3) * Math.PI * 2 + Math.PI / 2; s.scale.set(0.014, 0.15, 0.012); s.rotation.z = a - Math.PI / 2; s.position.set(Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0); wheel.add(s); }
    const hub = new THREE.Mesh(cyl, accentM); hub.scale.set(0.032, 0.025, 0.032); hub.rotation.x = Math.PI / 2; wheel.add(hub);
    const column = new THREE.Mesh(cyl, dashM); column.scale.set(0.035, 0.22, 0.035); column.rotation.x = Math.PI / 2; column.position.z = -0.1; wheel.add(column);
    wheel.rotation.x = -0.55;
    car.add(wheel);
    car.userData.wheel = wheel;
    // the frame: two slim pillars at the screen's edges leaning in, a roof strip along the top, the rear-view mirror
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(box, dashM); p.scale.set(0.07, 2.2, 0.06); p.userData.side = sx; carTop.add(p); pillars.push(p); }
    roof = new THREE.Mesh(box, T(mat('#3A3F5C', { roughness: 0.95 }))); roof.scale.set(3, 0.14, 0.4); carTop.add(roof);
    mirror = new THREE.Group();
    const mStem = new THREE.Mesh(box, darkM); mStem.scale.set(0.012, 0.06, 0.012); mStem.position.y = 0.04; mirror.add(mStem);
    const mBody = new THREE.Mesh(box, darkM); mBody.scale.set(0.2, 0.06, 0.02); mirror.add(mBody);
    const mGlass = new THREE.Mesh(box, T(mat('#A9BEE0', { metalness: 0.9, roughness: 0.08 }))); mGlass.scale.set(0.18, 0.045, 0.004); mGlass.position.z = 0.011; mirror.add(mGlass);
    carTop.add(mirror);
  }
  const jet = new THREE.Group();
  const flames: THREE.Mesh[] = [];
  {
    const shellM = T(mat('#C9CFDA', { roughness: 0.25, metalness: 0.85 }));
    const flameM = T(new THREE.MeshBasicMaterial({ color: '#FFB347', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    const coreM = T(new THREE.MeshBasicMaterial({ color: '#FFF4C2', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    for (const sx of [-1, 1]) {
      const g = new THREE.Group();
      const handle = new THREE.Mesh(cyl, darkM); handle.scale.set(0.02, 0.13, 0.02); g.add(handle);
      const arm = new THREE.Mesh(box, shellM); arm.scale.set(0.03, 0.03, 0.2); arm.position.set(0, -0.07, 0.07); g.add(arm);
      const nozzle = new THREE.Mesh(T(new THREE.CylinderGeometry(0.05, 0.07, 0.12, 16, 1, true)), shellM); nozzle.position.set(sx * 0.08, -0.22, 0.12); g.add(nozzle);
      const fl = new THREE.Mesh(cone, flameM); fl.scale.set(0.06, 0.4, 0.06); fl.rotation.x = Math.PI; fl.position.set(sx * 0.08, -0.48, 0.12); g.add(fl);
      const core = new THREE.Mesh(cone, coreM); core.scale.set(0.03, 0.22, 0.03); core.rotation.x = Math.PI; core.position.set(sx * 0.08, -0.38, 0.12); g.add(core);
      flames.push(fl, core);
      const btn = new THREE.Mesh(sph, T(mat('#FF3D3D', { roughness: 0.3 }))); btn.scale.setScalar(0.012); btn.position.set(0, 0.07, -0.006); g.add(btn);
      g.position.set(sx * 0.26, -0.28, -0.42);
      g.userData.side = sx;
      jet.add(g);
    }
  }
  rig.add(bike, car, carTop, jet);

  // ---- your body in the world (look down) ---------------------------------------------------------------------------
  const body = new THREE.Group();
  near.add(body);
  const outfitM = T(mat('#8B5CFF', { roughness: 0.8 }));
  const pantsM = T(mat('#2B2F4A', { roughness: 0.85 }));
  const shoeM = T(mat('#F4F6FF', { roughness: 0.5 }));
  const stripeM = T(mat('#FF3D9A', { roughness: 0.5 }));
  const torso = new THREE.Mesh(cap, outfitM); torso.scale.set(0.16, 0.16, 0.1); torso.position.set(0, 1.08, 0.13); body.add(torso);
  const belt = new THREE.Mesh(cyl, accentM); belt.scale.set(0.155, 0.03, 0.1); belt.position.set(0, 0.9, 0.13); body.add(belt);
  const legs: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.09, 0.9, 0.08);
    const thigh = new THREE.Mesh(cap, pantsM); thigh.scale.set(0.075, 0.2, 0.075); thigh.position.y = -0.22; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
    const shin = new THREE.Mesh(cap, pantsM); shin.scale.set(0.065, 0.18, 0.065); shin.position.y = -0.2; knee.add(shin);
    const shoe = new THREE.Mesh(box, shoeM); shoe.scale.set(0.1, 0.07, 0.22); shoe.position.set(0, -0.42, -0.05); knee.add(shoe);
    const stripe = new THREE.Mesh(box, stripeM); stripe.scale.set(0.102, 0.02, 0.12); stripe.position.set(0, -0.4, -0.04); knee.add(stripe);
    hip.userData.knee = knee;
    body.add(hip);
    legs.push(hip);
  }
  // a bike under you when you ride one
  const bikeFrame = new THREE.Group();
  {
    const frameM = bike.userData.frameM as THREE.Material;
    const tube = (a: THREE.Vector3, b: THREE.Vector3, r = 0.022) => {
      const m = new THREE.Mesh(cyl, frameM);
      const d = b.clone().sub(a);
      m.scale.set(r, d.length(), r);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      bikeFrame.add(m);
    };
    const seat = new THREE.Vector3(0, 0.92, 0.25), crank = new THREE.Vector3(0, 0.32, -0.05), head = new THREE.Vector3(0, 0.98, -0.55);
    const rearHub = new THREE.Vector3(0, 0.34, 0.55), frontHub = new THREE.Vector3(0, 0.34, -0.85);
    tube(seat, crank); tube(seat, head); tube(crank, head); tube(crank, rearHub); tube(seat, rearHub); tube(head, frontHub);
    for (const hub of [rearHub, frontHub]) {
      const w = new THREE.Mesh(T(new THREE.TorusGeometry(0.33, 0.028, 8, 32)), darkM);
      w.position.copy(hub); w.rotation.y = Math.PI / 2; bikeFrame.add(w);
    }
    const saddle = new THREE.Mesh(box, darkM); saddle.scale.set(0.12, 0.04, 0.24); saddle.position.set(0, 0.96, 0.26); bikeFrame.add(saddle);
    bikeFrame.userData.crank = crank;
  }
  body.add(bikeFrame);
  const jetFlames = new THREE.Group();
  {
    const fM = T(new THREE.MeshBasicMaterial({ color: '#FF9E3D', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    for (const sx of [-1, 1]) { const f = new THREE.Mesh(cone, fM); f.scale.set(0.09, 0.8, 0.09); f.rotation.x = Math.PI; f.position.set(sx * 0.14, 0.5, 0.28); jetFlames.add(f); }
    const pack = new THREE.Mesh(box, T(mat('#C9CFDA', { metalness: 0.8, roughness: 0.3 }))); pack.scale.set(0.34, 0.45, 0.16); pack.position.set(0, 1.2, 0.3); jetFlames.add(pack);
  }
  body.add(jetFlames);

  // ---- your shadow --------------------------------------------------------------------------------------------------
  const shadowTex = (() => {
    const c = Object.assign(document.createElement('canvas'), { width: 64, height: 256 });
    const g = c.getContext('2d')!;
    const blob = (x: number, y: number, rx: number, ry: number) => { const r = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry)); r.addColorStop(0, 'rgba(0,0,0,0.9)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.translate(x, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-x, -y); g.fillStyle = r; g.beginPath(); g.arc(x, y, Math.max(rx, ry), 0, Math.PI * 2); g.fill(); g.restore(); };
    blob(32, 238, 20, 14); // feet
    blob(32, 150, 16, 80); // body
    blob(32, 56, 14, 14); // head
    const t = new THREE.CanvasTexture(c);
    return T(t);
  })();
  const shadowM = T(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, color: '#000000', opacity: 0.4 }));
  const shadow = new THREE.Mesh(T(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5)), shadowM);
  shadow.renderOrder = 2;
  near.add(shadow);

  // ---- state --------------------------------------------------------------------------------------------------------
  let vehicle: BodyVehicle = 'walk';
  let phase = 0, moving = 0, lastStep = 0, turnS = 0, throwT = -1, reachT = -1, kick = 0, engine = 0;
  const bob = { y: 0, x: 0, roll: 0 };
  let lastSpeedDraw = -1;

  const setLook = (l: BodyLook) => {
    skinM.color.set(l.skin);
    sleeveM.color.set(l.outfit);
    outfitM.color.set(l.outfit);
    pantsM.color.set(l.pants);
    shoeM.color.set(l.shoes);
    stripeM.color.set(l.accent);
    accentM.color.set(l.accent);
    (bike.userData.frameM as THREE.MeshStandardMaterial).color.set(l.accent);
    (car.userData.bonnetM as THREE.MeshStandardMaterial).color.set(l.accent);
    buildTool(l.hold, l.accent, l.aura);
  };

  const update = (f: BodyFrame) => {
    vehicle = f.vehicle;
    const dt = f.dt, t = f.t;
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
    // the hands' lighting follows the world's
    hemi.color.copy(f.light.sky); hemi.groundColor.copy(f.light.ground); hemi.intensity = f.light.hemiI;
    dir.color.copy(f.light.dir); dir.intensity = f.light.dirI;
    dir.position.copy(f.sun).applyQuaternion(f.camQ.clone().invert()).multiplyScalar(5);
    // which hands and which seat
    bike.visible = vehicle === 'bike'; car.visible = vehicle === 'car'; jet.visible = vehicle === 'jet';
    tool.visible = vehicle === 'walk';
    const lookDown = Math.max(0, Math.min(1, (-f.pitch - 0.55) / 0.5));
    rig.position.set(-bob.x * 0.6, -bob.y * 0.4 - lookDown * 0.12, 0);
    rig.rotation.z = bob.roll * 2;
    kick = Math.max(0, kick - dt * 3);
    // everything here is placed by where it should sit on screen, so a tall phone and a wide one both see the hands
    const tanV = Math.tan((ocam.fov * Math.PI) / 360), tanH = tanV * ocam.aspect;
    const tall = ocam.aspect < 1;
    /** a point at screen position (nx, ny) (-1…1), d metres in front */
    const at = (nx: number, ny: number, d: number, out = new THREE.Vector3()) => out.set(nx * d * tanH, ny * d * tanV, -d);
    /** how far away something r wide must be to look `share` of the half-screen wide */
    const fit = (r: number, share: number) => r / (share * tanH);
    carTop.visible = vehicle === 'car';
    if (vehicle === 'walk') {
      const d = fit(0.034, tall ? 0.13 : 0.065);
      const sw = Math.sin(phase) * moving;
      at(-0.6, -0.66, d, left.position).add(tmpV.set(-sw * 0.01, Math.abs(sw) * 0.012 + Math.sin(t * 1.3) * 0.003, sw * 0.03));
      at(0.52, -0.58, d, right.position).add(tmpV.set(sw * 0.01, -Math.abs(sw) * 0.01 + Math.sin(t * 1.4 + 1) * 0.003, -sw * 0.03));
      left.rotation.set(0.25, 0.25, 0.25);
      right.rotation.set(0.2, -0.2, -0.15);
      // a throw: the right hand swings up and forward
      if (throwT >= 0) {
        throwT += dt / 0.45;
        const k = Math.sin(Math.min(1, throwT) * Math.PI);
        right.position.add(tmpV.set(-0.05 * k, 0.16 * k, -0.18 * k));
        right.rotation.x += -0.9 * k;
        if (throwT >= 1) throwT = -1;
      }
      // a reach: the left hand stretches out to catch
      if (reachT >= 0) {
        reachT += dt / 0.5;
        const k = Math.sin(Math.min(1, reachT) * Math.PI);
        left.position.add(tmpV.set(0.12 * k, 0.2 * k, -0.22 * k));
        left.rotation.x += -0.6 * k;
        if (reachT >= 1) reachT = -1;
      }
      aimArm(arms[0], left, -1); aimArm(arms[1], right, 1);
    } else if (vehicle === 'bike') {
      const d = fit(0.31, tall ? 0.95 : 0.42);
      at(0, -0.62, d, bike.position);
      bike.rotation.y = -turnS * 0.25;
      const lean = bike.rotation.y;
      left.position.set(bike.position.x - 0.3 * Math.cos(lean), bike.position.y + 0.012, bike.position.z + 0.3 * Math.sin(lean));
      right.position.set(bike.position.x + 0.3 * Math.cos(lean), bike.position.y + 0.012, bike.position.z - 0.3 * Math.sin(lean));
      left.rotation.set(-0.2, 0, 0.3); right.rotation.set(-0.2, 0, -0.3);
      aimArm(arms[0], left, -1, 0.15); aimArm(arms[1], right, 1, 0.15);
      (bike.userData.wheel as THREE.Group).rotation.x -= f.speed * dt / 0.34;
      ((bike.userData.lens as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(f.day < 0.4 ? '#FFF6D0' : '#8A8F9E');
    } else if (vehicle === 'car') {
      const d = fit(0.16, tall ? 0.62 : 0.24);
      at(0, -0.8, d, car.position);
      const wheel = car.userData.wheel as THREE.Group;
      wheel.rotation.z = -turnS * 0.9;
      const rim = (ang: number, out: THREE.Vector3) => out.set(Math.cos(ang) * 0.16, Math.sin(ang) * 0.16, 0).applyEuler(new THREE.Euler(-0.55, 0, 0)).add(car.position);
      rim(Math.PI * 0.83 - turnS * 0.9, left.position);
      rim(Math.PI * 0.17 - turnS * 0.9, right.position);
      left.rotation.set(-0.9, 0.2, 0.6); right.rotation.set(-0.9, -0.2, -0.6);
      aimArm(arms[0], left, -1, 0.2); aimArm(arms[1], right, 1, 0.2);
      // the frame, pinned to the screen: pillars just inside the edges, the roof along the top, the mirror under it
      const pd = 0.9;
      for (const p of pillars) { const sx = p.userData.side as number; at(sx * 0.97, 0.1, pd, p.position); p.rotation.z = sx * 0.22; }
      at(0, 1.02, pd, roof.position);
      at(0.18, tall ? 0.6 : 0.72, pd, mirror.position);
      // the speedometer
      const kmh = Math.round(f.speed * 3.6);
      if (kmh !== lastSpeedDraw) {
        lastSpeedDraw = kmh;
        const g = speedCanvas.getContext('2d')!;
        g.clearRect(0, 0, 128, 64);
        g.fillStyle = 'rgba(8,10,24,0.9)'; g.beginPath(); g.roundRect(2, 2, 124, 60, 14); g.fill();
        g.strokeStyle = '#22E3FF'; g.lineWidth = 4; g.beginPath(); g.arc(64, 58, 44, Math.PI, Math.PI + Math.PI * Math.min(1, kmh / 160)); g.stroke();
        g.fillStyle = '#fff'; g.font = 'bold 26px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(String(kmh), 64, 48);
        g.font = 'bold 10px system-ui, sans-serif'; g.fillStyle = '#9FB4D8'; g.fillText('km/h', 64, 60);
        speedTex.needsUpdate = true;
      }
    } else {
      const d = fit(0.05, tall ? 0.2 : 0.09);
      jet.children.forEach((g) => {
        const sx = g.userData.side as number;
        at(sx * 0.55, -0.55, d, g.position); g.position.y += Math.sin(t * 2 + sx) * 0.004;
        g.rotation.z = -turnS * 0.15;
      });
      const [gl, gr] = jet.children;
      left.position.copy(gl.position).add(tmpV.set(0, 0.04, 0)); right.position.copy(gr.position).add(tmpV.set(0, 0.04, 0));
      left.rotation.set(-0.1, 0, 0.5); right.rotation.set(-0.1, 0, -0.5);
      aimArm(arms[0], left, -1, 0.25); aimArm(arms[1], right, 1, 0.25);
      const fl = 0.85 + Math.random() * 0.3;
      flames.forEach((m, i) => { m.scale.y = (i % 2 ? 0.22 : 0.4) * fl * (1 + moving * 0.5); });
    }
    if (toolGlow) toolGlow.scale.setScalar((0.07 + Math.sin(t * 6) * 0.01) * (vehicle === 'walk' ? 1 : 0));
    // the body under you
    body.position.set(f.eye.x, f.eye.y - f.eyeHeight, f.eye.z);
    body.rotation.y = -f.yaw;
    body.visible = vehicle !== 'car';
    torso.visible = belt.visible = vehicle !== 'car';
    bikeFrame.visible = vehicle === 'bike';
    jetFlames.visible = vehicle === 'jet';
    legs.forEach((hip, i) => {
      const knee = hip.userData.knee as THREE.Group;
      if (vehicle === 'walk') {
        const s = Math.sin(phase + (i ? Math.PI : 0)) * moving;
        hip.rotation.x = s * 0.5; knee.rotation.x = Math.max(0, -s) * 0.6;
        hip.position.y = 0.9;
      } else if (vehicle === 'bike') {
        const c = phase * 2 + (i ? Math.PI : 0);
        hip.position.y = 0.95; hip.rotation.x = -0.9 + Math.sin(c) * 0.35; knee.rotation.x = 1.2 + Math.cos(c) * 0.35;
      } else { hip.position.y = 0.9; hip.rotation.x = Math.sin(t * 1.2 + i) * 0.12; knee.rotation.x = 0.25; }
    });
    // the shadow: away from the sun, long when it's low; up on the jetpack it shrinks and fades below you
    const sunAlt = Math.asin(Math.max(-1, Math.min(1, f.sun.y)));
    const ground = f.eye.y - f.eyeHeight;
    const up = Math.max(0, f.eyeHeight - 1.7);
    const len = Math.min(5, 1.75 / Math.tan(Math.max(0.2, sunAlt)));
    shadow.position.set(f.eye.x, ground + 0.03 - up, f.eye.z);
    shadow.scale.set(vehicle === 'car' ? 2 : 0.7, 1, vehicle === 'car' ? 4.2 : len);
    shadow.rotation.y = Math.atan2(f.sun.x, f.sun.z);
    shadowM.opacity = (vehicle === 'jet' ? 0.25 / (1 + up / 10) : 0.42) * Math.max(0, Math.min(1, (f.day - 0.15) * 2)) * (sunAlt > 0 ? 1 : 0);
    shadow.visible = shadowM.opacity > 0.01;
  };

  return {
    overlay, ocam, body, shadow,
    setLook,
    update,
    /** how the head moves this frame (apply to the camera) */ bob: () => bob,
    throw: () => { throwT = 0; },
    reach: () => { reachT = 0; },
    kick: () => { kick = 1; },
    resize: (aspect: number) => { ocam.aspect = aspect; ocam.fov = aspect < 0.7 ? 70 : 58; ocam.updateProjectionMatrix(); },
    dispose: () => { near.remove(body, shadow); for (const d of own) d.dispose(); },
  };
}
export type Body = ReturnType<typeof createBody>;
