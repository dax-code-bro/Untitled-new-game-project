// Architecture - Verdor (PROVISIONAL designs): hero angles, one shot per second:
//   t 0-1  the riding-grounds stable with Charcoal's access rig, a person (Remi) for scale
//   t 1-2  the access rig: switchback stairs, deck, mast and gangway, Remi on the stair foot
//   t 2-3  the ground keepers' lodge (the doorway at the field edge) and Leaf's movable platform
//   t 3-4  the palace, far off (long lens, haze)
//   t 4-5  the harbour: weathered steps down to the quay, warehouses
//   node render/render.mjs --still scenes/lookdev/architecture-verdor.js --time 0.5 --preset final --png stable.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { terrainMaterial } from '../lib/sets/materials.js';
import { heightfield, makeNoise, gradedAxis, smooth } from '../lib/sets/terrain.js';
import { grassField } from '../lib/sets/grass.js';
import { Kit, frame, yawFrame } from '../lib/architecture/core.js';
import { archMaterials } from '../lib/architecture/materials.js';
import { stable, keeperHouse, accessRig, leafPlatform, palace, harbor } from '../lib/architecture/verdor.js';
import { loadCharacter, placeCharacter } from '../lib/humans/index.js';
import { reviewTime } from '../lib/humans/stage.js';
import { filmFinish } from './finish.js';

const SUN = new THREE.Vector3(0.598, 0.743, -0.300).normalize();
// the rig stands in the open yard east of the stable (Charcoal lies beyond its gangway, +z of it)
const STABLE = [0, -34], RIG = [34, -6], KEEPER = [-26, -14], LEAFP = [-17, -7];
const PALACE = [-700, -620], HARBOR = [520, 260];
const SHOTS = [
  { name: 'stable-rig', p: [58, 2.2, 22], t: [14, 7.0, -22], fl: 21, fstop: 5.6 },
  { name: 'rig', p: [50, 1.7, 15.5], t: [33.5, 6.4, -5.5], fl: 18, fstop: 5.6 },
  { name: 'keeper', p: [-11.5, 1.6, 4.0], t: [-25, 2.4, -14], fl: 30, fstop: 5.6 },
  { name: 'palace', p: [-290, 22, -530], t: [-700, 40, -612], fl: 70, fstop: 8, near: 25 },
  { name: 'harbor', p: [508, 3.9, 274], t: [517, 1.2, 258], fl: 28, fstop: 5.6 },
];

export const meta = {
  title: 'Architecture - Verdor (PROVISIONAL)',
  duration: SHOTS.length,
  seed: 9,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 1.6, apDistanceScale: 1.6 },
    shadows: { cascades: 3, maxDistance: 160, bias: -0.0003, normalBias: 2.5 },
    ao: { enabled: true, radius: 0.8 },
    dof: { samples: 48 },
    grade: { exposure: 0.7, whiteBalance: 5800, contrast: 1.05, saturation: 1.0 },
    motionBlur: { accumulateSamples: 5 },
  }),
};

