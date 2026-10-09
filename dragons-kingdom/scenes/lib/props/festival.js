// Props library - the Cling festival kit: dressed market stalls (baker, fruiterer, greengrocer,
// fishmonger, potter, draper, dairy), baked awnings and counter cloths, grain sacks, rope coils,
// horn lanterns, musicians' instruments, banners and bunting from cloth bakes, and breakable
// variants for the attack (splintered beams and boards, whole and broken roof tiles, splinters).
//
//   const fk = await festivalKit(ctx);                 // materials + baked cloth, once
//   scene.add(await fk.stall(F, 'bread', { seed: 3 }));  // F: frame on the ground, front = +z
//   scene.add(fk.bunting(a, b, { seed: 1 }));
//   scene.add(fk.banner(F, 'breeze', { colors: [...] }));
// All PROVISIONAL designs (plain festival colours, no heraldry).
import * as THREE from 'three';
import { Kit, Builder, box, tube, lathe, laidRope, fp, fd, sub, frame, yawFrame, rng, hash, clamp, smooth, fbm, vnoise, loadCache, catenary, resample, sagLine } from './core.js';
import { propMaterials, clothMaterial, surface } from './materials.js';
import { clothGeometry, upsampleGrid } from './cloth.js';
import { barrel, bucket, crate, basket, trestleTable, bench, stool, handcart } from './containers.js';
import { goodsMaterials, goodsMats, buildGoods, loaf, fruit, fruitHeap, cabbage, onion, rootVeg, fish, cheese, egg, pot, clothBolt, herbBunch, onionString } from './goods.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Plain festival palettes (linear): pairs for stripes, singles for bunting. */
export const DYES = {
  madder: [0.28, 0.045, 0.03], rose: [0.36, 0.13, 0.1], woad: [0.05, 0.085, 0.16], weld: [0.42, 0.32, 0.06],
  green: [0.07, 0.12, 0.05], undyed: [0.42, 0.38, 0.3], walnut: [0.14, 0.09, 0.055], ochre: [0.36, 0.2, 0.07],
};

const kits = new WeakMap();
export function festivalKit(ctx) {
  if (kits.has(ctx)) return kits.get(ctx);
  const p = makeKit(ctx);
  kits.set(ctx, p);
  return p;
}

async function makeKit(ctx) {
  const M = await propMaterials(ctx);
  const G = await goodsMaterials(ctx);
  const mats = { ...goodsMats(M, G) };
  // extra materials: horn panes, drum skins, tile clay, broken wood (fresh, pale inside)
  mats.horn = await surface(ctx, { name: 'horn', scan: null, color: [0.42, 0.3, 0.13], color2: [0.36, 0.25, 0.1], roughness: 0.3, pieceVar: 0.3, macro: 0.3, macroF: 40, wear: 0, cloth: { transmission: 0.55, forward: 1.5 }, side: THREE.DoubleSide });
  mats.skin = await surface(ctx, { name: 'drum-skin', scan: 'pbr/acg_leather26', tile: [0.4, 0.4], detail: 0.25, normalScale: 0.2, color: [0.52, 0.42, 0.28], color2: [0.48, 0.38, 0.25], roughness: 0.6, wear: 0.5, wearColor: [0.3, 0.22, 0.13], cloth: { transmission: 0.25, forward: 0.8 }, side: THREE.DoubleSide });
  mats.tile = await surface(ctx, { name: 'roof-tile', scan: 'pbr/acg_ground03', tile: [0.3, 0.3], detail: 0.45, normalScale: 0.4, color: [0.17, 0.075, 0.04], color2: [0.22, 0.1, 0.055], roughness: 0.85, pieceVar: 0.4, macro: 0.25, macroF: 9, wear: 0.6, wearColor: [0.3, 0.17, 0.1] });
  mats.splinter = await surface(ctx, { name: 'wood-broken', scan: 'pbr/acg_wood35', tile: [0.5, 0.06], detail: 0.6, macroUV: true, color: [0.38, 0.27, 0.15], color2: [0.42, 0.31, 0.18], roughness: 0.85, wear: 0, pieceVar: 0.3 });
  mats.candle = M.wax;
  // baked cloth (null when not baked: analytic fallbacks)
  const names = ['awning_3', 'awning_24', 'counter', 'banner_still', 'banner_breeze', 'banner_gust', ...[0, 1, 2, 3, 4, 5].map((i) => 'pennant_' + i)];
  const baked = {};
  await Promise.all(names.map(async (n) => { baked[n] = await loadCache(n + '.json'); }));
  const clothCache = new Map();
  const dyed = async (key, o) => {
    if (!clothCache.has(key)) clothCache.set(key, clothMaterial(ctx, o));
    return clothCache.get(key);
  };
  const api = { ctx, M, G, mats, baked, dyed };
  api.build = (kit, name) => buildGoods(kit, mats, name);
  api.stall = (F, kind, o) => stall(api, F, kind, o);
  api.bunting = (a, b, o) => buntingLine(api, a, b, o);
  api.banner = (F, k, o) => banner(api, F, k, o);
  api.sack = (kit, F, rnd, o) => sack(api, kit, F, rnd, o);
  api.lantern = (kit, F, rnd, o) => lantern(kit, F, rnd, o);
  api.instruments = instruments;
  api.breakables = breakables;
  api.ropeCoil = ropeCoil;
  return api;
}

// -------------------------------------------------------------------- sacks --
/**
 * A hessian grain sack, shaped like a filled one: the grain settles into a wide, slightly bellied
 * body with a flattened foot; the empty cloth above it is gathered into the tied neck in radial
 * pleats; the weave sags in shallow horizontal wrinkles; a sewn side seam. kind 'full' (standing,
 * tied), 'slump' (half full: the empty top folded over to one side), 'lying' (on its side).
 */
