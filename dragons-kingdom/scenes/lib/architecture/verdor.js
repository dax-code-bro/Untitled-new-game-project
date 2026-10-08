// Architecture kit - Verdor: weathered pale stone (riding grounds, palace, harbour).
//
//   stable(kit, F, o)          the riding-grounds stable hall: ashlar walls with buttresses, a
//                              great arched door (the dragon door), high slit windows, stone
//                              gables with coping, a stone-slate roof with a ridge louvre
//   keeperHouse(kit, F, o)     the ground keepers' lodge at the field edge (the doorway Abby is
//                              helped through): squared rubble, a gable chimney, a door hood
//   accessRig(kit, F, o)       Charcoal's grounded access rig: a braced timber tower on stone
//                              footings, switchback stairs, a railed deck, a hinged gangway
//                              lowered by ropes from a mast onto the dragon's back
//   leafPlatform(kit, F, o)    the movable stable platform brought alongside Leaf (2A)
//   palace(kit, F, o)          the distant palace: keep, hall range, round towers with conical
//                              roofs seated on corbelled parapets, curtain walls, gatehouse
//   harbor(kit, F, o)          the harbour: a quay of big ashlar blocks (wet, weed-grown below
//                              the tide line), weathered steps down to the water, bollards,
//                              rings and fenders, warehouses behind
//
// Frames: origin on the ground at the piece's centre (or as documented), y up.
import { Kit, frame, yawFrame, sub, makeRand, block, tube, xf, sagLine, curve, lathe, grid, norm, cross, strip } from './core.js';
import { masonryBox, masonryFace, masonryGable, courses, roundTower, conicalRoof, steps } from './masonry.js';
import { member, framedWall } from './timber.js';
import { gableRoof, chimney, pentice } from './roof.js';
import { door, windowUnit, threshold, glassQuad } from './openings.js';
import { stain, grimeBand } from './weathering.js';
import { barrel, crate, sack, coil, handcart } from './dressing.js';
import { house } from './house.js';
import { paving } from './cling.js';

// ------------------------------------------------------------------ stable --
/**
 * o: w (long side, 26), d (12), h (wall height, 7.2), door { w, h } (the dragon door, front),
 * bays (buttresses between bays on the long sides), lod, seed, open (0..1 door leaves).
 * Front = +z (the great door). Returns { doorW, doorH, ridge }.
 */
export function stable(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 201);
  const w = o.w ?? 26, d = o.d ?? 12, h = o.h ?? 7.2, T = 0.75;
  const lod = o.lod || 'mid';
  const dw = o.door?.w ?? 5.6, dh = o.door?.h ?? 6.6;
  const bays = o.bays ?? 4;
  const local = new Kit(0);
  const slit = (x, yy = h * 0.55) => ({ x: x - 0.3, y: yy, w: 0.6, h: 1.5, head: 'lintel', sill: true, reveal: 0.4 });
  const frontOps = [{ x: w / 2 - dw / 2, y: 0, w: dw, h: dh, head: 'arch', reveal: T + 0.01, archDepth: T, jambW: 0.5 }];
  const bayW = w / bays;
  for (let i = 0; i < bays; i++) { const cx = bayW * (i + 0.5); if (Math.abs(cx - w / 2) > dw / 2 + 1.2) frontOps.push(slit(cx)); }
  const backOps = []; for (let i = 0; i < bays; i++) backOps.push(slit(bayW * (i + 0.5)));
  // the slits look into the dark stable (a portal at the inner face of each)
  const slitPortals = (Ff, ops) => {
    for (const op of ops) if (op.w < 1) {
      glassQuad(local, Ff, op.x, op.y, op.x + op.w, op.y + op.h, -T + 0.02, { portal: true, W: op.w, H: op.h, floorBelow: op.y, seed: rnd() });
      // iron bars leaded into the sill and head, a cross bar
      for (const fx of [0.33, 0.66]) tube(local.get('iron'), [xf(Ff, op.x + op.w * fx, op.y - 0.02, -0.25), xf(Ff, op.x + op.w * fx, op.y + op.h + 0.02, -0.25)], 0.014, { sides: 6, caps: true });
      tube(local.get('iron'), [xf(Ff, op.x - 0.02, op.y + op.h * 0.5, -0.27), xf(Ff, op.x + op.w + 0.02, op.y + op.h * 0.5, -0.27)], 0.012, { sides: 6, caps: true });
      // the inner shutter, half open
      block(local.get('oakDark'), sub(Ff, [op.x + op.w * 0.5, op.y + op.h / 2, -T + 0.1], [Math.cos(1.1), 0, Math.sin(1.1)], [0, 1, 0]), op.w * 0.95, op.h * 0.96, 0.04, { r: 0.004, seg: [0.2, 0.4, 0.04], seed: rnd(), noise: 0.002, axis: [0, 1, 0] });
    }
  };
  slitPortals(sub(frame([0, 0, 0]), [-w / 2, 0, d / 2]), frontOps);
  slitPortals(sub(frame([0, 0, 0]), [w / 2, 0, -d / 2], [-1, 0, 0], [0, 1, 0]), backOps);
  masonryBox(local, frame([0, 0, 0]), {
    // (round 2: squared stone of mixed course heights and lengths, not a breeze-block grid)
    w, d, h, T, style: 'squared', mat: 'stonePale', dressedMat: 'stonePale', mortar: 'mortarPale', lod, seed: rnd() * 999,
    courseMin: 0.2, courseMax: 0.44, plinth: 0.45, quoin: { long: 0.7, short: 0.42 },
    faces: { front: { openings: frontOps }, back: { openings: backOps, lod: lod === 'hero' ? 'mid' : lod }, left: { openings: [{ x: d / 2 - 0.6, y: 0, w: 1.2, h: 2.3, head: 'lintel', reveal: T }] }, right: {} },
  });
  // buttresses between the bays on both long sides: two stages, each set back at a sloped
  // weathering, bonded into the wall, the upper stage dying into the wall just below the eaves
  for (const side of [1, -1]) {
    for (let i = 1; i < bays; i++) {
      const x = -w / 2 + bayW * i;
      if (side > 0 && Math.abs(x) < dw / 2 + 0.8) continue;
      const Fb = side > 0 ? frame([x, 0, d / 2]) : frame([x, 0, -d / 2], [-1, 0, 0], [0, 1, 0]);
      const h1 = h * 0.45, h2 = h * 0.86;
      const st = [[0, h1, 1.05, 1.15], [h1 + 0.32, h2, 0.92, 0.7]];
      for (const [k, [y0, y1, bw, bd]] of st.entries()) {
        masonryBox(local, sub(Fb, [0, y0, bd / 2]), { w: bw, d: bd, h: y1 - y0, T: Math.min(bw, bd) / 2, style: 'ashlar', mat: 'stonePale', dressedMat: 'stonePale', mortar: 'mortarPale', lod: lod === 'hero' ? 'mid' : lod, seed: rnd() * 999, courseMin: 0.28, courseMax: 0.38, plinth: k === 0 ? 0.45 : 0, quoin: { long: 0.42, short: 0.32 }, faces: { back: { skip: true } } });
        // the weathering: a sloped capstone shedding the water off the stage, set into the wall
        const top = k === 0 ? st[1][3] : 0;
        block(local.get('stonePale'), sub(Fb, [0, y1 + 0.16, (bd + top) / 2 + 0.02]), bw + 0.08, 0.32, bd - top + 0.12, { r: 0.012, rs: 1, seg: [0.2, 0.16, 0.2], seed: rnd(), noise: 0.003, chip: 0.02,
          warp: (lx, ly, lz) => [lx, ly - (ly > 0 ? (lz / (bd - top + 0.12) + 0.5) * 0.3 : 0), lz] });
      }
    }
  }
  // the dragon door: two ledged oak leaves, one standing open; the dim stable beyond
  {
    const Fd = sub(frame([0, 0, 0]), [-dw / 2, 0, d / 2]);
    const r = dw / 2, spring = dh - r;
    const open = o.open ?? 0.55;
    for (const [hinge, hx, ang] of [['left', 0, open * 1.4], ['right', dw, 0.06]]) {
      const lw = dw / 2 - 0.02;
      const s = Math.sin(ang), c = Math.cos(ang);
      const X = hinge === 'left' ? [c, 0, -s] : [c, 0, s];
      const org = hinge === 'left' ? [hx, 0, -T + 0.15] : [hx - c * lw, 0, -T + 0.15 - s * lw];
      const Fl = sub(Fd, org, X, [0, 1, 0]);
      const nb = Math.round(lw / 0.22);
      for (let i = 0; i < nb; i++) {
        const xa = lw * i / nb + 0.003, xb = lw * (i + 1) / nb - 0.003;
        const xm = (xa + xb) / 2;
        const gx = hinge === 'left' ? xm : dw / 2 + xm;
        const top = spring + Math.sqrt(Math.max(0, r * r - (gx - r) ** 2)) - 0.04;
        block(local.get('oakDark'), sub(Fl, [xm, top / 2, 0.035], [0, 1, 0], [-1, 0, 0]), top, xb - xa, 0.07, { r: 0.005, seg: [0.8, 0.2, 0.07], seed: rnd(), noise: 0.002, nf: 3, chip: 0.006 });
      }
      for (const y of [0.6, dh * 0.45, spring - 0.2]) block(local.get('oakDark'), sub(Fl, [lw / 2, y, -0.03]), lw - 0.1, 0.2, 0.06, { r: 0.006, seg: [0.5, 0.2, 0.06], seed: rnd(), noise: 0.002 });
      for (const y of [0.65, spring - 0.15]) block(local.get('iron'), sub(Fl, [hinge === 'left' ? lw * 0.4 : lw * 0.6, y, 0.074], [1, 0, 0], [0, 1, 0]), lw * 0.8, 0.08, 0.01, { r: 0.003, seg: [0.3, 0.08, 0.01], seed: rnd() });
    }
    // before the door: a cobbled apron worn through to the mud in patches, a drain down its middle,
    // puddles in the hollows; dirt splashed along the wall feet
    paving(local, -dw / 2 - 2.6, dw / 2 + 2.6, d / 2 + 0.15, d / 2 + 5.6, { seed: 202, wear: 0.8, puddles: 3,
      skip: (x, z) => ((x / (dw / 2 + 2.6)) ** 2 + ((z - d / 2) / 5.5) ** 2) > 1,
      kennel: [[0.2, d / 2 + 0.3], [0.5, d / 2 + 3.0], [1.4, d / 2 + 5.6]] });
    for (const [x0, z0, X, Y, L] of [[-w / 2, d / 2, [1, 0, 0], [0, 0, -1], w], [w / 2, -d / 2, [-1, 0, 0], [0, 0, 1], w], [w / 2, d / 2, [0, 0, -1], [-1, 0, 0], d], [-w / 2, -d / 2, [0, 0, 1], [1, 0, 0], d]]) grimeBand(local, frame([x0, 0, z0], X, Y), 0.1, L - 0.1, 0.0, 0.7, rnd, { strength: 0.6, z: 0.015 });
    // the stable inside: a deep portal (straw floor, stalls in the dark)
    const pa = local.get('portal');
    const base = pa.vcount;
    for (const [x, y] of [[0, 0], [dw, 0], [dw, dh], [0, dh]]) { const p = xf(Fd, x, y, -T - 0.4); pa.v(p[0], p[1], p[2], x, y, 0.37, 0, 0, dw, dh * 1.6, 0); }
    pa.q(base, base + 1, base + 2, base + 3);
    // straw trodden out of the door
    const acc = local.get('straw');
    for (let i = 0; i < 260; i++) {
      const x = rnd.range(-0.4, dw + 0.4), z = rnd.range(-T, 0.9) * (0.4 + 0.6 * rnd());
      const a = rnd() * Math.PI, l = rnd.range(0.08, 0.25);
      const p0 = xf(Fd, x, 0.012, z), p1 = xf(Fd, x + Math.cos(a) * l, 0.012 + rnd() * 0.01, z + Math.sin(a) * l);
      tube(acc, [p0, p1], 0.0025, { sides: 3, seed: rnd() });
    }
  }
  // stone gables with coping, the roof (stone slates), a ridge louvre
  const pitch = 0.85, rise = (d / 2) * pitch;
  masonryGable(local, sub(frame([0, 0, 0]), [-w / 2, h, -d / 2], [0, 0, 1], [0, 1, 0]), d, rise, { style: 'ashlar', mat: 'stonePale', mortar: 'mortarPale', T, lod, seed: rnd() * 999 });
  masonryGable(local, sub(frame([0, 0, 0]), [w / 2, h, d / 2], [0, 0, -1], [0, 1, 0]), d, rise, { style: 'ashlar', mat: 'stonePale', mortar: 'mortarPale', T, lod, seed: rnd() * 999 });
  gableRoof(local, frame([0, h, 0]), { L: w - 0.3, S: d, pitch, eaves: 0.5, verge: 0.0, gableL: false, gableR: false, cover: 'slate', lod, seed: rnd() * 999, sag: { ridge: 0.11, slope: 0.04, eaves: 0.03, eavesLine: 0.06 }, missing: 0.004 });
  {
    // louvre: a small timber turret on the ridge with slatted sides and its own little roof
    const ry = h + rise + 0.1;
    const lf = frame([w * 0.12, ry, 0]);
    for (const [sx, sz] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) block(local.get('oakDark'), sub(lf, [sx, 0.7, sz]), 0.14, 1.4, 0.14, { r: 0.008, seg: [0.14, 0.5, 0.14], seed: rnd(), noise: 0.002, axis: [0, 1, 0] });
    for (let k = 0; k < 6; k++) for (const [ax, az, len] of [[0, -0.8, 1.6], [0, 0.8, 1.6]]) block(local.get('oak'), sub(lf, [ax, 0.25 + k * 0.2, az], [1, 0, 0], [0, Math.cos(0.6), Math.sin(0.6) * Math.sign(az)]), len, 0.14, 0.02, { r: 0.003, seg: [0.5, 0.14, 0.02], seed: rnd() });
    gableRoof(local, frame([w * 0.12, ry + 1.4, 0]), { L: 1.8, S: 1.8, pitch: 1.0, eaves: 0.25, verge: 0.2, cover: 'slate', lod, seed: rnd() * 999, sag: { ridge: 0.005, slope: 0.003, eaves: 0.004 } });
  }
  kit.merge(local, F);
  return { doorW: dw, doorH: dh, ridge: h + rise, w, d };
}

