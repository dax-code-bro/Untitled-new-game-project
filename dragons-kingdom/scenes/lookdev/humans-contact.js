// Humans - contact sheets / turntables of every built character under neutral daylight
// (PROVISIONAL looks, designs not approved). Each whole second shows one sheet of up to 8
// people; within it they turn: yaw = 360 deg x frac(t) (k.0 front, k.25 their left side, k.5 back).
//   t 0-1  Abby (normal / injured LEFT arm / LEFT-arm sling), Remi, Alexandria, Queen Fall, King
//   t 1-2  household + grounds: attendant, healer, messenger, ground keepers, vendor, parent, child
//   t 2-3  musicians, guard captain, guards, watchman
//   t 3-4  injured villager, sailor, harbor crew, festival villagers 1-4
//   t 4-5  festival villagers 5-11
//   t 5-6  festival villagers 12-18
//   t 6-7  riders (seated poses, on a neutral saddle-sized block at seat height)
//   node render/render.mjs --still scenes/lookdev/humans-contact.js --time 0 --preset final --png sheet-a.png
// Characters that have not been built yet are skipped (listed in the console).
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { loadCharacter, placeCharacter, CROWD } from '../lib/humans/index.js';
import { applyIdle } from '../lib/humans/idle.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { filmFinish } from './finish.js';

export const meta = {
  title: 'Humans - contact sheets (PROVISIONAL)',
  duration: 7,
  seed: 5,
  cinematic: filmFinish({ shadows: { cascades: 0 }, ao: { enabled: true, radius: 0.15 }, dof: { enabled: false }, grade: { exposure: 0.1, whiteBalance: 6000 } }),
};

export const SHEETS = [
  ['abby', 'abby_injured', 'abby_sling', 'remi', 'alexandria', 'fall', 'king'],
  ['attendant', 'healer', 'messenger', 'keeper1', 'keeper2', 'vendor', 'parent', 'child'],
  ['musician', 'musician2', 'guard_captain', 'guard1', 'guard2', 'guard3', 'watchman'],
  ['villager_hurt', 'sailor1', 'sailor2', ...CROWD.slice(0, 4)],
  CROWD.slice(4, 11),
  CROWD.slice(11),
  ['remi_ride', 'abby_ride', 'abby_ride_injured', 'fall_ride', 'scout_ride'],
];
const RIDERS = SHEETS.length - 1;
const ROW_GAP = 60;
const SPACING = 0.95;
const SEAT_Y = 0.95;     // riders: pelvis 0.1 m above a seat block this high

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: -1.0, backgroundBlurriness: 0.5 });
  const sun = sky.apply(scene);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0001; sun.shadow.normalBias = 0.006;
  scene.add(sun, sun.target);
  // worldSize = the metres UV 0..1 covers (the whole plane): the scan keeps its real scale
  const GW = 200, GH = ROW_GAP * SHEETS.length + 100;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), await groundMaterial('pbr/acg_ground05', ctx, [GW, GH], { vary: 0.15 }));
  ground.rotation.x = -Math.PI / 2; ground.position.z = -ROW_GAP * (SHEETS.length - 1) / 2; ground.receiveShadow = true;
  scene.add(ground);
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 0.7 });
  const sheets = [];
  const missing = [];
  for (const [k, ids] of SHEETS.entries()) {
    const z = -k * ROW_GAP;
    const chars = [];
    const seats = [];
    const n = ids.length;
    for (const [i, id] of ids.entries()) {
      let ch;
      try { ch = await loadCharacter(id); } catch (e) { missing.push(id); continue; }
      const x = (i - (n - 1) / 2) * SPACING * (k === RIDERS ? 1.5 : 1);
      if (k === RIDERS) {
        // seated: pelvis (root bone, at the origin of a rider build) 0.1 m above the seat
        placeCharacter(ch, x, SEAT_Y + 0.1, z, 0);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, SEAT_Y, 0.5), seatMat);
        seat.position.set(x, SEAT_Y / 2, z - 0.02); seat.castShadow = seat.receiveShadow = true;
        scene.add(seat); seats.push(seat);
      } else placeCharacter(ch, x, 0, z, 0);
      scene.add(ch.root);
      chars.push({ ch, x, z });
    }
    sheets.push({ z, chars, seats, width: n * SPACING * (k === RIDERS ? 1.5 : 1) });
  }
  if (missing.length) console.warn('humans-contact: not built yet:', missing.join(', '));
  S = { sun, sunDir: sky.sun.direction.clone().normalize(), sheets };
}

export function update(t, ctx) {
  const { camera } = ctx;
  // every sub-frame of the film finish (shutter + jitter AA) shows the same pose of the same
  // sheet: quantise to the frame (no ghosting where one sheet hands over to the next at k.0)
  t = Math.round(t * 24) / 24;
  const k = Math.min(S.sheets.length - 1, Math.max(0, Math.floor(t)));
  const sh = S.sheets[k];
  const yaw = (t - Math.floor(t)) * Math.PI * 2;
  for (const s of S.sheets) for (const c of s.chars) {
    c.ch.root.visible = s === sh;
    c.ch.root.rotation.y = yaw;
    applyIdle(c.ch, 0, { amount: 0, blink: false, eyes: false });
  }
  for (const s of S.sheets) for (const m of s.seats || []) m.visible = s === sh;
  // long lens from the front, slightly above eye level: little perspective distortion
  const fov = 16;
  const aspect = 16 / 9;
  const halfW = sh.width / 2 + 0.3;
  const dist = halfW / Math.tan(((fov * Math.PI) / 180 / 2)) / aspect;
  const tgt = new THREE.Vector3(0, k === RIDERS ? 1.15 : 0.95, sh.z);
  camera.position.set(0, tgt.y + dist * Math.sin(0.04), sh.z + dist);
  camera.lookAt(tgt);
  camera.fov = fov; camera.near = 1; camera.far = dist + 200;
  camera.updateProjectionMatrix();
  // sun shadows over this sheet
  const { sun, sunDir } = S;
  const g = new THREE.Vector3(0, 1, sh.z);
  sun.target.position.copy(g);
  sun.position.copy(g).addScaledVector(sunDir, 40);
  const sc = sun.shadow.camera;
  const r = halfW + 1.5;
  sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 15; sc.far = 70;
  sc.updateProjectionMatrix();
  sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
}