function sack(api, kit, F, rnd, o = {}) {
  const kind = o.kind ?? 'full';
  const b = kit.get('hessian');
  const sc = o.scale ?? (0.9 + 0.2 * rnd());
  const R = 0.21 * sc, H = 0.66 * sc;
  const ph = rnd() * 6, ph2 = rnd() * 6;
  const fold = rnd() * Math.PI * 2;
  const NT = 44, NP = 48;
  const fill = kind === 'slump' ? 0.5 : 0.72;            // height (fraction) the grain reaches
  const pos = (t, a) => {
    // profile: rounded foot, bellied body, the shoulder where the grain stops, the gathered neck
    let r;
    if (t < 0.06) r = R * (0.78 + 0.27 * Math.sin((t / 0.06) * Math.PI / 2));
    else if (t < fill) r = R * (1.05 + 0.04 * Math.sin(Math.PI * (t - 0.06) / (fill - 0.06)) - 0.05 * (t - 0.06));
    else if (t < 0.93) { const k = (t - fill) / (0.93 - fill); r = R * (0.15 + 0.88 * Math.cos(k * Math.PI / 2) ** 1.3); }
    else if (t < 0.95) r = R * 0.14;
    else { const k = (t - 0.95) / 0.05; r = R * (0.14 + 0.28 * k) * (1 + 0.45 * Math.sin(a * 5 + ph) * k); }
    // pleats gathered into the neck, sag wrinkles, grain lumps, the side seam
    const pleat = 0.2 * Math.sin(a * 7 + ph + Math.sin(t * 9) * 0.6) * smoothK(fill + 0.02, 0.93, t);
    const sag = 0.022 * Math.sin(t * H * 48 + a * 1.7 + ph2) * (t < fill ? 1 : 0.4) + 0.012 * Math.sin(t * H * 97 - a * 3.1);
    const lump = 0.05 * fbm(Math.cos(a) * 2 + ph, t * 3, Math.sin(a) * 2, 3);
    const seam = Math.exp(-((((a + Math.PI) % (Math.PI * 2)) - Math.PI) ** 2) / 0.003);
    r *= 1 + pleat + sag + lump - 0.02 * seam;
    let x = Math.cos(a) * r, z = Math.sin(a) * r, y = t * H * (t < 0.06 ? 0.7 : 1) - (t < 0.06 ? 0 : 0.06 * H * 0.3);
    // the weight of the grain pushes the body out at the foot and settles it
    y = Math.max(0.004, y);
    if (kind === 'slump' && t > fill) {
      // the empty top falls over to one side, folded
      const k = (t - fill) / (1 - fill);
      const ang = k * 1.9;
      const pivot = fill * H;
      const dx = Math.cos(fold), dz = Math.sin(fold);
      const along = (y - pivot);
      x += dx * Math.sin(ang) * along * 1.1; z += dz * Math.sin(ang) * along * 1.1;
      y = pivot + Math.cos(ang) * along * 0.7 - k * k * 0.05;
    }
    return [x, y, z];
  };
  const base = b.count;
  for (let i = 0; i <= NT; i++) {
    const t = i / NT;
    for (let j = 0; j <= NP; j++) {
      const a = (j / NP) * Math.PI * 2;
      let [x, y, z] = pos(t, a);
      if (kind === 'lying') { const yy = y; y = x + R * 0.95; x = yy - H * 0.45; y = Math.max(0.004, y * (y < R * 0.5 ? 0.85 : 1)); }
      const fold2 = t > 0.9 ? 0.75 : 1;
      b.v(fp(F, x, y, z), a * R, t * H, 0.3 + (o.piece ?? rnd() * 0.3), fold2 * (t < 0.04 ? 0.7 : 1), 0);
    }
  }
  const row = NP + 1;
  for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) { const q = base + i * row + j; b.q(q, q + 1, q + row + 1, q + row); }
  // the foot
  const c0 = b.v(fp(F, ...(kind === 'lying' ? [-H * 0.45, R * 0.95, 0] : [0, 0.003, 0])), 0, 0, 0.3, 0.6, 0);
  for (let j = 0; j < NP; j++) b.t(c0, base + j + 1, base + j);
  if (kind !== 'lying') {
    // the cord tied round the neck, its loose ends
    const [nx, ny, nz] = pos(0.94, 0);
    const top = pos(0.94, 0);
    const cy = kind === 'slump' ? null : top[1];
    if (cy !== null) {
      const tie = [];
      for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; tie.push(fp(F, Math.cos(a) * R * 0.17, cy + 0.003 * Math.sin(a * 2), Math.sin(a) * R * 0.17)); }
      tube(kit.get('rope'), tie, 0.005, { sides: 5, closed: true });
      tube(kit.get('rope'), [fp(F, R * 0.17, cy, 0), fp(F, R * 0.3, cy - 0.06, 0.02), fp(F, R * 0.36, cy - 0.14, 0.04)], 0.004, { sides: 4 });
    }
  }
}
const smoothK = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A coil of laid rope lying flat (F on the ground). */
export function ropeCoil(kit, F, rnd, o = {}) {
  const R = o.r ?? 0.22, turns = o.turns ?? 8, rr = o.rope ?? 0.012;
  const pts = [];
  for (let k = 0; k <= turns * 28; k++) {
    const t = k / (turns * 28), a = t * turns * Math.PI * 2;
    const layer = Math.floor(t * turns / 3.2);
    const r0 = R * (0.62 + 0.38 * ((t * turns) % 3.2) / 3.2) + 0.004 * Math.sin(a * 3 + layer);
    pts.push(fp(F, Math.cos(a) * r0, rr + layer * rr * 1.7 + 0.003 * Math.sin(a * 2), Math.sin(a) * r0 * 0.94));
  }
  // the end leading away
  const e = pts[pts.length - 1];
  pts.push(e.clone().add(fd(F, 0.15, -layerDrop(rr), 0.1)), e.clone().add(fd(F, 0.45, -layerDrop(rr) * 2, 0.25)));
  if (o.laid) laidRope(kit.get(o.mat ?? 'rope'), pts, rr, { piece: rnd() });
  else tube(kit.get(o.mat ?? 'rope'), pts, rr, { sides: 8, seg: 0.02, piece: rnd(), vNorm: true });
}
const layerDrop = (rr) => rr * 3;

