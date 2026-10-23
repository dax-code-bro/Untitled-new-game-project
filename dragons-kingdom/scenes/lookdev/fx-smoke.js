// FX lookdev - smoke (F4 and the SMOKE shots): pipe smoke catching low morning light (R2-R4, R9:
// a thin tobacco ribbon and the musician's thicker, paler smoke), a chimney, smouldering wreckage
// after the attack (3D), and a smoke trail left in the air by a fast-moving burning source (1F-15,
// 1F-32). Scale: a 1.8 m post, a grey ball (albedo 0.4), a dark backdrop board for the wisps.
//
// Views (8 s each): 0 pipe wisps against the dark board (backlit)   1 chimney + smoulder wide
//                   2 the smoke trail
//
//   node render/render.mjs --still scenes/lookdev/fx-smoke.js --time 6 --preset draft --png out.png
import * as THREE from 'three';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { createFx } from '../lib/fx/index.js';

export const meta = {
  title: 'FX lookdev - smoke',
  duration: 24,
  seed: 8,
  cinematic: {
    atmosphere: { enabled: true, sky: 'scene', haze: 1.0 },
    ao: { enabled: true, radius: 0.8 },
    dof: { enabled: true },
    grade: { exposure: 0.0, whiteBalance: 5400 },
  },
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true });
  const sun = sky.apply(scene);
  const rot = Math.atan2(sky.sun.direction.z, sky.sun.direction.x) + 0.2;      // low sun from behind the wisps
  scene.environmentRotation.set(0, rot, 0); scene.backgroundRotation.set(0, rot, 0);
  sky.sun.direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
  sun.position.copy(sky.sun.direction).multiplyScalar(100);
  sun.castShadow = true; sun.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize);
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.02;
  const sc = sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 300; sc.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), await groundMaterial('pbr/ph_sandstone_blocks_04', ctx, [400, 400], { tint: [0.85, 0.83, 0.8] }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.5), new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.9 }));
  board.position.set(0, 1.25, -1.2); board.receiveShadow = true; scene.add(board);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 0.6), await loadPBR('pbr/ph_white_sandstone_bricks_03', ctx, { worldSize: [6, 6] }));
  wall.position.set(20, 3, -10); wall.castShadow = wall.receiveShadow = true; scene.add(wall);
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 0.7), wall.material);
  chim.position.set(21.5, 6.7, -10); chim.castShadow = true; scene.add(chim);

  const fx = await createFx(ctx, { ground: 0, wind: [0.8, 0, 0.3], tier: ctx.meta.fxTier });
  // two pipes (bowls at seated / standing height): tobacco and the musician's thicker smoke
  fx.smoke.wisp({ at: [-0.35, 1.05, 0], t0: -6, t1: 100, kind: 'pipe', rate: 90, seed: 1 });
  fx.smoke.wisp({ at: [0.4, 1.1, 0.05], t0: -6, t1: 100, kind: 'herb', rate: 70, seed: 2, density: 1.4 });
  // chimney + smouldering heap
  fx.smoke.plume({ at: [21.5, 7.45, -10], t0: -20, t1: 100, kind: 'chimney', rate: 6, seed: 3 });
  fx.smoke.plume({ at: [14, 0.2, -4], t0: -20, t1: 100, kind: 'smoulder', rate: 30, spread: 0.8, seed: 4 });
  // a trail left by a source flying at 35 m/s, 6 m up, from t = 16 to 20 (view 2)
  fx.smoke.trail({ at: (t) => [-60 + (t - 16) * 35, 6, 30], t0: 16, t1: 20, kind: 'cloth', rate: 50, seed: 5 });
  S = { fx };
}

export function update(t, ctx) {
  const cam = ctx.camera;
  const view = Math.min(2, Math.floor(t / 8));
  cam.near = 0.05; cam.far = 3000;
  ctx.lens.sensor = 'super35'; ctx.lens.shutterAngle = 180;
  if (view === 0) { cam.position.set(0.0, 1.5, 2.6); cam.lookAt(0, 1.45, 0); ctx.lens.focalLength = 40; ctx.lens.fstop = 4; ctx.lens.focus = 2.6; }
  else if (view === 1) { cam.position.set(4, 2.2, 16); cam.lookAt(16, 4, -8); ctx.lens.focalLength = 30; ctx.lens.fstop = 5.6; ctx.lens.focus = 18; }
  else { cam.position.set(20, 3, 60); cam.lookAt(-10, 6, 30); ctx.lens.focalLength = 30; ctx.lens.fstop = 5.6; ctx.lens.focus = 35; }
  S.fx.update(t);
}
