// Style frame F3 - SCENES 1C/1D, in flight off Verdor (shot list 1C-11 / 1D).
//
// "The dragons climb over the coast ... their relation to one another ... the sea below ...
// Charcoal draws level with Leaf. His larger shadow crosses the water. Leaf adjusts with
// quicker wingbeats."
//
// The flight line (shotlist.json conventions.flight_line_1C_to_1E): travel screen LEFT to
// RIGHT, camera on the INLAND side, so we see the dragons' and riders' RIGHT sides; Leaf
// left/near and slightly behind, Charcoal right/far, here drawn level with him; the island is on
// the camera's side (behind the lens), the open sea beyond them. The sun is over the sea side,
// behind them and high (the same photographed sky and sun elevation as F2): a three-quarter
// back light - along their backs and wings, the right sides in sky and sea fill.
//
// Cinematography: air-to-air from a camera ship holding station ~40 m off the cliffs, ~60 m up,
// on a 45 mm lens on Super 35, looking out to sea across a shallow sandy bay. From ~230-300 m the
// perspective keeps their true size difference (Charcoal ~36 m, Leaf ~8 m) with Remi and Abby
// small on their backs. Below them the bay shelves from turquoise over pale sand to deep blue;
// Charcoal's shadow lies on the shallows ahead of and inshore of him (the sun is behind them
// and seaward), Leaf's small one beside it. The camera ship matches their speed: the dragons are sharp, the sea streaks a
// little with the 180-degree shutter.
//   node render/render.mjs --still scenes/lookdev/style-f3-flight.js --time 2 --preset final --png out.png
import * as THREE from 'three';
import { createOcean } from 'dk/ocean.js';
import { applyShake } from 'dk/camera.js';
import { heightfield, makeNoise, smooth, gradedAxis } from '../lib/sets/terrain.js';
import { terrainMaterial } from '../lib/sets/materials.js';
import { loadKit } from '../lib/sets/kitbash.js';
import { createCreature, poses, createSaddle, mountRider } from '../lib/creatures/index.js';
import { loadHuman, createRider } from '../lib/humans/index.js';
import { loadHDRI } from '../lib/assets.js';
import { filmFinish } from './finish.js';

// the sun: over the sea (+x), behind them along the travel (-z), 48 degrees up (kloofendal's own sun)
const SUN_H = new THREE.Vector3(0.6, 0, -0.8).normalize();
const KLOOF_AZ0 = 0.942;                                    // atan2(x, z) of kloofendal's sun at rotationY 0
const HDRI_ROT = Math.atan2(SUN_H.x, SUN_H.z) - KLOOF_AZ0;
const SPEED = 16;           // m/s along +z (the flight line: screen left -> right)

export const meta = {
  title: 'Style frame F3 - In flight off Verdor',
  duration: 8,
  seed: 31,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 1.8, apDistanceScale: 1.3 },
    volumetrics: {
      enabled: true, range: 3000, resolution: [256, 96, 85], noiseFilter: true,
      density: 0.00004, heightFalloff: 0.01, anisotropy: 0.75, noiseScale: 0.004, noiseAmount: 0.6,
      banks: [
        // a low bank of sea mist far out on the horizon
        { center: [2600, 30, 400], radius: [700, 50, 2400], density: 0.0025, noise: 0.85 },
      ],
      cloudShadows: { coverage: 0.25, scale: 0.0011, speed: [6, 2], altitude: 1600, opacity: 0.45 },
    },
    shadows: { cascades: 2, maxDistance: 900 },
    ao: { enabled: false },
    dof: { samples: 48 },
    grade: { exposure: 2.05, whiteBalance: 6000, contrast: 1.2, saturation: 0.95, lift: [-0.07, -0.07, -0.07] },
  }),
};

let S;

// coastline: inland is x < coastX(z) (behind the camera)
function coastX(N, z) { return -150 + 40 * Math.sin(z * 0.0019 + 0.6) + 30 * N.fbm(z * 0.004, 3.1, 4) + 12 * N.fbm(z * 0.02, 1.3, 3); }

