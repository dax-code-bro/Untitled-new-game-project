// Contact sheet / turntable of every Episode 1 creature (PROVISIONAL designs) under one
// neutral daylight sky: Poly Haven kloofendal_48d_partly_cloudy (CC0), its sun extracted into
// a shadow-casting light, on plain photographed ground. The camera stays put relative to the
// sun (sun from the front-left of the camera, 48 degrees up) and the creature turns on a
// turntable, so every view is lit the same way:
//   t = 0..3 Charcoal, 4..7 Leaf, 8..11 Starlight, 12..15 hatchling, 16..19 scout
//   (each: front 3/4, left side, rear 3/4, right side), 20 the scale lineup with a person,
//   21-23 Charcoal, Leaf and Starlight gliding with the wings spread (seen from above-front).
//   (No species: every dragon is its own design - DRAGONS.md.)
//   node render/render.mjs scenes/lookdev/creatures-contact.js --preset final --fps 1 --workers 1 --out output/creatures-contact
// then tile the 21 frames (README in scenes/lib/creatures/ has the ffmpeg line).
import * as THREE from 'three';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { createCreature, poses } from '../lib/creatures/index.js';

const NAMES = ['charcoal', 'leaf', 'starlight', 'hatchling', 'scout'];
const VIEWS = [{ yaw: 35, el: 0.16 }, { yaw: 90, el: 0.1 }, { yaw: 145, el: 0.2 }, { yaw: -90, el: 0.1 }];
const D2R = Math.PI / 180;

export const meta = {
  title: 'Creature contact sheet (provisional designs)', duration: NAMES.length * 4 + 1 + 3, seed: 3,
  cinematic: { grade: { toneMapping: 'agx', look: 'print', exposure: 0.2 }, grain: { amount: 0.8 }, bloom: { intensity: 0.01 },
    motionBlur: { mode: 'off' }, dof: { enabled: false }, atmosphere: { enabled: true, sky: 'scene', haze: 0.8 } },
};

const S = { C: {}, sun: null, sunDir: null, human: null };

export async function setup(ctx) {
  const { scene, quality } = ctx;
  const q = ctx.preset === 'final' ? 'hero' : ctx.preset === 'preview' ? 'standard' : 'draft';
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: -1.2, horizonFill: { above: 4, below: -2, blend: 2 } });
  const sun = sky.apply(scene);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  sun.shadow.bias = -0.0002;
  scene.add(sun, sun.target);
  S.sun = sun; S.sunDir = sky.sun.direction.clone();
  const gm = await loadPBR('pbr/acg_ground13', ctx, { worldSize: 4000 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2000, 192), gm);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  for (const n of NAMES) {
    const c = await createCreature(n, { quality: q });
    c.root.visible = false;
    scene.add(c.root);
    S.C[n] = c;
  }
  // a person for scale in the lineup (the humans library's cast build, else a simple figure)
  try {
    const H = await import('../lib/humans/index.js');
    S.human = await H.loadCharacter('remi');
    S.place = (x, z, yaw) => H.placeCharacter(S.human, x, 0, z, yaw);
  } catch (e) {
    const fig = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.25, 6, 12), new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.8 }));
    fig.position.y = 0.85;
    S.human = { root: new THREE.Group().add(fig) };
    S.place = (x, z, yaw) => { S.human.root.position.set(x, 0, z); S.human.root.rotation.y = yaw; };
  }
  S.human.root.visible = false;
  scene.add(S.human.root);
}

function poseFor(c, name) {
  if (name === 'hatchling') return poses.lie(c, { t: 0, blink: false, sprawl: 1, raise: -0.5, headDown: 0.2, look: [0.2, -0.08], lidRelax: 0.3 });
  if (name === 'leaf') return poses.sit(c, { t: 0, blink: false, look: [0.2, -0.05] });
  if (name === 'scout') return poses.glide(c, { t: 0, blink: false, bank: 0, dihedral: 0.08 });   // seen in flight only
  return poses.stand(c, { t: 0, blink: false, look: [0.15, -0.02] });
}
const AIR = { scout: 0.35 };

