// Performance proof - body motion: walk with planted feet on a curve, stop + turn, wave; a run that
// slows and points; a kneel and reach; a stagger and a fall. Daylight field, long lens tracking.
//   t 0-7.2  Remi walks a curve (1.35 m/s), stops, turns to the lens, waves
//   t 7.2-13.5 Abby runs (3.6 m/s), slows, stops, points back up the field
//   t 13.5-19 Remi kneels, reaches to the ground, stands again
//   t 19-24  a villager (crowd03) staggers from a blow, then falls
//   t 24-30  a parent picks up the child and carries it away on the hip (carryChild)
// Draft clip: node render/render.mjs scenes/lookdev/humans-anim-walk.js --preset draft --cinematic preview
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { loadCharacter } from '../lib/humans/index.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { createPerformer, loadPerformanceData } from '../lib/humans/perform.js';
import { filmFinish } from './finish.js';

export const meta = {
  title: 'Performance - body motion',
  duration: 30,
  seed: 7,
  cinematic: filmFinish({ shadows: { cascades: 0 }, ao: { enabled: true, radius: 0.15 }, dof: { samples: 32 }, grade: { exposure: 0.15, whiteBalance: 5900 } }),
};

const X = { remi: 0, abby: 30, kneel: 60, fall: 90, carry: 120 };     // each act in its own spot of the field
let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: -1.0 });
  const sun = sky.apply(scene);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0001; sun.shadow.normalBias = 0.006;
  scene.add(sun, sun.target);
  S = { sun };
  const GW = 260, GH = 120;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), await groundMaterial('pbr/acg_ground03', ctx, [GW, GH]));
  ground.rotation.x = -Math.PI / 2; ground.position.x = 45; ground.receiveShadow = true; scene.add(ground);
  const data = await loadPerformanceData();
  const [remi, abby, remi2, vill, par, kid] = await Promise.all(['remi', 'abby', 'remi', 'crowd03', 'parent', 'child'].map((id) => loadCharacter(id)));
  for (const c of [remi, abby, remi2, vill, par, kid]) scene.add(c.root);
  // 1. walk a curve, stop, turn to the lens, wave
  const A = createPerformer(remi, data).place(X.remi - 4, 0, Math.PI / 2);
  // (the walk ends at w.t1 = 5.26 s: the wave has to finish before the cut to Abby at 7.2 s - with the
  // longer path it started at 7.4 s, after the cut)
  const w = A.walkPath([[X.remi - 4, 0], [X.remi - 1.5, 0.8], [X.remi + 1.2, 0.2]], 0.3, { speed: 1.35, endYaw: 0 });
  A.gesture('wave', w.t1 + 0.45, { side: 'R', dur: 1.5 });
  A.lookAt(() => S.camPos, w.t1 + 0.3, { amount: 0.8 });
  // 2. run, slow, stop, point back
  const B = createPerformer(abby, data).place(X.abby - 9, 0.5, Math.PI / 2);
  const r = B.runPath([[X.abby - 9, 0.5], [X.abby + 2, 0.2]], 7.2, { speed: 3.6, decel: 1.6 });
  B.gesture('point', r.t1 + 0.3, { side: 'L', at: [X.abby - 12, 1.2, 4], dur: 1.6 });
  B.lookAt([X.abby - 12, 1.4, 4], r.t1 + 0.1);
  // 3. kneel + reach to the ground
  const C = createPerformer(remi2, data).place(X.kneel, 0, 0.3);
  C.posture('kneel', 13.6, { in: 1.0, hold: 3.0, out: 1.0 });
  C.gesture('reach', 14.4, { side: 'R', at: [X.kneel + 0.15, 0.03, 0.55], dur: 1.6, shape: 'cup', palm: [0, -1, 0] });
  C.lookAt([X.kneel + 0.15, 0.03, 0.55], 13.4, { amount: 0.9 });
  // 4. stagger, then fall
  const D = createPerformer(vill, data).place(X.fall, 0, -Math.PI / 2);
  D.stagger(19.8, { dir: [1, 0.3], dist: 0.8, dur: 0.8 });
  D.gesture('flail', 19.8, { in: 0.15, dur: 0.6, out: 0.5 });
  D.fall(21.0, { dir: [1, 0.2], drop: true });       // the basket flies out of her hand and lands
  // 5. carry: the child is lifted onto the parent's hip, the parent walks off
  const K = createPerformer(kid, data).place(X.carry + 0.45, 0.25, -1.9);
  const E = createPerformer(par, data).place(X.carry, 0, 0.2);
  E.lookAt({ ch: kid }, 24, { amount: 0.6 });
  K.lookAt({ ch: par }, 24, { amount: 0.7 });
  E.carry(K, 25.0, 99);
  E.walkPath([[X.carry, 0], [X.carry + 1.2, 2.6]], 26.4, { speed: 1.15 });
  S = { ...S, A, B, C, D, E, K, wEnd: w.t1, rEnd: r.t1, camPos: new THREE.Vector3() };
}

export function update(t, ctx) {
  const { camera } = ctx;
  const { A, B, C, D, E, K } = S;
  let act, look, dist, h, side;
  if (t < 7.2) { act = A; dist = 6.5; h = 1.15; side = 1; }
  else if (t < 13.5) { act = B; dist = 9; h = 1.0; side = 1; }
  else if (t < 19) { act = C; dist = 4.2; h = 0.85; side = 1; }
  else if (t < 24) { act = D; dist = 7; h = 0.9; side = 1; }
  else { act = E; dist = 5; h = 1.0; side = 1; }
  for (const P of [A, B, C, D, E]) P.ch.root.visible = P === act;
  K.ch.root.visible = act === E;
  if (act === E && t < 25) K.update(t);       // the child stands until it is lifted (E.update poses it after)
  act.update(t);
  // a long-lens camera that pans with the actor (smoothed root, no bob)
  const r = act.rootAt(t);
  const r2 = act.rootAt(t - 0.25);
  const cx = (r.x + r2.x) / 2, cz = (r.z + r2.z) / 2;
  S.camPos.set(cx + 0.6, h + 0.25, cz + dist * side);
  camera.position.copy(S.camPos);
  camera.lookAt(cx, h, cz);
  camera.fov = 26; camera.near = 0.1; camera.far = 400;
  camera.updateProjectionMatrix();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = 4; ctx.lens.focus = dist; ctx.lens.shutterAngle = 180; }
  S.sun.target.position.set(cx, 0, cz); S.sun.position.copy(S.sun.target.position).addScaledVector(S.sunDir || (S.sunDir = S.sun.position.clone().normalize()), 60);
  const sc = S.sun.shadow.camera; sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.near = 1; sc.far = 150; sc.updateProjectionMatrix();
}
