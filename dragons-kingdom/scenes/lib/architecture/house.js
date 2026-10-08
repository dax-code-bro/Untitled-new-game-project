// Architecture kit - the Cling townhouse: a rubble-stone ground storey with dressed quoins,
// an arched door and a shop window, one or two jettied timber-framed storeys above, a front
// gable (or eaves to the street), a tiled or stone-slated roof with real thickness, a stone
// chimney stack; the upper storeys lean a little and the roof sags (old houses settle).
//
//   const h = house(kit, frame([x, 0, z]), { w: 6.5, d: 9, storeys: 1, roof: 'front', seed: 3 });
//   // kit -> kit.build(materials): one mesh per material for the whole row / square
//
// Local frame: x along the frontage (w), y up, z toward the street (front face at z = +d/2).
import { Kit, frame, sub, makeRand, block } from './core.js';
import { masonryBox, courses } from './masonry.js';
import { framedWall, jetty, gableFrame, member } from './timber.js';
import { gableRoof, chimney } from './roof.js';
import { windowUnit, door, threshold } from './openings.js';

/**
 * o: w, d, hs (stone storey), ht (timber storey), storeys (timber storeys), jetty (overhang per
 * storey), roof 'front' | 'side', pitch, cover 'clay' | 'slate', seed, lod ('hero'|'mid'|'low'),
 * door { x, w, h, arch, open }, shop { x, w, h } (ground-floor window), windows per storey
 * (count), shutters mix, lean (rad), party { left, right } (abutting neighbours: plain faces),
 * oakTone ('oak' | 'oakDark'), chimney (bool | 'left' | 'right'), studs (spacing), rail,
 * damage (fn for roof tiles), sideJetty (bool, corner houses).
 * Returns { height, ridge, front (z of the top storey front), doors, windows, roof }.
 */
