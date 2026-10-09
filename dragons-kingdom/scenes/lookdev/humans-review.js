// Humans - quick review of a few builds side by side (iteration tool; the ids, e.g. test builds
// with a suffix, come from scenes/lookdev/humans-review.json { "ids": ["remi_t1", "abby_t1"] }).
//   frame 0  all of them from the front (full figures)      frame 1  from their left, 3/4
//   frame 2  from behind                                       frame 3+i  character i, medium
//   frame 3+n+i  character i, face close-up 3/4
//   node render/render.mjs scenes/lookdev/humans-review.js --preset preview --fps 1 --seconds 9 --out output/humans/review
// Daylight HDRI (neutral), sun keyed ~40 degrees off the lens axis, no motion.
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { loadCharacter, placeCharacter } from '../lib/humans/index.js';
import { applyIdle } from '../lib/humans/idle.js';
import { groundMaterial, reviewTime } from '../lib/humans/stage.js';
import { filmFinish } from './finish.js';

const CFG = await fetch(new URL('./humans-review.json', import.meta.url)).then((r) => r.json()).catch(() => ({ ids: ['abby'] }));

export const meta = {
  title: 'Humans - review (PROVISIONAL)',
  duration: 3 + 2 * (CFG.ids || []).length,
  seed: 7,
  cinematic: filmFinish({ motionBlur: { mode: 'off' }, shadows: { cascades: 0 }, ao: { enabled: true, radius: 0.15 }, dof: { samples: 32 }, grade: { exposure: 0.12, whiteBalance: 5900 } }),
};

const SPACING = CFG.spacing ?? 1.0;
let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI(CFG.hdri || 'hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: CFG.hdriRot ?? -1.0, backgroundBlurriness: 0.4 });
  const sun = sky.apply(scene);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0001; sun.shadow.normalBias = 0.006;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), await groundMaterial('pbr/acg_ground05', ctx, [120, 120], { vary: 0.15 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  const sunDir = sky.sun.direction.clone().normalize();
  const camAz = Math.atan2(sunDir.x, sunDir.z) - (40 * Math.PI) / 180;
  const chars = [];
  const n = CFG.ids.length;
  for (const [i, id] of CFG.ids.entries()) {
    let ch;
    try { ch = await loadCharacter(id); } catch (e) { console.warn(`humans-review: ${id} not built`); continue; }
    const x = (i - (n - 1) / 2) * SPACING;
    const right = new THREE.Vector3(Math.cos(camAz), 0, -Math.sin(camAz));
    const p = right.clone().multiplyScalar(x);
    const seated = ch.meta?.pose?.startsWith?.('ride');
    if (seated) {
      placeCharacter(ch, p.x, 1.05, p.z, camAz);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 0.5), new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 0.7 }));
      seat.position.set(p.x, 0.475, p.z); seat.rotation.y = camAz; seat.castShadow = seat.receiveShadow = true; scene.add(seat);
    } else placeCharacter(ch, p.x, 0, p.z, camAz);
    scene.add(ch.root);
    chars.push({ ch, p, id });
  }
  S = { sun, sunDir, camAz, chars };
}

export function update(t, ctx) {
  const { camera } = ctx;
  const rt = reviewTime(t, ctx);
  const k = Math.max(0, rt.k);
  const { chars, camAz } = S;
  for (const c of chars) applyIdle(c.ch, 0, { amount: 0, blink: false, eyes: false });
  const n = chars.length;
  let tgt = new THREE.Vector3(0, 0.95, 0), dist, az = camAz, el = 0.04, fov = 18, fstop = 8;
  const halfW = (n * SPACING) / 2 + 0.4;
  if (k <= 2) {
    az = camAz + [0, 0.75, Math.PI][k];
    dist = Math.max(4.5, halfW / Math.tan((fov * Math.PI) / 360) / (16 / 9));
  } else {
    const i = (k - 3) % n;
    const close = k - 3 >= n;
    const c = chars[i];
    if (!c) return;
    c.ch.bone('head').getWorldPosition(tgt);
    if (close) { tgt.y += 0.07; dist = 0.75; fov = 22; fstop = 2.8; az = camAz + 0.35; el = 0.02; } else { tgt.y -= 0.32; dist = 2.6; fov = 24; fstop = 4; az = camAz + 0.25; }
  }
  camera.position.set(tgt.x + dist * Math.cos(el) * Math.sin(az), tgt.y + dist * Math.sin(el), tgt.z + dist * Math.cos(el) * Math.cos(az));
  camera.lookAt(tgt);
  camera.fov = fov; camera.near = 0.03; camera.far = 300;
  camera.updateProjectionMatrix();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = fstop; ctx.lens.focus = camera.position.distanceTo(tgt); ctx.lens.shutterAngle = 45; }
  const { sun, sunDir } = S;
  const g = new THREE.Vector3(tgt.x, 1.0, tgt.z);
  sun.target.position.copy(g);
  sun.position.copy(g).addScaledVector(sunDir, 40);
  const sc = sun.shadow.camera;
  const r = k <= 2 ? halfW + 1.0 : 1.6;
  sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 20; sc.far = 60;
  sc.updateProjectionMatrix();
  sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
}
