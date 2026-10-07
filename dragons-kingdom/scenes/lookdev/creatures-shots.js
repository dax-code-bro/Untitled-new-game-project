// Hero look-development shots for the Episode 1 creatures (PROVISIONAL designs).
// Used by creatures-turntable.js (every shot) and the per-creature wrappers
// (creatures-turntable-<name>.js), which build only what their shots need.
//
// Every shot is lit by one photographed sky (Poly Haven kloofendal_48d_partly_cloudy,
// CC0; its sun is extracted into a shadow-casting light with the measured energy).
// Shots are composed relative to that sun so the key light rakes across the scales
// the way a camera crew would place it. Sets: 'field' (CC0 photo turf), 'air' (the
// sky and the photographed land far below, with aerial haze), 'bed' (a linen sheet
// over planks, the newborn hatchling macro). Every frame is a pure function of t.
import * as THREE from 'three';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { createCreature, poses, loadHuman, createRider, createSaddle, mountRider } from '../lib/creatures/index.js';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

// cam: orbit around the subject's target point (units of the subject's L unless metres:true):
//   az (deg, 0 = in front of the creature, +90 = its left side), el (deg), dist, fov (deg), fstop.
// face: the creature's facing relative to the sun's azimuth (deg; 0 = facing the sun).
export const SHOTS = [
  { id: 'charcoal-front', set: 'field', creatures: ['charcoal'], humans: [{ outfit: 'remi', rel: 'charcoal', at: [0.06, 0, 0.35], yaw: 160 }], dur: 4,
    face: -95, pose: { charcoal: { name: 'stand', look: [0.32, 0.02] } },
    cam: { subject: 'charcoal', target: [0.0, 0.14, 0.15], az: 34, el: 4, dist: 0.92, fov: 34, fstop: 8 } },
  { id: 'charcoal-head', set: 'field', creatures: ['charcoal'], dur: 3, face: -95, pose: { charcoal: { name: 'stand', look: [0.32, 0.02] } },
    cam: { subject: 'charcoal', bone: 'head', target: [0, -0.012, 0.045], az: 40, el: 6, dist: 0.2, fov: 30, fstop: 5.6, focusOn: 'eye_L' } },
  { id: 'charcoal-flight', set: 'air', creatures: ['charcoal'], dur: 3, airborne: 6, face: -100, pose: { charcoal: { name: 'flight', phase: 0.54, look: [0, 0.05] } },
    cam: { subject: 'charcoal', target: [0, 0.0, 0.02], az: 90, el: 4, dist: 1.6, fov: 32, fstop: 8, shutter: 180 } },
  { id: 'leaf-abby', set: 'field', creatures: ['leaf'], tack: ['leaf'], humans: [{ outfit: 'abby', rel: 'leaf', at: [-0.17, 0, 0.26], yaw: 140 }], dur: 4,
    face: -100, pose: { leaf: { name: 'sit', look: [-0.45, -0.1] } },
    cam: { subject: 'leaf', target: [-0.02, 0.15, 0.15], az: 38, el: 3, dist: 0.95, fov: 34, fstop: 5.6 } },
  { id: 'leaf-flight', set: 'air', creatures: ['leaf'], riders: { leaf: 'abby' }, dur: 3, airborne: 20, face: -110, pose: { leaf: { name: 'flight', corr: 1, phase: 0.72, look: [-0.2, 0.05] } },
    cam: { subject: 'leaf', target: [0, 0.0, 0.05], az: 55, el: 14, dist: 1.5, fov: 36, fstop: 8, shutter: 180 } },
  { id: 'starlight-below', set: 'air', creatures: ['starlight'], humans: [{ outfit: 'fall', below: true }], dur: 3, airborne: 5, face: 160, haze: 2.5,
    pose: { starlight: { name: 'glide', bank: -0.16, dihedral: 0.14, look: [0.1, -0.12] } },
    cam: { subject: 'starlight', target: [0, 0, 0.05], az: 160, el: -36, dist: 7.0, fov: 30, fstop: 11, ground: 1.2 } },
  { id: 'starlight-side', set: 'air', creatures: ['starlight'], dur: 3, airborne: 5, face: -110, pose: { starlight: { name: 'glide', bank: 0.12, look: [0.05, -0.05] } },
    cam: { subject: 'starlight', target: [0, 0.0, 0.05], az: 70, el: 8, dist: 1.35, fov: 34, fstop: 8 } },
  { id: 'hatchling-macro', set: 'bed', creatures: ['hatchling'], dur: 3, face: -60,
    pose: { hatchling: { name: 'lie', raise: -0.12, headDown: 0.18, look: [0.35, -0.05], lidRelax: 0.62, breathe: 0.5 } },
    cam: { subject: 'hatchling', bone: 'head', target: [0, -0.02, 0.02], az: 48, el: 14, dist: 0.85, fov: 28, fstop: 4, focusOn: 'eye_L' } },
  { id: 'scout-bank', set: 'air', creatures: ['scout'], dur: 3, airborne: 30, face: -130, pose: { scout: { name: 'glide', bank: 0.85, look: [0.3, 0.0], dihedral: 0.05 } },
    cam: { subject: 'scout', target: [0, 0.0, 0.05], az: 120, el: 16, dist: 1.25, fov: 34, fstop: 8, shutter: 180 } },
  { id: 'scout-wingloss', set: 'air', creatures: ['scout'], dur: 4, airborne: 30, face: -130, detachAt: 0.5, pose: { scout: { name: 'flight' } },
    cam: { subject: 'scout', target: [0, -0.05, 0.05], az: 125, el: 10, dist: 1.9, fov: 36, fstop: 8, shutter: 180 } },
  { id: 'lineup', set: 'field', creatures: ['leaf', 'charcoal', 'starlight'], humans: [{ outfit: 'remi', lineup: true }], dur: 3, lineup: true,
    pose: { leaf: { name: 'stand', look: [-0.2, 0] }, charcoal: { name: 'stand', look: [-0.1, 0] }, starlight: { name: 'stand', look: [-0.15, 0] } },
    cam: { subject: 'lineup' } },
];

