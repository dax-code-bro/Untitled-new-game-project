// Props library - Verdor: the birthing chamber, the treatment room and the riding grounds
// (PROVISIONAL designs). The egg (whole, cracked, opened) and its shell fragments - a hard shell
// with real thickness and a pale inner membrane, broken along an irregular network; nest bedding
// of straw stalks (round, jointed, hollow-ended - not paper strips) laid in a mound round a linen
// pad; bowls of water; stacks of folded linen; clay oil lamps; a healer's box (stoneware flasks,
// linen rolls, unguent pots, mortar and pestle, a splint); a folded sling; riding-ground gear
// (mounting steps, a ladder, a saddle stand with a folded blanket).
//
//   const vk = await verdorKit(ctx);
//   scene.add(vk.egg(F, { state: 'cracked' }));      // 'closed' | 'cracked' | 'opened' | 'broken'
//   scene.add(vk.nest(F, { r: 0.75 }));
//   const k = new Kit(); vk.bowl(k, F, rnd); ...; scene.add(vk.build(k));
import * as THREE from 'three';
import { Kit, Builder, box, tube, lathe, fp, fd, sub, frame, yawFrame, rng, hash, clamp, smooth, fbm, vnoise } from './core.js';
import { propMaterials, clothMaterial, surface } from './materials.js';
import { goodsMaterials, goodsMats, buildGoods, pot, herbBunch } from './goods.js';
import { basket, stool, bench, bucket } from './containers.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const kits = new WeakMap();
export function verdorKit(ctx) {
  if (!kits.has(ctx)) kits.set(ctx, make(ctx));
  return kits.get(ctx);
}

