// Shared look-development shots for the Episode 1 creatures (provisional
// designs). Used by creatures-turntable.js (every shot) and the small
// per-creature wrappers (creatures-turntable-<name>.js) that build only what
// their shots need - much faster for single stills.
//
// Lighting is a real HDRI only (Poly Haven kloofendal_48d_partly_cloudy, CC0;
// its sun is extracted into a shadow-casting light with the same energy) over
// a photo-textured ground (ambientCG, CC0). Every frame is a pure function of t.
import * as THREE from 'three';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { createCreature, poses, loadHuman, createRider, createSaddle, mountRider } from '../lib/creatures/index.js';

const TAU = Math.PI * 2;
const ease = (x) => x * x * (3 - 2 * x);

// cam: orbit around target (units of the subject's L): az (deg, 0 = the creature's front-left... see orbit()), el (deg), dist, fov
export const SHOTS = [
  { id: 'charcoal', creatures: ['charcoal'], dur: 10, pose: { charcoal: { name: 'stand' } }, turntable: true,
    cam: { subject: 'charcoal', target: [0, 0.16, 0.02], az: 35, el: 9, dist: 1.25, fov: 34 } },
  { id: 'charcoal-head', creatures: ['charcoal'], dur: 4, pose: { charcoal: { name: 'stand', look: [0.35, 0.05], eyes: [0.1, 0] } },
    cam: { subject: 'charcoal', bone: 'head', target: [0, 0.0, 0.05], az: 55, el: 4, dist: 0.21, fov: 30, fstop: 4 } },
  { id: 'charcoal-flight', creatures: ['charcoal'], dur: 6, airborne: 0.55, pose: { charcoal: { name: 'flight' } },
    cam: { subject: 'charcoal', target: [0, 0.2, 0.0], az: 62, el: -4, dist: 1.6, fov: 40, sky: true } },
  { id: 'leaf', creatures: ['leaf'], humans: ['abby-standing'], dur: 10, pose: { leaf: { name: 'sit', look: [-0.25, 0.1] } }, turntable: true, hideRider: ['leaf'],
    cam: { subject: 'leaf', target: [0, 0.22, 0.12], az: 30, el: 6, dist: 1.25, fov: 34 } },
  { id: 'leaf-eye', creatures: ['leaf'], dur: 4, pose: { leaf: { name: 'stand', look: [0.2, 0.0], eyes: [-0.1, 0.05] } },
    cam: { subject: 'leaf', bone: 'eye_L', target: [0, 0, 0], az: 72, el: 6, dist: 0.075, fov: 26, fstop: 2.8 } },
  { id: 'leaf-flight', creatures: ['leaf'], dur: 6, airborne: 0.6, pose: { leaf: { name: 'flight', corr: 1 } },
    cam: { subject: 'leaf', target: [0, 0.2, 0.0], az: 55, el: 8, dist: 1.5, fov: 40, sky: true } },
  { id: 'starlight', creatures: ['starlight'], dur: 10, airborne: 0.9, pose: { starlight: { name: 'glide', bank: 0.22 } }, turntable: 0.5,
    cam: { subject: 'starlight', target: [0, 0.2, 0.0], az: 200, el: -22, dist: 1.7, fov: 40, sky: true } },
  { id: 'hatchling', creatures: ['hatchling'], dur: 8, pose: { hatchling: { name: 'lie', look: [0.35, -0.3], raise: -0.1, lidRelax: 0.22 } },
    cam: { subject: 'hatchling', bone: 'head', target: [0, -0.03, -0.1], az: 30, orbit: 50, el: 8, dist: 0.9, fov: 30, fstop: 16, focusOn: 'eye_L' } },
  { id: 'scout', creatures: ['scout'], dur: 6, airborne: 0.5, pose: { scout: { name: 'flight' } },
    cam: { subject: 'scout', target: [0, 0.12, 0.05], az: 70, el: 10, dist: 1.3, fov: 38, sky: true } },
  { id: 'scout-wing', creatures: ['scout'], dur: 6, airborne: 1.5, pose: { scout: { name: 'flight' } }, detachAt: 1.0,
    cam: { subject: 'scout', target: [0, 0.0, 0.05], az: 120, el: 10, dist: 2.0, fov: 40, sky: true } },
  { id: 'lineup', creatures: ['leaf', 'charcoal', 'starlight'], humans: ['lineup-human'], dur: 10, lineup: true,
    pose: { leaf: { name: 'stand', look: [-0.2, 0] }, charcoal: { name: 'stand', look: [-0.1, 0] }, starlight: { name: 'stand', look: [-0.15, 0] } },
    cam: { subject: 'lineup' } },
];

