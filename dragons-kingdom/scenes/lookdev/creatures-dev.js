// Creature look-development scene for quick iteration (several views per run).
// Reads creatures-dev.json next to this file:
//   { creatures: [{ name, quality, at:[x,y,z] (m), yaw (deg), rider?, tack?, scale? }],
//     humans: [{ outfit, at:[x,y,z], yaw }],
//     hdri, rotationY, exposure, ground: true|false, groundPBR,
//     views: [{ subject: i, cam:[x,y,z], target:[x,y,z] (both in the subject's L, relative to it),
//               fov, poses: { "<i>": { name, ...opts } }, airborne: { "<i>": y in L } }] }
// View i is shown for t in [i, i+1); render all views of one build with
//   node render/render.mjs scenes/lookdev/creatures-dev.js --preset preview --fps 1 --seconds N --workers 1 --out <dir>
import * as THREE from 'three';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { createCreature, CREATURES, SPECIES, poses, loadHuman, createRider, createSaddle, mountRider } from '../lib/creatures/index.js';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = isObj(v) && isObj(a[k]) ? merge(a[k], v) : v; return o; };

export const meta = {
  title: 'Creature lookdev (dev)', duration: 30, toneMapping: 'aces', exposure: 0.62, vignette: 0.05, seed: 1,
  cinematic: { grade: { toneMapping: 'agx', look: 'cinema' }, grain: { amount: 0.25 }, bloom: { intensity: 0.008 }, motionBlur: { mode: 'off' }, dof: { enabled: false } },
};

let cfg = null;
const C = [];
const H = [];
let sun = null, sunDir = null;

export async function setup(ctx) {
  cfg = await (await fetch(new URL('./creatures-dev.json', import.meta.url))).json();
  if (cfg.exposure) ctx.post.exposure = cfg.exposure;
  const sky = await loadHDRI(cfg.hdri || 'hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: cfg.rotationY ?? -1.2, backgroundBlurriness: 0.05 });
  sun = sky.apply(ctx.scene);
  sunDir = sky.sun.direction.clone();
  sun.castShadow = true;
  sun.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize);
  sun.shadow.bias = -0.0002;
  ctx.scene.add(sun, sun.target);
  if (cfg.ground !== false) {
    const gm = await loadPBR(cfg.groundPBR || 'pbr/acg_ground13', ctx, { worldSize: 1600 });
    const g = new THREE.Mesh(new THREE.CircleGeometry(800, 128), gm);
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    ctx.scene.add(g);
  }
  ctx.scene.fog = new THREE.Fog(new THREE.Color(0.62, 0.66, 0.72), 400, 2000);
  const needHuman = (cfg.creatures || []).some((c) => c.rider || c.tack) || (cfg.humans || []).length;
  const human = needHuman ? await loadHuman() : null;
  for (const cc of cfg.creatures) {
    // "variant": { "patch": { ...species fields } } builds a modified copy of the species (A/B design tests)
    let which = cc.name;
    if (cc.variant) {
      const base = CREATURES[cc.name];
      const sp = `dev_${C.length}`;
      SPECIES[sp] = merge(SPECIES[base.species], cc.variant.patch || {});
      for (const k of ['neckPitch', 'headPitch', 'tailDroop']) if (cc.variant.patch && cc.variant.patch[k + 'Deg'] !== undefined) SPECIES[sp][k] = cc.variant.patch[k + 'Deg'] * Math.PI / 180;
      which = { ...base, name: `${cc.name}_v${C.length}`, species: sp, ...(cc.variant.cfg || {}) };
    }
    const c = await createCreature(which, { quality: cc.quality || 'draft', look: cc.look || cfg.look, drape: cc.drape, log: (s) => console.log(s) });
    ctx.scene.add(c.root);
    if (cc.tack || cc.rider) {
      const tack = createSaddle(c, {});
      if (cc.rider) mountRider(c, tack, createRider(human, { outfit: cc.rider, lean: 0.12 }));
    }
    C.push({ c, cc });
  }
  for (const hh of cfg.humans || []) {
    const h = createRider(human, { outfit: hh.outfit, pose: hh.pose || 'stand', headPitch: hh.headPitch ?? 0 });
    ctx.scene.add(h.root);
    H.push({ h, hh });
  }
}

export function update(t, ctx) {
  const views = cfg.views;
  const vi = Math.max(0, Math.min(views.length - 1, Math.round(t)));
  const v = views[vi];
  C.forEach(({ c, cc }, i) => {
    const po = (v.poses && v.poses[i]) || cc.pose || { name: 'stand' };
    c.root.visible = !(v.hide || []).includes(i);
    c.root.position.set(...(cc.at || [0, 0, 0]));
    // face: yaw relative to the sun's azimuth (deg, 0 = facing the sun), as in creatures-shots.js
    const sunAz = Math.atan2(sunDir.x, sunDir.z);
    const face = (v.face && v.face[i]) ?? cc.face;
    c.root.rotation.set(0, face !== undefined ? sunAz + face * Math.PI / 180 : ((v.yaw && v.yaw[i]) ?? cc.yaw ?? 0) * Math.PI / 180, 0);
    if (c.detachable) c.attachWing();
    c.setPose(poses[po.name](c, { blink: false, ...po, t: po.t ?? 0 }));
    const air = (v.airborne && v.airborne[i]) ?? cc.airborne;
    if (air) c.root.position.y += air * c.L;
    if (cc.scale) c.root.scale.setScalar(cc.scale);
  });
  H.forEach(({ h, hh }) => {
    h.root.position.set(hh.at[0], hh.at[1] + 0.88, hh.at[2]);
    h.root.rotation.y = (hh.yaw ?? 0) * Math.PI / 180;
    h.root.visible = !(v.hideHumans);
  });
  const S = C[v.subject ?? 0];
  const L = S.c.L * (S.cc.scale || 1);
  let base = S.c.root.position.clone();
  if (v.bone) {
    // camera relative to a bone (head close-ups): bone position, offsets in the root's frame
    S.c.root.updateMatrixWorld(true);
    base = new THREE.Vector3().setFromMatrixPosition(S.c.bones[S.c.boneIndex[v.bone]].matrixWorld);
  }
  const rq = S.c.root.quaternion;
  const off = (a) => new THREE.Vector3(a[0] * L, a[1] * L, a[2] * L).applyQuaternion(rq);
  const cam = ctx.camera;
  const tgt = base.clone().add(off(v.target));
  cam.position.copy(v.bone ? tgt.clone().add(off(v.cam)) : base.clone().add(off(v.cam)));
  cam.lookAt(tgt);
  cam.fov = v.fov ?? 35;
  const d = cam.position.distanceTo(tgt);
  cam.near = Math.max(0.005, d * 0.01); cam.far = Math.max(3000, L * 80);
  cam.updateProjectionMatrix();
  // shadow frustum around the target
  const r = v.shadowR ? v.shadowR * L : L * 0.9;
  sun.target.position.copy(tgt).setY(Math.max(0, tgt.y * 0.4));
  sun.position.copy(sun.target.position).addScaledVector(sunDir, r * 4);
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: r, far: r * 8 });
  sun.shadow.normalBias = r * 0.0012;
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.updateMatrixWorld();
  if (ctx.cinematic?.ao) ctx.cinematic.ao.radius = Math.max(0.02, L * 0.04);
}
