// Nature lookdev - the Verdor coast (provisional design, not approved).
//
// One coherent geology: pale bedded limestone sea cliffs (scenes/lib/nature/verdor-world.js), baked
// once (offline/bake-verdor-*.mjs) and loaded as LOD tiles. Hero angles, one per second of time:
//   t = 1   the coast side-on from the INLAND side, 85 m up (the 1C-1E flight-line camera side:
//           land behind the lens, the sea beyond, travel screen left -> right = north)
//   t = 2   the cliff foot and the surf zone, from the wave-cut platform
//   t = 3   the outer rocks off the point, from above (1F / 2C: "beyond the outer rocks")
//   t = 4   the arch headland and the southern bay with its beach
//   t = 5   a sea cave and the stepped, jointed face, from a boat
//
//   node render/render.mjs --still scenes/lookdev/nature-coast.js --time 1 --preset final --png out.png
import * as THREE from 'three';
import { createOcean } from 'dk/ocean.js';
import { loadHDRI } from '../lib/assets.js';
import { loadVerdorCoast, verdorWorld } from '../lib/nature/coast.js';
import { filmFinish } from './finish.js';

// the same photographed sky and sun as style frames F2 / F3 (continuity)
const SUN_H = new THREE.Vector3(0.6, 0, -0.8).normalize();
const KLOOF_AZ0 = 0.942;
const HDRI_ROT = Math.atan2(SUN_H.x, SUN_H.z) - KLOOF_AZ0;

export const meta = {
  title: 'Nature lookdev - Verdor coast',
  duration: 6,
  seed: 5,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 1.6, apDistanceScale: 1.2 },
    volumetrics: { enabled: false },
    shadows: { cascades: 3, maxDistance: 1600, split: 0.8 },
    ao: { enabled: true, radius: 2.0 },
    dof: { samples: 32 },
    grade: { exposure: 1.9, whiteBalance: 6000, contrast: 1.12, saturation: 0.95 },
  }),
};

let S;
const DEBUG_NO_TERRAIN = false;
function shots(W) {
  const xc = (z) => W.xc(z);
  const tip = xc(700);
  return [
    null,
    // 1: inland side, 85 m up, looking out across the coast toward the point and the outer rocks
    { pos: [xc(120) - 95, 86, 120], look: [tip + 140, 4, 820], f: 32 },
    // 2: the cliff foot from the platform, looking along the face (north) into the low sun-side light
    { pos: [xc(500) + 16, 1.9, 500], look: [xc(600) + 6, 10, 600], f: 24 },
    // 3: the outer rocks from above
    { pos: [tip + 60, 260, 540], look: [tip + 170, 0, 735], f: 24 },
    // 4: the arch headland and the bay
    { pos: [xc(-1150) - 40, 70, -1150], look: [xc(-900) + 10, 8, -880], f: 35 },
    // 5: a boat off the face: caves, joints, beds
    { pos: [xc(130) + 85, 3.5, 135], look: [xc(140), 16, 150], f: 35 },
  ];
}

export async function setup(ctx) {
  const { scene, camera } = ctx;
  const W = await verdorWorld();
  const SH = shots(W);
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: HDRI_ROT, horizonFill: { above: 3.5, below: -1.5, blend: 1.5 } });
  const sun = sky.apply(scene);
  sun.intensity *= 1.45;
  scene.environmentIntensity = 0.9;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);
  const coast = await loadVerdorCoast(ctx, { views: SH.filter(Boolean).map((s) => s.pos), radius: 5000, terrain: DEBUG_NO_TERRAIN ? false : undefined });
  scene.add(coast.group);
  const ocean = createOcean(ctx, { windSpeed: 7, windDirection: 190, swell: 0.55, choppiness: 1.2, seed: 9, depth: 30, mipFilter: 'trilinear', roughness: 0.05, foamThreshold: 0.7, shoreFoam: 1.0, shoreFoamWidth: 1.6, surf: 0.85 });
  scene.add(ocean.mesh);
  camera.near = 0.3; camera.far = 30000;
  S = { sun, SUN: sky.sun.direction.clone(), ocean, SH, W };
}

export function update(t, ctx) {
  const { sun, SUN, ocean, SH } = S;
  ocean.update(t);
  const i = Math.min(SH.length - 1, Math.max(1, Math.floor(t)));
  const s = SH[i];
  const cam = ctx.camera;
  cam.position.set(...s.pos);
  cam.lookAt(...s.look);
  cam.updateMatrixWorld(true);
  const tgt = new THREE.Vector3(...s.look);
  sun.target.position.copy(tgt);
  sun.position.copy(tgt).addScaledVector(SUN, 900);
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = s.f;
  ctx.lens.fstop = 8;
  ctx.lens.focus = cam.position.distanceTo(tgt);
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 200;
}
