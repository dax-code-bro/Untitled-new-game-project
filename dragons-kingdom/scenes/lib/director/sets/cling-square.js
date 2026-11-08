// Shot director set - CLING_SQUARE (scene 1C, X5 / R3: Cling, the morning before the festival).
//
// The town square of Cling from the libraries, plus the moving pieces the X5 shots need. Nothing here
// edits another set: the square, its houses and roofs are the architecture library's clingSquare()
// (scenes/lib/architecture/cling.js), built from the SAME house() / roof / masonry builders and the same
// archMaterials() stone + oak + clay as VERDOR_AERIAL's terrace rows and VERDOR_HARBOR's quay; the land
// round the town is the nature library's loadClingLand() (fields, hedges, woods, the broad road east).
// Fixed landmarks (CLING layout, metres, north = -z, the square at the origin, paving y ~0):
//   paving     the square's uneven setts (clingSquare paving: worn paths, a kennel from the fountain)
//   fountain   [0, -2], octagonal basin r 3 round the central stone pillar (3.4 m), four running spouts
//   steps      the king's steps, south edge x 4, z 18 rising south; the stone support beside them [13.3, 19.4]
//   arch       the stone arch, west side [-19.6, 16.5] (a passage through a house of the west row)
//   gate       the gate onto the broad road, east side [20.4, 4.75] (the town wall either side, 3.6 m)
//   alley      north row gap behind the vendor stall, x -8.6 (z -18 going north)
//   music      the music space [7, 1.5]: a low timber dais, a bench and stools (this file)
//   watch      the watchman's platform on the town wall NORTH of the gate (this file): timber deck 4.7 m up
//              over the wall walk, a rail, a ladder up from the square; it looks east over the road's roofs,
//              the fields and the road (X5-15/16/17)
//   stall      the vendor's stall [-8.5, 3] (this file, built in X5-04): his handcart (props library handcart,
//              its wheels split off so they roll) as the counter, four poles, two crossbars, a cloth roof
// Shot state (spec `set`):
//   stall: { cart: 'follow' (the cart runs ahead of the vendor's blocking) | [[t, [x, z]], ...] | absent (rest),
//            lift (cart shafts raised, rad), poles: [k0..k3] (0 on the cart .. 1 standing: numbers or keys),
//            bars: [kFront, kBack], cloth: k (0 rolled on the cart .. 1 spread), low: m (the front-left corner
//            hangs this much lower), rock: { amp, hz, until, amp2, until2 } (the front-left leg rocking),
//            stones: [t1, t2] (the wedges slide in under that leg), off: k (the cloth half off its frame),
//            snag: { a, b } (the ladder carried by actors a (front) and b catches the low corner and drags it) }
//            stall: false hides the whole stall + cart (before the vendor comes)
//   ladder: { a, b } the ladder on the shoulders of actors a (front) and b (behind)
//   birds: [{ on: 'roof' | [x, y, z], yaw, peck }]   shadowAt, shadowExtent
import * as THREE from 'three';
import { clingSquare, CLING, wallFootPlacer, houseFootSegments } from '../../architecture/cling.js';
import { Kit as AKit, block, frame, xf, makeRand } from '../../architecture/core.js';
import { loadClingLand } from '../../nature/farmland.js';
import { grassField } from '../../sets/grass.js';
import { loadPBR } from '../../assets.js';
import { propMaterials } from '../../props/materials.js';
import { Kit as PKit, yawFrame as pYaw, rng as pRng } from '../../props/core.js';
import { handcart, wheel, containerMats } from '../../props/containers.js';
import { filmFinish } from '../../../lookdev/finish.js';
import { keyed } from '../timeline.js';
import { actorState } from '../blocking.js';

export function cinematic() {
  return filmFinish({
    atmosphere: { enabled: true, sky: 'physical', haze: 2.4, mieG: 0.8, sunDirection: null, sunIlluminance: 6, apDistanceScale: 2.2, environment: true },
    volumetrics: {
      enabled: true, range: 1500, near: 0.5, resolution: [192, 96, 64], noiseFilter: true, intensity: 1.0,
      density: 0.0003, heightFalloff: 0.02, fogBase: 0, anisotropy: 0.7, noiseScale: 0.01, noiseAmount: 0.5, wind: [0.6, 0, 0.2],
      banks: [{ center: [0, 4, -600], radius: [1400, 14, 500], density: 0.0012, noise: 0.8 }],     // the last morning mist over the fields north
    },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.8 },
    dof: { samples: 40 },
    grade: { exposure: 0, whiteBalance: 5700, contrast: 1.05, saturation: 1.0 },
  });
}