// ------------------------------------------------------------------ keeper --
/** The ground keepers' lodge: squared pale rubble, a gable chimney, door hood, shutters; front +z. */
export function keeperHouse(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 211);
  const w = o.w ?? 8.5, d = o.d ?? 6.2, h = o.h ?? 3.6, T = 0.6;
  const lod = o.lod || 'mid';
  const local = new Kit(0);
  const doorX = w * 0.42, dw = 1.15, dh = 2.25;
  masonryBox(local, frame([0, 0, 0]), {
    w, d, h, T, style: 'pointed', mat: 'stonePale', dressedMat: 'stonePale', mortar: 'mortarPale', lod, seed: rnd() * 999,
    courseMin: 0.18, courseMax: 0.3, quoin: { long: 0.5, short: 0.3 },
    faces: {
      front: { openings: [{ x: doorX, y: 0, w: dw, h: dh, head: 'lintel', reveal: 0.3 }, { x: 1.1, y: 0.95, w: 0.95, h: 1.1, head: 'lintel', sill: true, reveal: 0.3 }, { x: w - 2.0, y: 0.95, w: 0.95, h: 1.1, head: 'lintel', sill: true, reveal: 0.3 }] },
      left: { openings: [{ x: d / 2 - 0.4, y: 1.0, w: 0.8, h: 0.95, head: 'lintel', sill: true, reveal: 0.3 }] },
      back: { lod: 'low', openings: [] }, right: {},
    },
  });
  const Ff = sub(frame([0, 0, 0]), [-w / 2, 0, d / 2]);
  // the ground at the wall feet: damp, trodden, splashed
  for (const [x0, z0, X, Y, L] of [[-w / 2, d / 2, [1, 0, 0], [0, 0, -1], w], [w / 2, -d / 2, [-1, 0, 0], [0, 0, 1], w], [w / 2, d / 2, [0, 0, -1], [-1, 0, 0], d], [-w / 2, -d / 2, [0, 0, 1], [1, 0, 0], d]]) grimeBand(local, frame([x0, 0, z0], X, Y), 0.1, L - 0.1, 0.0, 0.6, rnd, { strength: 0.55, z: 0.015 });
  door(local, sub(Ff, [doorX, 0, 0]), { w: dw, h: dh, inset: 0.18, open: o.doorOpen ?? 0.6, hingeLeft: true, wallT: T, seed: rnd() * 999 });
  threshold(local, sub(Ff, [doorX, 0, 0]), dw, 0.35, rnd, { mat: 'stonePale' });
  windowUnit(local, sub(Ff, [1.1, 0.95, 0]), { w: 0.95, h: 1.1, inset: 0.16, lights: 2, glazing: 'square', shutters: 'open', floorBelow: 0.95, seed: rnd() * 999 });
  windowUnit(local, sub(Ff, [w - 2.0, 0.95, 0]), { w: 0.95, h: 1.1, inset: 0.16, lights: 2, glazing: 'diamond', shutters: 'half', floorBelow: 0.95, seed: rnd() * 999 });
  windowUnit(local, sub(frame([0, 0, 0]), [-w / 2, 1.0, -0.4], [0, 0, 1], [0, 1, 0]), { w: 0.8, h: 0.95, inset: 0.16, lights: 1, glazing: 'none', shutters: 'closed', seed: rnd() * 999 });
  // a door hood (pentice) on two brackets
  pentice(local, sub(Ff, [doorX + dw / 2, dh + 0.55, 0]), { L: dw + 0.9, depth: 0.75, drop: 0.35, cover: 'slate', seed: rnd() * 999 });
  // stone gables, the left one carrying the chimney stack
  const pitch = 1.0, rise = (d / 2) * pitch;
  masonryGable(local, sub(frame([0, 0, 0]), [-w / 2, h, -d / 2], [0, 0, 1], [0, 1, 0]), d, rise, { style: 'pointed', mat: 'stonePale', mortar: 'mortarPale', T, lod, seed: rnd() * 999 });
  masonryGable(local, sub(frame([0, 0, 0]), [w / 2, h, d / 2], [0, 0, -1], [0, 1, 0]), d, rise, { style: 'pointed', mat: 'stonePale', mortar: 'mortarPale', T, lod, seed: rnd() * 999 });
  gableRoof(local, frame([0, h, 0]), { L: w - 0.2, S: d, pitch, eaves: 0.4, verge: 0.0, gableL: false, gableR: false, cover: 'slate', lod, seed: rnd() * 999 });
  chimney(local, frame([-w / 2 + 0.55, h - 0.2, 0]), { w: 1.0, d: 0.8, h: rise + 1.5, mat: 'stonePale', dressed: 'stonePale', lod: lod === 'hero' ? 'mid' : lod, seed: rnd() * 999 });
  // a lean-to woodshed against the right gable: posts, a slate pent roof, a log pile
  {
    const sx = w / 2 + 1.0;
    for (const z of [d / 2 - 0.3, -d / 2 + 0.3]) member(local, frame([sx + 0.9, 0, 0], [0, 0, 1], [0, 1, 0]), [z, 0], [z, 2.15], 0.15, 0.15, rnd, { mat: 'oakDark' });
    member(local, frame([sx + 0.9, 0, 0], [0, 0, 1], [0, 1, 0]), [-d / 2 + 0.1, 2.2], [d / 2 - 0.1, 2.2], 0.16, 0.15, rnd, { mat: 'oakDark' });
    // a lean-to: the high side against the gable wall, falling away from the house
    gableRoof(local, frame([w / 2 + 0.05, 2.0, 0], [0, 0, 1], [0, 1, 0]), { L: d - 0.4, S: 4.0, pitch: 0.38, eaves: 0.3, verge: 0.2, cover: 'slate', sides: [-1], lod, seed: rnd() * 999, sag: { ridge: 0.02, slope: 0.01, eaves: 0.02 } });
    // the log store: billets of different girth and length, some split (flat faces), stacked by hand
    let zz = -d / 2 + 0.6;
    for (let layer = 0; layer < 6; layer++) {
      zz = -d / 2 + 0.6 + rnd.range(0, 0.15);
      while (zz < d / 2 - 0.6) {
        const dia = rnd.range(0.08, 0.25), len = rnd.range(0.7, 1.05);
        const split = rnd() < 0.45;
        const y = 0.06 + layer * 0.2 + dia / 2 + rnd.sym(0.015), x = sx + 0.2 + rnd.sym(0.08);
        if (split) {
          // a half log: the flat split face up or to one side
          const rot = rnd() * Math.PI;
          block(local.get('oak'), frame([x, y - dia * 0.2, zz + dia / 2], [1, 0, 0], [0, Math.cos(rot), Math.sin(rot)]), len, dia * 0.55, dia, { r: dia * 0.25, rs: 1, seg: [0.3, dia / 2, dia / 3], seed: rnd(), noise: 0.004, nf: 5, chip: 0.012, axis: [1, 0, 0] });
        } else tube(local.get('bark'), [[x - len / 2, y, zz + dia / 2], [x + len / 2, y + rnd.sym(0.02), zz + dia / 2 + rnd.sym(0.02)]], dia / 2, { sides: 10, caps: true, seed: rnd(), capAcc: local.get('oak'), rad: (k) => 1 + 0.05 * Math.sin(k * 2.7 + dia * 40) });
        zz += dia + rnd.range(0.005, 0.03);
      }
    }
    // the chopping block and a few split billets on the ground before it
    tube(local.get('bark'), [[sx + 2.0, 0, -0.6], [sx + 2.0, 0.55, -0.6]], 0.27, { sides: 14, caps: true, seed: rnd(), capAcc: local.get('oak') });
    for (let k = 0; k < 5; k++) { const a = rnd() * 6.28; block(local.get('oak'), frame([sx + 2.0 + Math.cos(a) * 0.7, 0.05, -0.6 + Math.sin(a) * 0.7], [Math.cos(a), 0, Math.sin(a)], [0, 1, 0]), 0.45, 0.08, 0.12, { r: 0.02, seg: [0.2, 0.08, 0.12], seed: rnd(), noise: 0.004, axis: [1, 0, 0] }); }
  }
  kit.merge(local, F);
  return { door: { x: -w / 2 + doorX + dw / 2, z: d / 2, w: dw, h: dh }, w, d };
}