async function make(ctx) {
  const M = await propMaterials(ctx);
  const G = await goodsMaterials(ctx);
  const mats = { ...goodsMats(M, G) };
  mats.shell = await surface(ctx, { name: 'egg-shell', scan: 'pbr/acg_leather26', tile: [0.12, 0.12], detail: 0.35, normalScale: 0.35, color: [0.028, 0.026, 0.024], color2: [0.035, 0.03, 0.026], roughness: 0.68, roughVar: 0.35, pieceVar: 0.15, macro: 0.5, macroF: 9, wear: 0.4, wearColor: [0.06, 0.05, 0.04] });
  mats.membrane = await surface(ctx, { name: 'egg-membrane', scan: null, color: [0.42, 0.36, 0.26], color2: [0.38, 0.33, 0.24], roughness: 0.25, pieceVar: 0.2, macro: 0.3, macroF: 20, wear: 0, clearcoat: 0.8, clearcoatRoughness: 0.12, cloth: { transmission: 0.35, forward: 1.0 }, side: THREE.DoubleSide });
  mats.shellEdge = await surface(ctx, { name: 'egg-shell-edge', scan: null, color: [0.16, 0.14, 0.11], roughness: 0.7, pieceVar: 0.2, wear: 0, side: THREE.DoubleSide });
  mats.water = new THREE.MeshPhysicalMaterial({ name: 'bowl-water', color: new THREE.Color(0.012, 0.014, 0.012), roughness: 0.03, metalness: 0, ior: 1.333, specularIntensity: 1, clearcoat: 0 });
  mats.stoneware = await surface(ctx, { name: 'stoneware', scan: 'pbr/acg_ground03', tile: [0.4, 0.4], detail: 0.2, normalScale: 0.12, color: [0.2, 0.15, 0.1], color2: [0.25, 0.2, 0.14], roughness: 0.35, roughVar: 0.3, pieceVar: 0.4, macro: 0.3, macroF: 10, wear: 0.5, wearColor: [0.32, 0.27, 0.2], rings: { period: 0.008, depth: 0.0003 }, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  mats.cork = await surface(ctx, { name: 'cork', scan: null, color: [0.25, 0.16, 0.09], roughness: 0.9, macro: 0.4, macroF: 300, wear: 0 });
  mats.flame = new THREE.MeshBasicMaterial({ name: 'lamp-flame', color: new THREE.Color(4.0, 1.9, 0.6), transparent: true, opacity: 0.9, depthWrite: false });
  mats.linenFold = await clothMaterial(ctx, { name: 'linen-folded', color: [0.6, 0.56, 0.47], color2: [0.56, 0.52, 0.44], transmission: 0.15, pieceVar: 0.12 });
  mats.blanket = await clothMaterial(ctx, { name: 'blanket-wool', scan: 'pbr/acg_fabric37', tile: [0.3, 0.3], color: [0.16, 0.08, 0.05], color2: [0.14, 0.07, 0.045], transmission: 0.05, stripes: { period: 0.5, duty: 0.88, color: [0.42, 0.36, 0.26] } });
  const api = { ctx, M, G, mats };
  api.build = (kit, name) => buildGoods(kit, mats, name);
  api.egg = (F, o) => egg(api, F, o);
  api.nest = (F, o) => nest(api, F, o);
  return api;
}

// ---------------------------------------------------------------------- egg --
/**
 * The egg: ~0.42 m, a hard dark shell (provisional look) - slightly asymmetric, a faint pitted
 * texture. o.state: 'closed' (an old fracture line across it - the fragments sit exactly, the
 * cracks read as dark seams), 'cracked' (a fine crack running further, one fragment lifted),
 * 'opened' (the top fragments off, lying beside it - the membrane inside), 'broken' (scattered).
 * The shell is broken along a Voronoi network on its surface (fragments of 6-14 cm with ragged
 * edges); every fragment has thickness (4 mm) and its inside is the pale membrane.
 */
function egg(api, F, o = {}) {
  const state = o.state ?? 'closed';
  const H = o.h ?? 0.42, Rq = H * 0.36, T = o.thick ?? 0.004;
  const seed = o.seed ?? 7;
  const r = rng(seed);
  const g = new THREE.Group(); g.name = 'egg-' + state;
  // shape: an egg profile (the blunt end down), a slight lean
  const shape = (th, ph) => {
    const ct = Math.cos(th), st = Math.sin(th);
    const k = 1 - 0.16 * ct;                                  // narrower toward the top (th = 0)
    const n = 1 + 0.012 * fbm(Math.cos(ph) * st * 3, ct * 3, Math.sin(ph) * st * 3, 3);
    return V(Math.cos(ph) * st * Rq * k * n, (ct * H) / 2 + H / 2, Math.sin(ph) * st * Rq * k * n);
  };
  // the fracture network: seeds on the sphere; fragments are the cells
  const NS = state === 'closed' ? 9 : 16;
  const seeds = [];
  for (let i = 0; i < NS; i++) {
    const z = state === 'closed' ? 0.2 + r() * 0.8 : -0.4 + r() * 1.4, a = r() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - Math.min(1, z) ** 2));
    seeds.push(V(Math.cos(a) * s, Math.min(1, z), Math.sin(a) * s));
  }
  seeds.push(V(0, -1, 0));                                    // the base (one big cell)
  // every fragment is cut out of a fine (theta, phi) grid along its true boundary: the score of
  // each seed at each grid vertex (the direction jittered with noise first - ragged edges), and
  // each quad clipped to where its own seed wins by a margin (marching squares, linear in the
  // grid) - smooth, irregular crack lines instead of a staircase of whole quads
  const NT = 144, NP = 192;
  const NSd = seeds.length, NV = (NT + 1) * (NP + 1);
  const score = new Float32Array(NV * NSd);
  for (let i = 0; i <= NT; i++) for (let j = 0; j <= NP; j++) {
    const th = (i / NT) * Math.PI, ph = (j / NP) * Math.PI * 2;
    const d = V(Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th));
    d.x += 0.07 * fbm(d.x * 9 + 3, d.y * 9, d.z * 9, 2); d.y += 0.07 * fbm(d.x * 9, d.y * 9 + 7, d.z * 9, 2); d.z += 0.07 * fbm(d.x * 9, d.y * 9, d.z * 9 + 11, 2);
    // a fine second wobble along the line (the crack wanders at the millimetre scale too)
    const wob = 0.006 * fbm(d.x * 40 + 1, d.y * 40, d.z * 40 + 5, 2);
    const base = (i * (NP + 1) + j) * NSd;
    for (let k = 0; k < NSd; k++) score[base + k] = d.dot(seeds[k]) + (k === NSd - 1 ? -0.35 : 0) + wob * ((k * 7) % 3 - 1);
  }
  const vix = (i, j) => i * (NP + 1) + (j % NP);
  // f_c at a vertex: its own score minus the best other (> 0 inside the fragment)
  const fOf = (vi, c) => { let mo = -1e9; const b0 = vi * NSd; for (let k = 0; k < NSd; k++) if (k !== c) mo = Math.max(mo, score[b0 + k]); return score[b0 + c] - mo; };
  const owner = (vi) => { let best = 0, bv = -1e9; const b0 = vi * NSd; for (let k = 0; k < NSd; k++) if (score[b0 + k] > bv) { bv = score[b0 + k]; best = k; } return best; };
  // per fragment transform for the state
  const frag = new Map();
  for (let c = 0; c < seeds.length; c++) {
    const m = new THREE.Matrix4();
    const isBase = c === seeds.length - 1;
    const up = seeds[c].y > 0.45;
    if (state === 'cracked' && c === 0) {
      m.makeRotationAxis(V(0, 0, 1), 0.12).setPosition(0.004, 0.01, 0);
    } else if ((state === 'opened' && up && !isBase) || (state === 'broken' && !isBase)) {
      // off the egg, lying on the bedding round it, inside up or down
      const a = r() * Math.PI * 2, d = Rq * (1.4 + r() * 1.3);
      const q = new THREE.Quaternion().setFromUnitVectors(seeds[c], r() < 0.6 ? V(0, -1, 0) : V(0, 1, 0));
      const rot = new THREE.Matrix4().makeRotationFromQuaternion(q);
      const c0 = shape(Math.acos(clamp(seeds[c].y, -1, 1)), Math.atan2(seeds[c].z, seeds[c].x)).applyMatrix4(rot);
      m.copy(rot).setPosition(Math.cos(a) * d - c0.x, 0.02 - c0.y + Rq * 0.25 * (q.w > 0 ? 0.3 : 1), Math.sin(a) * d - c0.z);
    }
    frag.set(c, m);
  }
  const outer = new Builder(), inner = new Builder(), edge = new Builder();
  // a point of the shell at fractional grid coordinates (fi, fj), pushed in along the normal by inset
  const Pof = (fi, fj, inset) => {
    const p = shape((fi / NT) * Math.PI, (fj / NP) * Math.PI * 2);
    const n = p.clone().sub(V(0, H / 2, 0)).normalize();
    return p.addScaledVector(n, -inset);
  };
  // half the crack's width in score units (closed: a hairline; opened: a clean break)
  const g0 = state === 'closed' ? 0.0015 : 0.0025;
  for (let c = 0; c < NSd; c++) {
    const m = frag.get(c);
    const piece = (c * 0.137) % 1;
    const P = (fi, fj, inset) => fp(F, ...Pof(fi, fj, inset).applyMatrix4(m).toArray());
    for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) {
      const cs = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]];
      const fv = cs.map(([a, b2]) => fOf(vix(a, b2), c) - g0);
      if (fv[0] < 0 && fv[1] < 0 && fv[2] < 0 && fv[3] < 0) continue;
      // Sutherland-Hodgman against f >= 0; remember which new edge is the cut
      const poly = [], cut = [];
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4, A = cs[k], B = cs[k2], fa = fv[k], fb = fv[k2];
        if (fa >= 0) poly.push(A);
        if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); poly.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); cut.push(poly.length - 1); }
      }
      if (poly.length < 3) continue;
      const u = (q) => q[1] / NP * 1.4, w = (q) => q[0] / NT * 0.7;
      const oi = poly.map((q) => outer.v(P(q[0], q[1], 0), u(q), w(q), piece, 1, 0));
      const ii = poly.map((q) => inner.v(P(q[0], q[1], T), u(q), w(q), piece, 0.8, 0));
      for (let k = 1; k + 1 < poly.length; k++) { outer.t(oi[0], oi[k], oi[k + 1]); inner.t(ii[0], ii[k + 1], ii[k]); }
      // the broken edge: a wall of shell thickness along the cut
      if (cut.length === 2) {
        const qa = poly[cut[0]], qb = poly[cut[1]];
        const e = [edge.v(P(qa[0], qa[1], 0), 0, 0, piece, 0.9, 0), edge.v(P(qb[0], qb[1], 0), 0.01, 0, piece, 0.9, 0), edge.v(P(qb[0], qb[1], T), 0.01, T, piece, 0.7, 0), edge.v(P(qa[0], qa[1], T), 0, T, piece, 0.7, 0)];
        edge.q(e[0], e[1], e[2], e[3]);
      }
    }
  }
  // closed / cracked: under the cracks a dark recessed surface (the inside of the old fracture)
  if (state === 'closed' || state === 'cracked') {
    for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) {
      const v0 = vix(i, j), o0 = owner(v0);
      if (owner(vix(i + 1, j)) === o0 && owner(vix(i, j + 1)) === o0 && owner(vix(i + 1, j + 1)) === o0 && fOf(v0, o0) > 0.03) continue;
      const q = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]].map(([a, b2]) => edge.v(fp(F, ...Pof(a, b2, T * 0.6).toArray()), 0, 0, 0.5, 0.3, 0));
      edge.q(q[0], q[1], q[2], q[3]);
    }
  }
  for (const [b, m] of [[outer, api.mats.shell], [inner, api.mats.membrane], [edge, api.mats.shellEdge]]) {
    if (!b.X.n) continue;
    const mesh = new THREE.Mesh(b.geometry(), m); mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

// --------------------------------------------------------------------- nest --
/**
 * Nest bedding: a ring mound of straw (thousands of instanced stalks: round, jointed, golden to
 * grey, lying along the mound and across each other, a few standing proud) round a linen pad.
 * o: { r (0.7 outer radius), rim (0.22 height), count (5000), pad (true) }
 */
function nest(api, F, o = {}) {
  const R = o.r ?? 0.7, rim = o.rim ?? 0.2, N = o.count ?? 5000;
  const g = new THREE.Group(); g.name = 'nest';
  const r = rng(o.seed ?? 3);
  // stalk geometries: 8 shapes (lengths, bends, a node or two), uv u along the stalk
  const geos = [];
  for (let s = 0; s < 8; s++) {
    const b = new Builder();
    const L = 0.16 + 0.22 * (s / 7);
    const bend = (r() - 0.5) * 0.12, bend2 = (r() - 0.5) * 0.06;
    const pts = [];
    for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push(V((t - 0.5) * L, bend * Math.sin(Math.PI * t) * L, bend2 * Math.sin(2 * Math.PI * t) * L)); }
    const rr = 0.0022 + 0.0012 * r();
    const nodes = [0.3 + 0.2 * r(), 0.7 + 0.15 * r()];
    tube(b, pts, (t) => rr * (1 + 0.35 * Math.max(...nodes.map((n) => Math.exp(-((t - n) ** 2) / 0.0004)))) * (t < 0.02 || t > 0.98 ? 0.75 : 1), { sides: 5, segments: 14, piece: s / 8 });
    geos.push(b.geometry());
  }
  // the mound surface: height h(d) (d = distance from the centre), a hollow in the middle
  const h = (d) => rim * Math.exp(-(((d - R * 0.62) / (R * 0.28)) ** 2)) + 0.03 * (1 - smooth(R * 0.95, R * 1.15, d));
  const per = Math.ceil(N / geos.length);
  const dummy = new THREE.Object3D();
  const Fm = new THREE.Matrix4().makeBasis(F.x, F.y, F.z).setPosition(F.o);
  for (let s = 0; s < geos.length; s++) {
    const im = new THREE.InstancedMesh(geos[s], api.mats.straw, per);
    for (let k = 0; k < per; k++) {
      const a = r() * Math.PI * 2;
      const d = R * (0.25 + 0.95 * Math.sqrt(r()));
      const y = h(d) * (0.4 + 0.6 * r()) + 0.004;
      dummy.position.set(Math.cos(a) * d, y, Math.sin(a) * d);
      // mostly lying round the ring (the tangent), tilted with the slope, some across, a few proud
      const tang = a + Math.PI / 2 + (r() - 0.5) * (r() < 0.25 ? 3 : 1.0);
      const slope = Math.atan2(h(d + 0.02) - h(d - 0.02), 0.04);
      const proud = r() < 0.06 ? 0.6 + r() * 0.5 : (r() - 0.5) * 0.35;
      dummy.rotation.set(0, 0, 0);
      dummy.quaternion.setFromEuler(new THREE.Euler(proud, -tang, slope * Math.cos(tang - a) * 0.8, 'YXZ'));
      dummy.updateMatrix();
      im.setMatrixAt(k, dummy.matrix.clone().premultiply(Fm));
    }
    im.castShadow = true; im.receiveShadow = true; im.name = 'straw-' + s;
    im.instanceMatrix.needsUpdate = true;
    g.add(im);
  }
  // the hollow lined with a folded linen pad
  if (o.pad !== false) {
    const k = new Kit();
    foldedCloth(k, sub(F, [0, 0.04, 0], 0.4), r, { w: R * 0.95, d: R * 0.8, layers: 3, mat: 'linenFold' });
    g.add(api.build(k, 'nest-pad'));
  }
  return g;
}

