// Nature lookdev - tree close-up: a wind-flagged hawthorn on the Verdor clifftop (meant for 1:1
// crops of the 4K frame). PROVISIONAL.
// The tree is grown by scenes/lib/nature/trees.js (exposure 0.95: the crown is combed and clipped
// leeward by the westerlies); around it the clifftop turf, thrift on the edge, gorse and heather,
// the limestone coast and the sea behind. Three-quarter back light: the sun comes from over the sea,
// through the leaves toward the lens.
//   t = 1  50 mm, 8 m from the trunk, the sea and the point behind
//   t = 2  85 mm detail: the leaning stems forking into limbs, the leaf sprays above
import * as THREE from 'three';
import { createOcean } from 'dk/ocean.js';
import { loadHDRI } from '../lib/assets.js';
import { loadVerdorCoast, verdorWorld } from '../lib/nature/coast.js';
import { treeKit } from '../lib/nature/trees.js';
import { landCover, scatterPlants } from '../lib/nature/plants.js';
import { filmFinish } from './finish.js';

const SUN_H = new THREE.Vector3(0.6, 0, -0.8).normalize();
const KLOOF_AZ0 = 0.942;

export const meta = {
  title: 'Nature lookdev - clifftop hawthorn close-up',
  duration: 3,
  seed: 8,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 1.6, apDistanceScale: 1.2 },
    shadows: { cascades: 3, maxDistance: 400, split: 0.85 },
    ao: { enabled: true, radius: 0.8 },
    dof: { samples: 48 },
    grade: { exposure: 1.85, whiteBalance: 6000, contrast: 1.12, saturation: 0.95 },
  }),
};

let S;
export async function setup(ctx) {
  const { scene, camera } = ctx;
  const W = await verdorWorld();
  // the tree: 22 m back from the face on the south flank of the point
  const tz = 470, tx = W.xc(tz) - 22;
  const ty = W.landHeight(tx, tz);
  // looking south-ish toward the sun: backlit leaves, the sea on the right, the crown streaming left (leeward)
  const cam1 = [tx + 1.5, ty + 1.3, tz + 14];
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: Math.atan2(SUN_H.x, SUN_H.z) - KLOOF_AZ0 + 0.55, horizonFill: { above: 3.5, below: -1.5, blend: 1.5 } });
  const sun = sky.apply(scene);
  sun.intensity *= 1.45; scene.environmentIntensity = 0.9;
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);
  const cam2 = [tx + 3.2, ty + 1.25, tz + 10.5];
  const coast = await loadVerdorCoast(ctx, { views: [cam1, cam2], radius: 3000, lodDist: [90, 300, 900] });
  scene.add(coast.group);
  const ocean = createOcean(ctx, { windSpeed: 7, windDirection: 190, swell: 0.55, choppiness: 1.2, seed: 9, depth: 30, mipFilter: 'trilinear', roughness: 0.05, foamThreshold: 0.7, shoreFoam: 1.0, shoreFoamWidth: 1.6, surf: 0.85 });
  ocean.mesh.position.y = -0.6;
  scene.add(ocean.mesh);
  // the hero hawthorn
  const kit = await treeKit(ctx, 'hawthorn', { variants: 1, exposure: 0.95, seed: 7, scale: 1.15 });
  const tree = kit.instance(0, 0);
  tree.position.set(tx, ty - 0.05, tz);
  scene.add(tree);
  // the ground around it: land cover, shrubs, thrift and grass near the lens
  const inland = (x, z) => W.footF(x, z) + 2 - W.coastF(x, z);
  const H = (x, z) => coast.surfaceAt(x, z);
  const slope = (x, z) => { const a = H(x - 1, z), b = H(x + 1, z), c = H(x, z - 1), d = H(x, z + 1); return 1 / Math.hypot((b - a) / 2, 1, (d - c) / 2); };
  const region = { x: [tx - 400, tx + 120], z: [tz - 400, tz + 400] };
  const cover = landCover({ ...region, cell: 2, height: H, coastF: (x, z) => -inland(x, z), flow: (x, z) => W.landMap.layer('flow', x, z) * 1.6 - 0.75 });
  coast.material.userData.setCover(cover);
  const plants = scatterPlants(ctx, { cover, views: [cam1, cam2], height: H, slope, region, edge: inland, grass: { radius: 30, count: 70000, height: [0.08, 0.3] }, maxDistance: 900 });
  scene.add(plants.group);
  // a few card-built gorse and heather close by
  const gorse = await treeKit(ctx, 'gorse', { variants: 2, exposure: 0.7, seed: 3 });
  const heather = await treeKit(ctx, 'heather', { variants: 2, exposure: 0.5, seed: 4 });
  const near = [[gorse, 4.5, 3.5, 1.2], [gorse, 6.5, -4.0, 1.0], [gorse, 9.0, 6.0, 1.4], [heather, 2.5, 1.0, 1.6], [heather, 3.0, -2.2, 1.4], [heather, -2.0, 3.5, 1.8], [heather, 1.5, 5.5, 1.5]];
  near.forEach(([k, dx, dz, s], i) => { const g = k.instance(0, i % 2); g.position.set(tx + dx, H(tx + dx, tz + dz) - 0.05, tz + dz); g.scale.setScalar(s); g.rotation.y = i * 1.7; scene.add(g); });
  camera.near = 0.1; camera.far = 30000;
  S = { sun, SUN: sky.sun.direction.clone(), ocean, tx, ty, tz, cam1, cam2 };
}

export function update(t, ctx) {
  const { sun, SUN, ocean, tx, ty, tz, cam1, cam2 } = S;
  ocean.update(t);
  const cam = ctx.camera;
  // shots switch a quarter second before each whole second, so a still at t = N (whose motion-blur
  // subframes straddle N) never mixes two shots
  const two = t >= 1.75;
  // detail: the leaning stems where they fork into limbs, with the underside of the crown above
  const p = two ? [tx + 3.2, ty + 1.25, tz + 10.5] : cam1;
  const look = two ? [tx - 1.0, ty + 1.9, tz] : [tx - 0.6, ty + 2.3, tz];
  cam.position.set(...p); cam.lookAt(...look); cam.updateMatrixWorld(true);
  const tgt = new THREE.Vector3(tx, ty, tz);
  sun.target.position.copy(tgt); sun.position.copy(tgt).addScaledVector(SUN, 300);
  ctx.lens.sensor = 'super35'; ctx.lens.focalLength = two ? 85 : 32; ctx.lens.fstop = two ? 4 : 5.6;
  ctx.lens.focus = cam.position.distanceTo(new THREE.Vector3(...look));
  ctx.lens.iso = 200; ctx.lens.shutterAngle = 180;
}
