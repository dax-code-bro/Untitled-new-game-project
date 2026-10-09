// Props library - market goods: bread, fruit, vegetables, fish, cheese, pottery, cloth bolts,
// eggs, onion strings, herb bunches. Procedural, seeded; shapes taken from the real thing (a
// scored boule has its "ear", an apple its stalk cavity and calyx, a cabbage overlapping cupped
// leaves with a midrib, a fish fins, eye and a silver belly; pots are thrown - throwing rings,
// a dipped glaze that stops short of the foot and runs).
//
//   const G = await goodsMaterials(ctx);
//   const k = new Kit(); loaf(k, F, rnd); apples(k, F, rnd, 12, { r: 0.18 }); ...
//   scene.add(k.build(goodsMats(M, G)));
import * as THREE from 'three';
import { Builder, box, tube, lathe, fp, fd, sub, frame, clamp, smooth, hash, fbm, vnoise } from './core.js';
import { surface, clothMaterial } from './materials.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const cache = new WeakMap();
/** Materials of the goods (linear colours; most use per-vertex colour painted by the builders). */
export async function goodsMaterials(ctx) {
  if (cache.has(ctx)) return cache.get(ctx);
  const p = (async () => {
    const S = (o) => surface(ctx, { scan: null, wear: 0, ao: 0.7, pieceVar: 0.15, macro: 0.06, macroF: 30, vertexColors: true, color: [1, 1, 1], ...o });
    return {
      crust: await S({ name: 'crust', roughness: 0.62, roughVar: 0.3, sheen: 0.25, sheenColor: [0.8, 0.6, 0.35] }),
      fruit: await S({ name: 'fruit', roughness: 0.32, roughVar: 0.3, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
      leaf: await S({ name: 'leaf', roughness: 0.55, roughVar: 0.3, sheen: 0.12, sheenColor: [0.4, 0.5, 0.42], sheenRoughness: 0.5, cloth: { transmission: 0.15, forward: 0.5 }, side: THREE.DoubleSide }),
      root: await S({ name: 'root', roughness: 0.6, roughVar: 0.3, macro: 0.15, macroF: 60 }),
      onion: await S({ name: 'onion', roughness: 0.48, roughVar: 0.4, sheen: 0.5, sheenColor: [0.9, 0.7, 0.45], macro: 0.18, macroF: 40 }),
      fish: await S({ name: 'fish', roughness: 0.22, roughVar: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.12, metalness: 0.15 }),
      cheese: await S({ name: 'cheese', roughness: 0.7, roughVar: 0.2, macro: 0.2, macroF: 25 }),
      egg: await S({ name: 'egg', roughness: 0.45, roughVar: 0.2, macro: 0.08, macroF: 80 }),
      herb: await S({ name: 'herb', roughness: 0.6, cloth: { transmission: 0.25, forward: 0.5 }, side: THREE.DoubleSide }),
      bolt1: await clothMaterial(ctx, { name: 'bolt-madder', color: [0.3, 0.045, 0.03], color2: [0.27, 0.04, 0.03], transmission: 0.05, scan: 'pbr/acg_fabric37', tile: [0.3, 0.3] }),
      bolt2: await clothMaterial(ctx, { name: 'bolt-woad', color: [0.05, 0.09, 0.17], color2: [0.045, 0.08, 0.15], transmission: 0.05, scan: 'pbr/acg_fabric37', tile: [0.3, 0.3] }),
      bolt3: await clothMaterial(ctx, { name: 'bolt-weld', color: [0.42, 0.33, 0.07], color2: [0.4, 0.31, 0.06], transmission: 0.05, scan: 'pbr/acg_fabric36', tile: [0.3, 0.3] }),
      bolt4: await clothMaterial(ctx, { name: 'bolt-green', color: [0.07, 0.12, 0.05], color2: [0.065, 0.11, 0.045], transmission: 0.05, scan: 'pbr/acg_fabric37', tile: [0.3, 0.3] }),
      bolt5: await clothMaterial(ctx, { name: 'bolt-undyed', color: [0.5, 0.45, 0.36], color2: [0.47, 0.42, 0.34], transmission: 0.05, scan: 'pbr/acg_fabric36', tile: [0.3, 0.3] }),
    };
  })();
  cache.set(ctx, p);
  return p;
}
/** The material map for kits holding goods + containers (M = propMaterials, G = goodsMaterials). */
export function goodsMats(M, G) {
  return {
    ...G,
    stave: M.wood.stave, oak: M.wood.oak, silver: M.wood.silver, pale: M.wood.pale, dark: M.wood.dark, withy: M.wood.withy, tar: M.wood.tar,
    iron: M.iron, ironDark: M.ironDark, rope: M.rope, hessian: M.hessian, leather: M.leather, linen: M.linen, wool: M.wool, straw: M.straw,
    clay: M.clay, glaze: M.clayGlaze, clayDark: M.clayDark,
  };
}

// colour helpers (vertex colours are written through the builder's "ao" slot? no - a parallel array)
class Painter {
  constructor(b) { this.b = b; this.c = []; }
  v(p, u, w, piece, ao, wear, col) { const i = this.b.v(p, u, w, piece, ao, wear); this.c[i] = col; return i; }
}
const painters = new WeakMap();
/** Per-vertex colours for a builder (stored alongside; applied when the kit is built: paintKit()). */
function colorOf(b) { if (!painters.has(b)) painters.set(b, []); return painters.get(b); }
function vc(b, p, u, w, piece, ao, col) { const i = b.v(p, u, w, piece, ao, 0); colorOf(b)[i] = col; return i; }
/** Build a kit whose builders may carry vertex colours (missing colours = white). */
export function buildGoods(kit, mats, name = 'goods') {
  const g = new THREE.Group(); g.name = name;
  for (const [k, b] of Object.entries(kit.b)) {
    if (!b.X.n) continue;
    const geo = b.geometry();
    const cols = painters.get(b);
    if (cols) {
      const n = geo.attributes.position.count, arr = new Float32Array(n * 3).fill(1);
      for (let i = 0; i < n; i++) if (cols[i]) arr.set(cols[i], i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    } else if (mats[k] && mats[k].vertexColors) {
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
    }
    if (!mats[k]) throw new Error(`goods: no material "${k}"`);
    const m = new THREE.Mesh(geo, mats[k]); m.castShadow = true; m.receiveShadow = true; m.name = `${name}:${k}`;
    g.add(m);
  }
  return g;
}

/** A sphere-topology surface: fn(theta 0..pi from the top, phi 0..2pi) -> [Vector3 local, colour]. */
function blob(b, F, nT, nP, fn, piece = 0) {
  const base = b.count;
  for (let i = 0; i <= nT; i++) for (let j = 0; j <= nP; j++) {
    const th = (i / nT) * Math.PI, ph = (j / nP) * Math.PI * 2;
    const [p, col, ao] = fn(th, ph, i, j);
    vc(b, fp(F, p.x, p.y, p.z), ph * 0.05, th * 0.05, piece, ao ?? 1, col);
  }
  const row = nP + 1;
  for (let i = 0; i < nT; i++) for (let j = 0; j < nP; j++) {
    const a = base + i * row + j;
    b.q(a, a + 1, a + row + 1, a + row);
  }
}

// -------------------------------------------------------------------- bread --
/** A loaf: kind 'boule' (round, scored cross / slashes), 'batard' (oval), 'roll', 'plait'. */
export function loaf(kit, F, rnd, o = {}) {
  const kind = o.kind ?? (rnd() < 0.5 ? 'boule' : 'batard');
  const b = kit.get('crust');
  const R = (o.r ?? (kind === 'roll' ? 0.045 : 0.1)) * (0.9 + 0.2 * rnd());
  const ex = kind === 'batard' ? 1.55 + 0.2 * rnd() : 1.0;
  const hgt = kind === 'roll' ? 0.75 : 0.62 + 0.1 * rnd();
  const cuts = kind === 'boule' ? (rnd() < 0.5 ? 'cross' : 'slash') : kind === 'batard' ? 'slash' : 'none';
  const ns = 2 + Math.floor(rnd() * 3);
  const ph0 = rnd() * 6;
  const pale = rnd() < 0.3;
  const baseC = pale ? [0.42, 0.25, 0.1] : [0.26, 0.12, 0.045];
  const flour = rnd() < 0.5 ? 0.6 + 0.4 * rnd() : 0;
  if (kind === 'plait') {
    // three ropes of dough plaited, flattened by the bake
    for (let s = 0; s < 3; s++) {
      const pts = [];
      for (let i = 0; i <= 30; i++) {
        const t = i / 30, x = (t - 0.5) * R * 3.4;
        const a = t * Math.PI * 4 + (s * 2 * Math.PI) / 3;
        pts.push(fp(F, x, R * 0.3 + Math.sin(a) * R * 0.18, Math.cos(a) * R * 0.32));
      }
      const tb = kit.get('crust');
      const base = tb.count;
      tube(tb, pts, (t) => R * 0.3 * (0.6 + 0.4 * Math.sin(Math.PI * t)), { sides: 10, segments: 40, piece: 0.3 + s * 0.1 });
      const cols = colorOf(tb);
      for (let i = base; i < tb.count; i++) { const y = tb.P.a[i * 3 + 1] - F.o.y; const k = clamp(y / (R * 0.6), 0, 1); cols[i] = baseC.map((c) => c * (1.2 - 0.5 * k)); }
    }
    return;
  }
  blob(b, F, 28, 40, (th, ph) => {
    // a domed top that flattens to a base with a soft "foot" where it spread on the oven floor
    const ct = Math.cos(th), st = Math.sin(th);
    let y = ct > 0 ? ct * R * hgt : ct * R * 0.12;
    let r = st * R * (ct > 0 ? 1 : 1.04);
    if (ct < -0.6) r *= 0.98;
    let x = Math.cos(ph) * r * ex, z = Math.sin(ph) * r;
    // scoring: the cut opens into a groove with raised "ears" along one lip
    let cut = 0;
    if (ct > 0.15) {
      if (cuts === 'cross') {
        const d = Math.min(Math.abs(x), Math.abs(z)) / R;
        cut = Math.exp(-(d * d) / 0.004) * smooth(0.15, 0.5, ct);
      } else if (cuts === 'slash') {
        const u = (x / (R * ex)) * Math.cos(0.5) + (z / R) * Math.sin(0.5);
        const k = Math.abs(Math.sin(u * Math.PI * ns * 0.5 + ph0));
        cut = Math.exp(-((1 - k) ** 2) / 0.01) * smooth(0.2, 0.55, ct);
      }
    }
    const lump = 1 + 0.03 * fbm(x * 30 + ph0, y * 30, z * 30, 2);
    y = y * lump - cut * R * 0.09;
    x *= lump; z *= lump;
    const top = clamp(y / (R * hgt), 0, 1);
    // colour: dark at the crown, golden at the flanks, pale in the cuts, floured patches
    let c = baseC.map((v, i) => v * (1.35 - 0.6 * top) * (0.9 + 0.2 * vnoise(x * 60, y * 60, z * 60)));
    c = c.map((v, i) => v * (1 - cut) + [0.55, 0.42, 0.24][i] * cut);
    const fl = flour * smooth(0.45, 0.8, vnoise(x * 25 + 3, z * 25, ph0)) * (0.3 + 0.7 * top) * (1 - cut);
    c = c.map((v) => v * (1 - fl) + 0.62 * fl);
    if (ct < -0.2) c = c.map((v) => v * 0.8);
    return [V(x, y + R * 0.12, z), c, 1 - 0.4 * cut];
  }, 0.2 + rnd() * 0.5);
}

// -------------------------------------------------------------------- fruit --
/** An apple or a pear at F (resting on its side or on its base). o: { kind 'apple'|'pear', r } */
export function fruit(kit, F, rnd, o = {}) {
  const kind = o.kind ?? 'apple';
  const b = kit.get('fruit');
  const R = (o.r ?? (kind === 'apple' ? 0.036 : 0.033)) * (0.85 + 0.3 * rnd());
  const red = o.red ?? rnd();
  const ph = rnd() * 6;
  blob(b, F, 18, 22, (th, phi) => {
    const ct = Math.cos(th), st = Math.sin(th);
    let r = R, y = ct * R * 0.92;
    if (kind === 'pear') { const t = (1 - ct) / 2; r = R * (0.55 + 0.6 * Math.pow(t, 1.4)) * (ct > -0.95 ? 1 : 0.9); y = ct * R * 1.5; }
    // stalk cavity and calyx: dimples at both poles
    const dimple = Math.exp(-(st * st) / 0.03) * R * 0.25;
    y -= Math.sign(ct) * dimple;
    const lob = 1 + 0.03 * Math.sin(phi * 5 + ph) * st;
    const x = Math.cos(phi) * st * r * lob, z = Math.sin(phi) * st * r * lob;
    // skin: a blush on one side streaked along the meridians, lenticel dots, green-yellow ground
    const blush = clamp(0.5 + 0.5 * Math.cos(phi - ph) + 0.25 * fbm(phi * 2, th * 3, ph, 2), 0, 1) * red;
    const streak = 0.75 + 0.25 * Math.sin(phi * 37 + Math.sin(th * 5) * 2);
    const ground = kind === 'pear' ? [0.3, 0.3, 0.06] : [0.28, 0.33, 0.06];
    const rc = [0.32 * streak, 0.025, 0.02];
    let c = ground.map((g, i) => g * (1 - blush) + rc[i] * blush);
    if (vnoise(phi * 30, th * 30, ph) > 0.82) c = c.map((v) => v * 1.25 + 0.03);
    if (Math.abs(ct) > 0.93) c = c.map((v, i) => [0.12, 0.1, 0.04][i]);
    return [V(x, y + R, z), c, Math.abs(ct) > 0.9 ? 0.6 : 1];
  }, 0.1 + rnd() * 0.8);
  // stalk
  const top = fp(F, 0, R * (kind === 'pear' ? 2.3 : 1.6), 0);
  const rb = kit.get('root'), s0 = rb.count;
  tube(rb, [fp(F, 0, R * (kind === 'pear' ? 2.2 : 1.55), 0), top.clone().add(fd(F, (rnd() - 0.5) * 0.01, 0.014, (rnd() - 0.5) * 0.01))], 0.0018, { sides: 4, piece: 0.9 });
  const cols = colorOf(rb); for (let i = s0; i < rb.count; i++) cols[i] = [0.08, 0.05, 0.025];
}

/** A heap of fruit in a container whose inside bottom is at F (radius r, or w x d), rising to a dome. */
export function fruitHeap(kit, F, rnd, n, o = {}) {
  const r = o.r ?? 0.18, sx = o.sx ?? 1, layer = o.layer ?? 0.06;
  const placed = [];
  for (let k = 0; k < n; k++) {
    let best = null;
    for (let tries = 0; tries < 30; tries++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r;
      const x = Math.cos(a) * d * sx, z = Math.sin(a) * d;
      // stack: the height is set by the fruit already there
      let y = 0;
      for (const q of placed) { const dd = Math.hypot(q[0] - x, q[2] - z); if (dd < layer * 1.05) y = Math.max(y, q[1] + Math.sqrt(Math.max(0, (layer * 1.05) ** 2 - dd * dd)) * 0.85); }
      y = Math.min(y, (o.maxH ?? 0.12) * (1 - (d / r) ** 2) + 0.005);
      if (!best || y < best[1]) best = [x, y, z];
    }
    placed.push(best);
    const Fk = sub(F, best, rnd() * 6, (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 1.2);
    // (the heap's own options - its radius - are not the item's)
    if (o.kind === 'onion') onion(kit, Fk, rnd, {});
    else if (o.kind === 'egg') egg(kit, Fk, rnd, {});
    else if (o.kind === 'turnip') rootVeg(kit, Fk, rnd, { kind: 'turnip' });
    else fruit(kit, Fk, rnd, { kind: o.kind });
  }
}

// --------------------------------------------------------------- vegetables --
/** A cabbage: a dense head with cupped outer leaves, midribs and veins. */
export function cabbage(kit, F, rnd, o = {}) {
  const R = (o.r ?? 0.085) * (0.85 + 0.3 * rnd());
  const b = kit.get('leaf');
  const ph = rnd() * 6;
  // the head
  blob(b, F, 16, 24, (th, phi) => {
    const ct = Math.cos(th), st = Math.sin(th);
    const r = R * 0.82 * (1 + 0.04 * fbm(phi * 3, th * 3, ph, 2));
    const vein = Math.pow(Math.abs(Math.sin(phi * 4 + th * 3 + ph)), 18);
    const c = [0.1 + 0.2 * vein, 0.19 + 0.16 * vein, 0.07 + 0.14 * vein].map((v) => v * (0.8 + 0.4 * (ct * 0.5 + 0.5)));
    return [V(Math.cos(phi) * st * r, ct * r * 0.9 + R * 0.8, Math.sin(phi) * st * r), c, 0.8];
  }, 0.3);
  // outer leaves: cupped shells wrapping the head, each with a midrib, opening at the top
  const nl = 5 + Math.floor(rnd() * 3);
  for (let k = 0; k < nl; k++) {
    const a0 = (k / nl) * Math.PI * 2 + rnd() * 0.5;
    const spread = 1.1 + rnd() * 0.5, open = 0.25 + rnd() * 0.35;
    const lr = R * (1.0 + 0.12 * (k % 2));
    const base = b.count;
    const NU = 10, NV = 10;
    for (let i = 0; i <= NV; i++) for (let j = 0; j <= NU; j++) {
      const v = i / NV, u = j / NU - 0.5;
      const th = Math.PI * (0.95 - v * (0.85 - open * 0.4));        // from under the head to the top
      const phi = a0 + u * spread;
      const st = Math.sin(th), ct = Math.cos(th);
      const ripple = 1 + 0.05 * Math.sin(u * 14 + k) * v + 0.04 * Math.sin(v * 9 + u * 5) + 0.06 * Math.sin(u * 37 + k * 3) * v * v + 0.03 * fbm(u * 6 + k, v * 6, k, 2);
      const outward = 1 + open * v * v * 0.6;
      const rr = lr * ripple * outward * (1 - 0.15 * Math.abs(u) * v);
      const mid = Math.exp(-(u * u) / 0.004);
      const vein = Math.pow(Math.abs(Math.sin(u * 9 + v * 6)), 14) * 0.5 + mid;
      const c = [0.08 + 0.26 * vein, 0.16 + 0.2 * vein, 0.07 + 0.18 * vein].map((x) => x * (0.65 + 0.45 * v));
      vc(b, fp(F, Math.cos(phi) * st * rr, ct * rr * 0.9 + R * 0.8 + mid * 0.004, Math.sin(phi) * st * rr), u * 0.2, v * 0.2, 0.4 + k * 0.05, 0.6 + 0.4 * v, c);
    }
    const row = NU + 1;
    for (let i = 0; i < NV; i++) for (let j = 0; j < NU; j++) { const a = base + i * row + j; b.q(a, a + row, a + row + 1, a + 1); }
  }
}

/** Onion: a bulb with papery skin, a dry neck and wispy roots. */
export function onion(kit, F, rnd, o = {}) {
  const R = (o.r ?? 0.03) * (0.8 + 0.4 * rnd());
  const b = kit.get('onion');
  const red = rnd() < 0.25;
  blob(b, F, 14, 18, (th, phi) => {
    const ct = Math.cos(th), st = Math.sin(th);
    let r = R * (1 - 0.55 * Math.pow(Math.max(0, ct), 4)) * (1 - 0.1 * Math.pow(Math.max(0, -ct), 2));
    let y = ct * R * 0.85 + (ct > 0 ? Math.pow(ct, 8) * R * 0.3 : 0);
    const line = Math.pow(Math.abs(Math.sin(phi * 9 + th)), 8);
    const base = red ? [0.22, 0.05, 0.06] : [0.38, 0.19, 0.06];
    const c = base.map((v) => v * (0.85 + 0.3 * line) * (0.9 + 0.2 * vnoise(phi * 9, th * 9, R * 100)));
    return [V(Math.cos(phi) * st * r, y + R * 0.9, Math.sin(phi) * st * r), c, 1];
  }, 0.5);
}

/** Root vegetables: 'carrot' | 'turnip' | 'leek' (lying, axis along F.x). */
export function rootVeg(kit, F, rnd, o = {}) {
  const kind = o.kind ?? 'carrot';
  const b = kit.get('root');
  if (kind === 'turnip') {
    const R = 0.036 * (0.85 + 0.3 * rnd());
    blob(b, F, 14, 16, (th, phi) => {
      const ct = Math.cos(th), st = Math.sin(th);
      let r = R * st, y = ct * R * 0.85;
      if (ct < -0.3) { const t = (-0.3 - ct) / 0.7; r *= 1 - 0.85 * t; y -= t * t * R * 1.2; }
      const t = clamp((y / R + 0.2) / 1.0, 0, 1);
      const c = [0.55 - 0.33 * t, 0.5 - 0.44 * t, 0.42 - 0.24 * t].map((v) => v * (0.9 + 0.2 * vnoise(phi * 8, th * 8, 1)));
      return [V(Math.cos(phi) * r, y + R, Math.sin(phi) * r), c, 1];
    }, 0.6);
    return;
  }
  const L = (kind === 'leek' ? 0.32 : 0.16) * (0.85 + 0.3 * rnd());
  const R = kind === 'leek' ? 0.016 : 0.014;
  const base = b.count;
  const NS = 10, NL = 24;
  for (let i = 0; i <= NL; i++) {
    const t = i / NL;
    const r = kind === 'carrot' ? R * Math.pow(1 - t, 0.7) * (1 + 0.06 * Math.sin(t * 60)) : R * (1 + 0.15 * t);
    for (let j = 0; j <= NS; j++) {
      const a = (j / NS) * Math.PI * 2;
      const c = kind === 'carrot' ? [0.5, 0.14, 0.02].map((v) => v * (0.85 + 0.15 * Math.sin(t * 80) ** 2)) : t < 0.55 ? [0.6, 0.6, 0.5] : [0.1 + 0.1 * (1 - t), 0.2 + 0.05 * (1 - t), 0.06];
      vc(b, fp(F, t * L, Math.cos(a) * r + R, Math.sin(a) * r), t * L, a * R, 0.3, 1, c);
    }
  }
  for (let i = 0; i < NL; i++) for (let j = 0; j < NS; j++) { const a = base + i * (NS + 1) + j; b.q(a, a + 1, a + NS + 2, a + NS + 1); }
  if (kind === 'carrot') {
    // the green tops, cut short
    for (let k = 0; k < 4; k++) tube(b, [fp(F, -0.002, R, 0), fp(F, -0.03 - rnd() * 0.02, R + (rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.02)], 0.002, { sides: 4, piece: 0.8 });
    const cols = colorOf(b); for (let i = 0; i < b.count; i++) if (!cols[i]) cols[i] = [0.06, 0.12, 0.03];
  }
}

// --------------------------------------------------------------------- fish --
/** A whole fish lying on its side (length L along F.x, head at +x). */
export function fish(kit, F, rnd, o = {}) {
  const L = (o.l ?? 0.32) * (0.85 + 0.3 * rnd());
  const b = kit.get('fish');
  const H = L * 0.24, Wd = L * 0.1;
  const NL = 40, NS = 18;
  const base = b.count;
  const sp = rnd() * 6;
  const prof = (t) => {        // t 0 tail .. 1 snout
    const body = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.75) * (t < 0.18 ? 0.3 + 0.7 * (t / 0.18) : 1);
    return body;
  };
  for (let i = 0; i <= NL; i++) {
    const t = i / NL;
    const pr = prof(t);
    for (let j = 0; j <= NS; j++) {
      const a = (j / NS) * Math.PI * 2;
      const hy = Math.sin(a) * H * 0.5 * pr * (t < 0.08 ? 1 + (0.08 - t) * 14 : 1);
      const wz = Math.cos(a) * Wd * 0.5 * pr * (t < 0.12 ? 0.25 : 1);
      // colour: dark mottled back, silver flanks, white belly; an eye; the gill cover
      const up = Math.sin(a);
      const back = smooth(0.1, 0.8, up);
      let c = [0.55 - 0.47 * back, 0.57 - 0.47 * back, 0.6 - 0.48 * back];
      c = c.map((v) => v * (0.85 + 0.25 * Math.pow(Math.abs(Math.sin(t * 160 + a * 9 + sp)), 3)));
      if (back > 0.4) c = c.map((v) => v * (0.7 + 0.5 * vnoise(t * 30, a * 4, sp)));
      const eyeD = Math.hypot((t - 0.87) * L, (up - 0.35) * H * 0.5);
      if (eyeD < L * 0.022 && Math.abs(Math.cos(a)) > 0.3) c = eyeD < L * 0.013 ? [0.005, 0.005, 0.005] : [0.5, 0.42, 0.25];
      if (Math.abs(t - 0.76) < 0.006 && Math.abs(up) < 0.7) c = c.map((v) => v * 0.55);
      vc(b, fp(F, (t - 0.5) * L, H * 0.5 + hy, wz), t * L, a * 0.05, 0.2 + sp * 0.01, 1, c);
    }
  }
  for (let i = 0; i < NL; i++) for (let j = 0; j < NS; j++) { const a = base + i * (NS + 1) + j; b.q(a, a + NS + 1, a + NS + 2, a + 1); }
  // tail fin and dorsal fin as thin double-sided fans
  const fin = (pts, col) => {
    const fb = kit.get('leaf');
    const i0 = fb.count;
    for (const p of pts) vc(fb, p, 0, 0, 0.9, 0.9, col);
    for (let k = 1; k < pts.length - 1; k++) fb.t(i0, i0 + k, i0 + k + 1);
  };
  const tx = -0.5 * L;
  fin([fp(F, tx + L * 0.03, H * 0.5, 0), fp(F, tx - L * 0.12, H * 0.5 + H * 0.55, 0), fp(F, tx - L * 0.06, H * 0.5, 0.002), fp(F, tx - L * 0.12, H * 0.5 - H * 0.55, 0)], [0.12, 0.13, 0.13]);
  fin([fp(F, -0.05 * L, H * 0.98, 0), fp(F, 0.05 * L, H * 1.25, 0.001), fp(F, 0.15 * L, H * 0.98, 0)], [0.1, 0.11, 0.11]);
}

// ------------------------------------------------------------- dairy, eggs --
export function cheese(kit, F, rnd, o = {}) {
  const R = (o.r ?? 0.13) * (0.9 + 0.2 * rnd()), h = (o.h ?? 0.08) * (0.9 + 0.2 * rnd());
  const b = kit.get('cheese');
  const base = b.count;
  const prof = [[0, 0], [R * 0.95, 0], [R, h * 0.12], [R * 1.02, h * 0.5], [R, h * 0.88], [R * 0.95, h], [0, h]];
  const tone = rnd();
  lathe(b, F, prof, { seg: 36, piece: 0.4 + 0.2 * rnd(), rFn: (r, y, a) => r * (1 + 0.012 * Math.sin(a * 3 + tone * 6)) });
  const cols = colorOf(b);
  for (let i = base; i < b.count; i++) cols[i] = [0.42, 0.27, 0.08].map((v) => v * (0.7 + 0.3 * tone) * (0.85 + 0.3 * vnoise(b.P.a[i * 3] * 40, b.P.a[i * 3 + 1] * 40, b.P.a[i * 3 + 2] * 40)));
}
export function egg(kit, F, rnd, o = {}) {
  const R = 0.022 * (0.9 + 0.2 * rnd());
  const brown = rnd() < 0.6;
  blob(kit.get('egg'), F, 12, 16, (th, phi) => {
    const ct = Math.cos(th), st = Math.sin(th);
    const r = R * st * (1 - 0.12 * ct);
    const c = brown ? [0.45, 0.25, 0.13] : [0.62, 0.58, 0.5];
    return [V(Math.cos(phi) * r, ct * R * 1.28 + R, Math.sin(phi) * r), c.map((v) => v * (0.92 + 0.12 * vnoise(phi * 9, th * 9, 3))), 1];
  }, 0.3);
}

// ------------------------------------------------------------------ pottery --
/**
 * Thrown earthenware: kind 'jug' (handle, pinched spout), 'pot', 'bowl', 'cup', 'pitcher'.
 * o: { h, glaze (0..1 how far down the dipped glaze reaches; 0 = unglazed), dark (fired dark) }
 */
export function pot(kit, F, rnd, o = {}) {
  const kind = o.kind ?? 'jug';
  const s = o.scale ?? 1;
  const H = (o.h ?? { jug: 0.28, pitcher: 0.32, pot: 0.2, bowl: 0.075, cup: 0.09 }[kind]) * s * (0.9 + 0.2 * rnd());
  const outer = [], inner = [];
  // profile r(t) for t 0 foot .. 1 rim
  const R = {
    jug: (t) => 0.045 + 0.075 * Math.sin(Math.PI * Math.min(1, t * 1.25)) ** 0.8 * (t < 0.8 ? 1 : 1 - (t - 0.8) * 2.5) + (t > 0.85 ? (t - 0.85) * 0.25 : 0),
    pitcher: (t) => 0.05 + 0.065 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + (t > 0.8 ? (t - 0.8) * 0.12 : 0),
    pot: (t) => 0.07 + 0.05 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + (t > 0.88 ? (t - 0.88) * 0.3 : 0),
    bowl: (t) => 0.045 + 0.1 * Math.pow(t, 0.6),
    cup: (t) => 0.03 + 0.012 * t + 0.008 * Math.sin(Math.PI * t),
  }[kind];
  const th = 0.006 * s;
  const NP = 22;
  for (let i = 0; i <= NP; i++) { const t = i / NP; outer.push([R(t) * s, t * H]); }
  const rim = [R(1) * s, H];
  const prof = [[0, 0], ...outer, [rim[0] - th * 0.5, H + th * 0.4]];
  for (let i = NP; i >= 1; i--) { const t = i / NP; prof.push([Math.max(0.005, R(t) * s - th), t * H]); }
  prof.push([0, th * 1.5]);
  const glaze = o.glaze ?? (rnd() < 0.5 ? 0.6 + 0.3 * rnd() : 0);
  const matB = o.dark ? kit.get('clayDark') : kit.get('clay');
  const glazeB = kit.get('glaze');
  const tilt = (rnd() - 0.5) * 0.02, wob = rnd() * 6;
  const rFn = (r, y, a) => r * (1 + 0.012 * Math.sin(a * 2 + wob) * (y / H) + tilt * Math.cos(a) * (y / H));
  // split the profile into the unglazed foot and the glazed body (glaze runs: the edge wavers)
  if (glaze > 0) {
    const yG = H * (1 - glaze);
    const lowP = prof.filter((p, i) => i <= NP + 1 && p[1] <= yG + 1e-6);
    const highOuter = prof.filter((p, i) => i <= NP + 1 && p[1] >= yG - 1e-6);
    lathe(matB, F, lowP, { seg: 32, piece: 0.3 + rnd() * 0.3, rFn });
    lathe(glazeB, F, [...highOuter, ...prof.slice(NP + 2)], { seg: 32, piece: 0.3 + rnd() * 0.5, rFn: (r, y, a) => rFn(r, y, a) * (y < yG + 0.012 * s ? 1 + 0.003 : 1) });
  } else {
    lathe(matB, F, prof, { seg: 32, piece: 0.3 + rnd() * 0.5, rFn });
  }
  // the handle: a pulled strap from the shoulder to the neck
  if (kind === 'jug' || kind === 'pitcher' || kind === 'cup') {
    const hb = glaze > 0 ? glazeB : matB;
    const a = Math.PI;
    const p0 = H * (kind === 'cup' ? 0.75 : 0.82), p1 = H * (kind === 'cup' ? 0.25 : 0.45);
    const r0 = R(p0 / H) * s, r1 = R(p1 / H) * s;
    const out = kind === 'cup' ? 0.025 * s : 0.045 * s;
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const y = p0 + (p1 - p0) * t + Math.sin(Math.PI * t) * 0.012 * s;
      const r = r0 + (r1 - r0) * t + Math.sin(Math.PI * t) * out;
      pts.push(fp(F, Math.cos(a) * r, y, Math.sin(a) * r));
    }
    tube(hb, pts, 0.008 * s, { sides: 7, segments: 16, piece: 0.5 });
  }
}

// --------------------------------------------------------------- cloth bolts --
/** A bolt of cloth rolled on itself, lying along F.x; the end shows the layers. */
export function clothBolt(kit, F, rnd, o = {}) {
  const L = Math.min(o.l ?? 0.75, 0.85) * (0.9 + 0.2 * rnd()), R = (o.r ?? 0.06) * (0.8 + 0.4 * rnd());
  const mat = o.mat ?? `bolt${1 + Math.floor(rnd() * 5)}`;
  const b = kit.get(mat);
  // the roll (slightly squashed by its weight), a loose outer end lying on the counter
  const base = b.count;
  const NS = 32, NL = 8;
  for (let i = 0; i <= NL; i++) for (let j = 0; j <= NS; j++) {
    const x = (i / NL - 0.5) * L, a = (j / NS) * Math.PI * 2;
    const rr = R * (1 + 0.01 * Math.sin(a * 7));
    b.v(fp(F, x, R * 0.94 + Math.sin(a) * rr * 0.94, Math.cos(a) * rr), x, a * R, 0.2, 1, 0);
  }
  for (let i = 0; i < NL; i++) for (let j = 0; j < NS; j++) { const a0 = base + i * (NS + 1) + j; b.q(a0, a0 + NS + 1, a0 + NS + 2, a0 + 1); }
  // the ends: a spiral of layers
  for (const sx of [-1, 1]) {
    const pts = [];
    const turns = Math.round(R / 0.004);
    for (let k = 0; k <= turns * 24; k++) {
      const t = k / (turns * 24), a = t * turns * Math.PI * 2;
      const rr = R * (0.15 + 0.85 * t);
      pts.push(fp(F, sx * L / 2, R * 0.94 + Math.sin(a) * rr * 0.94, Math.cos(a) * rr));
    }
    tube(b, pts, 0.0022, { sides: 4, seg: 0.004, piece: 0.25 });
    // fill disc behind the spiral
    const c0 = b.v(fp(F, sx * L / 2 - sx * 0.001, R * 0.94, 0), 0, 0, 0.2, 0.5, 1);
    const i0 = b.count;
    for (let j = 0; j <= NS; j++) { const a = (j / NS) * Math.PI * 2; b.v(fp(F, sx * L / 2 - sx * 0.001, R * 0.94 + Math.sin(a) * R * 0.94, Math.cos(a) * R), 0, 0, 0.2, 0.7, 1); }
    for (let j = 0; j < NS; j++) if (sx > 0) b.t(c0, i0 + j, i0 + j + 1); else b.t(c0, i0 + j + 1, i0 + j);
  }
  // the loose end: a flap draped down the front of the roll
  const fb = b.count;
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 8; j++) {
    const x = (i / 6 - 0.5) * L, t = j / 8;
    const a = -Math.PI / 2 + t * Math.PI * 0.55;
    const rr = R + 0.002 + t * t * 0.03;
    b.v(fp(F, x, R * 0.94 + Math.sin(a) * rr - t * t * 0.02, -Math.cos(a) * rr * 0.0 + rr * Math.cos(a)), x, t * 0.1, 0.2, 1, t > 0.9 ? 1 : 0);
  }
  for (let i = 0; i < 6; i++) for (let j = 0; j < 8; j++) { const a0 = fb + i * 9 + j; b.q(a0, a0 + 9, a0 + 10, a0 + 1); }
}

// -------------------------------------------------------------------- herbs --
/** A bunch of herbs hung head-down from a string (F at the tie). */
export function herbBunch(kit, F, rnd, o = {}) {
  const b = kit.get('herb');
  const n = 14 + Math.floor(rnd() * 8);
  const L = (o.l ?? 0.24) * (0.9 + 0.2 * rnd());
  const dry = rnd();
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2, spread = 0.02 + rnd() * 0.05;
    const pts = [fp(F, 0, 0, 0), fp(F, Math.cos(a) * spread * 0.3, -L * 0.4, Math.sin(a) * spread * 0.3), fp(F, Math.cos(a) * spread, -L * (0.85 + 0.15 * rnd()), Math.sin(a) * spread)];
    const i0 = b.count;
    tube(b, pts, 0.0015, { sides: 3, seg: 0.03, piece: rnd() });
    // little leaves along the lower stem
    for (let q = 0; q < 6; q++) {
      const t = 0.35 + 0.6 * (q / 6);
      const c = pts[1].clone().lerp(pts[2], (t - 0.35) / 0.65);
      const lf = 0.012 + 0.01 * rnd(), la = rnd() * Math.PI * 2;
      const d1 = V(Math.cos(la), -0.3, Math.sin(la)).normalize(), d2 = V(-Math.sin(la), 0, Math.cos(la));
      const j0 = b.count;
      b.v(c, 0, 0, 0.5, 0.8, 0); b.v(c.clone().addScaledVector(d1, lf * 0.5).addScaledVector(d2, lf * 0.25), 0, 0, 0.5, 1, 0);
      b.v(c.clone().addScaledVector(d1, lf), 0, 0, 0.5, 1, 0); b.v(c.clone().addScaledVector(d1, lf * 0.5).addScaledVector(d2, -lf * 0.25), 0, 0, 0.5, 1, 0);
      b.q(j0, j0 + 1, j0 + 2, j0 + 3);
    }
    const cols = colorOf(b);
    const g = [0.08 + 0.12 * dry, 0.14 + 0.04 * dry, 0.04 + 0.03 * dry].map((v) => v * (0.8 + 0.4 * rnd()));
    for (let i = i0; i < b.count; i++) cols[i] = g;
  }
  tube(kit.get('rope'), [fp(F, 0, 0.0, 0), fp(F, 0, (o.string ?? 0.15), 0)], 0.002, { sides: 4 });
}

/** A plait (string) of onions hanging from a hook (F at the top). */
export function onionString(kit, F, rnd, o = {}) {
  const n = o.n ?? 12, L = o.l ?? 0.6;
  tube(kit.get('straw'), [fp(F, 0, 0, 0), fp(F, 0.005, -L * 0.5, 0), fp(F, 0, -L, 0.004)], 0.008, { sides: 6, seg: 0.03 });
  for (let k = 0; k < n; k++) {
    const t = 0.1 + 0.85 * (k / n);
    const a = k * 2.4 + rnd();
    onion(kit, frame(fp(F, Math.cos(a) * 0.035, -L * t - 0.03, Math.sin(a) * 0.035), fd(F, Math.cos(a), 0.3, Math.sin(a)), fd(F, Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4)), rnd, { r: 0.028 });
  }
}