// ------------------------------------------------------------ small props --
/** A bowl (earthenware or turned wood) with water in it. o: { r, kind 'clay'|'wood', water (fill 0..1) } */
export function bowl(kit, F, rnd, o = {}) {
  const R = o.r ?? 0.14, H = o.h ?? R * 0.5, kind = o.kind ?? 'clay';
  const th = kind === 'wood' ? 0.012 : 0.007;
  const prof = [[0, 0], [R * 0.45, 0], [R * 0.5, 0.008]];
  for (let k = 1; k <= 10; k++) { const t = k / 10; prof.push([R * (0.5 + 0.5 * Math.sin(t * Math.PI / 2) ** 0.8), H * t]); }
  prof.push([R - th * 0.5, H + th * 0.3]);
  for (let k = 10; k >= 1; k--) { const t = k / 10; prof.push([R * (0.5 + 0.5 * Math.sin(t * Math.PI / 2) ** 0.8) - th, H * t + th * 0.4]); }
  prof.push([0, th * 1.2]);
  const wob = rnd() * 6;
  lathe(kit.get(kind === 'wood' ? 'oak' : (rnd() < 0.5 ? 'glaze' : 'clay')), F, prof, { seg: 40, piece: rnd(), rFn: (r0, y, a) => r0 * (1 + 0.01 * Math.sin(a * 2 + wob) * (y / H)) });
  if (o.water !== 0) {
    const f = o.water ?? 0.7, y = th + (H - th) * f;
    const rw = R * (0.5 + 0.5 * Math.sin(f * Math.PI / 2) ** 0.8) - th - 0.001;
    lathe(kit.get('water'), sub(F, [0, y, 0]), [[0, 0], [rw * 0.98, 0], [rw, 0.0012]], { seg: 40 });
  }
}