// ------------------------------------------------------------------ access rig --
/**
 * Charcoal's grounded access rig, built the way a 15th-century carpenter would: a framed tower of
 * hewn oak, silvered by the weather (posts with jowled heads, scarfed at mid height, standing on
 * sole plates over rough stone pads sunk in the trodden ground; girts at every storey, curved
 * braces at the storey heads, a long passing brace, every joint pegged, a few rope lashings where
 * the riggers have added to it), a boarded stair with closed risers, newels and a handrail
 * climbing round three sides to a railed deck - and from the deck a railed gangway let down like a
 * drawbridge: hinged at the deck on iron straps, its free end hung on two chains that run up over
 * sheaves at the heads of the two front posts (carried 2.8 m above the deck and braced back to it)
 * and down to a windlass on the deck. A stitched leather bolster on the end that lies on the
 * dragon. No jib, no hanging rope.
 * Deck height: Charcoal's seat is ~9.5-9.9 m above the ground lying down (creature domain, F2
 * pose; scenes/lookdev/architecture-probe.js measures it), so the deck is at 10.6 m and the
 * gangway falls ~0.9 m to land at the saddle. F: base centre of the tower; the gangway reaches +z.
 * o: H, size, gangway (length 6.0), gangwayDrop, lod, seed. Returns { deck, gangwayEnd, height }.
 */