export function house(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 1);
  const w = o.w ?? 6.5, d = o.d ?? 9;
  const hs = o.hs ?? rnd.range(3.0, 3.5), ht = o.ht ?? rnd.range(2.6, 2.9);
  const n = o.storeys ?? 1;
  const J = o.jetty ?? rnd.range(0.32, 0.5);
  const lod = o.lod || 'mid';
  const T = 0.6;
  const oak = o.oakTone || (rnd() < 0.5 ? 'oak' : 'oakDark');
  const local = new Kit(0);
  const info = { doors: [], windows: [] };
  // ---------------- ground storey (stone)
  const dr = o.door || {};
  const doorW = dr.w ?? rnd.range(1.05, 1.3), doorH = dr.h ?? rnd.range(2.25, 2.5);
  const doorX = dr.x ?? (rnd() < 0.5 ? rnd.range(0.7, 1.2) : w - doorW - rnd.range(0.7, 1.2));
  const doorArch = dr.arch ?? rnd() < 0.65;
  const sp = o.shop || {};
  const shopW = sp.w ?? Math.min(w - doorW - 2.4, rnd.range(1.1, 1.8));
  const shopX = sp.x ?? (doorX < w / 2 ? doorX + doorW + rnd.range(0.8, Math.max(0.85, w - doorX - doorW - shopW - 0.7)) : rnd.range(0.7, Math.max(0.75, doorX - shopW - 0.8)));
  const shopH = sp.h ?? rnd.range(1.05, 1.3), shopY = sp.y ?? rnd.range(0.8, 1.0);
  const frontOps = [{ x: doorX, y: 0, w: doorW, h: doorH, head: doorArch ? 'arch' : 'lintel', reveal: 0.3 }];
  if (shopW > 0.6) frontOps.push({ x: shopX, y: shopY, w: shopW, h: shopH, head: 'lintel', sill: true, reveal: 0.3 });
  const sideOps = (L) => (rnd() < 0.5 ? [{ x: L * rnd.range(0.3, 0.6), y: 1.1, w: 0.7, h: 0.85, head: 'lintel', sill: true, reveal: 0.3 }] : []);
  const party = o.party || {};
  const C = courses(rnd, hs, { min: 0.17, max: 0.32 });
  masonryBox(local, frame([0, 0, 0]), {
    w, d, h: hs, T, style: o.style || 'rubble', mat: o.stoneMat || 'stoneGrey', dressedMat: 'stoneDressed', mortar: 'mortar', lod, seed: rnd() * 1000, courses: C,
    faces: {
      front: { openings: frontOps },
      right: party.right ? { lod: 'low', openings: [] } : { openings: sideOps(d) },
      left: party.left ? { lod: 'low', openings: [] } : { openings: sideOps(d) },
      back: { lod: lod === 'hero' ? 'mid' : 'low', openings: [] },
    },
  });
  // door, threshold, shop window in the stone front
  const Ff = sub(frame([0, 0, 0]), [-w / 2, 0, d / 2]);
  {
    const Fd = sub(Ff, [doorX, 0, 0]);
    door(local, Fd, { w: doorW, h: doorH, arch: doorArch, inset: 0.2, open: dr.open ?? (rnd() < 0.3 ? rnd.range(0.3, 0.9) : 0), hingeLeft: rnd() < 0.5, wallT: T, seed: rnd() * 1000 });
    threshold(local, Fd, doorW, 0.35, rnd);
    info.doors.push({ x: -w / 2 + doorX + doorW / 2, z: d / 2, w: doorW, h: doorH });
    if (shopW > 0.6) {
      windowUnit(local, sub(Ff, [shopX, shopY, 0]), { w: shopW, h: shopH, inset: 0.16, lights: Math.max(2, Math.round(shopW / 0.45)), glazing: rnd() < 0.6 ? 'square' : 'none', shutters: rnd() < 0.6 ? (rnd() < 0.7 ? 'open' : 'half') : 'none', floorBelow: shopY, seed: rnd() * 1000 });
    }
  }
  // ---------------- timber storeys
  let y = hs;
  let front = d / 2;
  const studs = o.studs ?? (rnd() < 0.55 ? rnd.range(0.45, 0.6) : 0);
  const rail = o.rail ?? (studs ? (rnd() < 0.5 ? 0 : 0.95) : 1.0);
  for (let k = 0; k < n; k++) {
    const Jk = J;
    // jetty joists over the wall below, then the storey's frame from the bressumer up
    jetty(local, sub(frame([0, 0, 0]), [-w / 2, y - 0.18, front]), w, Jk, { seed: rnd() * 1000, mat: oak === 'oak' ? 'oakDark' : 'oak' });
    // the floor boards' underside between the joists over the jetty
    block(local.get('oakDark'), frame([0, y + 0.012, front + Jk / 2 - 0.1]), w, 0.024, Jk + 0.2, { r: 0.002, seg: [1, 0.02, 0.2], seed: rnd() });
    front += Jk;
    const dk = front + d / 2;                     // depth of this storey (back wall at -d/2)
    const zc = front - dk / 2;
    const nWin = o.windows ?? Math.max(1, Math.round(w / 2.6));
    const wins = [];
    for (let i = 0; i < nWin; i++) {
      const ww = rnd.range(0.9, 1.5), wh = rnd.range(0.95, 1.2);
      const cx = (w * (i + 0.5)) / nWin + rnd.sym(0.25);
      wins.push({ x: Math.max(0.45, Math.min(w - ww - 0.45, cx - ww / 2)), y: rnd.range(0.85, 0.98), w: ww, h: wh });
    }
    // front
    const FF = sub(frame([0, 0, 0]), [-w / 2, y, front]);
    framedWall(local, FF, w, ht, { studs, rail, windows: wins, lod, seed: rnd() * 1000, mat: oak, plasterSeed: (o.seed ?? 1) * 0.0137 + k * 0.001 });
    for (const wn of wins) {
      const sh = rnd() < 0.45 ? 'none' : rnd() < 0.6 ? 'open' : rnd() < 0.7 ? 'half' : 'closed';
      windowUnit(local, sub(FF, [wn.x, wn.y, 0]), { w: wn.w, h: wn.h, inset: 0.05, frame: false, glazing: rnd() < 0.75 ? 'diamond' : 'square', shutters: sh, floorBelow: wn.y, seed: rnd() * 1000 });
      // casement frames inside the timber opening
      windowCasement(local, sub(FF, [wn.x, wn.y, 0]), wn.w, wn.h, rnd);
      info.windows.push({ storey: k, ...wn });
    }
    // sides (from the back to the front on the left, front to back on the right) and back
    const sideWins = (L) => (rnd() < 0.5 && !(party.left && party.right) ? [{ x: L * rnd.range(0.35, 0.55), y: 0.9, w: rnd.range(0.7, 1.0), h: 1.0 }] : []);
    const sl = party.left ? [] : sideWins(dk);
    const FL = sub(frame([0, 0, 0]), [-w / 2, y, -d / 2], [0, 0, 1], [0, 1, 0]);
    framedWall(local, FL, dk, ht, { studs: studs || 0, rail, windows: sl, cornerL: false, cornerR: false, braces: 'none', lod: party.left ? 'low' : lod, seed: rnd() * 1000, mat: oak, plasterSeed: (o.seed ?? 1) * 0.0137 + k * 0.001 });
    for (const wn of sl) { windowUnit(local, sub(FL, [wn.x, wn.y, 0]), { w: wn.w, h: wn.h, inset: 0.05, frame: false, glazing: 'diamond', shutters: rnd() < 0.5 ? 'open' : 'none', floorBelow: wn.y, seed: rnd() * 1000 }); windowCasement(local, sub(FL, [wn.x, wn.y, 0]), wn.w, wn.h, rnd); }
    const sr = party.right ? [] : sideWins(dk);
    const FR = sub(frame([0, 0, 0]), [w / 2, y, front], [0, 0, -1], [0, 1, 0]);
    framedWall(local, FR, dk, ht, { studs: studs || 0, rail, windows: sr, cornerL: false, cornerR: false, braces: 'none', lod: party.right ? 'low' : lod, seed: rnd() * 1000, mat: oak, plasterSeed: (o.seed ?? 1) * 0.0137 + k * 0.001 });
    for (const wn of sr) { windowUnit(local, sub(FR, [wn.x, wn.y, 0]), { w: wn.w, h: wn.h, inset: 0.05, frame: false, glazing: 'diamond', shutters: rnd() < 0.5 ? 'open' : 'none', floorBelow: wn.y, seed: rnd() * 1000 }); windowCasement(local, sub(FR, [wn.x, wn.y, 0]), wn.w, wn.h, rnd); }
    const FB = sub(frame([0, 0, 0]), [w / 2, y, -d / 2], [-1, 0, 0], [0, 1, 0]);
    framedWall(local, FB, w, ht, { studs: 0, rail: 1.0, windows: [], lod: lod === 'hero' ? 'mid' : 'low', seed: rnd() * 1000, mat: oak, plasterSeed: (o.seed ?? 1) * 0.0137 });
    // corner brackets under the jetty (curved braces from the stone wall to the bressumer)
    if (k === 0) for (const sx of [-1, 1]) {
      if ((sx < 0 && party.left) || (sx > 0 && party.right)) continue;
      const Fb = frame([sx * (w / 2 - 0.14), 0, 0], [0, 0, 1], [0, 1, 0]);
      member(local, Fb, [d / 2 + 0.02, y - 0.95], [front - 0.1, y - 0.19], 0.16, 0.15, rnd, { mat: oak === 'oak' ? 'oakDark' : 'oak', bow: 0.025 });
      // the brace's foot stands on a dressed stone corbel
      block(local.get('stoneDressed'), frame([sx * (w / 2 - 0.14), y - 1.08, d / 2 + 0.09]), 0.24, 0.2, 0.2, { r: 0.012, seg: [0.08, 0.08, 0.08], seed: rnd(), noise: 0.003, nf: 6, chip: 0.008 });
    }
    y += ht;
    void zc;
  }
  // ---------------- gable and roof
  const pitch = o.pitch ?? rnd.range(0.95, 1.25);
  const cover = o.cover || (rnd() < 0.6 ? 'clay' : 'slate');
  const dTop = front + d / 2;
  let ridgeY, roofInfo;
  if ((o.roof || 'front') === 'front') {
    const rise = (w / 2) * pitch;
    // front and back gables (a small light in the front gable)
    const gw = rnd() < 0.65 ? [{ x: w / 2 - 0.36 + rnd.sym(0.15), y: rise * 0.22, w: 0.62, h: 0.72 }] : [];
    const FG = sub(frame([0, 0, 0]), [-w / 2, y, front]);
    gableFrame(local, FG, w, rise, { lod, seed: rnd() * 1000, mat: oak, windows: gw, plasterSeed: (o.seed ?? 1) * 0.0137 });
    for (const wn of gw) {
      framedOpening(local, FG, wn, oak, rnd, lod);
      windowUnit(local, sub(FG, [wn.x, wn.y, 0]), { w: wn.w, h: wn.h, inset: 0.05, frame: false, glazing: 'diamond', shutters: rnd() < 0.4 ? 'open' : 'none', floorBelow: 0.6, seed: rnd() * 1000 });
      windowCasement(local, sub(FG, [wn.x, wn.y, 0]), wn.w, wn.h, rnd);
    }
    gableFrame(local, sub(frame([0, 0, 0]), [w / 2, y, -d / 2], [-1, 0, 0], [0, 1, 0]), w, rise, { lod: 'low', seed: rnd() * 1000, mat: oak, plasterSeed: (o.seed ?? 1) * 0.0137 });
    const RF = frame([0, y, front - dTop / 2], [0, 0, 1], [0, 1, 0]);
    roofInfo = gableRoof(local, RF, { L: dTop, S: w, pitch, eaves: rnd.range(0.35, 0.55), verge: rnd.range(0.35, 0.6), cover, lod, seed: rnd() * 1000, damage: o.damage, sag: o.sag });
    ridgeY = y + rise;
  } else {
    const rise = (dTop / 2) * pitch * 0.85;
    const RF = frame([0, y, front - dTop / 2], [1, 0, 0], [0, 1, 0]);
    roofInfo = gableRoof(local, RF, { L: w, S: dTop, pitch: pitch * 0.85, eaves: rnd.range(0.4, 0.6), verge: party.left || party.right ? 0.12 : 0.35, cover, lod, seed: rnd() * 1000, damage: o.damage, sag: o.sag, gableL: true, gableR: true });
    gableFrame(local, sub(frame([0, 0, 0]), [-w / 2, y, -d / 2], [0, 0, 1], [0, 1, 0]), dTop, rise, { lod: party.left ? 'low' : lod, seed: rnd() * 1000, mat: oak, plasterSeed: (o.seed ?? 1) * 0.0137 });
    gableFrame(local, sub(frame([0, 0, 0]), [w / 2, y, front], [0, 0, -1], [0, 1, 0]), dTop, rise, { lod: party.right ? 'low' : lod, seed: rnd() * 1000, mat: oak, plasterSeed: (o.seed ?? 1) * 0.0137 });
    ridgeY = y + rise;
  }
  // ---------------- chimney: a stone stack from the ground storey through the roof
  if (o.chimney !== false && rnd() < (o.chimney ? 1 : 0.75)) {
    const side = o.chimney === 'left' ? -1 : o.chimney === 'right' ? 1 : rnd() < 0.5 ? -1 : 1;
    const cx = side * (o.roof === 'side' ? w * 0.3 : w * 0.18), cz = -d * rnd.range(0.05, 0.25);
    chimney(local, frame([cx, hs - 0.1, cz]), { w: rnd.range(0.8, 1.0), d: rnd.range(0.65, 0.8), h: ridgeY - hs + rnd.range(0.7, 1.2), lod: lod === 'hero' ? 'mid' : lod, seed: rnd() * 1000 });
  }
  // ---------------- settle: the timber storeys lean a little and twist, the stone stays plumb
  const lean = o.lean ?? [rnd.sym(0.012), rnd.range(0.0, 0.012)];
  const twist = rnd.sym(0.004);
  local.deform((x, yy, z) => {
    const e = Math.max(0, yy - hs);
    return [x + lean[0] * e + twist * z * e * 0.2, yy - Math.abs(lean[0]) * e * 0.02, z + lean[1] * e - twist * x * e * 0.2];
  });
  kit.merge(local, F);
  return { height: y, ridge: ridgeY, front, depthTop: dTop, w, d, hs, ...info, roof: roofInfo };
}

