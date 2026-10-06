// Style frame F3 - SCENES 1C/1D, in flight off Verdor (shot list 1C-11 / 1D).
//
// "The dragons climb over the coast. Show the shoreline, then their relation
// to one another, then the sea below ... Charcoal draws level with Leaf. His
// larger shadow crosses the water. Leaf adjusts with quicker wingbeats."
//
// Cinematography: air-to-air on a long lens (75 mm on Super 35) from a camera
// ship ~350 m behind the pair and a little above, on the inland side - the
// classic chase plate. From that far back the perspective no longer inflates
// the nearer dragon: Leaf (near / left / slightly behind) and Charcoal (far /
// right / ahead) show their real size difference, about four and a half to
// one in length, with Remi and Abby small on their backs. The island's cliffs
// run away up the left of frame (the inland side, screen LEFT as the shot
// list's SKY_OFF_VERDOR set asks), open sea to the right, surf working at the
// cliff foot. Same photographed sky and sun as F2 (the riding grounds a few
// minutes earlier): the sun is over the sea, ahead-right and high, so
// Charcoal's shadow falls back toward the shallows inshore of him. The camera
// ship matches their speed: the dragons are sharp, sea and coast streak a
// little with the 180-degree shutter.
//   node render/render.mjs --still scenes/lookdev/style-f3-flight.js --time 2 --preset final --png out.png
import * as THREE from 'three';
import { createOcean } from 'dk/ocean.js';
import { applyShake } from 'dk/camera.js';
import { heightfield, makeNoise, smooth, gradedAxis } from '../lib/sets/terrain.js';
import { terrainMaterial, worldMaterial } from '../lib/sets/materials.js';
import { scatter, bushGeometry, foliageMaterial } from '../lib/sets/scatter.js';
import { loadKit } from '../lib/sets/kitbash.js';
import { createCreature, poses, loadHuman, createRider, createSaddle, mountRider } from '../lib/creatures/index.js';
import { loadHDRI } from '../lib/assets.js';
import { filmFinish } from './finish.js';

// the same photographed sky and sun as style-f2-riding-grounds.js (Poly Haven
// kloofendal_48d_partly_cloudy turned by the same angle): sun 48 degrees up over the sea
const HDRI_ROT = 1.093;
const SUN = new THREE.Vector3(0.598, 0.743, -0.300).normalize();
const SPEED = 16;           // m/s along -z (the flight line)

export const meta = {
  title: 'Style frame F3 - In flight off Verdor',
  duration: 8,
  seed: 31,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 3.4, apDistanceScale: 3.0 },
    volumetrics: {
      enabled: true, range: 3000, resolution: [256, 96, 85], noiseFilter: true,
      density: 0.00012, heightFalloff: 0.01, anisotropy: 0.75, noiseScale: 0.004, noiseAmount: 0.6,
      banks: [
        { center: [-700, 25, -2600], radius: [900, 45, 600], density: 0.003, noise: 0.8 },
      ],
      cloudShadows: { coverage: 0.3, scale: 0.0011, speed: [6, 2], altitude: 1600, opacity: 0.5 },
    },
    shadows: { cascades: 2, maxDistance: 1200 },
    ao: { enabled: false },
    dof: { samples: 48 },
    grade: { exposure: 0.8, whiteBalance: 6000, contrast: 1.06, saturation: 1.02 },
  }),
};

let S;

// coastline: inland is x < coastX(z)
function coastX(N, z) { return -150 + 80 * Math.sin(z * 0.0019 + 0.6) + 55 * N.fbm(z * 0.004, 3.1, 4) + 18 * N.fbm(z * 0.02, 1.3, 3) + 230 * Math.exp(-(((z + 1650) / 260) ** 2)); }

