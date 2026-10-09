// Props - hero angle: festival bunting across a Cling street against the sky (PROVISIONAL). Four
// strings of linen pennants hang in true catenaries between the upper floors of the timber-framed
// houses (architecture library), backlit by the high sun so the light comes through the cloth -
// each pennant's folded hem and edges darker against the sky; a wool banner hangs from a pole
// off one facade. Camera at eye level on the cobbles looking up the street, 24 mm, T8.
//
//   node render/render.mjs --still scenes/lookdev/props-bunting.js --time 1 --preset final --png out.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { Kit as ArchKit, yawFrame as archYaw } from '../lib/architecture/core.js';
import { archMaterials } from '../lib/architecture/materials.js';
import { house } from '../lib/architecture/house.js';
import { paving } from '../lib/architecture/cling.js';
import { festivalKit, DYES } from '../lib/props/festival.js';
import { yawFrame } from '../lib/props/core.js';
import { filmFinish } from './finish.js';

export const meta = {
  title: 'Props - bunting across a street (PROVISIONAL)',
  duration: 4,
  seed: 12,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 1.0 },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.7 },
    dof: { samples: 32 },
    grade: { exposure: 0.15, whiteBalance: 5600 },
  }),
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ST = 3.4;          // half the street's width (house fronts at z = +-ST)
export async function setup(ctx) {
  const { scene } = ctx;
  // the sun turned to stand ahead of the camera, up the street: the bunting is backlit
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true });
  const sun = sky.apply(scene);
  const az0 = Math.atan2(sky.sun.direction.z, sky.sun.direction.x), rot = az0 - (-0.35);
  scene.environmentRotation.set(0, rot, 0); scene.backgroundRotation.set(0, rot, 0);
  sky.sun.direction.applyAxisAngle(V(0, 1, 0), rot);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03;
  const sc = sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 300; sc.updateProjectionMatrix();
  sun.target.position.set(10, 3, 0); sun.position.copy(sun.target.position).addScaledVector(sky.sun.direction, 150);
  scene.add(sun, sun.target);
  // the street: houses both sides, cobbles between
  const AM = await archMaterials(ctx);
  const ak = new ArchKit(0);
  let x = -6;
  const widths = [6.4, 5.8, 7.0, 6.2, 6.6];
  widths.forEach((w, i) => { house(ak, archYaw([x + w / 2, 0, -ST - 4.5], 0), { w, d: 9, storeys: 1 + (i % 2), roof: i % 3 ? 'front' : 'side', seed: 21 + i * 5, cover: i % 2 ? 'clay' : 'slate', lod: 'mid', party: { left: i > 0, right: i < widths.length - 1 } }); x += w; });
  x = -5;
  [6.8, 6.0, 6.4, 7.2, 5.9].forEach((w, i) => { house(ak, archYaw([x + w / 2, 0, ST + 4.5], Math.PI), { w, d: 9, storeys: 1 + ((i + 1) % 2), roof: i % 2 ? 'front' : 'side', seed: 61 + i * 7, cover: i % 3 ? 'clay' : 'slate', lod: 'mid', party: { left: i < 4, right: i > 0 } }); x += w; });
  paving(ak, -8, 30, -ST - 0.2, ST + 0.2, { seed: 9 });
  scene.add(ak.build(AM, { name: 'street' }));
  // bunting strings between the upper floors, zig-zagging up the street; a banner
  const fk = await festivalKit(ctx);
  const lines = [
    [V(1.0, 5.6, -ST + 0.3), V(4.5, 5.3, ST - 0.3)],
    [V(4.5, 5.3, ST - 0.3), V(9.5, 5.7, -ST + 0.3)],
    [V(9.5, 5.7, -ST + 0.3), V(14.0, 5.4, ST - 0.3)],
    [V(14.0, 5.4, ST - 0.3), V(19.5, 5.8, -ST + 0.3)],
    [V(2.0, 4.6, ST - 0.3), V(7.5, 4.9, -ST + 0.3)],
  ];
  for (const [i, [a, b]] of lines.entries()) scene.add(await fk.bunting(a, b, { seed: 3 + i * 7, slack: 0.02 + 0.006 * i }));
  scene.add(await fk.banner(yawFrame([11.5, 1.9, -ST + 0.45], 0), 'breeze', { colors: [DYES.madder, DYES.weld] }));
  scene.add(await fk.banner(yawFrame([16.5, 2.1, ST - 0.45], Math.PI), 'still', { colors: [DYES.woad, DYES.undyed] }));
}

export function update(t, ctx) {
  const cam = ctx.camera;
  cam.position.set(-3.5, 1.6, 0.6);
  cam.lookAt(8, 5.2, -0.4);
  cam.near = 0.1; cam.far = 2000;
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = 24;
  ctx.lens.fstop = 8;
  ctx.lens.focus = 9;
  ctx.lens.shutterAngle = 180;
}