// ------------------------------------------------------------------ lantern --
/** A horn lantern: iron frame, conical vented top with a ring, horn panes, a candle on its pricket. */
export function lantern(kit, F, rnd, o = {}) {
  const S = o.size ?? 0.26, W = S * 0.5;
  const iron = kit.get('ironDark');
  // base plate, corner posts, top ring, cone, ring handle
  box(iron, sub(F, [0, 0.006, 0]), [W + 0.02, 0.012, W + 0.02], { bevel: 0.003, seg: 0.05 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(iron, sub(F, [sx * W / 2, S * 0.4, sz * W / 2]), [0.008, S * 0.8, 0.008], { bevel: 0.0015, grain: 'y' });
  box(iron, sub(F, [0, S * 0.8, 0]), [W + 0.012, 0.01, W + 0.012], { bevel: 0.002 });
  lathe(iron, sub(F, [0, S * 0.8, 0]), [[W * 0.72, 0], [W * 0.7, 0.01], [W * 0.18, S * 0.24], [W * 0.12, S * 0.27], [0, S * 0.27]], { seg: 4, piece: 0.2 });
  const ring = []; for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; ring.push(fp(F, Math.cos(a) * 0.022, S * 1.1 + Math.sin(a) * 0.022, 0)); }
  tube(iron, ring, 0.0035, { sides: 5, closed: true });
  // horn panes (translucent, warm), a little bowed
  const hb = kit.get('horn');
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    const Fk = sub(F, [Math.sin(a) * W / 2, 0.012, Math.cos(a) * W / 2], a);
    const base = hb.count;
    for (let j = 0; j <= 6; j++) for (let i = 0; i <= 4; i++) {
      const x = (i / 4 - 0.5) * (W - 0.01), y = (j / 6) * (S * 0.78 - 0.012);
      hb.v(fp(Fk, x, y, 0.002 * Math.sin(Math.PI * i / 4) * Math.sin(Math.PI * j / 6)), x, y, 0.3 + k * 0.17, 1, 0);
    }
    for (let j = 0; j < 6; j++) for (let i = 0; i < 4; i++) { const p0 = base + j * 5 + i; hb.q(p0, p0 + 1, p0 + 6, p0 + 5); }
  }
  // candle on its pricket, a burnt wick
  lathe(kit.get('candle'), sub(F, [0, 0.012, 0]), [[0, 0], [0.016, 0], [0.016, S * 0.38], [0.012, S * 0.4], [0, S * 0.39]], { seg: 12, piece: 0.5, rFn: (r, y, a) => r * (1 + 0.06 * Math.sin(a * 3) * (y / S)) });
  tube(iron, [fp(F, 0, S * 0.39, 0), fp(F, 0.002, S * 0.42, 0)], 0.0012, { sides: 3 });
  return { flame: fp(F, 0, S * 0.44, 0) };
}

// -------------------------------------------------------------- instruments --
/** The musicians' instruments (PROVISIONAL): tabor + sticks, three-hole pipe, lute, frame drum, fiddle + bow. */
export function instruments(kit, F, rnd, which = ['tabor', 'pipe', 'lute', 'framedrum', 'fiddle']) {
  const out = {};
  let x = 0;
  for (const w of which) {
    const Fi = sub(F, [x, 0, 0]);
    if (w === 'tabor') {
      // a cylindrical drum shell, two skin heads lapped over flesh hoops, a rope zig-zag tension
      const R = 0.17, H = 0.22;
      lathe(kit.get('pale'), sub(Fi, [0, 0.02, 0]), [[R, 0], [R + 0.002, H / 2], [R, H]], { seg: 32, piece: 0.4 });
      for (const y of [0.02, 0.02 + H]) {
        lathe(kit.get('skin'), sub(Fi, [0, y, 0]), y > 0.1 ? [[0, 0.004], [R * 0.98, 0.003], [R + 0.006, -0.004], [R + 0.008, -0.02]] : [[R + 0.008, 0.02], [R + 0.006, 0.004], [R * 0.98, -0.003], [0, -0.004]], { seg: 32, piece: 0.5 });
        const hoop = []; for (let k = 0; k <= 32; k++) { const a = (k / 32) * Math.PI * 2; hoop.push(fp(Fi, Math.cos(a) * (R + 0.012), y + (y > 0.1 ? -0.012 : 0.012), Math.sin(a) * (R + 0.012))); }
        tube(kit.get('withy'), hoop, 0.007, { sides: 6, closed: true });
      }
      const zz = [];
      for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; zz.push(fp(Fi, Math.cos(a) * (R + 0.016), 0.02 + (k % 2 ? 0.012 : H - 0.012), Math.sin(a) * (R + 0.016))); }
      tube(kit.get('rope'), zz, 0.003, { sides: 4 });
      // snare across the top head, a strap, two sticks
      tube(kit.get('rope'), [fp(Fi, -R, 0.026 + H, 0.02), fp(Fi, R, 0.026 + H, 0.02)], 0.0015, { sides: 3 });
      for (const s of [-1, 1]) tube(kit.get('dark'), [fp(Fi, s * 0.05, 0.03 + H, -R * 0.2), fp(Fi, s * 0.12 + 0.2, 0.012, R + 0.08)], (t) => 0.007 - 0.002 * t, { sides: 6, caps: true });
      x += 0.5;
    } else if (w === 'pipe') {
      const L = 0.32;
      const pf = sub(Fi, [0, 0.012, 0], 0, 0, Math.PI / 2);
      lathe(kit.get('pale'), pf, [[0, -L / 2], [0.009, -L / 2], [0.012, -L / 2 + 0.03], [0.009, -L / 2 + 0.06], [0.0095, L / 2 - 0.01], [0.011, L / 2], [0, L / 2]], { seg: 12, piece: 0.6 });
      x += 0.2;
    } else if (w === 'lute') {
      // a ribbed bowl back, a flat soundboard with a carved rose, a neck, the pegbox bent back
      const Lb = 0.46, Wb = 0.32;
      const lf = sub(Fi, [0, 0, 0], 0, -Math.PI / 2 + 0.0, 0);
      const back = kit.get('dark');
      const ribs = 11;
      for (let r = 0; r < ribs; r++) {
        const base = back.count;
        for (let j = 0; j <= 16; j++) for (let i = 0; i <= 2; i++) {
          const t = j / 16, a = Math.PI * ((r + i / 2) / ribs);
          const w = Math.sin(Math.PI * t) ** 0.7 * (t < 0.5 ? 1 : 1 - 0.3 * (t - 0.5));
          back.v(fp(Fi, Math.cos(a) * Wb / 2 * w, 0.0 + Math.sin(a) * Wb * 0.45 * w, (t - 0.45) * Lb), t * Lb, a * 0.1, 0.3 + (r % 2) * 0.25, 0.9, 0);
        }
        for (let j = 0; j < 16; j++) for (let i = 0; i < 2; i++) { const p0 = base + j * 3 + i; back.q(p0, p0 + 1, p0 + 4, p0 + 3); }
      }
      const sb = kit.get('pale');
      const base = sb.count;
      for (let j = 0; j <= 16; j++) for (let i = 0; i <= 8; i++) {
        const t = j / 16, w = Math.sin(Math.PI * t) ** 0.7 * (t < 0.5 ? 1 : 1 - 0.3 * (t - 0.5));
        const xx = (i / 8 - 0.5) * Wb * w, zz2 = (t - 0.45) * Lb;
        sb.v(fp(Fi, xx, 0.001, zz2), xx, zz2, 0.7, Math.hypot(xx, zz2 - 0.02) < 0.04 ? 0.25 : 1, 0);
      }
      for (let j = 0; j < 16; j++) for (let i = 0; i < 8; i++) { const p0 = base + j * 9 + i; sb.q(p0, p0 + 9, p0 + 10, p0 + 1); }
      box(kit.get('dark'), sub(Fi, [0, 0.01, -0.45 * Lb - 0.14]), [0.05, 0.022, 0.3], { grain: 'z', bevel: 0.004 });
      box(kit.get('dark'), sub(Fi, [0, -0.03, -0.45 * Lb - 0.33], 0, 0.9), [0.05, 0.016, 0.14], { grain: 'z', bevel: 0.003 });
      for (let k = 0; k < 6; k++) tube(kit.get('iron'), [fp(Fi, (k - 2.5) * 0.007, 0.014, 0.55 * Lb - 0.08), fp(Fi, (k - 2.5) * 0.005, 0.024, -0.45 * Lb - 0.27)], 0.0006, { sides: 3 });
      box(kit.get('dark'), sub(Fi, [0, 0.004, 0.55 * Lb - 0.09]), [0.08, 0.008, 0.012], { grain: 'x', bevel: 0.002 });
      x += 0.55;
    } else if (w === 'framedrum') {
      const R = 0.2;
      lathe(kit.get('pale'), sub(Fi, [0, 0, 0]), [[R - 0.008, 0], [R, 0], [R, 0.06], [R - 0.008, 0.06]], { seg: 36, piece: 0.45 });
      lathe(kit.get('skin'), sub(Fi, [0, 0.06, 0]), [[0, 0.001], [R * 0.99, 0.0005], [R + 0.002, -0.004]], { seg: 36, piece: 0.55 });
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.3;
        for (const dy of [0.018, 0.042]) lathe(kit.get('iron'), sub(Fi, [Math.cos(a) * (R + 0.003), dy, Math.sin(a) * (R + 0.003)], 0, 0, Math.PI / 2), [[0, -0.002], [0.016, 0], [0, 0.002]], { seg: 10 });
      }
      x += 0.5;
    } else if (w === 'fiddle') {
      const fb = kit.get('oak');
      const base = fb.count;
      const outline = (t) => 0.1 * (0.9 - 0.28 * Math.exp(-((t - 0.55) ** 2) / 0.01)) * Math.sin(Math.PI * t) ** 0.35;
      for (let j = 0; j <= 20; j++) for (let i = 0; i <= 6; i++) {
        const t = j / 20, half = outline(t), xx = (i / 6 - 0.5) * 2 * half;
        const arch = 0.035 + 0.012 * Math.cos(Math.PI * (i / 6 - 0.5));
        fb.v(fp(Fi, xx, arch, (t - 0.5) * 0.4), xx, t * 0.4, 0.55, 1, 0);
      }
      for (let j = 0; j < 20; j++) for (let i = 0; i < 6; i++) { const p0 = base + j * 7 + i; fb.q(p0, p0 + 7, p0 + 8, p0 + 1); }
      const side = fb.count;
      for (let j = 0; j <= 40; j++) {
        const t = j <= 20 ? j / 20 : (40 - j) / 20, sgn = j <= 20 ? -1 : 1;
        const xx = sgn * outline(t), zz2 = (t - 0.5) * 0.4;
        fb.v(fp(Fi, xx, 0.0, zz2), j * 0.02, 0, 0.6, 0.8, 0.4); fb.v(fp(Fi, xx, 0.035, zz2), j * 0.02, 0.035, 0.6, 1, 0.4);
      }
      for (let j = 0; j < 40; j++) { const p0 = side + j * 2; fb.q(p0, p0 + 2, p0 + 3, p0 + 1); }
      box(kit.get('dark'), sub(Fi, [0, 0.04, -0.3]), [0.035, 0.02, 0.22], { grain: 'z', bevel: 0.004 });
      tube(kit.get('dark'), [fp(Fi, 0.15, 0.01, -0.25), fp(Fi, 0.2, 0.01, 0.25)], 0.005, { sides: 6, caps: true });
      x += 0.5;
    }
    out[w] = Fi;
  }
  return out;
}