export function accessRig(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 221);
  const H = o.H ?? 10.6, S = o.size ?? 3.4;
  const lod = o.lod || 'mid';
  const local = new Kit(0);
  // weathered silver-grey oak, a member here and there replaced (warmer, browner)
  const oak = (a, b, w, d, extra = {}) => memberW(local, a, b, w, d, rnd, { mat: rnd() < 0.18 ? 'oak' : 'oakSilver', lod, ...extra });
  const pegAt = (p, n) => { for (let i = 0; i < 2; i++) { const o2 = (i - 0.5) * 0.08; tube(local.get('oakPeg'), [[p[0] + (n[2] ? o2 : 0), p[1] + (n[2] ? 0 : o2), p[2] + (n[0] ? o2 : 0)], [p[0] + n[0] * 0.006 + (n[2] ? o2 : 0), p[1] + (n[2] ? 0 : o2), p[2] + n[2] * 0.006 + (n[0] ? o2 : 0)]], 0.015, { sides: 7, caps: true, seed: rnd() }); } };
  const lash = (p, axis, r = 0.17, turns = 7) => {
    // a rope lashing: turns of hemp round a joint
    const pts = [];
    const u = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const A = norm(axis), U = norm(cross(A, u)), V = cross(A, U);
    for (let i = 0; i <= turns * 12; i++) { const a = (i / 12) * Math.PI * 2, t = (i / (turns * 12) - 0.5) * 0.12; pts.push([p[0] + (U[0] * Math.cos(a) + V[0] * Math.sin(a)) * r + A[0] * t, p[1] + (U[1] * Math.cos(a) + V[1] * Math.sin(a)) * r + A[1] * t, p[2] + (U[2] * Math.cos(a) + V[2] * Math.sin(a)) * r + A[2] * t]); }
    tube(local.get('rope'), pts, 0.011, { sides: 5 });
  };
  const bat = (y) => 1 - 0.035 * (y / H);                     // the posts lean in a little (battered tower)
  const posts = [[-S / 2, -S / 2], [S / 2, -S / 2], [S / 2, S / 2], [-S / 2, S / 2]];
  // rough stone pads sunk into the ground (only their tops show), mud splashed up them; sole plates
  for (const [x, z] of posts) block(local.get('stoneGrey'), frame([x, -0.1, z], [Math.cos(rnd.sym(0.15)), rnd.sym(0.02), Math.sin(rnd.sym(0.15))], [0, 1, 0]), 0.86, 0.42, 0.86, { r: 0.04, rs: 1, seg: [0.15, 0.14, 0.15], seed: rnd(), noise: 0.018, nf: 4, chip: 0.04, pillow: 0.02 });
  for (const sz of [-1, 1]) oak([-S / 2 - 0.35, 0.24, sz * S / 2], [S / 2 + 0.35, 0.24, sz * S / 2], 0.28, 0.26, { mat: 'oakDark' });
  // posts with jowled heads, scarfed at mid height (no oak grows 12 m straight)
  const lv = [0.37, H / 3, (2 * H) / 3, H - 0.14];
  const front = (z) => z > 0;
  for (const [x, z] of posts) {
    const top = front(z) ? H + 2.85 : H + 1.15;
    const ys = lv[2] - 0.2;
    oak([x, 0.37, z], [x * bat(ys + 0.5), ys + 0.5, z * bat(ys + 0.5)], 0.3, 0.3, { bow: rnd.sym(0.02) });
    oak([x * bat(ys - 0.45), ys - 0.45, z * bat(ys - 0.45)], [x * bat(top), top, z * bat(top)], 0.29, 0.29, { bow: rnd.sym(0.02), offset: 0.008 });
    // the scarf: pegs through it, two iron bands
    for (const yy of [ys - 0.3, ys + 0.35]) { const q = [x * bat(yy), yy, z * bat(yy)]; tube(local.get('iron'), [[q[0], yy - 0.03, q[2]], [q[0], yy + 0.03, q[2]]], 0.185, { sides: 8 }); }
    for (const [yy, n] of [[ys - 0.12, [Math.sign(x), 0, 0]], [ys + 0.12, [Math.sign(x), 0, 0]], [ys, [0, 0, Math.sign(z)]]]) pegAt([x * bat(yy) + n[0] * 0.15, yy, z * bat(yy) + n[2] * 0.15], n);
    for (const y of lv.slice(1)) block(local.get('oakSilver'), frame([x * bat(y), y - 0.18, z * bat(y)]), 0.36, 0.42, 0.36, { r: 0.015, seg: [0.1, 0.14, 0.1], seed: rnd(), noise: 0.002, axis: [0, 1, 0], warp: (lx, ly, lz) => { const f = (ly / 0.42 + 0.5); const k = 0.82 + 0.18 * f; return [lx * k, ly, lz * k]; } });
  }
  // girts at every storey, curved braces at the storey heads, a passing brace on two faces, pegs
  for (let f = 0; f < 4; f++) {
    const [ax, az] = posts[f], [bx, bz] = posts[(f + 1) % 4];
    const nrm = [Math.sign(ax + bx), 0, Math.sign(az + bz)];
    for (let k = 1; k < lv.length; k++) {
      const y = lv[k], sh = bat(y);
      oak([ax * sh, y, az * sh], [bx * sh, y, bz * sh], 0.24, 0.22, { offset: 0.0, bow: rnd.sym(0.012) });
      pegAt([ax * sh + (bx - ax) * 0.06 + nrm[0] * 0.15, y, az * sh + (bz - az) * 0.06 + nrm[2] * 0.15], nrm);
      pegAt([bx * sh - (bx - ax) * 0.06 + nrm[0] * 0.15, y, bz * sh - (bz - az) * 0.06 + nrm[2] * 0.15], nrm);
      const y0 = y - 1.05, d = 1.0 / S;
      oak([ax * bat(y0), y0, az * bat(y0)], [(ax + (bx - ax) * d) * sh, y - 0.1, (az + (bz - az) * d) * sh], 0.15, 0.13, { bow: -0.07, mat: 'oakSilver' });
      oak([bx * bat(y0), y0, bz * bat(y0)], [(bx + (ax - bx) * d) * sh, y - 0.1, (bz + (az - bz) * d) * sh], 0.15, 0.13, { bow: 0.07, mat: 'oakSilver' });
    }
    if (f % 2 === 0) oak([ax, 0.5, az], [bx * bat(lv[1]), lv[1] - 0.12, bz * bat(lv[1])], 0.16, 0.14, { mat: 'oakDark' });
  }
  // two lashings where the riggers strengthened a brace foot
  lash([-S / 2 * bat(lv[1] - 1.05), lv[1] - 1.0, 0], [0, 0, 1], 0.12, 6);
  lash([S / 2 * bat(lv[2] - 1.05), lv[2] - 1.0, -S / 2 * bat(lv[2])], [1, 0, 0], 0.12, 6);
  // the deck: joists and close boards, rails on three sides (posts, top and mid rail)
  const D = S * bat(H) + 0.6;
  for (let i = 0; i < 7; i++) oak([-D / 2, H - 0.05, -D / 2 + D * (i + 0.5) / 7], [D / 2, H - 0.05, -D / 2 + D * (i + 0.5) / 7], 0.13, 0.17, { mat: 'oakDark' });
  for (let i = 0; i < Math.round(D / 0.24); i++) {
    const x = -D / 2 + 0.12 + i * (D / Math.round(D / 0.24));
    block(local.get(rnd() < 0.3 ? 'oak' : 'oakSilver'), frame([x, H + 0.05, 0], [0, 0, 1], [0, 1, 0]), D + rnd.sym(0.03), 0.045, D / Math.round(D / 0.24) - 0.005, { r: 0.006, seg: [0.5, 0.045, 0.2], seed: rnd(), noise: 0.002, nf: 3, chip: 0.006, axis: [1, 0, 0] });
  }
  const rail = (a, b) => {
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 1.2));
    for (let i = 0; i <= n; i++) { const t = i / n; oak([a[0] + (b[0] - a[0]) * t, a[1], a[2] + (b[2] - a[2]) * t], [a[0] + (b[0] - a[0]) * t, a[1] + 1.1, a[2] + (b[2] - a[2]) * t], 0.1, 0.1); }
    oak([a[0], a[1] + 1.1, a[2]], [b[0], b[1] + 1.1, b[2]], 0.11, 0.09);
    oak([a[0], a[1] + 0.55, a[2]], [b[0], b[1] + 0.55, b[2]], 0.08, 0.06);
  };
  const y0 = H + 0.075;
  rail([-D / 2, y0, -D / 2], [D / 2, y0, -D / 2]);
  rail([-D / 2, y0, -D / 2], [-D / 2, y0, D / 2]);
  rail([D / 2, y0, -D / 2], [D / 2, y0, D / 2 - 1.1]);
  rail([-D / 2, y0, D / 2], [-0.75, y0, D / 2]);
  // the stair: three boarded flights with closed risers round the west, north and east sides
  const flight = (p0, p1, outer) => {
    const dx = p1[0] - p0[0], dz = p1[2] - p0[2], run = Math.hypot(dx, dz), ux = dx / run, uz = dz / run, rise = p1[1] - p0[1];
    const n = Math.max(3, Math.round(rise / 0.21)), gw = 1.05;
    const side = (s2) => [outer[0] * s2 * gw / 2, 0, outer[2] * s2 * gw / 2];
    for (const s2 of [-1, 1]) { const o2 = side(s2); oak([p0[0] + o2[0], p0[1] + 0.05, p0[2] + o2[2]], [p1[0] + o2[0], p1[1] + 0.05, p1[2] + o2[2]], 0.06, 0.3, { mat: 'oakDark' }); }
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const yT = p0[1] + rise * t1, xm = p0[0] + dx * (t0 + t1) / 2, zm = p0[2] + dz * (t0 + t1) / 2;
      const Ft = frame([xm, yT - 0.02, zm], [outer[0], 0, outer[2]], [0, 1, 0]);
      // treads worn hollow in the middle where the boots go
      block(local.get('oakSilver'), Ft, gw - 0.02, 0.04, run / n + 0.03, { r: 0.006, seg: [0.15, 0.04, 0.15], seed: rnd(), noise: 0.0015, axis: [1, 0, 0], warp: (lx, ly, lz) => [lx, ly - (ly > 0 ? 0.006 * Math.exp(-(lx * lx) / 0.06) : 0), lz] });
      const xr = p0[0] + dx * t0, zr = p0[2] + dz * t0;
      block(local.get('oakDark'), frame([xr, yT - rise / n / 2 - 0.02, zr], [outer[0], 0, outer[2]], [0, 1, 0]), gw - 0.06, rise / n, 0.025, { r: 0.003, seg: [0.4, 0.1, 0.025], seed: rnd(), axis: [1, 0, 0] });
    }
    const o2 = side(1);
    const nb = [p0[0] + o2[0] - ux * 0.05, p0[1], p0[2] + o2[2] - uz * 0.05], nt = [p1[0] + o2[0], p1[1], p1[2] + o2[2]];
    oak(nb, [nb[0], nb[1] + 1.15, nb[2]], 0.15, 0.15);
    oak(nt, [nt[0], nt[1] + 1.15, nt[2]], 0.15, 0.15);
    oak([nb[0], nb[1] + 1.0, nb[2]], [nt[0], nt[1] + 1.0, nt[2]], 0.09, 0.07);
    for (let i = 1; i < 4; i++) { const t = i / 4; oak([nb[0] + (nt[0] - nb[0]) * t, nb[1] + rise * t + 0.15, nb[2] + (nt[2] - nb[2]) * t], [nb[0] + (nt[0] - nb[0]) * t, nb[1] + rise * t + 1.0, nb[2] + (nt[2] - nb[2]) * t], 0.06, 0.06); }
  };
  const landing = (x, z, y) => {
    for (let i = 0; i < 6; i++) block(local.get('oakSilver'), frame([x - 0.6 + 0.1 + i * 0.2, y + 0.02, z], [0, 0, 1], [0, 1, 0]), 1.3, 0.045, 0.195, { r: 0.005, seg: [0.5, 0.045, 0.2], seed: rnd(), noise: 0.002, axis: [1, 0, 0] });
    oak([x - 0.6, y - 0.1, z - 0.6], [x + 0.6, y - 0.1, z - 0.6], 0.14, 0.14, { mat: 'oakDark' });
    oak([x - 0.6, y - 0.1, z + 0.6], [x + 0.6, y - 0.1, z + 0.6], 0.14, 0.14, { mat: 'oakDark' });
    const px = x + Math.sign(x) * 0.5, pz = z + Math.sign(z) * 0.5;
    oak([px, 0.12, pz], [px, y - 0.05, pz], 0.2, 0.2);
    block(local.get('stoneGrey'), frame([px, -0.08, pz], [Math.cos(rnd.sym(0.2)), 0, Math.sin(rnd.sym(0.2))], [0, 1, 0]), 0.52, 0.36, 0.52, { r: 0.04, seg: [0.15, 0.12, 0.15], seed: rnd(), noise: 0.014, nf: 4, chip: 0.035, pillow: 0.015 });
  };
  const e = S / 2 + 0.7, y1 = lv[1], y2 = lv[2];
  landing(-e, -e, y1); landing(e, -e, y2);
  flight([-e, 0.0, S / 2 + 3.4], [-e, y1, -e + 0.6], [-1, 0, 0]);
  flight([-e + 0.6, y1, -e], [e - 0.6, y2, -e], [0, 0, -1]);
  flight([e, y2, -e + 0.6], [e, H, D / 2 - 0.1], [1, 0, 0]);
  // a stone at the stair foot to step off from, straw and mud trodden round it
  block(local.get('stoneGrey'), frame([-e, -0.06, S / 2 + 3.75]), 1.1, 0.24, 0.6, { r: 0.04, seg: [0.15, 0.12, 0.15], seed: rnd(), noise: 0.01, nf: 4, chip: 0.03, pillow: 0.01 });
  // the gangway: two stringers, close boards with cleats, rails on both sides; hinged at the deck
  const GL = o.gangway ?? 6.0, drop = o.gangwayDrop ?? 0.9;
  const gz0 = D / 2, gang = Math.asin(Math.min(0.6, drop / GL));
  const gEnd = [0, H + 0.1 - drop, gz0 + Math.cos(gang) * GL];
  const gw = 1.1;
  for (const sx of [-gw / 2, gw / 2]) oak([sx, H + 0.05, gz0 - 0.1], [sx, gEnd[1], gEnd[2]], 0.1, 0.24, { mat: 'oakDark', bow: -0.015 });
  const nb = Math.round(GL / 0.22);
  for (let i = 0; i < nb; i++) {
    const t = (i + 0.5) / nb;
    const y = H + 0.05 + (gEnd[1] - H - 0.05) * t + 0.135, z = gz0 + (gEnd[2] - gz0) * t;
    block(local.get(rnd() < 0.3 ? 'oak' : 'oakSilver'), frame([0, y, z], [1, 0, 0], [0, Math.cos(gang), Math.sin(gang)]), gw + 0.1, 0.04, GL / nb - 0.006, { r: 0.005, seg: [0.5, 0.04, 0.2], seed: rnd(), noise: 0.002, axis: [1, 0, 0] });
    if (i % 2 === 1) block(local.get('oakDark'), frame([0, y + 0.035, z + 0.04]), gw - 0.12, 0.03, 0.04, { r: 0.004, seg: [0.5, 0.03, 0.04], seed: rnd() });
  }
  for (const sx of [-gw / 2 - 0.02, gw / 2 + 0.02]) {
    const np = 5, top = [];
    for (let i = 0; i <= np; i++) { const t = i / np; const y = H + 0.05 + (gEnd[1] - H - 0.05) * t, z = gz0 + (gEnd[2] - gz0) * t; oak([sx, y + 0.15, z], [sx, y + 1.05, z], 0.07, 0.07); top.push([sx, y + 1.05, z]); }
    oak(top[0], top[np], 0.08, 0.06);
    // the hinge: an iron strap from the stringer onto the deck's edge beam, a pin through both
    const hz = gz0 - 0.05;
    block(local.get('iron'), frame([sx, H + 0.12, hz - 0.15], [0, 0, 1], [0, 1, 0]), 0.5, 0.012, 0.07, { r: 0.003, seg: [0.2, 0.012, 0.07], seed: rnd() });
    tube(local.get('iron'), [[sx - 0.09, H + 0.1, hz], [sx + 0.09, H + 0.1, hz]], 0.022, { sides: 8, caps: true });
  }
  // the drawbridge chains: from an iron eye on each stringer near the free end, up over a sheave at
  // the head of each front post, down to the windlass on the deck
  const chain = (a, b, sag) => {
    const n = Math.max(4, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.075));
    const P = sagLine(a, b, sag, n);
    for (let i = 0; i < n; i++) {
      const p = P[i], q = P[i + 1];
      const T = norm([q[0] - p[0], q[1] - p[1], q[2] - p[2]]);
      const side = i % 2 ? norm(cross(T, [0, 1, 0])) : norm(cross(T, cross(T, [0, 1, 0])));
      const ring = [];
      for (let k = 0; k <= 10; k++) {
        const an = (k / 10) * Math.PI * 2;
        const c = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
        const L2 = 0.055, R2 = 0.024;
        ring.push([c[0] + T[0] * Math.cos(an) * L2 + side[0] * Math.sin(an) * R2, c[1] + T[1] * Math.cos(an) * L2 + side[1] * Math.sin(an) * R2, c[2] + T[2] * Math.cos(an) * L2 + side[2] * Math.sin(an) * R2]);
      }
      tube(local.get('iron'), ring, 0.0065, { sides: 5 });
    }
  };
  const wl = [0, H + 0.62, -D / 2 + 0.6];
  for (const sx of [-1, 1]) {
    const pt = [sx * (S / 2) * bat(H + 2.7), H + 2.7, (S / 2) * bat(H + 2.7)];
    // the sheave (a wooden wheel in an iron strap) at the post head
    tube(local.get('oakDark'), [[pt[0] - 0.05, pt[1], pt[2] + 0.2], [pt[0] + 0.05, pt[1], pt[2] + 0.2]], 0.14, { sides: 12, caps: true, seed: rnd() });
    tube(local.get('iron'), [[pt[0] - 0.08, pt[1], pt[2] + 0.2], [pt[0] + 0.08, pt[1], pt[2] + 0.2]], 0.025, { sides: 6, caps: true });
    block(local.get('iron'), frame([pt[0], pt[1] + 0.02, pt[2] + 0.1]), 0.12, 0.012, 0.36, { r: 0.003, seg: [0.12, 0.012, 0.12], seed: rnd() });
    // knee braces from the post's extension back to the deck (no crossbar: two separate posts)
    oak([pt[0], H + 1.7, pt[2] - 0.05], [pt[0], H + 0.15, pt[2] - 1.15], 0.14, 0.13, { mat: 'oakSilver' });
    oak([pt[0] - sx * 0.05, H + 1.6, pt[2]], [pt[0] - sx * 1.0, H + 0.15, pt[2]], 0.14, 0.13, { mat: 'oakSilver' });
    const eye = [sx * (gw / 2 + 0.03), gEnd[1] + 0.3, gEnd[2] - 0.45];
    tube(local.get('iron'), [[eye[0], eye[1] - 0.05, eye[2]], [eye[0] + sx * 0.06, eye[1] - 0.05, eye[2]]], 0.02, { sides: 6, caps: true });
    chain(eye, [pt[0], pt[1] + 0.12, pt[2] + 0.2 + 0.12], 0.05);
    chain([pt[0], pt[1] - 0.05, pt[2] + 0.06], [wl[0] + sx * 0.45, wl[1] + 0.12, wl[2]], 0.03);
  }
  // the windlass on the deck: a drum on two cheeks, a pawl, handspikes; the chains wound on it
  for (const sx of [-0.75, 0.75]) {
    block(local.get('oakSilver'), frame([wl[0] + sx, H + 0.4, wl[2]]), 0.1, 0.62, 0.55, { r: 0.012, seg: [0.1, 0.2, 0.2], seed: rnd(), noise: 0.002, axis: [0, 1, 0], warp: (lx, ly, lz) => [lx, ly, lz * (1 - 0.35 * (ly / 0.62 + 0.5))] });
  }
  tube(local.get('oakSilver'), [[wl[0] - 0.7, wl[1], wl[2]], [wl[0] + 0.7, wl[1], wl[2]]], 0.13, { sides: 10, caps: true, seed: rnd() });
  for (const sx of [-1, 1]) { const pts = []; for (let i = 0; i <= 70; i++) { const a = i * 0.55; pts.push([wl[0] + sx * (0.32 + i * 0.002), wl[1] + Math.sin(a) * 0.15, wl[2] + Math.cos(a) * 0.15]); } tube(local.get('iron'), pts, 0.014, { sides: 5 }); }
  for (const a of [0.4, 2.0, 3.6, 5.2]) tube(local.get('oakDark'), [[wl[0] + 0.62, wl[1], wl[2]], [wl[0] + 0.62, wl[1] + Math.sin(a) * 0.8, wl[2] + Math.cos(a) * 0.8]], 0.028, { sides: 6, caps: true });
  // the bolster: stitched leather over straw, a seam along it, straps round it
  {
    const c = [0, gEnd[1] - 0.02, gEnd[2] + 0.1];
    const pts = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push([c[0] - 0.85 + 1.7 * t, c[1] + 0.008 * Math.sin(t * 9), c[2] + 0.02 * Math.sin(t * 5)]); }
    tube(local.get('leather'), pts, (t) => 0.17 * (0.82 + 0.18 * Math.sin(Math.PI * t)) * (1 + 0.04 * Math.sin(t * 40)), { sides: 14, caps: true, seed: rnd() });
    tube(local.get('leather'), pts.map((p) => [p[0], p[1] + 0.165, p[2] - 0.03]), 0.012, { sides: 5 });
    for (const x of [-0.55, 0, 0.55]) { const ring = []; for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI * 2; ring.push([c[0] + x, c[1] + Math.cos(a) * 0.178, c[2] + Math.sin(a) * 0.178]); } tube(local.get('leather'), ring, 0.012, { sides: 4 }); }
  }
  // coils of rope on the deck and by the stair foot; straw trodden into the mud round the base
  for (const c of [[0.8, H + 0.1, -0.5], [-e - 1.1, 0.03, S / 2 + 2.6]]) {
    const pts = [];
    for (let i = 0; i <= 90; i++) { const a = i * 0.42; const rr = 0.22 + 0.06 * Math.sin(i * 0.37) + 0.002 * i; pts.push([c[0] + Math.cos(a) * rr, c[1] + 0.022 * Math.floor(i / 15), c[2] + Math.sin(a) * rr]); }
    tube(local.get('rope'), pts, 0.016, { sides: 5 });
  }
  {
    const acc = local.get('straw');
    for (let i = 0; i < 700; i++) {
      const near = rnd() < 0.6;
      const x = near ? -e + rnd.sym(1.6) : rnd.sym(S / 2 + 1.5), z = near ? S / 2 + 3.6 + rnd.sym(1.8) : rnd.sym(S / 2 + 1.5);
      const a = rnd() * Math.PI, l = rnd.range(0.05, 0.3);
      const p0 = [x, 0.012, z], p1 = [x + Math.cos(a) * l, 0.012 + rnd() * 0.012, z + Math.sin(a) * l], pm = [(p0[0] + p1[0]) / 2 + rnd.sym(0.02), 0.02, (p0[2] + p1[2]) / 2 + rnd.sym(0.02)];
      tube(acc, [p0, pm, p1], rnd.range(0.0016, 0.003), { sides: 3, seed: rnd() });
    }
  }
  kit.merge(local, F);
  return { deck: [0, H + 0.07, 0], gangwayEnd: gEnd, height: H, stairFoot: [-e, 0, S / 2 + 3.4], windlass: wl };
}

