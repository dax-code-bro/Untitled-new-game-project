// Nature lookdev - the prologue island in dawn mist (shot list P-03 / P-06 / P-12). PROVISIONAL.
//
// The island (scenes/lib/nature/island*.js): a high basalt island - stacked lava flows weathered into
// grassy benches and dark scarps, gullies cut by streams (stream-power + droplet erosion, baked once
// by offline/bake-island.mjs), sea cliffs, stacks. Its high ground disappears into a cloud cap.
// Same world frame and island placement as style frame F1 (island centre x 960, z -2000; camera
// near the origin looking north), same low dawn sun behind the sea cloud.
//   t = 1  P-03: from 2.6 m above the sea, 35 mm, the island 2 km out, high ground in cloud
//   t = 2  closer: 900 m off the south shore, 30 m up, 50 mm - cliffs, benches, gullies in the mist
//   t = 3  P-12: the misted island alone in frame from open water, later morning light
import * as THREE from 'three';
import { createOcean } from 'dk/ocean.js';
import { loadHDRI } from '../lib/assets.js';
import { loadPrologueIsland } from '../lib/nature/island.js';
import { ISLAND } from '../lib/nature/island-world.js';
import { filmFinish } from './finish.js';

const SUN = new THREE.Vector3(-0.009, 0.105, -0.994).normalize();
const SUN_BANK = SUN.clone().multiplyScalar(3000);
const I = ISLAND;

export const meta = {
  title: 'Nature lookdev - prologue island in dawn mist',
  duration: 4,
  seed: 12,
  cinematic: filmFinish({
    atmosphere: { enabled: true, haze: 2.2, mieG: 0.8, sunDirection: SUN.toArray(), sunIlluminance: 5, apDistanceScale: 1.0, environment: false },
    volumetrics: {
      enabled: true, range: 3600, near: 1, resolution: [320, 128, 64], intensity: 1.5, noiseFilter: true, shadowSoftness: 16,
      density: 0.00032, heightFalloff: 0.016, fogBase: 0, anisotropy: 0.72, noiseScale: 0.006, noiseAmount: 0.75, wind: [3, 0, 1],
      banks: [
        // the cloud cap on the high ground, wrapping the summits and trailing off to leeward
        { center: [I.cx + 150, 560, I.cz - 40], radius: [1300, 210, 900], density: 0.022, noise: 0.85 },
        { center: [I.cx - 350, 420, I.cz + 120], radius: [700, 120, 450], density: 0.013, noise: 0.9 },
        { center: [I.cx + 850, 470, I.cz - 280], radius: [800, 140, 520], density: 0.009, noise: 0.9 },
        // the sea cloud the dawn sun sits behind
        { center: [SUN_BANK.x, SUN_BANK.y + 40, SUN_BANK.z], radius: [1500, 260, 520], density: 0.03, noise: 0.7 },
        // mist lying on the sea under the cliffs and in layered banks
        { center: [I.cx - 200, 25, I.cz + 700], radius: [1400, 40, 260], density: 0.006, noise: 0.9 },
        { center: [-300, 7, -1150], radius: [1500, 18, 260], density: 0.005, noise: 0.9 },
      ],
    },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 3 },
    dof: { samples: 32 },
    grade: { whiteBalance: 3800, contrast: 1.06, saturation: 0.85, exposure: -1.2 },
  }),
};

let S;
const SHOTS = [null,
  // P-03 framing as in style frame F1 (looking north toward the dawn, the island on the right)
  { pos: [0, 3.1, 0], look: [30, 36.6, -600], f: 35, sun: SUN, exp: -1.2 },
  // closer, later morning light from the south-east: benches, scarps, gullies, sea cliffs, stacks
  { pos: [I.cx - 300, 45, I.cz + 1700], look: [I.cx - 120, 170, I.cz + 300], f: 40, sun: new THREE.Vector3(0.45, 0.32, 0.83).normalize(), exp: 0.2 },
  // P-12: the misted island alone in frame from open water
  { pos: [-900, 6, 1500], look: [I.cx, 180, I.cz], f: 50, sun: new THREE.Vector3(-0.3, 0.3, 0.9).normalize(), exp: 0.0 },
];

export async function setup(ctx) {
  const { scene, camera } = ctx;
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera; sc.left = -3200; sc.right = 3200; sc.top = 2600; sc.bottom = -2600; sc.near = 10; sc.far = 9000;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  const env = await loadHDRI('hdri/kloppenheim_01', ctx, { extractSun: true, sunThreshold: 30 });
  env.apply(scene, { background: false, environment: true, sunLight: false });
  const az0 = env.sun ? Math.atan2(env.sun.direction.z, env.sun.direction.x) : 0;
  scene.environmentRotation.set(0, az0 - Math.atan2(SUN.z, SUN.x), 0);
  scene.environmentIntensity = 0.55;
  const ocean = createOcean(ctx, { windSpeed: 8.5, windDirection: 110, swell: 0.45, choppiness: 1.35, seed: 21, fetch: 60000, foamThreshold: 0.62, foamColor: [0.74, 0.72, 0.68], shoreFoam: 1.0, shoreFoamWidth: 1.6, surf: 0.9, mipFilter: 'trilinear', roughness: 0.06, reflectionTint: [1.35, 1.08, 0.78], deepColor: [0.006, 0.012, 0.014] });
  scene.add(ocean.mesh);
  const isl = await loadPrologueIsland(ctx, { views: SHOTS.filter(Boolean).map((s) => s.pos), castShadow: true });
  scene.add(isl.group);
  camera.near = 0.5; camera.far = 40000;
  S = { sun, ocean };
}

export function update(t, ctx) {
  const { sun, ocean } = S;
  ocean.update(t);
  // shots switch a quarter second before each whole second, so a still at t = N (whose motion-blur
  // subframes straddle N) never mixes two shots
  const i = Math.min(SHOTS.length - 1, Math.max(1, Math.floor(t + 0.25)));
  const s = SHOTS[i];
  const cam = ctx.camera;
  cam.position.set(...s.pos); cam.lookAt(...s.look); cam.updateMatrixWorld(true);
  sun.target.position.set(I.cx - 400, 100, I.cz + 600);
  sun.position.copy(sun.target.position).addScaledVector(s.sun, 3000);
  ctx.cinematic.grade.exposure = s.exp;
  ctx.lens.sensor = 'super35'; ctx.lens.focalLength = s.f; ctx.lens.fstop = 5.6;
  ctx.lens.focus = cam.position.distanceTo(new THREE.Vector3(...s.look));
  ctx.lens.shutterAngle = 180; ctx.lens.iso = 400;
}
