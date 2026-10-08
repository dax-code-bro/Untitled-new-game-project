// Architecture kit - development scene (quick checks of single pieces, close-ups at the pixel
// footprint of a 4K frame: a narrow field of view at draft / preview size).
//   node render/render.mjs --still scenes/lookdev/architecture-dev.js --time 0.5 --preset draft --cinematic velocity --png out.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { Kit, frame, makeRand } from '../lib/architecture/core.js';
import { archMaterials } from '../lib/architecture/materials.js';
import { house } from '../lib/architecture/house.js';
import { filmFinish } from './finish.js';

const DEBUG = 0;
const SHOTS = [
  { p: [-13, 1.65, 13], l: [-2, 4.2, 3], fov: 55 },             // the row, 3/4
  { p: [-6.2, 4.4, 6.0], l: [-6.9, 4.6, 4.9], fov: 9 },        // a post at 4K pixel footprint (draft: fov / 4)
  { p: [-4, 1.5, 7.0], l: [-4.6, 1.4, 4.5], fov: 9 },          // stones at 4K pixel footprint
  { p: [-3, 6, 9], l: [-6, 7, 3], fov: 35 },
];

export const meta = {
  title: 'Architecture - dev',
  duration: SHOTS.length,
  seed: 3,
  cinematic: filmFinish({ shadows: { cascades: 0 }, ao: { enabled: true, radius: 0.4 }, dof: { enabled: false }, grade: { exposure: 0.2, whiteBalance: 5900 } }),
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: -0.6 });
  const sun = sky.apply(scene);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.01;
  scene.add(sun, sun.target);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), await groundMaterial('pbr/acg_ground03', ctx, [80, 80]));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
  const M = await archMaterials(ctx, { debug: DEBUG });
  const t0 = performance.now();
  const kit = new Kit(0);
  let x = -10;
  const hs = [];
  for (let i = 0; i < 3; i++) {
    const w = [6.4, 5.6, 7.2][i];
    hs.push(house(kit, frame([x + w / 2, 0, (i % 2) * 0.3]), { w, d: 8.5, storeys: i === 1 ? 2 : 1, roof: i === 2 ? 'side' : 'front', seed: 11 + i * 7, lod: 'hero', party: { left: i > 0, right: i < 2 } }));
    x += w + 0.05;
  }
  const grp = kit.build(M, { name: 'row' });
  console.warn("[arch-dev] " + JSON.stringify({ ms: Math.round(performance.now() - t0), tris: grp.userData.tris, counts: Object.fromEntries(Object.entries(kit.accs).map(([k, a]) => [k, a.tcount])) }));
  scene.add(grp);
  S = { sun, sunDir: sky.sun.direction.clone() };
  void makeRand;
}

export function update(t, ctx) {
  const cam = ctx.camera;
  const s = SHOTS[Math.min(SHOTS.length - 1, Math.floor(t))];
  cam.position.set(...s.p); cam.lookAt(...s.l); cam.fov = s.fov; cam.near = 0.05; cam.far = 500; cam.updateProjectionMatrix();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = 8; ctx.lens.focus = cam.position.distanceTo(new THREE.Vector3(...s.l)); }
  const { sun, sunDir } = S;
  sun.target.position.set(-1, 0, 0); sun.position.copy(sun.target.position).addScaledVector(sunDir, 60);
  const sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 140; sc.updateProjectionMatrix();
}
