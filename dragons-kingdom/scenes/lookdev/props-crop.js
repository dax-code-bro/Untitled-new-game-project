// Props - hero angle for a 1:1 crop: a group of barrels, crates, baskets and sacks against a wall
// on the flagstones of a Cling yard (PROVISIONAL). Coopered staves with iron and bound-withy hoops,
// nailed board crates (one of apples, one closed), woven willow baskets of onions and turnips,
// hessian grain sacks, a coiled rope. Low raking morning sun. 50 mm on Super 35, T5.6.
//
//   node render/render.mjs --still scenes/lookdev/props-crop.js --time 1 --preset final --png out.png
//   (then crop 1:1, e.g. ffmpeg -i out.png -vf crop=1920:1080:960:700 crop.png)
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { Kit as ArchKit, yawFrame as archYaw, frame as aframe, makeRand } from '../lib/architecture/core.js';
import { archMaterials } from '../lib/architecture/materials.js';
import { flagFloor } from '../lib/architecture/interiors.js';
import { house } from '../lib/architecture/house.js';
import { festivalKit } from '../lib/props/festival.js';
import { Kit, rng, sub, yawFrame, frame } from '../lib/props/core.js';
import { barrel, crate, basket, bucket } from '../lib/props/containers.js';
import { fruitHeap, cabbage } from '../lib/props/goods.js';
import { filmFinish } from './finish.js';

export const meta = {
  title: 'Props - barrels, crates, baskets (PROVISIONAL)',
  duration: 4,
  seed: 14,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 0.6 },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.35 },
    dof: { samples: 48 },
    grade: { exposure: 0.2, whiteBalance: 5400 },
  }),
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true });
  const sun = sky.apply(scene);
  // a low raking sun from the left (the extracted sun moved lower: late morning in a yard)
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.012;
  const sd = V(-0.75, 0.48, 0.45).normalize();
  sun.position.copy(sd).multiplyScalar(40); sun.target.position.set(0, 0.5, 0);
  const sc = sun.shadow.camera; sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4; sc.near = 1; sc.far = 100; sc.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const AM = await archMaterials(ctx);
  const ak = new ArchKit(0);
  house(ak, archYaw([0.5, 0, -1.2 - 4.5], 0), { w: 7.0, d: 9, storeys: 1, roof: 'side', seed: 41, cover: 'clay', lod: 'mid' });
  // the yard: big worn flagstones (the architecture library's floor flags) up to the house wall
  flagFloor(ak, aframe([0, 0, 2.3]), 12, 7.2, makeRand(9), { mat: 'stoneFloor' });
  scene.add(ak.build(AM, { name: 'yard' }));
  const fk = await festivalKit(ctx);
  const k = new Kit();
  const r = rng(77);
  const F = (x, z, yaw = 0, y = 0) => yawFrame([x, y, z], yaw);
  barrel(k, F(-0.95, -0.75, 0.3), r, { h: 0.85, r: 0.27, hoops: 'iron' });
  barrel(k, F(-0.35, -0.85, 1.1), r, { h: 0.9, r: 0.28, hoops: 'withy' });
  barrel(k, F(-0.7, -0.15, 2.0), r, { h: 0.48, r: 0.18, hoops: 'iron' });
  const c1 = crate(k, F(0.45, -0.7, -0.15), r, { w: 0.62, d: 0.44, h: 0.38 });
  fruitHeap(k, sub(c1.inside, [0, 0.0, 0]), r, 34, { r: 0.22, sx: 1.35, maxH: 0.42 });
  crate(k, F(1.05, -0.75, 0.2), r, { w: 0.55, d: 0.42, h: 0.36, slats: false, lid: 'on', mat: 'pale' });
  crate(k, F(1.08, -0.73, 0.1, 0.375), r, { w: 0.5, d: 0.38, h: 0.3, mat: 'silver' });
  const b1 = basket(k, F(0.15, 0.05), r, { r: 0.22, rb: 0.17, h: 0.24, handle: 'arch', handleH: 0.24 });
  fruitHeap(k, sub(b1.inside, [0, 0.13, 0]), r, 22, { kind: 'onion', r: 0.19, maxH: 0.1 });
  const b2 = basket(k, F(0.75, 0.05, 0.4), r, { r: 0.2, rb: 0.17, h: 0.1, sx: 1.35, handle: 'ears' });
  fruitHeap(k, b2.inside, r, 16, { kind: 'turnip', r: 0.17, sx: 1.3, maxH: 0.12 });
  for (const [x, z, yw, kd] of [[-1.55, -0.6, 0.4, 'full'], [-1.45, -0.05, 1.7, 'slump'], [1.6, -0.55, 2.4, 'full']]) fk.sack(k, F(x, z, yw), r, { kind: kd });
  fk.ropeCoil(k, F(-0.2, 0.55), r, { r: 0.26, rope: 0.014, laid: true, turns: 7 });
  cabbage(k, F(0.5, 0.42, 0.3), r, {}); cabbage(k, F(0.62, 0.55, 1.3), r, {});
  bucket(k, F(1.45, 0.15), r, { handle: 'rope' });
  scene.add(fk.build(k, 'group'));
}

export function update(t, ctx) {
  const cam = ctx.camera;
  cam.position.set(0.1, 1.55, 3.6);
  cam.lookAt(0.0, 0.4, -0.3);
  cam.near = 0.05; cam.far = 500;
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = 32;
  ctx.lens.fstop = 5.6;
  ctx.lens.focus = 3.8;
  ctx.lens.shutterAngle = 180;
}
