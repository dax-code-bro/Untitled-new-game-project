// Architecture kit - the Cling townhouse: a rubble-stone ground storey with dressed quoins,
// an arched door and a shop window, one or two jettied timber-framed storeys above, a front
// gable (or eaves to the street), a tiled or stone-slated roof with real thickness, a stone
// chimney stack; the upper storeys lean a little and the roof sags (old houses settle).
//
//   const h = house(kit, frame([x, 0, z]), { w: 6.5, d: 9, storeys: 1, roof: 'front', seed: 3 });
//   // kit -> kit.build(materials): one mesh per material for the whole row / square
//
// Local frame: x along the frontage (w), y up, z toward the street (front face at z = +d/2).
import { Kit, frame, sub, makeRand, block, xf, norm } from './core.js';
import { masonryBox, masonryFace, masonryGable, courses } from './masonry.js';
import { framedWall, jetty, gableFrame, member } from './timber.js';
import { gableRoof, chimney } from './roof.js';
import { windowUnit, door, threshold } from './openings.js';
import { grimeBand, stain } from './weathering.js';

/**
 * o: w, d, hs (stone storey), ht (timber storey), storeys (timber storeys), jetty (overhang per
 * storey), roof 'front' | 'side', pitch, cover 'clay' | 'slate', seed, lod ('hero'|'mid'|'low'),
 * door { x, w, h, arch, open }, shop { x, w, h } (ground-floor window), windows per storey
 * (count), shutters mix, lean (rad), party { left, right } (abutting neighbours: plain faces),
 * oakTone ('oak' | 'oakDark'), chimney (bool | 'left' | 'right'), studs (spacing), rail,
 * damage (fn([x, y, z] in the house's local frame) -> bool: roof tiles removed there).
 * Returns { height, ridge, front (z of the top storey front), doors, windows, roof }.
 */