function landHeight(N) {
  return (x, z) => {
    const d = coastX(N, z) - x;                         // > 0 inland
    if (d > 0) {
      const cliffH = 38 + 26 * N.fbm(z * 0.005 + 5, 1.7, 3);
      const cliff = cliffH * smooth(0, 10, d);
      const hills = 140 * smooth(30, 1100, d) * (0.5 + 0.5 * N.fbm(x * 0.0018, z * 0.0018, 4));
      return cliff + hills + 3.0 * N.fbm(x * 0.025, z * 0.025, 4) * smooth(8, 40, d);
    }
    // the bay: boulders at the cliff foot, then pale sand shelving gently, sand ripples and weed
    // patches (darker), deep water beyond ~500 m
    const off = -d;
    const shelf = -0.011 * off - 0.000016 * off * off - 30 * smooth(450, 900, off);
    const boulders = 2.2 * Math.max(0, N.fbm(x * 0.08, z * 0.08, 3) + 0.1) * (1 - smooth(0, 30, off));
    const ripples = 0.25 * N.fbm(x * 0.06 + 3, z * 0.06, 3) + 1.4 * N.fbm(x * 0.006, z * 0.006 - 2, 3);
    return Math.max(shelf + boulders + ripples - 0.5, -70);
  };
}

export async function setup(ctx) {
  const { scene, camera } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: HDRI_ROT, backgroundBlurriness: 0, horizonFill: { above: 3.5, below: -1.5, blend: 1.5 } });
  const sun = sky.apply(scene);
  sun.intensity *= 1.45;                // the same clear spell as F2
  scene.environmentIntensity = 0.9;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);
  const SUN = sky.sun.direction.clone();

  const ocean = createOcean(ctx, { windSpeed: 6.5, windDirection: 200, swell: 0.45, choppiness: 1.15, seed: 9, depth: 40, mipFilter: 'trilinear', roughness: 0.05, turbidity: 0.05, foamThreshold: 0.72, shoreFoam: 0.6, shoreFoamWidth: 1.2, surf: 0.0 });
  scene.add(ocean.mesh);

  // the island's coast behind the camera, and the bay's sea floor (seen through the shallows)
  const N = makeNoise(17);
  const H = landHeight(N);
  const land = heightfield({
    xs: gradedAxis(-1500, 1400, 640, 100, 2.2),
    zs: gradedAxis(-2400, 2400, 700, 0, 2.0),
    height: H,
    splat: (x, z, y, n) => {
      const steep = smooth(0.4, 0.75, 1 - n[1]);
      const under = 1 - smooth(-1.2, 1.2, y);
      const turf = (1 - steep) * smooth(2, 8, y);
      // weed beds and rock on the sand (darker patches): reads as a sea floor, not a flat tint
      const weed = under * smooth(0.05, 0.35, N.fbm(x * 0.012 + 7, z * 0.012, 3)) * 0.8;
      const sand = (1 - steep) * under * (1 - weed);
      const scree = (1 - steep) * (1 - under) * (1 - turf);
      return [Math.max(steep, scree * 0.5, weed), turf, sand, scree * 0.5];
    },
    color: (x, z) => {
      const p = N.fbm(x * 0.012 + 4, z * 0.012, 3), q = N.fbm(x * 0.05, z * 0.05 + 7, 2);
      const v = 0.75 + 0.5 * p + 0.15 * q;
      return [v * (1.02 + 0.05 * q), v, v * 0.96];
    },
  });
  const landMat = await terrainMaterial(ctx, [
    { id: 'pbr/acg_rock26', scale: 5, tint: [0.36, 0.38, 0.3], normalScale: 1.4 },
    { id: 'pbr/acg_ground037', scale: 4, tint: [0.62, 0.66, 0.52] },
    { id: 'pbr/acg_ground27', scale: 4, tint: [1.0, 0.96, 0.88] },
    { id: 'pbr/acg_ground28', scale: 3, tint: [0.85, 0.84, 0.8] },
  ], { macro: 0.45, macroScale: 0.01, detailNear: 200, detailFar: 2000, vertexColors: true });
  const island = new THREE.Mesh(land.geometry, landMat);
  island.receiveShadow = true; island.castShadow = true;
  scene.add(island);
  // scanned rocks breaking the surface here and there in the bay (scale for the water)
  const kit = await loadKit(ctx, 'model/babylon_coastal_cliff');
  const rocks = { rock_moss_set_02: [], rock_moss_set_01: [] };
  { let a = 777; const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
    for (let i = 0; i < 60; i++) {
      const z = -700 + r() * 1400, off = 30 + Math.pow(r(), 1.6) * 260;
      const x = coastX(N, z) + off, y = H(x, z);
      const name = r() < 0.6 ? 'rock_moss_set_02' : 'rock_moss_set_01';
      const s = (2 + Math.pow(r(), 2.2) * 6) / (name === 'rock_moss_set_01' ? 0.8 : 1.3);
      rocks[name].push({ p: [x, y - 0.5, z], s: [s, s * (0.7 + r() * 0.5), s], r: r() * 6.28, tilt: [(r() - 0.5) * 0.3, (r() - 0.5) * 0.3] });
    } }
  for (const [n, list] of Object.entries(rocks)) if (list.length) scene.add(kit.instance(n, list));

  // the dragons and their riders (provisional designs; riders from the humans cast builds)
  const [charcoal, leaf] = await Promise.all([createCreature('charcoal', { quality: 'standard' }), createCreature('leaf', { quality: 'standard' })]);
  scene.add(charcoal.root, leaf.root);
  const human = await loadHuman();
  const remi = createRider(human, { outfit: 'remi', lean: 0.15 });
  const abby = createRider(human, { outfit: 'abby', lean: 0.18, reach: 0.45 });
  mountRider(charcoal, createSaddle(charcoal, {}), remi);
  mountRider(leaf, createSaddle(leaf, {}), abby);

  camera.near = 0.5; camera.far = 30000;
  S = { sun, SUN, ocean, charcoal, leaf, remi, abby, H, N };
}