/**
 * Folded linen: a sheet folded `layers` times - real rounded fold edges on two opposite sides, the
 * stacked hems on the others, a soft sag and a few creases. F at the bottom centre.
 */
export function foldedCloth(kit, F, rnd, o = {}) {
  const W = o.w ?? 0.38, D = o.d ?? 0.3, n = o.layers ?? 4, t = o.t ?? 0.004;
  const b = kit.get(o.mat ?? 'linenFold');
  const gap = t * 1.6;
  const NX = 18;
  const ph = rnd() * 6;
  // the profile in (z, y): a zig-zag of layers joined by half-round folds at alternate ends
  const prof = [];
  for (let L = 0; L < n; L++) {
    const y = L * gap + t;
    const dir = L % 2 ? -1 : 1;
    for (let k = 0; k <= 8; k++) { const z = -dir * D / 2 + dir * D * (k / 8); prof.push([z * (1 - 0.02 * L), y + 0.0015 * Math.sin(k * 1.7 + L * 2 + ph)]); }
    if (L < n - 1) for (let k = 1; k < 6; k++) { const a = Math.PI * (k / 6); prof.push([dir * (D / 2 + Math.sin(a) * gap * 0.5) * (1 - 0.02 * L), y + gap * 0.5 - Math.cos(a) * gap * 0.5]); }
  }
  const base = b.count;
  let acc = 0;
  const vs = prof.map((p, i) => (i ? (acc += Math.hypot(p[0] - prof[i - 1][0], p[1] - prof[i - 1][1])) : 0));
  for (let i = 0; i <= NX; i++) {
    const x = (i / NX - 0.5) * W;
    for (let k = 0; k < prof.length; k++) {
      const [z, y] = prof[k];
      const crease = 0.002 * Math.sin(x * 40 + ph) * Math.sin(z * 25);
      b.v(fp(F, x * (1 - 0.01 * Math.sin(y * 300)), y + crease - 0.003 * Math.sin(Math.PI * (i / NX)) * (y / (n * gap)), z), x + W / 2, vs[k], 0.3, 1 - 0.25 * smooth(n * gap, 0, y), Math.abs(i / NX - 0.5) > 0.47 ? 1 : 0);
    }
  }
  const row = prof.length;
  for (let i = 0; i < NX; i++) for (let k = 0; k < row - 1; k++) { const a = base + i * row + k; b.q(a, a + 1, a + row + 1, a + row); }
}

