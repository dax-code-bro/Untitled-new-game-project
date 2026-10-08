// Architecture kit - roofs and chimneys.
//
// A roof is built the way it is on site: rafters from the wall plate to the ridge with their
// tails running past the wall (the eaves overhang, rafter ends visible under it), a deck of
// boards / battens, then the covering laid course by course from the eaves up - clay plain tiles
// double-lapped on a 100 mm gauge, or stone slates in diminishing courses (big at the eaves,
// small at the ridge) of random widths - every tile its own slightly cambered, slightly turned
// piece; ridge tiles bedded in mortar along the top; bargeboards on the verges. The whole roof
// then sags: the ridge dips between the gables and each slope is a little hollow between wall
// plate and ridge (old rafters creep), the eaves line droops - real thickness at every edge.
//
//   gableRoof(kit, F, { L, S, pitch, eaves, verge, cover: 'clay' | 'slate', sag, lod, seed })
//   chimney(kit, F, { w, d, h, ... })
// F: frame at the wall-plate level, centred: x along the ridge, y up, z across the span.
import { Kit, block, sub, frame, makeRand, clamp, smoothstep, tube } from './core.js';
import { member } from './timber.js';
import { masonryBox } from './masonry.js';

/**
 * o: L (length along the ridge, wall to wall), S (span, wall face to wall face), pitch (rise per
 * half span), eaves (overhang, m), verge (overhang at the gables, m), cover ('clay'|'slate'),
 * sag ({ ridge, slope, eaves } m), lod, seed, sides ([+1, -1] which slopes), gableL / gableR
 * (bool: verges with bargeboards at -x / +x; false = abutting a neighbour), missing (fraction of
 * slipped / missing tiles), damageAt (fn([x, y, z] in the parent frame of F) -> bool: the tile
 * there is removed - holes in the roofline for 3C).
 * Returns { rise, slope, tiles: [{ side, x, s, tri range }] }.
 */