// the wingbeat phase that puts cycle position `c` (0 top, 0.28 wings level on the downstroke) at t = 2
const atCycle = (cr, c) => c - 2 * (cr.config.flapHz ?? 1);
const shadowOn = (p, L) => new THREE.Vector3(p.x - p.y / L.y * L.x, 0, p.z - p.y / L.y * L.z);

export function update(t, ctx) {
  const { sun, SUN, ocean, charcoal, leaf, remi, abby, N } = S;
  ocean.update(t);
  const z0 = SPEED * (t - 2);                 // the formation's travel along the coast (+z)
  const cx = coastX(N, z0);

  // Charcoal: farther out, drawn level with Leaf; slow heavy beats (the downstroke)
  charcoal.setPose(poses.flight(charcoal, { t, phase: atCycle(charcoal, 0.3), bank: 0.02, bodyPitch: -0.02, look: [-0.18, 0.02] }));
  charcoal.root.position.set(cx + 330, 28 + 0.8 * Math.sin(t * 0.6), z0 + 14);
  charcoal.root.rotation.set(0, 0.02, 0);
  // Leaf: nearer the island, a length behind; quick corrective beats, glancing across at Charcoal
  leaf.setPose(poses.flight(leaf, { t, corr: 1, phase: atCycle(leaf, 0.22), bank: 0.04, look: [-0.5, 0.05] }));
  leaf.root.position.set(cx + 262, 24 + 0.6 * Math.sin(t * 1.3 + 1), z0 - 6);
  leaf.root.rotation.set(0, -0.03, 0);
  remi.update(t); abby.update(t);

  // camera ship: ~40 m off the cliffs, ~60 m up, matching speed, looking out to sea
  const cam = ctx.camera;
  cam.position.set(cx + 20, 150, z0);
  cam.lookAt(cx + 300, 29, z0 + 21);
  applyShake(cam, t, { kind: 'aerial', amount: 0.3, seed: 4 });
  cam.updateMatrixWorld(true);
  if (t === 2) {
    cam.updateProjectionMatrix();
    const scr = (p) => { const v = p.clone().project(cam); return [+(0.5 + v.x / 2).toFixed(3), +(0.5 - v.y / 2).toFixed(3)]; };
    console.warn('[f3] screen', JSON.stringify({ charcoal: scr(charcoal.root.position), leaf: scr(leaf.root.position), cShadow: scr(shadowOn(charcoal.root.position, SUN)), lShadow: scr(shadowOn(leaf.root.position, SUN)) }));
  }

  // sun shadow map around the pair and their shadows (the cascades cover the view)
  sun.target.position.set(cx + 260, 0, z0);
  sun.position.copy(sun.target.position).addScaledVector(SUN, 600);

  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = 58;
  ctx.lens.fstop = 5.6;
  ctx.lens.focusTarget = charcoal.root;
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 400;
}