// --------------------------------------------------------------- breakables --
/**
 * Breakable / broken pieces for the attack: kind 'beam' (oak beam snapped: splintered ends),
 * 'board' (a stall board broken across), 'tile' (a whole clay roof tile), 'tileShard'
 * (a broken piece), 'splinters' (a handful of shards). Adds into kit at F (lying on the ground).
 */
export function breakables(kit, F, rnd, kind, o = {}) {
  if (kind === 'beam' || kind === 'board') {
    const L = o.l ?? (kind === 'beam' ? 1.2 : 0.9), sy = kind === 'beam' ? (o.h ?? 0.16) : 0.03, sz = kind === 'beam' ? (o.w ?? 0.14) : (o.w ?? 0.22);
    const brokenEnds = o.ends ?? [1];
    const mat = kit.get(o.mat ?? (kind === 'beam' ? 'oak' : 'silver'));
    const spl = kit.get('splinter');
    // the sound part
    const sound = L - 0.18 * brokenEnds.length;
    const x0 = brokenEnds.includes(-1) ? -L / 2 + 0.18 : -L / 2;
    box(mat, sub(F, [x0 + sound / 2, sy / 2, 0]), [sound, sy, sz], { grain: 'x', bevel: 0.006, piece: rnd(), noise: 0.003, nf: 2 });
    // splintered ends: a field of long fibres, ragged lengths along the grain (pale fresh wood)
    for (const e of brokenEnds) {
      const xs = e > 0 ? x0 + sound : x0;
      const nf = kind === 'beam' ? 26 : 12;
      const tilt = (rnd() - 0.5) * 0.6;
      for (let k = 0; k < nf; k++) {
        const fy = rnd(), fz = rnd();
        const len = 0.03 + 0.17 * Math.pow(rnd(), 1.5) * (1 - Math.abs(fy - 0.5 + tilt * 0.3));
        const wy = sy / Math.sqrt(nf) * (0.8 + 0.8 * rnd()), wz = sz / Math.sqrt(nf) * (0.8 + 0.8 * rnd());
        const cy = fy * (sy - wy) + wy / 2, cz = (fz - 0.5) * (sz - wz);
        const pts = [fp(F, xs - e * 0.02, cy, cz), fp(F, xs + e * len * 0.6, cy + (rnd() - 0.5) * 0.01, cz + (rnd() - 0.5) * 0.01), fp(F, xs + e * len, cy + (rnd() - 0.5) * 0.02, cz + (rnd() - 0.5) * 0.02)];
        tube(spl, pts, (t) => Math.min(wy, wz) * 0.6 * (1 - 0.85 * t), { sides: 4, piece: rnd(), wear: 0 });
      }
      // the core of the break: an uneven torn face
      box(spl, sub(F, [xs + e * 0.02, sy / 2, 0]), [0.04, sy * 0.92, sz * 0.92], { grain: 'x', bevel: 0.002, noise: 0.012, nf: 30, piece: rnd() });
    }
  } else if (kind === 'tile' || kind === 'tileShard') {
    // a clay plain tile: 265 x 165 x 12 mm, cambered along its length, two nibs at the head
    const L = 0.265, W = 0.165, T = 0.012;
    const tb = kit.get('tile');
    const camber = 0.008;
    const shard = kind === 'tileShard';
    // fracture: a random polyline across the tile (shards keep one side)
    const cut = shard ? { a: rnd() * 0.6 - 0.3, c: (rnd() - 0.5) * 0.08 } : null;
    const keep = (x, z) => !shard || (x - cut.c - cut.a * z) * (rnd() < 2 ? 1 : 1) > 0;
    const base = tb.count;
    const NX = 12, NZ = 8;
    const P = (i, j, top) => {
      let x = (i / NX - 0.5) * L, z = (j / NZ - 0.5) * W;
      if (shard) { const xc = cut.c + cut.a * z + 0.008 * Math.sin(z * 90); if (x < xc) x = xc + (x - xc) * 0.02; }
      const y = camber * (1 - (2 * x / L) ** 2) + (top ? T : 0);
      return fp(F, x, y, z);
    };
    for (const top of [1, 0]) {
      const b0 = tb.count;
      for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) tb.v(P(i, j, top), i / NX * L, j / NZ * W, 0.2 + rnd() * 0.0, 1, 0);
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const p0 = b0 + j * (NX + 1) + i; if (top) tb.q(p0, p0 + NX + 1, p0 + NX + 2, p0 + 1); else tb.q(p0, p0 + 1, p0 + NX + 2, p0 + NX + 1); }
    }
    // edges (all four sides; the broken edge shows the fired body)
    const ring = [];
    for (let i = 0; i <= NX; i++) ring.push([i, 0]);
    for (let j = 1; j <= NZ; j++) ring.push([NX, j]);
    for (let i = NX - 1; i >= 0; i--) ring.push([i, NZ]);
    for (let j = NZ - 1; j >= 1; j--) ring.push([0, j]);
    const e0 = tb.count;
    for (const [i, j] of ring) { tb.v(P(i, j, 1), i * 0.02, 0, 0.2, 0.9, 1); tb.v(P(i, j, 0), i * 0.02, T, 0.2, 0.8, 1); }
    for (let k = 0; k < ring.length; k++) { const a = e0 + k * 2, b2 = e0 + ((k + 1) % ring.length) * 2; tb.q(a, a + 1, b2 + 1, b2); }
    if (!shard) for (const z of [-W * 0.3, W * 0.3]) box(tb, sub(F, [L / 2 - 0.018, -0.006, z]), [0.022, 0.014, 0.022], { bevel: 0.003, piece: 0.2 });
  } else if (kind === 'splinters') {
    const spl = kit.get('splinter');
    const n = o.n ?? 14;
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (o.r ?? 0.6), len = 0.04 + 0.22 * Math.pow(rnd(), 2);
      const c = fp(F, Math.cos(a) * d, 0.006, Math.sin(a) * d), dir = fd(F, Math.cos(a + rnd() * 3), 0, Math.sin(a + rnd() * 3));
      tube(spl, [c, c.clone().addScaledVector(dir, len * 0.5).add(V(0, 0.003, 0)), c.clone().addScaledVector(dir, len)], (t) => (0.006 + 0.008 * rnd()) * (1 - 0.8 * t), { sides: 4, piece: rnd() });
    }
  }
}