/** Build a scene module for the given shot ids (default: all). */
export function makeTurntable(opts = {}) {
  const shots = SHOTS.filter((s) => !opts.only || opts.only.includes(s.id)).map((s) => ({ ...s, ...(opts.step ? { dur: opts.step } : {}) }));
  let start = 0;
  for (const s of shots) { s._start = start; start += s.dur; }
  const total = start;
  const need = [...new Set(shots.flatMap((s) => s.creatures))];
  const needSets = new Set(shots.map((s) => s.set));
  const S = { C: {}, riders: {}, tacks: {}, humans: [], sun: null, sunDir: null, ground: null, bed: null };

  const meta = {
    title: opts.title || 'Creature hero shots (provisional designs)', duration: total, toneMapping: 'aces', exposure: 0.62, vignette: 0.1, seed: 7,
    // cinematic stack (runtime/cinematic): GTAO + contact shadows, physical DOF, motion blur from
    // the real shutter, aerial haze from the photographed sky, filmic grade, lens effects, grain
    cinematic: opts.cinematic ?? {
      atmosphere: { enabled: true, sky: 'scene', haze: 1.4, apDistanceScale: 1.0 },
      grade: { toneMapping: 'agx', look: 'print', exposure: 0.25 }, grain: { amount: 1.6, size: 1.2 }, bloom: { intensity: 0.012 },
      lensFx: { vignette: 0.6, chromaticAberration: 0.3 },
    },
  };

  async function setup(ctx) {
    const { scene, quality } = ctx;
    const q = opts.quality || (ctx.preset === 'final' || ctx.preset === 'final-fast' ? 'hero' : ctx.preset === 'preview' ? 'standard' : 'draft');
    // the photographer's horizon (a suburb) is matte-painted out with a haze band (assets.js horizonFill)
    const sky = await loadHDRI(opts.hdri || 'hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: opts.hdriRotation ?? -1.2, backgroundBlurriness: 0.0, horizonFill: { above: 4, below: -2, blend: 2 } });
    const sun = sky.apply(scene);
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    sun.shadow.bias = -0.0002;
    scene.add(sun, sun.target);
    S.sun = sun; S.sunDir = sky.sun.direction.clone();
    S.sunAz = Math.atan2(S.sunDir.x, S.sunDir.z);
    console.log('[creatures] sun dir', S.sunDir.toArray().map((v) => v.toFixed(3)).join(','), 'az', (S.sunAz / D2R).toFixed(1), 'el', (Math.asin(S.sunDir.y) / D2R).toFixed(1));
    {
      // open grass land to the horizon (the air shots fly 150-250 m above it, hazed by the atmosphere)
      const groundMat = await loadPBR('pbr/acg_ground13', ctx, { worldSize: 16000 });
      breakTiling(groundMat);
      const ground = new THREE.Mesh(new THREE.CircleGeometry(9000, 256), groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);
      S.ground = ground;
    }
    if (needSets.has('bed')) S.bed = await buildBed(ctx);
    // creatures
    for (const name of need) {
      const c = await createCreature(name, { quality: q, log: (m) => console.log(m) });
      scene.add(c.root);
      c.root.visible = false;
      S.C[name] = c;
    }
    const needHuman = shots.some((s) => (s.humans && s.humans.length) || s.riders || s.tack);
    const human = needHuman ? await loadHuman() : null;
    for (const s of shots) {
      for (const n of s.tack || []) if (!S.tacks[n]) S.tacks[n] = createSaddle(S.C[n], {});
      for (const [n, outfit] of Object.entries(s.riders || {})) {
        if (S.riders[n]) continue;
        const tack = S.tacks[n] || (S.tacks[n] = createSaddle(S.C[n], {}));
        const rider = createRider(human, { outfit, lean: 0.12 });
        mountRider(S.C[n], tack, rider);
        S.riders[n] = { tack, rider };
      }
      s._humans = (s.humans || []).map((h) => {
        const r = createRider(human, { outfit: h.outfit, pose: 'stand', headPitch: h.headPitch ?? (h.below ? -0.6 : -0.1) });
        r.root.visible = false;
        scene.add(r.root);
        S.humans.push(r.root);
        return { ...h, r };
      });
    }
    console.log('[creatures] built', Object.entries(S.C).map(([n, c]) => `${n}: ${c.stats.vertices} v, ${c.stats.buildMs} ms`).join('; '));
  }

  const _v = new THREE.Vector3();
  const camFocus = new THREE.Vector3();

  function update(t, ctx) {
    const { camera, scene } = ctx;
    let shot = shots[shots.length - 1];
    for (const s of shots) if (t >= s._start && t < s._start + s.dur) { shot = s; break; }
    const lt = t - shot._start;
    // visibility
    for (const [n, c] of Object.entries(S.C)) c.root.visible = shot.creatures.includes(n);
    for (const h of S.humans) h.visible = false;
    for (const h of shot._humans || []) h.r.root.visible = true;
    for (const [n, tk] of Object.entries(S.tacks)) for (const m of tk.meshes) m.visible = (shot.tack || []).includes(n) || !!(shot.riders && shot.riders[n]);
    for (const [n, r] of Object.entries(S.riders)) r.rider.root.visible = !!(shot.riders && shot.riders[n]);
    if (S.bed) S.bed.visible = shot.set === 'bed';
    if (ctx.cinematic?.atmosphere) ctx.cinematic.atmosphere.haze = shot.haze ?? 1.4;

    // ---------------------------------------------------------- poses
    const faceYaw = S.sunAz + (shot.face ?? 0) * D2R;
    for (const n of shot.creatures) {
      const c = S.C[n];
      const po = shot.pose[n] || { name: 'stand' };
      c.root.position.set(0, 0, 0);
      c.root.rotation.set(0, shot.lineup ? 0 : faceYaw, 0);
      if (c.detachable) c.attachWing();
      c.setPose(poses[po.name](c, { ...po, t: lt + (po.t0 ?? 0) }));
      if (shot.set === 'bed') c.root.position.y = S.bed.userData.top;
      if (shot.airborne) c.root.position.y = shot.airborne * c.L;
    }
    // scout: the LEFT wing tears away at detachAt and tumbles; the body rolls toward the lost side
    if (shot.detachAt !== undefined) {
      const c = S.C.scout;
      const td = shot.detachAt;
      if (lt >= td) {
        c.setPose(poses.flight(c, { t: td }));
        c.root.updateMatrixWorld(true);
        const M0 = c.detachable.rootBone.matrixWorld.clone();
        const dt = lt - td;
        c.setPose(poses.flight(c, { t: lt, bank: 0.6 * dt + 0.25, amp: 0.55 }));
        const fwd = new THREE.Vector3(Math.sin(faceYaw), 0, Math.cos(faceYaw));
        c.root.position.y = shot.airborne * c.L - 0.5 * 9.81 * dt * dt * 0.35;
        c.root.position.addScaledVector(fwd, 9 * dt);
        c.root.rotateZ(1.6 * dt);
        // the wing: ballistic, tumbling, falling back in the wake
        const side = new THREE.Vector3(Math.cos(faceYaw), 0, -Math.sin(faceYaw));
        const g = side.multiplyScalar(1.2 * dt).addScaledVector(fwd, -3 * dt).add(new THREE.Vector3(0, -0.5 * 9.81 * dt * dt * 0.3, 0));
        const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(2.2 * dt, 0.8 * dt, 2.9 * dt));
        _v.setFromMatrixPosition(M0);
        const M = new THREE.Matrix4().compose(_v.clone().add(g), new THREE.Quaternion().setFromRotationMatrix(M0).premultiply(spin), new THREE.Vector3(1, 1, 1));
        c.detachWing(scene, M);
        // the torn wing goes limp: half folded
        for (const n of ['w_L_1', 'w_L_2']) { const b = c.bones[c.boneIndex[n]]; b.quaternion.setFromEuler(new THREE.Euler(0, n === 'w_L_1' ? -0.9 : 0.8, 0.3)); }
      }
    }
    // lineup: side by side on one ground line, all facing camera-right, a person for scale
    if (shot.lineup) {
      let x = 0;
      const gap = 5;
      for (const n of ['leaf', 'charcoal', 'starlight']) {
        const c = S.C[n];
        c.root.rotation.y = Math.PI / 2;
        c.root.position.set(x + c.L * 0.45, 0, 0);
        x += c.L * 1.0 + gap;
      }
    }
    // people
    for (const h of shot._humans || []) {
      if (h.lineup) { h.r.root.position.set(-3, 0.88, 5); h.r.root.rotation.y = Math.PI / 2 + 0.4; continue; }
      if (h.below) continue;     // placed with the camera below
      const c = S.C[h.rel];
      const p = new THREE.Vector3(h.at[0] * c.L, 0, h.at[2] * c.L).applyAxisAngle(new THREE.Vector3(0, 1, 0), c.root.rotation.y).add(c.root.position);
      h.r.root.position.set(p.x, 0.88, p.z);
      h.r.root.rotation.y = c.root.rotation.y + (h.yaw ?? 180) * D2R;
    }

    // ---------------------------------------------------------- camera
    const cm = shot.cam;
    if (cm.subject === 'lineup') {
      const L = S.C.starlight.L;
      const xs = S.C.leaf.L * 0.45 + 55;
      camera.position.set(xs, 15, 150);
      camera.lookAt(xs + 4, 13, 0);
      camera.fov = 34;
      camera.near = 0.5; camera.far = 6000;
      fitShadow(S, new THREE.Vector3(xs, 10, 0), L * 1.4);
      camFocus.set(xs, 10, 0);
    } else {
      const c = S.C[cm.subject];
      const L = c.L;
      c.root.updateMatrixWorld(true);
      let target;
      if (cm.bone) target = new THREE.Vector3().setFromMatrixPosition(c.bones[c.boneIndex[cm.bone]].matrixWorld);
      else target = c.root.position.clone();
      target.add(new THREE.Vector3(...cm.target).multiplyScalar(L).applyAxisAngle(new THREE.Vector3(0, 1, 0), c.root.rotation.y));
      const az = c.root.rotation.y + cm.az * D2R, el = cm.el * D2R;
      const d = cm.dist * L;
      camera.position.set(target.x + d * Math.cos(el) * Math.sin(az), target.y + d * Math.sin(el), target.z + d * Math.cos(el) * Math.cos(az));
      if (cm.ground !== undefined) camera.position.y = cm.ground;       // a camera standing on the ground, looking up
      camera.lookAt(target);
      camera.fov = cm.fov;
      camera.near = Math.max(0.01, d * 0.01);
      camera.far = Math.max(6000, L * 80);
      fitShadow(S, target.clone(), L * (cm.bone ? 0.4 : 0.9));
      camFocus.copy(target);
      if (cm.focusOn) camFocus.setFromMatrixPosition(c.bones[c.boneIndex[cm.focusOn]].matrixWorld);
    }
    camera.updateProjectionMatrix();
    // a person on the ground near the camera, looking up at the dragon (scale)
    for (const h of shot._humans || []) {
      if (!h.below) continue;
      const fw = new THREE.Vector3(); camera.getWorldDirection(fw); fw.y = 0; fw.normalize();
      const rt = new THREE.Vector3(-fw.z, 0, fw.x);
      const p = camera.position.clone().addScaledVector(fw, 4.2).addScaledVector(rt, 1.1);
      h.r.root.position.set(p.x, 0.88, p.z);
      h.r.root.rotation.y = Math.atan2(fw.x, fw.z);
    }
    if (ctx.lens) {
      ctx.lens.focalLength = null;
      ctx.lens.fstop = cm.fstop ?? 8;
      ctx.lens.focus = camera.position.distanceTo(camFocus);
      ctx.lens.shutterAngle = cm.shutter ?? 45;
    }
    if (ctx.cinematic?.ao) ctx.cinematic.ao.radius = Math.max(0.01, (cm.subject === 'lineup' ? 2 : S.C[cm.subject].L * 0.04));
  }
  return { meta, setup, update };
}

