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
import { scatterCoastRocks } from '../lib/nature/rocks.js';
import { landCover, scatterPlants } from '../lib/nature/plants.js';
import { treeKit, scatterTrees } from '../lib/nature/trees.js';
import { mulberry } from '../lib/nature/noise.js';
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
    { pos: [tip - 60, 230, 520], look: [tip + 170, 0, 735], f: 24 },
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
  const views = SH.filter(Boolean).map((s) => s.pos);
  const rocks = await scatterCoastRocks(ctx, coast, { views });
  scene.add(rocks.group);
  // the clifftop: land cover (salt turf at the edge, gorse belt, heath, bracken, scrub in hollows)
  const xs = views.map((v) => v[0]), zs = views.map((v) => v[2]);
  const region = { x: [Math.min(...xs) - 700, Math.max(...xs) + 300], z: [Math.min(...zs) - 900, Math.max(...zs) + 900] };
  const inland = (x, z) => W.footF(x, z) + 2 - W.coastF(x, z);          // metres back from the face
  const H = (x, z) => coast.surfaceAt(x, z);
  const slope = (x, z) => { const a = H(x - 1, z), b = H(x + 1, z), c = H(x, z - 1), d = H(x, z + 1); return 1 / Math.hypot((b - a) / 2, 1, (d - c) / 2); };
  const cover = landCover({ ...region, cell: 3, height: H, coastF: (x, z) => -inland(x, z), flow: (x, z) => W.landMap.layer('flow', x, z) * 1.6 - 0.75 });
  coast.material.userData.setCover(cover);
  const plants = scatterPlants(ctx, { cover, views, height: H, slope, region, edge: inland, grass: false, maxDistance: 1800 });
  scene.add(plants.group);
  // wind-flagged hawthorns crouched in the hollows behind the edge
  const thorn = await treeKit(ctx, 'hawthorn', { variants: 3, exposure: 0.9 });
  const rr = mulberry(808), places = [];
  for (let i = 0; i < 400 && places.length < 60; i++) {
    const x = region.x[0] + rr() * (region.x[1] - region.x[0]), z = region.z[0] + rr() * (region.z[1] - region.z[0]);
    const e = inland(x, z);
    if (e < 25 || e > 400) continue;
    const c = cover.sample(x, z);
    if (c[3] < 0.3 && rr() > 0.05) continue;
    places.push({ kit: thorn, x, y: H(x, z), z, variant: Math.floor(rr() * 3), yaw: (rr() - 0.5) * 0.4, scale: 0.8 + 0.5 * rr() });
  }
  scene.add(scatterTrees(places, { views }).group);
  const ocean = createOcean(ctx, { windSpeed: 7, windDirection: 190, swell: 0.55, choppiness: 1.2, seed: 9, depth: 30, mipFilter: 'trilinear', roughness: 0.05, foamThreshold: 0.7, shoreFoam: 1.0, shoreFoamWidth: 1.6, surf: 0.85 });
  ocean.mesh.position.y = -1.1;     // a falling tide: the platform and the black lichen band show
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