// --------------------------------------------------------------------- cloth --
/** A baked cloth grid -> mesh in frame F (grid in the prop's frame). */
function bakedCloth(d, F, mat, o = {}) {
  const raw = [];
  for (let i = 0; i < d.positions.length; i += 3) {
    const p = fp(F, d.positions[i] * (o.sx ?? 1), d.positions[i + 1], d.positions[i + 2]);
    raw.push(p);
  }
  const up = upsampleGrid(raw, d.nx, d.ny, o.k ?? 2);
  const w = o.w ?? d.w ?? 1, l = o.l ?? d.l ?? d.h ?? 1;
  const geo = clothGeometry(up.P, up.nx, up.ny, {
    uvFn: (i, j) => [(i / up.nx) * w, (j / up.ny) * l],
    dblFn: o.dblFn ? (i, j, u, v) => o.dblFn(i / up.nx, j / up.ny, u, v) : (i, j, u, v) => {
      const du = Math.min(u, w - u), dv = Math.min(v, l - v);
      return Math.max(smooth(0.04, 0.025, du), smooth(0.04, 0.025, dv));
    },
    foldAO: o.foldAO ?? 14, piece: o.piece ?? 0.3,
  });
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** A banner hung from a pole: k 'still' | 'breeze' | 'gust'. o: { colors [c1, c2], stripe (m, 0 plain), seed } */
async function banner(api, F, k = 'breeze', o = {}) {
  const g = new THREE.Group(); g.name = 'banner';
  const d = api.baked['banner_' + k];
  const c1 = o.colors?.[0] ?? DYES.madder, c2 = o.colors?.[1] ?? DYES.weld;
  const mat = await api.dyed(`banner:${c1}:${c2}:${o.stripe ?? 0.18}`, { name: 'banner-wool', scan: 'pbr/acg_fabric37', tile: [0.35, 0.35], color: c1, color2: c1, stripes: o.stripe === 0 ? undefined : { period: o.stripe ?? 0.24, duty: 0.5, color: c2 }, transmission: 0.2, forward: 1.2, macro: 0.12, macroF: 1.2 });
  if (d) {
    const m = bakedCloth(d, F, mat, { w: d.w, l: d.h, piece: hash(o.seed ?? 1) });
    g.add(m);
  }
  const kit = new Kit();
  const top = d ? d.h : 3.0;
  tube(kit.get('pale'), [fp(F, -0.48, top + 0.03, 0), fp(F, 0.48, top + 0.03, 0)], 0.022, { sides: 10, caps: true });
  for (const s of [-1, 1]) tube(kit.get('rope'), sagLine(fp(F, s * 0.46, top + 0.03, 0), fp(F, 0, top + 0.55, 0), 0.0, 6), 0.005, { sides: 4 });
  g.add(api.build(kit, 'banner-pole'));
  return g;
}

/**
 * Bunting between a and b: pennants (baked cloth shapes where available) folded over a cord
 * that hangs in a true catenary. o: { slack (0.015), spacing (0.42), colors [...], seed, scale }
 */
async function buntingLine(api, a, b, o = {}) {
  const g = new THREE.Group(); g.name = 'bunting';
  const span = a.distanceTo(b);
  const L = span * (1 + (o.slack ?? 0.015));
  const cord = resample(catenary(a, b, L, 64), 160);
  const curve = new THREE.CatmullRomCurve3(cord);
  const kit = new Kit();
  tube(kit.get('rope'), cord, o.cordRadius ?? 0.0045, { sides: 5, seg: 0.04 });
  g.add(api.build(kit, 'bunting-cord'));
  const colors = o.colors || [DYES.madder, DYES.weld, DYES.woad, DYES.undyed, DYES.green, DYES.rose];
  const mats = await Promise.all(colors.map((c, i) => api.dyed('pennant:' + c.join(','), { name: 'pennant-linen', color: c, color2: c, transmission: 0.42, forward: 2.0, macro: 0.08, macroF: 3, tile: [0.25, 0.25] })));
  const builders = colors.map(() => new Builder());
  const spacing = o.spacing ?? 0.42;
  const n = Math.floor((cord.length_m - 0.3) / spacing);
  const pennants = [0, 1, 2, 3, 4, 5].map((i) => api.baked['pennant_' + i]).filter(Boolean);
  const seed = o.seed ?? 1;
  const sc = o.scale ?? 1;
  for (let k = 0; k < n; k++) {
    const t = (0.15 + k * spacing + spacing / 2) / cord.length_m;
    if (t > 0.985) break;
    const c = curve.getPointAt(t), T = curve.getTangentAt(t).normalize();
    const r = (q) => hash(seed * 977 + k * 13 + q);
    const ci = (k + Math.floor(r(1) * 2)) % colors.length;
    const B = builders[ci];
    // pennant frame: x along the cord, y up (the pennant hangs down from y = 0), z across
    const Z = new THREE.Vector3().crossVectors(T, V(0, 1, 0)).normalize();
    const Y = new THREE.Vector3().crossVectors(Z, T).normalize();
    const turn = (r(2) - 0.5) * 0.5;
    const Fp = { o: c, x: T.clone(), y: Y.clone(), z: Z.clone() };
    const q = new THREE.Quaternion().setFromAxisAngle(T, turn);
    Fp.y.applyQuaternion(q); Fp.z.applyQuaternion(q);
    const base = B.count;
    if (pennants.length) {
      const d = pennants[Math.floor(r(3) * pennants.length) % pennants.length];
      const nx = d.nx, ny = d.ny;
      const flip = r(4) < 0.5 ? -1 : 1;
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const m = (j * (nx + 1) + i) * 3;
        const x = d.positions[m] * sc, y = d.positions[m + 1] * sc, z = d.positions[m + 2] * sc * flip;
        const u = (i / nx) * d.w, v = (j / ny) * d.h;
        const edge = Math.min(i, nx - i) / nx * d.w * (1 - j / ny);
        const dbl = Math.max(smooth(0.035, 0.022, v), smooth(0.008, 0.003, edge) * 0.8);
        B.v(fp(Fp, x, y, z), u + k * 0.37, v, ci * 0.13 + r(5) * 0.05, 1, dbl);
      }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a0 = base + j * (nx + 1) + i; B.q(a0, a0 + nx + 1, a0 + nx + 2, a0 + 1); }
    } else {
      // analytic fallback: a hanging triangle with a soft belly
      const NU = 8, NV = 10, w = 0.28 * sc, h = 0.36 * sc;
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
        const fv = j / NV, half = 0.5 * (1 - fv), x = (i / NU - 0.5) * 2 * half * w;
        B.v(fp(Fp, x, -0.012 - fv * h, 0.02 * Math.sin(Math.PI * i / NU) * fv), x, fv * h, ci * 0.13, 1, smooth(0.035, 0.02, fv * h));
      }
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a0 = base + j * (NU + 1) + i; B.q(a0, a0 + NU + 1, a0 + NU + 2, a0 + 1); }
    }
    // the hem folded over the cord: a short sleeve wrapping it
    const lb = B.count;
    const hw = 0.14 * sc;
    for (let s = 0; s <= 6; s++) {
      const ang = (s / 6) * Math.PI * 1.7 - 0.35;
      for (let i = 0; i <= 2; i++) {
        const x = (i / 2 - 0.5) * 2 * hw;
        const rr = 0.0085;
        B.v(fp(Fp, x, rr * 0.4 - Math.cos(ang) * rr, Math.sin(ang) * rr), x, -0.01, ci * 0.13, 0.85, 1);
      }
    }
    for (let s = 0; s < 6; s++) for (let i = 0; i < 2; i++) { const a0 = lb + s * 3 + i; B.q(a0, a0 + 1, a0 + 4, a0 + 3); }
  }
  builders.forEach((B, i) => {
    if (!B.X.n) return;
    const m = new THREE.Mesh(B.geometry(), mats[i]); m.castShadow = true; m.receiveShadow = true; m.name = 'pennants-' + i;
    g.add(m);
  });
  return g;
}