function landHeight(N) {
  return (x, z) => {
    const d = coastX(N, z) - x;                         // > 0 inland
    if (d > 0) {
      const cliffH = 38 + 26 * N.fbm(z * 0.005 + 5, 1.7, 3);
      // near-vertical faces with a talus at the foot, broken by buttresses and gullies
      const buttress = 1 + 0.25 * N.fbm(z * 0.03, 9.1, 3);
      const cliff = cliffH * smooth(0, (8 + 6 * N.fbm(z * 0.02, 8, 2)) * buttress, d);
      const ledges = 2.5 * Math.sin(cliff * 0.9 + N.fbm(x * 0.05, z * 0.05, 2) * 3) * smooth(1, 6, d) * (1 - smooth(10, 20, d));
      const hills = 140 * smooth(30, 1100, d) * (0.5 + 0.5 * N.fbm(x * 0.0018, z * 0.0018, 4));
      const bumps = 3.0 * N.fbm(x * 0.025, z * 0.025, 4) * smooth(8, 40, d);
      return cliff + ledges + hills + bumps;
    }
    // shelf: boulders at the cliff foot, then pale sand shelving into deep water
    const off = -d;
    const shelf = -0.016 * off - 0.00006 * off * off;
    const boulders = 2.2 * Math.max(0, N.fbm(x * 0.08, z * 0.08, 3) + 0.1) * (1 - smooth(0, 30, off));
    const ripples = 0.3 * N.fbm(x * 0.06 + 3, z * 0.06, 3) + 1.2 * N.fbm(x * 0.008, z * 0.008 - 2, 3);
    return Math.max(shelf + boulders + ripples - 0.5, -70);
  };
}

