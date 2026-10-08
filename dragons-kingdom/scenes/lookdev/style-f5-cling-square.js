// Style frame F5 - SCENE 3B, Cling square, the white dragon approaching (shot list 3B-02 .. 3B-08).
//
// "A WATCHMAN looks up from the edge of the square. Something white lies against the cloud ...
// The watchman points ... A few people follow his gaze; others keep eating and talking ...
// Starlight resolves: white scales take color from daylight, silver highlights, soft gray
// beneath, a suggestion of crystal-like facets (not transparent crystal, no glow). Immense."
//
// Map (shotlist.json conventions.cling_map, as seen from the king's steps looking north): the
// stone arch LEFT (west), the gate to the broad road RIGHT (east), the vendor stall left-centre
// with the alley behind it, the music space right-centre, the fountain with its central stone
// pillar at the centre, the stone support by the steps. Sun behind the steps (south, behind the
// camera); Starlight comes from the far north sky. The set is the architecture library's
// `clingSquare` (scenes/lib/architecture/cling.js, CLING layout).
//
// Cinematography: an establishing frame from a crane high behind the king's steps (13 m up, ~44 m
// south of the fountain), 18 mm on Super 35, T5.6, so the whole map reads at once: the arch at
// the left edge, the gate at the right edge, the festival between - stalls with bread, fruit,
// cheese and fish, bunting in deep swags, banners, the musicians right of centre with their ring
// of listeners, children by the vendor stall and the fountain. Most of the crowd has not noticed
// yet. At the west edge of the square the watchman points north; beyond the north roofs, nearly
// head-on out of the cumulus, Starlight - her wingspan wider than three houses although she is
// more than twice as far away as they are. (The south row of houses behind the camera is left
// out of this set-up - a 'wild wall', as a crew would strike it for a crane shot.)
//   node render/render.mjs --still scenes/lookdev/style-f5-cling-square.js --time 2 --preset final --png out.png
import * as THREE from 'three';
import { applyShake } from 'dk/camera.js';
import { loadHDRI } from '../lib/assets.js';
import { terrainMaterial } from '../lib/sets/materials.js';
import { heightfield, makeNoise, gradedAxis, smooth } from '../lib/sets/terrain.js';
import { grassField } from '../lib/sets/grass.js';
import { scatter, bushGeometry, foliageMaterial } from '../lib/sets/scatter.js';
import { townKit, clothMaterial, clothSheet } from '../lib/sets/town.js';
import { foodMaterials, marketStall } from '../lib/sets/props.js';
import { limbIK, lookAtPoint, bonePos } from '../lib/sets/cast.js';
import { clingSquare, CLING, wallFootPlacer, houseFootSegments } from '../lib/architecture/cling.js';
import { Kit, block, yawFrame, sub, makeRand } from '../lib/architecture/core.js';
import { crate, sack, barrel } from '../lib/architecture/dressing.js';
import { createCreature, poses, createSaddle, mountRider } from '../lib/creatures/index.js';
import { loadCharacter, placeCharacter, joinHands, loadHuman, createRider, CROWD } from '../lib/humans/index.js';
import { filmFinish } from './finish.js';

const HDRI_ROT = -1.79;           // the photographed sun south-west, behind the camera (as the map fixes it)
const CAM_P = [3.5, 13.0, 44.0], CAM_T = [-2.5, 8.6, -12.0], LENS = 18;
// Starlight: north of the town, ~180 m beyond the north row, gliding in nearly head-on
const STAR = { x: -14, y: 44, z: -150, yaw: 0.12 };
const WATCH = { x: -15.2, z: 9.5 };

export const meta = {
  title: 'Style frame F5 - Cling square, the white dragon approaching',
  duration: 8,
  seed: 51,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 3.2, apDistanceScale: 3.4 },
    volumetrics: {
      enabled: true, range: 1400, resolution: [192, 108, 72], noiseFilter: true,
      density: 0.00003, heightFalloff: 0.01, fogBase: 0, anisotropy: 0.6, noiseScale: 0.012, noiseAmount: 0.7,
      banks: [],
    },
    shadows: { cascades: 3, maxDistance: 180, bias: -0.0003, normalBias: 2.5 },
    ao: { enabled: true, radius: 0.8 },
    dof: { samples: 48 },
    grade: { exposure: 1.3, whiteBalance: 6000, contrast: 1.04, saturation: 1.0 },
  }),
};

let S;