/** A clay oil lamp: a closed body, a pinched nozzle with a wick, a ring handle. o.flame: add a small flame. */
export function oilLamp(kit, F, rnd, o = {}) {
  const b = kit.get('clayDark');
  lathe(b, F, [[0, 0], [0.035, 0], [0.045, 0.01], [0.048, 0.022], [0.035, 0.032], [0.015, 0.035], [0.012, 0.03], [0, 0.03]], { seg: 24, piece: rnd(), rFn: (r, y, a) => r * (1 + 0.5 * Math.exp(-((((a + Math.PI) % (Math.PI * 2)) - Math.PI) ** 2) / 0.08) * smooth(0.0, 0.02, y) * 0.0 + 0.0) });
  // nozzle toward +x, handle toward -x
  tube(b, [fp(F, 0.03, 0.018, 0), fp(F, 0.062, 0.022, 0), fp(F, 0.075, 0.026, 0)], (t) => 0.014 - 0.006 * t, { sides: 10, caps: true, piece: rnd() });
  const hp = []; for (let k = 0; k <= 10; k++) { const a = Math.PI * (k / 10); hp.push(fp(F, -0.045 - Math.sin(a) * 0.022, 0.016 + Math.cos(a) * 0.012 + 0.006, 0)); }
  tube(b, hp, 0.005, { sides: 6, piece: rnd() });
  tube(kit.get('rope'), [fp(F, 0.07, 0.025, 0), fp(F, 0.08, 0.032, 0)], 0.0025, { sides: 4 });
  if (o.flame) {
    const fb = kit.get('flame');
    lathe(fb, sub(F, [0.081, 0.034, 0]), [[0, 0], [0.004, 0.003], [0.005, 0.009], [0.003, 0.016], [0, 0.024]], { seg: 10 });
  }
}