/** A member between two 3D points (helper for free-standing frames). offset: shift along the face normal. */
function memberW(kit, a, b, w, d, rnd, o = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz);
  const X = [dx / L, dy / L, dz / L];
  // choose the member's "face" so its width lies horizontal when possible
  let up = Math.abs(X[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let Z = [X[1] * up[2] - X[2] * up[1], X[2] * up[0] - X[0] * up[2], X[0] * up[1] - X[1] * up[0]];
  const zl = Math.hypot(...Z); Z = Z.map((v) => v / zl);
  const Y = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
  const off = o.offset ?? 0;
  const Fm = frame([a[0] + Z[0] * off, a[1] + Z[1] * off, a[2] + Z[2] * off], X, Y, Z);
  member(kit, Fm, [0, 0], [L, 0], w, d, rnd, { ...o, proud: d / 2 });
}

// ------------------------------------------------------------------ leaf platform --
/**
 * The movable stable platform brought alongside Leaf (2A): a boarded deck on a timber carriage
 * with four spoked, iron-tyred wheels (chocked), a padded leather roll along the side that meets
 * Leaf (+x), a stair with closed treads down the -z end and a handrail on BOTH sides - Abby comes
 * down with only her right arm free: walking down facing out (-z) her right hand is on the +x rail,
 * backing down facing the stair it is on the -x rail. A rail round the far side and end.
 * F: centre of the deck footprint on the ground. Returns { deck, stairFoot, leafSide }.
 */
export function leafPlatform(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 231);
  const H = o.H ?? 1.45, W = o.w ?? 2.4, D = o.d ?? 2.0;
  const local = new Kit(0);
  const oak = (a, b, w, d, extra = {}) => memberW(local, a, b, w, d, rnd, { mat: rnd() < 0.5 ? 'oak' : 'oakSilver', ...extra });
  // wheels as a wheelwright makes them: a turned elm nave on the arm of an oak axle tree, twelve
  // spokes leaning out (the dish), six felloes with a gap at each joint, a dark iron tyre shrunk on;
  // a linchpin through the arm; mud on the lower part of every wheel
  const R = 0.42;
  const wheel = (xc, zc, sx) => {
    // the nave
    lathe(local.get('oakDark'), frame([xc, R, zc], [0, 1, 0], [sx, 0, 0]), [[0.0, -0.17], [0.075, -0.17], [0.095, -0.12], [0.11, -0.03], [0.11, 0.03], [0.095, 0.1], [0.08, 0.15], [0.0, 0.15]], 14, { seed: rnd(), wobble: 0.01 });
    for (const yy of [-0.12, 0.1]) tube(local.get('iron'), [[xc + sx * yy - 0.012, R, zc], [xc + sx * yy + 0.012, R, zc]], 0.1 + (yy > 0 ? -0.012 : 0), { sides: 12 });
    // the linchpin
    tube(local.get('iron'), [[xc + sx * 0.2, R + 0.06, zc], [xc + sx * 0.2, R - 0.06, zc]], 0.009, { sides: 5, caps: true });
    // spokes (dished: the rim stands 5 cm outboard of the nave's middle)
    const ph = rnd() * 0.5;
    for (let k = 0; k < 12; k++) {
      const a = ph + (k / 12) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      tube(local.get('oakSilver'), [[xc, R + sn * 0.1, zc + c * 0.1], [xc + sx * 0.05, R + sn * (R - 0.08), zc + c * (R - 0.08)]], (t) => 0.019 - 0.005 * t, { sides: 6, seed: rnd() });
    }
    // six felloes, a small gap at each joint
    for (let f = 0; f < 6; f++) {
      const a0 = ph + (f / 6) * Math.PI * 2 + 0.012, a1 = ph + ((f + 1) / 6) * Math.PI * 2 - 0.012;
      const ring = [];
      for (let k = 0; k <= 8; k++) { const a = a0 + (a1 - a0) * k / 8; ring.push([xc + sx * 0.05, R + Math.sin(a) * (R - 0.045), zc + Math.cos(a) * (R - 0.045)]); }
      tube(local.get(f % 2 ? 'oakSilver' : 'oak'), ring, 0.042, { sides: 6, seed: rnd(), up: [1, 0, 0] });
    }
    // the tyre: a flat dark iron band
    const tyre = [];
    for (let k = 0; k <= 36; k++) { const a = (k / 36) * Math.PI * 2; tyre.push([xc + sx * 0.05, R + Math.sin(a) * (R - 0.004), zc + Math.cos(a) * (R - 0.004)]); }
    strip(local.get('iron'), tyre, 0.012, 0.075, { up: [1, 0, 0] });
    // mud caked on the lower part of the wheel
    for (let k = 0; k < 14; k++) {
      const a = -Math.PI / 2 + rnd.sym(1.1);
      block(local.get('mud'), frame([xc + sx * 0.05 + rnd.sym(0.03), R + Math.sin(a) * (R - 0.03), zc + Math.cos(a) * (R - 0.03)], [0, -Math.sin(a), -Math.cos(a)], [0, Math.cos(a), -Math.sin(a)]), rnd.range(0.05, 0.12), 0.03, 0.09, { r: 0.012, rs: 1, seg: [0.05, 0.03, 0.05], seed: rnd(), noise: 0.006, nf: 30 });
    }
  };
  for (const sz of [-1, 1]) {
    const zc = sz * (D / 2 - 0.4);
    // the axle tree: an oak beam right across under the carriage, its arms running into the naves
    oak([-W / 2 - 0.16, R, zc], [W / 2 + 0.16, R, zc], 0.15, 0.15, { mat: 'oakDark', bow: 0.0 });
    for (const sx of [-1, 1]) tube(local.get('iron'), [[sx * (W / 2 + 0.1), R, zc], [sx * (W / 2 + 0.4), R, zc]], 0.04, { sides: 8, caps: true });
    // bolsters on the axle tree carrying the side beams
    for (const sx of [-1, 1]) block(local.get('oakDark'), frame([sx * (W / 2 - 0.12), R + 0.13, zc]), 0.22, 0.12, 0.2, { r: 0.012, seg: [0.1, 0.06, 0.1], seed: rnd(), noise: 0.002 });
    for (const sx of [-1, 1]) wheel(sx * (W / 2 + 0.3), zc, sx);
    // chocks under the near wheels
    if (sz < 0) for (const sx of [-1, 1]) block(local.get('oakDark'), frame([sx * (W / 2 + 0.35), 0.06, zc - R - 0.02]), 0.12, 0.12, 0.2, { r: 0.006, seg: [0.12, 0.12, 0.2], seed: rnd(), warp: (lx, ly, lz) => [lx, ly - (ly > 0 ? (0.5 - lz / 0.2) * 0.07 : 0), lz] });
  }
  // carriage: side beams, cross beams, posts with braces, the deck
  for (const sx of [-1, 1]) oak([sx * (W / 2 - 0.12), R + 0.29, -D / 2 - 0.1], [sx * (W / 2 - 0.12), R + 0.29, D / 2 + 0.1], 0.2, 0.18, { mat: 'oakDark' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    oak([sx * (W / 2 - 0.12), R + 0.37, sz * (D / 2 - 0.08)], [sx * (W / 2 - 0.12), H - 0.05, sz * (D / 2 - 0.08)], 0.15, 0.15);
    oak([sx * (W / 2 - 0.12), R + 0.4, sz * (D / 2 - 0.55)], [sx * (W / 2 - 0.12), H - 0.2, sz * (D / 2 - 0.1)], 0.09, 0.08, { mat: 'oakDark' });
  }
  for (const sz of [-1, 1]) oak([-W / 2, H - 0.1, sz * (D / 2 - 0.08)], [W / 2, H - 0.1, sz * (D / 2 - 0.08)], 0.16, 0.14, { mat: 'oakDark' });
  for (let i = 0; i < Math.round(W / 0.2); i++) block(local.get('oak'), frame([-W / 2 + 0.1 + i * (W / Math.round(W / 0.2)), H + 0.03, 0], [0, 0, 1], [0, 1, 0]), D + 0.1, 0.045, W / Math.round(W / 0.2) - 0.006, { r: 0.004, seg: [0.5, 0.045, 0.2], seed: rnd(), noise: 0.002 });
  // the padded roll on the side that meets Leaf (+x): leather over straw, nailed down
  {
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([W / 2 + 0.06, H + 0.1 + 0.01 * Math.sin(t * 7), -D / 2 - 0.02 + (D + 0.04) * t]); }
    tube(local.get('leather'), pts, 0.11, { sides: 12, caps: true, seed: rnd() });
    for (let i = 1; i < 6; i++) tube(local.get('iron'), [[W / 2 - 0.02, H + 0.1, -D / 2 + D * i / 6], [W / 2 - 0.05, H + 0.1, -D / 2 + D * i / 6]], 0.012, { sides: 5, caps: true });
  }
  // the rail round the far side (-x) and the +z end
  const railLine = (a, b) => {
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.9));
    for (let i = 0; i <= n; i++) { const t = i / n; oak([a[0] + (b[0] - a[0]) * t, H + 0.05, a[2] + (b[2] - a[2]) * t], [a[0] + (b[0] - a[0]) * t, H + 1.0, a[2] + (b[2] - a[2]) * t], 0.08, 0.08); }
    oak([a[0], H + 1.0, a[2]], [b[0], H + 1.0, b[2]], 0.09, 0.07);
  };
  railLine([-W / 2 + 0.05, 0, -D / 2 + 0.05], [-W / 2 + 0.05, 0, D / 2 - 0.05]);
  railLine([-W / 2 + 0.05, 0, D / 2 - 0.05], [W / 2 - 0.3, 0, D / 2 - 0.05]);
  // the stair down the -z end: two strings, closed treads, newels and a handrail on both sides
  const sw = 1.0, n = 6, going = 0.27, run = n * going;
  for (const sx of [-1, 1]) oak([sx * sw / 2, 0.02, -D / 2 - run], [sx * sw / 2, H + 0.02, -D / 2], 0.06, 0.26, { mat: 'oakDark' });
  for (let i = 1; i <= n; i++) {
    const y = (H * i) / (n + 1), z = -D / 2 - run + going * (i - 0.5) * (run / (going * n));
    block(local.get('oak'), frame([0, y + 0.02, z]), sw + 0.04, 0.045, going + 0.03, { r: 0.004, seg: [0.4, 0.045, 0.15], seed: rnd(), noise: 0.002, warp: (lx, ly, lz) => [lx, ly - (ly > 0 ? 0.008 * Math.exp(-(lx * lx) / 0.04) : 0), lz] });
  }
  for (const sx of [-1, 1]) {
    const xr = sx * (sw / 2 + 0.06);
    oak([xr, 0.0, -D / 2 - run - 0.02], [xr, 1.0, -D / 2 - run - 0.02], 0.1, 0.1);
    oak([xr, H, -D / 2 + 0.02], [xr, H + 1.0, -D / 2 + 0.02], 0.1, 0.1);
    oak([xr, 0.95, -D / 2 - run - 0.02], [xr, H + 0.95, -D / 2 + 0.02], 0.08, 0.06);
  }
  // the draw bar, unhitched, resting on the ground
  oak([0, R + 0.1, D / 2 + 0.05], [0.15, 0.08, D / 2 + 1.7], 0.09, 0.09, { mat: 'oakDark' });
  oak([-0.35, 0.1, D / 2 + 1.6], [0.6, 0.1, D / 2 + 1.75], 0.06, 0.06, { mat: 'oakDark' });
  kit.merge(local, F);
  return { deck: xf(F, 0, H, 0), stairFoot: xf(F, 0, 0, -D / 2 - run - 0.4), leafSide: xf(F, W / 2 + 0.2, H, 0) };
}