let S;
export async function setup(ctx) {
  const { scene, camera } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: 1.093 });
  const sun = sky.apply(scene);
  sun.intensity *= 1.5;
  scene.environmentIntensity = 0.85;
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  scene.add(sun, sun.target);
  const M = await archMaterials(ctx);
  // the riding grounds: a gentle grass field; the harbour on the sea far east
  const N = makeNoise(5);
  const ground = heightfield({
    xs: gradedAxis(-1200, 1200, 320, 0, 2.5), zs: gradedAxis(-1200, 1200, 320, 0, 2.5), height: (x, z) => {
      if (Math.abs(x - HARBOR[0]) < 90 && z > HARBOR[1] - 70) return -3;                               // the harbour: built ground + basin
      // the palace stands on a broad rise
      return 0.4 * N.fbm(x * 0.02, z * 0.02, 3) + 24 * smooth(330, 110, Math.hypot(x - PALACE[0], z - PALACE[1])) + 3 * N.fbm(x * 0.006, z * 0.006, 2) * smooth(330, 150, Math.hypot(x - PALACE[0], z - PALACE[1]));
    },
    splat: (x, z) => {
      const nearB = Math.min(Math.hypot(x - STABLE[0], z - STABLE[1] - 8), Math.hypot(x - KEEPER[0], z - KEEPER[1] - 5));
      // trodden mud and straw before the stable door and the lodge, a churned ring round the rig
      // and a cart track between them; the palace rise is turf with a little rock showing
      const track = smooth(2.6, 1.2, Math.abs((z - STABLE[1] - 6) - (x - STABLE[0]) * 0.75 + 2.0 * Math.sin(x * 0.08)));
      const worn = Math.min(1, smooth(14, 4, nearB) * 0.8 + smooth(10, 4, Math.hypot(x - RIG[0], z - RIG[1])) * 0.85 + track * 0.7 * smooth(60, 30, Math.hypot(x - 15, z + 18)));
      const rock = 0.12 * smooth(260, 120, Math.hypot(x - PALACE[0], z - PALACE[1])) * smooth(0.0, 0.4, N.fbm(x * 0.03 + 3, z * 0.03, 3) + 0.2);
      return [rock, (1 - worn) * 0.6 * (1 - rock), (1 - worn) * 0.4 * (1 - rock), worn * (1 - rock)];
    },
  });
  const landMat = await terrainMaterial(ctx, [
    { id: 'pbr/acg_rock26', scale: 3, tint: [0.62, 0.6, 0.56] },
    { id: 'pbr/acg_ground037', scale: 1.4, tint: [0.26, 0.34, 0.13] },
    { id: 'pbr/acg_ground03', scale: 1.4, tint: [0.3, 0.34, 0.16] },
    { id: 'pbr/acg_ground24', scale: 1.2, tint: [0.33, 0.25, 0.16], normalScale: 1.6 },
  ], { macro: 0.5, macroScale: 0.02, detailNear: 60, detailFar: 900, minRoughness: 0.82, roughnessScale: 1.3 });
  landMat.envMapIntensity = 0.45;
  const land = new THREE.Mesh(ground.geometry, landMat); land.receiveShadow = true; scene.add(land);
  {
    // the quay's hinterland: packed earth and cobbles at quay level behind the paving
    const { groundMaterial } = await import('../lib/humans/stage.js');
    const qg = new THREE.Mesh(new THREE.PlaneGeometry(180, 62), await groundMaterial('pbr/ph_floor_pebbles_01', ctx, [180, 62], { tint: [0.7, 0.68, 0.64] }));
    qg.rotation.x = -Math.PI / 2; qg.position.set(HARBOR[0], 2.79, HARBOR[1] - 8 - 31); qg.receiveShadow = true; scene.add(qg);
    const qb = new THREE.Mesh(new THREE.BoxGeometry(180, 6, 62), new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 1 }));
    qb.position.set(HARBOR[0], -0.22, HARBOR[1] - 8 - 31); scene.add(qb);
  }
  // the buildings
  const kit = new Kit(0);
  stable(kit, yawFrame([STABLE[0], 0, STABLE[1]], 0.9), { lod: 'mid', seed: 3 });
  const rig = accessRig(kit, yawFrame([RIG[0], 0, RIG[1]], 0.35), { seed: 4 });         // deck 10.6 m, the gangway lands at Charcoal's saddle (~9.7 m)
  keeperHouse(kit, yawFrame([KEEPER[0], 0, KEEPER[1]], 1.2), { lod: 'mid', seed: 5 });
  leafPlatform(kit, yawFrame([LEAFP[0], 0, LEAFP[1]], 2.2), { seed: 6 });
  const far = new Kit(0);
  palace(far, yawFrame([PALACE[0], 24.4, PALACE[1]], 0.5), { seed: 7 });
  const hb = new Kit(0);
  harbor(hb, frame([HARBOR[0], 0, HARBOR[1]]), { seed: 8 });
  for (const k of [kit, far, hb]) { const g = k.build(M, { name: 'verdor' }); scene.add(g); }
  // people for scale: Remi at the foot of the rig's stair, a keeper at the lodge door
  const people = [];
  try {
    const remi = await loadCharacter('remi');
    placeCharacter(remi, RIG[0] - 0.3, 0, RIG[1] + 6.6, 0.35);
    scene.add(remi.root); people.push(remi);
    const keeper = await loadCharacter('keeper1');
    placeCharacter(keeper, KEEPER[0] + 4.4, 0, KEEPER[1] + 3.0, 1.0);
    scene.add(keeper.root); people.push(keeper);
  } catch (e) { console.warn('architecture-verdor: people not built (' + e.message + ')'); }
  // grass near the cameras (tussocks), thinning to the worn ground round the buildings
  const place = (cx, cz, R) => (rng) => {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * R;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (Math.hypot(x - STABLE[0], z - STABLE[1]) < 16) return null;
    if (Math.hypot(x - RIG[0], z - RIG[1]) < 9.0) return null;
    if (Math.hypot(x - KEEPER[0], z - KEEPER[1]) < 7) return null;
    return [x, 0.4 * N.fbm(x * 0.02, z * 0.02, 3) - 0.02, z];
  };
  for (const [cx, cz, R, n] of [[34, 4, 22, 60000], [-16, -2, 18, 40000]]) {
    scene.add(grassField({ count: n, height: [0.05, 0.2], seed: 5 + cx, color: [0.05, 0.072, 0.022], dry: [0.2, 0.17, 0.085], dryAmount: 0.5, place: place(cx, cz, R) }));
    scene.add(grassField({ count: n / 6, height: [0.18, 0.42], seed: 7 + cx, blades: 10, color: [0.035, 0.055, 0.018], dry: [0.22, 0.19, 0.1], dryAmount: 0.6, place: place(cx, cz, R) }));
  }
  camera.near = 0.1; camera.far = 6000;
  S = { sun, rig, people };
}

export function update(t, ctx) {
  const rt = reviewTime(t, ctx);
  const sh = SHOTS[Math.min(SHOTS.length - 1, Math.max(0, rt.k))];
  const cam = ctx.camera;
  cam.position.set(...sh.p); cam.lookAt(...sh.t);
  // (a long lens on a far set: a near plane that far out keeps the depth precision for the joints)
  cam.near = sh.near ?? 0.1; cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = sh.fl;
  ctx.lens.fstop = sh.fstop;
  ctx.lens.focus = new THREE.Vector3(...sh.p).distanceTo(new THREE.Vector3(...sh.t));
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 400;
  const { sun } = S;
  sun.target.position.set(sh.t[0], 0, sh.t[2]);
  sun.position.copy(sun.target.position).addScaledVector(SUN, 400);
}