const RIDERS = { charcoal: 'remi', leaf: 'abby', starlight: 'fall', scout: 'scout' };

/** Build a scene module for the given shot ids (default: all). */
export function makeTurntable(opts = {}) {
  const shots = SHOTS.filter((s) => !opts.only || opts.only.includes(s.id));
  let start = 0;
  for (const s of shots) { s._start = start; start += s.dur; }
  const total = start;
  const need = [...new Set(shots.flatMap((s) => s.creatures))];
  const needHumans = [...new Set(shots.flatMap((s) => s.humans || []))];
  const S = { C: {}, riders: {}, humans: {}, sun: null, sunDir: null, ground: null };

  const meta = {
    title: opts.title || 'Creature turntable (provisional designs)', duration: total, toneMapping: 'aces', exposure: 0.62, vignette: 0.12, seed: 7,
    // cinematic realism stack (runtime/cinematic): GTAO + contact shadows, physical DOF,
    // motion blur from the real shutter, filmic grade, lens effects and sensor grain
    cinematic: opts.cinematic ?? { grade: { toneMapping: 'agx', look: 'cinema' }, grain: { amount: 0.7 }, bloom: { intensity: 0.01 } },
  };

  async function setup(ctx) {
    const { scene, quality } = ctx;
    const q = opts.quality || (ctx.preset === 'final' || ctx.preset === 'final-fast' ? 'hero' : ctx.preset === 'preview' ? 'standard' : 'draft');
    // HDRI only; rotate so the sun comes from behind the camera's left for the turntables
    const sky = await loadHDRI(opts.hdri || 'hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: opts.hdriRotation ?? -1.2, backgroundBlurriness: 0.06 });
    const sun = sky.apply(scene);
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    sun.shadow.bias = -0.0002;
    scene.add(sun, sun.target);
    S.sun = sun; S.sunDir = sky.sun.direction.clone();
    // ground: CC0 photo turf, fogged into the horizon
    const groundMat = await loadPBR('pbr/acg_ground13', ctx, { worldSize: 1600 });
    breakTiling(groundMat);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(800, 128), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    S.ground = ground;
    scene.fog = new THREE.Fog(new THREE.Color(0.62, 0.66, 0.72), 300, 1600);
    // creatures
    for (const name of need) {
      const c = await createCreature(name, { quality: q, log: (m) => console.log(m) });
      scene.add(c.root);
      c.root.visible = false;
      S.C[name] = c;
    }
    // riders and tack
    if (Object.keys(RIDERS).some((n) => need.includes(n)) || needHumans.length) {
      const human = await loadHuman();
      for (const name of need) {
        if (!RIDERS[name]) continue;
        const c = S.C[name];
        const tack = createSaddle(c, {});
        const rider = createRider(human, { outfit: RIDERS[name], lean: name === 'scout' ? 0.5 : 0.12 });
        mountRider(c, tack, rider);
        S.riders[name] = { tack, rider };
      }
      if (needHumans.includes('abby-standing')) S.humans['abby-standing'] = createRider(human, { outfit: 'abby', pose: 'stand', headPitch: -0.25 });
      if (needHumans.includes('lineup-human')) S.humans['lineup-human'] = createRider(human, { outfit: 'remi', pose: 'stand' });
      for (const h of Object.values(S.humans)) { h.root.visible = false; scene.add(h.root); }
    }
    console.log('[creatures] built', Object.entries(S.C).map(([n, c]) => `${n}: ${c.stats.vertices} v, ${c.stats.buildMs} ms`).join('; '));
  }

  const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion();
  const camFocus = new THREE.Vector3();

  function update(t, ctx) {
    const { camera, scene } = ctx;
    let shot = shots[shots.length - 1];
    for (const s of shots) if (t >= s._start && t < s._start + s.dur) { shot = s; break; }
    const lt = t - shot._start;
    const u = lt / shot.dur;
    // visibility
    for (const [n, c] of Object.entries(S.C)) c.root.visible = shot.creatures.includes(n);
    for (const [n, h] of Object.entries(S.humans)) h.root.visible = (shot.humans || []).includes(n);
    for (const [n, r] of Object.entries(S.riders)) {
      const vis = !(shot.hideRider || []).includes(n);       // hides the rider and the saddle
      r.rider.root.visible = vis;
      for (const m of r.tack.meshes) m.visible = vis;
    }

    // ---------------------------------------------------------- poses
    for (const n of shot.creatures) {
      const c = S.C[n];
      const po = shot.pose[n] || { name: 'stand' };
      c.root.position.set(0, 0, 0);
      c.root.rotation.set(0, 0, 0);
      if (c.detachable) c.attachWing();
      c.setPose(poses[po.name](c, { ...po, t: lt + (shot.timeOffset || 0) }));
      if (shot.turntable) {
        // the turntable angle is held for the whole frame (rounded to the frame time), so
        // the lookdev rotation never smears the creature; only its own motion (breathing,
        // head drift) gets motion blur. The velocity pass poses the scene at the shutter-open
        // time before update() sets this shot's lens, so a short shutter alone is not enough.
        const fps = ctx.fps || 24;
        const uh = (Math.round(t * fps) / fps - shot._start) / shot.dur;
        c.root.rotation.y = TAU * uh * (shot.turntable === true ? 1 : shot.turntable) + (shot.yaw0 || 0);
      }
      if (shot.airborne) c.root.position.y = shot.airborne * c.L;
    }
    // scout: the LEFT wing tears away at detachAt and tumbles; the body loses control
    if (shot.detachAt !== undefined) {
      const c = S.C.scout;
      const td = shot.detachAt;
      if (lt >= td) {
        // the wing root's world matrix at the moment of tearing (same pose function, evaluated at td)
        c.setPose(poses.flight(c, { t: td }));
        c.root.updateMatrixWorld(true);
        const M0 = c.detachable.rootBone.matrixWorld.clone();
        const dt = lt - td;
        // body: spins toward the lost side and drops (no lift on the left)
        c.setPose(poses.flight(c, { t: lt, bank: 0.6 * dt + 0.3, amp: 0.6 }));
        c.root.position.y = shot.airborne * c.L - 0.5 * 9.81 * dt * dt * 0.35;
        c.root.position.z += 6 * dt;
        c.root.rotation.z = 1.8 * dt;
        // wing: ballistic, tumbling, drifting back in the wake
        const g = new THREE.Vector3(-1.0 * dt, -0.5 * 9.81 * dt * dt * 0.25, -5 * dt);
        const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(2.4 * dt, 0.9 * dt, 3.1 * dt));
        _v.setFromMatrixPosition(M0);
        const M = new THREE.Matrix4().compose(_v.clone().add(g), new THREE.Quaternion().setFromRotationMatrix(M0).premultiply(spin), new THREE.Vector3(1, 1, 1));
        c.detachWing(scene, M);
        // the torn wing goes limp: half folded
        for (const n of ['w_L_1', 'w_L_2']) { const b = c.bones[c.boneIndex[n]]; b.quaternion.setFromEuler(new THREE.Euler(0, n === 'w_L_1' ? -0.9 : 0.8, 0.3)); }
      }
    }
    // lineup: side by side on one ground line, all facing camera-right
    if (shot.lineup) {
      const order = ['leaf', 'charcoal', 'starlight'];
      let x = 0;
      const gap = 4;
      for (const n of order) {
        const c = S.C[n];
        c.root.rotation.y = Math.PI / 2;       // face +x
        const len = c.L;
        c.root.position.set(x + len * 0.45, 0, 0);
        x += len * 1.0 + gap;
      }
      const h = S.humans['lineup-human'];
      h.root.position.set(-3, 0.88, 4);     // MakeHuman origin is at the hips
      h.root.rotation.y = Math.PI / 2;
    }
    const st = S.humans['abby-standing'];
    if (st && st.root.visible) {
      // Abby stands in front of sitting Leaf, facing him
      const c = S.C.leaf;
      const ry = c.root.rotation.y;
      const p = new THREE.Vector3(0.0, 0, 0.42 * c.L).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
      st.root.position.set(p.x, 0.88, p.z);
      st.root.rotation.y = ry + Math.PI;
    }

    // ---------------------------------------------------------- camera
    const cm = shot.cam;
    if (cm.subject === 'lineup') {
      const L = S.C.starlight.L;
      const xs = S.C.leaf.L * 0.45 + 50;
      const k = ease(u);
      camera.position.set(xs - 8 + 16 * k, 14, 135);
      camera.lookAt(xs - 4 + 8 * k, 12, 0);
      camera.fov = 32;
      camera.near = 0.5; camera.far = 4000;
      fitShadow(S, new THREE.Vector3(xs, 10, 0), L * 1.3);
    } else {
      const c = S.C[cm.subject];
      const L = c.L;
      let target = new THREE.Vector3(...cm.target).multiplyScalar(L);
      if (cm.bone) {
        // frame relative to a bone (head close-ups): bone position + offset in the root frame
        c.root.updateMatrixWorld(true);
        const b = c.bones[c.boneIndex[cm.bone]];
        target = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).add(new THREE.Vector3(...cm.target).multiplyScalar(L).applyQuaternion(c.root.quaternion));
      } else target.add(c.root.position);
      const az = (cm.az + (cm.orbit || 0) * u) * Math.PI / 180, el = cm.el * Math.PI / 180;
      const d = cm.dist * L;
      camera.position.set(target.x + d * Math.cos(el) * Math.sin(az), target.y + d * Math.sin(el), target.z + d * Math.cos(el) * Math.cos(az));
      camera.lookAt(target);
      camera.fov = cm.fov;
      camera.near = Math.max(0.01, d * 0.02);
      camera.far = Math.max(2000, L * 60);
      fitShadow(S, target.clone().setY(Math.max(target.y * 0.5, 0)), L * (cm.bone ? 0.35 : 1.0) + (shot.detachAt !== undefined ? L : 0));
      camFocus.copy(target);
      if (cm.focusOn) camFocus.setFromMatrixPosition(c.bones[c.boneIndex[cm.focusOn]].matrixWorld);   // e.g. focus on the eye
    }
    camera.updateProjectionMatrix();
    // physical lens: focus on the subject, aperture per shot; AO radius scaled to the subject
    if (ctx.lens) {
      ctx.lens.focalLength = null;
      ctx.lens.fstop = cm.fstop ?? (cm.subject === 'lineup' ? 11 : 8);
      ctx.lens.focus = cm.subject === 'lineup' ? 135 : camera.position.distanceTo(camFocus);
      ctx.lens.shutterAngle = shot.turntable ? 20 : 180;     // turntables: near-frozen (lookdev), flight: real 180-degree blur
    }
    if (ctx.cinematic?.ao) ctx.cinematic.ao.radius = Math.max(0.03, (cm.subject === 'lineup' ? 2 : S.C[cm.subject].L * 0.05));
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