export function update(t, ctx) {
  const { camera } = ctx;
  const k = Math.max(0, Math.min(NAMES.length * 4 + 3, Math.round(t)));   // frame time (sub-frames never cross views)
  const GLIDE = ['charcoal', 'leaf', 'starlight'];
  const sunAz = Math.atan2(S.sunDir.x, S.sunDir.z);
  // the camera looks along +z' where the sun comes from 40 degrees to its left and is in front
  const camAz = sunAz + Math.PI + 40 * D2R;
  const fwd = new THREE.Vector3(Math.sin(camAz), 0, Math.cos(camAz));
  for (const n of NAMES) S.C[n].root.visible = false;
  S.human.root.visible = false;
  let center, size;
  if (k < NAMES.length * 4) {
    const n = NAMES[Math.floor(k / 4)], v = VIEWS[k % 4];
    const c = S.C[n];
    c.root.visible = true;
    c.root.position.set(0, (AIR[n] ?? 0) * c.L, 0);
    // turntable: the creature turns, the camera and the sun stay
    c.root.rotation.set(0, camAz + Math.PI - v.yaw * D2R, 0);
    c.setPose(poseFor(c, n));
    c.root.updateMatrixWorld(true);
    const box = boundsOf(c);
    center = box.getCenter(new THREE.Vector3());
    size = box.getSize(new THREE.Vector3());
    const r = 0.5 * Math.max(size.x, size.z, size.y * 1.6);
    const dist = r / Math.tan(15 * D2R) * 0.78;
    camera.position.copy(center).addScaledVector(fwd, -dist);
    camera.position.y = center.y + dist * Math.sin(v.el) + size.y * 0.1;
    camera.fov = 32;
    camera.lookAt(center);
  } else if (k > NAMES.length * 4) {
    // wings spread: a gliding pose, the camera above and in front (both wings in view)
    const n = GLIDE[k - NAMES.length * 4 - 1];
    const c = S.C[n];
    c.root.visible = true;
    c.root.position.set(0, 0.6 * c.L, 0);
    c.root.rotation.set(0, camAz + Math.PI - 30 * D2R, 0);
    c.setPose(poses.glide(c, { t: 0, blink: false, bank: 0, dihedral: 0.1 }));
    c.root.updateMatrixWorld(true);
    const box = boundsOf(c);
    center = box.getCenter(new THREE.Vector3());
    size = box.getSize(new THREE.Vector3());
    const r = 0.5 * Math.max(size.x, size.z, size.y * 1.6);
    const dist = r / Math.tan(15 * D2R) * 0.8;
    camera.position.copy(center).addScaledVector(fwd, -dist * 0.85);
    camera.position.y = center.y + dist * 0.5;
    camera.fov = 32;
    camera.lookAt(center);
  } else {
    // lineup: Starlight, Charcoal, Leaf, scout, hatchling and a person, side by side
    const order = ['starlight', 'charcoal', 'leaf', 'scout', 'hatchling'];
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    let x = 0;
    const gap = 6;
    for (const n of order) {
      const c = S.C[n];
      c.root.visible = true;
      c.setPose(n === 'leaf' ? poses.stand(c, { t: 0, blink: false }) : poseFor(c, n));
      // side on to the camera, heads to the left of frame
      c.root.rotation.set(0, Math.atan2(-side.x, -side.z), 0);
      const p = side.clone().multiplyScalar(-(x + c.L * 0.5));
      c.root.position.copy(p);
      x += c.L + gap;
    }
    const hp = side.clone().multiplyScalar(-(x + 1));
    S.human.root.visible = true;
    S.place(hp.x, hp.z, Math.atan2(-fwd.x, -fwd.z));
    const total = x + 2;
    center = side.clone().multiplyScalar(-total * 0.5).setY(9);
    const dist = total * 0.5 / Math.tan(24 * D2R);
    camera.position.copy(center).addScaledVector(fwd, -dist);
    camera.position.y = 4;
    camera.fov = 30;
    camera.lookAt(center.clone().setY(10));
    size = new THREE.Vector3(total, 20, 60);
  }
  camera.near = Math.max(0.01, camera.position.distanceTo(center) * 0.02);
  camera.far = 20000;
  camera.updateProjectionMatrix();
  // the sun's shadow around the subject
  const R = Math.max(size.x, size.y, size.z) * 0.8;
  S.sun.target.position.copy(center);
  S.sun.position.copy(center).addScaledVector(S.sunDir, R * 4);
  Object.assign(S.sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: R, far: R * 8 });
  S.sun.shadow.normalBias = R * 0.0012;
  S.sun.shadow.camera.updateProjectionMatrix();
  S.sun.target.updateMatrixWorld();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.focus = null; }
  if (ctx.cinematic?.ao) ctx.cinematic.ao.radius = Math.max(0.01, R * 0.03);
}

/** World bounds of a posed creature (every 7th skinned vertex of the body and the membranes). */
function boundsOf(c) {
  const box = new THREE.Box3(), v = new THREE.Vector3();
  for (const m of [c.meshes[0], ...(c.membranes || [])]) {
    const n = m.geometry.attributes.position.count;
    for (let i = 0; i < n; i += 7) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); box.expandByPoint(v); }
  }
  return box;
}
