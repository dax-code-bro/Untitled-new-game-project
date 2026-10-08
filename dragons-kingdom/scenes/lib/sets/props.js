// Small props for style frames and sets (procedural, deterministic): leather straps, market
// food (loaves, rolls, apples, onions, cheeses, fish, pies), baskets of goods, trestles.
//
// Everything is built once in setup() except strapRibbon (rebuilt per frame where a strap follows
// a moving body). Materials are three.js physical materials (the cinematic stack patches them).
import * as THREE from 'three';

const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3();

/**
 * A flat leather strap along a curve: width w, thickness th, `n` segments. faceRef (world vector,
 * optional) is the direction the strap's broad face looks toward (it lies flat against a body
 * whose surface faces that way); without it the strap lies flat to the curve's own bend.
 */
export function strapRibbon(curve, w, th, n = 48, faceRef = null) {
  const pos = [], nor = [], uv = [], idx = [];
  const P = curve.getSpacedPoints(n);
  let prevB = null;
  for (let i = 0; i <= n; i++) {
    const p = P[i];
    _t.copy(P[Math.min(n, i + 1)]).sub(P[Math.max(0, i - 1)]).normalize();
    // width axis: perpendicular to the tangent and to the face direction
    if (faceRef) _b.copy(faceRef).cross(_t);
    else _b.set(0, 1, 0).cross(_t);
    if (_b.lengthSq() < 1e-6) _b.copy(prevB || new THREE.Vector3(1, 0, 0));
    _b.normalize();
    if (prevB && _b.dot(prevB) < 0) _b.negate();
    prevB = _b.clone();
    _n.copy(_t).cross(_b).normalize();
    // 4 corners of the section (a thin rectangle), with a slight edge bevel in the normals
    const corners = [[-w / 2, -th / 2], [w / 2, -th / 2], [w / 2, th / 2], [-w / 2, th / 2]];
    const ns = [[-0.3, -1], [0.3, -1], [0.3, 1], [-0.3, 1]];
    for (let k = 0; k < 4; k++) {
      const [a, c] = corners[k];
      pos.push(p.x + _b.x * a + _n.x * c, p.y + _b.y * a + _n.y * c, p.z + _b.z * a + _n.z * c);
      const nn = new THREE.Vector3().addScaledVector(_b, ns[k][0]).addScaledVector(_n, ns[k][1]).normalize();
      nor.push(nn.x, nn.y, nn.z);
      uv.push(k / 4, i / n * curve.getLength() / w);
    }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) {
    const a = i * 4 + k, b = i * 4 + (k + 1) % 4, c = a + 4, d = b + 4;
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------------ food --
function rng32(seed) { let a = seed >>> 0 || 1; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; }

/** Displace a sphere-ish geometry with low-frequency lumps (seeded). */
function lumpy(g, amp, seed, freq = 3) {
  const r = rng32(seed), ph = [r() * 6, r() * 6, r() * 6, r() * 6];
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const l = Math.hypot(x, y, z) || 1;
    const k = 1 + amp * (Math.sin(x / l * freq + ph[0]) * Math.sin(y / l * freq * 1.3 + ph[1]) + 0.5 * Math.sin(z / l * freq * 2.1 + ph[2]) * Math.sin(x / l * freq * 1.7 + ph[3]));
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Paint a geometry with a per-vertex colour from fn(x, y, z) (local position) -> [r, g, b] (linear). */
function paint(g, fn) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) c.set(fn(p.getX(i), p.getY(i), p.getZ(i)), i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** A loaf: a round or oval domed loaf with a slashed top (scores open in the bake), crumb in the cuts. */
function loafGeometry(seed, pale) {
  const r = rng32(seed);
  const g = new THREE.SphereGeometry(0.075, 40, 22);
  const p = g.attributes.position, sc = r() < 0.5 ? 0.78 : 1 + r() * 0.2, cuts = 2 + Math.floor(r() * 2);
  const base = pale ? [0.5, 0.33, 0.14] : [0.3, 0.15, 0.05];
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * (1.3 * sc), y = p.getY(i), z = p.getZ(i);
    y = y > 0 ? y * 0.75 : y * 0.25;                              // flat bottom, domed top
    // diagonal scores across the top
    const u = (x * 0.8 + z * 0.6) / 0.075;
    const k = Math.abs(Math.sin(u * Math.PI * cuts / 2.6));
    const score = y > 0.03 ? Math.exp(-((1 - k) ** 2) / 0.02) * 0.008 : 0;
    p.setXYZ(i, x, y - score, z);
  }
  g.computeVertexNormals();
  return paint(lumpy(g, 0.05, seed, 2.5), (x, y, z) => {
    const top = Math.max(0, y / 0.056);
    const u = (x * 0.8 + z * 0.6) / 0.075, k = Math.abs(Math.sin(u * Math.PI * cuts / 2.6));
    const cut = y > 0.03 ? Math.exp(-((1 - k) ** 2) / 0.02) : 0;
    const v = 0.75 + 0.35 * top;
    const crumb = [0.62, 0.5, 0.3];
    // flour dusted on the top, rubbed off in patches
    const flour = pale ? 0 : Math.max(0, Math.sin(x * 90 + 1.3) * Math.sin(z * 70) - 0.2) * top * 0.6;
    return base.map((c, j) => ((c * (1.25 - 0.45 * top) * v) * (1 - cut * 0.8) + crumb[j] * cut * 0.8) * (1 - flour) + 0.55 * flour);
  });
}

/** A whole fish: a fusiform body with a forked tail, dark back, silver belly. */
function fishGeometry(seed) {
  const r = rng32(seed);
  const g = new THREE.SphereGeometry(0.03, 28, 14);
  const p = g.attributes.position;
  const L = 6 + r() * 1.5;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * L, y = p.getY(i), z = p.getZ(i);
    const f = x / (0.03 * L);                                      // -1 tail .. 1 head
    const taper = f < -0.55 ? 0.25 + 0.75 * Math.pow((f + 1) / 0.45, 1.3) : 1 - 0.25 * Math.max(0, f) ** 2;
    y *= 0.95 * taper; z *= 0.45 * taper;
    if (f < -0.85) { const fork = (-0.85 - f) / 0.15; y += Math.sign(y || 1) * fork * 0.018; x -= fork * 0.012 * (1 - Math.abs(y) / 0.03); }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  const hx = 0.03 * L * 0.8;
  return paint(g, (x, y, z) => {
    const b = Math.min(1, Math.max(0, 0.5 + y / 0.045));
    const eye = Math.hypot(x - hx, y - 0.004) < 0.0055 && Math.abs(z) > 0.004 ? 1 : 0;
    const gill = Math.abs(x - hx * 0.72) < 0.002 && Math.abs(y) < 0.018 ? 0.5 : 0;
    const c = [0.05 + 0.45 * (1 - b), 0.07 + 0.47 * (1 - b), 0.08 + 0.46 * (1 - b)];
    return c.map((v) => v * (1 - eye * 0.95) * (1 - gill));
  });
}

/** Materials for market food (linear colours; crust, apple skin, onion skin, rind ...). Swap in photo
 * scans where a scene can load them: food.wicker = await loadPBR('pbr/khr_wicker', ...), food.board = ... */
export function foodMaterials() {
  const M = (c, rough, o = {}) => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(...c), roughness: rough, ...o });
  return {
    crust: M([1, 1, 1], 0.72, { vertexColors: true, sheen: 0.3, sheenColor: new THREE.Color(0.6, 0.4, 0.2), sheenRoughness: 0.6 }),
    crustPale: M([1, 1, 1], 0.8, { vertexColors: true }),
    crumb: M([0.62, 0.52, 0.36], 0.9),
    appleRed: M([1, 1, 1], 0.38, { vertexColors: true, clearcoat: 0.25, clearcoatRoughness: 0.45 }),
    appleGreen: M([0.25, 0.3, 0.05], 0.4, { clearcoat: 0.2, clearcoatRoughness: 0.5 }),
    onion: M([0.42, 0.22, 0.08], 0.55, { sheen: 0.4, sheenColor: new THREE.Color(0.8, 0.6, 0.4) }),
    cheese: M([0.55, 0.38, 0.12], 0.6),
    rind: M([0.36, 0.2, 0.06], 0.55),
    fish: M([1, 1, 1], 0.32, { vertexColors: true, clearcoat: 0.5, clearcoatRoughness: 0.25 }),
    cabbage: M([1, 1, 1], 0.55, { vertexColors: true, sheen: 0.3, sheenColor: new THREE.Color(0.7, 0.8, 0.6) }),
    turnip: M([1, 1, 1], 0.5, { vertexColors: true }),
    wicker: M([0.34, 0.24, 0.12], 0.85),
    cloth: M([0.55, 0.5, 0.42], 0.92, { sheen: 0.4, sheenColor: new THREE.Color(0.8, 0.78, 0.72), sheenRoughness: 0.7 }),
    board: M([0.2, 0.13, 0.075], 0.78),
    clay: M([0.36, 0.17, 0.08], 0.75),
  };
}

