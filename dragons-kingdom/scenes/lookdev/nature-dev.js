// Nature lookdev - fast geometry/material check of the Verdor coast (no plants, rocks or trees).
// Same cameras as nature-coast.js (t = 1..5) plus t = 6: the tree shot's background cliff.
// For iteration only (draft/preview presets); the deliverable stills come from nature-coast.js.
import * as THREE from 'three';
import { createOcean } from 'dk/ocean.js';
import { loadHDRI } from '../lib/assets.js';
import { loadVerdorCoast, verdorWorld } from '../lib/nature/coast.js';
import { filmFinish } from './finish.js';

const SUN_H = new THREE.Vector3(0.6, 0, -0.8).normalize();
const KLOOF_AZ0 = 0.942;
const HDRI_ROT = Math.atan2(SUN_H.x, SUN_H.z) - KLOOF_AZ0;

export const meta = {
  title: 'Nature lookdev - coast geometry check',
  duration: 8,
  seed: 5,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 1.6, apDistanceScale: 1.2 },
    volumetrics: { enabled: false },
    shadows: { cascades: 3, maxDistance: 1600, split: 0.8 },
    ao: { enabled: true, radius: 2.0 },
    dof: { samples: 8 },
    grade: { exposure: 1.9, whiteBalance: 6000, contrast: 1.12, saturation: 0.95 },
  }),
};

let S;
function shots(W) {
  const xc = (z) => W.xc(z);
  const tip = xc(700);
  const tz = 470, tx = W.xc(tz) - 22, ty = W.landHeight(tx, tz);
  return [
    null,
    { pos: [xc(120) - 95, 86, 120], look: [tip + 140, 4, 820], f: 32 },
    { pos: [xc(500) + 16, 1.9, 500], look: [xc(600) + 6, 10, 600], f: 24 },
    { pos: [tip + 10, 250, 590], look: [tip + 185, 0, 735], f: 24 },
    { pos: [xc(-1150) - 40, 70, -1150], look: [xc(-900) + 10, 8, -880], f: 35 },
    { pos: [xc(130) + 85, 3.5, 135], look: [xc(140), 16, 150], f: 35 },
    { pos: [tx + 1.5, ty + 1.3, tz + 14], look: [tx + 30, ty - 12, tz - 120], f: 32 },
    { pos: [tip + 120, 14, 560], look: [tip + 180, 0, 720], f: 28 },
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
  const coast = await loadVerdorCoast(ctx, { views: SH.filter(Boolean).map((s) => s.pos), radius: 5000, look: { seaLevel: -1.1, topAttr: true } });
  scene.add(coast.group);
  const ocean = createOcean(ctx, { windSpeed: 7, windDirection: 190, swell: 0.55, choppiness: 1.2, seed: 9, depth: 30, mipFilter: 'trilinear', roughness: 0.05, foamThreshold: 0.7, shoreFoam: 1.0, shoreFoamWidth: 1.6, surf: 0.85 });
  ocean.mesh.position.y = -1.1;
  scene.add(ocean.mesh);
  camera.near = 0.3; camera.far = 30000;
  S = { sun, SUN: sky.sun.direction.clone(), ocean, SH };
}

export function update(t, ctx) {
  const { sun, SUN, ocean, SH } = S;
  ocean.update(t);
  const i = Math.min(SH.length - 1, Math.max(1, Math.floor(t + 0.25)));
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