/** The stall (vendor X5-04..08, R3): pole feet, heights, the cloth corners (fl = front-left, screen left from the square) */
export const STALL = {
  c: [-8.5, 3.0], x0: -9.85, x1: -7.15, zf: 4.05, zb: 1.75, hf: 2.1, hb: 2.4,
  corner: { fl: [-9.97, 4.2], fr: [-7.03, 4.2], bl: [-9.97, 1.6], br: [-7.03, 1.6] },
  offFL: [-9.25, 0.95, 4.5],                     // where the front-left corner hangs once the cloth is dragged half off
};
export const MUSIC = { at: [7, 1.5], w: 3.2, d: 2.4, h: 0.28 };
export const WATCH = { x0: 18.6, x1: 21.8, z0: -2.4, z1: 0.6, deck: 4.7, ladderX: 18.2 };
const PAVE = 0.03;
const K = (v, t) => keyed(t, v);
/** a per-item list ([v0, v1, ...] of numbers or key lists) rather than one key list [[t, v], ...] */
const perItem = (v, n) => Array.isArray(v) && v.length === n && v.every((e) => typeof e === 'number' || (Array.isArray(e) && Array.isArray(e[0])));
const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

/** drop the triangles of every mesh under `group` with ANY vertex satisfying pred(x, y, z) (group-local coords at build) */
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