// -------------------------------------------------------------------- stalls --
/** Lay goods on a tray/board/basket at frame F (the surface), by kind. */
function goodsOn(api, kit, F, rnd, kind, o = {}) {
  const W = o.w ?? 0.5, D = o.d ?? 0.34;
  if (kind === 'bread') {
    const n = o.n ?? 5;
    for (let q = 0; q < n; q++) loaf(kit, sub(F, [(rnd() - 0.5) * W * 0.75, 0, (rnd() - 0.5) * D * 0.6], rnd() * 6), rnd, { kind: rnd() < 0.15 ? 'plait' : undefined });
  } else if (kind === 'rolls') {
    for (let q = 0; q < (o.n ?? 16); q++) loaf(kit, sub(F, [(rnd() - 0.5) * W * 0.8, 0, (rnd() - 0.5) * D * 0.8], rnd() * 6), rnd, { kind: 'roll' });
  } else if (kind === 'apples' || kind === 'pears' || kind === 'onions' || kind === 'eggs' || kind === 'turnips') {
    fruitHeap(kit, F, rnd, o.n ?? 18, { r: o.r ?? 0.17, sx: o.sx ?? 1, kind: kind === 'pears' ? 'pear' : kind === 'onions' ? 'onion' : kind === 'eggs' ? 'egg' : kind === 'turnips' ? 'turnip' : 'apple', layer: kind === 'eggs' ? 0.045 : 0.065, maxH: o.maxH ?? 0.1 });
  } else if (kind === 'cabbages') {
    for (let q = 0; q < (o.n ?? 4); q++) cabbage(kit, sub(F, [((q % 2) - 0.5) * W * 0.5 + (rnd() - 0.5) * 0.03, Math.floor(q / 4) * 0.1, (Math.floor(q / 2) % 2 - 0.5) * D * 0.5], rnd() * 6), rnd);
  } else if (kind === 'roots') {
    for (let q = 0; q < (o.n ?? 12); q++) rootVeg(kit, sub(F, [(rnd() - 0.5) * W * 0.6 - 0.06, 0.012 * Math.floor(q / 6), (rnd() - 0.5) * D * 0.7], (rnd() - 0.5) * 0.4), rnd, { kind: q % 4 === 0 ? 'leek' : 'carrot' });
  } else if (kind === 'fish') {
    for (let q = 0; q < (o.n ?? 6); q++) fish(kit, sub(F, [(rnd() - 0.5) * 0.06, 0.004 + (q % 2) * 0.012, (q - (o.n ?? 6) / 2 + 0.5) * Math.min(0.07, D / (o.n ?? 6))], (rnd() - 0.5) * 0.25 + (q % 2 ? Math.PI : 0), Math.PI / 2 * 0), rnd, { l: o.l });
  } else if (kind === 'cheese') {
    for (let q = 0; q < (o.n ?? 3); q++) cheese(kit, sub(F, [(q - 1) * 0.24, 0, (rnd() - 0.5) * 0.05]), rnd);
  } else if (kind === 'pottery') {
    const kinds = ['jug', 'bowl', 'pot', 'cup', 'pitcher', 'bowl', 'jug', 'cup'];
    for (let q = 0; q < (o.n ?? 6); q++) pot(kit, sub(F, [(q - (o.n ?? 6) / 2 + 0.5) * (W / (o.n ?? 6)), 0, (rnd() - 0.5) * D * 0.4], rnd() * 6), rnd, { kind: kinds[q % kinds.length], dark: rnd() < 0.25 });
  } else if (kind === 'bolts') {
    for (let q = 0; q < (o.n ?? 4); q++) clothBolt(kit, sub(F, [0, 0.07 * Math.floor(q / 3) * 1.6, (q % 3 - 1) * 0.15], (rnd() - 0.5) * 0.08), rnd, { l: W * 0.9 });
  }
}

