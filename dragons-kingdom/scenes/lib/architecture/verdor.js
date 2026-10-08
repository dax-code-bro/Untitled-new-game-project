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
import { Kit, frame, yawFrame, sub, makeRand, block, tube, xf, sagLine, curve } from './core.js';
import { masonryBox, masonryFace, masonryGable, courses, roundTower, conicalRoof, steps } from './masonry.js';
import { member, framedWall } from './timber.js';
import { gableRoof, chimney, pentice } from './roof.js';
import { door, windowUnit, threshold, glassQuad } from './openings.js';

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
  const slitPortals = (Ff, ops) => { for (const op of ops) if (op.w < 1) glassQuad(local, Ff, op.x, op.y, op.x + op.w, op.y + op.h, -T + 0.02, { portal: true, W: op.w, H: op.h, floorBelow: op.y, seed: rnd() }); };
  slitPortals(sub(frame([0, 0, 0]), [-w / 2, 0, d / 2]), frontOps);
  slitPortals(sub(frame([0, 0, 0]), [w / 2, 0, -d / 2], [-1, 0, 0], [0, 1, 0]), backOps);
  masonryBox(local, frame([0, 0, 0]), {
    w, d, h, T, style: 'ashlar', mat: 'stonePale', dressedMat: 'stonePale', mortar: 'mortarPale', lod, seed: rnd() * 999,
    courseMin: 0.28, courseMax: 0.38, plinth: 0.45, quoin: { long: 0.7, short: 0.42 },
    faces: { front: { openings: frontOps }, back: { openings: backOps, lod: lod === 'hero' ? 'mid' : lod }, left: { openings: [{ x: d / 2 - 0.6, y: 0, w: 1.2, h: 2.3, head: 'lintel', reveal: T }] }, right: {} },
  });
  // buttresses between the bays on both long sides: stepped, with sloped weatherings
  for (const side of [1, -1]) {
    for (let i = 1; i < bays; i++) {
      const x = -w / 2 + bayW * i;
      if (side > 0 && Math.abs(x) < dw / 2 + 0.8) continue;
      const Fb = side > 0 ? frame([x, 0, d / 2 + 0.45]) : frame([x, 0, -d / 2 - 0.45], [-1, 0, 0], [0, 1, 0]);
      masonryBox(local, Fb, { w: 0.9, d: 0.9, h: h * 0.62, T: 0.45, style: 'ashlar', mat: 'stonePale', dressedMat: 'stonePale', mortar: 'mortarPale', lod: lod === 'hero' ? 'mid' : lod, seed: rnd() * 999, courseMin: 0.28, courseMax: 0.38, plinth: 0.45, quoin: { long: 0.5, short: 0.4 }, faces: { back: { skip: true } } });
      // the weathering: a sloped capstone shedding water off the buttress
      block(local.get('stonePale'), sub(Fb, [0, h * 0.62 + 0.2, -0.05]), 1.0, 0.4, 1.0, { r: 0.015, seg: [0.2, 0.2, 0.2], seed: rnd(), noise: 0.003, chip: 0.01, warp: (lx, ly, lz) => [lx, ly - (ly > 0 ? (lz / 1.0 + 0.5) * 0.35 : 0), lz] });
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
  gableRoof(local, frame([0, h, 0]), { L: w - 0.3, S: d, pitch, eaves: 0.5, verge: 0.0, gableL: false, gableR: false, cover: 'slate', lod, seed: rnd() * 999, sag: { ridge: 0.08, slope: 0.035, eaves: 0.03 } });
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
    w, d, h, T, style: 'squared', mat: 'stonePale', dressedMat: 'stonePale', mortar: 'mortarPale', lod, seed: rnd() * 999,
    courseMin: 0.18, courseMax: 0.3, quoin: { long: 0.5, short: 0.3 },
    faces: {
      front: { openings: [{ x: doorX, y: 0, w: dw, h: dh, head: 'lintel', reveal: 0.3 }, { x: 1.1, y: 0.95, w: 0.95, h: 1.1, head: 'lintel', sill: true, reveal: 0.3 }, { x: w - 2.0, y: 0.95, w: 0.95, h: 1.1, head: 'lintel', sill: true, reveal: 0.3 }] },
      left: { openings: [{ x: d / 2 - 0.4, y: 1.0, w: 0.8, h: 0.95, head: 'lintel', sill: true, reveal: 0.3 }] },
      back: { lod: 'low', openings: [] }, right: {},
    },
  });
  const Ff = sub(frame([0, 0, 0]), [-w / 2, 0, d / 2]);
  door(local, sub(Ff, [doorX, 0, 0]), { w: dw, h: dh, inset: 0.18, open: o.doorOpen ?? 0.6, hingeLeft: true, wallT: T, seed: rnd() * 999 });
  threshold(local, sub(Ff, [doorX, 0, 0]), dw, 0.35, rnd, { mat: 'stonePale' });
  windowUnit(local, sub(Ff, [1.1, 0.95, 0]), { w: 0.95, h: 1.1, inset: 0.16, lights: 2, glazing: 'square', shutters: 'open', floorBelow: 0.95, seed: rnd() * 999 });
  windowUnit(local, sub(Ff, [w - 2.0, 0.95, 0]), { w: 0.95, h: 1.1, inset: 0.16, lights: 2, glazing: 'diamond', shutters: 'half', floorBelow: 0.95, seed: rnd() * 999 });
  windowUnit(local, sub(frame([0, 0, 0]), [-w / 2, 1.0, -0.4], [0, 0, 1], [0, 1, 0]), { w: 0.8, h: 0.95, inset: 0.16, lights: 1, glazing: 'none', shutters: 'closed', seed: rnd() * 999 });
  // a door hood (pentice) on two brackets
  pentice(local, sub(Ff, [doorX + dw / 2, dh + 0.55, 0]), { L: dw + 0.9, depth: 0.75, drop: 0.35, cover: 'slate', seed: rnd() * 999 });
  // stone gables, the left one carrying the chimney stack
  const pitch = 1.0, rise = (d / 2) * pitch;
  masonryGable(local, sub(frame([0, 0, 0]), [-w / 2, h, -d / 2], [0, 0, 1], [0, 1, 0]), d, rise, { style: 'squared', mat: 'stonePale', mortar: 'mortarPale', T, lod, seed: rnd() * 999 });
  masonryGable(local, sub(frame([0, 0, 0]), [w / 2, h, d / 2], [0, 0, -1], [0, 1, 0]), d, rise, { style: 'squared', mat: 'stonePale', mortar: 'mortarPale', T, lod, seed: rnd() * 999 });
  gableRoof(local, frame([0, h, 0]), { L: w - 0.2, S: d, pitch, eaves: 0.4, verge: 0.0, gableL: false, gableR: false, cover: 'slate', lod, seed: rnd() * 999 });
  chimney(local, frame([-w / 2 + 0.55, h - 0.2, 0]), { w: 1.0, d: 0.8, h: rise + 1.5, mat: 'stonePale', dressed: 'stonePale', lod: lod === 'hero' ? 'mid' : lod, seed: rnd() * 999 });
  // a lean-to woodshed against the right gable: posts, a slate pent roof, a log pile
  {
    const sx = w / 2 + 1.0;
    for (const z of [d / 2 - 0.3, -d / 2 + 0.3]) member(local, frame([sx + 0.9, 0, 0], [0, 0, 1], [0, 1, 0]), [z, 0], [z, 2.15], 0.15, 0.15, rnd, { mat: 'oakDark' });
    member(local, frame([sx + 0.9, 0, 0], [0, 0, 1], [0, 1, 0]), [-d / 2 + 0.1, 2.2], [d / 2 - 0.1, 2.2], 0.16, 0.15, rnd, { mat: 'oakDark' });
    // a lean-to: the high side against the gable wall, falling away from the house
    gableRoof(local, frame([w / 2 + 0.05, 2.0, 0], [0, 0, 1], [0, 1, 0]), { L: d - 0.4, S: 4.0, pitch: 0.38, eaves: 0.3, verge: 0.2, cover: 'slate', sides: [-1], lod, seed: rnd() * 999, sag: { ridge: 0.02, slope: 0.01, eaves: 0.02 } });
    for (let i = 0; i < 70; i++) {
      const row = i % 10, layer = Math.floor(i / 10);
      const z = -d / 2 + 0.8 + row * 0.42 + rnd.sym(0.03), y = 0.13 + layer * 0.24 + rnd.sym(0.02), x = sx + 0.2 + rnd.sym(0.05);
      block(local.get('oak'), frame([x, y, z], [1, 0, 0], [0, 1, 0]), 0.9 + rnd.sym(0.1), 0.22, 0.22, { r: 0.09, rs: 1, seg: [0.3, 0.1, 0.1], seed: rnd(), noise: 0.006, nf: 4, chip: 0.01 });
    }
  }
  kit.merge(local, F);
  return { door: { x: -w / 2 + doorX + dw / 2, z: d / 2, w: dw, h: dh }, w, d };
}