/**
 * A market tray / basket of goods as one group: kind 'bread' | 'rolls' | 'apples' | 'onions' |
 * 'cheese' | 'fish' | 'veg'. Sized for a stall counter (about 0.5 x 0.35 m).
 */
export function goods(kind, mats, seed = 1, o = {}) {
  const r = rng32(seed * 7919 + kind.length * 31);
  const grp = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, s = [1, 1, 1]) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(...s);
    m.castShadow = true; m.receiveShadow = true; grp.add(m); return m;
  };
  const W = o.w ?? 0.55, D = o.d ?? 0.38;
  // a shallow basket (wicker) or a board, under the goods
  const basket = kind !== 'cheese' && kind !== 'fish';
  if (basket) {
    const prof = [[0, 0], [0.5, 0], [0.52, 0.02], [0.56, 0.11], [0.54, 0.115], [0.5, 0.025], [0, 0.02]].map(([x, y]) => new THREE.Vector2(x, y));
    const b = add(new THREE.LatheGeometry(prof, 28), mats.wicker, 0, 0, 0);
    b.scale.set(W, 1, D);
  } else add(new THREE.BoxGeometry(W, 0.03, D), mats.board, 0, 0.015, 0);
  const n = o.n ?? (kind === 'bread' ? 4 : kind === 'cheese' ? 3 : kind === 'fish' ? 6 : kind === 'rolls' ? 14 : 26);
  for (let i = 0; i < n; i++) {
    const u = (r() - 0.5) * W * 0.78, v = (r() - 0.5) * D * 0.7, layer = i / n;
    const y0 = basket ? 0.04 + layer * 0.06 : 0.03;
    if (kind === 'bread') {
      const pale = r() < 0.4;
      const bx = ((i % 2) - 0.5) * W * 0.42 + (r() - 0.5) * 0.03, bz = (Math.floor(i / 2) - 0.5) * D * 0.42 + (r() - 0.5) * 0.03;
      add(loafGeometry(seed * 31 + i, pale), pale ? mats.crustPale : mats.crust, bx, 0.035 + (i > 3 ? 0.06 : 0), bz, 0, r() * 6, 0);
    } else if (kind === 'rolls') {
      // small round rolls: the loaf shape at half size, crowded in the basket
      add(loafGeometry(seed * 17 + i, false), mats.crust, u * 0.9, y0 + 0.006, v * 0.9, 0, r() * 6, 0, [0.5, 0.55, 0.5]);
    } else if (kind === 'apples') {
      const red = r() < 0.6, blush = r();
      const g = lumpy(new THREE.SphereGeometry(0.036, 22, 14), 0.04, seed + i, 2);
      // an apple's dimple at the stalk and the eye
      { const P = g.attributes.position; for (let k = 0; k < P.count; k++) { const y = P.getY(k); const d = Math.exp(-((Math.abs(y) - 0.036) ** 2) / 0.00004); P.setY(k, y - Math.sign(y) * 0.006 * d); } g.computeVertexNormals(); }
      paint(g, (x, y, z) => { const n = 0.5 + 0.5 * Math.sin(x * 140 + z * 90 + blush * 6) * Math.sin(y * 120); return red ? [0.3 + 0.07 * n, 0.018 + 0.03 * (1 - n) * blush, 0.012] : [0.24 + 0.12 * n * blush, 0.32, 0.05]; });
      add(g, red ? mats.appleRed : mats.appleGreen, u, y0 + 0.03, v, r(), r() * 6, r(), [1, 0.9, 1]);
    } else if (kind === 'onions') {
      add(lumpy(new THREE.SphereGeometry(0.035, 12, 10), 0.06, seed + i, 2), mats.onion, u, y0 + 0.03, v, r(), r() * 6, r(), [1, 0.85, 1]);
    } else if (kind === 'veg') {
      if (i % 3 === 0) {
        // a cabbage: overlapping leaves (lumps at several scales), paler veins toward the heart
        const g = paint(lumpy(lumpy(new THREE.SphereGeometry(0.075, 30, 20), 0.1, seed + i, 4), 0.04, seed + i + 7, 11), (x, y, z) => { const vein = Math.pow(Math.abs(Math.sin(Math.atan2(z, x) * 7 + y * 30)), 12); const top = Math.max(0, y / 0.075); return [0.12 + 0.12 * vein + 0.1 * top, 0.2 + 0.12 * vein + 0.12 * top, 0.06 + 0.06 * vein]; });
        add(g, mats.cabbage, u, y0 + 0.05, v, r(), r() * 6, 0);
      } else {
        // a turnip: white below, purple shoulders, a tapering root
        const g = new THREE.SphereGeometry(0.035, 20, 14);
        { const P = g.attributes.position; for (let k = 0; k < P.count; k++) { const y = P.getY(k); if (y < -0.01) { const f = (-0.01 - y) / 0.025; P.setXYZ(k, P.getX(k) * (1 - 0.7 * f), y - f * 0.02, P.getZ(k) * (1 - 0.7 * f)); } } g.computeVertexNormals(); }
        paint(lumpy(g, 0.04, seed + i), (x, y) => { const t = Math.min(1, Math.max(0, (y + 0.005) / 0.03)); return [0.62 - 0.36 * t, 0.58 - 0.5 * t, 0.5 - 0.3 * t]; });
        add(g, mats.turnip, u, y0 + 0.035, v, 0.3 * (r() - 0.5), r() * 6, Math.PI / 2 * (r() < 0.5 ? 1 : 0.3));
      }
    } else if (kind === 'cheese') {
      const R0 = 0.09 + r() * 0.04;
      add(new THREE.CylinderGeometry(R0, R0 * 1.02, 0.07, 28), mats.rind, u * 0.7, 0.065 + (i ? 0 : 0), v * 0.6, 0, 0, 0);
    } else if (kind === 'fish') {
      add(fishGeometry(seed * 13 + i), mats.fish, (r() - 0.5) * 0.06, 0.042, (i - n / 2 + 0.5) * Math.min(0.062, D / n), Math.PI / 2, (r() - 0.5) * 0.25 + (i % 2 ? Math.PI : 0), 0);
    }
  }
  return grp;
}

