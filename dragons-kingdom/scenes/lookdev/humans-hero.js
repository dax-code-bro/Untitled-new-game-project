// Humans - hero angles (PROVISIONAL looks, designs not approved). One shot per second of time:
//   t 0-1  Remi and Abby standing together, medium shot, daylight (faces readable)
//   t 1-2  Abby, face close-up
//   t 2-3  Queen Alexandria, 3/4
//   t 3-4  King of Cling, medium
//   t 4-5  festival crowd group (9 villagers, mixed festival poses)
//   t 5-6  Abby with her LEFT arm in a sling
//   t 6-7  Abby holding her injured LEFT arm in
//   t 7-8  Queen Fall, medium
//   node render/render.mjs --still scenes/lookdev/humans-hero.js --time 0.5 --preset final --png remi-abby.png
// Every group stands in its own spot of one daylit field; the sun (from the HDRI) keys the
// faces from about 35-50 degrees off the lens axis, the sky fills.
import * as THREE from 'three';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { loadCharacter, placeCharacter } from '../lib/humans/index.js';
import { applyIdle } from '../lib/humans/idle.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { filmFinish } from './finish.js';

export const meta = {
  title: 'Humans - hero angles (PROVISIONAL)',
  duration: 8,
  seed: 11,
  cinematic: filmFinish({
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.15 },
    dof: { samples: 48 },
    grade: { exposure: 0.15, whiteBalance: 5900 },
  }),
};

// members: [id, x, z, yaw offset (rad, 0 = facing the camera)]; cam: target height, distance,
// elevation (deg), fov, f-stop, key: sun angle off the lens axis (deg, + = from camera left)
const SHOTS = [
  { name: 'remi-abby', members: [['remi', -0.42, 0, 0.32], ['abby', 0.42, 0.05, -0.38]], cam: { y: 1.38, dist: 3.4, el: 1, fov: 30, fstop: 4, key: 38 } },
  { name: 'abby-cu', members: [['abby', 0, 0, 0.3]], cam: { bone: 'head', bid: 'abby', dy: 0.025, dz: 0.03, dist: 0.85, el: 1, fov: 24, fstop: 2.8, key: 58 } },
  { name: 'alexandria', members: [['alexandria', 0, 0, -0.75]], cam: { y: 1.2, dist: 3.6, el: 3, fov: 30, fstop: 4, key: 30 } },
  { name: 'king', members: [['king', 0, 0, 0.2]], cam: { y: 1.4, dist: 2.6, el: 1, fov: 30, fstop: 3.5, key: 40 } },
  {
    name: 'crowd',
    members: [['crowd01', -1.6, 0.4, 0.5], ['crowd02', -0.8, -0.3, 0.2], ['crowd04', 0.1, 0.5, -0.2], ['crowd05', 0.9, -0.2, -0.3],
      ['crowd07', 1.8, 0.35, -0.5], ['crowd08', -2.2, -1.0, 0.8], ['crowd11', -0.4, -1.3, 0.1], ['crowd12', 0.9, -1.5, -0.4], ['crowd14', 2.0, -1.0, -0.9]],
    cam: { y: 1.25, dist: 7.0, el: 4, fov: 34, fstop: 5.6, key: 45 },
    ground: 'pbr/ph_floor_pebbles_01',
  },
  { name: 'abby-sling', members: [['abby_sling', 0, 0, 0.35]], cam: { y: 1.25, dist: 2.4, el: 2, fov: 30, fstop: 3.5, key: 40 } },
  { name: 'abby-injured', members: [['abby_injured', 0, 0, 0.3]], cam: { y: 1.25, dist: 2.4, el: 2, fov: 30, fstop: 3.5, key: 40 } },
  { name: 'fall', members: [['fall', 0, 0, -0.3]], cam: { y: 1.42, dist: 2.7, el: 1, fov: 30, fstop: 3.5, key: 36 } },
];
const SPACING = 40;

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const rot = -1.0;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: rot, backgroundBlurriness: 0.0 });
  const sun = sky.apply(scene);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0001; sun.shadow.normalBias = 0.006;
  scene.add(sun, sun.target);
  // worldSize = the metres UV 0..1 covers (the whole plane): the scan keeps its real scale
  const GW = SPACING * SHOTS.length + 200, GH = 200;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), await groundMaterial('pbr/acg_ground03', ctx, [GW, GH]));
  ground.rotation.x = -Math.PI / 2; ground.position.x = SPACING * (SHOTS.length - 1) / 2; ground.receiveShadow = true;
  scene.add(ground);
  const sunDir = sky.sun.direction.clone().normalize();
  const sunAz = Math.atan2(sunDir.x, sunDir.z);
  const ids = [...new Set(SHOTS.flatMap((s) => s.members.map((m) => m[0])))];
  const chars = {};
  await Promise.all(ids.map(async (id) => { chars[id] = []; }));
  const shots = [];
  for (const [k, sh] of SHOTS.entries()) {
    const cx = k * SPACING;
    // camera azimuth: the sun sits `key` degrees off the lens axis
    const camAz = sunAz - (sh.cam.key * Math.PI) / 180;
    const members = [];
    for (const [id, x, z, yo] of sh.members) {
      let ch;
      try { ch = await loadCharacter(id); } catch (e) { console.warn(`humans-hero: ${id} not built yet`); continue; }
      // local layout: x across the frame, z toward the camera
      const right = new THREE.Vector3(Math.cos(camAz), 0, -Math.sin(camAz)), toward = new THREE.Vector3(Math.sin(camAz), 0, Math.cos(camAz));
      const p = new THREE.Vector3(cx, 0, 0).addScaledVector(right, x).addScaledVector(toward, z);
      placeCharacter(ch, p.x, 0, p.z, camAz + yo);
      scene.add(ch.root);
      members.push(ch);
    }
    if (sh.ground) {
      const pm = await loadPBR(sh.ground, ctx, { worldSize: 15 });
      const patch = new THREE.Mesh(new THREE.CircleGeometry(7.5, 64), pm);
      patch.rotation.x = -Math.PI / 2; patch.position.set(cx, 0.004, 0); patch.receiveShadow = true;
      scene.add(patch);
    }
    shots.push({ ...sh, cx, camAz, members });
  }
  S = { sun, sunDir, shots };
}

