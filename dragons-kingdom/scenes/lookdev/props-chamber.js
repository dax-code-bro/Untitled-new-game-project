// Props - in-context angle for the Verdor props: a corner of a birthing chamber (PROVISIONAL). The
// egg (cracked, a fragment lifted) in its nest of straw round a folded linen pad; a bench along the
// wall with bowls of water, stacked folded cloths and clay oil lamps (lit); a stool. Flag floor
// from the architecture library; the walls a plain limewashed stone (blocks of the architecture
// kit). Light: two small warm lamps and cool daylight falling from a high window at the left.
// 35 mm, T2.8, low over the floor.
//
//   node render/render.mjs --still scenes/lookdev/props-chamber.js --time 1 --preset final --png out.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { Kit as ArchKit, frame as aframe, block, makeRand } from '../lib/architecture/core.js';
import { archMaterials } from '../lib/architecture/materials.js';
import { flagFloor } from '../lib/architecture/interiors.js';
import { verdorKit, bowl, foldedCloth, oilLamp } from '../lib/props/verdor.js';
import { Kit, rng, sub, yawFrame } from '../lib/props/core.js';
import { bench, stool } from '../lib/props/containers.js';
import { filmFinish } from './finish.js';

export const meta = {
  title: 'Props - Verdor chamber corner (PROVISIONAL)',
  duration: 4,
  seed: 6,
  cinematic: filmFinish({
    atmosphere: { enabled: false },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.4 },
    dof: { samples: 64 },
    grade: { exposure: 0.9, whiteBalance: 4300 },
  }),
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export async function setup(ctx) {
  const { scene } = ctx;
  const env = await loadHDRI('hdri/old_room', ctx, {});
  env.apply(scene, { background: false, environment: true, sunLight: false });
  scene.environmentIntensity = 0.12;
  scene.background = new THREE.Color(0, 0, 0);
  // daylight from a high window (left), a little cold
  const day = new THREE.DirectionalLight(new THREE.Color(0.75, 0.85, 1.0), 3.2);
  day.position.set(-6, 9, 2); day.target.position.set(0.3, 0, -0.4);
  day.castShadow = true; day.shadow.mapSize.set(4096, 4096); day.shadow.bias = -0.0002; day.shadow.normalBias = 0.01;
  const sc = day.shadow.camera; sc.left = -3; sc.right = 3; sc.top = 3; sc.bottom = -3; sc.near = 1; sc.far = 30; sc.updateProjectionMatrix();
  scene.add(day, day.target);
  // the room: flag floor, two limewashed stone walls
  const AM = await archMaterials(ctx);
  const ak = new ArchKit(0);
  const ar = makeRand(5);
  flagFloor(ak, aframe([0.5, 0, -0.3]), 6, 5, ar, {});
  let y = 0;
  while (y < 3.2) {
    const hh = 0.22 + ar() * 0.12;
    for (const wall of ['back', 'side']) {
      let x = wall === 'back' ? -2.6 : -2.6;
      while (x < (wall === 'back' ? 3.4 : 2.2)) {
        const len = 0.35 + ar() * 0.5;
        if (wall === 'back') block(ak.get('stoneWashed'), aframe([x + len / 2, y + hh / 2, -2.2]), len - 0.012, hh - 0.012, 0.4, { r: 0.02, seg: 0.12, seed: ar(), noise: 0.006, nf: 6, chip: 0.01, pillow: 0.008 });
        else block(ak.get('stoneWashed'), aframe([-2.6, y + hh / 2, x + len / 2]), 0.4, hh - 0.012, len - 0.012, { r: 0.02, seg: 0.12, seed: ar(), noise: 0.006, nf: 6, chip: 0.01, pillow: 0.008 });
        x += len;
      }
    }
    y += hh;
  }
  block(ak.get('mortarWashed'), aframe([0.4, 1.6, -2.36]), 6.2, 3.3, 0.1, { r: 0, seg: 1 });
  block(ak.get('mortarWashed'), aframe([-2.76, 1.6, -0.2]), 0.1, 3.3, 4.6, { r: 0, seg: 1 });
  scene.add(ak.build(AM, { name: 'chamber' }));
  // the props
  const vk = await verdorKit(ctx);
  scene.add(vk.nest(yawFrame([0.1, 0, -0.2], 0.3), { r: 0.75, count: 6000 }));
  scene.add(vk.egg(yawFrame([0.1, 0.06, -0.2], 0.8), { state: 'cracked', seed: 7 }));
  const k = new Kit();
  const r = rng(12);
  bench(k, yawFrame([0.2, 0, -1.85], 0), r, { w: 2.2, h: 0.45, d: 0.34 });
  const T = (x, z, yaw = 0) => yawFrame([x, 0.45, z], yaw);
  bowl(k, T(-0.7, -1.82), r, { r: 0.15 });
  bowl(k, T(-0.35, -1.85), r, { r: 0.12, kind: 'wood' });
  foldedCloth(k, T(0.15, -1.85, 0.08), r, { w: 0.4, d: 0.28 });
  foldedCloth(k, sub(T(0.15, -1.85, 0.08), [0, 0.03, 0], -0.1), r, { w: 0.36, d: 0.26, layers: 3 });
  foldedCloth(k, sub(T(0.15, -1.85, 0.08), [0, 0.054, 0], 0.15), r, { w: 0.32, d: 0.24, layers: 3 });
  oilLamp(k, T(0.75, -1.82, -0.3), r, { flame: true });
  oilLamp(k, yawFrame([-2.3, 0.0, -1.9], 0.7), r, { flame: true });
  stool(k, yawFrame([1.35, 0, -0.9], 0.4), r, { h: 0.4 });
  bowl(k, yawFrame([1.35, 0.4, -0.9], 0), r, { r: 0.16 });
  scene.add(vk.build(k, 'chamber-props'));
  // the lamp light (no shadows: point lights cost six shadow maps each)
  for (const p of [V(0.83, 0.5, -1.82), V(-2.22, 0.06, -1.9)]) {
    const l = new THREE.PointLight(new THREE.Color(1.0, 0.55, 0.22), 1.6, 6, 2);
    l.position.copy(p); scene.add(l);
  }
}

export function update(t, ctx) {
  const cam = ctx.camera;
  cam.position.set(1.35, 0.55, 1.55);
  cam.lookAt(0.0, 0.32, -0.55);
  cam.near = 0.03; cam.far = 50;
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = 35;
  ctx.lens.fstop = 2.8;
  ctx.lens.focus = 1.95;
  ctx.lens.shutterAngle = 180;
}