/** Posts and rails framing an opening in a gable (the gable studs stop around it). */
function framedOpening(kit, F, wn, mat, rnd, lod) {
  const sw = 0.12;
  member(kit, F, [wn.x - sw / 2, wn.y - sw], [wn.x - sw / 2, wn.y + wn.h + sw], sw, 0.18, rnd, { mat, lod });
  member(kit, F, [wn.x + wn.w + sw / 2, wn.y - sw], [wn.x + wn.w + sw / 2, wn.y + wn.h + sw], sw, 0.18, rnd, { mat, lod });
  member(kit, F, [wn.x - sw, wn.y - sw / 2], [wn.x + wn.w + sw, wn.y - sw / 2], sw, 0.18, rnd, { mat, lod });
  member(kit, F, [wn.x - sw, wn.y + wn.h + sw / 2], [wn.x + wn.w + sw, wn.y + wn.h + sw / 2], sw, 0.18, rnd, { mat, lod });
}

/** Casement frames (oak) with a central mullion inside a timber-framed opening. */
function windowCasement(kit, F, w, h, rnd) {
  const fw = 0.045, fd = 0.05;
  const z = -0.065;
  const lights = Math.max(2, Math.round(w / 0.42));
  const mem = (x0, y0, x1, y1, ww) => {
    const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L;
    block(kit.get('oakDark'), sub(F, [(x0 + x1) / 2, (y0 + y1) / 2, z], [ux, uy, 0], [-uy, ux, 0]), L, ww, fd, { r: 0.004, seg: [0.3, ww, fd], seed: rnd(), noise: 0.001, nf: 5, axis: [1, 0, 0] });
  };
  for (let i = 1; i < lights; i++) { const x = (w * i) / lights; mem(x, 0, x, h, fw * (i % 2 ? 1.6 : 1)); }
  mem(0, fw / 2, w, fw / 2, fw); mem(0, h - fw / 2, w, h - fw / 2, fw);
  mem(fw / 2, 0, fw / 2, h, fw); mem(w - fw / 2, 0, w - fw / 2, h, fw);
}