/** The healer's supplies: a box with stoneware flasks, linen rolls, unguent pots, mortar and pestle, a splint. F at the box's foot. */
export function healerBox(kit, F, rnd, o = {}) {
  const W = 0.5, D = 0.32, H = 0.16;
  const m = kit.get('dark');
  // an open box: four sides and a floor, the lid leaning behind it
  box(m, sub(F, [0, 0.01, 0]), [W, 0.02, D], { grain: 'x', bevel: 0.003, piece: rnd(), ao: () => 0.7 });
  for (const s of [-1, 1]) {
    box(m, sub(F, [0, H / 2, s * (D / 2 - 0.009)]), [W, H, 0.018], { grain: 'x', bevel: 0.004, piece: rnd() });
    box(m, sub(F, [s * (W / 2 - 0.009), H / 2, 0]), [0.018, H, D - 0.036], { grain: 'z', bevel: 0.004, piece: rnd() });
  }
  box(m, sub(F, [0, D / 2 + 0.02, -D / 2 - 0.04], 0, -1.3), [W, 0.02, D], { grain: 'x', bevel: 0.004, piece: rnd() });
  // flasks (stoneware, corked)
  for (let i = 0; i < 4; i++) {
    const x = -W / 2 + 0.07 + i * 0.075, z = -0.06;
    const hh = 0.15 + rnd() * 0.04;
    lathe(kit.get('stoneware'), sub(F, [x, 0.02, z]), [[0, 0], [0.028, 0], [0.032, hh * 0.3], [0.03, hh * 0.65], [0.012, hh * 0.85], [0.01, hh], [0.012, hh + 0.004], [0, hh + 0.004]], { seg: 18, piece: rnd() });
    lathe(kit.get('cork'), sub(F, [x, 0.02 + hh, z]), [[0, 0], [0.009, 0], [0.011, 0.016], [0, 0.017]], { seg: 10 });
  }
  // linen rolls (bandages)
  for (let i = 0; i < 3; i++) {
    const c = fp(F, 0.05 + i * 0.05, 0.045, 0.07);
    lathe(kit.get('linenFold'), frame(c, [0, 1, 0], [0, 0, 1]), [[0, -0.03], [0.022, -0.03], [0.024, 0], [0.022, 0.03], [0, 0.03]], { seg: 16, piece: rnd() });
  }
  // unguent pots
  for (let i = 0; i < 2; i++) pot(kit, sub(F, [0.18, 0.02, -0.05 + i * 0.09]), rnd, { kind: 'cup', scale: 0.7, glaze: 0.8 });
  // mortar and pestle beside the box
  lathe(kit.get('stoneware'), sub(F, [W / 2 + 0.12, 0, 0.05]), [[0, 0], [0.06, 0], [0.07, 0.05], [0.068, 0.07], [0.055, 0.072], [0.05, 0.02], [0, 0.018]], { seg: 24, piece: rnd() });
  tube(kit.get('pale'), [fp(F, W / 2 + 0.12, 0.03, 0.05), fp(F, W / 2 + 0.2, 0.13, 0.08)], (t) => 0.014 - 0.005 * t, { sides: 8, caps: true });
  // a splint and a folded sling (triangular bandage) on the table beside it
  box(kit.get('pale'), sub(F, [-W / 2 - 0.1, 0.005, 0.1], 0.3), [0.32, 0.01, 0.05], { grain: 'x', bevel: 0.002, piece: rnd() });
  foldedCloth(kit, sub(F, [-W / 2 - 0.12, 0, -0.12], -0.2), rnd, { w: 0.24, d: 0.16, layers: 3, mat: 'linenFold' });
  herbBunch(kit, sub(F, [W / 2 + 0.25, 0.012, -0.12], 0, 0, Math.PI / 2 - 0.15), rnd, { l: 0.22, string: 0.04 });
}