const _v = new THREE.Vector3();
export function update(t, ctx) {
  const { camera } = ctx;
  const k = Math.min(S.shots.length - 1, Math.max(0, Math.floor(t)));
  const sh = S.shots[k];
  for (const s of S.shots) for (const ch of s.members) {
    // only this shot's people exist (a low sun reaches across 40 m: Abby's shadow fell into
    // Alexandria's frame)
    ch.root.visible = s === sh;
    applyIdle(ch, t + s.cx * 0.01, { amount: s === sh ? 1 : 0, blink: false });
  }
  const c = sh.cam;
  const tgt = new THREE.Vector3(sh.cx, c.y ?? 1.3, 0);
  if (c.bone) {
    const ch = sh.members.find((m) => m.id === c.bid) || sh.members[0];
    if (ch) ch.bone(c.bone).getWorldPosition(tgt);
    tgt.y += c.dy ?? 0;
    tgt.addScaledVector(new THREE.Vector3(Math.sin(sh.camAz), 0, Math.cos(sh.camAz)), c.dz ?? 0);
  }
  const el = (c.el * Math.PI) / 180;
  camera.position.set(tgt.x + c.dist * Math.cos(el) * Math.sin(sh.camAz), tgt.y + c.dist * Math.sin(el), tgt.z + c.dist * Math.cos(el) * Math.cos(sh.camAz));
  camera.lookAt(tgt);
  camera.fov = c.fov; camera.near = 0.03; camera.far = 400;
  camera.updateProjectionMatrix();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = c.fstop; ctx.lens.focus = camera.position.distanceTo(tgt); ctx.lens.shutterAngle = 45; }
  // sun shadow frustum around this group
  const { sun, sunDir } = S;
  const g = new THREE.Vector3(sh.cx, 1.0, 0);
  sun.target.position.copy(g);
  sun.position.copy(g).addScaledVector(sunDir, 40);
  const r = sh.members.length > 3 ? 4.5 : 1.8;
  const sc = sun.shadow.camera;
  sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 20; sc.far = 60;
  sc.updateProjectionMatrix();
  sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
  void _v;
}
