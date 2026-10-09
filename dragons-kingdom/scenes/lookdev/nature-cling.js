// Nature lookdev - the land around Cling (fields, hedgerows, the road). PROVISIONAL.
// Frame: the CLING layout (square at the origin, north = -z, the east gate at x 20 with the broad road).
//   t = 1  from the king's steps (the F5 position, 24 mm) looking north over where the town stands to the hills
//   t = 2  aerial, 90 m over the closes north-east of the town: hedged fields, strips, the road
//   t = 3  on the broad road at eye level, hedgerows either side, climbing toward the hills
//   t = 4  a hay meadow and a hedgerow oak, 50 mm
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { loadClingLand } from '../lib/nature/farmland.js';
import { filmFinish } from './finish.js';

const SUN_H = new THREE.Vector3(0.6, 0, -0.8).normalize();
const KLOOF_AZ0 = 0.942;

export const meta = {
  title: 'Nature lookdev - the land around Cling',
  duration: 5,
  seed: 21,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 1.6, apDistanceScale: 1.3 },
    shadows: { cascades: 3, maxDistance: 1500, split: 0.82 },
    ao: { enabled: true, radius: 1.5 },
    dof: { samples: 32 },
    grade: { exposure: 1.9, whiteBalance: 6000, contrast: 1.1 },
  }),
};

let S;
const SHOTS = [null,
  { pos: [4, 3.4, 18], look: [-10, 30, -900], f: 24 },
  { pos: [260, 92, 60], look: [520, 20, -380], f: 28 },
  { pos: [300, 0, -63], look: [640, 12, -258], f: 32, eye: 1.65 },
  { pos: [330, 0, 160], look: [380, 6, 100], f: 50, eye: 1.6 },
];

export async function setup(ctx) {
  const { scene, camera } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: Math.atan2(SUN_H.x, SUN_H.z) - KLOOF_AZ0 - 1.6, horizonFill: { above: 3.5, below: -1.5, blend: 1.5 } });
  const sun = sky.apply(scene);
  sun.intensity *= 1.4; scene.environmentIntensity = 0.9;
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);
  const land = await loadClingLand(ctx, { views: SHOTS.filter(Boolean).map((s) => s.pos), grass: { radius: 45 } });
  scene.add(land.group);
  for (const s of SHOTS) if (s?.eye) s.pos[1] = land.heightAt(s.pos[0], s.pos[2]) + s.eye;
  camera.near = 0.2; camera.far = 30000;
  S = { sun, SUN: sky.sun.direction.clone(), land };
}

export function update(t, ctx) {
  const i = Math.min(SHOTS.length - 1, Math.max(1, Math.floor(t)));
  const s = SHOTS[i];
  const cam = ctx.camera;
  cam.position.set(...s.pos); cam.lookAt(...s.look); cam.updateMatrixWorld(true);
  const tgt = new THREE.Vector3(...s.look);
  S.sun.target.position.copy(tgt); S.sun.position.copy(tgt).addScaledVector(S.SUN, 1200);
  ctx.lens.sensor = 'super35'; ctx.lens.focalLength = s.f; ctx.lens.fstop = 8;
  ctx.lens.focus = Math.min(400, cam.position.distanceTo(tgt)); ctx.lens.iso = 200; ctx.lens.shutterAngle = 180;
}