/** Riding-ground gear: mounting steps (a timber stair block), a ladder, a saddle stand with a folded blanket. */
export function groundGear(kit, F, rnd, o = {}) {
  const m = kit.get('silver');
  // mounting steps: three treads on stringers
  for (let s = 0; s < 3; s++) box(m, sub(F, [0, 0.2 + s * 0.22, -s * 0.28]), [0.9, 0.05, 0.3], { grain: 'x', bevel: 0.008, piece: rnd(), wearEdge: 0.03 });
  for (const x of [-0.42, 0.42]) {
    const a = fp(F, x, 0, 0.18), b = fp(F, x, 0.68, -0.68);
    const X = b.clone().sub(a).normalize(), Fm = frame(a.clone().add(b).multiplyScalar(0.5), X, [0, 1, 0]);
    box(m, Fm, [a.distanceTo(b), 0.16, 0.05], { grain: 'x', bevel: 0.008, piece: rnd() });
    box(m, sub(F, [x, 0.33, -0.72]), [0.06, 0.66, 0.06], { grain: 'y', bevel: 0.008, piece: rnd() });
  }
  // a ladder leaning on a frame
  const L = 2.6;
  const lf = sub(F, [1.4, 0, -0.3], 0, -0.22);
  for (const x of [-0.22, 0.22]) box(m, sub(lf, [x, L / 2, 0]), [0.06, L, 0.05], { grain: 'y', bevel: 0.008, piece: rnd() });
  for (let k = 0; k < 8; k++) tube(kit.get('oak'), [fp(lf, -0.22, 0.25 + k * 0.3, 0), fp(lf, 0.22, 0.25 + k * 0.3, 0)], 0.017, { sides: 7, caps: true, piece: rnd() });
  // a saddle stand: a trestle with a ridge, a folded blanket over it
  const sf = sub(F, [-1.4, 0, 0], 0.3);
  box(m, sub(sf, [0, 0.82, 0]), [0.8, 0.07, 0.1], { grain: 'x', bevel: 0.01, piece: rnd() });
  for (const x of [-0.32, 0.32]) for (const z of [-1, 1]) {
    const a = fp(sf, x, 0.8, 0), b = fp(sf, x, 0, z * 0.3);
    tube(kit.get('silver'), [a, b], 0.03, { sides: 7, caps: true, piece: rnd() });
  }
  // the blanket hanging over the ridge
  const bb = kit.get('blanket');
  const base = bb.count;
  const NX = 16, NZ = 24, Wb = 0.7, Lb = 0.9;
  for (let i = 0; i <= NX; i++) for (let k = 0; k <= NZ; k++) {
    const x = (i / NX - 0.5) * Wb, s = (k / NZ - 0.5) * Lb;
    const a = clamp(s / 0.07, -1.57, 1.57);
    const z = Math.abs(s) < 0.11 ? Math.sin(a) * 0.07 : Math.sign(s) * (0.07 + (Math.abs(s) - 0.11) * 0.22);
    const y = Math.abs(s) < 0.11 ? 0.86 + Math.cos(a) * 0.04 : 0.86 - (Math.abs(s) - 0.11) + 0.02 * Math.sin(x * 20 + s * 9);
    bb.v(fp(sf, x, y, z), x, s, 0.4, 1, Math.abs(i / NX - 0.5) > 0.46 || Math.abs(k / NZ - 0.5) > 0.47 ? 1 : 0);
  }
  for (let i = 0; i < NX; i++) for (let k = 0; k < NZ; k++) { const a = base + i * (NZ + 1) + k; bb.q(a, a + 1, a + NZ + 2, a + NZ + 1); }
}
