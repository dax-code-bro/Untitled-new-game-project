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
  mats.shell = await surface(ctx, { name: 'egg-shell', scan: 'pbr/acg_leather26', tile: [0.12, 0.12], detail: 0.35, normalScale: 0.35, color: [0.028, 0.026, 0.024], color2: [0.035, 0.03, 0.026], roughness: 0.42, roughVar: 0.4, pieceVar: 0.15, macro: 0.5, macroF: 9, wear: 0.4, wearColor: [0.06, 0.05, 0.04], clearcoat: 0.3, clearcoatRoughness: 0.35 });
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
  const NT = 72, NP = 96;
  const cellAt = (th, ph) => {
    const d = V(Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th));
    // ragged boundaries: jitter the direction with noise before the nearest-seed test
    d.x += 0.07 * fbm(d.x * 9 + 3, d.y * 9, d.z * 9, 2); d.y += 0.07 * fbm(d.x * 9, d.y * 9 + 7, d.z * 9, 2); d.z += 0.07 * fbm(d.x * 9, d.y * 9, d.z * 9 + 11, 2);
    let best = 0, bd = -2;
    for (let i = 0; i < seeds.length; i++) { const w = i === seeds.length - 1 ? -0.35 : 0; const v = d.dot(seeds[i]) + w; if (v > bd) { bd = v; best = i; } }
    return best;
  };
  const cells = [];
  for (let i = 0; i <= NT; i++) for (let j = 0; j <= NP; j++) cells.push(cellAt((i / NT) * Math.PI, (j / NP) * Math.PI * 2));
  const cid = (i, j) => cells[i * (NP + 1) + (j % (NP + 1))];
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
  const vtx = new Map();
  const Pof = (i, j, inset, c) => {
    const p = shape((i / NT) * Math.PI, ((j % NP) / NP) * Math.PI * 2);
    const n = p.clone().sub(V(0, H / 2, 0)).normalize();
    // a fragment boundary sits a hair back from its neighbour: the crack reads as a dark seam
    const gap = state === 'closed' ? 0.0004 : 0.0007;
    const p2 = p.addScaledVector(n, -inset);
    return p2;
  };
  for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) {
    const c = cid(i, j);
    if (cid(i + 1, j) !== c || cid(i, j + 1) !== c || cid(i + 1, j + 1) !== c) continue;   // boundary quads are the crack
    const m = frag.get(c);
    const piece = (c * 0.137) % 1;
    const corners = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]];
    const o4 = corners.map(([a, b]) => outer.v(fp(F, ...Pof(a, b, 0, c).applyMatrix4(m).toArray()), b / NP * 1.4, a / NT * 0.7, piece, 1, 0));
    outer.q(o4[0], o4[1], o4[2], o4[3]);
    const i4 = corners.map(([a, b]) => inner.v(fp(F, ...Pof(a, b, T, c).applyMatrix4(m).toArray()), b / NP * 1.4, a / NT * 0.7, piece, 0.8, 0));
    inner.q(i4[0], i4[3], i4[2], i4[1]);
    // edges: where the neighbouring quad belongs to another cell (or is a crack quad), wall it
    const nb = [[i - 1, j, [0, 1]], [i, j + 1, [1, 2]], [i + 1, j, [2, 3]], [i, j - 1, [3, 0]]];
    for (const [ni, nj, [e0, e1]] of nb) {
      if (ni < 0 || ni >= NT) continue;
      const jj = (nj + NP) % NP;
      const nc = cid(ni, jj);
      const nq = cid(ni + 1, jj) === nc && cid(ni, jj + 1) === nc && cid(ni + 1, jj + 1) === nc;
      if (nq && nc === c) continue;
      const a0 = corners[e0], a1 = corners[e1];
      const w = [
        edge.v(fp(F, ...Pof(a0[0], a0[1], 0, c).applyMatrix4(m).toArray()), 0, 0, piece, 0.9, 0),
        edge.v(fp(F, ...Pof(a1[0], a1[1], 0, c).applyMatrix4(m).toArray()), 0.01, 0, piece, 0.9, 0),
        edge.v(fp(F, ...Pof(a1[0], a1[1], T, c).applyMatrix4(m).toArray()), 0.01, T, piece, 0.7, 0),
        edge.v(fp(F, ...Pof(a0[0], a0[1], T, c).applyMatrix4(m).toArray()), 0, T, piece, 0.7, 0),
      ];
      edge.q(w[0], w[3], w[2], w[1]);
    }
  }
  // closed / cracked: the crack quads themselves are a dark recessed seam (the old fracture)
  if (state === 'closed' || state === 'cracked') {
    for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) {
      const c = cid(i, j);
      if (cid(i + 1, j) === c && cid(i, j + 1) === c && cid(i + 1, j + 1) === c) continue;
      const corners = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]];
      const q = corners.map(([a, b]) => edge.v(fp(F, ...Pof(a, b, T * 0.6, c).toArray()), 0, 0, 0.5, 0.3, 0));
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