/** Drop the triangles of every mesh under `group` with ANY vertex satisfying pred(x, y, z) (world). */
function dropTriangles(group, pred) {
  group.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  group.traverse((m) => {
    if (!m.isMesh || !m.geometry.index) return;
    const g = m.geometry, P = g.attributes.position, I = g.index.array, keep = [];
    for (let i = 0; i < I.length; i += 3) {
      let hit = false;
      for (let k = 0; k < 3 && !hit; k++) { v.set(P.getX(I[i + k]), P.getY(I[i + k]), P.getZ(I[i + k])).applyMatrix4(m.matrixWorld); hit = pred(v.x, v.y, v.z); }
      if (!hit) keep.push(I[i], I[i + 1], I[i + 2]);
    }
    if (keep.length !== I.length) { g.setIndex(keep); g.computeBoundingSphere(); }
  });
}

export async function setup(ctx) {
  const { scene, camera } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: HDRI_ROT });
  const sun = sky.apply(scene);
  sun.intensity *= 1.5;
  scene.environmentIntensity = 0.85;
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  scene.add(sun, sun.target);

  // ---- ground: the town's trodden earth, the broad road east of the gate, fields beyond
  const N = makeNoise(3);
  // the town stands on a level shelf; beyond ~90 m the land rolls away in low hills
  const H = (x, z) => { const r = Math.hypot(x, (z - 2) * 1.1); return 0.03 * N.fbm(x * 0.3, z * 0.3, 3) + smooth(90, 420, r) * (18 + 30 * N.fbm(x * 0.004 + 3, z * 0.004, 4)) - 6 * smooth(90, 200, r) * smooth(0.0, 0.4, N.fbm(x * 0.01, z * 0.01, 2)); };
  const GATE = [CLING.gate.x, CLING.gate.z];
  const ground = heightfield({
    xs: gradedAxis(-400, 400, 240, 0, 2.2), zs: gradedAxis(-900, 300, 300, 0, 2.2), height: H,
    splat: (x, z) => {
      const inSq = Math.abs(x) < 23 && z > -21 && z < 30;
      const roadD = x > GATE[0] - 2 ? Math.abs(z - GATE[1] - 0.02 * (x - GATE[0]) - 1.5 * N.fbm(x * 0.02, 1, 2)) : 99;
      const road = 1 - smooth(3.2, 5.0, roadD);
      const town = 1 - smooth(55, 75, Math.hypot(x, z - 2));
      if (!inSq) {
        const g = smooth(0.1, 0.5, N.fbm(x * 0.12 + 7, z * 0.12, 3)) * 0.6;
        const earth = Math.max(town * (1 - g), road);
        return [0, earth * 0.25, earth * 0.75, (1 - earth)];
      }
      const damp = Math.max(smooth(5.6, 3.4, Math.hypot(x, z + 2)) * 0.9, 0.4 * smooth(0.3, 0.6, N.fbm(x * 0.2 + 9, z * 0.2, 3)));
      return [0.15, 0.55 * (1 - damp), 0.3 + damp, 0];
    },
    // the farmland is a patchwork of fields: pasture, hay meadow, stubble, a ploughed strip
    color: (x, z) => {
      const fx = Math.floor((x + 30 * N.fbm(z * 0.01, 1, 2)) / 85), fz = Math.floor((z + 30 * N.fbm(x * 0.01, 2, 2)) / 70);
      const h = Math.abs(Math.sin(fx * 12.9898 + fz * 78.233) * 43758.5453) % 1;
      const out = smooth(80, 120, Math.hypot(x, z - 2));
      const f = h < 0.45 ? [0.9, 1.0, 0.85] : h < 0.7 ? [1.25, 1.12, 0.75] : h < 0.88 ? [1.45, 1.2, 0.8] : [0.95, 0.75, 0.6];
      const v = 0.9 + 0.2 * N.fbm(x * 0.05, z * 0.05, 2);
      return f.map((c) => (1 + (c - 1) * out) * v);
    },
  });
  const gm = new THREE.Mesh(ground.geometry, await terrainMaterial(ctx, [
    { id: 'pbr/ph_floor_pebbles_01', scale: 0.8, tint: [0.42, 0.4, 0.37] },
    { id: 'pbr/acg_ground05', scale: 1.0, tint: [0.42, 0.37, 0.3] },
    { id: 'pbr/acg_ground24', scale: 1.2, tint: [0.36, 0.31, 0.25] },
    { id: 'pbr/acg_ground037', scale: 2.0, tint: [0.4, 0.45, 0.3] },
  ], { macro: 0.6, macroScale: 0.02, detailNear: 40, detailFar: 500, minRoughness: 0.75, vertexColors: true }));
  gm.receiveShadow = true; scene.add(gm);

  // hedgerows, copses and single trees on the farmland round the town (clumps of foliage)
  {
    const foliage = foliageMaterial({ color: [0.035, 0.055, 0.022], leafScale: 3.5 });
    const R0 = makeNoise(9);
    scene.add(scatter(bushGeometry(2, 4), foliage, 14000, (rng) => {
      const x = -700 + rng() * 1400, z = -900 + rng() * 1000;
      const r = Math.hypot(x, z - 2);
      if (r < 95) return null;
      // hedges along field boundaries (a warped grid), copses where the noise is high
      const fx = (x + 40 * R0.fbm(z * 0.01, 1, 2)) / 85, fz = (z + 40 * R0.fbm(x * 0.01, 2, 2)) / 70;
      const hedge = Math.min(Math.abs(fx - Math.round(fx)), Math.abs(fz - Math.round(fz))) < 0.035;
      const copse = R0.fbm(x * 0.006 + 5, z * 0.006, 3) > 0.32;
      if (!hedge && !copse && rng() > 0.01) return null;
      const s = copse ? 2.5 + rng() * 3.5 : 1.6 + rng() * 2.0;
      const lift = copse ? 2 + rng() * 5 : rng() * 1.5;                  // crowns at different heights
      return { p: [x, H(x, z) - 0.4 + lift, z], s: [s * (0.8 + rng() * 0.6), s * (0.7 + rng() * 0.5), s * (0.8 + rng() * 0.6)], c: [0.6 + rng() * 0.4, 0.7 + rng() * 0.35, 0.65] };
    }, 13));
  }

  // ---- the set: Cling square (architecture library); hero detail near the action
  const set = await clingSquare(ctx, { focus: [[CLING.stall.x, CLING.stall.z], [CLING.music.x, CLING.music.z], [0, -2], [WATCH.x, WATCH.z], [-6, -18], [CLING.gate.x, CLING.gate.z], [CLING.arch.x, CLING.arch.z]], heroR: 10, far: 45 });
  scene.add(set.group);
  // the wild wall: the south rows behind the camera (and the back row behind them) are struck;
  // the king's steps, their terrace and the stone support stay
  const st = CLING.steps;
  dropTriangles(set.group.children.find((g) => g.name === 'cling-south'), (x, y, z) => z > 30 || (z > 24.3 && (x < st.x - st.w / 2 - 0.4 || x > st.x + st.w / 2 + 2.2)));
  scene.add(grassField({ count: 3500, height: [0.05, 0.26], seed: 4, color: [0.05, 0.075, 0.025], dry: [0.22, 0.19, 0.1], dryAmount: 0.5, place: wallFootPlacer(houseFootSegments(set.houses.filter((h) => h.side !== 'south'))) }));
  const M = set.materials;

  // ---- the festival: stalls (vendor stall left-centre), bunting, banners
  const town = await townKit(ctx, { slate: null, dark: null }, { groundY: 0 });
  const T = { clothMaterial, clothSheet };
  const food = foodMaterials();
  const props = new Kit(0);
  const A = { block, yawFrame, sub, makeRand, crate, sack, barrel };
  const STALLS = [
    // [x, z, yaw, goods, awning colours, stripe]
    [CLING.stall.x, CLING.stall.z, 0.12, ['bread', 'rolls', 'apples'], [[0.3, 0.055, 0.035], [0.46, 0.41, 0.31]], 2.6],     // the vendor stall (left-centre)
    [-14.2, -7.5, 0.55, ['cheese', 'onions', 'veg'], [[0.08, 0.1, 0.035], [0.42, 0.38, 0.29]], 0],
    [-3.5, -12.6, 0.0, ['fish', 'bread'], [[0.06, 0.09, 0.17], [0.44, 0.4, 0.31]], 2.2],
    [10.5, -11.5, -0.25, ['apples', 'onions', 'rolls'], [[0.36, 0.25, 0.05], [0.44, 0.4, 0.3]], 0],
    [15.2, -3.2, -1.15, ['veg', 'cheese'], [[0.24, 0.07, 0.03], [0.34, 0.2, 0.06]], 2.4],
  ];
  STALLS.forEach(([x, z, yaw, gds, cols, stripe], i) => scene.add(marketStall(props, A, T, food, [x, z], yaw, { goods: gds, color: cols[0], color2: cols[1], stripe, seed: 11 + i, w: i === 0 ? 3.4 : 2.8 })));
  scene.add(props.build(M, { name: 'stalls' }));
  // bunting strung between the upper storeys across the square, deep swags; banners on the north row
  const B = (a, b, sag) => scene.add(town.bunting(new THREE.Vector3(...a), new THREE.Vector3(...b), { sag, every: 0.7, size: 0.3, colors: [[0.24, 0.035, 0.02], [0.3, 0.2, 0.03], [0.035, 0.05, 0.11], [0.3, 0.26, 0.19], [0.07, 0.1, 0.035]] }));
  B([-19.5, 6.4, -6], [19.5, 6.6, -12], 2.4); B([-12, 6.8, -17.6], [-19.6, 6.2, 12], 2.2); B([11, 7.0, -17.6], [19.6, 6.5, 14], 2.2); B([-19.5, 6.0, 4], [6, 6.8, -17.6], 2.6);
  const dyes = [[[0.3, 0.05, 0.035], [0.45, 0.4, 0.3]], [[0.4, 0.29, 0.05], null], [[0.05, 0.08, 0.17], [0.42, 0.38, 0.3]], [[0.25, 0.08, 0.03], null], [[0.1, 0.14, 0.05], null]];
  const north = set.houses.filter((h) => h.side === 'north' && !h.back && Math.abs(h.center[1] - CLING.square.z0) < 6).sort((a, b) => a.center[0] - b.center[0]);
  north.filter((_, i) => i % 2 === 1).slice(0, 4).forEach((h, i) => {
    const b = town.banner({ w: 1.0, h: 3.2, color: dyes[i][0], color2: dyes[i][1] || dyes[i][0], stripe: i === 2 ? 3 : 0, seed: i + 2 });
    b.position.set(h.center[0] + (i % 2 ? 1.2 : -1.2), 6.9, CLING.square.z0 + 0.35);
    scene.add(b);
  });

  // ---- people: the humans library's cast builds (PROVISIONAL looks)
  const people = [];
  const put = async (id, x, z, face, o = {}) => {
    const ch = await loadCharacter(id);
    placeCharacter(ch, x, H(x, z), z, typeof face === 'number' ? face : Math.atan2(face[0] - x, face[1] - z));
    scene.add(ch.root);
    people.push({ ch, o, x, z });
    return ch;
  };
  // the musicians right of centre (lute and recorder), facing the square, a ring of listeners
  const mu = CLING.music;
  await put('musician', mu.x - 0.6, mu.z - 0.4, [mu.x - 6, mu.z + 12]);
  await put('musician2', mu.x + 0.7, mu.z - 0.6, [mu.x - 4, mu.z + 12]);
  // the vendor behind the counter of the vendor stall; a parent and child at the counter
  await put('vendor', CLING.stall.x + 0.3, CLING.stall.z - 0.9, [CLING.stall.x, CLING.stall.z + 6]);
  const parent = await put('parent', CLING.stall.x - 0.7, CLING.stall.z + 1.25, [CLING.stall.x - 0.4, CLING.stall.z]);
  const child = await put('child', CLING.stall.x - 0.25, CLING.stall.z + 1.45, [CLING.stall.x, CLING.stall.z]);
  joinHands(parent, child);
  // the crowd: villagers at the stalls, round the fountain, listening to the music; children
  let a = 98765; const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
  const spots = [];
  const near = (x, z, d) => spots.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < d);
  const free = (x, z) => Math.hypot(x, z + 2) > 4.1 && !STALLS.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 1.9) && Math.hypot(x - WATCH.x, z - WATCH.z) > 2.2 && Math.hypot(x - mu.x, z - mu.z) > 1.5 && !near(x, z, 0.85);
  const tryPut = async (id, x, z, face) => { if (!free(x, z)) return false; spots.push([x, z]); await put(id, x, z, face); return true; };
  // listeners round the musicians (they face the music)
  for (let i = 0; i < 9; i++) { const an = -0.3 + i * 0.55, rr = 2.6 + r() * 0.8; const x = mu.x + Math.cos(an) * rr, z = mu.z + 0.6 + Math.sin(an) * rr; await tryPut(CROWD[(i * 5) % 18], x, z, [mu.x, mu.z]); }
  // at the stalls (in front of the counters, facing them)
  for (let k = 1; k < STALLS.length; k++) {
    const [sx, sz, yaw] = STALLS[k];
    for (let j = 0; j < 2; j++) { const lx = (j - 0.5) * 1.3 + (r() - 0.5) * 0.4, lz = 1.35 + r() * 0.3; const x = sx + Math.cos(yaw) * lx + Math.sin(yaw) * lz, z = sz - Math.sin(yaw) * lx + Math.cos(yaw) * lz; await tryPut(CROWD[(k * 7 + j * 3) % 18], x, z, [sx, sz]); }
  }
  // round the fountain and crossing the square
  for (let i = 0; i < 16; i++) {
    const x = -16 + r() * 32, z = -14 + r() * 26;
    const id = CROWD[(i * 11 + 3) % 18];
    await tryPut(id, x, z, r() < 0.5 ? [0, -2] : [x + (r() - 0.5) * 8, z + (r() - 0.5) * 8]);
  }
  // children by the fountain's rim
  await tryPut('crowd18', 2.6, 1.6, [0, -2]); await tryPut('crowd13', -3.4, 1.0, [0, -2]);

  // ---- the watchman at the west edge of the square, pointing north at her
  const watchman = await loadCharacter('watchman');
  scene.add(watchman.root);

  // ---- Starlight with Queen Fall in the riding rig (provisional designs; no glow)
  const star = await createCreature('starlight', { quality: 'hero' });
  scene.add(star.root);
  const human = await loadHuman();
  mountRider(star, createSaddle(star, {}), createRider(human, { outfit: 'fall', lean: 0.25 }));

  camera.near = 0.2; camera.far = 40000;
  S = { sun, sunDir: sky.sun.direction.clone(), star, watchman, people, M, H };
}