export function house(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 1);
  const w = o.w ?? 6.5, d = o.d ?? 9;
  const hs0 = rnd.range(3.0, 3.5), ht = o.ht ?? rnd.range(2.6, 2.9);
  // o.allStone: a two-storey stone house (no timber storeys, stone gables with coping)
  const hs = o.hs ?? (o.passage ? Math.max(hs0, o.passage.h + 0.75) : o.allStone ? hs0 + 2.6 : hs0);
  const n = o.allStone ? 0 : (o.storeys ?? 1);
  const J = o.jetty ?? rnd.range(0.32, 0.5);
  const lod = o.lod || 'mid';
  const T = 0.6;
  const oak = o.oakTone || (rnd() < 0.5 ? 'oak' : 'oakDark');
  // glass was dear in the 1400s: a merchant's house has leaded lights, most houses have unglazed
  // openings closed by shutters or oiled linen on a lath frame
  const rich = o.rich ?? (o.allStone ? rnd() < 0.7 : rnd() < 0.3);
  const glaze = () => (rich ? (rnd() < 0.7 ? 'diamond' : 'square') : rnd() < 0.45 ? 'cloth' : 'none');
  const shutFor = (g) => (g === 'none' ? (rnd() < 0.5 ? 'open' : rnd() < 0.5 ? 'half' : 'closed') : g === 'cloth' ? (rnd() < 0.6 ? 'open' : 'none') : (rnd() < 0.5 ? 'none' : rnd() < 0.7 ? 'open' : 'half'));
  const local = new Kit(0);
  const info = { doors: [], windows: [] };
  // o.beamKit: the bressumer over the front (first storey's sill) is built into that kit instead -
  // its own mesh, so it can fall (3C: the beam across the arch path)
  const beamLocal = o.beamKit ? new Kit(0) : null;
  // ---------------- ground storey (stone)
  const dr = o.door || {};
  const doorW = dr.w ?? rnd.range(1.05, 1.3), doorH = dr.h ?? rnd.range(2.25, 2.5);
  const doorX = dr.x ?? (rnd() < 0.5 ? rnd.range(0.7, 1.2) : w - doorW - rnd.range(0.7, 1.2));
  const doorArch = dr.arch ?? rnd() < 0.65;
  const sp = o.shop || {};
  const shopW = sp.w ?? Math.min(w - doorW - 2.4, rnd.range(1.1, 1.8));
  const shopX = sp.x ?? (doorX < w / 2 ? doorX + doorW + rnd.range(0.8, Math.max(0.85, w - doorX - doorW - shopW - 0.7)) : rnd.range(0.7, Math.max(0.75, doorX - shopW - 0.8)));
  const shopH = sp.h ?? rnd.range(1.05, 1.3), shopY = sp.y ?? rnd.range(0.8, 1.0);
  // a gate passage (o.passage { w, h }): a through arch front and back instead of door and shop
  const psg = o.passage || null;
  const frontOps = psg ? [{ x: w / 2 - psg.w / 2, y: 0, w: psg.w, h: psg.h, head: 'arch', reveal: T, archDepth: T, jambW: 0.42 }]
    : [{ x: doorX, y: 0, w: doorW, h: doorH, head: doorArch ? 'arch' : 'lintel', reveal: 0.3 }];
  if (!psg && shopW > 0.6) frontOps.push({ x: shopX, y: shopY, w: shopW, h: shopH, head: 'lintel', sill: true, reveal: 0.3 });
  const upperWins = [];
  if (o.allStone) {
    const nw = Math.max(1, Math.round(w / 2.8));
    for (let i = 0; i < nw; i++) { const ww = rnd.range(0.8, 1.0), cx = (w * (i + 0.5)) / nw + rnd.sym(0.2); upperWins.push({ x: cx - ww / 2, y: hs0 + 0.75, w: ww, h: rnd.range(1.05, 1.3), head: 'lintel', sill: true, reveal: 0.3 }); }
    frontOps.push(...upperWins);
  }
  // side walls: a small window, or an opening walled up long ago (its dressed head and jambs still
  // there, the hole filled with smaller rubble set back)
  const sideOps = (L) => {
    const q = rnd();
    if (q < 0.45) return [{ x: L * rnd.range(0.3, 0.6), y: rnd.range(0.95, 1.25), w: rnd.range(0.6, 0.8), h: rnd.range(0.75, 0.95), head: 'lintel', sill: true, reveal: 0.3 }];
    if (q < 0.75) { const ar = rnd() < 0.5; const bw = rnd.range(0.85, 1.1); return [{ x: L * rnd.range(0.25, 0.65), y: 0, w: bw, h: rnd.range(1.9, 2.2) + (ar ? bw / 2 : 0), head: ar ? 'arch' : 'lintel', reveal: 0.3, blocked: true }]; }
    return [];
  };
  const party = o.party || {};
  const leftOps = party.left ? [] : sideOps(d), rightOps = party.right ? [] : sideOps(d);
  const C = courses(rnd, hs, { min: 0.17, max: 0.32 });
  masonryBox(local, frame([0, 0, 0]), {
    w, d, h: hs, T, style: o.style || 'rubble', mat: o.stoneMat || 'stoneGrey', dressedMat: o.stoneMat === 'stoneWashed' ? 'stoneWashed' : 'stoneDressed', mortar: o.stoneMat === 'stoneWashed' ? 'mortarWashed' : 'mortar', lod, seed: rnd() * 1000, courses: C,
    faces: {
      front: { openings: frontOps },
      right: party.right ? { lod: 'low', openings: [] } : { openings: rightOps },
      left: party.left ? { lod: 'low', openings: [] } : { openings: leftOps },
      back: psg ? { openings: [{ x: w / 2 - psg.w / 2, y: 0, w: psg.w, h: psg.h, head: 'arch', reveal: T, archDepth: T, jambW: 0.42 }] } : { lod: lod === 'hero' ? 'mid' : 'low', openings: [] },
    },
  });
  if (psg) {
    // the passage: rubble side walls between the front and back walls, a joisted ceiling at the crown
    const pz = d / 2 - T, L = d - 2 * T, hw = psg.h + 0.15;
    const Cp = courses(rnd, hw, { min: 0.17, max: 0.32 });
    // (the passage is roofed: its walls and ceiling see little sky - shaded by aoMul)
    masonryFace(local, sub(frame([0, 0, 0]), [-psg.w / 2, 0, pz], [0, 0, -1], [0, 1, 0]), L, hw, { courses: Cp, style: o.style || 'rubble', mat: o.stoneMat || 'stoneGrey', dressedMat: 'stoneDressed', mortar: 'mortar', T: 0.5, lod, seed: rnd() * 999, aoMul: 0.55, stains: false });
    masonryFace(local, sub(frame([0, 0, 0]), [psg.w / 2, 0, -pz], [0, 0, 1], [0, 1, 0]), L, hw, { courses: Cp, style: o.style || 'rubble', mat: o.stoneMat || 'stoneGrey', dressedMat: 'stoneDressed', mortar: 'mortar', T: 0.5, lod, seed: rnd() * 999, aoMul: 0.55, stains: false });
    for (let k = 0; k <= Math.round(L / 0.42); k++) {
      const z = -L / 2 + 0.12 + (L - 0.24) * k / Math.round(L / 0.42);
      block(local.get('oakDark'), frame([0, hw + 0.08, z]), psg.w + 0.5, 0.16, 0.13, { r: 0.008, seg: [0.5, 0.16, 0.13], seed: rnd(), noise: 0.002, nf: 3, axis: [1, 0, 0], aoMul: 0.4 });
    }
    block(local.get('oakDark'), frame([0, hw + 0.18, 0]), psg.w + 0.5, 0.04, L + 0.05, { r: 0.002, seg: [1, 0.04, 1], seed: rnd(), aoMul: 0.3 });
    // the passage floor: a threshold of worn flags at each end, a drain channel down the middle,
    // mud and straw in the corners, damp up the wall feet
    for (const zs of [pz + 0.02, -pz - 0.02]) {
      let xx = -psg.w / 2;
      while (xx < psg.w / 2 - 0.05) {
        const fw = Math.min(psg.w / 2 - xx, rnd.range(0.5, 0.9));
        block(local.get('stoneSett'), frame([xx + fw / 2, -0.06, zs - Math.sign(zs) * 0.32], [1, rnd.sym(0.01), 0], [0, 1, rnd.sym(0.01)]), fw - 0.012, 0.13, 0.62, { r: 0.02, rs: 1, seg: [0.1, 0.06, 0.1], seed: rnd(), noise: 0.003, chip: 0.025, skip: 8,
          warp: (lx, ly, lz) => { const gx = xx + fw / 2 + lx; const rut = Math.exp(-((gx - 0.7) ** 2) / 0.015) + Math.exp(-((gx + 0.7) ** 2) / 0.015); return [lx, ly - (ly > 0 ? 0.028 * rut : 0), lz]; } });
        xx += fw;
      }
    }
    for (let k = 0; k < Math.round((L - 1.2) / 0.5); k++) {
      const z = -L / 2 + 0.65 + k * 0.5;
      for (const sx of [-1, 1]) block(local.get('stoneSett'), frame([sx * 0.13, -0.05, z], [1, 0, 0], [0, 1, 0]), 0.14, 0.1, 0.48, { r: 0.015, seg: [0.07, 0.05, 0.12], seed: rnd(), noise: 0.003, chip: 0.02, skip: 8, aoMul: 0.8 });
    }
    for (const sx of [-1, 1]) grimeBand(local, frame([sx * psg.w / 2 * 0.98, 0, -sx * L / 2], [0, 0, sx], [sx, 0, 0]), 0.1, L - 0.1, 0.0, 0.45, rnd, { strength: 0.55, z: 0.012 });
    // the passage walls: a dark band of handling and grime from knee to shoulder height, and the
    // scrapes of cart hubs at 0.6-0.9 m (pale, polished, running along the wall)
    for (const sx of [-1, 1]) {
      const Fw = frame([sx * psg.w / 2, 0, -sx * L / 2], [0, 0, sx], [0, 1, 0]);
      grimeBand(local, Fw, 0.2, L - 0.2, 1.85, 1.3, rnd, { strength: 0.32, z: 0.02 });
      const Fh = frame([sx * psg.w / 2, 0, -sx * L / 2], [0, -1, 0], [0, 0, sx]);
      for (let k = 0; k < 4; k++) stain(local, Fh, -rnd.range(0.62, 0.86), rnd.range(0.4, L - 0.6), rnd.range(0.04, 0.09), rnd.range(0.5, 1.6), 'lime', { strength: 0.35, seed: rnd(), z: 0.02 });
    }
  }
  // glazed side windows in the stone storey (masonryBox faces: right runs front->back, left back->front)
  for (const op of rightOps) if (!op.blocked) { const g = glaze(); windowUnit(local, sub(frame([0, 0, 0]), [w / 2, op.y, d / 2 - op.x], [0, 0, -1], [0, 1, 0]), { w: op.w, h: op.h, inset: 0.16, lights: 2, glazing: g, shutters: shutFor(g), floorBelow: op.y, seed: rnd() * 1000 }); }
  for (const op of leftOps) if (!op.blocked) { const g = glaze(); windowUnit(local, sub(frame([0, 0, 0]), [-w / 2, op.y, -d / 2 + op.x], [0, 0, 1], [0, 1, 0]), { w: op.w, h: op.h, inset: 0.16, lights: 2, glazing: g, shutters: shutFor(g), floorBelow: op.y, seed: rnd() * 1000 }); }
  // door, threshold, shop window in the stone front
  const Ff = sub(frame([0, 0, 0]), [-w / 2, 0, d / 2]);
  if (!psg) {
    const Fd = sub(Ff, [doorX, 0, 0]);
    door(local, Fd, { w: doorW, h: doorH, arch: doorArch, inset: 0.2, open: dr.open ?? (rnd() < 0.3 ? rnd.range(0.3, 0.9) : 0), hingeLeft: rnd() < 0.5, wallT: T, seed: rnd() * 1000 });
    threshold(local, Fd, doorW, 0.35, rnd);
    info.doors.push({ x: -w / 2 + doorX + doorW / 2, z: d / 2, w: doorW, h: doorH });
    for (const uw of upperWins) { const g = glaze(); windowUnit(local, sub(Ff, [uw.x, uw.y, 0]), { w: uw.w, h: uw.h, inset: 0.16, lights: 2, glazing: g, shutters: shutFor(g), floorBelow: 0.9, seed: rnd() * 1000 }); }
    if (shopW > 0.6) {
      // the shop front: unglazed, closed at night by a pair of leaves - the lower let down on chains
      // as the counter, the upper propped up as a hood (open now), or side shutters
      const counter = rnd() < 0.55;
      windowUnit(local, sub(Ff, [shopX, shopY, 0]), { w: shopW, h: shopH, inset: 0.16, lights: Math.max(2, Math.round(shopW / 0.6)), glazing: rich && rnd() < 0.4 ? 'square' : 'none', shutters: counter ? 'none' : rnd() < 0.75 ? 'open' : 'closed', counter, floorBelow: shopY, seed: rnd() * 1000 });
    }
  }
  // ---------------- timber storeys
  let y = hs;
  let front = d / 2;
  // studs 0.6-0.9 m apart (close studding is for the rich), or square panels between posts and rails
  const studs = o.studs ?? (rnd() < 0.5 ? rnd.range(0.62, 0.9) : 0);
  const rail = o.rail ?? (studs ? (rnd() < 0.5 ? 0 : 0.95) : 1.0);
  for (let k = 0; k < n; k++) {
    const Jk = J;
    // jetty joists over the wall below, then the storey's frame from the bressumer up
    jetty(local, sub(frame([0, 0, 0]), [-w / 2, y - 0.18, front]), w, Jk, { seed: rnd() * 1000, mat: oak === 'oak' ? 'oakDark' : 'oak', spacing: rnd.range(0.42, 0.72) });
    // under the overhang the wall stays dry and dirty: dust, cobweb, smoke from the door
    if (k === 0) grimeBand(local, sub(frame([0, 0, 0]), [-w / 2, 0, front]), 0.1, w - 0.1, y - 0.2, rnd.range(0.4, 0.75), rnd, { strength: 0.5 });
    // the floor boards' underside between the joists over the jetty
    block(local.get('oakDark'), frame([0, y + 0.012, front + Jk / 2 - 0.1]), w, 0.024, Jk + 0.2, { r: 0.002, seg: [1, 0.02, 0.2], seed: rnd() });
    front += Jk;
    const dk = front + d / 2;                     // depth of this storey (back wall at -d/2)
    const zc = front - dk / 2;
    const nWin = o.windows ?? Math.max(1, Math.round(w / 2.6) + (rnd() < 0.25 ? -1 : 0));
    const wins = [];
    // window modules vary house to house and storey to storey: a wide main light and a small one,
    // sills and heads at different heights
    const small = nWin > 1 && rnd() < 0.45 ? Math.floor(rnd() * nWin) : -1;
    for (let i = 0; i < nWin; i++) {
      const ww = i === small ? rnd.range(0.55, 0.75) : rnd.range(0.9, 1.6), wh = i === small ? rnd.range(0.7, 0.9) : rnd.range(0.9, 1.25);
      const cx = (w * (i + 0.5)) / nWin + rnd.sym(0.3);
      wins.push({ x: Math.max(0.45, Math.min(w - ww - 0.45, cx - ww / 2)), y: i === small ? rnd.range(1.0, 1.25) : rnd.range(0.8, 1.02), w: ww, h: wh });
    }
    // front
    const FF = sub(frame([0, 0, 0]), [-w / 2, y, front]);
    // (the bressumer of a jetty sags 1-3 cm between its corner posts)
    framedWall(local, FF, w, ht, { studs, rail, windows: wins, lod, seed: rnd() * 1000, mat: oak, plasterSeed: (o.seed ?? 1) * 0.0137 + k * 0.001, sillKit: k === 0 && beamLocal ? beamLocal : undefined, sillBow: -rnd.range(0.01, 0.028) });
    for (const wn of wins) {
      const g = glaze();
      windowUnit(local, sub(FF, [wn.x, wn.y, 0]), { w: wn.w, h: wn.h, inset: 0.05, frame: false, glazing: g, shutters: shutFor(g), floorBelow: wn.y, seed: rnd() * 1000 });
      // casement frames inside the timber opening
      windowCasement(local, sub(FF, [wn.x, wn.y, 0]), wn.w, wn.h, rnd);
      info.windows.push({ storey: k, ...wn });
    }
    // sides (from the back to the front on the left, front to back on the right) and back
    const sideWins = (L) => (rnd() < 0.5 && !(party.left && party.right) ? [{ x: L * rnd.range(0.35, 0.55), y: 0.9, w: rnd.range(0.7, 1.0), h: 1.0 }] : []);
    const sl = party.left ? [] : sideWins(dk);
    const FL = sub(frame([0, 0, 0]), [-w / 2, y, -d / 2], [0, 0, 1], [0, 1, 0]);
    framedWall(local, FL, dk, ht, { studs: studs || 0, rail, windows: sl, cornerL: false, cornerR: false, braces: 'none', lod: party.left ? 'low' : lod, seed: rnd() * 1000, mat: oak, plasterSeed: (o.seed ?? 1) * 0.0137 + k * 0.001 });
    for (const wn of sl) { const g = glaze(); windowUnit(local, sub(FL, [wn.x, wn.y, 0]), { w: wn.w, h: wn.h, inset: 0.05, frame: false, glazing: g, shutters: shutFor(g), floorBelow: wn.y, seed: rnd() * 1000 }); windowCasement(local, sub(FL, [wn.x, wn.y, 0]), wn.w, wn.h, rnd); }
    const sr = party.right ? [] : sideWins(dk);
    const FR = sub(frame([0, 0, 0]), [w / 2, y, front], [0, 0, -1], [0, 1, 0]);
    framedWall(local, FR, dk, ht, { studs: studs || 0, rail, windows: sr, cornerL: false, cornerR: false, braces: 'none', lod: party.right ? 'low' : lod, seed: rnd() * 1000, mat: oak, plasterSeed: (o.seed ?? 1) * 0.0137 + k * 0.001 });
    for (const wn of sr) { const g = glaze(); windowUnit(local, sub(FR, [wn.x, wn.y, 0]), { w: wn.w, h: wn.h, inset: 0.05, frame: false, glazing: g, shutters: shutFor(g), floorBelow: wn.y, seed: rnd() * 1000 }); windowCasement(local, sub(FR, [wn.x, wn.y, 0]), wn.w, wn.h, rnd); }
    const FB = sub(frame([0, 0, 0]), [w / 2, y, -d / 2], [-1, 0, 0], [0, 1, 0]);
    framedWall(local, FB, w, ht, { studs: 0, rail: 1.0, windows: [], lod: lod === 'hero' ? 'mid' : 'low', seed: rnd() * 1000, mat: oak, plasterSeed: (o.seed ?? 1) * 0.0137 });
    // corner brackets under the jetty (curved braces from the stone wall to the bressumer)
    if (k === 0) for (const sx of [-1, 1]) {
      if ((sx < 0 && party.left) || (sx > 0 && party.right)) continue;
      const Fb = frame([sx * (w / 2 - 0.14), 0, 0], [0, 0, 1], [0, 1, 0]);
      member(local, Fb, [d / 2 + 0.02, y - 1.0], [front - 0.08, y - 0.17], 0.2, 0.17, rnd, { mat: oak === 'oak' ? 'oakDark' : 'oak', bow: 0.05 });
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
  let ridgeY, roofInfo, roofY = null;
  if ((o.roof || 'front') === 'front') {
    const rise = (w / 2) * pitch;
    // front and back gables (a small light in the front gable)
    const gw = rnd() < 0.65 ? [{ x: w / 2 - 0.36 + rnd.sym(0.15), y: rise * 0.22, w: 0.62, h: 0.72 }] : [];
    const FG = sub(frame([0, 0, 0]), [-w / 2, y, front]);
    if (o.allStone) {
      masonryGable(local, FG, w, rise, { style: o.style || 'rubble', mat: o.stoneMat || 'stoneGrey', dressedMat: 'stoneDressed', mortar: 'mortar', T, lod, seed: rnd() * 1000 });
      masonryGable(local, sub(frame([0, 0, 0]), [w / 2, y, -d / 2], [-1, 0, 0], [0, 1, 0]), w, rise, { style: o.style || 'rubble', mat: o.stoneMat || 'stoneGrey', dressedMat: 'stoneDressed', mortar: 'mortar', T, lod: 'low', seed: rnd() * 1000 });
      gw.length = 0;
    } else gableFrame(local, FG, w, rise, { lod, seed: rnd() * 1000, mat: oak, windows: gw, plasterSeed: (o.seed ?? 1) * 0.0137 });
    for (const wn of gw) {
      framedOpening(local, FG, wn, oak, rnd, lod);
      { const g = glaze(); windowUnit(local, sub(FG, [wn.x, wn.y, 0]), { w: wn.w, h: wn.h, inset: 0.05, frame: false, glazing: g, shutters: shutFor(g), floorBelow: 0.6, seed: rnd() * 1000 }); }
      windowCasement(local, sub(FG, [wn.x, wn.y, 0]), wn.w, wn.h, rnd);
    }
    if (!o.allStone) gableFrame(local, sub(frame([0, 0, 0]), [w / 2, y, -d / 2], [-1, 0, 0], [0, 1, 0]), w, rise, { lod: 'low', seed: rnd() * 1000, mat: oak, plasterSeed: (o.seed ?? 1) * 0.0137 });
    const RF = frame([0, y, front - dTop / 2], [0, 0, 1], [0, 1, 0]);
    roofInfo = gableRoof(local, RF, { L: dTop, S: w, pitch, eaves: rnd.range(0.35, 0.55), verge: o.allStone ? 0.02 : rnd.range(0.18, 0.32), gableL: !o.allStone, gableR: !o.allStone, cover, lod, seed: rnd() * 1000, damageAt: o.damage, sag: o.sag });
    ridgeY = y + rise;
    { const y0 = y; roofY = (px) => y0 + rise - Math.abs(px) * pitch + 0.085 / Math.cos(Math.atan(pitch)) - 0.035; }
  } else {
    const rise = (dTop / 2) * pitch * 0.85;
    const RF = frame([0, y, front - dTop / 2], [1, 0, 0], [0, 1, 0]);
    roofInfo = gableRoof(local, RF, { L: w, S: dTop, pitch: pitch * 0.85, eaves: rnd.range(0.4, 0.6), verge: party.left || party.right ? 0.12 : 0.35, cover, lod, seed: rnd() * 1000, damageAt: o.damage, sag: o.sag, gableL: true, gableR: true });
    { const y0 = y, zc = front - dTop / 2, p2 = pitch * 0.85; roofY = (px, pz) => y0 + rise - Math.abs(pz - zc) * p2 + 0.085 / Math.cos(Math.atan(p2)) - 0.035; }
    if (o.allStone) {
      masonryGable(local, sub(frame([0, 0, 0]), [-w / 2, y, -d / 2], [0, 0, 1], [0, 1, 0]), dTop, rise, { style: o.style || 'rubble', mat: o.stoneMat || 'stoneGrey', dressedMat: 'stoneDressed', mortar: 'mortar', T, lod: party.left ? 'low' : lod, seed: rnd() * 1000 });
      masonryGable(local, sub(frame([0, 0, 0]), [w / 2, y, front], [0, 0, -1], [0, 1, 0]), dTop, rise, { style: o.style || 'rubble', mat: o.stoneMat || 'stoneGrey', dressedMat: 'stoneDressed', mortar: 'mortar', T, lod: party.right ? 'low' : lod, seed: rnd() * 1000 });
    } else {
      gableFrame(local, sub(frame([0, 0, 0]), [-w / 2, y, -d / 2], [0, 0, 1], [0, 1, 0]), dTop, rise, { lod: party.left ? 'low' : lod, seed: rnd() * 1000, mat: oak, plasterSeed: (o.seed ?? 1) * 0.0137 });
      gableFrame(local, sub(frame([0, 0, 0]), [w / 2, y, front], [0, 0, -1], [0, 1, 0]), dTop, rise, { lod: party.right ? 'low' : lod, seed: rnd() * 1000, mat: oak, plasterSeed: (o.seed ?? 1) * 0.0137 });
    }
    ridgeY = y + rise;
  }
  // ---------------- chimney: a stone stack from the ground storey through the roof
  if (o.chimney !== false && rnd() < (o.chimney ? 1 : 0.75)) {
    const side = o.chimney === 'left' ? -1 : o.chimney === 'right' ? 1 : rnd() < 0.5 ? -1 : 1;
    const cx = side * (o.roof === 'side' ? w * 0.3 : w * 0.18), cz = -d * rnd.range(0.05, 0.25);
    const cw = rnd.range(0.8, 1.0), cd = rnd.range(0.65, 0.8);
    chimney(local, frame([cx, hs - 0.1, cz]), { w: cw, d: cd, h: ridgeY - hs + rnd.range(1.05, 1.45), lod: lod === 'hero' ? 'mid' : lod, seed: rnd() * 1000, pot: rnd() < 0.4 });
    // lead flashings where the stack comes through the tiles: an upstand dressed against each face
    // of the stack along the line of the roof, and an apron lying on the tiles round it
    if (roofY) {
      const x0 = cx - cw / 2, x1 = cx + cw / 2, z0 = cz - cd / 2, z1 = cz + cd / 2;
      for (const [xa, za, xb, zb, n] of [[x0, z0, x1, z0, [0, 0, -1]], [x1, z0, x1, z1, [1, 0, 0]], [x1, z1, x0, z1, [0, 0, 1]], [x0, z1, x0, z0, [-1, 0, 0]]]) {
        const a = [xa, roofY(xa, za), za], b = [xb, roofY(xb, zb), zb];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const X = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        // upstand: vertical in the face plane
        const Yv = norm([-X[0] * X[1], 1 - X[1] * X[1], -X[2] * X[1]]);
        block(local.get('lead'), frame([m[0] + n[0] * 0.006, m[1] + 0.06, m[2] + n[2] * 0.006], X, Yv), L + 0.03, 0.16, 0.006, { r: 0.002, seg: [0.3, 0.16, 0.006], seed: rnd(), noise: 0.002, nf: 9 });
        // apron: lying on the slope beside the face
        const q = [m[0] + n[0] * 0.17, 0, m[2] + n[2] * 0.17]; q[1] = roofY(q[0], q[2]);
        const Zd = norm([q[0] - m[0], q[1] - m[1], q[2] - m[2]]);
        const Ya = norm([Zd[1] * X[2] - Zd[2] * X[1], Zd[2] * X[0] - Zd[0] * X[2], Zd[0] * X[1] - Zd[1] * X[0]]);
        block(local.get('lead'), frame([(m[0] + q[0]) / 2 + Ya[0] * 0.004, (m[1] + q[1]) / 2 + Ya[1] * 0.004 + 0.004, (m[2] + q[2]) / 2 + Ya[2] * 0.004], X, Ya), L + 0.3, 0.008, 0.2, { r: 0.003, seg: [0.2, 0.008, 0.1], seed: rnd(), noise: 0.003, nf: 8 });
      }
    }
  }
  // ---------------- settle: the timber storeys lean a little and twist, the stone stays plumb
  const lean = o.lean ?? [rnd.sym(0.012), rnd.range(0.0, 0.012)];
  const twist = rnd.sym(0.004);
  const settle = (x, yy, z) => {
    const e = Math.max(0, yy - hs);
    return [x + lean[0] * e + twist * z * e * 0.2, yy - Math.abs(lean[0]) * e * 0.02, z + lean[1] * e - twist * x * e * 0.2];
  };
  local.deform(settle);
  kit.merge(local, F);
  if (beamLocal) {
    beamLocal.deform(settle);
    o.beamKit.merge(beamLocal, F);
    info.beam = { a: xf(F, -w / 2, hs + 0.1, d / 2 + J), b: xf(F, w / 2, hs + 0.1, d / 2 + J) };
  }
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
