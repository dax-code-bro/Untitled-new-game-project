// Performance proof - crowd verbs for the 3C destruction: crawl clear, push a beam, drop flat and
// cover the head, thrown off the feet by a blast. Daylight field, long lens.
//   t 0-7    a villager drops to hands and knees and crawls clear (posture 'crawl' + a slow walk)
//   t 7-12   two villagers brace and push a beam (posture 'brace' + gesture 'push')
//   t 12-17  a woman drops flat and covers her head (fall { cover })
//   t 17-22  a man is thrown off his feet by a blast, the cup flies out of his hand (fall { thrown, drop })
// Draft clip: node render/render.mjs scenes/lookdev/humans-anim-verbs.js --preset draft
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { loadCharacter } from '../lib/humans/index.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { createPerformer, loadPerformanceData } from '../lib/humans/perform.js';
import { filmFinish } from './finish.js';

export const meta = {
  title: 'Performance - crowd verbs',
  duration: 22,
  seed: 11,
  cinematic: filmFinish({ shadows: { cascades: 0 }, ao: { enabled: true, radius: 0.15 }, dof: { samples: 32 }, grade: { exposure: 0.15, whiteBalance: 5900 } }),
};

const X = { crawl: 0, push: 30, prone: 60, thrown: 90 };
let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: -1.0 });
  const sun = sky.apply(scene);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0001; sun.shadow.normalBias = 0.006;
  scene.add(sun, sun.target);
  S = { sun };
  const GW = 200, GH = 100;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), await groundMaterial('pbr/acg_ground03', ctx, [GW, GH]));
  ground.rotation.x = -Math.PI / 2; ground.position.x = 45; ground.receiveShadow = true; scene.add(ground);
  // the beam two of them push (a fallen roof timber propped on a trestle at chest height)
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 0.85 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.24, 0.26), wood);
  beam.position.set(X.push, 1.1, 0.0); beam.castShadow = beam.receiveShadow = true; scene.add(beam);
  for (const dx of [-1.3, 1.3]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.98, 0.5), wood);
    leg.position.set(X.push + dx, 0.49, 0.12); leg.castShadow = leg.receiveShadow = true; scene.add(leg);
  }
  const data = await loadPerformanceData();
  const ids = ['crowd06', 'crowd04', 'crowd10', 'crowd09', 'crowd02'];
  const chars = await Promise.all(ids.map((id) => loadCharacter(id)));
  for (const c of chars) scene.add(c.root);
  const [cCrawl, cPushA, cPushB, cProne, cThrown] = chars;
  // 1. down onto hands and knees, then crawl 2.4 m at ~0.4 m/s
  const A = createPerformer(cCrawl, data).place(X.crawl, 0, Math.PI / 2);
  A.posture('crawl', 0.4, { in: 0.9, hold: 99 });
  A.walkPath([[X.crawl, 0], [X.crawl + 2.4, 0.15]], 1.5, { speed: 0.42, accel: 0.5, decel: 0.5 });
  A.mood({ fear: 0.7, pain: 0.2 }, 0, 99);
  // 2. two push the beam (facing +z, the beam 0.75 m in front of them)
  const B1 = createPerformer(cPushA, data).place(X.push - 0.5, -0.8, 0);
  const B2 = createPerformer(cPushB, data).place(X.push + 0.5, -0.82, 0);
  for (const [P, dx] of [[B1, -0.5], [B2, 0.5]]) {
    P.posture('brace', 7.7, { in: 0.6, hold: 99 });
    P.gesture('push', 7.6, { at: [X.push + dx, 1.12, -0.14], along: [1, 0, 0], width: 0.4, in: 0.55, dur: 99 });
    P.mood({ determined: 0.8, pain: 0.3 }, 7.4, 99);
    P.lookAt([X.push + dx * 0.4, 1.1, 0.2], 7.3, { amount: 0.6 });
  }
  // 3. drop flat, hands over the head
  const C = createPerformer(cProne, data).place(X.prone, 0, Math.PI / 2);
  C.mood({ fear: 0.9 }, 12.4, 99);
  C.react('startle', 12.6, 0.9);
  C.fall(13.0, { dir: [1, 0.05], dur: 1.05, cover: true });
  // 4. thrown off his feet by a blast from -x (lands on his back), the cup flies
  const D = createPerformer(cThrown, data).place(X.thrown, 0, -Math.PI / 2);
  D.react('startle', 17.9, 0.6);
  D.fall(18.2, { dir: [1, 0.08], dur: 1.0, thrown: { dist: 1.8, h: 0.5 }, drop: true });
  S = { ...S, acts: [[A], [B1, B2], [C], [D]] };
}

export function update(t, ctx) {
  const { camera } = ctx;
  const k = t < 7 ? 0 : t < 12 ? 1 : t < 17 ? 2 : 3;
  S.acts.forEach((ps, i) => { for (const P of ps) P.ch.root.visible = i === k; });
  for (const P of S.acts[k]) P.update(t);
  let tgt, pos, dist;
  if (k === 0) {
    const r = S.acts[0][0].rootAt(t);
    tgt = new THREE.Vector3(r.x + 0.3, 0.4, r.z); pos = new THREE.Vector3(r.x + 1.6, 0.9, r.z + 4.4);
  } else if (k === 1) {
    tgt = new THREE.Vector3(X.push, 0.95, -0.5); pos = new THREE.Vector3(X.push + 3.6, 1.5, -4.2);
  } else if (k === 2) {
    tgt = new THREE.Vector3(X.prone + 0.6, 0.5, 0); pos = new THREE.Vector3(X.prone + 2.6, 1.6, 4.6);
  } else {
    tgt = new THREE.Vector3(X.thrown + 0.9, 0.7, 0); pos = new THREE.Vector3(X.thrown + 1.6, 1.4, 5.6);
  }
  dist = pos.distanceTo(tgt);
  camera.position.copy(pos);
  camera.lookAt(tgt);
  camera.fov = 30; camera.near = 0.1; camera.far = 400;
  camera.updateProjectionMatrix();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = 5.6; ctx.lens.focus = dist; ctx.lens.shutterAngle = 180; }
  S.sun.target.position.copy(tgt).setY(0); S.sun.position.copy(S.sun.target.position).addScaledVector(S.sunDir || (S.sunDir = S.sun.position.clone().normalize()), 60);
  const sc = S.sun.shadow.camera; sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.near = 1; sc.far = 150; sc.updateProjectionMatrix();
}