/** Fit the sun's shadow frustum around a point (pure: depends only on the arguments). */
function fitShadow(S, center, radius) {
  const sun = S.sun;
  sun.target.position.copy(center);
  sun.position.copy(center).addScaledVector(S.sunDir, radius * 4);
  const cam = sun.shadow.camera;
  cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
  cam.near = radius * 1.0; cam.far = radius * 8;
  cam.updateProjectionMatrix();
  sun.shadow.normalBias = radius * 0.0012;
  sun.target.updateMatrixWorld();
}

/**
 * The newborn's bedding: a creased linen sheet over a plank floor (both CC0 photo
 * materials), the sheet draped by a deterministic fold field and damp under the
 * hatchling, with a few curved fragments of the dark eggshell beside it.
 */
async function buildBed(ctx) {
  const g = new THREE.Group();
  const top = 0.06;
  const linen = await loadPBR('pbr/acg_fabric36', ctx, { repeat: [5, 5], color: new THREE.Color(0.86, 0.82, 0.74), sheen: { color: 0xffffff, roughness: 0.5 } });
  linen.side = THREE.DoubleSide;
  const n = 220, size = 1.6;
  const sheet = new THREE.PlaneGeometry(size, size, n, n);
  sheet.rotateX(-Math.PI / 2);
  const p = sheet.attributes.position;
  const fold = (x, z) => {
    // broad drapes + a few sharp creases running across the sheet
    let h = 0.025 * Math.sin(x * 3.1 + 0.6 * Math.sin(z * 2.3)) * Math.cos(z * 2.2 + 0.4)
      + 0.012 * Math.sin(x * 7.3 + z * 3.1) + 0.006 * Math.sin(z * 13.0 + x * 4.0);
    for (const [cx, cz, a, w] of [[0.1, -0.2, 0.7, 0.02], [-0.3, 0.15, -0.4, 0.015], [0.35, 0.3, 1.9, 0.018]]) {
      const u = (x - cx) * Math.cos(a) + (z - cz) * Math.sin(a);
      h += 0.014 * Math.exp(-(u * u) / (w * w)) * (0.6 + 0.4 * Math.sin(x * 9 + z * 5));
    }
    // a hollow where the hatchling lies
    h -= 0.018 * Math.exp(-(x * x + z * z) / 0.04);
    return h;
  };
  for (let i = 0; i < p.count; i++) p.setY(i, top + fold(p.getX(i), p.getZ(i)));
  sheet.computeVertexNormals();
  const sh = new THREE.Mesh(sheet, linen);
  sh.receiveShadow = true; sh.castShadow = true;
  g.add(sh);
  // planks below
  const wood = await loadPBR('pbr/acg_planks21', ctx, { repeat: [2, 2] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), wood);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002; floor.receiveShadow = true;
  g.add(floor);
  // eggshell fragments: thick curved shards, dark outside, pale membrane inside
  const shellMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.05, 0.045, 0.04), roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4, side: THREE.DoubleSide });
  const frags = [[0.2, -0.05, 0.6], [0.24, 0.1, 2.0], [-0.05, 0.22, 3.4], [0.15, 0.2, 4.4]];
  frags.forEach(([x, z, r], i) => {
    const sg = new THREE.SphereGeometry(0.11, 18, 10, r, 0.9 + 0.3 * Math.sin(i * 2.1), 0.5 + 0.3 * Math.cos(i), 0.6 + 0.2 * Math.sin(i * 3.3));
    const m = new THREE.Mesh(sg, shellMat);
    m.position.set(x, top + 0.02 + fold(x, z), z);
    m.rotation.set(1.2 + i * 0.7, r, 0.4 * i);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  });
  g.userData.top = top - 0.012;
  ctx.scene.add(g);
  return g;
}