export async function setup(ctx) {
  const { scene, camera } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: HDRI_ROT, backgroundBlurriness: 0, horizonFill: { above: 3.5, below: -1.5, blend: 1.5 } });
  const sun = sky.apply(scene);
  sun.intensity *= 1.5;                 // the same clear spell as F2
  scene.environmentIntensity = 0.85;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);

  const ocean = createOcean(ctx, { windSpeed: 7, windDirection: 200, swell: 0.5, choppiness: 1.2, seed: 9, depth: 40, mipFilter: 'trilinear', roughness: 0.05, turbidity: 0.04, foamThreshold: 0.5, shoreFoam: 1.0, shoreFoamWidth: 5.0, surf: 1.0 });
  scene.add(ocean.mesh);

  // the island's coast: cliffs, turf above, boulders and pale sand below the water
  const N = makeNoise(17);
  const H = landHeight(N);
  const land = heightfield({
    xs: gradedAxis(-1700, 150, 640, -170, 2.4),
    zs: gradedAxis(-3600, 350, 700, -150, 2.0),
    height: H,
    splat: (x, z, y, n) => {
      const steep = smooth(0.4, 0.75, 1 - n[1]);
      const under = 1 - smooth(-1.2, 1.2, y);
      const turf = (1 - steep) * smooth(2, 8, y);
      const sand = (1 - steep) * under;
      const scree = (1 - steep) * (1 - under) * (1 - turf);
      return [Math.max(steep, scree * 0.5), turf, sand, scree * 0.5];
    },
    color: (x, z, y, n) => {
      const p = N.fbm(x * 0.012 + 4, z * 0.012, 3), q = N.fbm(x * 0.05, z * 0.05 + 7, 2);
      const v = 0.75 + 0.5 * p + 0.15 * q;
      return [v * (1.02 + 0.05 * q), v, v * 0.96];
    },
  });
  const landMat = await terrainMaterial(ctx, [
    { id: 'pbr/acg_rock26', scale: 5, tint: [0.66, 0.64, 0.6], normalScale: 1.4 },
    { id: 'pbr/acg_ground037', scale: 4, tint: [0.62, 0.66, 0.52] },
    { id: 'pbr/acg_ground27', scale: 4, tint: [1.0, 0.96, 0.88] },
    { id: 'pbr/acg_ground28', scale: 3, tint: [0.85, 0.84, 0.8] },
  ], { macro: 0.45, macroScale: 0.01, detailNear: 200, detailFar: 2000, vertexColors: true, cliff: { strata: 0.9, streaks: 0.8, wet: 0.9, ochre: 0.6 } });
  const island = new THREE.Mesh(land.geometry, landMat);
  island.receiveShadow = true; island.castShadow = true;
  scene.add(island);

  // gorse / heather clumps along the cliff tops and boulders at the cliff foot
  const foliage = foliageMaterial({ color: [0.045, 0.07, 0.026], leafScale: 3.5, flower: [0.55, 0.42, 0.04, 0.6] });
  // thickets: cluster centres along the cliff tops, overlapping clumps around each
  const centres = [];
  { let a = 99; const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
    for (let i = 0; i < 600; i++) { const z = -2600 + r() * 2900, d = 3 + Math.pow(r(), 1.6) * 200; centres.push([z, d, 4 + r() * 16, 3 + Math.floor(r() * 14)]); } }
  let ci = 0, cj = 0;
  const bushes = scatter(bushGeometry(1, 2), foliage, 3500, (rng) => {
    if (ci >= centres.length) return null;
    const [cz, cd, rad, n] = centres[ci];
    if (++cj >= n) { cj = 0; ci++; }
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * rad;
    const z = cz + Math.cos(a) * rr, x = coastX(N, z) - cd + Math.sin(a) * rr * 0.6;
    const y = H(x, z);
    if (y < 4 || coastX(N, z) - x < 2) return null;
    const s = (1.0 + rng() * 2.2) * (1 - 0.4 * rr / rad);
    const g = 0.7 + rng() * 0.45;
    return { p: [x, y - 0.25, z], s: [s * (0.9 + rng() * 0.6), s * (0.4 + rng() * 0.35), s * (0.9 + rng() * 0.6)], c: [g * (0.85 + rng() * 0.3), g, g * 0.85] };
  }, 7);
  scene.add(bushes);
  // kitbashed sea cliffs: photo-scanned cliff faces (Poly Haven scans via the Babylon.js
  // coastal-cliff composition) scaled up 2.5-4x, overlapped along the coastline, faces seaward;
  // scanned boulders and rock platforms along the foot
  const kit = await loadKit(ctx, 'model/babylon_coastal_cliff');
  const coastSlope = (z) => (coastX(N, z + 1) - coastX(N, z - 1)) / 2;
  const cliffs = { coastal_cliff_01: [], namaqualand_cliff_02: [] };
  { let a = 4242; const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
    for (let z = -2700; z < 420;) {
      const big = r() < 0.5;
      const name = big ? 'coastal_cliff_01' : 'namaqualand_cliff_02';
      const P = kit.pieces[name];
      const w = P.bbox.max.x - P.bbox.min.x, hgt = P.bbox.max.y - P.bbox.min.y, dep = P.bbox.max.z - P.bbox.min.z;
      const cz = z + 0;
      const cliffH = 38 + 26 * N.fbm(cz * 0.005 + 5, 1.7, 3);
      const sxz = 2.0 + r() * 2.4, sy = (cliffH / hgt) * (0.85 + r() * 0.4);
      const yaw = Math.atan2(1, -coastSlope(cz)) + (r() - 0.5) * 1.1;
      const cx = coastX(N, cz) - dep * sxz * 0.32 + (r() - 0.5) * 6;
      cliffs[name].push({ p: [cx, -4 - r() * 3, cz], s: [sxz * (0.8 + r() * 0.5), sy, sxz * (0.8 + r() * 0.4)], r: yaw, tilt: [(r() - 0.5) * 0.12, (r() - 0.5) * 0.12] });
      z += w * sxz * (0.3 + r() * 0.45);
    } }
  for (const [n, list] of Object.entries(cliffs)) scene.add(kit.instance(n, list));
  const rocks = { rock_moss_set_01: [], rock_moss_set_02: [], coast_land_rocks_04: [] };
  { let a = 777; const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
    for (let i = 0; i < 420; i++) {
      const z = -560 + r() * 680, off = -2 + Math.pow(r(), 2.0) * 34;
      const x = coastX(N, z) + off, y = H(x, z);
      if (y > 2.5 || y < -4.5) continue;
      if (N.fbm(x * 0.03, z * 0.03 + 5, 2) < 0.0 + 0.3 * r()) continue;
      const k = r(), name = k < 0.6 ? 'rock_moss_set_02' : 'rock_moss_set_01';
      const s = name === 'coast_land_rocks_04' ? 0.6 + r() * 1.2 : (1.5 + Math.pow(r(), 2.2) * 7) / (name === 'rock_moss_set_01' ? 0.8 : 1.3);
      rocks[name].push({ p: [x, y - 0.3, z], s: [s, s * (0.7 + r() * 0.5), s], r: r() * 6.28, tilt: [(r() - 0.5) * 0.3, (r() - 0.5) * 0.3] });
    } }
  for (const [n, list] of Object.entries(rocks)) if (list.length) scene.add(kit.instance(n, list));

  // (no buildings in this plate: the palace is established on the ground, not from the air)

  // the dragons and their riders (provisional designs, hero meshes)
  const [charcoal, leaf] = await Promise.all([createCreature('charcoal', { quality: 'standard' }), createCreature('leaf', { quality: 'standard' })]);
  scene.add(charcoal.root, leaf.root);
  // membranes are skin, not lacquer: broad, low sheen; a black membrane passes little light
  for (const c of [charcoal, leaf]) { c.materials.membrane.roughness = 0.9; c.materials.membrane.envMapIntensity = 0.18; }
  charcoal.materials.membrane.userData.dkUniforms.uTransCol.value.multiplyScalar(0.22);
  const human = await loadHuman();
  const remi = createRider(human, { outfit: 'remi', lean: 0.15 });
  const abby = createRider(human, { outfit: 'abby', lean: 0.18, reach: 0.45 });
  mountRider(charcoal, createSaddle(charcoal, {}), remi);
  mountRider(leaf, createSaddle(leaf, {}), abby);

  camera.near = 0.5; camera.far = 30000;
  S = { sun, ocean, charcoal, leaf, H };
}