/**
 * A dressed market stall at F (front toward +z). kind: 'bread' | 'fruit' | 'veg' | 'fish' |
 * 'pottery' | 'cloth' | 'dairy'. o: { seed, size '3' | '24', awning [c1, c2] | false, counterCloth }
 * Returns a Group (timber + goods + cloth).
 */
async function stall(api, F, kind = 'bread', o = {}) {
  const rnd = rng(o.seed ?? 7);
  const size = o.size ?? (rnd() < 0.6 ? '3' : '24');
  const fr = size === '3' ? { W: 3.0, D: 1.7, Hb: 2.75, Hf: 2.3 } : { W: 2.4, D: 1.4, Hb: 2.6, Hf: 2.2 };
  const { W, D, Hb, Hf } = fr;
  const g = new THREE.Group(); g.name = 'stall-' + kind;
  const kit = new Kit();
  const oak = kit.get('silver');
  const post = (x, z, h) => box(oak, sub(F, [x, h / 2, z], (rnd() - 0.5) * 0.04), [0.1, h, 0.1], { grain: 'y', bevel: 0.012, piece: rnd(), noise: 0.004, nf: 1.5, wearEdge: 0.02, ao: (x2, y2) => (y2 < -h / 2 + 0.2 ? 0.75 : 1) });
  // posts (back taller), rails at the top, braces, a counter on trestles with a front board
  post(-W / 2, D / 2, Hf + 0.04); post(W / 2, D / 2, Hf + 0.04); post(-W / 2, -D / 2, Hb + 0.04); post(W / 2, -D / 2, Hb + 0.04);
  tube(oak, [fp(F, -W / 2 - 0.12, Hf, D / 2), fp(F, W / 2 + 0.12, Hf, D / 2)], 0.035, { sides: 10, caps: true, piece: rnd() });
  tube(oak, [fp(F, -W / 2 - 0.12, Hb, -D / 2), fp(F, W / 2 + 0.12, Hb, -D / 2)], 0.035, { sides: 10, caps: true, piece: rnd() });
  for (const s of [-1, 1]) {
    tube(oak, [fp(F, s * W / 2, Hb + 0.02, -D / 2 - 0.05), fp(F, s * W / 2, Hf + 0.02, D / 2 + 0.05)], 0.03, { sides: 8, caps: true, piece: rnd() });
    // corner braces
    for (const [z, h] of [[-D / 2, Hb], [D / 2, Hf]]) tube(oak, [fp(F, s * W / 2, h - 0.45, z), fp(F, s * (W / 2 - 0.4), h - 0.03, z)], 0.022, { sides: 6, caps: true, piece: rnd() });
    // rope lashings at the joints
    for (const [z, h] of [[-D / 2, Hb], [D / 2, Hf]]) {
      const lp = []; for (let k = 0; k <= 30; k++) { const a = (k / 30) * Math.PI * 6; lp.push(fp(F, s * W / 2 + Math.cos(a) * 0.07, h - 0.04 + k * 0.0025, z + Math.sin(a) * 0.07)); }
      tube(kit.get('rope'), lp, 0.006, { sides: 5 });
    }
  }
  const cz = D * 0.18, Hc = 0.88;
  const ct = trestleTable(kit, sub(F, [0, 0, cz]), rnd, { w: W - 0.1, d: 0.62, h: Hc, mat: 'pale' });
  for (let q = 0; q < 3; q++) box(kit.get('silver'), sub(F, [0, 0.13 + q * 0.245, cz + 0.33]), [W - 0.16, 0.235, 0.022], { grain: 'x', bevel: 0.004, piece: rnd(), noise: 0.002, wearEdge: 0.02, ao: (x2, y2) => 1 - 0.3 * smooth(0.0, -0.1, y2) });
  // a stool behind the counter, a stepped shelf at the back for the potter / baker
  stool(kit, sub(F, [W * 0.25, 0, -D * 0.25]), rnd);
  // goods on the counter
  const top = sub(F, [0, Hc + 0.001, cz]);
  const lay = (x, z, fn) => fn(sub(top, [x, 0, z], (rnd() - 0.5) * 0.3));
  const slots = size === '3' ? [-1.05, -0.5, 0.05, 0.6, 1.1] : [-0.85, -0.3, 0.25, 0.8];
  const plan = {
    bread: ['bread', 'rolls', 'bread', 'rolls', 'bread'],
    fruit: ['apples', 'pears', 'apples', 'eggs', 'apples'],
    veg: ['cabbages', 'onions', 'roots', 'turnips', 'cabbages'],
    fish: ['fish', 'fish', 'fish', 'fish', 'fish'],
    pottery: ['pottery', 'pottery', 'pottery', 'pottery', 'pottery'],
    cloth: ['bolts', 'bolts', 'bolts', 'bolts', 'bolts'],
    dairy: ['cheese', 'eggs', 'cheese', 'eggs', 'cheese'],
  }[kind] || ['bread'];
  slots.forEach((x, i) => {
    const gk = plan[i % plan.length];
    lay(x, (rnd() - 0.5) * 0.06, (Fs) => {
      if (gk === 'fish') {
        // fish laid on a board over a bed of fresh leaves
        box(kit.get('pale'), sub(Fs, [0, 0.012, 0]), [0.46, 0.024, 0.4], { grain: 'x', bevel: 0.004, piece: rnd() });
        goodsOn(api, kit, sub(Fs, [0, 0.026, 0]), rnd, 'fish', { n: 5, d: 0.38 });
      } else if (gk === 'pottery' || gk === 'bolts' || gk === 'cheese') {
        goodsOn(api, kit, Fs, rnd, gk, { w: 0.5, n: gk === 'pottery' ? 3 : gk === 'bolts' ? 3 : 2 });
      } else if (gk === 'bread' && i % 2 === 0) {
        // loaves straight on the boards, dusted with flour
        goodsOn(api, kit, Fs, rnd, 'bread', { n: 4, w: 0.48, d: 0.4 });
      } else {
        // shallow market baskets, propped to lean toward the customer (a wedge under the back),
        // the goods heaped well above the rim
        const round = gk !== 'roots' && gk !== 'cabbages';
        const Ft = sub(Fs, [0, 0.0, 0], 0, 0.14, 0);
        if (gk !== 'cabbages') box(kit.get('pale'), sub(Fs, [0, 0.02, -0.15]), [0.3, 0.04, 0.05], { grain: 'x', bevel: 0.004, piece: rnd() });
        const bk = basket(kit, gk === 'cabbages' ? Fs : sub(Ft, [0, 0.03, 0]), rnd, round ? { r: 0.2, rb: 0.16, h: gk === 'eggs' ? 0.09 : 0.08, handle: gk === 'eggs' ? 'arch' : null, handleH: 0.18 } : { r: 0.2, rb: 0.17, h: 0.07, sx: 1.4, handle: 'ears' });
        goodsOn(api, kit, bk.inside, rnd, gk, { r: 0.16, sx: round ? 1 : 1.3, n: gk === 'cabbages' ? 3 : gk === 'eggs' ? 16 : gk === 'roots' ? 16 : 26, w: 0.42, d: 0.3, maxH: 0.17 });
      }
    });
  });
  // the ground around the stall: baskets, sacks, a barrel or crate, a bucket
  const gr = (x, z, yaw = 0) => sub(F, [x, 0, z], yaw);
  if (kind === 'fish') { const tb = barrel(kit, gr(W / 2 + 0.35, 0.5), rnd, { h: 0.45, r: 0.27, bilge: 1.05, open: true, hoops: 'withy', bung: false }); bucket(kit, gr(-W / 2 - 0.35, 0.65), rnd, {}); }
  else barrel(kit, gr(W / 2 + 0.35, -0.3), rnd, { h: 0.8, r: 0.25, hoops: rnd() < 0.5 ? 'iron' : 'withy' });
  const cr = crate(kit, gr(W / 2 + 0.4, 0.45, 0.2 + rnd() * 0.3), rnd, { w: 0.55, d: 0.4, h: 0.36, mat: 'silver' });
  if (kind === 'fruit' || kind === 'veg') goodsOn(api, kit, cr.inside, rnd, kind === 'fruit' ? 'apples' : 'turnips', { r: 0.16, sx: 1.3, n: 20, maxH: 0.3 });
  sack(api, kit, gr(-W / 2 - 0.35, 0.15, rnd() * 6), rnd, { kind: 'full' });
  sack(api, kit, gr(-W / 2 - 0.25, -0.45, rnd() * 6), rnd, { kind: rnd() < 0.5 ? 'slump' : 'full' });
  const gb = basket(kit, gr(-W / 2 + 0.3, D / 2 + 0.45), rnd, { r: 0.26, rb: 0.2, h: 0.3, handle: 'ears' });
  goodsOn(api, kit, sub(gb.inside, [0, 0.15, 0]), rnd, kind === 'bread' ? 'rolls' : kind === 'veg' ? 'onions' : 'apples', { r: 0.2, n: 18, maxH: 0.12 });
  // hanging from the front rail: onion strings / herb bunches
  if (kind === 'veg' || kind === 'dairy' || o.hang) {
    for (const x of [-W * 0.32, -W * 0.12, W * 0.18]) onionString(kit, sub(F, [x, Hf - 0.05, D / 2 - 0.07]), rnd, { n: 12, l: 0.7 });
    for (const x of [W * 0.33, W * 0.4]) herbBunch(kit, sub(F, [x, Hf - 0.5, D / 2 - 0.07]), rnd, { string: 0.48 });
  }
  g.add(api.build(kit, 'stall-' + kind));
  // cloth: the awning (baked) and a counter cloth
  if (o.awning !== false) {
    const [c1, c2] = o.awning || [[DYES.madder, DYES.undyed], [DYES.woad, DYES.undyed], [DYES.green, DYES.weld], [DYES.ochre, DYES.undyed], [DYES.undyed, DYES.undyed]][Math.floor(rnd() * 5)];
    const am = await api.dyed(`awning:${c1}:${c2}`, { name: 'awning-canvas', scan: 'pbr/acg_fabric36', tile: [0.35, 0.35], color: c1, color2: c1, stripes: c1 === c2 ? undefined : { period: 0.36, duty: 0.5, color: c2 }, transmission: 0.3, forward: 1.6, macro: 0.16, macroF: 0.9, roughness: 0.93 });
    const d = api.baked['awning_' + size];
    if (d) g.add(bakedCloth(d, F, am, { w: d.w, l: d.l, piece: rnd() }));
  }
  if (o.counterCloth || kind === 'cloth' || kind === 'dairy') {
    const d = api.baked.counter;
    if (d) {
      const cm = await api.dyed('counter-linen', { name: 'counter-linen', color: [0.55, 0.51, 0.43], transmission: 0.25 });
      g.add(bakedCloth(d, sub(F, [0, 0.002, cz]), cm, { sx: (W - 0.05) / 2.6, w: d.w, l: d.l, piece: rnd() }));
    }
  }
  return g;
}