// ---------------------------------------------------------- market stall --
/**
 * A festival market stall: an oak trestle frame (four posts, the back pair taller, rails, a
 * counter of boards on trestles, a front board), a cloth awning sloping to the front with a
 * valance, goods on the counter, a crate / sack / barrel on the ground beside it.
 *   timber and dressing go into an architecture Kit (`kit`, built with archMaterials; core.js
 *   block + dressing.js), the cloth and the goods are returned as a THREE.Group.
 * at: [x, z] centre, yaw (front = +z rotated by yaw), o: { w, d, h, color, color2, stripe,
 * goods: ['bread', 'apples', ...], seed }. Needs { block, frame, makeRand } from core.js and
 * { crate, sack, barrel } from dressing.js (passed in A) so this file stays free of the
 * architecture import graph.
 */
export function marketStall(kit, A, town, food, at, yaw, o = {}) {
  const { block, yawFrame, sub, makeRand } = A;
  const rnd = makeRand(o.seed ?? 1);
  const W = o.w ?? 3.0, D = o.d ?? 1.7, Hf = o.h ?? 2.3;
  const F = yawFrame([at[0], 0, at[1]], yaw);
  const oak = (cx, cy, cz, sx, sy, sz, axis = [0, 1, 0], mat = 'oakSilver') => block(kit.get(mat), sub(F, [cx, cy, cz]), sx, sy, sz, { r: 0.008, seg: [0.25, 0.25, 0.25], seed: rnd(), noise: 0.002, nf: 4, chip: 0.004, axis, adze: 0.002 });
  // posts (front pair lower: the awning slopes to the front), rails at the top
  for (const [x, z, h] of [[-W / 2, D / 2, Hf], [W / 2, D / 2, Hf], [-W / 2, -D / 2, Hf + 0.45], [W / 2, -D / 2, Hf + 0.45]]) oak(x, h / 2, z, 0.09, h, 0.09);
  oak(0, Hf - 0.03, D / 2, W + 0.12, 0.07, 0.07, [1, 0, 0]);
  oak(0, Hf + 0.42, -D / 2, W + 0.12, 0.07, 0.07, [1, 0, 0]);
  for (const x of [-W / 2, W / 2]) block(kit.get('oakSilver'), sub(F, [x, Hf + 0.2, 0], [0, 0, 1], [0, 1, 0]), Math.hypot(D, 0.45) + 0.1, 0.06, 0.06, { r: 0.006, seg: 0.3, seed: rnd(), axis: [1, 0, 0] });
  // trestles and the counter boards (three boards, uneven), a front board to the ground
  for (const x of [-W / 2 + 0.35, W / 2 - 0.35]) { oak(x, 0.42, D * 0.12, 0.06, 0.84, 0.06); oak(x, 0.6, D * 0.12, 0.06, 0.06, D * 0.55, [0, 0, 1], 'oakDark'); }
  for (let k = 0; k < 3; k++) oak(0, 0.86, D * 0.12 + (k - 1) * 0.24 + (rnd() - 0.5) * 0.01, W + 0.08, 0.035, 0.235, [1, 0, 0], k === 1 ? 'oak' : 'oakSilver');
  for (let k = 0; k < 3; k++) oak(0, 0.14 + k * 0.24, D / 2 - 0.02, W - 0.1, 0.23, 0.025, [1, 0, 0], 'oakDark');
  // things on the ground beside it
  if (A.crate) A.crate(kit, sub(F, [W / 2 + 0.45, 0, 0.1]), rnd, { w: 0.6, d: 0.45, h: 0.42 });
  if (A.sack) A.sack(kit, sub(F, [-W / 2 - 0.4, 0, 0.25]), rnd);
  if (A.barrel && rnd() < 0.5) A.barrel(kit, sub(F, [W / 2 + 0.35, 0, -0.55]), rnd);
  // cloth: the awning (sloping to the front, sagging, a striped dye) and a valance
  const g = new THREE.Group();
  g.position.set(at[0], 0, at[1]); g.rotation.y = yaw;
  const clothM = town.clothMaterial({ color: o.color || [0.3, 0.06, 0.04], color2: o.color2 || [0.45, 0.4, 0.3], stripe: o.stripe ?? 0, wear: 0.4 });
  const L = Math.hypot(D + 0.4, 0.45);
  const awn = new THREE.Mesh(town.clothSheet(W + 0.35, L, { sag: -0.12, ripple: 0.025, seed: o.seed ?? 1, nx: 24, ny: 10 }), clothM);
  awn.position.set(0, Hf + 0.25, 0); awn.rotation.x = -Math.PI / 2 + Math.atan2(0.45, D + 0.4);
  const val = new THREE.Mesh(town.clothSheet(W + 0.35, 0.28, { ripple: 0.02, folds: 0.01, seed: (o.seed ?? 1) + 3, nx: 24, ny: 3 }), clothM);
  val.position.set(0, Hf - 0.1, D / 2 + 0.2);
  for (const m of [awn, val]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  // goods on the counter
  const kinds = o.goods || ['bread', 'apples', 'rolls'];
  kinds.forEach((k, i) => {
    const gd = goods(k, food, (o.seed ?? 1) * 10 + i, { w: Math.min(0.62, (W - 0.3) / kinds.length - 0.06) });
    gd.position.set(-W / 2 + 0.15 + (W - 0.3) * (i + 0.5) / kinds.length, 0.88, D * 0.12 + (rnd() - 0.5) * 0.08);
    gd.rotation.y = (rnd() - 0.5) * 0.3;
    g.add(gd);
  });
  return g;
}