export function gableRoof(kit, F, o) {
  const rnd = makeRand(o.seed ?? 21);
  const L = o.L, S = o.S, pitch = o.pitch ?? 1.0;
  const half = S / 2, rise = pitch * half, ang = Math.atan(pitch);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const overE = o.eaves ?? 0.45, overV = o.verge ?? 0.3;
  const slope = (half + overE) / ca;                // rafter length, ridge to tail (along the slope)
  const lod = o.lod || 'mid';
  const hero = lod === 'hero';
  const cover = o.cover || 'clay';
  const tileMat = cover === 'clay' ? 'clay' : 'slate';
  const sag = { ridge: 0.05, slope: 0.025, eaves: 0.03, ...(o.sag || {}) };
  const local = new Kit(0);
  const xL = -L / 2 - (o.gableL === false ? 0 : overV), xR = L / 2 + (o.gableR === false ? 0 : overV);
  const deckT = 0.05;                                // rafter top -> deck (boards + battens)
  const sides = o.sides || [1, -1];
  // slope frame for a side: origin at the ridge line on the rafter top, x along, "d" down the slope
  const slopeF = (side) => frame([0, rise, 0], [1, 0, 0], [0, ca, side * sa], [0, -sa, side * ca]);
  // (in slopeF: local x along the ridge, y = out of the roof surface, z = distance down the slope)
  const tiles = [];
  // damage: o.damageAt(point in F's parent frame) -> true removes the tile (holes for 3C)
  const hit = (x, s2, side) => {
    if (!o.damageAt) return false;
    const p = [x, rise - s2 * sa + 0.05, side * s2 * ca];
    return o.damageAt([F[0] + p[0] * F[3] + p[1] * F[6] + p[2] * F[9], F[1] + p[0] * F[4] + p[1] * F[7] + p[2] * F[10], F[2] + p[0] * F[5] + p[1] * F[8] + p[2] * F[11]]);
  };
  for (const side of sides) {
    const SF = slopeF(side);
    const Fs = side > 0 ? SF : frame([0, rise, 0], [-1, 0, 0], [0, ca, side * sa]);   // keep right-handed frames
    const X = side > 0 ? 1 : -1;   // local x sign for Fs
    // ---- rafters (only their tails show, under the eaves) and the verge rafters
    const rafterW = 0.11, rafterH = 0.15, sp = 0.55;
    const nr = Math.max(2, Math.round(L / sp));
    for (let i = 0; i <= nr; i++) {
      const x = -L / 2 + 0.06 + (L - 0.12) * i / nr;
      const a = slope - overE / ca - 0.6, b = slope + rnd.range(-0.02, 0.02);
      const Fr = sub(Fs, [x * X, -rafterH / 2, (a + b) / 2], [0, 0, 1], [0, 1, 0]);
      block(local.get('oakDark'), Fr, b - a, rafterH, rafterW, { r: 0.008, seg: [0.3, 0.15, 0.11], seed: rnd(), noise: 0.002, nf: 4, chip: 0.005, axis: [1, 0, 0] });
    }
    // ---- deck boards: one board surface just under the battens (the soffit seen from below)
    {
      const acc = local.get('oakDark');
      const z0 = 0.04, z1 = slope;
      const nb = Math.max(1, Math.round((z1 - z0) / 0.22));
      for (let k = 0; k < nb; k++) {
        const za = z0 + (z1 - z0) * k / nb, zb = z0 + (z1 - z0) * (k + 1) / nb - 0.004;
        const Fb = sub(Fs, [((xL + xR) / 2) * X, 0.011, (za + zb) / 2]);
        block(acc, Fb, xR - xL, 0.022, zb - za, { r: 0.002, seg: [2.0, 0.03, 0.3], seed: rnd(), noise: 0.002, nf: 2, axis: [1, 0, 0], skip: 4 * 0 });
      }
    }
    // ---- the covering, course by course from the eaves up
    if (cover === 'clay') {
      const tl = 0.27, tw = 0.17, g = 0.1, th = 0.013;
      const nc = Math.ceil((slope - 0.1) / g) + 2;
      for (let c = 0; c < nc; c++) {
        const tail = slope + 0.04 - c * g;                 // eaves course first (tilted up by the fillet)
        if (tail - tl < -0.05) break;
        const off = (c % 2) * tw / 2 + rnd.sym(0.02);
        const lift = deckT + 2 * th + (c === 0 ? 0.02 : 0);
        for (let x = xL - off; x < xR; x += tw + rnd.range(0.002, 0.006)) {
          const xa = Math.max(xL, x), xb = Math.min(xR, x + tw);
          if (xb - xa < 0.05) continue;
          if (hit((xa + xb) / 2, tail, side)) continue;
          if (o.missing && rnd() < o.missing) continue;
          const head = Math.max(0.02, tail - tl);
          const t0 = local.get(tileMat).tcount;
          tile(local.get(tileMat), Fs, X, xa, xb, head, tail, lift, th, rnd, hero, c === 0);
          tiles.push({ side, x: (xa + xb) / 2, s: tail, start: t0, end: local.get(tileMat).tcount });
        }
      }
    } else {
      // stone slates: diminishing courses, random widths, thick
      let tail = slope + 0.05, c = 0;
      const ssc = o.slateScale ?? (lod === 'far' ? 1.9 : 1);
      while (tail > 0.12) {
        const f = tail / slope;                           // 1 at the eaves .. 0 at the ridge
        const len = (0.28 + 0.32 * f + rnd.sym(0.03)) * ssc;
        const g = len * 0.42;
        const th = 0.018 + 0.016 * f;
        const lift = deckT + th * 2;
        let x = xL - rnd.range(0, 0.2);
        while (x < xR) {
          const w = (0.22 + 0.2 * f) * rnd.range(0.7, 1.4) * ssc;
          const xa = Math.max(xL, x), xb = Math.min(xR, x + w);
          if (xb - xa > 0.06 && !hit((xa + xb) / 2, tail, side) && !(o.missing && rnd() < o.missing)) {
            const t0 = local.get(tileMat).tcount;
            tile(local.get(tileMat), Fs, X, xa, xb, Math.max(0.02, tail - len), tail, lift, th, rnd, hero, c === 0, 0.012);
            tiles.push({ side, x: (xa + xb) / 2, s: tail, start: t0, end: local.get(tileMat).tcount });
          }
          x += w + rnd.range(0.004, 0.012);
        }
        tail -= g; c++;
      }
    }
    // ---- fascia board along the eaves (rafter tails are cut plumb; a board on some houses)
    if (o.fascia) {
      const Ff = sub(Fs, [((xL + xR) / 2) * X, -0.06, slope + 0.01]);
      block(local.get('oakDark'), Ff, xR - xL, 0.16, 0.03, { r: 0.004, seg: [0.5, 0.16, 0.03], seed: rnd(), noise: 0.002, axis: [1, 0, 0] });
    }
  }
  // ---- ridge: hog-back ridge tiles bedded in mortar, their wings lying on the top courses
  {
    const rl = cover === 'clay' ? 0.42 : 0.5;
    const n = Math.ceil((xR - xL) / rl);
    const lift = deckT + (cover === 'clay' ? 0.04 : 0.06);
    const yR = rise + lift / ca;
    const wspan = 0.2;
    for (let i = 0; i < n; i++) {
      const xa = xL + i * rl, xb = Math.min(xR, xa + rl - 0.012);
      const acc = local.get(tileMat);
      const xm = (xa + xb) / 2;
      const Fr = frame([xm + rnd.sym(0.006), yR + rnd.sym(0.005), rnd.sym(0.008)], [1, 0, rnd.sym(0.02)], [0, 1, 0]);
      block(acc, Fr, xb - xa, 0.022, wspan * 2, {
        r: 0.006, seg: [0.2, 0.022, 0.04], seed: rnd(), noise: 0.003, nf: 5, chip: 0.004, axis: [0, 0, 1],
        warp: (lx, ly, lz) => [lx, ly + 0.011 - pitch * (Math.sqrt(lz * lz + 0.0025) - 0.05), lz],
      });
      // the mortar bed under it (shows at the joints and the open ends)
      block(local.get('mortar'), frame([xm, yR - 0.035, 0]), xb - xa + 0.015, 0.07, 0.12, { r: 0.02, seg: [0.2, 0.05, 0.05], seed: rnd(), noise: 0.006, nf: 8 });
    }
  }
  // ---- bargeboards on the verges, and the verge rafters
  for (const [gx, on] of [[xL, o.gableL !== false], [xR, o.gableR !== false]]) {
    if (!on) continue;
    for (const side of sides) {
      const SF = slopeF(side);
      // a thick board along the verge, below the tiles' edge
      const Fb = sub(SF, [gx + (gx < 0 ? 0.03 : -0.03), -0.04, slope / 2 + 0.04], [0, 0, 1], [0, 1, 0]);
      block(local.get('oakDark'), Fb, slope + 0.1, 0.3, 0.045, { r: 0.006, seg: [0.25, 0.1, 0.045], seed: rnd(), noise: 0.003, nf: 3, chip: 0.006 });
    }
  }
  // ---- sag: the ridge dips between the gables, the slopes hollow, the eaves droop
  const sR = sag.ridge * rnd.range(0.6, 1.3), sS = sag.slope, sE = sag.eaves * rnd.range(0.5, 1.4);
  const ph = rnd() * 6;
  local.deform((x, y, z) => {
    const u = clamp((x - xL) / (xR - xL), 0, 1);
    const along = Math.sin(Math.PI * u);
    // position down the slope (0 at the ridge .. 1 at the tail), from the height
    const t = clamp((rise - y) / (rise + overE * pitch), 0, 1.2);
    const hollow = sS * Math.sin(Math.PI * clamp(t / (half / (half + overE)), 0, 1));
    const dy = -sR * along * (1 - t * 0.6) - hollow - sE * Math.pow(Math.max(0, t - 0.8) / 0.2, 2) * (0.6 + 0.4 * Math.sin(u * 7 + ph));
    return [x, y + dy, z];
  });
  kit.merge(local, F);
  return { rise, slope, ang, tiles };
}