// ------------------------------------------------------------------ palace --
/**
 * The distant palace (silhouette scale, PROVISIONAL): grown over generations, not drawn with a
 * ruler - a tall keep with rows of windows and a stair turret, a great hall range with tall
 * windows and chimney stacks, a chapel with a bellcote, lower ranges leaning on the curtain, two
 * round towers (battered bases, string courses, bell-cast cones) and two square towers with
 * saddleback roofs at the corners, a crenellated curtain with a gatehouse. F: the centre of the
 * inner ward at ground level (bury its base a metre or two in the terrain). o: lod ('far'), seed.
 */
export function palace(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 241);
  const lod = o.lod || 'far';
  const local = new Kit(0);
  const stoneM = lod === 'far' ? 'stoneFar' : 'stonePale';
  const plain = { style: 'ashlar', mat: stoneM, dressedMat: stoneM, mortar: 'mortarPale', lod };
  // (the masonry starts 2 m under the frame's ground: the base is buried in the hill)
  const sink = 2.0;
  const box = (x, z, w, d, h, yaw, ops = {}) => {
    const fr = yawFrame([x, -sink, z], yaw);
    masonryBox(local, fr, { w, d, h: h + sink, T: 1.2, ...plain, seed: rnd() * 999, courseMin: 0.38, courseMax: 0.55, plinth: 0.8, quoin: { long: 1.0, short: 0.6 }, portals: true, ...ops });
    return sub(fr, [0, sink, 0]);
  };
  const lift = (ops) => ops.map((op) => ({ ...op, y: op.y + sink }));
  const wins = (n, L, y, w = 1.1, hh = 2.2, head = 'arch') => Array.from({ length: n }, (_, i) => ({ x: L * (i + 0.5) / n - w / 2 + rnd.sym(0.3), y, w, h: hh, head, sill: true, reveal: 0.6 }));
  // the keep: three storeys of windows over a slit-lit base, a steep slate roof between stone
  // gables, chimneys, a stair turret on its north-east corner rising above it
  {
    const w = 20, d = 15, h = 24;
    const front = [...wins(3, w, 5 + sink, 0.5, 1.6, 'lintel'), ...wins(4, w, 11 + sink), ...wins(4, w, 16.5 + sink, 1.2, 2.4)];
    const fr = box(0, -6, w, d, h, 0, { faces: { front: { openings: front }, left: { openings: lift(wins(2, d, 15)) }, right: { openings: lift(wins(2, d, 15)) }, back: { openings: lift(wins(4, w, 16)) } } });
    const rise = (d / 2) * 1.1;
    masonryGable(local, sub(fr, [-w / 2, h, -d / 2], [0, 0, 1], [0, 1, 0]), d, rise, { ...plain, T: 1.2, seed: rnd() * 999, courseMin: 0.38, courseMax: 0.55 });
    masonryGable(local, sub(fr, [w / 2, h, d / 2], [0, 0, -1], [0, 1, 0]), d, rise, { ...plain, T: 1.2, seed: rnd() * 999, courseMin: 0.38, courseMax: 0.55 });
    gableRoof(local, sub(fr, [0, h, 0]), { L: w - 0.6, S: d, pitch: 1.1, eaves: 0.6, verge: 0, gableL: false, gableR: false, cover: 'slate', lod, seed: rnd() * 999, sag: { ridge: 0.06, slope: 0.03, eaves: 0.03 } });
    chimney(local, sub(fr, [-w * 0.25, h - 0.5, -d * 0.1]), { w: 1.2, d: 1.0, h: rise + 2.2, mat: stoneM, dressed: stoneM, lod, seed: rnd() * 999 });
    chimney(local, sub(fr, [w * 0.3, h - 0.5, d * 0.12]), { w: 1.2, d: 1.0, h: rise + 2.0, mat: stoneM, dressed: stoneM, lod, seed: rnd() * 999 });
    const tt = roundTower(local, sub(fr, [w / 2 + 0.8, -sink, -d / 2 - 0.8]), { r: 2.6, h: h + 6 + sink, lod, seed: rnd() * 999, slits: 4, mat: stoneM, dressedMat: stoneM, corbel: false });
    conicalRoof(local, sub(fr, [w / 2 + 0.8, h + 6 - 0.2, -d / 2 - 0.8]), { r: 2.75, h: 5.5, eaves: 0.3, seed: rnd() * 999, slateScale: lod === 'far' ? 1.6 : 1, flare: 0.12 });
    void tt;
  }
  // the great hall range along the east side: tall windows to the ward, chimney stacks on its back
  {
    const w = 34, d = 13, h = 13;
    const front = lift(wins(6, w, 4.6, 1.5, 4.6));
    const fr = box(24, 10, w, d, h, Math.PI / 2, { faces: { front: { openings: front }, back: { openings: lift(wins(5, w, 6, 1.0, 2.6)) } } });
    const rise = (d / 2) * 0.95;
    masonryGable(local, sub(fr, [-w / 2, h, -d / 2], [0, 0, 1], [0, 1, 0]), d, rise, { ...plain, T: 1.0, seed: rnd() * 999, courseMin: 0.38, courseMax: 0.55 });
    masonryGable(local, sub(fr, [w / 2, h, d / 2], [0, 0, -1], [0, 1, 0]), d, rise, { ...plain, T: 1.0, seed: rnd() * 999, courseMin: 0.38, courseMax: 0.55 });
    gableRoof(local, sub(fr, [0, h, 0]), { L: w - 0.6, S: d, pitch: 0.95, eaves: 0.6, verge: 0, gableL: false, gableR: false, cover: 'slate', lod, seed: rnd() * 999, sag: { ridge: 0.12, slope: 0.04, eaves: 0.04 } });
    for (const fx of [-0.28, 0.12]) chimney(local, sub(fr, [w * fx, h - 0.6, -d / 2 + 0.6]), { w: 1.6, d: 1.1, h: rise + 2.6, mat: stoneM, dressed: stoneM, lod, seed: rnd() * 999 });
  }
  // the chapel: tall and narrow, a steep roof, a bellcote on its west gable, a big east window
  {
    const w = 14, d = 7.5, h = 9;
    const fr = box(-11, 10, w, d, h, 0.0, { faces: { front: { openings: lift(wins(3, w, 3.2, 1.0, 3.6)) }, right: { openings: lift([{ x: d / 2 - 1.0, y: 2.8, w: 2.0, h: 4.6, head: 'arch', sill: true, reveal: 0.6 }]) } } });
    const rise = (d / 2) * 1.45;
    masonryGable(local, sub(fr, [-w / 2, h, -d / 2], [0, 0, 1], [0, 1, 0]), d, rise, { ...plain, T: 1.0, seed: rnd() * 999 });
    masonryGable(local, sub(fr, [w / 2, h, d / 2], [0, 0, -1], [0, 1, 0]), d, rise, { ...plain, T: 1.0, seed: rnd() * 999 });
    gableRoof(local, sub(fr, [0, h, 0]), { L: w - 0.5, S: d, pitch: 1.45, eaves: 0.5, verge: 0, gableL: false, gableR: false, cover: 'slate', lod, seed: rnd() * 999 });
    masonryBox(local, sub(fr, [-w / 2 + 0.2, h + rise - 0.6, 0]), { w: 1.0, d: 1.4, h: 2.6, T: 0.4, ...plain, seed: rnd() * 999, courseMin: 0.35, courseMax: 0.5, faces: { left: { openings: [{ x: 0.35, y: 1.0, w: 0.7, h: 1.2, head: 'arch', reveal: 0.3 }] } } });
    gableRoof(local, sub(fr, [-w / 2 + 0.2, h + rise + 2.0, 0], [0, 0, 1], [0, 1, 0]), { L: 1.5, S: 1.1, pitch: 1.2, eaves: 0.15, verge: 0.15, cover: 'slate', lod, seed: rnd() * 999 });
  }
  // lower ranges leaning on the inside of the west and north curtains (stores, stables, kitchens)
  for (const [x, z, L, yaw] of [[-26.5, 0, 34, Math.PI / 2], [0, -24.2, 30, 0]]) {
    const fr = box(x, z, L, 6, 6.5, yaw, { faces: { back: { skip: true }, front: { openings: lift(wins(Math.round(L / 6), L, 2.2, 0.9, 1.4, 'lintel')) } } });
    gableRoof(local, sub(fr, [0, 6.5, -3.0]), { L: L, S: 6, pitch: 0.55, eaves: 0.4, verge: 0.2, sides: [1], cover: 'slate', lod, seed: rnd() * 999 });
  }
  // the corner towers: two round (battered, a string course, windows high up, bell-cast cones) and
  // two square (crenellated, a saddleback roof between stone gables)
  const corners = [[-30, -28], [34, -26], [36, 30], [-32, 28]];
  for (const [ci, [x, z]] of corners.entries()) {
    const hh = rnd.range(20, 26);
    if (ci % 2 === 0) {
      const R = rnd.range(4.6, 5.4);
      const t = roundTower(local, frame([x, -sink, z]), { r: R, h: hh + sink, lod, seed: rnd() * 999, slits: 3, mat: stoneM, dressedMat: stoneM, batter: 0.9, batterH: 5 + sink, strings: [sink + hh * 0.45], windows: [{ a: rnd() * 6.28, y0: sink + hh * 0.62, w: 0.8, h: 1.6 }, { a: rnd() * 6.28, y0: sink + hh * 0.75, w: 0.8, h: 1.6 }] });
      conicalRoof(local, frame([x, t.top - sink - 0.2, z]), { r: t.R - 0.15, h: R * rnd.range(1.5, 2.1), eaves: 0.45, seed: rnd() * 999, slateScale: lod === 'far' ? 1.8 : 1, flare: 0.16 });
    } else {
      const S = rnd.range(8, 9.5);
      const fr = box(x, z, S, S, hh, rnd.sym(0.1), { quoin: { long: 1.1, short: 0.7 }, faces: { front: { openings: lift(wins(1, S, hh * 0.55, 0.9, 1.8)) }, left: { openings: lift(wins(1, S, hh * 0.7, 0.9, 1.8)) }, right: { openings: lift(wins(1, S, hh * 0.4, 0.5, 1.4, 'lintel')) }, back: { openings: lift(wins(1, S, hh * 0.65, 0.9, 1.8)) } } });
      const rise = (S / 2) * 1.2;
      masonryGable(local, sub(fr, [-S / 2, hh, -S / 2], [0, 0, 1], [0, 1, 0]), S, rise, { ...plain, T: 1.0, seed: rnd() * 999 });
      masonryGable(local, sub(fr, [S / 2, hh, S / 2], [0, 0, -1], [0, 1, 0]), S, rise, { ...plain, T: 1.0, seed: rnd() * 999 });
      gableRoof(local, sub(fr, [0, hh, 0]), { L: S - 0.4, S, pitch: 1.2, eaves: 0.35, verge: 0, gableL: false, gableR: false, cover: 'slate', lod, seed: rnd() * 999 });
    }
  }
  // curtain walls between the towers: a wall walk behind a crenellated parapet
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
    const L = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(-(bz - az), bx - ax);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const fr0 = yawFrame([mx, -sink, mz], yaw + Math.PI);      // front face outward
    const fr = sub(fr0, [0, sink, 0]);
    const Lw = L - 10;
    const gate = i === 3;
    masonryFace(local, sub(fr0, [-Lw / 2, 0, 1.4]), Lw, 12.5 + sink, { style: 'squared', mat: stoneM, dressedMat: stoneM, mortar: 'mortarPale', T: 2.8, lod, seed: rnd() * 999, back: true, openings: gate ? [{ x: Lw / 2 - 2.5, y: sink, w: 5, h: 7.2, head: 'arch', reveal: 1.5, archDepth: 2.83 }] : [] });
    masonryFace(local, sub(fr0, [Lw / 2, 0, -1.4], [-1, 0, 0], [0, 1, 0]), Lw, 11.0 + sink, { style: 'squared', mat: stoneM, dressedMat: stoneM, mortar: 'mortarPale', T: 2.8, lod, seed: rnd() * 999, openings: gate ? [{ x: Lw / 2 - 2.5, y: sink, w: 5, h: 7.2, head: 'archOpen', reveal: 1.5 }] : [] });
    const nm = Math.floor(Lw / 2.4);
    for (let k = 0; k < nm; k++) {
      const x0 = -Lw / 2 + (Lw * k) / nm + 0.35, mw = Lw / nm - 0.9 + rnd.sym(0.15);
      masonryFace(local, sub(fr, [x0, 12.5, 1.4]), mw, 1.35 + rnd.sym(0.08), { style: 'squared', mat: stoneM, dressedMat: stoneM, mortar: 'mortarPale', T: 0.7, lod, seed: rnd() * 999, back: true, courseMin: 0.4, courseMax: 0.5 });
      block(local.get(stoneM), sub(fr, [x0 + mw / 2, 13.92, 1.05]), mw + 0.12, 0.16, 0.82, { r: 0.02, seg: [0.5, 0.16, 0.4], seed: rnd(), noise: 0.004, warp: (lx, ly, lz) => [lx, ly + (ly > 0 ? 0.05 * (1 - Math.abs(lz) / 0.41) : 0), lz] });
    }
    block(local.get(stoneM), sub(fr, [0, 12.42, 0.6]), Lw, 0.2, 1.9, { r: 0.02, seg: [2, 0.2, 0.5], seed: rnd(), noise: 0.003 });
    if (gate) {
      for (const sx of [-1, 1]) {
        const t = roundTower(local, sub(fr0, [sx * 4.6, 0, 3.0]), { r: 3.0, h: 15.5 + sink, lod, seed: rnd() * 999, slits: 2, mat: stoneM, dressedMat: stoneM, batter: 0.5, batterH: 3 + sink });
        conicalRoof(local, sub(fr0, [sx * 4.6, t.top - 0.2, 3.0]), { r: t.R - 0.12, h: 5.2, eaves: 0.35, seed: rnd() * 999, slateScale: lod === 'far' ? 1.8 : 1 });
      }
      masonryBox(local, sub(fr, [0, 7.6, 1.3]), { w: 6.4, d: 4.6, h: 6.4, T: 1.0, ...plain, seed: rnd() * 999, courseMin: 0.38, courseMax: 0.5, quoin: { long: 0.8, short: 0.5 }, faces: { front: { openings: [{ x: 2.6, y: 2.4, w: 1.2, h: 1.9, head: 'arch', sill: true, reveal: 0.6 }] } } });
      gableRoof(local, sub(fr, [0, 14.0, 1.3]), { L: 6.4, S: 4.6, pitch: 1.0, eaves: 0.4, verge: 0.3, cover: 'slate', lod, seed: rnd() * 999 });
    }
  }
  kit.merge(local, F);
}