// ------------------------------------------------------------------ access rig --
/**
 * Charcoal's grounded access rig. F: base centre of the tower; the gangway reaches toward +z.
 * o: H (deck height, default 7.2), size (tower side, 3.2), gangway (length, 7), gangwayDrop (m
 * the gangway's end lies below the deck), lod, seed. Returns { deck: [x,y,z] local, gangwayEnd }.
 */
export function accessRig(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 221);
  const H = o.H ?? 7.2, S = o.size ?? 3.2;
  const lod = o.lod || 'mid';
  const local = new Kit(0);
  const posts = [[-S / 2, -S / 2], [S / 2, -S / 2], [S / 2, S / 2], [-S / 2, S / 2]];
  // stone footings
  for (const [x, z] of posts) block(local.get('stonePale'), frame([x, 0.18, z]), 0.7, 0.5, 0.7, { r: 0.03, rs: 1, seg: [0.2, 0.2, 0.2], seed: rnd(), noise: 0.006, nf: 5, chip: 0.015, pillow: 0.01 });
  // posts (slightly battered inward), levels with girts and X braces on every face
  const lvl = [0.5, H * 0.36, H * 0.68, H - 0.12];
  for (const [x, z] of posts) memberW(local, [x, 0.42, z], [x * 0.94, H + 1.15, z * 0.94], 0.24, 0.24, rnd, { mat: 'oak', lod });
  for (let f = 0; f < 4; f++) {
    const [ax, az] = posts[f], [bx, bz] = posts[(f + 1) % 4];
    for (let k = 0; k < lvl.length; k++) {
      const y = lvl[k], sh = 1 - 0.06 * (y / H);
      memberW(local, [ax * sh, y, az * sh], [bx * sh, y, bz * sh], 0.18, 0.15, rnd, { mat: 'oak', lod });
      if (k < lvl.length - 1) {
        const y2 = lvl[k + 1], sh2 = 1 - 0.06 * (y2 / H);
        memberW(local, [ax * sh, y + 0.1, az * sh], [bx * sh2, y2 - 0.1, bz * sh2], 0.13, 0.11, rnd, { mat: 'oak', lod });
        memberW(local, [bx * sh, y + 0.1, bz * sh], [ax * sh2, y2 - 0.1, az * sh2], 0.13, 0.11, rnd, { mat: 'oak', lod, offset: 0.12 });
      }
    }
  }
  // iron straps and bolts at the post-girt joints (lower level)
  for (const [x, z] of posts) for (const y of lvl) tube(local.get('iron'), [[x * 1.0 - 0.13 * Math.sign(x), y, z * 1.0], [x * 1.0 + 0.13 * Math.sign(x), y, z]], 0.012, { sides: 6, caps: true });
  // the deck: joists + boards, railings on three sides
  const D = S * 0.94 + 0.5;
  for (let i = 0; i < 6; i++) memberW(local, [-D / 2, H - 0.05, -D / 2 + D * (i + 0.5) / 6], [D / 2, H - 0.05, -D / 2 + D * (i + 0.5) / 6], 0.12, 0.16, rnd, { mat: 'oakDark', lod });
  for (let i = 0; i < Math.round(D / 0.2); i++) {
    const x = -D / 2 + 0.1 + i * 0.2;
    block(local.get('oak'), frame([x, H + 0.05, 0], [0, 0, 1], [0, 1, 0]), D + rnd.sym(0.04), 0.04, 0.19, { r: 0.004, seg: [0.6, 0.04, 0.19], seed: rnd(), noise: 0.002, nf: 3 });
  }
  const rail = (a, b) => {
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 1.1));
    for (let i = 0; i <= n; i++) { const t = i / n; const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t; memberW(local, [x, a[1], z], [x, a[1] + 1.1, z], 0.09, 0.09, rnd, { mat: 'oak', lod }); }
    memberW(local, [a[0], a[1] + 1.1, a[2]], [b[0], b[1] + 1.1, b[2]], 0.1, 0.08, rnd, { mat: 'oak', lod });
    memberW(local, [a[0], a[1] + 0.55, a[2]], [b[0], b[1] + 0.55, b[2]], 0.08, 0.06, rnd, { mat: 'oak', lod });
  };
  const y0 = H + 0.07;
  rail([-D / 2, y0, -D / 2], [D / 2, y0, -D / 2]);
  rail([-D / 2, y0, -D / 2], [-D / 2, y0, D / 2 - 1.3]);
  rail([D / 2, y0, -D / 2], [D / 2, y0, D / 2]);
  rail([D / 2, y0, D / 2], [0.7, y0, D / 2]);
  // switchback stairs on the -x side: flight 1 rises toward -z to a landing, flight 2 back to the deck
  const flight = (x0, xw, za, zb, ya, yb) => {
    const n = Math.max(3, Math.round((yb - ya) / 0.2));
    for (const sx of [x0, x0 + xw]) memberW(local, [sx, ya + 0.05, za], [sx, yb + 0.05, zb], 0.07, 0.26, rnd, { mat: 'oakDark', lod });
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 0.5);
      const y = ya + (yb - ya) * t, z = za + (zb - za) * t;
      block(local.get('oak'), frame([x0 + xw / 2, y + 0.11, z]), xw + 0.06, 0.05, 0.3, { r: 0.005, seg: [0.5, 0.05, 0.3], seed: rnd(), noise: 0.002, nf: 3 });
    }
    // handrail on the outer side: posts + rail
    const ox = x0;
    for (let i = 0; i <= 3; i++) { const t = i / 3; const y = ya + (yb - ya) * t, z = za + (zb - za) * t; memberW(local, [ox, y + 0.1, z], [ox, y + 1.05, z], 0.07, 0.07, rnd, { mat: 'oak', lod }); }
    memberW(local, [ox, ya + 1.05, za], [ox, yb + 1.05, zb], 0.07, 0.06, rnd, { mat: 'oak', lod });
  };
  const sx0 = -S / 2 - 1.25, yl = H * 0.5;
  flight(sx0, 1.1, S / 2 + 2.6, -S / 2 + 0.1, 0.0, yl);
  // landing
  for (let i = 0; i < 7; i++) block(local.get('oak'), frame([sx0 + 0.55, yl + 0.05, -S / 2 - 0.55 + i * 0.19 - 0.6], [1, 0, 0], [0, 1, 0]), 1.3, 0.04, 0.18, { r: 0.004, seg: [0.6, 0.04, 0.18], seed: rnd(), noise: 0.002 });
  memberW(local, [sx0 - 0.05, 0, -S / 2 - 1.2], [sx0 - 0.05, yl + 1.1, -S / 2 - 1.2], 0.16, 0.16, rnd, { mat: 'oak', lod });
  memberW(local, [sx0 + 1.2, 0, -S / 2 - 1.2], [sx0 + 1.2, yl + 0.0, -S / 2 - 1.2], 0.16, 0.16, rnd, { mat: 'oak', lod });
  block(local.get('stonePale'), frame([sx0 - 0.05, 0.12, -S / 2 - 1.2]), 0.45, 0.32, 0.45, { r: 0.03, seg: [0.2, 0.15, 0.2], seed: rnd(), noise: 0.005, chip: 0.012 });
  block(local.get('stonePale'), frame([sx0 + 1.2, 0.12, -S / 2 - 1.2]), 0.45, 0.32, 0.45, { r: 0.03, seg: [0.2, 0.15, 0.2], seed: rnd(), noise: 0.005, chip: 0.012 });
  flight(sx0 + 0.0, 1.1, -S / 2 - 0.3, S / 2 - 0.6, yl, H);
  // the mast and the gangway on its pivot: rope falls from the masthead to the gangway's end
  const GL = o.gangway ?? 7.0, drop = o.gangwayDrop ?? 1.2;
  const gz0 = D / 2, gang = Math.asin(Math.min(0.6, drop / GL));
  const gEnd = [0, H + 0.1 - drop, gz0 + Math.cos(gang) * GL];
  const gw = 1.0;
  for (const sx of [-gw / 2, gw / 2]) memberW(local, [sx, H + 0.05, gz0 - 0.1], [sx, gEnd[1], gEnd[2]], 0.09, 0.2, rnd, { mat: 'oakDark', lod });
  const nb = Math.round(GL / 0.2);
  for (let i = 0; i < nb; i++) {
    const t = (i + 0.5) / nb;
    const y = H + 0.05 + (gEnd[1] - H - 0.05) * t + 0.12, z = gz0 + (gEnd[2] - gz0) * t;
    block(local.get('oak'), frame([0, y, z]), gw + 0.12, 0.035, 0.17, { r: 0.004, seg: [0.6, 0.04, 0.17], seed: rnd(), noise: 0.002 });
    if (i % 3 === 1) block(local.get('oak'), frame([0, y + 0.03, z + 0.05]), gw - 0.1, 0.03, 0.04, { r: 0.004, seg: [0.6, 0.03, 0.04], seed: rnd() });     // cleats
  }
  // the end of the gangway: a padded bumper (leather over straw) where it lies on the dragon
  block(local.get('leather'), frame([0, gEnd[1] + 0.02, gEnd[2] + 0.05]), gw + 0.25, 0.22, 0.32, { r: 0.09, rs: 2, seg: [0.2, 0.1, 0.1], seed: rnd(), noise: 0.01, nf: 6 });
  const mastTop = [0.0, H + 4.2, -D / 2 + 0.35];
  memberW(local, [0, H + 0.05, -D / 2 + 0.35], mastTop, 0.2, 0.2, rnd, { mat: 'oak', lod });
  memberW(local, [-0.6, H + 0.1, -D / 2 + 0.35], [0, H + 1.6, -D / 2 + 0.35], 0.11, 0.11, rnd, { mat: 'oak', lod });
  memberW(local, [0.6, H + 0.1, -D / 2 + 0.35], [0, H + 1.6, -D / 2 + 0.35], 0.11, 0.11, rnd, { mat: 'oak', lod });
  // the jib at the masthead reaching over the gangway
  const jibEnd = [0, mastTop[1] - 0.3, gz0 + 1.6];
  memberW(local, [0, mastTop[1] - 0.8, mastTop[2]], jibEnd, 0.14, 0.14, rnd, { mat: 'oak', lod });
  // ropes: two falls from the jib to the gangway sides, a guy back to the deck, rope handrails
  for (const sx of [-gw / 2 - 0.05, gw / 2 + 0.05]) {
    tube(local.get('rope'), curve([jibEnd, [sx * 0.5, (jibEnd[1] + gEnd[1]) / 2 + 0.3, (jibEnd[2] + gEnd[2]) / 2], [sx, gEnd[1] + 0.25, gEnd[2] - 0.3]], 16), 0.016, { sides: 6 });
    // rope handrails along the gangway, through posts
    const rp = [];
    for (let i = 0; i <= 3; i++) { const t = i / 3; const y = H + 0.05 + (gEnd[1] - H - 0.05) * t, z = gz0 + (gEnd[2] - gz0) * t; memberW(local, [sx, y + 0.1, z], [sx, y + 1.0, z], 0.06, 0.06, rnd, { mat: 'oak', lod }); rp.push([sx, y + 1.0, z]); }
    tube(local.get('rope'), sagLine(rp[0], rp[3], 0.18, 20), 0.014, { sides: 6 });
  }
  tube(local.get('rope'), sagLine(mastTop, [0, H + 0.2, -D / 2 - 0.05], 0.05, 10), 0.016, { sides: 6 });
  // a coil of rope on the deck, a block (pulley) at the jib
  {
    const c = [0.9, H + 0.12, -0.6];
    const pts = [];
    for (let i = 0; i <= 80; i++) { const a = i * 0.45; const rr = 0.24 + 0.05 * Math.sin(i * 0.37); pts.push([c[0] + Math.cos(a) * rr, c[1] + 0.025 * Math.floor(i / 14), c[2] + Math.sin(a) * rr]); }
    tube(local.get('rope'), pts, 0.016, { sides: 5 });
    block(local.get('oakDark'), frame([jibEnd[0], jibEnd[1] - 0.18, jibEnd[2]]), 0.12, 0.26, 0.2, { r: 0.04, rs: 1, seg: [0.06, 0.1, 0.1], seed: rnd() });
  }
  kit.merge(local, F);
  return { deck: [0, H + 0.07, 0], gangwayEnd: gEnd, height: H };
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
/** The movable stable platform for Leaf: a timber deck on four solid wheels, steps, a rail. */
export function leafPlatform(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 231);
  const H = o.H ?? 1.45, W = o.w ?? 2.4, D = o.d ?? 1.9;
  const local = new Kit(0);
  // wheels (oak discs with iron tyres) and axles
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    // wheels turn about the long (x) axis: they sit under the side beams, rolling along z
    const c = [sx * (W / 2 - 0.35), 0.27, sz * (D / 2 - 0.25)];
    const pts = [[c[0] - 0.05, c[1], c[2]], [c[0] + 0.05, c[1], c[2]]];
    tube(local.get('oakDark'), pts, 0.25, { sides: 18, caps: true });
    tube(local.get('iron'), [[c[0] - 0.055, c[1], c[2]], [c[0] + 0.055, c[1], c[2]]], 0.27, { sides: 18 });
    tube(local.get('iron'), [[c[0] - 0.09, c[1], c[2]], [c[0] + 0.09, c[1], c[2]]], 0.045, { sides: 8, caps: true });
  }
  // chassis and posts
  for (const sz of [-1, 1]) memberW(local, [-W / 2 - 0.1, 0.5, sz * (D / 2 - 0.1)], [W / 2 + 0.1, 0.5, sz * (D / 2 - 0.1)], 0.2, 0.16, rnd, { mat: 'oakDark' });
  for (const sx of [-1, 1]) memberW(local, [sx * (W / 2 - 0.1), 0.5, -D / 2 - 0.05], [sx * (W / 2 - 0.1), 0.5, D / 2 + 0.05], 0.18, 0.15, rnd, { mat: 'oakDark' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) memberW(local, [sx * (W / 2 - 0.1), 0.58, sz * (D / 2 - 0.1)], [sx * (W / 2 - 0.1), H, sz * (D / 2 - 0.1)], 0.16, 0.16, rnd, { mat: 'oak' });
  for (const sx of [-1, 1]) memberW(local, [sx * (W / 2 - 0.1), 0.95, -D / 2 + 0.1], [sx * (W / 2 - 0.1), H - 0.2, D / 2 - 0.1], 0.1, 0.08, rnd, { mat: 'oak' });
  for (let i = 0; i < Math.round(W / 0.2); i++) block(local.get('oak'), frame([-W / 2 + 0.1 + i * 0.2, H + 0.03, 0], [0, 0, 1], [0, 1, 0]), D + 0.1, 0.04, 0.19, { r: 0.004, seg: [0.6, 0.04, 0.19], seed: rnd(), noise: 0.002 });
  // steps on the -z side, rail on the back
  const n = 5;
  for (const sx of [-0.5, 0.5]) memberW(local, [sx, 0.02, -D / 2 - 1.5], [sx, H, -D / 2], 0.06, 0.24, rnd, { mat: 'oakDark' });
  for (let i = 1; i <= n; i++) { const t = i / (n + 0.6); block(local.get('oak'), frame([0, H * t + 0.08, -D / 2 - 1.5 * (1 - t)]), 1.1, 0.045, 0.26, { r: 0.004, seg: [0.5, 0.05, 0.26], seed: rnd(), noise: 0.002 }); }
  for (const sx of [-W / 2 + 0.05, W / 2 - 0.05]) memberW(local, [sx, H, D / 2 - 0.05], [sx, H + 1.0, D / 2 - 0.05], 0.08, 0.08, rnd, { mat: 'oak' });
  memberW(local, [-W / 2, H + 1.0, D / 2 - 0.05], [W / 2, H + 1.0, D / 2 - 0.05], 0.09, 0.07, rnd, { mat: 'oak' });
  // a draw bar resting on the ground
  memberW(local, [0, 0.45, D / 2], [0, 0.06, D / 2 + 1.5], 0.08, 0.08, rnd, { mat: 'oakDark' });
  kit.merge(local, F);
}

