// Human look-development: one character, fixed camera setups by time (fast iteration).
//   t 0-1  full figure, front 3/4        t 1-2  face close-up 3/4      t 2-3  face profile
//   t 3-4  hands                          t 4-5  back 3/4               t 5-6  eye macro
// The character id comes from scenes/lookdev/humans-dev.json ({ "id": "abby" }).
//   node render/render.mjs --still scenes/lookdev/humans-dev.js --time 1.5 --preset preview --png out.png
import * as THREE from 'three';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { loadCharacterData, buildCharacter } from '../lib/humans/loader.js';
import { applyIdle } from '../lib/humans/idle.js';
import { filmFinish } from './finish.js';

const CFG = await fetch(new URL('./humans-dev.json', import.meta.url)).then((r) => r.json()).catch(() => ({ id: 'dev_test' }));

export const meta = {
  title: 'Humans - look development',
  duration: 6,
  seed: 3,
  cinematic: filmFinish({
    motionBlur: CFG.accumulate === false ? { mode: 'off' } : undefined,
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.12 },
    dof: { samples: 48 },
    grade: { exposure: CFG.exposure ?? 0.0, whiteBalance: 6000 },
  }),
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI(CFG.hdri || 'hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: CFG.hdriRot ?? -1.0, backgroundBlurriness: 0.25 });
  const sun = sky.apply(scene);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -1.5; sc.right = 1.5; sc.top = 2.2; sc.bottom = -0.5; sc.near = 0.5; sc.far = 60;
  sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.01;
  sun.position.copy(sky.sun.direction).multiplyScalar(30);
  sun.target.position.set(0, 0.9, 0);
  scene.add(sun, sun.target);
  const groundMat = await loadPBR('pbr/acg_ground13', ctx, { worldSize: 8 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const data = await loadCharacterData(CFG.id);
  const ch = buildCharacter(data);
  ch.root.rotation.y = CFG.yaw ?? 0;
  if (CFG.only) for (const m of ch.meshes) m.visible = CFG.only.some((n) => m.name.endsWith(':' + n));
  if (CFG.flat) for (const m of ch.meshes) if (CFG.flat.some((n) => m.name.endsWith(':' + n))) m.material = new THREE.MeshStandardMaterial({ color: 0x9a8f80, roughness: 0.8, side: THREE.DoubleSide });
  if (CFG.hairSpec !== undefined) for (const m of ch.meshes) if (m.material.userData.hair) m.material.userData.hair.uSpec.value = CFG.hairSpec;
  if (CFG.noEnvHair) for (const m of ch.meshes) if (m.material.userData.hair) m.material.envMapIntensity = 0;
  scene.add(ch.root);
  S = { ch, sun };
}

const CAMS = [
  { tgt: [0, 0.95, 0], az: 25, el: 3, dist: 3.2, fov: 32 },
  { tgt: 'head', off: [0, -0.02, 0.02], az: 30, el: 2, dist: 0.62, fov: 24, fstop: 2.8 },
  { tgt: 'head', off: [0, -0.02, 0.02], az: 88, el: 0, dist: 0.6, fov: 24, fstop: 2.8 },
  { tgt: 'wrist.R', off: [0, -0.05, 0.02], az: -40, el: 10, dist: 0.6, fov: 26, fstop: 4 },
  { tgt: [0, 1.0, 0], az: 155, el: 5, dist: 3.0, fov: 32 },
  { tgt: 'eye.L', off: [0, 0, 0.0], az: 20, el: 0, dist: 0.16, fov: 22, fstop: 4 },
];

export function update(t, ctx) {
  const { camera } = ctx;
  const { ch } = S;
  applyIdle(ch, CFG.still ? 0 : t, { blink: CFG.blink ?? false });
  ch.root.updateMatrixWorld(true);
  const c = CFG.cam || CAMS[Math.min(CAMS.length - 1, Math.floor(t))];
  const tgt = new THREE.Vector3();
  if (typeof c.tgt === 'string') { ch.bone(c.tgt).getWorldPosition(tgt); if (c.tgt === 'head') tgt.y += 0.08; tgt.add(new THREE.Vector3(...c.off)); }
  else tgt.set(...c.tgt);
  const yaw = (ch.root.rotation.y || 0) + (c.az * Math.PI) / 180, el = (c.el * Math.PI) / 180;
  camera.position.set(tgt.x + c.dist * Math.cos(el) * Math.sin(yaw), tgt.y + c.dist * Math.sin(el), tgt.z + c.dist * Math.cos(el) * Math.cos(yaw));
  camera.lookAt(tgt);
  camera.fov = c.fov; camera.near = 0.02; camera.far = 200;
  camera.updateProjectionMatrix();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = c.fstop ?? 5.6; ctx.lens.focus = camera.position.distanceTo(tgt); ctx.lens.shutterAngle = 45; }
}