// ------------------------------------------------------------------ harbour --
/**
 * Verdor harbour. F: on the water line at the quay face's centre; the sea toward +z, the town
 * toward -z. o: L (quay length, 46), H (quay top above the water, 2.8), lod, seed, buildings.
 * The tide line: courses below +1.1 m use the wet, weed-grown stone. Returns { stepsAt, top }.
 */
export function harbor(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 251);
  const L = o.L ?? 46, H = o.H ?? 2.8, base = -2.4;
  const lod = o.lod || 'mid';
  const local = new Kit(0);
  local.setBase(base);
  // the quay face: big ashlar courses from the sea bed to the coping (tide zones in the material)
  const stepsX = o.stepsX ?? -L * 0.18, stepsW = 1.7, rise = 0.24, run = 0.36;
  const stepsN = Math.round((H - 0.1) / rise) + 3;                 // the lowest three under the water
  const stepsLen = stepsN * run;
  masonryFace(local, sub(frame([0, 0, 0]), [-L / 2, base, 0]), L, H - 0.4 - base, { courses: courses(rnd, H - 0.4 - base, { min: 0.42, max: 0.6 }), style: 'ashlar', mat: 'stoneQuay', dressedMat: 'stoneQuay', mortar: 'mortarPale', T: 3, lod, seed: rnd() * 999, depth: [0.4, 0.7] });
  // coping: big rounded slabs along the edge, a worn edge, rope grooves here and there
  for (let x = -L / 2; x < L / 2 - 0.1;) {
    const len = Math.min(rnd.range(1.0, 1.7), L / 2 - x);
    const groove = rnd() < 0.3 ? rnd.sym(len * 0.3) : 99;
    block(local.get('stoneQuay'), frame([x + len / 2, H - 0.2, -0.45]), len - 0.01, 0.4, 1.1, {
      r: 0.06, rs: 1, seg: [0.15, 0.2, 0.2], seed: rnd(), noise: 0.005, nf: 4, chip: 0.02, pillow: 0.005,
      warp: (lx, ly, lz) => [lx, ly - (lz > 0.3 && ly > 0 ? (lz - 0.3) * 0.15 : 0) - (lz > 0.35 ? 0.03 * Math.exp(-((lx - groove) ** 2) / 0.004) : 0), lz],
    });
    x += len;
  }
  // (o.hinterland: the built-up ground behind the quay, as deep as asked - packed earth at quay level)
  if (o.hinterland) block(local.get('earth'), frame([0, (H - 0.14 + base) / 2, -8 - o.hinterland / 2]), L + 40, H - 0.14 - base, o.hinterland, { r: 0, seg: 99, seed: rnd(), skip: 8 });
  // quay paving behind the coping
  for (let z = -1.0; z > -8; z -= 0.75) for (let x = -L / 2; x < L / 2 - 0.1;) {
    const len = Math.min(rnd.range(0.7, 1.3), L / 2 - x);
    block(local.get('stonePale'), frame([x + len / 2, H - 0.07 + rnd.sym(0.008), z - 0.37]), len - 0.012, 0.14, 0.73, { r: 0.012, seg: [0.5, 0.14, 0.4], seed: rnd(), noise: 0.003, nf: 5, chip: 0.01, skip: 8 });
    x += len;
  }
  // the landing steps: a solid stone stair built against the quay face, running down along it into
  // the water - its outer face and its low end are walls from the sea bed, the treads big dressed
  // slabs with worn, rounded nosings, slimy below the tide line
  {
    const topAt = (x) => { const i = Math.floor((x - stepsX) / run); return i < 0 ? H : H - rise * (i + 1) - 0.2; };   // under each tread
    const Fo = sub(frame([0, 0, 0]), [stepsX, base, stepsW]);
    masonryFace(local, Fo, stepsLen, H - base, { courses: courses(rnd, H - base, { min: 0.36, max: 0.52 }), style: 'squared', mat: 'stoneQuay', dressedMat: 'stoneQuay', mortar: 'mortarPale', T: stepsW, lod, seed: rnd() * 999, depth: [0.3, 0.5], clipTop: (x) => topAt(x + stepsX) - base });
    // the low end
    const yEnd = H - rise * stepsN - 0.2;
    masonryFace(local, sub(frame([0, 0, 0]), [stepsX + stepsLen, base, stepsW], [0, 0, -1], [0, 1, 0]), stepsW, yEnd - base, { style: 'squared', mat: 'stoneQuay', dressedMat: 'stoneQuay', mortar: 'mortarPale', T: 1, lod, seed: rnd() * 999, depth: [0.3, 0.5] });
    for (let i = 0; i < stepsN; i++) {
      const y = H - rise * (i + 1);
      const x0 = stepsX + i * run;
      const len = i === stepsN - 1 ? run : run + 0.12;
      block(local.get('stoneQuay'), frame([x0 + len / 2, y - 0.1, stepsW / 2 + 0.015]), len, 0.2, stepsW + 0.03, {
        r: 0.025, rs: 1, seg: [0.12, 0.1, 0.25], seed: rnd(), noise: 0.004, nf: 5, chip: 0.02,
        // worn: dished where feet go (near the wall side), the nosing rounded away
        warp: (lx, ly, lz) => [lx, ly - (ly > 0.05 ? 0.018 * Math.exp(-((lz + 0.25) ** 2) / 0.25) * Math.exp(-((lx + 0.05) ** 2) / 0.02) : 0), lz],
      });
    }
    // (no handrail: a quay stair of the period has none - a mooring ring let into the face beside it)
    for (const fx of [0.3, 0.62]) {
      const x = stepsX + stepsLen * fx, y = H - rise * (stepsN * fx + 1) - 0.45;
      const pts = [];
      for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; pts.push([x + Math.sin(a) * 0.11, y - 0.11 + Math.cos(a) * 0.11, stepsW + 0.05 + 0.012 * Math.cos(a)]); }
      tube(local.get('iron'), pts, 0.016, { sides: 6 });
      tube(local.get('iron'), [[x, y, stepsW + 0.06], [x, y, stepsW - 0.08]], 0.028, { sides: 6, caps: true });
      stain(local, frame([0, 0, stepsW]), x, y - 0.2, 0.18, rnd.range(0.6, 1.1), 'rust', { strength: 0.7, seed: rnd(), z: 0.03 });
    }
  }
  // bollards on the quay: squat dressed stone posts, a rope-worn waist, a domed head
  for (let x = -L / 2 + 3; x < L / 2 - 2; x += 7.5) {
    if (Math.abs(x - stepsX - stepsLen / 2) < stepsLen / 2 + 1) continue;
    const Fb = frame([x, H, -0.95]);
    lathe(local.get('stoneQuay'), Fb, [[0.0, 0.0], [0.27, 0.0], [0.27, 0.1], [0.24, 0.14], [0.22, 0.3], [0.18, 0.38], [0.2, 0.45], [0.24, 0.55], [0.25, 0.62], [0.2, 0.7], [0.1, 0.74], [0.0, 0.75]], 16, { seed: rnd(), wobble: 0.04 });
  }
  // iron mooring rings in the face
  for (let x = -L / 2 + 6; x < L / 2 - 3; x += 9) {
    if (x > stepsX - 0.5 && x < stepsX + stepsLen + 0.5) continue;
    const pts = [];
    for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; pts.push([x + Math.sin(a) * 0.13, H - 0.9 + Math.cos(a) * 0.13 - 0.13, 0.08]); }
    tube(local.get('iron'), pts, 0.018, { sides: 6 });
    tube(local.get('iron'), [[x, H - 0.77, 0.0], [x, H - 0.77, 0.1]], 0.03, { sides: 6, caps: true });
  }
  // fender piles: oak, round-ish, silvered tops, iron bands, slimy below the tide line
  for (let x = -L / 2 + 2; x < L / 2 - 1; x += 4.2) {
    if (x > stepsX - 1 && x < stepsX + stepsLen + 1) continue;
    const pts = [[x, base + 0.3, 0.2], [x + rnd.sym(0.03), H - 0.15, 0.2 + rnd.sym(0.02)]];
    tube(local.get('oakDark'), pts, (t) => 0.16 - 0.015 * t, { sides: 9, caps: true, seed: rnd() });
    for (const yb of [0.6, 2.0]) tube(local.get('iron'), [[x, yb, 0.2], [x, yb + 0.07, 0.2]], 0.168, { sides: 9 });
  }
  // scum and foam where the sea laps the quay face and the stair
  if (o.water !== false) {
    const wy = (o.waterY ?? 0) + 0.006;
    const fseg = (x0, x1, z0, dirZ) => grid(local.get('foam'), Math.max(2, Math.round((x1 - x0) / 0.5)), 4, (u, v) => ({ p: [x0 + (x1 - x0) * u, wy, z0 + dirZ * v * 1.4], uv: [x0 + (x1 - x0) * u, v * 1.4], seed: 0.5, ao: 0.85, ar: 1 }), [1, 0, 0], dirZ < 0);
    fseg(-L / 2, stepsX, 0.0, 1);
    fseg(stepsX, stepsX + stepsLen, stepsW, 1);
    fseg(stepsX + stepsLen, L / 2, 0.0, 1);
    // the stair's low end (a short run across x)
    grid(local.get('foam'), 3, 4, (u, v) => ({ p: [stepsX + stepsLen + v * 1.2, wy, stepsW * u], uv: [stepsW * u, v * 1.2], seed: 0.5, ao: 0.85, ar: 1 }), [0, 0, 1], true);
  }
  // the water surface (with a long chop) out to the harbour mouth
  if (o.water !== false) {
    // dense near the quay, coarse far out
    const [wx, wz] = o.waterExtent || [L / 2 + 150, 260], wy = o.waterY ?? 0;
    const sx = (u) => Math.sign(u - 0.5) * Math.pow(Math.abs(u - 0.5) * 2, 1.6) * wx;
    grid(local.get('sea'), 80, 60, (u, v) => ({ p: [sx(u), wy, 0.02 + wz * v * v], uv: [99, 0], seed: 0.5, ao: 1 }), [1, 0, 0], true);
  }
  // warehouses behind the quay (their own footing at the quay top)
  const town = new Kit(H);
  if (o.buildings !== false) {
    const local = town;
    const bd = (x, w, d, h, seed) => {
      const fr = frame([x, H, -8.5 - d / 2]);
      const ops = [];
      for (let k = 0; k < Math.floor(w / 4.2); k++) ops.push({ x: 0.9 + k * 4.2, y: 0, w: 2.6, h: 3.4, head: 'arch', reveal: 0.6 });
      masonryBox(local, fr, { w, d, h, T: 0.7, style: 'squared', mat: 'stonePale', dressedMat: 'stonePale', mortar: 'mortarPale', lod, seed, courseMin: 0.2, courseMax: 0.34, quoin: { long: 0.6, short: 0.35 }, faces: { front: { openings: [...ops, { x: w / 2 - 0.9, y: h - 2.6, w: 1.8, h: 2.1, head: 'lintel', reveal: 0.5 }] }, back: { lod: 'low' } } });
      const Ff = sub(fr, [-w / 2, 0, d / 2]);
      for (const op of ops) door(local, sub(Ff, [op.x, 0, 0]), { w: op.w, h: op.h, arch: true, inset: 0.3, open: rnd() < 0.5 ? 0.85 : 0, wallT: 0.7, seed: rnd() * 999 });
      // the loft door and its hoist beam
      door(local, sub(Ff, [w / 2 - 0.9, h - 2.6, 0]), { w: 1.8, h: 2.1, inset: 0.2, open: 0.9, wallT: 0.7, seed: rnd() * 999 });
      memberW(local, xf(fr, 0, h + 0.4, d / 2 - 1.5), xf(fr, 0, h + 0.4, d / 2 + 1.1), 0.24, 0.24, rnd, { mat: 'oakDark', lod });
      tube(local.get('rope'), [xf(fr, 0, h + 0.28, d / 2 + 1.0), xf(fr, 0, h - 2.2, d / 2 + 1.0)], 0.02, { sides: 6 });
      const rise = (d / 2) * 0.9;
      masonryGable(local, sub(fr, [-w / 2, h, -d / 2], [0, 0, 1], [0, 1, 0]), d, rise, { style: 'squared', mat: 'stonePale', mortar: 'mortarPale', T: 0.7, lod, seed: rnd() * 999 });
      masonryGable(local, sub(fr, [w / 2, h, d / 2], [0, 0, -1], [0, 1, 0]), d, rise, { style: 'squared', mat: 'stonePale', mortar: 'mortarPale', T: 0.7, lod, seed: rnd() * 999 });
      gableRoof(local, sub(fr, [0, h, 0]), { L: w - 0.3, S: d, pitch: 0.9, eaves: 0.45, verge: 0, gableL: false, gableR: false, cover: 'slate', lod, seed: rnd() * 999 });
    };
    bd(-L / 2 + 9, 16, 10, 7.2, 3);
    bd(L / 2 - 11, 18, 11, 8.0, 5);
    // goods on the quay before the warehouses: barrels on end and on their sides, crates, sacks,
    // coiled hawsers, a hand cart; (o.dressing === false: a bare quay)
    if (o.dressing !== false) {
      const rr = makeRand((o.seed ?? 251) + 77);
      const spot = (x, z, k) => {
        const F0 = frame([x, H, z], [Math.cos(rr.sym(0.4)), 0, Math.sin(rr.sym(0.4))], [0, 1, 0]);
        if (k === 0) { for (let i = 0; i < 3; i++) barrel(local, sub(F0, [i * 0.62 + rr.sym(0.03), 0, rr.sym(0.05)]), rr); barrel(local, sub(F0, [0.31, 0.83, 0.02]), rr); }
        else if (k === 1) { crate(local, F0, rr, { w: 0.8, d: 0.6, h: 0.55 }); crate(local, sub(F0, [0.05, 0.57, 0.02], [Math.cos(0.2), 0, Math.sin(0.2)], [0, 1, 0]), rr, { w: 0.62, d: 0.5, h: 0.45 }); crate(local, sub(F0, [0.85, 0, 0.1]), rr, { w: 0.7, d: 0.55, h: 0.5 }); }
        else if (k === 2) { for (let i = 0; i < 4; i++) sack(local, sub(F0, [i * 0.42 + rr.sym(0.05), 0, rr.sym(0.12)]), rr); }
        else if (k === 3) { coil(local, F0, rr, { r: 0.42, turns: 7, rad: 0.026 }); barrel(local, sub(F0, [1.0, 0, 0.3]), rr, { onSide: true }); }
        else handcart(local, F0, rr);
      };
      spot(-L / 2 + 4.0, -7.2, 0); spot(-L / 2 + 7.5, -6.8, 1); spot(-L / 2 + 12.5, -7.4, 2); spot(-L / 2 + 15.5, -4.5, 3);
      spot(L / 2 - 17.0, -7.0, 4); spot(L / 2 - 13.0, -7.3, 0); spot(L / 2 - 8.5, -6.9, 1); spot(L / 2 - 5.0, -7.6, 2);
      spot(stepsX + stepsLen + 2.5, -1.6, 3);
    }
    // the town behind: roofs climbing away from the warehouses (no empty field behind the quay)
    if (o.town !== false) {
      const tr = makeRand((o.seed ?? 251) + 91);
      for (let row = 0; row < 2; row++) {
        let x = -L / 2 - 2 + tr.range(0, 3);
        while (x < L / 2 + 2) {
          const w = tr.range(5.5, 8.0), d = tr.range(7, 9);
          house(local, yawFrame([x + w / 2, H, -24.5 - row * 10 - tr.range(0, 1.2) - d / 2], tr.sym(0.05)), { w, d, storeys: row ? 2 : 1, roof: tr() < 0.5 ? 'side' : 'front', seed: Math.floor(tr() * 9000) + 600, lod: 'low', party: { left: false, right: false }, cover: tr() < 0.6 ? 'slate' : 'clay' });
          x += w + tr.range(0.0, 1.5);
        }
      }
    }
  }
  kit.merge(local, F);
  kit.merge(town, F);
  return { steps: { x: stepsX, w: stepsW, n: stepsN }, top: H };
}
void steps; void framedWall; void pentice; void keeperHouse;
