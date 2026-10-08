// Architecture kit - development scene (quick checks of single pieces, close-ups at the pixel
// footprint of a 4K frame: a narrow field of view at preview size).
//   node render/render.mjs --still scenes/lookdev/architecture-dev.js --time 1.5 --preset preview --cinematic velocity --png out.png
// shots (one per second): 0 two houses 3/4 | 1 rubble + mortar | 2 jetty, studs, pegs | 3 roof verge
// | 4 leaded / cloth windows | 5 chimney + flashings | 6 shop counter | 7 quoin + sill stains
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { groundMaterial, reviewTime } from '../lib/humans/stage.js';
import { Kit, frame } from '../lib/architecture/core.js';
import { archMaterials } from '../lib/architecture/materials.js';
import { house } from '../lib/architecture/house.js';
import { filmFinish } from './finish.js';

const DEBUG = 0;
// house A at x = -4 (front gable, rich: leaded glass), house B at x = +3.6 (eaves to the street)
const SHOTS = [
  { p: [9.5, 1.65, 13.5], l: [-1, 4.4, 2], fov: 50 },
  { p: [-5.2, 1.2, 6.6], l: [-5.6, 1.1, 4.25], fov: 22 },
  { p: [-2.0, 2.6, 7.6], l: [-3.3, 3.9, 4.6], fov: 26 },
  { p: [0.5, 8.0, 9.0], l: [-1.0, 8.4, 4.4], fov: 24 },
  { p: [-3.0, 4.6, 8.0], l: [-3.6, 4.5, 4.7], fov: 22 },
  { p: [4.5, 10.5, 10.0], l: [1.5, 10.0, 1.0], fov: 22 },
  { p: [6.0, 1.6, 8.5], l: [4.5, 1.4, 4.0], fov: 30 },
  { p: [-0.6, 1.4, 6.8], l: [-0.6, 1.3, 4.0], fov: 26 },
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
  const a = house(kit, frame([-4, 0, 0]), { w: 6.6, d: 8.5, storeys: 1, roof: 'front', seed: 11, lod: 'hero', rich: true, chimney: 'right', party: { left: false, right: true } });
  const b = house(kit, frame([3.36, 0, 0]), { w: 8.0, d: 8.5, storeys: 1, roof: 'side', seed: 25, lod: 'hero', rich: false, chimney: 'left', party: { left: true, right: false }, shop: { x: 4.6, w: 1.6 }, door: { x: 2.0 } });
  const grp = kit.build(M, { name: 'dev' });
  console.warn('[arch-dev] ' + JSON.stringify({ ms: Math.round(performance.now() - t0), tris: grp.userData.tris, doors: [a.doors, b.doors], wins: [a.windows.length, b.windows.length], counts: Object.fromEntries(Object.entries(kit.accs).map(([k, x]) => [k, x.tcount])) }));
  scene.add(grp);
  S = { sun, sunDir: sky.sun.direction.clone() };
}

export function update(t, ctx) {
  const cam = ctx.camera;
  const rt = reviewTime(t, ctx);
  const s = SHOTS[Math.min(SHOTS.length - 1, Math.max(0, rt.k))];
  cam.position.set(...s.p); cam.lookAt(...s.l); cam.fov = s.fov; cam.near = 0.05; cam.far = 500; cam.updateProjectionMatrix();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = 8; ctx.lens.focus = cam.position.distanceTo(new THREE.Vector3(...s.l)); }
  const { sun, sunDir } = S;
  sun.target.position.set(-1, 0, 0); sun.position.copy(sun.target.position).addScaledVector(sunDir, 60);
  const sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 140; sc.updateProjectionMatrix();
}
