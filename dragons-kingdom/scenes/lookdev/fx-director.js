// FX lookdev - the director's cue path (scenes/lib/director/fx.js -> scenes/lib/fx/director.js):
// effects cued exactly the way a shot spec cues them, on a stand-in set with marks.
//   views 0 / 1 (0-8 s wide, 8-16 s close and low under the wings): the take-off (1C-05 / 1C-06) -
//     'dust-downwash' + 'debris-turf' cued at the 'launch' mark from shot second 0.5: four
//     downstrokes, turf and clods thrown out, dust rolling
//   view 2 (16-24 s): after the attack - a man running with a burning sleeve ('smoke-trail' at a
//     moving actor point, resolved per frame), 'cloth-drape' over a body at a mark, 'blood-pool'
//     spreading from under it, 'sparks' off the paving, 'ash-fall'
// Scale: a 1.8 m post and a grey ball (albedo 0.4).
//
//   node render/render.mjs --still scenes/lookdev/fx-director.js --time 2.5 --preset draft --png out.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { FxRunner, loadFxLibrary, fxKinds } from '../lib/director/fx.js';

export const meta = {
  title: 'FX lookdev - director cues',
  duration: 24,
  seed: 13,
  cinematic: {
    atmosphere: { enabled: true, sky: 'scene', haze: 1.2 },
    ao: { enabled: true, radius: 0.8 },
    dof: { enabled: false },
    grade: { exposure: 0.0, whiteBalance: 5800 },
  },
};

const G = 0;
const set = {
  marks: { launch: [0, G, 0], body: [3, G, 38], post: [-6, G, 32] },
  objects: {},
  ground: () => G,
  wind: [1.2, 0, 0.4],
};
// shot specs (shot seconds); one spec per view
const SHOTS = {
  takeoff: { fx: [
    { kind: 'dust-downwash', id: 'launch', from: 0.5, to: null, at: 'launch', params: { bursts: [0, 0.85, 1.7, 2.55], radius: 30, strength: 1, color: 'loam' } },
    { kind: 'debris-turf', id: 'launch', from: 0.5, to: null, at: 'launch', params: { bursts: [0, 0.85], radius: 12, speed: 10 } },
  ] },
  after: { fx: [
    { kind: 'smoke-trail', id: 'sleeve', from: 0, to: null, at: 'runner.hand', params: { kind: 'cloth', t1: 12 } },
    { kind: 'cloth-drape', id: 'body', from: 0, to: null, params: { body: { at: [3, G, 38], yaw: 0.4 }, size: [1.0, 2.6], fabric: 'wool', color: [0.26, 0.05, 0.035], border: { at: 0.05, width: 0.06, color: [0.45, 0.33, 0.08] } } },
    { kind: 'blood-pool', id: 'body', from: 0, to: null, at: [3.6, G, 38.6], params: { radius: 0.7, delay: 0, tau: 6 } },
    { kind: 'sparks', id: 'spear', from: 2.0, to: 4, at: [-1, 0.02, 40], params: { dir: [1, 0.25, -0.3], count: 90, speed: 6 } },
    { kind: 'ash-fall', id: 'ash', from: 0, to: null, params: { box: [[-6, 0.5, 30], [8, 6, 44]], t1: 30, rate: 120, t0: -8 } },
  ] },
};
// a man running across the square (an "actor point" the director resolves per frame)
const runner = (t) => new THREE.Vector3(-5 + 1.6 * t, 1.0 + 0.04 * Math.sin(t * 9), 41 - 0.3 * t);
const env = {
  point: (n, t) => (n === 'runner.hand' ? runner(t) : set.marks[n] ? new THREE.Vector3(...set.marks[n]) : null),
  approxPoint: (n, t) => env.point(n, t),
  ground: () => G,
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true });
  const sun = sky.apply(scene);
  const rot = Math.atan2(sky.sun.direction.z, sky.sun.direction.x) - 0.6;
  scene.environmentRotation.set(0, rot, 0); scene.backgroundRotation.set(0, rot, 0);
  sky.sun.direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
  sun.position.copy(sky.sun.direction).multiplyScalar(150);
  sun.castShadow = true; sun.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03;
  const sc = sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400; sc.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), await groundMaterial('pbr/acg_ground037', ctx, [600, 600], { tint: [0.85, 0.82, 0.75] }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const grey = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.4, 0.4, 0.4), roughness: 0.8 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 48, 24), grey);
  ball.position.set(-9, 0.6, 30); ball.castShadow = ball.receiveShadow = true; scene.add(ball);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.8, 24), grey);
  post.position.set(-6, 0.9, 32); post.castShadow = post.receiveShadow = true; scene.add(post);
  const lib = await loadFxLibrary();
  if (!lib.loaded) throw new Error(`FX library did not load for the director: ${lib.reason}`);
  const runnerFx = new FxRunner(ctx, { scene, set, point: (n, t) => env.point(n, t) });
  await runnerFx.prepare(Object.values(SHOTS));
  if (runnerFx.missing.size) throw new Error(`missing FX kinds: ${[...runnerFx.missing].join(', ')}`);
  console.log(`[fx-director] kinds registered: ${fxKinds().length}`);
  S = { runnerFx };
}

export function update(t, ctx) {
  const cam = ctx.camera;
  const view = Math.min(2, Math.floor(t / 8)), tt = t - view * 8;
  cam.near = 0.1; cam.far = 3000;
  ctx.lens.sensor = 'super35'; ctx.lens.fstop = 5.6; ctx.lens.shutterAngle = 180;
  if (view === 0) { cam.position.set(-14, 1.2, 46); cam.lookAt(2, 3.2, 20); ctx.lens.focalLength = 28; ctx.lens.focus = 26; }
  else if (view === 1) { cam.position.set(9, 1.3, 13); cam.lookAt(1, 0.8, 2); ctx.lens.focalLength = 24; ctx.lens.focus = 12; }
  else { cam.position.set(4, 2.2, 47); cam.lookAt(1, 0.6, 38); ctx.lens.focalLength = 30; ctx.lens.focus = 9; }
  // only the shown spec's cues are active (FxRunner.update hides the others)
  const spec = view < 2 ? SHOTS.takeoff : SHOTS.after;
  S.runnerFx.update(spec, tt, env, { shot: view < 2 ? 'takeoff' : 'after', u: tt / 8, camera: cam });
  ctx.shadows.dynamic = S.runnerFx.dynamic;
}