export async function build(ctx, { spec, shotSpecs = {} } = {}) {
  const { scene, camera } = ctx;
  const draft = ctx.preset === 'draft' || ctx.preset === 'preview';
  const used = (pred) => Object.values(shotSpecs).some(pred);

  // ---- sun (direction from the registry continuity each shot)
  const sun = new THREE.DirectionalLight(0xffe6c8, 5.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // ---- the land round the town (fields, hedges, woods, the broad road) - the square sits on its level shelf
  const land = await loadClingLand(ctx, { views: [[0, 2, 4], [20, 6.4, -1]], woods: true, maxDistance: draft ? 2500 : 3500 });
  const dy = -0.06 - land.heightAt(0, 2);
  land.group.position.y = dy;
  scene.add(land.group);
  const S = CLING.square;
  const inSquare = (x, z) => x > S.x0 + 0.4 && x < S.x1 - 0.4 && z > S.z0 + 0.4 && z < CLING.steps.z - 0.1;
  const ground = (x, z) => {
    if (x >= WATCH.x0 && x <= WATCH.x1 && z >= WATCH.z0 && z <= WATCH.z1) return WATCH.deck;
    if (Math.hypot(x - MUSIC.at[0], z - MUSIC.at[1]) < 0.01) return PAVE;
    return inSquare(x, z) ? PAVE : Math.max(PAVE, land.heightAt(x, z) + dy);
  };

  // ---- the square (architecture library: houses + roofs + stone as the Verdor sets, the fixed landmarks)
  const set = await clingSquare(ctx, {
    focus: [[CLING.stall.x, CLING.stall.z], [0, -2], [CLING.music.x, CLING.music.z], [CLING.gate.x, CLING.gate.z], [CLING.arch.x, CLING.arch.z], [CLING.steps.x, CLING.steps.z]],
    heroR: draft ? 7 : 11, far: 45,
  });
  scene.add(set.group);
  const M = set.materials;
  scene.add(grassField({ count: draft ? 2200 : 4000, height: [0.05, 0.24], seed: 4, color: [0.05, 0.075, 0.025], dry: [0.22, 0.19, 0.1], dryAmount: 0.5, place: wallFootPlacer(houseFootSegments(set.houses)) }));

  // ---- fixed timber pieces (architecture kit, its oak): the music dais, the watchman's platform
  const tk = new AKit(0);
  const rr = makeRand(707);
  const oakB = (x, y, z, sx, sy, sz, mat = 'oak') => block(tk.get(mat), frame([x, y, z]), sx, sy, sz, { r: 0.012, seg: 0.4, seed: rr(), noise: 0.003, nf: 4 });
  { // music space: a low plank dais, a bench along its back, two stools
    const [mx, mz] = MUSIC.at;
    for (let i = 0; i < 8; i++) oakB(mx - MUSIC.w / 2 + (i + 0.5) * MUSIC.w / 8, MUSIC.h - 0.03, mz, MUSIC.w / 8 - 0.012, 0.05, MUSIC.d, i % 3 ? 'oak' : 'oakSilver');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) oakB(mx + sx * (MUSIC.w / 2 - 0.12), (MUSIC.h - 0.05) / 2, mz + sz * (MUSIC.d / 2 - 0.12), 0.14, MUSIC.h - 0.05, 0.14, 'oakDark');
    oakB(mx, MUSIC.h + 0.42, mz - MUSIC.d / 2 + 0.35, 2.2, 0.06, 0.32);
    for (const sx of [-0.9, 0.9]) oakB(mx + sx, MUSIC.h + 0.2, mz - MUSIC.d / 2 + 0.35, 0.08, 0.42, 0.28, 'oakDark');
    for (const [sx, sz] of [[-0.6, 0.4], [0.7, 0.55]]) { oakB(mx + sx, MUSIC.h + 0.43, mz + sz, 0.34, 0.05, 0.34); oakB(mx + sx, MUSIC.h + 0.2, mz + sz, 0.06, 0.4, 0.06, 'oakDark'); }
  }
  { // the watchman's platform on the wall north of the gate: posts on the square side, deck, rail, a ladder up
    const W = WATCH, y = W.deck;
    for (const x of [W.x0 + 0.1, W.x1 - 0.1]) for (const z of [W.z0 + 0.1, W.z1 - 0.1]) oakB(x, y / 2, z, 0.2, y, 0.2, 'oakDark');
    for (const z of [W.z0 + 0.1, W.z1 - 0.1]) oakB((W.x0 + W.x1) / 2, y - 0.16, z, W.x1 - W.x0, 0.2, 0.16, 'oakDark');
    const n = 11;
    for (let i = 0; i < n; i++) oakB((W.x0 + W.x1) / 2, y, W.z0 + (i + 0.5) * (W.z1 - W.z0) / n, W.x1 - W.x0 + 0.2, 0.06, (W.z1 - W.z0) / n - 0.015, i % 4 ? 'oak' : 'oakSilver');
    for (const x of [W.x0 + 0.1, W.x1 - 0.1]) for (const z of [W.z0 + 0.1, W.z1 - 0.1]) oakB(x, y + 0.55, z, 0.12, 1.1, 0.12);
    oakB(W.x1 - 0.1, y + 1.05, (W.z0 + W.z1) / 2, 0.08, 0.1, W.z1 - W.z0);                       // the rail on the road side
    for (const z of [W.z0 + 0.1, W.z1 - 0.1]) oakB((W.x0 + W.x1) / 2, y + 1.05, z, W.x1 - W.x0, 0.1, 0.08);
    // braces under the deck
    for (const z of [W.z0 + 0.1, W.z1 - 0.1]) block(tk.get('oakDark'), frame([W.x0 + 0.65, y - 0.8, z], [0.7071, 0.7071, 0], [-0.7071, 0.7071, 0]), 1.5, 0.12, 0.12, { r: 0.01, seed: rr() });
    // the ladder: two stiles leaning on the deck edge from the square, rungs every 0.3 m
    const lx = W.ladderX, lz = (W.z0 + W.z1) / 2, lean = (W.x0 - lx) / y, L = Math.hypot(y + 0.9, (W.x0 - lx) * (y + 0.9) / y);
    const ax = [lean / Math.hypot(1, lean), 1 / Math.hypot(1, lean), 0];
    for (const s of [-0.24, 0.24]) block(tk.get('oak'), frame([lx + ax[0] * L / 2, ax[1] * L / 2, lz + s], [ax[1], -ax[0], 0], ax), 0.07, L, 0.05, { r: 0.008, seed: rr() });
    for (let h = 0.3; h < y; h += 0.3) block(tk.get('oak'), frame([lx + lean * h, h, lz]), 0.045, 0.045, 0.5, { r: 0.006, seed: rr() });
  }
  const fixed = tk.build(M, { name: 'cling-timber' });
  fixed.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(fixed);

  // ---- materials of the moving pieces
  const tryPBR = async (id, opts, fallback) => { try { return await loadPBR(id, ctx, opts); } catch (e) { console.warn(`[cling-square] ${id}: ${e.message}`); return fallback; } };
  const std = (color, rough = 0.85, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...o });
  const poleMat = await tryPBR('pbr/acg_wood35', { repeat: [1, 6], color: new THREE.Color(0.62, 0.5, 0.38) }, std(0x5e4a35, 0.85));
  const stoneMat = await tryPBR('pbr/acg_rock26', { repeat: [0.4, 0.4], color: new THREE.Color(0.72, 0.68, 0.62) }, std(0x8a847a, 0.9));
  const clothMat = std(0x7a2e1c, 0.95, { side: THREE.DoubleSide });
  const ropeMat = std(0x8c7a5a, 0.95);

  // ---- the handcart (props library), its wheels split off so they roll
  const PM = containerMats(await propMaterials(ctx));
  const cartRoot = new THREE.Group(); cartRoot.name = 'cart';
  const pivot = new THREE.Group(); pivot.position.set(-0.1, 0.48, 0); cartRoot.add(pivot);
  const R = 0.48, CW = 0.95;
  {
    const k = new PKit();
    handcart(k, pYaw([0, 0, 0], 0), pRng(17), { r: R, w: CW });
    const body = k.build(PM, { name: 'cart-body' });
    dropTriangles(body, (x, y, z) => Math.abs(z) > CW / 2 + 0.06 && Math.hypot(x + 0.1, y - R) < R + 0.04);
    body.position.set(0.1, -R, 0);
    pivot.add(body);
  }
  const wheels = [-1, 1].map((s) => {
    const k = new PKit();
    wheel(k, pYaw([0, 0, 0], 0), pRng(23 + s), { r: R });
    const w = k.build(PM, { name: 'cart-wheel' });
    const hold = new THREE.Group();
    hold.position.set(-0.1, R, s * (CW / 2 + 0.2));
    if (s < 0) hold.rotation.y = Math.PI;
    hold.add(w);
    cartRoot.add(hold);
    return { w, s };
  });
  const grip = new THREE.Object3D(); grip.position.set(1.98, 0.28, 0); pivot.children[0].add(grip);     // the shaft ends (body frame)
  // the goods / gear on the bed: the stall's poles and bars ride on it until they go up; a rolled cloth
  const bedTop = new THREE.Object3D(); bedTop.position.set(0, 0.62, 0); pivot.children[0].add(bedTop);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.6, 12), clothMat);
  roll.rotation.x = Math.PI / 2; roll.rotation.z = Math.PI / 2; roll.position.set(-0.25, 0.18, 0); bedTop.add(roll);
  cartRoot.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(cartRoot);

  // ---- the stall: poles, bars, cloth (world objects: interpolated from the cart bed to their places)
  const T = STALL;
  const poleDefs = [[T.x0, T.zf, T.hf], [T.x1, T.zf, T.hf], [T.x0, T.zb, T.hb], [T.x1, T.zb, T.hb]];   // fl, fr, bl, br
  const cylY = new THREE.CylinderGeometry(1, 1, 1, 9);
  const poles = poleDefs.map(([x, z, h], i) => {
    const m = new THREE.Mesh(cylY, poleMat); m.scale.set(0.045, h + 0.08, 0.045); m.castShadow = m.receiveShadow = true; m.name = `pole${i}`;
    scene.add(m); return { m, x, z, h };
  });
  const barDefs = [[T.zf, T.hf], [T.zb, T.hb]];
  const bars = barDefs.map(([z, h]) => {
    const m = new THREE.Mesh(cylY, poleMat); m.scale.set(0.04, T.x1 - T.x0 + 0.3, 0.04); m.castShadow = m.receiveShadow = true;
    scene.add(m); return { m, z, h };
  });
  const NU = 14, NV = 10;
  const clothGeo = new THREE.PlaneGeometry(1, 1, NU, NV);
  const cloth = new THREE.Mesh(clothGeo, clothMat); cloth.castShadow = true; cloth.receiveShadow = true; cloth.frustumCulled = false; cloth.name = 'cloth';
  scene.add(cloth);
  const ties = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5), ropeMat); m.castShadow = true; scene.add(m); return m; });
  const wedges = [0, 1].map((i) => {
    const g = new THREE.BoxGeometry(0.17, 0.035 - i * 0.008, 0.12, 2, 1, 2);
    const p = g.attributes.position; for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (1 - 0.15 * Math.abs(p.getZ(k)) * 5), p.getY(k), p.getZ(k));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, stoneMat); m.castShadow = m.receiveShadow = true; scene.add(m); return m;
  });
  const legFoot = new THREE.Object3D(); legFoot.position.set(T.x0, PAVE, T.zf); scene.add(legFoot);
  const cornerObj = { fl: new THREE.Object3D(), fr: new THREE.Object3D(), bl: new THREE.Object3D(), br: new THREE.Object3D() };
  for (const o of Object.values(cornerObj)) scene.add(o);

  // ---- the ladder (two villagers carry it on their shoulders: X5-07)
  const ladder = new THREE.Group(); ladder.name = 'ladder';
  const LL = 4.8;
  for (const s of [-0.21, 0.21]) { const r = new THREE.Mesh(new THREE.BoxGeometry(LL, 0.07, 0.045), poleMat); r.position.z = s; ladder.add(r); }
  for (let x = -LL / 2 + 0.25; x < LL / 2 - 0.1; x += 0.3) { const g = new THREE.Mesh(cylY, poleMat); g.scale.set(0.018, 0.42, 0.018); g.rotation.x = Math.PI / 2; g.position.x = x; ladder.add(g); }
  ladder.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const ladA = new THREE.Object3D(), ladB = new THREE.Object3D(), ladEnd = new THREE.Object3D();
  ladder.add(ladA, ladB, ladEnd);
  scene.add(ladder);

  // ---- birds (a pigeon or two on the roofs: X5-09)
  const birdMat = std(0x55585e, 0.7), birdDark = std(0x2b2d31, 0.7);
  const makeBird = () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), birdMat); body.scale.set(1.0, 0.85, 1.6); body.position.y = 0.09; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), birdDark); head.position.set(0, 0.2, -0.12); head.name = 'head'; g.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.015, 0.14), birdDark); tail.position.set(0, 0.1, 0.19); tail.rotation.x = -0.3; g.add(tail);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(g); return g;
  };
  const birds = [makeBird(), makeBird()];
  // roof ridges of the north row near the middle of the square (perches)
  const northFront = set.houses.filter((h) => h.side === 'north' && !h.back && Math.abs(h.center[1] - S.z0) < 6 && h.ridge).sort((a, b) => Math.abs(a.center[0]) - Math.abs(b.center[0]));
  const perch = (i) => { const h = northFront[i % Math.max(1, northFront.length)]; return h ? xf(h.frame, 0.4 * (i % 2 ? -1 : 1), h.ridge + 0.02, 0) : [i * 2, 8, -18]; };

  camera.near = 0.05; camera.far = 30000; camera.updateProjectionMatrix();
  const marks = {
    fountain: [0, PAVE, -2], pillar: [0, 2.2, -2], steps: [CLING.steps.x, 0.6, CLING.steps.z + 1], support: [CLING.support.x, 1.2, CLING.support.z],
    arch: [CLING.arch.x, 2.6, CLING.arch.z], gate: [CLING.gate.x, 2.4, CLING.gate.z], alley: [CLING.alley.x, 2.2, CLING.alley.z],
    music: [MUSIC.at[0], MUSIC.h, MUSIC.at[1]], stall: [T.c[0], PAVE, T.c[1]], watch: [(WATCH.x0 + WATCH.x1) / 2, WATCH.deck, (WATCH.z0 + WATCH.z1) / 2],
    road: [70, ground(70, 6), 6],
  };

  // ---- per-shot evaluation helpers
  const _q = new THREE.Quaternion(), _q0 = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
  const QZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);   // cylinder y -> along z
  const QX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);   // cylinder y -> along x
  /** state of a cast actor at shot time t (blocking is pure) */
  const stateOf = (info, name, t) => { const d = info.spec.cast?.[name]; return d ? actorState(d, t, info.env) : null; };
  /** where the cart is: following the vendor (ahead of him, south) / keyed / at rest; distance rolled */
  const CART_AHEAD = 2.35;
  const cartAt = (info, st, t) => {
    const c = st.cart;
    if (c === 'follow') { const s = stateOf(info, 'vendor', Math.min(t, st.followUntil ?? 1e9)); if (s) return [s.x, s.z + CART_AHEAD]; }
    else if (Array.isArray(c)) return K(c, t);
    return T.c;
  };
  /** the ladder's ends from its two carriers (left shoulders) */
  const ladderAt = (info, lad, t) => {
    const a = stateOf(info, lad.a, t), b = stateOf(info, lad.b, t);
    if (!a || !b) return null;
    const dir = [a.x - b.x, a.z - b.z], L = Math.hypot(...dir) || 1, u = [dir[0] / L, dir[1] / L];
    const left = [u[1], -u[0]];                                   // walking along u, the left hand side
    const off = 0.28, y = 1.47;
    const A = [a.x + left[0] * off, y, a.z + left[1] * off], B = [b.x + left[0] * off, y, b.z + left[1] * off];
    const ov = (LL - L) / 2;
    return { A, B, u, left, front: [A[0] + u[0] * ov, y, A[2] + u[1] * ov], mid: [(A[0] + B[0]) / 2, y, (A[2] + B[2]) / 2] };
  };
  let lastCloth = null;

  return {
    marks,
    objects: { cart: cartRoot, cartGrip: grip, ladder, ladderA: ladA, ladderB: ladB, legFoot, clothFL: cornerObj.fl, clothFR: cornerObj.fr, clothBL: cornerObj.bl, clothBR: cornerObj.br, bird1: birds[0], bird2: birds[1] },
    ground,
    houses: set.houses,
    applyShot(info) {
      const st = info.spec.set || {}, c = info.cont, t = info.local;
      // sun + its shadow box
      const sd = new THREE.Vector3(...(c.sun || [0.45, 0.22, 0.86])).normalize();
      const at = st.shadowAt ? K(st.shadowAt, t) : [-2, 0, 4];
      const ext = st.shadowExtent ?? 48;
      sun.target.position.set(at[0], at[1], at[2]);
      sun.position.copy(sun.target.position).addScaledVector(sd, 400);
      const sc = sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 50; sc.far = 800; sc.updateProjectionMatrix();
      sun.target.updateMatrixWorld();

      // ---- the stall
      const stall = st.stall;
      const show = stall !== false && stall != null;
      cartRoot.visible = show; roll.visible = show;
      for (const o of [...poles.map((p) => p.m), ...bars.map((b) => b.m), cloth, ...ties, ...wedges]) o.visible = show;
      if (show) {
        const S0 = typeof stall === 'object' ? stall : {};
        // the cart: place, a jolt over the setts while it rolls, the shafts lifted while pushed
        const p = cartAt(info, S0, t), p0 = cartAt(info, S0, 0);
        const rolled = Math.hypot(p[0] - p0[0], p[1] - p0[1]) + (S0.rolled0 ?? 0);
        const moving = Math.hypot(...[0, 1].map((i) => cartAt(info, S0, t + 0.05)[i] - p[i])) > 0.002;
        const jolt = S0.jolt ? K(S0.jolt, t) : 0;
        cartRoot.position.set(p[0], PAVE - 0.01 + jolt, p[1]);
        cartRoot.rotation.set(0, Math.PI / 2, 0);                                   // shafts to the north (the vendor pushes south)
        pivot.rotation.z = S0.lift != null ? K(S0.lift, t) : (moving ? 0.3 : 0) + jolt * 0.6;
        for (const { w, s } of wheels) w.rotation.z = s * rolled / R;
        roll.visible = !(K(S0.cloth ?? 1, t) > 0);
        cartRoot.updateMatrixWorld(true);
        bedTop.updateMatrixWorld(true);
        // poles: from the bed (lying along the cart) to standing at their feet; the front-left one rocks
        const rock = S0.rock;
        let rockA = 0;
        if (rock) {
          const amp = t < (rock.until ?? 0) ? rock.amp : t < (rock.until2 ?? 0) ? (rock.amp2 ?? rock.amp * 0.4) : 0;
          rockA = amp * Math.sin(2 * Math.PI * (rock.hz ?? 1.4) * t);
        }
        const pk = S0.poles ?? [1, 1, 1, 1];
        poles.forEach((P, i) => {
          const k = Math.min(1, Math.max(0, K(perItem(pk, 4) ? pk[i] : pk, t)));
          const up = _v.set(P.x, PAVE + (P.h + 0.08) / 2, P.z);
          let q = _q.identity();
          if (i === 0 && rockA) {                       // rocking about its foot (toward / away from the front)
            q = _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), rockA);
            up.set(P.x, PAVE + Math.cos(rockA) * (P.h + 0.08) / 2 + Math.abs(rockA) * 0.05, P.z + Math.sin(rockA) * (P.h + 0.08) / 2);
          }
          if (k >= 1) { P.m.position.copy(up); P.m.quaternion.copy(q); return; }
          const bed = bedTop.localToWorld(_v2.set(0.15 - i * 0.1, 0.06 + 0.05 * (i % 2), -0.3 + 0.2 * i));
          _q0.copy(QX).premultiply(cartRoot.quaternion);                            // lying along the cart's length
          P.m.position.copy(bed).lerp(up, smooth(0, 1, k)); P.m.position.y += 0.6 * Math.sin(Math.PI * k);
          P.m.quaternion.copy(_q0).slerp(q, smooth(0, 1, k));
        });
        const topOf = (i) => { const P = poles[i]; return P.m.localToWorld(_v.set(0, 0.5, 0)).toArray(); };
        poles.forEach((P) => P.m.updateMatrixWorld(true));
        // bars: front (fl-fr), back (bl-br)
        const bk = S0.bars ?? [1, 1];
        bars.forEach((B, j) => {
          const k = Math.min(1, Math.max(0, K(perItem(bk, 2) ? bk[j] : bk, t)));
          const a = topOf(j * 2), b = topOf(j * 2 + 1);
          const up = _v2.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.05, (a[2] + b[2]) / 2);
          _qa.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize());
          if (k >= 1) { B.m.position.copy(up); B.m.quaternion.copy(_qa); return; }
          const bed = bedTop.localToWorld(new THREE.Vector3(-0.1, 0.16 + 0.05 * j, 0.25 - 0.5 * j));
          _q0.copy(QX).premultiply(cartRoot.quaternion);
          B.m.position.copy(bed).lerp(up, smooth(0, 1, k)); B.m.position.y += 0.5 * Math.sin(Math.PI * k);
          B.m.quaternion.copy(_q0).slerp(_qa, smooth(0, 1, k));
        });
        // the cloth: corners at the pole tops (overhanging), spread from the back bar forward
        const ck = Math.min(1, Math.max(0, K(S0.cloth ?? 1, t)));
        const low = K(S0.low ?? 0, t);
        const tFL = topOf(0), tFR = topOf(1), tBL = topOf(2), tBR = topOf(3);
        const ovh = (top, dx, dz) => [top[0] + dx, top[1] + 0.035, top[2] + dz];
        const C = { fl: ovh(tFL, -0.12, 0.15), fr: ovh(tFR, 0.12, 0.15), bl: ovh(tBL, -0.12, -0.15), br: ovh(tBR, 0.12, -0.15) };
        C.fl[1] -= low; C.fl[2] += low * 0.12;
        // dragged half off: the front-left corner and the front edge hang
        let off = K(S0.off ?? 0, t);
        if (S0.snag) {
          // the carried ladder catches the low corner: find when its front end first reached the corner
          const snag = S0.snag, drag = snag.drag ?? 1.0;
          let ts = null, te = null;
          for (let tt = 0; tt <= t + 1e-6; tt += 1 / 48) {
            const L = ladderAt(info, snag, tt); if (!L) break;
            if (ts == null && L.front[0] >= C.fl[0] - 0.02) ts = tt;
            if (ts != null && L.front[0] >= C.fl[0] + drag) { te = tt; break; }
          }
          if (ts != null) {
            const L = ladderAt(info, snag, te ?? t);
            const held = [Math.min(L.front[0], C.fl[0] + drag), L.front[1] - 0.04, L.front[2] - L.left[1] * 0.0];
            if (te == null) { C.fl = held; off = 0; }
            else {
              const k = smooth(0, 0.45, t - te);
              C.fl = held.map((v, i) => v + (T.offFL[i] - v) * k);
              off = Math.max(off, k);
            }
          }
        } else if (off > 0) C.fl = C.fl.map((v, i) => v + (T.offFL[i] - v) * smooth(0, 1, off));
        if (ck < 1) { for (const [f, b] of [['fl', 'bl'], ['fr', 'br']]) C[f] = C[b].map((v, i) => v + (C[f][i] - v) * smooth(0, 1, ck)); }
        const pos = clothGeo.attributes.position;
        for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
          const u = i / NU, v = j / NV;                        // u: left -> right, v: front -> back
          const f = [0, 1, 2].map((k) => (1 - u) * C.fl[k] + u * C.fr[k]), b = [0, 1, 2].map((k) => (1 - u) * C.bl[k] + u * C.br[k]);
          const sag = 0.07 * Math.sin(Math.PI * u) * (0.4 + Math.sin(Math.PI * v)) * ck;
          const hang = off * 0.5 * Math.pow(1 - u, 1.6) * (1 - v);            // the front-left quarter falls in a fold
          pos.setXYZ(j * (NU + 1) + i, f[0] + (b[0] - f[0]) * v + off * 0.12 * (1 - u) * Math.sin(Math.PI * v), f[1] + (b[1] - f[1]) * v - sag - hang, f[2] + (b[2] - f[2]) * v);
        }
        pos.needsUpdate = true; clothGeo.computeVertexNormals(); clothGeo.computeBoundingSphere();
        cloth.visible = ck > 0.02;
        lastCloth = C;
        for (const [n, o] of Object.entries(cornerObj)) { o.position.set(...C[n]); o.updateMatrixWorld(true); }
        // ties: a short cord from each corner to its pole top (the low corner's runs long)
        [['fl', 0], ['fr', 1], ['bl', 2], ['br', 3]].forEach(([n, i], k) => {
          const a = new THREE.Vector3(...topOf(i)), b = new THREE.Vector3(...C[n]), d = b.clone().sub(a), L = d.length();
          ties[k].visible = cloth.visible && L > 0.03 && L < 1.4 && !(n === 'fl' && off > 0.5);
          ties[k].position.copy(a).addScaledVector(d, 0.5); ties[k].scale.set(1, L, 1);
          ties[k].quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
        });
        // the wedges slide in under the front-left foot
        const sto = S0.stones || [];
        wedges.forEach((m, i) => {
          const t0 = sto[i];
          if (t0 == null && S0.stonesIn == null) { m.visible = false; return; }
          const k = t0 == null ? (i < (S0.stonesIn ?? 0) ? 1 : 0) : smooth(t0, t0 + 0.45, t);
          m.visible = t0 == null ? k > 0 : t >= t0 - 0.25;
          m.position.set(T.x0 - 0.02 + (1 - k) * -0.22, PAVE + 0.012 + i * 0.026, T.zf + 0.02 + (1 - k) * 0.12);
          m.rotation.set(0, 0.5 + i * 0.7, 0);
        });
      }

      // ---- the ladder on two shoulders
      const lad = st.ladder;
      ladder.visible = false;
      if (lad) {
        const L = ladderAt(info, lad, t);
        if (L) {
          ladder.visible = true;
          ladder.position.set(...L.mid);
          ladder.rotation.set(0, Math.atan2(-L.u[1], L.u[0]), 0.0);
          ladder.updateMatrixWorld(true);
          ladder.worldToLocal(ladA.position.set(...L.A)); ladder.worldToLocal(ladB.position.set(...L.B)); ladder.worldToLocal(ladEnd.position.set(...L.front));
          ladder.updateMatrixWorld(true);
        }
      }

      // ---- birds on the roofs
      const bl = st.birds || [];
      birds.forEach((g, i) => {
        const b = bl[i];
        g.visible = !!b;
        if (!b) return;
        const p = Array.isArray(b.on) ? b.on : perch(b.perch ?? i);
        const hop = b.hops ? b.hops.reduce((acc, h0) => acc + smooth(h0, h0 + 0.18, t), 0) * 0.12 : 0;
        const air = b.hops ? b.hops.reduce((acc, h0) => acc + Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (t - h0) / 0.18)))), 0) * 0.06 : 0;
        const yaw = (b.yaw ?? 0) * Math.PI / 180 + (b.turn ? K(b.turn, t) * Math.PI / 180 : 0);
        g.position.set(p[0] + Math.sin(yaw) * -hop, p[1] + air, p[2] + Math.cos(yaw) * -hop);
        g.rotation.set(0, yaw, 0);
        const head = g.getObjectByName('head');
        const peck = b.peck ? Math.max(0, Math.sin(2 * Math.PI * 1.3 * t)) ** 6 : 0;
        head.position.set(0, 0.2 - 0.12 * peck, -0.12 - 0.05 * peck);
      });
    },
    afterCast(info, actors) {
      // the humans library's built-in hand props (the vendor build carries an empty crate from its pose): not in
      // these shots - hidden here (REQUEST in humans/PROGRESS.md: a build / load option without the prop)
      for (const a of Object.values(actors)) {
        if (a.kind !== 'human' || a.root.userData.clingProps) continue;
        a.root.userData.clingProps = true;
        a.root.traverse((o) => { if (o.isMesh && /crate|basket|parcel|loaf|prop/i.test(o.name + ' ' + (o.material?.name || ''))) o.visible = false; });
      }
    },
    dynamic(info) {
      const st = info.spec.set || {};
      const d = [];
      if (st.stall) d.push(cartRoot, cloth, ...poles.map((p) => p.m), ...bars.map((b) => b.m), ...ties, ...wedges);
      if (st.ladder) d.push(ladder);
      if (st.birds) d.push(...birds);
      return d;
    },
  };
}