/**
 * Break up texture tiling on a large ground: the albedo is sampled at two
 * scales (the second rotated) blended by low-frequency noise, and multiplied
 * by macro colour variation - the usual terrain trick, so a 2 m photo tile
 * does not read as a carpet from 50 m away.
 */
function breakTiling(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vGW;
float gH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gH(i), gH(i + vec2(1, 0)), f.x), mix(gH(i + vec2(0, 1)), gH(i + vec2(1, 1)), f.x), f.y); }
float gF(vec2 p) { return gN(p) * 0.5 + gN(p * 2.1 + 3.7) * 0.3 + gN(p * 4.3 + 1.1) * 0.2; }`)
      .replace('#include <map_fragment>', `
#ifdef USE_MAP
{
  vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.29 + vec2(0.37, 0.11);
  vec4 t1 = texture2D(map, vMapUv), t2 = texture2D(map, uv2);
  float b = smoothstep(0.35, 0.65, gF(vGW.xz * 0.05));
  vec4 tc = mix(t1, t2, b);
  float macro = gF(vGW.xz * 0.012 + 5.0);
  vec3 tint = mix(vec3(1.06, 1.0, 0.86), vec3(0.88, 0.98, 0.9), gF(vGW.xz * 0.006 + 9.0));
  diffuseColor *= vec4(tc.rgb * tint * (0.72 + 0.5 * macro), tc.a);
}
#endif`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + '|dk-ground';
  mat.needsUpdate = true;
}