/** One tile / slate: a thin cambered slab from head (s) to tail (s) on the slope frame. */
function tile(acc, Fs, X, xa, xb, head, tail, lift, th, rnd, hero, eave, irregular = 0) {
  const w = xb - xa, l = tail - head;
  const tilt = Math.atan2(th * 1.6, l) + rnd.sym(0.012);
  const yaw = rnd.sym(0.025), roll = rnd.sym(0.02);
  const cx = (xa + xb) / 2 + rnd.sym(0.004), cz = (head + tail) / 2 + rnd.sym(0.006);
  // centre height above the rafter top: the tail rests on the course below
  const cy = lift - th * 0.8 + Math.sin(tilt) * l * 0.5;
  const Ft = sub(Fs, [cx * X, cy, cz], [Math.cos(yaw), roll, Math.sin(yaw)], [0, Math.cos(tilt), -Math.sin(tilt)]);
  const camber = 0.004 + rnd() * 0.004;
  const lon = 0.003 * rnd();
  const ir = irregular;
  const c4 = [rnd.sym(ir), rnd.sym(ir), rnd.sym(ir), rnd.sym(ir)];
  block(acc, Ft, w - 0.004, th, l, {
    r: hero ? Math.min(0.003, th * 0.25) : 0, rs: 1, seg: hero ? [w / 3, th, l / 2] : [w / 2, th, l], seed: rnd(), noise: 0.0015, nf: 7, chip: ir ? 0.008 : 0.002,
    skip: 8 /* -y (underside) */ | 32 /* -z (the head, under the course above) */, axis: [0, 0, 1],
    // occlusion: the head two thirds lie under the next course; uv: across (m), down the tile (m)
    aoFn: (lx, ly, lz) => 0.25 + 0.75 * smoothstep(0.45, 0.75, (lz + l / 2) / l),
    uvFn: (lx, ly, lz) => [lx + w / 2, lz + l / 2],
    warp: (lx, ly, lz) => {
      const u = lx / (w / 2), v = lz / (l / 2);
      // camber across and along; ragged ends for stone slates
      const yy = ly + camber * (1 - u * u) + lon * (1 - v * v);
      const tailRag = ir ? (c4[0] * (1 - u) + c4[1] * (1 + u)) * 0.5 * Math.max(0, v) : 0;
      const sideRag = ir ? (c4[2] * (1 - v) + c4[3] * (1 + v)) * 0.5 * u : 0;
      return [lx + sideRag, yy, lz + tailRag];
    },
  });
  void eave;
}