// ------------------------------------------------------------------ palace --
/** The distant palace (silhouette scale): F at the centre of the inner ward. o: lod ('low'), seed. */
export function palace(kit, F, o = {}) {
  const rnd = makeRand(o.seed ?? 241);
  const lod = o.lod || 'far';
  const local = new Kit(0);
  const stoneM = lod === 'far' ? 'stoneFar' : 'stonePale';
  const box = (x, z, w, d, h, yaw, ops = {}) => {
    const fr = yawFrame([x, 0, z], yaw);
    masonryBox(local, fr, { w, d, h, T: 1.2, style: 'ashlar', mat: stoneM, dressedMat: stoneM, mortar: 'mortarPale', lod, seed: rnd() * 999, courseMin: 0.38, courseMax: 0.55, plinth: 0.8, quoin: { long: 1.0, short: 0.6 }, ...ops });
    return fr;
  };
  const slits = (n, L, y, w = 0.7, hh = 1.8) => Array.from({ length: n }, (_, i) => ({ x: L * (i + 0.5) / n - w / 2, y, w, h: hh, head: 'arch', sill: true, reveal: 0.6 }));
  // the keep: a tall block with a steep slate roof between stone gables, chimneys
  {
    const w = 20, d = 15, h = 24;
    const fr = box(0, -6, w, d, h, 0, { faces: { front: { openings: [...slits(4, w, 12), ...slits(4, w, 18)] }, left: { openings: slits(3, d, 16) }, right: { openings: slits(3, d, 16) }, back: { openings: slits(4, w, 16) } } });
    const rise = (d / 2) * 1.1;
    masonryGable(local, sub(fr, [-w / 2, h, -d / 2], [0, 0, 1], [0, 1, 0]), d, rise, { style: 'ashlar', mat: stoneM, mortar: 'mortarPale', T: 1.2, lod, seed: rnd() * 999, courseMin: 0.38, courseMax: 0.55 });
    masonryGable(local, sub(fr, [w / 2, h, d / 2], [0, 0, -1], [0, 1, 0]), d, rise, { style: 'ashlar', mat: stoneM, mortar: 'mortarPale', T: 1.2, lod, seed: rnd() * 999, courseMin: 0.38, courseMax: 0.55 });
    gableRoof(local, sub(fr, [0, h, 0]), { L: w - 0.6, S: d, pitch: 1.1, eaves: 0.6, verge: 0, gableL: false, gableR: false, cover: 'slate', lod, seed: rnd() * 999, sag: { ridge: 0.04, slope: 0.03, eaves: 0.03 } });
    chimney(local, sub(fr, [-w * 0.25, h - 0.5, -d * 0.1]), { w: 1.2, d: 1.0, h: rise + 2.2, mat: stoneM, dressed: stoneM, lod, seed: rnd() * 999 });
    chimney(local, sub(fr, [w * 0.3, h - 0.5, d * 0.12]), { w: 1.2, d: 1.0, h: rise + 2.0, mat: stoneM, dressed: stoneM, lod, seed: rnd() * 999 });
  }
  // the great hall range along the east side
  {
    const w = 34, d = 13, h = 13;
    const fr = box(24, 10, w, d, h, Math.PI / 2, { faces: { front: { openings: slits(6, w, 5, 1.4, 4.2) }, back: { openings: slits(6, w, 6, 1.0, 3.0) } } });
    const rise = (d / 2) * 1.0;
    masonryGable(local, sub(fr, [-w / 2, h, -d / 2], [0, 0, 1], [0, 1, 0]), d, rise, { style: 'ashlar', mat: stoneM, mortar: 'mortarPale', T: 1.0, lod, seed: rnd() * 999, courseMin: 0.38, courseMax: 0.55 });
    masonryGable(local, sub(fr, [w / 2, h, d / 2], [0, 0, -1], [0, 1, 0]), d, rise, { style: 'ashlar', mat: stoneM, mortar: 'mortarPale', T: 1.0, lod, seed: rnd() * 999, courseMin: 0.38, courseMax: 0.55 });
    gableRoof(local, sub(fr, [0, h, 0]), { L: w - 0.6, S: d, pitch: 1.0, eaves: 0.6, verge: 0, gableL: false, gableR: false, cover: 'slate', lod, seed: rnd() * 999 });
  }
  // round towers at the corners of the curtain, with conical roofs seated on their parapets
  const corners = [[-30, -28], [34, -26], [36, 30], [-32, 28]];
  for (const [x, z] of corners) {
    const R = rnd.range(4.2, 5.2), hh = rnd.range(20, 26);
    const t = roundTower(local, frame([x, 0, z]), { r: R, h: hh, lod, seed: rnd() * 999, slits: 3, mat: stoneM, dressedMat: stoneM });
    conicalRoof(local, frame([x, t.top - 0.2, z]), { r: t.R - 0.15, h: R * 1.9, eaves: 0.45, seed: rnd() * 999, slateScale: lod === 'far' ? 1.8 : 1 });
  }
  // curtain walls between the towers: a wall walk behind a parapet with a coping (no toy teeth)
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
    const L = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(-(bz - az), bx - ax);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const fr = yawFrame([mx, 0, mz], yaw + Math.PI);      // front face outward
    const Lw = L - 9;
    const gate = i === 3;
    masonryFace(local, sub(fr, [-Lw / 2, 0, 1.4]), Lw, 12.5, { style: 'squared', mat: stoneM, dressedMat: stoneM, mortar: 'mortarPale', T: 2.8, lod, seed: rnd() * 999, back: true, openings: gate ? [{ x: Lw / 2 - 2.5, y: 0, w: 5, h: 7.2, head: 'arch', reveal: 1.5, archDepth: 2.83 }] : [] });
    masonryFace(local, sub(fr, [Lw / 2, 0, -1.4], [-1, 0, 0], [0, 1, 0]), Lw, 11.0, { style: 'squared', mat: stoneM, dressedMat: stoneM, mortar: 'mortarPale', T: 2.8, lod, seed: rnd() * 999, openings: gate ? [{ x: Lw / 2 - 2.5, y: 0, w: 5, h: 7.2, head: 'archOpen', reveal: 1.5 }] : [] });
    block(local.get(stoneM), sub(fr, [0, 12.62, 1.1]), Lw, 0.25, 0.75, { r: 0.03, seg: [2, 0.2, 0.4], seed: rnd(), noise: 0.004, warp: (lx, ly, lz) => [lx, ly + (ly > 0 ? 0.06 * (1 - Math.abs(lz) / 0.37) : 0), lz] });
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
  // the quay face: big ashlar courses from below the water to the coping
  const stepsX = o.stepsX ?? -L * 0.18, stepsW = 1.6, stepsN = Math.round((H - 0.1) / 0.24);
  const stepsLen = stepsN * 0.36;
  // below the tide line (+1.1 m) the courses are wet and weed-grown, above it dry pale stone
  const tide = 1.1;
  masonryFace(local, sub(frame([0, 0, 0]), [-L / 2, base, 0]), L, tide - base, { courses: courses(rnd, tide - base, { min: 0.42, max: 0.6 }), style: 'ashlar', mat: 'stoneWet', dressedMat: 'stoneWet', mortar: 'mortarPale', T: 3, lod, seed: rnd() * 999, depth: [0.4, 0.7] });
  masonryFace(local, sub(frame([0, 0, 0]), [-L / 2, tide + 0.012, 0]), L, H - 0.4 - tide - 0.012, { courses: courses(rnd, H - 0.4 - tide - 0.012, { min: 0.42, max: 0.6 }), style: 'ashlar', mat: 'stonePale', dressedMat: 'stonePale', mortar: 'mortarPale', T: 3, lod, seed: rnd() * 999, depth: [0.4, 0.7] });
  // coping: big rounded slabs along the edge, a worn edge
  for (let x = -L / 2; x < L / 2 - 0.1;) {
    const len = Math.min(rnd.range(1.0, 1.7), L / 2 - x);
    if (!(x + len > stepsX - 0.1 && x < stepsX + stepsLen + 0.1) || true) {
      block(local.get('stonePale'), frame([x + len / 2, H - 0.2, -0.45]), len - 0.01, 0.4, 1.1, {
        r: 0.06, rs: 1, seg: [0.3, 0.2, 0.2], seed: rnd(), noise: 0.005, nf: 4, chip: 0.02, pillow: 0.005,
        warp: (lx, ly, lz) => [lx, ly - (lz > 0.3 && ly > 0 ? (lz - 0.3) * 0.15 : 0), lz],
      });
    }
    x += len;
  }
  // quay paving behind the coping
  for (let z = -1.0; z > -8; z -= 0.75) for (let x = -L / 2; x < L / 2 - 0.1;) {
    const len = Math.min(rnd.range(0.7, 1.3), L / 2 - x);
    block(local.get('stonePale'), frame([x + len / 2, H - 0.07 + rnd.sym(0.008), z - 0.37]), len - 0.012, 0.14, 0.73, { r: 0.012, seg: [0.5, 0.14, 0.4], seed: rnd(), noise: 0.003, nf: 5, chip: 0.01, skip: 8 });
    x += len;
  }
  // steps down to the water along the face (projecting from the wall), wet below the tide line
  for (let i = 0; i < stepsN; i++) {
    const y = H - 0.24 * (i + 1);
    const x0 = stepsX + i * 0.36;
    const mat = y < 1.1 ? 'stoneWet' : 'stonePale';
    block(local.get(mat), frame([x0 + 0.2, y + 0.12 - 0.3, stepsW / 2]), 0.42, 0.6, stepsW, {
      r: 0.03, rs: 1, seg: [0.2, 0.2, 0.3], seed: rnd(), noise: 0.004, nf: 5, chip: 0.018,
      warp: (lx, ly, lz) => [lx - (ly > 0.2 ? 0.02 * Math.exp(-lz * lz / 0.2) : 0), ly - (ly > 0.25 ? 0.025 * Math.exp(-((lz - 0.15) ** 2) / 0.15) : 0), lz],
    });
  }
  // a low parapet/kerb along the open side of the steps
  // bollards on the quay, iron rings in the face, timber fenders
  for (let x = -L / 2 + 3; x < L / 2 - 2; x += 7.5) {
    if (Math.abs(x - stepsX - stepsLen / 2) < stepsLen / 2 + 1) continue;
    block(local.get('stonePale'), frame([x, H + 0.35, -0.9]), 0.55, 0.75, 0.55, { r: 0.18, rs: 2, seg: [0.1, 0.12, 0.1], seed: rnd(), noise: 0.005, nf: 5, chip: 0.01, warp: (lx, ly, lz) => { const k = 1 + 0.25 * Math.max(0, ly / 0.37); return [lx * k, ly, lz * k]; } });
  }
  for (let x = -L / 2 + 6; x < L / 2 - 3; x += 9) {
    const pts = [];
    for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; pts.push([x + Math.sin(a) * 0.13, H - 0.9 + Math.cos(a) * 0.13 - 0.13, 0.08]); }
    tube(local.get('iron'), pts, 0.018, { sides: 6 });
    tube(local.get('iron'), [[x, H - 0.77, 0.0], [x, H - 0.77, 0.1]], 0.03, { sides: 6, caps: true });
  }
  for (let x = -L / 2 + 2; x < L / 2 - 1; x += 4.2) {
    if (Math.abs(x - stepsX - stepsLen / 2) < stepsLen / 2 + 0.8) continue;
    member(local, frame([x, 0, 0.18], [0, 0, 1], [0, 1, 0], [-1, 0, 0]), [0, base + 0.5], [0, H - 0.1], 0.26, 0.24, rnd, { mat: 'oakDark' });
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
  }
  kit.merge(local, F);
  kit.merge(town, F);
  return { steps: { x: stepsX, w: stepsW, n: stepsN }, top: H };
}
void steps; void framedWall; void pentice; void keeperHouse;
