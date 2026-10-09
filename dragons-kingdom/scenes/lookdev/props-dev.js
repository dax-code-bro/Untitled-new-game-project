// Props - development scene (scratch): one model under neutral daylight for quick checks.
// t in [0, 1): orbit; the integer part picks the camera preset.
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { filmFinish } from './finish.js';
import { prologueBoat } from '../lib/props/boat.js';
import { propMaterials } from '../lib/props/materials.js';

export const meta = {
  title: 'Props - dev',
  duration: 8,
  cinematic: filmFinish({ atmosphere: { enabled: true, sky: 'scene', haze: 0.6 }, shadows: { cascades: 0 }, ao: { enabled: true, radius: 0.6 }, grade: { exposure: 0.55, whiteBalance: 6000 }, motionBlur: { accumulateSamples: 4 } }),
};
let S;
const DEBUG_MESH = false;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true });
  const sun = sky.apply(scene);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), await groundMaterial('pbr/acg_ground03', ctx, [200, 200]));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const boat = await prologueBoat(ctx, {});
  const lift = 0.66;
  boat.root.position.y = lift;
  const M = await propMaterials(ctx);
  M.wood.hull.userData.prop.prWet.value.x = lift;
  scene.add(boat.root);
  if (DEBUG_MESH) {
    const cols = { 'boat:hull': 0xff0000, 'boat:hullIn': 0x00ff00, 'boat:oak': 0x0000ff, 'boat:iron': 0xffff00, 'boat:pale': 0xff00ff, 'boat:spar': 0x00ffff, 'boat:rope': 0xffffff, 'boat:ropeTar': 0x808080, 'boat:stave': 0x804000, 'boat:withy': 0x008040, 'boat:dark': 0x400080 };
    boat.root.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshStandardMaterial({ color: cols[o.name] ?? 0x222222, roughness: 0.9 }); console.warn('[mesh]', o.name); } });
  }
  console.warn('[props-dev] boat tris', boat.root.userData.tris);
  S = { sun, obj: boat.root };
}
const VIEWS = [
  { az: 0.9, el: 0.12, d: 1.0 },      // 0: 3/4 bow
  { az: 2.4, el: 0.08, d: 0.9 },      // 1: 3/4 stern
  { az: 1.57, el: 0.6, d: 0.7, tgt: [0, 0.3, 0] },      // 2: high, into the boat
  { az: 0.7, el: 0.02, d: 0.35, tgt: [3.0, 0.4, 0] },   // 3: close bow planks
  { az: 4.2, el: 0.05, d: 0.45, tgt: [0, 3.5, 0] },     // 4: sail from the lee, backlit
  { az: 1.9, el: -0.02, d: 0.4, tgt: [-3.5, 0.4, 0.8] }, // 5: rudder
];
export function update(t, ctx) {
  const v = VIEWS[Math.min(VIEWS.length - 1, Math.floor(t))];
  const box = new THREE.Box3().setFromObject(S.obj);
  const c = box.getCenter(new THREE.Vector3()), R = box.getSize(new THREE.Vector3()).length() / 2;
  if (v.tgt) c.set(v.tgt[0], v.tgt[1] + S.obj.position.y, v.tgt[2]);
  const az = v.az, el = v.el, dist = R * 2.0 * v.d;
  ctx.camera.position.set(c.x + Math.cos(az) * Math.cos(el) * dist, Math.max(0.3, c.y + Math.sin(el) * dist), c.z + Math.sin(az) * Math.cos(el) * dist);
  ctx.camera.lookAt(c); ctx.camera.fov = 34; ctx.camera.near = 0.05; ctx.camera.far = 2000; ctx.camera.updateProjectionMatrix();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = 11; ctx.lens.focus = dist; ctx.lens.shutterAngle = 45; }
  const key = az + (v.back ? Math.PI : 0.75);
  const sd = new THREE.Vector3(Math.cos(key) * 0.68, 0.73, Math.sin(key) * 0.68).normalize();
  if (Math.floor(t) === 4) sd.set(-Math.cos(az) * 0.8, 0.45, -Math.sin(az) * 0.8).normalize();
  S.sun.target.position.copy(c); S.sun.position.copy(c).addScaledVector(sd, 100);
  const scm = S.sun.shadow.camera; scm.left = -R * 1.3; scm.right = R * 1.3; scm.top = R * 1.3; scm.bottom = -R * 1.3; scm.near = 1; scm.far = 300; scm.updateProjectionMatrix();
}
