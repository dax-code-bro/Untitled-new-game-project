// Performance proof 4 - the Cling crowd flees (3C): festival villagers mill round the square
// (talking in small groups - the talk passes round, heads turn to the talker, a hand makes a point -
// one cheering the music, one waving, two wandering across); at t = 3.0 the alarm - something huge and
// white over the north roofs - and the crowd reacts in a wave from the north side outward: heads
// snap up, a gasp, then they run for the stone arch (west) and the broad gate (east), pushing past
// each other round the fountain; a few shield their heads, some glance back, a few cower against
// the house fronts. Crowd: scenes/lib/humans/crowd.js (social-force bake in setup), legs / arms /
// faces: perform.js. Set: the architecture library's Cling square (CLING layout).
//   draft clip: node render/render.mjs scenes/lookdev/humans-anim-crowd.js --preset draft --cinematic preview --twos
import * as THREE from 'three';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { loadCharacter } from '../lib/humans/index.js';
import { createPerformer, loadPerformanceData } from '../lib/humans/perform.js';
import { createCrowd } from '../lib/humans/crowd.js';
import { clingSquare, CLING } from '../lib/architecture/cling.js';
import { filmFinish } from './finish.js';

export const meta = {
  title: 'Performance - Cling crowd flees',
  duration: 10,
  seed: 9,
  cinematic: filmFinish({ ao: { enabled: true, radius: 0.4 }, dof: { samples: 32 }, grade: { exposure: 0.1, whiteBalance: 6000 } }),
};

const IDS = ['crowd01', 'crowd02', 'crowd03', 'crowd04', 'crowd05', 'crowd06', 'crowd07', 'crowd08', 'crowd09', 'crowd11', 'crowd12', 'crowd14', 'crowd15', 'crowd16', 'crowd17', 'crowd10'];
// where each villager starts [x, z, yaw]: talking groups (by the stall, west of the steps, the music
// space, under the steps) and a few on their own (one cheering the music, one waving to a friend,
// two wandering across)
const START = [
  [-10.5, 11.0, 0.6], [-7.9, 5.4, 0.9], [-7.0, 6.6, -2.4], [8.6, 2.6, 0.4], [-7.4, 5.0, -0.6], [-3.9, 10.0, 0.8], [-2.9, 10.9, -2.2],
  [2.0, 12.6, 1.2], [3.2, 13.6, -2.4], [6.0, 5.2, 1.6], [7.0, 5.8, -1.6], [2.9, 12.4, -0.6], [-3.6, 11.2, 2.6], [11.5, 9.5, -1.4], [2.4, 13.6, 2.8], [-1.0, 6.5, -2.9],
];
// conversation groups (indices into IDS)
const GROUPS = [[1, 2, 4], [5, 6, 12], [9, 10], [7, 11, 14, 8]];
// the cheering / waving drapes keep their raised arms; the wanderers' raised arms hang
const ARMS = { 13: 'hang', 15: 'hang' };
const WANDER = { 13: { radius: 4.5, talk: 0.15 }, 15: { radius: 4.0, talk: 0.25 }, 0: { radius: 1.2, talk: 0.8 }, 3: { radius: 0.8, talk: 0.85 } };
const ALARM = { t: 3.0, at: [-2, -16], lookY: 14 };

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: -1.79 });
  const sun = sky.apply(scene);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  sun.target.position.set(0, 0, 6); sun.position.copy(sky.sun.direction).multiplyScalar(80).add(sun.target.position);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), await loadPBR('pbr/ph_floor_pebbles_01', ctx, { worldSize: 60 }));
  ground.material.color.setRGB(0.7, 0.66, 0.6);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const set = await clingSquare(ctx, { lod: 'mid', focus: [[-6, 8], [6, 8], [CLING.arch.x, CLING.arch.z], [CLING.gate.x, CLING.gate.z]], heroR: 8, far: 40 });
  scene.add(set.group);

  const data = await loadPerformanceData();
  const chars = await Promise.all(IDS.map((id) => loadCharacter(id)));
  const performers = chars.map((ch, i) => { scene.add(ch.root); return createPerformer(ch, data, { arms: ARMS[i] || 'auto' }); });
  const sq = CLING.square, gate = CLING.gate, arch = CLING.arch;
  const crowd = createCrowd({
    seed: 3, t0: 0, t1: meta.duration + 1,
    agents: performers.map((p, i) => ({ performer: p, pos: [START[i][0], START[i][1]], yaw: START[i][2], radius: 1.6, talk: 0.55, ...(WANDER[i] || {}) })),
    groups: GROUPS,
    exits: [
      [[arch.x + 5, arch.z], [arch.x, arch.z], [arch.x - 8, arch.z + 0.2], [arch.x - 16, arch.z - 4]],
      [[gate.x - 5, gate.z], [gate.x, gate.z], [gate.x + 10, gate.z + 0.3], [gate.x + 24, gate.z + 1]],
    ],
    obstacles: [{ x: CLING.fountain.x, z: CLING.fountain.z, r: CLING.fountain.r + 0.3 }, { x: CLING.support.x, z: CLING.support.z, r: 1.6 }],
    walls: [[sq.x0, sq.z0, sq.x1, sq.z0], [sq.x0, sq.z0, sq.x0, arch.z - 2.2], [sq.x0, arch.z + 2.2, sq.x0, sq.z1], [sq.x1, sq.z0, sq.x1, gate.z - 3], [sq.x1, gate.z + 3, sq.x1, sq.z1]],
    alarm: ALARM, cower: 0.18, lookBack: 0.5, shield: 0.3,
  });
  crowd.bake();
  S = { sun, performers, crowd };
}

export function update(t, ctx) {
  const { camera } = ctx;
  for (const p of S.performers) p.update(t);
  // a wide from the king's steps (south, raised), looking north over the square; a slow drift
  const k = t / meta.duration;
  camera.position.set(4.5 - 1.5 * k, 4.6, 25.5);
  camera.lookAt(0.5 - 1 * k, 1.4, 4);
  camera.fov = 44; camera.near = 0.2; camera.far = 600;
  camera.updateProjectionMatrix();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = 8; ctx.lens.focus = 18; ctx.lens.shutterAngle = 180; }
}