export function update(t, ctx) {
  const { sun, sunDir, star, watchman, people, M, H } = S;
  // Starlight gliding in, nearly head-on, a slight bank; she grows slowly as she approaches
  star.setPose(poses.glide(star, { t, bank: -0.1, dihedral: 0.14, look: [0.04, -0.12] }));
  star.root.position.set(STAR.x - (t - 2) * 2, STAR.y - (t - 2) * 1.2, STAR.z + (t - 2) * 22);
  star.root.rotation.set(0.1, STAR.yaw, 0, 'YXZ');
  star.root.updateMatrixWorld(true);
  const head = new THREE.Vector3().setFromMatrixPosition(star.bones[star.boneIndex.head].matrixWorld);

  // people: idle motion; a few have seen her (heads turn north-up), most have not
  people.forEach(({ ch }, i) => {
    ch.update(t);
    if (i % 6 === 5) lookAtPoint(ch, head, 0.8);
  });
  // the watchman: at the edge of the square, his pointing arm straight at her
  watchman.update(t);
  const toS = head.clone().sub(new THREE.Vector3(WATCH.x, 1.5, WATCH.z));
  placeCharacter(watchman, WATCH.x, H(WATCH.x, WATCH.z), WATCH.z, Math.atan2(toS.x, toS.z) + 0.35);
  watchman.update(t);
  {
    const sh = bonePos(watchman, 'upperarm01.R');
    const dir = head.clone().sub(sh).normalize();
    limbIK(watchman, 'arm', 'R', sh.clone().addScaledVector(dir, 0.62), sh.clone().add(new THREE.Vector3(0, -0.5, 0)).addScaledVector(dir, -0.1));
    lookAtPoint(watchman, head, 0.9);
  }

  const cam = ctx.camera;
  cam.position.set(...CAM_P);
  cam.lookAt(...CAM_T);
  applyShake(cam, t, { kind: 'aerial', amount: 0.05, seed: 6 });
  cam.updateMatrixWorld(true);
  if (t === 2) {
    cam.filmGauge = 24.89; cam.setFocalLength(LENS); cam.updateProjectionMatrix();
    const scr = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(cam); return [+(0.5 + v.x / 2).toFixed(3), +(0.5 - v.y / 2).toFixed(3)]; };
    console.warn('[f5] screen', JSON.stringify({ arch: scr(CLING.arch.x, 3, CLING.arch.z), gate: scr(CLING.gate.x, 3, CLING.gate.z), fountain: scr(0, 2, -2), stall: scr(CLING.stall.x, 1, CLING.stall.z), music: scr(CLING.music.x, 1, CLING.music.z), watchman: scr(WATCH.x, 1, WATCH.z), star: scr(star.root.position.x, star.root.position.y, star.root.position.z), support: scr(CLING.support.x, 2, CLING.support.z) }));
    const bb = new THREE.Box3().setFromObject(star.root);
    console.warn('[f5] starlight bbox', bb.min.toArray().map((v) => v.toFixed(1)).join(','), bb.max.toArray().map((v) => v.toFixed(1)).join(','));
  }
  // the fountain's water runs (pure in t)
  for (const k of ['pool', 'jet', 'foam', 'puddle']) { const u = M[k]?.userData?.dkUniforms?.akTime; if (u) u.value = t; }
  sun.target.position.set(0, 0, 0);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, 250);
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = LENS;
  ctx.lens.fstop = 5.6;
  ctx.lens.focus = 48;
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 400;
}