/**
 * A chimney stack of squared stone through a roof: F at its base (inside the house, on the
 * wall top / floor), w x d section, h tall (to the top of the cap). Soot on the top courses.
 */
export function chimney(kit, F, o = {}) {
  const w = o.w ?? 0.9, d = o.d ?? 0.7, h = o.h ?? 3;
  const local = new Kit(0);
  masonryBox(local, frame([0, 0, 0]), { w, d, h: h - 0.18 - 0.56, T: Math.min(w, d) / 2, style: 'squared', mat: o.mat || 'stoneGrey', dressedMat: o.dressed || 'stoneDressed', lod: o.lod || 'mid', seed: o.seed ?? 31, courseMin: 0.16, courseMax: 0.26, quoin: { long: Math.min(0.4, w * 0.45), short: Math.min(0.25, d * 0.35) } });
  // the cap: a projecting course of slabs, the flue mouth, soot
  const rnd = makeRand(o.seed ?? 31);
  block(local.get(o.dressed || 'stoneDressed'), frame([0, h - 0.09, 0]), w + 0.12, 0.16, d + 0.12, { r: 0.015, seg: [0.2, 0.08, 0.2], seed: rnd(), noise: 0.004, nf: 6, chip: 0.012 });
  block(local.get('soot'), frame([0, h + 0.002, 0]), w * 0.45, 0.01, d * 0.4, { r: 0.004, seg: [1, 1, 1], seed: rnd() });
  // the top courses blackened by smoke
  masonryBox(local, frame([0, h - 0.18 - 0.55, 0]), { w: w + 0.004, d: d + 0.004, h: 0.55, T: Math.min(w, d) / 2, style: 'squared', mat: 'stoneSoot', dressedMat: 'stoneSoot', mortar: 'soot', lod: o.lod || 'mid', seed: (o.seed ?? 31) + 7, courseMin: 0.16, courseMax: 0.26, quoin: { long: Math.min(0.4, w * 0.45), short: Math.min(0.25, d * 0.35) } });
  kit.merge(local, F);
}

/** A hood / pentice roof (a small lean-to roof over a door or shop front): F at the wall face. */
export function pentice(kit, F, o = {}) {
  const L = o.L ?? 2.4, depth = o.depth ?? 0.8, drop = o.drop ?? 0.45;
  const rnd = makeRand(o.seed ?? 41);
  const local = new Kit(0);
  // brackets (curved braces from the wall) and a plate, then a short slope of tiles
  for (const x of [-L / 2 + 0.1, L / 2 - 0.1]) {
    member(local, frame([x, 0, 0], [0, 0, 1], [0, 1, 0], [-1, 0, 0]), [0.02, -drop - 0.3], [depth - 0.05, -drop + 0.02], 0.08, 0.08, rnd, { mat: 'oakDark' });
  }
  const ang = Math.atan2(drop, depth);
  const Fs = frame([0, 0, 0], [1, 0, 0], [0, Math.cos(ang), Math.sin(ang)], [0, -Math.sin(ang), Math.cos(ang)]);
  const slope = Math.hypot(depth, drop) + 0.08;
  block(local.get('oakDark'), sub(Fs, [0, -0.012, slope / 2]), L, 0.024, slope, { r: 0.003, seg: [0.5, 0.03, 0.3], seed: rnd() });
  const tl = 0.27, tw = 0.17, g = 0.1, th = 0.013;
  for (let c = 0; c * g < slope; c++) {
    const tail = slope + 0.03 - c * g;
    const off = (c % 2) * tw / 2;
    for (let x = -L / 2 - 0.05 - off; x < L / 2 + 0.05; x += tw + 0.004) {
      const xa = Math.max(-L / 2 - 0.05, x), xb = Math.min(L / 2 + 0.05, x + tw);
      if (xb - xa < 0.05) continue;
      tile(local.get(o.cover === 'slate' ? 'slate' : 'clay'), Fs, 1, xa, xb, Math.max(0.02, tail - tl), tail, 0.03 + 2 * th, th, rnd, false, c === 0);
    }
  }
  kit.merge(local, F);
  void tube;
}