export function update(t, ctx) {
  const { sun, ocean, charcoal, leaf } = S;
  ocean.update(t);
  const z0 = -SPEED * t;                     // the formation's travel along the coast

  // Charcoal: right, farther out, ahead; slow heavy beats
  charcoal.setPose(poses.flight(charcoal, { t, phase: 0.78, bank: 0.03, bodyPitch: -0.02, look: [0.12, 0] }));
  charcoal.root.position.set(-4, 47 + 0.8 * Math.sin(t * 0.6), z0 - 100);
  charcoal.root.rotation.set(0, Math.PI + 0.05, 0);
  // Leaf: left, nearer the land, slightly behind; quick corrective beats, glancing at Charcoal
  leaf.setPose(poses.flight(leaf, { t, corr: 1, phase: 0.62, bank: -0.05, look: [-0.45, 0.05] }));
  leaf.root.position.set(-70, 29 + 0.6 * Math.sin(t * 1.3 + 1), z0 - 18);
  leaf.root.rotation.set(0, Math.PI - 0.03, 0);

  // camera ship: ~350 m behind the pair on the inland side, a little above, matching speed
  // (air-to-air on a long lens: the true size difference survives the perspective)
  const cam = ctx.camera;
  cam.position.set(-22, 50, z0 + 320);
  cam.lookAt(-36, 46, z0 - 70);
  applyShake(cam, t, { kind: 'aerial', amount: 0.35, seed: 4 });

  // sun shadow map around the pair (the cascades cover the wide view)
  sun.target.position.set(-40, 0, z0 - 60);
  sun.position.copy(sun.target.position).addScaledVector(SUN, 600);

  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = 60;
  ctx.lens.fstop = 5.6;
  ctx.lens.focusTarget = leaf.root;
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 400;
}
