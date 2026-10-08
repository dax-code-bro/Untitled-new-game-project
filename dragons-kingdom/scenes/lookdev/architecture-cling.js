// Architecture - Cling square: hero angles of the set (PROVISIONAL designs). One shot per second:
//   t 0-1  a house row at eye level, three-quarter (north row, north-east)
//   t 1-2  the stone arch (escape route 1) from the square
//   t 2-3  the square from the king's steps (the cling_map view: arch left, gate right)
//   t 3-4  the gate to the broad road, the fountain
//   t 4-5  close detail: masonry, jetty, timber, pegs, plaster
//   node render/render.mjs --still scenes/lookdev/architecture-cling.js --time 0.5 --preset final --png row.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { terrainMaterial } from '../lib/sets/materials.js';
import { heightfield, makeNoise, gradedAxis, smooth } from '../lib/sets/terrain.js';
import { grassField } from '../lib/sets/grass.js';
import { clingSquare, CLING, wallFootPlacer, houseFootSegments } from '../lib/architecture/cling.js';
import { reviewTime } from '../lib/humans/stage.js';
import { filmFinish } from './finish.js';

const SHOTS = [
  { name: 'row', p: [9.5, 1.62, -5.5], t: [-6.0, 4.6, -19.5], fl: 24, fstop: 5.6 },
  { name: 'arch', p: [-36.0, 1.65, 18.6], t: [-19.6, 3.4, 16.0], fl: 24, fstop: 5.6 },
  { name: 'square', p: [5.9, 3.28, 24.6], t: [-4, 5.0, -20], fl: 24, fstop: 5.6 },
  { name: 'gate', p: [8.5, 1.65, -3.5], t: [20.4, 2.4, 5.5], fl: 28, fstop: 5.6 },
  { name: 'detail', p: [1.2, 2.3, -12.6], t: [-2.6, 3.2, -18.2], fl: 35, fstop: 5.6 },
];

export const meta = {
  title: 'Architecture - Cling square (PROVISIONAL)',
  duration: SHOTS.length,
  seed: 7,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 1.2, apDistanceScale: 1.5 },
    shadows: { cascades: 3, maxDistance: 120, bias: -0.0003, normalBias: 2.5 },
    ao: { enabled: true, radius: 0.6 },
    dof: { samples: 48 },
    grade: { exposure: 0.9, whiteBalance: 6000, contrast: 1.04, saturation: 1.0 },
  }),
};

let S;
export async function setup(ctx) {
  const { scene, camera } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: -1.79 });
  const sun = sky.apply(scene);
  sun.intensity *= 1.5;
  scene.environmentIntensity = 0.8;
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  scene.add(sun, sun.target);
  // the square: worn pebble paving and packed earth, grass beyond the town
  const N = makeNoise(3);
  const H = (x, z) => 0.03 * N.fbm(x * 0.3, z * 0.3, 3);
  const ground = heightfield({
    xs: gradedAxis(-300, 300, 220, 0, 2), zs: gradedAxis(-300, 300, 220, 0, 2), height: H,
    splat: (x, z) => {
      const inSq = Math.abs(x) < 23 && z > -21 && z < 30;
      if (!inSq) return [0, 0.2, 0.1, 0.8];
      // pebble paving worn through to packed earth in patches (sharp-ish edges: a blend of the two
      // textures would average both to a featureless sand); damp dark earth round the fountain
      const f = N.fbm(x * 0.09 + 3.1, z * 0.09, 4) + 0.25 * N.fbm(x * 0.6, z * 0.6, 2);
      const p = 0.04 + 0.96 * smooth(-0.08, 0.06, f);
      const damp = Math.max(smooth(5.6, 3.4, Math.hypot(x, z + 2)) * 0.9, 0.5 * smooth(0.3, 0.6, N.fbm(x * 0.2 + 9, z * 0.2, 3)));
      return [p * (1 - 0.6 * damp), (1 - p) * (1 - damp), damp + 0.05, 0];
    },
  });
  const gm = new THREE.Mesh(ground.geometry, await terrainMaterial(ctx, [
    { id: 'pbr/ph_floor_pebbles_01', scale: 0.8, tint: [0.5, 0.48, 0.45] },
    { id: 'pbr/acg_ground05', scale: 1.0, tint: [0.5, 0.45, 0.38] },
    { id: 'pbr/acg_ground24', scale: 1.2, tint: [0.45, 0.4, 0.34] },
    { id: 'pbr/acg_ground037', scale: 2.0, tint: [0.6, 0.66, 0.5] },
  ], { macro: 0.6, macroScale: 0.05, detailNear: 40, detailFar: 500, minRoughness: 0.75 }));
  gm.receiveShadow = true; scene.add(gm);
  const set = await clingSquare(ctx, { focus: [[-9.5, -18], [-19.6, 16.5], [-7.4, -18]], heroR: 9, far: 40 });
  scene.add(set.group);
  console.warn(`[arch-cling] tris ${set.tris}, houses ${set.houses.length}`);
  // weeds at the foot of the walls
  scene.add(grassField({ count: 9000, height: [0.06, 0.3], seed: 4, color: [0.05, 0.075, 0.025], dry: [0.22, 0.19, 0.1], dryAmount: 0.45, place: wallFootPlacer(houseFootSegments(set.houses)) }));
  camera.near = 0.1; camera.far = 4000;
  S = { sun, sunDir: sky.sun.direction.clone() };
}

export function update(t, ctx) {
  const rt = reviewTime(t, ctx);
  const sh = SHOTS[Math.min(SHOTS.length - 1, Math.max(0, rt.k))];
  const cam = ctx.camera;
  cam.position.set(...sh.p); cam.lookAt(...sh.t);
  cam.updateMatrixWorld(true);
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = sh.fl;
  ctx.lens.fstop = sh.fstop;
  ctx.lens.focus = new THREE.Vector3(...sh.p).distanceTo(new THREE.Vector3(...sh.t));
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 400;
  const { sun, sunDir } = S;
  sun.target.position.set(0, 0, 0);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, 200);
}
